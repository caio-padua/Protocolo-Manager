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
6. Tornar configuráveis os parâmetros e textos de negócio por clínica, incluindo
   nome da assistente, modelo de inteligência artificial, texto de teste e
   ativação do motor. Contatos continuam limitados pela lista autorizada; limites
   técnicos do canal não podem exceder a regra do provedor. Nenhum segredo
   retorna à tela.
7. Cadastrar textos operacionais faltantes em áreas editáveis. Texto clínico só
   pode ser usado após aprovação médica pela regra existente; o executor não
   pode se passar por médico.
8. Ligar a segunda via ao WhatsApp apenas com vínculo de cliente verificado,
   documento emitido real, confirmação explícita da cliente e fluxo de entrega
   aprovado. Entregar o PDF original por acesso protegido e registrar o
   identificador do provedor, aceite, entrega, leitura e abertura do arquivo.
   Incluir pedidos de exames já emitidos quando o arquivo e o escopo puderem ser
   verificados. Pergunta simulada não cria solicitação nem dispara documento.
9. Diferenciar segunda via de nova prescrição; alteração ou emissão nova exige
   decisão e assinatura médica, sem criação automática.
10. Manter ausências explícitas: segunda via de resultado de exame, novo pedido
   de exame, agenda e Pulso Diário só podem ser automatizados se houver motor
   real compatível com o WhatsApp.
11. Executar o roteiro individualmente, primeiro Carlúcia e depois Dayana, após
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
| Vínculo de teste colide com telefone principal de outro cadastro após a aprovação | Revalidar a união das duas fontes antes de consultar e novamente antes de enviar; nenhuma fonte vence silenciosamente |
| Cliente pertence a outra clínica | Recusar antes de consultar orientação, documento ou agenda |
| Mensagem duplicada pelo provedor | Índice idempotente; não planejar nem enviar de novo |
| Conversa assumida por pessoa | Não responder automaticamente nem alterar o modo |
| Falha de rede após envio | Estado incerto; nunca repetir automaticamente |
| Equipe assume conversa ou conteúdo é revogado durante inferência | Revalidar modo humano, identidade e fonte aprovada imediatamente antes da saída |
| Confirmação do provedor chega antes da resposta de envio | Guardar confirmação autenticada em registro idempotente e reconciliar após gravar identificador do envio |
| Entrega e leitura chegam simultaneamente | Atualização monotônica no banco; leitura nunca é perdida por comparação com estado antigo |
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
3. Segunda via confere o PDF original, mantém a regra de consentimento e política,
   registra os estados reais do provedor e registra quando o PDF é aberto.
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

EM TESTE; HOMOLOGAÇÃO BLOQUEADA POR DADOS DE IDENTIDADE, PROCEDÊNCIA LEGADA E PAUSA HUMANA.

- O webhook de mensagens escritas encaminha texto ao planejador real de dúvidas
  e orientações somente com o motor habilitado, identidade única e clínica
  correspondente. O padrão continua desligado.
- A resposta de segunda via usa o cadastro do cliente e o documento emitido
  correspondente. A simulação consulta o fluxo sem criar solicitação, cobrança,
  entrega ou entrada fictícia.
- Modelos de inteligência artificial, nome da assistente, texto de teste e
  chave de ativação são configuráveis por clínica. As frases operacionais ficam
  no editor existente de comunicação e atendimento.
- O vínculo de homologação aceita o telefone principal exato ou resolve quatro
  últimos dígitos somente quando apontam a um único contato já autorizado; não
  altera o telefone principal do cadastro.
- Testes automatizados: 179 verificações passaram em oito arquivos, incluindo
  PostgreSQL descartável, isolamento por clínica, colisão entre telefone principal
  e vínculo explícito, duplicidade, confirmação precoce do provedor, entrega e
  leitura concorrentes, autorização revogada, pausa humana e segunda via simulada.
- O registro de acesso foi corrigido para ocultar segredos do webhook e do link
  protegido antes da serialização HTTP, preservando os endereços válidos nas
  respostas ao cliente. Registros históricos não foram apagados; eventual
  credencial já registrada anteriormente ainda exige rotação controlada.
- A migração aditiva passou duas execuções consecutivas em PostgreSQL
  descartável.
- A compilação da interface e do servidor passou. A verificação geral de tipos
  do servidor ainda acusa uma falha preexistente em `pax-finance`; nenhum erro
  restante foi apontado nos arquivos desta entrega.
- A revisão independente apontou falta de revalidação na saída Evolution,
  colisão de identidade na simulação, perda de confirmações concorrentes ou
  precoces e representação incorreta de resultado incerto. As correções foram
  implementadas e exercitadas; não há novo parecer independente de liberação.
- Nenhum contato externo foi acionado nesta execução; portanto, não há evidência
  nova de aceite, entrega ou leitura pela Evolution.
- A falta inicial de sessão foi superada pelo login normal da aplicação, sem
  fabricar token nem alterar credenciais. Os campos protegidos foram conferidos
  em navegador autenticado nas larguras de 1.366 e 390 pixels.
- Os modelos compatíveis, o nome editável da assistente e o texto de teste foram
  salvos pelo formulário de configuração correspondente. O motor automático
  permanece desligado enquanto os bloqueios reais persistirem.
- Dois textos não clínicos, de acolhimento e qualidade, foram cadastrados na
  biblioteca e habilitados pelas rotas autorizadas, com origem de homologação
  identificada nos títulos. Não foram aprovadas orientações clínicas em rascunho.
- O vínculo específico do segundo contato foi atualizado para o telefone de
  teste já confirmado, preservando o telefone principal do cadastro.
- A primeira tentativa de planejamento foi bloqueada por telefone também
  presente em outro cadastro ativo de outra pessoa. Nenhum cadastro de terceiro
  foi alterado para contornar a colisão.
- A segunda tentativa foi bloqueada pelo atendimento humano ativo, que foi
  preservado. Não houve reativação automática da conversa.
- Foram lidos por acesso profissional quatro arquivos originais existentes:
  uma prescrição e um pedido de exames de cada participante. Os quatro tinham
  cabeçalho PDF válido, extração de texto concluída e nome da titular no conteúdo.
  As impressões digitais dos bytes foram conferidas durante a execução; os
  arquivos não foram enviados nem gravados no repositório.
- As prescrições legadas do primeiro cadastro não têm clínica/unidade da emissão
  registradas. A leitura profissional do arquivo não autoriza preencher essa
  procedência por inferência nem liberar a segunda via automaticamente.
- Evidências visuais sem dados clínicos:
  `generated-artifacts/whatsapp-supervisao/parametros-desktop.jpg` e
  `generated-artifacts/whatsapp-supervisao/parametros-celular.jpg`.
  Esses arquivos gerados são ignorados pelo controle de versão.
- O roteamento de agendamento, novos pedidos de exame, lembrete da última
  prescrição e Pulso Diário não está conectado ao webhook de atendimento do
  WhatsApp. Esses casos permanecem sem resposta automática e devem ser
  transferidos à equipe; não foram tratados como capacidades concluídas.
- Nesta versão, o webhook registra texto. Mensagens de mídia não são
  processadas.
