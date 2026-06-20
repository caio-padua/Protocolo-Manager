# Spec — Padrão do Evento no Google Agenda (padrão Pawards MedCore) + Demo Dayana

Data: 20/06/2026. Fonte da verdade visual: 3 prints enviados pelo CEO (Anderson Ribeiro
Soares e Anderson Ribeiro Da Silva). O evento do Google deve ficar IDÊNTICO a esses prints.

## PRONTO QUANDO
1. O TÍTULO do evento segue: `NOME DO CLIENTE CPF xxx.xxx.xxx-xx [SESS]`.
2. A DESCRIÇÃO do evento segue, na ordem e com os mesmos rótulos dos prints:
   - `Developed by: Pawards MedCore`
   - Nome do cliente
   - `CPF.: xxx.xxx.xxx-xx`
   - `Agendamento Número: N/Total` (N = número da ida; Total = total de idas do protocolo)
   - `Unidade: <unidade>`
   - `Procedimentos:` lista FIXA de 6, cada um com polegar (👍 ativo / 👎 inativo) e a
     contagem de tempo entre colchetes:
       - Aplicação Intramuscular [15min]
       - Aplicação Endovenosa [30min]
       - Consulta [60min]
       - Retorno ou Avaliação [30min]
       - Procedimento Específico [60min]
       - Implante [60min]
   - `Duração Total: Xmin` (soma das durações só dos procedimentos ATIVOS, sem repetir tipo)
   - `Status:` + quadrado colorido + texto (Programada/Realizada/Não Realizada)
   - `Substâncias Protocolo:` cada linha: `🟩 [n/total] Nome dose [ESTADO]`
   - `Legenda:` 4 linhas: 🟩 DISP, 🟨 PROX, 🟦 APLI, ⬜ INDI
3. Cores dos quadrados: 🟩 verde=DISP, 🟨 amarelo=PROX, 🟦 azul=APLI, ⬜ branco=INDI.
4. Acentuação PRESERVADA na descrição (é produto, não carta entre agentes).
5. A duração do evento (hora fim) = a mesma "Duração Total" exibida (consistência).
6. Demo real: cliente Dayana Ludman (cadastro real, id 12), protocolo com 2 substâncias,
   4 sessões/idas, com FREQUÊNCIAS DIFERENTES entre as duas substâncias (ex.: uma a cada
   7 dias, outra a cada 14 dias), de modo que o estado por substância (DISP/PROX) varie por
   ida. Sincronizado no calendário AGENDA ENFERMAGEM - LOCAL.
7. Validação real: events.get na API do Google confirma título + descrição no padrão acima,
   no calendário certo, para as 4 idas.

## LINHAS VERMELHAS (não fazer)
- Não alterar o MOTOR de cálculo de slots/ocupação (agenda-motor).
- Não tocar nos outros geradores de PDF.
- Não inventar autenticação.
- Não apagar/mexer em cadastros reais além de criar o protocolo-demo da Dayana.
- O motor de roteamento por recurso→calendário (onda anterior) permanece intacto.

## MAPEAMENTO DE PROCEDIMENTOS (tipo interno → rótulo do print)
- im → Aplicação Intramuscular [15min]
- iv → Aplicação Endovenosa [30min]
- consultation → Consulta [60min]
- (sem tipo interno) → Retorno ou Avaliação [30min]  (sempre 👎 por ora)
- (sem tipo interno) → Procedimento Específico [60min] (sempre 👎 por ora)
- implant → Implante [60min]
