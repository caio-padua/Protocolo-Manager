# Auditoria móvel do Padcon Conect

## Objetivo
Inventariar e verificar as rotas do Padcon Conect em tamanhos de tela representativos de celular, corrigindo defeitos móveis comprovados sem acessar dados clínicos reais nem executar efeitos externos.

## Requisitos exatos
1. Extrair as rotas declaradas em `artifacts/padcom/src/App.tsx`, incluindo rotas filhas, rotas dinâmicas, redirecionamentos e caminhos públicos; cada rota concreta de teste deve corresponder a uma declaração rastreável.
2. Classificar cada rota como verificada, bloqueada por autenticação/dados/dependência, redirecionamento/alias, ou não aplicável, sempre com motivo e resultado observável.
3. Usar Chromium com simulação de toque e dimensões representativas de iPhone e Android. A evidência não pode ser descrita como execução no Safari ou em aparelho físico.
4. Medir em cada rota acessível: rolagem horizontal da página, rolagem vertical, conteúdo cortado, erros de execução do navegador e alvos de toque menores que 44 por 44 pixels quando forem controles interativos.
5. Isolar as chamadas de interface de programação de aplicações em respostas sintéticas; bloquear gravações, pagamentos, envio de mensagens e chamadas a serviços externos.
6. Guardar um relatório rastreável por rota, tamanho de tela, classificação, métricas, erros e referências às capturas; não guardar dados pessoais em relatório ou captura.
7. Corrigir apenas defeitos reproduzidos, em unidades pequenas e sequenciais; para cada correção, registrar impacto, falhas previstas, testes, captura antes/depois e regressão dos consumidores afetados.
8. Fazer revisão independente sequencial; se não houver revisor separado, manter o estado BLOQUEADO para homologação, sem substituir essa etapa por autorrevisão.
9. Separar a cobertura automatizada de navegador da verificação em aparelhos físicos; não afirmar compatibilidade universal de modelos ou versões.

## Casos extremos e falhas previstas
| Gravidade | Causa possível | Consequência | Barreira e recuperação | Evidência necessária |
|---|---|---|---|---|
| Alta | Rota dinâmica recebe identificador inexistente | Tela vazia ou falso erro de negócio | Usar identificadores sintéticos e classificar falhas dependentes de dados | Rota concreta, resposta simulada, captura e erro do navegador |
| Alta | Resposta genérica sintética não corresponde ao formato da tela | Exceção que parece defeito de produto | Registrar caminho da solicitação e diferenciar limitação do simulador de falha reproduzível | Erro, solicitação, resposta sintética e repetição com contrato correto |
| Alta | Uma chamada escapa da simulação | Leitura ou efeito em dados reais/serviço externo | Bloquear gravações e todo destino externo; abortar teste se houver tentativa não prevista | Registro de chamadas sem destino externo bem-sucedido |
| Alta | Sessão de teste é interpretada como autenticação válida no servidor | Confusão entre teste de interface e prova de segurança | Token sintético apenas no navegador e respostas de autenticação simuladas; nunca alterar autenticação do produto | Configuração do teste e confirmação de que a API não foi chamada |
| Média | Barra do navegador real altera a área visível | Diferença entre captura e telefone | Simular alturas distintas; classificar aparelho físico como não verificado | Dimensões e modo de emulação registrados |
| Média | Overflow interno é intencional em tabela ou faixa | Falso positivo de deslocamento lateral | Distinguir rolagem da página de contêineres internos | Medidas de `scrollWidth` e `clientWidth` da página e do contêiner |
| Média | Rota faz redirecionamento ou depende de código temporário | Screenshot incorreto ou dado exposto | Não inventar tokens; marcar como bloqueada, ou usar token inválido sintético com resposta simulada | Cadeia de navegação e classificação |
| Baixa | Primeiro carregamento do servidor é lento | Timeout falso | Uma execução sequencial com limite por rota e registro de tempo | Tempo de navegação e motivo do timeout |

## Definição de PRONTO
- Todas as declarações de rota do arquivo de rotas aparecem no inventário, inclusive aliases e padrões dinâmicos, com exclusões explicadas.
- Cada rota concreta recebe resultado por cada viewport selecionado; não há célula de cobertura vazia.
- Testes acessíveis não produzem overflow horizontal inesperado, erro de execução não classificado nem falha visual sem registro.
- Tentativas de escrita e comunicações externas são bloqueadas; nenhum dado real é persistido ou transmitido.
- Cada correção aprovada tem captura de tela e regressão pertinente.
- A revisão independente foi concluída; sem ela, o resultado permanece BLOQUEADO, ainda que as medições automatizadas passem.
- A resposta final discrimina testes simulados, rotas bloqueadas e testes físicos não realizados.

## Linhas vermelhas
- Não publicar, não enviar mensagens reais, não realizar cobranças e não chamar modelos de inteligência artificial pagos.
- Não usar nem copiar dados clínicos reais; não enfraquecer autenticação ou autorização.
- Não alterar motor clínico, cálculos, contratos de gravação ou banco de dados para corrigir apresentação.
- Não executar processos permanentemente ligados nem criar infraestrutura com custo contínuo.
- Não declarar auditoria integral com rotas ou estados não classificados.

## Evidência de base
- `artifacts/padcom/src/App.tsx` contém 152 declarações de componente de rota e 146 declarações com atributo `path`; essa contagem é apenas o ponto de partida e deverá ser reconciliada com rotas aninhadas, padrões e aliases.
- `playwright.config.ts` configura Chromium para a suíte de ponta a ponta.
- `artifacts/padcom/src/index.css` contém uma regra global que bloqueia o excesso lateral da página; ela será verificada antes de qualquer mudança global.

## Etapas
1. Consolidar o inventário de rotas e classificar autenticação, caminhos dinâmicos, redirecionamentos e dependências.
2. Construir uma execução finita e isolada que percorra o inventário em lotes, registre métricas e capturas, e bloqueie efeitos externos.
3. Executar os tamanhos de tela escolhidos em todas as rotas classificáveis; revisar individualmente os falsos positivos e as rotas bloqueadas.
4. Corrigir defeitos reproduzidos, um grupo por vez, e executar regressão visual e funcional no mesmo grupo e nos componentes compartilhados afetados.
5. Suspender a implementação e solicitar revisão independente; registrar e corrigir todas as lacunas apontadas.
6. Reexecutar a cobertura e produzir relatório final com evidências, limitações e estado de homologação.
