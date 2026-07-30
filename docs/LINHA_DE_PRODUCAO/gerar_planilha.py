"""Gera a planilha de linha de producao do PADAXOR."""
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation

SAIDA = "PADAXOR_LINHA_DE_PRODUCAO_26.07.29.xlsx"

# ---------------------------------------------------------------- estilo
FONTE = "Arial"
TINTA = "2A231B"
OURO = "9A6B28"
CABEC_FILL = PatternFill("solid", fgColor="2A231B")
TITULO_FILL = PatternFill("solid", fgColor="F2E6D0")
PASTEL = PatternFill("solid", fgColor="F6F2EA")
FEITO = PatternFill("solid", fgColor="E2EBDE")
BLOQ = PatternFill("solid", fgColor="F6E2D9")
ESPERA = PatternFill("solid", fgColor="F4EAD2")
AMARELO = PatternFill("solid", fgColor="FFFFCC")

fina = Side(style="thin", color="DDD2BF")
BORDA = Border(left=fina, right=fina, top=fina, bottom=fina)

def cabecalho(ws, linha, textos, larguras):
    for i, (t, w) in enumerate(zip(textos, larguras), start=1):
        c = ws.cell(row=linha, column=i, value=t)
        c.font = Font(name=FONTE, size=9, bold=True, color="FFFFFF")
        c.fill = CABEC_FILL
        c.alignment = Alignment(horizontal="left", vertical="center", wrap_text=True)
        c.border = BORDA
        ws.column_dimensions[get_column_letter(i)].width = w
    ws.row_dimensions[linha].height = 30

def titulo(ws, texto, sub, ncols):
    ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=ncols)
    c = ws.cell(row=1, column=1, value=texto)
    c.font = Font(name=FONTE, size=15, bold=True, color=TINTA)
    c.fill = TITULO_FILL
    c.alignment = Alignment(horizontal="left", vertical="center", indent=1)
    ws.row_dimensions[1].height = 30
    ws.merge_cells(start_row=2, start_column=1, end_row=2, end_column=ncols)
    c = ws.cell(row=2, column=1, value=sub)
    c.font = Font(name=FONTE, size=9, italic=True, color="6B5F4E")
    c.alignment = Alignment(horizontal="left", vertical="center", indent=1)
    ws.row_dimensions[2].height = 18

def corpo(ws, linha, valores, fill=None):
    for i, v in enumerate(valores, start=1):
        c = ws.cell(row=linha, column=i, value=v)
        c.font = Font(name=FONTE, size=9, color=TINTA)
        c.alignment = Alignment(horizontal="left", vertical="top", wrap_text=True)
        c.border = BORDA
        if fill:
            c.fill = fill

wb = Workbook()

# ================================================================ ABA 1
ws = wb.active
ws.title = "LINHA DE PRODUCAO"
COLS = ["Nº", "Item", "O que e / como sera feito", "Responsavel",
        "Depende de", "Estado", "Prioridade", "Esforco", "Observacao"]
LARG = [5, 30, 52, 14, 12, 14, 11, 10, 40]
titulo(ws, "PADAXOR — Linha de Producao",
       "Fila unica de trabalho. Ordenada por prioridade, nao por ordem de pedido. "
       "Estado e Prioridade tem lista suspensa. Edite apenas as colunas Estado e Observacao.",
       len(COLS))
cabecalho(ws, 4, COLS, LARG)

