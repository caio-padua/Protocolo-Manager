# Padcon Conect — Motor Clinico | Protocolos Injetaveis

## Overview

Sistema completo (SaaS) para gerenciamento de protocolos injetaveis em clinica de medicina estetica (Brasil). Monorepo pnpm com TypeScript. Marca interna do produto: **Padcon Conect** (com 1 N); marca VISIVEL ao cliente: **PAXTER** (Clinical Intelligence System). Tagline: "Motor Clinico | Protocolos Injetaveis".

Agente da plataforma: **Dr. Replit Paxter** (renomeado de Dr. Replit Manager em 18/06/2026, decisao do CEO Dr. Caio). Sistema de design proprio documentado na skill `skill-layout-paxter`.

## MAPA DA MEMORIA (sempre ler primeiro)

Este mapa fica SEMPRE carregado no contexto do agente. Cada bloco de conhecimento durável tem
um dono; o agente vai ao dono certo em vez de guardar tudo aqui. Removido do `replit.md` != perdido:
mora num arquivo durável apontado abaixo (e o Git guarda o histórico).

| Conhecimento | Dono (arquivo) | Quando consultar |
|---|---|---|
| Método de trabalho, conduta, decisões de diretriz, COMO O CEO PEDE (Art. 6º-A) | `.agents/skills/paxter-loop/CODIGO-PAXTER.md` (arquitetura viva em artigos) | Antes de toda tarefa não-trivial |
| Loop Especificar→Construir→Revisar | `.agents/skills/paxter-loop/SKILL.md` | Ao iniciar funcionalidade não-trivial |
| Sistema de design (3D, tokens, padrões, controles) | `.agents/skills/skill-layout-paxter/SKILL.md` + `references/` | Antes de criar/redesenhar QUALQUER tela |
| Armadilhas técnicas finas e lições | `.agents/memory/` (índice em `MEMORY.md`) | Antes de implementar; ao aprender algo |
| Funcionalidades e estrutura detalhada (telas, rotas, schemas, integrações Google, portal do cliente) | `docs/PADCOM-FUNCIONALIDADES.md` | Ao mexer numa funcionalidade existente |
| Conceito Raiz — sistemas primos IHE x Manager (deduplicação `id_ihe`, dívidas técnicas Onda 1) | `docs/CONCEITO-RAIZ-PRIMOS.md` | Em qualquer onda de integração/transmutação |
| Alvo escrito de cada funcionalidade | `specs/<nome>.md` | Ao especificar/construir uma onda |
| Cartas para outros primos (IHE, Claude, Manus) | `cartas/` (índice em `cartas/INDEX.md`) | Ao comunicar outro sistema/agente |
| Pack portável das skills (semear/certificar primos) | `paxter-pack/` (README, SEED, MANIFEST) + `scripts` `paxter:pack`/`paxter:audit` | Ao criar um sistema novo ou auditar um existente |
| Briefing técnico longo do PADCOM | `PADCOM_TECHNICAL_BRIEFING.md`, `PADCOM_FULL_TECHNICAL_DOC.md`, `PADCOM_HANDOFF.md` | Handoff/visão geral profunda |
| Diretrizes centrais do CEO (Bíblia) | `DIRETRIZES_CENTRAIS_E_PRE_REQUISITOS_CEO_DR_CAIO_*.md` | Referência das decisões-raiz |

Regra de aprendizado contínuo (Art. 58-60 do Código Paxter): ao fim de cada pedido, o aprendizado
vai ao dono certo deste mapa, nunca fica só na conversa; toda inserção é anunciada ao CEO.

## Branding

- **Marca visível ao cliente**: PAXTER (Clinical Intelligence System) — chrome navy + ouro; símbolo = PaxterSymbolGlass; wordmark = arte oficial (nunca texto digitado). Detalhe na skill `skill-layout-paxter` e nas memórias `paxter-*`.
- **Exceção**: receituário emite como Instituto Padua.
- **Estilo visual**: linguagem 3D skeuomórfica (bevel/well/painel 3D), bordas 6px, MAIUSCULO nos labels KPI, TDAH-friendly (alto contraste, hierarquia clara), sem infantilidades.
- **Status**: verde = concluído (emerald preservado); cor de status NUNCA trocada em massa.

## Stack

