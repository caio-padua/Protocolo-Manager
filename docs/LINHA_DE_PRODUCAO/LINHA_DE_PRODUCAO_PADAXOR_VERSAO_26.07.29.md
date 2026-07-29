# LINHA DE PRODUCAO PADAXOR — VERSAO 26.07.29

> Fila unica de trabalho do PADAXOR. Escrita pelo Dr. Code em 29/07/2026.
> Existe porque tres agentes trabalham no mesmo sistema e ja consertaram
> o mesmo arquivo tres vezes sem saber um do outro.
>
> Este arquivo e o ESPELHO da planilha que esta no Google Drive do CEO
> (`PADAXOR_LINHA_DE_PRODUCAO_26.07.29.xlsx`). A planilha e para o CEO
> marcar estado; este .md e para os agentes lerem sem depender de
> copiar e colar. Quem muda o conteudo muda os dois.

---

## 1. A FILA (36 itens, ordenada por prioridade)

Ordem por PRIORIDADE, nao por ordem em que foi pedido. P0 vem antes de
tudo: sao os itens de isolamento entre clinicas — enquanto abertos, uma
segunda clinica no sistema pode ver dado da primeira.

| Nº | Item | O que e / como sera feito | Responsavel | Depende de | Estado | Prioridade | Esforco | Observacao |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Banco em producao com dados reais | Carga do dump do Replit no Postgres do Railway. 3.683 clientes e 24.287 resultados de exame. | Dr. Replit | — | CONCLUIDO | P0 critico | feito | Volumetria conferida por contagem no banco de producao. |
| 2 | Backup do Postgres | Agendamentos diario, semanal e mensal, mais uma copia manual protegida. | Dr. Caio | — | CONCLUIDO | P0 critico | feito | Salvou a carga quando o primeiro TRUNCATE ficou confirmado no meio. |
| 3 | api-server no ar com dominio e CORS | Servico publicado no Railway, dominio gerado, ALLOWED_ORIGINS corrigido. | Dr. Code | — | CONCLUIDO | P0 critico | feito | ALLOWED_ORIGINS estava com valor invalido ['https://','https://']. |
| 4 | Login do CEO funcionando | Credencial gravada com o algoritmo correto (collaborator-auth) e verificada em producao. | Dr. Code | 3 | CONCLUIDO | P0 critico | feito | Causa da falha: dois verifyPassword com formato identico e derivacao incompativel. |
| 5 | Token de colaborador vale no perimetro | basicAuth aceita Bearer valido. Bearer invalido devolve 401 JSON, sem caixa nativa. | Dr. Code | 4 | CONCLUIDO | P0 critico | feito | PR #5. Senha unica compartilhada nao escala para licenciados. |
| 6 | Site publicado com as 6 correcoes | VITE_API_BASE_URL, APP_URL, marca, formulario espelhado, redirect fantasma, cadastro publico. | Dr. Lovable | — | CONCLUIDO | P1 alto | feito | Cadastro publico e OAuth removidos: elimina conta acidental e email marcado como golpe. |
| 7 | Captacao de interessados | POST /api/vitrine-leads e /api/vitrine-contatos, com painel no sistema. | Dr. Replit | 3 | CONCLUIDO | P1 alto | feito | 11 testes aprovados contra producao. |
| 8 | empresa_id na tabela professionals | Coluna de vinculo da clinica em professionals. Hoje colaborador nao pertence a clinica alguma. | Dr. Code | — | A FAZER | P0 critico | 2h | Primeira coisa que quebra ao licenciar a segunda clinica. |
| 9 | Isolamento entre clinicas no banco (RLS) | Politicas de Row-Level Security nas tabelas clinicas. Hoje o isolamento e convencao no codigo. | Dr. Code | 8 | A FAZER | P0 critico | 1 dia | Uma clausula WHERE esquecida = uma clinica vendo paciente de outra. Zero politicas hoje. |
| 10 | Marca distinta nos dois esquemas de senha | scrypt-col$ e scrypt-pac$, com recusa ruidosa do prefixo errado. | Dr. Code | — | A FAZER | P0 critico | 3h | Os dois gravam scrypt$ hoje. Foi a armadilha que custou uma noite inteira. |
| 11 | Tela de login dentro do padaxor | Tela propria chamando /api/collaborator/login e setCollabSession. O encanamento ja existe em collab-auth.ts. | Dr. Replit | 5 | A FAZER | P1 alto | 3h | Resolve travessia de sessao, caixa nativa e 'encerrar sessao' de uma vez. |
| 12 | Site vira botao, nao segundo login | O login do site aponta para a tela do sistema em vez de autenticar por conta propria. | Dr. Lovable | 11 | AGUARDANDO | P1 alto | 1h | Elimina o segundo formulario de autenticacao e o fluxo de conta no site. |
| 13 | DNS do padaxor.com.br no Cloudflare | Trocar os servidores de nome no Registro.br pelos do Cloudflare. | Dr. Caio | — | A FAZER | P1 alto | 15min | Railway exige CNAME Flattening ou ALIAS para dominio raiz. Registro.br nao faz. |
| 14 | Dominio proprio apontando para o sistema | app.padaxor.com.br no Railway com certificado automatico. | Dr. Code | 13 | AGUARDANDO | P1 alto | 1h | Depende do passo do Cloudflare. |
| 15 | Marca PAXTER para PADAXOR no painel | O painel do sistema ainda exibe PAXTER na identidade visual. | Dr. Replit | — | A FAZER | P1 alto | 1h | Nome oficial: PADAXOR. Motor: PAWARDS. PADCOM e outra empresa. |
| 16 | Porta da area do paciente | O site nao tem entrada para /api/area-paciente, que tem 12 rotas prontas no servidor. | Dr. Lovable | — | A FAZER | P1 alto | 4h | Quarta porta do produto inteira sem macaneta. |
| 17 | Indice unico em lower(login_username) | Impede dois colaboradores com o mesmo usuario. Erro 23505 traduzido em 409. | Dr. Code | 8 | A FAZER | P1 alto | 1h | Prevencao. Nao foi a causa do bug de hoje — nao havia duplicata. |
| 18 | Ligar o registro de consumo | Comecar a gravar em consumo_eventos, que ja existe com empresa_id, custo e idempotencia. | Dr. Replit | 9 | A FAZER | P2 medio | 1 dia | Sem historico nao ha painel. Historico nao se cria retroativamente. |
| 19 | Catalogo de modulos com precos | Tabela de modulos: nome, beneficio, valor de adesao, valor promocional, mensalidade. | Dr. Caio | — | A FAZER | P2 medio | decisao | Os valores sao decisao do CEO. Nada vai para tela sem eles. |
| 20 | Menu com modulos travados | Itens nao comprados aparecem apagados com cadeado. Clique abre a mensagem de desejo. | Dr. Replit | 19 | AGUARDANDO | P2 medio | 1 dia | Coracao do modelo comercial. Depende do catalogo e dos precos. |
| 21 | Mensagem de desejo com 48h e indicacao | Descricao do beneficio, preco promocional valido 48h, valor cheio riscado, 10% por indicacao na adesao. | Dr. Replit | 20 | AGUARDANDO | P2 medio | 1 dia | Mensalidade nunca muda — desconto so na entrada. |
| 22 | Login de licenciado (o segundo chapeu) | Segundo usuario do CEO, entrando na mesma clinica com a visao travada do cliente. | Dr. Code | 9 | A FAZER | P2 medio | 2h | Dois logins, mesma clinica, lentes diferentes. Pagamento real de R$ 1 via Asaas. |
| 23 | Painel do CEO com seletor de clinica | Visao consolidada de todas as clinicas e troca de contexto para ver como o dono ve. | Dr. Replit | 9 | AGUARDANDO | P2 medio | 1 dia | tenantContext ja modela isPlatformOwner + empresaId. Comecar somente-leitura nas outras clinicas. |
| 24 | Painel de bilhetagem | Consumo por clinica, por periodo, por tipo. Atualizacao por LISTEN/NOTIFY do Postgres. | Dr. Replit | 18 | AGUARDANDO | P2 medio | 2 dias | Sem fornecedor novo. Com 12 clinicas o Postgres aguenta com folga. |
| 25 | Upsell por limiar de uso | Regra por modulo: metrica, limiar, mensagem, desconto. Dispara apos cada evento de consumo. | Dr. Replit | 24 | AGUARDANDO | P2 medio | 1 dia | Oferece quando o uso prova que faz sentido. Observacao honesta, nao pressao. |
| 26 | Zoho configurado | ZOHO_ORG_ID e token de admin nas variaveis. Codigo de criacao de conta e alias ja existe. | Dr. Caio | — | A FAZER | P2 medio | 30min | Precisa da conta Zoho e do token. Depois disso o sistema cria sozinho. |
| 27 | DNS automatico via Cloudflare API | Ao ativar uma clinica, o sistema cria os registros de DNS sem ninguem tocar no painel. | Dr. Replit | 13 | AGUARDANDO | P2 medio | 3h | Depende do Cloudflare ser o provedor de DNS. |
| 28 | Tela de linha de producao de clinica | Nome da clinica, sugestao e checagem de dominio, registro, DNS, emails, brief do site. | Dr. Replit | 26,27 | AGUARDANDO | P2 medio | 1 semana | COBRAR ANTES DE PROVISIONAR: pendurar no webhook do Asaas, nao antes dele. |
| 29 | Autenticacao de email em dominio proprio | SPF e DKIM para padaxor.com.br. Hoje o remetente e da ferramenta e o Gmail marca como golpe. | Dr. Code | 13 | A FAZER | P1 alto | 2h | Convite de licenciado chegando com tarja vermelha de phishing destroi confianca. |
| 30 | railway.toml versionado | Declarar servicos, comandos e caminhos no repositorio. | Dr. Code | — | A FAZER | P3 baixo | 4h | Hoje a configuracao vive so no painel. Se o projeto sumir, o codigo nao reconstroi o sistema. |
| 31 | Colapsar o Supabase | Formulario da homepage passa a gravar so no Railway. Painel de leads migra para o sistema. | Dr. Lovable | 7 | AGUARDANDO | P3 baixo | 4h | Hoje ha espelho. Espelho e transicao, nao destino. |
| 32 | Suite de testes e integracao continua | Vitest mais Postgres de teste, rodando antes do deploy. | Dr. Code | 9 | A FAZER | P3 baixo | 3 dias | Hoje: nenhum CI, nenhum script de teste no api-server, 1 arquivo de teste no repo inteiro. |
| 33 | Renomear padcom para padaxor internamente | Pasta, nome de pacote e referencias. 414 arquivos citam padcom. | Dr. Code | 30 | AGUARDANDO | P3 baixo | 1 dia | So com todos parados. O caminho de build vive no painel do Railway, fora do repo. |
| 34 | Planos de paciente | Niveis de acompanhamento e o que cada um da. O termo 'rodio' nao existe no codigo. | Dr. Caio | — | A FAZER | P3 baixo | decisao | Prazo de resposta vira obrigacao contratual. Precisa desenho, nao improviso. |
| 35 | Identificador de requisicao e contrato da API | X-Request-Id em toda chamada, mais openapi.yaml versionado. | Dr. Code | — | A FAZER | P3 baixo | 1 dia | Ideia veio do Dr. Lovable; quem executa e o Dr. Code (e servidor). Acaba com reclamacao sem rastro. |
| 36 | Missao a definir para o Dr. Manus | Ainda sem frente atribuida nesta fase. | Dr. Manus | — | AGUARDANDO | P3 baixo | — | Perfil: executa missao inteira de ponta a ponta. Candidato natural: item 32 ou 33. |