# (num, item, descricao, resp, dep, estado, prio, esforco, obs)
ITENS = [
    # ---- ja concluido, fica para registro
    (1, "Banco em producao com dados reais",
     "Carga do dump do Replit no Postgres do Railway. 3.683 clientes e 24.287 resultados de exame.",
     "Dr. Replit", "—", "CONCLUIDO", "P0 critico", "feito",
     "Volumetria conferida por contagem no banco de producao."),
    (2, "Backup do Postgres",
     "Agendamentos diario, semanal e mensal, mais uma copia manual protegida.",
     "Dr. Caio", "—", "CONCLUIDO", "P0 critico", "feito",
     "Salvou a carga quando o primeiro TRUNCATE ficou confirmado no meio."),
    (3, "api-server no ar com dominio e CORS",
     "Servico publicado no Railway, dominio gerado, ALLOWED_ORIGINS corrigido.",
     "Dr. Code", "—", "CONCLUIDO", "P0 critico", "feito",
     "ALLOWED_ORIGINS estava com valor invalido ['https://','https://']."),
    (4, "Login do CEO funcionando",
     "Credencial gravada com o algoritmo correto (collaborator-auth) e verificada em producao.",
     "Dr. Code", "3", "CONCLUIDO", "P0 critico", "feito",
     "Causa da falha: dois verifyPassword com formato identico e derivacao incompativel."),
    (5, "Token de colaborador vale no perimetro",
     "basicAuth aceita Bearer valido. Bearer invalido devolve 401 JSON, sem caixa nativa.",
     "Dr. Code", "4", "CONCLUIDO", "P0 critico", "feito",
     "PR #5. Senha unica compartilhada nao escala para licenciados."),
    (6, "Site publicado com as 6 correcoes",
     "VITE_API_BASE_URL, APP_URL, marca, formulario espelhado, redirect fantasma, cadastro publico.",
     "Dr. Lovable", "—", "CONCLUIDO", "P1 alto", "feito",
     "Cadastro publico e OAuth removidos: elimina conta acidental e email marcado como golpe."),
    (7, "Captacao de interessados",
     "POST /api/vitrine-leads e /api/vitrine-contatos, com painel no sistema.",
     "Dr. Replit", "3", "CONCLUIDO", "P1 alto", "feito",
     "11 testes aprovados contra producao."),

    # ---- P0: dano irreversivel se faltar
    (8, "empresa_id na tabela professionals",
     "Coluna de vinculo da clinica em professionals. Hoje colaborador nao pertence a clinica alguma.",
     "Dr. Code", "—", "A FAZER", "P0 critico", "2h",
     "Primeira coisa que quebra ao licenciar a segunda clinica."),
    (9, "Isolamento entre clinicas no banco (RLS)",
     "Politicas de Row-Level Security nas tabelas clinicas. Hoje o isolamento e convencao no codigo.",
     "Dr. Code", "8", "A FAZER", "P0 critico", "1 dia",
     "Uma clausula WHERE esquecida = uma clinica vendo paciente de outra. Zero politicas hoje."),
    (10, "Marca distinta nos dois esquemas de senha",
     "scrypt-col$ e scrypt-pac$, com recusa ruidosa do prefixo errado.",
     "Dr. Code", "—", "A FAZER", "P0 critico", "3h",
     "Os dois gravam scrypt$ hoje. Foi a armadilha que custou uma noite inteira."),

    # ---- P1: destrava produto
    (11, "Tela de login dentro do padaxor",
     "Tela propria chamando /api/collaborator/login e setCollabSession. O encanamento ja existe em collab-auth.ts.",
     "Dr. Replit", "5", "A FAZER", "P1 alto", "3h",
     "Resolve travessia de sessao, caixa nativa e 'encerrar sessao' de uma vez."),
    (12, "Site vira botao, nao segundo login",
     "O login do site aponta para a tela do sistema em vez de autenticar por conta propria.",
     "Dr. Lovable", "11", "AGUARDANDO", "P1 alto", "1h",
     "Elimina o segundo formulario de autenticacao e o fluxo de conta no site."),
    (13, "DNS do padaxor.com.br no Cloudflare",
     "Trocar os servidores de nome no Registro.br pelos do Cloudflare.",
     "Dr. Caio", "—", "A FAZER", "P1 alto", "15min",
     "Railway exige CNAME Flattening ou ALIAS para dominio raiz. Registro.br nao faz."),
    (14, "Dominio proprio apontando para o sistema",
     "app.padaxor.com.br no Railway com certificado automatico.",
     "Dr. Code", "13", "AGUARDANDO", "P1 alto", "1h",
     "Depende do passo do Cloudflare."),
    (15, "Marca PAXTER para PADAXOR no painel",
     "O painel do sistema ainda exibe PAXTER na identidade visual.",
     "Dr. Replit", "—", "A FAZER", "P1 alto", "1h",
     "Nome oficial: PADAXOR. Motor: PAWARDS. PADCOM e outra empresa."),
    (16, "Porta da area do paciente",
     "O site nao tem entrada para /api/area-paciente, que tem 12 rotas prontas no servidor.",
     "Dr. Lovable", "—", "A FAZER", "P1 alto", "4h",
     "Quarta porta do produto inteira sem macaneta."),
    (17, "Indice unico em lower(login_username)",
     "Impede dois colaboradores com o mesmo usuario. Erro 23505 traduzido em 409.",
     "Dr. Code", "8", "A FAZER", "P1 alto", "1h",
     "Prevencao. Nao foi a causa do bug de hoje — nao havia duplicata."),

    # ---- P2: monetizacao e escala
    (18, "Ligar o registro de consumo",
     "Comecar a gravar em consumo_eventos, que ja existe com empresa_id, custo e idempotencia.",
     "Dr. Replit", "9", "AGUARDANDO", "P2 medio", "1 dia",
     "Sem historico nao ha painel. Historico nao se cria retroativamente. Espera o RLS do Dr. Code."),
    (19, "Catalogo de modulos com precos",
     "Tabela de modulos: nome, beneficio, valor de adesao, valor promocional, mensalidade.",
     "Dr. Caio", "—", "A FAZER", "P2 medio", "decisao",
     "Os valores sao decisao do CEO. Nada vai para tela sem eles."),
    (20, "Menu com modulos travados",
     "Itens nao comprados aparecem apagados com cadeado. Clique abre a mensagem de desejo.",
     "Dr. Replit", "19", "AGUARDANDO", "P2 medio", "1 dia",
     "Coracao do modelo comercial. Depende do catalogo e dos precos."),
    (21, "Mensagem de desejo com 48h e indicacao",
     "Descricao do beneficio, preco promocional valido 48h, valor cheio riscado, 10% por indicacao na adesao.",
     "Dr. Replit", "20", "AGUARDANDO", "P2 medio", "1 dia",
     "Mensalidade nunca muda — desconto so na entrada."),
    (22, "Login de licenciado (o segundo chapeu)",
     "Segundo usuario do CEO, entrando na mesma clinica com a visao travada do cliente.",
     "Dr. Code", "9", "A FAZER", "P2 medio", "2h",
     "Dois logins, mesma clinica, lentes diferentes. Pagamento real de R$ 1 via Asaas."),
    (23, "Painel do CEO com seletor de clinica",
     "Visao consolidada de todas as clinicas e troca de contexto para ver como o dono ve.",
     "Dr. Replit", "9", "AGUARDANDO", "P2 medio", "1 dia",
     "tenantContext ja modela isPlatformOwner + empresaId. Comecar somente-leitura nas outras clinicas."),
    (24, "Painel de bilhetagem",
     "Consumo por clinica, por periodo, por tipo. Atualizacao por LISTEN/NOTIFY do Postgres.",
     "Dr. Replit", "18", "AGUARDANDO", "P2 medio", "2 dias",
     "Sem fornecedor novo. Com 12 clinicas o Postgres aguenta com folga."),
    (25, "Upsell por limiar de uso",
     "Regra por modulo: metrica, limiar, mensagem, desconto. Dispara apos cada evento de consumo.",
     "Dr. Replit", "24", "AGUARDANDO", "P2 medio", "1 dia",
     "Oferece quando o uso prova que faz sentido. Observacao honesta, nao pressao."),

    # ---- P2/P3: linha de producao de clinicas
    (26, "Zoho configurado",
     "ZOHO_ORG_ID e token de admin nas variaveis. Codigo de criacao de conta e alias ja existe.",
     "Dr. Caio", "—", "A FAZER", "P2 medio", "30min",
     "Precisa da conta Zoho e do token. Depois disso o sistema cria sozinho."),
    (27, "DNS automatico via Cloudflare API",
     "Ao ativar uma clinica, o sistema cria os registros de DNS sem ninguem tocar no painel.",
     "Dr. Replit", "13", "AGUARDANDO", "P2 medio", "3h",
     "Depende do Cloudflare ser o provedor de DNS."),
    (28, "Tela de linha de producao de clinica",
     "Nome da clinica, sugestao e checagem de dominio, registro, DNS, emails, brief do site.",
     "Dr. Replit", "26,27", "AGUARDANDO", "P2 medio", "1 semana",
     "COBRAR ANTES DE PROVISIONAR: pendurar no webhook do Asaas, nao antes dele."),
    (29, "Autenticacao de email em dominio proprio",
     "SPF e DKIM para padaxor.com.br. Hoje o remetente e da ferramenta e o Gmail marca como golpe.",
     "Dr. Code", "13", "AGUARDANDO", "P1 alto", "2h",
     "Convite de licenciado chegando com tarja vermelha de phishing destroi confianca. Espera o Cloudflare."),

    # ---- P3: divida tecnica
    (30, "railway.toml versionado",
     "Declarar servicos, comandos e caminhos no repositorio.",
     "Dr. Code", "—", "A FAZER", "P3 baixo", "4h",
     "Hoje a configuracao vive so no painel. Se o projeto sumir, o codigo nao reconstroi o sistema."),
    (31, "Colapsar o Supabase",
     "Formulario da homepage passa a gravar so no Railway. Painel de leads migra para o sistema.",
     "Dr. Lovable", "7", "A FAZER", "P3 baixo", "4h",
     "Hoje ha espelho. Espelho e transicao, nao destino. Liberado: o item 7 ficou concluido."),
    (32, "Suite de testes e integracao continua",
     "Vitest mais Postgres de teste, rodando antes do deploy.",
     "Dr. Code", "9", "A FAZER", "P3 baixo", "3 dias",
     "Hoje: nenhum CI, nenhum script de teste no api-server, 1 arquivo de teste no repo inteiro."),
    (33, "Renomear padcom para padaxor internamente",
     "Pasta, nome de pacote e referencias. 414 arquivos citam padcom.",
     "Dr. Code", "30", "AGUARDANDO", "P3 baixo", "1 dia",
     "So com todos parados. O caminho de build vive no painel do Railway, fora do repo."),
    (34, "Planos de paciente",
     "Niveis de acompanhamento e o que cada um da. O termo 'rodio' nao existe no codigo.",
     "Dr. Caio", "—", "A FAZER", "P3 baixo", "decisao",
     "Prazo de resposta vira obrigacao contratual. Precisa desenho, nao improviso."),
    (35, "Identificador de requisicao e contrato da API",
     "X-Request-Id em toda chamada, mais openapi.yaml versionado.",
     "Dr. Code", "—", "A FAZER", "P3 baixo", "1 dia",
     "Ideia veio do Dr. Lovable; quem executa e o Dr. Code (e servidor). Acaba com reclamacao sem rastro."),
    (36, "Missao a definir para o Dr. Manus",
     "Ainda sem frente atribuida nesta fase.",
     "Dr. Manus", "—", "AGUARDANDO", "P3 baixo", "—",
     "Perfil: executa missao inteira de ponta a ponta. Candidato natural: item 32 ou 33."),
]

