# Spec — Auto-reagendamento da cliente (area do cliente)

Data: 20/06/2026
Autor: Dr. Replit Paxter
Metodo: Paxter Loop (Especificar -> Construir -> Revisar)

## Objetivo (uma frase)

Permitir que a propria cliente, pela AREA DO CLIENTE (rota `/area`, aba AGENDA) no celular, remarque a
DATA e horario de uma sessao futura ja existente do seu protocolo, com regras de seguranca e de
negocio, e que a mudanca valha no sistema e no Google Calendar imediatamente.

## Contexto ja existente (reaproveitar, nao reinventar)

1. AREA DO CLIENTE `/area` (mobile-first, "centrinho de operacoes") ja identifica a cliente por
   CPF + data de nascimento e devolve um TOKEN assinado (HMAC, validade 30 minutos). Rota:
   `POST /api/client-portal/identify`. A area tem abas INICIO, PROTOCOLOS, AGENDA, DOCUMENTOS, ENVIAR.
2. A aba AGENDA da area JA permite a cliente AGENDAR um novo atendimento sozinha: rotas
   `GET /api/area-paciente/agenda-recursos` (locais), `GET /api/area-paciente/agenda-slots` (horarios
   livres) e `POST /api/area-paciente/agendar`. O agendar usa o helper compartilhado `bookSession`
   (faz a marcacao + sincroniza o Google Calendar e devolve `googleSyncWarning`).
3. A aba AGENDA tambem ja lista as sessoes da cliente: `GET /api/area-paciente/sessoes`.
4. A sessao ja tem data (`scheduled_date`, texto AAAA-MM-DD), horario (`scheduled_time`), status,
   profissional, unidade e os campos do Google Calendar (`google_event_id`, `google_calendar_id`).
5. O que FALTA e o REAGENDAR: mover uma sessao que JA existe para nova data/horario (hoje so existe
   o `PUT /api/sessions/:id` administrativo, sem tela para a cliente).

## Requisitos exatos (numerados)

R1. Na AREA DO CLIENTE (`/area`), aba AGENDA: cada sessao futura listada ganha um botao "REAGENDAR"
    ao lado do "AGENDAR ATENDIMENTO" que ja existe. Visivel so apos a cliente se identificar (reusar o
    token existente; nao criar novo login). Reusar o seletor de local/horario que o agendar ja usa
    (agenda-recursos + agenda-slots).

R2. Listar SOMENTE as sessoes futuras reagendaveis da cliente do token: status = "scheduled" e
    `scheduled_date` >= hoje. Mostrar data (formato 24/06/2026), horario, protocolo e unidade.

R3. Reagendar: a cliente escolhe UMA sessao e informa a nova data; o horario pode ser mantido ou
    escolhido entre faixas da clinica (08:00 a 18:00, passo de 30 min).

R4. Endpoint novo `POST /api/area-paciente/reagendar` (mesma familia do agendar) exige o token e o id
    da sessao + nova data/horario. DEVE verificar que a sessao pertence a cliente do token (bloqueio de
    IDOR — impedir que uma cliente mexa na sessao de outra trocando o numero). Reaproveitar a logica do
    helper `bookSession` para a sincronizacao do Google Calendar.

R5. Regras de negocio (valores recomendados; o CEO confirma ou ajusta):
    R5.1 Antecedencia minima: so reagenda sessao que esteja a pelo menos 24 horas de distancia
         (nao pode remarcar em cima da hora). [default 24h]
    R5.2 Nova data: deve ser futura, de amanha ate 90 dias a frente; nao pode cair no passado nem
         depois do fim do protocolo. [default 90 dias]
    R5.3 Limite: no maximo 2 reagendamentos por sessao feitos pela cliente (anti-abuso). [default 2]
    R5.4 Aprovacao: AUTOMATICA (a mudanca vale na hora) e a clinica e NOTIFICADA. [default automatica]

R6. Auditoria: gravar que a cliente reagendou e quando. Schema: novas colunas em `sessions` ->
    `reschedule_count` (inteiro, default 0), `rescheduled_at` (texto/timestamp), `rescheduled_by`
    (texto: "cliente" | "clinica"). A data original NAO precisa de coluna nova (o historico fica no
    Google Calendar e no log); se o CEO quiser guardar a data antiga, vira R6.1.

R7. Efeitos colaterais ao reagendar (operacional de verdade):
    R7.1 Atualizar o evento no Google Calendar (mover para a nova data/horario) quando a sessao tiver
         `google_event_id`. Se nao tiver, seguir sem erro.
    R7.2 Enviar e-mail de confirmacao para a cliente (data nova, horario, protocolo).
    R7.3 Registrar no log da clinica (notificacao simples; cartao/Trello fica para onda futura).

R8. Mensagens claras e seguras (padrao do portal): erros genericos (nunca dizer "essa sessao e de
    outra pessoa"); confirmacao visivel com a data nova em formato brasileiro.

R9. Comunicacao final ao CEO em Densidade B; explicar siglas; fechar com "RESUMO EM 1 LINHA".

R10. (OPCIONAL — so se o CEO confirmar) Tornar a area do cliente um PWA (Progressive Web App = site
     que instala como aplicativo na tela inicial do celular e abre em tela cheia, sem barra do
     navegador). Hoje a area NAO e PWA (falta o `manifest` e o `service worker`). Entregavel: manifesto
     com nome/icone/cores Padcon Conect + service worker minimo, para a cliente "Adicionar a tela
     inicial" e abrir como app. NAO exige loja de aplicativo.

## Casos extremos a tratar

C1. Token expirado (30 min) -> pedir nova identificacao, sem vazar dado.
C2. Sessao inexistente, cancelada, ja realizada (status != scheduled) ou de outra cliente -> recusar.
C3. Nova data invalida (passado, antes da antecedencia minima, depois de 90 dias) -> recusar com motivo.
C4. Limite de reagendamentos atingido -> recusar e orientar a falar com a clinica.
C5. Falha do Google Calendar -> NAO travar o reagendamento (a data no sistema e a fonte da verdade);
    registrar o erro no log e seguir.
C6. Falha do e-mail -> mesmo tratamento: nao travar; logar.

## Definicao de PRONTO (qualquer um confere)

P1. Cliente identifica no portal, ve so as proprias sessoes futuras, reagenda uma para data valida e
    recebe confirmacao na tela com a data nova (formato brasileiro).
P2. A mudanca aparece na tela Agenda do administrador e (quando houver evento) no Google Calendar.
P3. IDOR bloqueado: token da cliente A nao consegue reagendar sessao da cliente B (teste real).
P4. Regras R5 respeitadas (testes: antecedencia, janela de 90 dias, limite de 2).
P5. Validado em runtime + captura de tela do portal; architect aprova requisito por requisito.

## Linhas vermelhas (NUNCA)

L1. NUNCA tocar o motor de geracao de sessoes do protocolo (so altera data/hora de UMA sessao ja
    existente).
L2. NUNCA permitir reagendar sessao com status diferente de "scheduled".
L3. NUNCA expor ou alterar dado de outra cliente (tudo preso ao token).
L4. NUNCA deixar uma falha de Google Calendar ou e-mail reverter/duplicar a sessao.
L5. NUNCA mudar o contrato OpenAPI de rotas existentes de forma que quebre a Agenda atual.
