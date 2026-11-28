# Auditoria móvel do Padcon Conect

## Objetivo
Inventariar e verificar as rotas do Padcon Conect em tamanhos de tela representativos de celular, corrigindo defeitos móveis comprovados sem acessar dados clínicos reais nem executar efeitos externos.

## Requisitos exatos
1. Extrair as rotas declaradas em `artifacts/padcom/src/App.tsx`, incluindo rotas filhas, rotas dinâmicas, redirecionamentos e caminhos públicos; cada rota concreta de teste deve corresponder a uma declaração rastreável.
2. Classificar cada rota como verificada, bloqueada por autenticação/dados/dependência, redirecionamento/alias, ou não aplicável, sempre com motivo e resultado observável.
3. Usar Chromium com simulação de toque nas quatro orientações de iPhone e Android e comparar a referência de desktop em 1.280 por 720 pixels. A evidência não pode ser descrita como execução no Safari ou em aparelho físico.
4. Medir em cada rota acessível: rolagem horizontal da página, rolagem vertical, conteúdo cortado, erros de execução do navegador e alvos de toque menores que 44 por 44 pixels quando forem controles interativos.
5. Isolar as chamadas de interface de programação de aplicações em respostas sintéticas; bloquear gravações, pagamentos, envio de mensagens e chamadas a serviços externos.
6. Guardar um relatório rastreável por rota, tamanho de tela, classificação, métricas, erros e referências às capturas; não guardar dados pessoais em relatório ou captura.
7. Corrigir apenas defeitos reproduzidos, em unidades pequenas e sequenciais; para cada correção, registrar impacto, falhas previstas, testes, captura antes/depois e regressão dos consumidores afetados.
8. Fazer revisão independente sequencial; se não houver revisor separado, manter o estado BLOQUEADO para homologação, sem substituir essa etapa por autorrevisão.
9. Separar a cobertura automatizada de navegador da verificação em aparelhos físicos; não afirmar compatibilidade universal de modelos ou versões.
10. Na entrada pública, exibir o acesso como “App do Cliente” e identificar o produto como “PaxMed Members”, sem alterar nomes de outras áreas clínicas.
11. No painel principal, exercitar abrir e fechar o menu no modo retrato e recolher/restaurar o menu nas larguras de paisagem e computador; medir cada alvo de toque.
12. Na tela de entrada do App do Cliente, exercitar a identificação com resposta interceptada e conteúdo de demonstração sintético; verificar as 12 abas sem enviar a requisição ao servidor.
13. Distinguir o deslocamento horizontal intencional da navegação inferior do deslocamento horizontal do corpo da página; medir ambos separadamente.
14. Os controles fixos de tema e saída no painel do cliente devem ter alvos mínimos de 44 por 44 pixels, sem cobrir o final do conteúdo.
15. A entrada pública, as instruções para clientes e a apresentação da comunicação devem chamar o produto de “App do Cliente”; “PaxMed Members” identifica o produto.

## Casos extremos e falhas previstas
| Gravidade | Causa possível | Consequência | Barreira e recuperação | Evidência necessária |
|---|---|---|---|---|
| Alta | Rota dinâmica recebe identificador inexistente | Tela vazia ou falso erro de negócio | Usar identificadores sintéticos e classificar falhas dependentes de dados | Rota concreta, resposta simulada, captura e erro do navegador |
| Alta | Resposta genérica sintética não corresponde ao formato da tela | Exceção que parece defeito de produto | Registrar caminho da solicitação e diferenciar limitação do simulador de falha reproduzível | Erro, solicitação, resposta sintética e repetição com contrato correto |
| Alta | Uma chamada escapa da simulação | Leitura ou efeito em dados reais/serviço externo | Bloquear gravações e todo destino externo; abortar teste se houver tentativa não prevista | Registro de chamadas sem destino externo bem-sucedido |
| Alta | Sessão de teste é interpretada como autenticação válida no servidor | Confusão entre teste de interface e prova de segurança | Token sintético apenas no navegador e respostas de autenticação simuladas; nunca alterar autenticação do produto | Configuração do teste e confirmação de que a API não foi chamada |
| Média | Barra do navegador real altera a área visível | Diferença entre captura e telefone | Simular alturas distintas; classificar aparelho físico como não verificado | Dimensões e modo de emulação registrados |
| Média | Overflow interno é intencional em tabela ou faixa | Falso positivo de deslocamento lateral | Distinguir rolagem da página de contêineres internos | Medidas de `scrollWidth` e `clientWidth` da página e do contêiner |
| Média | O botão de fechar fica coberto pela gaveta aberta | Menu não pode ser fechado pelo controle anunciado | Manter um botão de fechar acessível dentro da gaveta e medir alvo de 44 por 44 pixels | Captura do menu aberto, teste de fechamento e dimensões do controle |
| Alta | A rota do cliente mostra somente a identificação, sem exercitar o painel | O conteúdo que corresponde à captura do CEO fica sem verificação | Interceptar apenas a identificação de desenvolvimento com cliente sintético; manter todas as leituras sintéticas e bloqueios de gravação | Captura da entrada e das abas, dimensões, rolagem da página e da navegação |
| Média | Os controles fixos de tema e saída são menores que 44 por 44 pixels | Ações importantes ficam difíceis de tocar em telas pequenas | Ampliar os alvos e reservar a altura adicional no conteúdo principal | Medidas dos dois botões e captura do final da tela |
| Média | Rota faz redirecionamento ou depende de código temporário | Screenshot incorreto ou dado exposto | Não inventar tokens; marcar como bloqueada, ou usar token inválido sintético com resposta simulada | Cadeia de navegação e classificação |
| Baixa | Primeiro carregamento do servidor é lento | Timeout falso | Uma execução sequencial com limite por rota e registro de tempo | Tempo de navegação e motivo do timeout |

