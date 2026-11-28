# SPEC 4 — Anexos PDF/foto no Telegram

Estado: TESTADO (MOCK de Telegram, banco e motor). Não HOMOLOGADO. Data: 16/11/2026.

## Objetivo
Cliente já vinculado envia PDF ou foto ao bot; PDF entra no mesmo motor de exames da Área do Cliente; foto fica na Caixa de Entrada sem leitura automática.

## Regras
1. Só chat vinculado a um único cliente chega ao tratamento (vínculo por prova de posse, já existente). Vínculo ambíguo continua indo para pendência.
2. A clínica vem do cadastro do cliente, nunca do conteúdo da mensagem.
3. O tipo é decidido pela assinatura real do arquivo (PDF, JPEG, PNG); limite de 20 MB; arquivo recusado não chega ao motor.
4. Falha transitória no download: HTTP 500, nada gravado, o Telegram reentrega. Falha ao iniciar a leitura: arquivo registrado, cliente informado sem promessa falsa.
5. Mensagem editada com anexo não reprocessa. Reentrega duplicada não repete resposta nem registro.
6. A Caixa de Entrada recebe um resumo textual (nome do arquivo e destino), nunca o conteúdo; o repasse ao chat de alerta usa o outbox durável existente.

## Prova
`telegram-anexo-exame-rota.test.ts` (10 testes) + suíte Telegram: 26 arquivos, 381 testes, 0 falhas; `tsc` limpo.
Falha antiga investigada: `telegram-worker-profile` esperava 2 tarefas; o terceiro cron (calendário Meus Jogos, somente leitura) foi adicionado por outro trabalho sem atualizar o teste. Teste atualizado para 3 (inclui a expressão `*/15 * * * *`); nenhuma proteção foi afrouxada.

## Limitações
- Nenhuma chamada real ao Telegram: download e envio simulados; sem prova EXTERNA.
- Gravação real em PostgreSQL do registro do anexo não exercitada (banco simulado); o INSERT é o mesmo da mensagem de texto, já provado em banco descartável.
- Foto e PNG/JPEG não são lidos pelo motor (só PDF).
