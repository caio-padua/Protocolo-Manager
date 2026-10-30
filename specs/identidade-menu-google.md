# Especificacao — Identidade do profissional, menu e acesso Google

Data: 30/10/2026
Estado: IMPLEMENTADO; HOMOLOGACAO DO GOOGLE PENDENTE

## Objetivo

Exibir a identidade do colaborador autenticado no rodape do menu lateral, oferecer entrada e troca de usuario nesse ponto e acrescentar login Google sem remover o login atual nem conceder acesso clinico a uma conta nao vinculada.

## Requisitos

1. Preservar o login por usuario e senha, o primeiro acesso existente, os tokens de colaborador e as protecoes atuais das rotas.
2. Adicionar login Google pela autenticacao gerenciada da Replit, mantendo o Google como opcao adicional.
3. Vincular uma conta Google somente quando houver, na mesma requisicao, uma sessao Google valida e o token atual de colaborador do profissional.
4. Persistir o identificador imutavel da conta Google separadamente para desenvolvimento e producao; nao confiar em nome, e-mail ou identificador enviados pelo navegador para decidir qual profissional esta autenticado.
5. Emitir o token normal de colaborador apenas para cadastro ativo e vinculado. Conta Google sem vinculo, profissional inativo, identificador duplicado ou conflito de vinculo devem ser recusados.
6. Nao criar profissionais automaticamente, nao vincular por semelhanca de nome e nao selecionar um profissional pelo identificador enviado pelo navegador.
7. Mostrar no rodape do menu o primeiro nome, as iniciais dos nomes intermediarios e o sobrenome, sem titulo profissional. Exemplo: “Caio H. F. Padua”.
8. Mostrar a funcao do profissional na segunda linha e o CPF na terceira linha. O CPF fica mascarado por padrao e pode ser revelado por acao explicita. CPF ausente aparece como “—”.
9. Tornar o bloco inferior do menu interativo: sem sessao, oferecer entrada; com sessao, permitir vincular Google e trocar de usuario. Trocar de usuario encerra tanto a sessao do colaborador quanto a sessao Google.
10. Atualizar o link do Cockpit para a rota canonica `/cockpit`; manter as demais rotas atuais.
11. Registrar tentativas de vinculo e logins Google na auditoria sem gravar senhas, cookies, tokens ou dados secretos.
12. Seguir o layout Paxter existente: sidebar navy, relevo 3D existente, slots fixos, alinhamentos verticais estaveis, acessibilidade por teclado e alvos utilizaveis no celular.
13. Usar migracao aditiva e repetivel para o identificador Google. Nao remover nem renomear coluna existente.
14. Nao enviar comunicacoes reais, nao alterar cobrancas e nao modificar o fluxo de licenciamento.

## Impacto e dependencias

- Interface: pagina de acesso, rotas de retorno da autenticacao Google e rodape da sidebar.
- Servidor: validacao da sessao Google, vinculo de credenciais existentes, emissao do token de colaborador e consulta do perfil autenticado.
- Banco de dados: identificadores Google separados para desenvolvimento e producao, com indices unicos parciais, aplicados antes de o servidor aceitar requisicoes.
- Permissoes: o identificador Google nunca substitui `requireCollaborator`; ele apenas permite emitir o token atual depois de vinculo comprovado.
- Plataforma: a autenticacao gerenciada precisa ser provisionada e o provedor Google precisa estar habilitado separadamente para desenvolvimento e producao.

## Falhas previstas e barreiras

| Cenario | Barreira | Resultado esperado |
|---|---|---|
| Google indisponivel ou ainda nao habilitado | Manter o formulario atual funcional | Mostrar erro claro; senha continua disponivel |
| Conta Google ainda sem vinculo | Exigir login atual no PADCOM e vinculacao explicita pelo menu | Nenhum token clinico emitido antes do vinculo |
| Sessao PADCOM ausente ou profissional inativo | Validar no servidor o token e o cadastro ativo | Recusar sem revelar se o usuario existe |
| Conta Google ja vinculada a outro profissional | Indice unico e verificacao no servidor | Recusar sem sobrescrever vinculo |
| Profissional ja ligado a outra conta Google | Comparar identificador persistido | Recusar; nunca trocar silenciosamente |
| Duas vinculacoes simultaneas | Indice unico no banco e tratamento de conflito | Uma vinculacao vence; a outra recebe recusa segura |
| Sessao expirada | Revalidar sessao antes de emitir token | Limpar estado local e pedir novo acesso |
| CPF ausente | Renderizar o slot fixo com “—” | Nao inventar nem deslocar os campos |
| Falha de migracao | Executar migracao antes do `listen` | Servidor nao anuncia autenticacao pronta |

## Definicao de pronto

1. Login atual por usuario e senha continua funcionando sem regressao.
2. Conta Google vinculada a cadastro ativo recebe somente o token de colaborador daquele cadastro.
3. Conta Google nao vinculada, sessao PADCOM ausente, usuario inativo, identificador repetido e conflitos de vinculo sao recusados.
4. Testes usam exclusivamente profissionais e contas sinteticas; nao acessam nem alteram cadastros clinicos reais.
5. O rodape mostra nome formatado, funcao e CPF mascarado; o controle de revelar/ocultar funciona.
6. A entrada e a troca de usuario funcionam em desktop e celular; a sessao Google e a sessao do colaborador sao encerradas na troca.
7. Os links do menu continuam validos e o Cockpit usa a rota canonica.
8. Revisao independente sequencial, testes de servidor, verificacao visual e logs sem erros inesperados.
9. Se o provedor Google nao puder ser habilitado pelo agente, a implementacao fica identificada como bloqueada para o teste OAuth real; nao declarar homologacao completa.

## Evidencias e pendencias

- Implementacao da interface, rotas e validacao de identidade concluida.
- Testes sinteticos: 5 casos de identidade visual e 13 casos de autenticacao e vinculacao.
- Verificacao de interface com dados ficticios em computador e celular: nome, cargo, CPF mascarado, validacao Google e troca de usuario visiveis; sem login real nem dados clinicos.
- Teste ponta a ponta da Dieta: 3 casos aprovados depois da limpeza do cache antigo do Vite.
- Builds de PADCOM e do servidor aprovados; avisos preexistentes de tamanho de pacote e de propriedades duplicadas permanecem fora do escopo.
- Habilitar o provedor Google no painel de autenticacao da Replit, em desenvolvimento e producao, e testar o retorno OAuth real.
- A tela autenticada ainda depende de sessao real para verificacao visual; nao foi criada excecao de autenticacao para esse teste.
- A revisao independente prevista pelo PAXTER Loop nao ficou disponivel neste ambiente; foi feita conferência direta do codigo, sem declarar revisao independente.

## Linhas vermelhas

- Nao remover nem migrar o login atual para outro provedor.
- Nao confiar em identidade, funcao, CPF ou vinculo informados pelo navegador.
- Nao abrir rotas clinicas sem o token de colaborador existente.
- Nao exibir CPF completo por padrao.
- Nao alterar cobrancas, empresas, licenciamento, dados de clientes ou fluxos de envio.
- Nao sincronizar com o GitHub sem autorizacao expressa separada.
