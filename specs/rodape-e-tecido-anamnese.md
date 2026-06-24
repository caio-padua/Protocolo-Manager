# Spec — Rodapé e Tecido da Anamnese do Cliente (/anamnese/v2)

Data: 24/06/2026. Autor: Dr. Replit Paxter. Acionado pelo CEO Dr. Caio via Paxter Loop.

## Objetivo (uma frase)

Alinhar e proporcionar as duas marcas do rodapé (Instituto Pádua e PADCON), unificar a textura
("tecido") do cabeçalho com a das questões, prolongar o painel das iniciais dos grupos até o topo e
afinar o perfil dos cartões de questão — tudo preservando o sistema de design Paxter (relevos 3D,
botões, logos, relevos brancos e o neon lento dos alertas).

## Requisitos exatos (numerados)

### Rodapé (REVISADO em 24/06/2026 após feedback do CEO — imagem IMG_5222)
O CEO reprovou a 1ª versão (símbolo alinhado pelo topo, 1,5x) por falta de capricho. Direção nova,
aprovada por screenshot:
1. O SÍMBOLO de cada marca fica à ESQUERDA do nome (Pádua e PADCON), formando um LOGOTIPO coeso
   (símbolo + wordmark próximos).
2. Os dois SÍMBOLOS parecem do MESMO tamanho visual (o D+P é vazado/fino, o PADCON é cheio/sólido;
   na mesma altura o cheio "pesa" mais, então compensa-se a altura: D+P `size=46`, PADCON `height=40`).
3. BASE COMUM: símbolo e wordmark de cada lado assentam na MESMA linha de base (`items-end`); os dois
   logotipos também compartilham a mesma base (outer `items-end`).
4. OURO UNIFICADO: os dois lados no MESMO tom de ouro. O símbolo D+P (gradiente CSS, controlável) foi
   deixado mais vivo; a arte oficial PNG do "Instituto Pádua" (ouro fosco escuro) recebe filtro CSS
   `saturate(1.5) brightness(1.42)` para aproximar do ouro vivo do PADCON. **Decisão de tom final é do
   CEO (A/B/C) — ver pergunta aberta.** Não se redesenha a arte oficial sem ordem do CEO.
5. A legenda "ENGINEERED BY" fica EM CIMA do lockup da PADCON, alinhada à DIREITA (sobre o fim do
   wordmark). Lado direito.
6. Legenda no lado Pádua, EM CIMA do lockup: texto exato **"DR. CAIO PÁDUA — MEDICAL DIRECTOR"**
   (decisão do CEO, 24/06/2026). Cor tema-consciente: BRANCO intenso no escuro; NAVY intenso
   (`#16294a`) no claro (classe `.footer-credit-padua` — legibilidade sobre o creme).
7. A legenda do Pádua ENCERRA NAS VERTICAIS do logotipo: começa exatamente na vertical esquerda
   (símbolo) e termina na vertical direita (fim do wordmark). Implementação DETERMINÍSTICA: o bloco
   tem largura FIXA = largura natural do logotipo (`w-[172px]`); a linha do logo usa `w-full` +
   `justify-between` (símbolo encosta na esquerda, wordmark na direita); a legenda usa
   `textAlign: justify` + `textAlignLast: justify` para preencher exatamente essa largura. Bloco
   PADCON usa a mesma grade (`w-[180px]`), com a legenda à direita.

### Tecido (textura)
8. Unificar o tecido do CABEÇALHO com o das QUESTÕES (o CEO prefere o das questões). Causa-raiz:
   o cabeçalho usa base `bg-card` (branco puro / navy claro) e a página usa `bg-background`
   (creme / navy escuro); a MESMA classe `.leva-fabric` sobre bases diferentes parece dois tecidos.
   Correção: trocar a base do `<header>` de `bg-card` para `bg-background`. Vale no claro e no escuro.

### Painel das iniciais dos grupos
9. Prolongar o painel `.leva-band` (botões de sigla dos grupos) até o TOPO: encostar no rodapé do
   cabeçalho (sem a folga atual), lendo como continuação. Cantos do topo retos, base arredondada.

### Perfil dos cartões de questão
10. Reduzir um pouco o perfil dos cartões `.leva-card` (de `p-4` para `p-3`) para o tecido aparecer
    mais ao redor. PRESERVAR o relevo 3D (bevel/sombra) — só afinar o respiro interno.

## Casos extremos a tratar
- Tema CLARO: legenda branca sumiria no creme → usar navy intenso no claro (requisito 6).
- Mobile (largura ~402px): as duas marcas + legendas não podem colidir; se colidirem, ajustar
  tamanho/posição (verificar por screenshot em 402 de largura).
- Símbolo 1,5x maior que o nome não pode quebrar o alinhamento de topo das duas marcas.
- Prolongar a banda não pode cobrir os medidores do cabeçalho nem sobrepor conteúdo.

## Definição de PRONTO
- Rodapé: símbolo à esquerda, nomes mesma altura (topo+base), símbolo ≈1,5x topo-alinhado, legenda
  Pádua "DR. CAIO PÁDUA — MEDICAL DIRECTOR" em branco intenso (navy no claro), "Engineered by" em cima.
- Cabeçalho e questões com o MESMO tecido (claro e escuro).
- Banda das iniciais prolongada até o topo.
- Cartões de questão com perfil afinado e tecido mais visível, SEM perder o relevo 3D.
- Validado por SCREENSHOT no tema CLARO e ESCURO (rodapé + topo).
- architect aprova requisito por requisito, zero pendência.

## Linhas vermelhas
- NÃO tocar no motor da anamnese, skip-logic, persistência (flush/rascunho), POST/alarme clínico.
- NÃO mexer no payload de salvar nem na lógica de perguntas.
- NÃO remover relevos 3D, LEDs ou o neon lento dos alertas (só ajustar o que a spec pede).
- Mudanças são de APRESENTAÇÃO apenas.

---

## ATUALIZACAO 24/06/2026 — Rodape SEM simbolos (decisao do CEO, img IMG_5223)

O CEO mudou a direcao do rodape: o simbolo "fica exagerado". Nova forma:

1. REMOVER os dois simbolos (PaduaSymbol e PadconSymbol). Ficam SO os wordmarks
   "Instituto Padua" (esquerda) e "PADCON" (direita).
2. As DUAS legendas ("Dr. Caio Padua — Medical Director" e "Engineered by") na MESMA cor
   (classe .footer-credit-padua: navy no claro / branco no escuro) e MESMA fonte (Lora italico),
   em ITALICO — elegantes para apresentacao. Antes uma era branca e a outra cinza (muted): erro.
3. Proporcao conferida por altura distinta: PaduaWordmark height 34, PadconWordmark height 22.
4. Faixa inferior bem delimitada: div com bg-card + border-border + rounded-xl + shadow-sm + padding.
   NAO fixada (fixed) por causa do selo "Tudo salvo automaticamente" ja fixo embaixo — pendente A/B
   com o CEO (faixa no fim do conteudo x barra fixa sempre visivel).

Validado por screenshot nos dois temas (claro e escuro). architect: PASS.
O requisito antigo "legenda encerra nas verticais do logotipo" NAO se aplica mais (sem simbolo,
o wordmark define a largura; legenda alinhada esq/dir, sem justify).
