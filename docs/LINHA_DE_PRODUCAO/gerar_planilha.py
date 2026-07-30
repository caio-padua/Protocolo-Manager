"""Gera a planilha de linha de producao do PADAXOR."""
import unicodedata

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
        "Depende de", "Estado", "Prioridade", "Esforco", "Observacao",
        "Em linguagem de leigo"]
LARG = [5, 30, 52, 14, 12, 14, 11, 10, 40, 58]
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
     "Dr. Replit", "5", "CONCLUIDO", "P1 alto", "feito",
     "Entregue 30/07 no commit 3a38349, conferido: pages/login/index.tsx criado e CollaboratorGate passou a redirecionar."),
    (12, "Site vira botao, nao segundo login",
     "O login do site aponta para a tela do sistema em vez de autenticar por conta propria.",
     "Dr. Lovable", "11", "A FAZER", "P1 alto", "1h",
     "LIBERADO em 30/07: a tela do item 11 existe. Elimina o segundo formulario de autenticacao."),
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
     "Dr. Replit", "—", "CONCLUIDO", "P1 alto", "parcial",
     "Titulo da aba e do aplicativo entregues 30/07 no commit 3a38349. As telas internas seguem no item 38."),
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
     "Dr. Manus", "—", "A FAZER", "P3 baixo", "4h",
     "Passou para o Dr. Manus em 30/07: missao de escopo fechado, ponta a ponta, sem dependencia. Libera o Dr. Code para os tres itens P0."),
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
     "Vaga usada em 30/07: o Dr. Manus assumiu o item 30. Esta linha fica como registro, nao se apaga.",
     "Dr. Manus", "—", "CONCLUIDO", "P3 baixo", "—",
     "Fechada em 30/07 com a entrada dele no item 30. Proxima missao entra como numero novo, nunca reaproveitando este."),

    # ---- 37 em diante: itens trazidos pela fila paralela do Dr. Replit em
    # 30/07/2026, absorvidos com numero NOVO. Numero existente nunca se
    # reaproveita nem se reatribui (Art. 28-A da Biblia aplicado a item).
    # Ver COLISAO_DE_NUMERACAO_26.07.30.md.
    (37, "Auditoria de rotas: consulta sem filtro de empresa",
     "Varredura de todas as rotas da API listando consulta que le tabela clinica sem restringir por empresa. Entrega e a lista, nao a correcao.",
     "Dr. Replit", "—", "A FAZER", "P0 critico", "1 dia",
     "Ideia do Dr. Replit, territorio dele (rotas de API) e nao toca o banco. A lista e a entrada do item 9: sem ela o RLS e escrito as cegas."),
    (40, "Armazenamento R2 na mesma rota de exames do Drive",
     "A rota que hoje grava exame no Google Drive passa a gravar TAMBEM no R2 do Cloudflare, com nome padronizado: cliente-<id>/<data>/<tipo>.pdf. Espelho, nao troca: o Drive continua funcionando.",
     "Dr. Replit", "—", "A FAZER", "P1 alto", "4h",
     "PRIMEIRO DA FILA DE EXECUCAO por decisao do CEO em 30/07. Motivo declarado por ele: acompanhar uma construcao inteira passando pela ferramenta de coordenacao, enquanto aprende. Nao e P0 porque P0 nesta fila significa dano irreversivel, e aqui nada se perde."),
    (39, "Espelho dos .md no cofre do Dr. Obsidian",
     "Escrever os .md da equipe numa pasta do Google Drive que o Obsidian sincroniza. Sem conector novo: o Drive ja esta ligado.",
     "Dr. Code", "—", "A FAZER", "P2 medio", "3h",
     "O Art. 23-B da Biblia manda todo guia e licao aprendida terminar no cofre. Hoje nada chega la: cartilha, colisao e espelho estao so no GitHub."),
    (38, "Marca PAXTER para PADAXOR nas telas internas",
     "Restante do rebrand: textos dentro do painel, nao so o titulo da aba entregue no item 15.",
     "Dr. Replit", "—", "A FAZER", "P1 alto", "3h",
     "O nome oficial PADAXOR ja esta decidido pelo CEO. O Dr. Replit havia marcado como decisao pendente; nao e, o nome ja foi batido."),
]

