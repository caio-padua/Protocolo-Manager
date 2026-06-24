# Spec — Anamnese escura: fidelidade total ao Canvas (fundo + rodapé PADCON)

Data: 24/06/2026. Acionada pelo CEO Dr. Caio ("outro loop pra pegar tudo do canvas e passar pro anamnese escuro", "opção A", "PADCON renderizado como você fez com o PAXTER").

## Objetivo (uma frase)
Igualar o que ainda diverge entre a tela real da anamnese (`artifacts/padcom/src/pages/anamnese-v2/index.tsx`) e o mockup aprovado (`anamnese-escura/FonteLora` → `_shared/levaAnamnese.tsx`), preservando 100% da lógica.

## Diagnóstico (o que JÁ bate x o que falta)
Já portado e fiel: cartão (`.leva-card` misto), chips (`.leva-chip`), fileira de ações (`.leva-action`), fonte Lora (`.leva-q`), barinhas de progresso (ouro), cabeçalho (símbolo de vidro + PAXTER centralizado).
Lacunas reais frente ao Canvas:
1. FUNDO: tela real usa `bg-background` chapado (escuro ≈ #0B131D). Canvas usa degradê navy `#0b1d38 → #091831 → #07142a` + brilho ciano radial no topo. NÃO são iguais.
2. RODAPÉ: ausente na tela real. Canvas tem rodapé (Instituto Pádua à esquerda; bloco "Powered/Engineered by" + marca à direita).

## Requisitos exatos
1. R1 — Fundo: o `<div>` raiz da anamnese deve receber o MESMO fundo do Canvas.
   1.1 Tema escuro: `radial-gradient(120% 80% at 50% -10%, rgba(70,184,204,0.07) 0%, transparent 42%)` por cima de `linear-gradient(180deg,#0b1d38 0%,#091831 52%,#07142a 100%)`.
   1.2 Tema claro: `radial-gradient(120% 80% at 50% -10%, rgba(255,255,255,0.55) 0%, transparent 46%)` por cima de `linear-gradient(180deg,#ece1c8 0%,#e6d9bd 54%,#ded0b0 100%)`.
   1.3 Implementar via classe nova `.anamnese-solo` em `index.css` (claro = base; `.dark .anamnese-solo` = escuro), substituindo `bg-background` na raiz. O fundo cobre toda a altura rolável.
2. R2 — Rodapé: ao final do `<main>`, antes do fechamento, adicionar rodapé fiel ao Canvas:
   2.1 Esquerda: "Instituto Pádua" (serifa) + "Atendimento clínico" (minúsculo, caixa-alta, tracking largo).
   2.2 Direita: rótulo "Engineered by" (minúsculo, caixa-alta) + marca PADCON em ouro, dentro de uma placa navy embutida (como o bloco "Powered by" do Canvas).
   2.3 Separado do conteúdo por uma linha fina superior (hairline), respeitando os temas claro/escuro.
3. R3 — Marca PADCON em ouro (renderizada "como o PAXTER"):
   3.1 Componente reutilizável `PadconWordmark` em `artifacts/padcom/src/components/layout/paxter-fx/`.
   3.2 Texto "PADCON" em serifa Cinzel, ouro com o MESMO gradiente do PAXTER (clip de texto) + leve relevo (drop-shadow) para 3D.
   3.3 Sempre sobre fundo navy (placa), nunca ouro pequeno sobre branco (regra de marca navy/ouro).
4. R4 — Preservar 100% a lógica (linhas vermelhas abaixo). Nenhuma mudança em token, skip-logic, linha vermelha clínica, foco, tema, salvamento, áudio, controles.

## Casos extremos
- Fundo deve cobrir página mais alta que a viewport (conteúdo longo) sem cortar o degradê.
- Tema claro não pode ficar navy: `.anamnese-solo` (sem `.dark`) usa o creme.
- Marca PADCON: clip de ouro pode "sumir" sobre fundo 3D concorrente — por isso fica em placa navy sólida (alto contraste).
- Rodapé não pode ser tapado pela barra fixa do selo de salvamento (`pb-28` já dá folga).

## Definição de PRONTO
- Screenshot escuro 402x874 de `/anamnese/v2?demo=1` mostra fundo com degradê navy + brilho no topo (não chapado) e rodapé com Instituto Pádua (esq.) + PADCON ouro (dir.).
- Typecheck do pacote padcom sem novos erros na anamnese.
- architect aprova requisito a requisito, zero pendência grave.

## Linhas vermelhas (NUNCA tocar)
- Token/identificação do cliente, skip-logic, defesa da linha vermelha (sinal de alarme), foco, salvamento (flush/keepalive), áudio, `ControlRenderer`/`controls.tsx` comportamento.
- Só aparência. A lógica nunca muda.
