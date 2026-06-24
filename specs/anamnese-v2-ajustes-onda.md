# Spec — Anamnese /anamnese/v2 — Ajustes de acabamento (voz do CEO, 24/06/2026)

Marca/estetica: skill `skill-layout-paxter` (navy/ouro, classes 3D unlayered, vidro Padrao 14, Lora so na pergunta).
LINHA VERMELHA: NAO mexer em logica, motor, payload, skip-logic, alarme. So acabamento visual nos 2 temas (claro + escuro).
Verificacao: screenshot claro + escuro (NUNCA `pnpm build` global; typecheck do pacote).

## Itens (numerados conforme pedido)

1. Sigla dos chips de grupo: trocar concatenado ("Cirg") por 1a PALAVRA truncada + ponto ("Cirur.").
   Decisao: maximo 5 letras; <=5 mostra a palavra inteira sem ponto; >5 corta em 5 + ".". Title case.

2. Chips de grupo: altura menor (painel mais enxuto). h-10 -> h-8, texto 13px -> 12px.

3. Cabecalho:
   3a. Camada lisa/opaca acima da faixa de chips para o conteudo (tecido) NAO vazar ao rolar (matar
       "tecido sobre tecido"). Logo da marca segue com tecido, congelada e bonita. Faixa de chips = .leva-band.
       Abaixo da faixa = tecido terno.
   3b. EMPILHAMENTO DA MARCA: simbolo EM CIMA do PAXTER, PAXTER EM CIMA da frase inglesa. PERFEITO -> NAO MEXER
       (correcao explicita do CEO).
   3c. Glint (raio) tambem passa na frase inglesa "Clinical Intelligence System".
   3d. Botoes foco/tema: retangulos VERTICAIS finos, texto girado 90 graus ("FOCO"; palavra do tema = "TEMA").

4. Rodape: NOVO logotipo Instituto Padua em ouro 3D FOSCO, inferior-esquerdo: simbolo a esquerda + "INSTITUTO PADUA".

5. NOVOS simbolos: Padcon (ouro POLIDO 3D) + Padua (marca D+P VAZADA, ouro ESCOVADO 3D). "Melhor que o ChatGPT."

6a. Chip concluido: manter verde + check ELEVADO (up level). Chip nao-concluido/branco e feio ->
    recesso neutro dourado-suave (sem branco), nos 2 temas.

6b. Texto explicativo entre parenteses da pergunta: tirar da linha do titulo; fonte SANS (nao-elegante,
    mais visivel), menor, entre parenteses, em linha propria abaixo da pergunta.

7. Barras: escala de dor (celula preenchida fica azul-palido/"branca" = feia) -> OURO com vidro/reflexo.
   Barrinhas de progresso (topo + mapa) ainda estreitas e arredondadas demais -> chanfro meio-termo
   (menos arredondado) + um pouco mais largas. (A barra ja era ouro+vidro; ajustar raio/altura.)

## Ondas (loop multi-skill reformado)

- Onda A (CSS/JSX seguro, 0 asset): itens 1, 2, 6a, 6b, 7. -> screenshot claro+escuro -> conferir.
- Onda B (cabecalho): itens 3a, 3c, 3d (3b intocado). -> screenshot rolando claro+escuro.
- Onda C (logos ouro 3D): itens 4, 5 (assets Padcon polido / Padua escovado vazado / Instituto Padua).
- Fechamento: architect({includeGitDiff:true}) -> corrigir severos -> atualizar .agents/memory.

## Tecnica "parar e analisar" (pedido diamante do CEO)
Antes de cada onda: (1) reler o item na voz do CEO; (2) conferir contra a skill (token/classe certa,
nao palpite); (3) listar a LINHA VERMELHA (o que NAO tocar); (4) construir so o item; (5) screenshot nos
2 temas e comparar com a estetica da skill E o gosto do CEO; (6) so entao proxima onda.
