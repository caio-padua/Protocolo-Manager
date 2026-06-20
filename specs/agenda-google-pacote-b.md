# Spec — Pacote B do Evento Google (símbolos, relógio, negrito, convite A+B, Kaizen)

Data: 20/06/2026. Decisão do CEO: "B e depois c" → construir AGORA o pacote do evento; o
feed iCal por cliente fica para o loop seguinte. Fonte da verdade: conversa do chat +
`specs/agenda-google-padrao-evento.md` (onda anterior, padrão Pawards MedCore).

## OBJETIVO (uma frase)
Aprimorar o evento do Google Agenda: trocar os polegares por ✅/❌, exibir o horário com
emoji de relógio, destacar os títulos em MAIÚSCULAS, parar de apagar+recriar o evento (fim do
"Evento cancelado"), parar de forçar convite/RSVP, e somar ferramentas Kaizen (Apple Maps +
alarmes).

## REQUISITOS EXATOS

### R1 — Símbolos ✅ ocorre / ❌ não ocorre
- Substituir 👍 (THUMBS_UP) por ✅ (U+2705) e 👎 (THUMBS_DOWN) por ❌ (U+274C) na lista de
  Procedimentos.
- Motivo (decisão do CEO): polegares têm a mesma silhueta e confundem; ✅/❌ separam por forma
  E cor. Recusado o ❎ (verde) por repetir a confusão.

### R2 — Relógio por horário (entre Unidade e Procedimentos)
- Nova seção, exatamente nesta posição: depois de `Unidade:` e antes de `PROCEDIMENTOS:`.
- Uma linha em branco ANTES e uma DEPOIS do bloco (igual aos demais blocos).
- Formato: título `HORÁRIO:` e abaixo a linha `<relógio> HH:MM às HH:MM`.
  - Exemplo: `🕘 09:00 às 09:15`.
- O emoji do relógio inicia a linha e corresponde ao horário de início.
- Os emojis de relógio existem de 30 em 30 minutos → arredondar para o mais próximo:
  minuto < 15 → :00 da hora; 15..44 → :30 da hora; ≥45 → :00 da hora seguinte.
- Hora fim = início + Duração Total (mesma duração já exibida e usada no evento).
- Mapa de emojis: hora cheia 🕐..🕛 (U+1F550..U+1F55B), meia hora 🕜..🕧 (U+1F55C..U+1F567);
  hora 12h = ((h % 12) || 12).

### R3 — Negrito via MAIÚSCULAS nos títulos de seção
- Padronizar os títulos de seção em MAIÚSCULAS: `UNIDADE:`, `HORÁRIO:`, `PROCEDIMENTOS:`,
  `DURAÇÃO TOTAL:`, `STATUS:`, `SUBSTÂNCIAS PROTOCOLO:`, `LEGENDA:`, `ENDEREÇO`, `NAVEGAÇÃO:`.
- Maiúsculas é o destaque universal (lê igual no Google e no iPhone). NÃO injetar HTML (`<b>`)
  para não arriscar quebrar o layout em linhas nem vazar tag crua em clientes texto-puro.
- O conteúdo (nomes, substâncias) mantém acentuação e capitalização normal.

### R4 — Convite A + B (parar de apagar+recriar e parar de forçar RSVP)
- B (fim do "Evento cancelado"): na sincronização (sync-session e sync-week), quando a sessão
  já tem `googleEventId` E o calendário de destino é o MESMO já salvo (`googleCalendarId`),
  ATUALIZAR o evento existente (events.update, corpo completo, mesmo eventId) em vez de
  apagar+recriar. Só quando o calendário MUDA é permitido apagar (com `sendUpdates: 'none'`,
  para não disparar "cancelado") e recriar no novo calendário.
- A (sem convite forçado): o evento vive nos calendários da clínica e NÃO depende de aceite do
  cliente. Não adicionar o cliente como participante (attendee) e usar `sendUpdates: 'none'` na
  criação/atualização. A entrega ao cliente (arquivo "Adicionar"/feed) é do próximo loop.

### R5 — Kaizen no evento (somente o que não depende de dado novo)
- Apple Maps: adicionar link `https://maps.apple.com/?q=<endereço>` no bloco NAVEGAÇÃO, junto de
  Google Maps e Waze (todos por endereço; já funcionam sem coordenadas).
- Alarmes: trocar os lembretes para 1 dia antes (1440 min) e 2 horas antes (120 min).

## FORA DO ESCOPO (próximo loop, com o feed iCal)
- Convite C (mandar arquivo .ics "Adicionar" por e-mail), reforço mensal com rastreio,
  onboarding ao fechar protocolo, ferramenta manual "Reenviar agenda ao cliente", e o feed iCal
  privado por cliente. Motivo: compartilham a MESMA engrenagem de entrega (.ics + rastreio);
  fazê-los juntos evita retrabalho (zelo acima de velocidade).
- "Ligar" (tel:) e "WhatsApp da clínica" (wa.me): dependem do telefone oficial da clínica, que
  não existe no banco — pendente o CEO informar o número.
- GPS por coordenadas exatas: a tabela `locations` não guarda latitude/longitude; os três mapas
  já fixam o pino pelo endereço. Coordenada exata fica para quando houver o campo.

## CASOS EXTREMOS
- Horário com minutos quebrados (ex.: 09:15) → arredonda para o relógio mais próximo (09:00).
- 23:50 → arredonda para 00:00 (🕛). Tratar hora 24 → 0.
- Sessão sem endereço → não exibe HORÁRIO? Não: HORÁRIO independe de endereço; sempre exibe.
- Sessão sem substâncias → mantém comportamento atual.
- Evento legado sem `googleCalendarId` salvo → tratado como calendário diferente (pode recriar
  uma vez com sendUpdates 'none').

## DEFINIÇÃO DE PRONTO
1. Lista de Procedimentos mostra ✅ nos ativos e ❌ nos inativos.
2. Bloco HORÁRIO aparece entre UNIDADE e PROCEDIMENTOS, com linha em branco antes/depois, no
   formato `🕘 09:00 às 09:15`, com o relógio certo para o horário.
3. Títulos de seção em MAIÚSCULAS; sem tags HTML cruas na descrição.
4. Re-sincronizar a mesma sessão NÃO gera novo eventId (atualiza o mesmo); o evento não some
   nem dispara "cancelado".
5. Evento criado sem participante (attendee) e com `sendUpdates: 'none'`.
6. Bloco NAVEGAÇÃO traz Apple Maps + Google Maps + Waze; lembretes em 1 dia e 2 horas.
7. Validação real: events.get na API confirma o novo formato numa sessão real da Dayana
   (protocolo 20, cliente 12) no calendário ENFERMAGEM-LOCAL; re-sync mantém o mesmo eventId.

## LINHAS VERMELHAS
- Não alterar o MOTOR de cálculo de slots/ocupação (agenda-motor) nem o roteamento
  recurso→calendário.
- Não mexer nos outros geradores de PDF.
- Não inventar autenticação nem telefone/coordenada que não existam.
- Não apagar/mexer em cadastros reais além das sessões-demo da Dayana.
