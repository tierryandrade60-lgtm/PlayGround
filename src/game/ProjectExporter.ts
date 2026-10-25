/**
 * ProjectExporter.ts
 * Builds a complete, dynamic source ZIP from the project files that are
 * actually loaded by the application plus the live Build Script / Build Mode
 * state. No server is required.
 */

import { strToU8, unzipSync, zip } from 'fflate';
import projectFilesSnapshot from 'virtual:project-files';
import { scriptRuntimeEngine } from './ScriptRuntimeEngine';
import { liveConfigManager } from './LiveConfigManager';
import { settingsManager } from './SettingsManager';
import { activeAgathaConfig } from './abilities/agatha/AgathaConfig';
import { activeIronManConfig } from './abilities/ironman/IronManConfig';

export interface ExportProgress {
  stage: string;
  current?: number;
  total?: number;
}

export type PendingScriptReason =
  | 'draft-not-applied'
  | 'saved-not-applied'
  | 'applied-not-running'
  | 'restart-required-draft';

export type ScriptVersionKind = 'original' | 'running' | 'applied' | 'saved' | 'draft';

export type ExportValidationStatus =
  | 'runtime-confirmed'
  | 'applied-not-confirmed-running'
  | 'validated'
  | 'not-validated'
  | 'catalog-original'
  | 'error'
  | 'not-applicable';

export interface ContentHash {
  algorithm: 'SHA-256' | 'FNV-1a-32';
  value: string;
}

export interface ScriptVersionStateManifest {
  present: boolean;
  hash: ContentHash | null;
}

export interface ScriptStatesManifest {
  original: ScriptVersionStateManifest;
  draft: ScriptVersionStateManifest;
  saved: ScriptVersionStateManifest;
  validated: ScriptVersionStateManifest;
  applied: ScriptVersionStateManifest;
  running: ScriptVersionStateManifest;
  exported: ScriptVersionStateManifest;
}

export interface ExportedFileManifest {
  path: string;
  size: number;
  hash: ContentHash;
  source:
    | 'project'
    | 'public-asset'
    | 'script'
    | 'generated'
    | 'pending-version'
    | 'catalog-archive'
    | 'build-script-doc';
  version: ScriptVersionKind | 'generated';
  scriptId?: string;
  states?: ScriptStatesManifest;
  pending?: boolean;
  pendingReason?: PendingScriptReason;
  validation: ExportValidationStatus;
  divergenceReasons?: string[];
  catalogChangedSinceCustomization?: boolean;
  catalogOriginalArchived?: string;
  note?: string;
}

interface FileManifestMeta {
  source: ExportedFileManifest['source'];
  version: ScriptVersionKind | 'generated';
  scriptId?: string;
  states?: ScriptStatesManifest;
  pending?: boolean;
  pendingReason?: PendingScriptReason;
  validation?: ExportValidationStatus;
  divergenceReasons?: string[];
  catalogChangedSinceCustomization?: boolean;
  catalogOriginalArchived?: string;
  note?: string;
}

export interface PendingScriptExport {
  id: string;
  name: string;
  filePath: string;
  reason: PendingScriptReason;
  archivedPath: string;
}

export interface ProjectExportResult {
  filename: string;
  fileCount: number;
  discoveredFileCount: number;
  byteLength: number;
  projectSource: 'dev-server' | 'bundled';
  pendingScripts: PendingScriptExport[];
  divergences: string[];
  warnings: string[];
  excluded: string[];
}

interface ProjectFileEntry {
  path: string;
  encoding: 'utf8' | 'base64' | 'url';
  content: string;
}

export interface ProjectExportOptions {
  buildModeSceneJson?: string | null;
  onProgress?: (progress: ExportProgress) => void;
}

const EXPORT_FILENAME = 'MeuJogo-Source.zip';

const REQUIRED_FILES = [
  'package.json',
  'index.html',
  'tsconfig.json',
  'vite.config.ts',
  'src/main.tsx',
  'src/App.tsx',
  'src/game/ScriptRuntimeEngine.ts',
  'src/game/ProjectExporter.ts',
  'README.md',
  '.env.example',
];

