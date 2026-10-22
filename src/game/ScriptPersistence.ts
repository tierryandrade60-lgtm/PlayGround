/**
 * ScriptPersistence.ts
 * Durable storage for the script engine.
 *
 * IndexedDB is the primary store. localStorage is kept as a synchronous mirror
 * so the editor can render immediately on startup and as a fallback in browsers
 * where IndexedDB is unavailable or blocked.
 */

export type ScriptErrorType = 'syntax' | 'dependency' | 'integration' | 'runtime' | 'persistence';

export interface ScriptErrorInfo {
  type: ScriptErrorType;
  message: string;
  line?: number;
  column?: number;
  hint?: string;
  at: number;
}

export interface ScriptRecordData {
  id: string;
  draft: string | null;
  saved: string | null;
  validated: string | null;
  validatedHash: string | null;
  validatedAt: number | null;
  applied: string | null;
  appliedHash: string | null;
  running: string | null;
  runningHash: string | null;
  exported: string | null;
  exportedHash: string | null;
  lastWorking: string | null;
  lastWorkingHash: string | null;
  appliedAt: number | null;
  runningAt: number | null;
  exportedAt: number | null;
  revision: number;
  updatedAt: number;
  error: ScriptErrorInfo | null;
}

export type ScriptVersionKind =
  | 'original'
  | 'draft'
  | 'saved'
  | 'validated'
  | 'applied'
  | 'exported'
  | 'rollback'
  | 'restore'
  | 'import';

export interface ScriptVersionData {
  id: string;
  scriptId: string;
  timestamp: number;
  label: string;
  code: string;
  hash: string;
  kind: ScriptVersionKind;
}

const DB_NAME = 'stickman_script_engine';
const DB_VERSION = 1;
const SCRIPTS_STORE = 'scripts';
const VERSIONS_STORE = 'versions';
const MIRROR_KEY = 'stickman_script_engine_v4';
const LEGACY_PREFIXES = ['script_draft_', 'script_applied_', 'script_source_'];

function hashSource(code: string): string {
  let hash = 2166136261;
  for (let i = 0; i < code.length; i++) {
    hash ^= code.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function sourceHash(code: string): string {
  return hashSource(code);
}

export function createEmptyRecord(id: string): ScriptRecordData {
  return {
    id,
    draft: null,
    saved: null,
    validated: null,
    validatedHash: null,
    validatedAt: null,
    applied: null,
    appliedHash: null,
    running: null,
    runningHash: null,
    exported: null,
    exportedHash: null,
    lastWorking: null,
    lastWorkingHash: null,
    appliedAt: null,
    runningAt: null,
    exportedAt: null,
    revision: 0,
    updatedAt: Date.now(),
    error: null,
  };
}

export function normalizeRecord(value: Partial<ScriptRecordData> | null | undefined, id: string): ScriptRecordData {
  const base = createEmptyRecord(id);
  if (!value || typeof value !== 'object') return base;
  const result: ScriptRecordData = {
    ...base,
    ...value,
    id,
    revision: Number.isFinite(value.revision) ? Number(value.revision) : 0,
    updatedAt: Number.isFinite(value.updatedAt) ? Number(value.updatedAt) : Date.now(),
  };
  const stringOrNull = (v: unknown) => (typeof v === 'string' ? v : null);
  result.draft = stringOrNull(result.draft);
  result.saved = stringOrNull(result.saved);
  result.validated = stringOrNull(result.validated);
  result.validatedHash = stringOrNull(result.validatedHash);
  result.validatedAt = typeof result.validatedAt === 'number' ? result.validatedAt : null;
  result.applied = stringOrNull(result.applied);
  result.appliedHash = stringOrNull(result.appliedHash);
  result.running = stringOrNull(result.running);
  result.runningHash = stringOrNull(result.runningHash);
  result.exported = stringOrNull(result.exported);
  result.exportedHash = stringOrNull(result.exportedHash);
  result.lastWorking = stringOrNull(result.lastWorking);
  result.lastWorkingHash = stringOrNull(result.lastWorkingHash);
  result.appliedAt = typeof result.appliedAt === 'number' ? result.appliedAt : null;
  result.runningAt = typeof result.runningAt === 'number' ? result.runningAt : null;
  result.exportedAt = typeof result.exportedAt === 'number' ? result.exportedAt : null;
  result.error =
    result.error && typeof result.error === 'object' && typeof result.error.message === 'string'
      ? result.error
      : null;
  return result;
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB request failed'));
  });
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('IndexedDB transaction failed'));
    tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted'));
  });
}

