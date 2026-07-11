# Spec — Faixas por Exame (cortes editáveis) — "TOTALMENTE MELHORADO"

> Onda nova, aprovada pelo CEO (Opção A: faixas POR EXAME). A spec anterior
> `cadastro-direcao-exames.md` (direção + nomenclatura ACEITÁVEL) está CONCLUÍDA e
> permanece intacta. Esta spec ESTENDE aquela; nada nela é revogado.

## Objetivo
Entregar UMA ferramenta compartilhada (mesma engrenagem no menu Cadastros e no
Cockpit) onde o médico edita, por exame: a DIREÇÃO e as CINCO faixas — cada faixa
com CORTE (De/Até) editável, rótulo livre e cor. Os cortes vêm PRÉ-PREENCHIDOS por
bom senso médico (semente), não pelo laudo (cada laboratório varia). O gráfico da
Evolução passa a usar linha RETA e mostra a leitura da faixa abaixo.

## Regra dos cortes (decisão do CEO)
1. Os cortes das faixas são DELIMITADOS por bom senso médico, iguais para todos os
   laboratórios. NÃO derivam do intervalo do laudo.
2. A referência do laudo (refLow/refHigh) continua sendo mostrada como informação,
   mas não define mais as faixas quando há corte cadastrado.
3. Sem corte cadastrado e sem semente, o motor cai no padrão antigo (trisecção do
   min/max do laudo). Sem min/max => sem faixa (Art.47, zero fantasia).

## Estado atual (auditoria do código)
1. `exam_analyte_ranges` (analyteCode text, faixaName, low, high, color, ordem) já
   guarda faixas por exame; `overrideZones()` TEM prioridade sobre `computeZones()`.
2. PROBLEMA DE CHAVE (frágil): a mesma faixa é lida/gravada por chaves cruas
   diferentes — `/evolucao` usa `analyteCode ?? analyteNameRaw.toLowerCase()`;
   `/direcoes` devolve `code = displayName.toLowerCase()`; a semente futura não
   casaria. Sem unificar a chave, "muda numa, muda na outra" não se sustenta.
3. `exam_analyte_catalog` VAZIO. Direção real vem de `direcao_favoravel_exame`
   (casada por nome normalizado). `PUT /faixas` já grava direção lá + zonas em
   `exam_analyte_ranges` (delete+insert).
4. Hoje só o RÓTULO é editável na ferramenta compartilhada (`DirecaoExamesTool` só
   edita direção); o `BlocoEditavel` (dentro da Evolução) já edita De/Até, mas é um
   segundo lugar separado — duplicidade que esta onda unifica.
5. Gráfico usa `type="monotone"` (curva). CEO pede linha RETA.

## Requisitos exatos
1. CHAVE UNIFICADA: definir `chaveFaixa(s) = removeDiacritics(s).trim().toLowerCase()`
   e usá-la como chave de `exam_analyte_ranges` em TODOS os pontos:
   - `/evolucao`: montar `rangesByKey` por `chaveFaixa(r.analyteCode)` e ler por
     `chaveFaixa(line.name)`.
   - `GET /faixas` e `PUT /faixas`: normalizar o `code` recebido com `chaveFaixa`
     antes de ler/gravar as zonas.
   - Normalizar-na-leitura torna a migração desnecessária: linhas antigas sem acento
     já casam; edições futuras regravam normalizado.
2. SEMENTE MÉDICA DE CORTES (`seed-faixas.ts`, commitada, curadoria do médico):
   5 faixas com cortes absolutos por exame frequente (com variações de nome, como o
   `seed-direcoes.ts`). Gravar em `exam_analyte_ranges` com `analyteCode = chaveFaixa(nome)`.
   IDEMPOTENTE E NÃO-DESTRUTIVA: para cada chave, só INSERE se não existir NENHUMA
   linha para ela (guarda por existência). Nunca sobrescreve edição do médico nem se
   duplica no reboot. Ligar no boot em `index.ts` junto das outras sementes.
   Cada faixa recebe cor semântica fixa por severidade clínica (ver §Cores) e rótulo
   clínico legível (ex.: Vitamina D "Deficiência/Insuficiência/Limítrofe/Suficiente/Ótimo").
