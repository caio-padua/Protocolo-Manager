/**
 * slack-glossario.ts
 * Dicionário canônico do PADAXOR — FONTE ÚNICA DE VERDADE para máquinas.
 *
 * REGRA CENTRAL: cada termo tem um número PERMANENTE = campo "numero".
 * O número NUNCA muda. Termo novo entra sempre no FINAL do array.
 *
 * Campos obrigatórios  : numero · termo · leigo
 * Campos enriquecidos  : explicacao · ondeUsar · funcaoUsual
 *   — preenchidos aqui propagam automaticamente para a aba DICIONARIO do Sheets
 *   — a sync só escreve células VAZIAS; o que o CEO editou no Sheets é preservado
 *
 * Ao adicionar novo termo: acrescentar no final, preencher TODOS os campos,
 * reiniciar o servidor (ou chamar POST /api/admin/planilha/sincronizar-dicionario).
 */

export type GlossarioEntry = {
  numero:       number;  // número PERMANENTE — nunca recalcular, nunca reordenar
  termo:        string;  // termo técnico exato (case-insensitive na busca)
  leigo:        string;  // Col D — analogia clínica para o CEO
  explicacao?:  string;  // Col C — definição técnica concisa (1-2 frases)
  ondeUsar?:    string;  // Col E — onde aparece no projeto PADAXOR/Manager
  funcaoUsual?: string;  // Col F — o que o CEO costuma perguntar sobre este termo
};

/**
 * Dicionário canônico — 96 termos completos.
 * Ordenado por numero permanente. NÃO alterar a ordem.
 */