# Traducao de cada item para linguagem de leigo. Pedido do CEO: ele e medico,
# forte em logica e leigo em detalhe tecnico fino (Art. 4 da Biblia). A coluna
# usa analogia sempre que a analogia esclarece, e nunca troca a verdade por
# simplificacao bonita.
LEIGO = {
    1: "Os dados reais dos seus clientes sairam do computador antigo e entraram no novo. Como mudar o arquivo de papel de uma clinica para outra sala: 3.683 fichas e 24.287 exames, todos conferidos um a um na chegada.",
    2: "Copia de seguranca automatica do banco, todo dia, toda semana, todo mes. E o seguro contra incendio: voce paga sem usar, e no dia do incendio ele e a unica coisa que importa. Ja salvou uma carga que travou no meio.",
    3: "O servidor que atende os pedidos do sistema esta no ar, com endereco proprio na internet e a lista de quem pode chamar ele configurada corretamente.",
    4: "Sua senha de entrada no sistema foi gravada no formato certo e testada em producao. Antes disso ela existia mas o sistema nao a reconhecia.",
    5: "O cracha do colaborador passou a ser aceito nas portas internas. Antes o cracha existia mas o porteiro nao olhava para ele.",
    6: "O site publico foi corrigido em seis pontos, entre eles tirar o cadastro aberto, que deixava qualquer um criar conta sozinho.",
    7: "Quando alguem se interessa pelo produto no site, o nome e o contato agora caem numa lista dentro do sistema, em vez de se perderem.",
    8: "Hoje um colaborador nao esta amarrado a nenhuma clinica: ele so existe solto. Isso e uma coluna nova no banco dizendo 'este colaborador pertence a esta clinica'. E o CPF do vinculo. Sem ela, ao vender para a segunda clinica, ninguem sabe quem e de quem.",
    9: "Trava no proprio banco de dados que impede uma clinica de ver paciente de outra, mesmo que o programador esqueca de filtrar. Hoje a separacao depende do programador lembrar toda vez; isso troca a memoria humana por uma tranca de verdade. Hoje ha zero trancas.",
    10: "Existem dois tipos de senha no sistema, guardados de jeitos diferentes, mas gravados com a MESMA etiqueta. E como dois frascos de remedio com o mesmo rotulo e conteudo diferente. Foi isso que fez seu login falhar por uma noite inteira. Isso poe rotulo diferente em cada frasco.",
    11: "Tela de entrada propria do sistema, em vez da caixinha cinza do navegador. Ja entregue em 30/07.",
    12: "O botao Entrar do site deixa de pedir senha por conta propria e passa a levar a pessoa para a tela de entrada do sistema. Uma porta so em vez de duas.",
    13: "Trocar quem cuida do endereco padaxor.com.br na internet. O registrador brasileiro nao faz um recurso que o servidor precisa; o Cloudflare faz, e e de graca.",
    14: "Fazer app.padaxor.com.br apontar para o sistema, com cadeado de seguranca automatico no navegador.",
    15: "O painel ainda mostrava o nome antigo PAXTER. Titulo da aba corrigido em 30/07; o resto das telas segue no item 38.",
    16: "O servidor ja tem doze portas prontas para a area do paciente, mas o site nao tem nenhum botao que leve ate elas. E uma porta inteira construida e sem macaneta.",
    17: "Impedir que dois colaboradores tenham o mesmo nome de usuario. Prevencao: nao foi a causa do problema de hoje, mas seria a causa do de amanha.",
    18: "Comecar a anotar quanto cada clinica usa do sistema. Sem anotar desde ja, nao existe historico depois: historico nao se cria para tras.",
    19: "Definir quanto custa cada modulo em reais. So voce decide. Nenhum preco vai para tela sem isso.",
    20: "Os modulos que a clinica nao comprou aparecem apagados com um cadeado, e clicar abre a oferta. E a vitrine da loja: voce ve o que nao comprou, e isso e o que faz querer comprar.",
    21: "A mensagem que aparece ao clicar no cadeado: o que o modulo faz, o preco promocional valendo 48 horas, o valor cheio riscado e o desconto por indicacao.",
    22: "Um segundo usuario seu, entrando na mesma clinica, mas enxergando so o que um cliente enxergaria. Dois cracha, mesma porta, oculos diferentes.",
    23: "Painel onde voce ve todas as clinicas de uma vez e consegue entrar na visao de cada dona para ver o que ela ve.",
    24: "Painel de quanto cada clinica consumiu, por periodo e por tipo, atualizando sozinho na tela.",
    25: "Quando o uso de um modulo passa de um limite, o sistema oferece o upgrade sozinho. Oferece quando o proprio uso ja provou que faz sentido, nao antes.",
    26: "Configurar a conta de e-mail corporativo. Depois disso o sistema cria os e-mails de cada clinica nova sozinho.",
    27: "Quando uma clinica nova e ativada, o endereco de internet dela e criado sozinho, sem ninguem abrir painel nenhum.",
    28: "A esteira que transforma um contrato assinado em clinica funcionando: nome, endereco, e-mails, site. Regra importante: cobrar antes de montar, nunca depois.",
    29: "Assinatura digital do seu dominio no e-mail. Sem ela o Gmail marca seu convite como golpe, com tarja vermelha. Convite de socio chegando como phishing destroi a confianca antes da primeira conversa.",
    30: "Escrever no proprio codigo como o sistema e montado. Hoje isso so existe dentro do painel de um fornecedor: se a conta sumir, o codigo sozinho nao remonta o sistema. Passou para o Dr. Manus, que faz missao inteira sozinho.",
    31: "Hoje o formulario do site grava em dois lugares ao mesmo tempo. Isso desliga o lugar antigo e deixa so um. Espelho e etapa de mudanca, nao destino.",
    32: "Testes automaticos que rodam sozinhos antes de publicar e barram o erro antes de ele chegar no ar. Hoje nao existe nenhum: por isso os erros das ultimas horas so apareceram em producao.",
    33: "Trocar o nome interno antigo por PADAXOR em 414 arquivos. So da para fazer com todos os agentes parados, senao um atropela o outro.",
    34: "Definir os niveis de acompanhamento do paciente e o que cada nivel entrega. Cuidado: prazo de resposta prometido vira obrigacao de contrato.",
    35: "Dar um numero de protocolo a cada chamada do sistema. Igual ao numero de atendimento do banco: quando alguem reclama, existe o numero para achar o que aconteceu.",
    36: "Era a vaga aberta do Dr. Manus. Ele entrou em 30/07 e pegou o item 30, entao a vaga fechou. A linha fica como registro: nada se apaga.",
    37: "Varrer todas as portas do sistema procurando as que leem dados sem perguntar de qual clinica. A entrega e a LISTA dos buracos, nao o conserto. E o exame antes da cirurgia: sem a lista, o item 9 seria operado as cegas.",
    38: "O resto da troca de nome PAXTER para PADAXOR, agora dentro das telas. O titulo da aba ja foi feito no item 15.",
    40: "Hoje o exame do cliente e guardado no Google Drive. Isso faz o sistema guardar TAMBEM num deposito de arquivos mais barato, com o nome ja saindo organizado na gravacao. O Drive continua igual: e espelho, nao troca. Serve para voce ver um item nascer, andar e fechar usando a nossa propria ferramenta.",
    39: "Fazer os documentos da equipe caírem tambem na sua pasta do Obsidian, o seu segundo cerebro. Hoje eles existem so no GitHub, que voce nao abre para consultar. E a sua propria regra que nao esta sendo cumprida.",
}

