import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'path';
import {defineConfig, type Plugin, type ViteDevServer} from 'vite';

const PROJECT_FILES_ID = 'virtual:project-files';
const RESOLVED_PROJECT_FILES_ID = `\0${PROJECT_FILES_ID}`;
const APPLIED_SCRIPTS_ID = 'virtual:applied-scripts';
const RESOLVED_APPLIED_SCRIPTS_ID = `\0${APPLIED_SCRIPTS_ID}`;
const APPLIED_STATE_DIR = path.join(__dirname, '.build-script');
const APPLIED_STATE_FILE = path.join(APPLIED_STATE_DIR, 'applied-scripts.json');
const APPLIED_ENDPOINT = '/__playground/applied-scripts';

const SKIPPED_DIRECTORIES = new Set([
  'node_modules',
  'dist',
  '.git',
  '.agents',
  '.opencode',
  '.cache',
  '.vite',
  '.build-script',
  'coverage',
  'tmp',
  'temp',
]);

const SKIPPED_FILE_NAMES = new Set([
  '.DS_Store',
  'Thumbs.db',
  '.npmrc',
  '.netrc',
  '.git-credentials',
  'MeuJogo-Source.zip',
]);

const SKIPPED_FILE_PATTERNS = [
  /\.log$/i,
  /\.tsbuildinfo$/i,
  /\.crdownload$/i,
  /\.tmp$/i,
  /\.swp$/i,
  /(^|\/)\.env(\..+)?$/i,
  /\.pem$/i,
  /\.key$/i,
  /\.p12$/i,
  /^id_rsa/i,
  /^id_ed25519/i,
];

const TEXT_EXTENSIONS = new Set([
  'ts',
  'tsx',
  'js',
  'jsx',
  'mjs',
  'cjs',
  'css',
  'scss',
  'sass',
  'less',
  'json',
  'jsonc',
  'md',
  'mdx',
  'html',
  'htm',
  'svg',
  'txt',
  'csv',
  'xml',
  'yml',
  'yaml',
  'toml',
  'ini',
  'conf',
  'lock',
  'glsl',
  'vert',
  'frag',
  'wgsl',
  'sh',
  'bat',
  'ps1',
  'env',
  'example',
]);

const TEXT_FILE_NAMES = new Set([
  '.gitignore',
  '.gitattributes',
  '.env.example',
  'Dockerfile',
  'Makefile',
  'Procfile',
]);

