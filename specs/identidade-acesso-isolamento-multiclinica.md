# Especificacao — Identidade, acesso e isolamento entre clinicas

Data: 30/10/2026
Estado: EM ESPECIFICACAO — bloqueada pela identificacao segura do acesso global da plataforma
Responsavel: Dr. Replit Paxter

## 1. Objetivo

Preparar o Padcon Conect para que profissionais usem um cadastro canonico, acessem o sistema com senha por e-mail ou Cadastro de Pessoas Fisicas (CPF), preservem o acesso atual durante a regularizacao dos cadastros, e vejam somente dados das clinicas autorizadas.

## 2. Autorizacoes e limites

1. O CEO autorizou ativar o isolamento completo entre clinicas.
2. O CEO escolheu preservar o acesso atual ate que os cadastros tenham e-mail ou CPF preenchidos.
3. O acesso Google permanece como alternativa adicional, somente para identidade Google vinculada ao cadastro profissional.
4. O CEO e a autoridade global da plataforma, mas a conta profissional que recebera essa autoridade ainda precisa ser identificada por um vinculo verificavel no servidor.
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
5. A autoridade do proprietario da plataforma deve vir de um registro de acesso protegido e verificavel; nao inferir autoridade global de `isPrimaryDoctor`, nome, cargo recebido do cliente ou empresaId informado pelo navegador.
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

1. O middleware de tenant atual atribui empresa fixa e autoridade global a todas as requisicoes; isso e um bloqueio de seguranca.
2. O cadastro profissional ja e unico em `professionals`, mas os formularios de medico e Corpo Clinico nao oferecem os mesmos campos.
3. A serializacao atual de profissionais inclui a linha inteira do banco; deve ser substituida por contratos explicitos, sem senha ou identificadores Google.
4. A rota atual de credenciais aceita um identificador alvo vindo do navegador; nao pode ser reutilizada para autosservico.
5. O banco consultado foi somente o ambiente de desenvolvimento: 12 empresas; 16 profissionais; os dois cadastros com senha nao tem e-mail nem CPF; os 16 profissionais estao vinculados a empresas, mas nenhum esta vinculado a empresa marcada como proprietaria da plataforma.
6. A consulta retornou somente contagens agregadas. Nenhum nome, contato, documento ou prontuario foi lido.
7. Ha 105 arquivos de rotas; 29 contêm referencias textuais a tenant/empresa. Essa contagem e apenas sinal de cobertura estatica, nao prova isolamento.

## 9. Unidades sequenciais

1. **Unidade A — especificacao e decisao de identidade global:** fechar quem recebe o acesso global da plataforma e registrar as regras de transicao.
2. **Unidade B — identidade e acesso:** serializadores seguros, login gradual por e-mail/CPF, troca de senha propria e contrato canonico de profissional.
3. **Unidade C — contexto e vinculos:** identidade autenticada, empresa ativa autorizada e mudanca segura de contexto.
4. **Unidade D — inventario e cobertura de rotas:** classificar rotas, jobs, arquivos e integracoes; corrigir cada fronteira de acesso sequencialmente.
5. **Unidade E — migracao e isolamento:** migracao aditiva e escopo em cada tabela e caminho clinico.
6. **Unidade F — verificacao e homologacao:** testes sinteticos de acesso permitido/proibido, concorrencia, persistencia, logs e revisao independente.

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

## 11. Pergunta bloqueadora

O banco de desenvolvimento nao tem profissional ligado a empresa proprietaria da plataforma. A escolha de qual registro pode receber acesso global precisa ser explicita; nao se deve inferir isso de cargo, nome, perfil clinico ou parametro do navegador.
