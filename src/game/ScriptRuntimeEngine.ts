/**
 * ScriptRuntimeEngine.ts
 * A real, auditable source-to-runtime pipeline for the in-game script editor.
 *
 * Lifecycle per script:
 *   original -> draft -> saved -> validated -> applied -> running -> last working
 *
 * Persistence is handled by ScriptPersistence (IndexedDB + local mirror).
 * Applying is transactional: a syntax/dependency/integration failure never
 * replaces the last working version and never erases a custom draft.
 */

import * as THREE from 'three';
import React from 'react';
import * as LucideIcons from 'lucide-react';
import { transform } from 'sucrase';
import { PROJECT_SCRIPTS, ProjectScriptInfo, ScriptCategory } from './RealProjectScripts';
import {
  loadAppliedScripts,
  persistAppliedScript,
  removeAppliedScript,
  subscribeAppliedChanges,
  AppliedScriptRecord,
} from './AppliedScriptStore';
import { liveConfigManager, DEFAULT_LIVE_CONFIG } from './LiveConfigManager';
import { audioSystem } from './AudioSystem';
import { settingsManager, DEFAULT_SETTINGS } from './SettingsManager';
import { TargetDummy } from './TargetDummy';
import { createStickmanRig } from './StickmanRig';
import { AnimationController } from './AnimationController';
import { ProjectileSystem } from './ProjectileSystem';
import { BuildModeManager } from './BuildModeManager';
import { BUILD_MODE_SCENE } from './generated/BuildModeDefaults';
import { AgathaAbilities } from './AgathaAbilities';
import { IronManAbilities } from './IronManAbilities';
import { gameplayRestrictions, GameplayRestrictionsManager } from './GameplayRestrictions';
import {
  activeAgathaConfig,
  updateAgathaConfig,
  resetAgathaConfig,
  mergeAgathaConfig,
  DEFAULT_AGATHA_CONFIG,
} from './abilities/agatha/AgathaConfig';
import { AgathaArcaneBlast } from './abilities/agatha/AgathaArcaneBlast';
import { AgathaDarkDrain } from './abilities/agatha/AgathaDarkDrain';
import { AgathaChaosOrb } from './abilities/agatha/AgathaChaosOrb';
import { AgathaRunicWard } from './abilities/agatha/AgathaRunicWard';
import { AgathaTelekineticChoke } from './abilities/agatha/AgathaTelekineticChoke';
import { AgathaShadowStep } from './abilities/agatha/AgathaShadowStep';
import {
  activeIronManConfig,
  updateIronManConfig,
  resetIronManConfig,
  mergeIronManConfig,
  DEFAULT_IRONMAN_CONFIG,
} from './abilities/ironman/IronManConfig';
import { IronManRepulsor } from './abilities/ironman/IronManRepulsor';
import { IronManMicroMissiles } from './abilities/ironman/IronManMicroMissiles';
import { IronManUnibeam } from './abilities/ironman/IronManUnibeam';
import { IronManDualBeams } from './abilities/ironman/IronManDualBeams';
import { IronManBeamVisual, BeamClashDisk } from './abilities/ironman/IronManBeamFx';
import { IronManSpinningLasers } from './abilities/ironman/IronManSpinningLasers';
import { DealDamageSystem } from './systems/DealDamageSystem';
import { FlightSystem } from './systems/FlightSystem';
import { CooldownSystem } from './systems/CooldownSystem';
import { MovementSystem } from './systems/MovementSystem';
import {
  WorldCollision,
  worldCollision,
  installWorldCollisionInstance,
} from './systems/WorldCollision';
import { soundSystem } from './systems/SoundSystem';
import {
  COMBAT_BUTTON_PROFILES,
  getCombatButtonProfile,
  installCombatButtonProfileProvider,
} from './systems/AbilityButtonSystem';
import { AUDIO_MANIFEST, LOOP_AUDIO_KEYS } from './audio/AudioManifest';

import { CombatButtons } from '../components/CombatButtons';
import { VirtualJoystick } from '../components/VirtualJoystick';
import { AimReticle } from '../components/AimReticle';
import { PowerSelectModal } from '../components/PowerSelectModal';
import { SettingsModal } from '../components/SettingsModal';

import {
  scriptPersistence,
  sourceHash,
  createEmptyRecord,
  normalizeRecord,
  ScriptRecordData,
  ScriptVersionData,
  ScriptVersionKind,
  ScriptErrorType,
} from './ScriptPersistence';

export type ScriptStatus = 'applied' | 'pending' | 'error';

export interface WorkingBackup {
  id: string;
  timestamp: number;
  label: string;
  code: string;
  kind?: ScriptVersionKind;
}

export interface UserScriptDef extends ProjectScriptInfo {
  isUserCreated?: boolean;
  isDeleted?: boolean;
}

export type DiagnosticType = 'syntax' | 'dependency' | 'integration' | 'runtime' | 'persistence';

export interface ScriptDiagnostic {
  type: DiagnosticType;
  message: string;
  file?: string;
  line?: number;
  column?: number;
  hint?: string;
}

export interface CompileResult {
  success: boolean;
  message: string;
  error?: string;
  line?: number;
  column?: number;
  diagnostics?: ScriptDiagnostic[];
  applied?: boolean;
  validated?: boolean;
  running?: boolean;
  requiresRestart?: boolean;
  syncWarning?: string;
  capability?: 'hot-swap' | 'restart-required' | 'read-only';
}

export interface ScriptLifecycleState {
  id: string;
  status: ScriptStatus;
  lifecycle: 'original' | 'draft' | 'saved' | 'validated' | 'applied' | 'running' | 'error';
  originalSource: string;
  draftSource: string;
  savedSource: string | null;
  validatedSource: string | null;
  appliedSource: string | null;
  runningSource: string | null;
  exportedSource: string | null;
  lastWorkingSource: string | null;
  hasDraftChanges: boolean;
  hasUnappliedChanges: boolean;
  appliedHash: string | null;
  runningHash: string | null;
  exportedHash: string | null;
  exportedAt: number | null;
  error: ScriptRecordData['error'];
  revision: number;
  updatedAt: number;
  capability: 'hot-swap' | 'restart-required' | 'read-only';
}

interface ApplyOptions {
  startup?: boolean;
  versionKind?: ScriptVersionKind;
  versionLabel?: string;
  skipDependents?: boolean;
  skipServerSync?: boolean;
}

const CUSTOM_SCRIPTS_KEY = 'stickman_custom_user_scripts_v4';
const DELETED_SCRIPTS_KEY = 'stickman_deleted_scripts_v4';

const EXTERNAL_MODULES = new Set(['three', 'react', 'lucide-react', 'sucrase']);

/**
 * Runtime facades that are intentionally not editable catalog files but are
 * still valid imports for compiled project modules (e.g. SettingsModal imports
 * ../game/SettingsManager). They must pass dependency validation because the
 * engine injects the live singleton at execution time.
 */
const RUNTIME_FACADE_MODULES = new Set([
  'settingsmanager',
  'liveconfigmanager',
  'buildmodemanager',
  'buildmodedefaults',
  'scriptruntimeengine',
]);

const AGATHA_ABILITY_IDS = [
  'agatha-arcane-blast',
  'agatha-dark-drain',
  'agatha-chaos-orb',
  'agatha-runic-ward',
  'agatha-choke',
  'agatha-shadow-step',
];

const IRONMAN_ABILITY_IDS = [
  'ironman-repulsor',
  'ironman-micro-missiles',
  'ironman-unibeam',
  'ironman-dual-beams',
  'ironman-spinning-lasers',
];

/**
 * Explicit "who must be reinstalled when this module changes" edges. Catalog
 * dependencies cover imports; these cover semantic runtime wiring that is not
 * expressed as an import (HUD pulling a system, controllers owning modules).
 */
const EXTRA_DEPENDENTS: Record<string, string[]> = {
  'cooldown-system': ['combat-buttons'],
  'ability-button-system': ['combat-buttons'],
  'settings-manager': ['combat-buttons', 'settings-modal', 'aim-reticle'],
  'sound-system': ['ironman-dual-beams', 'ironman-spinning-lasers'],
  'ironman-beam-fx': ['ironman-dual-beams', 'ironman-unibeam'],
  'agatha-abilities': AGATHA_ABILITY_IDS,
  'ironman-abilities': IRONMAN_ABILITY_IDS,
  'target-dummy': ['projectile-system'],
  'level-geometry': [],
};

// Values exposed to compiled modules in place of `import.meta`.
const RUNTIME_IMPORT_META_ENV = {
  BASE_URL: import.meta.env.BASE_URL || '/',
  MODE: import.meta.env.MODE || 'production',
  DEV: false,
  PROD: true,
};
const RUNTIME_IMPORT_META_URL =
  typeof location !== 'undefined' ? location.href : '';

/**
 * HUD components that statically import a system. When the system changes at
 * runtime they must be recompiled (even if unedited) so the new code is used.
 */
const FORCE_DEPENDENT_REINSTALL: Record<string, string[]> = {
  'cooldown-system': ['combat-buttons'],
  'ability-button-system': ['combat-buttons'],
};

const EXPECTED_EXPORTS: Record<string, string[]> = {
  'agatha-config': ['activeAgathaConfig', 'default'],
  'ironman-config': ['activeIronManConfig', 'default'],
  'agatha-flight-config': ['AGATHA_FLIGHT_PROFILE'],
  'ironman-flight-config': ['IRONMAN_FLIGHT_PROFILE'],
  'flight-system': ['FlightSystem'],
  'movement-system': ['MovementSystem'],
  'cooldown-system': ['CooldownSystem'],
  'ability-button-system': ['COMBAT_BUTTON_PROFILES', 'getCombatButtonProfile'],
  'sound-system': ['audioSystem', 'soundSystem'],
  'world-collision': ['WorldCollision'],
  'audio-manifest': ['AUDIO_MANIFEST'],
  'settings-manager': ['settingsManager', 'DEFAULT_SETTINGS'],
  'live-config-manager': ['liveConfigManager', 'DEFAULT_LIVE_CONFIG'],
  'build-mode-manager': ['BuildModeManager'],
  'ironman-beam-fx': ['IronManBeamVisual', 'BeamClashDisk'],
  'agatha-arcane-blast': ['AgathaArcaneBlast', 'default'],
  'agatha-dark-drain': ['AgathaDarkDrain', 'default'],
  'agatha-chaos-orb': ['AgathaChaosOrb', 'default'],
  'agatha-runic-ward': ['AgathaRunicWard', 'default'],
  'agatha-choke': ['AgathaTelekineticChoke', 'default'],
  'agatha-shadow-step': ['AgathaShadowStep', 'default'],
  'agatha-abilities': ['AgathaAbilities', 'default'],
  'ironman-repulsor': ['IronManRepulsor', 'default'],
  'ironman-micro-missiles': ['IronManMicroMissiles', 'default'],
  'ironman-unibeam': ['IronManUnibeam', 'default'],
  'ironman-dual-beams': ['IronManDualBeams', 'default'],
  'ironman-spinning-lasers': ['IronManSpinningLasers', 'default'],
  'ironman-abilities': ['IronManAbilities', 'default'],
  'deal-damage-system': ['DealDamageSystem', 'default'],
  'animation-controller': ['AnimationController', 'default'],
  'projectile-system': ['ProjectileSystem', 'default'],
  'target-dummy': ['TargetDummy', 'default'],
  'gameplay-restrictions': ['GameplayRestrictionsManager'],
  'combat-buttons': ['CombatButtons', 'default'],
  'virtual-joystick': ['VirtualJoystick', 'default'],
  'aim-reticle': ['AimReticle', 'default'],
  'power-select-modal': ['PowerSelectModal', 'default'],
  'settings-modal': ['SettingsModal', 'default'],
  'orientation-guard': ['OrientationGuard', 'default'],
  'game-scene': ['GameScene', 'default'],
  'stickman-rig': ['createStickmanRig', 'default'],
  'audio-system': ['audioSystem', 'default'],
};