for k, it in enumerate(ITENS):
    linha = 5 + k
    estado = it[5]
    fill = FEITO if estado == "CONCLUIDO" else (ESPERA if estado == "AGUARDANDO" else None)
    corpo(ws, linha, list(it), fill)
    ws.row_dimensions[linha].height = 30

ULT = 4 + len(ITENS)

# resumo com formulas
r = ULT + 2
ws.cell(row=r, column=2, value="RESUMO").font = Font(name=FONTE, size=10, bold=True, color=OURO)
rotulos = [
    ("Concluido", "CONCLUIDO"),
    ("A fazer", "A FAZER"),
    ("Aguardando dependencia", "AGUARDANDO"),
    ("Total de itens", None),
]
for i, (rot, alvo) in enumerate(rotulos):
    lr = r + 1 + i
    c = ws.cell(row=lr, column=2, value=rot)
    c.font = Font(name=FONTE, size=9, color=TINTA)
    f = (f'=COUNTIF(F5:F{ULT},"{alvo}")' if alvo else f"=COUNTA(A5:A{ULT})")
    v = ws.cell(row=lr, column=3, value=f)
    v.font = Font(name=FONTE, size=9, bold=True, color=TINTA)

# validacao
dv_estado = DataValidation(type="list", formula1='"A FAZER,EM CURSO,AGUARDANDO,CONCLUIDO,CANCELADO"', allow_blank=True)
dv_prio = DataValidation(type="list", formula1='"P0 critico,P1 alto,P2 medio,P3 baixo"', allow_blank=True)
ws.add_data_validation(dv_estado); ws.add_data_validation(dv_prio)
dv_estado.add(f"F5:F{ULT}"); dv_prio.add(f"G5:G{ULT}")

