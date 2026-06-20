# SUB-04 — Convite por e-mail (.ics) + subwave de entrega

Onda: Cadastros e Agendas. Item do CEO: 1 (com "tudo de bom" da subwave). Data: 20/06/2026.

## Objetivo (uma frase)
Entregar o evento ao cliente por canal próprio: e-mail com um arquivo "Adicionar à agenda" (.ics) que ele toca e cai na agenda pessoal dele, sem depender do RSVP do Google (Convite C), e preparar os demais reforços de entrega.

## Contexto
O Pacote B já fez o Convite A (evento sem attendee, sendUpdates:'none') e o Convite B (atualizar o mesmo evento). Faltou o Convite C: dar ao cliente um jeito de salvar na agenda DELE. Já existe geração de .ics no sistema (download por sessão/semana) e envio de e-mail via Gmail API.

## Requisitos exatos (núcleo — obrigatório)
1. Anexar um arquivo `.ics` (iCalendar) ao e-mail enviado ao cliente para cada sessão agendada, com:
   1.1. Título, data/hora (fuso da clínica, BRT/UTC-3), duração correta (IV 30min / IM 15min / Implante 60min), local (endereço da clínica), e uma descrição enxuta.
   1.2. `METHOD:PUBLISH` (arquivo para o cliente ADICIONAR à própria agenda; não é convite com RSVP).
   1.3. `UID` estável por sessão (mesma sessão -> mesmo UID) e `SEQUENCE` incremental, para que reenvios atualizem em vez de duplicar no app do cliente.
2. Corpo do e-mail com uma chamada clara "Adicione à sua agenda" explicando que basta abrir o anexo.
3. Reaproveitar o gerador de .ics já existente (não criar um segundo motor de iCal); apenas adaptar METHOD/UID/SEQUENCE se necessário.

## Requisitos da subwave (cada um marcado se exige schema novo)
4. Reenvio manual ("Reenviar agenda ao cliente"): botão/rota que reenvia o e-mail com o .ics da sessão (ou da semana). SEM novo schema.
5. Onboarding ao fechar protocolo: ao fechar/validar um protocolo, enviar ao cliente um e-mail de boas-vindas com a agenda inicial (.ics consolidado das próximas sessões). SEM novo schema obrigatório (usa dados existentes).
6. Reforço mensal (lembrete recorrente): enviar ao cliente um resumo mensal das sessões do mês. EXIGE schema novo (registrar `lastMonthlyReminderAt` por cliente/protocolo) para não reenviar duplicado. Marcar como SUBITEM que adiciona 1 coluna.
7. Feed iCal privado (assinatura): URL assinada (HMAC com SESSION_SECRET, como o portal) que devolve um .ics com TODAS as sessões futuras do cliente; o cliente assina uma vez e a agenda dele atualiza sozinha. EXIGE rota nova pública assinada; sem schema novo (token derivado de CPF+nascimento, como o portal).

## Casos extremos
1. Cliente sem e-mail -> não tenta enviar; registra aviso, não quebra o agendamento.
2. Reenvio -> UID estável evita duplicar no app do cliente; SEQUENCE sobe.
3. Fuso horário -> sempre BRT (UTC-3) explícito no .ics (TZID), nunca o fuso do servidor.
4. Sessão cancelada -> .ics com STATUS:CANCELLED no reenvio (remove da agenda do cliente).
5. Feed iCal -> token inválido/expirado devolve 401 genérico (sem enumeração de CPF).

## Definição de PRONTO
1. E-mail real enviado para um endereço de teste com .ics anexado que abre e cria o evento numa agenda pessoal (validado abrindo o arquivo).
2. UID estável comprovado (reenvio não duplica).
3. Reenvio manual e onboarding funcionando.
4. Reforço mensal e feed iCal: ENTREGAR nesta sub-spec apenas se não estourar o escopo; caso contrário, deixar a coluna/rota preparada e marcar claramente como subitem concluído ou deferido na revisão. (O CEO pediu "tudo de bom" — a meta é entregar; o que não couber com qualidade, deferir explicitamente, nunca anunciar como feito sem estar.)
5. Aprovação do architect.

## Linhas vermelhas
1. NÃO transformar o evento da clínica em convite com RSVP (mantém Convite A no evento interno).
2. Não duplicar o motor de .ics existente.
3. Fuso sempre BRT explícito.
4. Não anunciar subitem como pronto se ficou deferido (Art.47).

## RESUMO EM 1 LINHA
E-mail ao cliente com arquivo "Adicionar à agenda" (.ics PUBLISH, UID estável), mais reenvio manual, onboarding ao fechar protocolo e — se couber com qualidade — reforço mensal e feed iCal privado.
