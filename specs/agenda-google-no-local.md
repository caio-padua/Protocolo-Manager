# Aba "Agenda Google" no cadastro do local (Fase 1)

## Decisao do CEO (07/11/2026)
- Opcao A: cada profissional tem a SUA agenda Pessoal; o pessoal do Dr. Caio bloqueia so as agendas do Dr. Caio
  (Local e Remoto). A enfermagem tera a sua propria agenda Pessoal (a criar na Fase 3, so com autorizacao).
- REMOTO = online. EXTERNO = local fisico fora da clinica (endereco na descricao da agenda do Google).
- Online guarda o endereco da clinica como REFERENCIA, mais uma observacao do local.
- Mesmo CNPJ para todos: local nao e filial.

## Escopo da Fase 1 (so leitura do Google; nada e escrito no Google)
1. Escolher a agenda da conta Google conectada numa lista (nao colar codigo).
2. Papel da agenda: local | remoto | externo | pessoal | geral.
3. Usar a cor real do Google; usar o endereco da descricao da agenda do Google (o usuario revisa antes de salvar).
4. Importar arquivo .ics ou link (somente calendar.google.com) com PREVIA e confirmacao; idempotente por UID.
5. Campos novos do local: observacao_local, nome_espaco, agenda_papel.
6. Online pode herdar o endereco da empresa (referencia).
7. Cadastrar as 2 agendas EXTERNO que existem so no Google.

## Fora do escopo (Fases 2 e 3)
- Leitura continua Google -> sistema; espelhamento do pessoal em Local/Remoto (escreve no Google).

## Dados (somente ADD)
- locations: agenda_papel, observacao_local, nome_espaco.
- agenda_compromissos (nova): compromissos importados, unicos por (location_id, chave).

## Falhas previstas e defesas
| Falha | Defesa |
| Importar 2x o mesmo arquivo | UNIQUE(location_id, chave) + ON CONFLICT DO NOTHING; previa mostra "ja existem" |
| Link malicioso (SSRF) | so https://calendar.google.com/calendar/ical/..., timeout 15s, limite 10 MB |
| DTSTART 1970 do bloco de fuso lido como evento | parser so le dentro de VEVENT |
| Evento recorrente expandido errado | Fase 1 guarda a regra (RRULE) sem expandir; previa conta separado |
| TZID desconhecido | evento vai para "ignorados" com motivo, nunca com hora chutada |
| Agenda ja vinculada a outro local | 409 com o nome do outro local |
| Local de outra empresa | 403 (empresa do token != empresa do local), exceto dono da plataforma |
| Google fora do ar | erro claro; nada gravado |
| Cor sobrescrita sem querer | botao explicito, nunca automatico |
- Risco: 4 locais legados da Paluzze (ids 2,3,4,6) apontam para agendas Google do Padua; nao alterados.

## Resultado da Fase 1 (07/11/2026) — evidencias
- Papel das 8 agendas Padua preenchido pelo sufixo do nome (LOCAL/REMOTO/GERAL/PESSOAL); 2 agendas EXTERNO cadastradas pelo endpoint (ids 38 e 39) com endereco lido do Google (Rua Vilela, 652, Sl 706, Tatuape).
- Cores reais do Google aplicadas por POST /locations/agenda-google/sincronizar-cores (8 alteradas).
- Online agora pode usar o endereco da empresa como referencia (mudanca pedida pelo CEO): REMOTOs 32, 34, 36 com "mesmo endereco" + observacao.
- Importacao: eventos criados pelo proprio sistema (UID = sessions.google_event_id) sao reconhecidos e NAO importados.
- Testes: vitest ics-parser (6) e endereco-google (2); curl: 401 sem token, 403 outra empresa (nao dono), 409 agenda ja usada, 422 papel invalido, SSRF recusado, importacao idempotente (2a vez = 0 gravados).
- NAO verificado: a aba logada (a captura de tela nao faz login).
- Pendente (Fase 2/3): leitura continua Google->sistema; agenda Pessoal da enfermagem; espelhamento de bloqueios.
