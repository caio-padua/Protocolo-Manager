# Cockpit: protocolo com cliente único

## Objetivo e impacto

Usar o cliente selecionado no cabeçalho em todas as abas e abrir o lançador existente de protocolos dentro do Cockpit, sem exigir nova seleção de cliente. Não alterar as regras clínicas, a autorização, os cadastros nem os menus existentes.

## Comportamento

- Os botões de protocolo do cabeçalho, da aba Protocolos e das abas Injetáveis e Implantes abrem o lançador original na aba Protocolos para o cliente da rota.
- O formulário embutido não apresenta outro seletor de cliente e não sai do Cockpit após a criação.
- O usuário pode fechar o formulário e consultar a lista existente; a criação atualiza os dados consultados.
- Mudar o cliente desmonta os dados e o formulário do cliente anterior. As abas continuam recebendo o cliente da rota.
- Se a identificação do cliente não puder ser confirmada por erro, recusa de acesso ou resposta incompatível, não abrir ferramentas nem exibir contagens como se fossem dados válidos; permitir nova tentativa.
- Uma recusa ou falha ao consultar protocolos deve ser apresentada como erro, nunca como lista vazia; não abrir o lançador até recuperar o acesso.
- No lançador, usar a identidade confirmada do cliente mesmo quando ele não aparecer na lista geral de clientes.
- Durante criação, validação ou geração do documento, impedir troca de cliente, aba e fechamento pela interface; ao desmontar, não iniciar a próxima etapa nem exibir resultado sob outro cliente.
- Durante operação pendente, proteger também o histórico, os links da aplicação e o fechamento ou recarregamento da página; saída forçada ou perda de conexão não comprova cancelamento no servidor.
- Uma falha temporária na confirmação da identidade durante o envio não desmonta a operação; oculta as ferramentas até que a identidade seja confirmada novamente.
- Os botões não criam protocolo por si só. As permissões e o envio continuam sob o controle das rotas existentes.

## Falhas previstas e verificação

- Abertura em aba diferente, troca de cliente, cancelamento e atualização após sucesso devem ser exercitados sem usar dados reais.
- Consultas e escritas de testes de navegador usam respostas isoladas, sem alterar prontuários ou serviços externos.
- O cliente da rota não pode ser substituído por um identificador fixo ou por uma escolha paralela no lançador.
- A revisão visual autenticada real depende de acesso válido; não declarar essa etapa concluída sem evidência.
