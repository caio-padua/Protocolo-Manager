# Spec — Direção dos Exames + Nomenclatura ACEITÁVEL (5 faixas)

## Objetivo
Fixar a regra das 5 faixas com a nova nomenclatura (SUFICIENTE → ACEITÁVEL), categorizar
(direção) os exames que realmente aparecem nos laudos e entregar uma ferramenta/tela para
o médico editar a direção de cada exame — acessível no menu Cadastros e no Cockpit de consulta.

## A regra (confirmada pelo CEO, exemplo vitamina D ref 20–100)
Pega-se a faixa de referência padrão da medicina convencional [refLow, refHigh] e divide-se
em 3 terços iguais (trisecção). As 5 faixas, por posição:

| Posição | Zona | higher_better (altos bons) | lower_better (baixos bons) | target (alvo no meio) |
|---|---|---|---|---|
| abaixo do refLow | below | ALERTA | ATENÇÃO | ALERTA |
| terço 1 | t1 | INSUFICIENTE | EXCELENTE | ACEITÁVEL |
| terço 2 | t2 | ACEITÁVEL | ACEITÁVEL | EXCELENTE |
| terço 3 | t3 | EXCELENTE | INSUFICIENTE | ACEITÁVEL |
| acima do refHigh | above | ATENÇÃO | ALERTA | ATENÇÃO |

Observação: isto é EXATAMENTE o motor atual (`computeZones` já faz a trisecção). A única
mudança de vocabulário é SUFICIENTE → ACEITÁVEL. O extremo "ruim grave" é sempre ALERTA;
o extremo "bom levado longe demais" é sempre ATENÇÃO.

## Fatos do estado atual (auditoria SQL)
1. `exam_analyte_catalog` está VAZIO (0 linhas) — por isso a gravação de direção da tela
   atual não persiste (faz UPDATE em 0 linhas). A ferramenta de direção, hoje, não funciona.
2. A direção que o motor lê de verdade vem de `direcao_favoravel_exame` (54 exames curados
   do IHE, casados por NOME normalizado). Vocabulário: SUBIR_BOM / DESCER_BOM / INFERIOR.
3. Os exames reais são 1424 nomes distintos em `exam_results` (20.462 resultados); a maioria
   sem casar com catálogo. Muitos nomes são variações do MESMO exame (caixa, hífen, "Dosagem").
4. A tabela curada tem duplicatas de vocabulário misto (ex.: GLICOSE JEJUM/DESCER_BOM x
   GLICOSE_JEJUM/INFERIOR) e erros clínicos (hemograma marcado como SUBIR/DESCER quando
   deveria ser alvo).

## Requisitos exatos
1. MOTOR (`zones.ts`): trocar SUFICIENTE → ACEITAVEL em `ZoneLabel`, `ZONE_COLOR` e
   `LABELS_BY_DIRECTION`. Não mudar o cálculo (trisecção). Manter o mapeamento de direção
   (`resolveDirection`) reconhecendo SUBIR_BOM/SUPERIOR→higher, DESCER_BOM/INFERIOR→lower,
   MEDIO/ALVO/TARGET→target.
2. PERSISTÊNCIA REAL: reescrever `PUT /exames-lab/faixas` para gravar a direção em
   `direcao_favoravel_exame` (upsert por nome normalizado), usando o `displayName` recebido
   no body. Traduz a direção do motor para o vocabulário da tabela
   (higher_better→SUBIR_BOM, lower_better→DESCER_BOM, target→ALVO). Continua gravando as
   zonas em `exam_analyte_ranges`. `resetDirection` apaga a linha de direção por nome.
3. NOVA ROTA `GET /exames-lab/direcoes`: lista consolidada para a tela de cadastro. União de
   (a) `direcao_favoravel_exame` e (b) analitos distintos reais de `exam_results` (por nome),
   com: nome de exibição, direção resolvida (higher/lower/target), grupo, nº de resultados,
   e flag "tem direção explícita". Ordenada por frequência/nome.
4. CATEGORIZAÇÃO (seed determinístico, código commitado, idempotente no boot): mapa curado
   pelo médico cobrindo os exames reais mais frequentes + suas variações de nome observadas,
   com direção limpa. Corrige os erros clínicos (hemograma → alvo; ferritina/ferro → alvo;
   TSH/T4/T3 → alvo; marcadores tumorais/PSA → baixos bons). Upsert por nome (não trunca).
5. TELA DE CADASTRO (menu Cadastros → nova página): lista todos os exames com direção, busca,
   e edição da direção por 3 escolhas claras — "Valores ALTOS são bons", "Valores BAIXOS são
   bons", "ALVO (meio da faixa)" — com prévia das 5 faixas na nomenclatura nova. Salva via
   `PUT /exames-lab/faixas`. Estilo Paxter 3D (skill-layout-paxter), navy/ouro.
6. COCKPIT: a mesma ferramenta de direção acessível no Cockpit de consulta (componente
   compartilhado embutido), além do bloco editável por-exame já existente na Evolução.
7. CHECKLIST HONESTO no fim (Art.47): apresentar o que foi pedido x o que foi realizado,
   sem fantasia, em Densidade B.

## Casos extremos
- Nome com hífen/caixa/"Dosagem": cobrir as variações reais no seed (entradas próprias);
  não afrouxar o normalizador (evitar falso-positivo que junte exames diferentes).
- Exame sem direção explícita: cai no fallback `target` (motor). A tela mostra isso como
  "alvo (padrão)".
- Exame sem refLow/refHigh no laudo: sem faixa (motor retorna null) — a prévia mostra
  "sem faixa de referência no laudo".
- Duplicata de vocabulário misto: o seed consolida no nome canônico; entradas legadas
  redundantes permanecem inofensivas (o resolve trata INFERIOR = baixos bons).

## Definição de PRONTO
1. Motor mostra ACEITÁVEL (não SUFICIENTE) na Evolução e na tela de cadastro (screenshot).
2. Editar a direção de um exame na tela e recarregar mostra a direção PERSISTIDA
   (verificado por curl: PUT depois GET /direcoes reflete a mudança).
3. Vitamina D (higher) mostra INSUFICIENTE/ACEITÁVEL/EXCELENTE; homocisteína (lower) mostra
   EXCELENTE/ACEITÁVEL/INSUFICIENTE — coerente com a regra do CEO.
4. Tela existe no menu Cadastros e no Cockpit; ambas salvam.
5. Architect aprova requisito por requisito (includeGitDiff), zero pendência.
6. Checklist honesto entregue em Densidade B.

## Linhas vermelhas
- NÃO truncar `direcao_favoravel_exame`, `exam_results` nem `clients`.
- NÃO mudar a regra de trisecção do motor (é a regra do CEO); só o rótulo.
- NÃO inventar faixa quando não há refLow/refHigh reais (Art.47).
- NÃO renomear colunas/contratos existentes; só adicionar.
