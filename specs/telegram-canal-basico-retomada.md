# Canal básico Telegram — retomada controlada

Revisão adicional vigente: [atendimento recuperável e rubrica histórica](telegram-atendimento-rubrica-recuperacao.md).
Ela complementa esta evidência; sincronizar código não autoriza publicação nem novos envios reais.

## Objetivo e escopo
Executar a etapa 1 do pedido de integração da comunicação, reutilizando webhook,
inbox, resposta da equipe, outbox e worker existentes.
Uma implementação por vez; não iniciar as etapas de dúvidas ou documentos nesta unidade.

## Linha de base — 13/11/2026
- Árvore local limpa em `f616f570`.
- `specs/telegram-worker-desenvolvimento.md` registra um encaminhamento real
  anterior, aceito pela interface de programação do Telegram; recebimento visual
  não observado. Retentativa/reinício daquela rodada foram simulados em banco isolado.
- `specs/typecheck-api-server.md` registra correção posterior dos 169 erros de
  tipos e testes direcionados; não confundir essa rodada com o envio anterior.
- Workflow existente `api-worker: Telegram development` em execução,
  perfil `telegram-relay-dev`, somente retomada de outbox.
- Logs atuais indicam webhook apontando para desenvolvimento, sem atualizações
  pendentes; nenhuma chamada de configuração será feita.

## Requisitos e impacto
1. Preservar autenticação real, contexto empresarial e negativas de acesso.
2. Resposta da equipe exige vínculo globalmente único do chat com o cliente e
   empresa autenticados; duplicidade ou alteração bloqueiam antes do transporte.
3. Retomada do outbox revalida empresa, cliente, direção de entrada e chat
   atualmente único do remetente; mensagem histórica não autoriza vínculo revogado.
4. O destino gravado não pode ser substituído silenciosamente; se divergir do
   chat de alerta atualmente configurado, bloquear a tentativa sem enviar a outro.
5. Bloqueio de vínculo fica terminal e com código técnico legível; não apagar
   mensagem nem repetir automaticamente. Erro de banco/cofre não vira autorização.
6. Preservar reivindicação atômica, deduplicação, limite de tentativas, espera,
   recuperação após reinício e retenção de resultado incerto sem reenvio.
7. Conferir configuração e vínculos atuais sem imprimir dados pessoais ou segredos.
   Novo envio real somente não clínico entre os dois contatos autorizados e após
   confirmar os vínculos. Aceite externo não equivale a recebimento observado.
8. Manter lembretes gerais desligados; nenhuma duplicação de worker ou cron.
9. Executar checagens de tipos, compilação e testes focados; revisão independente
   sequencial. Falta de prova não pode ser preenchida por declaração do executor.
10. O transporte de texto só declara aceite após resposta válida do Telegram
    (`ok=true` e identificador de mensagem). Resposta ilegível ou prazo excedido
    fica incerta, sem repetir automaticamente. Não propagar corpos externos,
    endereços com token ou identificadores pessoais nos erros.

Produtores: webhook e equipe autenticada.
Consumidores: inbox do Cockpit e processador do outbox.
Persistência: tabelas existentes, sem migração ou exclusão.
Efeitos externos: somente teste controlado autorizado, se necessário.
O alerta global do proprietário não é transformado em autorização multiempresa;
esta etapa não certifica esse modelo para outras clínicas.

## Falhas previstas
| Falha | Gravidade | Barreira e recuperação | Prova |
|---|---|---|---|
| Chat duplicado em outra empresa | Alta | Recusar resposta; não escolher cadastro | Rota e banco sintéticos |
| Cliente muda de empresa após enfileirar | Alta | Comparar mensagem e vínculo atual antes de enviar | Banco descartável |
| Chat removido, trocado ou duplicado após enfileirar | Alta | Bloqueio terminal, sem transporte | Banco descartável |
| Destino do alerta muda após enfileirar | Alta | Bloqueio sem redirecionamento | Dependências simuladas |
| Banco/cofre falha na revalidação | Alta | Não enviar; persistir resultado seguro ou aguardar recuperação | Testes de falha |
| Processo interrompe envio externo | Alta | Incerto não retenta automaticamente | Suíte existente |
| Duas instâncias reivindicam o mesmo item | Alta | Manter atualização condicional atômica | Concorrência existente |
| Teste causa envio geral | Alta | Perfil restrito, fila inspecionada e destino autorizado | Conferência sem conteúdo |
| Resposta 200 sem comprovante de aceite | Alta | Validar envelope e identificador; resultado incerto | Transporte simulado |
| Envio não termina ou erro expõe endereço com segredo | Alta | Prazo de 15 segundos e erro técnico fixo | Transporte simulado |

