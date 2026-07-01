# Spec — Setor de Marcação de Consulta no molde "TERNO" (Paxter)

Data: 01/07/2026 · Dono: Dr. Caio (CEO) · Loop: Paxter (Especificar → Construir → Revisar)
Decisão do CEO: opção A — spec + MOCKUP no Canvas primeiro; ligar banco só após aprovação.

## Objetivo (uma frase)
Reaproveitar o modelo visual "terno" da anamnese (fundo de tecido claro/escuro + painel-faixa +
placas de indicador + cabeçalho-medalhão + troca de tema por tela) como MOLDE BASE de TODO o setor
de marcação de consulta — a página inicial e todas as telas subsequentes do fluxo.

## Contexto e precedência (importante)
- A direção "terno azul-marinho" já começou na tela do farol Concierge (`specs/farol-concierge-terno.md`,
  30/06/2026). Esta spec ESTENDE o mesmo terno ao setor inteiro da marcação e passa a ser a baseline
  visual dessas telas.
- Supersede, PARA ESTE SETOR, a pele bordô/mocha de `specs/marcacao-luxo-bordo-mocha.md` (25/06/2026).
  Registrado e anunciado ao CEO (Art. 50). Bordô/mocha não é apagado; só deixa de ser a baseline aqui.
- Não é "tema que muda por achado clínico" — é reusar o MODELO de layout da anamnese.

## O que é o "molde terno" (peças que já existem — reusar, não recriar)
| Peça | Classe / fonte | Papel no molde |
|---|---|---|
| Fundo de tecido | `.leva-fabric` (index.css) | risca-de-giz no claro; linho marinho no escuro; camada z-0 |
| Painel-faixa base | `.leva-band` | painel com relevo sobre o tecido |
| Placa de indicador | `.leva-kpi` (+ `-label` / `-value`) | KPIs do cabeçalho (valor em ouro) |
| Chip mecânico | `.leva-chip` (`data-active`) | seleção côncava com anel ouro |
| Barra envidraçada | `.paxter-bar-track` / `.paxter-bar-fill` | progresso do fluxo |
| Cabeçalho-medalhão | `PaxterSymbolGlass` + wordmark (PaxterLockup) | topo de toda tela do setor |
| Troca claro/escuro por tela | `useScreenTheme` + `ThemeToggle` | botão TEMA no cabeçalho |
| Símbolo em medalhão de vidro | `PaxterSymbolGlass` (Padrão 14) | nunca símbolo cru |

## Escopo — telas do setor (o molde vale em TODAS)
1. Página inicial da marcação (a escolha de quem atende).
2. Fluxo Dr. Caio (Concierge / fila) — todas as suas telas.
3. Fluxo Assistentes (área → profissional → dia → horário → confirmar) — todas as suas telas.
4. Tela de confirmação/sucesso.

## Requisitos exatos
1. Toda tela do setor usa a MOLDURA terno: fundo `.leva-fabric` (claro e escuro) + conteúdo em
   `.leva-band` / painéis 3D, com cabeçalho-medalhão no topo (símbolo em vidro + wordmark PAXTER).
2. Troca de tema por tela: botão TEMA no cabeçalho (`useScreenTheme`), claro e escuro fiéis ao da
   anamnese (o escuro é navy/linho; o claro é creme/risca-de-giz).
3. CARTÃO DO DR. CAIO ALINHADO com os cartões dos profissionais assistentes: mesma largura, mesma
   altura, mesma linha de base — nem recuado, nem avançado. Fim do `panel-3d-hero` maior que os demais.
4. REALCE DISCRETO do cartão do Dr. Caio: um sinal sóbrio (ex.: fino anel/borda ouro ou um selo
   pequeno "DIRETOR"/coroa), SEM aumentar o tamanho e SEM gritar. Elegante, não infantil.
5. Grade de cartões: Dr. Caio + assistentes numa grade alinhada ao pixel (Padrão 12/13 da skill),
   cada card com slots de posição fixa (nome, especialidade, ação), placeholder "—" quando vazio.
6. Passos do fluxo (motivo → profissional → dia → horário → confirmar) em cartões Salientes
   (`screen-3d`/`panel-3d`) com toque grande; barra de progresso `paxter-bar`.
7. Mobile-first: base iPhone 390x844, sem quebrar em 430x932; uma coluna; sem rolagem horizontal.
8. Vocabulário e cor conforme skill-layout-paxter: navy+ouro no chrome; ciano/verde/âmbar/vermelho
   SOMENTE como cor de status. Cantos quadrados (6–8px). Serifa Lora só em leitura longa (não aqui).

## Entregável desta onda (opção A)
- Esta spec escrita.
- MOCKUP no Canvas (mockup-sandbox) das telas-chave do setor no molde terno, em CLARO e ESCURO,
  com o cartão do Dr. Caio alinhado e com realce discreto.
- Organização do Canvas em ENTREGA numerada (Art. 52), `presentArtifact` ao final.

## Fora de escopo desta onda (fica para depois da aprovação do mockup)
- Ligar UPSERT/SELECT real (banco) da marcação — só após o CEO aprovar o visual.
- Reskin das OUTRAS páginas do menu (Dashboard, Clientes, etc.) — replicação posterior, mesmo molde.

## Casos extremos a tratar
- Antes de escolher quem atende: a grade mostra todos os cards alinhados (sem "pulo" de layout).
- Assistente sem especialidade/foto: slot mostra "—", nunca some (não desloca colunas).
- Tema claro: o navy/linho do escuro NÃO pode vazar; usar as variantes claras do `.leva-*`.
- 430x932 e 390x844: nada corta nem cria rolagem horizontal.

## Definição de PRONTO
| Critério | Conferido por |
|---|---|
| Mockup em CLARO e ESCURO no Canvas, molde terno fiel à anamnese | screenshot |
| Cartão Dr. Caio alinhado com assistentes (mesma largura/altura/base) + realce discreto | screenshot |
| Todas as telas-chave do setor no mesmo molde | screenshot |
| Sem rolagem horizontal; ok em 390x844 e 430x932 | screenshot |
| Revisão do architect sem pendência grave | code_review |
| Comunicação final ao CEO em Densidade B | replit.md Art.37-51 |

## Linhas vermelhas
- NÃO ligar banco/agenda nesta onda (opção A).
- NÃO mudar motor de cálculo/payload por estética (regra-mãe skill-layout-paxter).
- NÃO inventar estilo novo por tela: reusar as classes `.leva-*` e as classes 3D unlayered.
- Símbolo da marca SEMPRE em medalhão de vidro (Padrão 14); nunca cru.