Contagem em 29/07/2026: 7 concluidos, 17 a fazer, 12 aguardando dependencia.

---

## 2. MATRIZ DA EQUIPE — territorio e fronteira

Tres vezes dois agentes consertaram o mesmo arquivo e o resultado quebrou. Esta matriz existe para isso nao repetir.

|  |  |  |  |  |
| --- | --- | --- | --- | --- |
| Membro | Onde vive | Territorio (decide sozinho) | Nao toca sem avisar | Nesta fase |
| Dr. Caio | cacique | Precos, planos, decisao clinica, gasto de dinheiro, dado de paciente real | Nada — decide tudo | Cloudflare (13), precos dos modulos (19), Zoho (26), planos de paciente (34) |
| Dr. Code | Claude Code | api-server, banco, Railway, autenticacao, infraestrutura, coordenacao | Telas do sistema (Dr. Replit) e o site (Dr. Lovable) | empresa_id (8), RLS (9), marca dos esquemas de senha (10), dominio (14), SPF/DKIM (29) |
| Dr. Replit Manager | Replit | Telas do sistema, logica de negocio, linha de producao de clinica | basicAuth, middleware de auth, variaveis do Railway, banco de producao | Login no sistema (11), marca no painel (15), consumo (18), menu travado (20) |
| Dr. Lovable | Lovable | Site institucional, vitrines, portoes de captacao | api-server e banco — so consome, nunca altera | Site vira botao (12), porta do paciente (16), colapsar Supabase (31) |

