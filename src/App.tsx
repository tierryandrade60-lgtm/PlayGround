/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Settings as SettingsIcon,
  Sparkles,
  RotateCcw,
  Code2,
  Download,
  Loader2,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { GameScene } from './game/GameScene';
import { VirtualJoystick } from './components/VirtualJoystick';
import { CombatButtons } from './components/CombatButtons';
import { AimReticle } from './components/AimReticle';
import { SettingsModal } from './components/SettingsModal';
import { PowerSelectModal, PowerSetType } from './components/PowerSelectModal';
import { BeamClashBanner } from './components/BeamClashBanner';
import { OrientationGuard } from './components/OrientationGuard';
import { BuildModeContainer } from './components/BuildMode/BuildModeContainer';
import { settingsManager, GameSettings } from './game/SettingsManager';
import { audioSystem } from './game/AudioSystem';
import { BeamClashState } from './game/IronManAbilities';
import { scriptRuntimeEngine } from './game/ScriptRuntimeEngine';
import * as THREE from 'three';

export default function App() {
  const mountRef = useRef<HTMLDivElement>(null);
  const gameSceneRef = useRef<GameScene | null>(null);
  const [gameSceneState, setGameSceneState] = useState<GameScene | null>(null);

  const [settings, setSettings] = useState<GameSettings>(settingsManager.get());
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Script-Only Build Mode State
  const [isBuildMode, setIsBuildMode] = useState(false);
  const [inspectTarget, setInspectTarget] = useState<string | null>(null);

  // Full project ZIP export
  const [isExportingProject, setIsExportingProject] = useState(false);
  const exportingProjectRef = useRef(false);
  const [exportNotice, setExportNotice] = useState<{
    type: 'info' | 'success' | 'warn' | 'error';
    text: string;
  } | null>(null);

  const startPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const hasMovedRef = useRef<boolean>(false);
  const activePointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());

  // Reactive UI component override listener
  const [, setCompTick] = useState(0);
  useEffect(() => {
    const unsub = scriptRuntimeEngine.subscribeUiComponents(() => {
      setCompTick((t) => t + 1);
    });
    return unsub;
  }, []);

  // Power Selection Modal
  const [powerSet, setPowerSet] = useState<PowerSetType>('ironman');
  const [isPowerModalOpen, setIsPowerModalOpen] = useState(false);

  // Synchronize powerSet requested by script compiler / character edits
  useEffect(() => {
    scriptRuntimeEngine.onPowerSetRequested = (newSet: PowerSetType) => {
      setPowerSet(newSet);
      gameSceneRef.current?.setPowerSet(newSet);
    };
    return () => {
      scriptRuntimeEngine.onPowerSetRequested = undefined;
    };
  }, []);

  const handleToggleBuildMode = useCallback(() => {
    audioSystem.playUiClick();
    setIsBuildMode((prev) => {
      const next = !prev;
      gameSceneRef.current?.setBuildMode(next);
      return next;
    });
  }, []);

  const handleExportProject = useCallback(async () => {
    if (exportingProjectRef.current) return;
    exportingProjectRef.current = true;
    setIsExportingProject(true);
    setExportNotice({ type: 'info', text: 'Preparando MeuJogo-Source.zip…' });

    try {
      const { exportProjectZip } = await import('./game/ProjectExporter');
      const result = await exportProjectZip({
        buildModeSceneJson: gameSceneRef.current?.buildModeManager?.exportSceneJson() ?? null,
        onProgress: (progress) => {
          setExportNotice({ type: 'info', text: `${progress.stage}…` });
        },
      });

      const pendingCount = result.pendingScripts.length;
      const hasWarnings = pendingCount > 0 || result.divergences.length > 0 || result.warnings.length > 0;
      const details = [
        `${result.fileCount} arquivos · ${result.discoveredFileCount} do projeto`,
        pendingCount > 0
          ? `${pendingCount} rascunho(s) não aplicado(s) preservado(s) em build-script/pending`
          : null,
        result.divergences.length > 0 ? 'há diferenças entre o código exportado e o jogo em execução' : null,
        result.warnings.length > 0
          ? `${result.warnings.length} aviso(s) em build-script/export-manifest.json`
          : null,
      ]
        .filter(Boolean)
        .join(' · ');

      setExportNotice({
        type: hasWarnings ? 'warn' : 'success',
        text: `${result.filename} gerado (${details}).`,
      });

      if (result.pendingScripts.length || result.divergences.length || result.warnings.length) {
        console.warn('[ProjectExport]', {
          pendingScripts: result.pendingScripts,
          divergences: result.divergences,
          warnings: result.warnings,
          excluded: result.excluded,
        });
      }
    } catch (error) {
      setExportNotice({
        type: 'error',
        text: `Falha ao gerar o ZIP: ${(error as Error).message}`,
      });
    } finally {
      exportingProjectRef.current = false;
      setIsExportingProject(false);
    }
  }, []);

  useEffect(() => {
    if (!exportNotice) return;
    const timeout = window.setTimeout(() => setExportNotice(null), exportNotice.type === 'error' ? 12000 : 8000);
    return () => window.clearTimeout(timeout);
  }, [exportNotice]);

  const [isFlying, setIsFlying] = useState(false);

  const handleRespawn = useCallback(() => {
    audioSystem.playUiClick();
    setIsFlying(false);
    gameSceneRef.current?.respawnPlayer();
  }, []);

  // Beam Clash Real-time State
  const [clashState, setClashState] = useState<BeamClashState>({
    active: false,
    rival: null,
    progress: 0.5,
    clashPoint: new THREE.Vector3(),
    duration: 0,
    maxDuration: 6.0,
    lastTapTime: 0,
  });

  // Camera Drag Touch Tracking
  const cameraTouchIdRef = useRef<number | null>(null);
  const lastTouchPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  useEffect(() => {
    if (!mountRef.current) return;

    const game = new GameScene(mountRef.current);
    gameSceneRef.current = game;
    setGameSceneState(game);

    // Initial power set
    game.setPowerSet('ironman');

    const unsub = settingsManager.subscribe((newSettings) => {
      setSettings(newSettings);
    });

    return () => {
      unsub();
      game.dispose();
      gameSceneRef.current = null;
      setGameSceneState(null);
    };
  }, []);

  // Poll Beam Clash state for reactive UI updates
  useEffect(() => {
    let animId = 0;
    const checkClash = () => {
      if (gameSceneRef.current?.ironManAbilities) {
        const cs = gameSceneRef.current.ironManAbilities.clashState;
        if (cs.active !== clashState.active || Math.abs(cs.progress - clashState.progress) > 0.01) {
          setClashState({ ...cs });
        }
      }
      animId = requestAnimationFrame(checkClash);
    };
    animId = requestAnimationFrame(checkClash);
    return () => cancelAnimationFrame(animId);
  }, [clashState.active, clashState.progress]);

  const handleJoystickMove = useCallback((x: number, y: number, active: boolean) => {
    gameSceneRef.current?.setJoystickInput(x, y, active);
  }, []);

  const handleAttack = useCallback((): boolean => {
    return gameSceneRef.current?.triggerAttack() ?? false;
  }, []);

  const handleAbility = useCallback((id: number): boolean => {
    return gameSceneRef.current?.triggerAbility(id) ?? false;
  }, []);

  const handleDash = useCallback((): boolean => {
    return gameSceneRef.current?.triggerDash() ?? false;
  }, []);

  const handleToggleFlight = useCallback((): boolean => {
    const nextState = gameSceneRef.current?.toggleFlight() ?? false;
    setIsFlying(nextState);
    return nextState;
  }, []);

  const handleSelectPowerSet = useCallback((newSet: PowerSetType) => {
    setPowerSet(newSet);
    gameSceneRef.current?.setPowerSet(newSet);
  }, []);

  // Screen Touch / Pointer Dragging for Third-Person Camera Orbit & Preview Element Inspection
  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('[data-control="true"]')) {
      return;
    }

    activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (activePointersRef.current.size === 1) {
      cameraTouchIdRef.current = e.pointerId;
      lastTouchPosRef.current = { x: e.clientX, y: e.clientY };
      startPosRef.current = { x: e.clientX, y: e.clientY };
      hasMovedRef.current = false;
    }
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!activePointersRef.current.has(e.pointerId)) return;
    activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (cameraTouchIdRef.current === e.pointerId && gameSceneRef.current) {
      const dx = e.clientX - lastTouchPosRef.current.x;
      const dy = e.clientY - lastTouchPosRef.current.y;
      lastTouchPosRef.current = { x: e.clientX, y: e.clientY };

      const totalDist = Math.hypot(e.clientX - startPosRef.current.x, e.clientY - startPosRef.current.y);
      if (totalDist > 6) {
        hasMovedRef.current = true;
      }

      if (isBuildMode) {
        if (e.buttons === 2 || e.shiftKey) {
          gameSceneRef.current.addBuildCameraPan(dx, dy);
        } else {
          gameSceneRef.current.addBuildCameraOrbit(-dx, dy);
        }
      } else {
        gameSceneRef.current.addCameraDrag(-dx, dy);
      }
    }
  }, [isBuildMode]);

  const handlePointerEnd = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    activePointersRef.current.delete(e.pointerId);

    if (cameraTouchIdRef.current === e.pointerId) {
      // If user tapped without dragging in Build Mode, inspect tapped 3D element!
      if (isBuildMode && !hasMovedRef.current && gameSceneRef.current) {
        const hitKey = gameSceneRef.current.raycastInspectPreview(e.clientX, e.clientY);
        if (hitKey) {
          audioSystem.playUiClick();
          setInspectTarget(hitKey);
        }
      }
      cameraTouchIdRef.current = null;
    }
  }, [isBuildMode]);

  // Dynamically resolved components (supports hot-swapped compiled versions!)
  const ActiveCombatButtons =
    (scriptRuntimeEngine.getComponent('combat-buttons') as typeof CombatButtons) || CombatButtons;
  const ActiveAimReticle =
    (scriptRuntimeEngine.getComponent('aim-reticle') as typeof AimReticle) || AimReticle;
  const ActiveVirtualJoystick =
    (scriptRuntimeEngine.getComponent('virtual-joystick') as typeof VirtualJoystick) || VirtualJoystick;
  const ActiveBeamClashBanner =
    (scriptRuntimeEngine.getComponent('beam-clash-banner') as typeof BeamClashBanner) || BeamClashBanner;
  const ActivePowerSelectModal =
    (scriptRuntimeEngine.getComponent('power-select-modal') as typeof PowerSelectModal) || PowerSelectModal;
  const ActiveSettingsModal =
    (scriptRuntimeEngine.getComponent('settings-modal') as typeof SettingsModal) || SettingsModal;
  const ActiveOrientationGuard =
    (scriptRuntimeEngine.getComponent('orientation-guard') as typeof OrientationGuard) ||
    OrientationGuard;

  return (
    <div
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onWheel={(e) => {
        if (isBuildMode && gameSceneRef.current) {
          gameSceneRef.current.addBuildCameraZoom(e.deltaY * 0.015);
        }
      }}
      className="relative w-full h-full overflow-hidden select-none touch-none bg-[#a1c3e6]"
      style={{ touchAction: 'none' }}
    >
      {/* 3D WebGL Canvas Viewport */}
      <div ref={mountRef} className="absolute inset-0 w-full h-full" />

      {/* Script-Only Build Mode Interface Overlay */}
      {isBuildMode && gameSceneState && (
        <BuildModeContainer
          gameScene={gameSceneState}
          onExitBuildMode={handleToggleBuildMode}
          inspectTarget={inspectTarget}
          onSelectInspectTarget={setInspectTarget}
          currentPowerSet={powerSet}
          onSelectPowerSet={handleSelectPowerSet}
          onExportProject={handleExportProject}
          isExportingProject={isExportingProject}
        />
      )}

      {/* Standard Gameplay Controls & HUD (Active in Play Mode) */}
      {!isBuildMode && (
        <div style={{ opacity: settings.uiOpacity }}>
          {/* Aim Reticle & Aim Assist Corner Brackets */}
          <ActiveAimReticle
            gameScene={gameSceneState}
            reticleStyle={settings.reticleStyle}
            aimAssistEnabled={settings.aimAssist}
          />

          {/* Beam Clash Tug-of-War Interactive Banner */}
          <ActiveBeamClashBanner clashState={clashState} />

          {/* Mobile Virtual Joystick (Bottom-Left) */}
          <div data-control="true">
            <ActiveVirtualJoystick onMove={handleJoystickMove} />
          </div>

          {/* Combat Buttons (Bottom-Right: Attack + 4 Semicircle Abilities + Dash + Flight) */}
          <div data-control="true">
            <ActiveCombatButtons
              onAttack={handleAttack}
              onAbility={handleAbility}
              onDash={handleDash}
              onToggleFlight={handleToggleFlight}
              isFlying={isFlying}
              powerSet={powerSet}
              isClashActive={clashState.active}
            />
          </div>

          {/* Power Selection Button (Top-Center) */}
          <button
            onClick={() => {
              audioSystem.playUiClick();
              setIsPowerModalOpen(true);
            }}
            style={{
              position: 'fixed',
              top: 'max(16px, env(safe-area-inset-top, 16px))',
              left: '50%',
              transform: 'translateX(-50%)',
              height: '38px',
              padding: '0 16px',
              borderRadius: '20px',
              backgroundColor: 'rgba(25, 28, 35, 0.72)',
              border:
                powerSet === 'agatha'
                  ? '1.5px solid rgba(168, 85, 247, 0.85)'
                  : powerSet === 'ironman'
                  ? '1.5px solid rgba(245, 158, 11, 0.65)'
                  : '1.5px solid rgba(255, 255, 255, 0.22)',
              boxShadow:
                powerSet === 'agatha'
                  ? '0 4px 14px rgba(0, 0, 0, 0.35), 0 0 12px rgba(168, 85, 247, 0.35)'
                  : powerSet === 'ironman'
                  ? '0 4px 14px rgba(0, 0, 0, 0.35), 0 0 10px rgba(245, 158, 11, 0.2)'
                  : '0 4px 14px rgba(0, 0, 0, 0.35)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              color: '#e2e8f0',
              cursor: 'pointer',
              zIndex: 60,
              touchAction: 'none',
              transition: 'transform 0.15s ease, background-color 0.15s ease, border-color 0.15s ease',
            }}
            className="active:scale-95 hover:bg-slate-900/85"
            title="Select Character Power Set"
          >
            <Sparkles
              size={16}
              className={
                powerSet === 'agatha'
                  ? 'text-purple-400'
                  : powerSet === 'ironman'
                  ? 'text-amber-400'
                  : 'text-cyan-400'
              }
            />
            <span style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '0.06em' }}>
              {powerSet === 'agatha' ? 'AGATHA HARKNESS' : powerSet === 'ironman' ? 'HOMEM DE FERRO' : 'CLASSIC POWERS'}
            </span>
          </button>

          {/* Respawn / Reset Position Button (Top-Right) */}
          <button
            onClick={handleRespawn}
            style={{
              position: 'fixed',
              top: 'max(16px, env(safe-area-inset-top, 16px))',
              right: 'calc(max(16px, env(safe-area-inset-right, 16px)) + 52px)',
              width: '42px',
              height: '42px',
              borderRadius: '50%',
              backgroundColor: 'rgba(25, 28, 35, 0.65)',
              border: '1.5px solid rgba(255, 255, 255, 0.22)',
              boxShadow: '0 4px 14px rgba(0, 0, 0, 0.35)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#e2e8f0',
              cursor: 'pointer',
              zIndex: 60,
              touchAction: 'none',
              transition: 'transform 0.15s ease, background-color 0.15s ease',
            }}
            className="active:scale-90 hover:bg-slate-900/80"
            title="Respawn & Reset Position"
          >
            <RotateCcw size={18} className="text-amber-400" />
          </button>
        </div>
      )}

      {/* Script-Only Build Mode Toggle Button (Play Mode) */}
      {!isBuildMode && (
        <button
          onClick={handleToggleBuildMode}
          style={{
            position: 'fixed',
            top: 'max(16px, env(safe-area-inset-top, 16px))',
            right: 'calc(max(16px, env(safe-area-inset-right, 16px)) + 104px)',
            height: '42px',
            padding: '0 14px',
            borderRadius: '21px',
            backgroundColor: 'rgba(25, 28, 35, 0.72)',
            border: '1.5px solid rgba(0, 162, 255, 0.55)',
            boxShadow: '0 4px 14px rgba(0, 0, 0, 0.35)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            color: '#ffffff',
            cursor: 'pointer',
            zIndex: 85,
            touchAction: 'none',
            transition: 'transform 0.15s ease, background-color 0.15s ease',
          }}
          className="active:scale-95 hover:bg-slate-900/85"
          title="Open Script Build Mode (Source Code Editor)"
        >
          <Code2 size={16} className="text-cyan-400" />
          <span style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '0.04em' }}>
            SCRIPT BUILD
          </span>
        </button>
      )}

      {/* Full Project Export Button (immediately left of Build Script) */}
      {!isBuildMode && (
        <button
          onClick={() => void handleExportProject()}
          disabled={isExportingProject}
          aria-label="Baixar projeto completo em ZIP"
          style={{
            position: 'fixed',
            top: 'max(16px, env(safe-area-inset-top, 16px))',
            right: 'calc(max(16px, env(safe-area-inset-right, 16px)) + 252px)',
            width: '42px',
            height: '42px',
            borderRadius: '50%',
            backgroundColor: 'rgba(25, 28, 35, 0.72)',
            border: '1.5px solid rgba(56, 189, 248, 0.48)',
            boxShadow: '0 4px 14px rgba(0, 0, 0, 0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#e2e8f0',
            cursor: isExportingProject ? 'wait' : 'pointer',
            opacity: isExportingProject ? 0.78 : 1,
            zIndex: 85,
            touchAction: 'none',
            transition: 'transform 0.15s ease, background-color 0.15s ease, opacity 0.15s ease',
          }}
          className="active:scale-90 hover:bg-slate-900/85 disabled:cursor-wait"
          title="Baixar projeto completo (.zip) com o código atual e os scripts aplicados"
        >
          {isExportingProject ? (
            <Loader2 size={18} className="text-cyan-300 animate-spin" />
          ) : (
            <Download size={18} className="text-cyan-300" />
          )}
        </button>
      )}

      {/* Settings Button (Top-Right) */}
      {!isBuildMode && (
        <button
          onClick={() => {
            audioSystem.playUiClick();
            setIsSettingsOpen(true);
          }}
          style={{
            position: 'fixed',
            top: 'max(16px, env(safe-area-inset-top, 16px))',
            right: 'max(16px, env(safe-area-inset-right, 16px))',
            width: '42px',
            height: '42px',
            borderRadius: '50%',
            backgroundColor: 'rgba(25, 28, 35, 0.65)',
            border: '1.5px solid rgba(255, 255, 255, 0.22)',
            boxShadow: '0 4px 14px rgba(0, 0, 0, 0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#e2e8f0',
            cursor: 'pointer',
            zIndex: 60,
            touchAction: 'none',
            transition: 'transform 0.15s ease, background-color 0.15s ease',
          }}
          className="active:scale-90 hover:bg-slate-900/80"
          title="Settings"
        >
          <SettingsIcon size={20} className="text-slate-200" />
        </button>
      )}

      {/* Project Export Status */}
      {exportNotice && (
        <div
          role="status"
          style={{
            position: 'fixed',
            top: 'calc(max(16px, env(safe-area-inset-top, 16px)) + 52px)',
            left: '50%',
            transform: 'translateX(-50%)',
            maxWidth: 'min(92vw, 520px)',
            padding: '9px 14px',
            borderRadius: '10px',
            backgroundColor:
              exportNotice.type === 'error'
                ? 'rgba(127, 29, 29, 0.94)'
                : exportNotice.type === 'warn'
                  ? 'rgba(120, 53, 15, 0.94)'
                  : exportNotice.type === 'success'
                    ? 'rgba(6, 78, 59, 0.94)'
                    : 'rgba(15, 23, 42, 0.92)',
            border:
              exportNotice.type === 'error'
                ? '1px solid rgba(248, 113, 113, 0.65)'
                : exportNotice.type === 'warn'
                  ? '1px solid rgba(251, 191, 36, 0.6)'
                  : exportNotice.type === 'success'
                    ? '1px solid rgba(52, 211, 153, 0.55)'
                    : '1px solid rgba(148, 163, 184, 0.35)',
            color: '#f8fafc',
            fontSize: '11px',
            fontWeight: 600,
            lineHeight: 1.45,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            zIndex: 120,
            pointerEvents: 'none',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.35)',
          }}
        >
          {exportNotice.type === 'success' ? (
            <CheckCircle2 size={15} className="text-emerald-300 shrink-0" />
          ) : exportNotice.type === 'warn' || exportNotice.type === 'error' ? (
            <AlertTriangle size={15} className="text-amber-300 shrink-0" />
          ) : (
            <Loader2 size={15} className="text-cyan-300 animate-spin shrink-0" />
          )}
          <span>{exportNotice.text}</span>
        </div>
      )}

      {/* Power Selection Modal (hot-swappable) */}
      <ActivePowerSelectModal
        isOpen={isPowerModalOpen}
        activeSet={powerSet}
        onSelect={handleSelectPowerSet}
        onClose={() => setIsPowerModalOpen(false)}
      />

      {/* Settings Modal (hot-swappable) */}
      <ActiveSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />

      {/* Fullscreen Landscape Orientation Guard */}
      <ActiveOrientationGuard />
    </div>
  );
}
