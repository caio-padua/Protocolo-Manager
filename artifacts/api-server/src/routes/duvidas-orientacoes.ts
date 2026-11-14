/**
 * Tela "Dúvidas e Orientações": cadastro das orientações APROVADAS que o atendimento por IA pode usar.
 * Regras: rascunho não é usado; só médico ativo aprova; editar texto de orientação aprovada volta a rascunho;
 * a empresa vem do vínculo do profissional (nunca do corpo/consulta).
 * Quem liga/desliga a IA é a configuração `atendimento.ia.modo` (CEO); esta tela só mostra o estado.
 */
import { Router, type Request, type Response } from "express";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { verifyCollaboratorToken } from "../lib/collaborator-auth";
import { LIMITE_RESPOSTA, LIMITE_TOM, CATEGORIAS, validarCategoria, normalizarQuebras, marcadoresPendentes } from "../lib/orientacao-texto";
import { lerConfigAtendimento, pausarParaHumano, devolverParaIA } from "../lib/atendimento-telegram-store";

const router = Router();

interface Quem { professionalId: number; empresaId: number; medico: boolean }

async function nomeDaClinica(empresaId: number): Promise<string | null> {
  const r = await db.execute(sql`SELECT nome FROM empresas WHERE id=${empresaId}`);
  return (r.rows[0] as { nome?: string } | undefined)?.nome ?? null;
}

async function resolverQuem(req: Request, res: Response): Promise<Quem | null> {
  const h = req.headers.authorization;
  const claims = h?.startsWith("Bearer ") ? verifyCollaboratorToken(h.slice(7).trim()) : null;
  if (!claims || !Number.isSafeInteger(claims.professionalId) || claims.professionalId <= 0) {
    res.status(401).json({ error: "Faça login de colaborador." });
    return null;
  }
  const r = await db.execute(sql`
    SELECT p.id, p.empresa_id, p.professional_type FROM professionals p
    JOIN empresas e ON e.id = p.empresa_id
    WHERE p.id = ${claims.professionalId} AND p.active = true AND p.credential_version = ${claims.credentialVersion ?? 0}
      AND e.ativa = true AND e.status = 'ATIVO' LIMIT 1`);
  const row = r.rows[0] as { id: number; empresa_id: number; professional_type: string } | undefined;
  if (!row) {
    res.status(401).json({ error: "Sessão inválida." });
    return null;
  }
  return { professionalId: row.id, empresaId: row.empresa_id, medico: row.professional_type === "medico" };
}