const EXCLUDED = [
  'node_modules/ (dependências instaladas)',
  'dist/ (saída de build)',
  '.git/ (histórico do repositório)',
  '.agents/ e .opencode/ (ferramentas locais de desenvolvimento)',
  'caches, arquivos temporários e logs',
  '.env, .env.* (exceto .env.example), chaves privadas e credenciais',
];

function normalizePath(input: string): string | null {
  const normalized = input.replace(/\\/g, '/').replace(/^\/+/, '').trim();
  if (!normalized || normalized.includes('\0')) return null;
  const parts = normalized.split('/');
  if (parts.some((part) => part === '..' || part === '')) return null;
  if (parts[0] === 'node_modules' || parts[0] === 'dist' || parts[0] === '.git') return null;
  return parts.join('/');
}

function sanitizeEnvExample(source: string): string {
  const sanitized = source
    .split('\n')
    .map((line) => {
      const match = line.match(/^(\s*)([A-Za-z0-9_]+)(\s*=\s*)(.*)$/);
      if (!match) return line;
      const key = match[2];
      if (!/(KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|PRIVATE)/i.test(key)) return line;
      return `${match[1]}${key}${match[3]}`;
    })
    .join('\n');

  return `${sanitized.trim()}\n\n# Preencha localmente. Nunca versione credenciais reais.\n`;
}

