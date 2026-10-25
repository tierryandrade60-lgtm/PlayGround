/**
 * AppliedScriptStore.ts
 * Durable, cross-tab applied-script state.
 *
 * The Vite plugin stores applied sources in `.build-script/applied-scripts.json`.
 * That file is loaded by development/preview servers and baked into production
 * builds. IndexedDB remains the local durable store; this layer guarantees the
 * same applied versions are used by new tabs, other execution modes and builds,
 * even when browser storage is isolated.
 */

import appliedSnapshot from 'virtual:applied-scripts';
import { sourceHash } from './ScriptPersistence';

export interface AppliedScriptRecord {
  id: string;
  name: string;
  filePath: string;
  code: string;
  hash: string;
  appliedAt: number;
  revision: number;
  requiresRestart: boolean;
  updatedAt: number;
  script?: Record<string, unknown>;
}

export interface AppliedScriptState {
  version: 1;
  updatedAt: number;
  scripts: AppliedScriptRecord[];
}

export interface AppliedSaveResult {
  ok: boolean;
  entry?: AppliedScriptRecord;
  conflict?: boolean;
  message?: string;
  source?: 'server' | 'bundle' | 'browser';
}

const ENDPOINT = '/__playground/applied-scripts';
const CHANNEL_NAME = 'stickman_applied_scripts_v1';
const FETCH_TIMEOUT_MS = 1800;

let loadedState: AppliedScriptState = normalizeState(appliedSnapshot);
let loadedFrom: 'server' | 'bundle' = 'bundle';
let serverHashes = new Map<string, string>();
const listeners = new Set<(entry: AppliedScriptRecord | null) => void>();
const channel =
  typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CHANNEL_NAME) : null;

if (channel) {
  channel.onmessage = (event: MessageEvent) => {
    const entry = event.data?.entry as AppliedScriptRecord | undefined;
    if (event.data?.type === 'applied' && entry?.id) {
      mergeEntry(entry);
      listeners.forEach((listener) => listener(entry));
    }
    if (event.data?.type === 'removed' && typeof event.data?.id === 'string') {
      loadedState = {
        ...loadedState,
        scripts: loadedState.scripts.filter((item) => item.id !== event.data.id),
      };
      serverHashes.delete(event.data.id);
      listeners.forEach((listener) => listener(null));
    }
  };
}

function normalizeEntry(value: unknown): AppliedScriptRecord | null {
  if (!value || typeof value !== 'object') return null;
  const entry = value as Partial<AppliedScriptRecord>;
  if (
    typeof entry.id !== 'string' ||
    typeof entry.filePath !== 'string' ||
    typeof entry.code !== 'string' ||
    !entry.code
  ) {
    return null;
  }
  return {
    id: entry.id,
    name: typeof entry.name === 'string' && entry.name ? entry.name : entry.id,
    filePath: entry.filePath,
    code: entry.code,
    hash: typeof entry.hash === 'string' ? entry.hash : sourceHash(entry.code),
    appliedAt: Number.isFinite(entry.appliedAt) ? Number(entry.appliedAt) : 0,
    revision: Number.isFinite(entry.revision) ? Number(entry.revision) : 0,
    requiresRestart: entry.requiresRestart === true,
    updatedAt: Number.isFinite(entry.updatedAt) ? Number(entry.updatedAt) : 0,
    script:
      entry.script && typeof entry.script === 'object'
        ? (entry.script as Record<string, unknown>)
        : undefined,
  };
}

function normalizeState(value: unknown): AppliedScriptState {
  const source = value && typeof value === 'object' ? (value as Partial<AppliedScriptState>) : {};
  const scripts = Array.isArray(source.scripts)
    ? source.scripts
        .map(normalizeEntry)
        .filter((entry): entry is AppliedScriptRecord => entry !== null)
    : [];
  return {
    version: 1,
    updatedAt: Number.isFinite(source.updatedAt) ? Number(source.updatedAt) : 0,
    scripts,
  };
}

