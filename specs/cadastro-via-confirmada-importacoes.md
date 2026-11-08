# Via clínica confirmada e importações de catálogo

## Objetivo

Preservar uma via clínica confirmada pelo médico nas fontes e no cadastro
operacional, impedindo que uma importação automática reverta a confirmação.

## Requisitos

1. A correção expressamente autorizada para a PQQ é intramuscular, sem
   modificar a dose, o preço, os protocolos, as aplicações ou o histórico.
2. Corrigir os três registros existentes ligados pelo código de catálogo,
   sem identificar o medicamento por nome ou fixar sua dose no programa.
3. Registrar na auditoria o executor, o profissional autorizador e os valores
   anteriores, sem atribuir falsamente a execução ao profissional.
4. A via confirmada em cada fonte deve sobreviver a nova transmutação e
   reimportação; campos não confirmados continuam seguindo a fonte externa.
5. Os gravadores de catálogo e a correção administrativa devem se coordenar
   para não gravar sobre uma leitura anterior à confirmação.
6. A operação administrativa aceita apenas a via intramuscular autorizada e
   deve recusar ambiente publicado, banco diferente do desenvolvimento,
   profissional que não seja médico proprietário ativo da empresa, códigos
   ambíguos, valores anteriores diferentes e alterações parciais.
7. Nenhum medicamento, protocolo ou evento deve ser criado ou apagado.
8. A importação interrompe possíveis mudanças de identidade, duplicação por
   outro identificador ou remapeamento de código de produto revisado.
9. A transmutação usa uma origem completa: antes de gravar, exige que cada
   item revisado conserve seu código e que cada injetável revisado conserve
   seu identificador de origem e seus dados de identificação clínica.
   Exportações parciais que omitirem esses registros são recusadas.
10. Uma edição no cadastro operacional não pode mudar o tipo de procedimento
    para uma via incompatível com a confirmação clínica existente.

## Falhas previstas e barreiras

| Falha | Consequência | Barreira e prova |
|---|---|---|
| Fonte externa antiga | A via incorreta retorna | Preservar somente via marcada como revisada; testar reimportação. |
| Importação concorrente | Uma leitura antiga substitui a confirmação | Trava de transação compartilhada e releitura após a trava. |
| Medicamento ou médico errado | Correção clínica indevida | Verificar identidade, código, unicidade e valores anteriores. |
| Interrupção na gravação | Fontes ficam divergentes | Atualização e auditoria na mesma transação; testar falha. |
| Banco ou ambiente errado | Alteração fora do desenvolvimento | Comparar identificação independente do banco e bloquear publicação. |

## Definição de pronto

Revisão independente aprovada; migração aditiva testada em banco isolado;
testes de importação, concorrência, recusa e reversão aprovados; correção
autorizada aplicada uma vez no desenvolvimento e confirmada por releitura.
Isto não homologa a jornada de agendamento, nem autoriza emissão ou envio.

## Evidência de 08/11/2026

- A fonte de catálogo completa foi lida pela conexão autenticada existente.
  Sua identificação, apresentação e dose correspondiam aos três registros
  do desenvolvimento; a via anterior era divergente da orientação médica.
- Trinta e cinco testes passaram em quatro conjuntos, incluindo a execução
  da transmutação e do importador em banco descartável com a cópia integral
  do catálogo obtido, edições autenticadas, concorrência, recusa e reversão.
- A revisão independente aprovou a operação local condicionada à conferência
  do banco, da autoridade e dos valores, feita antes da gravação.
- A migração aditiva e uma única confirmação foram aplicadas somente no
  desenvolvimento. A releitura mostrou via intramuscular nas três fontes,
  dose e preços anteriores preservados e auditoria da operação.
- As edições normais do tipo de procedimento recusam uma classificação que
  contrarie a via revisada; a confirmação e a edição usam a mesma trava.
- O servidor reiniciado respondeu na verificação de saúde. A origem pública
  padrão de transmutação respondeu 404; a leitura autenticada não muda a
  implementação que o sistema usa para buscar essa origem. Portanto, a
  transmutação padrão continua sem comprovação de funcionamento.