function jsonLiteral(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function buildOverridesModule(): string {
  const snapshot = {
    exportedAt: new Date().toISOString(),
    liveConfig: liveConfigManager.get(),
    settings: settingsManager.get(),
    agatha: activeAgathaConfig,
    ironman: activeIronManConfig,
  };

  return `/**
 * Generated by the in-game project exporter.
 * These values reproduce the live configuration at export time in a fresh
 * browser profile. Existing local storage always takes precedence.
 */

import { liveConfigManager } from '../LiveConfigManager';
import { settingsManager } from '../SettingsManager';
import { updateAgathaConfig } from '../abilities/agatha/AgathaConfig';
import { updateIronManConfig } from '../abilities/ironman/IronManConfig';

export interface BuildScriptOverridesData {
  exportedAt?: string;
  liveConfig?: Record<string, unknown>;
  settings?: Record<string, unknown>;
  agatha?: Record<string, unknown>;
  ironman?: Record<string, unknown>;
}

export const BUILD_SCRIPT_OVERRIDES: BuildScriptOverridesData = ${jsonLiteral(snapshot)};

export function applyBuildScriptOverrides(): void {
  const overrides = BUILD_SCRIPT_OVERRIDES;
  if (!overrides || Object.keys(overrides).length === 0) return;

  try {
    if (overrides.liveConfig && !localStorage.getItem('stickman_live_game_config')) {
      liveConfigManager.update(overrides.liveConfig as never);
    }
    if (overrides.settings && !localStorage.getItem('stickman_settings_v2')) {
      settingsManager.update(overrides.settings as never);
    }
    if (overrides.agatha && !localStorage.getItem('stickman_agatha_config_v2')) {
      updateAgathaConfig(overrides.agatha as never);
    }
    if (overrides.ironman && !localStorage.getItem('stickman_ironman_config_v2')) {
      updateIronManConfig(overrides.ironman as never);
    }
  } catch (error) {
    console.warn('[BuildScriptOverrides] Failed to apply exported defaults:', error);
  }
}
`;
}

function buildSceneModule(scene: unknown): string {
  return `/**
 * Generated by the in-game project exporter.
 * Reproduces the latest Build Mode scene when no local scene is stored.
 */

import type { SerializedSceneBuild } from '../BuildTypes';

export const BUILD_MODE_SCENE: SerializedSceneBuild | null = ${
    scene ? jsonLiteral(scene) : 'null'
  };
`;
}

function buildReadme(readmeSource: string): string {
  return `${readmeSource.trim()}

---

## Exportação dinâmica do projeto

Este ZIP foi gerado pelo botão de download da interface do jogo e contém o
código-fonte carregado naquele momento, incluindo as alterações do Build Script.

### Instalação e execução

1. Extraia este ZIP.
2. Copie \`.env.example\` para \`.env.local\` e preencha apenas as variáveis
   necessárias no seu ambiente. Nunca versione credenciais.
3. Instale as dependências com \`npm install\` (ou \`npm ci\` com o lockfile).
4. Execute \`npm run dev\` para desenvolvimento ou \`npm run build\` para gerar
   a versão de produção.
5. Verifique os tipos com \`npm run lint\`.

### Build Script

- Os arquivos em \`src/game\` e \`src/components\` contêm a versão escolhida pelo
  exportador: em execução > aplicada > salva > rascunho > original. Versões
  salvas que ainda não foram aplicadas são exportadas como fonte para que a
  alteração não seja perdida; o manifesto marca \`notApplied: true\`.
- Rascunhos e versões aplicadas que não são a principal são preservados em
  \`build-script/pending/\` e listados em \`build-script/export-manifest.json\`.
- O original de qualquer script personalizado é preservado em
  \`build-script/catalog/original/\`, mesmo quando a versão principal é outra.
- Tudo em \`build-script/\` é histórico: essas cópias são excluídas do
  \`tsconfig.json\` e não entram no bundle executável.
- Módulos estruturais (\`game-scene\`, \`stickman-rig\`, \`audio-system\`) não
  aceitam hot-swap. O rascunho é persistido; para executar, use o botão de
  exportação, extraia o ZIP, rode \`npm install\` e gere um novo build.
- \`src/game/generated/BuildScriptOverrides.ts\` e
  \`src/game/generated/BuildModeDefaults.ts\` contêm as configurações e a cena
  do Build Mode no momento da exportação. O armazenamento local existente tem
  precedência em tempo de execução.
- O manifesto registra, para cada arquivo, caminho, tamanho, hash SHA-256
  (ou FNV-1a quando Web Crypto não estiver disponível), origem, estados de
  versão, pendências, validação e motivo de divergência.

### Sincronização entre IA, Build Script e jogo

- Alterações externas feitas por IA/dev em arquivos do projeto entram no jogo
  no próximo carregamento ou build. Em desenvolvimento, recarregue a página.
- Se já existir uma versão personalizada em execução/aplicada/salva/rascunho,
  ela permanece como principal para reproduzir o comportamento real. A nova
  versão original do catálogo é guardada em \`build-script/catalog/original/\`
  e o manifesto registra a divergência com \`catalogChangedSinceCustomization\`.
- Módulos estruturais não aceitam hot-swap. O fluxo completo é: salvar/aplicar,
  baixar o ZIP, instalar dependências, gerar um novo build e abrir esse build.

### Continuidade do desenvolvimento

- Preserve os singletons e os pontos de integração em \`src/game/ScriptRuntimeEngine.ts\`.
- Em desenvolvimento (\`npm run dev\`), o download lê os arquivos do disco no
  momento do clique. Em um build estático, ele usa o snapshot compilado nesse
  build; gere um novo build para incluir alterações feitas depois dele.
- O ZIP é validado internamente antes do download: arquivos obrigatórios,
  contagem e tamanho de cada entrada são conferidos.
- Use \`npm run lint\` e \`npm run build\` antes de publicar alterações.
- Valide um ZIP baixado com
  \`npm run test:export -- caminho/MeuJogo-Source.zip\`. O verificador confere
  presença dos arquivos do projeto, conteúdo das origens, hashes do manifesto,
  versões pendentes, originais arquivados e possíveis credenciais.
- O projeto não possui backend próprio neste ZIP. Se recursos externos forem
  adicionados, documente aqui as credenciais e os passos de recuperação.
`;
}

async function loadLiveProjectFiles(): Promise<ProjectFileEntry[] | null> {
  try {
    const response = await fetch('/__playground/project-files', { cache: 'no-store' });
    if (!response.ok) return null;
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) return null;
    const payload = (await response.json()) as { files?: ProjectFileEntry[] };
    if (!Array.isArray(payload.files) || payload.files.length === 0) return null;
    return payload.files;
  } catch {
    return null;
  }
}

