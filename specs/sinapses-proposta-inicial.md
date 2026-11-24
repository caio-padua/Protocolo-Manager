# Proposta inicial de sinapses clínicas

## Objetivo

Persistir na tela de Sinapses Clínicas uma carga inicial de ligações sugeridas,
visíveis para inspeção e edição, sem ativá-las como regras clínicas.

## Requisitos

1. Preservar as seis ligações existentes, sem apagar ou reescrever nenhuma.
2. Criar uma tabela separada para propostas, com estado PENDENTE, APROVADA ou RECUSADA.
3. Cada proposta deve guardar o eixo informado, a pergunta, a categoria, o destino real do catálogo e a justificativa textual da seleção.
4. A carga deve usar apenas perguntas e destinos existentes, ativos e vindos dos catálogos reais.
5. A carga deve ser idempotente: repetir não duplica nem reativa propostas recusadas.
6. As propostas pendentes aparecem no grafo e na sanfona com estilo e rótulo diferentes das ligações ativas.
7. Aprovar uma proposta insere a ligação na tabela operacional `sinapses_clinicas` e muda a proposta para APROVADA na mesma transação.
8. Recusar uma proposta mantém o registro para auditoria, sem inseri-la na tabela operacional.
9. A interface deve permitir gerar a carga e aprovar ou recusar cada proposta individualmente.
10. Contagens devem separar ligações ativas de propostas pendentes por categoria.
11. Não conectar perguntas de identificação pessoal, códigos ausentes ou perguntas que não correspondam ao eixo descrito.
12. Não alterar o motor, o Cockpit, prescrições, doses, vias ou cadastros de itens clínicos.

## Escopo da proposta inicial

Os eixos e códigos vêm do texto fornecido pelo Dr. Caio. A seleção dos destinos será
uma proposta baseada nos nomes e classificações já presentes no catálogo. Ela não
representa indicação clínica, não será ativada e deve ser apresentada como pendente.

Perguntas citadas que não existem no catálogo ficam fora da carga. Perguntas de
identificação pessoal, como nome e CPF, nunca recebem saídas clínicas. Perguntas
genéricas que não identificam o eixo também ficam fora, mesmo que o texto original
inclua uma faixa de códigos ampla.

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
| Execução repetida | chave única por pergunta, categoria, tipo e destino |
| Aprovação concorrente | transação; `ON CONFLICT` e atualização de estado atômicos |
| Falha no meio da aprovação | transação reverte ambas as alterações |
| Ligação errada tratada como operacional | proposta permanece fora de `sinapses_clinicas` até aprovação |
| Catálogo sem correspondência explícita | deixar sem proposta; não escolher item por aproximação ampla |

## Definição de pronto

1. A proposta fica persistida e aparece na tela como pendente, sem contar como ativa.
2. Aprovar cria uma ligação operacional e atualiza o estado da proposta uma única vez.
3. Recusar não cria ligação operacional e não apaga o registro.
4. Repetir a carga não duplica propostas nem reabre recusadas.
5. Testes com PostgreSQL descartável validam idempotência, transação e isolamento dos dados operacionais.
6. A contagem lida do banco confere com a resposta da carga.
7. A interface visual é conferida em computador e celular; se o login impedir a captura, isso fica declarado.

## Limites de homologação

A carga de propostas não equivale à aprovação clínica nem à homologação do motor.
As propostas não devem ser consumidas por qualquer fluxo clínico até aprovação humana.
