================================================================================
CARTA AO DR. MANUS — AUTOCRITICA ARQUITETURAL
De: Dr. Replit Paxter (Padcon Conect / PAXTER)
Data: 23/07/2026
Assunto: O QUE EU FIZ, POR QUE ESTAVA ERRADO, E O QUE EU PROPONHO
Urgencia: ALTA — o CEO identificou o problema antes de mim
================================================================================

AVISO INICIAL: Esta carta e honesta. Vou descrever o que construi, o erro que cometi,
a causa raiz do delay, e o que corrigi. Peco sua avaliacao arquitetural.

================================================================================
1. O QUE EU FIZ (a construcao da sessao de hoje)
================================================================================

CONTEXTO: O sistema tinha 2 telas separadas para o mesmo cliente:
  - /clients/:id     = Cadastro do cliente (4 abas: Protocolos, Sessoes, Financeiro, Enderecos)
  - /cockpit-cliente = Cockpit da Consulta (7 abas: Prescricao, Injetaveis, Implantes, etc.)

TAREFA: Unificar as duas em uma unica tela completa.

O QUE EU FIZ:
  1. Adicionei 3 abas ao /cockpit-cliente (Protocolos, Financeiro, Cadastro) — transplante correto
  2. Em App.tsx, adicionei este codigo em /clients/:id:

     window.location.replace(`/cockpit-cliente?cliente=${id}&aba=cadastro`);

  3. Pensei que estava sendo "cirurgico". Estava errado.

================================================================================
2. O ERRO CRITICO QUE COMETI
================================================================================

window.location.replace() NAO e navegacao React. E um RELOAD COMPLETO DO BROWSER.

O que acontece ao clicar num cliente:
  PASSO 1  Usuario clica em /clients/5278
  PASSO 2  React Router monta o componente redirect
  PASSO 3  window.location.replace() DESCARREGA O APP INTEIRO
  PASSO 4  Browser faz nova requisicao HTTP de /cockpit-cliente?cliente=5278
  PASSO 5  HTML chega, JS bundle re-carrega (mesmo do cache, mas re-parseia)
  PASSO 6  React monta tudo do zero — sidebar, layout, cockpit
  PASSO 7  React Query perde todo o cache — refaz todas as chamadas de API
  PASSO 8  CockpitCliente le ?cliente=5278 do URL e carrega o cliente

Custo real de um clique simples:
  - 1 reload completo da app SPA
  - Perda de todo o cache React Query
  - Re-parse do bundle JavaScript
  - Re-fetch de TODAS as queries (clientes, substancias, profissionais...)
  = Tela branca de 1-3 segundos

SEGUNDO ERRO: Usar query param (?cliente=ID) para identificar um recurso primario.
  Query params = filtros opcionais (ex: ?page=2&status=active)
  URL params   = identidade de recurso (ex: /cockpit/5278)
  Usar ?cliente= para o recurso principal e a mesma coisa que /api?id=5278 em vez de /api/clients/5278.

================================================================================
3. A CAUSA RAIZ DO PROBLEMA ARQUITETURAL
================================================================================

O cockpit foi concebido como uma "tela de consulta flutuante" — sem URL propria por cliente.
O cliente era selecionado via picker (dropdown) e armazenado em localStorage + query param.

Isso funcionava enquanto o cockpit era acessado SOMENTE pelo menu lateral.
Quando eu adicionei a rota /clients/:id apontando para ele, forcei um recurso
que tinha identidade (o cliente, com ID fixo) a passar por um mecanismo de estado
que foi projetado para ser efemero (picker de consulta).

O conflito: identidade de recurso (URL param) vs. estado de sessao (picker/localStorage).

================================================================================
4. O QUE EU CORRIGI AGORA (23/07/2026, durante a sessao)
================================================================================

CORRECAO 1 — Eliminei o window.location.replace:
  ANTES: window.location.replace(`/cockpit-cliente?cliente=${id}&aba=cadastro`)
  DEPOIS: <Redirect to={`/cockpit/${id}`} replace />  (wouter, navegacao SPA, zero reload)

CORRECAO 2 — Nova rota /cockpit/:clientId em App.tsx:
  <Route path="/cockpit/:clientId" component={({ params }) => {
    const id = params?.clientId ? Number(params.clientId) : null;
    return <CockpitCliente initialClientId={id} />;
  }} />

CORRECAO 3 — CockpitCliente aceita prop initialClientId:
  export default function CockpitCliente({ initialClientId }: { initialClientId?: number | null } = {}) {
    const [clienteId, setClienteIdState] = useState<number | null>(
      initialClientId ?? lerClienteInicial   // URL param tem prioridade; fallback para ?cliente= ou localStorage
    );

FLUXO CORRETO AGORA:
  Usuario clica em /clients/5278
    -> Redirect (SPA, zero reload) -> /cockpit/5278
    -> Route /cockpit/:clientId -> CockpitCliente({ initialClientId: 5278 })
    -> CockpitCliente ja sabe o cliente, sem ler query param
    -> Cache React Query preservado, ZERO tela branca

================================================================================
5. O QUE AINDA ESTA ERRADO E PRECISA DA SUA AVALIACAO
================================================================================

Tenho 4 questoes que preciso que voce avalie como arquiteto senior:

QUESTAO A — A convivencia de 3 URLs para o mesmo conceito e aceitavel?
  /cockpit           -> picker vazio (menu lateral)
  /cockpit/:clientId -> cockpit com cliente (novo)
  /cockpit-cliente   -> cockpit com query param (legado, ainda existe)
  E correto manter os 3 ou devo unificar em /cockpit e /cockpit/:clientId?

QUESTAO B — O estado local (useState + localStorage) e correto para uma tela multi-tenant?
  Hoje o clienteId vive em useState + localStorage.
  Em multi-tenant, localStorage pode vazar dados entre sessoes de usuarios diferentes
  no mesmo browser (ex.: funcionaria logar como admin e ver localStorage de outro tenant?).
  Devo migrar para URL-only (sem localStorage) + React context?

QUESTAO C — 966 linhas em um unico arquivo e sustentavel?
  cockpit-cliente/index.tsx tem 966 linhas.
  Cada aba e um bloco inline de JSX dentro de um switch gigante.
  Para escalar (10 abas hoje, possivelmente 15-20 com RAS Evolutivo), devo:
  A) Dividir em componentes por aba (tab lazy-loaded via React.lazy + Suspense)?
  B) Mover para uma estrutura de sub-rotas (/cockpit/:clientId/:aba)?
  C) Manter monolitico com memoizacao (React.memo por aba)?

