---
name: Telegram — chat do CEO, repasse e telas de status
description: Decisões e armadilhas do canal Telegram do Instituto (repasse ao CEO, status honesto, ambiente do webhook)
---
- O bot tem UM webhook; ele aponta para o ambiente que o registrou (desenvolvimento ou Railway). Conferir getWebhookInfo antes de afirmar onde o recebimento acontece.
- O chat do CEO no cofre (`telegram.ceoChatId`) era o chat da conta da clínica, que também está vinculado a um cliente: repasse ao CEO ao receber dessa conta vira eco. O repasse agora é omitido quando remetente == chat do CEO.
- Não transportar rótulos históricos de contato para novos testes: confrontar o telefone expressamente autorizado com o cadastro atual e a unicidade do chat, preservando o destino configurado; não mesclar ou corrigir vínculos por inferência.
**Why:** a Central de Auditoria mostrou "Token não configurado" por chamar rota protegida sem credencial e ler campo inexistente; erro de acesso nunca pode virar "não configurado".
**How to apply:** nova tela de status deve enviar credencial e separar erro de "não configurado"; repasse ao CEO sempre registra o resultado do envio (aceito/simulado/recusado).

**Why da conferência de identidade:** uma retomada encontrou rótulos históricos
incompatíveis com os telefones salvos, embora ambos os chats continuassem
autorizados; a primeira barreira do roteiro bloqueou antes de qualquer envio.
Uma comparação por conjunto também não prova qual telefone pertence a cada linha.

**Privacidade dos alertas:** pontuar CPF não é ocultá-lo; alertas não devem carregar
nome completo ou CPF do cadastro. O texto original permanece no Cockpit; o alerta
leva só identificador interno, sem transcrição de texto livre.

**Why:** correção expressa do responsável identificou que a evidência antiga
chamava o CPF completo pontuado de mascarado.

**How to apply:** comprovar a ausência dos valores no alerta inteiro com dados
sintéticos antes de qualquer prova externa, inclusive erros retornados e registros
de diagnóstico; não depender de reconhecer nomes ou conteúdo clínico em texto livre.
