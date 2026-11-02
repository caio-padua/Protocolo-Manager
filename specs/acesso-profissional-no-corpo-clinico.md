# Especificação — acesso e histórico no cadastro do Corpo Clínico

Data: 01/11/2026
Estado: EM CONSTRUÇÃO — esta revisão ainda não foi homologada
Responsável: Dr. Replit Paxter

## 1. Objetivo

Concentrar a administração da própria conta profissional na ficha correspondente do Corpo Clínico, preservar o padrão visual dessa ficha e oferecer recuperação segura de senha esquecida, com histórico consultável e sem exclusão pela aplicação.

## 2. Escopo autorizado

1. Dentro da aba “Dados” do Corpo Clínico, mostrar a área de acesso somente quando a ficha aberta corresponder ao profissional autenticado.
2. Reutilizar as rotas autenticadas existentes para consultar a identidade, alterar e-mail ou Cadastro de Pessoas Físicas (CPF), criar a primeira senha e alterar uma senha conhecida.
3. Criar recuperação para senha esquecida por link de uso único, enviado exclusivamente ao e-mail que já consta no cadastro profissional.
4. Não aceitar identificador de profissional, e-mail de destino ou clínica escolhidos pelo navegador na recuperação.
5. Acrescentar um histórico da própria conta, aberto por alternância na aba “Dados”.
6. Registrar os valores anteriores e novos de campos profissionais comuns em lista permitida; e-mail e CPF aparecem mascarados; senhas, hashes, tokens e códigos de recuperação nunca são armazenados no histórico.
7. Não oferecer exclusão de eventos nem criar rota de exclusão do histórico.
8. Retirar “Meu Acesso” do menu e encaminhar sua rota antiga ao Corpo Clínico, abrindo a ficha própria, somente depois de confirmar que a jornada abre para os perfis ativos suportados.
9. Preservar `/configuracoes/medico`; ela atualiza o mesmo registro profissional, mas possui funções específicas que não serão removidas nesta entrega.
10. Manter a tipografia, cores, campos, botões e relevo 3D existentes no Corpo Clínico.

## 3. Fora do escopo e linhas vermelhas

1. Não criar profissional, clínica, vínculo clínico ou autoridade de CEO.
2. Não permitir que a edição administrativa de uma ficha redefina a senha de outra pessoa.
3. Não criar recuperação por telefone, CPF isolado, pergunta secreta ou destino de e-mail escolhido pelo navegador; não ampliar a rota restrita de desenvolvimento já existente.
4. Não exibir ou registrar senha, hash, token bruto, código de recuperação, e-mail completo ou CPF completo no histórico.
5. Não apagar histórico, cadastro, profissional, clínica ou rota de compatibilidade.
6. Não enviar mensagem real durante testes; testes de e-mail devem usar um envio simulado.
7. Não alterar cobrança, licenciamento, prescrição, exames ou documentos clínicos.
8. Não sincronizar com o GitHub sem autorização expressa separada.

## 4. Desenho funcional

### 4.1 Acesso próprio no Corpo Clínico

1. A ficha de outra pessoa não recebe controles de credencial nem histórico pessoal do ator.
2. A identidade-alvo das operações autenticadas vem exclusivamente da sessão atual.
3. Alteração de e-mail ou CPF exige a senha atual e invalida sessões anteriores.
4. Criar a primeira senha permanece permitido apenas quando a conta autenticada não possui senha.
5. Alterar uma senha conhecida exige a senha atual, confirmação e o limite já usado pelo sistema.
6. O controle de revelar senha mostra somente o texto digitado naquele campo.

### 4.2 Recuperação de senha esquecida

1. A tela de acesso oferece “Esqueci minha senha”.
2. A solicitação aceita um identificador de login, mas não revela se ele existe.
3. Se houver cadastro ativo e e-mail registrado, o sistema envia link temporário ao e-mail armazenado.
4. O token aleatório é assinado com chave do servidor, não armazenado no banco, vale por 30 minutos e é vinculado ao ambiente e à versão de credenciais da conta.
5. Ao abrir o link, a interface remove o token da barra de endereço e o mantém somente na memória da tela.
6. A conclusão exige assinatura válida, prazo ativo, conta ativa e versão de credenciais igual; o incremento dessa versão torna o link inutilizável.
7. A conclusão grava a nova senha, incrementa a versão de credenciais e registra a auditoria numa transação.
8. Todas as sessões e links de recuperação anteriores ficam inválidos após a redefinição.
9. A mensagem de recuperação usa o motor de envio Hermes Paxter; nenhum envio de teste alcança um endereço real.
10. Conta sem e-mail utilizável não recebe redefinição por esse fluxo. A interface mantém a opção de acesso Google já vinculada e orienta a usar uma sessão ativa ou o responsável autorizado pela clínica.

