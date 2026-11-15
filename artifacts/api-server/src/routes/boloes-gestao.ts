import { Router, type IRouter, type Request, type Response } from "express";
import { sql } from "drizzle-orm";
import { z } from "zod/v4";
import { db } from "@workspace/db";
import { isGestorDaEmpresa } from "../lib/clinical-access";
import { ObjectStorageService } from "../lib/objectStorage";
import { requireCollaborator } from "./collaborator";
import { uploadMw } from "./boloes";
import { auditarBolao, detectarTipoComprovante, sha256Hex } from "../lib/boloes";
import { lerComprovanteIA } from "../lib/boloes-leitura";
import {
  aplicarRegras, classificarComprovante, convidarParaBolao, convidarParaGrupo, definirJogos, extrasDasParticipacoes,
  listarConvitesBolao, listarMembros, mudarStatusCampanha, vincularCobranca, type ResultadoConvite,
} from "../lib/grupo-vip";
import {
  aprovarRecebimento, criarCampanha, criarParticipacao, definirPagamento, gravarConfig, ingerirArquivo,
  lerConfig, listarAuditoria, listarCampanhas, listarParticipacoesGestor, listarRecebimentos, processarRecebimento,
  reassociarComprovante, recebimentoParaVer, reprocessarRecebimento, rejeitarRecebimento, resumoGestor, revogarComprovante,
  anexarComprovante, type Ator,
} from "../lib/boloes-gestao";

/**
 * Central de Boloes (gestor da clinica). Toda rota deriva a clinica do contexto autenticado do servidor
 * (nunca do corpo ou da URL) e exige gestor da clinica ou titular da plataforma.
 * Nada aqui cobra, compra, aposta, convida ou gera comprovante: so recebe, confere e associa arquivos reais.
 */
const router: IRouter = Router();
const storage = new ObjectStorageService();

interface Gestor { empresaId: number; ator: Ator }

async function gestor(req: Request, res: Response): Promise<Gestor | null> {
  const t = req.tenantContext;
  const actor = Number(req.collaborator?.professionalId);
  if (!t?.authenticated || !Number.isSafeInteger(actor) || actor <= 0 || t.professionalId !== actor) {
    res.status(401).json({ error: "Faça login de colaborador." });
    return null;
  }
  if (!(await isGestorDaEmpresa(actor, t.empresaId))) {
    res.status(403).json({ error: "Acesso restrito ao gestor da clínica." });
    return null;
  }
  return { empresaId: t.empresaId, ator: { texto: `gestor:${actor}`, profissionalId: actor } };
}

const idParam = (v: unknown): number | null => (/^[1-9]\d{0,9}$/.test(String(v ?? "")) ? Number(String(v)) : null);
const ruim = (res: Response, msg: string) => void res.status(400).json({ error: msg });
const naoAchou = (res: Response, msg = "Item não encontrado.") => void res.status(404).json({ error: msg });

function falha(req: Request, res: Response, err: unknown, msg: string): void {
  req.log.error({ err: String(err) }, msg);
  if (!res.headersSent) res.status(500).json({ error: msg });
}

const G = "/boloes/gestao";

// ---------------------------------------------------------------- painel
router.get(`${G}/resumo`, requireCollaborator, async (req, res): Promise<void> => {
  const g = await gestor(req, res);
  if (!g) return;
  try {
    const [resumo, config] = await Promise.all([resumoGestor(g.empresaId), lerConfig(g.empresaId)]);
    res.set("Cache-Control", "private, no-store");
    res.json({ ...resumo, config });
  } catch (err) { falha(req, res, err, "Não foi possível carregar o resumo."); }
});

router.get(`${G}/recebimentos`, requireCollaborator, async (req, res): Promise<void> => {
  const g = await gestor(req, res);
  if (!g) return;
  const validos = new Set(["recebido", "lendo", "em_revisao", "aprovado", "rejeitado", "duplicado"]);
  const status = typeof req.query.status === "string" ? req.query.status.split(",").filter((s) => validos.has(s)) : null;
  try {
    res.set("Cache-Control", "private, no-store");
    res.json({ recebimentos: await listarRecebimentos(g.empresaId, status) });
  } catch (err) { falha(req, res, err, "Não foi possível carregar a fila."); }
});

