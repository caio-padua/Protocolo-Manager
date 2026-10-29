# Dr. Chat e equipe — pedidos em lote, historico e caminho para operacao

Data: 29/10/2026.
Autor: Dr. Replit PAXTER.
Destino: Dr. Caio, Dr. Chat, Dr. Manus, Dr. Claude e Dr. Code.
Estado: implementado e verificado parcialmente em desenvolvimento; NAO e liberacao clinica.

## 1. Conclusao

Concordo com a proposta de concluir o Cockpit existente em vez de criar outra central.
O cliente deve ser escolhido uma vez por janela.
A clinica e o profissional autorizado devem vir do acesso autenticado, nunca de um nome fixo.
Cliente, atendimento e clinica sao identidades diferentes.
Uma rota com identificador de cliente nao autoriza acesso a seus documentos.

Nesta entrega executei primeiro a jornada de pedidos de exames.
Nao iniciei outros agentes ou trabalhos de inteligencia artificial.
Tarefas de outros agentes que ja existiam no projeto nao equivalem a trabalhos iniciados nesta rodada.

## 2. O que a auditoria encontrou

| Necessidade | Fonte observada | Situacao |
|---|---|---|
| Cliente permanece entre ferramentas | CockpitContent recebe clientId e o repassa aos paineis | Reutilizado; nao criei outro Cockpit |
| Medico automatico em receitas e pedidos | useClinicalIdentity e resolveClinicalEmitter | Implementacao anterior reaproveitada |
| Varias caixinhas de exames e emissao em lote | PedidosExamesPanel e exam-requests | Ja existiam; nao atribuir sua criacao a esta entrega |
| Abrir atestados e encaminhamentos na jornada | DocumentosCockpitPanel inclui DocumentosPanel | Ja existem |
| Medico correto em atestados e encaminhamentos | DocumentosPanel ainda usa seletor local e PROF_DEFAULT | Bloqueio para considerar esses documentos homologados |
| Telegram em pedidos | Ausente no painel anterior | Ligado nesta entrega ao motor de mensagens existente |
| Historico acessivel de pedidos | Arquivos ja eram preservados em exam_request_pdfs | Consulta paginada e abertura implementadas |
| Historico de envios desses pedidos | Auditoria existente reutilizavel | Registro e consulta de tentativas/resultados implementados |

Os nomes de exames cardiologicos solicitados pelo proprietario estao presentes no catalogo consultado.
Ha variantes e nomes repetidos, como Holter e Mapa com grafias diferentes.
Nao dedupliquei, exclui ou declarei equivalencia clinica entre esses cadastros.
O medico continua escolhendo os itens e conferindo os documentos.

## 3. Jornada implementada

1. Abrir o cliente no Cockpit e entrar na aba Exames.
2. Usar o filtro "Mostrar exames cardiologicos", se desejado.
3. Marcar os exames indicados, um a um.
4. Manter "Gerar um documento por exame, todos na mesma acao" ou desmarcar para preservar agrupamento por tipo.
5. Clicar em "Gerar pedidos de exames".
6. Abrir os arquivos gerados e conferir.
7. Selecionar documentos no historico, inclusive documentos de visitas anteriores.
8. Marcar e-mail, WhatsApp, Telegram ou combinacoes.
9. Conferir os destinos disponiveis e marcar a autorizacao explicita.
10. Clicar em "Confirmar envio".
11. Consultar resultado por canal e os ultimos vinte registros de envio.

Geracao e envio sao acoes separadas nessa interface.
Reenviar um documento existente nao invoca novamente o gerador de arquivos.
Aceite pelo provedor NAO e apresentado como comprovante de entrega ao destinatario.
Simulacao NAO e apresentada como envio verdadeiro.

## 4. Detalhes de implementacao

### 4.1 Interface

- artifacts/padcom/src/pages/cockpit/panels/PedidosExamesPanel.tsx
- artifacts/padcom/src/pages/cockpit/panels/ExamRequestHistoryPanel.tsx

O filtro considera nomes, grupo, subgrupo e modalidade do catalogo existente.
A busca passou a ignorar diferencas de acentuacao.
Nenhum exame foi criado ou selecionado automaticamente pelo filtro.
O cliente e o profissional permanecem no contexto do painel existente.
O historico usa chaves de consulta que incluem cliente e profissional.
O painel de historico e remontado quando essas identidades mudam.
O historico nao aparece sem a identidade autorizada carregada.
Respostas de emissao de outro cliente nao preenchem o painel atual.
Campos e tabelas reutilizam paineis salientes e concavos da linguagem visual existente.
Documentos abrem em nova aba, sem impor download na interface.

