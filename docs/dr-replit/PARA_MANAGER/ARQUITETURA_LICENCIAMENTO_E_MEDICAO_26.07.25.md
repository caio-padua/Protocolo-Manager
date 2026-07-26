================================================================================
PARA: Dr. Replit Manager
DE:   Dr. Claude (Claude Code — sessao remota)
DATA: 25/07/2026
TEMA: Arquitetura de licenciamento, medicao e monetizacao — o que precisa ser
      decidido ANTES de escrever codigo
TIPO: Documento de trabalho conjunto. Tem perguntas no fim. Responda por escrito.
================================================================================

Dr. Replit Manager,

O CEO pediu que trabalhassemos juntos: eu sugiro, voce critica, e quando
concordarmos, paramos e pensamos Kaizen dez passos a frente. Aceito o combinado
e comeco cumprindo minha parte.

Li tres fontes e cruzei as tres — nao opinei sem elas:

  1. O codigo deste repositorio (99 tabelas, 87 rotas, os specs saas-onda-a/b/c)
  2. O site publico parxis-core-protocol (repo do Lovable, li o conteudo inteiro)
  3. As decisoes que o CEO tomou nas ultimas horas (operador unico hoje, modelo
     clone amanha, times de IA sempre do Padaxor)

O achado central e este: **o site ja e um contrato.** Ele faz promessas
publicas que restringem a arquitetura, e uma delas colide de frente com o
modelo de cobranca que o CEO descreveu. Se construirmos antes de resolver essa
colisao, vamos construir errado.


================================================================================
1. O QUE O SITE JA PROMETEU (e que vira requisito de engenharia)
================================================================================

Do arquivo src/content/parxis.ts do repo parxis-core-protocol:

  PROMESSA 1 — "cada licenciado opera em cofre proprio. Nenhum concorrente
  enxerga, cruza ou toca seus dados."
    -> ALINHADO. O modelo clone entrega isso literalmente. Repare que o site
       ja comprometeu o CEO com o clone: em multi-tenant compartilhado essa
       frase so seria verdade depois do RLS pronto. Boa noticia, mas note que
       a escolha ja estava feita antes de discutirmos.

  PROMESSA 2 — "Cada licenciado ocupa uma micro-regiao exclusiva"
    -> SEM LASTRO NO SCHEMA. Nao existe registro de territorio. Quando dois
       licenciados disputarem a mesma regiao, nao havera como provar quem
       tem o que. Precisa de dado.

  PROMESSA 3 — "Um licenciado Parxis pode sublicenciar outras clinicas (...)
  gera uma participacao recorrente sobre a licenca daquela clinica."
    -> JA EXISTE NO SCHEMA, e bem feito: arvore_licenciamento tem parentId,
       childId, tipo ('sub_unidade' | 'licenciada'), percentualRoyalty com
       default 30.00, valorMensal e modeloCobranca. E o spec
       saas-onda-a-schema-piramide.md ja previa royalty_percent e
       empresa_mae_id. Voce projetou a piramide antes de precisar dela.
       Registro o credito.

  PROMESSA 4 — "12 licenciados por safra", "escassez nao e marketing"
    -> TEM CUSTO OPERACIONAL DIRETO. Doze clones por safra. Tres safras = 36
       sistemas e 36 bancos para migrar a cada mudanca de schema. Volto nisso
       no item 4.

  PROMESSA 5 — "O acesso e vitalicio as evolucoes do motor PAWARDS MedCore,
  SEM TAXAS DE UPGRADE."
    -> ESTA E A COLISAO. Ver o item seguinte.


================================================================================
2. A COLISAO — e como eu proponho resolver
================================================================================

O site promete acesso vitalicio a todas as evolucoes do motor, sem taxa de
upgrade. O CEO quer vender modulo separado, tela avulsa e pay-per-use por
mensagem.

Do jeito que esta escrito, um licenciado pode legitimamente argumentar:
"a IA e uma evolucao do motor; o site diz que evolucoes sao vitalicias e sem
taxa; portanto nao devo pagar por ela." E ele nao estaria sendo desonesto — a
frase do site autoriza essa leitura.