for k, it in enumerate(ITENS):
    linha = 5 + k
    estado = it[5]
    fill = FEITO if estado == "CONCLUIDO" else (ESPERA if estado == "AGUARDANDO" else None)
    corpo(ws, linha, list(it) + [LEIGO.get(it[0], "")], fill)
    ws.row_dimensions[linha].height = 46

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
ws.auto_filter.ref = f"A4:J{ULT}"

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
     "railway.toml versionado (30). Proximo candidato: X-Request-Id e contrato da API (35)"),
    ("Dr. Chat", "ChatGPT",
     "Peca avulsa e auditoria independente: logo, mockup, imagem, grafico, "
     "rascunho de texto, e segunda opiniao sobre spec e codigo de outro agente",
     "NAO commita nada. Entrega arquivo na doca; quem commita e o dono do "
     "territorio. Nao decide arquitetura nem mexe em fila",
     "Sem item proprio ainda. Auditoria independente e sob demanda"),

    # Vagas para agente futuro. NUNCA deixar a linha totalmente vazia: o
    # espelho em markdown le a matriz varrendo ate a primeira celula vazia,
    # e linha em branco cortaria tudo o que vem abaixo. Vaga tem rotulo.
    ("VAGA 1 — a definir", "a definir",
     "A definir no ritual de entrada",
     "Tudo, ate a matriz ser preenchida",
     "Livre. Ver o ritual de entrada no capitulo 07 da cartilha"),
    ("VAGA 2 — a definir", "a definir",
     "A definir no ritual de entrada",
     "Tudo, ate a matriz ser preenchida",
     "Livre. Ver o ritual de entrada no capitulo 07 da cartilha"),
    ("VAGA 3 — a definir", "a definir",
     "A definir no ritual de entrada",
     "Tudo, ate a matriz ser preenchida",
     "Livre. Ver o ritual de entrada no capitulo 07 da cartilha"),
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

# ================================================================ ABA 5
# Regras de edicao dentro do proprio arquivo. Pedido do CEO em 29/07/2026:
# a convencao tem de morar no arquivo, nao numa conversa que se perde.
ws5 = wb.create_sheet("REGRAS DE EDICAO")
COLS5 = ["Regra", "O que pode", "O que nao pode", "Por que"]
LARG5 = [26, 44, 44, 52]
titulo(ws5, "PADAXOR — Regras de edicao desta planilha",
       "Vale para todo mundo: CEO, Dr. Code, Dr. Replit, Dr. Lovable e Dr. Manus. "
       "A regra mestra e uma: NADA SE APAGA, tudo se acrescenta.",
       len(COLS5))
cabecalho(ws5, 4, COLS5, LARG5)

