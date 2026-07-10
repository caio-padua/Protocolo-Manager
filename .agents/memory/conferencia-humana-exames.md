---
name: Conferência humana de exames (C1/C2) + selo por coluna
description: Governança de 2 fases na conferência de laudos, selo na Evolução e toggle global de validação
---

# Conferência humana de exames em 2 fases

Fluxo de status do documento de exame:
`recebido` (lido só pela IA) -> `conferido_1` (C1, conferência operacional) -> `conferido` (C2, conferência clínica).

**Regra das fases (PATCH /exames-lab/documentos/:id/conferir, body `{fase:1|2, professionalId}`):**
- C1 só pode agir se o doc está em `recebido`; C2 só se está em `conferido_1`. Ordem violada = 409.
- `processando`/`erro` nunca conferem (409).
- C1 grava `conf1Name/conf1Cargo/conf1At`; C2 grava `conf2*` + `conferredAt`.
- Identidade gravada como snapshot no momento da conferência ("Sobrenome, Nome" + cargo). Não recalcular do professional depois — o cargo pode mudar.

**Selo por coluna na Evolução (`GET /exames-lab/evolucao/:clientId`):**
- Cada coluna (chave = data+laboratório) escolhe o selo do documento de MAIOR id daquela coluna ("maior id vence").
- `confLevel`: `ia` (cinza) / `c1` (âmbar) / `c2` (verde) derivado do status.
- Documento legado (`conferido` sem snapshot conf2*) => `conferenteName = "Conferência legada"`.

**Toggle global "exigir validação humana" (`/settings/exames`, chave app_settings `exames.exigirValidacaoHumana`):**
- Default SEGURO = `true` (ausente => true). LIGADO: Evolução só mostra docs `conferido` (C2). DESLIGADO: mostra `recebido|conferido_1|conferido` (inclui lidos só pela IA).
- Afeta SÓ a Evolução, não a Mesa de Validação.

**Why / armadilha:** as rotas `/settings/*` exigem `requireCollaborator`. Fetch cru do frontend NÃO herda o token dos hooks gerados (setAuthTokenGetter só cabeia o api-client). Tem de mandar `Authorization: Bearer ${getCollabToken()}` manualmente, senão 401 silencioso e o toggle "não salva". Rotas de `/exames-lab/*` e `/professionals` seguem sem auth (padrão single-tenant do app).
