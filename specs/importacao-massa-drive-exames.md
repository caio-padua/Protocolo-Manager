# Spec — Importação em massa de exames do Drive + Trilha de Imagem (RMN/USG/TC)

## Objetivo (uma frase)
Varrer a pasta do Google Drive dos clientes ativos, extrair automaticamente os dados de cada
laudo (laboratorial E de imagem), casar o cliente do Drive com o cadastro do sistema (por nome,
desempatando por CPF), e lançar tudo como exame "lido pela IA, aguardando conferência humana",
sem nunca virar verdade clínica sem conferência — produzindo ao final uma planilha Excel dos
casos que não deram para resolver sozinho.

## Contexto verificado na fonte (10/07/2026)
- Pasta raiz do Drive: `1kZJ4x2c-UyT4FBz5j8EvY8jYLJ0BUs1J` (acesso via conector google-drive: OK).
- Estrutura NÃO uniforme: (a) cliente com subpasta "EXAMES" contendo PDFs; (b) cliente com PDFs
  soltos na própria pasta (sem subpasta); (c) subpasta "EXAMES" vazia. Tratar os três.
- Pastas têm só o NOME do cliente (sem CPF). Banco: 5.270 clientes, 4.176 com CPF; há homônimos.
- Motor laboratorial já existe: `POST /exames-lab/ingest` (buffer PDF + clientId) →
  `processExamDocument` (background) → `exam_documents` (status `processando`→`recebido`) +
  `exam_results`; idempotência por SHA-256 do buffer por cliente. Extração em
  `lib/exam-extraction/` (pdf-parse → compactExamText → Gemini → Zod). A IA já extrai
  `patient.cpf` e `patient.name` do laudo.
- Schema de imagem já existe: `exam_image_panels`, `exam_image_panel_fields`, `exam_image_findings`
  (colunas `sector`, `level`). Falta o motor de extração de imagem e o roteamento.
- Portão de conferência humana (entregue nesta data): documento entra `recebido` (IA) →
  `conferido_1` (C1) → `conferido` (C2); Evolução só mostra conferidos quando o toggle global
  `exames.exigirValidacaoHumana` está LIGADO (padrão seguro).

## Requisitos exatos

### R1 — Classificação laboratorial x imagem (por CONTEÚDO, nunca por nome de arquivo)
1.1 Ao ler o texto do PDF, decidir se é laudo LABORATORIAL (analitos numéricos) ou de IMAGEM
    (texto descritivo: ultrassom/USG, ressonância/RMN, tomografia/TC, densitometria, raio-x).
1.2 A decisão é da própria extração (a IA devolve `examKind: "lab" | "imagem"`), com heurística
    determinística de reforço por palavras-chave do texto. Nome do arquivo NÃO decide (memória:
    arquivo chamado "TIREOIDE" pode ser exame de sangue).
1.3 Um PDF pode ser CONJUGADO (vários exames de imagem no mesmo arquivo) — a extração de imagem
    separa por título de exame dentro do arquivo.

### R2 — Motor de extração de imagem (reaproveita a arquitetura do laboratorial)
2.1 Mesmo pipeline: pdf-parse → compactExamText → Gemini (responseMimeType json) → Zod.
2.2 Devolve, por exame de imagem detectado: `examType` (USG/RMN/TC/densitometria/rx),
    `sector`, `title`, `collectionDate`, `labName`, `conclusion` (impressão/conclusão),
    `findings` (lista de {campo, valor, nível opcional}), `comparativo` (antes/depois qualitativo
    quando o laudo cita exame anterior).
2.3 Persistência nas tabelas `exam_image_*` já existentes, ligada ao mesmo `exam_documents`
    (um documento pode gerar N painéis de imagem). Zod tolera chave ausente (união + transform).

### R3 — Casamento cliente Drive ↔ cadastro do sistema
3.1 Normalizar nome (sem acento, maiúsculas, colapsar espaços, remover pontuação) dos dois lados.
3.2 1 correspondência exata de nome normalizado → vincula direto.
3.3 0 ou >1 correspondência → extrair o CPF do 1º laudo daquele cliente e casar por CPF (dígitos).
3.4 Se ainda 0 (não achou) ou >1 (homônimo sem CPF que resolva) → NÃO vincula; entra na lista Excel.
3.5 NUNCA criar cliente novo automaticamente; NUNCA apagar/alterar cliente existente.

