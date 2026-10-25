import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  FileCode,
  Folder,
  FolderOpen,
  Search,
  X,
  ChevronsDownUp,
  ChevronsUpDown,
} from 'lucide-react';
import { ProjectScriptInfo } from '../../game/RealProjectScripts';
import { scriptRuntimeEngine } from '../../game/ScriptRuntimeEngine';
import { audioSystem } from '../../game/AudioSystem';

interface ExplorerNode {
  id: string;
  label: string;
  kind: 'folder' | 'script';
  children: ExplorerNode[];
  script?: ProjectScriptInfo;
  count: number;
}

interface ScriptExplorerProps {
  scripts: ProjectScriptInfo[];
  selectedScriptId: string;
  onSelect: (id: string) => void;
  isOpen: boolean;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  onRestoreAll: () => void;
}

const FOLDER_ORDER = ['Personagens', 'Sistemas', 'Configurações', 'Interface', 'Jogo'];

const characterLabel = (character?: string): string => {
  if (character === 'agatha') return 'Agatha Harkness';
  if (character === 'ironman') return 'Homem de Ferro';
  if (character === 'vision') return 'Visão';
  return 'Compartilhado';
};

function resolvePath(script: ProjectScriptInfo): string[] {
  const path = script.filePath;

  if (path.startsWith('/src/game/abilities/ironman/')) {
    const leaf = /Config\.ts$/.test(path) ? 'Configurações' : 'Habilidades';
    return ['Personagens', 'Homem de Ferro', leaf];
  }
  if (path.startsWith('/src/game/abilities/agatha/')) {
    const leaf = /Config\.ts$/.test(path) ? 'Configurações' : 'Habilidades';
    return ['Personagens', 'Agatha Harkness', leaf];
  }
  if (path.startsWith('/src/game/abilities/vision/')) {
    const leaf = /Config\.ts$/.test(path) ? 'Configurações' : 'Habilidades';
    return ['Personagens', 'Visão', leaf];
  }
  if (path.startsWith('/src/game/abilities/')) {
    return ['Personagens', 'Compartilhado', 'Habilidades'];
  }
  if (path.startsWith('/src/game/systems/flight/')) {
    return ['Sistemas', 'Voo'];
  }
  if (path.startsWith('/src/game/systems/')) {
    return ['Sistemas'];
  }
  if (path.startsWith('/src/game/config/')) {
    return ['Configurações'];
  }
  if (path.startsWith('/src/components/')) {
    return ['Interface', 'HUD'];
  }

  const fileName = path.split('/').pop() || '';
  const systemLeaves: Record<string, string[]> = {
    'AnimationController.ts': ['Sistemas', 'Animação'],
    'ProjectileSystem.ts': ['Sistemas', 'Projéteis'],
    'TargetDummy.ts': ['Sistemas', 'Combate'],
    'GameplayRestrictions.ts': ['Sistemas', 'Restrições'],
    'GameScene.ts': ['Sistemas', 'Núcleo'],
    'StickmanRig.ts': ['Sistemas', 'Personagem'],
    'AudioSystem.ts': ['Sistemas', 'Áudio'],
  };
  if (systemLeaves[fileName]) return systemLeaves[fileName];

  if (script.category === 'Sistemas') return ['Sistemas'];
  if (script.category === 'Configurações') return ['Configurações'];
  if (script.category === 'Combate') return ['Sistemas', 'Combate'];
  if (script.category === 'Restrições') return ['Sistemas', 'Restrições'];
  if (script.category === 'Interface & HUD') return ['Interface', 'HUD'];
  if (script.category === 'Controladores') return ['Sistemas', 'Controladores'];

  if (script.character) {
    const leaf = script.category === 'Habilidades' ? 'Habilidades' : 'Controladores';
    return ['Personagens', characterLabel(script.character), leaf];
  }

  return ['Jogo'];
}