REGRAS = [
    ("Nada se apaga",
     "Acrescentar linha, acrescentar observacao, acrescentar comentario.",
     "Apagar linha, apagar texto de outra pessoa, sobrescrever celula que ja tinha conteudo.",
     "So se consegue comparar o que foi pedido, o que foi feito e o que foi corrigido se o antes continuar existindo. E o Art. 56 da Biblia: log append-only."),
    ("Numero de item e permanente",
     "Criar item novo com numero maior que o ultimo em uso.",
     "Reaproveitar, reatribuir ou renumerar numero que ja existe.",
     "Em 30/07/2026 uma segunda fila reatribuiu os numeros 8 a 31 e os numeros 11 e 15 passaram a significar duas coisas. Um recado dizendo 'comece o item 11' ficou impossivel de obedecer."),
    ("Mudanca de estado vira linha no HISTORICO",
     "Mudar a coluna Estado e registrar na aba HISTORICO: data, quem, de que para que, e por que.",
     "Mudar Estado sem deixar rastro.",
     "Sem o rastro ninguem sabe se o item foi concluido, corrigido ou apagado por engano."),
    ("Concluido exige prova",
     "Marcar CONCLUIDO citando o hash do commit e o arquivo tocado.",
     "Marcar CONCLUIDO por prosa, memoria ou intencao.",
     "Art. 19 da Biblia: onda so fecha com hash no GitHub mais caso real testado. Anunciar sem prova e fantasia."),
    ("Cada um na sua coluna",
     "Qualquer agente escreve na coluna Observacao, assinando com nome e data.",
     "Um agente mudar Responsavel, Depende de ou Prioridade de item de outro.",
     "Territorio esta na aba MATRIZ DA EQUIPE. Foi a fronteira que faltou quando dois agentes consertaram o mesmo arquivo tres vezes."),
    ("Um escritor da estrutura",
     "Pedir mudanca de estrutura pela coluna Observacao ou pelo recado no repositorio.",
     "Dois agentes gerando a planilha ou subindo arquivo de mesmo nome para o Drive.",
     "Recurso compartilhado com dois escritores corrompe em silencio: foi o drizzle.config.ts, e depois foi esta propria planilha."),
    ("As duas copias dizem a mesma coisa",
     "Ler no Drive (CEO) ou no repositorio em docs/LINHA_DE_PRODUCAO (agentes).",
     "Editar so uma das duas e deixar a outra velha.",
     "O espelho em texto e gerado desta planilha por script, nunca digitado a mao. Divergiu = alguem digitou."),
    ("Decisao do CEO e so do CEO",
     "Qualquer um pode registrar uma pergunta na aba DECISOES DO CEO.",
     "Qualquer agente responder no lugar dele preco, plano ou decisao clinica.",
     "Art. 15 da Biblia, balde vermelho. Preco e decisao clinica nascem do cacique."),
]
for i, r in enumerate(REGRAS):
    corpo(ws5, 5 + i, r, PASTEL if i % 2 == 0 else None)
    ws5.row_dimensions[5 + i].height = 58
ws5.freeze_panes = "A5"

# ================================================================ ABA 6
# Historico append-only. Semeado com as mudancas reais ja feitas, para o
# CEO poder comparar pedido, execucao e correcao desde a primeira versao.
ws6 = wb.create_sheet("HISTORICO")
COLS6 = ["Data", "Quem", "Nº", "Campo", "Como estava", "Como ficou", "Por que mudou", "Prova"]
LARG6 = [11, 13, 5, 14, 20, 20, 50, 26]
titulo(ws6, "PADAXOR — Historico de mudancas (append-only)",
       "So cresce. Linha nunca se apaga nem se corrige: mudou de novo, entra linha nova. "
       "Ordem cronologica, mais antigo em cima.",
       len(COLS6))
cabecalho(ws6, 4, COLS6, LARG6)

