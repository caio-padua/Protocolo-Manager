# Assistente do Telegram com Intérprete, Conferente e Aprendizado

## Objetivo
Diminuir chamadas desnecessárias de inteligência artificial sem permitir respostas inventadas, ações sem confirmação ou mistura de dados entre clínicas.

## Ordem obrigatória
1. Procurar resposta exata no cardápio aprendido e validar que a resposta ainda tem fonte aprovada válida.
2. Aplicar as regras locais existentes.
3. Chamar o Intérprete (Claude Haiku 5.5) somente se as regras locais não resolverem a intenção.
4. Chamar o Conferente (Claude Sonnet 5.5) apenas quando a interpretação for incerta ou antes de uma reserva, pedido ou envio selecionado por inteligência artificial.
5. Se uma etapa de inteligência artificial falhar, usar somente uma regra segura já existente ou encaminhar à equipe.

## Limites de conteúdo e dados
- A inteligência artificial só classifica ou estrutura a intenção; nunca escreve uma resposta para a pessoa.
- Toda resposta enviada vem de frase cadastrada, orientação aprovada ou resposta idêntica à sua fonte aprovada.
- Não enviar Cadastro de Pessoas Físicas, data de nascimento, telefone, endereço de correio eletrônico ou nome declarado ao provedor.
- Queixas clínicas, sintomas, tratamento, dose, exames clínicos, preços, cobrança, informações pessoais e fatos sem fonte aprovada não entram no aprendizado.
- O Aprendiz só pode propor uma pergunta comum após pelo menos três perguntas distintas e seguras recebidas com resposta aprovada entregue.
- A resposta do cardápio é copiada sem alteração da orientação aprovada. Correções humanas são registradas no histórico e permanecem limitadas aos filtros de segurança.

## Auditoria, medição e cobrança
- Registrar por clínica cada fonte de resolução e cada chamada do Intérprete, Conferente e Aprendiz.
- Usar `registrarCustoProvedor` para custos e tokens informados pelo provedor; custo ausente permanece sem valor, nunca estimado.
- Reaproveitar a cobrança atual de mensagens. Não criar tarifas, débitos ou telas de cobrança.
- Preservar a isenção existente do Instituto Pádua, empresa 5.
- Exibir no painel administrativo, por clínica, resultados do cardápio, regras, chamadas, taxa de resolução, tokens, custos informados por moeda e chamadas evitadas pelo cardápio.

## Gestão do cardápio aprendido
- Acrescentar a aba “Aprendidas” a “Frases do Assistente”.
- Permitir correção de pergunta, variações e resposta; ativar/desativar; arquivar sem exclusão física; e consultar versões.
- Exibir usos e chamadas de inteligência artificial evitadas.
- Cada consulta e alteração deve respeitar a clínica autenticada. A gestão fica restrita à instância autorizada do CEO.

## Falhas previstas
- Fonte aprovada desativada ou alterada: o item não é usado, salvo se houver correção humana registrada.
- Intérprete indisponível, resposta inválida ou dados pessoais detectados: ignorar a interpretação e usar regra local ou equipe.
- Conferente discorda, não responde ou falha: bloquear reserva, pedido ou escolha incerta.
- Colisão entre clínicas: exigir correspondência da clínica em cada leitura e escrita; não usar primeiro resultado.
- Reentrega da mesma mensagem: não duplicar custo, observação, uso do cardápio ou resolução registrada.

## Verificação de aceite
- Testes de ordem: cardápio/regras antes do Intérprete; Intérprete antes do Conferente; Conferente antes de qualquer efeito.
- Testes de discordância, indisponibilidade, conteúdo clínico/comercial/pessoal, idempotência e isolamento entre clínicas.
- Testes em PostgreSQL descartável, não na base configurada da aplicação.
- Executar testes dirigidos, checagem de compilação e verificações visuais permitidas.
- A revisão independente e a homologação devem ser declaradas somente se houver evidência real; não publicar nem enviar mensagens reais como parte desta tarefa.
