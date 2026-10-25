<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/fdaca327-231a-499e-beef-6a09227cebfd

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

---

## Exportação dinâmica do projeto

Este ZIP foi gerado pelo botão de download da interface do jogo e contém o
código-fonte carregado naquele momento, incluindo as alterações do Build Script.

### Instalação e execução

1. Extraia este ZIP.
2. Copie `.env.example` para `.env.local` e preencha apenas as variáveis
   necessárias no seu ambiente. Nunca versione credenciais.
3. Instale as dependências com `npm install` (ou `npm ci` com o lockfile).
4. Execute `npm run dev` para desenvolvimento ou `npm run build` para gerar
   a versão de produção.
5. Verifique os tipos com `npm run lint`.

### Build Script

- Os arquivos em `src/game` e `src/components` contêm a versão escolhida pelo
  exportador: em execução > aplicada > salva > rascunho > original. Versões
  salvas que ainda não foram aplicadas são exportadas como fonte para que a
  alteração não seja perdida; o manifesto marca `notApplied: true`.
- Rascunhos e versões aplicadas que não são a principal são preservados em
  `build-script/pending/` e listados em `build-script/export-manifest.json`.
- O original de qualquer script personalizado é preservado em
  `build-script/catalog/original/`, mesmo quando a versão principal é outra.
- Tudo em `build-script/` é histórico: essas cópias são excluídas do
  `tsconfig.json` e não entram no bundle executável.
- Módulos estruturais (`game-scene`, `stickman-rig`, `audio-system`) não
  aceitam hot-swap. O rascunho é persistido; para executar, use o botão de
  exportação, extraia o ZIP, rode `npm install` e gere um novo build.
- `src/game/generated/BuildScriptOverrides.ts` e
  `src/game/generated/BuildModeDefaults.ts` contêm as configurações e a cena
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
  versão original do catálogo é guardada em `build-script/catalog/original/`
  e o manifesto registra a divergência com `catalogChangedSinceCustomization`.
- Módulos estruturais não aceitam hot-swap. O fluxo completo é: salvar/aplicar,
  baixar o ZIP, instalar dependências, gerar um novo build e abrir esse build.

### Continuidade do desenvolvimento

- Preserve os singletons e os pontos de integração em `src/game/ScriptRuntimeEngine.ts`.
- Em desenvolvimento (`npm run dev`), o download lê os arquivos do disco no
  momento do clique. Em um build estático, ele usa o snapshot compilado nesse
  build; gere um novo build para incluir alterações feitas depois dele.
- O ZIP é validado internamente antes do download: arquivos obrigatórios,
  contagem e tamanho de cada entrada são conferidos.
- Use `npm run lint` e `npm run build` antes de publicar alterações.
- Valide um ZIP baixado com
  `npm run test:export -- caminho/MeuJogo-Source.zip`. O verificador confere
  presença dos arquivos do projeto, conteúdo das origens, hashes do manifesto,
  versões pendentes, originais arquivados e possíveis credenciais.
- O projeto não possui backend próprio neste ZIP. Se recursos externos forem
  adicionados, documente aqui as credenciais e os passos de recuperação.

---

## Exportação dinâmica do projeto

Este ZIP foi gerado pelo botão de download da interface do jogo e contém o
código-fonte carregado naquele momento, incluindo as alterações do Build Script.

### Instalação e execução

1. Extraia este ZIP.
2. Copie `.env.example` para `.env.local` e preencha apenas as variáveis
   necessárias no seu ambiente. Nunca versione credenciais.
3. Instale as dependências com `npm install` (ou `npm ci` com o lockfile).
4. Execute `npm run dev` para desenvolvimento ou `npm run build` para gerar
   a versão de produção.
5. Verifique os tipos com `npm run lint`.

### Build Script

- Os arquivos em `src/game` e `src/components` contêm a versão escolhida pelo
  exportador: em execução > aplicada > salva > rascunho > original. Versões
  salvas que ainda não foram aplicadas são exportadas como fonte para que a
  alteração não seja perdida; o manifesto marca `notApplied: true`.
- Rascunhos e versões aplicadas que não são a principal são preservados em
  `build-script/pending/` e listados em `build-script/export-manifest.json`.
- O original de qualquer script personalizado é preservado em
  `build-script/catalog/original/`, mesmo quando a versão principal é outra.
- Tudo em `build-script/` é histórico: essas cópias são excluídas do
  `tsconfig.json` e não entram no bundle executável.
- Módulos estruturais (`game-scene`, `stickman-rig`, `audio-system`) não
  aceitam hot-swap. O rascunho é persistido; para executar, use o botão de
  exportação, extraia o ZIP, rode `npm install` e gere um novo build.
- `src/game/generated/BuildScriptOverrides.ts` e
  `src/game/generated/BuildModeDefaults.ts` contêm as configurações e a cena
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
  versão original do catálogo é guardada em `build-script/catalog/original/`
  e o manifesto registra a divergência com `catalogChangedSinceCustomization`.
- Módulos estruturais não aceitam hot-swap. O fluxo completo é: salvar/aplicar,
  baixar o ZIP, instalar dependências, gerar um novo build e abrir esse build.

### Continuidade do desenvolvimento

- Preserve os singletons e os pontos de integração em `src/game/ScriptRuntimeEngine.ts`.
- Em desenvolvimento (`npm run dev`), o download lê os arquivos do disco no
  momento do clique. Em um build estático, ele usa o snapshot compilado nesse
  build; gere um novo build para incluir alterações feitas depois dele.
- O ZIP é validado internamente antes do download: arquivos obrigatórios,
  contagem e tamanho de cada entrada são conferidos.
- Use `npm run lint` e `npm run build` antes de publicar alterações.
- Valide um ZIP baixado com
  `npm run test:export -- caminho/MeuJogo-Source.zip`. O verificador confere
  presença dos arquivos do projeto, conteúdo das origens, hashes do manifesto,
  versões pendentes, originais arquivados e possíveis credenciais.
- O projeto não possui backend próprio neste ZIP. Se recursos externos forem
  adicionados, documente aqui as credenciais e os passos de recuperação.