### R4 — Ingestão segura (pega carona no portão de conferência)
4.1 Cada PDF vira um `exam_documents` do cliente casado, status inicial `recebido` (IA), jamais
    `conferido`. A conferência humana (C1/C2) continua sendo o único caminho para a Evolução.
4.2 Idempotência por SHA-256 do buffer por cliente (reuso do que já existe): reprocessar a pasta
    não duplica. O worker é RESUMÍVEL (rodar de novo continua de onde parou).
4.3 Guardar no documento a proveniência: origem = "drive-import", id do arquivo no Drive e o
    caminho (pasta do cliente / EXAMES).

### R5 — Worker em massa (roda no processo persistente do api-server)
5.1 Endpoint para iniciar: `POST /exames-lab/importar-drive` (body opcional {folderId, dryRun}).
    Default folderId = pasta raiz acima. `dryRun:true` só casa e classifica, NÃO grava exame.
5.2 Processa em segundo plano DENTRO do api-server (fila em memória + loop assíncrono), porque
    cada chamada Gemini leva 70-106s e há centenas de PDFs (não cabe em request síncrono nem em
    processo de shell, que morre entre chamadas).
5.3 Status: `GET /exames-lab/importar-drive/status` devolve {estado, totalPastas, processadas,
    docsLidos, docsDuplicados, naoResolvidos, erros, comecouEm, atualizadoEm, itemAtual}.
5.4 Concurrency limitada (ex.: 2-3 extrações simultâneas) para não estourar cota do Gemini.
5.5 Todo erro por arquivo é capturado e registrado (err.message como string), NUNCA derruba o worker.

### R6 — Relatório Excel dos não-resolvidos
6.1 `GET /exames-lab/importar-drive/relatorio.xlsx` gera .xlsx com colunas:
    Pasta no Drive | Nome normalizado | CPF extraído (se houve) | Motivo (NAO_ENCONTRADO /
    HOMONIMO / CPF_DIVERGENTE / SEM_PDF / ERRO_LEITURA) | Arquivos | Sugestões (ids candidatos).
6.2 A planilha é o ponto de decisão posterior do CEO (ele confirma o vínculo manualmente depois).

### R7 — Console visual da importação (tela Paxter 3D)
7.1 Na tela "Exames do Cliente", um painel 3D "Importação do Drive" com: botão iniciar, barra de
    progresso, contadores (lidos/duplicados/não-resolvidos/erros), item atual e botão para baixar
    a planilha de não-resolvidos. Segue o skill-layout-paxter (relevo 3D, navy/ouro).

## Casos extremos a tratar
- Subpasta "EXAMES" ausente → varrer PDFs soltos na pasta do cliente.
- Subpasta vazia → registrar SEM_PDF (não é erro).
- PDF escaneado sem texto digital → registrar ERRO_LEITURA (OCR fica como dívida futura, anotar).
- PDF conjugado de imagem → múltiplos painéis para 1 documento.
- Homônimos no banco → só resolve com CPF do laudo; senão vai para o Excel.
- CPF do laudo não bate com nenhum cliente → CPF_DIVERGENTE no Excel.
- Reexecução → idempotente por SHA-256 (não duplica).
- Nome de arquivo enganoso → classificação SEMPRE por conteúdo.

## Definição de PRONTO
1. Motor de imagem extrai e persiste nas tabelas exam_image_* (validado com 1 laudo real de imagem).
2. Importador varre a pasta real, casa clientes por nome+CPF, ingere como `recebido`, sem duplicar.
3. Status e progresso visíveis por endpoint e pela tela (console 3D).
4. Planilha .xlsx de não-resolvidos baixa com os motivos corretos.
5. Nenhum cliente criado/apagado; nenhum exame vira `conferido` automaticamente.
6. architect aprova requisito por requisito, zero pendência.

