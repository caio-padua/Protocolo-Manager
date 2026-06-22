---
name: SVG gradient id unico + eixos de variante em todos os shells
description: Dois traps de protótipo de variantes (mockup-sandbox PAXTER) — id de gradiente SVG repetido e flag de eixo não aplicada em um dos shells.
---

# SVG gradient id unico + eixos de variante

## 1. ID de gradiente SVG deve ser unico por instancia
Quando um componente SVG com `<linearGradient id="...">` renderiza varias vezes na
mesma arvore (ex.: o monograma Rx em 10 telinhas do Canvas), um id FIXO colide e o
`fill="url(#id)"` pode referenciar o gradiente errado/quebrar entre browsers.

**Regra:** derive o id de `useId()` (removendo os `:` → `id.replace(/:/g,"")`) e use
no `<linearGradient id={gid}>` e no `fill={`url(#${gid})`}`.

**Why:** o sintoma e silencioso — um typecheck passa e uma instancia renderiza bem;
so quando ha 2+ na mesma pagina o gradiente some/erra. Foi achado pelo architect, nao
pelo compilador.

## 2. Eixo de variante precisa ser aplicado em TODOS os shells
O engine `paxterVariants.tsx` expõe eixos S/F/B/L (Simbolo/Frase/Botao/Layout). Um eixo
so "existe" se cada shell que o consome de fato ler a flag. O `AgendarShell` definia
`LayoutCfg.editorial`/`single` mas nao usava — entao L3/L4 ficavam iguais a L1.

**Regra:** ao adicionar um eixo de variacao, verifique que CADA shell (Anamnese E
Agendar) ramifica visivelmente por aquela flag; senao o eixo falha o objetivo mesmo
com typecheck verde.

**How to apply:** vale para qualquer engine de "misturar por numero" de mockup. Depois
de buildar, screenshot das pontas (ex.: V3 e V4) para confirmar diferenca real, nao so
do exemplo do meio.
