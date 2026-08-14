---
name: Gerar o PDF do protocolo DISPARA e-mail ao paciente
description: Rota de geração tem efeito colateral de envio real; testar com ela manda mensagem de verdade para o cliente
---

# `GET /protocols/:id/document-pdf` não é uma rota de leitura

Apesar do verbo GET, essa rota **tem efeitos colaterais reais e irreversíveis**:

1. Sobe o protocolo em PDF para a pasta compartilhada do Drive.
2. Sobe para a pasta pessoal do paciente.
3. Gera o RAS FAP e sobe nos dois lugares.
4. **Envia e-mail ao paciente** com os dois anexos (gate: `client.email && isGmailConnected()`).
5. Dispara os cadernos jurídicos no primeiro envio.

**Why:** foi desenhada como "emitir o documento", não como "renderizar". Chamá-la
em laço de validação manda uma mensagem de verdade para uma pessoa de verdade a
cada iteração — descoberto na marra em 13/08/2026, depois de várias chamadas
seguidas durante o ciclo de correção de um PDF.

**How to apply:** para validar aparência de PDF, **nunca** iterar batendo nessa
rota. Chamar o gerador direto (`generateProtocolDocumentPdf`) num script Node
avulso que só escreve o arquivo em `/tmp`, e reservar a rota para a emissão
verdadeira, uma única vez, quando o documento já estiver aprovado visualmente.

Regra geral: antes de usar uma rota em laço de teste, ler o corpo dela até o fim
procurando envio de mensagem, upload e gravação — o verbo HTTP não é garantia.

# `POST /protocols/:id/validate` também escreve para o paciente

Validar um protocolo é o único caminho que **gera as sessões** (apaga as antigas
e recria uma por semana). No fim dele há um segundo efeito escondido: manda
e-mail de boas-vindas ao paciente com o `.ics` da agenda completa, sob o mesmo
portão `client.email && isGmailConnected()`.

**Why:** faz sentido no fluxo real, mas destrói qualquer tentativa de montar um
protocolo espelho para conferência interna — o paciente recebe "Bem-vindo ao seu
protocolo" de um protocolo que ainda não foi aprovado.

**How to apply:** para protocolo de conferência, validar com
`?skipOnboardingEmail=true`. A supressão é explícita, o padrão continua enviando
e o log registra `Onboarding NAO enviado: supressao explicita`. Conferir essa
linha no log depois, como prova de que nada saiu.

Rota realmente segura para só desenhar a Carta Premium, sem nenhum efeito
colateral: `GET /protocols/:id/carta-pdf`.
