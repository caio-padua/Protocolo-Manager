# Para Dr. Chat e equipe — acesso proprio e recuperacao de senha

Data: 01/11/2026
Estado: implementado em desenvolvimento; revisao independente pendente; nao homologado
Escopo: ficha propria no Corpo Clinico, recuperacao de senha e historico pessoal

## 1. Decisao aprovada

O historico mostra valores anteriores e novos de campos comuns. CPF e e-mail aparecem protegidos. Senhas, hashes, tokens e codigos de recuperacao nao entram no historico.

## 2. O que foi implementado

1. A recuperacao aceita e-mail, CPF ou usuario atual, mas retorna a mesma resposta exista ou nao uma conta.
2. O destino do link e lido exclusivamente do e-mail ja salvo no cadastro profissional.
3. O link usa token assinado pelo servidor, ligado ao ambiente e a versao das credenciais, com validade de trinta minutos.
4. O token nao e gravado no banco. O incremento da versao de credenciais torna o link anterior inutilizavel e encerra sessoes anteriores.
5. A tela remove o token da barra de endereco depois de captura-lo; o valor fica somente na memoria da tela ate a validacao.
6. A senha nova tem validacao de comprimento e confirmacao. O olho de senha existente permanece disponivel.
7. O cadastro proprio e acessado pela ficha do Corpo Clinico, na aba Dados. A ficha recebe os controles somente quando pertence ao profissional da sessao.
8. O menu antigo Meu Acesso foi substituido por Meu Perfil; o acesso no rodape do menu tambem tem o botao Abrir meu cadastro.
9. A rota antiga continua como redirecionamento. A tela Medico Responsavel foi preservada porque atualiza o mesmo cadastro e mantem funcoes proprias.
10. O historico abre por alternancia, filtra pelo profissional autenticado e nao oferece acao de exclusao.
11. Mudancas do proprio cadastro feitas nos caminhos existentes registram os campos permitidos na trilha de auditoria.
12. Nenhum teste enviou e-mail real nem alterou cadastro clinico real.

## 3. Evidencias executadas

| Verificacao | Resultado |
|---|---|
| Suíte de rotas do colaborador | 49 testes aprovados; banco e envio de mensagem simulados |
| Compilacao do servidor | Concluida |
| Compilacao do aplicativo | Concluida; avisos preexistentes de chaves duplicadas em outra tela |
| Conferencia de tipos | Continua falhando em varios arquivos do repositorio; nao ha aprovacao global |
| Captura visual | Tela de recuperacao vista em celular e computador |
| Inicializacao | Os dois servicos reiniciaram; servidor registrou que esta escutando |
| Banco ativo e entrega de e-mail | Nao verificados nesta etapa |
| Ficha autenticada em navegador | Nao capturada porque o navegador de validacao nao possui sessao |
| Envio ao GitHub | Nao realizado |

## 4. Riscos e limites que permanecem

1. Os limites de tentativas de recuperacao ficam na memoria do processo e nao se coordenam entre varias instancias. Antes de escalar a hospedagem, deve-se usar armazenamento compartilhado.
2. A evidencia automatizada usa banco simulado; nao comprova persistencia no banco de desenvolvimento.
3. Nao houve teste de entrega real de e-mail. A funcao de envio foi substituida por simulacao durante os testes.
4. A pagina autenticada do Corpo Clinico ainda precisa ser conferida com uma sessao real autorizada, sem criar desvio de autenticacao.
5. A revisao independente foi tentada, mas nao estava disponivel nesta execucao. A homologacao permanece bloqueada.

## 5. Pedido de revisao ao Dr. Chat

Revisar os arquivos desta entrega e verificar:

1. A recuperacao nao permite descoberta de contas nem troca do destinatario pelo navegador.
2. Expiracao, uso repetido, duas conclusoes simultaneas e invalidacao de sessoes estao corretamente protegidos.
3. A ficha e o historico usam somente a identidade autenticada e nao permitem acesso cruzado entre profissionais ou clinicas.
4. A rota antiga, o rodape do menu e o item Meu Perfil encaminham ao mesmo cadastro.
5. Quais evidencias adicionais sao obrigatorias antes de permitir uso em producao ou com varias clinicas.

Nao aprovar por cortesia. Registrar os achados por gravidade. Esta carta nao e uma autorizacao para publicar, enviar e-mails reais ou abrir o atendimento clinico.