function findTextFile(entries: ProjectFileEntry[], filePath: string, fallback = ''): string {
  const entry = entries.find((file) => file.path === filePath);
  return entry && entry.encoding === 'utf8' ? entry.content : fallback;
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function resolvePublicUrl(url: string): string {
  const base = import.meta.env.BASE_URL || '/';
  if (!url.startsWith('/') || base === '/') return url;
  return `${base.replace(/\/$/, '')}${url}`;
}

function validateArchive(
  data: Uint8Array,
  files: Record<string, Uint8Array>,
  discoveredPaths: string[]
): void {
  const extracted = unzipSync(data);
  const problems: string[] = [];

  for (const [filePath, expected] of Object.entries(files)) {
    const actual = extracted[filePath];
    if (!actual) {
      problems.push(`entrada ausente: ${filePath}`);
    } else if (actual.byteLength !== expected.byteLength) {
      problems.push(
        `tamanho divergente: ${filePath} (${actual.byteLength} != ${expected.byteLength})`
      );
    } else {
      for (let i = 0; i < expected.byteLength; i += 1) {
        if (actual[i] !== expected[i]) {
          problems.push(`conteúdo divergente: ${filePath}`);
          break;
        }
      }
    }
  }

  const extractedCount = Object.keys(extracted).length;
  const expectedCount = Object.keys(files).length;
  if (extractedCount !== expectedCount) {
    problems.push(`contagem de entradas divergente (${extractedCount} != ${expectedCount})`);
  }

  for (const required of REQUIRED_FILES) {
    const actual = extracted[required];
    if (!actual || actual.byteLength === 0) {
      problems.push(`arquivo obrigatório ausente ou vazio: ${required}`);
    }
  }

  for (const discovered of discoveredPaths) {
    if (!extracted[discovered]) problems.push(`arquivo do projeto não exportado: ${discovered}`);
  }

  if (problems.length > 0) {
    throw new Error(`ZIP inválido: ${problems.slice(0, 8).join('; ')}`);
  }
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => resolve());
    } else {
      setTimeout(resolve, 0);
    }
  });
}

function fallbackHash(bytes: Uint8Array): ContentHash {
  let hash = 2166136261;
  for (let i = 0; i < bytes.length; i += 1) {
    hash ^= bytes[i];
    hash = Math.imul(hash, 16777619);
  }
  return { algorithm: 'FNV-1a-32', value: (hash >>> 0).toString(16).padStart(8, '0') };
}

async function hashBytes(bytes: Uint8Array): Promise<ContentHash> {
  const subtle = globalThis.crypto?.subtle;
  if (subtle) {
    try {
      const digest = await subtle.digest('SHA-256', bytes as unknown as BufferSource);
      return {
        algorithm: 'SHA-256',
        value: Array.from(new Uint8Array(digest))
          .map((byte) => byte.toString(16).padStart(2, '0'))
          .join(''),
      };
    } catch {
      // Non-secure contexts and old WebViews may not expose SHA-256.
    }
  }
  return fallbackHash(bytes);
}

function validationFor(
  state: ReturnType<typeof scriptRuntimeEngine.getScriptState>,
  sourceKind: ScriptVersionKind,
  source: string
): ExportValidationStatus {
  if (sourceKind === 'running') return 'runtime-confirmed';
  if (sourceKind === 'applied') return 'applied-not-confirmed-running';
  if (sourceKind === 'original') return 'catalog-original';
  if (state.error && state.draftSource === source) return 'error';
  if (state.validatedSource !== null && state.validatedSource === source) return 'validated';
  return 'not-validated';
}

function compress(files: Record<string, Uint8Array>): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    zip(files, { level: 6 }, (error, data) => {
      if (error) reject(error);
      else resolve(data);
    });
  });
}

