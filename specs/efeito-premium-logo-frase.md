# Spec — Efeito premium do logo: estender a luz do SIMBOLO para a FRASE

Data: 23/06/2026. Loop acionado pelo CEO (Dr. Caio): "mantemos os efeitos que criamos
SOMENTE no simbolo e que eles se ESTENDAM para a frase; crie os mesmos codigos de efeitos
que percorrem o desenho das linhas da frase". Rodar ate o fim: spec -> build -> architect ->
build -> teste com o usuario vendo o sistema operar -> entregar tudo no final.

## Objetivo (uma frase)

Trazer o efeito PREMIUM aprovado do simbolo (motor `PaxterGlintPremium` / `traceFlash`:
aura + metal 3D + faixa-sol mascarada na silhueta + faisca fina que PERCORRE o tracado) para
dentro do aplicativo real (`artifacts/padcom`) e ESTENDER o MESMO efeito a palavra "PAXTER",
de modo que a luz percorra o desenho das linhas (contorno) de cada letra.

## Contexto decifrado (fonte da verdade)

1. O efeito aprovado pelo CEO vive nos mockups (`mockup-sandbox/_shared`): `traceFlash.tsx`
   (motor `PaxterGlintPremium`, data-driven por caminho SVG `d`), `paxterSymbolPath.ts`
   (contorno exato do simbolo), `PaxterSymbolPremium.tsx` (empilha aura + PNG 3D + glint).
   A tela real aprovada (anamnese / "ENTREGA 18 — SIMBOLO PREMIUM AO VIVO") usa
   `PaxterSymbolPremium size={88}`.
2. A palavra "PAXTER" ja existe como CONTORNO VETORIAL EXATO (potrace, carbono da arte
   oficial) em `paxterVectorPaths.ts` -> `WORD_LETTERS` (6 letras P A X T E R, cada uma com
   `d`, `ox`, `w`) e `WORD_VB = {w:1026,h:150,ox:47,oy:649}`.
3. Nao existe NENHUM mockup que ja combine `WORD_LETTERS` com o motor de luz. Ou seja: o CEO
   esta pedindo para CRIAR a frase com a luz percorrendo as letras, reusando o motor do simbolo.
4. Alinhamento medido: o PNG `paxter-paxter.png` tem proporcao 5,924 e `WORD_VB` tem 6,840.
   Eles NAO casam. Logo, sobrepor a luz vetorial no PNG distorce/desalinha. Para a luz
   percorrer o contorno das letras COM PRECISAO, a FACE visivel da palavra deve ser renderizada
   a partir do MESMO vetor `WORD_LETTERS` que guia a luz (mesmo sistema de coordenadas).

## Requisitos exatos (numerados)

R1. Portar para `artifacts/padcom` (sem depender do mockup-sandbox) o motor de efeito:
    `traceFlash.tsx` (com `PaxterGlintPremium`), `paxterSymbolPath.ts`, e os dados
    `paxterVectorPaths.ts` (`WORD_LETTERS`, `WORD_VB`, `SYMBOL_VB`). Copia FIEL, sem reinventar
    o motor.
R2. SIMBOLO no app passa a usar o efeito premium aprovado (aura pulsante + metal 3D do
    `paxter-symbol-cut.png` com mix-blend screen + `PaxterGlintPremium` sobre `PAXTER_SYMBOL_PATH`:
    faixa-sol mascarada na silhueta + faisca correndo o contorno). Substitui a faixa simples
    `.pxs-sheen` que estava no simbolo.
R3. PALAVRA "PAXTER" recebe o MESMO motor: a face visivel e desenhada a partir de
    `WORD_LETTERS` (ouro 3D: camadas de profundidade + gradiente ouro + brilho fino), e por
    cima roda o `PaxterGlintPremium` usando os MESMOS caminhos `WORD_LETTERS` (faixa-sol
    mascarada nas letras + faisca correndo o CONTORNO de cada letra). A luz percorre o desenho
    das linhas das letras, alinhada por construcao.