ws.freeze_panes = "A5"
ws.auto_filter.ref = f"A4:I{ULT}"

# ================================================================ ABA 2
ws2 = wb.create_sheet("MATRIZ DA EQUIPE")
C2 = ["Membro", "Onde vive", "Territorio (decide sozinho)", "Nao toca sem avisar", "Nesta fase"]
L2 = [22, 22, 46, 40, 46]
titulo(ws2, "Matriz da equipe — territorio e fronteira",
       "Tres vezes dois agentes consertaram o mesmo arquivo e o resultado quebrou. "
       "Esta matriz existe para isso nao repetir.", len(C2))
cabecalho(ws2, 4, C2, L2)

EQUIPE = [
    ("Dr. Caio", "cacique",
     "Precos, planos, decisao clinica, gasto de dinheiro, dado de paciente real",
     "Nada — decide tudo",
     "Cloudflare (13), precos dos modulos (19), Zoho (26), planos de paciente (34)"),
    ("Dr. Code", "Claude Code",
     "api-server, banco, Railway, autenticacao, infraestrutura, coordenacao",
     "Telas do sistema (Dr. Replit) e o site (Dr. Lovable)",
     "empresa_id (8), RLS (9), marca dos esquemas de senha (10), dominio (14), SPF/DKIM (29)"),
    ("Dr. Replit Manager", "Replit",
     "Telas do sistema, logica de negocio, linha de producao de clinica",
     "basicAuth, middleware de auth, variaveis do Railway, banco de producao",
     "Login no sistema (11), marca no painel (15), consumo (18), menu travado (20)"),
    ("Dr. Lovable", "Lovable",
     "Site institucional, vitrines, portoes de captacao",
     "api-server e banco — so consome, nunca altera",
     "Site vira botao (12), porta do paciente (16), colapsar Supabase (31)"),
    ("Dr. Manus", "Manus AI",
     "Missoes inteiras de ponta a ponta, com escopo fechado",
     "Producao sem combinar antes",
     "Sem frente nesta fase. Candidato: suite de testes (32) ou renomeacao (33)"),
]
for k, it in enumerate(EQUIPE):
    corpo(ws2, 5 + k, list(it), PASTEL if k % 2 else None)
    ws2.row_dimensions[5 + k].height = 58