const APPLY_ORDER: Record<string, number> = {
  Configurações: 0,
  Controladores: 1,
  Habilidades: 2,
  Restrições: 3,
  Combate: 4,
  'Interface & HUD': 5,
  Sistemas: 6,
};

const normalizeKey = (key: string): string => key.toLowerCase().replace(/[^a-z0-9]/g, '');

function basenameSpecifier(specifier: string): string {
  return normalizeKey(specifier.split('/').pop()?.replace(/\.(ts|tsx|js|jsx)$/i, '') || specifier);
}

function getCapability(script: ProjectScriptInfo | undefined): 'hot-swap' | 'restart-required' | 'read-only' {
  return script?.runtimeIntegration || 'hot-swap';
}

function moduleExportNames(compiledJs: string): Set<string> {
  const names = new Set<string>();
  const pattern = /exports(?:\.([A-Za-z0-9_$]+)|\[['"]([^'"]+)['"]\])\s*=/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(compiledJs)) !== null) {
    names.add(match[1] || match[2]);
  }
  return names;
}

class ScriptRuntimeEngine {
  private customScripts: UserScriptDef[] = [];
  private deletedScriptIds: Set<string> = new Set();

  private records: Map<string, ScriptRecordData> = new Map();
  private statusErrors: Map<string, ScriptDiagnostic> = new Map();
  private versionsByScript: Map<string, ScriptVersionData[]> = new Map();

  private uiComponentRegistry: Map<string, React.ComponentType<any>> = new Map();
  private compiledModules: Map<string, Record<string, unknown>> = new Map();
  private aliasToScriptId: Map<string, string> = new Map();
  private dependentGraph: Map<string, string[]> = new Map();
  /**
   * Modules actually installed during THIS session. The persisted `record.running`
   * is only meaningful when it is in this set, otherwise the UI would show a
   * stale "running" badge for restart-required code left over from last visit.
   */
  private runningNow: Set<string> = new Set();
  private effectiveWorldCollisionClass: typeof WorldCollision = WorldCollision;
  private rehydratedScenes: WeakSet<object> = new WeakSet();
  private operationQueues: Map<string, Promise<unknown>> = new Map();
  private applyTokens: Map<string, number> = new Map();

  private listeners: Set<() => void> = new Set();
  private uiListeners: Set<() => void> = new Set();

  private activeGameScene: unknown = null;
  private readyPromise: Promise<void>;
  private isReady = false;
  private appliedSyncConflicts: Map<string, string> = new Map();
  private appliedSyncStarted = false;
  private lastAppliedStoreSource: 'server' | 'bundle' = 'bundle';

  public onPowerSetRequested?: (powerSet: 'ironman' | 'agatha' | 'vision') => void;

  constructor() {
    this.loadPersistedCatalog();
    this.buildAliasMap();
    this.seedRecordsFromMirror();
    this.readyPromise = this.initialize();
  }

  private async initialize(): Promise<void> {
    await scriptPersistence.hydrate();
    for (const cached of scriptPersistence.getCachedRecords()) {
      const hydrated = normalizeRecord(cached, cached.id);
      const current = this.records.get(cached.id);
      // Never let a slower IndexedDB read overwrite an edit made while the
      // engine was still hydrating (the mirror is synchronous).
      if (current && current.revision > hydrated.revision) continue;
      this.records.set(cached.id, hydrated);
    }
    await this.mergeAppliedScriptsFromStore();
    for (const script of this.getScripts()) {
      this.ensureRecord(script);
    }
    this.reloadVersions();
    this.ensureOriginalVersions();
    this.isReady = true;
    this.startAppliedSync();
    this.notify();
  }

  private ensureScriptFromAppliedEntry(entry: AppliedScriptRecord): ProjectScriptInfo | undefined {
    const existing = this.getScriptById(entry.id);
    if (existing) return existing;
    const metadata = entry.script;
    if (!metadata || typeof metadata !== 'object') return undefined;
    const candidate = metadata as unknown as Partial<ProjectScriptInfo>;
    if (typeof candidate.name !== 'string' || typeof candidate.filePath !== 'string') {
      return undefined;
    }
    if (this.customScripts.some((script) => script.id === entry.id)) {
      return this.getScriptById(entry.id);
    }
    const script: ProjectScriptInfo = {
      id: entry.id,
      name: candidate.name,
      filePath: candidate.filePath,
      category: (candidate.category as ScriptCategory) || 'Sistemas',
      summary: candidate.summary || 'Script personalizado aplicado em outra sessão.',
      originalSource:
        typeof candidate.originalSource === 'string' ? candidate.originalSource : entry.code,
      fileExtension: candidate.fileExtension === 'tsx' ? 'tsx' : 'ts',
      dependencies: Array.isArray(candidate.dependencies) ? candidate.dependencies : [],
      character: candidate.character,
      isUserCreated: true,
      runtimeIntegration: candidate.runtimeIntegration || 'hot-swap',
      keywords: Array.isArray(candidate.keywords) ? candidate.keywords : [],
    };
    this.customScripts.push(script);
    this.buildAliasMap();
    this.saveCustomCatalog();
    return script;
  }

  private mergeAppliedEntry(entry: AppliedScriptRecord): boolean {
    const script = this.ensureScriptFromAppliedEntry(entry);
    if (!script) return false;
    const record = this.ensureRecord(script);
    const previousApplied = record.applied;
    const localAppliedAt = record.appliedAt || 0;
    if (record.applied && entry.appliedAt < localAppliedAt) return false;
    if (
      record.applied &&
      record.applied !== entry.code &&
      entry.appliedAt === localAppliedAt &&
      entry.updatedAt <= record.updatedAt
    ) {
      this.appliedSyncConflicts.set(
        entry.id,
        'Outra aba possui uma versão aplicada com o mesmo instante; a versão local foi preservada.'
      );
      return false;
    }
    if (record.applied === entry.code && record.appliedHash === entry.hash) return false;

    const hash = entry.hash || sourceHash(entry.code);
    record.applied = entry.code;
    record.appliedHash = hash;
    record.appliedAt = entry.appliedAt || Date.now();
    if (!record.draft || record.draft === previousApplied) record.draft = entry.code;
    if (!record.saved || record.saved === previousApplied) record.saved = entry.code;
    if (!record.validated || record.validated === previousApplied) {
      record.validated = entry.code;
      record.validatedHash = hash;
      record.validatedAt = record.appliedAt;
    }
    if (!record.lastWorking) {
      record.lastWorking = entry.code;
      record.lastWorkingHash = hash;
    }
    record.revision += 1;
    record.updatedAt = Date.now();
    record.error = null;
    this.persistRecord(record);
    return true;
  }

  private async mergeAppliedScriptsFromStore(): Promise<void> {
    try {
      const { state, source } = await loadAppliedScripts();
      this.lastAppliedStoreSource = source;
      for (const entry of state.scripts) this.mergeAppliedEntry(entry);
    } catch (error) {
      console.warn('[ScriptRuntimeEngine] Could not load applied-script state:', error);
    }
  }

  private startAppliedSync(): void {
    if (this.appliedSyncStarted || typeof window === 'undefined') return;
    this.appliedSyncStarted = true;
    subscribeAppliedChanges((entry) => {
      if (entry) {
        const changed = this.mergeAppliedEntry(entry);
        if (changed) {
          this.notify();
          void this.applyChangedAppliedEntry(entry);
        }
      } else {
        void this.refreshAppliedFromStore();
      }
    });
    window.addEventListener('focus', () => {
      void this.refreshAppliedFromStore();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void this.refreshAppliedFromStore();
    });
  }

  private async applyChangedAppliedEntry(entry: AppliedScriptRecord): Promise<void> {
    const script = this.getScriptById(entry.id);
    const scene = this.activeGameScene;
    if (!script || !scene || getCapability(script) !== 'hot-swap') return;
    await this.applyScript(script.id, entry.code, scene, {
      startup: true,
      skipDependents: true,
      skipServerSync: true,
    });
  }

  private async refreshAppliedFromStore(): Promise<void> {
    await this.readyPromise;
    const before = new Map<string, string | null>();
    for (const script of this.getScripts()) {
      before.set(script.id, this.getRecord(script.id).applied);
    }
    await this.mergeAppliedScriptsFromStore();
    const changed: AppliedScriptRecord[] = [];
    for (const script of this.getScripts()) {
      const record = this.getRecord(script.id);
      if (record.applied && record.applied !== before.get(script.id)) {
        changed.push({
          id: script.id,
          name: script.name,
          filePath: script.filePath,
          code: record.applied,
          hash: record.appliedHash || sourceHash(record.applied),
          appliedAt: record.appliedAt || 0,
          revision: record.revision,
          requiresRestart: getCapability(script) === 'restart-required',
          updatedAt: record.updatedAt,
        });
      }
    }
    if (changed.length === 0) return;
    this.notify();
    const scene = this.activeGameScene;
    if (!scene) return;
    for (const entry of changed) {
      const script = this.getScriptById(entry.id);
      if (!script || getCapability(script) !== 'hot-swap') continue;
      await this.applyScript(script.id, entry.code, scene, {
        startup: true,
        skipDependents: true,
        skipServerSync: true,
      });
    }
  }

  public getAppliedStoreSource(): 'server' | 'bundle' {
    return this.lastAppliedStoreSource;
  }

  public getAppliedSyncConflict(id: string): string | null {
    return this.appliedSyncConflicts.get(id) || null;
  }

  public whenReady(): Promise<void> {
    return this.readyPromise;
  }

  private seedRecordsFromMirror(): void {
    for (const cached of scriptPersistence.getCachedRecords()) {
      this.records.set(cached.id, normalizeRecord(cached, cached.id));
    }
    // Do not seed original versions before hydration: a fresh ?raw import
    // would be mistaken for the factory baseline and hide catalog changes.
  }

  private ensureRecord(script: ProjectScriptInfo): ScriptRecordData {
    let record = this.records.get(script.id);
    if (!record) {
      record = createEmptyRecord(script.id);
      this.records.set(script.id, record);
      void scriptPersistence.saveRecord(record);
    }
    return record;
  }

  private ensureOriginalVersions(): void {
    for (const script of this.getScripts()) {
      const existing = this.versionsByScript.get(script.id) || [];
      if (!existing.some((v) => v.kind === 'original')) {
        const original: ScriptVersionData = {
          id: `original-${script.id}`,
          scriptId: script.id,
          timestamp: 0,
          label: 'Versão Original de Fábrica',
          code: script.originalSource,
          hash: sourceHash(script.originalSource),
          kind: 'original',
        };
        this.versionsByScript.set(script.id, [original, ...existing]);
        void scriptPersistence.saveVersion(original);
      }
    }
  }

  private reloadVersions(): void {
    this.versionsByScript.clear();
    for (const script of this.getScripts()) {
      this.versionsByScript.set(
        script.id,
        scriptPersistence
          .getCachedVersions(script.id)
          .filter((v, index, list) => list.findIndex((x) => x.id === v.id) === index)
      );
    }
    this.ensureOriginalVersions();
  }

