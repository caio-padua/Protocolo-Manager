# Cockpit da Consulta — Onda 2: Anamnese Previa + Exames Enviados

Pedido do CEO (11/07/2026): no Cockpit da Consulta (/cockpit-cliente), ver tambem
(1) a anamnese previa que o cliente respondeu no passado e (2) os exames uploadados
pelo sistema, com as colunas dos exames laboratoriais do cliente selecionado e os
graficos de evolucao.

## 1. O que ja existe (reuso, nao duplicar)

- Colunas + graficos de analitos: `EvolucaoExamesPanel` (aba Evolucao) — JA esta no
  cockpit; cada linha = analito, cada coluna = data; clique expande LineChart com
  faixa de referencia. NADA a construir aqui.
- Lista de documentos de exame por cliente: `GET /api/exames-lab/documentos?clientId=N`
  (fila da mesa de validacao) — motor pronto, falta painel no cockpit.
- Sessoes de anamnese por cliente: `GET /api/collaborator/anamnese/sessions?clientId=N`
  e detalhe `GET /api/collaborator/anamnese/sessions/:id` (requireCollaborator, Bearer
  token de colaborador via `getCollabToken()` de `lib/collab-auth.ts`).

## 2. Lacuna de backend

O detalhe da sessao devolve achados/recusas/notas mas NAO devolve as respostas cruas.
Extensao ADITIVA em `GET /api/collaborator/anamnese/sessions/:id`:

- Novo campo `respostas`: join `anamnese_session_answers` x `anamnese_questionario`
  (por `questionRowId` -> `id` numerico; NUNCA por perguntaId — repete).
- Cada item: `{ id, perguntaId, pergunta, bloco, sistema, tipoResposta, valor (jsonb cru),
  respondidoEm }`, ordenado por bloco e ordem da pergunta.
- Nao remove nem renomeia nada do contrato atual (revisao.tsx continua intacta).

## 3. Frontend — Cockpit da Consulta

### 3.1 Nova aba "Anamnese Previa" (apos Documentos)

- Painel `AnamnesePreviaPanel.tsx` ({ clientId }), LEITURA APENAS (sem motor — o
  cockpit da consulta nao conduz anamnese).
- Lista as sessoes do cliente (data, modo, status, contagem diagnosticado/suspeito,
  selo de alarme); seleciona a mais recente concluida por padrao.
- Detalhe inline: Achados (diagnosticados/suspeitos), Recusas, Observacoes e as
  RESPOSTAS agrupadas por bloco, com formatador do `valor` por tipo
  (bool/single/multi/escala/num/texto/matriz — contrato spec anamnese-v2 01 sec 3.1;
  formatador tolerante a formas legadas).
- Sem token de colaborador: aviso claro com instrucao de entrar como colaborador
  (mesmo padrao da tela de Revisao); nunca quebra.
- Cliente sem sessao: estado vazio com aviso ambar.

### 3.2 Aba Exames ganha secao "Exames enviados"

- Painel `ExamesEnviadosPanel.tsx` ({ clientId }) montado abaixo do painel de pedidos.
- Lista `GET /api/exames-lab/documentos?clientId=N`: arquivo, laboratorio, data de
  coleta, status (processando/recebido/conferido_1/conferido/erro) com selo de cor,
  conferencias C1/C2 (nome + cargo), data de entrada.
- Chamada curta apontando que colunas + graficos ficam na aba Evolucao.
- Estado vazio: "Nenhum exame enviado para este cliente".

## 4. Fora de escopo

- Mexer no motor de anamnese ou permitir edicao de respostas no cockpit.
- Upload de exame pelo cockpit (fica na tela Exames do Cliente / portal).
- Tela de Revisao de Anamneses independente (intacta).

## 5. Aceite

- Detalhe da sessao devolve `respostas` com pergunta + valor formatavel (curl).
- Aba "Anamnese Previa" mostra sessoes e respostas reais do cliente selecionado.
- Aba Exames lista documentos enviados do cliente (curl + tela).
- Painel de Evolucao continua funcionando (colunas + grafico).
- Architect sem pendencia grave.

## Status final (11/07/2026)

- Construido e REVISADO: architect reprovou 1x (C1/C2 sem cargo; mode ausente
  nos chips; ordem das abas) — 3 pendencias corrigidas — re-revisao: PASS.
- Contratos & Termos: linha do tempo do Cartorio inline na aba Documentos
  (ContratosTimelineInline); emissao completa continua no Cartorio (link).
- "Diario/anamnese diaria": NAO existe motor de diario no sistema (verificado
  por busca no backend e schema). Decisao pendente do CEO sobre proxima onda.