HIST = [
    ("29/07/2026", "Dr. Code", "—", "criacao", "—", "36 itens",
     "Primeira versao da fila. Existe porque tres vezes dois agentes consertaram o mesmo arquivo sem saber um do outro e o git aceitou os dois lados sem conflito.",
     "PR #6"),
    ("29/07/2026", "Dr. Code", "31", "Estado", "AGUARDANDO", "A FAZER",
     "Erro meu: a dependencia (item 7) ja estava concluida. O estado errado escondia trabalho livre do Dr. Lovable.",
     "conferir_coerencia.py"),
    ("29/07/2026", "Dr. Code", "18", "Estado", "A FAZER", "AGUARDANDO",
     "Erro meu, inverso do anterior: aparecia livre, mas espera o RLS (item 9), que e do Dr. Code. O dono poderia comecar em cima de dependencia de outro.",
     "conferir_coerencia.py"),
    ("29/07/2026", "Dr. Code", "29", "Estado", "A FAZER", "AGUARDANDO",
     "Mesmo erro do item 18: espera o Cloudflare (item 13), que e do CEO.",
     "conferir_coerencia.py"),
    ("30/07/2026", "Dr. Replit", "11", "Estado", "A FAZER", "CONCLUIDO",
     "Tela de login dedicada entregue. Conferido no codigo, nao aceito em prosa: pages/login/index.tsx criado e CollaboratorGate passou a redirecionar.",
     "commit 3a38349"),
    ("30/07/2026", "Dr. Replit", "15", "Estado", "A FAZER", "CONCLUIDO",
     "Titulo da aba e do aplicativo corrigidos. Entrega parcial: as telas internas seguem no item 38.",
     "commit 3a38349"),
    ("30/07/2026", "Dr. Code", "12", "Estado", "AGUARDANDO", "A FAZER",
     "Liberado por consequencia: a tela do item 11 que o Dr. Lovable esperava passou a existir.",
     "commit 3a38349"),
    ("30/07/2026", "Dr. Code", "37", "criacao", "—", "A FAZER",
     "Item novo, ideia do Dr. Replit: auditoria de rotas sem filtro de empresa. Entrou como 37 e nao como 9 ou 10 porque esses numeros ja significam outra coisa desde 29/07.",
     "COLISAO_DE_NUMERACAO_26.07.30.md"),
    ("30/07/2026", "Dr. Code", "38", "criacao", "—", "A FAZER",
     "Item novo: resto do rebrand nas telas internas, que o item 15 comecou.",
     "COLISAO_DE_NUMERACAO_26.07.30.md"),
    ("30/07/2026", "Dr. Code", "30", "Responsavel", "Dr. Code", "Dr. Manus",
     "O Dr. Manus entrou na equipe de fato. Item de escopo fechado, ponta a ponta, sem dependencia — perfil dele. Libera o Dr. Code para os tres itens P0 de isolamento.",
     "pedido do CEO"),
    ("30/07/2026", "Dr. Code", "36", "Estado", "AGUARDANDO", "CONCLUIDO",
     "A vaga em aberto do Dr. Manus foi usada: ele assumiu o item 30. A linha fica como registro; proxima missao dele entra como numero novo.",
     "pedido do CEO"),
    ("30/07/2026", "Dr. Code", "—", "coordenacao", "recado no repositorio", "recado no Slack em tempo real",
     "Premissa minha estava errada: eu afirmei que os agentes nao conseguiam conversar entre si. Todos tinham conector de Slack. Canal #padaxor-projeto passa a ser a caixa de recados, e o CEO sai do meio.",
     "CARTILHA/06 em PADUA-SOFTWARE-DESIGN"),
    ("30/07/2026", "Dr. Code", "—", "equipe", "5 membros", "6 membros",
     "Dr. Chat (ChatGPT) entrou no quadro por decisao do CEO. Territorio escolhido para NAO sobrepor ninguem: peca avulsa e auditoria independente, entregue na doca, sem commitar. Modelo de familia diferente lendo a mesma spec pega o que o autor nao viu.",
     "pedido do CEO"),
    ("30/07/2026", "Dr. Code", "40", "criacao", "—", "A FAZER",
     "Item novo pedido pelo CEO, e ele mesmo declarou que nao e urgente: quer acompanhar uma construcao inteira passando pela ferramenta de coordenacao enquanto aprende. Fica primeiro na fila de execucao, com prioridade P1 e nao P0 — P0 aqui significa dano irreversivel, e este item nao perde nada.",
     "pedido do CEO"),
    ("30/07/2026", "Dr. Code", "—", "conector", "sem Cloudflare", "Cloudflare ligado, sem DNS",
     "ERRO MEU: recomendei o conector Cloudflare para resolver o DNS dos itens 13, 14, 27 e 29. Conferi a lista de ferramentas DEPOIS de o CEO instalar: o conector expoe R2, D1, KV, Workers, Hyperdrive e busca em documentacao. ZERO ferramentas de DNS. Os quatro itens continuam travados e nada mudou de estado.",
     "CARTILHA/08 em PADUA-SOFTWARE-DESIGN"),
    ("30/07/2026", "Dr. Code", "39", "criacao", "—", "A FAZER",
     "Item novo: o Art. 23-B da Biblia nao esta sendo cumprido. Nenhum .md escrito nesta madrugada chegou ao cofre do Dr. Obsidian. Conserto usa o Google Drive, que ja esta ligado.",
     "achado durante a revisao de conectores"),
    ("30/07/2026", "Dr. Code", "—", "equipe", "6 membros", "6 membros e 3 vagas",
     "Tres vagas abertas para agente futuro, com rotulo VAGA e nao em branco: o espelho le a matriz varrendo ate a celula vazia, e linha em branco cortaria tudo abaixo. Preenchimento so pelo ritual de entrada.",
     "pedido do CEO"),
    ("30/07/2026", "Dr. Code", "—", "estrutura", "4 abas", "6 abas",
     "Pedido do CEO: as regras passam a morar dentro do proprio arquivo, e o historico passa a registrar o antes e o depois de cada mudanca. Abas REGRAS DE EDICAO e HISTORICO.",
     "PR #6"),
]
for i, h in enumerate(HIST):
    corpo(ws6, 5 + i, h, PASTEL if i % 2 == 0 else None)
    ws6.row_dimensions[5 + i].height = 46
ws6.freeze_panes = "A5"
ws6.auto_filter.ref = f"A4:H{4 + len(HIST)}"

PROX = 5 + len(HIST)
c = ws6.cell(row=PROX, column=1, value="acrescente aqui")
c.font = Font(name=FONTE, size=9, italic=True, color="9A8F7E")
for col in range(1, len(COLS6) + 1):
    ws6.cell(row=PROX, column=col).fill = AMARELO
    ws6.cell(row=PROX, column=col).border = BORDA

