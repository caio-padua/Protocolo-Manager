# SPEC — Cockpit do Cliente (2a tela de cockpit, formato de abas do print)

Data: 11/07/2026. Autor: Dr. Replit Paxter. Aprovacao: pedido direto do CEO (print da tela
"acompanhamento/Exames" do mockup-sandbox — faixa superior navy + regua de abas + conteudo claro).

## 1. Objetivo

Criar a SEGUNDA tela de cockpit em `/cockpit-cliente`, no formato exato do print do CEO:

- Faixa de topo navy (gradiente #1b3260 -> #101f3a, borda inferior ouro 35%) com wordmark
  PAXTER (serif, ouro #e7cd8f) + "MOTOR CLINICO" a esquerda e o CLIENTE selecionado
  (nome + CPF + idade) a direita.
- Regua de abas sobre fundo #13233f; aba ativa "sobe" com fundo claro hsl(40 33% 96%)
  e borda superior ouro 2px; abas inativas translucidas.
- Conteudo CLARO (hsl(40 33% 96%)) — skill-layout-paxter linha 488 (Console interno claro).
- TODAS as ferramentas inline, sem navegar para fora.

## 2. Dois cockpits (decisao do CEO, reafirmada em 11/07/2026)

- COCKPIT DA CONSULTA (`/cockpit-cliente`): o medico e o cerebro; SEM motor de anamnese no
  fluxo; todas as ferramentas inline apos selecionar o cliente UMA vez. Abas abaixo.
- COCKPIT DA ANAMNESE EXTERNA (`/cockpit-anamnese`): status da anamnese, enviar/copiar link,
  doencas acesas pelo motor, acesso a revisao. Mesma moldura visual (navy + abas + claro).

## 2.1 Abas do Cockpit da Consulta (ordem fixa)

| Aba | Conteudo | Fonte |
|---|---|---|
| Prescricao | PrescricaoFormulasPanel (reuso identico) | painel existente |
| Injetaveis | Lista atual (painel Injetaveis) + LANCADOR INLINE (mini-lancador: substancias iv/im, dose, frequencia, sessoes, data) | painel existente + novo LancadorInline |
| Implantes | LANCADOR INLINE filtrado procedureType=implant + lista de protocolos de implante | novo (mesmo LancadorInline, prop filtro) |
| Exames | PedidosExamesPanel (reuso identico) | painel existente |
| Evolucao | EvolucaoExamesPanel (reuso identico) | painel existente |
| Documentos | Atestado inline (com BUSCA DE CID) + Encaminhamento inline + lista de documentos do cliente | rotas /api/atestados e /api/encaminhamentos existentes |

## 3. Busca de CID-10 (recuperacao pedida pelo CEO)

- Rota nova: `GET /api/cid10?q=` — busca ilike em `codigo` e `descricao_oficial` da tabela
  `catalogo_cid10` (66 linhas hoje), limite 20, ordena por codigo.
- Componente compartilhado `CidPicker` (padcom): input com autocomplete (dropdown), permite
  TAMBEM texto livre (nao trava o medico se o CID nao estiver no catalogo).
- Usado em: aba Documentos do Cockpit do Cliente + tela arsenal/atestados (substitui o input
  de texto livre, mantendo digitacao livre).

## 4. Regras de protecao

- NAO destruir nada: /cockpit (Cockpit da Consulta) permanece; telas independentes permanecem.
- Gate de anamnese: no LancadorInline e na aba Exames, se o cliente tem 0 respostas de anamnese,
  exibir faixa de aviso ambar "Cliente sem anamnese registrada" (nao bloqueia — avisa).
- Selecao de cliente: ClientPicker no topo (estado proprio da tela); sem cliente, mostra
  chamada "Selecione o cliente".
- Lancamento inline usa exatamente o payload do Lancador (`useCreateProtocol`), status
  "suggested", com validacao opcional (botao separado "Lancar e validar").

## 5. Fora de escopo desta onda

- Aba "Diario" do print (nao existe motor de diario) — regua mostra so as abas com ferramenta real.
- Conversao do /cockpit atual para tema claro (onda separada, ja auditada).
- Sincronizacao Trello, RBAC.

## 6. Aceite

- /cockpit-cliente renderiza com a moldura do print (navy + abas + claro).
- Todas as 7 abas funcionam inline com cliente real.
- Busca de CID responde em /api/cid10?q=diab e aparece no autocomplete do atestado
  (cockpit e arsenal).
- Lancamento de injetavel inline cria protocolo real (verificado por curl/tela).
- Architect revisa sem pendencia grave.