## Critérios de entrega
Requisitos comprovados por evidências vinculadas aos arquivos atuais; testes
sintéticos e provas ao vivo discriminados; nenhum envio clínico, publicação,
redirecionamento de webhook ou alteração de autorizações.
Sem revisão independente e validação autenticada suficiente: BLOQUEADO para
homologação, mesmo que os testes passem.

## Linhas vermelhas
Não tocar cálculo de orçamento, desmembramento, produção, contatos ou permissões
de clientes; não apagar atualizações nem mensagens; não revelar segredos.

## Descoberta na revisão independente
Gravidade alta: o webhook tinha dois caminhos legados que encaminhavam texto
diretamente quando a gravação da mensagem ou do outbox falhava.
Esses caminhos dispensavam revalidação, reivindicação e resultado incerto.
Correção exigida: nenhum encaminhamento direto nesses erros; responder 500 para
preservar reentrega e recuperação, inclusive quando a falha exige correção de
estrutura. A mensagem já salva permanece intacta.
Os testes anteriores que esperavam aviso direto ou confirmação 200 nesses erros
precisam passar a exigir ausência de envio e liberação da reivindicação.
O parecer desta rodada foi FALHA; as correções posteriores não recebem aprovação
independente presumida.

Inspeção dos caminhos adjacentes encontrou `/telegram/test-inbox` com envio direto
e consulta por cliente sem empresa. A ferramenta permanece disponível, mas deve
exigir a mesma clínica autenticada e vínculo único, registrar no inbox/outbox e
responder 202 (enfileirado), nunca sucesso externo antes do processamento.

## Correção pontual de privacidade solicitada antes do teste real
`formatarCpfDisplay` pontuava o número completo; não era ocultação.
Remover a linha de CPF e o nome completo do alerta; não carregar esses campos
do cadastro para montar o repasse. A cópia do texto destinada ao alerta deve
ocultar CPF, e-mail e telefone reconhecíveis sem alterar a mensagem original
guardada no Cockpit. Testar números sintéticos com e sem pontuação, campo inválido,
texto contendo identificadores e ausência de dados pessoais nos logs.
Nenhum novo envio real antes desses testes.

## Evidência visual por assistente autorizado — 13/11/2026, 14:16 Brasília
O assistente ChatGPT/Codex observou visualmente, no Telegram Web, durante a sessão
autorizada do Dr. Caio, na conversa do bot Instituto Padua, a chegada deste texto:
> Teste técnico autorizado do encaminhamento Telegram. Mensagem não clínica. Não exige resposta.

A mesma observação confirmou que esse alerta não mostra CPF completo nem nome
do cadastro. Proveniência corrigida expressamente na conversa: observação do
assistente ChatGPT/Codex na sessão autorizada, não confirmação pessoal do Dr. Caio
nem captura produzida pelo Dr. Replit.
Escopo: somente esse encaminhamento específico pelo worker de desenvolvimento.
Não comprova resposta da equipe, lembretes atuais, outras mensagens, produção
nem homologação integral.

## Resultado da execução atual

### Revisão examinada e arquivos
Base da retomada: `f616f570`; os resultados abaixo descrevem as alterações deste
lote, identificáveis pelo commit próprio de sincronização para revisão.
Não atribuir esses resultados aos commits históricos anteriores nem confundir
sincronização com aprovação.

| Camada | Arquivos principais | Resultado |
|---|---|---|
| Vínculo | `lib/telegram-vinculo-atual.ts`, `routes/cockpit.ts` | Recusa vínculo ausente, trocado ou duplicado antes do envio |
| Fila | `lib/telegram-repasse-outbox.ts`, `lib/telegram-repasse-worker.ts` | Revalida origem e destino; bloqueio terminal; mantém reivindicação e incerto |
| Recebimento e ferramenta | `routes/assinaturas.ts`, `lib/telegram-inbox-flow.ts` | Sem envio direto após falha de gravação; ferramenta de teste exige clínica e enfileira |
| Privacidade e transporte | `lib/telegram-relay-ceo.ts`, `lib/telegram.ts` | Sem nome/CPF do cadastro; redação da cópia do alerta; aceite validado e prazo de envio |
| Roteiro controlado | `scripts/telegram-canal-controlado.ts` | Leitura por padrão, conferência dos contatos, login real e ações explícitas sem repetição automática |
| Testes | `src/tests/telegram-*.test.ts` e regressões abaixo | Dados sintéticos; bancos descartáveis e transportes simulados |

Prefixo dos caminhos da tabela: `artifacts/api-server/src/`.
Os simuladores de rota foram alinhados às novas leituras de vínculo, sem remover
as negativas de autorização. A suíte de desvinculação declara explicitamente que
seu contexto é uma simulação; a suíte de isolamento usa autenticação e contexto
empresarial reais, com persistência simulada.

