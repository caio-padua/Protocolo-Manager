import { Router, type NextFunction, type Request, type Response } from "express";
import { db, pool } from "@workspace/db";
import { requireCollaborator } from "./collaborator";
import { moduleGuard } from "../middleware/moduleGuard";
import { acesso } from "./fornecedores";
import { montarMatrizCompleta } from "../lib/matriz-completa";
import { aplicarAgora, CATEGORIAS, ErroPrecificacao, salvarConfiguracao, validarConfiguracao, type Categoria } from "../lib/precificacao";
import { gravarOferta, validarOferta } from "../lib/oferta-apresentacao";
import { cadastrarBlend, ErroBlend, validarBlend } from "../lib/blend-cadastro";
import { liberarReservaProtocolo, saldosPorSubstancia } from "../lib/estoque-reserva";
import multer from "multer";
import { aplicarLista, lerPlanilha, montarPrevia, validarLinha, type Decisao } from "../lib/importar-lista-fornecedor";
import { resolveEmpresaId } from "../middleware/tenantContext";

const router = Router();

async function estrutura(_req: Request, res: Response, next: NextFunction): Promise<void> {
  const { rows } = await pool.query(`SELECT to_regclass('precificacao_parametros') AS a, to_regclass('precificacao_categorias') AS b,
    to_regclass('preco_publicado') AS c, to_regclass('estoque_reservas') AS d, to_regclass('substance_ofertas') AS e`);
  if (!rows[0] || Object.values(rows[0]).some((v) => !v)) {
    res.status(503).json({ error: "Precificação e reservas ainda não estão instaladas neste ambiente." }); return;
  }
  next();
}

function tratar(res: Response, e: unknown): void {
  if (e instanceof ErroPrecificacao || e instanceof ErroBlend) { res.status(e.status).json({ error: e.message }); return; }
  throw e;
}

// Matriz completa: preços, precificação, preço publicado, vínculo com o Orçamento e estoque estático/dinâmico.
router.get("/matriz-fornecedores/completa", requireCollaborator, acesso, estrutura, async (req, res) => {
  res.json(await montarMatrizCompleta(pool, req.tenantContext.empresaId));
});

// Cadastro visual de blend: nasce INDISPONÍVEL (aguarda revisão clínica), com composição e preço da caixa de um laboratório.
router.post("/matriz-fornecedores/blend", requireCollaborator, acesso, estrutura, async (req, res) => {
  try {
    const entrada = validarBlend(req.body);
    const r = await cadastrarBlend(pool, req.tenantContext.empresaId, req.tenantContext.professionalId as number, entrada);
    res.status(201).json({ ok: true, ...r });
  } catch (e) {
    if (e instanceof ErroBlend) { res.status(e.status).json({ error: e.message }); return; }
    throw e;
  }
});

router.post("/matriz-fornecedores/oferta", requireCollaborator, acesso, estrutura, async (req, res) => {
  try {
    const r = await gravarOferta(pool, req.tenantContext.empresaId, req.tenantContext.professionalId as number, validarOferta(req.body));
    res.status(r.atualizada ? 200 : 201).json({ ok: true, ...r });
  } catch (e) {
    if (e instanceof ErroBlend) { res.status(e.status).json({ error: e.message }); return; }
    throw e;
  }
});

const uploadLista = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } });

