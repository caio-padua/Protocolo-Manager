# Worker Telegram restrito no ambiente de desenvolvimento

## Objetivo
Retomar continuamente o encaminhamento já salvo no outbox usando o `api-worker` existente, sem iniciar outros trabalhos externos e sem criar um segundo agendador de lembretes.

## Requisitos
1. O modo padrão do `api-worker` permanece integralmente igual ao atual, para não alterar sua execução fora deste teste de desenvolvimento.
2. Um perfil explícito de desenvolvimento agenda somente a retomada do outbox do Telegram, no intervalo de um minuto já usado pelo worker.
3. O perfil restrito não inicia farmácia, lembretes, receituário, Drive, monitor de modelos de linguagem, verificação de webhook, confirmações de consulta, purgas ou alertas.
4. O início do perfil é idempotente dentro do processo; chamadas repetidas não registram mais de um agendamento.
5. A configuração de desenvolvimento usa um único workflow e não cria processo concorrente do `api-worker`.
6. O envio usa o transporte existente, sem alterar webhook, autorizações, destino ou configuração de produção.
7. Nenhum teste grava dados clínicos ou usa conteúdo de cliente; qualquer envio real, se indispensável, deve ser texto não clínico e limitado aos dois contatos previamente autorizados.
8. O motor de lembretes permanece no agendamento já existente do worker completo, sem cron novo; seus textos por dia e período e o versículo somente aos sábados devem continuar cobertos pelos testes existentes.

## Impacto e limites
- Produtor: webhook já existente registra o repasse durável antes de confirmar a atualização recebida.
- Consumidor: `api-worker` chama o processador existente do outbox.
- Persistência: nenhuma mudança de esquema; estados `pendente`, `falhou`, `incerto` e `aceito_telegram` mantêm o contrato atual.
- Permissões e identidades: não se altera autenticação, vínculo de cliente, chat de destino ou autorização de lembrete.
- Efeitos externos: o perfil restrito pode enviar somente repasses que já estejam vencidos no outbox do banco de desenvolvimento; por isso, a fila precisa ser conferida sem ler conteúdo antes de iniciar.
- Produção: fora do escopo; nenhuma configuração ou dado de produção deve ser alterado.

## Falhas previstas e resposta
| Falha | Gravidade | Barreira | Recuperação e teste |
|---|---|---|---|
| Perfil ausente ou inválido inicia o worker completo por engano | Alta | Perfil desconhecido falha fechado; padrão legado permanece explícito e intacto | Testar perfil padrão, restrito e valor inválido |
| Dois cronogramas de encaminhamento no mesmo processo | Alta | Guarda única de inicialização no worker | Chamar o início duas vezes e confirmar um único agendamento |
| Reinício perde repasse pendente | Alta | Outbox persistente; repasse incerto não é reenviado sozinho | Banco descartável, retomada após reinício e preservação de `incerto` |
| Inicialização restrita aciona outro job | Alta | Perfil agenda somente o callback do outbox | Teste de registro de cron e conferência do log do processo |
| Porta padrão de saúde conflita com outro serviço de desenvolvimento | Média | Perfil restrito não abre servidor HTTP; o workflow de console e o log de inicialização são a prova de vida | Confirmar processo único e ticks no log |
| Mensagem real é enviada durante a validação | Alta | Conferir contagem por estado antes de iniciar; não inserir repasse sintético no banco da aplicação | Iniciar com fila vazia; usar transporte simulado nos testes |
| Regressão nos lembretes ou duplicação de cron | Alta | Não iniciar o Job 2 no perfil restrito; preservar o único Job 2 do perfil completo | Suítes do motor, concorrência e textos por dia/período |
| Reinício do workflow cria outro processo | Média | Reutilizar o nome do mesmo workflow e verificar a lista de processos | Reiniciar uma única vez e confirmar uma instância |
| Worker não consegue ler o cofre ou o banco no seu contexto | Alta | Registrar somente categoria e resumo estritamente sanitizado, sem credenciais ou identificadores | Exigir conexão e primeiro tick concluído antes de afirmar retomada ativa |
| Teste ao vivo usa vínculo removido, duplicado ou destino fora da autorização | Alta | Antes da inserção, confirmar no banco de desenvolvimento que os dois chats autorizados continuam vinculados uma única vez e que o destino configurado é um deles | Bloquear a inserção se qualquer vínculo ou destino não corresponder; não mostrar identificadores |
| Falha real de rede deixa incerto se o Telegram recebeu a mensagem | Alta | Não provocar falha externa em chat real; cobrir falha temporária, persistência e nova tentativa após reinício em PostgreSQL descartável com transporte simulado | Exigir que `incerto` nunca seja reenviado sozinho e que `falhou` só retente após vencer a espera |

