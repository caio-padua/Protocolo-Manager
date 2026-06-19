# Spec — Expansao do Sistema de Design Paxter (componentes 3D + disciplina visual)

Data: 19/06/2026. Metodo: Paxter Loop (spec -> build -> review -> present).

## Objetivo
Transformar a skill `skill-layout-paxter` no manual UNICO que permite remodelar TODAS as
telas do Manager com a mesma linguagem 3D. Cobrir as lacunas pedidas pelo CEO:
(a) receitas de COMO CRIAR cada controle 3D (Painel, Saliente/bevel, Concavo/inset, Botao,
Neon hover, Underglow, LED, Toggle);
(b) alinhamento por linhas-guia imaginarias VISIVEIS (verticais e horizontais);
(c) escala de espacamento;
(d) toggle MAIS QUADRADO;
(e) revisao final "olhando como se fosse o cliente";
(f) paridade CELULAR x DESKTOP — layout E funcionalidade dos botoes.
Aplicar ja o toggle quadrado como primeira demonstracao da skill.

## Decisao de arquitetura
- NAO criar skill nova concorrente. A `skill-layout-paxter` ja e a fonte-da-verdade do design;
  expandi-la com arquivos de referencia em `.agents/skills/skill-layout-paxter/references/`.
- Promulgar no Codigo Paxter a disciplina de revisao final + paridade mobile (diretriz duravel).

## Requisitos exatos
- R1. `references/componentes-3d.md`: para CADA controle, trazer nome de fala, classe(s),
  esqueleto JSX, "receita de luz" (o que cria o efeito 3D), quando usar e armadilhas. Nao copiar
  o CSS inteiro (vive em `artifacts/padcom/src/index.css`); descrever a receita e apontar a fonte.
- R2. `references/alinhamento-espacamento.md`: regra das LINHAS-GUIA imaginarias verticais e
  horizontais (como pensar, como PROVAR visualmente), escala de espacamento (respiro 3D, gap minimo
  12px) e grade de colunas casada cabecalho/linha.
- R3. `references/revisao-final.md`: checklist de fim de tela lido "como se eu fosse o cliente";
  regra de conferir SEMPRE celular x desktop em LAYOUT e em FUNCIONALIDADE dos botoes (clique, alvo
  de toque, toggle responde, nada cortado).
- R4. Toggle mais quadrado: arredondar menos trilho e thumb do `Switch`, mantendo Radix e
  acessibilidade; muda em 1 lugar e propaga a todos os toggles.
- R5. `SKILL.md` atualizado: secao de References + decisao do toggle quadrado + ponteiro para a
  revisao final. Sem apagar conteudo existente; frontmatter intacta.
- R6. Codigo Paxter: promulgar artigo(s) da revisao final + paridade mobile; ANUNCIAR ao CEO
  (numero, titulo, texto, data); registrar no Historico de Promulgacoes.
- R7. Validar: screenshot do toggle novo (desktop) + checagem visual; nao quebrar paginas com Switch.

## Casos extremos
- Toggle dentro de `ToggleWell` (concave-3d) deve continuar legivel ja quadrado.
- Tema escuro (`.dark`) nao pode quebrar.
- typecheck global PRE-QUEBRADO (codegen) -> validar por runtime/screenshot, nunca por tsc.

## Definicao de PRONTO
- 3 arquivos de referencia criados e citados na `SKILL.md`.
- Toggle quadrado aplicado e visto em screenshot.
- 1 a 2 artigos promulgados e anunciados.
- architect aprova requisito por requisito.

## Linhas vermelhas
- Nao tocar `/api/budgets/calculate` nem o motor de calculo/desmembramento.
- Nao trocar cantos quadrados por arredondados infantis.
- Nao remover o relevo 3D dos paineis/sub-paineis.
- So a APRESENTACAO muda; logica de dados intacta.
