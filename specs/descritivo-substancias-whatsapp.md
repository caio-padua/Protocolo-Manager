# Spec — Descritivo das fórmulas manipuladas no lembrete WhatsApp (CLONE do IHE)

Data: 03/07/2026 · Loop: Paxter Loop (Fase 1 — Especificar) · Acionado pelo CEO Dr. Caio.

DECISÃO RAIZ (CEO, 03/07/2026): NÃO recriar. CLONAR EXATAMENTE o motor do Dr. Replit IHE
(parser de posologia + template + vínculo período→fórmula). Recriar geraria retrabalho de
arquitetura que o CEO já fez no IHE.

## Objetivo (uma frase)
Corrigir só a MONTAGEM do item rico (`formula-manipulada.ts`) reutilizando a engenharia do IHE,
para que cada fórmula manipulada saia com um ativo principal + dose numérica, e cada tomada caia
no SEU período com a SUA posologia — sem juntar ativos, sem "cápsula", sem repetir a posologia em
todos os blocos.

## O que o Manager JÁ clonou do IHE (NÃO MEXER — confirmado lendo o IHE)
| Peça | Arquivo IHE (fonte) | Arquivo Manager (clone) | Situação |
|---|---|---|---|
| Template da mensagem | `services/whatsappTemplates.ts` → `templateLembretePrescricaoRevo` | `lib/lembrete-templates.ts` → `blocoPrescricaoPeriodos` | IDÊNTICO — mantém linha `Horário:` e linha `Posologia:` |
| Motor de disparo por janela | `services/prescricaoLembreteService.ts` → `executarLembretesPrescricao` | `lib/lembrete-periodo.ts` → `executarLembretesPeriodo` | clone fiel (janela BRT, tolerância 5 min, idempotência) |
| "Pin" período→fórmula (JSON armazenado) | schema `prescricoes_lembrete.periodos` (jsonb curado) | schema `lembretes_prescricao.periodos` + `sincronizarLembretePrescricao` | mesmo desenho; o serviço só RENDERIZA o JSON |

Consequência: o template fica INTACTO. As linhas `Horário:` (relógio, ex. "13h30") e `Posologia:`
(rótulo) são do IHE e permanecem. O erro do CEO que eu quase cometi era removê-las — retificado.

## O tesouro a PORTAR do IHE (biblioteca reutilizável, cópia fiel)
| Ativo do IHE | Caminho IHE | Onde no Manager |
|---|---|---|
| Parser de posologia + renderizador canônico | `lib/posologia/` (parsePosologia.ts, types.ts, index.ts, teste) | nova lib `@workspace/posologia` (cópia byte-a-byte, sem prefixo de origem) |

`parsePosologia(texto)` → estrutura `{ quantidade, unidadeForma, via, doseMg, momento, frequencia }`.
`formatarPosologiaEstruturada(estrutura)` → frase canônica.

## Os 3 bugs (só `formula-manipulada.ts`, linhas 92-94)
| Linha | Código atual | Efeito errado | Correção |
|---|---|---|---|
| 92 | `ativoPrincipal = ativos.join(" + ")` | junta TODOS os ativos | usar SÓ SUBS 01 (ativo principal) |
| 93 | `dose = apresentacao` (APRE) | mostra "cápsula/sachê" | extrair dose numérica de SUBS 01 (número + unidade) |
| 94 | `posologia = posologias.join("; ")` + repetida em todo período | junta tomadas e duplica | 1 tomada por período, cada bloco só a SUA |

## Mapa de campos do catálogo (dados reais — FORM GERA REPO REPO 0001)
| Slot | Conteúdo cru | Vira |
|---|---|---|
| TITL | FORMULA REPOSICAO MINERAL BASE | nome da fórmula (Title Case) |
| SUBS 01 | MAGNESIO 200 MG | ativo principal: nome "Magnésio" + dose "200 mg" |
| SUBS 02..04 | ZINCO 15 MG / SELENIO 100 MCG / POTASSIO 99 MG | NÃO entram (só o principal) |
| VIA | ORAL | via (minúsculo) na posologia |
| APRE | CAPSULA OU SACHE CONFORME FARMACIA | IGNORADO |
| OBS | PENSADA PARA REPOSICAO BASICA | linha de observação |
| POSO 01 | UMA DOSE NO ALMOCO | tomada do período Tarde |
| POSO 02 | UMA DOSE NO JANTAR | tomada do período Noite |

