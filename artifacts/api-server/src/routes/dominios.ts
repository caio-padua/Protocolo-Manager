import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const router: IRouter = Router();

// ── helpers ────────────────────────────────────────────────────────────────

/** Verifica disponibilidade de um domínio via RDAP público (sem auth). */
async function checkRdap(domain: string): Promise<"disponivel" | "registrado" | "erro"> {
  try {
    let url: string;
    if (domain.endsWith(".com.br") || domain.endsWith(".net.br") || domain.endsWith(".org.br")) {
      url = `https://rdap.registro.br/domain/${encodeURIComponent(domain)}`;
    } else if (domain.endsWith(".com") || domain.endsWith(".net") || domain.endsWith(".org")) {
      const tld = domain.split(".").pop()!;
      url = `https://rdap.verisign.com/${tld}/v1/domain/${encodeURIComponent(domain)}`;
    } else {
      url = `https://rdap.iana.org/domain/${encodeURIComponent(domain)}`;
    }
    const resp = await fetch(url, { signal: AbortSignal.timeout(5000) });
    return resp.status === 404 ? "disponivel" : "registrado";
  } catch {
    return "erro";
  }
}

// ── GET /api/dominios — lista todos os domínios cadastrados ────────────────
router.get("/dominios", async (_req, res): Promise<void> => {
  try {
    const rows = await db.execute(sql`
      SELECT id, dominio, registrador, registrador_domain_id, status,
             expira_em, auto_renovar, empresa_id, notas, criado_em, atualizado_em
      FROM dominios
      ORDER BY criado_em DESC
    `);
    res.json({ items: rows.rows });
  } catch (e: unknown) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Erro ao listar domínios" });
  }
});

// ── POST /api/dominios — adiciona domínio manualmente ────────────────────
router.post("/dominios", async (req, res): Promise<void> => {
  const { dominio, registrador, expira_em, notas, auto_renovar } = req.body ?? {};
  if (!dominio || typeof dominio !== "string") {
    res.status(400).json({ error: "Campo 'dominio' é obrigatório" });
    return;
  }
  const normalizado = dominio.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{0,61}[a-z0-9]?\.[a-z.]+$/.test(normalizado)) {
    res.status(400).json({ error: "Formato de domínio inválido" });
    return;
  }
  try {
    const result = await db.execute(sql`
      INSERT INTO dominios (dominio, registrador, expira_em, notas, auto_renovar)
      VALUES (${normalizado}, ${registrador ?? null}, ${expira_em ?? null}, ${notas ?? null}, ${auto_renovar ?? true})
      ON CONFLICT (dominio) DO NOTHING
      RETURNING id, dominio, status, criado_em
    `);
    if ((result.rows as unknown[]).length === 0) {
      res.status(409).json({ error: "Domínio já cadastrado" });
      return;
    }
    res.status(201).json(result.rows[0]);
  } catch (e: unknown) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Erro ao inserir domínio" });
  }
});

// ── PATCH /api/dominios/:id — atualiza domínio ──────────────────────────
router.patch("/dominios/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }
  const { registrador, status, expira_em, notas, auto_renovar } = req.body ?? {};
  try {
    await db.execute(sql`
      UPDATE dominios SET
        registrador = COALESCE(${registrador ?? null}, registrador),
        status = COALESCE(${status ?? null}, status),
        expira_em = COALESCE(${expira_em ?? null}::date, expira_em),
        notas = COALESCE(${notas ?? null}, notas),
        auto_renovar = COALESCE(${auto_renovar ?? null}, auto_renovar),
        atualizado_em = now()
      WHERE id = ${id}
    `);
    res.json({ ok: true });
  } catch (e: unknown) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Erro ao atualizar" });
  }
});

// ── DELETE /api/dominios/:id ─────────────────────────────────────────────
router.delete("/dominios/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }
  try {
    await db.execute(sql`DELETE FROM dominios WHERE id = ${id}`);
    res.json({ ok: true });
  } catch (e: unknown) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Erro ao remover" });
  }
});

// ── GET /api/dominios/check?base=X — verifica disponibilidade RDAP ───────
router.get("/dominios/check", async (req, res): Promise<void> => {
  const base = String(req.query.base ?? "").trim().toLowerCase();
  if (!base || !/^[a-z0-9][a-z0-9-]*$/.test(base)) {
    res.status(400).json({ error: "Parâmetro 'base' inválido. Use apenas letras, números e hífens." });
    return;
  }

  // TLDs a verificar
  const tlds = ["com.br", "com", "net.br", "net", "org.br"];
  const checks = await Promise.all(
    tlds.map(async (tld) => {
      const domain = `${base}.${tld}`;
      const status = await checkRdap(domain);
      return { dominio: domain, status };
    })
  );

  res.json({ base, resultados: checks });
});

export default router;
