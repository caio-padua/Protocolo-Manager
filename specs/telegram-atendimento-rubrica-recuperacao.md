# Atendimento Telegram recuperável e rubrica histórica

## Objetivo
Corrigir as quatro lacunas auditadas contra a base atual b9c196df, sem substituir
os motores existentes nem fazer envios reais.

## Requisitos, desenho e impacto
1. Inbox salvo → registro durável do atendimento ANTES do aceite do webhook
   (também na reentrega). Falha de registro devolve 500; não apagar inbox.
2. Reutilizar telegram_atendimento_respostas, transporte Telegram, decisão de
   orientações e o mesmo tick do worker do repasse. Nenhum cron/processo novo.
3. Separar plano persistido, pausa humana, alerta e resposta. Capturar destino
   uma vez; revalidar origem, configuração, clínica e orientação antes do envio.
4. Reivindicação condicional com dono, prazo e limite de seis tentativas.
   Queda no planejamento pode retomar; barreira de envio persistida antes da rede.
   Queda depois dessa barreira, prazo, rede ou aceite sem fechamento = incerto,
   nunca repetido automaticamente. Etapa aceita persistida não se repete.
5. Recusa 403 é terminal; 503 e falta de token/destino podem aguardar recuperação
   com limite e espera; destino capturado não é redirecionado silenciosamente.
6. Desligado/fora da lista no recebimento fecha sem efeitos, não acumula mensagens
   antigas para enviar ao ligar futuramente. Revalidar essas condições na retomada.
7. Nenhuma promessa "já avisei". Alerta mínimo por identificadores internos, sem
   nome, CPF, transcrição clínica ou erro externo. Mensagem original protegida
   permanece no Cockpit. Expor falhas/incertos na tela administrativa autenticada
   com consulta empresarial e atualização, inclusive queda antes da pausa humana.
8. Novos estados não reexecutam reivindicações legadas: fechadas permanecem
   concluídas; não fechadas ficam incertas para conferência humana.
9. Na confirmação/rubrica da visita, vincular atomicamente versão e hash da
   imagem daquele momento (ou ausência explícita), resolvendo o caminho privado
   pela versão imutável, sem copiar arquivo para o banco.
   A troca de imagem usa a mesma trava da captura; nunca apagar versões antigas.
10. Documento regenerado lê somente o vínculo histórico da visita e valida
    cliente, clínica, versão e hash. Sem vínculo legado não inventa imagem atual;
    sinalização explícita de legado/sem imagem. Pendente nunca ganha imagem.
11. Sanitizar também o valor retornado pelo contrato auxiliar do repasse e testar
    texto, diagnóstico e erro com identificadores exclusivamente sintéticos.

Produtores: webhook, configuração já existente e confirmação por chave,
desafio e e-mail. Consumidores: worker existente, tela Dúvidas e Orientações e
montador do RAS FAP. Persistência aditiva; arquivos no armazenamento privado
existente, sem copiar bytes para o banco. Nenhuma autorização de cliente muda.

## Matriz de falhas
| Falha | Risco | Barreira e prova |
|---|---|---|
| Queda após salvar inbox/antes de enfileirar | Perda | 500 e reentrega idempotente; rota sintética |
| Duas reivindicações | Duplicação | Dono e atualização condicional; PostgreSQL descartável |
| Queda antes da barreira externa | Perda | Plano/etapas persistidos e retomada limitada |
| Queda na barreira ou após aceite | Duplicação | Incerto terminal; novo processo não envia |
| Alerta aceito e resposta falha | Alerta duplicado | Etapa de alerta aceita preservada |
| Chat ausente, 403/503, token ausente | Falso encaminhamento | Estado durável legível, sem promessa ao cliente |
| Configuração, vínculo ou aprovação mudam | Destino/autorização errados | Revalidar antes do transporte; bloquear |
| Erro contém CPF ou segredo | Exposição | Código técnico na saída e no diagnóstico |
| Imagem trocada depois da visita | Histórico alterado | Vínculo da versão sob mesma trava transacional |
| Hash ou clínica divergem | Assinatura indevida | Recusa explícita, sem imagem substituta |
| Confirmação antiga sem versão | História inventada | Legado explícito, nunca imagem ativa atual |

