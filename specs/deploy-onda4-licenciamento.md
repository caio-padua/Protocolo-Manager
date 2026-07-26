# SPEC: ONDA 4 — LICENCIAMENTO (dias 45 a 90)
_Paxter Loop — Fase 1 (Especificar)_
_Data: 26/07/2026 | Autor: Dr. Replit Manager_

---

## Objetivo

Preparar o sistema para o modelo clone (silo por clínica licenciada): moduleGuard ativo em todas as rotas, menu dinâmico vindo da API, separar os times de IA do código que vai para o clone, e garantir que todas as cópias possam ser atualizadas por um único comando com rastreamento de versão.

---

## Contexto e diagnóstico (lido do código)

| Item | Estado atual | O que muda |
|---|---|---|
| `moduleGuard` | Implementado, mas em 0 de 87 rotas | Aplicar nas rotas relevantes por módulo |
| Menu do padcom | 76+ itens hardcoded em `Layout.tsx` | Menu vem da API, filtrado por módulos ativos |
| Times de IA | Dentro do api-server (mesmo processo, mesmo deploy) | Extrair para serviço Central Padaxor |
| Versão do clone | Sem rastreamento | Tabela de versão por clínica + script de update |

---

## Requisitos exatos

### 4.1 — moduleGuard: parafusar nas rotas por módulo

**Mapeamento de módulo → rotas** (a preencher completamente na fase de construção após levantamento de todas as 87 rotas):

| Módulo | Rotas protegidas (prefixo) |
|---|---|
| `agenda` | `/api/agenda/*`, `/api/sessions/*` |
| `financeiro` | `/api/financeiro/*`, `/api/payments/*`, `/api/bank-accounts/*` |
| `estoque` | `/api/estoque/*` |
| `ras` | `/api/ras/*`, `/api/fap/*` |
| `protocolos` | `/api/protocols/*`, `/api/prescriptions/*`, `/api/receituario/*` |
| `exames_lab` | `/api/exames-lab/*`, `/api/drive-watcher/*` |
| `comunicacao` | `/api/mensageria/*`, `/api/agentes-wpp/*`, `/api/dispatch/*` |
| `arsenal` | `/api/arsenal/*`, `/api/catalogo/*` |
| `anamnese` | `/api/anamnese/*`, `/api/mega-anamnese/*` |
| `cockpit` | `/api/cockpit/*` |

**Regras de aplicação:**
- Adicionar `moduleGuard("modulo")` como middleware em cada rota relevante.
- Rotas que não se encaixam em módulo (ex.: `/api/healthz`, `/api/clientes`, `/api/profissionais`) ficam sem guard (acesso universal).
- O `moduleGuard` existente já tem `fail-open` em erro de banco e bypass para `isPlatformOwner` — manter esse comportamento.
- `isPlatformOwner = true` para empresa_id = 5 (Instituto Pádua) — o CEO nunca é bloqueado.

**Verificação**: após aplicar, rodar script que confirma que cada módulo tem ao menos 1 rota protegida e nenhuma rota de módulo crítico ficou sem guard.

### 4.2 — Menu dinâmico: os 76 itens do Layout.tsx passam a vir da API

**Problema atual**: o menu em `artifacts/padcom/src/components/Layout.tsx` (ou arquivo equivalente) tem todos os itens hardcoded. Clínica licenciada sem o módulo de estoque, por exemplo, veria o item de estoque no menu e clicaria para receber um 403 — experiência ruim.

**Solução**:

a) Nova rota `GET /api/menu` retorna a lista de itens de menu que a empresa do contexto tem acesso, baseada em `modulos_ativos`:
```json
{
  "items": [
    { "id": "agenda", "label": "Agenda", "path": "/agenda", "icon": "Calendar" },
    { "id": "clientes", "label": "Clientes", "path": "/clientes", "icon": "Users" }
  ]
}
```

b) A lista mestre de todos os itens possíveis mora em `artifacts/api-server/src/lib/menuItems.ts` — um array estático com todos os 76+ itens, cada um com `moduloRequerido` (ou `null` para itens universais).

c) O endpoint `/api/menu` filtra a lista mestre pelos módulos ativos da empresa e retorna apenas os permitidos.

d) O `Layout.tsx` do padcom substituiu o array hardcoded por um `useQuery` que busca `/api/menu` no boot e renderiza dinamicamente.

e) Durante o carregamento, o menu exibe skeleton (esqueleto de carregamento) de 5 itens para não piscar.

f) O CEO (empresa_id = 5, isPlatformOwner = true) sempre recebe o menu completo.

### 4.3 — Separação dos times de IA para a Central Padaxor

**Contexto**: o Dr. Claude e este Manager concordaram: os times de IA nunca vão para dentro do clone. Mas hoje os agentes vivem dentro do api-server. Se o api-server for clonado, os prompts e a lógica de IA vão junto.

**O que é "time de IA" neste contexto**:
- Rotas `/api/agentes/*`, `/api/agentes-wpp/*`
- Tabelas `agente_messages`, `agent_integration_log`, `agent_quick_replies`
- Toda lógica de chamada a Gemini/Claude/OpenRouter

**Implementação nesta onda** (passo 1 de 2 — separação lógica antes de criar repositório separado):

a) Mover as rotas de IA para módulo marcado com `// CENTRAL_ONLY — nunca vai no clone`.