function buildTree(scripts: ProjectScriptInfo[]): ExplorerNode {
  const root: ExplorerNode = {
    id: 'root',
    label: 'Projeto',
    kind: 'folder',
    children: [],
    count: 0,
  };

  const folderMap = new Map<string, ExplorerNode>([['root', root]]);

  const ensureFolder = (parent: ExplorerNode, label: string): ExplorerNode => {
    const id = `${parent.id}/${label}`;
    const existing = folderMap.get(id);
    if (existing) return existing;

    const folder: ExplorerNode = {
      id,
      label,
      kind: 'folder',
      children: [],
      count: 0,
    };
    parent.children.push(folder);
    folderMap.set(id, folder);
    return folder;
  };

  for (const script of scripts) {
    const segments = resolvePath(script);
    let parent = root;
    for (const segment of segments) {
      parent = ensureFolder(parent, segment);
    }

    parent.children.push({
      id: `script:${script.id}`,
      label: script.name,
      kind: 'script',
      children: [],
      script,
      count: 1,
    });
  }

  const finalize = (node: ExplorerNode): number => {
    if (node.kind === 'script') {
      node.count = 1;
      return 1;
    }

    node.children.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1;
      if (node.id === 'root') {
        const ai = FOLDER_ORDER.indexOf(a.label);
        const bi = FOLDER_ORDER.indexOf(b.label);
        if (ai !== bi) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      }
      return a.label.localeCompare(b.label, 'pt-BR');
    });

    node.count = node.children.reduce((total, child) => total + finalize(child), 0);
    return node.count;
  };

  finalize(root);
  return root;
}