## Critérios de validação
Testes sintéticos de decisão, contrato de rotas protegidas, banco descartável
(concorrência, persistência, queda/reinício), rubrica/regeneração e privacidade;
checagem de tipos, compilação e revisão independente sequencial.
Conferência de tela autenticada quando disponível; falta de prova visual
autenticada bloqueia homologação, não é suprida por captura do login.
Cada lote registra comandos/resultados e é sincronizado por avanço normal na
mesma branch de homologação, sem publicação. Não confundir código enviado com
aprovação nem evidência visual histórica com operação atual.

## Linhas vermelhas
Somente testes sintéticos e provedores simulados; nenhum novo envio real,
nenhuma alteração de produção/webhook/autorizações ou ativação geral.
Não tocar cálculo de orçamento/desmembramento, não apagar mensagens nem imagens,
não copiar dados clínicos para testes nem reescrever histórico de Git.

## Lote 1 — execução em 13/11/2026
Base examinada: b9c196df. Confirmadas as três lacunas de atendimento e rubrica;
repasse já não lia nome/CPF do cadastro, mas devolvia exceção bruta e ainda
transcrevia texto livre parcialmente redigido.

Implementado: fila recuperável na tabela existente, plano antes de efeitos,
etapas de alerta/resposta, dono/prazo, seis tentativas, reserva antes da rede,
incerto sem repetição, cópia de resposta e aceite local atômicos, bloqueio de
vínculo/destino/configuração/orientação alterados. Webhook aguarda registro mesmo
na reentrega, sem apagar inbox. Mesmo tick do worker; nenhum cron adicionado.
Legados não fechados recebem estado incerto, sem reexecução.
O perfil restrito `telegram-relay-dev` permanece SOMENTE com repasse: não consome
atendimento automático. O consumidor de atendimento usa o mesmo tick no perfil
completo, ainda condicionado às configurações e autorizações já existentes.
Teste isolado pode invocar esse consumidor sem habilitar o perfil completo.

Alerta mínimo contém somente identificador interno e instrução para Cockpit
protegido; **não transcreve mais texto livre**. Isso evita depender de expressões
regulares para reconhecer nomes ou conteúdo sensível. Exceções e retornos de
transporte contêm somente código técnico. O original do inbox permanece intacto.
Não se alterou o conteúdo de lembretes, horários, períodos nem versículos.

Arquivos: atendimento-telegram{,-store,-recuperacao}.ts, telegram-relay-ceo.ts,
telegram-repasse-worker.ts, assinaturas.ts, duvidas-orientacoes.ts (rota e tela),
testes de atendimento/repasse/webhook/rotas e
e2e/atendimento-telegram-pendencias.spec.ts.

| Comando/verificação | Resultado |
|---|---|
| `pnpm --filter @workspace/api-server exec vitest run src/tests/atendimento src/tests/duvidas src/tests/telegram src/tests/lembrete-telegram-motor.test.ts --maxWorkers=2` | 402 testes / 25 arquivos passaram |
| `pnpm --filter @workspace/api-server run typecheck` | Passou |
| `pnpm --filter @workspace/api-worker run typecheck` | Passou |
| `CHROMIUM_PATH=… pnpm exec playwright test e2e/atendimento-telegram-pendencias.spec.ts --timeout=45000` | Passou; computador/celular; respostas sintéticas; zero escrita externa |
| Verificação global de tipos do padcom | 35 erros em outros arquivos; nenhum no arquivo alterado; não tratada como aprovação global |

Falhas encontradas e corrigidas durante os testes: simulação antiga acoplada ao
novo consumidor do tick; expectativa antiga de transcrição agora proibida;
identificador BIGINT retornando texto no contrato (usar id original inteiro do
inbox); teste visual que procurava botão inexistente (provar atualização periódica
real com relógio do navegador). Sem afrouxar autenticação para passar testes.

Prova de reinício: processo Node separado usa SOMENTE socket de PostgreSQL
descartável e transporte sintético. Queda após reivindicar/antes do plano retoma;
queda antes/depois da chamada externa após barreira fica incerta; queda após
aceites persistidos/antes do fechamento não repete nenhuma etapa aceita.

Capturas sintéticas: generated-artifacts/atendimento-pendencias-{desktop,mobile}.png.
Isso comprova renderização com dados de demonstração, não sessão real autenticada.
Nenhum novo envio real, webhook, configuração de canal ou autorização foi tocado.
Rubricas históricas e revisão independente ainda pendentes neste marco.