R4. Sincronia "um sol so descendo": a faixa-sol passa primeiro no simbolo e depois na palavra
    (atraso), em ciclo LENTO (~12s, igual ao premium aprovado), com fase de descanso.
R5. A barra lateral continua: recolhivel (botao), persistente (localStorage) — JA FEITO, nao
    regredir. Recolhida mostra SO o simbolo (com o efeito premium). Expandida mostra
    simbolo + PAXTER + "Clinical Intelligence System".
R6. Subtitulo "Clinical Intelligence System" permanece como esta (asset aprovado); nao e alvo
    do efeito de contorno (a "frase" pedida e a palavra PAXTER).
R7. Estados extras do logo (barra superior mobile `size="sm"`) continuam funcionando.

## Casos extremos a tratar

C1. Colisao de ids de gradiente/mascara SVG entre instancias do logo (sidebar + topbar mobile
    podem coexistir): o motor ja usa `useId()` por instancia — preservar isso.
C2. `prefers-reduced-motion`: mostrar tudo ESTATICO ja desenhado (sem faisca, sem varrimento) —
    o motor ja trata; garantir que a face fica visivel.
C3. A luz NUNCA pode clarear o fundo navy: o varrimento e mascarado na forma do ouro
    (simbolo/letras); o glint e stroke so no contorno. Nada de halo lavando o painel.
C4. Import de asset novo / troca de arquivo exige RESTART do workflow `artifacts/padcom: web`
    (HMR nao confiavel para assets) — reiniciar antes do screenshot.
C5. Fidelidade da face vetorial: se a face desenhada de `WORD_LETTERS` ficar visivelmente
    pior que o PNG aprovado, registrar e decidir com o CEO (nao mascarar o problema).

## Definicao de PRONTO

P1. No app real (`artifacts/padcom`, sidebar), o simbolo mostra o efeito premium (aura +
    faixa-sol + faisca no contorno), confirmado por screenshot.
P2. A palavra "PAXTER" mostra a faixa-sol E a faisca percorrendo o contorno das letras,
    confirmado por screenshot (a luz "escreve"/corre o desenho das linhas).
P3. A luz passa no simbolo e desce para a palavra (um sol so), lenta, sem clarear o navy.
P4. Sidebar recolhivel + persistente continua funcionando (sem regressao).
P5. Architect aprova requisito por requisito, zero pendencia, com `includeGitDiff: true`.
P6. Comunicacao final ao CEO em Densidade B, fechando com "RESUMO EM 1 LINHA".

## Linhas vermelhas (NAO violar)

L1. NAO tocar em rota de API, motor de calculo, schema, nem em qualquer logica de negocio.
    Esta onda e 100% visual (logo da barra lateral).
L2. NAO inventar letras: a face da palavra usa o CONTORNO OFICIAL (`WORD_LETTERS`, carbono da
    arte aprovada), nunca uma fonte digitada ou desenho novo a mao.
L3. NAO regredir a barra lateral recolhivel/persistente ja aprovada.
L4. NAO deixar a luz lavar/ofuscar o fundo navy (queixa historica do CEO, 22/06/2026): luz
    sempre mascarada no ouro.
L5. NAO reescrever o motor `traceFlash`/`PaxterGlintPremium` por estetica: copia fiel; ajustes
    so de tamanho, viewBox, cor e tempo via props ja existentes.

## Aviso ao CEO (mudanca de decisao — Art. 50)

A palavra "PAXTER" na barra lateral deixa de ser o PNG (pixels) do loop anterior e passa a ser
desenhada a partir do CONTORNO VETORIAL OFICIAL (carbono potrace da mesma arte). Motivo tecnico:
e a unica forma de a luz percorrer o desenho das linhas das letras com alinhamento perfeito (o
PNG e o vetor tem proporcoes diferentes e nao se sobrepoem). A face continua sendo a arte
oficial, so muda o "como" e desenhada. Sera mostrado em screenshot para o CEO julgar.