class ScriptPersistence {
  private dbPromise: Promise<IDBDatabase | null> | null = null;
  private writeChain: Promise<void> = Promise.resolve();
  private memoryRecords: Map<string, ScriptRecordData> = new Map();
  private memoryVersions: ScriptVersionData[] = [];
  private mirrorTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.loadMirror();
  }

  public getCachedRecord(id: string): ScriptRecordData | undefined {
    return this.memoryRecords.get(id);
  }

  public getCachedRecords(): ScriptRecordData[] {
    return Array.from(this.memoryRecords.values());
  }

  public getCachedVersions(scriptId?: string): ScriptVersionData[] {
    return this.memoryVersions
      .filter((v) => !scriptId || v.scriptId === scriptId)
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  private loadMirror(): void {
    try {
      const raw = localStorage.getItem(MIRROR_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as {
          records?: Partial<ScriptRecordData>[];
          versions?: ScriptVersionData[];
        };
        if (Array.isArray(parsed.records)) {
          for (const record of parsed.records) {
            if (record?.id) {
              const normalized = normalizeRecord(record, record.id);
              this.memoryRecords.set(normalized.id, normalized);
            }
          }
        }
        if (Array.isArray(parsed.versions)) {
          this.memoryVersions = parsed.versions
            .filter((v) => v && typeof v.scriptId === 'string' && typeof v.code === 'string')
            .slice(0, 500);
        }
      }
      this.migrateLegacyLocalStorage();
    } catch {
      this.memoryRecords.clear();
      this.memoryVersions = [];
    }
  }

  /**
   * Migrates the previous per-key localStorage format (v3) without discarding
   * custom drafts or applied code.
   */
  private migrateLegacyLocalStorage(): void {
    try {
      const ids = new Set<string>();
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key) continue;
        const prefix = LEGACY_PREFIXES.find((p) => key.startsWith(p));
        if (prefix) ids.add(key.slice(prefix.length));
      }

      for (const id of ids) {
        const existing = this.memoryRecords.get(id);
        const applied = localStorage.getItem(`script_applied_${id}`);
        const source = localStorage.getItem(`script_source_${id}`);
        const draft = localStorage.getItem(`script_draft_${id}`);
        if (!applied && !source && !draft) continue;
        const effectiveApplied = applied || source;
        if (!existing) {
          const record = createEmptyRecord(id);
          record.applied = effectiveApplied;
          record.appliedHash = effectiveApplied ? sourceHash(effectiveApplied) : null;
          record.running = effectiveApplied;
          record.runningHash = record.appliedHash;
          record.lastWorking = effectiveApplied;
          record.lastWorkingHash = record.appliedHash;
          record.draft = draft || effectiveApplied;
          record.saved = effectiveApplied;
          record.appliedAt = effectiveApplied ? Date.now() : null;
          record.runningAt = effectiveApplied ? Date.now() : null;
          record.revision = 1;
          record.updatedAt = Date.now();
          this.memoryRecords.set(id, record);
          if (effectiveApplied) {
            this.memoryVersions.push({
              id: `migrated-${id}-${Date.now()}`,
              scriptId: id,
              timestamp: Date.now(),
              label: 'Versão migrada do armazenamento anterior',
              code: effectiveApplied,
              hash: record.appliedHash || sourceHash(effectiveApplied),
              kind: 'applied',
            });
          }
        } else if (!existing.applied && effectiveApplied) {
          existing.applied = effectiveApplied;
          existing.appliedHash = sourceHash(effectiveApplied);
          existing.running = existing.running || effectiveApplied;
          existing.runningHash = existing.running ? sourceHash(existing.running) : null;
          existing.lastWorking = existing.lastWorking || effectiveApplied;
          existing.lastWorkingHash = existing.lastWorking ? sourceHash(existing.lastWorking) : null;
          existing.saved = existing.saved || effectiveApplied;
          existing.revision += 1;
          existing.updatedAt = Date.now();
        }
        if (draft && !existing?.draft) {
          const target = this.memoryRecords.get(id);
          if (target) target.draft = draft;
        }
      }
    } catch {
      // A corrupted legacy payload must not prevent the editor from opening.
    }
  }

  private scheduleMirror(): void {
    if (this.mirrorTimer) return;
    this.mirrorTimer = setTimeout(() => {
      this.mirrorTimer = null;
      this.flushMirror();
    }, 80);
  }

  public flushMirror(): void {
    try {
      const records = Array.from(this.memoryRecords.values());
      const versions = this.memoryVersions.slice(0, 300);
      localStorage.setItem(MIRROR_KEY, JSON.stringify({ records, versions }));
    } catch {
      // Quota errors are expected for very large histories. IndexedDB remains authoritative.
    }
  }

  private openDb(): Promise<IDBDatabase | null> {
    if (this.dbPromise) return this.dbPromise;
    this.dbPromise = new Promise((resolve) => {
      if (typeof indexedDB === 'undefined') {
        resolve(null);
        return;
      }
      try {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(SCRIPTS_STORE)) {
            db.createObjectStore(SCRIPTS_STORE, { keyPath: 'id' });
          }
          if (!db.objectStoreNames.contains(VERSIONS_STORE)) {
            const store = db.createObjectStore(VERSIONS_STORE, { keyPath: 'id' });
            store.createIndex('scriptId', 'scriptId', { unique: false });
            store.createIndex('timestamp', 'timestamp', { unique: false });
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(null);
        request.onblocked = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
    return this.dbPromise;
  }

  /**
   * Reconciles IndexedDB with the synchronous mirror. Newer records win; both
   * sources are normalised so malformed entries cannot poison the editor.
   */
  public async hydrate(): Promise<void> {
    const db = await this.openDb();
    if (!db) {
      this.flushMirror();
      return;
    }
    try {
      const tx = db.transaction([SCRIPTS_STORE, VERSIONS_STORE], 'readonly');
      const [records, versions] = await Promise.all([
        requestToPromise(tx.objectStore(SCRIPTS_STORE).getAll()) as Promise<Partial<ScriptRecordData>[]>,
        requestToPromise(tx.objectStore(VERSIONS_STORE).getAll()) as Promise<ScriptVersionData[]>,
      ]);
      await transactionDone(tx);

      for (const raw of records || []) {
        if (!raw?.id) continue;
        const incoming = normalizeRecord(raw, raw.id);
        const local = this.memoryRecords.get(incoming.id);
        if (!local || incoming.revision >= local.revision || incoming.updatedAt > local.updatedAt) {
          this.memoryRecords.set(incoming.id, incoming);
        }
      }

      const seen = new Set<string>();
      const merged = [...this.memoryVersions, ...(versions || [])].filter((v) => {
        if (!v || typeof v.id !== 'string' || seen.has(v.id)) return false;
        seen.add(v.id);
        return true;
      });
      this.memoryVersions = merged.sort((a, b) => b.timestamp - a.timestamp).slice(0, 500);
      this.flushMirror();
    } catch {
      // IndexedDB is optional; the mirrored state stays usable.
    }
  }

  private enqueueWrite(work: () => Promise<void>): Promise<void> {
    this.writeChain = this.writeChain.then(work, work);
    return this.writeChain;
  }

  public async saveRecord(record: ScriptRecordData): Promise<void> {
    const normalized = normalizeRecord(record, record.id);
    this.memoryRecords.set(normalized.id, normalized);
    this.scheduleMirror();
    await this.enqueueWrite(async () => {
      const db = await this.openDb();
      if (!db) return;
      try {
        const tx = db.transaction(SCRIPTS_STORE, 'readwrite');
        tx.objectStore(SCRIPTS_STORE).put(normalized);
        await transactionDone(tx);
      } catch {
        // Keep the synchronous mirror as fallback.
      }
    });
  }

  public async saveVersion(version: ScriptVersionData): Promise<void> {
    this.memoryVersions.unshift(version);
    const perScript = this.memoryVersions.filter((v) => v.scriptId === version.scriptId);
    if (perScript.length > 40) {
      const drop = new Set(perScript.slice(40).map((v) => v.id));
      this.memoryVersions = this.memoryVersions.filter((v) => !drop.has(v.id));
    }
    this.memoryVersions = this.memoryVersions.slice(0, 500);
    this.scheduleMirror();
    await this.enqueueWrite(async () => {
      const db = await this.openDb();
      if (!db) return;
      try {
        const tx = db.transaction(VERSIONS_STORE, 'readwrite');
        tx.objectStore(VERSIONS_STORE).put(version);
        await transactionDone(tx);
      } catch {
        // Ignore and retain the mirror.
      }
    });
  }

  public async deleteVersion(versionId: string): Promise<void> {
    this.memoryVersions = this.memoryVersions.filter((v) => v.id !== versionId);
    this.scheduleMirror();
    await this.enqueueWrite(async () => {
      const db = await this.openDb();
      if (!db) return;
      try {
        const tx = db.transaction(VERSIONS_STORE, 'readwrite');
        tx.objectStore(VERSIONS_STORE).delete(versionId);
        await transactionDone(tx);
      } catch {
        // Ignore.
      }
    });
  }

  public async clearAll(): Promise<void> {
    this.memoryRecords.clear();
    this.memoryVersions = [];
    this.flushMirror();
    await this.enqueueWrite(async () => {
      const db = await this.openDb();
      if (!db) return;
      try {
        const tx = db.transaction([SCRIPTS_STORE, VERSIONS_STORE], 'readwrite');
        tx.objectStore(SCRIPTS_STORE).clear();
        tx.objectStore(VERSIONS_STORE).clear();
        await transactionDone(tx);
      } catch {
        // Ignore.
      }
    });
  }

  public flushSync(): void {
    this.flushMirror();
  }
}

export const scriptPersistence = new ScriptPersistence();