## Definição de PRONTO
- Todas as declarações de rota do arquivo de rotas aparecem no inventário, inclusive aliases e padrões dinâmicos, com exclusões explicadas.
- Cada rota concreta recebe resultado por cada viewport selecionado; não há célula de cobertura vazia.
- Testes acessíveis não produzem overflow horizontal inesperado, erro de execução não classificado nem falha visual sem registro.
- Tentativas de escrita e comunicações externas são bloqueadas; nenhum dado real é persistido ou transmitido.
- Cada correção aprovada tem captura de tela e regressão pertinente.
- O menu móvel abre e fecha pelo controle visível; os controles de navegação exercitados medem pelo menos 44 por 44 pixels.
- A tela inicial do App do Cliente e cada aba do painel sintético são examinadas nos cinco tamanhos; a rolagem da página é distinguida da barra inferior.
- Os controles fixos de tema e saída do painel sintético medem pelo menos 44 por 44 pixels e não ocultam o fim do conteúdo.
- A entrada pública e as instruções visíveis ao cliente usam “App do Cliente”; a apresentação pública mantém “PaxMed Members”.
- A revisão independente foi concluída; sem ela, o resultado permanece BLOQUEADO, ainda que as medições automatizadas passem.
- A resposta final discrimina testes simulados, rotas bloqueadas e testes físicos não realizados.

## Linhas vermelhas
- Não publicar, não enviar mensagens reais, não realizar cobranças e não chamar modelos de inteligência artificial pagos.
- Não usar nem copiar dados clínicos reais; não enfraquecer autenticação ou autorização.
- Não alterar motor clínico, cálculos, contratos de gravação ou banco de dados para corrigir apresentação.
- Não executar processos permanentemente ligados nem criar infraestrutura com custo contínuo.
- Não declarar auditoria integral com rotas ou estados não classificados.

## Evidência de base
- `artifacts/padcom/src/App.tsx` contém 151 elementos `<Route>`: 146 com atributo `path`, quatro fallbacks `NotFound` e um contêiner sem caminho; o elemento `<Router>` não é contado como rota.
- `playwright.config.ts` configura Chromium para a suíte de ponta a ponta.
- `artifacts/padcom/src/index.css` contém uma regra global que bloqueia o excesso lateral da página; ela será verificada antes de qualquer mudança global.

## Resultado e estado de homologação
- A matriz-base registrou as 151 entradas em cinco tamanhos, totalizando 755 observações; a classificação por tamanho está no relatório final em `generated-artifacts/mobile-audit/relatorio-final.md`.
- A tela `/area` teve as 12 abas exercitadas nos cinco tamanhos, totalizando 60 estados adicionais; a entrada e as leituras usaram respostas sintéticas no navegador.
- A página não apresentou excesso horizontal nas 755 observações-base nem nas abas da área do cliente; o deslocamento horizontal do menu inferior é intencional e não move a página.
- A rolagem vertical foi confirmada em conteúdo sintético longo nos quatro tamanhos móveis; os controles fixos de tema e saída mediram 44 por 44 pixels.
- A compilação de produção e os lotes de regressão das telas alteradas terminaram com sucesso; os relatórios e capturas foram guardados sob `generated-artifacts/mobile-audit/`.
- **Estado: BLOQUEADO PARA HOMOLOGAÇÃO.** A revisão independente obrigatória não está disponível neste ambiente; iPhone Safari e Android Chrome em aparelhos físicos, além de uma sessão real autenticada, não foram testados.

## Etapas
1. Consolidar o inventário de rotas e classificar autenticação, caminhos dinâmicos, redirecionamentos e dependências.
2. Construir uma execução finita e isolada que percorra o inventário em lotes, registre métricas e capturas, e bloqueie efeitos externos.
3. Executar os tamanhos de tela escolhidos em todas as rotas classificáveis; revisar individualmente os falsos positivos e as rotas bloqueadas.
4. Corrigir defeitos reproduzidos, um grupo por vez, e executar regressão visual e funcional no mesmo grupo e nos componentes compartilhados afetados.
5. Suspender a implementação e solicitar revisão independente; registrar e corrigir todas as lacunas apontadas.
6. Reexecutar a cobertura e produzir relatório final com evidências, limitações e estado de homologação.
