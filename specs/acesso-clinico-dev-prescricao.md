# PAXTER Loop — acesso do CEO à prescrição no desenvolvimento

## 1. Objetivo

Restabelecer o caminho de login após indisponibilidade transitória da API e habilitar, com auditoria, o acesso direto do médico proprietário à unidade Instituto Padua no banco de desenvolvimento.

## 2. Requisitos

1. Identificar e registrar a causa do erro de conexão mostrado no login.
2. Antes de enviar o login, consultar a prontidão do servidor por até três verificações; fazer apenas uma requisição de login. Respostas HTTP de credenciais inválidas não são repetidas.
3. Não repetir recuperação de senha nem outras requisições que possam gerar efeitos externos.
4. Confirmar o escopo da cliente: unidade 8, empresa 5; confirmar o médico ativo e proprietário global de identificação 6 e sua associação à unidade.
5. No banco Replit de desenvolvimento, conceder ao médico 6, somente na unidade Instituto Padua (8, empresa 5): prescrição, pedidos de exames e responsabilidade médica.
6. Não conceder o sinalizador de administrador local ao cadastro médico; o proprietário global já tem autoridade de plataforma e a regra local exige categoria administrativa.
7. Garantir a tabela de auditoria de concessões, conforme a migração existente, e registrar o estado anterior e posterior da alteração.
8. Não emitir documentos, alterar dados clínicos, enviar mensagens, modificar produção, integrar a branch ou publicar.

## 3. Falhas previstas e barreiras

| Falha | Barreira |
|---|---|
| API ainda não iniciou quando o login é enviado | Verificações limitadas de prontidão antes do único envio de credenciais |
| Resposta do login se perde após o servidor processá-lo | Nunca repetir o pedido de login; evitar duplicar registros de acesso |
| Credencial inválida | Manter a resposta da API; não tentar alterar nem revelar senha |
| Unidade ou empresa divergente | Conferir vínculo da cliente e do profissional no banco antes da concessão |
| Permissão ampla por acidente | Conceder apenas ao profissional 6 e à unidade 8; não alterar a matriz global |
| Falha de auditoria | Criar a tabela aditivamente e gravar auditoria na mesma transação da concessão |
| Efeito clínico ou externo inesperado | Nenhuma emissão ou integração de envio faz parte deste escopo |

## 4. Definição de concluído

1. Login aguarda a prontidão do servidor e envia credenciais uma única vez.
2. Teste automatizado cobre prontidão imediata, falha transitória na checagem, resposta HTTP recusada sem repetição e indisponibilidade persistente.
3. A API de desenvolvimento responde ao teste de saúde; uma credencial sintética inválida recebe resposta HTTP 401, não erro de conexão.
4. O banco de desenvolvimento mostra a concessão exata e a auditoria correspondente.
5. O resolvedor clínico identifica o médico responsável da unidade 8; a matriz global e as concessões locais autorizam prescrição e pedido de exames para o papel médico.
6. Testes clínicos existentes passam; nenhum documento é emitido e nenhum envio externo ocorre.
7. A captura visual confirma a tela de login carregando; a interface autenticada não será declarada visualmente verificada sem uma sessão disponível.

## 5. Linhas vermelhas

- Não acessar nem modificar banco de produção.
- Não mostrar, redefinir, testar ou registrar senha real.
- Não conceder autorização com base em empresa ou unidade informada pelo navegador.
- Não emitir prescrição, pedido de exames ou mensagem real nesta execução.
- Não fazer merge, push ou publicação.

## 6. Evidência da investigação

- O erro visual é produzido pelo `catch` da chamada de login quando `fetch` não recebe resposta.
- Os registros do fluxo mostram erro de proxy `ECONNREFUSED` para `127.0.0.1:8080` durante a inicialização, seguido pelo servidor da API iniciando na porta 8080.
- A chamada atual ao estado de saúde responde HTTP 200; uma tentativa de login com identificador sintético inválido responde HTTP 401 e JSON, confirmando que a API está alcançável.
- O cadastro proprietário 6 está ativo, é médico, tem CRM cadastrado e vínculo com a unidade 8 da empresa 5.
- A cliente 11 está vinculada à unidade 8 e à empresa 5.
- A concessão local ainda não existe e a tabela `clinical_access_audit` também está ausente no banco de desenvolvimento.
- A matriz armazenada contém permissões legadas; a normalização atual acrescenta as ferramentas clínicas e permite prescrição e pedido de exames ao papel médico. A matriz global não será alterada.

## 7. Alterações executadas

- A tela consulta a prontidão do servidor antes de enviar uma única requisição de login.
- A tabela de auditoria e os índices foram criados de forma aditiva, conforme a migração vigente.
- A concessão local e o registro de auditoria antes/depois foram gravados na mesma transação.
- O resultado foi registrado sem inserir senha ou outro segredo.

## 8. Resultado da construção e teste

- A rota de saúde da API respondeu HTTP 200.
- O login com identificador sintético inválido respondeu HTTP 401 com JSON, confirmando alcance da rota sem testar senha real.
- A tela de login carregou em captura de computador e celular, sem erro de rede no navegador.
- A chamada de login é enviada uma única vez, depois de até três verificações limitadas de prontidão do servidor.
- Testes do helper de login: 4 aprovados; cobrem prontidão imediata, recuperação da checagem após falha de rede, não repetição de HTTP 401 e encerramento após três falhas.
- Construção do site: concluída; avisos preexistentes de chaves duplicadas em `preview-validacao.tsx`, mapas de fonte e tamanho de bloco foram registrados, sem falha do processo.
- Testes de prescrição existentes: 12 aprovados.
- Banco de desenvolvimento: tabela de auditoria e índices criados conforme a migração vigente; concessão e auditoria gravadas na mesma transação.
- Concessão registrada para profissional 6 e unidade 8 / empresa 5: prescrição `true`, pedido de exames `true`, responsável médico `true`, administrador local `false`.
- O estado anterior foi vazio; há uma linha de auditoria. Nenhum outro profissional, unidade ou matriz global foi alterado.
- Nenhuma prescrição, exame, mensagem externa ou alteração clínica foi criada.
- Nenhuma sessão autenticada foi usada nesta verificação; a rota de login com a credencial do usuário não foi testada pelo agente.
- Revisão independente não disponível nesta sessão; resultado técnico não equivale a homologação independente.

## 9. Estado

BLOQUEADO PARA HOMOLOGAÇÃO — código, permissões e evidências locais estão preparados; falta revisão independente. O usuário pode tentar entrar no ambiente de desenvolvimento, mas a emissão não foi homologada nem executada.