## Linhas vermelhas
- NUNCA tocar `/api/budgets/calculate` nem o motor de desmembramento de orçamento.
- NUNCA criar, apagar ou alterar cadastro de cliente automaticamente.
- NUNCA marcar exame como conferido/clinicamente válido sem conferência humana.
- NUNCA classificar exame por nome de arquivo; sempre por conteúdo.
- NUNCA logar token/segredo; erro sempre como string (err.message).
- NÃO refatorar o motor laboratorial existente por estética; só estender.

---

## REVISAO CEO — 10/07/2026 (autonomia total, "paxter loop mais poderoso")

Decisoes que SUBSTITUEM partes da spec original:

| Tema | Regra nova (vale a partir de 10/07/2026) |
|---|---|
| Homonimo | NAO validar com o CEO. Homonimo = MESMA pessoa por padrao. So sao pessoas diferentes se os CPFs forem diferentes. Sem CPF de desempate -> mesma pessoa, escolhe o 1o cadastro e segue. (CEO afirma nao ter homonimos.) |
| Cobertura de pastas | Muitos cadastros NAO tem subpasta EXAMES. Entao vasculhar TODAS as subpastas do cliente (menos uma lista de exclusao: CADASTRO, RECEITAS, PROTOCOLOS, FINANCEIRO, CONTRATOS, ATESTADOS, TERMOS, FOTO PERFIL, PESQUISA, OUVIDORIA) atras de arquivos de exame. |
| Tipos de arquivo | Coletar PDF **e** IMAGEM (jpg/png/webp/etc.). PDF escaneado (sem texto) e imagem sao lidos por VISAO (Gemini multimodal), nao so por texto. |
| Destino | Todo dado extraido cai nas MESMAS tabelas de exames (ferramenta "antes e depois"), igual ao fluxo manual: laboratorial -> painel/analitos; imagem -> painel/achados. |
| Porteiro anti-lixo | Antes de gastar IA, um porteiro decide se o arquivo E um exame. PDF com texto: veredito por conteudo (nenhum sinal lab/imagem -> ignora). Imagem/PDF escaneado: classificador de visao (selfie/contrato/recibo/receita -> ignora). Ignorados viram doc status "ignorado" (dedup de custo em re-execucoes) e NAO aparecem na tela de exames. |
| Rede de seguranca | Mantida: tudo entra como status "recebido" (so IA); portao C1/C2 humano continua sendo o que vira verdade clinica. |

RESUMO EM 1 LINHA: homonimo = mesma pessoa (salvo CPF diferente), varre todas as subpastas uteis, le PDF e imagem por visao, joga tudo nas tabelas de exames com porteiro anti-lixo e conferencia humana.

---

## NOTAS DE IMPLEMENTACAO (10/07/2026, apos revisao do architect)

| Tema | Regra tecnica (evitar regressao futura) |
|---|---|
| CPF no nome da pasta | Pastas "NOME CPF: xxx.xxx.xxx-xx" tem o CPF removido antes de casar por nome (stripCpfFromFolder); o mesmo CPF vira DICA de desempate de homonimo (parseCpfFromFolder). Sem isso a pasta nunca casaria por nome. |
| Desempate de homonimo | 1o o CPF do NOME da pasta (de graca); se ainda homonimo no modo full, le o CPF do 1o arquivo (sniff, pode custar IA). So vira "mesma pessoa" quando nao ha CPF de desempate. |
| Porteiro fail-open | So marca "ignorado" (permanente) quando o modelo AFIRMA que nao e exame. Resposta vazia/JSON invalido do porteiro LANCA excecao -> conta como erro SEM gravar linha -> a proxima execucao reprocessa (nao perde exame verdadeiro por falso-negativo transitorio). |
| Teto de custo (maxFiles) | Conta ARQUIVOS PROCESSADOS (exame/duplicado/nao-exame/erro), nao so ingeridos. O sniff de homonimo TAMBEM entra no teto (incrementa o contador antes de gastar IA). |

RESUMO EM 1 LINHA: CPF no nome da pasta casa e desempata, porteiro so descarta o que o modelo confirma como nao-exame, e todo custo de IA (inclusive o sniff) respeita o teto maxFiles.