b) Criar flag de ambiente `IS_CLONE=true` que, quando definida, bloqueia TODAS as rotas de IA com `503 { error: "Serviço de IA operado pelo Padaxor. Configure a URL da Central." }`.

c) Criar variável `AI_CENTRAL_URL` — quando definida, o clone ENCAMINHA a requisição de IA para a Central em vez de executar localmente.

d) No Replit e no Railway principal: `IS_CLONE` não definida → IA funciona normalmente.

e) No clone: `IS_CLONE=true`, `AI_CENTRAL_URL=https://api.padaxor.com` → IA é encaminhada.

Esta é a separação lógica. A separação física (repositório dedicado da Central) é trabalho futuro e requer ordem do CEO.

### 4.4 — Atualização de todos os clones por comando único

**Problema**: com 12 clones por safra e 3 safras, são 36 sistemas para migrar manualmente a cada mudança de schema. Antes do clone número 3 existir, o mecanismo de update já precisa existir.

**Tabela de rastreamento de versão**:
```sql
CREATE TABLE IF NOT EXISTS clone_versions (
  id SERIAL PRIMARY KEY,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  clone_url TEXT NOT NULL,              -- URL do Railway do clone
  versao_atual TEXT NOT NULL,           -- ex.: "2026.07.26-001"
  versao_disponivel TEXT,               -- preenchida pelo script de check
  ultima_atualizacao TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  status TEXT DEFAULT 'ok'              -- ok | pendente | erro
);
```

**Script de atualização** (`scripts/src/update-clones.ts`):

```
Para cada clone em clone_versions:
  1. Chamar Railway API → trigger redeploy do serviço api-server daquele clone
  2. Aguardar health check (/api/healthz) do clone retornar 200
  3. Atualizar clone_versions.versao_atual e ultima_atualizacao
  4. Logar resultado (ok / timeout / erro)
```

Comando: `pnpm run paxter:update-clones`

**Script de auditoria de versões** (`scripts/src/audit-clones.ts`):
- Lista todos os clones com a versão que estão rodando vs versão disponível
- Formato de saída: tabela ASCII (para copiar e colar para o Dr. Claude ou para o Dr. Caio)

Comando: `pnpm run paxter:audit-clones`

**Variável de versão**: injetada no build como `PAXTER_VERSION` (ex.: data + hash curto do commit). Exposta em `/api/healthz`:
```json
{ "status": "ok", "version": "2026.07.26-001", "ts": "2026-07-26T..." }
```

**LINHA VERMELHA ABSOLUTA — separação física da IA:**
A flag `IS_CLONE=true` DESLIGA a IA no clone (rota retorna 503), mas NÃO ESCONDE O CÓDIGO. O licenciado recebe o repositório clonado e pode ler todos os arquivos — incluindo os prompts, as chaves de modelo e a lógica dos agentes. Portanto:

> **Nenhum clone de licenciado é criado enquanto a separação física dos times de IA não existir** (repositório dedicado da Central Padaxor, sem os arquivos de IA no repositório do clone).

A separação física é decisão do CEO, requer ordem explícita por escrito e está fora do escopo desta onda.

---

## Casos extremos a tratar

| Cenário | Comportamento esperado |
|---|---|
| Clone sem `IS_CLONE` definida | Trata como instância principal — IA funciona (fail-open intencional para evitar apagar IA acidentalmente num deploy principal) |
| Clone com `AI_CENTRAL_URL` inválida | Retorna 503 com mensagem orientando o administrador do clone |
| `update-clones` com clone offline | Marca status='erro' na tabela, continua para o próximo clone, loga o falho |
| Módulo novo adicionado ao sistema | Adicionar à lista mestre de `menuItems.ts` e ao `ModuloId` do `moduleGuard.ts` — processo documentado |
| CEO sem `modulos_ativos` configurado | `moduleGuard` em `fail-open` para empresa legacy — CEO nunca é bloqueado (isPlatformOwner) |

---

## Definição de PRONTO

| Critério | Como verificar |
|---|---|
| Toda rota de módulo tem `moduleGuard` | Script: `grep -r "moduleGuard" artifacts/api-server/src/routes/` → cobertura >= 80% das rotas de módulo |
| Menu carrega da API | DevTools → Network → ver requisição para `/api/menu` no boot do padcom |
| Clone com `IS_CLONE=true` bloqueia IA | Testar localmente: `IS_CLONE=true node api-server` → `POST /api/agentes/chat` → 503 |
| `audit-clones` lista versões | `pnpm run paxter:audit-clones` → tabela com empresa, URL, versão |
| `update-clones` atualiza um clone de teste | Executar com clone de desenvolvimento, verificar que nova versão foi deployada |

---

## Linhas vermelhas

- NUNCA aplicar `moduleGuard` em rotas de clientes/prontuário base (acesso universal — qualquer módulo precisa de cliente).
- NUNCA bloquear o CEO (empresa_id = 5 / isPlatformOwner = true).
- NUNCA hardcodar a lista de clones no código — sempre vir da tabela `clone_versions`.
- NUNCA criar lógica de IA nova dentro do api-server após esta onda — toda IA nova vai para a Central.
- NUNCA fazer `update-clones` sem anunciar ao CEO primeiro e ter um rollback plan documentado.
