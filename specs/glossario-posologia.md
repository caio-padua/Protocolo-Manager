# Glossario — Dose, Posologia, Tomada e Periodos (referencia conceitual do sistema)

Data: 09/07/2026. Escrito SEM acento (regra do CEO). Este arquivo e a fonte conceitual
que todo agente (Paxter, IHE, Claude, Manus) deve consultar antes de mexer em prescricao,
lembrete ou catalogo de formulas.

## Conceitos fundamentais

| Termo | Definicao simples | Exemplo real |
|---|---|---|
| Dose | A QUANTIDADE de principio ativo tomada de uma vez: numero + unidade de massa/volume | Magnesio 200 mg |
| Apresentacao (capsula/sache) | A EMBALAGEM fisica em que a farmacia entrega a formula. NAO e dose | "Capsula ou sache conforme farmacia" |
| Diferenca dose x capsula | 1 dose pode ser 1, 2, 3 ou mais capsulas; quem manda e o rotulo da farmacia | 1 dose = 2 capsulas de 100 mg |
| Tomada | UMA vez que o cliente toma a formula no dia. Cada tomada tem seu momento proprio | "Uma dose no almoco" e UMA tomada |
| Posologia | O CONJUNTO de instrucoes de uso: quantas doses, por qual via, em quais momentos | "1 dose, via oral, no almoco; 1 dose, via oral, no jantar" |
| Via | O caminho de administracao no corpo | oral, sublingual, topica, intramuscular |
| Ativo principal | O primeiro principio ativo da formula (slot SUBS 01 do catalogo), o que da nome ao efeito | Magnesio, na Formula Reposicao Mineral Base |

## Regra de ouro do sistema

| Regra | Consequencia pratica |
|---|---|
| Posologia embutida | Toda formula do catalogo ja carrega a sugestao de posologia (slots POSO). Ao indicar a formula, a sugestao entra sozinha |
| Ditada no ato | O CEO pode sobrescrever a posologia na Central de Lembretes; a edicao manual vence a sugestao e sobrevive a re-sincronizacao |
| Uma tomada = um bloco | Cada tomada aparece SO no seu periodo do dia, com SO a sua instrucao |
| Dose nunca e capsula | A mensagem sempre avisa: conferir o rotulo, pois 1 dose pode ser mais de 1 capsula |

## Os 9 periodos canonicos do dia (tabela `periodos_dia`, canone herdado do IHE)

| Ordem | Sigla | Nome | Janela | Envio do lembrete |
|---|---|---|---|---|
| 1 | JE | Jejum | 05:00-06:59 | 05h00 |
| 2 | IM | Inicio da Manha | 07:00-08:59 | 07h00 |
| 3 | MM | Meio da Manha | 09:00-10:59 | 09h00 |
| 4 | AL | Almoco | 11:00-13:29 | 11h00 |
| 5 | IT | Inicio da Tarde | 13:30-15:59 | 13h30 |
| 6 | MT | Meio da Tarde | 16:00-17:59 | 16h00 |
| 7 | NO | Noite | 18:00-19:59 | 18h00 |
| 8 | FN | Final da Noite | 20:00-22:29 | 20h00 |
| 9 | CE | Ceia | 22:30-23:59 | 22h30 |

## Mapa refeicao -> periodo (heuristica das tomadas)

| Palavra na posologia | Periodo |
|---|---|
| jejum, ao acordar | JE |
| cafe da manha, desjejum, manha | IM |
| almoco, meio-dia | AL |
| tarde | IT |
| jantar, noite, treino | NO |
| antes de deitar, dormir | FN |
| ceia | CE |
| (sem pista) | IM (padrao deterministico) |

## Slots do catalogo de formulas (`catalogo_formulas`)

| Slot | O que guarda | Vira na mensagem |
|---|---|---|
| TITL | Nome oficial da formula | Titulo do bloco |
| SUBS 01 | Ativo principal + dose | "Magnesio — 200 mg" |
| SUBS 02.. | Demais ativos | NAO entram (so o principal) |
| VIA | Via de administracao | "via oral" na posologia |
| APRE | Apresentacao (capsula/sache) | IGNORADO (nunca vira dose) |
| POSO 01.. | Cada tomada sugerida | Um bloco por periodo |
| OBS | Observacao clinica | Linha de observacao |
