/// <reference types="vite/client" />

declare module 'virtual:project-files' {
  interface ProjectFile {
    path: string;
    encoding: 'utf8' | 'base64' | 'url';
    content: string;
  }

  const files: ProjectFile[];
  export default files;
}


declare module 'virtual:applied-scripts' {
  interface AppliedScriptSnapshotEntry {
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

  interface AppliedScriptSnapshot {
    version: 1;
    updatedAt: number;
    scripts: AppliedScriptSnapshotEntry[];
  }

  const snapshot: AppliedScriptSnapshot;
  export default snapshot;
}
