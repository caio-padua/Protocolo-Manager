# Spec — Fidelidade total ao Canvas (anamnese escura)

Data: 24/06/2026. Pedido do CEO (Dr. Caio). Método: Paxter Loop (spec -> build -> review).
Escopo: SÓ APRESENTAÇÃO da tela `artifacts/padcom/src/pages/anamnese-v2`. Zero mudança de lógica
(token, skip-logic, linha vermelha, foco, tema, salvamento, áudio, controls comportamento).

## Alvo (o que tem que ficar pronto)

1. TECIDO NAVY ENVIDRAÇADO nos painéis — portar a variante de VIDRO do Canvas
   (`leva-bevel-vidro` do mockup `levaAnamnese.tsx`) para `.dark .leva-card` no `index.css`:
   corpo navy translúcido (tecido transparece), aro claro, verniz glossy diagonal forte.
   Tema claro do `.leva-card` permanece como está.

2. MAPA DE SAÚDE no MESMO painel das perguntas — `HealthTwin` deixa de usar `panel-3d-sub`
   e passa a usar `leva-card` (mesmo navy/vidro dos painéis de pergunta).

3. BARRA UNIFICADA (faixa superior + barras do mapa) — UM só tratamento:
   - sulco concavo (well 3D) como trilho;
   - preenchimento ENVIDRAÇADO (3D + verniz glossy + brilho de topo);
   - faixa superior: segmentada (1 por grupo), preenchimento dourado (mantém a cor de progresso);
   - barras do mapa: contíguas (largura %), preenchimento na cor atual (navy->ouro, ou cinza se recusado),
     MESMO tratamento 3D/vidro da faixa superior.
   - Classes novas: `.paxter-bar-track` (trilho) e `.paxter-bar-fill` (preenchimento, cor via `--fill`).

4. CHIPS (botões dos painéis) menos altos e mais 3D:
   - cantos mais quadrados (radius 11px -> 7px);
   - menos altura (booleano `h-20` -> `h-14`; escolha única `py-3.5` -> `py-3`);
   - mais relevo/sombra; salta da folha ("up level"); afunda no `:active` e quando selecionado.

5. SELEÇÃO = NEON AZUL (ciano), não dourado — padrão de foco da skill (ciano = item atual/foco):
   - chip selecionado ganha anel + glow ciano (`#45B8CC`/`#5cc4d6`) e afunda;
   - indicador de seleção (cheque) e anel do likert trocam de dourado para ciano (`SELECT` em `controls.tsx`).

## Não-alvo (linha vermelha)
- Não tocar `controls.tsx` no comportamento (só altura/cor de seleção).
- Não mexer em token/skip-logic/linha vermelha clínica/foco/salvamento/áudio.
- Dourado segue como ACENTO de marca (percentual do topo, gradiente das barras); só o
  INDICADOR DE SELEÇÃO vira ciano.

## Verificação
- Screenshot 402x874 de `/anamnese/v2?demo=1` no tema escuro (painéis envidraçados, barras 3D, chip selecionado com neon azul).
- Review architect (includeGitDiff:true). Corrigir pendências graves. Registrar padrões novos na skill.