r2 = 5 + len(EQUIPE) + 2
ws2.cell(row=r2, column=1, value="REGRA DE CONVIVENCIA").font = Font(name=FONTE, size=10, bold=True, color=OURO)
REGRAS = [
    "1. Ninguem anuncia pronto antes de a mudanca estar na main. Construido no ambiente local e rascunho; publicado e entrega.",
    "2. Antes de editar arquivo fora do proprio territorio, avisa. Foi assim que o drizzle.config, o bypass do login e o basicAuth colidiram.",
    "3. Quem escreve na main da pull antes. Sincronizar por cima desfaz correcao que esta funcionando em producao.",
    "4. Verificar na fonte antes de afirmar — e verificar de onde vem o que se esta usando para verificar.",
    "5. Cobrar antes de provisionar. A linha de producao pendura no pagamento confirmado, nunca antes.",
]
for i, t in enumerate(REGRAS):
    c = ws2.cell(row=r2 + 1 + i, column=1, value=t)
    c.font = Font(name=FONTE, size=9, color=TINTA)
    c.alignment = Alignment(wrap_text=True, vertical="top")
    ws2.merge_cells(start_row=r2 + 1 + i, start_column=1, end_row=r2 + 1 + i, end_column=5)
    ws2.row_dimensions[r2 + 1 + i].height = 26

# ================================================================ ABA 3
ws3 = wb.create_sheet("DECISOES DO CEO")
C3 = ["Nº", "Decisao", "Por que so voce decide", "Trava o item", "Sua resposta"]
L3 = [5, 40, 52, 14, 34]
titulo(ws3, "Decisoes que so o CEO toma",
       "Cada linha aqui esta travando trabalho. Escreva na coluna 'Sua resposta' — "
       "as celulas em amarelo sao suas.", len(C3))
cabecalho(ws3, 4, C3, L3)

