/**
 * ConfigPanel.tsx
 * Live tuning surface for gameplay, camera, world, character abilities and UI.
 * Every control writes to the real runtime managers, and the reset buttons
 * restore the same defaults used by the engine.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { RotateCcw, Sliders, User, Cpu, Gamepad2, Volume2 } from 'lucide-react';
import {
  liveConfigManager,
  LiveGameConfig,
} from '../../game/LiveConfigManager';
import {
  settingsManager,
  GameSettings,
} from '../../game/SettingsManager';
import {
  activeAgathaConfig,
  updateAgathaConfig,
  resetAgathaConfig,
} from '../../game/abilities/agatha/AgathaConfig';
import {
  activeIronManConfig,
  updateIronManConfig,
  resetIronManConfig,
} from '../../game/abilities/ironman/IronManConfig';
import { audioSystem } from '../../game/AudioSystem';

type ConfigTab = 'jogo' | 'combate' | 'agatha' | 'ironman' | 'sistema';

interface ConfigPanelProps {
  onToast?: (message: string, type?: 'info' | 'success' | 'warn') => void;
}

interface RangeRowProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (value: number) => void;
}

const RangeRow: React.FC<RangeRowProps> = ({
  label,
  value,
  min,
  max,
  step = 1,
  unit = '',
  onChange,
}) => (
  <label className="block space-y-1">
    <div className="flex items-center justify-between text-[11px]">
      <span className="text-[#d4d4d8]">{label}</span>
      <span className="font-mono text-cyan-300">
        {Number.isInteger(value) ? value : value.toFixed(2)}
        {unit}
      </span>
    </div>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-full h-1.5 accent-cyan-500 cursor-pointer"
    />
  </label>
);

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({
  title,
  children,
}) => (
  <div className="p-3 bg-[#18181b] border border-[#27272a] rounded space-y-2.5">
    <div className="text-[11px] font-semibold uppercase tracking-wider text-[#a1a1aa]">
      {title}
    </div>
    {children}
  </div>
);

export const ConfigPanel: React.FC<ConfigPanelProps> = ({ onToast }) => {
  const [tab, setTab] = useState<ConfigTab>('jogo');
  const [live, setLive] = useState<LiveGameConfig>(liveConfigManager.get());
  const [settings, setSettings] = useState<GameSettings>(settingsManager.get());
  const [agathaTick, setAgathaTick] = useState(0);
  const [ironTick, setIronTick] = useState(0);

  useEffect(() => liveConfigManager.subscribe((cfg) => setLive({ ...cfg })), []);
  useEffect(() => settingsManager.subscribe((s) => setSettings({ ...s })), []);

  const agatha = useMemo(() => activeAgathaConfig, [agathaTick]);
  const iron = useMemo(() => activeIronManConfig, [ironTick]);

  const updateLive = (partial: Partial<LiveGameConfig>) => {
    liveConfigManager.update(partial);
  };

  const updateSetting = <K extends keyof GameSettings>(key: K, value: GameSettings[K]) => {
    settingsManager.update({ [key]: value });
    if (key === 'volume') audioSystem.setVolume((value as number) / 100);
  };

  const updateAgatha = (partial: Parameters<typeof updateAgathaConfig>[0]) => {
    updateAgathaConfig(partial);
    setAgathaTick((t) => t + 1);
  };

  const updateIron = (partial: Parameters<typeof updateIronManConfig>[0]) => {
    updateIronManConfig(partial);
    setIronTick((t) => t + 1);
  };

  const notify = (message: string, type: 'info' | 'success' | 'warn' = 'info') => {
    audioSystem.playUiClick?.();
    onToast?.(message, type);
  };

  const tabs: Array<{ id: ConfigTab; label: string; icon: React.ReactNode }> = [
    { id: 'jogo', label: 'Jogo', icon: <Gamepad2 size={12} /> },
    { id: 'combate', label: 'Combate', icon: <Cpu size={12} /> },
    { id: 'agatha', label: 'Agatha', icon: <User size={12} /> },
    { id: 'ironman', label: 'Iron Man', icon: <User size={12} /> },
    { id: 'sistema', label: 'Sistema', icon: <Sliders size={12} /> },
  ];

  return (
    <div className="flex flex-col h-full min-h-0 bg-[#101013]">
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-[#27272a]">
        <div>
          <div className="text-xs font-semibold text-white flex items-center gap-1.5">
            <Sliders size={14} className="text-cyan-400" />
            Ajustes em Tempo Real
          </div>
          <div className="text-[10px] text-[#71717a] mt-0.5">
            Alterações são persistidas e aplicadas imediatamente ao jogo.
          </div>
        </div>
        <button
          onClick={() => {
            liveConfigManager.reset();
            settingsManager.reset();
            resetAgathaConfig();
            resetIronManConfig();
            setAgathaTick((t) => t + 1);
            setIronTick((t) => t + 1);
            notify('Todos os ajustes restaurados para o padrão.', 'success');
          }}
          className="flex items-center gap-1 px-2 py-1 text-[10px] rounded border border-[#27272a] text-[#a1a1aa] hover:text-white hover:bg-[#1f1f23]"
        >
          <RotateCcw size={11} />
          Reset Total
        </button>
      </div>

      <div className="grid grid-cols-5 border-b border-[#27272a] text-[10px] text-center font-medium">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`py-2 border-b-2 flex flex-col items-center gap-0.5 transition-colors ${
              tab === t.id
                ? 'border-cyan-500 text-white bg-[#18181b]'
                : 'border-transparent text-[#a1a1aa] hover:text-white'
            }`}
          >
            {t.icon}
            <span className="truncate max-w-full px-0.5">{t.label}</span>
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {tab === 'jogo' && (
          <>
            <Section title="Câmera">
              <RangeRow label="Campo de visão (FOV)" value={live.cameraFov} min={35} max={90} onChange={(v) => updateLive({ cameraFov: v })} />
              <RangeRow label="Distância" value={live.cameraDistance} min={2.5} max={12} step={0.1} onChange={(v) => updateLive({ cameraDistance: v })} />
              <RangeRow label="Ombro" value={live.cameraShoulderOffset} min={0} max={2.5} step={0.05} onChange={(v) => updateLive({ cameraShoulderOffset: v })} />
              <RangeRow label="Altura" value={live.cameraHeightOffset} min={0.8} max={3.5} step={0.05} onChange={(v) => updateLive({ cameraHeightOffset: v })} />
              <RangeRow label="Suavidade" value={live.cameraSmoothness} min={2} max={30} onChange={(v) => updateLive({ cameraSmoothness: v })} />
              <RangeRow label="Tremor" value={live.cameraShakeScale} min={0} max={2} step={0.05} onChange={(v) => updateLive({ cameraShakeScale: v })} />
            </Section>

            <Section title="Movimento">
              <RangeRow label="Velocidade no chão" value={live.groundMaxSpeed} min={2} max={25} step={0.1} onChange={(v) => updateLive({ groundMaxSpeed: v })} />
              <RangeRow label="Velocidade de voo" value={live.flightMaxSpeed} min={2} max={30} step={0.1} onChange={(v) => updateLive({ flightMaxSpeed: v })} />
              <RangeRow label="Dash - velocidade" value={live.dashSpeed} min={10} max={45} step={0.5} onChange={(v) => updateLive({ dashSpeed: v })} />
              <RangeRow label="Dash - duração" value={live.dashDuration} min={0.1} max={1} step={0.01} unit="s" onChange={(v) => updateLive({ dashDuration: v })} />
              <RangeRow label="Dash - recarga" value={live.dashCooldown} min={0.2} max={10} step={0.1} unit="s" onChange={(v) => updateLive({ dashCooldown: v })} />
              <RangeRow label="Raio de colisão" value={live.playerCollisionRadius} min={0.2} max={1.2} step={0.01} onChange={(v) => updateLive({ playerCollisionRadius: v })} />
            </Section>

            <Section title="Animação & Mundo">
              <RangeRow label="Velocidade da animação" value={live.animationSpeed} min={0.25} max={2.5} step={0.05} onChange={(v) => updateLive({ animationSpeed: v })} />
              <RangeRow label="Luz do sol" value={live.sunLightIntensity} min={0.1} max={3} step={0.05} onChange={(v) => updateLive({ sunLightIntensity: v })} />
              <RangeRow label="Névoa - início" value={live.fogNear} min={5} max={100} onChange={(v) => updateLive({ fogNear: v })} />
              <RangeRow label="Névoa - fim" value={live.fogFar} min={50} max={500} onChange={(v) => updateLive({ fogFar: v })} />
              <RangeRow label="Impulso do jump pad" value={live.jumpPadBounceMultiplier} min={0.5} max={3} step={0.05} onChange={(v) => updateLive({ jumpPadBounceMultiplier: v })} />
              <div className="grid grid-cols-2 gap-2 pt-1">
                <label className="text-[10px] text-[#a1a1aa] space-y-1">
                  <span>Cor do céu</span>
                  <input type="color" value={live.skyColor} onChange={(e) => updateLive({ skyColor: e.target.value })} className="w-full h-7 bg-transparent border border-[#27272a] rounded cursor-pointer" />
                </label>
                <label className="text-[10px] text-[#a1a1aa] space-y-1">
                  <span>Cor do chão</span>
                  <input type="color" value={live.baseplateColor} onChange={(e) => updateLive({ baseplateColor: e.target.value })} className="w-full h-7 bg-transparent border border-[#27272a] rounded cursor-pointer" />
                </label>
              </div>
            </Section>
          </>
        )}

        {tab === 'combate' && (
          <>
            <Section title="Dano global de combate">
              <RangeRow label="Repulsor" value={live.repulsorDamage} min={5} max={200} onChange={(v) => updateLive({ repulsorDamage: v })} />
              <RangeRow label="Mísseis - quantidade" value={live.missileCount} min={1} max={16} onChange={(v) => updateLive({ missileCount: v })} />
              <RangeRow label="Mísseis - dano" value={live.missileDamage} min={2} max={100} onChange={(v) => updateLive({ missileDamage: v })} />
              <RangeRow label="Míssil pesado" value={live.heavyMissileDamage} min={10} max={300} onChange={(v) => updateLive({ heavyMissileDamage: v })} />
              <RangeRow label="Agatha - rajada arcana" value={live.arcaneBlastDamage} min={5} max={200} onChange={(v) => updateLive({ arcaneBlastDamage: v })} />
              <RangeRow label="Agatha - dreno (DPS)" value={live.darkDrainDps} min={5} max={150} onChange={(v) => updateLive({ darkDrainDps: v })} />
              <RangeRow label="Agatha - duração do choke" value={live.arcaneChokeDuration} min={1} max={10} step={0.1} unit="s" onChange={(v) => updateLive({ arcaneChokeDuration: v })} />
            </Section>
            <div className="p-2.5 rounded border border-amber-500/25 bg-amber-500/5 text-[10px] text-amber-200/80 leading-relaxed">
              Estes valores são multiplicadores globais. Os ajustes detalhados por habilidade ficam nas abas
              Agatha e Iron Man e têm prioridade dentro de cada módulo.
            </div>
          </>
        )}

        {tab === 'agatha' && (
          <>
            <Section title="Rajada Arcana">
              <RangeRow label="Dano" value={agatha.arcaneBlast.damage} min={5} max={200} onChange={(v) => updateAgatha({ arcaneBlast: { ...agatha.arcaneBlast, damage: v } })} />
              <RangeRow label="Velocidade" value={agatha.arcaneBlast.speed} min={10} max={90} step={0.5} onChange={(v) => updateAgatha({ arcaneBlast: { ...agatha.arcaneBlast, speed: v } })} />
              <RangeRow label="Alcance" value={agatha.arcaneBlast.maxRange} min={10} max={120} onChange={(v) => updateAgatha({ arcaneBlast: { ...agatha.arcaneBlast, maxRange: v } })} />
              <RangeRow label="Recarga" value={agatha.arcaneBlast.cooldown} min={0.05} max={3} step={0.01} unit="s" onChange={(v) => updateAgatha({ arcaneBlast: { ...agatha.arcaneBlast, cooldown: v } })} />
            </Section>
            <Section title="Dreno Sombrio">
              <RangeRow label="DPS" value={agatha.darkDrain.dps} min={1} max={150} onChange={(v) => updateAgatha({ darkDrain: { ...agatha.darkDrain, dps: v } })} />
              <RangeRow label="Cura por segundo" value={agatha.darkDrain.healRate} min={0} max={100} onChange={(v) => updateAgatha({ darkDrain: { ...agatha.darkDrain, healRate: v } })} />
              <RangeRow label="Duração" value={agatha.darkDrain.duration} min={0.5} max={10} step={0.1} unit="s" onChange={(v) => updateAgatha({ darkDrain: { ...agatha.darkDrain, duration: v } })} />
              <RangeRow label="Alcance" value={agatha.darkDrain.range} min={5} max={60} onChange={(v) => updateAgatha({ darkDrain: { ...agatha.darkDrain, range: v } })} />
            </Section>
            <Section title="Orbe do Caos">
              <RangeRow label="Dano direto" value={agatha.chaosOrb.directDamage} min={5} max={300} onChange={(v) => updateAgatha({ chaosOrb: { ...agatha.chaosOrb, directDamage: v } })} />
              <RangeRow label="Dano em área" value={agatha.chaosOrb.splashDamage} min={0} max={300} onChange={(v) => updateAgatha({ chaosOrb: { ...agatha.chaosOrb, splashDamage: v } })} />
              <RangeRow label="Raio da explosão" value={agatha.chaosOrb.splashRadius} min={1} max={20} step={0.5} onChange={(v) => updateAgatha({ chaosOrb: { ...agatha.chaosOrb, splashRadius: v } })} />
              <RangeRow label="Recarga" value={agatha.chaosOrb.cooldown} min={0.5} max={30} step={0.1} unit="s" onChange={(v) => updateAgatha({ chaosOrb: { ...agatha.chaosOrb, cooldown: v } })} />
            </Section>
            <Section title="Proteção Rúnica">
              <RangeRow label="Saúde do escudo" value={agatha.runicWard.shieldHealth} min={10} max={500} onChange={(v) => updateAgatha({ runicWard: { ...agatha.runicWard, shieldHealth: v } })} />
              <RangeRow label="Duração" value={agatha.runicWard.duration} min={1} max={20} step={0.5} unit="s" onChange={(v) => updateAgatha({ runicWard: { ...agatha.runicWard, duration: v } })} />
              <RangeRow label="Redução de dano" value={agatha.runicWard.damageReduction} min={0} max={0.95} step={0.05} onChange={(v) => updateAgatha({ runicWard: { ...agatha.runicWard, damageReduction: v } })} />
              <RangeRow label="Recarga" value={agatha.runicWard.cooldown} min={1} max={30} step={0.5} unit="s" onChange={(v) => updateAgatha({ runicWard: { ...agatha.runicWard, cooldown: v } })} />
            </Section>
            <Section title="Estrangulamento Arcano">
              <RangeRow label="Dano por tick" value={agatha.arcaneChoke.tickDamage} min={1} max={150} onChange={(v) => updateAgatha({ arcaneChoke: { ...agatha.arcaneChoke, tickDamage: v } })} />
              <RangeRow label="Duração" value={agatha.arcaneChoke.duration} min={0.5} max={10} step={0.1} unit="s" onChange={(v) => updateAgatha({ arcaneChoke: { ...agatha.arcaneChoke, duration: v } })} />
              <RangeRow label="Alcance" value={agatha.arcaneChoke.maxRange} min={5} max={80} onChange={(v) => updateAgatha({ arcaneChoke: { ...agatha.arcaneChoke, maxRange: v } })} />
              <RangeRow label="Recarga" value={agatha.arcaneChoke.cooldown} min={1} max={30} step={0.5} unit="s" onChange={(v) => updateAgatha({ arcaneChoke: { ...agatha.arcaneChoke, cooldown: v } })} />
            </Section>
            <Section title="Passo das Sombras">
              <RangeRow label="Distância" value={agatha.shadowStep.distance} min={2} max={50} step={0.5} onChange={(v) => updateAgatha({ shadowStep: { ...agatha.shadowStep, distance: v } })} />
              <RangeRow label="Recarga" value={agatha.shadowStep.cooldown} min={0.5} max={20} step={0.5} unit="s" onChange={(v) => updateAgatha({ shadowStep: { ...agatha.shadowStep, cooldown: v } })} />
            </Section>
            <button
              onClick={() => {
                resetAgathaConfig();
                setAgathaTick((t) => t + 1);
                notify('Configuração da Agatha restaurada.', 'success');
              }}
              className="w-full py-1.5 rounded border border-[#27272a] text-[11px] text-[#a1a1aa] hover:text-white hover:bg-[#1f1f23] flex items-center justify-center gap-1.5"
            >
              <RotateCcw size={12} />
              Restaurar padrões da Agatha
            </button>
          </>
        )}

        {tab === 'ironman' && (
          <>
            <Section title="Repulsor">
              <RangeRow label="Dano" value={iron.repulsor.damage} min={1} max={200} onChange={(v) => updateIron({ repulsor: { ...iron.repulsor, damage: v } })} />
              <RangeRow label="Velocidade" value={iron.repulsor.speed} min={10} max={120} step={0.5} onChange={(v) => updateIron({ repulsor: { ...iron.repulsor, speed: v } })} />
              <RangeRow label="Alcance" value={iron.repulsor.maxRange} min={5} max={150} onChange={(v) => updateIron({ repulsor: { ...iron.repulsor, maxRange: v } })} />
              <RangeRow label="Recarga" value={iron.repulsor.cooldown} min={0.05} max={3} step={0.01} unit="s" onChange={(v) => updateIron({ repulsor: { ...iron.repulsor, cooldown: v } })} />
            </Section>
            <Section title="Micro-mísseis">
              <RangeRow label="Quantidade" value={iron.microMissiles.volleyCount} min={1} max={16} onChange={(v) => updateIron({ microMissiles: { ...iron.microMissiles, volleyCount: v } })} />
              <RangeRow label="Dano por míssil" value={iron.microMissiles.damagePerMissile} min={1} max={100} onChange={(v) => updateIron({ microMissiles: { ...iron.microMissiles, damagePerMissile: v } })} />
              <RangeRow label="Velocidade" value={iron.microMissiles.speed} min={5} max={80} step={0.5} onChange={(v) => updateIron({ microMissiles: { ...iron.microMissiles, speed: v } })} />
              <RangeRow label="Recarga" value={iron.microMissiles.cooldown} min={0.5} max={30} step={0.5} unit="s" onChange={(v) => updateIron({ microMissiles: { ...iron.microMissiles, cooldown: v } })} />
            </Section>
            <Section title="Unibeam">
              <RangeRow label="Dano" value={iron.unibeam.damage} min={5} max={400} onChange={(v) => updateIron({ unibeam: { ...iron.unibeam, damage: v } })} />
              <RangeRow label="Tempo de carga" value={iron.unibeam.chargeTime} min={0} max={3} step={0.05} unit="s" onChange={(v) => updateIron({ unibeam: { ...iron.unibeam, chargeTime: v } })} />
              <RangeRow label="Alcance" value={iron.unibeam.range} min={10} max={200} onChange={(v) => updateIron({ unibeam: { ...iron.unibeam, range: v } })} />
              <RangeRow label="Recarga" value={iron.unibeam.cooldown} min={0.5} max={40} step={0.5} unit="s" onChange={(v) => updateIron({ unibeam: { ...iron.unibeam, cooldown: v } })} />
            </Section>
            <Section title="Feixes Duplos">
              <RangeRow label="DPS" value={iron.dualBeams.dps} min={1} max={200} onChange={(v) => updateIron({ dualBeams: { ...iron.dualBeams, dps: v } })} />
              <RangeRow label="Alcance" value={iron.dualBeams.range} min={5} max={100} onChange={(v) => updateIron({ dualBeams: { ...iron.dualBeams, range: v } })} />
              <RangeRow label="Duração máxima" value={iron.dualBeams.maxDuration} min={0.5} max={20} step={0.5} unit="s" onChange={(v) => updateIron({ dualBeams: { ...iron.dualBeams, maxDuration: v } })} />
              <RangeRow label="Recarga" value={iron.dualBeams.cooldown} min={0.5} max={40} step={0.5} unit="s" onChange={(v) => updateIron({ dualBeams: { ...iron.dualBeams, cooldown: v } })} />
            </Section>
            <Section title="Lasers Giratórios">
              <RangeRow label="Dano" value={iron.spinningLasers.damage} min={1} max={200} onChange={(v) => updateIron({ spinningLasers: { ...iron.spinningLasers, damage: v } })} />
              <RangeRow label="Raio" value={iron.spinningLasers.radius} min={1} max={20} step={0.5} onChange={(v) => updateIron({ spinningLasers: { ...iron.spinningLasers, radius: v } })} />
              <RangeRow label="Duração" value={iron.spinningLasers.duration} min={0.2} max={10} step={0.1} unit="s" onChange={(v) => updateIron({ spinningLasers: { ...iron.spinningLasers, duration: v } })} />
              <RangeRow label="Recarga" value={iron.spinningLasers.cooldown} min={0.5} max={40} step={0.5} unit="s" onChange={(v) => updateIron({ spinningLasers: { ...iron.spinningLasers, cooldown: v } })} />
            </Section>
            <button
              onClick={() => {
                resetIronManConfig();
                setIronTick((t) => t + 1);
                notify('Configuração do Homem de Ferro restaurada.', 'success');
              }}
              className="w-full py-1.5 rounded border border-[#27272a] text-[11px] text-[#a1a1aa] hover:text-white hover:bg-[#1f1f23] flex items-center justify-center gap-1.5"
            >
              <RotateCcw size={12} />
              Restaurar padrões do Homem de Ferro
            </button>
          </>
        )}

        {tab === 'sistema' && (
          <>
            <Section title="Áudio & Vídeo">
              <RangeRow label="Volume" value={settings.volume} min={0} max={100} unit="%" onChange={(v) => updateSetting('volume', v)} />
              <label className="block text-[11px] space-y-1">
                <span className="text-[#d4d4d8]">Qualidade gráfica</span>
                <select
                  value={settings.graphics}
                  onChange={(e) => updateSetting('graphics', e.target.value as GameSettings['graphics'])}
                  className="w-full bg-[#101013] border border-[#27272a] rounded px-2 py-1 text-[11px] text-white"
                >
                  <option value="low">Baixa</option>
                  <option value="medium">Média</option>
                  <option value="high">Alta</option>
                </select>
              </label>
              <RangeRow label="Opacidade da interface" value={settings.uiOpacity} min={0.5} max={1} step={0.05} onChange={(v) => updateSetting('uiOpacity', v)} />
            </Section>

            <Section title="Controles & Câmera">
              <RangeRow label="Sensibilidade (mouse)" value={settings.cameraSensitivity} min={0.5} max={2} step={0.05} onChange={(v) => updateSetting('cameraSensitivity', v)} />
              <RangeRow label="Sensibilidade (toque)" value={settings.touchSensitivity} min={0.5} max={2} step={0.05} onChange={(v) => updateSetting('touchSensitivity', v)} />
              <label className="flex items-center justify-between text-[11px] text-[#d4d4d8]">
                <span>Tremor de câmera</span>
                <input type="checkbox" checked={settings.cameraShake} onChange={(e) => updateSetting('cameraShake', e.target.checked)} className="accent-cyan-500" />
              </label>
              <label className="flex items-center justify-between text-[11px] text-[#d4d4d8]">
                <span>Auxílio de mira</span>
                <input type="checkbox" checked={settings.aimAssist} onChange={(e) => updateSetting('aimAssist', e.target.checked)} className="accent-cyan-500" />
              </label>
              <label className="block text-[11px] space-y-1">
                <span className="text-[#d4d4d8]">Estilo da mira</span>
                <select
                  value={settings.reticleStyle}
                  onChange={(e) => updateSetting('reticleStyle', e.target.value as GameSettings['reticleStyle'])}
                  className="w-full bg-[#101013] border border-[#27272a] rounded px-2 py-1 text-[11px] text-white"
                >
                  <option value="dot">Ponto</option>
                  <option value="crosshair">Mira</option>
                </select>
              </label>
            </Section>

            <Section title="Persistência">
              <div className="text-[10px] text-[#a1a1aa] leading-relaxed flex items-start gap-1.5">
                <Volume2 size={12} className="mt-0.5 shrink-0 text-cyan-400" />
                Configurações de sistema são salvas automaticamente no localStorage e sobrevivem ao recarregamento.
              </div>
              <button
                onClick={() => {
                  settingsManager.reset();
                  notify('Configurações do sistema restauradas.', 'success');
                }}
                className="w-full py-1.5 rounded border border-[#27272a] text-[11px] text-[#a1a1aa] hover:text-white hover:bg-[#1f1f23] flex items-center justify-center gap-1.5"
              >
                <RotateCcw size={12} />
                Restaurar padrões do sistema
              </button>
            </Section>
          </>
        )}
      </div>
    </div>
  );
};
