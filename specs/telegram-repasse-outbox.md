# Telegram — recuperação do repasse ao chat de alerta (Etapas 3 e 4)

## Etapa 3 (feita) — recebimento
- Reivindicação por (identidade do bot, update_id) para TODOS os fluxos do webhook (tabela `telegram_updates_processados`, aditiva).
- Estados: processando / concluido. Reentrega de concluído = 200 sem efeito. Reentrega de "processando" recente = 500 (pede nova tentativa; 200 perderia a mensagem se o 1º processamento falhar).
- Falha técnica passageira (banco/conexão) = 500 e reivindicação liberada. Falha permanente = 200 + log mínimo (sem texto, sem token).
- Sem update_id válido = processa sem dedupe e registra aviso. Evento sem chat (ex.: botão) = 200 sem efeito, log só com o tipo.
- Segunda defesa mantida: índice único (chat_id, update_id) em `telegram_inbox_messages`.

## Etapa 4 — recuperação do repasse (outbox mínimo)
Não existia fila reaproveitável para este repasse (`mensageria_lembrete` é do motor de lembretes, etapa 6).
Tabela nova aditiva `telegram_repasse_ceo` (uma linha por mensagem salva e destino).

| Estado | Significado | Próximo passo |
|---|---|---|
| pendente | mensagem salva, repasse ainda não tentado | tentar agora |
| enviando | tentativa em curso | se passar de 5 min sem fechar = incerto |
| aceito_telegram | a API do Telegram aceitou a mensagem | fim (não prova leitura humana) |
| falhou | recusa temporária, sem token, limite de taxa, erro 5xx | nova tentativa com espera crescente (1,2,4... até 60 min), máximo 6 |
| esgotado | recusa permanente (4xx) ou 6 tentativas | humano confere; mensagem segue salva no Cockpit |
| incerto | rede caiu ou processo caiu no meio do envio | NÃO reenvia sozinho (poderia duplicar); humano confere |

Regras: salvo != entregue; sem promessa de exatamente-uma-vez; mensagem do Cockpit nunca depende do repasse.
Reversão: `DROP TABLE IF EXISTS telegram_repasse_ceo;`

## Revisão independente (rodada única) — correções aplicadas
- Reivindicação com `dono`: processamento antigo reassumido não conclui nem libera o novo.
- A resposta ao Telegram só sai depois do fechamento (concluir/liberar) da reivindicação.
- Cofre do segredo indisponível = 500 (reentrega), não 200.
- Registro do repasse no outbox acontece antes do 200; falha passageira = 500; falha permanente = aviso direto + ERROR.
- Logs de erro do Telegram saneados (apenas `telegram_http_NNN` ou categoria genérica).
- Retomada: job no api-worker (a função `startCronJobs` do api-server é legada e não é chamada).