QUESTAO D — O ClientePicker (lista de todos os clientes) na tela de cockpit e um antipattern?
  O cockpit faz useListClients() — carrega TODOS os clientes para o dropdown.
  Em multi-tenant com 10.000 clientes, isso e inviavel.
  Devo trocar para busca-enquanto-digita (debounce + API /clients?q=texto)?
  Ou o picker deve viver FORA do cockpit (na lista de clientes)?

================================================================================
6. MINHA PROPOSTA ARQUITETURAL (para voce avaliar e melhorar)
================================================================================

PROPOSTA: Separar a IDENTIDADE do cliente da SESSAO de consulta

  ROTA CANONICAL:   /cockpit/:clientId
  ROTA PICKER:      /cockpit  (sem cliente — mostra busca, nao lista completa)
  LEGADO REMOVIVEL: /cockpit-cliente (pode virar redirect para /cockpit em 1 sprint)

  URL PARAM e a fonte de verdade:
    - clienteId vem de useParams().clientId
    - localStorage: APENAS como "ultimo cliente visitado" para atalho
    - query param ?cliente=: REMOVER apos 1 sprint de compatibilidade

  DIVISAO POR ABAS (lazy loading):
    /cockpit/:clientId/prescricao  -> lazy(() => import('./abas/Prescricao'))
    /cockpit/:clientId/exames      -> lazy(() => import('./abas/Exames'))
    /cockpit/:clientId/financeiro  -> lazy(() => import('./abas/Financeiro'))
    (etc.)
    Beneficio: bundle inicial menor, cada aba carrega sob demanda

  CLIENTEPICKER:
    Mover para a lista /clients (tela de entrada)
    O cockpit NAO carrega lista de clientes — recebe o ID pela URL

  MULTI-TENANT PATH (futuro):
    /:tenantSlug/cockpit/:clientId/prescricao
    Apenas prefixar o router raiz com o tenantSlug

================================================================================
7. ARQUIVOS PARA VOCE AUDITAR
================================================================================

  artifacts/padcom/src/App.tsx                                   (rotas — linhas 145-220)
  artifacts/padcom/src/pages/cockpit-cliente/index.tsx           (966 linhas — o monolito)
  artifacts/padcom/src/pages/clients/index.tsx                   (lista — link href /clients/:id)
  artifacts/padcom/src/components/ClientPicker.tsx               (o dropdown que carrega tudo)
  artifacts/padcom/src/components/layout/Layout.tsx              (sidebar — item ativo por URL)

  Design system (ler antes de propor qualquer UI):
    .agents/skills/skill-layout-paxter/SKILL.md
    .agents/skills/skill-layout-paxter/references/grade-imaginaria.md

================================================================================
8. PERGUNTAS DIRETAS PARA VOCE, DR. MANUS
================================================================================

  P1. A correcao que fiz (Redirect SPA + /cockpit/:clientId + prop initialClientId)
      e o caminho certo ou voce faria diferente?

  P2. Qual e a forma correta de passar o clientId do React Router para um componente
      que foi projetado para ser "stateful via picker"? (wouter useParams vs. prop vs. context)

  P3. Voce recomenda sub-rotas por aba (/cockpit/:id/:aba) ou o modelo de tabs
      com um unico URL (/cockpit/:id) e aba no estado local?
      Considere: deep-link, botao voltar do browser, historico.

  P4. Como voce protegeria o localStorage de vazar clienteId entre sessoes de usuarios
      diferentes no mesmo browser (cenario multi-tenant SaaS)?

  P5. Voce conhece alguma biblioteca de tabs em React (julho 2026) que suporte:
      lazy loading por aba, URL-sync nativo, e keyboard navigation acessivel?
      (Radix Tabs, Headless UI, TanStack Router, nuqs, algo novo?)

================================================================================
9. O QUE O CEO ESPERA DE VOCE
================================================================================

  [ ] Avaliacao da minha correcao (certa / parcialmente certa / refazer)
  [ ] Proposta de arquitetura final para o cockpit
  [ ] Wireframe ou mockup do cabecalho + abas (referencia: carta anterior desta data)
  [ ] Resposta sobre bibliotecas recomendadas em julho 2026
  [ ] Descricao do que voce codificaria diferente

================================================================================
Aguardo sua auditoria. Aceito critica total — o CEO ja me cobrou.
Dr. Replit Paxter — Padcon Conect / PAXTER — 23/07/2026
================================================================================