## Definição de pronto
1. A especificação e a implementação mostram que o perfil de desenvolvimento registra apenas um cron do outbox.
2. Testes sintéticos cobrem o perfil restrito, a guarda contra duplicação, retomada, concorrência e falhas já previstas pelo outbox.
3. As suítes de lembretes confirmam os textos por dia e período e versículo apenas no sábado, sem adicionar cron.
4. O `api-worker` compila e passa pela checagem de tipos.
5. Um único workflow de desenvolvimento inicia, permanece ativo, registra o primeiro tick concluído e continua ativo após um reinício.
6. Logs identificam o perfil e os ticks sem expor texto, identificadores de clientes, destinos ou segredos.
7. Revisão independente examina esta especificação e as alterações; sem ela, o estado permanece BLOQUEADO, nunca HOMOLOGADO.
8. Um envio real, se autorizado, percorre a fila e o worker de desenvolvimento, com estado final lido do banco; o Telegram só é declarado como tendo aceitado a chamada da interface de programação, sem afirmar recebimento visual.
9. Falha temporária seguida de nova tentativa após reinício é validada apenas com dados sintéticos e transporte simulado em banco descartável.

## Evidências e resultado — 13/11/2026
- A árvore local estava limpa.
- O outbox de desenvolvimento não tinha linhas em nenhum estado antes e depois da validação; nenhuma mensagem foi enviada nesta rodada.
- Doze suítes focadas passaram: 189 testes, incluindo sete suítes de autorização e isolamento, dados sintéticos em banco descartável e transporte simulado.
- Compilação, checagem de tipos do `api-worker` e `git diff --check` passaram.
- Não havia workflow nem processo do `api-worker` ativo.
- O Job 2 de lembretes e a retomada do outbox já existiam no worker; o perfil padrão completo também inicia outros trabalhos com efeitos externos.
- A primeira tentativa do workflow confirmou o perfil restrito, mas falhou porque a porta padrão 8081 já era atendida pelo serviço de prévia do mockup; nenhum tick ocorreu. O perfil restrito passou a não abrir essa porta.
- A prova de conexão do workflow revelou a causa: o pacote ESM (módulos JavaScript modernos) empacotado não conseguia executar uma chamada `require` dinâmica (carregamento tradicional de módulos) para o módulo nativo `events`; o processador do outbox depende do pacote PostgreSQL incluído no bundle.
- A compilação passou apesar da incompatibilidade, mas a verificação de execução do artefato a revelou antes de qualquer agendamento ou envio.
- O carregador de runtime baseado no Node.js corrigiu a chamada dinâmica; a prova de conexão com o banco passou.
- O cofre inicialmente falhou porque `pino-pretty` só estava declarado no api-server, embora o worker carregue o logger compartilhado; o worker agora declara a dependência de desenvolvimento diretamente e hidratou nove configurações sem registrar seus valores.
- O workflow único `api-worker: Telegram development` iniciou com perfil restrito, concluiu um tick, foi reiniciado uma vez e concluiu outro tick; ambos examinaram zero repasses e registraram zero envios e falhas.
- A lista de processos mostrou uma instância do worker, além do processo pai do gerenciador do workflow e do servidor de programação de aplicações existente; não foi iniciado worker completo nem processo paralelo.
- O motor de lembretes não foi agendado no perfil restrito; o Job 2 existente segue único no perfil completo. Testes preservaram textos por dia e período, motivação na sexta e no sábado e versículo somente no sábado.
- Nenhum webhook, autorização, configuração de produção ou dado clínico foi alterado. Não houve envio a nenhum contato.
- **Estado:** execução contínua em desenvolvimento comprovada para startup, cofre, banco, ticks e reinício; repasse real não comprovado porque o outbox estava vazio. BLOQUEADO para HOMOLOGAÇÃO até revisão independente.

