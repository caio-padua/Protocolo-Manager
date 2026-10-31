# Especificacao — Identidade, acesso e isolamento entre clinicas

Data: 30/10/2026
Estado: EM CONSTRUCAO — unidade de identidade e acesso em andamento
Responsavel: Dr. Replit Paxter

## 1. Objetivo

Preparar o Padcon Conect para que profissionais usem um cadastro canonico, acessem o sistema com senha por e-mail ou Cadastro de Pessoas Fisicas (CPF), preservem o acesso atual durante a regularizacao dos cadastros, e vejam somente dados das clinicas autorizadas.

## 2. Autorizacoes e limites

1. O CEO autorizou ativar o isolamento completo entre clinicas.
2. O CEO escolheu preservar o acesso atual ate que os cadastros tenham e-mail ou CPF preenchidos.
3. O acesso Google permanece como alternativa adicional, somente para identidade Google vinculada ao cadastro profissional.
4. O CEO confirmou que seu acesso global deve usar o cadastro atual de Médico Principal. A permissão global será gravada em um campo administrativo separado; o sistema não a inferirá do marcador clínico em cada requisição.
5. Esta autorizacao nao permite alterar cobrancas, tarifas, pagamentos reais, contratos comerciais, nem publicar o sistema ou sincronizar o GitHub.
6. Nenhum teste de seguranca pode usar prontuarios ou enviar mensagens reais.
7. Migracoes devem ser aditivas e nao destrutivas; nao usar DROP, TRUNCATE ou apagamento de dados.

## 3. Fonte canonica da identidade

1. A tabela `professionals` e o cadastro canonico de medicos e demais colaboradores.
2. Corpo Clinico, Configuracoes do Medico, Meu Acesso, prescricoes e pedidos de exames devem referenciar o mesmo `professionalId`; nao criar um segundo cadastro do medico principal.
3. Campos de identidade, registro profissional, contato e funcao devem ter um contrato unico entre cadastro, consulta e atualizacao.
4. Senha e identificadores internos do provedor Google nunca podem ser devolvidos em respostas publicas.
5. Alteracao de senha pelo proprio usuario exige sessao valida, confirmacao da senha atual, e atualiza somente a conta da sessao.
6. Nenhuma rota de autosservico pode aceitar do navegador o identificador de outra pessoa para trocar credenciais.

## 4. Entrada gradual por e-mail ou CPF

1. Durante a transicao, contas sem e-mail e CPF continuam podendo usar o acesso atual.
2. O e-mail deve ser normalizado sem diferenciar maiusculas/minusculas; o CPF deve ser normalizado para somente digitos.
3. Um identificador nao pode autenticar mais de um profissional ativo.
4. Depois que o cadastro receber e-mail ou CPF, a autenticacao por senha passa a aceitar o identificador cadastrado; o login antigo deixa de ser aceito para aquela conta.
5. A resposta de login continua generica para evitar revelar se um cadastro existe.
6. Tentativas de login nao devem gravar senha, e-mail ou CPF em texto claro na auditoria.
7. O acesso Google continua separado e somente funciona quando a identidade ja estiver vinculada ao mesmo profissional.

## 5. Modelo de clinica e unidade

1. `empresas` representa a clinica ou organizacao licenciada; `locations` representa seus enderecos/unidades fisicas.
2. A sessao de colaborador deve obter a identidade e seus vinculos do servidor; `empresaId`, `locationId` ou `role` enviados pelo navegador nao concedem acesso.
3. A participacao de profissionais em clinicas deve suportar varios vinculos sem duplicar o cadastro profissional.
4. A empresa ativa escolhida por uma pessoa deve ser uma associacao previamente autorizada e conferida no servidor em cada requisicao.
5. A autoridade do proprietario da plataforma deve vir de um registro de acesso protegido e verificavel; o cadastro de Médico Principal será vinculado explicitamente uma única vez, sem inferir autoridade global do marcador `isPrimaryDoctor` em cada requisição.
6. Uma requisicao sem empresa autorizada deve falhar fechada. A troca de empresa deve atualizar o contexto da sessao e nao reaproveitar dados do contexto anterior.
7. Todo dado clinico, arquivo, busca, fila, job e integracao deve aplicar o mesmo escopo de empresa. As unidades continuam subordinadas a sua empresa.
8. A arquitetura deve respeitar colunas e migracoes existentes; qualquer campo ausente sera adicionado de forma aditiva, sem substituir o banco ou apagar dados.

