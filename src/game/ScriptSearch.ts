/**
 * ScriptSearch.ts
 * Bilingual (pt-BR / en) search over the script catalog.
 * Handles accent folding, token scoring, PT/EN synonyms, dependency names and
 * full source content.
 */

import type { ProjectScriptInfo } from './RealProjectScripts';

export const SEARCH_SYNONYMS: Record<string, string[]> = {
  camera: ['camera', 'cameras', 'cam', 'fov', 'zoom', 'visao', 'sensibilidade', 'orbita'],
  animation: ['animation', 'animacao', 'animacoes', 'animator', 'cinematica', 'pose'],
  flight: ['flight', 'voo', 'voar', 'flying', 'fly', 'levitacao'],
  damage: ['damage', 'dano', 'danos', 'dps', 'hurt', 'hit', 'impacto'],
  shield: ['shield', 'escudo', 'ward', 'barreira', 'protecao'],
  save: ['save', 'salvar', 'persistence', 'persistencia', 'backup', 'storage', 'armazenamento', 'historico'],
  ability: ['ability', 'habilidade', 'poder', 'poderes', 'spell'],
  attack: ['attack', 'ataque', 'blast', 'rajada', 'basic'],
  movement: ['movement', 'movimento', 'locomotion', 'locomocao', 'walk', 'andar', 'correr', 'run', 'dash', 'esquiva'],
  physics: ['physics', 'fisica', 'gravity', 'gravidade', 'collision', 'colisao', 'knockback', 'impulso'],
  audio: ['audio', 'sound', 'som', 'sons', 'volume', 'music', 'musica'],
  ui: ['ui', 'interface', 'hud', 'botao', 'botoes', 'button', 'buttons', 'joystick', 'reticle', 'mira', 'touch', 'toque', 'mobile'],
  projectile: ['projectile', 'projetil', 'projeteis', 'bolt'],
  missile: ['missile', 'missil', 'misseis', 'volley', 'salva'],
  beam: ['beam', 'raio', 'feixe', 'laser', 'unibeam'],
  target: ['target', 'alvo', 'dummy', 'boneco', 'enemy', 'inimigo', 'training', 'treino'],
  config: ['config', 'configuracao', 'configuration', 'settings', 'ajustes', 'parametros', 'tuning'],
  controller: ['controller', 'controlador', 'coordinator', 'coordenador', 'manager', 'gerenciador'],
  restriction: ['restriction', 'restricao', 'status', 'stun', 'stunned', 'atordoado', 'root', 'anchored', 'invulnerable', 'invulneravel'],
  agatha: ['agatha', 'harkness', 'bruxa', 'witch'],
  arcane: ['arcane', 'arcano', 'chaos', 'caos', 'runic', 'runico', 'magic', 'magia'],
  drain: ['drain', 'dreno', 'sifao', 'lifesteal'],
  choke: ['choke', 'estrangulamento', 'telecinetico', 'telekinetic'],
  shadow: ['shadow', 'sombra', 'step', 'passo', 'teleporte', 'teleport'],
  ironman: ['ironman', 'iron', 'man', 'homem', 'ferro', 'stark', 'tony', 'armor', 'armadura'],
  repulsor: ['repulsor', 'repulsores', 'repulse'],
  speed: ['speed', 'velocidade', 'fast', 'rapido'],
  cooldown: ['cooldown', 'recarga', 'recharge'],
  health: ['health', 'vida', 'saude', 'hp'],
  heal: ['heal', 'cura', 'curar', 'lifesteal'],
  range: ['range', 'alcance', 'distance', 'distancia'],
  world: ['world', 'mundo', 'environment', 'ambiente', 'arena', 'cenario'],
  color: ['color', 'cor', 'cores', 'colors'],
  light: ['light', 'luz', 'iluminacao', 'sun', 'sol'],
  object: ['object', 'objeto', 'part', 'peca', 'block', 'bloco'],
};

const SYNONYM_LOOKUP: Map<string, Set<string>> = (() => {
  const map = new Map<string, Set<string>>();
  for (const group of Object.values(SEARCH_SYNONYMS)) {
    const normalized = group.map(foldText);
    for (const term of normalized) {
      if (!map.has(term)) map.set(term, new Set());
      normalized.forEach((other) => map.get(term)!.add(other));
    }
  }
  return map;
})();

