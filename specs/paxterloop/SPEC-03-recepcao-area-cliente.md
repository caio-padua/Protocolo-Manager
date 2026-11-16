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
