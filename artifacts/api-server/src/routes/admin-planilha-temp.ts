/**
 * admin-planilha-temp.ts
 * Rotas temporárias de administração da planilha de produção.
 * Uso único: ler, validar e limpar a pasta do Drive.
 *
 * REMOVER após concluída a operação.
 *
 * Histórico de correções aplicadas diretamente na planilha:
 *   [Task42 31/07/2026] Item #43 PARCIAL→A FAZER + obs adicionada
 *   [Task42 31/07/2026] Item #49 (Monitor de LLMs) renumerado para #53
 */

import { Router, type Request, type Response } from "express";
import { requireCeoInstance } from "../middleware/tenantContext";
import { getGoogleDriveClientRaw, getGoogleSheetsClient } from "../lib/google-drive";
import { logger } from "../lib/logger";

const router = Router();
router.use(requireCeoInstance);

const PASTA_ID         = "1_oq50UEJo45YwdDZKvuI5awNuUf9Rqke";
const PLANILHA_OFICIAL = "1SW6K2JNUEP4i1I16v_ZYhtwxTpUkT_dx3ERHkj9HQcw";

// ---------------------------------------------------------------------------
// GET /api/admin/planilha/ler — lê até as primeiras 5 abas e 100 linhas
// ---------------------------------------------------------------------------
router.get("/admin/planilha/ler", async (_req: Request, res: Response): Promise<void> => {
  try {
    const sheets = await getGoogleSheetsClient();

    // Metadados da planilha (lista de abas)
    const metaResp = await sheets.spreadsheets.get({
      spreadsheetId: PLANILHA_OFICIAL,
      includeGridData: false,
    });

    const abas = (metaResp.data.sheets ?? []).map(s => ({
      id:    s.properties?.sheetId,
      nome:  s.properties?.title,
      linhas: s.properties?.gridProperties?.rowCount,
      cols:  s.properties?.gridProperties?.columnCount,
    }));

    // Ler todas as linhas de todas as abas (até 500 por aba)
    const ranges = abas.map(a => `'${a.nome}'!A1:Z500`);
    const dataResp = await sheets.spreadsheets.values.batchGet({
      spreadsheetId: PLANILHA_OFICIAL,
      ranges,
    });

    const conteudo = (dataResp.data.valueRanges ?? []).map((vr, i) => ({
      aba:    abas[i]?.nome ?? `Aba ${i + 1}`,
      header: vr.values?.[0] ?? [],
      linhas: (vr.values?.length ?? 1) - 1,
      dados:  vr.values?.slice(1) ?? [],        // todas as linhas, sem o header
    }));

    res.json({ abas, conteudo });
  } catch (e: any) {
    logger.error({ err: e }, "admin-planilha/ler: erro");
    res.status(500).json({ error: e.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/admin/planilha/listar-pasta — lista TODOS os arquivos da pasta
// ---------------------------------------------------------------------------
router.get("/admin/planilha/listar-pasta", async (_req: Request, res: Response): Promise<void> => {
  try {
    const drive = await getGoogleDriveClientRaw();
    const resp = await drive.files.list({
      q:      `'${PASTA_ID}' in parents and trashed = false`,
      fields: "files(id,name,mimeType,modifiedTime,size,webViewLink)",
      pageSize: 100,
    });

    const arquivos = (resp.data.files ?? []).map(f => ({
      id:          f.id,
      nome:        f.name,
      tipo:        f.mimeType,
      modificado:  f.modifiedTime,
      tamanhoKb:   f.size ? (Number(f.size) / 1024).toFixed(1) : null,
      link:        f.webViewLink,
      ehOficial:   f.id === PLANILHA_OFICIAL,
    }));

    res.json({
      total:          arquivos.length,
      planilhaOficial: PLANILHA_OFICIAL,
      arquivos,
    });
  } catch (e: any) {
    logger.error({ err: e }, "admin-planilha/listar-pasta: erro");
    res.status(500).json({ error: e.message });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/admin/planilha/limpar-pasta — move para lixeira todos EXCETO oficial
// ---------------------------------------------------------------------------
router.delete("/admin/planilha/limpar-pasta", async (_req: Request, res: Response): Promise<void> => {
  try {
    const drive = await getGoogleDriveClientRaw();

    // Listar tudo na pasta
    const listResp = await drive.files.list({
      q:      `'${PASTA_ID}' in parents and trashed = false`,
      fields: "files(id,name,mimeType)",
      pageSize: 100,
    });

    const arquivos = listResp.data.files ?? [];
    const paraApagar = arquivos.filter(f => f.id !== PLANILHA_OFICIAL);

    const resultados: { id: string; nome: string; ok: boolean; erro?: string }[] = [];

    for (const arq of paraApagar) {
      try {
        // Mover para lixeira (não apaga definitivamente — regra de ouro)
        await drive.files.update({
          fileId:      arq.id!,
          requestBody: { trashed: true },
        });
        resultados.push({ id: arq.id!, nome: arq.name!, ok: true });
        logger.info({ id: arq.id, nome: arq.name }, "admin-planilha: arquivo movido para lixeira");
      } catch (e: any) {
        resultados.push({ id: arq.id!, nome: arq.name!, ok: false, erro: e.message });
        logger.error({ err: e, id: arq.id }, "admin-planilha: falha ao mover para lixeira");
      }
    }

    res.json({
      preservada:    PLANILHA_OFICIAL,
      totalApagados: resultados.filter(r => r.ok).length,
      erros:         resultados.filter(r => !r.ok).length,
      resultados,
    });
  } catch (e: any) {
    logger.error({ err: e }, "admin-planilha/limpar-pasta: erro");
    res.status(500).json({ error: e.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/admin/planilha/atualizar-estados — corrige estados e adiciona linhas
// NOTA: estados PARCIAL removidos (valor invalido; lista valida: A FAZER / AGUARDANDO / CONCLUIDO).
// ---------------------------------------------------------------------------
router.post("/admin/planilha/atualizar-estados", async (_req: Request, res: Response): Promise<void> => {
  try {
    const sheets = await getGoogleSheetsClient();
    const sid = PLANILHA_OFICIAL;

    // Buscar dados atuais para encontrar as linhas pelo número
    const rangeResp = await sheets.spreadsheets.values.get({
      spreadsheetId: sid,
      range: "A1:H100",
    });
    const rows = rangeResp.data.values ?? [];

    // Mapear nº → índice de linha (0-based, incluindo header)
    const idxMap: Record<number, number> = {};
    rows.forEach((r, i) => {
      const n = parseInt(r[0]);
      if (!isNaN(n)) idxMap[n] = i;
    });

    const updates: { range: string; values: string[][] }[] = [];

    // Itens a corrigir: [nº, novoEstado]
    // ATENÇÃO: estados válidos = A FAZER | AGUARDANDO | CONCLUIDO
    // PARCIAL foi removido — o conferidor de consistência reprova qualquer valor fora dessa lista.
    const correcoes: [number, string][] = [
      [18, "CONCLUIDO"],
      [42, "CONCLUIDO"],
      // #43 permanece A FAZER — não alterar para PARCIAL (valor inválido)
    ];

    for (const [nro, novoEstado] of correcoes) {
      const rowIdx = idxMap[nro];
      if (rowIdx !== undefined) {
        const sheetRow = rowIdx + 1; // Google Sheets é 1-based
        updates.push({ range: `D${sheetRow}`, values: [[novoEstado]] });
      }
    }

    // Aplicar atualizações de estado
    if (updates.length > 0) {
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: sid,
        requestBody: {
          valueInputOption: "RAW",
          data: updates.map(u => ({ range: u.range, values: u.values })),
        },
      });
    }

    res.json({
      ok: true,
      estadosAtualizados: correcoes.map(([n, e]) => ({ item: n, novoEstado: e })),
      nota: "Item #43 nao alterado (A FAZER e correto). Item #49 (Monitor de LLMs) foi renumerado para #53 pela Task42.",
    });
  } catch (e: any) {
    logger.error({ err: e }, "atualizar-estados: erro");
    res.status(500).json({ error: e.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/admin/planilha/adicionar-item
// Adiciona UMA linha ao final da planilha de produção (sem quebrar o existente).
// Body: { nro, item, resp, estado, prio, hash, descricao, notas }
// ---------------------------------------------------------------------------
router.post("/admin/planilha/adicionar-item", async (req: Request, res: Response): Promise<void> => {
  try {
    // Campos aceitos:
    //   A  nro         — número do item
    //   B  item        — descrição curta
    //   C  resp        — agente responsável (ex: "Dr. Replit")
    //   D  estado      — A FAZER | AGUARDANDO | CONCLUIDO
    //   E  prio        — P1 alto | P2 medio | P3 baixo
    //   F  hash        — sessão de referência (ex: "53")
    //   G  descricao   — descrição longa
    //   H  notas       — notas de entrega
    //   I  solicitacao — o que uma LLM pediu à outra (handoff inter-agente)
    const { nro, item, resp, estado, prio, hash, descricao, notas, solicitacao } =
      req.body as Record<string, string>;

    const sheets = await getGoogleSheetsClient();
    await sheets.spreadsheets.values.append({
      spreadsheetId: PLANILHA_OFICIAL,
      range:         "A:I",
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: {
        values: [[
          String(nro         ?? ""),
          String(item        ?? ""),
          String(resp        ?? ""),
          String(estado      ?? ""),
          String(prio        ?? ""),
          String(hash        ?? "—"),
          String(descricao   ?? ""),
          String(notas       ?? ""),
          String(solicitacao ?? ""),   // coluna I — handoff inter-LLM
        ]],
      },
    });
    res.json({ ok: true, nro, item });
  } catch (e: any) {
    logger.error({ err: e }, "admin-planilha/adicionar-item: erro");
    res.status(500).json({ error: e.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/admin/planilha/preparar-abas
// 1. Renomeia a aba "Untitled" para "PLANILHA PRODUCAO"
// 2. Cria a aba "DICIONARIO" com 6 colunas + dados dos 85 termos
// Idempotente: se as abas já existem com os nomes corretos, não faz nada.
// ---------------------------------------------------------------------------
router.post("/admin/planilha/preparar-abas", async (_req: Request, res: Response): Promise<void> => {
  try {
    const sheets = await getGoogleSheetsClient();
    const sid = PLANILHA_OFICIAL;

    // ── 1. Obter metadados das abas ───────────────────────────────────────
    const meta = await sheets.spreadsheets.get({ spreadsheetId: sid, includeGridData: false });
    const abas = (meta.data.sheets ?? []).map(s => ({
      sheetId: s.properties?.sheetId!,
      title:   s.properties?.title ?? "",
    }));

    const requests: any[] = [];
    const log: string[] = [];

    // ── 2. Renomear aba principal para "PLANILHA PRODUCAO" ────────────────
    const nomePrincipal = "PLANILHA PRODUCAO";
    const abaPrincipal  = abas.find(a =>
      a.title === "Untitled" ||
      a.title === "Sheet1"   ||
      a.title === "Página1"  ||
      (!a.title.startsWith("PLANILHA") && !a.title.startsWith("DICIONARIO") && a.sheetId === abas[0].sheetId)
    );
    const jaRenomeada = abas.some(a => a.title === nomePrincipal);

    if (!jaRenomeada && abaPrincipal) {
      requests.push({
        updateSheetProperties: {
          properties: { sheetId: abaPrincipal.sheetId, title: nomePrincipal },
          fields: "title",
        },
      });
      log.push(`Aba "${abaPrincipal.title}" → "${nomePrincipal}"`);
    } else {
      log.push(`Aba "${nomePrincipal}" já existe ou nenhuma aba-alvo encontrada.`);
    }

    // ── 3. Criar aba DICIONARIO (se não existir) ──────────────────────────
    const nomeDic = "DICIONARIO";
    const dicExiste = abas.some(a => a.title === nomeDic);
    let novaDicSheetId: number | null = null;

    if (!dicExiste) {
      requests.push({
        addSheet: {
          properties: {
            title:          nomeDic,
            gridProperties: { frozenRowCount: 1 },
          },
        },
      });
      log.push(`Aba "${nomeDic}" criada.`);
    } else {
      log.push(`Aba "${nomeDic}" já existe.`);
    }

    // ── 4. Aplicar as mudanças estruturais ────────────────────────────────
    if (requests.length > 0) {
      const resp = await sheets.spreadsheets.batchUpdate({
        spreadsheetId: sid,
        requestBody: { requests },
      });

      // Capturar o sheetId da nova aba DICIONARIO (se foi criada agora)
      if (!dicExiste) {
        const addedReply = (resp.data.replies ?? []).find((r: any) => r.addSheet);
        novaDicSheetId = addedReply?.addSheet?.properties?.sheetId ?? null;
      }
    }

    // ── 5. Obter sheetId do DICIONARIO (criado agora ou pré-existente) ────
    if (novaDicSheetId === null) {
      const metaAtual = await sheets.spreadsheets.get({ spreadsheetId: sid, includeGridData: false });
      const dicAba = (metaAtual.data.sheets ?? []).find(s => s.properties?.title === nomeDic);
      novaDicSheetId = dicAba?.properties?.sheetId ?? null;
    }

    // ── 6. Popular o DICIONARIO com os dados do GLOSSARIO ────────────────
    // Colunas: Nº | Termo | Explicação | Analogia para Leigo | Onde usar no Projeto | Função usualmente Requisitada
    const GLOSSARIO_INLINE: Array<[number, string, string]> = [
      [1,"AI Gateway","E a caixa de energia na frente da casa: nada consome sem passar pelo medidor."],
      [2,"Anthropic","E um dos laboratorios de onde vem a inteligencia que o sistema usa."],
      [3,"API","E o balcao de atendimento de um laboratorio. Voce nao entra no laboratorio: chega no balcao, entrega o pedido, recebe o resultado. A API e o balcao, e cada guiche e uma rota."],
      [4,"append-only","E o prontuario do paciente. Voce nao apaga a evolucao de ontem: escreve a de hoje embaixo. Se errou ontem, escreve hoje que errou. O erro fica registrado, e e isso que da valor legal."],
      [5,"backup","E o seguro do carro. Custa todo mes e parece dinheiro jogado fora, ate o dia da batida."],
      [6,"banco de dados","E o arquivo de fichas da clinica, mas que responde em um centesimo de segundo e nunca perde uma ficha por descuido."],
      [7,"branch","E a via de um exame: voce faz o rascunho da conduta numa folha separada antes de escrever no prontuario oficial. Se der errado, joga a folha fora e o prontuario continua intacto."],
      [8,"CI/CD","E a conferencia dupla da enfermagem antes de aplicar a medicacao. Ninguem confia so na memoria de quem preparou."],
      [9,"circuit breaker","E o disjuntor do quadro: corta antes de queimar."],
      [10,"clone","E uma franquia: mesma placa, dono diferente, cozinha propria."],
      [11,"CNAME","E o encaminhamento de telefone: quem liga para o numero antigo cai automaticamente no novo, sem saber que foi encaminhado."],
      [12,"commit","E uma entrada assinada no prontuario: quem escreveu, quando, e o que mudou. Nao se apaga."],
      [13,"conector","E a tomada: voce nao refaz a fiacao da rua, so pluga."],
      [14,"CORS","E a lista da portaria do predio: so sobe quem esta na lista. Sem a lista certa, ate o morador fica na calcada."],
      [15,"cron","E o despertador do sistema: voce marca a hora, ele toca sem ninguem lembrar."],
      [16,"deploy","E a diferenca entre escrever a receita no bloco e entregar na mao do paciente. Enquanto nao entregou, nao existe para ele."],
      [17,"DKIM","E o carimbo e a assinatura no receituario. Sem eles, a farmacia trata como falsificacao."],
      [18,"DNS","E a lista telefonica: voce sabe o nome da pessoa, e ela devolve o numero. Ninguem decora o numero."],
      [19,"dry-run","E o ensaio da cirurgia: todo mundo faz os gestos, ninguem corta."],
      [20,"empresa_id","E o numero do prontuario: e o que diz de quem e aquela ficha."],
      [21,"endpoint","E o guiche especifico dentro do balcao: um guiche para entregar exame, outro para retirar resultado."],
      [22,"FK","E o numero do prontuario escrito no pedido de exame: e o que amarra aquele exame aquele paciente e nao a outro."],
      [23,"Gemini","Outro laboratorio, melhor em enxergar imagem e PDF."],
      [24,"hash","E a impressao digital de um documento. Duas pessoas nao tem a mesma, e a sua nao muda sozinha. Se o documento foi adulterado, a impressao digital nao bate mais."],
      [25,"idempotente","E apertar o botao do elevador. Apertar dez vezes nao chama dez elevadores: o andar continua marcado uma vez so."],
      [26,"indice unico","E o CPF: o cartorio nao deixa dois cadastros com o mesmo numero. A regra vive no cartorio, nao na boa vontade de quem preenche."],
      [27,"ledger","E o livro-caixa: cada linha e uma coisa que aconteceu e vale dinheiro."],
      [28,"login_username","E o seu nome na portaria: a senha prova que e voce, o usuario diz quem voce diz ser."],
      [29,"main","E o prontuario oficial, nao o rascunho. O que nao esta nele, oficialmente nao aconteceu."],
      [30,"merge","E juntar as anotacoes de dois medicos sobre o mesmo paciente num prontuario unico."],
      [31,"middleware","E o porteiro do predio: toda visita passa por ele antes de chegar no apartamento, e ele decide quem sobe."],
      [32,"migration","E a reforma da clinica com planta aprovada e registrada, em vez de derrubar parede no impulso."],
      [33,"mock","E o manequim de treinamento. Serve para ensaiar, e e perigoso se alguem esquecer e tratar como paciente."],
      [34,"multi-tenant","E um predio de consultorios: mesma estrutura, mesmo elevador, mas cada sala tem chave propria e ninguem entra na do outro."],
      [35,"OpenAI","Um terceiro laboratorio, forte em transcrever audio."],
      [36,"PR","E o pedido de parecer antes da cirurgia. Alguem olha, comenta, e so depois entra."],
      [37,"PWA","E um aparelho que serve de dois jeitos: no consultorio parece bancada, na mao vira portatil. Mesmo aparelho."],
      [38,"RBAC","E a diferenca entre medico, enfermeiro e recepcao no sistema da clinica: cada um ve a tela do seu papel."],
      [39,"repositorio","E o arquivo morto da clinica, mas em que nada se perde e da para voltar a qualquer dia do passado."],
      [40,"RLS","E a tranca da porta da sala, nao o aviso por favor nao entre. O aviso depende da boa vontade; a tranca nao."],
      [41,"scrypt","E guardar a impressao digital do paciente em vez do dedo dele. Da para conferir se bate, mas ninguem reconstroi o dedo a partir dela."],
      [42,"SPF","E a lista de quem pode assinar receita em nome da clinica. Sem ela, qualquer um assina."],
      [43,"SSE","E o monitor de sinais vitais: ele avisa quando muda, voce nao fica olhando de minuto em minuto."],
      [44,"token","E a pulseira do hospital. Voce se identifica uma vez na recepcao e depois so mostra a pulseira em cada setor."],
      [45,"UPSERT","E abrir ficha se o paciente e novo, ou atualizar a que ja existe se ele ja veio antes. Uma decisao so, automatica."],
      [46,"webhook","E o laboratorio que liga para voce quando o resultado critico sai, em vez de voce ligar de hora em hora perguntando."],
      [47,"worker","E o funcionario dos fundos: nao atende no balcao, faz o servico que leva tempo."],
      [48,"JWT","E a pulseira com QR-code da festa VIP: voce mostra na entrada e entra em qualquer area permitida sem fila."],
      [49,"tenant","E um apartamento no predio: mesma estrutura fisica, porta separada, mobilia propria, vizinho nao acessa."],
      [50,"cron job","E o funcionario que toda sexta as 18h fecha o caixa automaticamente — nao precisa ninguem mandar."],
      [51,"schema","E a planta baixa da clinica: define onde fica cada sala, quantas portas tem, o que cabe em cada comodo."],
      [52,"buffer","E a sala de espera antes do consultorio: o paciente chega, espera, e e chamado na ordem."],
      [53,"pipeline","E a linha de montagem da farmacia de manipulacao: pesa, mistura, encapsula, rotula — em ordem fixa."],
      [54,"royalty","E a comissao do medico que assina o protocolo: toda vez que a clinica licenciada aplica, ele recebe."],
      [55,"UUID","E o CPF do registro: nunca se repete, nao depende de nenhum contador central."],
      [56,"seed","E o estoque inicial de uma farmacia recem-aberta: sem ele, o sistema existe mas nao tem nada para vender."],
      [57,"mimeType","E a etiqueta do frasco de medicamento: diz se e comprimido, liquido ou pomada antes de abrir."],
      [58,"proxy","E o corretor de imoveis: voce fala com ele, ele fala com o proprietario — ninguem se fala diretamente."],
      [59,"OAuth","E dar a chave do carro ao manobrista: ele move o carro, mas nao tem acesso a sua casa nem ao cofre."],
      [60,"env var","E o cofre da clinica: a senha fica la, nao escrita no protocolo publico."],
      [61,"pull","E sincronizar a agenda do Google: voce puxa as consultas novas que outra pessoa adicionou."],
      [62,"repo","E o prontuario completo do sistema: cada mudanca esta la, assinada, datada e reversivel."],
      [63,"fail-safe","E o gerador de emergencia da UTI: se a rede cair, o monitor de sinais vitais continua ligado."],
      [64,"spec","E a prescricao antes da manipulacao: o medico escreve o que quer antes de a farmacia produzir."],
      [65,"tenant context","E o cracha do plantonista: diz em qual hospital ele esta naquele turno, quais salas pode acessar."],
      [66,"ai_usage_log","E o livro-caixa de exames terceirizados: cada pedido ao laboratorio externo fica registrado com o custo."],
      [67,"logAiUsage","E o carimbo automatico da balanca: todo peso registrado ganha carimbo de data e hora sem ninguem pedir."],
      [68,"requireCeoInstance","E a catraca do andar executivo: nao adianta ter cracha de funcionario, precisa do cracha de diretor."],
      [69,"PADAXOR_AI_BYPASS","E o cracha master do dono do predio: abre qualquer porta, inclusive as que o gerente nao alcanca."],
      [70,"tenantContext","E a pasta do plantonista: ao entrar no turno, ele recebe a pasta da clinica — dados daquele dia, daquele lugar."],
      [71,"Slack","E o WhatsApp do trabalho: cada assunto tem seu grupo, mas a empresa controla o que fica gravado."],
      [72,"Drive","E o arquivo fisico da clinica, mas na nuvem: qualquer medico autorizado acessa de qualquer lugar."],
      [73,"Sheets","E a ficha de controle do estoque que todos veem ao mesmo tempo, sem precisar mandar e-mail com anexo."],
      [74,"Cloudflare","E a portaria do predio com camera, identificacao e lista de visitantes: nenhum pacote entra sem ser conferido."],
      [75,"Railway","E o data center terceirizado: voce coloca o servidor la, eles garantem a luz, o ar-condicionado e o acesso."],
      [76,"Replit","E o consultorio de desenvolvimento: onde o medico estuda o caso antes de escrever a prescricao final."],
      [77,"token (IA)","E como a IA cobra por palavra: nao exatamente por palavra, mas e a unidade de conta — ~0,75 palavra em portugues."],
      [78,"input_tokens","E o numero de paginas do prontuario que voce entregou para o consultor ler antes de dar o parecer."],
      [79,"output_tokens","E o numero de paginas do laudo que o consultor escreveu depois de ler o prontuario."],
      [80,"P0","E o paciente que chega em PCR: vai direto para a ressuscitacao, fila nao existe."],
      [81,"P1","E o paciente com dor intensa: nao esta em risco imediato de vida, mas nao pode esperar."],
      [82,"P2","E o exame de rotina com resultado alterado: importante resolver, mas nao hoje de manha."],
      [83,"P3","E a pintura da sala de espera: fica melhor, mas o consultorio funciona sem ela."],
      [84,"cron horario","E o residente que bate na porta a cada hora para checar o pos-operatorio — pontual, sem precisar de chamado."],
      [85,"planilha de producao","E o quadro de cirurgias do centro cirurgico: todo mundo ve o que esta agendado, em andamento e concluido."],
    ];

    // Cabeçalhos e dados do DICIONARIO
    const headerDic = [
      "Nº",
      "Termo",
      "Explicação (a preencher)",
      "Analogia para Leigo",
      "Onde usar no Projeto (a preencher)",
      "Função usualmente Requisitada (a preencher)",
    ];

    const linhasDic: string[][] = [
      headerDic,
      ...GLOSSARIO_INLINE.map(([num, termo, analogia]) => [
        String(num),
        termo,
        "",         // Explicação — a preencher
        analogia,   // Analogia para Leigo — já temos
        "",         // Onde usar no projeto — a preencher
        "",         // Função usual — a preencher
      ]),
    ];

    await sheets.spreadsheets.values.update({
      spreadsheetId: sid,
      range:         `${nomeDic}!A1`,
      valueInputOption: "RAW",
      requestBody: { values: linhasDic },
    });
    log.push(`${nomeDic}: ${GLOSSARIO_INLINE.length} termos gravados.`);

    // ── 7. Formatar cabeçalho do DICIONARIO ──────────────────────────────
    if (novaDicSheetId !== null) {
      const rgb = (r: number, g: number, b: number) => ({ red: r, green: g, blue: b });
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: sid,
        requestBody: {
          requests: [
            // Cabeçalho navy + texto branco
            {
              repeatCell: {
                range: { sheetId: novaDicSheetId, startRowIndex: 0, endRowIndex: 1 },
                cell: {
                  userEnteredFormat: {
                    backgroundColor: rgb(0.133, 0.141, 0.173),
                    textFormat: { bold: true, foregroundColor: rgb(1, 1, 1), fontSize: 10 },
                    horizontalAlignment: "CENTER",
                    verticalAlignment: "MIDDLE",
                    wrapStrategy: "WRAP",
                  },
                },
                fields: "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment,wrapStrategy)",
              },
            },
            // Linhas de dados: fundo levemente esverdeado alternado (linha par=branco, ímpar=pastel)
            {
              repeatCell: {
                range: { sheetId: novaDicSheetId, startRowIndex: 1, endRowIndex: GLOSSARIO_INLINE.length + 1 },
                cell: {
                  userEnteredFormat: {
                    wrapStrategy: "WRAP",
                    verticalAlignment: "TOP",
                    textFormat: { fontSize: 9 },
                  },
                },
                fields: "userEnteredFormat(wrapStrategy,verticalAlignment,textFormat)",
              },
            },
            // Larguras das colunas: Nº | Termo | Explicação | Analogia | Onde usar | Função
            ...([60, 160, 220, 300, 220, 220] as number[]).map((px, i) => ({
              updateDimensionProperties: {
                range: { sheetId: novaDicSheetId!, dimension: "COLUMNS", startIndex: i, endIndex: i + 1 },
                properties: { pixelSize: px },
                fields: "pixelSize",
              },
            })),
            // Congelar 1ª linha
            {
              updateSheetProperties: {
                properties: { sheetId: novaDicSheetId, gridProperties: { frozenRowCount: 1 } },
                fields: "gridProperties.frozenRowCount",
              },
            },
          ],
        },
      });
      log.push("Formatação do DICIONARIO aplicada.");
    }

    res.json({
      ok:     true,
      log,
      planilha: `https://docs.google.com/spreadsheets/d/${PLANILHA_OFICIAL}`,
    });
  } catch (e: any) {
    logger.error({ err: e }, "preparar-abas: erro");
    res.status(500).json({ error: e.message });
  }
});

export default router;