## Evidências complementares — teste controlado de encaminhamento — 13/11/2026

- **Arquivos alterados nesta etapa:** `artifacts/api-server/src/tests/telegram-repasse-banco-descartavel.test.ts` e esta especificação. Nenhum arquivo de autenticação, webhook, worker de produção ou lembretes foi alterado.
- **Vínculos antes do envio:** os contatos autorizados A e B estavam vinculados de forma única no banco de desenvolvimento; o destino de alerta configurado correspondia a B. A validação não imprimiu identificadores de chat, nomes ou documentos pessoais.
- **Fila real de desenvolvimento:** uma mensagem sintética, identificada como teste técnico não clínico, foi gravada para o remetente A; o destino foi B. O item foi observado como `pendente` com zero tentativas antes de liberar o horário.
- **Processamento real:** o workflow restrito observou a sequência `pendente` → `enviando` → `aceito_telegram`; o banco confirmou uma tentativa, sem erro e sem itens pendentes ou falhos ao final.
- **Resultado externo daquela rodada:** o Telegram aceitou a chamada de envio pela interface de programação. O recebimento visual não foi observado naquela rodada. Correção de proveniência técnica: o formato antigo incluía nome e CPF completo apenas pontuado, não efetivamente mascarado; nenhum valor foi copiado para esta evidência. A retomada atual remove esses campos do alerta e está documentada em `specs/telegram-canal-basico-retomada.md`.
- **Reinício após o envio:** o mesmo workflow foi reiniciado; o novo tick examinou zero itens, e a linha `aceito_telegram` permaneceu terminal. A lista de processos mostrou o api-server e uma única instância do api-worker, em diretórios distintos.
- **Falha e retentativa:** o teste O13 injeta uma resposta HTTP 503 sintética, confirma `falhou` e uma tentativa, vence a espera e inicia um processo Node.js separado com transporte simulado. O novo processo termina em `aceito_telegram`, com duas tentativas totais. Nenhuma falha foi provocada contra o Telegram real.
- **Comando das 12 suítes focadas:** `pnpm --filter @workspace/api-server exec vitest run src/tests/telegram-worker-profile.test.ts src/tests/telegram-repasse-banco-descartavel.test.ts src/tests/lembrete-periodo-concorrencia.test.ts src/tests/lembrete-telegram-motor.test.ts src/tests/prescriptions-lembrete.test.ts src/tests/telegram-inbox-enviar-isolation.test.ts src/tests/telegram-inbox-multitenant-isolation.test.ts src/tests/telegram-webhook-guard.test.ts src/tests/telegram-webhook-secret.test.ts src/tests/telegram-config.test.ts src/tests/onboarding-envio-autorizacao.test.ts src/tests/onboarding-clinic-auth.test.ts --testTimeout=30000` — **12 suítes e 190 testes passaram**.
- **Comando de verificação de tipos:** `pnpm --filter @workspace/api-server run typecheck` — falhou com 169 erros em 52 arquivos, inclusive problemas de tipos de arquivos não relacionados e uma importação entre api-server e api-worker fora do `rootDir`. O arquivo de teste de outbox alterado não aparece na lista de erros.
- **Comando de integridade do diff:** `git diff --check` — passou.
- **Comando de build do worker:** o workflow `api-worker: Telegram development` executou `pnpm run build` e iniciou após o reinício — passou; perfil restrito e primeiro tick do novo processo foram registrados sem expor conteúdo ou destino.
- **Comando do envio controlado:** execução única com `pnpm --filter @workspace/api-server exec tsx -e` para validar os vínculos, inserir mensagem sintética e repasse na base de desenvolvimento, observar os estados e ler o resultado; o roteiro não foi salvo como script reutilizável.
- **Limites preservados:** somente um envio não clínico à conversa B; nenhum paciente contatado; nenhum webhook, destino de produção ou autorização alterado; lembretes gerais continuam desligados e não foram agendados pelo perfil restrito.
- **Estado:** encaminhamento real pelo worker comprovado para uma mensagem controlada; retentativa após falha/reinício comprovada somente em banco descartável e com transporte simulado; typecheck global e revisão independente pendentes. **BLOQUEADO para HOMOLOGAÇÃO.**
