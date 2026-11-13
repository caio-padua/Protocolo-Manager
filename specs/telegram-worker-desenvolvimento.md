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
| Worker não consegue ler o cofre ou o banco no seu contexto | Alta | Não registrar mensagem de erro ou credenciais; classificar a falha sem expor valores e confirmar o primeiro tick | Exigir tick concluído antes de afirmar retomada ativa |

## Definição de pronto
1. A especificação e a implementação mostram que o perfil de desenvolvimento registra apenas um cron do outbox.
2. Testes sintéticos cobrem o perfil restrito, a guarda contra duplicação, retomada, concorrência e falhas já previstas pelo outbox.
3. As suítes de lembretes confirmam os textos por dia e período e versículo apenas no sábado, sem adicionar cron.
4. O `api-worker` compila e passa pela checagem de tipos.
5. Um único workflow de desenvolvimento inicia, permanece ativo, registra o primeiro tick concluído e continua ativo após um reinício.
6. Logs identificam o perfil e os ticks sem expor texto, identificadores de clientes, destinos ou segredos.
7. Revisão independente examina esta especificação e as alterações; sem ela, o estado permanece BLOQUEADO, nunca HOMOLOGADO.

## Evidências de linha de base antes da implementação
- A árvore local estava limpa.
- O outbox de desenvolvimento não tinha linhas em nenhum estado.
- Quatro suítes focadas passaram: 50 testes.
- Compilação e checagem de tipos do `api-worker` passaram.
- Não havia workflow nem processo do `api-worker` ativo.
- O Job 2 de lembretes e a retomada do outbox já existiam no worker; o perfil padrão completo também inicia outros trabalhos com efeitos externos.
- A primeira tentativa do workflow confirmou o perfil restrito, mas falhou porque a porta padrão 8081 já era atendida pelo serviço de prévia do mockup; nenhum tick ocorreu. O perfil restrito passou a não abrir essa porta.
- A segunda tentativa permanece em execução, mas o carregamento inicial do cofre registrou erro genérico; a fila segue vazia. O primeiro tick precisa confirmar acesso operacional ao outbox antes de declarar a retomada funcional.