Isso nao resolve sozinho a preservacao geral de rascunhos ao alternar modulos.
O Cockpit ainda precisa de uma politica uniforme de rascunhos por usuario, clinica, cliente, modulo e atendimento.
Nao foi colocado conteudo clinico em armazenamento local persistente.

### 4.2 Servidor

- artifacts/api-server/src/routes/exam-requests.ts
- artifacts/api-server/src/routes/exam-request-dispatch.ts

POST /api/exam-requests/emit aceita individualDocuments, falso por padrao para preservar chamadores anteriores.
A interface alterada envia esse campo como verdadeiro por padrao e envia sendEmail=false e sendWhatsapp=false.
O numero de itens por requisicao foi limitado a cem.
Exames de imagem continuam separados, mesmo no agrupamento legado.
A data de emissao passou a usar a fonte centralizada de horario de Brasilia.

GET /api/exam-requests/:clientId/history?offset=0:
- exige acesso de colaborador;
- resolve o vinculo clinico autorizado antes da consulta;
- retorna vinte documentos por pagina e nextOffset;
- ordena por data e identificador decrescentes;
- nao inclui os bytes dos arquivos na listagem;
- retorna tambem os ultimos vinte registros de envio do cliente e empresa autorizados;
- envia Cache-Control: no-store;
- erro de acesso ou consulta nao e convertido em historico vazio.

POST /api/exam-requests/send:

```json
{
  "clientId": 101,
  "documentIds": [91, 92],
  "channels": ["EMAIL", "WHATSAPP", "TELEGRAM"],
  "confirmed": true
}
```

Os numeros do exemplo sao sinteticos, nao identificam atendimento real.
O servidor verifica os documentos pelo cliente autorizado, nao apenas por seus identificadores.
Os destinos sao lidos do cadastro validado; nao aceita endereco alternativo nesse contrato.
Se faltar destino de qualquer canal marcado, rejeita antes de iniciar todos os envios.
Registra as intencoes na auditoria antes de contatar provedores.
Reutiliza enviarMensagemPaxter, sem criar outro motor de mensagens.
Mensagens longas sao divididas para preservar links completos dentro dos limites de legenda dos canais.
O arquivo anexado ao e-mail continua sendo o documento previamente preservado.
Resultados e quantidades de mensagens aceitas sao registrados por canal.
Falha parcial ou resultado desconhecido exige conferencia antes de repetir.
Os registros de auditoria nao recebem texto clinico completo, bytes dos arquivos nem enderecos de destinatarios.

Nao adicionei tabelas ou migracoes de banco.
Os arquivos continuam no armazenamento legado existente; nenhuma substituicao de banco ou armazenamento foi realizada.
Reiniciar o servidor executa as rotinas de inicializacao ja existentes do projeto.

### 4.3 Contratos

lib/api-spec/openapi.yaml e a especificacao da interface de programacao de aplicacoes.
Os novos contratos de historico e envio foram escritos nessa fonte antes da geracao dos validadores e tipos.
Os arquivos gerados estao em lib/api-client-react/src/generated e lib/api-zod/src/generated.
O servidor usa o validador gerado SendExamRequestDocumentsBody.
A colisao conhecida do exportador de tipos foi evitada ao preservar o contrato existente do indice de api-zod.

## 5. Evidencias e limites

| Verificacao | Resultado |
|---|---|
| Compilacao de tipos das bibliotecas compartilhadas | Aprovada |
| Cinco arquivos de testes isolados selecionados | Setenta testes aprovados |
| Testes novos da jornada de exames | Quatorze cenarios |
| Compilacao da interface final | Aprovada, com avisos de tamanho de pacote e avisos anteriores em preview-validacao |
| Inicio do servidor apos a alteracao | Servindo na porta configurada, sem erro de porta ocupada |
| Inicio da interface apos a alteracao | Servindo na porta configurada |
| Consulta real anonima de historico | 401, acesso recusado |
| Envio real anonimo para a nova rota | 401, acesso recusado |
| Consulta real anonima de identidade clinica | 401, acesso recusado |
| Captura visual no Cockpit sem acesso | Painel carrega; identidade e emissao permanecem bloqueadas |
| Interface autenticada completa | NAO verificada nesta rodada |
| Envio real aos tres provedores | NAO realizado |
| Documento real de cliente, assinatura ou cobranca de teste | NAO realizado |
| Verificacao global de tipos do servidor | Nao aprovada: 205 erros relatados, sem apontamento nos arquivos de exames alterados |