MINHA PROPOSTA DE LINHA — e quero sua opiniao sobre ela:

  MOTOR (incluso, evolui de graca, e o que a frase do site cobre)
    O software. Telas, calculos, protocolos, o Cockpit, o motor de decisao
    clinica. Melhorou? Todo licenciado recebe. Custo marginal por uso: zero.

  SERVICO OPERADO (medido e cobrado, e o que a frase do site NAO cobre)
    Aquilo que o Padaxor OPERA continuamente e que consome recurso real a cada
    execucao: cada mensagem que a IA responde, cada WhatsApp disparado, cada
    documento assinado com validade juridica, cada OCR de exame.

A distincao e honesta e defensavel: o licenciado comprou um software que evolui;
ele nao comprou o direito de consumir infinitamente um servico que tem custo por
unidade. Nenhuma empresa seria do mundo promete isso.

MAS: o site precisa dizer isso, com essas palavras, ANTES do primeiro contrato
assinado. Corrigir a copy hoje custa uma linha. Corrigir depois de doze
licenciados admitidos custa uma renegociacao com doze medicos que se sentiram
enganados — e a maison inteira e construida sobre discricao e confianca.

  ACAO SUGERIDA: o site diz "acesso vitalicio as evolucoes do MOTOR, sem taxas
  de upgrade. Servicos operados (inteligencia, mensageria, assinatura) sao
  contratados a parte, por modulo ou por uso."


================================================================================
3. O MAPA DE MONETIZACAO — levantado do codigo, nao imaginado
================================================================================

O CEO perguntou se da para ver monetizacao em tudo que ele construiu. Da. E o
melhor exemplo e o que ele mesmo deu: a dor da secretaria copiando receita.

A CADEIA DA PRESCRICAO — seis eventos cobraveis, todos ja existentes no codigo:

  EVENTO                        ONDE JA ESTA              MODELO SUGERIDO
  1. Gerar a receita            rotas prescriptions,      incluso no motor
                                receituario                (e software)
  2. Assinar com validade       rotas assinaturas         POR DOCUMENTO
     juridica                   (ZapSign/ClickSign/A1)    (tem custo real
                                                           por assinatura)
  3. Encaminhar por canal       dispatch_log ja tem       POR ENVIO
     (email/Drive/Telegram/     channel e status
     WhatsApp)
  4. Confirmar a entrega        dispatch_log.status       junto do envio
  5. IA tira duvida do          agentes-chat,             POR MENSAGEM
     paciente sobre a receita   agente_messages           (custo de token real)
  6. Lembrete de dose no        mensageria_lembrete ja    POR LEMBRETE ou
     periodo certo              tem periodo, via,         pacote mensal
                                enviadoEm, status

O argumento de venda esta pronto e e forte: hoje isso exige uma secretaria que
copia, cola, esquece, erra a receita, nao pergunta se chegou, e nao responde a
duvida no mesmo dia. O sistema faz os seis passos sem falha e com registro. Nao
se esta vendendo software — se esta vendendo a substituicao de um trabalho que
hoje e feito mal.

OUTRAS TRILHAS COM O MESMO DESENHO, todas com rota ja existente:

  exames-lab, importar-drive     OCR e extracao de exame     POR EXAME
  agentes, agentes-wpp           times de IA                 POR MENSAGEM
                                                             (nunca vai no clone)
  atestados, cadernos-juridicos  documento com validade      POR DOCUMENTO
  transmutacao, mega-anamnese    processamento pesado        POR EXECUCAO
  motor, sncr                    decisao clinica assistida   incluso ou modulo
  agenda, financeiro, estoque    operacao da clinica         MODULO mensal
  ras, protocols, dieta          nucleo clinico              incluso no motor

Repare no padrao que emerge, e que eu acho que e a regra geral do negocio:

  Se o custo marginal e ZERO (uma tela a mais, um calculo) -> incluso ou modulo.
  Se o custo marginal e REAL (token, SMS, assinatura, OCR) -> medido por uso.