function idDe(req: Request): number | null {
  const n = Number(req.params.id ?? req.params.clienteId);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

function validar(body: unknown): { tema: string; perguntasExemplo: string; resposta: string; cat: { categoria: string | null; subcategoria: string | null } | undefined } | string {
  const b = (body ?? {}) as Record<string, unknown>;
  const tema = typeof b.tema === "string" ? b.tema.trim() : "";
  const perguntasExemplo = typeof b.perguntasExemplo === "string" ? b.perguntasExemplo.trim() : "";
  const resposta = typeof b.resposta === "string" ? normalizarQuebras(b.resposta).trim() : "";
  if (tema.length < 3 || tema.length > 120) return "tema deve ter de 3 a 120 caracteres";
  if (perguntasExemplo.length > 1000) return "perguntas de exemplo: no máximo 1000 caracteres";
  if (resposta.length < 10 || resposta.length > LIMITE_RESPOSTA) return `resposta deve ter de 10 a ${LIMITE_RESPOSTA} caracteres`;
  // Campo ausente = manter o que já está salvo (clientes antigos da API não apagam categoria).
  let cat: { categoria: string | null; subcategoria: string | null } | undefined;
  if ("categoria" in b || "subcategoria" in b) {
    const c = validarCategoria(b.categoria, b.subcategoria);
    if (typeof c === "string") return c;
    cat = c;
  }
  return { tema, perguntasExemplo, resposta, cat };
}

// ── Tom de voz da assistente (por clínica). Guia de estilo para a equipe; a IA nunca redige texto ao paciente. ──
router.get("/duvidas-orientacoes/tom-de-voz", async (req, res): Promise<void> => {
  const q = await resolverQuem(req, res);
  if (!q) return;
  const r = await db.execute(sql`SELECT texto, status, aprovado_por AS "aprovadoPor", aprovado_em AS "aprovadoEm", atualizado_em AS "atualizadoEm" FROM assistente_tom_voz WHERE empresa_id=${q.empresaId}`);
  res.json({ tom: r.rows[0] ?? null, podeAprovar: q.medico, limite: LIMITE_TOM, clinica: await nomeDaClinica(q.empresaId) });
});

router.put("/duvidas-orientacoes/tom-de-voz", async (req, res): Promise<void> => {
  const q = await resolverQuem(req, res);
  if (!q) return;
  const b = (req.body ?? {}) as Record<string, unknown>;
  const texto = typeof b.texto === "string" ? normalizarQuebras(b.texto).trim() : "";
  if (texto.length < 10 || texto.length > LIMITE_TOM) { res.status(400).json({ error: `tom de voz deve ter de 10 a ${LIMITE_TOM} caracteres` }); return; }
  // Salvar sempre volta a rascunho quando o texto muda; igual ao aprovado mantém a aprovação.
  await db.execute(sql`INSERT INTO assistente_tom_voz (empresa_id, texto, atualizado_por) VALUES (${q.empresaId}, ${texto}, ${q.professionalId})
    ON CONFLICT (empresa_id) DO UPDATE SET
      status = CASE WHEN assistente_tom_voz.texto IS DISTINCT FROM EXCLUDED.texto THEN 'rascunho' ELSE assistente_tom_voz.status END,
      aprovado_por = CASE WHEN assistente_tom_voz.texto IS DISTINCT FROM EXCLUDED.texto THEN NULL ELSE assistente_tom_voz.aprovado_por END,
      aprovado_em = CASE WHEN assistente_tom_voz.texto IS DISTINCT FROM EXCLUDED.texto THEN NULL ELSE assistente_tom_voz.aprovado_em END,
      texto = EXCLUDED.texto, atualizado_por = EXCLUDED.atualizado_por, atualizado_em = NOW()`);
  const r = await db.execute(sql`SELECT status FROM assistente_tom_voz WHERE empresa_id=${q.empresaId}`);
  res.json({ ok: true, status: (r.rows[0] as { status: string }).status });
});

router.post("/duvidas-orientacoes/tom-de-voz/aprovar", async (req, res): Promise<void> => {
  const q = await resolverQuem(req, res);
  if (!q) return;
  if (!q.medico) { res.status(403).json({ error: "Somente médico aprova o tom de voz." }); return; }
  const r = await db.execute(sql`UPDATE assistente_tom_voz SET status='aprovada', aprovado_por=${q.professionalId}, aprovado_em=NOW(), atualizado_em=NOW()
    WHERE empresa_id=${q.empresaId} AND status='rascunho' RETURNING empresa_id`);
  if (r.rows.length === 0) { res.status(404).json({ error: "nenhum rascunho de tom de voz para aprovar" }); return; }
  res.json({ ok: true });
});

// ── Propostas internas pendentes de revisão clínica. Somente leitura e registro: não há rota que aprove, ative ou envie. ──
router.get("/duvidas-orientacoes/propostas-internas", async (req, res): Promise<void> => {
  const q = await resolverQuem(req, res);
  if (!q) return;
  const r = await db.execute(sql`SELECT id, titulo, descricao, riscos, fontes, status, criado_em AS "criadoEm"
    FROM orientacoes_propostas_internas WHERE empresa_id=${q.empresaId} ORDER BY id DESC`);
  res.json({ propostas: r.rows, usoPermitido: "interno", enviavel: false });
});

router.post("/duvidas-orientacoes/propostas-internas", async (req, res): Promise<void> => {
  const q = await resolverQuem(req, res);
  if (!q) return;
  const b = (req.body ?? {}) as Record<string, unknown>;
  const t = (k: string) => (typeof b[k] === "string" ? (b[k] as string).trim() : "");
  const titulo = t("titulo"), descricao = t("descricao"), riscos = t("riscos"), fontes = t("fontes");
  if (titulo.length < 3 || titulo.length > 160 || descricao.length < 10 || descricao.length > 4000 || riscos.length > 4000 || fontes.length > 2000) {
    res.status(400).json({ error: "título 3-160, descrição 10-4000, riscos até 4000 e fontes até 2000 caracteres" });
    return;
  }
  const r = await db.execute(sql`INSERT INTO orientacoes_propostas_internas (empresa_id, titulo, descricao, riscos, fontes, criado_por)
    VALUES (${q.empresaId}, ${titulo}, ${descricao}, ${riscos}, ${fontes}, ${q.professionalId}) RETURNING id`);
  res.status(201).json({ id: Number((r.rows[0] as { id: number | string }).id), status: "pendente_revisao" });
});

router.get("/duvidas-orientacoes", async (req, res): Promise<void> => {
  const q = await resolverQuem(req, res);
  if (!q) return;
  const r = await db.execute(sql`SELECT id, tema, perguntas_exemplo AS "perguntasExemplo", resposta, categoria, subcategoria, status, aprovado_por AS "aprovadoPor", aprovado_em AS "aprovadoEm", atualizado_em AS "atualizadoEm"
    FROM orientacoes_aprovadas WHERE empresa_id = ${q.empresaId} ORDER BY status, id DESC`);
  res.json({ orientacoes: r.rows, podeAprovar: q.medico, categorias: CATEGORIAS, clinica: await nomeDaClinica(q.empresaId) });
});

router.post("/duvidas-orientacoes", async (req, res): Promise<void> => {
  const q = await resolverQuem(req, res);
  if (!q) return;
  const v = validar(req.body);
  if (typeof v === "string") { res.status(400).json({ error: v }); return; }
  const r = await db.execute(sql`INSERT INTO orientacoes_aprovadas (empresa_id, tema, perguntas_exemplo, resposta, criado_por, categoria, subcategoria)
    VALUES (${q.empresaId}, ${v.tema}, ${v.perguntasExemplo}, ${v.resposta}, ${q.professionalId}, ${v.cat?.categoria ?? null}, ${v.cat?.subcategoria ?? null}) RETURNING id`);
  res.status(201).json({ id: Number((r.rows[0] as { id: number | string }).id), status: "rascunho" });
});

router.put("/duvidas-orientacoes/:id", async (req, res): Promise<void> => {
  const q = await resolverQuem(req, res);
  if (!q) return;
  const id = idDe(req);
  const v = validar(req.body);
  if (!id) { res.status(400).json({ error: "id inválido" }); return; }
  if (typeof v === "string") { res.status(400).json({ error: v }); return; }
  // Mudar o TEXTO (tema, perguntas ou resposta) invalida a aprovação: o médico aprova o que de fato será enviado.
  // Mudar só a categoria não altera o que o paciente lê e não derruba a aprovação.
  const mudou = sql`(tema IS DISTINCT FROM ${v.tema} OR perguntas_exemplo IS DISTINCT FROM ${v.perguntasExemplo} OR resposta IS DISTINCT FROM ${v.resposta})`;
  const r = await db.execute(sql`UPDATE orientacoes_aprovadas
    SET tema=${v.tema}, perguntas_exemplo=${v.perguntasExemplo}, resposta=${v.resposta},
        categoria = ${v.cat ? v.cat.categoria : sql`categoria`}, subcategoria = ${v.cat ? v.cat.subcategoria : sql`subcategoria`},
        status = CASE WHEN status='aprovada' AND ${mudou} THEN 'rascunho' ELSE status END,
        aprovado_por = CASE WHEN status='aprovada' AND ${mudou} THEN NULL ELSE aprovado_por END,
        aprovado_em = CASE WHEN status='aprovada' AND ${mudou} THEN NULL ELSE aprovado_em END,
        atualizado_em = NOW()
    WHERE id=${id} AND empresa_id=${q.empresaId} RETURNING status`);
  if (r.rows.length === 0) { res.status(404).json({ error: "orientação não encontrada" }); return; }
  res.json({ ok: true, status: (r.rows[0] as { status: string }).status });
});

router.post("/duvidas-orientacoes/:id/aprovar", async (req, res): Promise<void> => {
  const q = await resolverQuem(req, res);
  if (!q) return;
  if (!q.medico) { res.status(403).json({ error: "Somente médico aprova orientações." }); return; }
  const id = idDe(req);
  if (!id) { res.status(400).json({ error: "id inválido" }); return; }
  const atual = await db.execute(sql`SELECT resposta FROM orientacoes_aprovadas WHERE id=${id} AND empresa_id=${q.empresaId}`);
  const texto = (atual.rows[0] as { resposta?: string } | undefined)?.resposta;
  const pend = texto ? marcadoresPendentes(texto) : [];
  if (pend.length) {
    res.status(422).json({ error: `Não é possível aprovar: o texto ainda tem marcadores a preencher (${pend.slice(0, 5).join(", ")}). Troque por texto final antes de aprovar.` });
    return;
  }
  const r = await db.execute(sql`UPDATE orientacoes_aprovadas SET status='aprovada', aprovado_por=${q.professionalId}, aprovado_em=NOW(), atualizado_em=NOW()
    WHERE id=${id} AND empresa_id=${q.empresaId} AND status IN ('rascunho','inativa') RETURNING id`);
  if (r.rows.length === 0) { res.status(404).json({ error: "orientação não encontrada ou já aprovada" }); return; }
  res.json({ ok: true });
});

router.post("/duvidas-orientacoes/:id/inativar", async (req, res): Promise<void> => {
  const q = await resolverQuem(req, res);
  if (!q) return;
  const id = idDe(req);
  if (!id) { res.status(400).json({ error: "id inválido" }); return; }
  const r = await db.execute(sql`UPDATE orientacoes_aprovadas SET status='inativa', atualizado_em=NOW() WHERE id=${id} AND empresa_id=${q.empresaId} RETURNING id`);
  if (r.rows.length === 0) { res.status(404).json({ error: "orientação não encontrada" }); return; }
  res.json({ ok: true });
});

router.get("/duvidas-orientacoes/atendimento/estado", async (req, res): Promise<void> => {
  const q = await resolverQuem(req, res);
  if (!q) return;
  const cfg = await lerConfigAtendimento();
  const r = await db.execute(sql`SELECT a.cliente_id AS "clienteId", c.name AS nome, a.motivo, a.alterado_em AS "alteradoEm"
    FROM telegram_atendimento a JOIN clients c ON c.id = a.cliente_id
    WHERE a.modo='humano' AND c.empresa_id=${q.empresaId} ORDER BY a.alterado_em DESC LIMIT 200`);
  const pendencias=await db.execute(sql`SELECT m.id AS "mensagemId",m.cliente_id AS "clienteId",
    a.estado,a.ultimo_erro AS erro,a.etapas,a.atualizado_em AS "atualizadoEm"
    FROM telegram_atendimento_respostas a JOIN telegram_inbox_messages m ON m.id=a.inbox_message_id
    JOIN clients c ON c.id=m.cliente_id AND c.empresa_id=m.empresa_id
    WHERE m.empresa_id=${q.empresaId} AND a.estado IN ('pendente','processando','falhou','esgotado','incerto')
    ORDER BY a.atualizado_em DESC LIMIT 200`);
  res.json({ modoIA: cfg.modo, queixaRevisada: cfg.queixaRevisada, emAtendimentoHumano: r.rows, pendencias:pendencias.rows });
});

async function clienteDaEmpresa(clienteId: number, empresaId: number): Promise<boolean> {
  const r = await db.execute(sql`SELECT 1 FROM clients WHERE id=${clienteId} AND empresa_id=${empresaId} LIMIT 1`);
  return r.rows.length > 0;
}

router.post("/duvidas-orientacoes/atendimento/:clienteId/assumir", async (req, res): Promise<void> => {
  const q = await resolverQuem(req, res);
  if (!q) return;
  const cid = idDe(req);
  if (!cid || !(await clienteDaEmpresa(cid, q.empresaId))) { res.status(404).json({ error: "cliente não encontrado" }); return; }
  await pausarParaHumano(db, cid, "profissional_assumiu", q.professionalId);
  res.json({ ok: true, modo: "humano" });
});

router.post("/duvidas-orientacoes/atendimento/:clienteId/devolver-ia", async (req, res): Promise<void> => {
  const q = await resolverQuem(req, res);
  if (!q) return;
  const cid = idDe(req);
  if (!cid || !(await clienteDaEmpresa(cid, q.empresaId))) { res.status(404).json({ error: "cliente não encontrado" }); return; }
  await devolverParaIA(db, cid, q.professionalId);
  res.json({ ok: true, modo: "ia" });
});

export default router;
