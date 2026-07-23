# Spec: Cockpit da Consulta v2 — Arquitetura Sênior + Redesign Visual

**Data:** 23/07/2026  
**Autor:** Dr. Replit Paxter  
**Versão:** 2.0  
**Status:** APROVADA PARA BUILD

---

## Objetivo

Reconstruir o Cockpit da Consulta com arquitetura SaaS multi-tenant, zero monolito,
performance por lazy loading, e identidade visual Paxter completa — preparando o sistema
para monetização com plano Básico / Premium por clínica.

---

## Contexto e Problemas Que Esta Spec Resolve

| # | Problema | Impacto | Detectado por |
|---|---|---|---|
| P1 | `window.location.replace()` no redirect = full page reload | Tela branca 1-3s ao clicar no cliente | Dr. Caio / Dr. Paxter |
| P2 | `?cliente=ID` (query param) para recurso primário | URL frágil, anti-REST, sem deep link | Dr. Paxter |
| P3 | 970 linhas num único componente — 15+ `useState` misturados | Inviável de manter, testar, escalar | Dr. Manus / Dr. Paxter |
| P4 | Todas as 10 abas montam no DOM ao mesmo tempo | Desperdício de CPU/memória, requests desnecessários | Dr. Manus |
| P5 | `useListClients()` carrega TODOS os clientes para o picker | Com 10.000 clientes = timeout/crash | Dr. Paxter |
| P6 | `localStorage` armazena `clientId` — vaza entre sessões multi-tenant | Brecha de privacidade em SaaS | Dr. Paxter |
| P7 | 3 URLs para o mesmo conceito (`/cockpit`, `/cockpit/:id`, `/cockpit-cliente`) | Confusão de rota, impossível de monetizar por URL | Dr. Paxter |
| P8 | Header: "Padcon Conect" repetido + botões flutuantes sem contexto | CEO: "feio e confuso" | Dr. Caio / Dr. Manus |
| P9 | 10 abas em scroll invisível — usuário não percebe que há mais | Funcionalidades parecem ausentes | Dr. Manus |
| P10 | Nenhum controle de permissão por aba | Impossível fechar aba Premium sem auth | Dr. Paxter (multi-tenant) |

---

## Requisitos Obrigatórios

### R-ARCH — Arquitetura de Rota (multi-tenant ready)

**R-ARCH-1.** A URL canônica do cockpit por cliente é `/cockpit/:clientId`.  
**R-ARCH-2.** A URL com aba selecionada é `/cockpit/:clientId/:aba` (ex: `/cockpit/5278/financeiro`).  
**R-ARCH-3.** `/clients/:id` → `<Redirect to="/cockpit/:id/cadastro" replace />` (já implementado — manter).  
**R-ARCH-4.** `/cockpit-cliente` → `<Redirect to="/cockpit" replace />` (eliminar URL legada).  
**R-ARCH-5.** `/cockpit` (sem clientId) → tela de busca/seleção de cliente.  
**R-ARCH-6.** A prop `key={clientId}` garante remontagem ao trocar de cliente (já implementado — manter).  
**R-ARCH-7.** O `clientId` não é salvo em `localStorage`. A URL é a única fonte de verdade.  
**R-ARCH-8.** Caminho de migração multi-tenant: prefixar com `/:tenantSlug/` no router raiz — nenhum componente interno muda.

### R-PICKER — ClientPicker por busca (anti N+1)

**R-PICKER-1.** O `ClientPicker` usa busca-enquanto-digita: campo de texto + debounce 300ms → `GET /api/clients?q=texto&limit=20`.  
**R-PICKER-2.** A lista inicial é vazia (zero clientes pré-carregados). Mínimo de 2 caracteres para disparar a busca.  
**R-PICKER-3.** Quando a URL tem `clientId`, exibir o nome do cliente sem carregar a lista completa — `useGetClient(id)`.  
**R-PICKER-4.** `useListClients()` (carga total) é REMOVIDO do cockpit.

### R-HEADER — Cabeçalho Visual

**R-HEADER-1.** O header tem DOIS estados visuais distintos:  
  - **Estado Vazio** (sem clientId): picker centralizado com campo `concave-3d` de borda dourada, instrução "BUSQUE O PACIENTE", botões de ação em "fantasma" (opacity-40, pointer-events-none).  
  - **Estado Preenchido** (com clientId): avatar + nome (Cormorant Garamond) + badge de alarme no lado esquerdo; botões de ação ativos no lado direito.  
**R-HEADER-2.** O subtítulo "Padcon Conect" É REMOVIDO — é ruído de marca.  
**R-HEADER-3.** O avatar do cliente mostra: foto se disponível; iniciais (2 letras, fundo navy/ouro) se não.  
**R-HEADER-4.** O badge ao lado do nome indica: sem alarme (círculo verde), alerta (círculo âmbar), urgência (círculo vermelho).  
**R-HEADER-5.** Botões de ação: EDITAR (`btn-3d-soft`), DRIVE (`btn-3d-soft`), PROTOCOLO (`btn-3d`). Quando estado vazio, opacity-40 + `pointer-events-none` + `aria-disabled="true"`.  
**R-HEADER-6.** O `ClienteCracha` (crachá abaixo do header) É REMOVIDO da área principal — suas informações migram para o header. O `AcompanhamentoDiarioPanel` permanece acima do conteúdo da aba.

