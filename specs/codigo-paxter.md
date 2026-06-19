# Spec — Codigo Paxter (arquitetura viva em artigos)

## Objetivo
Transformar a skill `paxter-loop` num CODIGO PAXTER: um documento de arquitetura VIVO, em artigos
(estilo Codigo Civil), que consolida toda a metodologia, equipe, empresas e diretrizes do CEO Dr. Caio,
e que o Dr. Replit Paxter aprimora a cada aprendizado, ANUNCIANDO cada insercao como promulgacao de
artigo e REORGANIZANDO a cada insercao.

## Requisitos exatos
1. Criar `.agents/skills/paxter-loop/CODIGO-PAXTER.md`.
2. Estrutura em TITULOS (agrupadores) e ARTIGOS numerados continuamente (Art. 1, Art. 2, ...), com
   numeracao PROPRIA e independente do replit.md.
3. Conteudo consolidado ("toda a arquitetura encaminhada"): (I) CEO e comunicacao; (II) Densidade B;
   (III) conduta; (IV) equipe fixa; (V) empresas e vocabulario; (VI) Paxter Loop; (VII) Canvas;
   (VIII) atualizacao viva; (IX) aprendizados do projeto.
4. Preambulo explicando: o que e, por que existe, numeracao propria, relacao com o replit.md
   (Art. 37 a 52) e com a memoria (.agents/memory).
5. PROTOCOLO DE ATUALIZACAO VIVA com 4 regras minimas: (a) inserir novo artigo a cada aprendizado
   DURAVEL de metodo/diretriz; (b) ANUNCIAR ao CEO toda insercao (numero, titulo, texto, data
   dd/mm/aaaa); (c) REORGANIZAR/renumerar a cada insercao; (d) aprendizado tecnico fino vai para a
   memoria, nao para o Codigo (o Codigo guarda metodo, nao changelog).
6. Tabela "HISTORICO DE PROMULGACOES" (data | artigos | resumo) no fim, preenchida com a 1a leva.
7. Semear o Titulo IX com no minimo 3 licoes reais de nivel metodo/arquitetura (origem na memoria),
   cada uma datada e apontando para o topico da memoria.
8. Atualizar `.agents/skills/paxter-loop/SKILL.md`: referenciar o CODIGO-PAXTER.md e instruir o agente
   a seguir o protocolo de atualizacao viva (ler antes de tarefa nao-trivial; promulgar + anunciar +
   reorganizar ao aprender). Nao apagar conteudo existente da SKILL.md.
9. Reorganizar as 5 entregas existentes do Canvas numa coluna unica numerada (1 a 5), do topo,
   respeitando limites e sem sobrepor (Art. 52 do replit.md).
10. Comunicacao final ao CEO em Densidade B com a lista dos artigos promulgados.

## Casos extremos a tratar
- Colisao de numeracao com o replit.md (Art. 37 a 52): deixar EXPLICITO no preambulo que o Codigo
  Paxter tem numeracao propria; onde repete diretriz do replit.md, e consolidacao, nao conflito.
- Nao duplicar conteudo tecnico que ja vive na memoria: apontar, nao copiar (evitar changelog).
- Nao quebrar a frontmatter (name/description) da SKILL.md.
- CODIGO-PAXTER.md e para o CEO ler: escrever em pt-BR com acentos. A SKILL.md (voltada ao agente)
  mantem o estilo atual sem acento.

## Definicao de PRONTO
- `CODIGO-PAXTER.md` existe, com preambulo + 9 titulos + artigos numerados continuos + protocolo de
  atualizacao viva + Historico de Promulgacoes preenchido + no minimo 3 aprendizados do projeto datados.
- `SKILL.md` referencia o Codigo e o protocolo, sem quebrar a frontmatter e sem apagar conteudo.
- Canvas: 5 entregas em coluna unica numerada, sem sobreposicao (verificado por leitura de bbox).
- O architect (code_review) aprova requisito por requisito, zero pendencia.
- CEO recebe Densidade B com a lista de artigos promulgados.

## Linhas vermelhas
- Tarefa e SO documentacao + Canvas. Nao tocar codigo de aplicacao (ex.: /api/budgets/calculate, motor
  de desmembramento).
- Nao apagar conteudo existente da SKILL.md (so acrescentar/referenciar).