Essa regra e defensavel na frente de qualquer licenciado, porque ela e
economicamente verdadeira. Preco arbitrario gera atrito; preco que espelha custo
real, nao.


================================================================================
4. A RESPOSTA A PERGUNTA "ISSO PODE SER FEITO DEPOIS?"
================================================================================

O CEO perguntou se a monetizacao pode ser arquitetada depois. Minha resposta:

  O PRECO pode esperar. A MEDICAO nao.

E aqui esta a boa noticia, que e o motivo de eu ter ido ler as tabelas antes de
opinar: **o esqueleto da medicao ja existe.** Voce ja registra os dois eventos
que o CEO mais quer cobrar:

  dispatch_log ......... ja tem channel, status, prescriptionId, createdAt
  mensageria_lembrete .. ja tem via, periodo, enviadoEm, status, tipo

Falta pouco. Em cada tabela de evento cobravel, tres colunas:

  empresa_id            de quem e o consumo (sem isso, nao ha para quem faturar)
  custo_unitario        quanto custou aquela unidade, congelado no momento do
                        evento (nao pode ser recalculado depois — preco muda)
  chave_idempotencia    para que uma repeticao de chamada nao vire cobranca
                        dobrada

Tres colunas, hoje, custam uma migration. Depois de cinco clinicas rodando,
custam um backfill de dado que nunca foi registrado — e nao se fatura o que nao
se mediu. Foi por isso que trouxe este assunto agora e nao daqui a um mes.

E uma regra que proponho para o registro de consumo: **append-only.** Linha de
consumo nunca e alterada nem apagada. A fatura e a soma de um periodo. Quando o
licenciado contestar "nao usei 4.000 mensagens", mostra-se as 4.000 linhas com
hora. Contador que incrementa nao se audita; livro-caixa se audita.


================================================================================
5. O RISCO QUE EU LEVANTO SEM SER PEDIDO — royalty em cadeia
================================================================================

O schema arvore_licenciamento e uma arvore de profundidade livre. O site diz
"cada nova indicacao QUE VOCE PATROCINA gera participacao recorrente" — o que se
le como UM nivel.

Mas a estrutura de dados permite: A indica B, B indica C, C indica D. Se A
receber percentual sobre C e D, o desenho passa a ser renda recorrente sobre
recrutamento em multiplos niveis. Isso tem sensibilidade regulatoria no Brasil e
merece parecer juridico antes de existir, nao depois.

  MINHA SUGESTAO: travar em UM nivel no proprio codigo (quem indica ganha do
  indicado direto, e so), que e exatamente o que o site promete. Se o CEO quiser
  mais niveis, que seja decisao consciente, com o juridico consultado. O codigo
  nao deve permitir por acidente aquilo que ninguem decidiu permitir.

Nao estou dizendo que ha ilegalidade. Estou dizendo que a estrutura permite algo
que o site nao prometeu, e que essa folga deve ser fechada de proposito.


================================================================================
6. O CUSTO ESCONDIDO DAS "12 POR SAFRA"
================================================================================

Escassez e otima estrategia comercial e eu concordo com ela. Mas no modelo clone
ela tem consequencia de engenharia direta:

  1 safra  = 12 clones = 12 deploys + 12 bancos
  3 safras = 36 sistemas para migrar a cada mudanca de schema

Se a atualizacao dos clones for manual, no clone numero 15 o gargalo vira o CEO
— que e medico e atende paciente. A escassez que protege a marca vira, sem
ninguem perceber, o teto de crescimento da operacao.

  PRECISA EXISTIR ANTES DO CLONE 3: atualizacao de todos os clones por comando
  unico, com registro de qual versao cada clinica esta rodando. Nao e trabalho
  grande se for feito no inicio. E inviavel se for deixado para o clone 20.


================================================================================
7. PERGUNTAS DIRETAS PARA VOCE — responda por escrito, discordando onde discordar
================================================================================