### R-TABS — Régua de Abas

**R-TABS-1.** As 10 abas permanecem acessíveis — nenhuma é removida.  
**R-TABS-2.** Abas agrupadas em 2 categorias visuais:  
  - **Clínico**: PRESCRIÇÃO · INJETÁVEIS · IMPLANTES · EXAMES · EVOLUÇÃO · ANAMNESE  
  - **Gestão**: DOCUMENTOS · PROTOCOLOS · FINANCEIRO · CADASTRO  
**R-TABS-3.** A categoria ativa é destacada com um LED ciano (`paxter-led`) ao lado do rótulo da categoria.  
**R-TABS-4.** Fade-out visual nas laterais da régua de abas quando há overflow (gradiente navy → transparente), indicando ao usuário que há mais abas para rolar.  
**R-TABS-5.** A aba ativa sobe com `translateY(-2px)` + fundo creme + borda dourada no topo (padrão atual, manter).  
**R-TABS-6.** A aba selecionada e a categoria são sincronizadas com a URL (`/cockpit/:clientId/:aba`).  
**R-TABS-7.** Aba FINANCEIRO e PROTOCOLOS têm badge de contagem (ex: "3" protocolos ativos) quando clientId está definido.

### R-LAZY — Lazy Loading por Aba

**R-LAZY-1.** Cada aba é um módulo separado carregado com `React.lazy()` + `Suspense`.  
**R-LAZY-2.** O fallback do Suspense é um `Skeleton` com altura equivalente ao conteúdo esperado (`panel-3d-sub h-64 animate-pulse`).  
**R-LAZY-3.** As abas pesadas têm prioridade de extração: PRESCRIÇÃO, INJETÁVEIS, IMPLANTES, EXAMES, EVOLUÇÃO.  
**R-LAZY-4.** O código de cada aba é isolado em `pages/cockpit-cliente/panels/<NomeTab>Panel.tsx`.  
**R-LAZY-5.** Os `useState` do módulo Financeiro migram para um hook `useFinanceiro(clientId)` dentro do painel `FinanceiroPanel.tsx`.

### R-PERM — Permissões por Aba (base para monetização)

**R-PERM-1.** Cada aba tem um atributo `plano: "basico" | "premium"` na definição da aba.  
**R-PERM-2.** Abas Premium: EXAMES (extração IA), EVOLUÇÃO (motor de análise), FINANCEIRO (Asaas).  
**R-PERM-3.** Quando a clínica não tem o plano Premium, a aba Premium mostra um card de "cadeado" com CTA de upgrade — NÃO mostra o conteúdo.  
**R-PERM-4.** A verificação de plano vem de um hook `usePlano()` que lê de `empresa.planId` (campo já existente em `empresas`).  
**R-PERM-5.** Para MVP: `usePlano()` retorna sempre `"premium"` (sem bloquear nada). A estrutura existe mas não bloqueia ainda.

### R-STATE — Gerenciamento de Estado

**R-STATE-1.** O `clienteId` vem EXCLUSIVAMENTE da URL (useParams). Nenhuma leitura de localStorage.  
**R-STATE-2.** A aba ativa vem da URL (`/cockpit/:clientId/:aba`). Nenhuma leitura de localStorage para aba.  
**R-STATE-3.** O `localStorage` com chaves `cockpit.clienteId` e `cockpit.aba` é ignorado (não deletado — compatibilidade com URLs antigas).  
**R-STATE-4.** Os 15+ `useState` do módulo Financeiro migram para `useFinanceiro(clientId)`.  
**R-STATE-5.** Os `useState` de UI global do cockpit se limitam a: `showPaymentForm`, `expandedProtocol` (se necessários no pai).

---

## Linhas Vermelhas (NUNCA violar)

| Linha Vermelha | Motivo |
|---|---|
| Não remover nenhuma das 10 abas | CEO: funcionalidades não podem sumir |
| Não alterar os motores de prescrição, RAS, PDF, Asaas | Motores de negócio são sagrados |
| Não trocar as classes 3D do design system (`bevel-3d`, `panel-3d`, `concave-3d`) | Identidade visual é lei |
| Não usar `window.location` em navegação | Já causou o bug do full reload |
| Não remover `key={clientId}` do Route | Resolve o bug de dessincronização de estado |
| Não carregar `useListClients()` no cockpit | P5 — antipattern de escala |

---

## Componentes a criar