3. FERRAMENTA ÚNICA (master-detail) — evoluir `DirecaoExamesTool`:
   - ESQUERDA: lista de exames (de `GET /direcoes`) com busca; badge da direção.
   - DIREITA: meta do exame (nome, unidade quando houver, direção em 3 botões) +
     as 5 faixas em SLOTS FIXOS (Padrão 12/13), cada slot com: cor semântica fixa +
     rótulo EDITÁVEL + De EDITÁVEL + Até EDITÁVEL. Barra-prévia (faixas proporcionais)
     + leitura "faixa cadastrada do valor atual" quando houver valor de referência.
   - Salvar via `PUT /faixas?code=` { direction, zones, displayName }. Restaurar via
     { zones: [], resetDirection: true }.
   - Usada em `/cadastros/direcao-exames` E embutida no Cockpit, substituindo o
     `BlocoEditavel` e o toggle de direção duplicado (uma engrenagem só).
4. GRÁFICO LINHA RETA: em `CartaoGrafico`, `type="monotone"` -> `type="linear"`.
   Manter as 5 faixas de fundo (ReferenceArea) e a leitura da faixa (rótulo custom +
   cor) abaixo do gráfico.
5. CONTRATOS ADITIVOS: reusar `PUT /faixas` e `GET /faixas` (já suportam
   direction+zones+displayName). Não renomear colunas/rotas. Não truncar tabelas.
6. CHECKLIST HONESTO (Art.47) no fim, Densidade B, pedido x realizado.

## Cores semânticas fixas por posição (espelham zones.ts)
Mantém o vocabulário oficial já travado (ACEITÁVEL). Por DIREÇÃO, a posição de cada
severidade se inverte (o motor já faz isso em `LABELS_BY_DIRECTION`):
- higher_better (menor→maior): ALERTA, INSUFICIENTE, ACEITÁVEL, EXCELENTE, ATENÇÃO
- lower_better  (menor→maior): ATENÇÃO, EXCELENTE, ACEITÁVEL, INSUFICIENTE, ALERTA
- target        (menor→maior): ALERTA, ACEITÁVEL, EXCELENTE, ACEITÁVEL, ATENÇÃO
Cores: ALERTA #b4413c, ATENÇÃO #c17a2b, INSUFICIENTE #d0a53f, ACEITÁVEL #7a9a4a,
EXCELENTE #3f7a3f. A cor de cada slot é derivada da posição+direção; o rótulo é o
texto livre do médico por cima.

## Casos extremos
- Exame sem valor/ref: prévia mostra "sem valor de referência para posicionar"; os
  cortes seguem editáveis.
- De/Até em branco: mínimo em branco = "abaixo de tudo"; máximo em branco = "acima de
  tudo" (contrato já existente do PUT).
- Variações de nome (caixa/acento): a semente lista variações e a chave normaliza
  caixa/acento; variações com grafias realmente diferentes seguem separadas (dívida
  conhecida de canonicalização, igual à direção — documentada, não resolvida aqui).
- Vírgula decimal (pt-BR) no input de corte: aceitar "5,4" -> 5.4 (replace vírgula).

## Definição de PRONTO
1. Editar um corte na ferramenta (Config), recarregar, e o corte PERSISTE
   (curl PUT -> GET /faixas reflete).
2. O mesmo corte editado no Cockpit aparece na Config e vice-versa (mesma chave).
3. Semente: um exame frequente sem edição mostra os 5 cortes médicos na Evolução;
   após editar e reiniciar o servidor, a EDIÇÃO permanece (semente não sobrescreve).
4. Gráfico desenha linha RETA entre pontos e mostra a leitura da faixa abaixo
   (screenshot).
5. Vitamina D (higher) e HbA1c (lower) mostram as severidades na ordem correta.
6. Architect aprova requisito por requisito (includeGitDiff), zero pendência.
7. Checklist honesto entregue em Densidade B.

## Linhas vermelhas
- NÃO truncar `exam_analyte_ranges`, `direcao_favoravel_exame`, `exam_results`,
  `clients`.
- NÃO deixar a semente sobrescrever/duplicar faixas já existentes (guarda por
  existência da chave).
- NÃO renomear colunas/contratos; só adicionar/normalizar leitura.
- NÃO derivar corte do laudo quando há corte cadastrado (é a regra do CEO).
- Manter design Paxter 3D (navy/ouro, cantos quadrados, slots fixos).
