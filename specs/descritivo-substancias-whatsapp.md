# Spec — Descritivo das substâncias no lembrete WhatsApp (fiel ao Dr. H / IHE)

Data: 03/07/2026 · Loop: Paxter Loop (Fase 1 — Especificar) · Acionado pelo CEO Dr. Caio.

## Objetivo (uma frase)
Corrigir o `formula-manipulada.ts` do Manager para que o descritivo de cada fórmula manipulada
no lembrete WhatsApp saia EXATAMENTE no padrão do Dr. H (IHE): um ativo principal rotulado,
dose numérica (nunca "cápsula/sachê"), e cada tomada na sua própria linha, dentro do período
correto (o mesmo remédio no almoço aparece no bloco Tarde; no jantar, no bloco Noite), com a
dose/posologia daquele período — sem juntar tudo numa linha só.

## Fonte de verdade (onde copiar)
- Motor oficial IHE: `whatsappTemplates.ts` → `templateLembretePrescricaoRevo` (congelado por teste).
- Estrutura por período JÁ existe no Manager: `lembrete-templates.ts` → `blocoPrescricaoPeriodos`
  (⬛ *Período:* / 🟩 *Programado* / 🟩 *Fórmula* / linha do ativo / observação / posologia).
- Os dados de cada fórmula vêm do catálogo `catalogo_formulas` (transmutado do IHE), agrupados por
  `codigo_semantico`, com `identificador` = slot e `conteudo` = valor.

## Mapa de campos do catálogo (dados reais — FORM GERA REPO REPO 0001)
| Slot | Conteúdo cru | Vira |
|---|---|---|
| TITL | FORMULA REPOSICAO MINERAL BASE | nome da fórmula (Title Case) |
| SUBS 01 | MAGNESIO 200 MG | ativo principal: nome "Magnésio" + dose "200 mg" |
| SUBS 02..04 | ZINCO 15 MG / SELENIO 100 MCG / POTASSIO 99 MG | NÃO entram (Opção A: só o principal) |
| VIA | ORAL | "via oral" dentro da linha de posologia |
| APRE | CAPSULA OU SACHE CONFORME FARMACIA | IGNORADO (nunca "cápsula" na dose) |
| OBS | PENSADA PARA REPOSICAO BASICA | linha de observação |
| POSO 01 | UMA DOSE NO ALMOCO | tomada do período Tarde |
| POSO 02 | UMA DOSE NO JANTAR | tomada do período Noite |

## Requisitos exatos (sem ambiguidade)
1. ATIVO PRINCIPAL: usar SÓ a primeira substância (SUBS 01), rotulada `1º Ativo:` (º = U+00BA),
   no formato `1º Ativo: {nome} — {dose numérica}`. Nunca juntar os ativos com " + ".
2. DOSE: extrair a dose numérica de SUBS 01 (número + unidade: mg/mcg/g/ml/ui/kg/l), ex.: "200 mg".
   NUNCA usar a apresentação (APRE). Se SUBS 01 não tiver número, mostra só o nome, sem " — dose".
3. NUNCA a palavra "cápsula"/"sachê": a quantidade da tomada é sempre "1 dose", "2 doses", etc.
4. POSOLOGIA POR PERÍODO (cada tomada = sua linha, no período certo): cada POSO vira uma tomada em
   UM período; o mesmo remédio aparece em cada período em que é tomado, e em cada bloco mostra APENAS
   a posologia daquele período. Proibido repetir todas as posologias em todos os blocos.
5. LINHA DA POSOLOGIA: frase única `Tomar {qtd} dose(s) via {via} {refeição} às {hora do período}`.
   - qtd vem do POSO ("uma"→1, "duas"→2, ...).
   - via vem de VIA (minúsculo).
   - refeição vem do POSO ("no almoço", "no jantar", "antes do café da manhã", ...).
   - hora vem do horário do período (janela de envio), formato "13h30".
   - NÃO existe linha separada "Horário: ..." (decisão do CEO 03/07/2026).
6. OBSERVAÇÃO: se houver OBS, sai numa linha própria (sem o prefixo "Via oral ·").
7. Título da fórmula em Title Case; conectores minúsculos; unidades minúsculas.

## Alvo renderizado (bytes exatos — fórmula Reposição Mineral Base)
```
⬛ *Período:* _Início da Tarde_
🟩 *Programado* para administrar:

🟩 *Fórmula Reposição Mineral Base*
   1º Ativo: Magnésio — 200 mg
   Pensada para reposição básica
   Tomar 1 dose via oral no almoço às 13h30

⬛ *Período:* _Noite_
🟩 *Programado* para administrar:

🟩 *Fórmula Reposição Mineral Base*
   1º Ativo: Magnésio — 200 mg
   Pensada para reposição básica
   Tomar 1 dose via oral no jantar às 18h00
```

## Casos extremos a tratar
1. SUBS 01 sem número → mostra só o nome do ativo, sem " — dose".
2. POSO sem palavra de quantidade → assume "1 dose".
3. POSO sem refeição reconhecível → cai no período padrão da fórmula (manhã e noite).
4. Fórmula sem catálogo (itemRef nulo/sem linhas) → fallback só com o nome (comportamento atual).
5. Mesma fórmula em 2 períodos → 2 blocos, cada um com SUA posologia (nunca duplicar as duas).
6. Acentuação: catálogo é MAIÚSCULO sem acento; a normalização Title Case/sentença já existe.

## Definição de PRONTO
1. `curl localhost:80/api/lembretes/44/preview` (após reiniciar api-server) mostra o descritivo no
   formato-alvo acima para as fórmulas reais do cliente 44.
2. Nenhum bloco repete todas as posologias; cada período mostra só a sua.
3. Zero "cápsula/sachê"; ativo principal único rotulado "1º Ativo:"; dose numérica.
4. Revisão do architect (Fase 3) aprova requisito por requisito, zero pendência.

## Linhas vermelhas
1. NÃO tocar no motor de disparo/idempotência (`lembrete-periodo.ts` executarLembretesPeriodo) nem
   na janela BRT/tolerância — só a MONTAGEM do item rico muda.
2. NÃO mexer no receituário PDF (outro setor) — só deixar engatilhado.
3. NÃO inventar limiar de corte de ativo longo nem regra de "resumo de forma" (não existem como
   código no IHE) — ficam PENDENTES até o CEO definir número.
4. Manter o rodapé de marca PAXTER; não reintroduzir "Instituto Pádua/PAWARDS".
```
