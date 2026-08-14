# Onda "Central de Lembretes" — Encantamento vivo (Opção A + Opção B)

Data: 03/07/2026. Autor: Dr. Replit Paxter. Método: Paxter Loop (Especificar → Construir → Revisar).

## Objetivo (uma frase)

Fazer a prescrição RICA (dose, horário, posologia, observação de refeição, período por
fórmula) fluir de verdade até o lembrete do WhatsApp (Opção A) e dar ao CEO uma tela para
LIGAR/DESLIGAR o lembrete por cliente com um toggle manual que vence o automático (Opção B),
com prévia real da mensagem por cliente.

## Contexto verificado no código (fonte-da-verdade)

1. `artifacts/api-server/src/lib/lembrete-templates.ts` → `blocoPrescricaoPeriodos` JÁ renderiza
   `ativoPrincipal`, `dose`, `horario`, `observacaoRefeicao`, `posologia`. A riqueza JÁ é suportada
   pelo template.
2. `artifacts/api-server/src/lib/lembrete-periodo.ts` → `sincronizarLembretePrescricao` só passa
   `{ nome, posologia: detalhe }` para cada fórmula e SOBRESCREVE `periodos`/`horariosEnvio` e força
   `ativo = temItens`. Aqui a riqueza morre e não há override manual.
3. `lib/db/src/schema/lembretes-prescricao.ts` → `LembreteFormulaJson` já tem todos os campos ricos;
   a tabela tem `ativo`, `periodos` (jsonb), `horariosEnvio`, `observacao`, unique `cliente_id`.
   NÃO há coluna de override manual.
4. `artifacts/api-server/src/lib/mensageria-paxmed.ts` → `montarMensagemPaxmed({nome, agora, periodos})`
   devolve a mensagem rica (ou `null` → cai no template). Serve para a prévia real.
5. Rotas são Express escritas à mão, registradas em `artifacts/api-server/src/routes/index.ts`;
   ESCRITAS ficam atrás do `collaboratorGuard` (leituras livres). Padrão de rota sem OpenAPI:
   `mensagens-catalogo.ts`.
6. Front: `BASE = import.meta.env.BASE_URL.replace(/\/$/,"")`, chamadas via `fetch(\`${BASE}/api/...\`)`.
   Menu em `Layout.tsx` seção "Comunicação". Helpers `ConsoleShell`, `BlockTitle` em
   `pages/comunicacao/_shared.tsx`. Design: skill `skill-layout-paxter` (navy/ouro, classes 3D unlayered).

## Requisitos exatos

### A. Backend — dados ricos + merge + override manual

A1. Estender `ItemLembretePrescricao` (em `lembrete-periodo.ts`) com campos OPCIONAIS ricos:
    `ativoPrincipal?`, `dose?`, `horario?`, `observacaoRefeicao?`, `posologia?`. Manter compatível
    (os campos são opcionais; chamadas atuais não quebram).

A2. Em `sincronizarLembretePrescricao`, ao construir cada `LembreteFormulaJson`, passar os campos
    ricos do item quando vierem (não só `nome`/`posologia`).

A3. MERGE não-destrutivo: antes do upsert, LER o lembrete existente do cliente. Para cada fórmula
    nova, se o item novo NÃO trouxe um campo rico mas já existia esse campo numa fórmula com a mesma
    chave `${sigla}::${nome}`, PRESERVAR o valor antigo. Assim a enriquecimento manual feito na tela
    sobrevive a uma nova emissão do Cockpit.

A4. Nova coluna `ativoManual` (boolean, NULLABLE) em `lembretes_prescricao`. Semântica:
    `null` = segue o automático; `false` = desligado à mão (vence); `true` = ligado à mão.
    `ativo` efetivo gravado = `temItens && ativoManual !== false`. Ou seja: desligar à mão SEMPRE
    vence; ligar à mão nunca força envio de lembrete vazio (sem itens não dispara).

A5. `sincronizarLembretePrescricao` NÃO pode apagar `ativoManual` no upsert; deve lê-lo e respeitá-lo
    ao computar `ativo`.

### B. Backend — router `/api/lembretes`

B1. `GET /api/lembretes` (leitura livre) — lista todos os lembretes com: `clienteId`, `nome`,
    `telefone`, `ativo`, `ativoManual`, `qtdePeriodos`, `qtdeFormulas`, `horariosEnvio`,
    `ultimoEnvio` (`{ janela, status, enviadoEm }` ou null), `proximaJanelaHoje` (o próximo horário
    de hoje que ainda não passou, BRT, ou null). Ordenar por nome.

B2. `GET /api/lembretes/:clienteId` (leitura livre) — detalhe completo: a linha do lembrete
    (periodos ricos, horariosEnvio, ativo, ativoManual, observacao) + nome/telefone do cliente.
    404 se o cliente não tem lembrete.

B3. `GET /api/lembretes/:clienteId/preview` (leitura livre) — devolve `{ mensagem }` com a mensagem
    REAL montada por `montarMensagemPaxmed` (fallback `templateLembretePrescricao` se retornar null),
    usando os `periodos` reais do cliente e `agora` = data/hora atual. 404 se não há lembrete.

B4. `PATCH /api/lembretes/:clienteId` — corpo com campos OPCIONAIS:
    `ativoManual` (boolean|null), `horariosEnvio` (string[] HH:MM validados), `periodos`
    (`LembretePeriodoJson[]` — permite editar campos ricos por fórmula, tipo do período). Validar
    formatos; recomputar `ativo = qtdeFormulas>0 && ativoManual !== false`. Retorna o detalhe (B2).
    404 se não há lembrete.

