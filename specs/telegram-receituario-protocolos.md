# Especificação — atendimento de receituários e protocolos pelo Telegram

## 1. Objetivo

Permitir que uma cliente com vínculo Telegram único consulte informações do próprio receituário ou protocolo, receba apenas explicações aprovadas por médico e confirme antes de receber uma segunda via do receituário.

## 2. Impacto verificado

1. O webhook já identifica o cadastro pelo chat exato, grava a mensagem recebida e registra o repasse para a equipe.
2. A resposta automática é um fluxo separado, condicionado ao modo global, à lista de clientes autorizados, à pausa humana e ao crédito da clínica.
3. O painel do histórico não mostra hoje autorização individual nem o desfecho automático de cada mensagem.
4. As respostas clínicas existentes vêm de `orientacoes_aprovadas` e são enviadas sem redação livre da inteligência artificial.
5. Prescrições emitidas podem ter mais de um arquivo de receita; cada arquivo emitido fica em `recipes`.
6. O protocolo salvo possui dados clínicos estruturados, mas seu registro de emissão não guarda um PDF único persistido. O reenvio automático ficará limitado a uma receita já emitida.
7. O reenvio atual de documentos usa link aleatório de curta duração, registra o hash do link e confere o hash do PDF. Esse padrão será preservado.

## 3. Requisitos exatos

1. Mostrar no painel Telegram do cadastro:
   1.1. Se o chat está vinculado e se o vínculo continua único.
   1.2. Se o cadastro está autorizado individualmente para a inteligência artificial.
   1.3. O modo global do atendimento e a disponibilidade de crédito, sem alterar nenhum deles.
   1.4. O resultado de cada mensagem recebida: aguardando, respondida, encaminhada à equipe, bloqueada ou com resultado incerto.
2. Permitir que somente uma sessão autenticada do CEO, validada pelo servidor, altere a autorização individual.
3. Não ativar nem alterar o modo global automaticamente.
4. Recusar ativação individual quando o modo global estiver `ligado`, pois esse modo responde a todos os clientes vinculados e ignora a lista individual.
5. Para responder sobre dados clínicos:
   5.1. Resolver o cliente exclusivamente pelo identificador interno ligado ao chat atual, pela clínica e pelo vínculo Telegram único.
   5.2. Consultar somente receituários emitidos ou protocolos em estado `validated` ou `active` daquele cliente.
   5.3. Usar explicação somente quando houver orientação da própria clínica com estado `aprovada`, categoria `prescricao` e subcategoria específica de explicação.
   5.4. Vincular a orientação por título exato: `Fórmula: <nome exato do item>` ou `Protocolo: <título exato>`.
    5.5. Não chamar modelo de inteligência artificial neste caminho; enviar palavra por palavra somente a orientação aprovada vinculada ao item exato.
   5.6. Não enviar nome, CPF, dose, posologia, documento ou identificador do cliente ao modelo de inteligência artificial.
   5.7. Sem fonte exata, com empate, vínculo incerto ou documento ausente, encaminhar à equipe sem improvisar.
   5.8. Pergunta sobre sintoma, reação, diagnóstico, dose, alteração, interação ou renovação deve continuar com a equipe clínica.
6. Aprendizagem:
   6.1. Manter a conversa e o identificador da orientação usada visíveis para a equipe.
   6.2. Não transformar pergunta clínica em resposta automática aprendida nem aprovar conteúdo clínico automaticamente.
   6.3. Uma nova explicação clínica só pode ser usada depois de escrita e aprovada por médico na biblioteca existente.
7. Reenvio:
   7.1. Oferecer somente um arquivo de receita emitida que pertença à cliente e à clínica atuais.
   7.2. Não escolher automaticamente entre dois ou mais arquivos de receita; encaminhar à equipe para esclarecer qual arquivo.
   7.3. A oferta expira após 24 horas, é vinculada ao mesmo chat e exige resposta afirmativa explícita e isolada, como “sim” ou “pode enviar”.
   7.4. Resposta negativa cancela a oferta. Texto afirmativo ambíguo não envia documento.
   7.5. Antes do envio, conferir novamente cliente, clínica, chat único, estado de emissão, arquivo e hash do PDF.
   7.6. Reutilizar o link seguro com validade de sete dias. Persistir somente o hash do token; nunca persistir o token ou o link completo.
   7.7. Resultado incerto não pode gerar reenvio automático; a equipe deve conferir o histórico.
8. Testar somente com dados sintéticos e transporte simulado. Não enviar mensagens ou documentos a clientes reais e não alterar configurações de produção.