  private loadPersistedCatalog(): void {
    try {
      const deletedRaw = localStorage.getItem(DELETED_SCRIPTS_KEY);
      if (deletedRaw) this.deletedScriptIds = new Set(JSON.parse(deletedRaw));
      const customRaw = localStorage.getItem(CUSTOM_SCRIPTS_KEY);
      if (customRaw) this.customScripts = JSON.parse(customRaw);
    } catch {
      // Corrupt catalog metadata must not prevent the engine from starting.
    }
  }

  private buildAliasMap(): void {
    this.aliasToScriptId.clear();
    for (const script of [...PROJECT_SCRIPTS, ...this.customScripts]) {
      const fileBase = script.filePath.split('/').pop() || script.id;
      this.aliasToScriptId.set(normalizeKey(script.id), script.id);
      this.aliasToScriptId.set(normalizeKey(fileBase.replace(/\.(ts|tsx|js|jsx)$/i, '')), script.id);
      this.aliasToScriptId.set(normalizeKey(script.name), script.id);
    }
    this.rebuildDependencyGraph();
  }

  /**
   * Reverse dependency graph: "when module X changes, module Y must be
   * reinstalled". Built from the catalog `dependencies` plus semantic edges
   * that are not expressed as imports.
   */
  private rebuildDependencyGraph(): void {
    this.dependentGraph.clear();
    const addEdge = (dependencyId: string, dependentId: string) => {
      if (!dependencyId || !dependentId || dependencyId === dependentId) return;
      const current = this.dependentGraph.get(dependencyId) ?? [];
      if (!current.includes(dependentId)) {
        current.push(dependentId);
        this.dependentGraph.set(dependencyId, current);
      }
    };

    for (const script of [...PROJECT_SCRIPTS, ...this.customScripts]) {
      for (const dependencyName of script.dependencies ?? []) {
        const dependencyId = this.aliasToScriptId.get(normalizeKey(dependencyName));
        if (dependencyId) addEdge(dependencyId, script.id);
      }
    }
    for (const [dependencyId, dependents] of Object.entries(EXTRA_DEPENDENTS)) {
      for (const dependentId of dependents) addEdge(dependencyId, dependentId);
    }
  }

  public setGameScene(scene: unknown): void {
    this.activeGameScene = scene;
  }

  public getGameScene(): unknown {
    return this.activeGameScene;
  }

  public requestPowerSet(powerSet: 'ironman' | 'agatha' | 'vision'): void {
    this.onPowerSetRequested?.(powerSet);
  }

  public isEngineReady(): boolean {
    return this.isReady;
  }

  public getScripts(category?: ScriptCategory): ProjectScriptInfo[] {
    const all = [...PROJECT_SCRIPTS, ...this.customScripts].filter(
      (s) => !this.deletedScriptIds.has(s.id)
    );
    return category ? all.filter((s) => s.category === category) : all;
  }

  public getScriptById(id: string): ProjectScriptInfo | undefined {
    return this.getScripts().find((s) => s.id === id);
  }

  private getRecord(id: string): ScriptRecordData {
    const script = this.getScriptById(id);
    if (script) return this.ensureRecord(script);
    let record = this.records.get(id);
    if (!record) {
      record = createEmptyRecord(id);
      this.records.set(id, record);
    }
    return record;
  }

  public getDraft(id: string): string {
    const script = this.getScriptById(id);
    const record = this.records.get(id);
    return (
      record?.draft ??
      record?.applied ??
      record?.saved ??
      script?.originalSource ??
      ''
    );
  }

  /**
   * Autosaves the working draft. This never upgrades the draft to "applied".
   */
  public saveDraft(id: string, code: string): void {
    const script = this.getScriptById(id);
    if (!script) return;
    const record = this.getRecord(id);
    if (record.draft === code) return;
    record.draft = code;
    record.revision += 1;
    record.updatedAt = Date.now();
    this.persistRecord(record);
    try {
      localStorage.setItem(`script_draft_${id}`, code);
    } catch {
      // Mirror only.
    }
    this.notify();
  }

  /**
   * Explicit "Salvar" action. Persists the draft but does not execute it.
   */
  public saveScriptDraft(id: string, code: string): CompileResult {
    const script = this.getScriptById(id);
    if (!script) return { success: false, message: 'Script não encontrado.' };
    const record = this.getRecord(id);
    const changed = record.saved !== code;
    record.draft = code;
    record.saved = code;
    record.revision += 1;
    record.updatedAt = Date.now();
    this.persistRecord(record);
    if (changed) {
      this.addVersion(
        id,
        code,
        `Versão salva (${new Date().toLocaleTimeString('pt-BR')})`,
        'saved'
      );
    }
    try {
      localStorage.setItem(`script_draft_${id}`, code);
    } catch {
      // Mirror only.
    }
    this.notify();
    return {
      success: true,
      message: 'Rascunho salvo. Ele ainda não está em execução; use Aplicar no Jogo.',
      applied: false,
    };
  }

  private persistRecord(record: ScriptRecordData): void {
    this.records.set(record.id, record);
    void scriptPersistence.saveRecord(record);
  }

  private recordError(id: string, type: ScriptErrorType, message: string, line?: number, column?: number, hint?: string): ScriptDiagnostic {
    const diagnostic: ScriptDiagnostic = { type, message, line, column, hint, file: this.getScriptById(id)?.filePath };
    this.statusErrors.set(id, diagnostic);
    const record = this.getRecord(id);
    record.error = { type, message, line, column, hint, at: Date.now() };
    record.updatedAt = Date.now();
    this.persistRecord(record);
    this.notify();
    return diagnostic;
  }

  private clearError(id: string): void {
    this.statusErrors.delete(id);
    const record = this.getRecord(id);
    if (record.error) {
      record.error = null;
      record.updatedAt = Date.now();
      this.persistRecord(record);
    }
  }

  public getBackups(id: string): WorkingBackup[] {
    return (this.versionsByScript.get(id) || []).map((v) => ({
      id: v.id,
      timestamp: v.timestamp,
      label: v.label,
      code: v.code,
      kind: v.kind,
    }));
  }

  public getScriptStatus(
    id: string
  ): { status: ScriptStatus; error: string | null; line: number | null; column: number | null } {
    const state = this.getScriptState(id);
    return {
      status: state.status,
      error: state.error?.message || null,
      line: state.error?.line ?? null,
      column: state.error?.column ?? null,
    };
  }

  public getScriptState(id: string): ScriptLifecycleState {
    const script = this.getScriptById(id);
    const record = this.getRecord(id);
    const original = script?.originalSource || '';
    const draft = record.draft ?? record.applied ?? record.saved ?? original;
    const running =
      this.activeGameScene && this.runningNow.has(id) ? record.running : null;
    const hasUnappliedChanges = !!record.applied && record.applied !== draft;
    const hasDraftChanges = draft !== original;

    let status: ScriptStatus = 'pending';
    if (record.error) {
      status = 'error';
    } else if (running && record.runningHash && record.runningHash === record.appliedHash) {
      status = 'applied';
    } else if (record.applied) {
      status = 'pending';
    }

    let lifecycle: ScriptLifecycleState['lifecycle'] = 'original';
    if (record.error) lifecycle = 'error';
    else if (running) lifecycle = 'running';
    else if (record.applied) lifecycle = 'applied';
    else if (record.validated && record.validated === draft) lifecycle = 'validated';
    else if (record.saved && record.saved === draft) lifecycle = 'saved';
    else if (draft !== original) lifecycle = 'draft';

    return {
      id,
      status,
      lifecycle,
      originalSource: original,
      draftSource: draft,
      savedSource: record.saved,
      validatedSource: record.validated,
      appliedSource: record.applied,
      runningSource: running,
      exportedSource: record.exported,
      lastWorkingSource: record.lastWorking,
      hasDraftChanges,
      hasUnappliedChanges,
      appliedHash: record.appliedHash,
      runningHash: running ? record.runningHash : null,
      exportedHash: record.exportedHash,
      exportedAt: record.exportedAt,
      error: record.error,
      revision: record.revision,
      updatedAt: record.updatedAt,
      capability: getCapability(script),
    };
  }

  private enqueue<T>(id: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.operationQueues.get(id) || Promise.resolve();
    const next = previous.then(operation, operation);
    this.operationQueues.set(
      id,
      next.then(
        () => undefined,
        () => undefined
      )
    );
    return next;
  }

  /**
   * Static validation: syntax, dependency resolution and exported interface.
   * It never evaluates the module and never touches the running game.
   */
  public async validateScript(id: string, code: string): Promise<CompileResult> {
    await this.readyPromise;
    const script = this.getScriptById(id);
    if (!script) return { success: false, message: 'Script não encontrado.' };

    const compiled = this.compileSource(id, code, false);
    if (!compiled.success) {
      this.recordError(id, compiled.diagnostic.type, compiled.diagnostic.message, compiled.diagnostic.line, compiled.diagnostic.column, compiled.diagnostic.hint);
      return {
        success: false,
        message: compiled.diagnostic.message,
        error: compiled.diagnostic.message,
        line: compiled.diagnostic.line,
        column: compiled.diagnostic.column,
        diagnostics: [compiled.diagnostic],
        applied: false,
        validated: false,
      };
    }

    const record = this.getRecord(id);
    const hash = sourceHash(code);
    const changed = record.validatedHash !== hash;
    record.validated = code;
    record.validatedHash = hash;
    record.validatedAt = Date.now();
    record.revision += 1;
    record.updatedAt = Date.now();
    this.clearError(id);
    this.persistRecord(record);
    if (changed) {
      this.addVersion(
        id,
        code,
        `Versão validada (${new Date().toLocaleTimeString('pt-BR')})`,
        'validated'
      );
    }
    this.notify();

    return {
      success: true,
      message: 'Sintaxe, dependências e contrato do módulo validados. Nada foi alterado no jogo.',
      validated: true,
      applied: false,
      diagnostics: [],
    };
  }

  public getEffectiveSource(id: string): string {
    const record = this.getRecord(id);
    return record.applied || this.getScriptById(id)?.originalSource || '';
  }

  public getRunningSource(id: string): string | null {
    return this.getRecord(id).running;
  }

  public async applyAllSavedScripts(gameScene?: unknown): Promise<void> {
    await this.readyPromise;
    const scene = gameScene || this.activeGameScene;
    if (!scene || typeof scene !== 'object') return;
    if (this.rehydratedScenes.has(scene)) return;
    this.rehydratedScenes.add(scene);

    const scripts = this.getScripts()
      .filter((s) => getCapability(s) === 'hot-swap')
      .sort((a, b) => (APPLY_ORDER[a.category] ?? 99) - (APPLY_ORDER[b.category] ?? 99));

    for (const script of scripts) {
      const record = this.getRecord(script.id);
      const applied = record.applied;
      if (!applied) continue;

      const result = await this.applyScript(script.id, applied, scene, {
        startup: true,
        skipServerSync: true,
        versionKind: 'applied',
        versionLabel: `Reaplicado na inicialização (${new Date().toLocaleTimeString('pt-BR')})`,
      });

      if (!result.success && record.lastWorking && record.lastWorking !== applied) {
        const fallback = await this.applyScript(script.id, record.lastWorking, scene, {
          startup: true,
          skipDependents: true,
          skipServerSync: true,
        });
        if (fallback.success) {
          const err = record.error;
          const fallbackRecord = this.getRecord(script.id);
          fallbackRecord.running = record.lastWorking;
          fallbackRecord.runningHash = sourceHash(record.lastWorking);
          fallbackRecord.runningAt = Date.now();
          fallbackRecord.error = err;
          this.persistRecord(fallbackRecord);
        }
      }
    }
    this.notify();
  }

