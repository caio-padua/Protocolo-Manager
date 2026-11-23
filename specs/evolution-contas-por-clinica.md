# Especificação — Contas Evolution isoladas por clínica

## Objetivo
Adicionar suporte de servidor a três contas Evolution lógicas por clínica (empresarial legado, pessoal do proprietário e terceira conta configurável), sem modificar a conexão empresarial existente, sem presumir capacidade do provedor e sem iniciar envios.

## Requisitos
1. Manter inalteradas as consultas e gravações da configuração empresarial legada em evolution_instancias e os segredos evolution.apiKey.<empresa> e evolution.webhookToken.<empresa>.
2. Representar a conta empresarial como origem legada somente leitura nas novas operações; não copiar configuração nem mensagens para novas tabelas.
3. Criar contas pessoais e adicionais por chave fixa dentro da empresa da sessão; empresa, tipo, proprietário e conta nunca podem ser confiados ao corpo da requisição.
4. Vincular a conta pessoal ao profissional proprietário autenticado. A conta pessoal e a terceira conta são administradas somente pelo proprietário da plataforma; outros colaboradores não podem enumerá-las por identificador.
5. Persistir configuração adicional e controles por (empresa_id, account_key), com estados independentes connection_enabled, capture_enabled, learning_enabled e replies_enabled; todos começam desligados.
6. Usar chaves distintas do cofre cifrado por clínica e account_key. Nunca devolver credenciais; impedir que o identificador da conta acesse a credencial de outra conta ou empresa.
7. Amarrar notificações automáticas do provedor a empresa + conta + token + nome da instância. Rejeitar token incorreto e instância divergente; nunca cair no caminho da conta empresarial.
8. Se captura estiver habilitada explicitamente, guardar eventos de mensagem em armazenamento próprio por conta, com origem não classificada; não encaminhar ao atendimento, aprendizado ou resposta. Se desligada, não persistir o corpo da mensagem.
9. Nenhuma rota nova envia mensagens ou solicita código de pareamento automaticamente. A rota de consulta/pareamento fica disponível apenas após configuração e ativação explícitas, mas não será chamada nos testes.
10. Migração aditiva e repetível; sem DROP, UPDATE ou backfill nas tabelas atuais. Não executar migração em banco real durante o desenvolvimento.
11. Testes com PostgreSQL isolado e dados sintéticos cobrem duas empresas, duas contas, permissões, configuração legada intacta, toggles, webhook, idempotência e falta de efeitos externos.
12. Impedir que duas contas reivindiquem a mesma instância do provedor, inclusive entre a configuração empresarial legada e as contas novas.

## Impacto e compatibilidade
- Mantêm-se sem alteração as rotas atuais /evolution/config, /evolution/conexao, /evolution/qr, /evolution/webhook/registrar e /evolution/webhook/:empresaId/:token.
- Consumidores existentes continuam usando lerConfig(empresaId) e as chaves legadas, portanto seguem ligados exclusivamente à conta empresarial.
- Novas contas usam tabelas, segredos, notificações automáticas e registros de mensagens separados; nenhuma conversa legada é copiada.
- O acesso do proprietário é conferido pelo contexto autenticado do servidor e pelo professionalId, além do requireCollaborator existente.

## Falhas previstas
| Falha | Barreira | Prova |
|---|---|---|
| Conta ou empresa de outra clínica passada no corpo/URL | usar empresa da sessão e filtro composto em cada SQL; resposta genérica 404 | chamadas com IDs cruzados |
| Colaborador tenta abrir conta pessoal | exigir proprietário da plataforma e titular igual; esconder existência com 404 | teste de perfil não autorizado |
| Credencial cruzada entre contas | chave cifrada inclui empresa e account_key; GET nunca retorna segredo | comparar chaves e rotas |
| Evento vindo de instância errada ou token errado | token constante e instância exata; sem persistência | testes de webhook |
| Duas contas apontam para a mesma instância do provedor | checagem cruzada com configuração legada e índice único entre novas contas | tentativa de reuso de instância |
| Captura desligada | retornar sucesso neutro sem salvar corpo | SELECT no banco isolado |
| Eventos duplicados | índice único por empresa+conta+provider_id | reenvio de fixture sintética |
| Conta empresarial interrompida | não regravar nem trocar legado; não chamar provedor no teste | snapshot da linha legada e regressão atual |
| Capacidade insuficiente no Railway/Evolution | não provisionar nem declarar suporte operacional | limitação registrada; teste apenas local |

## Definição de pronto
- O registro empresarial legado permanece idêntico antes e depois da migração isolada.
- As rotas novas não atravessam empresa nem conta e recusam permissões insuficientes.
- Contas pessoais/adicionais começam sem conexão, captura, aprendizado ou respostas habilitados.
- Webhook de conta grava somente em armazenamento isolado quando captura está ligada e nunca dispara atendimento/envio.
- A suíte regressiva Evolution passa; endpoints novos respondem sem sessão com 401 no smoke test.
- Nenhum aparelho foi pareado, mensagem foi enviada, implantação foi publicada ou serviço Railway foi alterado.

## Linhas vermelhas
- Não modificar valores, chaves ou linhas legadas da conta empresarial.
- Não alterar o motor de atendimento, as rotas antigas de envio, o tom de voz ou os bancos de mensagens existentes.
- Não ler conversas privadas nem usar dados pessoais em testes.
- Não presumir que Railway ou Evolution comportem três instâncias; a configuração em código não prova capacidade hospedada.
- Não implementar as tarefas #801 a #804.
