# Especificação — acesso e histórico no cadastro do Corpo Clínico

Data: 01/11/2026
Estado: EM ESPECIFICAÇÃO
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
4. O token aleatório é assinado com chave do servidor, não armazenado no banco, tem uso único, validade limitada e é vinculado à versão de credenciais da conta.
5. O token só pode redefinir a senha enquanto estiver válido, não consumido, entregue e ligado à mesma versão de credenciais.
6. A conclusão grava a nova senha, consome o token, incrementa a versão de credenciais e registra a auditoria numa transação.
7. Todas as sessões e tokens de recuperação anteriores ficam inválidos após a redefinição.
8. A mensagem de recuperação usa o motor de envio Hermes Paxter; nenhum envio de teste alcança um endereço real.
9. Conta sem e-mail utilizável não recebe redefinição por esse fluxo. A interface mantém a opção de acesso Google já vinculada e orienta a usar uma sessão ativa ou o responsável autorizado pela clínica.

### 4.3 Histórico próprio

1. Um controle de alternância abre e fecha o histórico na aba “Dados”.
2. Cada evento mostra data, ação e mudanças permitidas, com valores anterior e novo quando aplicável.
3. E-mail e CPF são mascarados; telefone, senha, hash, token e códigos não aparecem.
4. A consulta exige sessão válida e filtra exclusivamente pelo profissional autenticado.
5. A interface não contém ação de apagar; a API não oferece exclusão do histórico.
6. A aplicação oferece preservação contra exclusão pela própria tela e por rotas do produto; não promete imutabilidade contra um operador privilegiado do banco de dados.

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
| Banco | Nova tabela aditiva para resumos dos tokens e estado de entrega; trilha de auditoria existente permanece |
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
| Muitas solicitações | Limite por origem e intervalo por conta | Bloqueio temporário sem informar se a conta existe |
| E-mail não configurado ou envio falha | Resultado honesto, token inutilizado e sem confirmação de entrega | Nenhuma redefinição falsa |
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

1. Testes unitários de geração, resumo, expiração, consumo e formato do link.
2. Testes de integração com banco sintético e envio de e-mail simulado.
3. Caminho permitido: solicitar, confirmar a chamada simulada, redefinir, verificar hash, versão e auditoria, e autenticar com a nova senha.
4. Caminhos proibidos: conta ausente, conta inativa, e-mail forjado, senha fraca, token expirado, token usado, token de versão antiga, identidade forjada e sessão ausente.
5. Concorrência: duas conclusões do mesmo token; exatamente uma pode alterar a senha.
6. Privacidade: respostas, auditoria, logs e histórico não contêm senha, hash, token bruto, CPF completo ou e-mail completo.
7. Persistência: consulta de banco comprova evento e estado; a tabela de tokens contém apenas resumos criptográficos.
8. Visual: capturas em celular e computador; controles principais exercitados em ambas as larguras; nenhuma autenticação temporária de teste é adicionada.
9. Logs: inicialização sem erro e sem mensagens inesperadas.
10. Revisão independente sequencial antes da homologação; se indisponível, manter o estado BLOQUEADO para homologação.

## 9. Critério de conclusão

1. Todos os caminhos permitidos e proibidos da seção 8 passam.
2. Nenhum e-mail real é enviado na homologação automatizada.
3. Histórico próprio aparece apenas na ficha própria e não pode ser apagado pela aplicação.
4. A rota antiga não causa bloqueio de acesso para nenhum perfil que já a utilizava.
5. A interface conserva o padrão do Corpo Clínico em celular e computador.
6. Revisão independente sequencial aprova a implementação; caso contrário, reportar como implementada, mas não homologada.
