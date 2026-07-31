# DICIONÁRIO — números permanentes

> (\*N) é sempre o mesmo termo, em qualquer mensagem, hoje e daqui a um ano.
> Novo termo entra no **final**. Nunca se reordena. Nunca se remove.
> O número de cada termo é sua posição (1-based) no array `GLOSSARIO` em
> `artifacts/api-server/src/lib/slack-glossario.ts` — os dois devem andar em sincronia.

| Nº | Termo técnico | O que é | Em linguagem de leigo |
|---|---|---|---|
| (\*1) | hash | função criptográfica que produz uma impressão digital de tamanho fixo | Impressão digital de um arquivo — garante que nada foi alterado |
| (\*2) | API | Application Programming Interface — contrato de comunicação entre sistemas | Porta de comunicação entre sistemas — como um garçom que leva o pedido da cozinha à mesa |
| (\*3) | JWT | JSON Web Token — token assinado que carrega identidade e permissões | Crachá digital com prazo de validade — prova quem você é sem precisar digitar senha a cada clique |
| (\*4) | CORS | Cross-Origin Resource Sharing — política de segurança do navegador para requisições entre origens | Lista de convidados de um servidor — só entra quem está na lista |
| (\*5) | tenant | unidade isolada de dados dentro de um sistema multi-inquilino (SaaS) | Cliente ou empresa que usa o sistema de forma isolada, como um apartamento num prédio |
| (\*6) | middleware | camada de software que intercepta requisições entre cliente e servidor | Fiscal de entrada — checa credenciais antes de deixar passar o pedido |
| (\*7) | endpoint | URL que representa um recurso ou ação exposta pelo servidor | Endereço específico de uma função no servidor — como uma linha direta de telefone |
| (\*8) | cron | daemon Unix que executa comandos em horários programados via expressão de schedule | Alarme automático que dispara ações em horários programados, como um temporizador |
| (\*9) | cron job | tarefa registrada no cron para execução periódica e automatizada | Tarefa agendada que roda sozinha no horário marcado |
| (\*10) | schema | definição formal da estrutura de tabelas, tipos e relacionamentos de um banco de dados | Planta baixa do banco de dados — define o que cabe em cada gaveta |
| (\*11) | deploy | processo de publicar uma nova versão do software em ambiente de produção | Publicar o sistema para o mundo real — sair do teste para o ar aberto |
| (\*12) | token | string opaca que representa identidade ou autorização temporária | Chave digital temporária que comprova identidade sem precisar de senha |
| (\*13) | webhook | callback HTTP disparado automaticamente por evento em serviço externo | Campainha que toca quando algo acontece num serviço externo e avisa o nosso sistema |
| (\*14) | ledger | registro imutável e cronológico de transações ou eventos financeiros | Livro-caixa digital — registro cronológico e imutável de tudo que aconteceu |
| (\*15) | buffer | área de memória temporária para armazenar dados em trânsito entre dois processos | Sala de espera temporária para dados em trânsito — como a fila antes da catraca |
| (\*16) | pipeline | sequência encadeada de etapas de processamento de dados ou código | Esteira de processamento — dados entram de um lado e saem processados do outro |
| (\*17) | royalty | percentual contratual pago ao licenciante sobre a receita gerada pelo produto licenciado | Percentual pago ao criador toda vez que o produto licenciado é vendido |
| (\*18) | RLS | Row Level Security — controle de acesso a nível de linha no banco de dados PostgreSQL | Porteiro que decide qual linha do banco cada usuário pode ver |
| (\*19) | UUID | Universally Unique Identifier — identificador de 128 bits garantidamente único no mundo | Número de identificação único garantidamente diferente de qualquer outro no mundo |
| (\*20) | migration | script versionado que altera a estrutura do banco de dados de forma controlada e reversível | Mudança controlada na estrutura do banco — como reformar um cômodo sem derrubar a casa |
| (\*21) | seed | dados iniciais inseridos no banco para bootstrapping e funcionamento inicial do sistema | Dados iniciais plantados no banco para o sistema funcionar na primeira vez |
| (\*22) | mimeType | padrão IANA que identifica o formato de um arquivo (ex.: application/pdf, image/png) | Etiqueta que diz ao computador que tipo de arquivo é aquele (PDF, imagem, planilha...) |
| (\*23) | proxy | servidor intermediário que repassa requisições entre cliente e servidor de origem | Intermediário que repassa pedidos entre dois lados — como um corretor de imóveis |
| (\*24) | OAuth | protocolo aberto de autorização delegada (RFC 6749) para acesso sem compartilhar senha | Protocolo de autorização que deixa você entrar com Google/Slack sem dar sua senha ao sistema |
| (\*25) | SSE | Server-Sent Events — canal HTTP unidirecional permanente de servidor para navegador | Canal de transmissão ao vivo do servidor para o navegador, como uma TV aberta |
| (\*26) | env var | variável de ambiente — par chave-valor injetado no processo pelo sistema operacional | Configuração secreta guardada fora do código, nunca exposta |
| (\*27) | pull | comando git que baixa e integra commits remotos na branch local | Baixar atualizações do repositório central para o seu computador |
| (\*28) | commit | snapshot versionado do código com mensagem descritiva do que foi alterado | Salvar uma versão do código com uma descrição do que foi alterado |
| (\*29) | branch | ponteiro móvel para uma sequência de commits independente do fluxo principal | Ramo independente do código — permite testar uma ideia sem afetar o principal |
| (\*30) | merge | operação git que une dois branches preservando o histórico de ambos | Juntar dois ramos de código em um só, como costurar dois documentos |
| (\*31) | repo | repositório git — diretório com histórico completo de versões do projeto | Repositório — pasta versionada com todo o histórico do código |
| (\*32) | fail-safe | mecanismo que garante comportamento seguro mesmo em caso de falha parcial do sistema | Proteção que evita erros graves — se algo falhar, o sistema não trava |
| (\*33) | spec | documento de especificação que define requisitos e comportamento esperado antes de construir | Documento de especificação — o contrato escrito do que deve ser construído antes de escrever código |
| (\*34) | tenant context | conjunto de metadados que identifica o tenant ativo em uma requisição HTTP | Contexto de qual clínica ou empresa está usando o sistema naquele momento |
| (\*35) | ai\_usage\_log | tabela PostgreSQL que registra consumo de tokens e custo por chamada de modelo de IA | Tabela que registra toda vez que uma IA foi acionada: quem usou, quanto custou, quantas palavras processou |
| (\*36) | logAiUsage | função TypeScript que persiste um registro de uso de IA na tabela ai\_usage\_log | Função que registra automaticamente o uso de IA no livro-caixa do sistema |
| (\*37) | requireCeoInstance | middleware que exige a chave exclusiva do CEO para liberar uma rota protegida | Porteiro eletrônico que só deixa passar quem tem a chave exclusiva do CEO |
| (\*38) | PADAXOR\_AI\_BYPASS | variável de ambiente que identifica requisições originadas pelo CEO (não por licenciados) | Chave secreta que identifica que é o CEO quem está acessando — não um licenciado |
| (\*39) | empresa\_id | chave estrangeira numérica que vincula um registro à empresa ou clínica proprietária | Número que identifica qual clínica está usando o sistema — evita misturar dados de clínicas diferentes |
| (\*40) | tenantContext | objeto TypeScript que carrega empresa\_id e metadados do tenant ativo numa requisição | Pacote de informações que diz qual clínica está ativa numa requisição |
| (\*41) | Slack | plataforma SaaS de mensagens corporativas com canais temáticos e integrações via API | Plataforma de mensagens corporativas — como um WhatsApp profissional com canais por tema |
| (\*42) | Drive | Google Drive — serviço de armazenamento em nuvem com API de gestão de arquivos e pastas | Google Drive — pasta virtual na nuvem onde arquivos são guardados e compartilhados |
| (\*43) | Sheets | Google Planilhas — editor de planilhas online com API de leitura e escrita em tempo real | Google Planilhas — planilha online que todos podem ver e editar ao mesmo tempo |
| (\*44) | Cloudflare | plataforma global de CDN (rede de entrega de conteúdo), segurança e infraestrutura de rede | Empresa de infraestrutura de internet — protege e acelera sistemas na web |
| (\*45) | Railway | plataforma PaaS (Plataforma como Serviço) para deploy de contêineres com banco de dados gerenciado | Plataforma onde o sistema fica publicado e rodando 24 horas na internet |
| (\*46) | Replit | IDE (ambiente de desenvolvimento integrado) baseado em navegador com execução e deploy integrados | Ambiente de desenvolvimento online onde o código é escrito e testado |
| (\*47) | Anthropic | empresa de segurança em IA fundadora do modelo Claude (séries claude-3 e claude-4) | Empresa criadora do Claude — o modelo de IA que usamos para raciocínio complexo |
| (\*48) | Gemini | família de modelos de IA multimodal do Google DeepMind, com suporte a texto e visão | Modelo de IA do Google — usado para leitura e interpretação de documentos e exames |
| (\*49) | OpenAI | empresa criadora da família de modelos GPT e da API OpenAI amplamente usada | Empresa criadora do GPT — um dos modelos de IA que o sistema pode acionar |
| (\*50) | token (IA) | unidade mínima de texto processada por um modelo de linguagem (≈ 0,75 palavra em português) | Unidade de medida de texto para IAs — aproximadamente 0,75 palavra em português |
| (\*51) | input\_tokens | contagem de tokens enviados ao modelo como entrada (prompt mais contexto) | Quantidade de texto enviada para a IA ler e processar |
| (\*52) | output\_tokens | contagem de tokens gerados pelo modelo como resposta à requisição | Quantidade de texto que a IA gerou como resposta |
| (\*53) | P0 | prioridade máxima — bloqueante; sistema inoperante ou dado em risco sem resolução imediata | Prioridade máxima — o sistema não funciona direito sem isso |
| (\*54) | P1 | prioridade alta — impacto severo no fluxo principal; resolver no mesmo dia ou sprint | Prioridade alta — impacta o uso diário, deve ser feito logo |
| (\*55) | P2 | prioridade média — degradação funcional perceptível; resolver na sprint corrente | Prioridade média — importante mas não urgente |
| (\*56) | P3 | prioridade baixa — melhoria, refatoração ou cosmético; resolver quando possível | Prioridade baixa — bom ter, mas pode esperar |
| (\*57) | cron horário | expressão cron `0 * * * *` — dispara exatamente uma vez por hora, todo dia | Alarme que dispara uma vez por hora, todo dia, automaticamente |
| (\*58) | planilha de produção | documento mestre (Google Sheets) com status, responsável e prazo de cada tarefa do projeto | Documento mestre onde fica registrado o status de cada tarefa do projeto |

---

## Regra de crescimento

1. Novo termo entra **no final** da tabela acima e **no final** do array `GLOSSARIO` no código.
2. O número é atribuído na hora da inserção e nunca muda.
3. Nunca se reordena. Nunca se remove.
4. Os números aqui e no código devem ser idênticos — se divergirem, o código vence.

## Fonte de verdade para máquinas

`artifacts/api-server/src/lib/slack-glossario.ts` → array `GLOSSARIO` (posição 1-based = número permanente)

## Fonte de verdade para humanos

Este arquivo — `DICIONARIO.md`.