- **Monorepo**: pnpm workspaces; Node.js 24; TypeScript 5.9
- **Frontend**: React + Vite + TailwindCSS + shadcn/ui
- **API**: Express 5; validação Zod (`zod/v4`) + `drizzle-zod`; codegen Orval (OpenAPI); build esbuild (ESM)
- **Database**: PostgreSQL + Drizzle ORM
- **PDF**: pdf-lib (geração) + pdfkit (RAS FAP) + node-forge (assinatura A1 ICP-Brasil) + pdf-parse v2 (`PDFParse.getText()`) + tesseract.js (OCR fallback, `pdftoppm` para PDF→PNG) + Puppeteer/Chromium Nix (receituário faixas)

## Key Commands

- `pnpm run typecheck` — typecheck completo (pré-quebrado em tipos gerados; validar por runtime/curl/screenshot)
- `pnpm --filter @workspace/padcom exec tsc -p tsconfig.json --noEmit` — typecheck só do frontend
- `pnpm --filter @workspace/api-spec run codegen` — regenerar hooks e schemas Zod do OpenAPI
- Schema de banco: tabelas novas via SQL direto (nunca `db push` em tabela populada — ver memórias)


## Anexos (attached_assets/) — fora do Git desde 14/08/2026

- `attached_assets/` está no `.gitignore` e foi retirado do índice do Git (`git rm --cached`, arquivos INTACTOS no disco). Motivo: 1 GB de prints/PDFs versionados deixaram o histórico com ~980 MB e o editor/painel Git travando.
- Daqui para frente: anexos enviados no chat continuam caindo em `attached_assets/` no DISCO, mas NÃO entram em commits novos. Nunca fazer `git add -f attached_assets/...`.
- Anexo que precise ser permanente para o produto (logo oficial, fonte, arte de marca) deve ser COPIADO para o lugar certo do código (ex.: `artifacts/*/src/assets/`) e commitado lá.
- O histórico antigo ainda carrega os anexos; encolher exige reescrita de histórico — proposta em `docs/PROPOSTA-ENCOLHER-HISTORICO-GIT.md`, só executar com ordem escrita do CEO (Regra de Ouro).

## GITHUB_PAT — Renovação obrigatória antes do vencimento

O secret `GITHUB_PAT` (Personal Access Token — chave pessoal do GitHub) permite o git push automático.
Quando ele expirar, `git push origin` falha com "Invalid username or token" sem aviso prévio.

**Como verificar se ainda está válido**: `GET /api/health` — campo `integracoes.github_pat` retorna
`conectado`, `expirado_em_breve` (menos de sete dias), ou `erro` (já inválido / expirado).

**Procedimento de renovação** (fazer ANTES da data de vencimento):
1. Acesse github.com → Settings → Developer settings → Personal access tokens → Fine-grained tokens (ou Classic).
2. Gere um novo token com permissão `repo` (leitura e escrita no repositório `caio-padua/Protocolo-Manager`).
3. Copie o novo token.
4. No Replit: painel esquerdo → Secrets → `GITHUB_PAT` → atualize o valor.
5. Reinicie o workflow `artifacts/api-server: API Server` para recarregar o secret.
6. Confirme: `GET /api/health` deve retornar `integracoes.github_pat = "conectado"`.

**Nota**: o push pelo shell (`git push origin`) falha mesmo com PAT válido se o git local não tiver
a credencial configurada. O método aprovado de push é o painel Git do Replit (botão de push na aba Git).

## Estrutura (resumo)

- `artifacts/padcom` — frontend administrativo + Área do Cliente (Vite proxy `/api` → porta 8080)
- `artifacts/api-server` — todas as rotas sob `/api/`; certificado A1 em `certs/assinatura.pfx`
- `artifacts/parxis-site` — site institucional PARXIS
- `lib/db` — schema Drizzle (clientes, protocolos, sessões, exames, catálogo, financeiro, etc.)
- Detalhe tela-a-tela, rotas e integrações: `docs/PADCOM-FUNCIONALIDADES.md`

### `attached_assets/` — anexos do chat NÃO sobem mais para o Git (desde 14/08/2026)

- A pasta chegou a 1.019 MB e o histórico do Git a 979,59 MB, travando editor e painel de versionamento.
- Regra atual: `attached_assets/` está no `.gitignore` — anexo **novo** fica só no disco.
- Nada foi apagado: os 1.157 anexos que já estavam versionados continuam versionados.
- **Arte que a tela precisa exibir** não pode ficar só em `attached_assets` (não vai para produção):
  copiar para a pasta de assets do artefato, por exemplo `artifacts/padcom/src/assets/`.