interface AppliedScriptEntry {
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

interface AppliedScriptState {
  version: 1;
  updatedAt: number;
  scripts: AppliedScriptEntry[];
}

interface ProjectFile {
  path: string;
  encoding: 'utf8' | 'base64' | 'url';
  content: string;
}

function appliedHash(code: string): string {
  let hash = 2166136261;
  for (let i = 0; i < code.length; i += 1) {
    hash ^= code.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function emptyAppliedState(): AppliedScriptState {
  return {version: 1, updatedAt: 0, scripts: []};
}

function normalizeAppliedFile(filePath: string): string | null {
  const normalized = filePath.replace(/\\/g, '/').trim();
  const withSlash = normalized.startsWith('/') ? normalized : `/${normalized}`;
  if (!/^\/src\/(game|components)\/[A-Za-z0-9_./-]+\.(ts|tsx)$/.test(withSlash)) return null;
  if (withSlash.includes('..') || withSlash.includes('//')) return null;
  return withSlash;
}

function readAppliedState(): AppliedScriptState {
  try {
    if (!fs.existsSync(APPLIED_STATE_FILE)) return emptyAppliedState();
    const parsed = JSON.parse(fs.readFileSync(APPLIED_STATE_FILE, 'utf8')) as Partial<AppliedScriptState>;
    const scripts = Array.isArray(parsed.scripts)
      ? parsed.scripts
          .filter(
            (entry): entry is AppliedScriptEntry =>
              !!entry &&
              typeof entry.id === 'string' &&
              typeof entry.code === 'string' &&
              typeof entry.filePath === 'string'
          )
          .map((entry) => {
            const filePath = normalizeAppliedFile(entry.filePath);
            if (!filePath) return null;
            return {
              ...entry,
              filePath,
              name: typeof entry.name === 'string' ? entry.name : entry.id,
              hash: typeof entry.hash === 'string' ? entry.hash : appliedHash(entry.code),
              appliedAt: Number.isFinite(entry.appliedAt) ? Number(entry.appliedAt) : 0,
              revision: Number.isFinite(entry.revision) ? Number(entry.revision) : 0,
              requiresRestart: entry.requiresRestart === true,
              updatedAt: Number.isFinite(entry.updatedAt) ? Number(entry.updatedAt) : 0,
            } as AppliedScriptEntry;
          })
          .filter((entry): entry is AppliedScriptEntry => entry !== null)
      : [];
    return {
      version: 1,
      updatedAt: Number.isFinite(parsed.updatedAt) ? Number(parsed.updatedAt) : 0,
      scripts,
    };
  } catch {
    return emptyAppliedState();
  }
}

function writeAppliedState(state: AppliedScriptState): void {
  fs.mkdirSync(APPLIED_STATE_DIR, {recursive: true});
  const temp = `${APPLIED_STATE_FILE}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(state, null, 2) + '\n', 'utf8');
  fs.renameSync(temp, APPLIED_STATE_FILE);
}

function readRequestBody(request: import('node:http').IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > 4 * 1024 * 1024) {
        reject(new Error('Payload maior que 4 MB.'));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    request.on('error', reject);
  });
}

function sendJson(
  response: import('node:http').ServerResponse,
  status: number,
  payload: unknown
): void {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.end(JSON.stringify(payload));
}

async function handleAppliedScriptRequest(
  request: import('node:http').IncomingMessage,
  response: import('node:http').ServerResponse
): Promise<boolean> {
  const pathname = (request.url || '').split('?')[0];
  if (pathname !== APPLIED_ENDPOINT) return false;

  if (request.method === 'GET') {
    sendJson(response, 200, {source: 'server', ...readAppliedState()});
    return true;
  }

  if (request.method !== 'POST') {
    sendJson(response, 405, {error: 'Método não permitido.'});
    return true;
  }

  try {
    const raw = await readRequestBody(request);
    const body = JSON.parse(raw) as {
      id?: unknown;
      name?: unknown;
      filePath?: unknown;
      code?: unknown;
      hash?: unknown;
      baseHash?: unknown;
      appliedAt?: unknown;
      revision?: unknown;
      requiresRestart?: unknown;
      script?: unknown;
      remove?: unknown;
    };

    const id = typeof body.id === 'string' ? body.id.trim() : '';
    if (!/^[a-z0-9][a-z0-9_-]{0,96}$/i.test(id)) {
      sendJson(response, 400, {error: 'id de script inválido.'});
      return true;
    }

    const state = readAppliedState();
    const existing = state.scripts.find((entry) => entry.id === id);

    if (body.remove === true) {
      const baseHash = typeof body.baseHash === 'string' ? body.baseHash : undefined;
      if (existing && baseHash !== undefined && existing.hash !== baseHash) {
        sendJson(response, 409, {
          error: 'Outra aba aplicou uma versão diferente. Recarregue antes de remover.',
          code: 'conflict',
          current: existing,
        });
        return true;
      }
      const next: AppliedScriptState = {
        version: 1,
        updatedAt: Date.now(),
        scripts: state.scripts.filter((entry) => entry.id !== id),
      };
      writeAppliedState(next);
      sendJson(response, 200, {ok: true, removed: true, updatedAt: next.updatedAt});
      return true;
    }

    const code = typeof body.code === 'string' ? body.code : '';
    if (!code || code.length > 2_000_000) {
      sendJson(response, 400, {error: 'Código vazio ou maior que 2 MB.'});
      return true;
    }
    const filePath = typeof body.filePath === 'string' ? normalizeAppliedFile(body.filePath) : null;
    if (!filePath) {
      sendJson(response, 400, {error: 'Caminho de script não permitido.'});
      return true;
    }
    const hash = appliedHash(code);
    if (typeof body.hash === 'string' && body.hash !== hash) {
      sendJson(response, 400, {error: 'Hash do código não corresponde ao conteúdo.'});
      return true;
    }
    const baseHash = typeof body.baseHash === 'string' ? body.baseHash : undefined;
    if (existing && baseHash !== undefined && existing.hash !== baseHash && existing.hash !== hash) {
      sendJson(response, 409, {
        error: 'Outra aba aplicou uma versão diferente. Recarregue antes de aplicar novamente.',
        code: 'conflict',
        current: existing,
      });
      return true;
    }

    const entry: AppliedScriptEntry = {
      id,
      name: typeof body.name === 'string' && body.name ? body.name : id,
      filePath,
      code,
      hash,
      appliedAt: Number.isFinite(body.appliedAt) ? Number(body.appliedAt) : Date.now(),
      revision: Number.isFinite(body.revision) ? Number(body.revision) : (existing?.revision || 0) + 1,
      requiresRestart: body.requiresRestart === true,
      updatedAt: Date.now(),
      script:
        body.script && typeof body.script === 'object'
          ? (body.script as Record<string, unknown>)
          : undefined,
    };
    const scripts = [entry, ...state.scripts.filter((item) => item.id !== id)].sort((a, b) =>
      a.id.localeCompare(b.id)
    );
    const next: AppliedScriptState = {version: 1, updatedAt: Date.now(), scripts};
    writeAppliedState(next);
    sendJson(response, 200, {ok: true, entry, updatedAt: next.updatedAt});
    return true;
  } catch (error) {
    sendJson(response, 500, {error: (error as Error).message});
    return true;
  }
}

function isSensitive(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/');
  const name = path.basename(normalized);
  if (normalized === '.env.example') return false;
  if (SKIPPED_FILE_NAMES.has(name)) return true;
  return SKIPPED_FILE_PATTERNS.some((pattern) => pattern.test(normalized));
}

function isTextFile(filePath: string): boolean {
  const name = path.basename(filePath);
  if (TEXT_FILE_NAMES.has(name)) return true;
  const extension = path.extname(filePath).slice(1).toLowerCase();
  return TEXT_EXTENSIONS.has(extension);
}

/**
 * Discovers the real project tree. There is deliberately no fixed file list:
 * new source files, assets, workflows and configuration files are picked up
 * automatically. Only installable dependencies, build outputs, caches,
 * temporary files and credentials are skipped.
 */
function collectProjectFiles(root: string): ProjectFile[] {
  const files: ProjectFile[] = [];

  const walk = (directory: string) => {
    if (!fs.existsSync(directory)) return;

    for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
      if (entry.isSymbolicLink()) continue;

      const absolute = path.join(directory, entry.name);
      const relative = path.relative(root, absolute).replace(/\\/g, '/');

      if (entry.isDirectory()) {
        if (SKIPPED_DIRECTORIES.has(entry.name)) continue;
        walk(absolute);
        continue;
      }

      if (!entry.isFile() || isSensitive(relative)) continue;

      if (relative.startsWith('public/')) {
        files.push({
          path: relative,
          encoding: 'url',
          content: `/${relative.slice('public/'.length)}`,
        });
        continue;
      }

      const buffer = fs.readFileSync(absolute);
      const text = isTextFile(relative);
      files.push({
        path: relative,
        encoding: text ? 'utf8' : 'base64',
        content: text ? buffer.toString('utf8') : buffer.toString('base64'),
      });
    }
  };

  walk(root);
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

function appliedScriptsModule(): Plugin {
  return {
    name: 'playground-applied-scripts-module',
    resolveId(id) {
      return id === APPLIED_SCRIPTS_ID ? RESOLVED_APPLIED_SCRIPTS_ID : null;
    },
    load(id) {
      if (id !== RESOLVED_APPLIED_SCRIPTS_ID) return null;
      return `export default ${JSON.stringify(readAppliedState())};`;
    },
  };
}

/**
 * Makes applied script versions the real modules loaded by new tabs and by
 * production builds. The raw `?raw` imports stay untouched so the editor can
 * still diff against the file on disk and preserve the factory baseline.
 */
function appliedSourceOverlay(): Plugin {
  return {
    name: 'playground-applied-source-overlay',
    enforce: 'pre',
    load(id) {
      if (!path.isAbsolute(id) || id.includes('?')) return null;
      const relative = `/${path.relative(__dirname, id).replace(/\\/g, '/')}`;
      const entry = readAppliedState().scripts.find((item) => item.filePath === relative);
      return entry ? entry.code : null;
    },
  };
}

function invalidateAppliedModules(server: ViteDevServer): void {
  const virtual = server.moduleGraph.getModuleById(RESOLVED_APPLIED_SCRIPTS_ID);
  if (virtual) server.moduleGraph.invalidateModule(virtual);
  for (const entry of readAppliedState().scripts) {
    const absolute = path.join(__dirname, entry.filePath.replace(/^\//, ''));
    const mod = server.moduleGraph.getModuleById(absolute);
    if (mod) server.moduleGraph.invalidateModule(mod);
  }
}

function appliedScriptsEndpoint(): Plugin {
  return {
    name: 'playground-applied-scripts-endpoint',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        void handleAppliedScriptRequest(request, response).then((handled) => {
          if (handled && request.method === 'POST') invalidateAppliedModules(server);
          if (!handled) next();
        });
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((request, response, next) => {
        void handleAppliedScriptRequest(request, response).then((handled) => {
          if (!handled) next();
        });
      });
    },
  };
}

function projectFilesModule(): Plugin {
  return {
    name: 'playground-project-files-module',
    resolveId(id) {
      return id === PROJECT_FILES_ID ? RESOLVED_PROJECT_FILES_ID : null;
    },
    load(id) {
      if (id !== RESOLVED_PROJECT_FILES_ID) return null;
      return `export default ${JSON.stringify(collectProjectFiles(__dirname))};`;
    },
  };
}

function liveProjectFilesEndpoint(): Plugin {
  return {
    name: 'playground-live-project-files',
    configureServer(server) {
      server.middlewares.use('/__playground/project-files', (request, response, next) => {
        if (request.method !== 'GET') {
          next();
          return;
        }

        try {
          const files = collectProjectFiles(__dirname);
          response.statusCode = 200;
          response.setHeader('Content-Type', 'application/json; charset=utf-8');
          response.setHeader('Cache-Control', 'no-store');
          response.end(
            JSON.stringify({
              exportedAt: new Date().toISOString(),
              fileCount: files.length,
              files,
            })
          );
        } catch (error) {
          response.statusCode = 500;
          response.setHeader('Content-Type', 'application/json; charset=utf-8');
          response.end(JSON.stringify({error: (error as Error).message}));
        }
      });
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [
      appliedSourceOverlay(),
      appliedScriptsModule(),
      appliedScriptsEndpoint(),
      react(),
      tailwindcss(),
      projectFilesModule(),
      liveProjectFilesEndpoint(),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
    preview: {
      allowedHosts: ['.trycloudflare.com'],
    },
  };
});
