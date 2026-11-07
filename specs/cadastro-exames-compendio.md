# Cadastro de exames — compêndio do Instituto Pádua

## Objetivo

Reunir o cadastro e a curadoria dos exames em uma entrada do menu, com edição
das informações clínicas e das cinco faixas fornecidas pelo Dr. Caio, preservando
o cadastro existente, as fontes e a segurança da interpretação.

## Decisão informada

Em 07/11/2026, o Dr. Caio informou que revisou os critérios e faixas dos
documentos segundo seus próprios preceitos e estudos. Não substituir seus
critérios por faixas presumidas de terceiros. Distinguir metas institucionais
do intervalo de referência do laboratório e de metas individuais.

## Requisitos

1. Menu lateral “Cadastro de Exames” e tela responsiva no padrão visual Paxter,
   com referência às telas “Fórmulas & Substâncias” e “Corpo Clínico”.
2. Listar, buscar, filtrar por categoria, criar e editar exames; preservar a
   navegação e funcionalidades já existentes de blocos e curadoria.
3. Cada exame deve expor os seis campos explicativos, grupo, unidade e as
   cinco faixas contidas na fonte, com edição persistente e referência à origem.
4. Conciliar cada item das fontes com os cadastros existentes antes de criar
   registros; não fundir exames distintos por semelhança textual. A entrada
   repetida de magnésio pertence a mais de um grupo e não deve ser duplicada
   como analito sem verificar sua identidade.
5. Usar os dados de demonstração das fontes somente como demonstração: não
   gravar os exemplos de pessoas, coletas e metas no prontuário de clientes.
6. Preservar literalmente a informação cujo significado numérico não possa ser
   representado com segurança. Mostrar pendência e evitar classificação
   automática para lacunas, conflitos, fronteiras ambíguas e exames qualitativos.
7. Não sobrescrever silenciosamente edições existentes; qualquer atualização de
   faixas deve ser auditável e transacional, com autorização apropriada.
8. As alterações não podem modificar o motor de orçamento ou apagar clientes,
   laudos, resultados, vínculos, intervalos existentes ou histórico.
9. Os novos campos devem sobreviver a salvamento, recarga e reinício, sem
   materialização automática sobrescrever edições humanas.

## Inventário e impacto inicial

- As fichas possuem 115 páginas; o compêndio editorial possui 333 páginas;
  o terceiro documento possui três modelos de demonstração.
- Já há dois domínios distintos: cadastro de exames e catálogo de analitos;
  há editor de faixas no Console de Exames e consumidores na evolução clínica.
- O classificador atual trata a maioria das faixas como limite inferior
  inclusivo e superior exclusivo. Isso não representa automaticamente todas
  as anotações dos documentos, como “maior que” e “até”.
- O documento de fichas contém oito páginas nas quais aparecem marcadores
  “Faixa 1” a “Faixa 5”, e não cinco valores numéricos: páginas 4, 10, 11, 12,
  39, 47, 97 e 98. Alguns são exames compostos ou qualitativos.
- O magnésio sérico consta nas páginas 52 e 94, em grupos diferentes, com uma
  faixa exibida como “2,4–2,4”. Não supor que seja um erro nem inventar casas
  decimais: a intenção e o comportamento no limite precisam ser explicitados.
- O compêndio contém aprofundamentos e referências além da primeira ficha;
  importá-los exige conferência de integridade por página, não truncar o texto.

## Falhas previstas e barreiras

| Risco | Consequência | Barreira e evidência necessária |
|---|---|---|
| Interpretar o mesmo limite em duas faixas | Classificação contraditória | Representar inclusividade ou bloquear classificação não determinística; testar limites exatos. |
| Fabricar valores ausentes | Falsa informação clínica | Guardar texto original, marcar ausência e não criar valores numéricos. |
| Transformar modelos em dados de cliente | Contaminação do prontuário | Não importar nome ou coletas demonstrativas; teste de isolamento. |
| Casar nomes parecidos indevidamente | Dados e exames misturados | Identidade explícita, reconciliação de sinônimos e conferência de variantes. |
| Substituir faixas existentes parcialmente | Perda de configuração ou resultado incorreto | Transação, histórico e testes de falha e concorrência. |
| Faixas distintas por sexo, idade ou método | Interpretação inadequada | Manter dimensões e não tratar uma meta como universal. |
| Salvar só na interface | Edição se perde na recarga | Verificar a persistência real e as permissões no servidor. |
| Gravar texto demonstrativo como referência clínica | Conteúdo incorreto no cadastro | Separar metadados, explicações e exemplos pessoais; verificar a procedência. |

## Pronto

Cada requisito deve ser verificado por testes isolados, execução real, prova de
persistência, revisão independente e capturas de tela em computador e celular.
Casos sem representação clínica inequívoca devem aparecer como pendentes, não
como classificados ou homologados.