router.get(`${G}/participacoes`, requireCollaborator, async (req, res): Promise<void> => {
  const g = await gestor(req, res);
  if (!g) return;
  try {
    res.set("Cache-Control", "private, no-store");
    const base = await listarParticipacoesGestor(g.empresaId);
    const extras = await extrasDasParticipacoes(g.empresaId, null, base.map((b) => b.id));
    res.json({ participacoes: base.map((b) => ({ ...b, ...(extras.get(b.id) ?? {}) })), campanhas: await listarCampanhas(g.empresaId) });
  } catch (err) { falha(req, res, err, "Não foi possível carregar as participações."); }
});

router.get(`${G}/auditoria`, requireCollaborator, async (req, res): Promise<void> => {
  const g = await gestor(req, res);
  if (!g) return;
  try {
    res.set("Cache-Control", "private, no-store");
    res.json({ eventos: await listarAuditoria(g.empresaId) });
  } catch (err) { falha(req, res, err, "Não foi possível carregar o histórico."); }
});

// ---------------------------------------------------------------- ver arquivos (sempre autenticado, nunca em URL aberta)
function enviarArquivo(res: Response, bytes: Buffer, mime: string, nome: string): void {
  res.set({
    "Content-Type": mime, "Content-Length": String(bytes.length),
    "Content-Disposition": `attachment; filename="${nome}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
  });
  res.status(200).end(bytes);
}

router.get(`${G}/recebimentos/:id/arquivo`, requireCollaborator, async (req, res): Promise<void> => {
  const g = await gestor(req, res);
  if (!g) return;
  const id = idParam(req.params.id);
  try {
    const rec = id ? await recebimentoParaVer(g.empresaId, id) : null;
    if (!rec) return naoAchou(res, "Arquivo não encontrado.");
    const bytes = await storage.readPrivateObject(rec.storageKey);
    if (bytes.length !== rec.bytes || sha256Hex(bytes) !== rec.sha256) {
      await auditarBolao({ empresaId: g.empresaId, ator: g.ator.texto, acao: "ver_quarentena", resultado: "erro", detalhe: `recebimento ${rec.id}: integridade divergente` });
      res.status(409).json({ error: "O arquivo não passou na conferência de integridade." });
      return;
    }
    await auditarBolao({ empresaId: g.empresaId, ator: g.ator.texto, acao: "ver_quarentena", resultado: "ok", detalhe: `recebimento ${rec.id}` });
    enviarArquivo(res, bytes, rec.mime, `recebimento-${rec.id}`);
  } catch (err) { falha(req, res, err, "Não foi possível abrir o arquivo."); }
});

router.get(`${G}/comprovantes/:id/arquivo`, requireCollaborator, async (req, res): Promise<void> => {
  const g = await gestor(req, res);
  if (!g) return;
  const id = idParam(req.params.id);
  try {
    const co: any = id ? (await db.execute(sql`
      SELECT id, participacao_id, storage_key, mime, bytes, sha256 FROM boloes_comprovantes
       WHERE id = ${id} AND empresa_id = ${g.empresaId} AND revogado_em IS NULL`)).rows[0] : null;
    if (!co) return naoAchou(res, "Comprovante não encontrado.");
    const bytes = await storage.readPrivateObject(co.storage_key);
    if (bytes.length !== co.bytes || sha256Hex(bytes) !== co.sha256) {
      await auditarBolao({ empresaId: g.empresaId, ator: g.ator.texto, acao: "ver_comprovante", participacaoId: co.participacao_id, comprovanteId: co.id, resultado: "erro", detalhe: "integridade divergente" });
      res.status(409).json({ error: "O arquivo não passou na conferência de integridade." });
      return;
    }
    await auditarBolao({ empresaId: g.empresaId, ator: g.ator.texto, acao: "ver_comprovante", participacaoId: co.participacao_id, comprovanteId: co.id, resultado: "ok" });
    enviarArquivo(res, bytes, co.mime, `comprovante-${co.id}`);
  } catch (err) { falha(req, res, err, "Não foi possível abrir o comprovante."); }
});

// ---------------------------------------------------------------- receber (manual) e ler
router.post(`${G}/recebimentos`, requireCollaborator, uploadMw, async (req, res): Promise<void> => {
  const g = await gestor(req, res);
  if (!g) return;
  const file = req.file;
  if (!file || file.size === 0) return ruim(res, "Envie o arquivo do recibo (não pode estar vazio).");
  try {
    const r = await ingerirArquivo(storage, {
      empresaId: g.empresaId, origem: "manual", buffer: file.buffer, nomeOriginal: file.originalname,
      criadoPor: g.ator.profissionalId, ator: g.ator,
    });
    if (!r.ok) {
      res.status(r.motivo === "tipo_invalido" ? 422 : 400).json({
        error: r.motivo === "tipo_invalido" ? "Tipo de arquivo não aceito. Envie PDF, PNG ou JPEG." : r.motivo === "grande" ? "Arquivo maior que 10 MB." : "O arquivo está vazio.",
      });
      return;
    }
    if (r.status === "duplicado") {
      res.status(409).json({ error: "Este arquivo já foi recebido antes. Nada foi duplicado.", duplicadoDe: r.duplicadoDe ?? null });
      return;
    }
    const proc = r.id ? await processarRecebimento(storage, r.id, lerComprovanteIA) : null;
    res.status(201).json({ id: r.id, resultado: proc });
  } catch (err) { falha(req, res, err, "Não foi possível receber o arquivo."); }
});

router.post(`${G}/recebimentos/:id/reprocessar`, requireCollaborator, async (req, res): Promise<void> => {
  const g = await gestor(req, res);
  if (!g) return;
  const id = idParam(req.params.id);
  if (!id) return naoAchou(res);
  try {
    if (!(await reprocessarRecebimento({ empresaId: g.empresaId, recebimentoId: id, ator: g.ator }))) {
      res.status(409).json({ error: "Este item não pode ser relido agora." });
      return;
    }
    res.json({ resultado: await processarRecebimento(storage, id, lerComprovanteIA) });
  } catch (err) { falha(req, res, err, "Não foi possível reler o arquivo."); }
});

const Aprovar = z.object({ participacaoId: z.number().int().positive(), confirmoReciboCaixaReal: z.literal(true) }).strict();
const MSG_ANEXO: Record<string, [number, string]> = {
  participacao_inexistente: [404, "Participação não encontrada."],
  cancelada: [409, "Participação cancelada não recebe comprovante."],
  ja_tem_comprovante: [409, "Esta participação já tem comprovante ativo. Revogue o anterior ou escolha outra."],
  arquivo_duplicado: [409, "Este mesmo arquivo já é comprovante de outra participação."],
  recebimento_indisponivel: [409, "Este item já foi decidido por outra pessoa."],
  recebimento_inexistente: [404, "Item não encontrado."],
};

router.post(`${G}/recebimentos/:id/aprovar`, requireCollaborator, async (req, res): Promise<void> => {
  const g = await gestor(req, res);
  if (!g) return;
  const id = idParam(req.params.id);
  const b = Aprovar.safeParse(req.body);
  if (!id) return naoAchou(res);
  if (!b.success) return ruim(res, "Escolha a participação e confirme que o arquivo é o recibo real, recebido por canal autorizado.");
  try {
    const r = await aprovarRecebimento(storage, { empresaId: g.empresaId, recebimentoId: id, participacaoId: b.data.participacaoId, ator: g.ator });
    if (r.ok) { res.status(201).json({ comprovanteId: r.comprovanteId }); return; }
    const [status, error] = MSG_ANEXO[r.motivo] ?? [409, "Não foi possível aprovar."];
    res.status(status).json({ error });
  } catch (err) { falha(req, res, err, "Não foi possível aprovar o comprovante."); }
});

const Motivo = z.object({ motivo: z.string().trim().min(3).max(300) }).strict();

router.post(`${G}/recebimentos/:id/rejeitar`, requireCollaborator, async (req, res): Promise<void> => {
  const g = await gestor(req, res);
  if (!g) return;
  const id = idParam(req.params.id);
  const b = Motivo.safeParse(req.body);
  if (!id) return naoAchou(res);
  if (!b.success) return ruim(res, "Informe o motivo da recusa (3 a 300 caracteres).");
  try {
    if (!(await rejeitarRecebimento({ empresaId: g.empresaId, recebimentoId: id, motivo: b.data.motivo, ator: g.ator }))) {
      res.status(409).json({ error: "Este item já foi decidido ou não existe." });
      return;
    }
    res.json({ ok: true });
  } catch (err) { falha(req, res, err, "Não foi possível recusar o arquivo."); }
});

// ---------------------------------------------------------------- inserir direto na participacao e corrigir
router.post(`${G}/participacoes/:id/comprovante`, requireCollaborator, uploadMw, async (req, res): Promise<void> => {
  const g = await gestor(req, res);
  if (!g) return;
  const id = idParam(req.params.id);
  const file = req.file;
  if (!id) return naoAchou(res, "Participação não encontrada.");
  if (req.body?.confirmoReciboCaixaReal !== "true") return ruim(res, "Confirme que o arquivo é o recibo real, recebido por canal autorizado.");
  if (!file || file.size === 0) return ruim(res, "Envie o arquivo do recibo (não pode estar vazio).");
  const tipo = detectarTipoComprovante(file.buffer);
  if (!tipo) { res.status(422).json({ error: "Tipo de arquivo não aceito. Envie PDF, PNG ou JPEG." }); return; }
  try {
    const r = await anexarComprovante(storage, { empresaId: g.empresaId, participacaoId: id, origem: { buffer: file.buffer, tipo }, ator: g.ator });
    if (r.ok) { res.status(201).json({ id: r.comprovanteId }); return; }
    const [status, error] = MSG_ANEXO[r.motivo] ?? [409, "Não foi possível anexar."];
    res.status(status).json({ error });
  } catch (err) { falha(req, res, err, "Não foi possível anexar o comprovante."); }
});

const Reassociar = z.object({ destinoId: z.number().int().positive(), motivo: z.string().trim().min(3).max(300) }).strict();
const MSG_CORRECAO: Record<string, [number, string]> = {
  inexistente: [404, "Comprovante não encontrado."],
  destino_invalido: [404, "Participação de destino não encontrada ou cancelada."],
  destino_ocupado: [409, "A participação de destino já tem comprovante ativo."],
  mesmo_destino: [409, "O destino é a própria participação atual."],
};

router.post(`${G}/comprovantes/:id/reassociar`, requireCollaborator, async (req, res): Promise<void> => {
  const g = await gestor(req, res);
  if (!g) return;
  const id = idParam(req.params.id);
  const b = Reassociar.safeParse(req.body);
  if (!id) return naoAchou(res);
  if (!b.success) return ruim(res, "Informe a participação correta e o motivo da correção.");
  try {
    const r = await reassociarComprovante({ empresaId: g.empresaId, comprovanteId: id, destinoId: b.data.destinoId, motivo: b.data.motivo, ator: g.ator });
    if (r.ok) { res.json({ ok: true }); return; }
    const [status, error] = MSG_CORRECAO[r.motivo];
    res.status(status).json({ error });
  } catch (err) { falha(req, res, err, "Não foi possível corrigir a associação."); }
});

router.post(`${G}/comprovantes/:id/revogar`, requireCollaborator, async (req, res): Promise<void> => {
  const g = await gestor(req, res);
  if (!g) return;
  const id = idParam(req.params.id);
  const b = Motivo.safeParse(req.body);
  if (!id) return naoAchou(res);
  if (!b.success) return ruim(res, "Informe o motivo da revogação (3 a 300 caracteres).");
  try {
    const r = await revogarComprovante({ empresaId: g.empresaId, comprovanteId: id, motivo: b.data.motivo, ator: g.ator });
    if (r.ok) { res.json({ ok: true }); return; }
    const [status, error] = MSG_CORRECAO[r.motivo];
    res.status(status).json({ error });
  } catch (err) { falha(req, res, err, "Não foi possível revogar o comprovante."); }
});

// ---------------------------------------------------------------- pagamento (informativo), cadastro e configuracao
const Pagamento = z.object({ status: z.enum(["nao_informado", "pendente", "confirmado"]) }).strict();
router.post(`${G}/participacoes/:id/pagamento`, requireCollaborator, async (req, res): Promise<void> => {
  const g = await gestor(req, res);
  if (!g) return;
  const id = idParam(req.params.id);
  const b = Pagamento.safeParse(req.body);
  if (!id) return naoAchou(res, "Participação não encontrada.");
  if (!b.success) return ruim(res, "Estado de pagamento inválido.");
  try {
    if (!(await definirPagamento({ empresaId: g.empresaId, participacaoId: id, status: b.data.status, ator: g.ator }))) return naoAchou(res, "Participação não encontrada.");
    res.json({ ok: true });
  } catch (err) { falha(req, res, err, "Não foi possível informar o pagamento."); }
});

const Campanha = z.object({
  nome: z.string().trim().min(1).max(120),
  concurso: z.string().trim().max(60).optional(),
  dataSorteio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  // Regras do bolao (opcionais; a campanha nasce como rascunho e so abre por decisao explicita).
  valorCotaCentavos: z.number().int().min(0).max(100_000_000).optional(),
  cotasTotal: z.number().int().min(1).max(100_000).optional(),
  escolhaJogos: z.enum(["clinica", "participante"]).optional(),
  modalidade: z.string().trim().min(1).max(60).optional(),
  dezenasPorJogo: z.number().int().min(1).max(30).optional(),
  universoMax: z.number().int().min(2).max(100).optional(),
  jogosPorCota: z.number().int().min(1).max(20).optional(),
  regrasTexto: z.string().trim().min(1).max(2000).optional(),
}).strict().refine((v) => v.dezenasPorJogo === undefined || v.dezenasPorJogo <= (v.universoMax ?? 60), { message: "dezenas maiores que o universo" });
router.post(`${G}/campanhas`, requireCollaborator, async (req, res): Promise<void> => {
  const g = await gestor(req, res);
  if (!g) return;
  const b = Campanha.safeParse(req.body);
  if (!b.success) return ruim(res, "Informe o nome (até 120 caracteres) e, se houver, concurso, data AAAA-MM-DD e regras válidas (dezenas não podem passar do universo).");
  try {
    const { nome, concurso, dataSorteio, ...regras } = b.data;
    const id = await criarCampanha({ empresaId: g.empresaId, nome, concurso, dataSorteio, ator: g.ator });
    if (Object.keys(regras).length > 0) await aplicarRegras({ empresaId: g.empresaId, campanhaId: id, regras, ator: g.ator });
    res.status(201).json({ id });
  } catch (err) { falha(req, res, err, "Não foi possível criar a campanha."); }
});

const MudarStatus = z.object({ status: z.enum(["aberto", "encerrado"]) }).strict();
router.post(`${G}/campanhas/:id/status`, requireCollaborator, async (req, res): Promise<void> => {
  const g = await gestor(req, res);
  if (!g) return;
  const id = idParam(req.params.id);
  const b = MudarStatus.safeParse(req.body);
  if (!id) return naoAchou(res, "Bolão não encontrado.");
  if (!b.success) return ruim(res, "Estado inválido. Use aberto ou encerrado.");
  try {
    const r = await mudarStatusCampanha({ empresaId: g.empresaId, campanhaId: id, para: b.data.status, ator: g.ator });
    if (r.ok) { res.json({ ok: true }); return; }
    if (r.motivo === "inexistente") return naoAchou(res, "Bolão não encontrado.");
    if (r.motivo === "regras_incompletas") return ruim(res, "Defina as dezenas por jogo antes de abrir o bolão.");
    res.status(409).json({ error: "Esta mudança de estado não é permitida." });
  } catch (err) { falha(req, res, err, "Não foi possível mudar o estado do bolão."); }
});

// ---------------------------------------------------------------- Grupo VIP: convite, adesao voluntaria e acompanhamento
const MSG_CONVITE: Record<string, [number, string]> = {
  cliente_inexistente: [404, "Cliente não encontrado nesta clínica."],
  ja_convidado: [409, "Este cliente já foi convidado e ainda não respondeu."],
  ja_ativo: [409, "Este cliente já participa do Grupo VIP."],
  campanha_indisponivel: [404, "Bolão não encontrado ou não está aberto."],
  nao_membro: [409, "Só membros ativos do Grupo VIP podem ser convidados para um bolão."],
  ja_participa: [409, "Este cliente já participa deste bolão."],
};
const respostaConvite = (res: Response, r: ResultadoConvite): void => {
  if (r.ok) { res.status(201).json({ ok: true }); return; }
  const [status, error] = MSG_CONVITE[r.motivo] ?? [409, "Não foi possível convidar."];
  res.status(status).json({ error });
};

router.get(`${G}/grupo-vip`, requireCollaborator, async (req, res): Promise<void> => {
  const g = await gestor(req, res);
  if (!g) return;
  try {
    res.set("Cache-Control", "private, no-store");
    res.json({ membros: await listarMembros(g.empresaId), convitesBolao: await listarConvitesBolao(g.empresaId) });
  } catch (err) { falha(req, res, err, "Não foi possível carregar o Grupo VIP."); }
});

const ConviteGrupo = z.object({ clientId: z.number().int().positive() }).strict();
router.post(`${G}/grupo-vip/convites`, requireCollaborator, async (req, res): Promise<void> => {
  const g = await gestor(req, res);
  if (!g) return;
  const b = ConviteGrupo.safeParse(req.body);
  if (!b.success) return ruim(res, "Escolha o cliente.");
  try { respostaConvite(res, await convidarParaGrupo({ empresaId: g.empresaId, clientId: b.data.clientId, ator: g.ator })); }
  catch (err) { falha(req, res, err, "Não foi possível registrar o convite."); }
});

const ConviteBolao = z.object({ clientId: z.number().int().positive() }).strict();
router.post(`${G}/campanhas/:id/convites`, requireCollaborator, async (req, res): Promise<void> => {
  const g = await gestor(req, res);
  if (!g) return;
  const id = idParam(req.params.id);
  const b = ConviteBolao.safeParse(req.body);
  if (!id) return naoAchou(res, "Bolão não encontrado.");
  if (!b.success) return ruim(res, "Escolha o cliente.");
  try { respostaConvite(res, await convidarParaBolao({ empresaId: g.empresaId, campanhaId: id, clientId: b.data.clientId, ator: g.ator })); }
  catch (err) { falha(req, res, err, "Não foi possível registrar o convite."); }
});

const MSG_JOGOS: Record<string, [number, string]> = {
  inexistente: [404, "Participação não encontrada."],
  cancelada: [409, "Participação cancelada não recebe jogos."],
  bolao_fechado: [409, "O bolão não está aberto."],
  origem_nao_permitida: [409, "Neste bolão os jogos são escolhidos pelo participante, não pela clínica."],
  ja_efetivado: [409, "Já existe comprovante oficial; os jogos não podem mais ser alterados."],
  regras_ausentes: [409, "O bolão não tem as regras de dezenas definidas."],
  quantidade: [422, "A quantidade de jogos não confere com as cotas e a regra do bolão."],
  dezenas_invalidas: [422, "Dezenas inválidas: respeite a quantidade por jogo, o universo e não repita dezenas nem jogos."],
};
const Jogos = z.object({ jogos: z.array(z.array(z.number().int()).max(30)).max(400) }).strict();
router.put(`${G}/participacoes/:id/jogos`, requireCollaborator, async (req, res): Promise<void> => {
  const g = await gestor(req, res);
  if (!g) return;
  const id = idParam(req.params.id);
  const b = Jogos.safeParse(req.body);
  if (!id) return naoAchou(res, "Participação não encontrada.");
  if (!b.success) return ruim(res, "Envie a lista de jogos como listas de dezenas.");
  try {
    const r = await definirJogos({ participacaoId: id, origem: "clinica", empresaId: g.empresaId, clientId: null, jogos: b.data.jogos, ator: g.ator });
    if (r.ok) { res.json({ ok: true, jogos: r.jogos }); return; }
    const [status, error] = MSG_JOGOS[r.motivo] ?? [409, "Não foi possível salvar os jogos."];
    res.status(status).json({ error });
  } catch (err) { falha(req, res, err, "Não foi possível salvar os jogos."); }
});

const Cobranca = z.object({ chargeId: z.string().trim().min(3).max(60) }).strict();
router.post(`${G}/participacoes/:id/cobranca`, requireCollaborator, async (req, res): Promise<void> => {
  const g = await gestor(req, res);
  if (!g) return;
  const id = idParam(req.params.id);
  const b = Cobranca.safeParse(req.body);
  if (!id) return naoAchou(res, "Participação não encontrada.");
  if (!b.success) return ruim(res, "Informe o código da cobrança do Asaas.");
  try {
    const r = await vincularCobranca({ empresaId: g.empresaId, participacaoId: id, chargeId: b.data.chargeId, ator: g.ator });
    if (r.ok) { res.json({ ok: true }); return; }
    if (r.motivo === "participacao_inexistente") return naoAchou(res, "Participação não encontrada.");
    if (r.motivo === "id_invalido") return ruim(res, "Código de cobrança inválido.");
    if (r.motivo === "cobranca_em_uso") { res.status(409).json({ error: "Esta cobrança já está vinculada a outra participação." }); return; }
    if (r.motivo === "cobranca_de_outro_cliente") { res.status(409).json({ error: "Esta cobrança não pertence ao cliente desta participação. Nada foi vinculado." }); return; }
    res.status(404).json({ error: "Cobrança não encontrada no livro financeiro desta clínica. Nada foi vinculado e nenhuma cobrança foi criada." });
  } catch (err) { falha(req, res, err, "Não foi possível vincular a cobrança."); }
});

const Natureza = z.object({ natureza: z.enum(["nominativo", "cota_oficial_individual"]) }).strict();
router.post(`${G}/comprovantes/:id/natureza`, requireCollaborator, async (req, res): Promise<void> => {
  const g = await gestor(req, res);
  if (!g) return;
  const id = idParam(req.params.id);
  const b = Natureza.safeParse(req.body);
  if (!id) return naoAchou(res, "Comprovante não encontrado.");
  if (!b.success) return ruim(res, "Escolha: comprovante nominativo ou cota oficial individual.");
  try {
    if (!(await classificarComprovante({ empresaId: g.empresaId, comprovanteId: id, natureza: b.data.natureza, ator: g.ator }))) return naoAchou(res, "Comprovante não encontrado.");
    res.json({ ok: true });
  } catch (err) { falha(req, res, err, "Não foi possível classificar o comprovante."); }
});

// Automacao CAIXA: NAO existe. Resposta fixa e honesta, para a tela nunca sugerir o contrario.
router.get(`${G}/automacao`, requireCollaborator, async (req, res): Promise<void> => {
  const g = await gestor(req, res);
  if (!g) return;
  res.set("Cache-Control", "private, no-store");
  res.json({
    estado: "pendente",
    registraJogos: false,
    coletaComprovantes: false,
    motivo: "Não há acesso autorizado nem condições formais definidos para automatizar o registro de jogos ou a coleta de comprovantes na CAIXA. O comprovante oficial continua entrando por envio manual ou pela pasta do Drive da clínica.",
    ambiente: "Prova de conceito isolada em tools/lottery-engine-poc (somente em 127.0.0.1, sem a CAIXA, sem credenciais, sem banco).",
  });
});

const Participacao = z.object({
  campanhaId: z.number().int().positive(), clientId: z.number().int().positive(), cotas: z.number().int().min(1).max(1000),
}).strict();
router.post(`${G}/participacoes`, requireCollaborator, async (req, res): Promise<void> => {
  const g = await gestor(req, res);
  if (!g) return;
  const b = Participacao.safeParse(req.body);
  if (!b.success) return ruim(res, "Informe campanha, cliente e cotas (1 a 1000).");
  try {
    const r = await criarParticipacao({ empresaId: g.empresaId, ...b.data, ator: g.ator });
    if (r.s === 201) { res.status(201).json({ id: r.id }); return; }
    if (r.s === 404) return naoAchou(res, "Campanha ou cliente não encontrado nesta clínica.");
    res.status(409).json({ error: r.dup ? "Este cliente já tem participação nesta campanha." : "Cliente e campanha pertencem a clínicas diferentes." });
  } catch (err) { falha(req, res, err, "Não foi possível registrar a participação."); }
});

const Config = z.object({
  driveFolderId: z.string().trim().regex(/^[A-Za-z0-9_-]{10,120}$/).nullable(),
  autoAprovar: z.boolean(),
  confirmoAprovacaoAutomatica: z.boolean().optional(),
}).strict();
router.put(`${G}/config`, requireCollaborator, async (req, res): Promise<void> => {
  const g = await gestor(req, res);
  if (!g) return;
  const b = Config.safeParse(req.body);
  if (!b.success) return ruim(res, "Pasta inválida. Cole apenas o código da pasta do Drive, ou deixe vazio.");
  try {
    const atual = await lerConfig(g.empresaId);
    if (b.data.autoAprovar && !atual.autoAprovar && b.data.confirmoAprovacaoAutomatica !== true) {
      return ruim(res, "Para ligar a aprovação automática, confirme que entende que recibos lidos com alta certeza serão liberados ao participante sem conferência humana.");
    }
    await gravarConfig(g.empresaId, { driveFolderId: b.data.driveFolderId, autoAprovar: b.data.autoAprovar }, g.ator);
    res.json({ driveFolderId: b.data.driveFolderId, autoAprovar: b.data.autoAprovar });
  } catch (err) { falha(req, res, err, "Não foi possível salvar a configuração."); }
});

export default router;