function filterTree(node: ExplorerNode, query: string): ExplorerNode | null {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return node;

  if (node.kind === 'script') {
    const script = node.script!;
    const haystack = [
      script.name,
      script.id,
      script.filePath,
      script.summary,
      ...(script.keywords || []),
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(normalized) ? node : null;
  }

  const children = node.children
    .map((child) => filterTree(child, normalized))
    .filter((child): child is ExplorerNode => child !== null);

  if (children.length === 0) return null;
  return {
    ...node,
    children,
    count: children.reduce((total, child) => total + child.count, 0),
  };
}

function collectFolderIds(node: ExplorerNode, maxDepth: number, depth = 0): string[] {
  if (node.kind === 'script' || depth > maxDepth) return [];
  const ids = [node.id];
  for (const child of node.children) {
    ids.push(...collectFolderIds(child, maxDepth, depth + 1));
  }
  return ids;
}

function collectAncestors(node: ExplorerNode, targetPath: string, trail: string[] = []): string[] {
  if (node.id === targetPath) return trail;
  for (const child of node.children) {
    if (child.kind === 'folder') {
      const found = collectAncestors(child, targetPath, [...trail, node.id]);
      if (found.length > 0) return found;
    } else if (child.id === `script:${targetPath}`) {
      return [...trail, node.id];
    }
  }
  return [];
}

function statusFor(script: ProjectScriptInfo) {
  const status = scriptRuntimeEngine.getScriptStatus(script.id);
  const state = scriptRuntimeEngine.getScriptState(script.id);
  const hasApplied = status.status === 'applied';
  const hasRestartApplied = state.capability === 'restart-required' && state.appliedSource !== null;
  const hasError = status.status === 'error';
  const needsRestart = (script.runtimeIntegration || 'hot-swap') !== 'hot-swap';

  if (hasError) return { color: 'bg-rose-500', title: 'Erro na compilação' };
  if (hasApplied) return { color: 'bg-emerald-500', title: 'Aplicado e ativo no jogo' };
  if (hasRestartApplied) {
    return { color: 'bg-cyan-500', title: 'Aplicado para o próximo build/reinício' };
  }
  if (needsRestart) return { color: 'bg-amber-500', title: 'Exige reinicialização do jogo' };
  return { color: 'bg-zinc-600', title: 'Pendente' };
}

export const ScriptExplorer: React.FC<ScriptExplorerProps> = ({
  scripts,
  selectedScriptId,
  onSelect,
  isOpen,
  mobileOpen,
  onCloseMobile,
  searchQuery,
  onSearchQueryChange,
  onRestoreAll,
}) => {
  const [width, setWidth] = useState<number>(() => {
    const saved = Number(window.localStorage.getItem('build-scripter-explorer-width'));
    return Number.isFinite(saved) && saved >= 220 && saved <= 480 ? saved : 300;
  });
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const initializedRef = useRef(false);
  const dragStateRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const tree = useMemo(() => buildTree(scripts), [scripts]);
  const filteredTree = useMemo(() => filterTree(tree, searchQuery), [tree, searchQuery]);

  useEffect(() => {
    window.localStorage.setItem('build-scripter-explorer-width', String(width));
  }, [width]);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    setExpanded(new Set(collectFolderIds(tree, 1)));
  }, [tree]);

  useEffect(() => {
    if (!selectedScriptId) return;
    const ancestors = collectAncestors(tree, selectedScriptId);
    if (ancestors.length === 0) return;
    setExpanded((prev) => {
      const next = new Set(prev);
      for (const id of ancestors) next.add(id);
      return next;
    });
  }, [selectedScriptId, tree]);

  useEffect(() => {
    if (!searchQuery.trim() || !filteredTree) return;
    setExpanded(new Set(collectFolderIds(filteredTree, 99)));
  }, [searchQuery, filteredTree]);

  const toggleFolder = (id: string) => {
    audioSystem.playUiClick?.();
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleResizeStart = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    dragStateRef.current = { startX: event.clientX, startWidth: width };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMove = (moveEvent: PointerEvent) => {
      const drag = dragStateRef.current;
      if (!drag) return;
      const next = Math.min(480, Math.max(220, drag.startWidth + moveEvent.clientX - drag.startX));
      setWidth(next);
    };

    const onUp = () => {
      dragStateRef.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const renderNode = (node: ExplorerNode, depth: number): React.ReactNode => {
    if (node.kind === 'script') {
      const script = node.script!;
      const isSelected = script.id === selectedScriptId;
      const status = statusFor(script);

      return (
        <button
          key={node.id}
          onClick={() => {
            audioSystem.playUiClick?.();
            onSelect(script.id);
          }}
          className={`group w-full text-left rounded flex items-center gap-1.5 pr-2 py-1 transition-colors ${
            isSelected
              ? 'bg-[#27272a] text-white'
              : 'hover:bg-[#18181b] text-[#d4d4d8]'
          }`}
          style={{ paddingLeft: `${8 + depth * 14}px` }}
          title={`${script.filePath}\n${script.summary}`}
        >
          <FileCode
            size={14}
            className={`shrink-0 ${
              script.character === 'agatha'
                ? 'text-purple-400'
                : script.character === 'ironman'
                ? 'text-cyan-400'
                : script.character === 'vision'
                ? 'text-yellow-300'
                : 'text-[#a1a1aa]'
            }`}
          />
          <span className="min-w-0 flex-1">
            <span className="block text-[11px] font-medium truncate leading-tight">{node.label}</span>
            <span className="block text-[9px] text-[#71717a] font-mono truncate">
              {script.filePath.split('/').pop()}
            </span>
          </span>
          <span
            className={`w-1.5 h-1.5 rounded-full shrink-0 ${status.color}`}
            title={status.title}
          />
        </button>
      );
    }

    const isExpanded = expanded.has(node.id);
    return (
      <div key={node.id}>
        <button
          onClick={() => toggleFolder(node.id)}
          className="w-full text-left rounded flex items-center gap-1 pr-2 py-1 hover:bg-[#18181b] text-[#d4d4d8] transition-colors"
          style={{ paddingLeft: `${6 + depth * 14}px` }}
        >
          {isExpanded ? (
            <ChevronDown size={13} className="shrink-0 text-[#71717a]" />
          ) : (
            <ChevronRight size={13} className="shrink-0 text-[#71717a]" />
          )}
          {isExpanded ? (
            <FolderOpen size={14} className="shrink-0 text-amber-400/90" />
          ) : (
            <Folder size={14} className="shrink-0 text-amber-400/70" />
          )}
          <span className="flex-1 min-w-0 truncate text-[11px] font-medium">{node.label}</span>
          <span className="text-[9px] text-[#71717a] tabular-nums">{node.count}</span>
        </button>
        {isExpanded && (
          <div className="relative">
            <div
              className="absolute top-0 bottom-0 border-l border-[#27272a]"
              style={{ left: `${13 + depth * 14}px` }}
            />
            {node.children.map((child) => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  const visibility = mobileOpen
    ? 'fixed inset-y-0 left-0 z-40 flex shadow-2xl'
    : isOpen
    ? 'hidden relative md:flex'
    : 'hidden';

  return (
    <aside
      className={`border-r border-[#27272a] bg-[#101013] flex-col shrink-0 transition-transform ${visibility}`}
      style={{ width: mobileOpen ? 'min(340px, 86vw)' : width }}
      aria-label="Explorador de scripts"
    >
      <div className="p-2.5 border-b border-[#27272a]">
        {mobileOpen && (
          <div className="flex items-center justify-between mb-2 md:hidden">
            <span className="text-[11px] font-semibold text-white tracking-wide">
              Explorador de Scripts
            </span>
            <button
              onClick={onCloseMobile}
              className="p-1 rounded hover:bg-[#18181b] text-[#a1a1aa] hover:text-white"
              title="Fechar explorador"
              aria-label="Fechar explorador"
            >
              <X size={14} />
            </button>
          </div>
        )}
        <div className="relative">
          <Search
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#71717a]"
          />
          <input
            type="text"
            placeholder="Buscar scripts, pastas, habilidades..."
            value={searchQuery}
            onChange={(event) => onSearchQueryChange(event.target.value)}
            className="w-full bg-[#18181b] border border-[#27272a] rounded px-2.5 pl-8 pr-8 py-1.5 text-xs text-white placeholder-[#71717a] focus:outline-none focus:border-zinc-500"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchQueryChange('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#71717a] hover:text-white"
              title="Limpar busca"
            >
              <X size={13} />
            </button>
          )}
        </div>
        <div className="flex items-center justify-between mt-1.5 text-[10px] text-[#71717a]">
          <span>{scripts.length} módulos</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setExpanded(new Set(collectFolderIds(tree, 99)))}
              className="p-1 rounded hover:bg-[#18181b] hover:text-white"
              title="Expandir tudo"
            >
              <ChevronsUpDown size={12} />
            </button>
            <button
              onClick={() => setExpanded(new Set())}
              className="p-1 rounded hover:bg-[#18181b] hover:text-white"
              title="Recolher tudo"
            >
              <ChevronsDownUp size={12} />
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-1.5 font-sans">
        {!filteredTree || filteredTree.children.length === 0 ? (
          <div className="text-center py-8 text-xs text-[#71717a]">Nenhum script encontrado</div>
        ) : (
          filteredTree.children.map((child) => renderNode(child, 0))
        )}
      </div>

      <div className="p-2 border-t border-[#27272a] text-[10px] text-[#71717a] flex items-center justify-between">
        <span className="truncate">
          {searchQuery.trim() ? `${filteredTree?.count ?? 0} encontrados` : 'Hierarquia do projeto'}
        </span>
        <button
          onClick={onRestoreAll}
          className="text-[#a1a1aa] hover:text-amber-400 transition-colors underline decoration-dotted shrink-0 ml-2"
          title="Restaurar todos os scripts para o padrão de fábrica"
        >
          Restaurar Todos
        </button>
      </div>

      <div
        onPointerDown={handleResizeStart}
        className="hidden md:block absolute top-0 bottom-0 right-0 w-1.5 cursor-col-resize hover:bg-cyan-500/40 active:bg-cyan-500/60"
        style={{ position: 'absolute' }}
        title="Arraste para redimensionar o explorador"
      />
    </aside>
  );
};