// Importação de lista do fornecedor — passo 1: lê a planilha e devolve a PRÉVIA (nada é gravado).
router.post("/matriz-fornecedores/importar-lista/previa", requireCollaborator, acesso, estrutura, (req, res, next) => {
  uploadLista.single("file")(req, res, (err: unknown) => {
    if (err) { res.status(400).json({ error: err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE" ? "Arquivo acima de 5 MB." : "Falha ao receber o arquivo." }); return; }
    next();
  });
}, async (req, res) => {
  try {
    const fornecedorId = Number(req.body?.fornecedorId);
    if (!Number.isSafeInteger(fornecedorId) || fornecedorId < 1) throw new ErroBlend(400, "Escolha o fornecedor.");
    if (!req.file) throw new ErroBlend(400, "Envie a planilha (.xlsx ou .csv).");
    const { linhas, invalidas } = await lerPlanilha(req.file.buffer, req.file.originalname);
    const itens = await montarPrevia(pool, req.tenantContext.empresaId, fornecedorId, linhas);
    res.json({ arquivo: req.file.originalname.slice(0, 160), fornecedorId, itens, invalidas });
  } catch (e) { tratar(res, e); }
});

// Passo 2: grava SOMENTE depois da aprovação humana. Duvidosas exigem decisão; reenviar não duplica.
router.post("/matriz-fornecedores/importar-lista/aplicar", requireCollaborator, acesso, estrutura, async (req, res) => {
  try {
    const b = (req.body ?? {}) as Record<string, unknown>;
    const fornecedorId = Number(b.fornecedorId);
    if (!Number.isSafeInteger(fornecedorId) || fornecedorId < 1) throw new ErroBlend(400, "Escolha o fornecedor.");
    if (b.aprovado !== true) throw new ErroBlend(400, "A prévia precisa ser aprovada por uma pessoa antes de gravar.");
    if (!Array.isArray(b.linhas) || b.linhas.length === 0 || b.linhas.length > 2000) throw new ErroBlend(400, "Nenhuma linha para gravar.");
    const arquivo = typeof b.arquivo === "string" && b.arquivo.trim() ? b.arquivo.trim().slice(0, 160) : "lista do fornecedor";
    const linhas = b.linhas.map(validarLinha);
    const decisoes: Decisao[] = Array.isArray(b.decisoes) ? b.decisoes.map((d: any) => {
      const linha = Number(d?.linha);
      if (!Number.isSafeInteger(linha)) throw new ErroBlend(400, "Decisão inválida.");
      if (d.acao === "casar") { const varianteId = Number(d.varianteId); if (!Number.isSafeInteger(varianteId)) throw new ErroBlend(400, "Decisão inválida."); return { linha, acao: "casar", varianteId }; }
      if (d.acao === "nova" || d.acao === "ignorar") return { linha, acao: d.acao };
      throw new ErroBlend(400, "Decisão inválida.");
    }) : [];
    const resultados = await aplicarLista(pool, req.tenantContext.empresaId, req.tenantContext.professionalId as number, fornecedorId, arquivo, linhas, decisoes);
    res.json({ resultados });
  } catch (e) { tratar(res, e); }
});

router.put("/precificacao", requireCollaborator, acesso, estrutura, async (req, res) => {
  try {
    const cfg = validarConfiguracao(req.body);
    const r = await salvarConfiguracao(pool, req.tenantContext.empresaId, req.tenantContext.professionalId ?? null, cfg);
    res.json({ ok: true, ...r });
  } catch (e) { tratar(res, e); }
});

router.post("/precificacao/aplicar", requireCollaborator, acesso, estrutura, async (req, res) => {
  try {
    const cats = (req.body as { categorias?: unknown })?.categorias;
    if (!Array.isArray(cats) || cats.length === 0 || cats.some((c) => !CATEGORIAS.includes(c as Categoria))) {
      throw new ErroPrecificacao(400, "Informe ao menos uma categoria válida.");
    }
    const r = await aplicarAgora(pool, req.tenantContext.empresaId, req.tenantContext.professionalId ?? null, cats as Categoria[]);
    res.json({ ok: true, ...r });
  } catch (e) { tratar(res, e); }
});

// Estoque: saldos estático x dinâmico por substância (qualquer colaborador autenticado da clínica).
router.get("/estoque/saldos", moduleGuard("estoque"), requireCollaborator, estrutura, async (req, res) => {
  res.json(await saldosPorSubstancia(db, resolveEmpresaId(req)));
});

router.get("/estoque/reservas", moduleGuard("estoque"), requireCollaborator, estrutura, async (req, res) => {
  const empresaId = resolveEmpresaId(req);
  const status = typeof req.query.status === "string" && ["ativa", "concluida", "liberada"].includes(req.query.status) ? req.query.status : "ativa";
  const r = await pool.query(
    `SELECT r.id, r.protocol_id AS "protocolId", p.title AS protocolo, c.name AS cliente, s.name AS substancia,
            r.quantidade_reservada AS reservada, r.quantidade_consumida AS consumida, r.quantidade_liberada AS liberada,
            r.status, r.criado_em AS "criadoEm"
       FROM estoque_reservas r
       JOIN protocols p ON p.id=r.protocol_id
       LEFT JOIN clients c ON c.id=r.client_id
       JOIN substances s ON s.id=r.substance_id
      WHERE r.empresa_id=$1 AND r.status=$2 ORDER BY r.id DESC LIMIT 300`, [empresaId, status]);
  res.json(r.rows);
});

// Liberar o que sobrou da reserva (protocolo cancelado/encerrado). Ação humana, rastreada no livro de movimentos.
router.post("/estoque/reservas/protocolo/:id/liberar", moduleGuard("estoque"), requireCollaborator, estrutura, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) { res.status(400).json({ error: "Protocolo inválido." }); return; }
  const empresaId = resolveEmpresaId(req);
  const dono = await pool.query(`SELECT 1 FROM protocols WHERE id=$1 AND empresa_id=$2`, [id, empresaId]);
  if (!dono.rowCount) { res.status(404).json({ error: "Protocolo não encontrado nesta clínica." }); return; }
  const r = await db.transaction((tx) => liberarReservaProtocolo(tx, id, empresaId));
  res.json({ ok: true, ...r });
});

export default router;