DEC = [
    (1, "Cobrar antes de provisionar a clinica?",
     "Hoje o desenho gasta dominio, email e trabalho antes de receber. Se o medico desistir, o prejuizo e seu.",
     "28", ""),
    (2, "Valores em reais dos modulos",
     "Nenhum preco vai para tela sem sua decisao. Os que existem hoje sao provisorios.",
     "19,20,21", ""),
    (3, "O cadeado esconde a tela ou os dados?",
     "Se voce usa um modulo como CEO e depois entra como licenciado, os dados ficam visiveis ou desaparecem?",
     "20", ""),
    (4, "Qual vitrine fica",
     "Existem duas construidas em paralelo: uma no site, uma no sistema. Mesma funcao, autores diferentes.",
     "20", ""),
    (5, "Onde o licenciado trabalha",
     "Assumi que e o painel do sistema. Nunca foi confirmado. Se for outro lugar, muda o desenho inteiro.",
     "11,20", ""),
    (6, "O que vem na assinatura basica",
     "Define quantos modulos existem para vender. Agenda e pacientes? Protocolos tambem?",
     "19,20", ""),
    (7, "Quem indica ganha algo?",
     "Sei que o indicado ganha 10% na adesao. Se o indicador tambem ganhar, e programa de afiliados.",
     "21", ""),
    (8, "Quem cria a conta do licenciado",
     "Ele se cadastra depois de pagar, ou voce cria e ele recebe? Hoje nao existe auto-cadastro.",
     "22,28", ""),
    (9, "Registrador dos dominios de clinica",
     "Registro.br exige ser registrador credenciado — nao da para automatizar .com.br. Namecheap ou GoDaddy para .com?",
     "28", ""),
    (10, "Dominio da clinica fica no nome de quem?",
     "Se registrar no nome da Pawards, voce controla — e vira retencao. Precisa estar no contrato, explicito.",
     "28", ""),
]
for k, it in enumerate(DEC):
    corpo(ws3, 5 + k, list(it))
    ws3.cell(row=5 + k, column=5).fill = AMARELO
    ws3.row_dimensions[5 + k].height = 44

r3 = 5 + len(DEC) + 2
ws3.cell(row=r3, column=2, value="Exemplo de preenchimento (apague ao usar)").font = Font(name=FONTE, size=9, bold=True, italic=True, color=OURO)
corpo(ws3, r3 + 1, ["ex", "Cobrar antes de provisionar?", "—", "28", "Sim. Pendura no webhook do Asaas."])
ws3.cell(row=r3 + 1, column=5).fill = AMARELO

# ================================================================ ABA 4
ws4 = wb.create_sheet("LEIA-ME")
titulo(ws4, "Como usar esta planilha", "Escrita em 29/07/2026 pelo Dr. Code.", 2)
ws4.column_dimensions["A"].width = 24
ws4.column_dimensions["B"].width = 100

LEIA = [
    ("Para que serve",
     "Fila unica de trabalho do PADAXOR. Existe porque tres agentes vinham consertando o mesmo arquivo sem saber, "
     "e a coordenacao dependia do CEO copiar texto entre tres telas."),
    ("O que voce edita",
     "Apenas duas colunas na aba LINHA DE PRODUCAO: Estado e Observacao. E a coluna amarela 'Sua resposta' "
     "na aba DECISOES DO CEO. O resto e mantido pelo Dr. Code."),
    ("Ordem da fila",
     "Ordenada por prioridade, nao por ordem em que voce pediu. P0 e o que causa dano irreversivel se faltar; "
     "P1 destrava produto; P2 e monetizacao; P3 e divida tecnica."),
    ("Por que P0 vem antes de tudo",
     "Os itens 8, 9 e 10 tratam de isolamento entre clinicas e de senha. Errar ali nao tem desfazer: "
     "uma clinica vendo paciente de outra e dano que nao se conserta depois."),
    ("Onde este arquivo deve viver",
     "Aqui no Drive para voce, e TAMBEM no repositorio (docs/) para os agentes lerem sem voce colar nada. "
     "Enquanto so existir no Drive, a coordenacao continua passando por voce."),
    ("Como pedir trabalho novo",
     "Diga o que quer. O Dr. Code acrescenta uma linha com numero, responsavel e prioridade, "
     "em vez de o pedido virar mensagem solta que atropela o que esta em curso."),
    ("Nomenclatura",
     "PADAXOR e o nome do sistema. PAWARDS e o motor e a empresa (Pawards Sistemas). "
     "PADCOM e outra empresa do CEO, de outros sistemas — nao confundir."),
    ("Historico de nomes",
     "O sistema ja se chamou PAWARDS, depois PAXTER, depois PARXIS. Hoje e PADAXOR, "
     "com dominio proprio padaxor.com.br registrado em 27/07/2026."),
]
for i, (a, b) in enumerate(LEIA):
    lr = 4 + i * 2
    c = ws4.cell(row=lr, column=1, value=a)
    c.font = Font(name=FONTE, size=10, bold=True, color=OURO)
    c.alignment = Alignment(vertical="top")
    c = ws4.cell(row=lr, column=2, value=b)
    c.font = Font(name=FONTE, size=9, color=TINTA)
    c.alignment = Alignment(wrap_text=True, vertical="top")
    ws4.row_dimensions[lr].height = 40

wb.save(SAIDA)
print("gerado:", SAIDA)
print("itens:", len(ITENS), "| equipe:", len(EQUIPE), "| decisoes:", len(DEC))