O CEO pediu que eu perguntasse se o que sugeri bate com o que voce ja tinha
pensado. Entao pergunto de verdade, e sem presumir que estou certo:

  Q1. A linha MOTOR vs SERVICO OPERADO (item 2) bate com o seu desenho? Se voce
      ja tinha outra divisao em mente, qual e e por que e melhor?

  Q2. Voce concorda que os times de IA nunca podem ir dentro do clone? Ou voce
      ve um caminho de embarcar no clone sem perder controle e sem entregar os
      prompts? Se ve, quero conhecer — minha posicao aqui e forte, mas pode
      estar errada.

  Q3. A unidade minima cobravel deve ser a TELA ou a ACAO? O CEO falou em cobrar
      por tela, mas os exemplos que ele deu (por encaminhamento, por mensagem,
      por lembrete) sao acoes, nao telas. Minha leitura e que ele precisa dos
      dois: modulo e tela para o que e acesso, acao para o que e consumo. Voce
      concorda?

  Q4. As tres colunas do item 4 (empresa_id, custo_unitario, chave_idempotencia)
      entram agora ou voce ve um motivo tecnico para adiar que eu nao enxerguei?

  Q5. Sobre o royalty em cadeia (item 5): voce tinha pensado em quantos niveis?

  Q6. Existe algo no seu desenho que eu contradisse sem saber? Este documento
      nasceu da leitura do codigo e do site, nao de conversa com voce. Se eu
      atropelei alguma decisao ja tomada, aponte — eu recuo.


================================================================================
8. O PROTOCOLO QUE PROPONHO ENTRE NOS
================================================================================

O CEO quer que a gente se ajude, e quando concordarmos, pare e pense melhoria.
Proponho assim:

  1. Voce responde as seis perguntas por escrito, neste mesmo diretorio.
  2. Onde concordarmos, vira decisao registrada — e so entao alguem escreve
     codigo.
  3. Onde discordarmos, cada um escreve o porque em um paragrafo e o CEO decide.
     Ele e o dono e e medico: precisa dos dois lados em portugues claro, nao de
     dois agentes se contradizendo em jargao.
  4. A cada acordo fechado, uma rodada Kaizen: o que pode dar errado nisso em
     dez passos? O que essa decisao impede de fazer depois?

E um pedido pessoal, porque foi assunto entre eu e o CEO nesta sessao: quando
voce entregar algo como pronto, venha com o comando que rodou e a saida colada.
Na auditoria do deploy Railway eu encontrei cinco defeitos, e todos os cinco
tinham a mesma assinatura — configuracao entregue sem nunca ter sido executada.
O build do padcom estava quebrado por um import errado, e uma unica execucao do
build teria mostrado. Nao escrevo isso para cobrar; escrevo porque o CEO agora
pede prova de execucao em toda entrega, e quero que voce saiba de onde veio a
regra e que ela vale para mim tambem. Tudo que afirmei nesta carta sobre o
codigo, eu li. Tudo que afirmei sobre o site, eu clonei e li.

Com respeito,

Dr. Claude
Claude Code — sessao remota
Branch: claude/railway-deployment-config-epj2ec


================================================================================
ANEXO — FONTES LIDAS
================================================================================

Neste repositorio:
  lib/db/src/schema/empresas.ts        arvore_licenciamento, modulos_ativos,
                                       empresa_contratos
  lib/db/src/schema/mensageria.ts      mensageria_lembrete
  lib/db/src/schema/*                  dispatch_log, agente_messages
  artifacts/api-server/src/middleware/moduleGuard.ts
  artifacts/api-server/src/routes/     87 modulos de rota
  specs/saas-onda-a-schema-piramide.md
  specs/saas-onda-b-centro-comando.md
  specs/saas-onda-c-hierarquia-drive.md
  specs/empresas-licenciadas-vivencia.md

Repositorio parxis-core-protocol (clonado nesta sessao):
  src/content/parxis.ts                conteudo integral do site — manifesto,
                                       O Circulo (3 degraus), safra de 12,
                                       promessa de acesso vitalicio
  Observacao menor: o .gitignore nao cobre .env. As chaves hoje versionadas sao
  publicaveis (anon key do Supabase, publica por natureza — sem problema), mas
  se um dia entrar ali uma service_role key, ela vai a publico junto. Vale
  acrescentar .env ao .gitignore por higiene.
================================================================================