### 4.3 Histórico próprio

1. Um controle de alternância abre e fecha o histórico na aba “Dados”.
2. Cada evento mostra data, ação e mudanças permitidas, com valores anterior e novo quando aplicável.
3. E-mail e CPF são mascarados; telefone, senha, hash, token e códigos não aparecem.
4. A consulta exige sessão válida e filtra exclusivamente pelo profissional autenticado.
5. A interface não contém ação de apagar; a API não oferece exclusão do histórico.
6. A aplicação oferece preservação contra exclusão pela própria tela e por rotas do produto; não promete imutabilidade contra um operador privilegiado do banco de dados.

### 4.4 Limite operacional antes de escalar

1. A limitação específica de pedidos de recuperação reside na memória do processo atual.
2. O limite geral da aplicação também usa armazenamento local do processo.
3. Esses limites não são compartilhados entre várias instâncias do servidor; antes de publicar várias instâncias, a proteção precisa ser movida para armazenamento compartilhado.

## 5. Registro profissional e tela “Médico Responsável”

1. `professionals` é a fonte única do cadastro profissional.
2. A edição no Corpo Clínico e a tela “Médico Responsável” são caminhos distintos para o mesmo registro, não cópias independentes.
3. Mudanças de nome, cargo, registro e especialidade feitas pelos caminhos existentes entram no histórico próprio quando o ator modifica o próprio cadastro.
4. Certificados, assinatura, especialidade e outras funções exclusivas da tela existente são preservadas.
5. Nenhuma tabela ou tela de cadastro é removida nesta etapa.

## 6. Impacto e dependências

| Camada | Alteração |
|---|---|
| Interface | Área “Acesso à conta” e alternância de histórico dentro de “Dados”; link “Esqueci minha senha”; formulário de nova senha |
| Servidor | Solicitação e conclusão da recuperação; histórico restrito à sessão; trilha de mudanças do próprio cadastro |
| Banco | Nenhuma tabela nova; a versão da credencial e a trilha de auditoria existentes são atualizadas em transação; tokens não são persistidos |
| Envio | Hermes Paxter, somente para o e-mail já cadastrado; nenhuma mensagem real durante os testes |
| Navegação | Rota antiga encaminhada à ficha própria; menu antigo removido após validação de acesso |
| Compatibilidade | Rotas de edição de profissional e médico principal preservadas |

## 7. Falhas previstas e barreiras

| Cenário | Barreira | Resultado esperado |
|---|---|---|
| Pedido sem identificador | Validação do corpo | Erro de formato sem consulta da conta |
| Identificador inexistente | Resposta genérica idêntica | Não revelar existência |
| Conta inativa ou sem e-mail | Resposta genérica | Nenhum link criado ou enviado |
| Tentativa de direcionar a recuperação a outro e-mail | Destino lido do cadastro no servidor | Campo do navegador ignorado ou rejeitado |
| Muitas solicitações | Limite por origem e intervalo por conta, dentro do processo atual | Bloqueio temporário sem informar se a conta existe; não coordena várias instâncias |
| E-mail não configurado ou envio falha | Resposta genérica; senha permanece igual; nenhum sucesso de envio é confirmado | Nenhuma redefinição falsa |
| Token expirado, consumido ou alterado | Validação atômica de validade, consumo e versão | Recusa sem alterar senha |
| Token repetido em duas requisições | Bloqueio transacional/condicional | Uma única redefinição vence |
| Sessões antigas | Incremento da versão de credenciais | Tokens antigos recebem recusa |
| Banco falha durante redefinição | Transação com atualização, consumo e auditoria | Nenhum sucesso parcial |
| Sessão ausente no histórico | Autenticação obrigatória | HTTP 401 e nenhum evento retornado |
| ID de outro profissional forjado | Identidade derivada da sessão | Nenhum dado de outra pessoa retornado |
| CPF ou e-mail alterado | Valores mascarados na auditoria | Nenhuma identificação completa exposta |
| Histórico consultado por outro profissional | Filtro no servidor por identidade da sessão | Somente histórico próprio |
| Tentativa de apagar histórico pela aplicação | Ausência de rota e de botão de exclusão | Histórico permanece |
| Ficha de outra pessoa aberta | Comparação com profissional da sessão | Área de credenciais e histórico não aparece |
| Usuário ativo sem ficha na lista da clínica | Compatibilidade não confirmada | Não remover a rota antiga nem o item de acesso |
| Mudança via “Médico Responsável” | Evento na rota existente | Histórico reflete a mesma fonte profissional |
| Layout estreito | Reuso do padrão e colunas empilhadas | Controles legíveis e operáveis em celular |