# ================================================================ ABA 7
# Glossario. Pedido do CEO: ele e medico e quer aprender IA, programacao e
# arquitetura de sistemas. Toda palavra tecnica que aparece nos arquivos da
# equipe entra aqui. A ordem alfabetica e feita pelo script, nunca a mao:
# ordem mantida a mao desandra na terceira insercao.
ws7 = wb.create_sheet("GLOSSARIO")
COLS7 = ["Palavra", "Sinonimos e como aparece", "O que e",
         "Em linguagem de leigo, com analogia", "Para que serve"]
LARG7 = [20, 26, 46, 62, 46]
titulo(ws7, "PADAXOR — Glossario para o Dr. Caio",
       "Toda palavra tecnica usada pela equipe entra aqui. Ordem alfabetica automatica. "
       "Palavra nova aparece numa conversa, vira linha nova aqui.",
       len(COLS7))
cabecalho(ws7, 4, COLS7, LARG7)

GLOSSARIO = [
    ("API", "interface, endpoint, rota",
     "Interface de Programacao de Aplicacoes. O conjunto de portas por onde um programa pede coisas a outro.",
     "E o balcao de atendimento de um laboratorio. Voce nao entra no laboratorio: chega no balcao, entrega o pedido, recebe o resultado. A API e o balcao, e cada guiche e uma rota.",
     "O site conversa com o servidor por API. Quando o site mostra a lista de clientes, ele pediu pela API."),
    ("append-only", "so cresce, log append-only",
     "Registro em que se acrescenta linha, nunca se apaga nem se corrige linha antiga.",
     "E o prontuario do paciente. Voce nao apaga a evolucao de ontem: escreve a de hoje embaixo. Se errou ontem, escreve hoje que errou. O erro fica registrado, e e isso que da valor legal.",
     "A aba HISTORICO desta planilha e append-only. E o que permite comparar o que foi pedido com o que foi feito."),
    ("backup", "copia de seguranca, dump",
     "Copia dos dados guardada separada do original, para restaurar se o original se perder.",
     "E o seguro do carro. Custa todo mes e parece dinheiro jogado fora, ate o dia da batida.",
     "Item 2 da fila. Salvou a carga do banco quando o primeiro apagamento travou no meio."),
    ("banco de dados", "banco, base, Postgres, SQL",
     "Programa que guarda os dados de forma organizada e permite buscar rapido.",
     "E o arquivo de fichas da clinica, mas que responde em um centesimo de segundo e nunca perde uma ficha por descuido.",
     "Seus 3.683 clientes e 24.287 resultados de exame vivem num banco chamado PostgreSQL."),
    ("branch", "ramificacao, ramo",
     "Copia paralela do codigo onde se trabalha sem mexer na versao que esta no ar.",
     "E a via de um exame: voce faz o rascunho da conduta numa folha separada antes de escrever no prontuario oficial. Se der errado, joga a folha fora e o prontuario continua intacto.",
     "Todo trabalho meu comeca numa ramificacao. So vai para o codigo oficial depois de conferido."),
    ("CI/CD", "integracao continua, GitHub Actions, esteira",
     "Robo que roda os testes sozinho a cada mudanca e barra o que quebrou antes de publicar.",
     "E a conferencia dupla da enfermagem antes de aplicar a medicacao. Ninguem confia so na memoria de quem preparou.",
     "Item 32 da fila. Hoje nao existe nenhum: por isso os erros das ultimas horas so apareceram depois de publicados."),
    ("CNAME", "apontamento de DNS, ALIAS",
     "Tipo de registro de endereco na internet que diz 'este nome aponta para aquele outro nome'.",
     "E o encaminhamento de telefone: quem liga para o numero antigo cai automaticamente no novo, sem saber que foi encaminhado.",
     "Item 13. O Registro.br nao faz um tipo especifico que o servidor precisa; o Cloudflare faz."),
    ("commit", "gravacao, ponto de salvamento",
     "Um pacote de mudancas no codigo, com autor, data e explicacao, gravado de forma permanente.",
     "E uma entrada assinada no prontuario: quem escreveu, quando, e o que mudou. Nao se apaga.",
     "O Dr. Replit entregou os itens 11 e 15 no commit 3a38349. Esse numero e a prova de que existe."),
    ("CORS", "lista de origens permitidas",
     "Regra que diz quais sites tem permissao de chamar o seu servidor.",
     "E a lista da portaria do predio: so sobe quem esta na lista. Sem a lista certa, ate o morador fica na calcada.",
     "Item 3. Estava com valor invalido e por isso o site nao conseguia falar com o servidor."),
    ("deploy", "publicar, subir, colocar no ar",
     "Levar o codigo do computador do programador para o servidor onde o cliente usa.",
     "E a diferenca entre escrever a receita no bloco e entregar na mao do paciente. Enquanto nao entregou, nao existe para ele.",
     "Regra numero 1 da equipe: ninguem anuncia pronto antes de estar publicado."),
    ("DKIM", "assinatura de e-mail",
     "Assinatura digital que prova que o e-mail saiu mesmo do dominio que diz ter saido.",
     "E o carimbo e a assinatura no receituario. Sem eles, a farmacia trata como falsificacao.",
     "Item 29. Sem isso o Gmail marca seu convite de socio com tarja vermelha de golpe."),
    ("DNS", "servidor de nomes, dominio",
     "Sistema que traduz um nome como padaxor.com.br no endereco numerico real do servidor.",
     "E a lista telefonica: voce sabe o nome da pessoa, e ela devolve o numero. Ninguem decora o numero.",
     "Itens 13 e 14. Sem DNS certo, o endereco padaxor.com.br nao chega no sistema."),
    ("endpoint", "rota, porta, guiche",
     "Um endereco especifico da API que faz uma coisa so.",
     "E o guiche especifico dentro do balcao: um guiche para entregar exame, outro para retirar resultado.",
     "/api/collaborator/login e o guiche de entrada do colaborador."),
    ("FK", "chave estrangeira, foreign key, vinculo",
     "Coluna que amarra uma linha de uma tabela a uma linha de outra tabela.",
     "E o numero do prontuario escrito no pedido de exame: e o que amarra aquele exame aquele paciente e nao a outro.",
     "Item 8. Hoje o colaborador nao tem esse vinculo com a clinica: existe solto."),
    ("hash", "resumo criptografico, impressao digital, identificador de commit",
     "Numero unico calculado a partir de um conteudo. Mudou uma virgula no conteudo, o numero muda inteiro.",
     "E a impressao digital de um documento. Duas pessoas nao tem a mesma, e a sua nao muda sozinha. Se o documento foi adulterado, a impressao digital nao bate mais.",
     "Serve para provar entrega. Quando eu digo 'commit 3a38349', voce pode conferir que aquele codigo existe exatamente daquele jeito. E a regra anti-fantasia do seu Art. 19."),
    ("idempotente", "reprocessavel, seguro para repetir",
     "Operacao que pode ser repetida quantas vezes for e o resultado final e sempre o mesmo.",
     "E apertar o botao do elevador. Apertar dez vezes nao chama dez elevadores: o andar continua marcado uma vez so.",
     "Art. 57 da sua Biblia. Toda operacao que grava dado tem de poder rodar de novo sem duplicar."),
    ("indice unico", "unique index, restricao de unicidade",
     "Regra do banco que impede dois registros de terem o mesmo valor num campo.",
     "E o CPF: o cartorio nao deixa dois cadastros com o mesmo numero. A regra vive no cartorio, nao na boa vontade de quem preenche.",
     "Item 17. Impede dois colaboradores com o mesmo nome de usuario."),
    ("main", "principal, tronco, producao",
     "A ramificacao oficial do codigo, a que esta valendo de verdade.",
     "E o prontuario oficial, nao o rascunho. O que nao esta nele, oficialmente nao aconteceu.",
     "Regra da equipe: construido no ambiente local e rascunho; so vale quando esta na main."),
    ("merge", "mesclar, juntar, fundir",
     "Juntar o trabalho de duas ramificacoes num so.",
     "E juntar as anotacoes de dois medicos sobre o mesmo paciente num prontuario unico.",
     "O perigo e o conflito: quando os dois mexeram na mesma linha e o programa nao sabe qual vale."),
    ("middleware", "camada intermediaria, porteiro",
     "Codigo que fica no meio do caminho de toda chamada e decide se ela passa.",
     "E o porteiro do predio: toda visita passa por ele antes de chegar no apartamento, e ele decide quem sobe.",
     "O basicAuth e o porteiro do sistema. Foi um dos tres arquivos onde dois agentes colidiram."),
    ("migration", "migracao, alteracao de estrutura",
     "Script que muda a estrutura do banco de dados de forma controlada e registrada.",
     "E a reforma da clinica com planta aprovada e registrada, em vez de derrubar parede no impulso.",
     "O item 8 vai precisar de uma: acrescentar a coluna de vinculo da clinica."),
    ("mock", "simulacao, dado de mentira, placeholder",
     "Dado ou resposta falsa usada so para testar, no lugar do dado real.",
     "E o manequim de treinamento. Serve para ensaiar, e e perigoso se alguem esquecer e tratar como paciente.",
     "Cuidado permanente: mock esquecido em producao vira numero falso na tela do cliente."),
    ("multi-tenant", "multi-inquilino, isolamento entre clinicas",
     "Um mesmo sistema atendendo varios clientes com os dados separados entre si.",
     "E um predio de consultorios: mesma estrutura, mesmo elevador, mas cada sala tem chave propria e ninguem entra na do outro.",
     "Itens 9 e 37. E o que precisa estar de pe antes de licenciar a segunda clinica."),
    ("PR", "pull request, pedido de incorporacao",
     "Pedido formal para juntar um trabalho na versao oficial, com espaco para revisao antes.",
     "E o pedido de parecer antes da cirurgia. Alguem olha, comenta, e so depois entra.",
     "A PR numero 6 e onde vive esta planilha e a fila de producao."),
    ("PWA", "aplicativo web progressivo",
     "Site que se comporta como aplicativo de celular, com icone na tela inicial e uso sem internet.",
     "E um aparelho que serve de dois jeitos: no consultorio parece bancada, na mao vira portatil. Mesmo aparelho.",
     "Ideia para a area do paciente no celular, sem publicar em loja de aplicativos."),
    ("RBAC", "controle de acesso por papel",
     "Regra que define o que cada tipo de usuario pode ver e fazer.",
     "E a diferenca entre medico, enfermeiro e recepcao no sistema da clinica: cada um ve a tela do seu papel.",
     "Precisa existir para o licenciado ver so a propria clinica e voce ver todas."),
    ("repositorio", "repo, GitHub",
     "O lugar onde o codigo mora, com todo o historico de quem mudou o que e quando.",
     "E o arquivo morto da clinica, mas em que nada se perde e da para voltar a qualquer dia do passado.",
     "Protocolo-Manager e Parlegis sao dois repositorios diferentes, de dois sistemas diferentes."),
    ("RLS", "Row-Level Security, seguranca por linha",
     "Trava dentro do proprio banco que impede um cliente de ler a linha de outro, mesmo com erro do programador.",
     "E a tranca da porta da sala, nao o aviso 'por favor nao entre'. O aviso depende da boa vontade; a tranca nao.",
     "Item 9, o mais critico da fila. Hoje existem zero trancas: a separacao depende do programador lembrar."),
    ("scrypt", "algoritmo de senha, derivacao de chave",
     "Metodo de embaralhar a senha de um jeito que nao se desfaz, para guardar sem saber qual e.",
     "E guardar a impressao digital do paciente em vez do dedo dele. Da para conferir se bate, mas ninguem reconstroi o dedo a partir dela.",
     "Item 10. Existem dois usos diferentes com a mesma etiqueta, e foi isso que quebrou seu login."),
    ("SPF", "autorizacao de remetente",
     "Registro que diz quais servidores tem permissao de mandar e-mail em nome do seu dominio.",
     "E a lista de quem pode assinar receita em nome da clinica. Sem ela, qualquer um assina.",
     "Item 29, junto com o DKIM."),
    ("SSE", "eventos do servidor, tempo real",
     "Tecnica em que o servidor avisa a tela sozinho quando algo muda, sem a tela ficar perguntando.",
     "E o monitor de sinais vitais: ele avisa quando muda, voce nao fica olhando de minuto em minuto.",
     "Ideia para o painel de consumo atualizar sozinho."),
    ("token", "cracha, Bearer, chave de sessao",
     "Codigo temporario que prova quem voce e depois que voce ja fez o login.",
     "E a pulseira do hospital. Voce se identifica uma vez na recepcao e depois so mostra a pulseira em cada setor.",
     "Item 5. O cracha existia, mas o porteiro nao olhava para ele."),
    ("UPSERT", "inserir ou atualizar",
     "Operacao que grava o registro se ele nao existe, e atualiza se ja existe.",
     "E abrir ficha se o paciente e novo, ou atualizar a que ja existe se ele ja veio antes. Uma decisao so, automatica.",
     "Serve para carga de dados poder rodar duas vezes sem duplicar ninguem."),
    ("webhook", "aviso automatico, gancho",
     "Chamada que um sistema faz no outro sozinho quando um evento acontece.",
     "E o laboratorio que liga para voce quando o resultado critico sai, em vez de voce ligar de hora em hora perguntando.",
     "Item 28: o provisionamento da clinica deve pendurar no aviso de pagamento confirmado, nunca antes dele."),
]