Complemento do lote: depois da trava explícita do perfil restrito, passaram
60 testes em cinco arquivos afetados (`src/tests/atendimento`,
`telegram-worker-profile.test.ts`, `telegram-repasse-destino-atual.test.ts`),
mais checagens de tipos da aplicação de servidor e do trabalhador.
Incluem dependências reais do atendimento com banco descartável: enfileirar sem
enviar, consumir uma vez, respeitar profissional que assumiu depois do alerta,
recusar aprovação retirada depois do plano e recusar origem de outra clínica.
O teste de encerramento do banco expôs corrida do desligamento rápido do
PostgreSQL com socket em fechamento; a parada inteligente resolveu sem ocultar
erros nem tocar banco da aplicação. A rodada seguinte encerrou sem erro não tratado.

## Lote 2 — rubrica histórica, execução em 13/11/2026
Confirmado: ras-fap-registros.ts consultava lerRubricaAtiva ao regenerar qualquer
visita, portanto trocar o cadastro mudaria o documento histórico.

Corrigido nos três caminhos de confirmação: chave, desafio e e-mail usam uma
transação com a MESMA trava da troca de imagem. A leitura da versão ocorre em
uma instrução posterior à aquisição da trava, não em uma expressão com
instantâneo anterior à espera. Versão/hash/data (ou ausência explícita) ficam
na confirmação, junto da mudança de estado, sem enviar arquivo.
Confirmação de e-mail posterior ao desafio preserva a captura original.
Rubrica legada já prestada, mas sem prova de versão, não é preenchida por inferência.

O montador lê a versão histórica de cada visita, com validação de cliente,
clínica, versão, hash registrado e conteúdo do arquivo. Versões antigas não
são apagadas, e a referência restringe exclusão da linha utilizada.
Ausência comprovada continua sem imagem depois de novo upload.
Pendente/não confirmada não lê nem desenha imagem, mesmo com referência presente.
Legado sem versão recebe **RUBRICA SEM VERSÃO** no documento.
Nenhuma rubrica ou confirmação real foi retropreenchida nos testes.

Arquivos: client-rubrica.ts, ensure-visit-confirmations.ts,
visit-rubrica-historica.ts, visit-confirmation.ts, ras-fap{,-registros,-rubrica}.ts;
client-rubrica-postgres.test.ts, visit-confirmation-postgres.test.ts e
ras-fap-rubrica-imagem-pdf.test.ts.

| Comando | Resultado |
|---|---|
| `pnpm --filter @workspace/api-server exec vitest run src/tests/visit-confirmation src/tests/ras-fap-registros-postgres.test.ts src/tests/ras-fap-rubrica src/tests/client-rubrica-postgres.test.ts --maxWorkers=2` | 113 testes / 6 arquivos passaram |
| `pnpm --filter @workspace/api-server run typecheck` | Passou |
| `pnpm run typecheck:libs` | Passou |
| `pnpm --filter @workspace/api-server run build` | Passou |
| `pnpm --filter @workspace/api-worker run build` | Passou; não iniciou segundo trabalhador |

Prova de regeneração: carregador real, banco descartável e arquivos privados
simulados; troca da imagem ativa, imagem histórica preservada e impressões
digitais de TODAS as imagens embutidas no documento regenerado iguais às anteriores.
Prova de concorrência: transação de troca mantém a trava; a confirmação é vista
aguardando essa trava no PostgreSQL e captura a versão nova depois do commit.
Três testes antigos dependiam implicitamente da imagem ativa: as fixtures foram
atualizadas com versão sintética explícita, mantendo as recusas de integridade e
indisponibilidade, sem relaxar as verificações.

## Preparação para revisão independente
Estado: EM REVISÃO; **não homologado**.
Conferência final do atendimento também cobre fechamento após aceites persistidos
na última tentativa: não pode virar falso esgotamento nem reenvio. Pausa humana
automática é condicionada ao dono/prazo da reivindicação, para processo antigo
não sobrescrever operação posterior. A tela diz entrega incompleta (não afirma
que nada foi enviado quando apenas uma das etapas falhou).
Reinicialização controlada, regressão final e parecer independente ainda precisam
ser registrados; compilar não comprova inicialização nem sessão real autenticada.

