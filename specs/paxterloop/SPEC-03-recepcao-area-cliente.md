# SPEC 3 — Recepção de exame pela Área do Cliente

Estado: TESTADO (BANCO + MOCK de Drive/IA/e-mail). Não HOMOLOGADO. Data: 16/11/2026.

## Objetivo
O cliente envia o exame pela Área do Cliente com vínculo seguro, o arquivo é validado e processado, e a tela distingue "arquivo recebido" de "exame concluído".

## Reaproveitado (nada recriado)
`/client-portal/upload` (Drive + motor), `/area-paciente/exames/envios` e `evolucao`, tela `ENVIAR` com `UploadStatusPoller` em `pages/area.tsx`.

## Achados e correções
1. O conteúdo do arquivo não era validado: PDF falso ia ao Drive. Agora, para tipos de exame (exceto "outro"), a assinatura real precisa ser PDF, JPEG ou PNG e coerente com o tipo declarado; recusa 400 antes do Drive.
2. Cliente inativo podia enviar. Agora 404.
3. Falha ao iniciar a leitura era silenciosa. A resposta agora traz `processamento`: iniciado, nao_iniciado ou nao_aplicavel; a tela mostra texto honesto.
4. Token também aceito em `Authorization: Bearer` (mantido no corpo por compatibilidade).
5. BUG real: a contagem de resultados da lista de envios comparava `exam_document_id` com o id do próprio resultado (referência de coluna sem prefixo), mostrando números errados. Corrigido com prefixo de tabela.
6. Mensagem de erro de leitura na tela: orienta enviar versão mais nítida; não promete reprocessamento automático.

## Prova
Teste: `exam-area-cliente-recebimento-postgres.test.ts` (10 testes): sem token, forjado e token com sufixo = recusados; PDF falso recusado sem tocar Drive nem banco; PDF válido cria documento na clínica do cliente e fica "conferência", nunca "concluído"; Bearer; reenvio sem duplicar; contagem por documento; cliente B não vê envios nem evolução do A e `?clientId=` é ignorado; erro final com 0 resultados; cliente sem clínica = `nao_iniciado`; foto não entra no motor. Junto com os testes de fluxo e identidade: 51 passaram; `tsc` do servidor limpo.

## Limitações
- Sem captura de tela da Área do Cliente (exige login por CPF e nascimento reais); a mudança visual é só de texto.
- Expiração do token (30 min) não exercitada por teste.
- Envio de JPEG/PNG é guardado no Drive, mas só PDF entra no motor de leitura.
- Drive, IA, e-mail e WhatsApp simulados.

---

# ADENDO 16/11/2026 — Painel "ENVIOS RECENTES" (terceiro painel da aba ENVIAR) e marcos explícitos

## A. Situação anterior (documentada antes da mudança)
1. Aba ENVIAR tinha o formulário "ENVIAR ARQUIVO" (panel-3d, barra superior login-card-topbar). Após o envio, o formulário era trocado por um acompanhamento de um único arquivo (consulta a cada 5 s).
2. A "inferência" rejeitada: a primeira versão deste painel derivava as etapas 2 e 3 do status global do documento. Removida.
3. Não foi possível reconstituir o layout "de dois painéis" citado no pedido de 14/11 (texto indisponível após compactação). Registrado como pendência D-A.

## B. Comparação das barras
| Item | Barra do protocolo DO PACIENTE | Barra Hermès (admin) |
|---|---|---|
| Onde | ProtocolCard (area.tsx) e "Progresso do tratamento" | pages/protocols/index.tsx |
| Componente | SegmentedBar (paxter-bar-track / paxter-bar-fill) | ProgressBar com marcadores romanos |
| Cartão | panel-3d, topbar, grade MetaField 2 colunas, rótulo PROGRESSO + % | uso administrativo |
Decisão: o envio reutiliza SegmentedBar e a gramática do ProtocolCard. Barra Hermès permanece só no admin (sem evidência de que seja a referência do paciente).

## C. Modelo de marcos (sem inferência)
| # | Etapa | Evidência que a conclui |
|---|---|---|
| 1 | Arquivo recebido | registro do documento (created_at) |
| 2 | Leitura preliminar | marco gravado em exam_document_marcos (concluido) |
| 3 | Dados extraídos | marco gravado após a fusão das leituras |
| 4 | Identificação validada | exam_identity_checks: verificação confirmada (método automático) ou liberação humana; rejeição = falhou; revisão/contradição sem decisão = pendente |
| 5 | Revisão C1 | conf1_at preenchido |
| 6 | Revisão C2 | status "conferido" (única via: rota de conferência exige C1 prévio e médico ativo com vínculo) |
Regras: percentual = etapas concluídas / 6; 100% só com as seis; "recebido" não prova identidade; envio anterior ao rastreio só conclui etapas 2 e 3 se houver resultados gravados, com a nota "Envio anterior ao rastreio". Tabela nova aditiva exam_document_marcos (reversível com DROP TABLE; nada depende dela). Falha em gravar marco nunca derruba o processamento.
"Etapa avançada — configuração pendente": rótulo neutro (não conta no percentual, sem indicador de processamento). A etapa "sinapses e fisiologia" não tem mecanismo comprovado: NÃO IMPLEMENTADA.
Atualização: consulta periódica a cada 4 s ao servidor (não é tempo real); o texto da tela diz isso.
Privacidade: o portal recebe só rótulo do método e horários; sem CPF, sem nome de profissional; endpoint filtra pelo token do portal (cliente) e pelo client_id nas verificações.

## D. Hover ao chegar em 100%
Comportamento provisório (mostra "Validado. N resultados na aba EVOLUÇÃO"). NÃO VALIDADO. Pergunta objetiva D-B: qual é o texto exato desejado?

## E. Nomenclatura
DEEx = nome comercial escolhido pelo proprietário (constante NOME_COMERCIAL_EVOLUCAO); TEX = nome anterior/alias; chaves técnicas evolucao_exames. Botão DEEx funcional para a EQUIPE no painel EVOLUÇÃO do Cockpit (últimas 5 / completo / prévia interna só por escolha). Botão do paciente fica na SPEC 7 fatia 2b e depende de política comercial (D2–D6); nenhum PDF é liberado ao paciente e nenhuma cobrança é feita.

## F. Provas
| Nível | Teste | Resultado |
|---|---|---|
| Puro | exam-marcos-envio.test.ts, 11 testes (transições 0–100%, identidade negativa, legado, C2, etapa avançada, sem dado pessoal) | passou |
| BANCO descartável + cadeia real | exam-marcos-envio-postgres.test.ts, 6 testes (fluxo completo com C1/C2 reais, quarentena, falha, recebido sem identidade, 401, cliente cruzado, C2 antes de C1 = 409) | passou |
| Navegador (API simulada sintética) | e2e/area-envios-recentes.spec.ts, 11 testes, celular 390 e desktop 1280 (ordem, percentuais, falha, vazio, erro, hover, barra igual à do protocolo, sem rolagem horizontal) | passou |
| Captura de tela | evidencias/envios/*.png | gerada com API simulada; não é prova com servidor real |
Não validado: login real por CPF e nascimento; hover validado pelo proprietário; botão DEEx em navegador (só typecheck).
