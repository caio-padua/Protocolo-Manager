# Atendimento supervisionado por WhatsApp

## Objetivo

Integrar o WhatsApp da Evolution ao motor existente de atendimento, mantendo a
identidade do cliente, a segurança dos documentos clínicos e a origem simulada
das perguntas de homologação.

## Escopo aprovado

### Complemento resolutivo autorizado

- Localizar e entregar documentos já emitidos às próprias clientes autorizadas, inclusive por ação do profissional autenticado, sem fabricar mensagem de entrada.
- O reenvio profissional reutiliza a política de segunda via e a auditoria existentes; WhatsApp configurado na Evolution usa esse canal, sem cair silenciosamente em outro provedor.
- O destino vem do vínculo confirmado ou do cadastro; qualquer colisão entre pessoas bloqueia. Não prevalecer silenciosamente o vínculo administrativo sobre outro cadastro.
- O documento precisa ter titular, profissional e clínica de emissão verificáveis. Legados sem procedência não recebem clínica por inferência.
- Seleção combina tipo, data e identificador explícito. Data inexistente não pode selecionar outro dia; “mais recente” só resolve quando resta um documento na data mais recente. Empates são apresentados com identificadores distintos.
- Dúvida geral sobre efeitos colaterais pode usar orientação aprovada. Relato de sintoma, emergência e mudança de tratamento continuam com a equipe médica.
- O teste externo é individual, primeiro Carlúcia e depois Dayana; sem cobrança, emissão nova ou alteração de prontuário. Registrar separadamente aceite, entrega e leitura.

### Impacto e falhas adicionais

| Área | Barreira |
|---|---|
| Seleção documental | Interseção dos filtros; nunca trocar tipo ou data solicitados por alternativa disponível |
| Dúvida versus sintoma | Exceção informativa conservadora; sintomas atuais e alarmes prevalecem |
| Reenvio profissional Evolution | Mesmo documento original, política e auditoria; vínculo revalidado antes da rede |
| Resultado incerto | Manter auditoria e identificador do provedor; não repetir automaticamente |
| Texto do link | Frase existente no editor por clínica; nenhum novo texto clínico criado pelo agente |

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

EM TESTE — entrega supervisionada comprovada; automação completa ainda não homologada.

### Evidência da execução supervisionada de 22/11/2026

- Primeiro destinatário: pedido de exames 40, mensagem Evolution 29, auditoria 390, entregue pelo provedor.
- Segundo destinatário: prescrição 96, mensagem Evolution 30, auditoria 392, aceita/enviada; entrega e leitura ainda não confirmadas na última consulta.
- Os dois PDFs tiveram titular confirmado no texto antes do envio. Os acessos protegidos retornaram 200 e bytes idênticos aos originais, conferidos por SHA-256.
- Impressões digitais: exame 40 `b700a851e161171744468b0b757196f7288de5232786adbd6cd35870747184d7`; prescrição 96 `f6150dc4d1e12286bcd7e49a3b355ea2772ed830061da2397c0404baaa2628e6`.
- Os acessos de conferência foram realizados pelo operador; não comprovam que a cliente abriu ou leu o arquivo.
- Envio pela ação de reenvio do profissional autenticado, sem fabricar entrada da cliente, com vínculo revalidado e texto do link proveniente do editor existente.
- O vínculo do primeiro destinatário foi alinhado ao número exato da captura autorizada, sem modificar telefones de terceiros nem aceitar precedência silenciosa sobre cadastro conflitante.
- O motor Evolution está ativado; ambas as conversas estavam em modo automatizado durante o planejamento supervisionado. A ação profissional não altera o modo humano.
- O número de solicitações de segunda via dos dois cadastros permaneceu em um antes e depois; os dois testes não criaram cobrança nem novo pedido clínico.
- Testes: 176 verificações passaram em oito arquivos, incluindo PostgreSQL descartável, seleção com interseção de filtros, identidade ambígua, revalidação de destino, acesso ao PDF, incerteza de envio, urgência e decisão médica.
- Compilação do servidor passou. A conferência de tipos continua bloqueada somente pelo erro preexistente TS7022 em `pax-finance/laboratorio-calc.ts`.
- Registro do servidor confirmou reinício e chamadas de reenvio/acesso/webhook; links e segredo de webhook aparecem ocultos. Há avisos de agenda preexistentes, sem erro de envio observado nessa sequência.
- Consulta de orientações: 21 registros de efeitos colaterais em rascunho e nenhum aprovado nessa categoria. Não foram aprovados nem enviados como orientação clínica.
- Os testes de planejamento de ambos os cadastros retornaram lacuna explícita para efeitos colaterais, falta de arquivo de protocolo e exigência de decisão/assinatura médica para receita nova; nenhuma dessas simulações enviou mensagem ou criou pedido.
- Não há protocolo emitido no arquivo clínico desses cadastros. Isso não afirma inexistência de protocolo operacional em outras tabelas nem autoriza gerar um novo arquivo como segunda via.
- Limitações: não foi fabricada uma nova mensagem recebida para demonstrar o ciclo externo de pedido e confirmação da cliente; entrega supervisionada não substitui essa evidência. A revisão independente sequencial continua pendente.
- A captura da aplicação mostrou o painel inicial carregado, mas não verificou visualmente o painel autenticado de reenvio nesta rodada.

### Histórico da execução anterior

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