## Parecer independente e correções subsequentes
O revisor independente examinou o primeiro lote e o segundo diff após compilação.
Parecer: **REPROVADO**, com dois impedimentos dos requisitos 3 e 7:
1. A pausa humana ocorria depois do planejamento, mas antes de conferir novamente
   vínculo/configuração; o predicado do efeito também precisava de vínculo único.
2. Chat de alerta igual ao remetente permitia eco do alerta interno para o cliente.

Correções: conferência novamente antes de pausar; vínculo/chat único na própria
instrução da pausa junto da reivindicação; destino de alerta igual à origem
encerra como bloqueado, sem transporte nem encaminhamento aceito.
Testes acrescentados: desligamento/desvínculo/duplicidade durante o planejamento,
pausa atômica com desvínculo/duplicidade/dono antigo/caminho legítimo e alerta
destinado à própria origem. Resultados executados na seção seguinte.
O parecer anterior NÃO aprova estas correções: reavaliação independente da versão
corrigida continua pendente; a presente execução não o substitui por autoavaliação.

## Validação final executada — 13/11/2026
Estado de engenharia: **BLOQUEADO para homologação**, aguardando reavaliação
independente da versão corrigida e validação com sessão administrativa real.
Implementação e regressões deste lote concluídas; isso não equivale a homologar.

| Verificação | Resultado observado |
|---|---|
| `pnpm --filter @workspace/api-server exec vitest run src/tests/atendimento src/tests/duvidas src/tests/telegram src/tests/lembrete-telegram src/tests/client-rubrica src/tests/ras-fap src/tests/visit-confirmation --maxWorkers=2` | **604 testes / 36 arquivos passaram**, sem erro não tratado |
| `CHROMIUM_PATH=/nix/store/qa9cnw4v5xkxyip6mb9kxqfq1z4x2dx1-chromium-138.0.7204.100/bin/chromium pnpm exec playwright test e2e/atendimento-telegram-pendencias.spec.ts --timeout=45000` | **1 passou**: computador/celular, atualização automática, erro não vira fila vazia, nenhum envio |
| Verificações de tipos do servidor e trabalhador | Passaram após correções do parecer |
| Compilações do servidor e trabalhador | Passaram após correções do parecer |
| `git diff --check` | Passou |
| Consulta anterior ao reinício, transação somente leitura | 0 documentos clínicos sujeitos à recuperação automática; 0 repasses pendentes |
| Reinício dos serviços existentes | Servidor iniciou e garantiu as estruturas; trabalhador executou o arquivo compilado no Node 24 |
| Perfil do trabalhador | `telegram-relay-dev`, **somente** `telegram-relay-1min`; não houve segundo trabalhador nem ativação de atendimento/lembretes gerais |
| Primeiro ciclo após reinício | 0 examinados/aceitos/falhas/incertos novos; **fila vazia não comprova encaminhamento** |
| Rota administrativa sem sessão | `/api/duvidas-orientacoes/atendimento/estado` devolveu **401** |
| Captura real da prévia sem sessão | Mostrou o login, mantendo a proteção; não verifica a tela autenticada real |

Capturas sintéticas: generated-artifacts/atendimento-pendencias-desktop.png e
generated-artifacts/atendimento-pendencias-mobile.png.
Captura sem sessão: generated-artifacts/atendimento-preview-sem-sessao.jpg.
São saídas ignoradas pelo versionamento, sem dados reais e sem segredos.

Limitações de execução que não foram ocultadas: a primeira consulta automática
de saúde do webhook, pelo serviço já existente, registrou **fetch failed**;
portanto não comprova disponibilidade externa atual do Telegram.
A sincronização de duas agendas também registrou atualização falha e preservação
do estado anterior; não foi alterada como parte desta auditoria.
Não se publicou, não se alterou webhook ou autorização de cliente e não se
disparou novo teste real de envio. Textos motivacionais/por período e regra de
versículo aos sábados não foram alterados.

As evidências visuais anteriores continuam com o alcance documentado em
telegram-canal-basico-retomada.md: encaminhamento das 14:16 observado pelo
assistente ChatGPT/Codex na sessão autorizada, não confirmação pessoal do
Dr. Caio; relato das 03:05 correlacionado pelo horário/texto, sem prova isolada
de identidade da mensagem nem atribuição ao trabalhador restrito atual.
