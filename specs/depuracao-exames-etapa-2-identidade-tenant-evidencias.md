# Depuração de Exames — Etapa 1 (identidade e isolamento por clínica): evidências

Data: 16/11/2026. Dados 100% sintéticos, PostgreSQL descartável, nenhuma mensagem enviada, nada publicado.

## 1. Conclusão

| Etapa                                              | Estado        |
|----------------------------------------------------|---------------|
| Etapa 1: identidade do laudo + isolamento clínica  | PRONTA PARA HOMOLOGAÇÃO (ver lacunas) |
| Etapa 2: tela /area e linha do tempo persistida    | PARCIAL: só correções pontuais |
| Etapa 3: Gemini + OpenAI + Claude, benchmark       | NÃO INICIADA  |

## 2. Provas executadas

| Nível  | Esperado                                                                 | Obtido                  | Passou |
|--------|--------------------------------------------------------------------------|-------------------------|--------|
| SMOKE  | Compilação do servidor sem erro (tsc)                                    | 0 erros                 | Sim    |
| DADO   | 22 casos do verificador de identidade (CPF, nome, nascimento)            | 22 de 22                | Sim    |
| DADO   | 32 casos em PostgreSQL descartável, autenticação real                    | 32 de 32                | Sim    |
| DADO   | Migração repetida 2x, UPDATE/DELETE recusados, desfazer repetível        | conforme                | Sim    |
| DADO   | SQL embutido no código igual ao arquivo de migração                      | idêntico                | Sim    |
| DADO   | Duas liberações simultâneas: uma 200, outra 409, resultados gravados 1x  | conforme                | Sim    |
| DADO   | Outra clínica: 404 em evolução, resultados, documentos, arquivo, ingestão| conforme                | Sim    |
| DADO   | Sem sessão: 401 em todas as rotas de dado de cliente                     | conforme                | Sim    |
| DADO   | Token do portal só nas rotas /area-paciente/exames; clientId da URL ignorado | conforme            | Sim    |
| DADO   | Importadores do Drive passam pelo mesmo porteiro                         | conforme (função comum) | Sim    |
| LOG    | exam-workspace (emissão individual): 31 de 31                            | 31 de 31                | Sim    |
| LOG    | exam-ingestion-idempotency: 5 de 5                                       | 5 de 5                  | Sim    |
| VISUAL | Captura de telas clínicas                                                | NÃO FEITA (exige ambiente sintético isolado comprovado) | Não |

## 3. Causa do 401 em exam-workspace

1. A simulação do login não preenchia `req.collaborator`, que a rota exige.
2. O catálogo sintético de exames não estava na fila de consultas, gerando 422.
3. Correção só na fixture. Nenhuma regra de segurança foi afrouxada; a recusa 401 sem colaborador continua testada.
4. Simulado de propósito nesse arquivo: a decisão de acesso clínico (matriz x concessão local).

## 4. O que mudou no comportamento

1. Laudo sem identidade, com só o nome, ou com CPF diferente: vai para quarentena, sem resultados, sem Drive, sem cofre, sem aviso ao cliente.
2. Só CPF válido igual, ou conjunto de nome e nascimento compatíveis, confirma. Dado ausente nunca confirma.
3. Contradição (por exemplo CPF de outra pessoa) só é liberada por médico com vínculo clínico e justificativa de 15 caracteres ou mais.
4. Rejeitar e liberar ficam em registro que não aceita alteração nem exclusão.
5. Clínica do documento vem sempre do cadastro do cliente; o número 5 fixo foi removido.
6. Área do Cliente: dados só pelo token do portal; acompanhamento mostra a situação real, sem "tempo esgotado".

## 5. Lacunas conhecidas (não escondidas)

1. Envio pelo portal antigo (`/client-portal/upload`) ainda grava o arquivo no Drive do cliente ANTES da verificação. A rota nova `/area-paciente/exames/enviar` não faz isso, mas a tela ainda usa a antiga.
2. Rotas de importação do Drive administrativas (`admin-drive`) têm autenticação própria não revisada.
3. Documentos antigos não foram reverificados retroativamente.
4. Exames de imagem não passam pelo porteiro de identidade.
5. Dados de produção e commits reais no Git não verificados.
6. Etapa 2 pendente: largura da tela, linha do tempo persistida por envio, marcadores triangulares. Feito: gráfico no topo por padrão na /area, ferramentas da equipe ocultas ao cliente, polling com tempo esgotado removido.
7. Etapa 3 pendente por inteiro.

## 6. Revisão independente

Pendente: revisão sequencial por segundo revisor (Art. 37 e 80) ainda não executada.