## Mudança de estrutura necessária (per-período)
Hoje `enriquecerItemFormula` devolve UM item com `periodos[]` e UMA `posologia` string → o
`sincronizarLembretePrescricao` empurra a MESMA posologia para todos os períodos (bug de duplicação).
Correção fiel ao "Pin": `enriquecerItemFormula` passa a devolver UM item POR TOMADA (POSO), cada um
com `periodos: [período daquela tomada]` e a `posologia` daquela tomada. Assim, no JSON `periodos`,
cada bloco recebe a fórmula só com a sua posologia. `derivarFormulasLembrete` achata a lista.
`sincronizarLembretePrescricao` NÃO muda (já agrupa por sigla).

Detecção do período de cada POSO: manter a heurística existente `periodosDaPosologia`
(café/manhã→manhã, almoço→tarde, jantar/treino/noite→noite). Motivo verificado no IHE: o parser
do IHE NÃO captura "no almoço"/"no jantar" como momento (não estão no regex dele) — no IHE o
período é CURADO/armazenado. No Manager a derivação é automática do catálogo, então a heurística
de período continua sendo necessária.

## DECISÃO EM ABERTO (única) — formato da linha de posologia
O parser do IHE, alimentado com "UMA DOSE NO ALMOCO", produz canônico "1 dose" (perde "no almoço"
e a hora, pois "almoço" não está no regex de momento do IHE). Duas saídas fiéis possíveis:

- Opção A (clone puro do renderizador IHE): `Posologia: 1 dose` (perde refeição e hora).
- Opção B (clone + composição mínima do Manager, DEFAULT): compõe refeição (do POSO) + hora (do
  período) → `Posologia: 1 dose, via oral, no almoço (13h30)`. Reutiliza o parser p/ quantidade e
  forma; acrescenta refeição+hora que o CEO validou visualmente.

Aguardando o CEO travar A ou B antes do build.

## Alvo renderizado (Opção B — template INTACTO, com Horário e Posologia do IHE)
```
⬛ *Período:* _Início da Tarde_
🟩 *Programado* para administrar:

🟩 *Fórmula Reposição Mineral Base*
   Magnésio — 200 mg
   Horário: 13h30
   Pensada para reposição básica
   Posologia: 1 dose, via oral, no almoço

⬛ *Período:* _Noite_
🟩 *Programado* para administrar:

🟩 *Fórmula Reposição Mineral Base*
   Magnésio — 200 mg
   Horário: 18h00
   Pensada para reposição básica
   Posologia: 1 dose, via oral, no jantar
```

## Casos extremos
1. SUBS 01 sem número → mostra só o nome do ativo, sem " — dose".
2. POSO sem palavra de quantidade → o parser assume 1; render "1 dose".
3. POSO sem refeição reconhecível → cai no período padrão da fórmula (manhã e noite).
4. Fórmula sem catálogo (itemRef nulo/sem linhas) → fallback só com o nome (comportamento atual).
5. Mesma fórmula em 2 períodos → 2 blocos, cada um com SUA posologia (nunca duplicar as duas).

## Definição de PRONTO
1. `curl localhost:80/api/lembretes/44/preview` (após reiniciar api-server) mostra o formato-alvo
   para as fórmulas reais do cliente 44.
2. Nenhum bloco repete todas as posologias; cada período mostra só a sua.
3. Zero "cápsula/sachê"; ativo principal único; dose numérica.
4. `lib/posologia` portada como cópia fiel do IHE (mesmos tipos, mesmo parser, teste passando).
5. Revisão do architect (Fase 3) aprova requisito por requisito, zero pendência.

## Linhas vermelhas
1. NÃO tocar no motor de disparo/idempotência nem na janela BRT/tolerância — só a MONTAGEM muda.
2. NÃO tocar no template `blocoPrescricaoPeriodos` (é o clone do IHE) além do que a Opção escolhida exigir.
3. NÃO mexer no receituário PDF.
4. `lib/posologia` entra SEM prefixo de origem (regra dos primos independentes), como cópia nativa.
5. Manter rodapé de marca PAXTER; não reintroduzir "Instituto Pádua/PAWARDS".