B5. Registrar o router em `routes/index.ts`. CORREÇÃO (revisão Fase 3): a premissa original de que
    "as escritas herdam o guard" estava ERRADA — `collaboratorGuard` só protege os prefixos
    `/site-content` e `/cadastros`. Nesta app admin single-tenant atrás do proxy, as escritas de
    CRUD operacional ficam ABERTAS (a tela irmã Carta já faz PATCH em `/mensagens-catalogo` sem
    token). Lembrete não é PII nem credencial; o perímetro de auth é o proxy. Ver memória
    `admin-api-sem-auth` (decisão durável: não colocar auth em 1-2 rotas isoladas).

### C. Frontend — tela "Central de Lembretes" + prévia real na Carta

C1. Nova página `pages/comunicacao/central-lembretes.tsx`, rota `/comunicacao/central-lembretes`,
    item no menu "Comunicação" do `Layout.tsx` (rótulo "Central de Lembretes", ícone `BellRing`).

C2. LISTA (esquerda) em grade de colunas fixas (Padrão 12/13 da skill): por cliente, um card/linha
    com nome (`truncate`), chip de status com SLOT fixo (Padrão 4) — LED verde aceso quando `ativo`,
    apagado quando desligado —, contagem de fórmulas/períodos, horários, e um selo do último envio
    (ENVIADO/FALHOU/SEM_TWILIO/—). Selecionar um cliente abre o painel de detalhe.

C3. DETALHE (direita) do cliente selecionado:
    - Toggle "Lembrete ligado" em sulco côncavo (Padrão 5 `ToggleWell`) → PATCH `ativoManual`
      (liga = true, desliga = false). Uma frase curta explica que o manual vence o automático.
    - Edição dos `horariosEnvio` (adicionar/remover HH:MM) em campos gravados → PATCH.
    - Editor por fórmula: para cada período e cada fórmula, campos gravados de `dose`, `horario`,
      `posologia`, `observacaoRefeicao`, `ativoPrincipal`; botão Salvar → PATCH `periodos`.
    - PRÉVIA REAL: painel de prévia (mesmo visual do WhatsApp da Carta) mostrando o resultado de
      `GET /api/lembretes/:clienteId/preview`; botões "Copiar" e "Abrir no WhatsApp" (wa.me), como
      na Carta. Sem envio automático/real nesta onda.

C4. Carta de Encantamento (`carta-encantamento.tsx`): adicionar um seletor "Cliente real"
    (dropdown, opção "— exemplo —" no topo) que, ao escolher um cliente com lembrete, busca
    `GET /api/lembretes/:clienteId/preview` e mostra a mensagem REAL no lugar do `BLOCO_EXEMPLO`
    estático. Escolhendo "— exemplo —" volta ao comportamento atual (não remover o exemplo).

C5. Design: reusar EXCLUSIVAMENTE as classes 3D existentes (`panel-3d`, `panel-3d-sub`, `concave-3d`,
    `field-engraved`, `btn-3d`, `btn-3d-soft`, `bevel-3d`, `paxter-led*`), `ConsoleShell`, `BlockTitle`.
    Navy/ouro; cantos quadrados; MAIÚSCULO nos rótulos KPI; paridade celular × desktop. Nada de
    estilo novo inventado; nenhum componente novo de marca.

## Casos extremos a tratar

- Cliente sem lembrete → 404 nas rotas por-cliente; lista simplesmente não o inclui.
- `horariosEnvio` inválido (não HH:MM) → 400, não grava.
- `periodos` malformado no PATCH → 400, não grava.
- Desligar à mão (`ativoManual=false`) e depois o Cockpit reemitir → continua desligado (A4/A5).
- Fórmula enriquecida à mão e Cockpit reemitir → riqueza preservada pelo merge (A3).
- Catálogo de mensagens vazio → preview cai no template simples (nunca quebra).
- Telefone ausente → preview funciona; envio real não é feito nesta onda (só copiar/wa.me).
- `ativoManual=true` mas sem fórmulas → `ativo` continua false (não dispara lembrete vazio).

## Definição de PRONTO

- `GET /api/lembretes` responde 200 com a lista dos lembretes reais (curl).
- `GET /api/lembretes/:id/preview` responde 200 com mensagem coerente (curl).
- `PATCH` desligando à mão persiste `ativoManual=false` e `ativo=false` (curl + re-GET).
- Merge preservado: após enriquecer uma fórmula e simular reemissão, a riqueza permanece
  (verificado por leitura do código do sync + teste dirigido se viável).
- Tela "Central de Lembretes" abre pelo menu, lista clientes, alterna o toggle, edita horários e
  campos ricos, e mostra a prévia real (screenshot desktop + mobile).
- Carta de Encantamento mostra a prévia REAL ao escolher um cliente (screenshot).
- Sem regressão visual: classes 3D e marca intactas (revisão como cliente).

## Linhas vermelhas (NUNCA violar)

- NÃO tocar o motor de orçamento (`/api/budgets/calculate`, desmembramento) nem qualquer motor de
  cálculo/payload por estética.
- NÃO mudar a REGRA DE OURO do lembrete (1 mensagem por janela; nunca antes do horário; tolerância).
- NÃO enviar WhatsApp real automaticamente nesta onda (só prévia + copiar + wa.me).
- NÃO renomear colunas/contratos existentes; a coluna nova é ADITIVA e nullable.
- NÃO inventar estilo visual novo; só reusar o vocabulário 3D registrado na skill.
- NÃO remover o `BLOCO_EXEMPLO` da Carta (é o fallback "— exemplo —").
- Preservar UID/contratos de outras integrações; marca PAXTER intacta.
```