### Comandos e resultados
```sh
cd artifacts/api-server
pnpm exec vitest run --maxWorkers=2 \
  src/tests/telegram-*.test.ts \
  src/tests/lembrete-telegram-motor.test.ts \
  src/tests/lembrete-periodo-concorrencia.test.ts \
  src/tests/prescriptions-lembrete.test.ts \
  src/tests/onboarding-clinic-auth.test.ts \
  src/tests/onboarding-envio-autorizacao.test.ts \
  src/tests/cockpit-badge.test.ts --testTimeout=30000
```
Resultado final: **26 arquivos, 410 testes aprovados**, sem mensagens reais.
Inclui teste de falha 503, persistência de `falhou`, vencimento da espera e
retomada em outro processo Node.js, somente em PostgreSQL descartável com
transporte simulado; não foi provocada falha contra o Telegram real.
Os testes de privacidade cobrem o montador e o fluxo banco → montador, preservando
o original no inbox e comprovando ausência do CPF completo no alerta.

```sh
pnpm --filter @workspace/api-server run typecheck
pnpm --filter @workspace/api-worker run typecheck
pnpm --filter @workspace/api-server run build
pnpm --filter @workspace/api-worker run build
git diff --check
```
Todos passaram. A checagem de tipos da API também foi repetida após terminar o
roteiro controlado: saída zero. Uma tentativa intermediária de checagem excedeu
o prazo da chamada; não foi contada como aprovação.
Não foi executada a suíte integral do repositório.

### Provas ao vivo, separadas das simulações
1. Conferência somente de leitura confirmou dois chats únicos, associados aos
   telefones autorizados e à mesma empresa. O destino configurado foi preservado.
   Os rótulos históricos não coincidiam com a posição dos telefones nos cadastros:
   o roteiro bloqueou a primeira tentativa antes de login, gravação ou envio.
   A conferência foi ajustada aos campos reais, sem modificar nenhum contato.
2. Token e segredo do webhook configurados; chat de alerta proveniente do cofre.
   Consultas `getWebhookInfo` confirmaram este ambiente de desenvolvimento,
   sem atualização pendente. Não foi chamado `setWebhook`, `getUpdates` ou
   qualquer método de exclusão/configuração do webhook.
3. Login com a primeira credencial operacional retornou 401: nada foi enfileirado.
   O identificador alternativo já existente no ambiente autenticou com 200.
   Não foi criado token manualmente, redefinida senha ou alterada autorização.
4. O roteiro leu o inbox pela rota autenticada antes da escrita técnica autorizada.
   O encaminhamento foi registrado em transação no inbox/outbox com texto não
   clínico; **não simula a entrada real de uma mensagem no webhook**.
5. O worker existente observou `pendente` (zero tentativas), `enviando` (uma) e
   `aceito_telegram` (uma), sem erro. Fechamento no banco:
   **13/11/2026, 14:16:01, Brasília**.
   Somente um novo encaminhamento foi criado nesta rodada.
6. A observação visual desse encaminhamento é exclusivamente a evidência do
   assistente ChatGPT/Codex descrita acima; não foi atribuída ao Dr. Caio.
7. Depois de conferir que nenhum documento clínico aguardava reprocessamento no
   início, a API de desenvolvimento foi reiniciada uma vez para carregar as
   correções. O log confirmou inicialização, sincronismo do dicionário sem
   alteração externa, sementes sem novos itens e zero exclusões nas limpezas.
   Isso não certifica todos os cenários possíveis de inicialização.
8. Uma resposta técnica não clínica foi enviada pela rota real autenticada
   `POST /api/cockpit/:clientId/telegram-inbox/enviar` ao outro contato autorizado.
   Resultado: 200, `sent=true`, `mock=false`, uma linha de saída persistida na
   clínica e chat esperados. **Recebimento visual dessa resposta não observado**.
   Foi uma chamada à rota do Cockpit, não um teste de clique na sua interface.
9. Antes dessa resposta, uma conferência de webhook não passou e o roteiro
   interrompeu antes do login/envio. Consulta somente de leitura posterior
   confirmou o mesmo webhook saudável; nenhuma configuração foi alterada.
10. O worker foi reiniciado depois do encaminhamento, no mesmo workflow restrito.
    Seu primeiro tick encontrou zero itens ativos, sem repetir o aceite anterior.
    A contagem final do outbox foi duas linhas `aceito_telegram` (uma histórica e
    uma desta etapa), sem pendentes/falhos/incertos.
    A lista de processos mostrou uma API e um worker, em diretórios distintos.