| Componente | Arquivo | Responsabilidade |
|---|---|---|
| `CockpitShell` | `cockpit-cliente/CockpitShell.tsx` | Container: lê `useParams`, passa clientId + aba para baixo |
| `CockpitHeader` | `cockpit-cliente/CockpitHeader.tsx` | Header sticky: estado vazio x preenchido |
| `ClientIdentity` | `cockpit-cliente/ClientIdentity.tsx` | Avatar + nome Cormorant + badge de alarme |
| `CockpitSearch` | `cockpit-cliente/CockpitSearch.tsx` | Picker busca-enquanto-digita (substitui ClientPicker) |
| `ActionButtons` | `cockpit-cliente/ActionButtons.tsx` | EDITAR + DRIVE + PROTOCOLO (ativo/fantasma) |
| `CockpitTabs` | `cockpit-cliente/CockpitTabs.tsx` | Régua com 2 grupos, fade lateral, badge de contagem |
| `CockpitContent` | `cockpit-cliente/CockpitContent.tsx` | Switch de aba + Suspense + lazy panels |
| `panels/PrescricaoPanel` | `panels/PrescricaoPanel.tsx` | Aba PRESCRIÇÃO (lazy) |
| `panels/InjetaveisPanel` | `panels/InjetaveisPanel.tsx` | Aba INJETÁVEIS (lazy) |
| `panels/ImplantesPanel` | `panels/ImplantesPanel.tsx` | Aba IMPLANTES (lazy) |
| `panels/ExamesPanel` | `panels/ExamesPanel.tsx` | Aba EXAMES (lazy) |
| `panels/EvolucaoPanel` | `panels/EvolucaoPanel.tsx` | Aba EVOLUÇÃO (lazy) |
| `panels/DocumentosPanel` | `panels/DocumentosPanel.tsx` | Aba DOCUMENTOS (lazy) |
| `panels/AnamnesePanel` | `panels/AnamnesePanel.tsx` | Aba ANAMNESE PRÉVIA (lazy) |
| `panels/ProtocolosPanel` | `panels/ProtocolosPanel.tsx` | Aba PROTOCOLOS (lazy) |
| `panels/FinanceiroPanel` | `panels/FinanceiroPanel.tsx` | Aba FINANCEIRO (lazy) + hook useFinanceiro |
| `panels/CadastroPanel` | `panels/CadastroPanel.tsx` | Aba CADASTRO (lazy) |
| `hooks/useFinanceiro` | `hooks/useFinanceiro.ts` | Estado + mutations do módulo Financeiro |
| `hooks/useCockpitSearch` | `hooks/useCockpitSearch.ts` | Busca debounced de clientes |
| `hooks/usePlano` | `hooks/usePlano.ts` | Verificação de plano (MVP: sempre premium) |

---

## Definição de PRONTO

| Critério | Como verificar |
|---|---|
| Clicar num cliente na lista abre o cockpit SEM tela branca | Screenshot / observação visual |
| URL muda para `/cockpit/:clientId/:aba` ao navegar | Barra de endereço |
| Trocar de cliente pelo picker mantém a aba selecionada | Teste manual |
| Botão Voltar do browser navega entre clientes corretamente | Teste manual com histórico |
| Header mostra avatar + nome quando cliente selecionado | Screenshot |
| Header mostra picker centralizado quando sem cliente | Screenshot |
| Fade visível nas extremidades da régua de abas | Screenshot em viewport estreito |
| React.lazy: inspecionar Network tab — cada aba carrega só quando clicada | DevTools Network |
| `useListClients()` não aparece no cockpit | grep no componente |
| `window.location` não aparece em nenhum arquivo do cockpit | grep no código |
| `/cockpit-cliente` redireciona para `/cockpit` | Teste de URL |
| Todas as 10 abas funcionam com conteúdo correto | Teste manual por aba |

---

## Fases de Build (ordem de execução)

**Fase A — Roteamento e Estado (fundação):**  
  A1. Adicionar rota `/cockpit/:clientId/:aba` no App.tsx  
  A2. Redirecionar `/cockpit-cliente` → `/cockpit`  
  A3. `CockpitShell` lê clientId + aba de `useParams`  
  A4. `selecionarCliente(id)` e `selecionarAba(aba)` usam `useLocation` do wouter para navegar (não `window.location.href`)  

**Fase B — Componentes (visual):**  
  B1. `CockpitSearch` com debounce  
  B2. `ClientIdentity` com avatar/iniciais + badge  
  B3. `CockpitHeader` (estados vazio/preenchido)  
  B4. `ActionButtons` (ativo/fantasma)  
  B5. `CockpitTabs` (2 grupos + fade lateral + badge contagem)  

**Fase C — Lazy Panels:**  
  C1. Criar 10 arquivos de panel  
  C2. `hooks/useFinanceiro.ts`  
  C3. `CockpitContent` com lazy + Suspense  
  C4. `hooks/usePlano.ts` (MVP: sempre premium)  

**Fase D — Limpeza:**  
  D1. Remover `ClienteCracha` da área principal (migrado para header)  
  D2. Remover `useListClients()` do cockpit  
  D3. Remover localStorage de clienteId/aba  
  D4. `index.tsx` vira apenas re-export de `CockpitShell`  