export const GLOSSARIO: GlossarioEntry[] = [
  {
    numero: 1, termo: "AI Gateway",
    leigo:       "E a caixa de energia na frente da casa: nada consome sem passar pelo medidor.",
    explicacao:  "Camada intermediária (Cloudflare AI Gateway) que centraliza, audita e limita todas as chamadas aos modelos de IA.",
    ondeUsar:    "Ativo via CF_AI_GATEWAY_URL; toda chamada Anthropic/Gemini/OpenAI passa por ele antes de responder.",
    funcaoUsual: "Por que a IA está falhando? / Quanto estamos gastando em IA?",
  },
  {
    numero: 2, termo: "Anthropic",
    leigo:       "E um dos laboratorios de onde vem a inteligencia que o sistema usa.",
    explicacao:  "Empresa criadora do Claude (séries claude-3 e claude-4); usada para raciocínio clínico, análise de texto e agentes.",
    ondeUsar:    "Chamada em processamento de laudos, resumo de prontuário, cockpit e agentes do PADAXOR.",
    funcaoUsual: "Analisa este laudo / Gera um resumo do prontuário / Qual IA está respondendo?",
  },
  {
    numero: 3, termo: "API",
    leigo:       "E o balcao de atendimento de um laboratorio. Voce nao entra no laboratorio: chega no balcao, entrega o pedido, recebe o resultado. A API e o balcao, e cada guiche e uma rota.",
    explicacao:  "Application Programming Interface — conjunto de rotas HTTP que expõem funcionalidades do servidor para clientes web ou outros serviços.",
    ondeUsar:    "Toda interação entre o front-end e o back-end passa por rotas /api/...; base de toda integração externa.",
    funcaoUsual: "Por que a tela não carrega? / Como o front busca os dados?",
  },
  {
    numero: 4, termo: "append-only",
    leigo:       "E o prontuario do paciente. Voce nao apaga a evolucao de ontem: escreve a de hoje embaixo. Se errou ontem, escreve hoje que errou. O erro fica registrado, e e isso que da valor legal.",
    explicacao:  "Padrão de persistência em que linhas só são adicionadas, nunca alteradas ou apagadas — garante rastreabilidade completa.",
    ondeUsar:    "Histórico de relatórios, log de uso de IA (ai_usage_log), ledger financeiro — nenhuma linha é deletada.",
    funcaoUsual: "Posso ver o histórico de tudo que aconteceu? / Por que não posso apagar esse registro?",
  },
  {
    numero: 5, termo: "backup",
    leigo:       "E o seguro do carro. Custa todo mes e parece dinheiro jogado fora, ate o dia da batida.",
    explicacao:  "Cópia periódica e automática dos dados do banco em local seguro e separado do ambiente de produção.",
    ondeUsar:    "Railway faz backup automático do PostgreSQL de produção; Replit tem checkpoints do ambiente de desenvolvimento.",
    funcaoUsual: "E se o banco de dados corromper? / Posso voltar para como estava ontem?",
  },
  {
    numero: 6, termo: "banco de dados",
    leigo:       "E o arquivo de fichas da clinica, mas que responde em um centesimo de segundo e nunca perde uma ficha por descuido.",
    explicacao:  "PostgreSQL — sistema gerenciador de dados relacionais que armazena e serve todos os dados do sistema em estrutura tabular.",
    ondeUsar:    "Núcleo de tudo no Manager/PADAXOR — clientes, exames, agenda, financeiro, usuários e configurações.",
    funcaoUsual: "Onde os dados ficam salvos? / Preciso buscar todos os clientes / Que tabela armazena isso?",
  },
  {
    numero: 7, termo: "branch",
    leigo:       "E a via de um exame: voce faz o rascunho da conduta numa folha separada antes de escrever no prontuario oficial. Se der errado, joga a folha fora e o prontuario continua intacto.",
    explicacao:  "Linha de desenvolvimento paralela em git que isola mudanças de código sem afetar o que está em produção.",
    ondeUsar:    "Toda feature nova cresce em sua própria branch; merge traz para main apenas quando aprovada e testada.",
    funcaoUsual: "Isso quebrou o sistema? / Estava funcionando ontem / Pode reverter essa mudança?",
  },
  {
    numero: 8, termo: "CI/CD",
    leigo:       "E a conferencia dupla da enfermagem antes de aplicar a medicacao. Ninguem confia so na memoria de quem preparou.",
    explicacao:  "Continuous Integration / Continuous Delivery — automação de testes e publicação a cada mudança de código.",
    ondeUsar:    "Não configurado ativamente no PADAXOR; Dr. Code responde por pipeline de deploy no Railway e no GitHub.",
    funcaoUsual: "A nova versão está no ar? / Subiu sem erro? / Os testes passaram?",
  },
  {
    numero: 9, termo: "circuit breaker",
    leigo:       "E o disjuntor do quadro: corta antes de queimar.",
    explicacao:  "Padrão de resiliência que interrompe automaticamente chamadas a um serviço instável para evitar efeito cascata no sistema.",
    ondeUsar:    "Aplicável em integrações externas (Asaas, Twilio, ZapSign) quando o serviço externo fica instável ou lento.",
    funcaoUsual: "A integração está travando tudo? / O sistema está lento por causa do Asaas?",
  },
  {
    numero: 10, termo: "clone",
    leigo:       "E uma franquia: mesma placa, dono diferente, cozinha propria.",
    explicacao:  "Instância licenciada do sistema com banco e domínio próprios, derivada da plataforma central PADAXOR.",
    ondeUsar:    "Modelo comercial PADAXOR: cada clínica licenciada roda sua própria instância isolada.",
    funcaoUsual: "Como funciona a franquia do sistema? / O licenciado tem acesso a IA?",
  },
  {
    numero: 11, termo: "CNAME",
    leigo:       "E o encaminhamento de telefone: quem liga para o numero antigo cai automaticamente no novo, sem saber que foi encaminhado.",
    explicacao:  "Registro DNS que aponta um subdomínio (ex.: app.clinica.com) para o domínio técnico da plataforma hospedada.",
    ondeUsar:    "Configurado ao implantar domínio personalizado de clínica licenciada no Cloudflare/Railway.",
    funcaoUsual: "Como coloco o domínio da clínica no sistema? / O site está no endereço certo?",
  },
  {
    numero: 12, termo: "commit",
    leigo:       "E uma entrada assinada no prontuario: quem escreveu, quando, e o que mudou. Nao se apaga.",
    explicacao:  "Snapshot versionado do código salvo no histórico git com autoria, timestamp e descrição da mudança.",
    ondeUsar:    "Toda mudança feita por Dr. Code ou Dr. Replit vira um commit antes de ir ao ar; base do histórico do projeto.",
    funcaoUsual: "O que foi mudado? / Posso voltar atrás? / Quando isso foi alterado?",
  },
  {
    numero: 13, termo: "conector",
    leigo:       "E a tomada: voce nao refaz a fiacao da rua, so pluga.",
    explicacao:  "Módulo de integração pré-configurado da plataforma Replit que conecta a serviços externos sem expor credenciais.",
    ondeUsar:    "Google Drive, Gmail, Slack, Calendar — todos conectados via conectores Replit sem gerenciar OAuth manualmente.",
    funcaoUsual: "Como o sistema acessa o Drive? / Preciso conectar com um novo serviço.",
  },
  {
    numero: 14, termo: "CORS",
    leigo:       "E a lista da portaria do predio: so sobe quem esta na lista. Sem a lista certa, ate o morador fica na calcada.",
    explicacao:  "Cross-Origin Resource Sharing — política de segurança do navegador que controla quais domínios podem chamar a API.",
    ondeUsar:    "Configurado em app.ts via ALLOWED_ORIGINS; erro de CORS bloqueia o front-end de acessar o back-end.",
    funcaoUsual: "A tela está dando erro de rede / O front não consegue buscar os dados.",
  },
  {
    numero: 15, termo: "cron",
    leigo:       "E o despertador do sistema: voce marca a hora, ele toca sem ninguem lembrar.",
    explicacao:  "Daemon Unix que executa comandos em intervalos definidos por expressões de horário (ex.: 0 * * * * = a cada hora).",
    ondeUsar:    "cron.ts dispara relatório horário Slack, watcher do Drive, limpeza de sessões e outras rotinas automáticas.",
    funcaoUsual: "Isso roda automaticamente? / Por que o relatório não chegou? / Como agendar uma tarefa?",
  },
  {
    numero: 16, termo: "deploy",
    leigo:       "E a diferenca entre escrever a receita no bloco e entregar na mao do paciente. Enquanto nao entregou, nao existe para ele.",
    explicacao:  "Processo de publicar uma versão nova do código no servidor de produção (Railway), tornando-a acessível aos usuários.",
    ondeUsar:    "Dr. Code e Dr. Replit fazem deploy; Railway serve a versão publicada 24/7 para clientes e clínicas.",
    funcaoUsual: "A mudança já está no ar? / Quando sobe para produção? / O cliente ainda está vendo a versão antiga.",
  },
  {
    numero: 17, termo: "DKIM",
    leigo:       "E o carimbo e a assinatura no receituario. Sem eles, a farmacia trata como falsificacao.",
    explicacao:  "DomainKeys Identified Mail — assinatura criptográfica adicionada ao e-mail para provar que veio do domínio legítimo.",
    ondeUsar:    "Necessário configurar no DNS do domínio de envio para que e-mails do sistema não caiam em spam.",
    funcaoUsual: "O e-mail está indo para spam? / Como configuro o domínio de e-mail?",
  },
  {
    numero: 18, termo: "DNS",
    leigo:       "E a lista telefonica: voce sabe o nome da pessoa, e ela devolve o numero. Ninguem decora o numero.",
    explicacao:  "Domain Name System — sistema global que traduz nomes de domínio (padaxor.com) em endereços IP dos servidores.",
    ondeUsar:    "Configurado no Cloudflare; necessário para domínios personalizados, registros SPF/DKIM e CNAME de clones.",
    funcaoUsual: "O site ficou fora do ar / Como aponto o domínio? / Por que o endereço não funciona?",
  },
  {
    numero: 19, termo: "dry-run",
    leigo:       "E o ensaio da cirurgia: todo mundo faz os gestos, ninguem corta.",
    explicacao:  "Execução simulada de um processo que mostra o que aconteceria sem efetuar mudanças reais no banco ou no sistema.",
    ondeUsar:    "Usado antes de migrations, imports em massa, limpeza de dados ou qualquer operação destrutiva.",
    funcaoUsual: "O que vai acontecer se eu rodar isso? / Posso simular antes de confirmar?",
  },
  {
    numero: 20, termo: "empresa_id",
    leigo:       "E o numero do prontuario: e o que diz de quem e aquela ficha.",
    explicacao:  "Chave estrangeira numérica que vincula todo registro ao tenant (empresa/clínica) correto, impedindo vazamento entre clientes.",
    ondeUsar:    "Obrigatório em toda tabela clínica; valor padrão = 5 (PADCOM) no ambiente de desenvolvimento.",
    funcaoUsual: "Os dados estão aparecendo para o cliente errado? / Como isolo os dados por clínica?",
  },
  {
    numero: 21, termo: "endpoint",
    leigo:       "E o guiche especifico dentro do balcao: um guiche para entregar exame, outro para retirar resultado.",
    explicacao:  "Rota HTTP específica (ex.: POST /api/clientes) que executa uma ação definida no servidor.",
    ondeUsar:    "Cada funcionalidade do sistema tem seu endpoint; listados na documentação e em app.ts.",
    funcaoUsual: "Como o front manda os dados? / Preciso de uma nova funcionalidade no back-end.",
  },
  {
    numero: 22, termo: "FK",
    leigo:       "E o numero do prontuario escrito no pedido de exame: e o que amarra aquele exame aquele paciente e nao a outro.",
    explicacao:  "Foreign Key (Chave Estrangeira) — coluna que referencia a chave primária de outra tabela, criando relacionamento entre dados.",
    ondeUsar:    "Toda tabela clínica tem FK para empresa_id, client_id, location_id etc.; garante integridade referencial.",
    funcaoUsual: "Por que o dado não aparece? / Como o exame é ligado ao paciente?",
  },
  {
    numero: 23, termo: "Gemini",
    leigo:       "Outro laboratorio, melhor em enxergar imagem e PDF.",
    explicacao:  "Família de modelos de IA multimodal do Google DeepMind, com suporte a texto e visão — lê PDFs escaneados e imagens.",
    ondeUsar:    "Usado em extractExamFromMedia para leitura de laudos escaneados ou imagens de exames que o pdf-parse não consegue.",
    funcaoUsual: "Extrai os dados deste laudo / Por que o exame não foi processado? / Lê esta imagem de exame.",
  },
  {
    numero: 24, termo: "hash",
    leigo:       "E a impressao digital de um documento. Duas pessoas nao tem a mesma, e a sua nao muda sozinha. Se o documento foi adulterado, a impressao digital nao bate mais.",
    explicacao:  "Função matemática irreversível que transforma qualquer dado em uma string de tamanho fixo e única.",
    ondeUsar:    "Senhas (scrypt), deduplicação de documentos clínicos e verificação de integridade de arquivos enviados.",
    funcaoUsual: "Como o sistema protege a senha? / Como saber se o arquivo foi alterado?",
  },
  {
    numero: 25, termo: "idempotente",
    leigo:       "E apertar o botao do elevador. Apertar dez vezes nao chama dez elevadores: o andar continua marcado uma vez so.",
    explicacao:  "Operação que pode ser executada N vezes com o mesmo resultado, sem efeitos colaterais adicionais.",
    ondeUsar:    "Seeds, webhooks de pagamento, sincronizações de dicionário — todos projetados para ser idempotentes.",
    funcaoUsual: "Posso rodar de novo sem estragar? / O webhook duplicou o registro?",
  },
  {
    numero: 26, termo: "indice unico",
    leigo:       "E o CPF: o cartorio nao deixa dois cadastros com o mesmo numero. A regra vive no cartorio, nao na boa vontade de quem preenche.",
    explicacao:  "Restrição do banco de dados que garante que um campo (ou combinação de campos) não se repete em nenhuma linha.",
    ondeUsar:    "CPF, e-mail, números de protocolo — sempre com índice único no banco; garante unicidade sem depender do código.",
    funcaoUsual: "Por que está duplicando o registro? / Como evito que o mesmo CPF entre duas vezes?",
  },
  {
    numero: 27, termo: "ledger",
    leigo:       "E o livro-caixa: cada linha e uma coisa que aconteceu e vale dinheiro.",
    explicacao:  "Tabela de lançamentos financeiros imutáveis (append-only) que registra toda movimentação de valor com timestamp.",
    ondeUsar:    "Financeiro do PADAXOR: cada pagamento, saque e repasse gera uma linha no ledger — nunca se apaga.",
    funcaoUsual: "Qual o extrato financeiro? / Posso ver o histórico de pagamentos? / O valor está correto?",
  },
  {
    numero: 28, termo: "login_username",
    leigo:       "E o seu nome na portaria: a senha prova que e voce, o usuario diz quem voce diz ser.",
    explicacao:  "Identificador textual único do usuário no sistema de autenticação, distinto do e-mail.",
    ondeUsar:    "Usado no login de colaboradores e na API de autenticação interna do Manager.",
    funcaoUsual: "Por que o login não funciona? / Como crio um novo acesso?",
  },
  {
    numero: 29, termo: "main",
    leigo:       "E o prontuario oficial, nao o rascunho. O que nao esta nele, oficialmente nao aconteceu.",
    explicacao:  "Branch principal do repositório git — o código que vai para produção vem exclusivamente de main.",
    ondeUsar:    "Todo merge de feature vai para main; Railway faz deploy automaticamente a partir de main.",
    funcaoUsual: "O que está em produção agora? / A mudança já foi para main?",
  },
  {
    numero: 30, termo: "merge",
    leigo:       "E juntar as anotacoes de dois medicos sobre o mesmo paciente num prontuario unico.",
    explicacao:  "Operação git que integra o código de uma branch de desenvolvimento na branch principal preservando o histórico de ambas.",
    ondeUsar:    "Feito por Dr. Code ou Dr. Replit após revisão; a task fica IMPLEMENTADA quando o merge é aprovado.",
    funcaoUsual: "A task foi concluída — pode subir? / O merge gerou conflito?",
  },
  {
    numero: 31, termo: "middleware",
    leigo:       "E o porteiro do predio: toda visita passa por ele antes de chegar no apartamento, e ele decide quem sobe.",
    explicacao:  "Função que intercepta toda requisição HTTP antes de chegar na rota destino, podendo autorizar, enriquecer ou rejeitar.",
    ondeUsar:    "tenantContextMiddleware, basicAuthMiddleware, requireCeoInstance — todos registrados em app.ts.",
    funcaoUsual: "Como o sistema sabe quem está logado? / Como funciona o guard de acesso?",
  },
  {
    numero: 32, termo: "migration",
    leigo:       "E a reforma da clinica com planta aprovada e registrada, em vez de derrubar parede no impulso.",
    explicacao:  "Script SQL versionado que altera a estrutura do banco (ADD COLUMN, CREATE TABLE) de forma controlada e reversível.",
    ondeUsar:    "Usada para toda mudança estrutural no banco; nunca usar db push em produção — sempre migration explícita.",
    funcaoUsual: "Preciso de uma nova coluna no banco / Como faço a mudança sem perder dados?",
  },
  {
    numero: 33, termo: "mock",
    leigo:       "E o manequim de treinamento. Serve para ensaiar, e e perigoso se alguem esquecer e tratar como paciente.",
    explicacao:  "Substituto de um serviço real usado em testes para simular comportamentos sem chamadas externas ou efeitos reais.",
    ondeUsar:    "Testes unitários de integrações (Asaas, Twilio); perigoso se confundido com serviço real em produção.",
    funcaoUsual: "Isso é teste ou é real? / Está usando dados de verdade?",
  },
  {
    numero: 34, termo: "multi-tenant",
    leigo:       "E um predio de consultorios: mesma estrutura, mesmo elevador, mas cada sala tem chave propria e ninguem entra na do outro.",
    explicacao:  "Arquitetura em que um único sistema atende múltiplos clientes com isolamento completo de dados por empresa_id.",
    ondeUsar:    "Toda a plataforma PADAXOR é multi-tenant; cada clínica licenciada é um tenant com dados isolados.",
    funcaoUsual: "Como garantir que a clínica A não vê dados da clínica B? / É seguro para múltiplas clínicas?",
  },
  {
    numero: 35, termo: "OpenAI",
    leigo:       "Um terceiro laboratorio, forte em transcrever audio.",
    explicacao:  "Empresa criadora da família de modelos GPT; API usada principalmente para transcrição de áudio (Whisper).",
    ondeUsar:    "Acionada em funcionalidades de transcrição de voz; menos usada que Anthropic e Gemini no PADAXOR.",
    funcaoUsual: "Transcreve essa gravação / Qual IA está sendo usada aqui?",
  },
  {
    numero: 36, termo: "PR",
    leigo:       "E o pedido de parecer antes da cirurgia. Alguem olha, comenta, e so depois entra.",
    explicacao:  "Pull Request — pedido formal de revisão e aprovação antes de integrar código de uma branch em main.",
    ondeUsar:    "Fluxo padrão: branch → PR → revisão → merge; cada PR vira uma task concluída no projeto.",
    funcaoUsual: "A mudança foi revisada antes de subir? / Tem PR aberto para isso?",
  },
  {
    numero: 37, termo: "PWA",
    leigo:       "E um aparelho que serve de dois jeitos: no consultorio parece bancada, na mao vira portatil. Mesmo aparelho.",
    explicacao:  "Progressive Web App — aplicativo web que funciona como app nativo no celular e no desktop sem precisar de loja.",
    ondeUsar:    "O front-end do Manager é uma PWA; pode ser instalado na tela inicial do celular diretamente pelo navegador.",
    funcaoUsual: "Posso instalar no celular? / Por que parece um aplicativo nativo?",
  },
  {
    numero: 38, termo: "RBAC",
    leigo:       "E a diferenca entre medico, enfermeiro e recepcao no sistema da clinica: cada um ve a tela do seu papel.",
    explicacao:  "Role-Based Access Control — controle de acesso baseado em papéis (CEO, colaborador, recepcionista).",
    ondeUsar:    "Cada tela do Manager verifica o papel do usuário antes de exibir ou permitir ação; matriz Papel × Ferramenta.",
    funcaoUsual: "Esse usuário não deveria ver isso / Como limito o acesso de um funcionário?",
  },
  {
    numero: 39, termo: "repositorio",
    leigo:       "E o arquivo morto da clinica, mas em que nada se perde e da para voltar a qualquer dia do passado.",
    explicacao:  "Diretório git com todo o histórico versionado de commits, branches e tags do projeto.",
    ondeUsar:    "O repositório PADAXOR está no GitHub (caio-padua/PADAXOR); contém todo o código e histórico.",
    funcaoUsual: "Onde está o código? / Posso ver o que mudou? / Como acesso o repositório?",
  },
  {
    numero: 40, termo: "RLS",
    leigo:       "E a tranca da porta da sala, nao o aviso 'por favor nao entre'. O aviso depende da boa vontade; a tranca nao.",
    explicacao:  "Row Level Security — política do PostgreSQL que filtra linhas automaticamente por empresa_id sem depender do código.",
    ondeUsar:    "Garante isolamento de dados por tenant mesmo que uma query esqueça de filtrar por empresa_id.",
    funcaoUsual: "Como garantir isolamento no banco sem confiar só no código?",
  },
  {
    numero: 41, termo: "scrypt",
    leigo:       "E guardar a impressao digital do paciente em vez do dedo dele. Da para conferir se bate, mas ninguem reconstroi o dedo a partir dela.",
    explicacao:  "Algoritmo de hash de senha resistente a ataques de força bruta — mais seguro que bcrypt por consumir mais memória.",
    ondeUsar:    "Usado no hash de senhas de colaboradores armazenadas no banco de dados do Manager.",
    funcaoUsual: "As senhas estão seguras? / Como o sistema armazena a senha?",
  },
  {
    numero: 42, termo: "SPF",
    leigo:       "E a lista de quem pode assinar receita em nome da clinica. Sem ela, qualquer um assina.",
    explicacao:  "Sender Policy Framework — registro DNS que lista quais servidores estão autorizados a enviar e-mail pelo domínio.",
    ondeUsar:    "Necessário junto com DKIM para que e-mails do sistema não sejam marcados como spam pelos servidores de destino.",
    funcaoUsual: "E-mail está caindo em spam / Como configuro o domínio de envio?",
  },
  {
    numero: 43, termo: "SSE",
    leigo:       "E o monitor de sinais vitais: ele avisa quando muda, voce nao fica olhando de minuto em minuto.",
    explicacao:  "Server-Sent Events — conexão HTTP de longa duração que empurra eventos do servidor ao navegador sem polling.",
    ondeUsar:    "Cockpit CEO (GET /api/ceo/stream) atualiza o painel em tempo real sem o front precisar recarregar.",
    funcaoUsual: "O painel atualiza sozinho? / Por que os dados não mudam sem recarregar a página?",
  },
  {
    numero: 44, termo: "token",
    leigo:       "E a pulseira do hospital. Voce se identifica uma vez na recepcao e depois so mostra a pulseira em cada setor.",
    explicacao:  "Sequência aleatória ou assinada que representa identidade ou autorização temporária sem expor credenciais.",
    ondeUsar:    "Tokens de colaborador, tokens de sessão, tokens de webhook — gerados e validados no servidor do Manager.",
    funcaoUsual: "Como o sistema sabe que sou eu? / O acesso expirou? / Preciso de um novo token.",
  },
  {
    numero: 45, termo: "UPSERT",
    leigo:       "E abrir ficha se o paciente e novo, ou atualizar a que ja existe se ele ja veio antes. Uma decisao so, automatica.",
    explicacao:  "Operação que insere um registro novo ou atualiza o existente se já houver conflito — combina INSERT + UPDATE.",
    ondeUsar:    "Seeds, sincronizações de dicionário, qualquer operação idempotente de dados no banco.",
    funcaoUsual: "Por que está duplicando? / Como atualizo sem correr risco de sobrescrever dados importantes?",
  },
  {
    numero: 46, termo: "webhook",
    leigo:       "E o laboratorio que liga para voce quando o resultado critico sai, em vez de voce ligar de hora em hora perguntando.",
    explicacao:  "Callback HTTP que um serviço externo dispara automaticamente para o servidor quando um evento ocorre.",
    ondeUsar:    "Asaas chama webhook de pagamento confirmado; ZapSign chama ao assinar; Twilio ao entregar mensagem.",
    funcaoUsual: "Como o sistema sabe que o pagamento foi confirmado? / Por que o evento não chegou?",
  },
  {
    numero: 47, termo: "worker",
    leigo:       "E o funcionario dos fundos: nao atende no balcao, faz o servico que leva tempo.",
    explicacao:  "Processo em segundo plano que executa tarefas longas sem travar o servidor HTTP principal.",
    ondeUsar:    "Processamento de PDF de exames, envio de lembretes, geração de receituário — todos rodam em worker.",
    funcaoUsual: "Por que demora para processar? / O sistema trava enquanto processa o laudo?",
  },
  {
    numero: 48, termo: "JWT",
    leigo:       "É a pulseira com QR-code da festa VIP: você mostra na entrada e entra em qualquer área permitida sem fila.",
    explicacao:  "JSON Web Token — token assinado digitalmente que carrega identidade e permissões do usuário, verificável sem banco.",
    ondeUsar:    "Autenticação de sessões do Manager e APIs protegidas por Bearer token.",
    funcaoUsual: "O login expirou? / Como funciona a autenticação do sistema?",
  },
  {
    numero: 49, termo: "tenant",
    leigo:       "É um apartamento no prédio: mesma estrutura física, porta separada, mobília própria, vizinho não acessa.",
    explicacao:  "Unidade isolada de cliente ou clínica dentro da arquitetura multi-tenant — identificada pelo empresa_id.",
    ondeUsar:    "Cada clínica licenciada no PADAXOR é um tenant; o tenantContextMiddleware injeta o contexto em cada requisição.",
    funcaoUsual: "Como o sistema separa os dados de cada clínica? / Esta clínica é um tenant separado?",
  },
  {
    numero: 50, termo: "cron job",
    leigo:       "É o funcionário que toda sexta às 18h fecha o caixa automaticamente — não precisa ninguém mandar.",
    explicacao:  "Tarefa específica registrada no agendador cron para executar em horário programado sem intervenção humana.",
    ondeUsar:    "Relatório horário Slack, sync do Drive a cada 4h, lembretes de consulta — todos são cron jobs em cron.ts.",
    funcaoUsual: "Isso roda automaticamente? / O relatório não chegou na hora certa.",
  },
  {
    numero: 51, termo: "schema",
    leigo:       "É a planta baixa da clínica: define onde fica cada sala, quantas portas tem, o que cabe em cada cômodo.",
    explicacao:  "Definição formal da estrutura do banco de dados — tabelas, colunas, tipos, índices e relacionamentos.",
    ondeUsar:    "Definido em Drizzle ORM (schema/); todo schema novo vira migration antes de ir a produção.",
    funcaoUsual: "Que campos tem a tabela de clientes? / Como estruturo um novo dado no banco?",
  },
  {
    numero: 52, termo: "buffer",
    leigo:       "É a sala de espera antes do consultório: o paciente chega, espera, e é chamado na ordem.",
    explicacao:  "Área de memória temporária para segurar dados em trânsito entre duas etapas de processamento.",
    ondeUsar:    "Node.js usa Buffer para PDF, imagens e binários no servidor; erros de buffer surgem no upload de arquivos.",
    funcaoUsual: "Por que dá erro ao processar o arquivo? / O arquivo chegou correto?",
  },
  {
    numero: 53, termo: "pipeline",
    leigo:       "É a linha de montagem da farmácia de manipulação: pesa, mistura, encapsula, rotula — em ordem fixa.",
    explicacao:  "Sequência de etapas encadeadas onde a saída de uma é a entrada da próxima, processando dados de forma ordenada.",
    ondeUsar:    "Pipeline de extração de exame: PDF → texto → IA (Gemini/Anthropic) → estruturado → banco.",
    funcaoUsual: "Como funciona o processamento de laudos? / Em qual etapa está falhando?",
  },
  {
    numero: 54, termo: "royalty",
    leigo:       "É a comissão do médico que assina o protocolo: toda vez que a clínica licenciada aplica, ele recebe.",
    explicacao:  "Percentual contratual do faturamento pago ao criador/licenciante pelo uso do produto licenciado.",
    ondeUsar:    "Modelo comercial do PADAXOR: clínicas licenciadas pagam royalty mensal sobre uso da plataforma.",
    funcaoUsual: "Como funciona o financeiro das franquias? / Quanto a clínica licenciada me paga?",
  },
  {
    numero: 55, termo: "UUID",
    leigo:       "É o CPF do registro: nunca se repete, não depende de nenhum contador central.",
    explicacao:  "Universally Unique Identifier — identificador de 128 bits gerado localmente sem coordenação central, garantidamente único.",
    ondeUsar:    "Chave primária da maioria das tabelas no Manager — garante unicidade global mesmo com múltiplos servidores.",
    funcaoUsual: "Por que não usar ID sequencial? / O que é esse código longo no registro?",
  },
  {
    numero: 56, termo: "seed",
    leigo:       "É o estoque inicial de uma farmácia recém-aberta: sem ele, o sistema existe mas não tem nada para vender.",
    explicacao:  "Dados iniciais inseridos no banco automaticamente no boot para o sistema funcionar desde o primeiro acesso.",
    ondeUsar:    "Catálogo de analitos, posições do PADTEAM, substâncias dos protocolos — todos semeados via seed no boot.",
    funcaoUsual: "O sistema está vazio depois do deploy? / Como popular dados iniciais sem fazer manualmente?",
  },
  {
    numero: 57, termo: "mimeType",
    leigo:       "É a etiqueta do frasco de medicamento: diz se é comprimido, líquido ou pomada antes de abrir.",
    explicacao:  "Padrão IANA (ex.: application/pdf, image/jpeg) que identifica o formato de um arquivo transmitido via HTTP.",
    ondeUsar:    "Verificado no upload de exames e documentos; erros de mimeType bloqueiam o aceite do arquivo.",
    funcaoUsual: "Por que não aceita o arquivo? / Quais formatos são suportados?",
  },
  {
    numero: 58, termo: "proxy",
    leigo:       "É o corretor de imóveis: você fala com ele, ele fala com o proprietário — ninguém se fala diretamente.",
    explicacao:  "Servidor intermediário que recebe requisições e as repassa a outro servidor, ocultando a origem ou o destino.",
    ondeUsar:    "Replit é um proxy reverso para o servidor de desenvolvimento; CF AI Gateway é proxy das chamadas de IA.",
    funcaoUsual: "Por que a URL muda? / Como funciona o roteamento entre front e back?",
  },
  {
    numero: 59, termo: "OAuth",
    leigo:       "É dar a chave do carro ao manobrista: ele move o carro, mas não tem acesso à sua casa nem ao cofre.",
    explicacao:  "Protocolo aberto de autorização delegada (RFC 6749) que permite acesso a recursos externos sem compartilhar senha.",
    ondeUsar:    "Google Drive, Gmail e Calendar conectados via OAuth do Replit (conectores); usuário autoriza uma vez.",
    funcaoUsual: "Como o sistema acessa o e-mail/Drive sem pedir minha senha toda hora?",
  },
  {
    numero: 60, termo: "env var",
    leigo:       "É o cofre da clínica: a senha fica lá, não escrita no protocolo público.",
    explicacao:  "Variável de ambiente — par chave-valor injetado pelo sistema operacional no processo em tempo de execução.",
    ondeUsar:    "Todos os segredos (API keys, tokens, IDs) vivem em env vars nos Replit Secrets; nunca no código.",
    funcaoUsual: "Onde fica a chave da API? / Por que dá erro de configuração? / Preciso adicionar uma nova chave.",
  },
  {
    numero: 61, termo: "pull",
    leigo:       "É sincronizar a agenda do Google: você puxa as consultas novas que outra pessoa adicionou.",
    explicacao:  "Comando git que baixa commits do repositório remoto (GitHub) e integra na branch local atual.",
    ondeUsar:    "Usado para atualizar o código local com o que foi mergeado por outro agente no repositório central.",
    funcaoUsual: "Atualizou o código? / Tem novidade no repositório que preciso baixar?",
  },
  {
    numero: 62, termo: "repo",
    leigo:       "É o prontuário completo do sistema: cada mudança está lá, assinada, datada e reversível.",
    explicacao:  "Repositório git — diretório com todo o histórico de versões, branches e tags do projeto.",
    ondeUsar:    "O repo principal é caio-padua/PADAXOR no GitHub; monorepo com todos os artefatos do projeto.",
    funcaoUsual: "Onde está o código? / Como acesso o repositório? / Quem fez essa mudança?",
  },
  {
    numero: 63, termo: "fail-safe",
    leigo:       "É o gerador de emergência da UTI: se a rede cair, o monitor de sinais vitais continua ligado.",
    explicacao:  "Mecanismo que garante comportamento seguro e controlado mesmo quando um componente do sistema falha.",
    ondeUsar:    "Relatório dual-canal Slack/Telegram: se Telegram falha, Slack assume. Boot sync: falha é ignorada sem travar.",
    funcaoUsual: "O sistema continua funcionando se o Telegram cair? / O que acontece se a IA não responder?",
  },
  {
    numero: 64, termo: "spec",
    leigo:       "É a prescrição antes da manipulação: o médico escreve o que quer antes de a farmácia produzir.",
    explicacao:  "Documento de especificação escrito antes de construir — define comportamento esperado, contratos e casos de uso.",
    ondeUsar:    "Specs vivem em /specs/*.md; Dr. Claude escreve, Dr. Replit ou Dr. Code constroem conforme a spec.",
    funcaoUsual: "Qual é o comportamento esperado? / Tem spec para isso? / O que foi combinado?",
  },
  {
    numero: 65, termo: "tenant context",
    leigo:       "É o crachá do plantonista: diz em qual hospital ele está naquele turno, quais salas pode acessar.",
    explicacao:  "Conjunto de metadados (empresa_id, nome, configs) injetados em cada requisição HTTP pelo tenantContextMiddleware.",
    ondeUsar:    "Acessado via req.tenant em toda rota que precisa saber qual clínica está fazendo a requisição.",
    funcaoUsual: "Como a rota sabe qual clínica está pedindo? / Por que o dado saiu errado?",
  },
  {
    numero: 66, termo: "ai_usage_log",
    leigo:       "É o livro-caixa de exames terceirizados: cada pedido ao laboratório externo fica registrado com o custo.",
    explicacao:  "Tabela PostgreSQL que registra cada chamada de IA: modelo usado, tokens consumidos, custo em USD e resultado.",
    ondeUsar:    "Monitor de LLMs, relatório Slack e painel do CEO consultam essa tabela para mostrar consumo e custo.",
    funcaoUsual: "Quanto está custando a IA? / Quais modelos estão sendo mais usados? / Houve chamada fora do padrão?",
  },
  {
    numero: 67, termo: "logAiUsage",
    leigo:       "É o carimbo automático da balança: todo peso registrado ganha carimbo de data e hora sem ninguém pedir.",
    explicacao:  "Função TypeScript que persiste um registro de uso de IA na tabela ai_usage_log a cada chamada de modelo.",
    ondeUsar:    "Chamada em toda rota que invoca Anthropic, Gemini ou OpenAI no PADAXOR — sem ela o consumo não é rastreado.",
    funcaoUsual: "O uso de IA está sendo monitorado? / Por que não aparece no relatório?",
  },
  {
    numero: 68, termo: "requireCeoInstance",
    leigo:       "É a catraca do andar executivo: não adianta ter crachá de funcionário, precisa do crachá de diretor.",
    explicacao:  "Middleware que bloqueia rotas sensíveis exceto quando a requisição vem do CEO autenticado com token válido.",
    ondeUsar:    "Rotas de admin, planilha, configurações, relatórios e dicionário — todas usam esse guard.",
    funcaoUsual: "Só o CEO deve acessar isso / Como protejo uma rota nova contra acesso de licenciados?",
  },
  {
    numero: 69, termo: "PADAXOR_AI_BYPASS",
    leigo:       "É o crachá master do dono do prédio: abre qualquer porta, inclusive as que o gerente não alcança.",
    explicacao:  "Variável de ambiente que sinaliza que a instância pertence ao CEO, liberando IA direta sem restrições de clone.",
    ondeUsar:    "Definida como true no ambiente CEO/Replit; clones licenciados têm valor diferente e não acessam IA central.",
    funcaoUsual: "Por que minha instância tem mais poderes? / Como sei se é CEO ou licenciado rodando?",
  },
  {
    numero: 70, termo: "tenantContext",
    leigo:       "É a pasta do plantonista: ao entrar no turno, ele recebe a pasta da clínica — dados daquele dia, daquele lugar.",
    explicacao:  "Objeto TypeScript concreto disponível em req.tenant com empresa_id, nome e configurações do tenant ativo.",
    ondeUsar:    "Todo código que acessa dados clínicos deve ler empresa_id de req.tenant — nunca hardcoded.",
    funcaoUsual: "Como o sistema filtra os dados por clínica? / O tenant está sendo injetado corretamente?",
  },
  {
    numero: 71, termo: "Slack",
    leigo:       "É o WhatsApp do trabalho: cada assunto tem seu grupo, mas a empresa controla o que fica gravado.",
    explicacao:  "Plataforma SaaS de mensagens corporativas com canais temáticos e integrações via API de blocos (Block Kit).",
    ondeUsar:    "Canal #padaxor-projeto recebe relatório horário de IA, alertas de falha e handoffs entre LLMs.",
    funcaoUsual: "O relatório chegou? / Tem algum erro crítico? / O Slack está recebendo corretamente?",
  },
  {
    numero: 72, termo: "Drive",
    leigo:       "É o arquivo físico da clínica, mas na nuvem: qualquer médico autorizado acessa de qualquer lugar.",
    explicacao:  "Google Drive — armazenamento em nuvem com API para leitura, escrita e organização de arquivos e pastas.",
    ondeUsar:    "PDFs de exames monitorados pelo drive watcher; receituários, documentos e relatórios salvos aqui.",
    funcaoUsual: "O exame foi importado? / Onde o documento foi salvo? / O Drive watcher está rodando?",
  },
  {
    numero: 73, termo: "Sheets",
    leigo:       "É a ficha de controle do estoque que todos veem ao mesmo tempo, sem precisar mandar e-mail com anexo.",
    explicacao:  "Google Planilhas — editor de planilhas online com API de leitura e escrita em tempo real via Google Sheets API.",
    ondeUsar:    "Planilha de produção (status de tasks), aba DICIONARIO e relatórios manuais do projeto vivem aqui.",
    funcaoUsual: "Qual o status da task? / Preciso atualizar a planilha / A aba DICIONARIO está em dia?",
  },
  {
    numero: 74, termo: "Cloudflare",
    leigo:       "É a portaria do prédio com câmera, identificação e lista de visitantes: nenhum pacote entra sem ser conferido.",
    explicacao:  "Plataforma global de CDN, segurança DDoS, DNS e AI Gateway — protege e acelera sistemas na internet.",
    ondeUsar:    "CF AI Gateway centraliza chamadas de IA; DNS e domínios dos clones gerenciados via Cloudflare.",
    funcaoUsual: "Como funciona a segurança do sistema? / Por que a IA passa pelo gateway antes de responder?",
  },
  {
    numero: 75, termo: "Railway",
    leigo:       "É o data center terceirizado: você coloca o servidor lá, eles garantem a luz, o ar-condicionado e o acesso.",
    explicacao:  "Plataforma PaaS (Platform as a Service) para deploy de contêineres com banco de dados gerenciado.",
    ondeUsar:    "Servidor de produção do PADAXOR (api-server) e banco PostgreSQL de produção rodam no Railway.",
    funcaoUsual: "O sistema está no ar em produção? / Onde fica o servidor? / O deploy foi para Railway?",
  },
  {
    numero: 76, termo: "Replit",
    leigo:       "É o consultório de desenvolvimento: onde o médico estuda o caso antes de escrever a prescrição final.",
    explicacao:  "IDE (Ambiente de Desenvolvimento Integrado) baseado em navegador com execução, banco dev e deploy integrados.",
    ondeUsar:    "Ambiente de desenvolvimento do Dr. Replit; banco dev, secrets, workflows e preview ficam aqui.",
    funcaoUsual: "Onde está sendo desenvolvido? / Como acesso o ambiente de desenvolvimento?",
  },
  {
    numero: 77, termo: "token (IA)",
    leigo:       "É como a IA cobra por palavra: não exatamente por palavra, mas é a unidade de conta — ~0,75 palavra em português.",
    explicacao:  "Unidade mínima de texto processada por modelos de linguagem — aproximadamente 0,75 palavra em português.",
    ondeUsar:    "Toda chamada de IA consome tokens; custo proporcional registrado em ai_usage_log por chamada.",
    funcaoUsual: "Quanto custa essa chamada de IA? / Por que está caro? / O contexto está muito grande?",
  },
  {
    numero: 78, termo: "input_tokens",
    leigo:       "É o número de páginas do prontuário que você entregou para o consultor ler antes de dar o parecer.",
    explicacao:  "Contagem de tokens enviados ao modelo de IA como entrada — inclui prompt, contexto e histórico da conversa.",
    ondeUsar:    "Monitorado em ai_usage_log; inputs longos (laudos completos) têm custo proporcional mais alto.",
    funcaoUsual: "Por que a chamada de IA ficou cara? / O contexto está muito grande?",
  },
  {
    numero: 79, termo: "output_tokens",
    leigo:       "É o número de páginas do laudo que o consultor escreveu depois de ler o prontuário.",
    explicacao:  "Contagem de tokens gerados pelo modelo de IA como resposta à requisição — custo proporcional à extensão.",
    ondeUsar:    "Registrado em ai_usage_log junto com input_tokens; respostas longas e detalhadas custam mais.",
    funcaoUsual: "A resposta da IA está muito longa? / Quanto gerou na última chamada?",
  },
  {
    numero: 80, termo: "P0",
    leigo:       "É o paciente que chega em PCR: vai direto para a ressuscitação, fila não existe.",
    explicacao:  "Prioridade máxima — sistema inoperante, dado em risco ou perda financeira imediata; para tudo e resolve agora.",
    ondeUsar:    "Sistema fora do ar, banco corrompido, segurança comprometida, integração de pagamento quebrada.",
    funcaoUsual: "URGENTE: o sistema está fora do ar / Dado de paciente está sendo vazado.",
  },
  {
    numero: 81, termo: "P1",
    leigo:       "É o paciente com dor intensa: não está em risco imediato de vida, mas não pode esperar.",
    explicacao:  "Prioridade alta — funcionalidade crítica quebrada com impacto severo no uso diário; resolver no mesmo dia.",
    ondeUsar:    "Relatório não chegando, drive watcher parado, integração de pagamento retornando erro.",
    funcaoUsual: "Está quebrando o fluxo principal mas o sistema ainda roda — precisa ser hoje.",
  },
  {
    numero: 82, termo: "P2",
    leigo:       "É o exame de rotina com resultado alterado: importante resolver, mas não hoje de manhã.",
    explicacao:  "Prioridade média — funcionalidade degradada ou ausente sem impacto crítico; resolver na sprint corrente.",
    ondeUsar:    "Coluna nova no banco, melhoria em tela existente, bug que afeta poucos casos.",
    funcaoUsual: "Importante mas não urgente — pode entrar no próximo ciclo de trabalho.",
  },
  {
    numero: 83, termo: "P3",
    leigo:       "É a pintura da sala de espera: fica melhor, mas o consultório funciona sem ela.",
    explicacao:  "Prioridade baixa — melhoria cosmética, refatoração ou otimização; resolver quando possível, sem prazo.",
    ondeUsar:    "Ajustes visuais, organização interna de código, otimizações de performance sem impacto ao usuário.",
    funcaoUsual: "Bom ter mas não tem pressa — anotar para quando houver espaço.",
  },
  {
    numero: 84, termo: "cron horário",
    leigo:       "É o residente que bate na porta a cada hora para checar o pós-operatório — pontual, sem precisar de chamado.",
    explicacao:  "Cron com expressão `0 * * * *` — executa exatamente uma vez por hora, todo dia, sem falhar.",
    ondeUsar:    "Relatório horário Slack/Telegram do PADAXOR usa esse cron; dispara às horas exatas.",
    funcaoUsual: "O relatório chega sempre na hora exata? / Por que atrasou essa hora?",
  },
  {
    numero: 85, termo: "planilha de produção",
    leigo:       "É o quadro de cirurgias do centro cirúrgico: todo mundo vê o que está agendado, em andamento e concluído.",
    explicacao:  "Documento Google Sheets com todas as tasks do projeto: status (A FAZER/PARCIAL/CONCLUÍDO), responsável e contexto.",
    ondeUsar:    "Aba PLANILHA PRODUCAO na Google Sheets do projeto; link no footer de todo relatório Slack horário.",
    funcaoUsual: "Qual o status de tudo? / O que está sendo feito agora? / Atualiza a planilha com o novo item.",
  },

  // ── Termos do framework de tarefas Paxter Loop (adicionados 10/08/2026) ────
  {
    numero: 86, termo: "What & Why",
    leigo:       "É a primeira linha do prontuário: 'paciente de 55 anos, hipertenso, veio por dor torácica'. Sem ela, ninguém sabe por que está tratando.",
    explicacao:  "Seção obrigatória do plano de tarefa que descreve o problema a resolver e a motivação — por que existe, qual dor resolve.",
    ondeUsar:    "Primeiro bloco de todo arquivo em .local/tasks/*.md; lido pelo executor antes de tocar uma linha de código.",
    funcaoUsual: "Por que vamos fazer isso? / Qual é o problema que esta tarefa resolve?",
  },
  {
    numero: 87, termo: "Done looks like",
    leigo:       "É o critério de alta: 'paciente recebe alta quando saturação acima de 95% em ar ambiente por 24h'. Sem critério claro, ninguém sabe quando parar.",
    explicacao:  "Seção do plano que define outcomes observáveis e concretos — o que o usuário vê quando a tarefa está concluída, não detalhes de código.",
    ondeUsar:    "Segundo bloco do arquivo .local/tasks/*.md; usado pelo auditor para conferir se a tarefa foi entregue conforme o combinado.",
    funcaoUsual: "Quando a task está pronta? / O que preciso ver para aprovar? / O que foi entregue?",
  },
  {
    numero: 88, termo: "Out of scope",
    leigo:       "É a contra-indicação do protocolo: o que não vai ser feito nesta sessão, para ninguém esperar o que não foi prometido.",
    explicacao:  "Seção que delimita explicitamente o que NÃO está incluído na tarefa — evita escopo inflado e trabalho não pedido.",
    ondeUsar:    "Terceiro bloco do arquivo .local/tasks/*.md; garante que executor e auditor concordam sobre os limites da entrega.",
    funcaoUsual: "Isso está incluído nesta task? / Por que não fez a funcionalidade X também?",
  },
  {
    numero: 89, termo: "Steps",
    leigo:       "É o protocolo de manipulação da farmácia: passo 1, pese o ativo; passo 2, dissolva; passo 3, filtre. Sem ordem, resulta em erro.",
    explicacao:  "Seção do plano com passos numerados de implementação para o executor — o que construir, em que ordem, sem código inline.",
    ondeUsar:    "Quarto bloco do arquivo .local/tasks/*.md; seguido pelo agente executor (Dr. Replit, Dr. Code ou Dr. Manus) para construir a feature.",
    funcaoUsual: "Como implementar esta task? / Quais são os passos? / Em que ordem deve ser feito?",
  },
  {
    numero: 90, termo: "Relevant files",
    leigo:       "É o índice do prontuário que aponta exatamente onde está cada resultado de exame, sem precisar folhear tudo.",
    explicacao:  "Seção final do plano com caminhos exatos dos arquivos do repositório que o executor deve ler antes de começar a modificar.",
    ondeUsar:    "Último bloco do arquivo .local/tasks/*.md; lista apenas arquivos verificados como existentes — nunca caminhos inventados.",
    funcaoUsual: "Por onde começo a implementar? / Quais arquivos já existem e preciso conhecer?",
  },

  // ── Termos técnicos do Guia Digital (adicionados 10/08/2026) ────────────────
  {
    numero: 91, termo: "TTS",
    leigo:       "É a recepcionista que lê em voz alta o nome do paciente: você não precisa enxergar o painel para saber que chegou a sua vez.",
    explicacao:  "Text-to-Speech — síntese de voz que converte texto em áudio falado. No Guia Digital usa a Web Speech API nativa do navegador.",
    ondeUsar:    "Botão de áudio em cada passo do /guia-digital; acionado pelo ícone de alto-falante ao lado do texto.",
    funcaoUsual: "O sistema consegue ler o passo em voz alta? / Como funciona o áudio no guia do paciente?",
  },
  {
    numero: 92, termo: "Web Speech API",
    leigo:       "É o microfone e o alto-falante que o navegador já tem instalados — sem precisar instalar mais nada.",
    explicacao:  "API nativa dos navegadores modernos para síntese de voz (TTS) e reconhecimento de fala (STT) — zero custo, zero API externa.",
    ondeUsar:    "Usada em guia-digital/index.tsx via window.speechSynthesis; funciona em iOS Safari, Android Chrome e desktop.",
    funcaoUsual: "Precisa de API paga para o áudio? / O som funciona em iPhone? / Qual custo do TTS?",
  },
  {
    numero: 93, termo: "onboarding digital",
    leigo:       "É a consulta de boas-vindas onde você explica ao paciente como funciona a clínica, o app e como chegar na próxima vez.",
    explicacao:  "Processo estruturado de cadastro, configuração e integração inicial do paciente na plataforma — instalar PWA, entrar na área, vincular Telegram.",
    ondeUsar:    "Tela pública /guia-digital (paciente) e tela CEO /comunicacao/guia-paciente (disparo); rota POST /api/onboarding/enviar-guia.",
    funcaoUsual: "Como o paciente instala o app? / Como ensino o paciente a usar o Telegram? / Como envio o guia?",
  },
  {
    numero: 94, termo: "rate limiting",
    leigo:       "É o intervalo mínimo entre aplicações: não importa quantas vezes o médico clicar, a segunda dose não sai antes do prazo.",
    explicacao:  "Controle de taxa que impede múltiplas chamadas idênticas num intervalo curto — protege APIs de disparo duplo ou loop acidental.",
    ondeUsar:    "Implementado em /api/onboarding/enviar-guia com cooldown de 60 segundos por (clienteId, canal); armazenado em Map em memória.",
    funcaoUsual: "Por que não posso reenviar imediatamente? / O sistema evita mandar WhatsApp duplicado?",
  },
  {
    numero: 95, termo: "funil de onboarding",
    leigo:       "É o acompanhamento da triagem: sabe quantos pacientes vieram ao pronto-socorro, quantos foram avaliados e quantos internaram.",
    explicacao:  "Sequência de etapas mensuráveis de um processo com registro de onde o usuário avança ou abandona — identifica gargalos.",
    ondeUsar:    "Tabela onboarding_eventos (Task #66): registra device + seção aberta + timestamp por paciente no Guia Digital.",
    funcaoUsual: "Quantos pacientes instalaram o PWA? / Onde param no guia? / Qual seção tem mais abandono?",
  },
  {
    numero: 96, termo: "QR Code",
    leigo:       "É o código de barras moderno que a câmera do celular lê em um segundo — como um atalho impresso no papel que leva direto ao site.",
    explicacao:  "Quick Response Code — matriz bidimensional de pontos que codifica uma URL ou dado, lida instantaneamente pela câmera sem app especial.",
    ondeUsar:    "Card no /guia-digital quando acessado por computador (Task #72) — permite o paciente abrir o guia no celular apontando a câmera.",
    funcaoUsual: "Como o paciente abre no celular a partir do computador? / O que é aquele quadrado com pontinhos?",
  },
];