Os testes usam banco, gerador e provedores simulados, com dados sinteticos.
Esses testes demonstram contratos e protecoes verificadas, nao uma assinatura digital valida nem entrega real.
Foram cobertos acesso anonimo, clinica nao autorizada, confirmacao falsa/ausente, documento indisponivel, destino faltante, auditoria indisponivel, simulacao, falha independente de canal, paginacao, consulta de auditoria, links longos e geracao individual em lote.

Comando reproduzivel:

```bash
pnpm -w run typecheck:libs
pnpm --filter @workspace/api-server exec vitest run \
  src/tests/exam-workspace.test.ts \
  src/tests/clinical-emitter.test.ts \
  src/tests/clinical-prescription-routes.test.ts \
  src/tests/clinical-legacy-routes.test.ts \
  src/tests/prescription-client.test.ts --reporter=dot
pnpm --filter @workspace/padcom run build
```

Nao executar indiscriminadamente toda a suite: ha testes antigos com efeitos no banco real.

## 6. Proximas entregas, em sequencia

| Ordem | Entrega | Criterio de conclusao |
|---|---|---|
| Primeira | Pedidos em lote e historico | Esta implementacao, seguida de conferencia autenticada e homologacao controlada |
| Segunda | Atestados e encaminhamentos | Remover autoridade de medico fixo; autorizar emissor no servidor e testar arquivos e historico |
| Terceira | Receitas e assinatura | Conferir a entrega de assinatura ja existente no projeto, certificado por medico, integridade e ausencia de envios implicitos |
| Quarta | Continuidade do atendimento | Rascunhos protegidos, troca de cliente e duas janelas independentes |
| Quinta | Recebimento e evolucao de exames | Vinculo seguro, processamento, conferencia humana e retorno ao cliente correto |
| Sexta | Liberacao supervisionada | Ambiente definitivo decidido, configuracao segura e teste clinico autorizado ao lado do Support Health |

Nao iniciar nova expansao comercial ou vinte e oito inovacoes antes dos criterios minimos de uso clinico.
O status de uma tarefa como implementada nao substitui revisar o codigo integrado e suas evidencias.
As vitrines e o site Parxis apresentaram conflitos de porta nos registros; permanecem pendencias fora desta alteracao clinica.
O servidor de desenvolvimento avisou ausencia da chave dedicada de criptografia; isso precisa ser resolvido na preparacao do ambiente definitivo.
Esta entrega nao decidiu hospedagem nem publicou producao.

## 7. Melhorias adicionais propostas para discussao

1. Conjuntos pessoais de exames, montados e salvos pelo proprio medico, sem recomendacao automatica.
2. Chave de operacao que impeça envios duplicados por repeticao ou duas janelas simultaneas.
3. Linha do tempo unica com receita, pedido, atestado, encaminhamento e resultados, preservando o arquivo de cada emissao.
4. Revisao final unica que mostre cliente, profissional, documentos, assinatura e destinos antes da autorizacao.
5. Tentativas posteriores somente para o canal ou parte que falhou, sem regenerar documentos nem repetir os canais ja aceitos.

Esses itens nao devem ser apresentados como ja implementados.
Hoje o botao bloqueia repeticao enquanto o envio esta em andamento na mesma instancia, mas ainda nao ha garantia de nao duplicacao entre requisicoes independentes.

## 8. Pedido de revisao independente

Dr. Chat, revise o codigo publicado, nao somente esta carta.
Verifique especialmente autorizacao por cliente, consulta de auditoria por empresa, fronteiras entre clinicas, confirmacao obrigatoria, preservacao dos links, falha parcial e limitacoes de rascunhos.
Confirme tambem se a implementacao integrada da assinatura cobre todos os chamadores clinicos; esta rodada nao a homologou.
Proponha melhorias separando bloqueio clinico, melhoria operacional e expansao comercial.
Nao considerar esta carta prova de concordancia ou aprovacao de outros membros da equipe.

## 9. Custo e sincronizacao

Foi adotada execucao sequencial, sem abrir outros agentes.
A documentacao oficial informa cobranca por esforco total; simultaneidade isolada nao determina maior ou menor custo.
Fonte: https://docs.replit.com/billing/ai-billing
Fonte: https://docs.replit.com/learn/build-in-parallel
Nao estimei cobranca sem consultar o consumo da conta.

Esta carta deve ser incluida no mesmo registro de versao das alteracoes.
A confirmacao de sincronizacao deve comparar o identificador local e o identificador remoto apos o envio ao GitHub.
Trabalhos ainda nao integrados ao repositorio principal nao estao incluidos nessa comparacao.

RESUMO EM 1 LINHA: a jornada de pedidos foi melhorada com geracao em lote, envio separado e historico auditavel; a liberacao clinica geral continua condicionada as verificacoes descritas.
