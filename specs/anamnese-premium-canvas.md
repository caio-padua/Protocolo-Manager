# Spec — Anamnese premium (Canvas -> telas reais escura E clara)

Decisao do CEO (24/06/2026, por voz): elevar as DUAS telas reais de anamnese ao nivel premium
do mockup do Canvas (FonteLora / linho marinho), com elegancia estilo Hermes, nos dois perfis
(escuro `/anamnese/v2` e claro/branco do perfil). "Me surpreenda, faca, nao pergunte."

PRESERVAR 100% da logica: token anti-IDOR, skip-logic, alarme linha vermelha, foco, useScreenTheme,
flush/salvamento, audio. So pele/estilo muda.

## LOOP 1 — graduacao premium

| # | Item | Estado atual | Alvo |
|---|---|---|---|
| 1 | Barra do "Seu mapa de saude" | HealthTwin sobrescreve `--fill` com `linear-gradient(90deg, NAVY, GOLD)` (fica navy/embaracado) | Igual a barra de cima: ouro envidracado padrao (remover override; recusa segue cinza) |
| 2 | PADCON do rodape | `PadconWordmark height={20}` | Maior e mais nitido (height 26); arte oficial ouro mantida (nunca redigitar) |
| 3 | Tecido terno no painel | Header `bg-card/95` liso, sem textura | Linho marinho do Canvas (LinhoTexture) crisp no header + faixa sutil ao fundo da pagina |
| 4 | KPIs Concluido/Perguntas/Grupos/Faltam | `.screen-3d` generico | Placa 3D premium `.leva-kpi` (saliente, label discreto, valor ouro) |
| 5 | Altura dos chips SIM/NAO | `h-14 text-lg` (alto/desproporcional) | `h-12 text-base` (proporcao elegante) |
| 6 | Tracking dos labels dos botoes | `tracking-wide` (letras "distantes") | `tracking-normal` (leitura mais cerrada e premium) |
| 7 | Medalhao no perfil CLARO | `PaxterSymbolGlass` ignora `tone` -> miolo NAVY sempre (azul destoa do creme) | Honrar `tone`: claro = miolo espresso quente (contraste vs creme, ouro salta no screen-blend); BrandMark passa o tom |
| 8 | Tecido no tom CLARO | Sem textura | Risca de giz (chalk-stripe) sutil sobre o creme |

Nota sincera (Art. 47): champanhe PURO no miolo apagaria o simbolo (o PNG usa mix-blend screen,
exige fundo escuro). Solucao premium = miolo espresso/marrom-cafe quente: tira o azul, contrasta
com o creme e harmoniza com o ouro (mais Hermes que o azul).

## LOOP 2 — varredura pessoal (kaizen)

Por screenshot real (escuro E claro, 402x874): conferir tela por tela, achar erros/desalinho,
aplicar kaizen sem perguntar, dentro do padrao Paxter (skill-layout-paxter).

## Verificacao

- Screenshot `/anamnese/v2` escuro e claro (402x874).
- `pnpm --filter @workspace/padcom run typecheck`.
- architect({ includeGitDiff: true }); corrigir pendencia grave.
- Atualizar memoria.

---

## LOOP 2 — Refinamentos da anamnese /anamnese/v2 (24/06/2026)

Pedido do CEO por voz ("me surpreenda, faca sem perguntar"). Vale para tema CLARO e ESCURO.
NAO mexer no tecido terno (.leva-fabric). Preservar 100% da logica.

| Item | Alvo | O que muda |
|---|---|---|
| 1 | Botoes de escala 0/1/2/3 (controls.tsx) | Cor selecionada estava "grosseira" (navy solido). Agora: degrade navy suave (primary 0.95->0.80) so no ativo + anel ouro 2px; preenchido-nao-ativo = tint leve primary/0.16 com texto foreground (theme-safe). |
| 2 | Botoes Proximo/Concluir (index.tsx, modo grupo E modo foco) | Removido bg-primary/text-primary-foreground que achatava o gradiente. Agora seguem o CTA validado: btn-3d (navy/ouro) + text-white + uppercase tracking-wide + h-12. |
| 3 | Navegador de grupos (chips A,B,C... no topo do main) | (a) Letra vira SIGLA de 4 letras da 1a palavra do bloco (ex.: "E. CIRURGIAS"->"Cirg") via helper sigla(); (b) layout em grade (grid-cols-4 no celular / sm:grid-cols-7), mais empilhado; (c) sobre PAINEL LISO horizontal de ponta a ponta (.leva-band, -mx-4) limitado em cima/baixo so a area dos chips, por cima do tecido. |

Faixa .leva-band: claro = placa creme suave; escuro = placa navy suave. So fundo/borda/sombra, sem textura (o tecido fica intacto embaixo do conteudo do main).