  /**
   * Compiles and applies a source. Compile/integration failures leave the
   * previous applied/running/last-working versions untouched.
   */
  public async compileAndApply(
    id: string,
    code: string,
    gameScene?: unknown,
    isStartupRehydration: boolean = false
  ): Promise<CompileResult> {
    await this.readyPromise;
    const scene = gameScene || this.activeGameScene;
    return this.applyScript(id, code, scene, { startup: isStartupRehydration });
  }

  /**
   * Validates and records an applied version for modules that cannot be
   * hot-swapped. The source becomes the main source for the next build while
   * the currently running game remains untouched.
   */
  public async applyForRestart(id: string, code: string): Promise<CompileResult> {
    await this.readyPromise;
    return this.enqueue(id, async () => {
      const script = this.getScriptById(id);
      if (!script) return { success: false, message: 'Script não encontrado.' };
      const capability = getCapability(script);
      if (capability !== 'restart-required') {
        return {
          success: false,
          message:
            capability === 'read-only'
              ? 'Este módulo é somente leitura.'
              : 'Este módulo aceita hot-swap; use Aplicar no Jogo.',
          capability,
        };
      }

      const compiled = this.compileSource(id, code, false);
      if (!compiled.success) {
        const d = compiled.diagnostic;
        this.recordError(id, d.type, d.message, d.line, d.column, d.hint);
        return {
          success: false,
          message: d.message,
          error: d.message,
          line: d.line,
          column: d.column,
          diagnostics: [d],
          applied: false,
          requiresRestart: true,
          capability,
        };
      }

      const record = this.getRecord(id);
      const hash = sourceHash(code);
      const changed = record.applied !== code;
      record.draft = code;
      record.saved = code;
      record.validated = code;
      record.validatedHash = hash;
      record.validatedAt = Date.now();
      record.applied = code;
      record.appliedHash = hash;
      record.appliedAt = Date.now();
      record.running = null;
      record.runningHash = null;
      record.runningAt = null;
      record.revision += 1;
      record.updatedAt = Date.now();
      record.error = null;
      this.runningNow.delete(id);
      this.statusErrors.delete(id);
      this.persistRecord(record);
      try {
        localStorage.setItem(`script_applied_${id}`, code);
        localStorage.setItem(`script_source_${id}`, code);
        localStorage.setItem(`script_draft_${id}`, code);
      } catch {
        // IndexedDB remains authoritative.
      }
      if (changed) {
        this.addVersion(
          id,
          code,
          `Aplicada para o próximo reinício (${new Date().toLocaleTimeString('pt-BR')})`,
          'applied'
        );
      }
      const sync = await this.persistAppliedVersion(script, record, code);
      this.notify();
      return {
        success: true,
        message:
          'Versão validada e aplicada para o próximo build/reinício. Ela ainda não está em execução nesta sessão.',
        applied: true,
        running: false,
        validated: true,
        requiresRestart: true,
        syncWarning: sync.conflict ? sync.message : undefined,
        capability,
      };
    });
  }

  private async persistAppliedVersion(
    script: ProjectScriptInfo,
    record: ScriptRecordData,
    code: string
  ): Promise<{ ok: boolean; conflict?: boolean; message?: string }> {
    const result = await persistAppliedScript({
      id: script.id,
      name: script.name,
      filePath: script.filePath,
      code,
      hash: sourceHash(code),
      appliedAt: record.appliedAt || Date.now(),
      revision: record.revision,
      requiresRestart: getCapability(script) === 'restart-required',
      updatedAt: record.updatedAt,
      script: script.isUserCreated ? { ...script } : undefined,
    });
    if (result.conflict) {
      this.appliedSyncConflicts.set(
        script.id,
        result.message || 'Outra aba aplicou uma versão diferente.'
      );
    }
    return { ok: result.ok, conflict: result.conflict, message: result.message };
  }

  private async applyScript(
    id: string,
    code: string,
    scene: unknown,
    options: ApplyOptions
  ): Promise<CompileResult> {
    return this.enqueue(id, async () => {
      const script = this.getScriptById(id);
      if (!script) return { success: false, message: 'Script não encontrado.' };

      const capability = getCapability(script);
      if (capability !== 'hot-swap') {
        const message =
          capability === 'read-only'
            ? 'Este módulo é somente leitura e não pode ser aplicado em tempo de execução.'
            : 'Este módulo estrutural exige reinicialização completa do jogo e não pode ser aplicado ao vivo.';
        // A structural edit is not a compile error: keep the draft durable and
        // leave the previously running module untouched instead of painting the
        // editor red as if the user had written invalid code.
        if (capability === 'restart-required') {
          this.clearError(id);
          this.saveDraft(id, code);
        }
        return {
          success: false,
          message,
          error: message,
          diagnostics: [
            {
              type: 'integration',
              message,
              file: script.filePath,
              hint:
                capability === 'restart-required'
                  ? 'O rascunho foi salvo. Reinicie o jogo para executar este módulo estrutural.'
                  : 'Este módulo não é editável em tempo de execução.',
            },
          ],
          applied: false,
          capability,
        };
      }

      const token = (this.applyTokens.get(id) || 0) + 1;
      this.applyTokens.set(id, token);

      const compiled = this.compileSource(id, code, true);
      if (!compiled.success) {
        const d = compiled.diagnostic;
        this.recordError(id, d.type, d.message, d.line, d.column, d.hint);
        return {
          success: false,
          message: d.message,
          error: d.message,
          line: d.line,
          column: d.column,
          diagnostics: [d],
          applied: false,
          capability,
        };
      }

      let integration: { note: string; runningSource?: string };
      try {
        integration = await this.integrate(id, compiled.moduleExports, scene, options);
      } catch (err) {
        const message = (err as Error).message || 'Falha de integração com o jogo.';
        const diagnostic = this.recordError(
          id,
          'integration',
          message,
          undefined,
          undefined,
          'A versão anterior continua sendo a última versão funcional. Corrija a integração e aplique novamente.'
        );
        return {
          success: false,
          message: `Falha ao integrar no jogo: ${message}`,
          error: message,
          diagnostics: [diagnostic],
          applied: false,
          capability,
        };
      }

      // Only after a successful integration does this source become official.
      this.compiledModules.set(id, compiled.moduleExports);
      const record = this.getRecord(id);
      const hash = sourceHash(code);
      record.draft = code;
      record.saved = code;
      record.validated = code;
      record.validatedHash = hash;
      record.validatedAt = Date.now();
      record.applied = code;
      record.appliedHash = hash;
      record.appliedAt = Date.now();
      record.running = integration.runningSource ?? code;
      record.runningHash = sourceHash(record.running);
      record.runningAt = Date.now();
      record.lastWorking = record.running;
      record.lastWorkingHash = record.runningHash;
      this.runningNow.add(id);
      record.revision += 1;
      record.updatedAt = Date.now();
      record.error = null;
      this.statusErrors.delete(id);
      this.persistRecord(record);

      const sync = options.skipServerSync
        ? { ok: true, conflict: false as const, message: undefined }
        : await this.persistAppliedVersion(script, record, code);

      try {
        localStorage.setItem(`script_applied_${id}`, code);
        localStorage.setItem(`script_source_${id}`, code);
        localStorage.setItem(`script_draft_${id}`, code);
      } catch {
        // IndexedDB remains authoritative.
      }

      if (!options.startup) {
        this.addVersion(id, code, options.versionLabel || `Versão aplicada (${new Date().toLocaleTimeString('pt-BR')})`, options.versionKind || 'applied');
      }

      if (!options.skipDependents) {
        await this.reapplyDependents(id, scene, !!options.startup);
      }

      this.notify();
      if (integration.note) {
        // The note is part of the result, not a substitute for the applied flag.
      }

      return {
        success: true,
        message: `Compilado, integrado e em execução. ${integration.note}${
          sync.conflict ? ` Atenção: ${sync.message}` : ''
        }`.trim(),
        applied: true,
        running: true,
        validated: true,
        syncWarning: sync.conflict ? sync.message : undefined,
        capability,
        diagnostics: [],
      };
    });
  }

