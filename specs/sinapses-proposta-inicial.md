# Carga abrangente de propostas de sinapses clínicas

## Objetivo

Persistir propostas de ligação para todos os destinos clínicos ativos e completos,
para que cada exame, fórmula, injetável com via definida e implante apareça ligado
a uma pergunta na tela de Sinapses Clínicas, sem ativar regra clínica.

## Requisitos

1. Preservar todas as ligações ativas existentes, sem apagar ou reescrever nenhuma.
2. Criar uma tabela separada para propostas, com estado PENDENTE, APROVADA ou RECUSADA.
3. Cada proposta deve guardar o eixo informado, a pergunta, a categoria, o destino real do catálogo e a justificativa textual da seleção.
4. A carga deve usar apenas perguntas e destinos existentes, ativos e vindos dos catálogos reais.
5. A carga deve ser idempotente: repetir não duplica nem reativa propostas recusadas.
6. As propostas pendentes aparecem no grafo e na sanfona com estilo e rótulo diferentes das ligações ativas.
7. Aprovar uma proposta insere a ligação na tabela operacional `sinapses_clinicas` e muda a proposta para APROVADA na mesma transação.
8. Recusar uma proposta mantém o registro para auditoria, sem inseri-la na tabela operacional.
9. A interface deve permitir gerar a carga e aprovar ou recusar cada proposta individualmente.
10. Contagens devem separar ligações ativas de propostas pendentes por categoria.
11. A carga ampla solicitada pelo Dr. Caio pode usar aproximação temática determinística; cada aproximação deve ser identificada e permanecer pendente para revisão humana.
12. Não criar, aprovar, clonar ou reativar ligação para destino ausente, inativo ou sem conteúdo.
13. Não alterar o motor, o Cockpit, prescrições, doses, vias ou cadastros de itens clínicos.
14. Excluir perguntas de identificação pessoal e perguntas inexistentes; não usar pergunta de alarme clínico como destino genérico.
15. Cada destino ativo e completo sem ligação ativa ou proposta existente deve receber ao menos uma proposta, escolhida por tema; quando não houver tema identificável, usar pergunta clínica ampla e marcar a aproximação como baixa confiança.
16. Excluir blocos de exame vazios e injetáveis sem via definida; informar esses itens separadamente, sem inventar a via.

## Escopo da carga abrangente

O Dr. Caio escolheu aproximar todos os destinos restantes para reduzir o trabalho manual.
O gerador deve primeiro preservar as propostas existentes e os vínculos ativos; depois,
para cada destino elegível ainda sem vínculo, escolhe uma pergunta pela correspondência
temática determinística disponível. Sem correspondência temática identificável, usa a
pergunta clínica ampla existente e marca a proposta como aproximação de baixa confiança.
Nenhuma dessas sugestões representa indicação clínica, fica ativa ou pode ser consumida
por um fluxo clínico antes de aprovação humana.

`GAD1-7` é uma forma abreviada de mencionar as perguntas existentes `GAD1` a
`GAD7`; cada uma será tratada pelo próprio código. `Q003` a `Q009` não existem
no catálogo atual e ficam fora da carga.
Perguntas de identificação pessoal (`Q001` nome completo e `Q002` CPF) nunca recebem
saídas clínicas. `Q010` é a queixa principal, ampla demais para receber uma saída
automática. `F02` é sobre reação alérgica grave e não será associada ao eixo
digestivo. A pergunta de doenças já diagnosticadas (`Q013`) pode receber apenas
propostas explicitamente identificadas como amplas e pendentes.
Blocos vazios não são destinos elegíveis; quando houver blocos preenchidos repetidos,
cada registro real elegível continua visível e recebe vínculo próprio. Perguntas de
identificação, inexistentes e de alarme não são usadas como alternativas genéricas.

## Impacto

- Nova tabela aditiva `sinapses_clinicas_propostas`.
- Rotas autenticadas para gerar, listar, aprovar e recusar propostas.
- Tela `/sinapses-clinicas` para distinguir propostas inativas de ligações ativas.
- Nenhuma alteração ou exclusão nas linhas atuais de `sinapses_clinicas`.
- Nenhuma execução de backup por tabela ou cópia dentro do banco; usar os checkpoints
  de banco já mantidos pela plataforma e manter a carga estritamente aditiva.

## Falhas previstas e barreiras

| Falha | Barreira |
|---|---|
| Código de pergunta citado não existe | validar contra `anamnese_questionario`; não inserir |
| Destino inativo ou ausente | buscar apenas catálogos ativos; confirmar no servidor |
| Bloco sem exames aparenta conduzir | mostrar como “sem saída”; impedir nova criação e aprovação |
| Execução repetida | chave única por pergunta, categoria, tipo e destino |
| Aprovação concorrente | transação; `ON CONFLICT` e atualização de estado atômicos |
| Falha no meio da aprovação | transação reverte ambas as alterações |
| Ligação errada tratada como operacional | proposta permanece fora de `sinapses_clinicas` até aprovação |
| Catálogo sem correspondência explícita | deixar sem proposta; não escolher item por aproximação ampla |
| Destino sem correspondência temática | vincular à pergunta clínica ampla existente e identificá-lo como baixa confiança |
| Item sem via ou bloco sem conteúdo | excluir da carga e contabilizar como inelegível |

## Definição de pronto

1. A proposta fica persistida e aparece na tela como pendente, sem contar como ativa.
2. Aprovar cria uma ligação operacional e atualiza o estado da proposta uma única vez.
3. Recusar não cria ligação operacional e não apaga o registro.
4. Repetir a carga não duplica propostas nem reabre recusadas.
5. Testes com PostgreSQL descartável validam idempotência, transação e isolamento dos dados operacionais.
6. A contagem lida do banco confere com a resposta da carga.
7. A interface visual é conferida em computador e celular; se o login impedir a captura, isso fica declarado.
8. Todo destino ativo e completo do catálogo está coberto por pelo menos um vínculo ativo preexistente ou proposta pendente; os itens inelegíveis aparecem contabilizados.

## Limites de homologação

A carga de propostas não equivale à aprovação clínica nem à homologação do motor.
As propostas não devem ser consumidas por qualquer fluxo clínico até aprovação humana.
