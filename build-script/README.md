# Build Script no ZIP

- `src/` contém a versão principal executável de cada script, com precedência:
  em execução > aplicada > original. Salvo e rascunho nunca são promovidos
  automaticamente a código executável.
- Versões que não são a principal ficam em `build-script/pending/`:
  `applied/`, `saved/` ou `draft/`, preservando o caminho original.
- `build-script/export-manifest.json` lista o estado de cada script,
  incluindo `exportedSource`, `states.exported`, `notApplied` e
  `requiresRestart`.
- Scripts novos aparecem em `src/game/user/`.
- Scripts personalizados removidos não são exportados.
- Para um módulo estrutural executar após extrair o ZIP, clique em
  `Aplicar no Jogo` (aplicação para o próximo reinício) antes de exportar.
  Versões apenas salvas continuam em `pending/`.
- O original de um script personalizado é preservado em
  `build-script/catalog/original/`.
- Todo o diretório `build-script/` é histórico e está excluído do
  `tsconfig.json`; não faz parte do bundle executável.
- `files` no manifesto registra caminho, tamanho, hash, origem, estados,
  pendências, validação e motivo de divergência.