## 6. Interface e identidade visual

1. `/login`, `/sign-in` e `/sign-up` devem abrir no tema escuro como padrao, mantendo o controle de tema quando aplicavel.
2. Reutilizar tecido, simbolo, cores navy e ouro, paines Salientes/Bevel, campos Concavos/Well e variantes `.dark` ja existentes.
3. Corpo Clinico e Configuracoes do Medico devem editar e apresentar o mesmo registro e os mesmos campos canonicos.
4. Meu Acesso deve apresentar o primeiro e ultimo nome por extenso, iniciais do nome intermediario, cargo e CPF em posicoes fixas.
5. O menu esquerdo continua sendo a entrada para Meu Acesso; deve permitir trocar de usuario por encerramento da sessao atual, sem manter acesso anterior.
6. A tela deve manter alinhamentos por linhas-guia verticais, slots fixos, rótulos persistentes, campos editaveis claramente identificados e comportamento responsivo.
7. Nao exibir senha, hash, segredo ou identificador interno do Google.

## 7. Falhas previstas e respostas obrigatorias

| Cenario | Barreira | Resultado esperado |
|---|---|---|
| Sessao ausente, expirada ou revogada | Validacao no servidor | Recusa; sem dados clinicos |
| Empresa enviada pelo navegador sem vinculo | Conferir vinculo autorizado no banco | Recusa antes da consulta ou gravacao |
| Cliente pertence a outra empresa | Filtro por empresa na origem e na gravacao | Recusa sem revelar a outra empresa |
| Profissional sem e-mail e CPF durante a transicao | Manter credencial atual | Sem bloqueio acidental |
| E-mail/CPF duplicado | Verificacao e restricao de unicidade | Gravar nao; mensagem clara |
| Mudanca de senha de outro profissional | Usar professionalId da sessao | Recusa; nenhum dado alterado |
| Tentativa de usar Google nao vinculado | Conferir identidade persistida | Recusa sem associacao automatica |
| Troca de clinica com requisicao atrasada | Contexto e cache vinculados a sessao/empresa | Dados da clinica anterior nao aparecem |
| Empresa/contexto ausente | Politica fail-closed | Recusa, nunca assumir empresa fixa |
| Falha de migracao ou esquema divergente | Migracao aditiva e preflight | Parar antes de escrever dados |

## 8. Evidencia de auditoria inicial

1. A auditoria inicial encontrou contexto de empresa fixa, autoridade global indevida e bootstrap publico que permitia escolher um cadastro para reivindicar a primeira senha. O bootstrap anonimo e a enumeracao publica de profissionais foram desativados; a provisao inicial agora exige acesso administrativo autenticado.
2. `professionals` continua sendo o cadastro canonico, mas os formularios de medico e Corpo Clinico ainda nao apresentam contrato completo de campos em comum.
3. As rotas de listagem, detalhe e vinculos de profissionais agora exigem sessao e escopam os registros pela empresa autorizada; CPF, e-mail e dados contratuais nao sao retornados a colaboradores comuns. Operacoes administrativas exigem autoridade global autenticada.
4. A exclusao de profissional passou a desativar a conta, revogar sessoes e preservar o historico. A rota de auditoria ficou restrita ao proprietario da plataforma; a cobertura das demais rotas ainda esta pendente.
5. O banco consultado foi somente o ambiente de desenvolvimento: 16 profissionais e um unico Medico Principal. O cadastro global foi marcado explicitamente, sob a decisao do CEO; nao houve leitura de nomes, contatos, documentos ou prontuarios.
6. A consulta retornou apenas contagens agregadas. Nenhum dado de producao foi consultado ou alterado.
7. A auditoria estatica inicial contou 105 arquivos de rotas e referencias textuais em 29 deles. Essa contagem nao prova isolamento; cada rota, tarefa em segundo plano, arquivo e integracao ainda precisa de classificacao.

## 9. Unidades sequenciais

