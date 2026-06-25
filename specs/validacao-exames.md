# Spec — Módulo 3: Validação de Exames (liga/desliga) + Lista de Validação

Data: 25/06/2026. Autor: Dr. Replit Paxter (a mando do CEO Dr. Caio). Método: Paxter Loop.
Origem: ENTREGA 28 (Motor de Encantamento). Decisão do CEO: a validação **nasce LIGADA** por padrão.

## Objetivo (uma frase)
Permitir que o pedido de exames gerado a partir da anamnese passe (ou não) pela validação humana do
Dr. Caio ou de médicos assistentes, conforme um interruptor liga/desliga: LIGADO = vai para uma lista
de validação e só é encaminhado ao cliente após aprovação; DESLIGADO = é encaminhado automaticamente.

## Glossário (siglas explicadas na 1ª vez)
| Termo | Significado |
|---|---|
| Guia de exames | O documento/mensagem com os exames que o cliente deve fazer antes da consulta |
| Validação | Ato de um médico conferir/ajustar/aprovar os exames antes de o cliente receber |
| Médico assistente | Profissional com papel `medico_01`/`medico_02` (já existe na base) que pode validar |
| Toggle | Interruptor liga/desliga |
| Motor da anamnese | Lógica que sugere exames a partir das respostas (NÃO se altera nesta spec) |
| Alerta clínico | Sinalização vermelho/amarelo/verde da anamnese (linha vermelha do sistema) |

## Estado atual (verificado)
1. A anamnese já existe e gera/sugere conteúdo clínico; o alarme clínico é defendido em 3 camadas
   (memória `anamnese-v2-linha-vermelha`). NÃO se toca nele.
2. Papéis de profissional já existem (`role`: medico_01, medico_02, etc.).
3. O encaminhamento por e-mail (Gmail) e WhatsApp (Twilio dormente) já está arquitetado.

## Requisitos exatos
1. INTERRUPTOR de validação (configuração do sistema):
   - Chave `exam_validation_enabled` (booleano), **default LIGADO**.
   - Editável pelo CEO numa tela de configuração (aba Cadastro/Configurações). Reversível a qualquer hora.
2. LIGADO → fila de validação:
   - GATILHO NÃO-INVASIVO: o pedido nasce no BOUNDARY (uma rota/evento de PÓS-CONCLUSÃO da anamnese),
     sem alterar o motor, a skip-logic ou o alarme clínico (linha vermelha). A anamnese só emite o sinal
     "concluída"; este módulo escuta esse sinal e cria o registro — nunca por dentro do motor.
   - O pedido de exames entra como registro PENDENTE na lista de validação.
   - O guia de exames **NÃO** é enviado enquanto não houver aprovação; o vídeo (Módulo 2) também
     **NÃO** é gerado/enviado antes da aprovação.
3. DESLIGADO → automático:
   - Mesmo gatilho de boundary (pós-conclusão da anamnese). Encaminha automaticamente, sem fila.
   - CONTRATO ÚNICO DE DISPARO: em AMBOS os estados do toggle, o evento que libera (a APROVAÇÃO no
     LIGADO; a CONCLUSÃO no DESLIGADO) dispara JUNTOS o guia de exames E o vídeo personalizado (Módulo 2),
     pelos mesmos canais (e-mail/WhatsApp). Não existe caminho em que o guia sai sem o vídeo, nem o
     contrário.
4. LISTA DE VALIDAÇÃO (tela interna, papel médico):
   - Mostra pendentes com: nome do cliente, resumo da anamnese, exames sugeridos pelo motor, data.
   - Ações: APROVAR (libera), EDITAR (adicionar/remover exames antes de liberar), e registrar quem
     validou e quando.
   - Ao APROVAR: dispara o guia de exames (e-mail/WhatsApp) + aciona o Módulo 2 (vídeo).
5. PERSISTÊNCIA: tabela `exam_validations` (clientId, anamneseRef, examesSugeridos jsonb,
   examesFinais jsonb, status [pendente|aprovado], validadoPor, validadoEm). Não alterar tabelas
   existentes além de adicionar esta.
6. RASTRO: todo envio de guia registra origem (automático x validado) e o responsável.

## Casos extremos a tratar
| Caso | Tratamento |
|---|---|
| DESLIGADO porém anamnese com ALERTA VERMELHO | Decisão pendente do CEO (sugiro: forçar validação mesmo desligado, por segurança) |
| Vários médicos | Qualquer médico válido pode aprovar; registra-se quem aprovou (sem disputa) |
| Cliente aguardando enquanto pendente | Status "em análise"; nada é enviado até aprovar |
| Médico edita e remove todos os exames | Permitido; registra a edição; se ficar vazio, exige confirmação explícita |
| Toggle muda no meio | Pendentes já criados continuam na fila; novos seguem o estado atual do toggle |

## Linhas vermelhas (NÃO cruzar)
- NÃO tocar o motor da anamnese, skip-logic, persistência (flush/rascunho) nem o alarme clínico.
- Quando LIGADO, NUNCA enviar o guia antes da aprovação.
- NÃO inventar autorização nova: usar os papéis médicos existentes.
- Validar por runtime/screenshot (typecheck global é pré-quebrado).

## Definição de PRONTO
| Critério | Como conferir |
|---|---|
| Toggle persiste e tem default LIGADO | GET config mostra true; alternar e reler |
| LIGADO segura o envio | Concluir anamnese → guia NÃO sai; aparece na lista como pendente |
| Aprovar libera | Aprovar na lista → guia é enviado + Módulo 2 acionado |
| DESLIGADO encaminha automático | Concluir anamnese → guia sai sem fila |
| Edição de exames antes de liberar | Adicionar/remover na lista e ver refletido no guia enviado |
| Tabela exam_validations | push roda; SELECT funciona |
| Revisão architect | requisito por requisito, zero pendência |

## Pergunta aberta para o CEO (uma só)
Mesmo com a validação DESLIGADA, um **alerta vermelho** da anamnese deve **forçar** a validação humana?
- Opção A (recomendada): sim — vermelho sempre passa por médico, por segurança.
- Opção B: não — desligado é desligado, encaminha tudo automático.

## RESUMO EM 1 LINHA
Módulo 3 = interruptor que, LIGADO (padrão), segura o guia de exames numa lista para o médico aprovar/
ajustar antes de enviar; DESLIGADO, encaminha automático — sem nunca tocar o motor da anamnese.
