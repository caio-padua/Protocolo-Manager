# SUB-05 — Ligar + WhatsApp da clínica no evento

Onda: Cadastros e Agendas. Item do CEO: 2. Data: 20/06/2026.

## Objetivo (uma frase)
Acrescentar à descrição do evento do Google dois atalhos de contato da clínica: "Ligar" (link tel:) e "WhatsApp" (link wa.me), usando o telefone da clínica da sessão.

## Contexto
O Pacote B já tem o bloco NAVEGAÇÃO (Google Maps, Waze, Apple Maps). Faltavam os contatos por estarem sem telefone oficial. O CEO informou o número oficial: +55 11 97715-4000.

## Requisitos exatos
1. No `buildDescriptionBody` (lib/google-calendar.ts), adicionar um bloco CONTATO (ou estender NAVEGAÇÃO) com:
   1.1. "📞 LIGAR" -> link `tel:+5511977154000` (E.164, sem espaços).
   1.2. "💬 WHATSAPP" -> link `https://wa.me/5511977154000` (sem o sinal de mais, padrão wa.me).
2. Fonte do número (ordem de prioridade):
   2.1. Telefone da clínica da sessão (`locations.phone`, da SUB-01), quando existir.
   2.2. Fallback para o número oficial +5511977154000 quando a clínica não tiver telefone.
3. Manter o padrão do Pacote B: título de seção em MAIÚSCULAS, sem HTML, e os links como texto/URL que o Google Calendar torna clicável.
4. O número oficial +5511977154000 também deve ficar gravado como telefone do Instituto Padua (semente da SUB-01), para que a prioridade 2.1 já funcione na clínica principal.

## Casos extremos
1. Clínica sem telefone e sem fallback -> omitir os botões (não exibir link quebrado).
2. Número em formato livre -> normalizar para E.164 antes de montar tel:/wa.me.
3. Número internacional -> respeitar o DDI informado; não forçar +55 se já vier com outro DDI.

## Definição de PRONTO
1. Evento real (sessão de teste) exibindo "LIGAR" (tel:) e "WHATSAPP" (wa.me) com o número correto, comprovado pela descrição real lida via API do Google.
2. Prioridade telefone-da-clínica -> fallback-oficial comprovada (clínica com telefone usa o dela; sem telefone usa o oficial).
3. Aprovação do architect.

## Linhas vermelhas
1. Não quebrar o Pacote B (símbolos, HORÁRIO, MAIÚSCULAS, Convite A/B, NAVEGAÇÃO).
2. Não inventar telefone quando não houver número nem fallback.

## RESUMO EM 1 LINHA
Bloco de contato no evento com "Ligar" (tel:) e "WhatsApp" (wa.me) usando o telefone da clínica da sessão, com fallback para o número oficial +55 11 97715-4000.
