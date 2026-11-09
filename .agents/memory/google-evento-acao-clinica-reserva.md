---
name: Ação clínica que atualiza evento do Google — reserva, prazo e testes
description: Regras para qualquer rota clínica que atualize evento existente do Google Agenda depois do commit (aplicação, conclusão de visita).
---

Ação clínica NUNCA reivindica a reserva (googleSyncPendingOperation) de outra operação: se há reserva ativa, devolve aviso e não escreve no Google.
A chamada events.update disparada por ação clínica tem prazo próprio (menor que o limite de resposta da tela) e libera só a reserva própria ao estourar; atualização reescreve o evento inteiro, então repetir é seguro.
Registrar duas substâncias seguidas é fluxo normal: reserva de ATUALIZAÇÃO espera poucos segundos; reserva de CRIAÇÃO continua recusando na hora (409).

**Why:** a revisão independente achou que reconciliar reserva alheia substituía a operação do envio manual enquanto ele ainda escrevia; sem prazo, um Google que nunca responde prendia a reserva e bloqueava todos os registros seguintes da visita.

**How to apply:** ao criar novo gatilho que toca o Google após commit (virada do dia, mensagem, rubrica), usar o mesmo caminho (aviso, nunca bloqueio, nunca dentro de transação) e testar "reserva alheia" e "Google que nunca responde".

Lição de teste: limite de tempo curto (dezenas de ms) em teste deixa trabalho assíncrono vazar para o teste seguinte sob carga e gera falha em cascata; usar sinal de entrada da chamada simulada e limites generosos.

Segunda revisão (mesma unidade): (1) o prazo da chamada ao Google é ABSOLUTO — cobre token + envio; se o token já gastou o prazo, nada é enviado (senão uma escrita tardia grava descrição velha depois de uma nova); sobra só o tempo restante como timeout. Requisição já enviada dentro do prazo ainda pode chegar tarde: risco aceito e dito ao CEO, sem correção automática até K4/K5 existirem. (2) QUALQUER leitura feita depois de gravar a reserva e antes de enviar fica dentro de try com devolução da reserva própria (CAS); na conferência de reserva incerta, restaura a operação anterior.
