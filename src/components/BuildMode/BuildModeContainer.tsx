/**
 * BuildModeContainer.tsx
 * Redesenhado: Interface profissional, minimalista e escura para o Modo Construção e Editor de Código.
 * Totalmente em Português do Brasil com arquitetura de 3 áreas (Navegação, Editor e Contexto),
 * suporte a Modo Foco, mobile-friendly e sincronização direta com o motor do jogo.
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  FolderCode,
  Play,
  RotateCcw,
  Undo2,
  Redo2,
  Copy,
  Check,
  Download,
  AlertCircle,
  CheckCircle2,
  Clock,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minimize2,
  Shield,
  Zap,
  Sliders,
  Terminal,
  Layers,
  History,
  X,
  RefreshCw,
  Flame,
  Info,
  Save,
  Upload,
  Settings2,
  TriangleAlert,
  Archive,
} from 'lucide-react';
import { GameScene } from '../../game/GameScene';
import {
  scriptRuntimeEngine,
  WorkingBackup,
} from '../../game/ScriptRuntimeEngine';
import {
  gameplayRestrictions,
  ActiveRestriction,
  RestrictionType,
} from '../../game/GameplayRestrictions';
import { audioSystem } from '../../game/AudioSystem';
import { highlightTypeScript } from '../../game/ScriptSearch';
import { ScriptExplorer } from './ScriptExplorer';
import { ConfigPanel } from './ConfigPanel';
import { BuildToast, ToastMessage } from './BuildToast';

interface BuildModeContainerProps {
  gameScene: GameScene;
  onExitBuildMode: () => void;
  inspectTarget?: string | null;
  onSelectInspectTarget?: (target: string | null) => void;
  currentPowerSet?: 'ironman' | 'agatha';
  onSelectPowerSet?: (set: 'ironman' | 'agatha') => void;
  onExportProject?: () => void | Promise<void>;
  isExportingProject?: boolean;
}

export const BuildModeContainer: React.FC<BuildModeContainerProps> = ({
  gameScene,
  onExitBuildMode,
  inspectTarget,
  onSelectInspectTarget,
  currentPowerSet = 'agatha',
  onSelectPowerSet,
  onExportProject,
  isExportingProject = false,
}) => {
  // Navigation & Scripts
  const [selectedScriptId, setSelectedScriptId] = useState<string>('agatha-arcane-blast');
  const [searchQuery, setSearchQuery] = useState('');

  // Editor Panels State (Collapsible)
  const [isLeftNavOpen, setIsLeftNavOpen] = useState(true);
  const [isRightContextOpen, setIsRightContextOpen] = useState(true);
  const [isFocusMode, setIsFocusMode] = useState(false);

  // Right Panel Tab: 'diagnostico' | 'restricoes' | 'historico' | 'info'
  const [contextTab, setContextTab] = useState<'diagnostico' | 'restricoes' | 'historico' | 'info'>(
    'diagnostico'
  );

  // Engine readiness gate (IndexedDB hydration can finish after first paint)
  const [engineReady, setEngineReady] = useState<boolean>(scriptRuntimeEngine.isEngineReady());

  // Active Script Code & History
  const [code, setCode] = useState<string>('');
  const [history, setHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState<number>(0);
  const [copied, setCopied] = useState<boolean>(false);
  const [isApplying, setIsApplying] = useState<boolean>(false);
  const [compileStatus, setCompileStatus] = useState<{
    success: boolean;
    message: string;
    timestamp?: string;
  } | null>(null);

  // Live Gameplay Restrictions State
  const [activeRestrictions, setActiveRestrictions] = useState<ActiveRestriction[]>([]);

  // Mobile Drawer State
  const [mobileDrawer, setMobileDrawer] = useState<'none' | 'left' | 'right'>('none');

  // Live configuration overlay & backup import
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // Toasts
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const lineGutterRef = useRef<HTMLDivElement>(null);
  const highlightRef = useRef<HTMLPreElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const showToast = (text: string, type: 'info' | 'success' | 'warn' = 'info') => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    setToasts((prev) => [...prev, { id, text, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3200);
  };

  // Subscribe to Restrictions
  useEffect(() => {
    const unsub = gameplayRestrictions.subscribe((restrictions) => {
      setActiveRestrictions([...restrictions]);
    });
    return unsub;
  }, []);

  // Wait for durable storage before loading source, otherwise the editor can
  // show the factory source and then silently replace the user's draft.
  useEffect(() => {
    let cancelled = false;
    void scriptRuntimeEngine.whenReady().then(() => {
      if (!cancelled) setEngineReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Subscribe to Script Engine Updates
  useEffect(() => {
    const unsub = scriptRuntimeEngine.subscribe(() => {
      // Re-render when engine status changes
    });
    return unsub;
  }, []);

  // Script catalog (recomputed on every engine notification for live updates)
  const allScripts = scriptRuntimeEngine.getScripts();
  const activeScript = useMemo(
    () => scriptRuntimeEngine.getScriptById(selectedScriptId) || allScripts[0],
    [selectedScriptId, allScripts]
  );

  // Load Script Content & Drafts
  useEffect(() => {
    if (activeScript && engineReady) {
      const draft = scriptRuntimeEngine.getDraft(activeScript.id);
      setCode(draft);
      setHistory([draft]);
      setHistoryIdx(0);
      setCompileStatus(null);
    }
  }, [activeScript?.id, engineReady]);

  // Synchronize Line Numbers Scrolling with Textarea
  const handleScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
    if (lineGutterRef.current) {
      lineGutterRef.current.scrollTop = e.currentTarget.scrollTop;
    }
    if (highlightRef.current) {
      highlightRef.current.scrollTop = e.currentTarget.scrollTop;
      highlightRef.current.scrollLeft = e.currentTarget.scrollLeft;
    }
  };

  const highlightedCode = useMemo(() => highlightTypeScript(code) + '\n', [code]);

  // Handle Code Change
  const handleCodeChange = (newCode: string) => {
    setCode(newCode);
    if (activeScript) {
      scriptRuntimeEngine.saveDraft(activeScript.id, newCode);
    }
    setHistory((prev) => [...prev.slice(0, historyIdx + 1), newCode]);
    setHistoryIdx((prev) => prev + 1);
  };

  // Undo / Redo
  const handleUndo = () => {
    if (historyIdx > 0) {
      audioSystem.playUiClick?.();
      const prevIdx = historyIdx - 1;
      setHistoryIdx(prevIdx);
      const prevCode = history[prevIdx];
      setCode(prevCode);
      if (activeScript) scriptRuntimeEngine.saveDraft(activeScript.id, prevCode);
    }
  };

  const handleRedo = () => {
    if (historyIdx < history.length - 1) {
      audioSystem.playUiClick?.();
      const nextIdx = historyIdx + 1;
      setHistoryIdx(nextIdx);
      const nextCode = history[nextIdx];
      setCode(nextCode);
      if (activeScript) scriptRuntimeEngine.saveDraft(activeScript.id, nextCode);
    }
  };

  // Copy Code
  const handleCopy = () => {
    audioSystem.playUiClick?.();
    navigator.clipboard
      .writeText(code)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        showToast('Código copiado para a área de transferência', 'success');
      })
      .catch(() => {
        showToast('Acesso à área de transferência negado', 'warn');
      });
  };

  // Validate only: never executes the module and never touches the running game.
  const handleValidateOnly = async () => {
    if (!activeScript) return;
    audioSystem.playUiClick?.();
    setIsApplying(true);
    const res = await scriptRuntimeEngine.validateScript(activeScript.id, code);
    setIsApplying(false);

    setCompileStatus({
      success: res.success,
      message: res.success ? 'Sintaxe, dependências e contrato validados.' : res.error || 'Erro de sintaxe',
      timestamp: new Date().toLocaleTimeString('pt-BR'),
    });

    if (res.success) {
      showToast('Validação concluída. Nada foi aplicado ao jogo.', 'success');
    } else {
      showToast(res.error || 'Falha na validação', 'warn');
      setContextTab('diagnostico');
      setIsRightContextOpen(true);
    }
  };

  // Explicit save (persists the draft without running it)
  const handleSaveDraft = async () => {
    if (!activeScript) return;
    audioSystem.playUiClick?.();
    const res = scriptRuntimeEngine.saveScriptDraft(activeScript.id, code);
    if (res.success) {
      setSavedAt(Date.now());
      showToast('Rascunho salvo no armazenamento persistente.', 'success');
    } else {
      showToast(res.message, 'warn');
    }
  };

  // Backup bundle export
  const handleExportBackup = () => {
    audioSystem.playUiClick?.();
    try {
      const json = scriptRuntimeEngine.exportBackupBundle();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `stickman-scripts-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      showToast('Backup exportado com sucesso.', 'success');
    } catch (err) {
      showToast(`Falha ao exportar: ${(err as Error).message}`, 'warn');
    }
  };

  const handleImportFile = async (file: File) => {
    setIsImporting(true);
    try {
      const text = await file.text();
      const res = await scriptRuntimeEngine.importBackupBundle(text);
      if (res.success) {
        showToast(res.message, 'success');
        const fresh = scriptRuntimeEngine.getDraft(selectedScriptId);
        setCode(fresh);
        setHistory([fresh]);
        setHistoryIdx(0);
      } else {
        showToast(res.message, 'warn');
      }
    } catch (err) {
      showToast(`Falha ao importar: ${(err as Error).message}`, 'warn');
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Compile and Apply Live to Running Game
  const handleApplyChanges = async () => {
    if (!activeScript) return;
    audioSystem.playUiClick?.();
    setIsApplying(true);

    try {
      const restartRequired =
        scriptRuntimeEngine.getScriptState(activeScript.id).capability === 'restart-required';
      const res = restartRequired
        ? await scriptRuntimeEngine.applyForRestart(activeScript.id, code)
        : await scriptRuntimeEngine.compileAndApply(activeScript.id, code, gameScene, false);
      setIsApplying(false);

      setCompileStatus({
        success: res.success,
        message: res.message,
        timestamp: new Date().toLocaleTimeString('pt-BR'),
      });

      if (res.success && restartRequired) {
        showToast(
          'Versão aplicada para o próximo build. Baixe o projeto para gerar o novo executável.',
          'success'
        );
        setContextTab('diagnostico');
        setIsRightContextOpen(true);
      } else if (res.success) {
        // Automatic Character Switch only for scripts that actually own a hero.
        if (activeScript.character === 'agatha' || activeScript.id.startsWith('agatha-')) {
          onSelectPowerSet?.('agatha');
          gameScene.setPowerSet('agatha');
          showToast('Agatha Harkness ATIVADA no jogo com suas alterações!', 'success');
        } else if (activeScript.character === 'ironman' || activeScript.id.startsWith('ironman-')) {
          onSelectPowerSet?.('ironman');
          gameScene.setPowerSet('ironman');
          showToast('Homem de Ferro ATIVADO no jogo com suas alterações!', 'success');
        } else {
          showToast(`Alterações aplicadas: ${activeScript.name}`, 'success');
        }
      } else {
        showToast(res.error || 'Erro na compilação', 'warn');
        setContextTab('diagnostico');
        setIsRightContextOpen(true);
      }
    } catch (err: unknown) {
      setIsApplying(false);
      showToast(`Erro inesperado: ${(err as Error).message}`, 'warn');
    }
  };

  // Revert / Rollback to previous working version
  const handleRollback = async () => {
    if (!activeScript) return;
    audioSystem.playUiClick?.();
    setIsApplying(true);
    const res = await scriptRuntimeEngine.rollback(activeScript.id, gameScene);
    setIsApplying(false);

    if (res.success && res.restoredCode !== undefined) {
      setCode(res.restoredCode);
      showToast(res.message, 'success');
    } else {
      showToast(res.message, 'warn');
    }
  };

  // Restore Original Factory Source
  const handleRestoreOriginal = async () => {
    if (!activeScript) return;
    audioSystem.playUiClick?.();
    setIsApplying(true);
    const res = await scriptRuntimeEngine.restoreOriginalScript(activeScript.id, gameScene);
    setIsApplying(false);

    if (res.success) {
      setCode(res.restoredCode || activeScript.originalSource);
      showToast(res.message, 'info');
    } else {
      showToast(res.message, 'warn');
    }
  };

  // Restore All Factory Sources
  const handleRestoreAll = async () => {
    audioSystem.playUiClick?.();
    setIsApplying(true);
    const res = await scriptRuntimeEngine.restoreAllOriginalScripts(gameScene);
    setIsApplying(false);
    if (activeScript) {
      setCode(activeScript.originalSource);
    }
    showToast(res.message, 'info');
  };

  // Line numbers calculation
  const linesCount = useMemo(() => code.split('\n').length, [code]);
  const scriptStatus = activeScript ? scriptRuntimeEngine.getScriptStatus(activeScript.id) : null;
  const scriptState = activeScript ? scriptRuntimeEngine.getScriptState(activeScript.id) : null;
  const backups = activeScript ? scriptRuntimeEngine.getBackups(activeScript.id) : [];

  const isScriptModified = useMemo(() => {
    if (!activeScript) return false;
    return code !== activeScript.originalSource;
  }, [code, activeScript]);

  return (
    <div className="fixed inset-0 z-50 flex bg-[#09090b] text-[#f4f4f5] font-sans select-none overflow-hidden antialiased">
      <ScriptExplorer
        scripts={allScripts}
        selectedScriptId={selectedScriptId}
        onSelect={(id) => {
          setSelectedScriptId(id);
          setMobileDrawer('none');
        }}
        isOpen={isLeftNavOpen}
        mobileOpen={mobileDrawer === 'left'}
        onCloseMobile={() => setMobileDrawer('none')}
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
        onRestoreAll={handleRestoreAll}
      />

      {/* ============================================================== */}
      {/* HEADER + WORKSPACE COLUMN */}
      {/* ============================================================== */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
      {/* ============================================================== */}
      {/* 1. TOP HEADER / TOOLBAR */}
      {/* ============================================================== */}
      <header className="h-12 border-b border-[#27272a] bg-[#121215] flex items-center justify-between px-3 md:px-4 shrink-0 z-20">
        {/* Left branding & script drawer toggle */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              audioSystem.playUiClick?.();
              setIsLeftNavOpen((prev) => !prev);
            }}
            className="hidden md:flex items-center justify-center w-8 h-8 rounded border border-[#27272a] hover:bg-[#1f1f23] text-[#a1a1aa] hover:text-white transition-colors"
            title={isLeftNavOpen ? 'Ocultar barra de scripts' : 'Exibir barra de scripts'}
          >
            {isLeftNavOpen ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
          </button>

          {/* Mobile navigation toggle */}
          <button
            onClick={() => setMobileDrawer((m) => (m === 'left' ? 'none' : 'left'))}
            className="md:hidden flex items-center justify-center w-8 h-8 rounded border border-[#27272a] bg-[#18181b] text-[#a1a1aa]"
            title="Abrir explorador de scripts"
            aria-label="Abrir explorador de scripts"
          >
            <FolderCode size={16} />
          </button>

          <div className="hidden sm:flex items-center gap-2">
            <span className="font-semibold text-xs tracking-wider text-white uppercase flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Editor de Scripts
            </span>
            <span className="text-[#52525b] text-xs hidden sm:inline">•</span>
            <span className="text-[#a1a1aa] text-xs font-mono hidden sm:inline truncate max-w-[200px]">
              {activeScript?.name}
            </span>
          </div>
        </div>

        {/* Center Character Switcher & Indicator */}
        <div className="hidden md:flex items-center gap-1.5 bg-[#18181b] border border-[#27272a] rounded p-0.5">
          <button
            onClick={() => {
              audioSystem.playUiClick?.();
              onSelectPowerSet?.('agatha');
              gameScene.setPowerSet('agatha');
              showToast('Personagem ativo no Play Test: Agatha Harkness', 'info');
            }}
            className={`px-2.5 py-1 text-xs rounded font-medium flex items-center gap-1.5 transition-colors ${
              currentPowerSet === 'agatha'
                ? 'bg-[#7e22ce] text-white shadow-sm'
                : 'text-[#a1a1aa] hover:text-white'
            }`}
          >
            <Zap size={13} />
            <span className="hidden sm:inline">Agatha Harkness</span>
            <span className="sm:hidden">Agatha</span>
          </button>
          <button
            onClick={() => {
              audioSystem.playUiClick?.();
              onSelectPowerSet?.('ironman');
              gameScene.setPowerSet('ironman');
              showToast('Personagem ativo no Play Test: Homem de Ferro', 'info');
            }}
            className={`px-2.5 py-1 text-xs rounded font-medium flex items-center gap-1.5 transition-colors ${
              currentPowerSet === 'ironman'
                ? 'bg-[#0284c7] text-white shadow-sm'
                : 'text-[#a1a1aa] hover:text-white'
            }`}
          >
            <Shield size={13} />
            <span className="hidden sm:inline">Homem de Ferro</span>
            <span className="sm:hidden">Iron Man</span>
          </button>
        </div>

        {/* Right Toolbar Actions */}
        <div className="flex items-center gap-1 lg:gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleImportFile(file);
            }}
          />

          {/* Save / persistence */}
          <button
            onClick={handleSaveDraft}
            className="flex items-center gap-1 px-2 py-1.5 text-xs rounded border border-[#27272a] hover:bg-[#1f1f23] text-[#a1a1aa] hover:text-white transition-colors"
            title="Salvar rascunho no armazenamento persistente (não executa)"
          >
            <Save size={13} />
            <span className="hidden xl:inline">Salvar</span>
          </button>

          {/* Backup export / import */}
          <button
            onClick={handleExportBackup}
            className="hidden xl:flex items-center gap-1 px-2 py-1.5 text-xs rounded border border-[#27272a] hover:bg-[#1f1f23] text-[#a1a1aa] hover:text-white transition-colors"
            title="Exportar backup de scripts e versões"
          >
            <Download size={13} />
            <span className="hidden xl:inline">Exportar</span>
          </button>
          {onExportProject && (
            <button
              onClick={() => {
                audioSystem.playUiClick?.();
                handleSaveDraft();
                void onExportProject();
              }}
              disabled={isExportingProject}
              className="flex items-center gap-1 px-2 py-1.5 text-xs rounded border border-cyan-500/40 hover:bg-cyan-500/10 text-cyan-300 disabled:opacity-50 transition-colors"
              title="Baixar projeto completo (.zip) com o código atual e os scripts aplicados"
              aria-label="Baixar projeto completo em ZIP"
            >
              {isExportingProject ? (
                <RefreshCw size={13} className="animate-spin" />
              ) : (
                <Archive size={13} />
              )}
              <span className="hidden xl:inline">Projeto</span>
            </button>
          )}
          <button
            onClick={() => {
              audioSystem.playUiClick?.();
              fileInputRef.current?.click();
            }}
            disabled={isImporting}
            className="hidden xl:flex items-center gap-1 px-2 py-1.5 text-xs rounded border border-[#27272a] hover:bg-[#1f1f23] text-[#a1a1aa] hover:text-white disabled:opacity-50 transition-colors"
            title="Importar backup de scripts"
          >
            {isImporting ? <RefreshCw size={13} className="animate-spin" /> : <Upload size={13} />}
            <span className="hidden xl:inline">Importar</span>
          </button>

          {/* Live configuration */}
          <button
            onClick={() => {
              audioSystem.playUiClick?.();
              setIsConfigOpen(true);
            }}
            className="flex items-center gap-1 px-2 py-1.5 text-xs rounded border border-cyan-500/30 hover:bg-cyan-500/10 text-cyan-300 transition-colors"
            title="Ajustes de câmera, combate, personagens e sistema em tempo real"
          >
            <Settings2 size={13} />
            <span className="hidden xl:inline">Ajustes</span>
          </button>

          {/* Focus Mode Toggle */}
          <button
            onClick={() => {
              audioSystem.playUiClick?.();
              setIsFocusMode((f) => {
                const next = !f;
                if (next) {
                  setIsLeftNavOpen(false);
                  setIsRightContextOpen(false);
                } else {
                  setIsLeftNavOpen(true);
                  setIsRightContextOpen(true);
                }
                return next;
              });
            }}
            className={`hidden lg:flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded border border-[#27272a] hover:bg-[#1f1f23] text-[#a1a1aa] hover:text-white transition-colors ${
              isFocusMode ? 'bg-[#27272a] text-white' : ''
            }`}
            title="Alternar Modo Foco (Tela Cheia)"
          >
            {isFocusMode ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
            <span>Foco</span>
          </button>

          {/* Context Panel Toggle */}
          <button
            onClick={() => {
              audioSystem.playUiClick?.();
              setIsRightContextOpen((prev) => !prev);
            }}
            className="hidden md:flex items-center justify-center w-8 h-8 rounded border border-[#27272a] hover:bg-[#1f1f23] text-[#a1a1aa] hover:text-white transition-colors"
            title="Painel de Diagnóstico e Restrições"
          >
            <Layers size={16} />
          </button>

          {/* Mobile Context Drawer Toggle */}
          <button
            onClick={() => setMobileDrawer((m) => (m === 'right' ? 'none' : 'right'))}
            className="md:hidden flex items-center justify-center w-8 h-8 rounded border border-[#27272a] bg-[#18181b] text-[#a1a1aa]"
          >
            <Terminal size={16} />
          </button>

          {/* Primary Action: Aplicar no Jogo / preparar próximo reinício */}
          <button
            onClick={handleApplyChanges}
            disabled={isApplying || scriptState?.capability === 'read-only'}
            className={`px-3 py-1.5 disabled:opacity-60 text-white rounded text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-colors ${
              scriptState?.capability === 'restart-required'
                ? 'bg-amber-600 hover:bg-amber-500'
                : 'bg-emerald-600 hover:bg-emerald-500'
            }`}
            title={
              scriptState?.capability === 'restart-required'
                ? 'Validar e aplicar para o próximo build/reinício; não altera a execução atual'
                : 'Compilar e aplicar em tempo real no jogo'
            }
          >
            {isApplying ? (
              <RefreshCw size={13} className="animate-spin" />
            ) : (
              <CheckCircle2 size={13} />
            )}
            <span className="hidden sm:inline">
              {scriptState?.capability === 'restart-required'
                ? 'Aplicar p/ Reinício'
                : 'Aplicar no Jogo'}
            </span>
          </button>

          {/* PLAY TEST: Exit Build Mode and run the game directly */}
          <button
            onClick={() => {
              audioSystem.playUiClick?.();
              // Make sure current power set matches active script if relevant
              if (activeScript?.character === 'agatha' || activeScript?.id.startsWith('agatha-')) {
                onSelectPowerSet?.('agatha');
                gameScene.setPowerSet('agatha');
              } else if (activeScript?.character === 'ironman' || activeScript?.id.startsWith('ironman-')) {
                onSelectPowerSet?.('ironman');
                gameScene.setPowerSet('ironman');
              }
              onExitBuildMode();
            }}
            className="px-3.5 py-1.5 bg-[#f4f4f5] hover:bg-white text-black rounded text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all hover:scale-[1.02]"
            title="Voltar ao jogo e testar as habilidades em tempo real"
          >
            <Play size={13} className="fill-black" />
            <span className="hidden sm:inline">PLAY TEST</span>
          </button>
        </div>
      </header>

      {/* ============================================================== */}
      {/* 2. MAIN THREE-PANEL WORKSPACE */}
      {/* ============================================================== */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Mobile backdrop for left drawer */}
        {mobileDrawer === 'left' && (
          <div
            onClick={() => setMobileDrawer('none')}
            className="md:hidden fixed inset-0 bg-black/60 z-30"
          />
        )}

        {/* ============================================================== */}
        {/* CENTER PANEL: Code Editor Area */}
        {/* ============================================================== */}
        <main className="flex-1 flex flex-col bg-[#09090b] min-w-0 overflow-hidden relative">
          {/* File Header & Sub-toolbar */}
          <div className="h-10 border-b border-[#27272a] bg-[#121215] flex items-center justify-between px-3 md:px-4 shrink-0 text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-mono text-white font-medium truncate">
                {activeScript?.filePath}
              </span>
              <span className="px-1.5 py-0.5 bg-[#27272a] text-[10px] rounded text-[#a1a1aa] font-mono uppercase shrink-0">
                {activeScript?.fileExtension}
              </span>

              {isScriptModified && (
                <span className="px-1.5 py-0.5 bg-amber-500/10 border border-amber-500/30 text-amber-400 text-[10px] rounded font-medium shrink-0">
                  • Modificado
                </span>
              )}
            </div>

            {/* Quick Editor Actions */}
            <div className="flex items-center gap-1.5">
              <button
                onClick={handleUndo}
                disabled={historyIdx <= 0}
                className="p-1 rounded text-[#a1a1aa] hover:text-white disabled:opacity-30 hover:bg-[#1f1f23]"
                title="Desfazer (Ctrl+Z)"
              >
                <Undo2 size={14} />
              </button>
              <button
                onClick={handleRedo}
                disabled={historyIdx >= history.length - 1}
                className="p-1 rounded text-[#a1a1aa] hover:text-white disabled:opacity-30 hover:bg-[#1f1f23]"
                title="Refazer (Ctrl+Y)"
              >
                <Redo2 size={14} />
              </button>
              <div className="w-px h-3.5 bg-[#27272a] mx-0.5" />
              <button
                onClick={handleCopy}
                className="p-1 rounded text-[#a1a1aa] hover:text-white hover:bg-[#1f1f23]"
                title="Copiar código"
              >
                {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
              </button>
              <button
                onClick={handleValidateOnly}
                className="px-2 py-0.5 rounded border border-[#27272a] text-[#a1a1aa] hover:text-white text-[11px] hover:bg-[#1f1f23]"
                title="Apenas verificar sintaxe sem aplicar no jogo"
              >
                Validar
              </button>
              <button
                onClick={handleRestoreOriginal}
                className="px-2 py-0.5 rounded border border-[#27272a] text-[#a1a1aa] hover:text-rose-400 text-[11px] hover:bg-[#1f1f23]"
                title="Restaurar código original deste arquivo"
              >
                Restaurar
              </button>
            </div>
          </div>

          {/* Editor Workspace: Line Numbers + Textarea */}
          <div className="flex-1 flex overflow-hidden relative font-mono text-[13px] leading-relaxed">
            {/* Synchronized Line Numbers Gutter */}
            <div
              ref={lineGutterRef}
              className="w-12 bg-[#0c0c0e] border-r border-[#27272a] text-[#52525b] text-right pr-3 select-none overflow-hidden shrink-0 pt-3"
              style={{ lineHeight: '1.6' }}
            >
              {Array.from({ length: linesCount }, (_, i) => (
                <div key={i + 1} className="h-[20.8px]">
                  {i + 1}
                </div>
              ))}
            </div>

            {/* Code Input Area: highlighted layer + transparent textarea */}
            <div className="flex-1 h-full relative overflow-hidden bg-[#09090b]">
              <pre
                ref={highlightRef}
                aria-hidden="true"
                className="absolute inset-0 m-0 p-3 font-mono text-[13px] leading-relaxed whitespace-pre overflow-hidden pointer-events-none text-[#e4e4e7]"
                style={{
                  lineHeight: '1.6',
                  tabSize: 2,
                  fontFamily: 'Consolas, Menlo, Monaco, "Courier New", monospace',
                }}
                dangerouslySetInnerHTML={{ __html: highlightedCode }}
              />
              <textarea
                ref={textareaRef}
                value={code}
                onChange={(e) => handleCodeChange(e.target.value)}
                onScroll={handleScroll}
                spellCheck={false}
                autoCapitalize="off"
                autoComplete="off"
                autoCorrect="off"
                className="absolute inset-0 w-full h-full p-3 bg-transparent text-transparent caret-[#f4f4f5] font-mono text-[13px] resize-none focus:outline-none overflow-auto whitespace-pre selection:bg-cyan-500/30"
                style={{
                  lineHeight: '1.6',
                  tabSize: 2,
                  fontFamily: 'Consolas, Menlo, Monaco, "Courier New", monospace',
                  WebkitTextFillColor: 'transparent',
                }}
              />
            </div>
          </div>

          {/* Bottom Editor Status Bar */}
          <div className="h-7 border-t border-[#27272a] bg-[#101013] px-3 flex items-center justify-between text-[11px] text-[#71717a] shrink-0 font-mono">
            <div className="flex items-center gap-3">
              <span>{linesCount} linhas</span>
              <span>{code.length} caracteres</span>
              {compileStatus && (
                <span
                  className={
                    compileStatus.success
                      ? 'text-emerald-400 flex items-center gap-1'
                      : 'text-rose-400 flex items-center gap-1'
                  }
                >
                  {compileStatus.success ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}
                  {compileStatus.message}
                </span>
              )}
            </div>

            <div className="flex items-center gap-3">
              <span>UTF-8</span>
              <span>TypeScript (Sucrase Runtime)</span>
            </div>
          </div>
        </main>

        {/* ============================================================== */}
        {/* RIGHT PANEL: Context & Inspection Panel */}
        {/* ============================================================== */}
        <aside
          className={`
            border-l border-[#27272a] bg-[#101013] flex flex-col shrink-0 z-30 transition-all duration-200
            ${isRightContextOpen ? 'w-72 md:w-80' : 'w-0 hidden md:flex md:w-0 md:border-l-0 overflow-hidden'}
            ${mobileDrawer === 'right' ? 'fixed inset-y-12 right-0 w-80 flex shadow-2xl z-40' : 'hidden md:flex'}
          `}
        >
          {/* Context Panel Header & Tabs */}
          <div className="p-2 border-b border-[#27272a] flex items-center justify-between">
            <span className="text-xs font-semibold text-white uppercase tracking-wider flex items-center gap-1.5">
              <Layers size={14} className="text-[#a1a1aa]" />
              Painel de Contexto
            </span>
            <button
              onClick={() => {
                setIsRightContextOpen(false);
                setMobileDrawer('none');
              }}
              className="text-[#71717a] hover:text-white p-1"
            >
              <X size={14} />
            </button>
          </div>

          <div className="grid grid-cols-4 border-b border-[#27272a] text-[11px] text-center font-medium">
            <button
              onClick={() => setContextTab('diagnostico')}
              className={`py-2 border-b-2 transition-colors ${
                contextTab === 'diagnostico'
                  ? 'border-emerald-500 text-white bg-[#18181b]'
                  : 'border-transparent text-[#a1a1aa] hover:text-white'
              }`}
            >
              Diagnóstico
            </button>
            <button
              onClick={() => setContextTab('restricoes')}
              className={`py-2 border-b-2 transition-colors ${
                contextTab === 'restricoes'
                  ? 'border-purple-500 text-white bg-[#18181b]'
                  : 'border-transparent text-[#a1a1aa] hover:text-white'
              }`}
            >
              Restrições
            </button>
            <button
              onClick={() => setContextTab('historico')}
              className={`py-2 border-b-2 transition-colors ${
                contextTab === 'historico'
                  ? 'border-cyan-500 text-white bg-[#18181b]'
                  : 'border-transparent text-[#a1a1aa] hover:text-white'
              }`}
            >
              Histórico
            </button>
            <button
              onClick={() => setContextTab('info')}
              className={`py-2 border-b-2 transition-colors ${
                contextTab === 'info'
                  ? 'border-amber-500 text-white bg-[#18181b]'
                  : 'border-transparent text-[#a1a1aa] hover:text-white'
              }`}
            >
              Módulo
            </button>
          </div>

          {/* Context Tab Contents */}
          <div className="flex-1 overflow-y-auto p-3 text-xs space-y-3 font-sans">
            {/* 1. Diagnóstico */}
            {contextTab === 'diagnostico' && (
              <div className="space-y-3">
                <div className="p-3 bg-[#18181b] border border-[#27272a] rounded space-y-2">
                  <div className="font-semibold text-white flex items-center justify-between">
                    <span>Estado da Compilação</span>
                    {scriptStatus?.status === 'error' ? (
                      <span className="px-2 py-0.5 bg-rose-500/10 border border-rose-500/30 text-rose-400 text-[10px] rounded font-mono">
                        Erro
                      </span>
                    ) : scriptStatus?.status === 'applied' ? (
                      <span className="px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] rounded font-mono">
                        Aplicado & Ativo
                      </span>
                    ) : scriptState?.capability === 'restart-required' &&
                      scriptState.appliedSource !== null ? (
                      <span className="px-2 py-0.5 bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-[10px] rounded font-mono">
                        Pronto p/ Reinício
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 bg-zinc-800 text-zinc-400 text-[10px] rounded font-mono">
                        {scriptState?.hasUnappliedChanges ? 'Alterações não aplicadas' : 'Pendente'}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 text-[10px]">
                    <span className="text-[#71717a]">Integração:</span>
                    {scriptState?.capability === 'restart-required' ? (
                      <span className="px-1.5 py-0.5 bg-amber-500/10 border border-amber-500/30 text-amber-300 rounded font-mono flex items-center gap-1">
                        <TriangleAlert size={10} /> Reinicialização necessária
                      </span>
                    ) : scriptState?.capability === 'read-only' ? (
                      <span className="px-1.5 py-0.5 bg-zinc-800 text-zinc-400 rounded font-mono">
                        Somente leitura
                      </span>
                    ) : (
                      <span className="px-1.5 py-0.5 bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 rounded font-mono">
                        Hot-swap em tempo real
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between text-[10px] text-[#71717a]">
                    <span>Rascunho {scriptState?.hasDraftChanges ? 'alterado' : 'igual ao original'}</span>
                    <span>rev. {scriptState?.revision ?? 0}</span>
                  </div>

                  <div className="grid grid-cols-2 gap-1 text-[10px] text-[#a1a1aa] font-mono">
                    <span>
                      Aplicado:{' '}
                      <b className={scriptState?.appliedSource ? 'text-emerald-400' : 'text-zinc-500'}>
                        {scriptState?.appliedSource ? 'sim' : 'não'}
                      </b>
                    </span>
                    <span>
                      Em execução:{' '}
                      <b className={scriptState?.runningSource ? 'text-emerald-400' : 'text-zinc-500'}>
                        {scriptState?.runningSource ? 'sim' : 'não'}
                      </b>
                    </span>
                    <span className="col-span-2">
                      Exportado:{' '}
                      <b className={scriptState?.exportedSource ? 'text-cyan-300' : 'text-zinc-500'}>
                        {scriptState?.exportedAt
                          ? new Date(scriptState.exportedAt).toLocaleString('pt-BR')
                          : 'não'}
                      </b>
                    </span>
                    {scriptState?.hasUnappliedChanges && (
                      <span className="col-span-2 text-amber-300">
                        O editor difere da versão aplicada.
                      </span>
                    )}
                  </div>

                  {savedAt && (
                    <div className="text-[10px] text-emerald-400/80">
                      Rascunho salvo às {new Date(savedAt).toLocaleTimeString('pt-BR')}
                    </div>
                  )}

                  <p className="text-[#a1a1aa] text-[11px] leading-relaxed">
                    {scriptState?.capability === 'restart-required'
                      ? 'Este módulo é validado e registrado para o próximo build; a execução atual permanece intacta.'
                      : 'O código é compilado com transformações TypeScript e executado em tempo real no Three.js/React.'}
                  </p>

                  {scriptState?.capability === 'restart-required' && (
                    <div className="mt-2 p-2.5 bg-amber-950/30 border border-amber-700/50 rounded text-[11px] leading-relaxed text-amber-100/90 space-y-2">
                      <div>
                        Este módulo estrutural não pode ser trocado a quente. Use{' '}
                        <b>Aplicar p/ Reinício</b> para validar e registrar a versão como principal;
                        ela só executa após baixar o projeto e gerar um novo build.
                      </div>
                      {scriptState.hasUnappliedChanges && (
                        <div className="text-amber-300 font-semibold">
                          O editor tem alterações que ainda não foram aplicadas ao próximo build.
                        </div>
                      )}
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          onClick={handleApplyChanges}
                          disabled={isApplying || !scriptState.hasUnappliedChanges}
                          className="px-2.5 py-1.5 rounded border border-amber-500/50 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20 disabled:opacity-40 text-[11px] font-semibold flex items-center gap-1.5"
                          title="Validar e aplicar a versão do editor para o próximo build/reinício"
                        >
                          {isApplying ? (
                            <RefreshCw size={12} className="animate-spin" />
                          ) : (
                            <CheckCircle2 size={12} />
                          )}
                          Aplicar p/ Reinício
                        </button>
                        {onExportProject && (
                          <button
                            onClick={() => {
                              audioSystem.playUiClick?.();
                              void onExportProject();
                            }}
                            disabled={isExportingProject || scriptState.hasUnappliedChanges}
                            className="px-2.5 py-1.5 rounded border border-cyan-500/50 bg-cyan-500/10 text-cyan-200 hover:bg-cyan-500/20 disabled:opacity-40 text-[11px] font-semibold flex items-center gap-1.5"
                            title="Baixar o projeto com a versão já aplicada para o próximo build"
                          >
                            {isExportingProject ? (
                              <RefreshCw size={12} className="animate-spin" />
                            ) : (
                              <Archive size={12} />
                            )}
                            Baixar projeto para rebuild
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {scriptStatus?.error && (
                    <div className="mt-2 p-2.5 bg-rose-950/40 border border-rose-800/60 rounded text-rose-300 font-mono text-[11px] leading-relaxed space-y-1">
                      <div>{scriptStatus.error}</div>
                      {scriptStatus.line != null && (
                        <div className="text-[10px] text-rose-400/80">
                          Linha {scriptStatus.line}
                          {scriptStatus.column != null ? `, coluna ${scriptStatus.column}` : ''}
                        </div>
                      )}
                      {scriptState?.error?.hint && (
                        <div className="text-[10px] text-amber-300/90">{scriptState.error.hint}</div>
                      )}
                    </div>
                  )}

                  {compileStatus?.timestamp && (
                    <div className="text-[10px] text-[#71717a] pt-1">
                      Última execução: {compileStatus.timestamp}
                    </div>
                  )}
                </div>

                <div className="p-3 bg-[#18181b] border border-[#27272a] rounded space-y-2">
                  <div className="font-semibold text-white">Fluxo de Aplicação Confiável</div>
                  {scriptState?.capability === 'restart-required' ? (
                    <ol className="text-[#a1a1aa] text-[11px] space-y-1.5 list-decimal pl-4">
                      <li>Edite o módulo estrutural.</li>
                      <li>Clique em <b>Aplicar p/ Reinício</b>; a versão é validada e registrada.</li>
                      <li>Use <b>Baixar projeto para rebuild</b> para exportar o ZIP.</li>
                      <li>Extraia o ZIP, rode <b>npm install</b> e <b>npm run build/dev</b>.</li>
                      <li>Abra o novo build; o módulo passa a ser o código em execução.</li>
                    </ol>
                  ) : (
                    <ol className="text-[#a1a1aa] text-[11px] space-y-1.5 list-decimal pl-4">
                      <li>Edite o código fonte modular do poder.</li>
                      <li>Clique em <b>Aplicar no Jogo</b>.</li>
                      <li>O personagem correspondente é ativado automaticamente.</li>
                      <li>Clique em <b>PLAY TEST</b> para testar imediatamente.</li>
                    </ol>
                  )}
                </div>
              </div>
            )}

            {/* 2. Restrições de Gameplay em Tempo Real */}
            {contextTab === 'restricoes' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-white">Status Ativos no Jogo</span>
                  <button
                    onClick={() => {
                      gameplayRestrictions.clearAll();
                      showToast('Todas as restrições foram limpas', 'info');
                    }}
                    className="text-[10px] text-[#a1a1aa] hover:text-white underline"
                  >
                    Limpar Todas
                  </button>
                </div>

                {activeRestrictions.length === 0 ? (
                  <div className="p-4 bg-[#18181b] border border-[#27272a] rounded text-center text-[#71717a] text-[11px]">
                    Nenhuma restrição ativa no momento. Todas as ações do personagem estão livres.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {activeRestrictions.map((r, idx) => (
                      <div
                        key={`${r.type}-${r.source}-${idx}`}
                        className="p-2.5 bg-[#18181b] border border-[#27272a] rounded flex items-start justify-between"
                      >
                        <div>
                          <div className="font-semibold text-purple-400 font-mono">{r.type}</div>
                          <div className="text-[10px] text-[#71717a] mt-0.5">Fonte: {r.source}</div>
                        </div>
                        {r.timeRemaining !== undefined && (
                          <div className="text-[10px] font-mono text-amber-400">
                            {r.timeRemaining.toFixed(1)}s
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <div className="p-2.5 bg-[#18181b] border border-[#27272a] rounded text-[11px] text-[#a1a1aa] space-y-1">
                  <div className="font-semibold text-white">Identificadores Padronizados:</div>
                  <div className="font-mono text-[10px] text-zinc-400">
                    NoPowers • NoMovement • NoFlight • NoBasicAttack • IsShield • Anchored •
                    Invulnerable • Stunned • Silenced
                  </div>
                </div>
              </div>
            )}

            {/* 3. Histórico de Versões */}
            {contextTab === 'historico' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-white">Snapshots Salvos</span>
                  <button
                    onClick={handleRollback}
                    disabled={backups.length < 2}
                    className="text-[10px] text-cyan-400 hover:text-cyan-300 disabled:opacity-40 underline"
                  >
                    Reverter 1 Versão
                  </button>
                </div>

                {backups.length === 0 ? (
                  <div className="p-4 bg-[#18181b] border border-[#27272a] rounded text-center text-[#71717a] text-[11px]">
                    Nenhuma versão anterior registrada.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {backups.map((b, idx) => (
                      <div
                        key={b.id}
                        className="p-2.5 bg-[#18181b] border border-[#27272a] rounded flex items-center justify-between"
                      >
                        <div>
                          <div className="font-medium text-white text-[11px]">{b.label}</div>
                          <div className="text-[10px] text-[#71717a] font-mono">
                            {new Date(b.timestamp).toLocaleTimeString('pt-BR')}
                            {b.kind ? ` • ${b.kind}` : ''}
                          </div>
                        </div>
                        <button
                          onClick={async () => {
                            audioSystem.playUiClick?.();
                            if (!activeScript) return;
                            const res = await scriptRuntimeEngine.restoreBackup(
                              activeScript.id,
                              b.id,
                              gameScene
                            );
                            if (res.success) {
                              setCode(res.restoredCode || b.code);
                              showToast(res.message, 'success');
                            } else {
                              showToast(res.message, 'warn');
                            }
                          }}
                          className="px-2 py-1 bg-[#27272a] hover:bg-[#3f3f46] text-white rounded text-[10px] font-medium"
                        >
                          Restaurar
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 4. Sobre o Módulo */}
            {contextTab === 'info' && activeScript && (
              <div className="space-y-3">
                <div className="p-3 bg-[#18181b] border border-[#27272a] rounded space-y-2">
                  <div className="font-semibold text-white">{activeScript.name}</div>
                  <p className="text-[#a1a1aa] text-[11px] leading-relaxed">
                    {activeScript.summary}
                  </p>
                </div>

                <div className="p-3 bg-[#18181b] border border-[#27272a] rounded space-y-2">
                  <div className="font-semibold text-white">Dependências Resolvidas</div>
                  {activeScript.dependencies.length === 0 ? (
                    <div className="text-[#71717a] text-[11px]">Nenhuma dependência local</div>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {activeScript.dependencies.map((d) => (
                        <span
                          key={d}
                          className="px-2 py-0.5 bg-[#27272a] text-[10px] font-mono rounded text-[#d4d4d8]"
                        >
                          {d}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="p-3 bg-[#18181b] border border-[#27272a] rounded space-y-1 text-[11px] text-[#a1a1aa]">
                  <div>
                    <span className="text-[#71717a]">Categoria:</span> {activeScript.category}
                  </div>
                  <div>
                    <span className="text-[#71717a]">Caminho:</span> {activeScript.filePath}
                  </div>
                  <div>
                    <span className="text-[#71717a]">Tipo:</span> {activeScript.fileExtension.toUpperCase()}
                  </div>
                </div>
              </div>
            )}
          </div>
        </aside>

        {/* Mobile backdrop for right drawer */}
        {mobileDrawer === 'right' && (
          <div
            onClick={() => setMobileDrawer('none')}
            className="md:hidden fixed inset-0 bg-black/60 z-30"
          />
        )}
      </div>
      </div>

      {/* Live Configuration Overlay */}
      {isConfigOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-2 md:p-6">
          <div className="w-full max-w-3xl h-[86vh] max-h-[760px] bg-[#09090b] border border-[#3f3f46] rounded-lg shadow-2xl flex flex-col overflow-hidden">
            <div className="h-10 shrink-0 flex items-center justify-between px-3 border-b border-[#27272a] bg-[#121215]">
              <span className="text-xs font-semibold text-white flex items-center gap-1.5">
                <Settings2 size={14} className="text-cyan-400" />
                Configuração ao Vivo
              </span>
              <button
                onClick={() => setIsConfigOpen(false)}
                className="text-[#a1a1aa] hover:text-white p-1 rounded hover:bg-[#1f1f23]"
                title="Fechar ajustes"
              >
                <X size={16} />
              </button>
            </div>
            <div className="flex-1 min-h-0">
              <ConfigPanel onToast={showToast} />
            </div>
          </div>
        </div>
      )}

      {/* Floating Toast Alerts */}
      <BuildToast toasts={toasts} />
    </div>
  );
};