11. Lembretes Telegram permanecem `desligado`, lista de permitidos vazia; o perfil
    restrito agenda somente `telegram-relay-1min`, sem lembretes gerais.
    A preservação de textos, períodos, motivacionais e sábado foi conferida
    nos testes sintéticos existentes, não por novo envio de lembrete real.

Forma reproduzível dos comandos reais, sem registrar telefones ou credenciais:
```sh
LOG_LEVEL=silent NODE_ENV=development \
pnpm --filter @workspace/api-server exec tsx src/scripts/telegram-canal-controlado.ts \
  --origem-id=<cadastro autorizado> --destino-id=<cadastro autorizado> \
  --origem-telefone=<telefone autorizado> --destino-telefone=<telefone autorizado>
# Acrescentar --enfileirar para o teste de encaminhamento ou --responder para
# a resposta da equipe; nunca executar ambos esperando dois testes.
# --identificador-alternativo usa a credencial operacional já armazenada.
# Não repetir ações de envio para apenas rever evidências.
```

### Limites e estado do PAXTER Loop
- A revisão independente desta unidade encontrou os desvios diretos; eles foram
  corrigidos e testados, mas não houve novo parecer final de aprovação.
  A revisão completa informada na conversa continua pendente.
- Não houve nova entrada real pelo webhook nesta rodada; suas falhas e dedupe
  foram testados com dados sintéticos. Não confundir prova de fila/worker com
  uma nova prova de toda a entrada Telegram → webhook.
- Nenhuma publicação, alteração de produção ou disparo geral foi realizado.
  Os dois envios reais foram estritamente não clínicos aos contatos autorizados.
- A captura da página inicial confirmou renderização, não autenticação do
  Cockpit nem seus cliques. Exibiu dados de painel mesmo sem sessão enquanto
  menu/inbox retornavam 401: achado independente de autorização do painel,
  fora das rotas corrigidas, a ser examinado na revisão completa; não certifico
  autorização global da aplicação.
- Há avisos preexistentes de Agenda e da configuração de chave de desenvolvimento;
  não foi declarado que todo o log da aplicação está livre de avisos.
- **Estado: EM TESTE; BLOQUEADO PARA HOMOLOGAÇÃO** até parecer independente final
  e fechamento das lacunas aplicáveis. Nenhuma homologação de outras clínicas,
  de lembretes, de resposta visual, de documentos ou de produção é inferida.
- Próxima unidade concreta, após fechar esta revisão: autorização específica do
  Telegram nos lembretes existentes, incluindo revogação, troca de chat e
  ambiguidade, sem fallback silencioso nem ativação geral. Não iniciada aqui.

## Revisão adicional recebida — sem iniciar outra implementação
Em 13/11/2026 foi registrada a tarefa #756, "Revisar alertas, recuperação e
rubricas históricas", para execução posterior ao lote atual, sem executor novo.
Nenhum dos módulos de atendimento ou de rubrica foi modificado por esta triagem.

| Pedido | Conferência preliminar no código atualizado | Tratamento |
|---|---|---|
| Alerta da equipe | `alertarEquipe` ignora destino ausente e retorno `sent/mock`; queixa pode receber desfecho de encaminhada sem aceite do alerta | Confirmado estaticamente; correção e testes ficam no lote adicional |
| Recuperação | Webhook usa `void`; reivindicação insere chave única antes das etapas, sem retomada durável no caminho examinado | Confirmado estaticamente; exigir cenários de queda e resultado desconhecido |
| Rubrica histórica | Montador do documento consulta `lerRubricaAtiva` na regeneração e distribui a imagem atual | Risco confirmado no caminho; reprodução de troca/regeneração ainda depende de teste sintético |
| CPF do repasse | Campo do cadastro removido, redator aplicado à cópia do alerta; função de exibição só devolve máscara integral | Não reproduzir a falha antiga nem chamar pontuação de máscara |
| Erro do repasse | Registro de diagnóstico sanitizado, mas o contrato auxiliar ainda pode devolver texto bruto de exceção fornecida por uma dependência | Comprovação e fechamento em texto/logs/erros incluídos na revisão adicional; não certificar privacidade integral |

O novo relato visual do lembrete das 03:05 foi correlacionado, somente por
leitura, aos registros históricos 306/166 e ao Job 2 isolado, conforme
complemento em `specs/telegram-integracao-estado.md`; não é prova do worker atual.

Sincronização autorizada: enviar o lote testado para a mesma branch
`homologacao/paxmed-modelo-2b`, por avanço normal, após conferir divergência e
preservar as alterações locais. Envio para revisão não equivale a homologação,
publicação ou alteração de produção.