### Regras de convivencia

1. Ninguem anuncia pronto antes de a mudanca estar na main. Construido no ambiente local e rascunho; publicado e entrega.

2. Antes de editar arquivo fora do proprio territorio, avisa. Foi assim que o drizzle.config, o bypass do login e o basicAuth colidiram.

3. Quem escreve na main da pull antes. Sincronizar por cima desfaz correcao que esta funcionando em producao.

---

## 3. DECISOES QUE SO O CEO TOMA (10 em aberto)

Cada linha aqui esta travando trabalho. Nenhum agente decide por ele.

|  |  |  |  |  |
| --- | --- | --- | --- | --- |
| Nº | Decisao | Por que so voce decide | Trava o item | Sua resposta |
| 1 | Cobrar antes de provisionar a clinica? | Hoje o desenho gasta dominio, email e trabalho antes de receber. Se o medico desistir, o prejuizo e seu. | 28 |  |
| 2 | Valores em reais dos modulos | Nenhum preco vai para tela sem sua decisao. Os que existem hoje sao provisorios. | 19,20,21 |  |
| 3 | O cadeado esconde a tela ou os dados? | Se voce usa um modulo como CEO e depois entra como licenciado, os dados ficam visiveis ou desaparecem? | 20 |  |
| 4 | Qual vitrine fica | Existem duas construidas em paralelo: uma no site, uma no sistema. Mesma funcao, autores diferentes. | 20 |  |
| 5 | Onde o licenciado trabalha | Assumi que e o painel do sistema. Nunca foi confirmado. Se for outro lugar, muda o desenho inteiro. | 11,20 |  |
| 6 | O que vem na assinatura basica | Define quantos modulos existem para vender. Agenda e pacientes? Protocolos tambem? | 19,20 |  |
| 7 | Quem indica ganha algo? | Sei que o indicado ganha 10% na adesao. Se o indicador tambem ganhar, e programa de afiliados. | 21 |  |
| 8 | Quem cria a conta do licenciado | Ele se cadastra depois de pagar, ou voce cria e ele recebe? Hoje nao existe auto-cadastro. | 22,28 |  |
| 9 | Registrador dos dominios de clinica | Registro.br exige ser registrador credenciado — nao da para automatizar .com.br. Namecheap ou GoDaddy para .com? | 28 |  |

---

## 4. COMO USAR

| Quem | O que faz com este arquivo |
| --- | --- |
| Dr. Caio | Marca `Estado` na planilha do Drive e responde a coluna `Sua resposta` das decisoes |
| Dr. Code | Mantem este arquivo e a planilha em sincronia; executa os itens marcados como seus |
| Dr. Replit Manager | Le a fila, pega os itens marcados como seus, NAO mexe em item de outro sem avisar |
| Dr. Lovable | Idem, para os itens do site |
| Dr. Manus | Sem frente nesta fase; candidato aos itens 32 e 33 |

Trabalho novo entra como linha nova numerada a partir de 37 — nunca
renumera o que ja existe (mesma regra do Art. 28-B da Biblia).

## RESUMO EM 1 LINHA

Fila unica de 36 itens numerados, com dono definido por item, matriz de
territorio para os quatro agentes pararem de se atropelar, e as 10
decisoes que estao travando trabalho e so o CEO pode desbloquear.