- Encolher o histórico já existente é outra conversa: exige reescrita de histórico e **ordem escrita do CEO**.

## Working Language

- UI e comunicação com usuário em Português (Brasil)
- Termo: "cliente" (não "paciente")

## Preferencias do Usuario (Dr. Caio) — Como me comunicar

Metodo de trabalho (decisao do CEO, 19/06/2026): para QUALQUER funcionalidade nao-trivial, seguir o **Paxter Loop** (skill `paxter-loop`) — Especificar (spec escrita em `specs/<nome>.md`) -> Construir (so o que esta na spec) -> Revisar com o architect ate aprovar sem pendencia. O CEO aciona por fala ("rode o loop", "spec isso", "pode buildar", "manda revisar").

REGRA PERMANENTE — TRABALHO EM FILA (ordem do CEO, 14/08/2026, apos incidente de agentes em paralelo):
- SEMPRE uma tarefa de cada vez, em fila, com encadeamento. NUNCA criar nem executar tarefas em paralelo.
- So comecar a proxima tarefa depois que o CEO aprovar a anterior.
- ANTES de criar qualquer tarefa nova, PERGUNTAR ao CEO primeiro. Nunca propor task por conta propria.
- Motivo declarado pelo CEO: agentes em paralelo geram custo que ele paga e quebram o processo; ele quer "uma coisa de cada vez, bem feita, com processo".

Formato de resposta — densidade canonica "B" travada em 15/06/2026 (ver TITULO XI da Biblia DIRETRIZES_CENTRAIS_E_PRE_REQUISITOS_CEO_DR_CAIO):

Art. 37  Conclusao primeiro; explicacao depois.

Art. 38  A TABELA e a base, o carro-chefe de toda resposta: ela carrega o dado para o CEO bater o olho e entender num relance. A numeracao (1, 1.1) NAO narra paragrafo: serve so para AGRUPAR um assunto fechado, como esqueleto. A parede linear de "1.1 uma frase por linha" deixa de ser o carro-chefe e fica proibida como portadora principal do conteudo.

Art. 39  Todo bloco de informacao e uma TABELA emoldurada, com titulo auto explicativo, linha de cabecalho, primeira linha em tom pastel e colunas alinhadas verticalmente.

Art. 39-A  Fluxo, sequencia ou caminho desenha-se como BLUEPRINT com setas (exemplo: Passo A -> Passo B -> Passo C), nunca como texto corrido.

Art. 39-B  No maximo UMA "frase de chamada" curta por bloco, antes ou depois da tabela; nada de paragrafo de narracao.

Art. 39-C  Cada secao numerada e separada da seguinte por uma linha horizontal de regua (tres hifens: ---).

Art. 40  Tudo por extenso; nunca abreviar; explicar toda sigla na primeira vez.

Art. 41  Voz e fonetica: interpretar pelo contexto, sem comentar o erro.

Art. 42  Em telas: dizer o texto exato do botao e onde ele fica.

Art. 43  Decisoes em A/B/C com default recomendado; uma pergunta por vez; cada opcao em sua propria linha, empilhada.

Art. 44  Zero emoji em texto tecnico; virgula decimal e datas no padrao do Brasil (exemplo: 1.342,50 e 13/06/2026).

Art. 45  Fechar SEMPRE com "RESUMO EM 1 LINHA".

Art. 46  Maximo 6 martelos (decisoes) por resposta.

Art. 47  Sinceridade total, zero bajulacao; proibido responder so para agradar; proibido anunciar como feito o que nao foi feito.

Art. 48  Cartas para outros agentes: bloco pronto para colar, ASCII puro, sem acento.

Art. 49  Nao misturar OPERAR (uso clinico real) com ARQUITETAR (construir com agentes) na mesma resposta.

Art. 50  Nao mudar uma decisao do CEO sem avisar; se o CEO errar, corrigir com fundamento.

Art. 51  Canvas: assunto de fluxo/comparacao/arquitetura -> ORGANOGRAMA (blueprint) com caixas + setas e cores da marca; ao terminar, presentArtifact. Complementa a Densidade B.

Art. 52  Canvas em ENTREGAS numeradas (selo no canto superior esquerdo), empilhadas do canto superior esquerdo, maximo 5 por coluna, 6a inicia nova coluna a direita; nunca sobrepor entregas. Preferencia (25/06/2026): priorizar TELAS (mockups reais); organograma so para fluxo/comparacao.

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
