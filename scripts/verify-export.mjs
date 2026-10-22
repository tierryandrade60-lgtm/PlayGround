import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { unzipSync } from 'fflate';

const ROOT = process.cwd();
const SKIPPED_DIRS = new Set([
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
const SKIPPED_NAMES = new Set([
  '.DS_Store',
  'Thumbs.db',
  '.npmrc',
  '.netrc',
  '.git-credentials',
  'MeuJogo-Source.zip',
]);
const SKIPPED_PATTERNS = [
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
const MANIFEST_PATH = 'build-script/export-manifest.json';
const REQUIRED = [
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
const TEXT_EXTENSIONS = new Set([
  'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'css', 'scss', 'sass', 'less', 'json',
  'jsonc', 'md', 'mdx', 'html', 'htm', 'svg', 'txt', 'csv', 'xml', 'yml',
  'yaml', 'toml', 'ini', 'conf', 'lock', 'glsl', 'vert', 'frag', 'wgsl', 'sh',
  'bat', 'ps1', 'env', 'example',
]);
const TEXT_NAMES = new Set([
  '.gitignore',
  '.gitattributes',
  '.env.example',
  'Dockerfile',
  'Makefile',
  'Procfile',
]);
const SECRET_PATTERNS = [
  /AIza[0-9A-Za-z_-]{20,}/,
  /sk-[A-Za-z0-9]{20,}/,
  /ghp_[A-Za-z0-9]{30,}/,
  /xox[baprs]-[A-Za-z0-9-]{10,}/,
  /AKIA[0-9A-Z]{16}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
];

const errors = [];
const warnings = [];

function fail(message) {
  errors.push(message);
}

function normalize(filePath) {
  return filePath.replace(/\\/g, '/').replace(/^\.\//, '');
}

function isSensitive(relative) {
  const name = path.basename(relative);
  if (relative === '.env.example') return false;
  if (SKIPPED_NAMES.has(name)) return true;
  return SKIPPED_PATTERNS.some((pattern) => pattern.test(relative));
}

function collectProjectFiles(directory = ROOT, relative = '') {
  const result = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    const nextRelative = normalize(path.join(relative, entry.name));
    if (entry.isDirectory()) {
      if (SKIPPED_DIRS.has(entry.name)) continue;
      result.push(...collectProjectFiles(path.join(directory, entry.name), nextRelative));
      continue;
    }
    if (entry.isFile() && !isSensitive(nextRelative)) result.push(nextRelative);
  }
  return result.sort();
}

function fnv1a(buffer) {
  let hash = 2166136261;
  for (const byte of buffer) {
    hash ^= byte;
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function matchesHash(buffer, expected) {
  if (!expected?.algorithm || !expected?.value) return false;
  if (expected.algorithm === 'SHA-256') {
    return crypto.createHash('sha256').update(buffer).digest('hex') === expected.value;
  }
  if (expected.algorithm === 'FNV-1a-32') return fnv1a(buffer) === expected.value;
  return false;
}

function isTextFile(filePath) {
  const name = path.basename(filePath);
  if (TEXT_NAMES.has(name)) return true;
  return TEXT_EXTENSIONS.has(path.extname(filePath).slice(1).toLowerCase());
}

function findZip() {
  const explicit = process.argv[2];
  if (explicit) return path.resolve(explicit);
  const candidates = fs
    .readdirSync(ROOT)
    .filter((name) => /^MeuJogo-Source.*\.zip$/i.test(name))
    .sort();
  return candidates.length > 0 ? path.join(ROOT, candidates.at(-1)) : null;
}

const zipPath = findZip();
if (!zipPath || !fs.existsSync(zipPath)) {
  console.error('Uso: npm run test:export -- caminho/MeuJogo-Source.zip');
  process.exit(1);
}

const archive = unzipSync(fs.readFileSync(zipPath));
const manifestBytes = archive['build-script/export-manifest.json'];
if (!manifestBytes) {
  console.error('Manifesto ausente: build-script/export-manifest.json');
  process.exit(1);
}
const manifest = JSON.parse(Buffer.from(manifestBytes).toString('utf8'));
const archivePaths = Object.keys(archive).sort();
const projectPaths = collectProjectFiles();
const manifestPaths = new Set((manifest.files || []).map((file) => file.path));

if (manifest.schemaVersion !== 3) fail(`schemaVersion inesperado: ${manifest.schemaVersion}`);
if (manifest.archiveValidation?.status !== 'passed') fail('archiveValidation.status não é passed');
if (manifest.exportedFileCount !== archivePaths.length) {
  fail(`exportedFileCount ${manifest.exportedFileCount} != entradas ${archivePaths.length}`);
}
if ((manifest.files || []).length !== archivePaths.length - 1) {
  fail('manifest.files deve listar todos os arquivos, exceto o próprio manifesto');
}

for (const required of REQUIRED) {
  if (!archive[required] || archive[required].byteLength === 0) {
    fail(`arquivo obrigatório ausente ou vazio: ${required}`);
  }
}

if (!archive[MANIFEST_PATH]) fail(`manifesto ausente no ZIP: ${MANIFEST_PATH}`);

for (const projectPath of projectPaths) {
  if (!archive[projectPath]) fail(`arquivo do projeto ausente no ZIP: ${projectPath}`);
  // O manifesto não pode registrar o hash de si mesmo; a contagem em
  // exportedFileCount e a presença no ZIP são verificadas separadamente.
  if (projectPath !== MANIFEST_PATH && !manifestPaths.has(projectPath)) {
    fail(`arquivo sem entrada no manifesto: ${projectPath}`);
  }
}

let checkedHashes = 0;
let checkedSourceContents = 0;
for (const file of manifest.files || []) {
  const data = archive[file.path];
  if (!data) {
    fail(`entrada do manifesto ausente no ZIP: ${file.path}`);
    continue;
  }
  if (file.size !== data.byteLength) fail(`tamanho divergente: ${file.path}`);
  if (!matchesHash(Buffer.from(data), file.hash)) {
    fail(`hash divergente: ${file.path}`);
  } else {
    checkedHashes += 1;
  }

  if (file.source === 'project' || file.source === 'public-asset') {
    const diskPath = path.join(ROOT, file.path);
    if (!fs.existsSync(diskPath)) {
      fail(`arquivo de origem ausente no disco: ${file.path}`);
    } else if (!Buffer.from(data).equals(fs.readFileSync(diskPath))) {
      fail(`conteúdo de origem divergente: ${file.path}`);
    } else {
      checkedSourceContents += 1;
    }
  }

  if (isTextFile(file.path) && !file.path.endsWith('.zip')) {
    const text = Buffer.from(data).toString('utf8');
    for (const pattern of SECRET_PATTERNS) {
      if (pattern.test(text)) fail(`possível segredo em ${file.path}: ${pattern}`);
    }
  }
}

for (const script of manifest.scripts || []) {
  const data = archive[script.filePath];
  if (!data) fail(`script principal ausente: ${script.filePath}`);
  else if (!matchesHash(Buffer.from(data), script.exportedHash)) {
    fail(`hash do script principal divergente: ${script.filePath}`);
  }
  if (script.notApplied) fail(`script principal não aplicado: ${script.filePath}`);
  if (script.exportedSource === 'saved' || script.exportedSource === 'draft') {
    fail(`estado não executável promovido a principal: ${script.filePath}`);
  }
  if (!script.states?.exported?.present) {
    fail(`estado exported ausente no manifesto: ${script.filePath}`);
  } else if (!matchesHash(Buffer.from(data), script.states.exported.hash)) {
    fail(`hash exported divergente: ${script.filePath}`);
  }
}

for (const pending of manifest.pendingScripts || []) {
  if (!archive[pending.archivedPath]) fail(`versão pendente ausente: ${pending.archivedPath}`);
}
for (const catalog of manifest.catalogArchives || []) {
  if (!archive[catalog.archivedPath]) fail(`original arquivado ausente: ${catalog.archivedPath}`);
}

const managedArchivePaths = new Set(
  [
    'build-script/export-manifest.json',
    ...(manifest.pendingScripts || []).map((entry) => entry.archivedPath),
    ...(manifest.catalogArchives || []).map((entry) => entry.archivedPath),
  ]
    .filter(Boolean)
    .map(normalize)
);
const extraPaths = archivePaths.filter(
  (filePath) => !projectPaths.includes(filePath) && !managedArchivePaths.has(filePath)
);
if (extraPaths.length > 0) warnings.push(`artefatos extras: ${extraPaths.join(', ')}`);

const summary = {
  zip: zipPath,
  bytes: fs.statSync(zipPath).size,
  archiveFiles: archivePaths.length,
  projectFiles: projectPaths.length,
  hashesVerified: checkedHashes,
  sourceContentsVerified: checkedSourceContents,
  hashAlgorithms: [...new Set((manifest.files || []).map((file) => file.hash?.algorithm))],
  scripts: manifest.scripts?.length || 0,
  pendingVersions: manifest.pendingScripts?.length || 0,
  catalogArchives: manifest.catalogArchives?.length || 0,
  divergences: manifest.divergences?.length || 0,
  warnings,
};

if (errors.length > 0) {
  console.error(JSON.stringify({ ...summary, errors }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ status: 'PASS', ...summary }, null, 2));
