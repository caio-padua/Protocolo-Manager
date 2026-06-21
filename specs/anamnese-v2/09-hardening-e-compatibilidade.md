# Anamnese V2 — 09 · Hardening e Compatibilidade (O0, pre-requisito de tudo)

> Criado apos parecer do architect (21/06/2026). Fecha as lacunas criticas ANTES da construcao.
> Esta onda (O0) e pre-requisito de todas as outras.

## 1. Contrato do `valor` (jsonb) — ja em 01 secao 3.1
Validar a forma por tipo com Zod no front (antes de enviar) e no back (no PATCH). Rejeitar forma
fora do contrato com 422. Sem isso, motor e relatorios quebram.

## 2. Chave estavel e idempotencia
- Resposta: chave (sessionId, questionRowId) — FK para `anamnese_questionario.id`. `perguntaId` so legivel.
- `complete`: transacional com lock da sessao; findings deduplicados por (sessionId, tipo, rotulo,
  origemPerguntaId). Reexecutar `complete` nao duplica nada.
- Autosave (PATCH answer): upsert idempotente; reenvio da mesma resposta nao cria linha nova.

## 3. Seguranca do token (dado clinico no link)
| Risco | Mitigacao |
|---|---|
| Token em URL vaza por log/referrer | TTL curto + rotacao do token a cada retomada |
| Reuso indevido do link | token de uso vinculado a sessao; marcar usos; invalidar ao concluir |
| Acesso por quem nao e o paciente | ao RETOMAR, pedir revalidacao leve (CPF + data de nascimento) |
| Enumeracao de CPF | erro generico (igual portal atual), sem dizer se o CPF existe |
- Header `Referrer-Policy: no-referrer` na pagina da anamnese; nao logar o token cru.

## 4. Convivencia com o legado (sem quebrar o que existe)
- Legado: `/api/anamnese-portal/*` + tabela `anamnese_resposta` continuam vivos.
- V2: `/api/anamnese-v2/*` + tabelas novas, em paralelo. Rota nova `/anamnese/v2` (ou flag de corte).
- Flag `ANAMNESE_V2_DEFAULT` (env): quando ligada, o portal abre a V2; desligada, abre o legado.
- Migracao: NAO migrar dados antigos na O0; so coexistir. Migracao/consolidacao e onda futura, com ordem do CEO.

## 5. Formula do "tempo medio" (cabecalho)
- tempoSeg por resposta = intervalo entre foco da pergunta e gravacao, com TETO (ex.: 120s) para
  ignorar pausas longas (paciente saiu). Tempo medio = soma(tempoSeg com teto) / Nrespondidas.
- Estimativa restante = tempo medio x perguntas visiveis ainda nao respondidas. Mostrado em min.

## 6. Fonte do conteudo de explicacao/video por pergunta
- Guardar por `questionRowId`: titulo, orientacao, bullets[], `videoSrc?`, `videoPoster?`.
- Onde: novo campo jsonb `ajuda` em `anamnese_questionario` OU tabela `anamnese_help` (1:1 por pergunta).
  Decisao default: tabela `anamnese_help` (nao polui a tabela do motor; versionavel a parte).
- Sem ajuda cadastrada -> botao "Ver explicacao" some para aquela pergunta (degrada limpo).

## 7. Definicao de PRONTO da O0
- [ ] Zod do `valor` no front e no back; 422 em forma invalida.
- [ ] (sessionId, questionRowId) unico; upsert idempotente comprovado por curl (2x = 1 linha).
- [ ] complete 2x = mesmos findings (sem duplicar).
- [ ] token com TTL + rotacao + revalidacao na retomada; token nunca aparece em log.
- [ ] flag de coexistencia: legado e V2 respondem em paralelo sem conflito de rota.

RESUMO EM 1 LINHA: O0 trava o contrato do dado, a idempotencia, a seguranca do token, a formula do
tempo medio, a fonte da ajuda e a coexistencia com o legado — base obrigatoria antes de qualquer tela.
