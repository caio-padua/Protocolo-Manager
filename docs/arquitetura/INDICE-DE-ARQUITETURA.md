# Índice de arquitetura

Verificado em 28/11/2026. Aponta para documentos que já existem. Nada aqui substitui regra existente.

## 1. Comece por aqui

| Quero | Abra |
|---|---|
| Ver o ecossistema em um desenho | [MAPA-DO-ECOSSISTEMA.md](MAPA-DO-ECOSSISTEMA.md) |
| Regras de trabalho e conduta | `.agents/skills/paxter-loop/CODIGO-PAXTER.md` e `replit.md` (mapa da memória) |
| Como Lovable e Manager se dividem | [lovable-manager.md](lovable-manager.md) |
| Rotas que as telas usam | [contratos-telas-manager.md](contratos-telas-manager.md) |
| Botões das vitrines | [../vitrines-botoes-inventario.md](../vitrines-botoes-inventario.md) |
| Git, branches e Railway (27/11/2026) | [../operacao/git-e-railway-2026-11-27.md](../operacao/git-e-railway-2026-11-27.md) |
| Identificadores do Railway | [../RAILWAY-IDS.md](../RAILWAY-IDS.md) |

## 2. Catálogo e verificações

| Item | Caminho | Comando |
|---|---|---|
| Catálogo (sites, botões, contratos, testes, responsáveis, revisões, integrações, Railway) | `docs/arquitetura/catalogo/catalogo-ecossistema.json` | |
| Conferência do catálogo | `scripts/catalogo-ecossistema.mjs` | `pnpm run check:catalogo` |
| Testes da conferência (dados de exemplo isolados) | `scripts/tests/catalogo-ecossistema.test.mjs` | `pnpm run test:catalogo` |
| Conferência das regras Paxter (já existia) | `scripts/paxter-governance.mjs` | `pnpm run check:paxter-governance` |
| Espelho do CODIGO-PAXTER.md (`paxter-pack/`) | Estava defasado: idêntico à fonte de 30/10/2026; faltava só o Art. 83 e uma linha do histórico (08/11/2026). Sincronizado em 27/11/2026 pelo comando parcial `node scripts/paxter-governance.mjs --sync` | `pnpm run check:paxter-governance` (aprovada), `pnpm run test:paxter-governance` (16 de 16) |

## 3. Onde mora cada parte do código

| Parte | Pasta |
|---|---|
| API do Manager (regras, login, integrações) | `artifacts/api-server` |
| Telas do Manager e vitrines por domínio | `artifacts/padcom` (`src/vitrines`, `src/lib/host-vitrine.ts`) |
| Site Parxis | `artifacts/parxis-site` |
| Vitrine de demonstração | `artifacts/vitrine-demo` |
| Trabalhador agendado | `artifacts/api-worker` |
| Bibliotecas internas e banco (esquema) | `lib/*`, `lib/db` |
| Migrações de banco | `scripts/migrations`, `scripts/migrations.sql` |
| Testes de navegador | `e2e` |
| Especificações | `specs` |
| Memória e lições dos agentes | `.agents/memory` |

## 4. Quem é responsável

| Papel | Responsabilidade |
|---|---|
| Dr. Caio | decide, autoriza publicação, domínio, Railway, banco e cobrança |
| Lovable | somente telas |
| Manager (Dr. Replit) | regras, autenticação, dados e integrações |
| Dr. Claude, Dr. Code, Dr. Manus, Dr. Obsidian | conforme `CODIGO-PAXTER.md`, Título IV |

## 5. Como manter

1. Mudou algo observado? Atualize a linha e a data (`verificadoEm`, `ultimaRevisao`).
2. Rode `pnpm run check:catalogo` e `pnpm run test:catalogo`.
3. Nunca escreva segredo, CPF, e-mail ou nome de paciente nestes arquivos.
4. Plano continua marcado como `pretendido`; só vira `observado` quando alguém conferir na fonte, com data.