## 8. Plano de verificação

1. Testes de rota com estado de banco simulado e envio de e-mail substituído por função de teste.
2. Caminho permitido: solicitar, confirmar o destinatário cadastrado, redefinir, verificar hash, versão e auditoria, e autenticar com a nova senha.
3. Caminhos proibidos: conta ausente, destino forjado, token expirado e reutilizado, identidade alheia no histórico.
4. Concorrência: duas conclusões simultâneas do mesmo token; exatamente uma pode alterar a senha.
5. Privacidade: respostas e histórico não incluem senha, hash, token bruto, CPF completo ou e-mail completo.
6. A persistência ainda precisa ser conferida em banco de desenvolvimento isolado com cadastro sintético; os testes atuais não acessam o banco real.
7. Capturas públicas podem verificar somente a tela de recuperação; a ficha autenticada exige sessão válida e não pode ser conferida por um navegador sem login.
8. Logs após reinício dos serviços devem confirmar inicialização sem erro inesperado.
9. Revisão independente sequencial antes da homologação; se indisponível, manter o estado BLOQUEADO para homologação.

## 9. Critério de conclusão

1. Todos os caminhos permitidos e proibidos da seção 8 passam.
2. Nenhum e-mail real é enviado na homologação automatizada.
3. Histórico próprio aparece apenas na ficha própria e não pode ser apagado pela aplicação.
4. A rota antiga não causa bloqueio de acesso para nenhum perfil que já a utilizava.
5. A interface conserva o padrão do Corpo Clínico em celular e computador.
6. Revisão independente sequencial aprova a implementação; caso contrário, reportar como implementada, mas não homologada.

## 10. Evidência atual e pendências de homologação

1. A suíte `collaborator-google-auth.test.ts` passou com 49 testes, incluindo recuperação autorizada, endereço cadastrado, pedido genérico, link expirado, repetição, duas conclusões simultâneas e histórico sem acesso cruzado.
2. A suíte usa estado de banco simulado e substitui o motor de e-mail; não prova gravação no banco ativo nem entrega externa.
3. A compilação do servidor terminou com sucesso.
4. A compilação do aplicativo terminou com sucesso, mas mostrou avisos preexistentes de propriedades duplicadas em uma tela de validação fora desta entrega e de bloco JavaScript grande.
5. A conferência de tipos global continua falhando em arquivos diversos do repositório; os erros visíveis nos arquivos alterados estão fora das linhas modificadas, mas o repositório não pode ser declarado sem erros.
6. A tela pública de solicitação de recuperação foi capturada em celular e computador.
7. A tela autenticada da ficha própria não foi capturada, pois o navegador de validação não possui sessão; não foi criado atalho de autenticação.
8. Os dois serviços foram reiniciados e o servidor registrou “Server listening”; existem avisos de configuração de desenvolvimento que não foram alterados nesta tarefa.
9. Nenhum e-mail real foi enviado e nenhum teste alterou cadastro clínico real.
10. A revisão independente foi tentada, mas a plataforma informou que a revisão automatizada não está disponível nesta execução; a etapa permanece bloqueada até revisão sequencial por outra pessoa.
11. O limite de recuperação está na memória do processo; antes de executar várias instâncias em produção, deve usar armazenamento compartilhado e ser retestado.
12. Não houve envio ao GitHub.

## 11. Revisão autorizada em 01/11/2026 — Histórico, e-mails e organização das abas

Esta revisão substitui qualquer regra anterior conflitante sobre visibilidade do histórico, localização dos controles de acesso, quantidade de e-mails e vínculo entre e-mail principal e Google. Ela não autoriza mudanças em cobrança, licenciamento, atendimento clínico ou publicação em produção.

### 11.1 Organização da ficha