def chave_alfabetica(termo):
    """Ordem alfabetica do portugues: acento nao joga a palavra para o fim.

    Sem isso 'indice' cai depois de 'webhook', porque o computador ordena
    pelo numero interno da letra e a letra acentuada tem numero alto.
    """
    sem_acento = unicodedata.normalize("NFKD", termo)
    return "".join(c for c in sem_acento if not unicodedata.combining(c)).lower()


for i, g in enumerate(sorted(GLOSSARIO, key=lambda x: chave_alfabetica(x[0]))):
    corpo(ws7, 5 + i, g, PASTEL if i % 2 == 0 else None)
    ws7.row_dimensions[5 + i].height = 56
ws7.freeze_panes = "A5"
ws7.auto_filter.ref = f"A4:E{4 + len(GLOSSARIO)}"

PROX7 = 5 + len(GLOSSARIO)
c = ws7.cell(row=PROX7, column=1, value="acrescente aqui")
c.font = Font(name=FONTE, size=9, italic=True, color="9A8F7E")
for col in range(1, len(COLS7) + 1):
    ws7.cell(row=PROX7, column=col).fill = AMARELO
    ws7.cell(row=PROX7, column=col).border = BORDA

wb.save(SAIDA)
print("gerado:", SAIDA)
print("itens:", len(ITENS), "| equipe:", len(EQUIPE), "| decisoes:", len(DEC))