export function foldText(value: string): string {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function expandToken(token: string): string[] {
  const folded = foldText(token);
  const related = SYNONYM_LOOKUP.get(folded);
  if (!related || related.size === 0) return [folded];
  return Array.from(related);
}

export interface ScriptSearchResult {
  script: ProjectScriptInfo;
  score: number;
  matchedFields: string[];
  matchedTerms: string[];
}

function scoreField(haystack: string, terms: string[], weight: number): number {
  if (!haystack) return 0;
  const folded = foldText(haystack);
  let score = 0;
  for (const term of terms) {
    if (!term) continue;
    const index = folded.indexOf(term);
    if (index === -1) continue;
    score += weight;
    if (index === 0 || /[\s/_.-]/.test(folded[index - 1] || '')) score += weight * 0.45;
    if (folded === term) score += weight * 0.8;
  }
  return score;
}

export function searchScripts(
  scripts: ProjectScriptInfo[],
  rawQuery: string,
  category: string | 'Todos'
): ScriptSearchResult[] {
  const query = foldText(rawQuery).trim();
  const tokens = query.split(/\s+/).filter(Boolean);
  const expanded = Array.from(new Set(tokens.flatMap(expandToken)));

  const results: ScriptSearchResult[] = [];
  for (const script of scripts) {
    if (category !== 'Todos' && script.category !== category) continue;

    if (!query) {
      results.push({ script, score: 0, matchedFields: [], matchedTerms: [] });
      continue;
    }

    const matchedFields: string[] = [];
    const matchedTerms = new Set<string>();
    let score = 0;

    const fields: Array<[string, string, number]> = [
      ['nome', script.name, 120],
      ['id', script.id, 100],
      ['caminho', script.filePath, 80],
      ['categoria', script.category, 45],
      ['descrição', script.summary, 40],
      ['dependências', (script.dependencies || []).join(' '), 55],
      ['personagem', script.character || '', 30],
      ['palavras-chave', (script.keywords || []).join(' '), 70],
      ['código', script.originalSource, 12],
    ];

    for (const [field, value, weight] of fields) {
      const fieldScore = scoreField(value, expanded, weight);
      if (fieldScore > 0) {
        matchedFields.push(field);
        score += fieldScore;
        const folded = foldText(value);
        for (const term of expanded) {
          if (term && folded.includes(term)) matchedTerms.add(term);
        }
      }
    }

    // Require every user token to be represented somewhere, otherwise a broad
    // synonym match can return unrelated scripts.
    const foldedAll = foldText(
      [
        script.name,
        script.id,
        script.filePath,
        script.category,
        script.summary,
        (script.dependencies || []).join(' '),
        (script.keywords || []).join(' '),
        script.originalSource,
      ].join(' ')
    );
    const allTokensPresent = tokens.every((token) => {
      const variants = expandToken(token);
      return variants.some((variant) => foldedAll.includes(variant));
    });

    if (allTokensPresent && score > 0) {
      results.push({ script, score, matchedFields, matchedTerms: Array.from(matchedTerms) });
    }
  }

  return results.sort((a, b) => b.score - a.score || a.script.name.localeCompare(b.script.name));
}

/**
 * Escapes untrusted source before it is used in the syntax-highlight overlay.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const KEYWORDS = new Set([
  'abstract', 'as', 'async', 'await', 'break', 'case', 'catch', 'class', 'const', 'constructor',
  'continue', 'declare', 'default', 'delete', 'do', 'else', 'enum', 'export', 'extends', 'false',
  'finally', 'for', 'from', 'function', 'get', 'if', 'implements', 'import', 'in', 'instanceof',
  'interface', 'let', 'new', 'null', 'of', 'private', 'protected', 'public', 'readonly', 'return',
  'set', 'static', 'super', 'switch', 'this', 'throw', 'true', 'try', 'type', 'typeof', 'undefined',
  'var', 'void', 'while', 'with', 'yield',
]);

const TYPE_HINTS = new Set([
  'THREE', 'React', 'TargetDummy', 'StickmanNodes', 'AudioSystem', 'GameScene', 'AnimationController',
  'ProjectileSystem', 'AgathaAbilities', 'IronManAbilities', 'boolean', 'number', 'string', 'void',
]);

/**
 * Lightweight, dependency-free TypeScript highlighter for the editor overlay.
 */
export function highlightTypeScript(source: string): string {
  const pattern =
    /(\/\*[\s\S]*?\*\/|\/\/[^\n]*)|((?:'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`))|(\b\d+(?:\.\d+)?\b)|\b([A-Za-z_$][\w$]*)\b/g;
  let result = '';
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(source)) !== null) {
    result += escapeHtml(source.slice(lastIndex, match.index));
    const [full, comment, string, number, identifier] = match;

    if (comment) {
      result += `<span class="tok-comment">${escapeHtml(comment)}</span>`;
    } else if (string) {
      result += `<span class="tok-string">${escapeHtml(string)}</span>`;
    } else if (number) {
      result += `<span class="tok-number">${escapeHtml(number)}</span>`;
    } else if (identifier) {
      if (KEYWORDS.has(identifier)) {
        result += `<span class="tok-keyword">${escapeHtml(identifier)}</span>`;
      } else if (TYPE_HINTS.has(identifier) || /^[A-Z][A-Za-z0-9_$]*$/.test(identifier)) {
        result += `<span class="tok-type">${escapeHtml(identifier)}</span>`;
      } else if (source[match.index + full.length] === '(') {
        result += `<span class="tok-function">${escapeHtml(identifier)}</span>`;
      } else {
        result += escapeHtml(identifier);
      }
    }
    lastIndex = match.index + full.length;
  }

  result += escapeHtml(source.slice(lastIndex));
  return result;
}