## 4. Casos extremos e barreiras

| Falha | Gravidade e consequência | Barreira e recuperação | Evidência de teste |
|---|---|---|---|
| Chat sem vínculo, vínculo duplicado ou chat trocado | Alta: dados poderiam ir para outra pessoa | Conferir cliente, empresa e chat único antes de consultar e antes de enviar; interromper e encaminhar | Vínculo ausente, duplicado e alterado bloqueiam leitura e envio |
| Cliente homônima ou documento de outra clínica | Alta: exposição clínica | Nunca buscar por nome; usar identificador interno e escopo da clínica | Homônimas e cliente de outra empresa não recebem dados cruzados |
| Modo global `ligado` | Alta: autorização individual não limita o atendimento | Mostrar aviso e bloquear alteração individual; não mudar o modo global | Rota retorna conflito e mantém configuração intacta |
| Orientação ausente, inativa, ambígua ou de outra clínica | Alta: explicação inventada ou incorreta | Seleção exata, estado aprovado e empresa iguais; sem resultado, equipe humana | Rascunho, inativa, empate e orientação de outra clínica não são enviados |
| Documento ou orientação muda entre planejamento e envio | Alta: resposta poderia descrever um documento antigo | Reconsultar o documento e comparar texto, orientação e estado imediatamente antes do envio | Alterar o nome da fórmula ou inativar a fonte bloqueia o envio planejado |
| Pedido de dose, sintoma ou mudança de tratamento | Alta: decisão clínica automatizada | Detectar a classe do pedido antes da busca de orientação e encaminhar | Casos clínicos nunca chegam ao seletor de respostas |
| Receita inexistente, não emitida ou com múltiplos arquivos | Alta: envio de documento errado | Exigir estado `emitted`, PDF existente e exatamente um arquivo selecionável | Nenhum envio quando arquivo está ausente, inválido ou ambíguo |
| Oferta vencida, chat trocado ou resposta ambígua | Alta: autorização antiga poderia ser reutilizada | Oferta de 24 horas vinculada ao chat; confirmação isolada; consumo único | Expiração, “não”, “sim, mas...” e chat diferente não enviam |
| Reentrega ou concorrência da confirmação | Alta: documento duplicado | Chave por mensagem recebida e reivindicação atômica da oferta | Repetição simultânea causa no máximo uma solicitação ao Telegram |
| Telegram aceita e a resposta se perde | Alta: repetição duplicaria documento | Marcar como resultado incerto e bloquear repetição automática | Falha após início do envio não gera segunda tentativa |
| Falta de crédito, falha de banco ou rede | Média/alta: cliente fica sem retorno | Preservar mensagem, expor estado e encaminhar à equipe; nunca afirmar envio não confirmado | Testes de saldo, indisponibilidade e erro de envio |

## 5. Linhas vermelhas

1. Não consultar nem expor mensagens reais de clientes durante desenvolvimento.
2. Não disparar mensagem, arquivo, webhook ou link para a cliente Carlucia ou qualquer cliente real.
3. Não ligar globalmente a inteligência artificial nem mudar a lista de clientes já autorizados fora dos testes sintéticos.
4. Não responder com diagnóstico, dose, posologia, ajuste, renovação ou interpretação de sintomas.
5. Não gerar explicações clínicas com texto livre da inteligência artificial.
6. Não buscar cliente por nome, CPF, e-mail ou semelhança.
7. Não regenerar, editar, assinar ou substituir uma receita existente para atender um pedido de segunda via.
8. Não registrar o token ou o link privado de compartilhamento em banco, log ou histórico interno.

## 6. Definição de pronto

1. A interface identifica vínculo único, autorização individual, modo global, crédito e desfecho por mensagem.
2. A autorização individual é protegida no servidor, limitada à clínica e não altera o modo global.
3. A resposta clínica usa exclusivamente registros do cliente identificado e orientação exata aprovada pela clínica.
4. Perguntas sem fonte segura ou que exigem julgamento clínico chegam à equipe.
5. A confirmação explícita pode enviar um link temporário da única receita emitida selecionada, com token não persistido e sem duplicação automática.
6. Testes cobrem isolamento, autorização, conteúdo aprovado, confirmação, expiração, recusa, repetição, concorrência, falha e resultado incerto.
7. Contrato da API atualizado antes da geração dos tipos.
8. Revisão independente sequencial sem lacunas impeditivas.
9. Verificação de execução, logs e capturas em desktop e celular, sem envio real.