  private addVersion(id: string, code: string, label: string, kind: ScriptVersionKind): void {
    const version: ScriptVersionData = {
      id: `${kind}-${id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      scriptId: id,
      timestamp: Date.now(),
      label,
      code,
      hash: sourceHash(code),
      kind,
    };
    const list = [version, ...(this.versionsByScript.get(id) || [])];
    this.versionsByScript.set(id, list.slice(0, 40));
    void scriptPersistence.saveVersion(version);
  }

  private compileSource(
    id: string,
    code: string,
    execute: boolean
  ): { success: true; compiledJs: string; moduleExports: Record<string, unknown> } | { success: false; diagnostic: ScriptDiagnostic } {
    let compiledJs = '';
    try {
      compiledJs = transform(code, {
        transforms: ['typescript', 'jsx', 'imports'],
        jsxPragma: 'React.createElement',
        jsxFragmentPragma: 'React.Fragment',
        filePath: `${id}.tsx`,
      }).code;
    } catch (e: unknown) {
      const err = e as { message?: string; loc?: { line: number; column: number } };
      const line = err.loc?.line || 1;
      const column = err.loc?.column || 1;
      const cleanMsg = err.message
        ? err.message.replace(/^[a-zA-Z0-9_\-./\\]+:\s*/, '')
        : 'Erro de sintaxe';
      return {
        success: false,
        diagnostic: {
          type: 'syntax',
          message: `Erro de sintaxe (linha ${line}, coluna ${column}): ${cleanMsg}`,
          file: this.getScriptById(id)?.filePath,
          line,
          column,
          hint: 'Revise a linha indicada. O código anterior continua preservado.',
        },
      };
    }

    // `import.meta` is not valid inside the Function-based module sandbox.
    // AudioSystem (and user scripts) may use it, so route it to real values.
    compiledJs = compiledJs
      .replace(/\bimport\.meta\.env\b/g, '__runtimeImportMetaEnv')
      .replace(/\bimport\.meta\.url\b/g, '__runtimeImportMetaUrl');

    const dependencyError = this.validateDependencies(compiledJs);
    if (dependencyError) {
      return {
        success: false,
        diagnostic: { ...dependencyError, file: this.getScriptById(id)?.filePath },
      };
    }

    if (!execute) {
      const available = moduleExportNames(compiledJs);
      const expected = EXPECTED_EXPORTS[id];
      if (expected && expected.length > 0 && !expected.some((name) => available.has(name))) {
        return {
          success: false,
          diagnostic: {
            type: 'integration',
            message: `Contrato do módulo inválido: nenhum export esperado foi encontrado (${expected.join(', ')}).`,
            file: this.getScriptById(id)?.filePath,
            hint: 'Mantenha a assinatura pública original para permitir a integração com a engine.',
          },
        };
      }
      return { success: true, compiledJs, moduleExports: {} };
    }

    try {
      const moduleExports: Record<string, unknown> = {};
      const moduleObj = { exports: moduleExports };
      // Reserved parameter names must not collide with identifiers declared by
      // the module itself (GameplayRestrictions declares `gameplayRestrictions`).
      const factory = new Function(
        'exports',
        'module',
        'require',
        '__THREE',
        '__React',
        '__audioSystem',
        '__liveConfigManager',
        '__settingsManager',
        '__gameplayRestrictions',
        '__runtimeImportMetaEnv',
        '__runtimeImportMetaUrl',
        compiledJs
      );
      factory(
        moduleObj.exports,
        moduleObj,
        (specifier: string) => this.resolveDependency(specifier),
        THREE,
        React,
        audioSystem,
        liveConfigManager,
        settingsManager,
        gameplayRestrictions,
        RUNTIME_IMPORT_META_ENV,
        RUNTIME_IMPORT_META_URL
      );
      const exported = moduleObj.exports;
      const expected = EXPECTED_EXPORTS[id];
      if (expected && expected.length > 0 && !expected.some((name) => name in exported)) {
        return {
          success: false,
          diagnostic: {
            type: 'integration',
            message: `O módulo executou, mas não exporta a interface esperada (${expected.join(', ')}).`,
            file: this.getScriptById(id)?.filePath,
            hint: 'A engine não aplica módulos sem o contrato necessário.',
          },
        };
      }
      return { success: true, compiledJs, moduleExports: exported };
    } catch (e: unknown) {
      const err = e as Error;
      return {
        success: false,
        diagnostic: {
          type: 'runtime',
          message: `Erro ao avaliar o módulo: ${err.message}`,
          file: this.getScriptById(id)?.filePath,
          hint: 'Verifique dependências, nomes de export e código executado no topo do arquivo.',
        },
      };
    }
  }

  private validateDependencies(compiledJs: string): ScriptDiagnostic | null {
    const requirePattern = /require\(["']([^"']+)["']\)/g;
    const seen = new Set<string>();
    let match: RegExpExecArray | null;
    while ((match = requirePattern.exec(compiledJs)) !== null) {
      const specifier = match[1];
      if (seen.has(specifier)) continue;
      seen.add(specifier);
      if (EXTERNAL_MODULES.has(specifier) || specifier.startsWith('three/')) continue;
      const base = basenameSpecifier(specifier);
      if (RUNTIME_FACADE_MODULES.has(base)) continue;
      const targetId = this.aliasToScriptId.get(base);
      if (!targetId && specifier.startsWith('.')) {
        return {
          type: 'dependency',
          message: `Dependência local não resolvida: "${specifier}".`,
          hint: 'Importe apenas módulos do projeto que estão listados no catálogo de scripts.',
        };
      }
      if (!targetId && !specifier.startsWith('.') && !EXTERNAL_MODULES.has(specifier)) {
        return {
          type: 'dependency',
          message: `Pacote externo não suportado: "${specifier}".`,
          hint: 'A engine suporta three, react, lucide-react e os módulos internos do projeto.',
        };
      }
    }
    return null;
  }

  private agathaConfigFacade(): Record<string, unknown> {
    const facade: Record<string, unknown> = {
      default: activeAgathaConfig,
      updateAgathaConfig,
      resetAgathaConfig,
      mergeAgathaConfig,
      DEFAULT_AGATHA_CONFIG,
    };
    Object.defineProperty(facade, 'activeAgathaConfig', {
      enumerable: true,
      get: () => activeAgathaConfig,
    });
    return facade;
  }

  private ironManConfigFacade(): Record<string, unknown> {
    const facade: Record<string, unknown> = {
      default: activeIronManConfig,
      updateIronManConfig,
      resetIronManConfig,
      mergeIronManConfig,
      DEFAULT_IRONMAN_CONFIG,
    };
    Object.defineProperty(facade, 'activeIronManConfig', {
      enumerable: true,
      get: () => activeIronManConfig,
    });
    return facade;
  }

  private resolveDependency(specifier: string): unknown {
    const norm = normalizeKey(specifier);

    if (specifier === 'three' || specifier.startsWith('three/') || norm.startsWith('three')) {
      return { default: THREE, ...THREE };
    }
    if (specifier === 'react' || norm === 'react') {
      return { default: React, ...React };
    }
    if (specifier === 'lucide-react' || norm.includes('lucidereact')) {
      return { default: LucideIcons, ...LucideIcons };
    }

    const base = basenameSpecifier(specifier);
    const targetId = this.aliasToScriptId.get(base) || this.aliasToScriptId.get(norm);

    if (targetId === 'agatha-config' || base === 'agathaconfig') return this.agathaConfigFacade();
    if (targetId === 'ironman-config' || base === 'ironmanconfig') return this.ironManConfigFacade();

    // Singletons/facades must stay live: compiled copies of these modules export
    // their own instance, which would silently detach from the running game.
    if (norm.includes('audiosystem') || targetId === 'audio-system') {
      return { audioSystem, default: audioSystem };
    }
    if (norm.includes('settingsmanager') || targetId === 'settings-manager') {
      return { settingsManager, DEFAULT_SETTINGS, default: settingsManager };
    }
    if (norm.includes('liveconfigmanager') || targetId === 'live-config-manager') {
      return { liveConfigManager, DEFAULT_LIVE_CONFIG, default: liveConfigManager };
    }
    if (norm.includes('buildmodemanager') || targetId === 'build-mode-manager') {
      return { BuildModeManager, default: BuildModeManager };
    }
    if (norm.includes('scriptruntimeengine')) {
      return { scriptRuntimeEngine: this, default: this };
    }
    if (norm.includes('gameplayrestrictions') || targetId === 'gameplay-restrictions') {
      return { gameplayRestrictions, GameplayRestrictionsManager, default: gameplayRestrictions };
    }
    if (norm.includes('worldcollision') || targetId === 'world-collision') {
      return {
        WorldCollision: this.effectiveWorldCollisionClass,
        worldCollision,
        default: worldCollision,
      };
    }

    if (targetId && this.compiledModules.has(targetId)) {
      return this.compiledModules.get(targetId)!;
    }

    if (norm.includes('soundsystem') || targetId === 'sound-system') {
      return { soundSystem, audioSystem, default: soundSystem };
    }

    const defaults: Record<string, unknown> = {
      agathaarcaneblast: { AgathaArcaneBlast, default: AgathaArcaneBlast },
      agathadarkdrain: { AgathaDarkDrain, default: AgathaDarkDrain },
      agathachaosorb: { AgathaChaosOrb, default: AgathaChaosOrb },
      agatharunicward: { AgathaRunicWard, default: AgathaRunicWard },
      agathatelekineticchoke: { AgathaTelekineticChoke, default: AgathaTelekineticChoke },
      agathachoke: { AgathaTelekineticChoke, default: AgathaTelekineticChoke },
      agathashadowstep: { AgathaShadowStep, default: AgathaShadowStep },
      agathaabilities: { AgathaAbilities, default: AgathaAbilities },
      ironmanrepulsor: { IronManRepulsor, default: IronManRepulsor },
      ironmanmicromissiles: { IronManMicroMissiles, default: IronManMicroMissiles },
      ironmanunibeam: { IronManUnibeam, default: IronManUnibeam },
      ironmandualbeams: { IronManDualBeams, default: IronManDualBeams },
      ironmanbeamfx: { IronManBeamVisual, BeamClashDisk, default: IronManBeamVisual },
      worldcollision: {
        WorldCollision: this.effectiveWorldCollisionClass,
        worldCollision,
        default: worldCollision,
      },
      abilitybuttonsystem: {
        COMBAT_BUTTON_PROFILES,
        getCombatButtonProfile,
        default: getCombatButtonProfile,
      },
      audiomanifest: {
        AUDIO_MANIFEST: audioSystem.getAudioManifest(),
        LOOP_AUDIO_KEYS,
        default: AUDIO_MANIFEST,
      },
      buildmodedefaults: { BUILD_MODE_SCENE, default: BUILD_MODE_SCENE },
      ironmanspinninglasers: { IronManSpinningLasers, default: IronManSpinningLasers },
      ironmanabilities: { IronManAbilities, default: IronManAbilities },
      dealdamagesystem: { DealDamageSystem, default: DealDamageSystem },
      flightsystem: { FlightSystem, default: FlightSystem },
      cooldownsystem: { CooldownSystem, default: CooldownSystem },
      movementsystem: { MovementSystem, default: MovementSystem },
      targetdummy: { TargetDummy, default: TargetDummy },
      stickmanrig: { createStickmanRig, default: createStickmanRig },
      animationcontroller: { AnimationController, default: AnimationController },
      projectilesystem: { ProjectileSystem, default: ProjectileSystem },
      combatbuttons: { CombatButtons, default: CombatButtons },
      virtualjoystick: { VirtualJoystick, default: VirtualJoystick },
      aimreticle: { AimReticle, default: AimReticle },
      powerselectmodal: { PowerSelectModal, default: PowerSelectModal },
      settingsmodal: { SettingsModal, default: SettingsModal },
    };
    if (defaults[base]) return defaults[base];

    // Any already-applied custom script can be imported by another script.
    for (const [id, exports] of this.compiledModules.entries()) {
      if (normalizeKey(id) === base) return exports;
    }
    return {};
  }

  private pickClass(moduleExports: Record<string, unknown>, names: string[]): any {
    for (const name of names) {
      const value = moduleExports[name];
      if (typeof value === 'function') return value;
    }
    throw new Error(`Export de classe ausente (${names.join(', ')}).`);
  }

  private pickObject(moduleExports: Record<string, unknown>, names: string[]): Record<string, unknown> | null {
    for (const name of names) {
      const value = moduleExports[name];
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        return value as Record<string, unknown>;
      }
    }
    return null;
  }

  private getAgathaCallbacks(scene: any) {
    const getAim = () => {
      if (scene.settings?.aimAssist && scene.activeTarget && !scene.activeTarget.isDead) {
        return { pos: scene.activeTarget.getCenter(), target: scene.activeTarget };
      }
      return { pos: scene.currentAimPoint.clone(), target: null };
    };
      const onDamage = (dummy: any, dmg: number, hitPos: any, kb: any) => {
        const intDmg = Math.round(dmg);
        const res = dummy.takeDamage(intDmg, hitPos, kb);
        if (res.actualDamage > 0) scene.triggerHitConfirm?.();
        const sink = scene.projectileSystem;
        if (typeof sink?.spawnDamageNumber === 'function') {
          sink.spawnDamageNumber(res.actualDamage, hitPos);
        } else if (sink?.damageNumbers && typeof sink.nextDamageId === 'number') {
          sink.damageNumbers.push({
            id: sink.nextDamageId++,
            value: Math.max(0, Math.round(Number.isFinite(res.actualDamage) ? res.actualDamage : 0)),
            worldPos: hitPos.clone().add(new THREE.Vector3(0, 0.4, 0)),
            age: 0,
            maxAge: 0.95,
          });
        }
      };
    const onShake = (amt: number) => {
      if (scene.settings?.cameraShake) scene.addCameraShake?.(amt);
    };
    return { getAim, onDamage, onShake };
  }

  private async integrate(
    id: string,
    moduleExports: Record<string, unknown>,
    scene: unknown,
    options: ApplyOptions
  ): Promise<{ note: string; runningSource?: string }> {
    const typedScene = scene as any;

    switch (id) {
      case 'agatha-config': {
        const exportedDefaults = options.startup
          ? null
          : this.pickObject(moduleExports, ['DEFAULT_AGATHA_CONFIG']);
        const exportedConfig =
          exportedDefaults || this.pickObject(moduleExports, ['activeAgathaConfig', 'default']);
        if (!exportedConfig) throw new Error('A configuração da Agatha não exporta um objeto válido.');
        if (!('arcaneBlast' in exportedConfig) || !('darkDrain' in exportedConfig)) {
          throw new Error('A configuração da Agatha não contém as seções obrigatórias.');
        }
        updateAgathaConfig(exportedConfig as any);
        return { note: 'Parâmetros da Agatha atualizados, persistidos e consumidos pelas habilidades.' };
      }
      case 'ironman-config': {
        const exportedDefaults = options.startup
          ? null
          : this.pickObject(moduleExports, ['DEFAULT_IRONMAN_CONFIG']);
        const exportedConfig =
          exportedDefaults || this.pickObject(moduleExports, ['activeIronManConfig', 'default']);
        if (!exportedConfig) throw new Error('A configuração do Homem de Ferro não exporta um objeto válido.');
        if (!('repulsor' in exportedConfig) || !('unibeam' in exportedConfig)) {
          throw new Error('A configuração do Homem de Ferro não contém as seções obrigatórias.');
        }
        updateIronManConfig(exportedConfig as any);
        return { note: 'Parâmetros do Homem de Ferro atualizados, persistidos e consumidos pelas armas.' };
      }
      case 'agatha-arcane-blast': {
        if (!typedScene) throw new Error('Cena do jogo indisponível.');
        const BlastClass = this.pickClass(moduleExports, ['AgathaArcaneBlast', 'default']);
        const agatha = typedScene.agathaAbilities;
        if (!agatha) throw new Error('Controlador da Agatha não inicializado.');
        const { getAim, onDamage, onShake } = this.getAgathaCallbacks(typedScene);
        const candidate = new BlastClass(typedScene.scene, typedScene.stickman, getAim, onDamage, onShake);
        candidate.onArcaneCast = (hand: 'left' | 'right', aimPitch: number) => typedScene.animController?.triggerRepulsor(hand, aimPitch);
        agatha.arcaneBlastModule?.dispose?.();
        agatha.arcaneBlastModule = candidate;
        return { note: 'Rajada Arcana instalada no controlador ativo.' };
      }
      case 'agatha-dark-drain': {
        if (!typedScene) throw new Error('Cena do jogo indisponível.');
        const DrainClass = this.pickClass(moduleExports, ['AgathaDarkDrain', 'default']);
        const agatha = typedScene.agathaAbilities;
        if (!agatha) throw new Error('Controlador da Agatha não inicializado.');
        const { onDamage, onShake } = this.getAgathaCallbacks(typedScene);
        const candidate = new DrainClass(typedScene.scene, typedScene.stickman, onDamage, onShake);
        agatha.darkDrainModule?.dispose?.();
        agatha.darkDrainModule = candidate;
        return { note: 'Dreno Sombrio instalado no controlador ativo.' };
      }
      case 'agatha-chaos-orb': {
        if (!typedScene) throw new Error('Cena do jogo indisponível.');
        const OrbClass = this.pickClass(moduleExports, ['AgathaChaosOrb', 'default']);
        const agatha = typedScene.agathaAbilities;
        if (!agatha) throw new Error('Controlador da Agatha não inicializado.');
        const { getAim, onDamage, onShake } = this.getAgathaCallbacks(typedScene);
        const candidate = new OrbClass(typedScene.scene, typedScene.stickman, getAim, onDamage, onShake);
        agatha.chaosOrbModule?.dispose?.();
        agatha.chaosOrbModule = candidate;
        return { note: 'Orbe do Caos instalado no controlador ativo.' };
      }
      case 'agatha-runic-ward': {
        if (!typedScene) throw new Error('Cena do jogo indisponível.');
        const WardClass = this.pickClass(moduleExports, ['AgathaRunicWard', 'default']);
        const agatha = typedScene.agathaAbilities;
        if (!agatha) throw new Error('Controlador da Agatha não inicializado.');
        const { onShake } = this.getAgathaCallbacks(typedScene);
        const candidate = new WardClass(typedScene.scene, typedScene.stickman, onShake);
        agatha.runicWardModule?.dispose?.();
        agatha.runicWardModule = candidate;
        return { note: 'Escudo Rúnico instalado no controlador ativo.' };
      }
      case 'agatha-choke': {
        if (!typedScene) throw new Error('Cena do jogo indisponível.');
        const ChokeClass = this.pickClass(moduleExports, ['AgathaTelekineticChoke', 'default']);
        const agatha = typedScene.agathaAbilities;
        if (!agatha) throw new Error('Controlador da Agatha não inicializado.');
        const { getAim, onDamage, onShake } = this.getAgathaCallbacks(typedScene);
        const candidate = new ChokeClass(typedScene.scene, typedScene.stickman, getAim, onDamage, onShake);
        agatha.chokeModule?.dispose?.();
        agatha.chokeModule = candidate;
        return { note: 'Estrangulamento Telecinético instalado no controlador ativo.' };
      }
      case 'agatha-shadow-step': {
        if (!typedScene) throw new Error('Cena do jogo indisponível.');
        const StepClass = this.pickClass(moduleExports, ['AgathaShadowStep', 'default']);
        const agatha = typedScene.agathaAbilities;
        if (!agatha) throw new Error('Controlador da Agatha não inicializado.');
        const { onShake } = this.getAgathaCallbacks(typedScene);
        const candidate = new StepClass(typedScene.scene, onShake);
        agatha.shadowStepModule?.dispose?.();
        agatha.shadowStepModule = candidate;
        return { note: 'Passo das Sombras instalado no controlador ativo.' };
      }
      case 'agatha-abilities': {
        if (!typedScene) throw new Error('Cena do jogo indisponível.');
        const AgathaClass = this.pickClass(moduleExports, ['AgathaAbilities', 'default']);
        typedScene.updateAgathaAbilities?.(AgathaClass);
        if (!typedScene.agathaAbilities) throw new Error('A nova classe não produziu um controlador válido.');
        return { note: 'Controlador da Agatha substituído no jogo.' };
      }
      case 'ironman-repulsor': {
        if (!typedScene) throw new Error('Cena do jogo indisponível.');
        const script = this.getScriptById(id);
        if (script && this.getRecord(id).applied === undefined) {
          // no-op; kept for clarity
        }
        const RepulsorClass = this.pickClass(moduleExports, ['IronManRepulsor', 'default']);
        typedScene.installIronManAbilityModule?.('repulsor', RepulsorClass);
        return { note: 'Repulsor instalado no controlador ativo do Homem de Ferro.' };
      }
      case 'ironman-micro-missiles': {
        if (!typedScene) throw new Error('Cena do jogo indisponível.');
        const MissileClass = this.pickClass(moduleExports, ['IronManMicroMissiles', 'default']);
        typedScene.installIronManAbilityModule?.('micro-missiles', MissileClass);
        return { note: 'Micro-mísseis instalados no controlador ativo.' };
      }
      case 'ironman-unibeam': {
        if (!typedScene) throw new Error('Cena do jogo indisponível.');
        const UnibeamClass = this.pickClass(moduleExports, ['IronManUnibeam', 'default']);
        typedScene.installIronManAbilityModule?.('unibeam', UnibeamClass);
        return { note: 'Unibeam instalado no controlador ativo.' };
      }
      case 'ironman-dual-beams': {
        if (!typedScene) throw new Error('Cena do jogo indisponível.');
        const DualBeamsClass = this.pickClass(moduleExports, ['IronManDualBeams', 'default']);
        typedScene.installIronManAbilityModule?.('dual-beams', DualBeamsClass);
        return { note: 'Feixes duplos e Beam Clash instalados no controlador ativo.' };
      }
      case 'ironman-spinning-lasers': {
        if (!typedScene) throw new Error('Cena do jogo indisponível.');
        const SpinningClass = this.pickClass(moduleExports, ['IronManSpinningLasers', 'default']);
        typedScene.installIronManAbilityModule?.('spinning-lasers', SpinningClass);
        return { note: 'Lasers giratórios instalados no controlador ativo.' };
      }
      case 'deal-damage-system': {
        if (!typedScene) throw new Error('Cena do jogo indisponível.');
        const DamageClass = this.pickClass(moduleExports, ['DealDamageSystem', 'default']);
        typedScene.updateDealDamageSystem?.(DamageClass);
        return { note: 'Pipeline central de dano substituído no jogo ativo.' };
      }
      case 'ironman-abilities': {
        if (!typedScene) throw new Error('Cena do jogo indisponível.');
        const IronManClass = this.pickClass(moduleExports, ['IronManAbilities', 'default']);
        typedScene.updateIronManAbilities?.(IronManClass);
        if (!typedScene.ironManAbilities) throw new Error('A nova classe não produziu um controlador válido.');
        return { note: 'Controlador do Homem de Ferro substituído no jogo.' };
      }
      case 'gameplay-restrictions': {
        if (!typedScene) throw new Error('Cena do jogo indisponível.');
        const RestrictionClass =
          (moduleExports.GameplayRestrictionsManager as any) ||
          (moduleExports.default as any);
        if (typeof RestrictionClass !== 'function') {
          throw new Error('GameplayRestrictionsManager não exportado.');
        }
        typedScene.installGameplayRestrictionsClass?.(RestrictionClass);
        return { note: 'Restrições de gameplay substituídas preservando o estado ativo.' };
      }
      case 'animation-controller': {
        if (!typedScene) throw new Error('Cena do jogo indisponível.');
        const AnimClass = this.pickClass(moduleExports, ['AnimationController', 'default']);
        typedScene.updateAnimationController?.(AnimClass);
        return { note: 'Controlador de animações substituído após teste de execução.' };
      }
      case 'projectile-system': {
        if (!typedScene) throw new Error('Cena do jogo indisponível.');
        const ProjectileClass = this.pickClass(moduleExports, ['ProjectileSystem', 'default']);
        typedScene.updateProjectileSystem?.(ProjectileClass);
        return { note: 'Sistema de projéteis substituído no loop ativo.' };
      }
      case 'target-dummy': {
        if (!typedScene) throw new Error('Cena do jogo indisponível.');
        const DummyClass = this.pickClass(moduleExports, ['TargetDummy', 'default']);
        typedScene.updateTargetDummyClass?.(DummyClass);
        return { note: 'Classe dos alvos substituída na cena ativa.' };
      }
      case 'combat-buttons':
      case 'virtual-joystick':
      case 'aim-reticle':
      case 'power-select-modal':
      case 'settings-modal':
      case 'orientation-guard': {
        const exportNames: Record<string, string[]> = {
          'combat-buttons': ['CombatButtons'],
          'virtual-joystick': ['VirtualJoystick'],
          'aim-reticle': ['AimReticle'],
          'power-select-modal': ['PowerSelectModal'],
          'settings-modal': ['SettingsModal'],
          'orientation-guard': ['OrientationGuard'],
        };
        const Component = this.pickClass(moduleExports, [...exportNames[id], 'default']);
        this.uiComponentRegistry.set(id, Component);
        this.notifyUi();
        return { note: 'Componente React substituído no HUD ativo.' };
      }
      case 'flight-system': {
        if (!typedScene) throw new Error('Cena do jogo indisponível.');
        if (typeof typedScene.installFlightSystem !== 'function') {
          throw new Error('A cena não expõe installFlightSystem.');
        }
        const FlightClass = this.pickClass(moduleExports, ['FlightSystem', 'default']);
        typedScene.installFlightSystem(FlightClass);
        return { note: 'Sistema de voo substituído; perfis e propulsores agora usam o código aplicado.' };
      }
      case 'movement-system': {
        if (!typedScene) throw new Error('Cena do jogo indisponível.');
        if (typeof typedScene.installMovementSystem !== 'function') {
          throw new Error('A cena não expõe installMovementSystem.');
        }
        const MovementClass = this.pickClass(moduleExports, ['MovementSystem', 'default']);
        typedScene.installMovementSystem(MovementClass);
        return { note: 'Sistema de movimento substituído no loop ativo.' };
      }
      case 'agatha-flight-config':
      case 'ironman-flight-config': {
        const agent = id === 'agatha-flight-config' ? 'Agatha' : 'Homem de Ferro';
        const profile = this.pickObject(moduleExports, [
          id === 'agatha-flight-config' ? 'AGATHA_FLIGHT_PROFILE' : 'IRONMAN_FLIGHT_PROFILE',
          'default',
        ]);
        if (!profile) throw new Error(`O perfil de voo do ${agent} não exporta um objeto válido.`);
        for (const field of ['hoverHeight', 'bankLimit']) {
          if (typeof (profile as any)[field] !== 'number' || !Number.isFinite((profile as any)[field])) {
            throw new Error(`O perfil de voo do ${agent} não define "${field}" como número.`);
          }
        }
        return {
          note: `Perfil de voo do ${agent} atualizado; o sistema de voo ativo o consome imediatamente.`,
        };
      }
      case 'cooldown-system':
        return {
          note: 'Módulo recompilado. Componentes de combate foram reinstalados para consumir o código aplicado.',
        };
      case 'ability-button-system': {
        const provider = moduleExports.getCombatButtonProfile;
        if (typeof provider !== 'function') {
          throw new Error('AbilityButtonSystem editado não exporta getCombatButtonProfile.');
        }
        installCombatButtonProfileProvider(provider as any);
        typedScene?.installCombatButtonProfileProvider?.(getCombatButtonProfile);
        return {
          note: 'Perfis de botões atualizados no HUD e na lógica de cooldown do jogo.',
        };
      }
      case 'sound-system': {
        const exported = this.pickObject(moduleExports, ['soundSystem', 'default']);
        if (exported) this.graftSingletonMethods(audioSystem, exported);
        return { note: 'Sistema de som recompilado e consumido pelo áudio ativo.' };
      }
      case 'audio-manifest': {
        const manifest = this.pickObject(moduleExports, ['AUDIO_MANIFEST', 'default']);
        if (!manifest) throw new Error('O manifesto de áudio não exporta AUDIO_MANIFEST.');
        const loopKeys = Array.isArray(moduleExports.LOOP_AUDIO_KEYS)
          ? (moduleExports.LOOP_AUDIO_KEYS as unknown[]).filter((key): key is string => typeof key === 'string')
          : undefined;
        audioSystem.applyAudioManifest(manifest as any, loopKeys);
        return { note: 'Manifesto de áudio aplicado; buffers alterados foram recarregados.' };
      }
      case 'world-collision': {
        const CollisionClass = this.pickClass(moduleExports, ['WorldCollision', 'default']);
        const candidate = new CollisionClass();
        installWorldCollisionInstance(candidate);
        this.effectiveWorldCollisionClass = CollisionClass;
        return { note: 'Sistema de colisão substituído mantendo estrutura e ward ativos.' };
      }
      case 'settings-manager':
      case 'live-config-manager': {
        const isSettings = id === 'settings-manager';
        const source = this.pickObject(moduleExports, [isSettings ? 'settingsManager' : 'liveConfigManager', 'default']);
        if (!source) throw new Error('O módulo não exporta o singleton esperado.');
        const target = isSettings ? settingsManager : liveConfigManager;
        this.graftSingletonMethods(target, source);
        return {
          note: isSettings
            ? 'SettingsManager atualizado preservando listeners e configurações ativas.'
            : 'LiveConfigManager atualizado preservando estado e listeners ativos.',
        };
      }
      case 'build-mode-manager': {
        if (!typedScene) throw new Error('Cena do jogo indisponível.');
        if (typeof typedScene.installBuildModeManager !== 'function') {
          throw new Error('A cena não expõe installBuildModeManager.');
        }
        const ManagerClass = this.pickClass(moduleExports, ['BuildModeManager', 'default']);
        typedScene.installBuildModeManager(ManagerClass);
        return { note: 'Editor de cenário substituído preservando objetos, callbacks e persistência.' };
      }
      case 'ironman-beam-fx':
        return {
          note: 'Efeitos de feixe atualizados; feixes e discos de clash ativos foram reinstalados.',
        };
      case 'stickman-rig': {
        if (!typedScene) throw new Error('Cena do jogo indisponível.');
        if (typeof typedScene.updateStickmanRig !== 'function') {
          throw new Error('A cena não expõe updateStickmanRig.');
        }
        const rigFactory = this.pickClass(moduleExports, ['createStickmanRig', 'default']);
        typedScene.updateStickmanRig(rigFactory);
        await this.rebindCharacterToRig(typedScene);
        return {
          note: 'Estrutura do personagem reconstruída; controladores e habilidades foram religados sem trocar o herói ativo.',
        };
      }
      case 'audio-system': {
        const exported = this.pickObject(moduleExports, ['audioSystem', 'default']);
        if (!exported) throw new Error('AudioSystem editado não exporta o singleton audioSystem.');
        this.graftSingletonMethods(audioSystem, exported);
        audioSystem.setVolume(settingsManager.get().volume / 100);
        return {
          note: 'Sistema de áudio substituído preservando contexto, buffers, loops e configurações.',
        };
      }
      case 'game-scene':
        throw new Error('Módulo estrutural: reinicialização completa necessária.');
      default: {
        // User-created scripts are supported as per-frame runtime modules.
        const onUpdate = moduleExports.onUpdate;
        if (typeof onUpdate !== 'function') {
          throw new Error(
            'Script personalizado sem contrato executável. Exporte uma função onUpdate(scene, dt) ou use um módulo do catálogo.'
          );
        }
        return { note: 'Módulo personalizado registrado no loop de atualização.' };
      }
    }
  }

  /**
   * Re-installs every already-applied module that depends on the module that
   * just changed. Uses the reverse dependency graph built from the catalog and
   * semantic edges, with `skipDependents` to avoid cycles.
   */
  private async reapplyDependents(
    moduleId: string,
    scene: unknown,
    startup = false
  ): Promise<void> {
    const forced = FORCE_DEPENDENT_REINSTALL[moduleId] ?? [];
    const ids = this.dependentGraph.get(moduleId) ?? [];
    for (const dependentId of ids) {
      if (dependentId === moduleId) continue;
      const script = this.getScriptById(dependentId);
      if (!script || getCapability(script) !== 'hot-swap') continue;
      const record = this.getRecord(dependentId);
      const customCode = !!record.applied && record.applied !== script.originalSource;
      // Some HUD modules consume a system through a static import; to make an
      // edited system actually visible they must be reinstalled even if the
      // user never edited the HUD component itself.
      const mustForce = !startup && forced.includes(dependentId);
      if (!customCode && !mustForce) continue;
      try {
        await this.applyScript(
          dependentId,
          customCode ? (record.applied as string) : script.originalSource,
          scene,
          {
            startup: true,
            skipDependents: true,
            skipServerSync: true,
          }
        );
      } catch (err) {
        console.warn(
          `[ScriptRuntimeEngine] Could not re-install dependent module ${dependentId}:`,
          err
        );
      }
    }
  }

  private effectiveClass(
    id: string,
    names: string[],
    fallback: any
  ): any {
    const exports = this.compiledModules.get(id);
    if (exports) {
      for (const name of names) {
        if (typeof exports[name] === 'function') return exports[name];
      }
    }
    return fallback;
  }

  private graftSingletonMethods(target: any, source: Record<string, unknown>): void {
    const prototype = Object.getPrototypeOf(source);
    if (prototype && prototype !== Object.prototype) {
      for (const name of Object.getOwnPropertyNames(prototype)) {
        if (name === 'constructor') continue;
        const descriptor = Object.getOwnPropertyDescriptor(prototype, name);
        if (!descriptor) continue;
        try {
          Object.defineProperty(target, name, descriptor);
        } catch {
          // Non-configurable members keep the live implementation.
        }
      }
    }
    for (const [key, value] of Object.entries(source)) {
      if (typeof value === 'function') {
        try {
          (target as Record<string, unknown>)[key] = value;
        } catch {
          // Keep the running method when it cannot be replaced.
        }
        continue;
      }
      // Newly added fields are copied; existing state (context, buffers,
      // settings, listeners) is preserved to keep the running singleton alive.
      if (!(key in (target as object))) {
        try {
          (target as Record<string, unknown>)[key] = value;
        } catch {
          // Read-only additions cannot be applied.
        }
      }
    }
  }

  /**
   * Rebuilds the character rig wiring after a StickmanRig swap: controllers,
   * animation controller and every independently applied ability module are
   * rebound to the new nodes without changing the active hero.
   */
  private async rebindCharacterToRig(scene: any): Promise<void> {
    const powerSet: 'agatha' | 'ironman' | 'vision' =
      scene.currentPowerSet === 'agatha'
        ? 'agatha'
        : scene.currentPowerSet === 'vision'
        ? 'vision'
        : 'ironman';

    const agathaClass = this.effectiveClass(
      'agatha-abilities',
      ['AgathaAbilities', 'default'],
      AgathaAbilities
    );
    const ironManClass = this.effectiveClass(
      'ironman-abilities',
      ['IronManAbilities', 'default'],
      IronManAbilities
    );
    const animClass = this.effectiveClass(
      'animation-controller',
      ['AnimationController', 'default'],
      AnimationController
    );

    scene.updateAgathaAbilities?.(agathaClass, { selectCharacter: false });
    scene.updateIronManAbilities?.(ironManClass);
    scene.updateAnimationController?.(animClass);

    await this.reapplyAppliedModules([...AGATHA_ABILITY_IDS, ...IRONMAN_ABILITY_IDS], scene);

    scene.currentPowerSet = powerSet;
    if (scene.animController) {
      scene.animController.isAgatha = powerSet === 'agatha';
      scene.animController.isVision = powerSet === 'vision';
    }
  }

  /** Re-installs the given hot-swapped modules using their already-applied code. */
  private async reapplyAppliedModules(ids: string[], scene: unknown): Promise<void> {
    for (const id of ids) {
      const script = this.getScriptById(id);
      if (!script || getCapability(script) !== 'hot-swap') continue;
      const record = this.getRecord(id);
      if (!record.applied || record.applied === script.originalSource) continue;
      try {
        await this.applyScript(id, record.applied, scene, {
          startup: true,
          skipDependents: true,
          skipServerSync: true,
        });
      } catch (err) {
        console.warn(`[ScriptRuntimeEngine] Could not re-install module ${id}:`, err);
      }
    }
  }

  public getComponent(id: string): React.ComponentType<any> | undefined {
    return this.uiComponentRegistry.get(id);
  }

  public async rollback(
    id: string,
    gameScene?: unknown
  ): Promise<{ success: boolean; message: string; restoredCode?: string }> {
    const versions = this.versionsByScript.get(id) || [];
    const current = this.getRecord(id).running;
    const previous = versions.find((v) => v.kind !== 'original' && v.code !== current)
      || versions.find((v) => v.code !== current);
    if (!previous) return { success: false, message: 'Nenhuma versão anterior disponível para reversão.' };
    const script = this.getScriptById(id);
    if (script && getCapability(script) === 'restart-required') {
      const result = await this.applyForRestart(id, previous.code);
      if (!result.success) return { success: false, message: `Falha ao reverter: ${result.error}` };
      return {
        success: true,
        message: `Versão ${previous.label} aplicada para o próximo build/reinício.`,
        restoredCode: previous.code,
      };
    }
    const result = await this.compileAndApply(id, previous.code, gameScene);
    if (!result.success) return { success: false, message: `Falha ao reverter: ${result.error}` };
    this.addVersion(id, previous.code, `Reversão para: ${previous.label}`, 'rollback');
    return {
      success: true,
      message: `Revertido com sucesso para: ${previous.label}`,
      restoredCode: previous.code,
    };
  }

  public async restoreBackup(
    id: string,
    versionId: string,
    gameScene?: unknown
  ): Promise<{ success: boolean; message: string; restoredCode?: string }> {
    const version = (this.versionsByScript.get(id) || []).find((v) => v.id === versionId);
    if (!version) return { success: false, message: 'Backup não encontrado.' };
    const script = this.getScriptById(id);
    if (script && getCapability(script) === 'restart-required') {
      const result = await this.applyForRestart(id, version.code);
      if (!result.success) {
        return { success: false, message: `Falha ao restaurar backup: ${result.error}` };
      }
      return {
        success: true,
        message: `Backup ${version.label} aplicado para o próximo build/reinício.`,
        restoredCode: version.code,
      };
    }
    const result = await this.compileAndApply(id, version.code, gameScene);
    if (!result.success) {
      return { success: false, message: `Falha ao restaurar backup: ${result.error}` };
    }
    this.addVersion(id, version.code, `Restaurado de: ${version.label}`, 'restore');
    return { success: true, message: `Backup restaurado: ${version.label}`, restoredCode: version.code };
  }

  public async restoreLastWorking(
    id: string,
    gameScene?: unknown
  ): Promise<{ success: boolean; message: string; restoredCode?: string }> {
    const record = this.getRecord(id);
    if (!record.lastWorking) return { success: false, message: 'Nenhuma versão funcional registrada.' };
    const script = this.getScriptById(id);
    if (script && getCapability(script) === 'restart-required') {
      const restartResult = await this.applyForRestart(id, record.lastWorking);
      if (!restartResult.success) {
        return { success: false, message: `Falha ao restaurar última versão funcional: ${restartResult.error}` };
      }
      return {
        success: true,
        message: 'Última versão funcional aplicada para o próximo build/reinício.',
        restoredCode: record.lastWorking,
      };
    }
    const result = await this.compileAndApply(id, record.lastWorking, gameScene);
    if (!result.success) return { success: false, message: `Falha ao restaurar última versão funcional: ${result.error}` };
    return {
      success: true,
      message: 'Última versão funcional restaurada.',
      restoredCode: record.lastWorking,
    };
  }

  public async restoreOriginalScript(
    id: string,
    gameScene?: unknown
  ): Promise<{ success: boolean; message: string; restoredCode?: string }> {
    const script = this.getScriptById(id);
    if (!script) return { success: false, message: 'Script não encontrado.' };
    if (getCapability(script) === 'restart-required') {
      const result = await this.applyForRestart(id, script.originalSource);
      if (!result.success) {
        return { success: false, message: `Erro ao restaurar original: ${result.error}` };
      }
      return {
        success: true,
        message: `Código original de ${script.name} aplicado para o próximo build/reinício.`,
        restoredCode: script.originalSource,
      };
    }
    const result = await this.compileAndApply(id, script.originalSource, gameScene);
    if (!result.success) {
      return { success: false, message: `Erro ao restaurar original: ${result.error}` };
    }
    this.addVersion(id, script.originalSource, 'Restaurado para o original de fábrica', 'restore');
    return {
      success: true,
      message: `Código original de ${script.name} restaurado e em execução.`,
      restoredCode: script.originalSource,
    };
  }

  public async restoreAllOriginalScripts(
    gameScene?: unknown
  ): Promise<{ success: boolean; message: string }> {
    const scene = gameScene || this.activeGameScene;
    let appliedCount = 0;
    for (const script of this.getScripts()) {
      const record = this.getRecord(script.id);
      const capability = getCapability(script);
      if (capability === 'hot-swap' && record.applied) {
        const result = await this.compileAndApply(script.id, script.originalSource, scene);
        if (result.success) appliedCount += 1;
      } else if (capability === 'restart-required' && record.applied) {
        const result = await this.applyForRestart(script.id, script.originalSource);
        if (result.success) appliedCount += 1;
      } else {
        void removeAppliedScript(script.id, { force: true });
        this.runningNow.delete(script.id);
        record.draft = script.originalSource;
        record.saved = script.originalSource;
        record.revision += 1;
        record.updatedAt = Date.now();
        this.persistRecord(record);
      }
      try {
        localStorage.removeItem(`script_draft_${script.id}`);
      } catch {
        // Ignore.
      }
    }
    this.notify();
    return {
      success: true,
      message: `Originais restaurados. ${appliedCount} módulo(s) reaplicado(s) no jogo. Histórico preservado.`,
    };
  }

  public markScriptExecutionError(id: string, errorMsg: string): void {
    this.statusErrors.set(id, { type: 'runtime', message: errorMsg });
    const record = this.getRecord(id);
    record.error = { type: 'runtime', message: errorMsg, at: Date.now() };
    record.running = null;
    record.runningHash = null;
    record.updatedAt = Date.now();
    this.runningNow.delete(id);
    this.persistRecord(record);
    this.notify();
  }

  public updateRunningScripts(scene: unknown, dt: number): void {
    for (const [id, mod] of this.compiledModules.entries()) {
      const onUpdate = mod.onUpdate;
      if (typeof onUpdate === 'function') {
        try {
          (onUpdate as (s: unknown, d: number) => void)(scene, dt);
        } catch (err) {
          this.markScriptExecutionError(id, `Erro em onUpdate: ${(err as Error).message}`);
        }
      }
    }
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public subscribeUiComponents(listener: () => void): () => void {
    this.uiListeners.add(listener);
    return () => this.uiListeners.delete(listener);
  }

  private notify(): void {
    this.listeners.forEach((fn) => {
      try {
        fn();
      } catch (err) {
        console.error('[ScriptRuntimeEngine] listener error:', err);
      }
    });
  }

  private notifyUi(): void {
    this.uiListeners.forEach((fn) => {
      try {
        fn();
      } catch (err) {
        console.error('[ScriptRuntimeEngine] UI listener error:', err);
      }
    });
  }

  // -------------------------------------------------------------------------
  // Backup export / import
  // -------------------------------------------------------------------------

  public exportBackupBundle(): string {
    const scripts = this.getScripts().map((script) => {
      const record = this.getRecord(script.id);
      return {
        id: script.id,
        name: script.name,
        filePath: script.filePath,
        record,
        versions: this.versionsByScript.get(script.id) || [],
      };
    });
    return JSON.stringify(
      {
        format: 'stickman-script-engine-backup',
        version: 4,
        exportedAt: new Date().toISOString(),
        scripts,
      },
      null,
      2
    );
  }

  public async importBackupBundle(json: string): Promise<{ success: boolean; message: string }> {
    await this.readyPromise;
    try {
      const parsed = JSON.parse(json) as {
        format?: string;
        scripts?: Array<{
          id: string;
          record?: Partial<ScriptRecordData>;
          versions?: ScriptVersionData[];
        }>;
      };
      if (!parsed || !Array.isArray(parsed.scripts)) {
        return { success: false, message: 'Backup inválido: lista de scripts ausente.' };
      }
      let imported = 0;
      for (const item of parsed.scripts) {
        if (!item?.id || !this.getScriptById(item.id)) continue;
        const incoming = normalizeRecord(item.record, item.id);
        const current = this.getRecord(item.id);
        // Keep the most recent edit but never discard a custom applied version.
        if (incoming.revision >= current.revision || (!current.applied && incoming.applied)) {
          this.records.set(item.id, incoming);
          void scriptPersistence.saveRecord(incoming);
          imported += 1;
        }
        for (const version of item.versions || []) {
          if (!version?.id || !version.code) continue;
          const exists = (this.versionsByScript.get(item.id) || []).some((v) => v.id === version.id);
          if (!exists) {
            void scriptPersistence.saveVersion({ ...version, scriptId: item.id, kind: version.kind || 'import' });
          }
        }
      }
      this.reloadVersions();
      this.notify();
      return { success: true, message: `${imported} script(s) importados. Aplique-os para executar.` };
    } catch (err) {
      return { success: false, message: `Falha ao importar backup: ${(err as Error).message}` };
    }
  }

  // -------------------------------------------------------------------------
  // User-created script support (real onUpdate modules)
  // -------------------------------------------------------------------------

  public createCustomScript(name: string): ProjectScriptInfo | null {
    const clean = name.trim();
    if (!clean) return null;
    const id = `custom-${normalizeKey(clean) || Date.now()}`;
    if (this.getScriptById(id)) return null;
    const template = `/**
 * ${clean}
 * Script personalizado executado pela engine a cada frame.
 * Exporte onUpdate(scene, dt) para executar lógica própria.
 */

export function onUpdate(scene: any, dt: number): void {
  // scene expõe a cena do jogo (GameScene) e seus sistemas.
  void scene;
  void dt;
}
`;
    const script: ProjectScriptInfo = {
      id,
      name: clean,
      filePath: `/src/game/user/${clean.replace(/\s+/g, '')}.ts`,
      category: 'Sistemas',
      summary: 'Script personalizado criado pelo editor. Executa onUpdate(scene, dt).',
      originalSource: template,
      fileExtension: 'ts',
      dependencies: [],
      runtimeIntegration: 'hot-swap',
      isUserCreated: true,
      keywords: ['personalizado', 'custom', 'usuario', 'usuário'],
    };
    this.customScripts.push(script);
    this.buildAliasMap();
    this.saveCustomCatalog();
    this.ensureRecord(script);
    this.ensureOriginalVersions();
    this.notify();
    return script;
  }

  public deleteCustomScript(id: string): boolean {
    const index = this.customScripts.findIndex((s) => s.id === id);
    if (index === -1) return false;
    this.customScripts.splice(index, 1);
    this.deletedScriptIds.add(id);
    this.saveCustomCatalog();
    this.buildAliasMap();
    void removeAppliedScript(id, { force: true });
    this.notify();
    return true;
  }

  public markExported(entries: Array<{ id: string; source: string }>): void {
    let changed = false;
    for (const entry of entries) {
      const script = this.getScriptById(entry.id);
      if (!script) continue;
      const record = this.getRecord(entry.id);
      const hash = sourceHash(entry.source);
      if (record.exported === entry.source && record.exportedHash === hash) continue;
      record.exported = entry.source;
      record.exportedHash = hash;
      record.exportedAt = Date.now();
      record.updatedAt = Date.now();
      this.persistRecord(record);
      changed = true;
    }
    if (changed) this.notify();
  }

  private saveCustomCatalog(): void {
    try {
      localStorage.setItem(CUSTOM_SCRIPTS_KEY, JSON.stringify(this.customScripts));
      localStorage.setItem(DELETED_SCRIPTS_KEY, JSON.stringify(Array.from(this.deletedScriptIds)));
    } catch {
      // Ignore.
    }
  }
}

export const scriptRuntimeEngine = new ScriptRuntimeEngine();