1. **Unidade A — decisao de identidade global:** DECISAO REGISTRADA. O cadastro atual de Medico Principal recebe a autoridade global somente no ambiente revisado.
2. **Unidade B — identidade e acesso:** BLOQUEADA PARA HOMOLOGACAO. Login gradual, troca de senha propria, atualizacao de identificadores, revogacao de sessoes, protecao do bootstrap e escopo das rotas de profissionais foram implementados e testados; revisao independente final e unificacao dos formularios profissionais ainda faltam.
3. **Unidade C — contexto e vinculos:** BASE IMPLEMENTADA, NAO CONCLUIDA. O servidor identifica o colaborador e valida a empresa selecionada; a cobertura dos pontos de leitura, gravacao e efeitos externos ainda falta.
4. **Unidade D — inventario e cobertura de rotas:** PENDENTE. Classificar e proteger rotas, tarefas em segundo plano, arquivos e integracoes.
5. **Unidade E — migracao e isolamento:** PENDENTE. Verificar todas as tabelas e caminhos clinicos sem perda de vinculos.
6. **Unidade F — verificacao e homologacao:** PENDENTE. Incluir testes sinteticos completos, revisao independente e homologacao das operacoes clinicas.

Cada unidade deve ser revisada, testada e aceita antes de iniciar a seguinte. Nenhuma unidade concluida, isoladamente, certifica o sistema inteiro para uso multiclínica.

## 10. Definicao de pronto para o objetivo completo

1. A autoridade de plataforma e cada vinculo de clinica sao verificaveis no servidor.
2. Todas as rotas, jobs, arquivos e integracoes que lidam com dados de clinica estao classificadas e testadas.
3. Consultas, criacoes, alteracoes, buscas e respostas filtram a empresa autorizada.
4. Casos positivos e tentativas entre empresas falham/passam conforme esperado em ambiente sintetico isolado.
5. A migracao e aditiva, verificavel e nao perde vinculos existentes.
6. Login gradual, troca de senha propria e Google adicional preservam as contas sem identificadores durante a transicao.
7. Corpo Clinico, medico, prescricoes e exames usam o cadastro canonico correto.
8. A interface segue o sistema visual Paxter e foi verificada em computador e celular.
9. Ha revisao independente, evidencias de banco, rotas, tela e logs; nenhuma falha impeditiva permanece.
10. O sistema nao sera declarado homologado nem seguro para operacao multiclínica ate todos os itens acima passarem.

## 11. Decisao do CEO

O CEO escolheu o cadastro atual de Médico Principal para receber a permissão global de plataforma. A autoridade fica em campo administrativo separado e nunca e inferida de `isPrimaryDoctor`. A migracao cria colunas e indices, mas nao promove automaticamente nenhum perfil. A atribuicao global e revisada por ambiente; isso evita conceder poder global ao Medico Principal de uma clinica licenciada.

## 12. Evidencia da implementacao em 31/10/2026

1. O banco de desenvolvimento tem 16 profissionais, um Medico Principal e um proprietario da plataforma; ambos sao o mesmo cadastro, conforme autorizado. Producao nao foi consultada ou alterada.
2. A migracao aplicada no desenvolvimento adicionou campos e indices de forma aditiva. O arquivo de migracao nao atribui autoridade global automaticamente.
3. Foram aprovados 33 testes focados de login, transicao de usuario, alteracao de senha, revogacao de sessao, contexto de empresa, bloqueio anonimo e isolamento de leitura/edicao de profissionais.
4. O servidor recompilou e iniciou na porta 8080 apos as alteracoes. O teste completo de tipos continua falhando por erros preexistentes em outros arquivos; a ultima verificacao nao apontou erros nos arquivos de servidor alterados.
5. O teste completo de tipos da interface tambem continua falhando por erros preexistentes; os arquivos de interface alterados nao apareceram entre os erros.
6. A tela publica de login foi capturada apos o reinicio: tema escuro navy, risca de giz, ouro e campos legiveis. O console mostrou apenas avisos de ambiente de desenvolvimento.
7. Nao foram executadas prescricoes reais, pedidos reais de exames ou mensagens a clientes.
8. Nenhuma evidencia atual demonstra que todas as rotas clinicas estao isoladas. O sistema ainda nao pode ser declarado homologado para atendimento clinico nem comercializacao multiclínica.
9. A revisao independente inicial encontrou bloqueios no bootstrap publico e nas rotas de profissionais; as correcoes foram aplicadas. A revisao independente final nao ficou disponivel nesta sessao, portanto a homologacao desta unidade continua bloqueada.