// ---------------------------------------------------------------------------
// Motor de anotação: marca termos com (*N) PERMANENTES e gera legenda ao final
//
// REGRA: o número de cada termo é o campo "numero" do GLOSSARIO acima.
// Nunca é recalculado por mensagem.
// ---------------------------------------------------------------------------

export type AnotacaoResult = {
  textoAnotado: string;    // texto com (*N) permanentes
  legendas:     string[];  // somente os termos que apareceram, com seus números fixos
};

export function anotarTermos(texto: string): AnotacaoResult {
  // Índice permanente: campo numero do GLOSSARIO (imutável)
  const numeroPermanente = new Map<string, number>(
    GLOSSARIO.map((entry) => [entry.termo.toLowerCase(), entry.numero])
  );

  let textoAnotado = texto;
  const encontradosNaMensagem: Array<{ numero: number; entry: GlossarioEntry }> = [];
  const jaProcessado = new Set<string>();

  // Varredura do mais longo para o mais curto (evita marcar "cron" antes de "cron job")
  const sorted = [...GLOSSARIO].sort((a, b) => b.termo.length - a.termo.length);

  for (const entry of sorted) {
    const chave = entry.termo.toLowerCase();
    if (jaProcessado.has(chave)) continue;

    const escapado = entry.termo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const testeRegex = new RegExp(`\\b(${escapado})\\b`, "gi");

    if (!testeRegex.test(textoAnotado)) continue;

    const numero = numeroPermanente.get(chave)!;
    jaProcessado.add(chave);
    encontradosNaMensagem.push({ numero, entry });

    // Marca APENAS a primeira ocorrência com (*N)
    let primeiraVez = true;
    textoAnotado = textoAnotado.replace(
      new RegExp(`\\b(${escapado})\\b`, "gi"),
      (match) => {
        if (primeiraVez) { primeiraVez = false; return `${match} (*${numero})`; }
        return match;
      },
    );
  }

  // Rodapé: ordenado pelo número permanente
  encontradosNaMensagem.sort((a, b) => a.numero - b.numero);
  const legendas = encontradosNaMensagem.map(
    ({ numero, entry }) => `(*${numero}) *${entry.termo}* = ${entry.leigo}`
  );

  return { textoAnotado, legendas };
}