function triggerDownload(data: Uint8Array): void {
  const blob = new Blob([data as BlobPart], { type: 'application/zip' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = EXPORT_FILENAME;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export async function exportProjectZip(options: ProjectExportOptions = {}): Promise<ProjectExportResult> {
  await scriptRuntimeEngine.whenReady();

  const files: Record<string, Uint8Array> = {};
  const fileMeta = new Map<string, FileManifestMeta>();
  const pendingScripts: PendingScriptExport[] = [];
  const catalogArchives: Array<{
    scriptId: string;
    name: string;
    filePath: string;
    archivedPath: string;
  }> = [];
  const divergences: string[] = [];
  const warnings: string[] = [];
  const hashCache = new Map<string, Promise<ContentHash>>();

  const hashText = (text: string): Promise<ContentHash> => {
    let hashed = hashCache.get(text);
    if (!hashed) {
      hashed = hashBytes(strToU8(text));
      hashCache.set(text, hashed);
    }
    return hashed;
  };

  const addText = (
    filePath: string,
    content: string,
    meta: FileManifestMeta = { source: 'project', version: 'original' }
  ): boolean => {
    const safe = normalizePath(filePath);
    if (!safe) {
      warnings.push(`Caminho ignorado por segurança: ${filePath}`);
      return false;
    }
    files[safe] = strToU8(content);
    fileMeta.set(safe, meta);
    return true;
  };

  const addBinary = async (
    filePath: string,
    url: string,
    meta: FileManifestMeta = { source: 'public-asset', version: 'original' }
  ): Promise<void> => {
    const safe = normalizePath(filePath);
    if (!safe) return;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Não foi possível ler ${filePath} (HTTP ${response.status}).`);
    }
    files[safe] = new Uint8Array(await response.arrayBuffer());
    fileMeta.set(safe, meta);
  };

  options.onProgress?.({ stage: 'Descobrindo estrutura do projeto', current: 0, total: 1 });

  const liveFiles = await loadLiveProjectFiles();
  const projectSource: ProjectExportResult['projectSource'] = liveFiles ? 'dev-server' : 'bundled';
  const discoveredFiles = (liveFiles || (projectFilesSnapshot as ProjectFileEntry[])).slice();
  const discoveredPaths: string[] = [];
  let assetIndex = 0;

  for (const file of discoveredFiles) {
    const safe = normalizePath(file.path);
    if (!safe) {
      warnings.push(`Caminho ignorado por segurança: ${file.path}`);
      continue;
    }

    discoveredPaths.push(safe);
    if (file.encoding === 'url') {
      options.onProgress?.({
        stage: 'Copiando recursos locais',
        current: assetIndex,
        total: discoveredFiles.length,
      });
      await addBinary(safe, resolvePublicUrl(file.content), {
        source: 'public-asset',
        version: 'original',
        note: 'Recurso local copiado do diretório public/.',
      });
    } else if (file.encoding === 'base64') {
      files[safe] = decodeBase64(file.content);
      fileMeta.set(safe, {
        source: 'project',
        version: 'original',
        note: 'Arquivo binário local preservado sem alteração.',
      });
    } else {
      files[safe] = strToU8(file.content);
      fileMeta.set(safe, { source: 'project', version: 'original' });
    }
    assetIndex += 1;
  }

  const envExampleSource =
    findTextFile(discoveredFiles, '.env.example') ||
    'GEMINI_API_KEY=""\nAPP_URL="http://localhost:3000"\n';
  addText('.env.example', sanitizeEnvExample(envExampleSource), {
    source: 'generated',
    version: 'generated',
    validation: 'not-applicable',
    note: 'Credenciais removidas; apenas nomes de variáveis preservados.',
  });

  options.onProgress?.({ stage: 'Sincronizando Build Script', current: 0, total: 1 });

  const scriptManifest: Array<Record<string, unknown>> = [];
  const exportedScripts: Array<{ id: string; source: string }> = [];
  let scriptIndex = 0;
  const scripts = scriptRuntimeEngine.getScripts();

  for (const script of scripts) {
    const state = scriptRuntimeEngine.getScriptState(script.id);
    const requiresRestart = state.capability === 'restart-required';
    const scriptDivergences: string[] = [];
    const noteDivergence = (message: string) => {
      divergences.push(message);
      scriptDivergences.push(message);
    };
    let source = state.originalSource;
    let sourceKind: ScriptVersionKind = 'original';

    if (state.runningSource !== null) {
      source = state.runningSource;
      sourceKind = 'running';
    } else if (state.appliedSource !== null) {
      source = state.appliedSource;
      sourceKind = 'applied';
      noteDivergence(
        requiresRestart
          ? `${script.name}: versão aplicada exportada para o próximo build/reinício; ela ainda não está em execução nesta sessão.`
          : `${script.name}: código aplicado sem confirmação de execução; o ZIP usa a versão aplicada.`
      );
    } else if (state.savedSource !== null && state.savedSource !== state.originalSource) {
      noteDivergence(
        `${script.name}: versão salva não aplicada foi preservada em build-script/pending; o arquivo principal continua original para não executar código não aprovado.`
      );
    } else if (state.draftSource !== state.originalSource) {
      noteDivergence(
        `${script.name}: rascunho não aplicado foi preservado em build-script/pending; somente versões aplicadas entram no código executável.`
      );
    }

    const safePath = normalizePath(script.filePath);
    if (!safePath) {
      warnings.push(`${script.name}: caminho de arquivo inválido (${script.filePath}).`);
      continue;
    }

    const originalVersion = scriptRuntimeEngine
      .getBackups(script.id)
      .find((version) => version.kind === 'original');
    const catalogChangedSinceCustomization =
      !!originalVersion && originalVersion.code !== state.originalSource;
    if (catalogChangedSinceCustomization && state.originalSource !== source) {
      noteDivergence(
        `${script.name}: o arquivo original do catálogo mudou depois da versão ${sourceKind}; a versão ${sourceKind} permanece como principal e a nova versão original foi preservada em build-script/catalog/original/.`
      );
    }

    const versionStateSpecs: Array<{
      key: keyof ScriptStatesManifest;
      text: string | null;
      present: boolean;
    }> = [
      { key: 'original', text: state.originalSource, present: true },
      { key: 'draft', text: state.draftSource, present: state.hasDraftChanges },
      { key: 'saved', text: state.savedSource, present: state.savedSource !== null },
      { key: 'validated', text: state.validatedSource, present: state.validatedSource !== null },
      { key: 'applied', text: state.appliedSource, present: state.appliedSource !== null },
      { key: 'running', text: state.runningSource, present: state.runningSource !== null },
      { key: 'exported', text: source, present: true },
    ];
    const scriptStates = Object.fromEntries(
      await Promise.all(
        versionStateSpecs.map(async ({ key, text, present }) => [
          key,
          {
            present,
            hash: present && text !== null ? await hashText(text) : null,
          },
        ])
      )
    ) as unknown as ScriptStatesManifest;

    let catalogOriginalArchived: string | undefined;
    if (sourceKind !== 'original' && state.originalSource !== source) {
      catalogOriginalArchived = `build-script/catalog/original/${safePath}`;
      if (
        addText(catalogOriginalArchived, state.originalSource, {
          source: 'catalog-archive',
          version: 'original',
          scriptId: script.id,
          states: scriptStates,
          validation: 'catalog-original',
          divergenceReasons: scriptDivergences,
          catalogChangedSinceCustomization,
          note: 'Versão original do catálogo preservada fora do caminho principal.',
        })
      ) {
        catalogArchives.push({
          scriptId: script.id,
          name: script.name,
          filePath: safePath,
          archivedPath: catalogOriginalArchived,
        });
      }
    }

    addText(safePath, source, {
      source: 'script',
      version: sourceKind,
      scriptId: script.id,
      states: scriptStates,
      validation: validationFor(state, sourceKind, source),
      divergenceReasons: scriptDivergences,
      catalogChangedSinceCustomization,
      catalogOriginalArchived,
    });
    exportedScripts.push({ id: script.id, source });

    const archivedContents = new Set<string>();
    const archiveVersion = (
      folder: 'applied' | 'saved' | 'draft',
      text: string | null,
      reason: PendingScriptReason
    ) => {
      if (text === null || text === source || archivedContents.has(text)) return;
      archivedContents.add(text);
      const archivePath = `build-script/pending/${folder}/${safePath}`;
      if (
        !addText(archivePath, text, {
          source: 'pending-version',
          version: folder,
          scriptId: script.id,
          states: scriptStates,
          pending: true,
          pendingReason: reason,
          validation: validationFor(state, folder, text),
          divergenceReasons: scriptDivergences,
          note: 'Versão não usada como principal; preservada para não perder alterações.',
        })
      ) {
        return;
      }
      pendingScripts.push({
        id: script.id,
        name: script.name,
        filePath: safePath,
        reason,
        archivedPath: archivePath,
      });
    };

    if (
      state.appliedSource !== null &&
      state.runningSource !== null &&
      state.appliedSource !== state.runningSource
    ) {
      noteDivergence(
        `${script.name}: a versão aplicada difere da versão em execução. O ZIP usa a versão em execução.`
      );
      archiveVersion('applied', state.appliedSource, 'applied-not-running');
    }

    if (state.savedSource !== null && state.savedSource !== source) {
      archiveVersion('saved', state.savedSource, 'saved-not-applied');
    }

    if (state.draftSource !== source && state.draftSource !== state.savedSource) {
      archiveVersion(
        'draft',
        state.draftSource,
        requiresRestart ? 'restart-required-draft' : 'draft-not-applied'
      );
    }

    scriptManifest.push({
      id: script.id,
      name: script.name,
      filePath: safePath,
      capability: state.capability,
      lifecycle: state.lifecycle,
      exportedSource: sourceKind,
      exportedHash: await hashText(source),
      hasRunningSource: state.runningSource !== null,
      hasAppliedSource: state.appliedSource !== null,
      hasSavedSource: state.savedSource !== null,
      hasUnappliedSaved:
        state.savedSource !== null &&
        state.savedSource !== source &&
        state.savedSource !== state.appliedSource,
      hasUnappliedDraft: state.draftSource !== source,
      notApplied: false,
      requiresRestart,
      validation: validationFor(state, sourceKind, source),
      states: scriptStates,
      catalogChangedSinceCustomization,
      catalogOriginalArchived,
      divergenceReasons: scriptDivergences,
      revision: state.revision,
      updatedAt: state.updatedAt,
    });

    scriptIndex += 1;
    if (scriptIndex % 4 === 0) {
      options.onProgress?.({
        stage: 'Sincronizando Build Script',
        current: scriptIndex,
        total: scripts.length,
      });
      await nextFrame();
    }
  }

  addText('src/game/generated/BuildScriptOverrides.ts', buildOverridesModule(), {
    source: 'generated',
    version: 'generated',
    validation: 'not-applicable',
    note: 'Configurações ao vivo capturadas no momento da exportação.',
  });

  let sceneIncluded = false;
  if (options.buildModeSceneJson) {
    try {
      const scene = JSON.parse(options.buildModeSceneJson);
      if (scene && Array.isArray(scene.objects)) {
        addText('src/game/generated/BuildModeDefaults.ts', buildSceneModule(scene), {
          source: 'generated',
          version: 'generated',
          validation: 'not-applicable',
          note: 'Cena padrão gerada a partir do Build Mode ao vivo.',
        });
        addText('build-mode/scene.json', JSON.stringify(scene, null, 2), {
          source: 'generated',
          version: 'generated',
          validation: 'not-applicable',
          note: 'Cópia JSON da cena do Build Mode.',
        });
        sceneIncluded = true;
      } else {
        warnings.push('Cena do Build Mode inválida; os padrões gerados não foram incluídos.');
      }
    } catch (error) {
      warnings.push(`Falha ao serializar a cena do Build Mode: ${(error as Error).message}`);
    }
  } else {
    warnings.push('Cena do Build Mode indisponível no momento da exportação.');
  }

  const readmeSource =
    findTextFile(discoveredFiles, 'README.md') || '# Stickman Arena\n\nProjeto exportado.';
  addText('README.md', buildReadme(readmeSource), {
    source: 'generated',
    version: 'generated',
    validation: 'not-applicable',
    note: 'README original + instruções de instalação, build e Build Script.',
  });

  addText(
    'build-script/README.md',
    `# Build Script no ZIP

- \`src/\` contém a versão principal executável de cada script, com precedência:
  em execução > aplicada > original. Salvo e rascunho nunca são promovidos
  automaticamente a código executável.
- Versões que não são a principal ficam em \`build-script/pending/\`:
  \`applied/\`, \`saved/\` ou \`draft/\`, preservando o caminho original.
- \`build-script/export-manifest.json\` lista o estado de cada script,
  incluindo \`exportedSource\`, \`states.exported\`, \`notApplied\` e
  \`requiresRestart\`.
- Scripts novos aparecem em \`src/game/user/\`.
- Scripts personalizados removidos não são exportados.
- Para um módulo estrutural executar após extrair o ZIP, clique em
  \`Aplicar no Jogo\` (aplicação para o próximo reinício) antes de exportar.
  Versões apenas salvas continuam em \`pending/\`.
- O original de um script personalizado é preservado em
  \`build-script/catalog/original/\`.
- Todo o diretório \`build-script/\` é histórico e está excluído do
  \`tsconfig.json\`; não faz parte do bundle executável.
- \`files\` no manifesto registra caminho, tamanho, hash, origem, estados,
  pendências, validação e motivo de divergência.
`,
    {
      source: 'build-script-doc',
      version: 'generated',
      validation: 'not-applicable',
      note: 'Documentação das regras de exportação do Build Script.',
    }
  );

  options.onProgress?.({ stage: 'Calculando hashes dos arquivos', current: 0, total: 1 });

  const manifestPath = 'build-script/export-manifest.json';
  const manifestFiles: ExportedFileManifest[] = [];
  let hashIndex = 0;
  for (const filePath of Object.keys(files).sort((a, b) => a.localeCompare(b))) {
    // O manifesto não pode registrar o hash de si mesmo; ele é substituído
    // abaixo e contabilizado separadamente em exportedFileCount.
    if (filePath === manifestPath) continue;
    const meta: FileManifestMeta = fileMeta.get(filePath) || {
      source: 'project',
      version: 'original',
    };
    manifestFiles.push({
      path: filePath,
      size: files[filePath].byteLength,
      hash: await hashBytes(files[filePath]),
      source: meta.source,
      version: meta.version,
      scriptId: meta.scriptId,
      states: meta.states,
      pending: meta.pending ?? false,
      pendingReason: meta.pendingReason,
      validation: meta.validation ?? 'not-applicable',
      divergenceReasons:
        meta.divergenceReasons && meta.divergenceReasons.length > 0
          ? meta.divergenceReasons
          : undefined,
      catalogChangedSinceCustomization: meta.catalogChangedSinceCustomization,
      catalogOriginalArchived: meta.catalogOriginalArchived,
      note: meta.note,
    });
    hashIndex += 1;
    if (hashIndex % 12 === 0) {
      options.onProgress?.({
        stage: 'Calculando hashes dos arquivos',
        current: hashIndex,
        total: Object.keys(files).length,
      });
      await nextFrame();
    }
  }

  const exportedAt = new Date().toISOString();
  const finalFileCount = manifestFiles.length + 1;

  const buildManifest = (
    archiveStatus: 'pending' | 'passed',
    checkedAt: string | null
  ): Record<string, unknown> => ({
    schemaVersion: 3,
    exportedAt,
    filename: EXPORT_FILENAME,
    projectSource,
    discoveredFileCount: discoveredFiles.length,
    exportedFileCount: finalFileCount,
    manifestFileExcludedFromSelfHash: true,
    manifestSelfHashNote:
      'O manifesto não pode conter o hash de si mesmo; todos os outros arquivos exportados são listados em files.',
    archiveValidation: {
      status: archiveStatus,
      checkedAt,
      checkedFiles: finalFileCount,
      checkedDiscoveredFiles: discoveredPaths.length,
      byteForByte: archiveStatus === 'passed',
    },
    sceneIncluded,
    scripts: scriptManifest,
    pendingScripts,
    catalogArchives,
    divergences,
    warnings,
    excluded: EXCLUDED,
    files: manifestFiles,
  });

  const writeManifest = (archiveStatus: 'pending' | 'passed', checkedAt: string | null) => {
    addText(manifestPath, JSON.stringify(buildManifest(archiveStatus, checkedAt), null, 2), {
      source: 'build-script-doc',
      version: 'generated',
      validation: 'not-applicable',
      note: 'Manifesto gerado após a coleta real dos arquivos exportados.',
    });
  };

  writeManifest('pending', null);

  options.onProgress?.({ stage: 'Compactando ZIP', current: 0, total: 1 });
  let data = await compress(files);

  options.onProgress?.({ stage: 'Validando integridade do ZIP', current: 0, total: 1 });
  validateArchive(data, files, discoveredPaths);

  writeManifest('passed', new Date().toISOString());
  options.onProgress?.({ stage: 'Finalizando manifesto validado', current: 0, total: 1 });
  data = await compress(files);
  validateArchive(data, files, discoveredPaths);

  // The success state is reported only after the final archive exists in
  // memory, includes the passed manifest, and every entry was verified.
  scriptRuntimeEngine.markExported(exportedScripts);
  triggerDownload(data);

  return {
    filename: EXPORT_FILENAME,
    fileCount: Object.keys(files).length,
    discoveredFileCount: discoveredFiles.length,
    byteLength: data.byteLength,
    projectSource,
    pendingScripts,
    divergences,
    warnings,
    excluded: EXCLUDED,
  };
}
