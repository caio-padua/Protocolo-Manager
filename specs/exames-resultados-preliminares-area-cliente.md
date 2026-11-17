# Resultados preliminares na Área do Cliente

## 1. Objetivo

Adicionar, em **Cadastros → Configuração de Exames**, uma opção independente chamada **Exibir resultados preliminares na Área do Cliente**.

O padrão é desligado. Desligado, a Área do Cliente mantém a regra atual e exibe somente documentos `conferido` (C2). Ligado, pode exibir resultados persistidos de documentos `recebido` (IA) e `conferido_1` (C1), desde que identidade, cliente e clínica estejam confirmados.

## 2. Baseline verificado antes da implementação

1. A tela existente é `artifacts/padcom/src/pages/cadastros/config-exames.tsx`. Ela já contém o interruptor de conferência humana.
2. O `PUT /settings/exames` já exige colaborador e proprietário global; as opções existentes são globais em `app_settings`.
3. O portal identifica o cliente pelo token e obtém a clínica do cadastro ativo; a rota atual da evolução é estrita a C2.
4. `montarEvolucao` junta resultados ao documento e, hoje, calcula cinco faixas e tendência sobre todas as linhas que o chamador autoriza.
5. O porteiro de identidade registra `verificacao/confirmada` antes da incorporação; documentos em quarentena não recebem resultados pela cadeia normal.
6. O relatório clínico interno já recusa emissão final com resultados sem conferência; uma prévia requer ação interna explícita. O novo interruptor não deve alterar esse fluxo.

## 3. Regras que não podem mudar

1. Não alterar o interruptor existente `exigirValidacaoHumana`, suas permissões, padrão, persistência ou efeito na equipe.
2. Não alterar estados nem regras de C1, C2, quarentena ou liberação clínica.
3. Não transformar resultados preliminares em resultados conferidos, prescrições ou interpretação clínica automática.
4. Não expor preliminares em PDF final, relatório clínico definitivo, download de cliente ou outro endpoint.
5. Não criar interruptor na tela `/exames-cliente`; haverá uma única opção na configuração existente.
6. Não enviar dados clínicos, identificadores de clientes ou documentos para a trilha de auditoria.

## 4. Contrato de leitura e segurança

1. O valor é independente por clínica, salvo em chave própria e com padrão seguro `false`.
2. A clínica usada para ler e gravar vem do contexto autenticado do servidor; `empresaId` enviado pelo navegador é ignorado.
3. A alteração permanece restrita a proprietário global/CEO, com registro de clínica, autor, opção e valores anterior/novo.
4. No modo novo, tanto as linhas C2 existentes quanto as preliminares precisam pertencer ao mesmo cliente e à mesma clínica do token autenticado.
5. O modo preliminar só aceita linhas persistidas com valor presente, documento nos estados `recebido` ou `conferido_1`, clínica e cliente coincidentes, e prova de identidade confirmada automaticamente (`verificacao/confirmada`) ou liberada por decisão humana registrada (`liberacao_humana`) para aquele documento.
6. Linhas marcadas `conferencia` (sem conversão reconhecida) não aparecem como preliminares.
7. Excluem-se quarentena, identidade rejeitada, erro, ignorado, processamento, resultados pendentes, documento de outro cliente ou clínica e identidade não confirmada.
8. C2 conserva precedência sobre C1/IA quando documentos da mesma data e laboratório formarem a mesma coluna; não misturar estados diferentes na coluna existente.
9. A Área do Cliente recebe o dado somente pela rota autenticada do token. Desligado, a consulta permanece estrita a C2.

## 5. Apresentação

1. Colunas IA e C1 exibem aviso persistente **PRELIMINAR — NÃO CONFERIDO PELO MÉDICO**, com a data e o estágio corretos.
2. Valores preliminares são apresentados sem classificação por faixa, cor clínica, tendência ou gráfico; colunas C2 mantêm a apresentação atual.
3. A planilha mantém suas colunas aprovadas; o indicador fica dentro do cabeçalho existente.
4. A mensagem explica que o conteúdo é informativo e não substitui conferência médica.

## 6. Matriz de falhas previstas

| Cenário | Resultado obrigatório |
|---|---|
| Configuração ausente, inválida ou clínica não resolvida | Preliminares não aparecem; C2 segue disponível conforme regra atual |
| Usuário sem sessão ou sem papel de proprietário tenta gravar | Resposta 401/403; nenhuma configuração alterada |
| Navegador envia clínica diferente | A clínica do contexto autenticado prevalece; nenhuma gravação cruzada |
| Identidade ausente, divergente ou em revisão | Resultados preliminares não aparecem |
| Documento em quarentena, erro, ignorado ou processamento | Não aparece na evolução |
| Resultado sem valor ou com estado `conferencia` | Não aparece como preliminar |
| C1/IA e C2 caem na mesma coluna de data/laboratório | C2 prevalece; não misturar valores com rótulo incorreto |
| Interruptor humano existente é desligado | Nenhuma ampliação no portal sem o novo interruptor ligado |
| Novo interruptor é ligado | Nenhuma mudança no PDF/DEEx final ou nos fluxos clínicos |
| Gravação da configuração ou auditoria falha | Transação não deve deixar alteração sem trilha |

## 7. Testes sintéticos e conclusão

1. Testar padrão desligado, ligado, alternância independente do interruptor de conferência humana e isolamento entre duas clínicas.
2. Testar C2, C1 e IA; nome/CPF divergentes representados por identidade não confirmada; quarentena; resultados sem valor ou sem conversão; cliente e clínica diferentes.
3. Testar 401/403, tentativa de adulterar `empresaId`, trilha de auditoria transacional e ausência de dados pessoais nela.
4. Testar que a rota e o PDF/DEEx final existentes continuam sem aceitar a nova configuração como autorização clínica.
5. Verificar a interface em largura móvel e desktop, incluindo o aviso e o estado de cada coluna.
6. Concluir somente após testes direcionados, checagem de tipos, reinício dos serviços envolvidos, inspeção dos logs e revisão final do diff.

## 8. Estado atual do ciclo

1. Implementação e testes direcionados estão no código; ainda não declarar homologado.
2. Verificações executadas: 27 testes direcionados passaram; compilação e verificação de tipos da API passaram.
3. A compilação da interface passou, mas sua verificação completa de tipos ainda aponta erros preexistentes em outros módulos; nenhum deles é nos arquivos desta alteração.
4. Os dois serviços reiniciaram. A captura da rota de configuração mostrou a tela de acesso, pois a captura não tem sessão autenticada; não foi feito desvio de autenticação.
5. Revisão independente exigida pelo PAXTER Loop está BLOQUEADA porque o revisor separado não está disponível neste ambiente. A implementação permanece EM REVISAO, não HOMOLOGADA, até essa revisão e a verificação visual autenticada.
