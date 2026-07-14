# SPEC — Curadoria Universal de Exames (10 tarefas do CEO, 14/07/2026)

## Objetivo
O CEO quer que o agente pense como medico + bioquimico de laboratorio e deixe o
catalogo de exames COMPLETO: nome padrao usual, apelidos exaustivos, variantes de
grafia unificadas (ca125 / ca 125 / ca-125), unidades (1 padrao + ate 4 raras),
5 faixas com valores de referencia, direcao favoravel, duplicados englobados e
sala de triagem esvaziada ao maximo.

## Estado medido em 14/07/2026 (fonte: banco de desenvolvimento)
| Medida | Valor |
|---|---|
| Exames ativos no catalogo | 287 |
| Exames inativos | 6 |
| Ativos SEM apelido | 212 |
| Ativos SEM unidades | 231 |
| Ativos SEM faixas | 232 |
| Ativos SEM direcao | 215 |
| Triagem (print) | 50 descobertos / 655 a conferir / 40 ignorados |

## Mapa das 10 tarefas -> 3 ondas

### ONDA A — Motor de variantes de grafia (tarefa 4) [RAIZ, RISCO ALTO]
1. Nova funcao `chaveVariante(s)` em `zones.ts`: alem do que `chaveFaixa` faz
   (acento/caixa/trim), remove TODA pontuacao e TODO espaco/hifen
   ("CA-125" -> "ca125"; "CA 125" -> "ca125"; "17-OH Progesterona" -> "17ohprogesterona").
2. `chaveFaixa` NAO muda (amarra 23.317 exam_results + faixas + unidades). A
   `chaveVariante` e usada SOMENTE nos pontos de CASAMENTO DE IDENTIDADE:
   - faxina/triagem (casar grafia de laudo com exame existente);
   - validacao de unicidade do renomear e dos apelidos (colisao por variante
     apresenta aviso com opcao, nao trava cega);
   - resolverCodeCatalogo (promocao de descobertos).
3. Regra anti-falso-positivo: variantes so casam se a forma compactada tiver
   >= 4 caracteres (evita "T4" casar com "TA4" etc. — limite a calibrar).
4. Nada de migracao retroativa de codes (decisao anterior mantida).

### ONDA B — Ferramenta "+" de apelidos (tarefa 2) [RISCO BAIXO]
1. Limite de apelidos sobe de 5 para 12: schema `putAliasesSchema.synonyms.max(12)`,
   preservacao de overflow interno passa a `slice(12)`, UI ganha botao "+ Apelido"
   (ate 12 campos, remocao por campo).
2. Zero mudanca de banco (synonyms ja e jsonb livre).

### ONDA C — Curadoria em massa "bioquimico" (tarefas 1,3,5,6,7,8,9,10) [DADOS]
Roda DEPOIS das ondas A e B, em lotes de ~25 exames, com relatorio por lote.
Para cada exame ativo:
1. Nome padrao = o mais usual nos grandes laboratorios nacionais (tarefa 9).
2. Apelidos exaustivos: sinonimos clinicos, siglas, variantes com "dosagem de",
   "marcador tumoral", grafias com/sem hifen (tarefas 1 e 3). Max 12 visiveis.
3. Unidade padrao (canonica, fator 1) + ate 4 unidades raras com fator de
   conversao correto (tarefa 6). Grava so onde NAO ha unidade curada (nao
   sobrescreve curadoria manual do CEO).
4. 5 faixas com valores de referencia de adulto, bom senso clinico (tarefa 7).
   Mesma regra: nao sobrescreve faixa ja curada manualmente.
5. Direcao favoravel (menor melhor / maior melhor / faixa ideal) (tarefa 8).
6. Englobar duplicados: exames que sao o mesmo analito (ex.: os 4 do CA-125)
   viram UM registro, os demais viram apelidos, resultados migram via rota
   /englobar existente (tem desfazer) (tarefa 10).
7. Triagem: rodar a faxina apos cada lote; grafias que agora casam por
   chaveVariante ou pelos novos apelidos saem da fila (tarefa 5).
Fonte dos dados: conhecimento clinico do agente (sem API externa); tudo gravado
pelas rotas existentes (aliases/unidades/faixas/direcao/englobar) para respeitar
as validacoes do motor.

## Salvaguardas
1. Curadoria NUNCA sobrescreve valor ja curado manualmente (so preenche vazio),
   exceto nome padrao/englobar quando o proprio lote identifica duplicata.
2. Englobar sempre pela rota oficial (auditoria + desfazer por lote).
3. Faixas em unidade canonica do exame; sem faixa pediatrica/gestante (fase 2).
4. Relatorio por lote em Densidade B para o CEO conferir e mandar seguir.

## Criterio de aceite
- CA-125: 1 registro ativo, nome "CA-125", demais grafias como apelidos, 6
  resultados intactos.
- 287 ativos com: nome padrao revisado, >= 3 apelidos, 1 unidade canonica,
  faixas nas 5 zonas, direcao definida.
- Fila de triagem reduzida substancialmente (meta: a conferir < 200).
- Nenhuma perda em exam_results (contagem antes = depois).
