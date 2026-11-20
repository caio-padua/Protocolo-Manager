# Duas IAs e aprendizado seguro no Telegram

## Objetivo
Reduzir chamadas de inteligência artificial no Telegram, confirmar interpretações que possam levar a uma ação e aprender respostas repetidas sem criar orientação clínica ou preço inventado.

## Requisitos exatos
1. Usar o acervo de respostas aprovadas e as regras determinísticas antes de chamar inteligência artificial.
2. Separar duas funções de inteligência artificial: Intérprete (Claude Haiku 5.5) e Conferente (Claude Sonnet 5.5). O Conferente só roda quando a leitura do Intérprete for incerta ou antes de registrar uma escolha que gere pedido ou reserva.
3. Se a mensagem puder ser resolvida pelas regras ou pelo acervo, não chamar inteligência artificial.
4. As respostas enviadas ao cliente continuam sendo textos existentes e aprovados. Nenhum modelo pode escrever ou alterar texto enviado.
5. Não enviar CPF, nascimento, telefone, endereço de e-mail ou dados da identidade do cliente a modelos. Se não for possível remover com segurança, não chamar modelo.
6. Aprender uma pergunta somente depois que uma resposta aprovada tiver sido usada repetidamente para a mesma pergunta não clínica. A resposta gravada deve ser cópia exata da resposta aprovada que a equipe já usa.
7. Perguntas de saúde, medicação, dose, sintomas, preço sem fonte comercial vigente, dado pessoal e resposta sem fonte confiável não podem ser autoativadas; devem seguir para a equipe.
8. A pergunta aprendida passa a resolver sem inteligência artificial e pode ser editada, inativada ou removida pelo responsável da clínica. Edições preservam histórico e registro de origem.
9. Medir por clínica, período e canal de resolução: acervo aprendido, regras, Intérprete, Conferente e equipe; registrar chamadas e custos de provedor separadamente do saldo de mensageria.
10. Reutilizar a visão de contrato, módulos, franquia, carteira, tarifas e extrato já existente. Não acrescentar tipo de tarifa, cobrar etapa de inteligência artificial separadamente nem ativar cobrança real.
11. Expor a visão detalhada de uso e custos somente à administração autorizada. A clínica vê apenas o próprio uso e dados comerciais já autorizados.
12. A conferência humana de qualquer divergência, falha de modelo, baixa confiança ou dado ausente não pode executar reserva nem criar resposta.

## Casos extremos e barreiras
- Modelo fora do ar, resposta fora do formato, conferência que discorda ou prazo excedido: não executar efeito; usar regra segura ou encaminhar à equipe.
- Uma interpretação repetida, duplicada ou reentregue não pode aumentar contagem de aprendizado mais de uma vez por mensagem recebida.
- Colisão de perguntas de clínicas diferentes nunca compartilha pergunta aprendida, resposta, contagem ou custo.
- Não armazenar pergunta com CPF, telefone, endereço de e-mail, nome completo ou conteúdo clínico no novo conjunto de aprendizagem.
- Uma orientação editada ou inativada não pode continuar servindo respostas aprendidas que copiem sua versão anterior.
- A falta de uma tarifa permanece “sem tarifa”, sem débito nem inferência de valor.
- A tela atrás de autenticação não será considerada visualmente homologada sem captura autenticada; não remover autenticação para testes.

## Definição de PRONTO
- Regras/acervo resolvem primeiro; testes comprovam ausência de chamadas de IA nesses casos.
- A segunda inteligência artificial só recebe os dados mínimos e bloqueia ação quando discorda, falha ou está incerta.
- Uma pergunta comum segura só é autoativada após o limite configurado de usos distintos, com resposta idêntica a uma orientação aprovada vigente.
- Testes comprovam não aprendizado clínico, não vazamento de dados, idempotência, isolamento entre clínicas, falha de IA e ausência de novas cobranças.
- A tela permite localizar, editar, inativar e remover perguntas aprendidas, com origem e usos visíveis.
- O painel mostra os caminhos de resolução e custos do provedor por clínica sem misturar custo interno e saldo comercial.
- Testes automatizados, resposta de rotas protegidas, consulta do banco de teste e verificação visual em celular e computador concluídos; limitações de autenticação e envio externo declaradas.

## Linhas vermelhas
- Não usar dados de produção, não enviar mensagens reais e não publicar.
- Não alterar a regra de isenção, a carteira, tarifas, cobrança real, contrato, preço ou franquia.
- Não permitir que inteligência artificial decida ou redija orientação clínica.
- Não transformar resposta que foi editada/inativada em orientação aprovada automaticamente.
- Preservar toda pergunta/resposta já cadastrada; remoção é inativação, não exclusão física.

## Passos
1. Confirmar as rotas e telas de cobrança já existentes e mapear o fluxo de atendimento do Telegram.
2. Implementar o caminho econômico: pergunta aprendida → regra/acervo → Intérprete; gravar a origem da resolução de modo idempotente.
3. Adicionar a segunda inteligência artificial como Conferente, com bloqueio seguro de efeitos em caso de divergência ou falha.
4. Criar aprendizagem automática limitada a perguntas não clínicas respondidas por uma orientação aprovada vigente; nunca gerar resposta nova.
5. Adicionar a fila de manutenção das perguntas aprendidas à biblioteca existente.
6. Integrar contadores e custos às visões de uso existentes, sem tarifa nova ou débito adicional.
7. Exibir painel por clínica no painel operacional do Telegram, com acesso restrito.
8. Executar testes de unidade, integração e interface; conferir banco de desenvolvimento isolado, logs e capturas da tela acessível.

## Arquivos relevantes
- `artifacts/api-server/src/lib/telegram-interprete.ts`
- `artifacts/api-server/src/lib/telegram-agendamento.ts`
- `artifacts/api-server/src/lib/telegram-agendamento-store.ts`
- `artifacts/api-server/src/lib/atendimento-telegram.ts`
- `artifacts/api-server/src/lib/atendimento-telegram-store.ts`
- `artifacts/api-server/src/lib/mensageria-credito.ts`
- `artifacts/api-server/src/routes/telegram-inbox.ts`
- `artifacts/api-server/src/routes/mensageria-credito.ts`
- `artifacts/api-server/src/routes/duvidas-orientacoes.ts`
- `artifacts/padcom/src/pages/comunicacao/painel-telegram.tsx`
- `artifacts/padcom/src/pages/comunicacao/duvidas-orientacoes.tsx`
- `artifacts/padcom/src/pages/licenciado/index.tsx`
