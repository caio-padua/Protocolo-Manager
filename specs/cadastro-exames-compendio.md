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

Ele esclareceu que os valores devem ser exatamente os dos documentos: se uma
faixa não tiver valores, ou contiver um ou vários valores, manter o que consta
na fonte. Não inferir limites nem corrigir sobreposições. A apresentação e a
edição literal não dependem de escolher uma faixa automática; a classificação
automática permanece indisponível onde a fonte não determina um resultado único.

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
- Em 07/11/2026 foi feita uma extração preliminar local das 115 fichas:
  575 faixas literais e 690 blocos de texto. A contagem não prova fidelidade
  completa; alguns símbolos em trechos corridos podem sair em ordem incorreta
  na extração de texto e precisam ser conferidos contra o documento.
- O extrator em `scripts/extrair-fichas-exames.py` não importa para o banco e
  exclui o cabeçalho de identificação e o quadro de coletas. Não elimina a
  necessidade de conferir a ausência de dados pessoais e de revisar o
  conteúdo antes de disponibilizá-lo.
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
- As rotas de escrita da curadoria não aplicavam a matriz de permissões no
  servidor. Foi adicionada verificação de sessão e de permissão no servidor,
  além do envio da sessão pelo componente existente. A revisão independente,
  os testes integrados e a confirmação das dependências seguem necessários.

## Estado de implementação em 07/11/2026

- Entrada do menu e estrutura inicial criadas. A seção de faixas está bloqueada
  nesta nova tela durante a validação e a importação.
- O cadastro existente envia a sessão do colaborador ao criar e atualizar.
- Extração e contagens preliminares verificadas, sem importação no banco.
- As 115 fichas coincidem com as páginas correspondentes do compêndio na
  extração dos nomes, grupos, unidades, faixas e seis blocos. As faixas dos
  três modelos coincidem com as respectivas fichas. Conferência visual e
  referência das páginas complementares continuam necessárias.
- A autorização das rotas de curadoria passou em testes isolados com sessão,
  perfis e falhas sintéticos. Ainda não comprova autorização integrada no app.
- Ao reiniciar o servidor de desenvolvimento, a rotina anterior de direção
  executou 167 inserções/atualizações; não há evidência do conteúdo anterior.
  A rotina anterior de catálogo também atualizou registros e seis conjuntos
  de cinco faixas por sexo foram inseridos. As três rotinas foram retiradas da
  inicialização para impedir novas alterações enquanto são revisadas.
- A leitura do banco de desenvolvimento encontrou três analitos com 715 cópias
  idênticas de cada faixa para cada sexo: hormônio luteinizante, testosterona
  livre calculada e testosterona biodisponível. Os registros são preservados;
  somente cópias idênticas são compactadas na leitura de zonas. O efeito sobre
  as interpretações anteriores e sobre outros fluxos permanece por investigar.
- Pendentes: extração conferida dos três documentos, referências do compêndio,
  conciliação e inclusão de exames, edição persistente dos novos campos,
  faixas transacionais e auditáveis, autorização no servidor, revisão
  independente e homologação completa. Não marcar este trabalho como concluído.

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
