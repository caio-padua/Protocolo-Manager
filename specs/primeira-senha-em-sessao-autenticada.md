# Especificacao — primeira senha com sessao autenticada

Data: 31/10/2026
Estado: IMPLEMENTADO — homologacao final pendente de revisao independente e validacao em sessao real
Responsavel: Dr. Replit Paxter

## 1. Objetivo

Permitir que o profissional autenticado crie a primeira senha da propria conta quando ela ainda nao tiver senha, com confirmacao visual dos campos e sem reabrir o cadastro publico de credenciais.

## 2. Autorizacao e limites

1. O CEO confirmou que ainda possui uma sessao ativa em “Meu Acesso”.
2. O autosservico so atende a identidade vinculada ao token autenticado; o navegador nao escolhe o profissional-alvo.
3. A operacao so pode criar senha quando a conta estiver ativa e `passwordHash` estiver vazio.
4. Se ja existir senha, esta rota nao redefine nem substitui a senha; esquecimento de senha existente exige fluxo proprio de recuperacao.
5. Nao reativar o bootstrap publico, nao criar profissional, nao alterar usuario/e-mail/CPF, nao enviar mensagens e nao escrever em producao.
6. Uma senha existente nunca pode ser revelada; o controle de olho mostra somente o texto digitado naquele formulario.
7. Manter o layout escuro e o sistema Paxter existentes.

## 3. Requisitos

1. Na rota “Configuracoes → Meu Acesso”, mostrar “Criar minha senha” somente quando a resposta autenticada indicar que a conta nao tem senha.
2. Solicitar senha nova e confirmacao; exigir de 12 a 128 caracteres e conferir a igualdade antes do envio.
3. Criar `POST /api/collaborator/initial-password`, protegido por `requireCollaborator`.
4. Obter o profissional exclusivamente de `req.collaborator.professionalId`; ignorar ou rejeitar qualquer identificador de alvo enviado pelo navegador.
5. Confirmar conta ativa, senha ainda inexistente e versao de credencial atual no servidor.
6. Gravar o hash scrypt usando atualizacao condicional por identidade, senha ainda nula e versao anterior; incrementar a versao para que somente uma tentativa concorrente vença.
7. Emitir uma nova sessao para o proprio profissional; tokens anteriores ficam invalidados.
8. Registrar apenas o evento `password_initialized` e a invalidacao das sessoes, sem senha, hash, e-mail ou CPF nos detalhes da auditoria.
9. Depois do sucesso, renovar a sessao local sem desmontar a tela; mostrar a confirmacao sem exigir novo login imediato.
10. Incluir controle acessivel de revelar/ocultar nos campos de senha do login e de “Meu Acesso”, com nome acessivel, estado pressionado, teclado e alvo de toque de pelo menos 40 pixels.
11. O controle de revelacao atua apenas no valor digitado no campo e volta a ocultar ao desmontar a tela.

## 4. Impacto e dependencias

- Interface: formulario “Meu Acesso” e campo de senha da tela `/login`.
- Servidor: rota autenticada, validacao da conta, gravacao concorrente segura, nova sessao e auditoria sem segredo.
- Banco: reutiliza `passwordHash` e `credentialVersion`; nao requer migracao.
- Consumidores: o login existente passa a aceitar a senha definida; todas as rotas continuam usando a sessao autenticada atual.
- Integracoes externas: nenhuma.

## 5. Falhas previstas e barreiras

| Cenario | Barreira | Resultado esperado |
|---|---|---|
| Sessao ausente, expirada ou revogada | `requireCollaborator` | HTTP 401; nenhuma alteracao |
| Conta inativa ou ausente | consulta pelo profissional da sessao | Recusa; nenhuma alteracao |
| Conta ja tem senha | verificacao no servidor e atualizacao condicional | HTTP 409; hash existente preservado |
| Senha curta ou longa demais | validacao no servidor | HTTP 400; nenhuma alteracao |
| Tentativa enviada para outro profissional | alvo derivado somente da sessao | Nenhuma outra conta alterada |
| Duas primeiras senhas concorrentes | `passwordHash IS NULL` e versao anterior na gravacao | Uma vence; a outra recebe conflito |
| Banco falha antes da gravacao | operacao falha fechada | Nenhuma confirmacao falsa |
| Sessao antiga reutilizada | incremento de `credentialVersion` | HTTP 401 para token anterior |
| Resposta de sucesso perdida | repeticao encontra hash existente | HTTP 409; nao sobrescreve senha |
| Olho usado por teclado ou toque | botao acessivel com rotulo e estado | Alterna apenas a exibicao local |
| Usuario esqueceu senha que ja existia | esta rota nao permite redefinir | Manter senha; informar que recuperacao e outra jornada |

## 6. Definicao de pronto

1. Testes sinteticos cobrem sessao ausente, senha existente, comprimento invalido, sucesso, alvo forjado, concorrencia e token antigo.
2. O caminho permitido altera somente o profissional autenticado; o hash e verificavel, o texto puro nao persiste, a versao incrementa e a sessao nova funciona.
3. O caminho proibido nao altera o hash, a versao nem outra conta.
4. Auditoria e resposta nao contem senha ou hash.
5. O login continua funcionando com a nova senha.
6. Os controles de mostrar/ocultar funcionam por toque e teclado, preservam o tema escuro e nao deslocam os campos.
7. Verificacao executada: 38 testes de autenticacao da API passaram; 2 testes de interface passaram em celular e computador com respostas simuladas; compilacao do servidor e da interface passou.
8. A tela publica de acesso foi conferida visualmente em celular; “Meu Acesso” foi exercitado por teste automatizado com identidade sintetica, nao por uma sessao real do CEO.
9. Revisao independente sequencial obrigatoria antes da homologacao; sem ela, o estado fica BLOQUEADO, nao HOMOLOGADO.
10. Sem sessao de colaborador real no navegador de verificacao, nao declarar a tela autenticada visualmente aprovada.

## 7. Linhas vermelhas

- Nao habilitar configuracao publica por identificador do profissional.
- Nao permitir redefinir uma senha existente sem fluxo proprio de recuperacao.
- Nao retornar nem registrar senha ou hash.
- Nao alterar cobrancas, licenciamento, prontuarios, prescricoes, exames ou dados reais.
- Nao sincronizar com o GitHub sem autorizacao separada.