1. As abas da ficha passam a ser “Dados”, “Acesso”, “Vínculos”, “Documentos” e “Histórico”.
2. Os controles de conta saem da parte inferior de “Dados” e ficam dentro da aba “Acesso”.
3. “Histórico” fica em aba própria e começa fechado; uma alternância explícita consulta e mostra os eventos.
4. A ficha conserva o padrão visual original do Corpo Clínico e do sistema PAXTER, com hierarquia TDAH-friendly (adequada a pessoas com Transtorno do Déficit de Atenção com Hiperatividade), alinhamento por colunas e componentes 3D já aprovados.
5. A ficha de outra pessoa não recebe controles de senha ou identidade da sessão atual.

### 11.2 E-mails, Google e CPF

1. E-mail principal é a fonte única do e-mail profissional e do identificador de entrada/recuperação.
2. E-mail secundário é opcional e serve somente como contato; não pode autenticar, recuperar senha ou conceder acesso.
3. O vínculo Google só é aceito quando o servidor confirma que o provedor é Google e que o e-mail verificado coincide com o e-mail principal cadastrado.
4. E-mail, provedor e identidade não podem ser aceitos apenas porque o navegador os informou.
5. Se o Google vinculado não corresponder ao e-mail principal, a interface mostra a divergência e não afirma que o vínculo está correto.
6. O login Google não concede acesso ao Google Drive; o compartilhamento futuro exigirá autorização própria para o Drive e escopos específicos.
7. O CPF recebe máscara brasileira durante a digitação; o banco conserva somente os algarismos e a apresentação mantém pontos e hífen.

### 11.3 Senha

1. Senha nova exige ao menos 10 caracteres, primeira letra maiúscula e ao menos um caractere especial.
2. A senha atual continua sendo exigida em alteração de senha conhecida e de e-mail/CPF/e-mail secundário.
3. A senha, o hash, o token de sessão, os tokens Google e os códigos de recuperação nunca entram no histórico.
4. Os campos de senha mantêm o controle de revelar/ocultar somente o conteúdo digitado naquele campo.

### 11.4 Histórico pessoal e administrativo

1. A própria pessoa autenticada pode consultar somente o histórico do próprio cadastro.
2. O CEO autenticado pode consultar o histórico de profissionais de qualquer clínica; a autorização é determinada no servidor pelo registro `isPlatformOwner`, nunca por um identificador enviado pelo navegador.
3. Outros colaboradores não podem consultar o histórico de terceiros, mesmo que enviem outro identificador ou empresa no pedido.
4. Cada evento distingue quem alterou (`ator`) de quem teve o cadastro alterado (`titular`), e registra a clínica/empresa de contexto quando ela existir.
5. O histórico mostra valores anteriores e novos completos dos campos permitidos, incluindo e-mail principal, e-mail secundário e CPF.
6. O histórico exclui senhas, hashes, tokens, códigos de recuperação, identificadores de autenticação Google, assinatura e demais segredos.
7. Eventos antigos que já guardaram e-mail ou CPF como “Valor protegido” não podem ser reconstruídos; mudanças novas passam a registrar valores completos.
8. A tela não oferece exclusão e a aplicação não cria uma rota para apagar eventos.

### 11.5 Mudanças aditivas no banco e limites desta etapa

1. A nova coluna de e-mail secundário e os campos necessários para identificar titular e clínica no histórico são adições não destrutivas.
2. A migração deve ser idempotente, entrar em `scripts/migrations.sql` e nunca usar `db push`, `DROP`, `TRUNCATE` ou `DELETE`.
3. Esta etapa não aplica migração nem alteração de cadastro em produção; produção depende de implantação/migração autorizada e verificada separadamente.
4. Nenhum e-mail real, mensagem clínica ou alteração em cadastro clínico real pode ocorrer nos testes.

### 11.6 Critérios de verificação desta revisão

1. Testar histórico próprio permitido, CEO entre clínicas permitido, outro colaborador entre clínicas negado e identificador forjado negado.
2. Testar e-mail principal igual ao Google verificado permitido; e-mail diferente, provedor que não é Google e e-mail não verificado negados.
3. Testar e-mail secundário sem capacidade de login/recuperação, CPF formatado no campo e somente algarismos persistidos.
4. Testar senha válida e cada regra inválida, em todas as rotas de criação, troca e recuperação.
5. Confirmar que nenhum segredo aparece na resposta, trilha ou tela do histórico e que não existe exclusão de eventos.
6. A migração só pode ser aplicada em banco de desenvolvimento identificado; os testes automatizados usam dados sintéticos e não enviam mensagens.
7. Não declarar homologado sem teste das rotas permitidas/proibidas, reinício limpo dos serviços e revisão independente sequencial.
