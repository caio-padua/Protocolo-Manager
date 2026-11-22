# Atendimento supervisionado por WhatsApp

## Objetivo

Integrar o WhatsApp da Evolution ao motor existente de atendimento, mantendo a
identidade do cliente, a segurança dos documentos clínicos e a origem simulada
das perguntas de homologação.

## Escopo aprovado

1. Receber mensagens reais do webhook da Evolution, deduplicar por identificador
   do provedor e encaminhar somente mensagens de clientes identificados e da
   clínica dona do canal ao motor de atendimento existente.
2. Reutilizar a decisão, as orientações cadastradas, a busca de perguntas
   aprendidas, a inteligência artificial de seleção e o motor de agendamento
   existentes; não criar resposta clínica paralela.
3. Registrar canal e identidade de origem; nunca gravar pergunta hipotética como
   entrada real da cliente nem espelhar mensagem entre canais.
4. Manter a regra de atendimento humano; não devolver automaticamente a
   conversa de Dayana à inteligência artificial.
5. Separar planejamento de teste de efeitos reais. Uma pergunta simulada pode
   consultar dados da própria cliente somente depois de identidade e empresa
   verificadas, mas não pode criar pedido, cobrança, emissão, reserva ou entrega
   de documento.
6. Tornar configuráveis os parâmetros e textos do atendimento, incluindo nome da
   assistente, modelo de inteligência artificial, contatos de teste e limites de
   envio. Nenhum segredo retorna à tela.
7. Cadastrar textos operacionais faltantes em áreas editáveis. Texto clínico só
   pode ser usado após aprovação médica pela regra existente; o executor não
   pode se passar por médico.
8. Ligar a segunda via ao WhatsApp apenas com vínculo de cliente verificado,
   documento emitido real, confirmação explícita da cliente e fluxo de entrega
   aprovado. Pergunta simulada não cria solicitação nem dispara documento.
9. Manter ausências de integração explícitas: não prometer acesso a pedidos de
   exames, agenda, Pulso Diário ou situação do atendimento se não houver motor
   real compatível com o WhatsApp.
10. Executar o roteiro individualmente, primeiro Carlúcia e depois Dayana, após
    validação dos motores e da identidade; registrar origem, aceite, entrega,
    leitura e falhas.

## Caminho e contratos afetados

```text
Evolution webhook
  → registro idempotente da mensagem real
  → identificação exata do remetente e da empresa/canal
  → motor de atendimento existente (sem duplicar decisão)
  → resposta do motor pelo canal WhatsApp
  → status confirmado pelo webhook da Evolution
```

O modo de simulação usa o mesmo planejador, com origem marcada como
`homologacao_simulada`, sem inserir mensagem de entrada, reivindicar fila real,
alterar modo humano, criar solicitação clínica ou efetuar entrega documental.

## Falhas previstas e barreiras

| Falha | Barreira exigida |
|---|---|
| Número ausente, duplicado ou não verificado | Sem leitura clínica; resposta de identificação ou encaminhamento |
| Cliente pertence a outra clínica | Recusar antes de consultar orientação, documento ou agenda |
| Mensagem duplicada pelo provedor | Índice idempotente; não planejar nem enviar de novo |
| Conversa assumida por pessoa | Não responder automaticamente nem alterar o modo |
| Falha de rede após envio | Estado incerto; nunca repetir automaticamente |
| Pergunta de teste | Rótulo persistente de simulação; nenhuma entrada falsa no histórico |
| Pedido de segunda via sem vínculo ou consentimento | Não localizar nem entregar documento |
| Reenvio com cobrança possível | Nenhuma cobrança durante teste; revisão humana obrigatória |
| Orientação apenas em rascunho | Não usar como resposta automática |
| Modelo, nome, texto ou limite sem configuração | Erro explícito ou estado indisponível; nunca valor substituto oculto |
| Falta de motor do WhatsApp para exames, agenda ou Pulso | Informar a limitação; não inventar resposta ou ação |

## Definição de pronto

1. Testes cobrem autenticação do webhook, identificação exata, isolamento por
   clínica, deduplicação, modo humano, falha de provedor e ausência de efeitos
   na simulação.
2. Configurações de texto e parâmetros lidos pelo motor têm fonte editável e
   persistida; não há fallback de produção escondido.
3. Segunda via não envia ou cobra sem a cadeia real de confirmação e entrega.
4. A interface apresenta dados e ações reais, com erros explícitos.
5. A execução supervisionada é feita em sequência e cada resultado é ligado à
   mensagem da Evolution, sem expor o telefone completo.
6. Qualquer fluxo não implementado fica listado como pendência, sem declaração
   de homologação.

## Linhas vermelhas

- Não alterar receita, prescrição, pedido de exame, consulta, resultado clínico,
  cobrança ou prontuário para fabricar dados de teste.
- Não tratar pergunta hipotética como mensagem enviada pela cliente.
- Não usar o telefone de outra pessoa como identidade da cliente.
- Não contornar aprovação clínica, isolamento empresarial, autenticação ou modo
  humano.
- Não repetir lembrete de receita já enviado.
- Não declarar entregue ou lido sem confirmação da Evolution.

## Estado

EM ESPECIFICAÇÃO. A integração atual registra mensagens recebidas, mas não as
encaminha ao motor. A segunda via depende de identidade Telegram e possui efeitos
de solicitação; esses pontos precisam ser adaptados antes da homologação.