function mergeEntry(entry: AppliedScriptRecord): void {
  const existing = loadedState.scripts.find((item) => item.id === entry.id);
  if (existing && existing.updatedAt > entry.updatedAt) return;
  loadedState = {
    ...loadedState,
    scripts: [entry, ...loadedState.scripts.filter((item) => item.id !== entry.id)].sort((a, b) =>
      a.id.localeCompare(b.id)
    ),
  };
  serverHashes.set(entry.id, entry.hash);
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Loads the latest applied versions. In development/preview the server file is
 * authoritative; in a static deployment the values baked by Vite are used.
 */
export async function loadAppliedScripts(): Promise<{
  state: AppliedScriptState;
  source: 'server' | 'bundle';
}> {
  const bundled = normalizeState(appliedSnapshot);
  try {
    const response = await fetchWithTimeout(`${ENDPOINT}?t=${Date.now()}`, {
      method: 'GET',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    const contentType = response.headers.get('content-type') || '';
    if (response.ok && contentType.includes('application/json')) {
      const parsed = normalizeState(await response.json());
      const liveWins = parsed.updatedAt >= bundled.updatedAt;
      loadedState = liveWins ? parsed : {
        version: 1,
        updatedAt: Math.max(parsed.updatedAt, bundled.updatedAt),
        scripts: mergeById(parsed.scripts, bundled.scripts),
      };
      loadedFrom = 'server';
      serverHashes = new Map(loadedState.scripts.map((entry) => [entry.id, entry.hash]));
      return { state: loadedState, source: 'server' };
    }
  } catch {
    // Static hosting or an unavailable preview endpoint: use the baked state.
  }
  loadedState = bundled;
  loadedFrom = 'bundle';
  serverHashes = new Map(loadedState.scripts.map((entry) => [entry.id, entry.hash]));
  return { state: loadedState, source: 'bundle' };
}

function mergeById(
  primary: AppliedScriptRecord[],
  fallback: AppliedScriptRecord[]
): AppliedScriptRecord[] {
  const merged = new Map<string, AppliedScriptRecord>();
  for (const entry of [...fallback, ...primary]) {
    const existing = merged.get(entry.id);
    if (!existing || entry.updatedAt >= existing.updatedAt) merged.set(entry.id, entry);
  }
  return Array.from(merged.values()).sort((a, b) => a.id.localeCompare(b.id));
}

export function getAppliedScript(id: string): AppliedScriptRecord | undefined {
  return loadedState.scripts.find((entry) => entry.id === id);
}

export function getAppliedStateSnapshot(): AppliedScriptState {
  return loadedState;
}

export function getAppliedSource(): 'server' | 'bundle' {
  return loadedFrom;
}

export function getAppliedBaseHash(id: string): string | undefined {
  return serverHashes.get(id);
}

export function subscribeAppliedChanges(
  listener: (entry: AppliedScriptRecord | null) => void
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function postChannel(type: 'applied' | 'removed', payload: Record<string, unknown>): void {
  try {
    channel?.postMessage({ type, ...payload });
  } catch {
    // Cross-tab notification is optional; persistence remains authoritative.
  }
}

export async function persistAppliedScript(
  entry: AppliedScriptRecord
): Promise<AppliedSaveResult> {
  const normalized = normalizeEntry(entry);
  if (!normalized) return { ok: false, message: 'Versão aplicada inválida.' };
  const baseHash = getAppliedBaseHash(normalized.id);
  try {
    const response = await fetchWithTimeout(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ ...normalized, baseHash }),
    });
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return { ok: false, source: 'browser', message: 'Servidor de versões aplicadas indisponível.' };
    }
    const payload = (await response.json()) as {
      ok?: boolean;
      entry?: AppliedScriptRecord;
      updatedAt?: number;
      current?: AppliedScriptRecord;
      error?: string;
      code?: string;
    };
    if (response.status === 409) {
      if (payload.current) mergeEntry(payload.current);
      return {
        ok: false,
        conflict: true,
        source: 'server',
        message: payload.error || 'Outra aba aplicou uma versão diferente.',
      };
    }
    if (!response.ok || !payload.ok) {
      return { ok: false, source: 'server', message: payload.error || 'Falha ao persistir versão aplicada.' };
    }
    const saved = normalizeEntry(payload.entry) || normalized;
    mergeEntry(saved);
    loadedFrom = 'server';
    postChannel('applied', { entry: saved });
    return { ok: true, entry: saved, source: 'server' };
  } catch {
    return {
      ok: false,
      source: 'browser',
      message: 'Servidor indisponível; versão aplicada mantida apenas neste navegador.',
    };
  }
}

export async function removeAppliedScript(
  id: string,
  options: { force?: boolean } = {}
): Promise<AppliedSaveResult> {
  const baseHash = options.force ? undefined : getAppliedBaseHash(id);
  try {
    const response = await fetchWithTimeout(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ id, remove: true, baseHash }),
    });
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return { ok: false, source: 'browser', message: 'Servidor de versões aplicadas indisponível.' };
    }
    const payload = (await response.json()) as {
      ok?: boolean;
      error?: string;
      current?: AppliedScriptRecord;
    };
    if (response.status === 409) {
      if (payload.current) mergeEntry(payload.current);
      return {
        ok: false,
        conflict: true,
        source: 'server',
        message: payload.error || 'Outra aba alterou esta versão.',
      };
    }
    if (!response.ok || !payload.ok) {
      return { ok: false, source: 'server', message: payload.error || 'Falha ao remover versão aplicada.' };
    }
    loadedState = {
      ...loadedState,
      scripts: loadedState.scripts.filter((entry) => entry.id !== id),
    };
    serverHashes.delete(id);
    postChannel('removed', { id });
    return { ok: true, source: 'server' };
  } catch {
    return {
      ok: false,
      source: 'browser',
      message: 'Servidor indisponível; removida apenas neste navegador.',
    };
  }
}
