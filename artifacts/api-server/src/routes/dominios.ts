import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const router: IRouter = Router();

// ── helpers ────────────────────────────────────────────────────────────────

async function checkRdap(domain: string): Promise<"disponivel" | "registrado" | "erro"> {
  try {
    let url: string;
    if (/\.(com|net|org)\.br$/.test(domain)) {
      url = `https://rdap.registro.br/domain/${encodeURIComponent(domain)}`;
    } else if (/\.(com|net|org)$/.test(domain)) {
      const tld = domain.split(".").pop()!;
      url = `https://rdap.verisign.com/${tld}/v1/domain/${encodeURIComponent(domain)}`;
    } else {
      url = `https://rdap.iana.org/domain/${encodeURIComponent(domain)}`;
    }
    const resp = await fetch(url, { signal: AbortSignal.timeout(6000) });
    return resp.status === 404 ? "disponivel" : "registrado";
  } catch {
    return "erro";
  }
}

// ── GET /api/dominios ── lista todos ──────────────────────────────────────
router.get("/dominios", async (_req, res): Promise<void> => {
  try {
    const rows = await db.execute(sql`
      SELECT id, dominio, registrador, registrador_domain_id, status,
             expira_em, data_registro, auto_renovar, empresa_id, notas,
             titular_nome, titular_documento, modulo_pago, valor_mensal_centavos,
             ns1, ns2, ns3, ns4, dns_provider, cloudflare_zone_id,
             zoho_verificado, zoho_metodo_verificacao, zoho_conta_admin, zoho_auto_alias,
             criado_em, atualizado_em
      FROM dominios ORDER BY criado_em DESC
    `);
    res.json({ items: rows.rows });
  } catch (e: unknown) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Erro" });
  }
});

// ── GET /api/dominios/:id ─────────────────────────────────────────────────
router.get("/dominios/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }
  try {
    const rows = await db.execute(sql`SELECT * FROM dominios WHERE id = ${id}`);
    if (!rows.rows.length) { res.status(404).json({ error: "Não encontrado" }); return; }
    res.json(rows.rows[0]);
  } catch (e: unknown) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Erro" });
  }
});

// ── POST /api/dominios ── cria domínio com campos completos ───────────────
router.post("/dominios", async (req, res): Promise<void> => {
  const {
    dominio, registrador, status, expira_em, data_registro,
    notas, auto_renovar, empresa_id, titular_nome, titular_documento,
    modulo_pago, valor_mensal_centavos,
    ns1, ns2, ns3, ns4, dns_provider, cloudflare_zone_id,
    zoho_verificado, zoho_metodo_verificacao, zoho_conta_admin, zoho_auto_alias,
  } = req.body ?? {};

  if (!dominio || typeof dominio !== "string") {
    res.status(400).json({ error: "Campo 'dominio' é obrigatório" });
    return;
  }
  const dom = dominio.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]\.[a-z]{2,}$/.test(dom)) {
    res.status(400).json({ error: "Formato de domínio inválido" });
    return;
  }
  try {
    const result = await db.execute(sql`
      INSERT INTO dominios (
        dominio, registrador, status, expira_em, data_registro,
        notas, auto_renovar, empresa_id, titular_nome, titular_documento,
        modulo_pago, valor_mensal_centavos,
        ns1, ns2, ns3, ns4, dns_provider, cloudflare_zone_id,
        zoho_verificado, zoho_metodo_verificacao, zoho_conta_admin, zoho_auto_alias
      ) VALUES (
        ${dom}, ${registrador ?? null}, ${status ?? "ativo"},
        ${expira_em ?? null}, ${data_registro ?? null},
        ${notas ?? null}, ${auto_renovar ?? true}, ${empresa_id ?? null},
        ${titular_nome ?? null}, ${titular_documento ?? null},
        ${modulo_pago ?? false}, ${valor_mensal_centavos ?? null},
        ${ns1 ?? null}, ${ns2 ?? null}, ${ns3 ?? null}, ${ns4 ?? null},
        ${dns_provider ?? "outro"}, ${cloudflare_zone_id ?? null},
        ${zoho_verificado ?? false}, ${zoho_metodo_verificacao ?? null},
        ${zoho_conta_admin ?? null}, ${zoho_auto_alias ?? false}
      )
      ON CONFLICT (dominio) DO NOTHING
      RETURNING id, dominio, status, criado_em
    `);
    if (!(result.rows as unknown[]).length) {
      res.status(409).json({ error: "Domínio já cadastrado" }); return;
    }
    res.status(201).json(result.rows[0]);
  } catch (e: unknown) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Erro ao inserir" });
  }
});

// ── PATCH /api/dominios/:id ───────────────────────────────────────────────
router.patch("/dominios/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }
  const b = req.body ?? {};
  try {
    await db.execute(sql`
      UPDATE dominios SET
        registrador        = COALESCE(${b.registrador ?? null}, registrador),
        status             = COALESCE(${b.status ?? null}, status),
        expira_em          = COALESCE(${b.expira_em ?? null}::date, expira_em),
        data_registro      = COALESCE(${b.data_registro ?? null}::date, data_registro),
        notas              = COALESCE(${b.notas ?? null}, notas),
        auto_renovar       = COALESCE(${b.auto_renovar ?? null}, auto_renovar),
        titular_nome       = COALESCE(${b.titular_nome ?? null}, titular_nome),
        titular_documento  = COALESCE(${b.titular_documento ?? null}, titular_documento),
        modulo_pago        = COALESCE(${b.modulo_pago ?? null}, modulo_pago),
        valor_mensal_centavos = COALESCE(${b.valor_mensal_centavos ?? null}, valor_mensal_centavos),
        ns1                = COALESCE(${b.ns1 ?? null}, ns1),
        ns2                = COALESCE(${b.ns2 ?? null}, ns2),
        ns3                = COALESCE(${b.ns3 ?? null}, ns3),
        ns4                = COALESCE(${b.ns4 ?? null}, ns4),
        dns_provider       = COALESCE(${b.dns_provider ?? null}, dns_provider),
        cloudflare_zone_id = COALESCE(${b.cloudflare_zone_id ?? null}, cloudflare_zone_id),
        zoho_verificado    = COALESCE(${b.zoho_verificado ?? null}, zoho_verificado),
        zoho_metodo_verificacao = COALESCE(${b.zoho_metodo_verificacao ?? null}, zoho_metodo_verificacao),
        zoho_conta_admin   = COALESCE(${b.zoho_conta_admin ?? null}, zoho_conta_admin),
        zoho_auto_alias    = COALESCE(${b.zoho_auto_alias ?? null}, zoho_auto_alias),
        atualizado_em      = now()
      WHERE id = ${id}
    `);
    res.json({ ok: true });
  } catch (e: unknown) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Erro" });
  }
});

// ── DELETE /api/dominios/:id ──────────────────────────────────────────────
router.delete("/dominios/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }
  try {
    await db.execute(sql`DELETE FROM dominios WHERE id = ${id}`);
    res.json({ ok: true });
  } catch (e: unknown) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Erro" });
  }
});

// ── GET /api/dominios/check?base=X ── RDAP ────────────────────────────────
router.get("/dominios/check", async (req, res): Promise<void> => {
  const base = String(req.query.base ?? "").trim().toLowerCase();
  if (!base || !/^[a-z0-9][a-z0-9-]*$/.test(base)) {
    res.status(400).json({ error: "Parâmetro 'base' inválido" }); return;
  }
  const tlds = ["com.br", "com", "net.br", "net", "org.br", "org", "io"];
  const checks = await Promise.all(
    tlds.map(async (tld) => ({ dominio: `${base}.${tld}`, status: await checkRdap(`${base}.${tld}`) }))
  );
  res.json({ base, resultados: checks });
});

// ── GET /api/registradores/credenciais ── lê config de todos ─────────────
router.get("/registradores/credenciais", async (_req, res): Promise<void> => {
  try {
    const rows = await db.execute(sql`
      SELECT registrador, ativo,
             -- mascara os valores sensíveis
             jsonb_object_agg(k, CASE WHEN v = '' THEN '' ELSE repeat('*', 6) END) AS dados_mascarados
      FROM registrador_credenciais,
           jsonb_each_text(dados) AS t(k, v)
      GROUP BY registrador, ativo
      ORDER BY registrador
    `);
    res.json({ items: rows.rows });
  } catch (e: unknown) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Erro" });
  }
});

// ── PUT /api/registradores/credenciais/:registrador ── salva credenciais ──
router.put("/registradores/credenciais/:registrador", async (req, res): Promise<void> => {
  const { registrador } = req.params;
  const allowed = ["registrobr", "namecheap", "godaddy", "cloudflare"];
  if (!allowed.includes(registrador)) {
    res.status(400).json({ error: "Registrador inválido" }); return;
  }
  const dados = req.body?.dados;
  if (!dados || typeof dados !== "object") {
    res.status(400).json({ error: "Corpo inválido: esperado { dados: {...} }" }); return;
  }
  try {
    await db.execute(sql`
      UPDATE registrador_credenciais
      SET dados = dados || ${JSON.stringify(dados)}::jsonb,
          atualizado_em = now()
      WHERE registrador = ${registrador}
    `);
    res.json({ ok: true });
  } catch (e: unknown) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Erro" });
  }
});

// ── GET /api/registradores/credenciais/:reg/reveal ── exibe em claro ──────
router.get("/registradores/credenciais/:registrador/reveal", async (req, res): Promise<void> => {
  const { registrador } = req.params;
  try {
    const rows = await db.execute(sql`
      SELECT dados FROM registrador_credenciais WHERE registrador = ${registrador}
    `);
    if (!rows.rows.length) { res.status(404).json({ error: "Não encontrado" }); return; }
    res.json({ dados: (rows.rows[0] as { dados: Record<string, string> }).dados });
  } catch (e: unknown) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Erro" });
  }
});

// ── PUT /api/registradores/ativo ── salva plataforma ativa para compras ────
router.put("/registradores/ativo", async (req, res): Promise<void> => {
  const { registradorId } = req.body ?? {};
  const VALIDOS = ["registrobr", "locaweb", "namecheap", "godaddy", "cloudflare"];
  if (!registradorId || !VALIDOS.includes(registradorId)) {
    res.status(400).json({ error: "registradorId inválido" }); return;
  }
  try {
    await db.execute(sql`
      INSERT INTO app_settings (key, value) VALUES ('registrador_ativo', ${registradorId})
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
    `);
    res.json({ ok: true, registradorId });
  } catch (e: unknown) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Erro" });
  }
});

// ── GET /api/registradores/ativo ── lê plataforma ativa ───────────────────
router.get("/registradores/ativo", async (_req, res): Promise<void> => {
  try {
    const row = await db.execute(sql`
      SELECT value FROM app_settings WHERE key = 'registrador_ativo'
    `);
    res.json({ registradorId: row.rows[0] ? (row.rows[0] as { value: string }).value : "registrobr" });
  } catch (e: unknown) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Erro" });
  }
});

// ── POST /api/dominios/comprar ── scaffold de compra via registrador ───────
router.post("/dominios/comprar", async (req, res): Promise<void> => {
  const { dominio, registrador } = req.body ?? {};
  if (!dominio || !registrador) {
    res.status(400).json({ error: "dominio e registrador são obrigatórios" }); return;
  }

  // Busca credenciais do registrador
  const creds = await db.execute(sql`
    SELECT dados FROM registrador_credenciais WHERE registrador = ${registrador} AND ativo = true
  `);
  if (!creds.rows.length) {
    res.status(400).json({ error: `Registrador '${registrador}' não configurado. Configure as credenciais primeiro.` });
    return;
  }
  const dados = (creds.rows[0] as { dados: Record<string, string> }).dados;

  // --- Namecheap ---
  if (registrador === "namecheap") {
    if (!dados.api_key || !dados.api_user || !dados.client_ip) {
      res.status(400).json({ error: "Configure api_key, api_user e client_ip do Namecheap" }); return;
    }
    // Namecheap só faz TLDs globais (não .com.br)
    if (dominio.endsWith(".com.br") || dominio.endsWith(".net.br") || dominio.endsWith(".org.br")) {
      res.status(400).json({ error: "Namecheap não registra .com.br. Use GoDaddy ou UOL Host." }); return;
    }
    const parts = dominio.split(".");
    const sld = parts.slice(0, -1).join(".");
    const tld = parts.slice(-1)[0];
    const url = `https://api.namecheap.com/xml.response?ApiUser=${dados.api_user}&ApiKey=${dados.api_key}&UserName=${dados.api_user}&ClientIp=${dados.client_ip}&Command=namecheap.domains.create&DomainName=${sld}.${tld}&Years=1`;
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
      const xml = await r.text();
      if (xml.includes('Status="OK"')) {
        res.json({ ok: true, registrador: "namecheap", dominio, mensagem: "Domínio registrado com sucesso via Namecheap" });
      } else {
        res.status(400).json({ error: "Namecheap retornou erro", detalhe: xml.substring(0, 500) });
      }
    } catch (e) {
      res.status(500).json({ error: "Falha na comunicação com Namecheap" });
    }
    return;
  }

  // --- GoDaddy ---
  if (registrador === "godaddy") {
    if (!dados.api_key || !dados.api_secret) {
      res.status(400).json({ error: "Configure api_key e api_secret do GoDaddy" }); return;
    }
    const parts = dominio.split(".");
    const sld = parts[0];
    const tld = parts.slice(1).join(".");
    try {
      const r = await fetch(`https://api.godaddy.com/v1/domains/purchase`, {
        method: "POST",
        headers: {
          "Authorization": `sso-key ${dados.api_key}:${dados.api_secret}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ domain: dominio, period: 1, renewAuto: true, privacy: false }),
        signal: AbortSignal.timeout(15000),
      });
      const json = await r.json();
      if (r.ok) {
        res.json({ ok: true, registrador: "godaddy", dominio, orderId: json.orderId });
      } else {
        res.status(400).json({ error: json.message ?? "GoDaddy retornou erro", codigo: json.code });
      }
    } catch {
      res.status(500).json({ error: "Falha na comunicação com GoDaddy" });
    }
    return;
  }

  // --- Cloudflare ---
  if (registrador === "cloudflare") {
    if (!dados.api_token || !dados.account_id) {
      res.status(400).json({ error: "Configure api_token e account_id do Cloudflare" }); return;
    }
    try {
      const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${dados.account_id}/registrar/domains/${dominio}`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${dados.api_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ years: 1, privacy_available: false }),
        signal: AbortSignal.timeout(15000),
      });
      const json = await r.json();
      if (json.success) {
        res.json({ ok: true, registrador: "cloudflare", dominio, resultado: json.result });
      } else {
        res.status(400).json({ error: "Cloudflare retornou erro", erros: json.errors });
      }
    } catch {
      res.status(500).json({ error: "Falha na comunicação com Cloudflare" });
    }
    return;
  }

  // --- Registro.br via UOL Host (EPP) ---
  if (registrador === "registrobr") {
    res.status(501).json({
      error: "Compra direta via Registro.br requer ser registrador credenciado (EPP). Use UOL Host como proxy.",
      alternativa: "Configure credenciais UOL Host e use registrador='uolhost'",
      linkManual: "https://registro.br/registro/novo/"
    });
    return;
  }

  res.status(400).json({ error: `Registrador '${registrador}' não suportado` });
});

// ── Zoho Email Management (scaffolded — ativa com ZOHO_ORG_ID + TOKEN) ────

async function getZohoCreds(): Promise<{ orgId: string; token: string } | null> {
  try {
    const rows = await db.execute(sql`
      SELECT dados->>'zoho_org_id' AS org_id, dados->>'zoho_admin_token' AS token
      FROM registrador_credenciais WHERE registrador = 'zoho'
    `);
    const r = rows.rows[0] as { org_id?: string; token?: string } | undefined;
    if (r?.org_id && r?.token) return { orgId: r.org_id, token: r.token };
    return null;
  } catch { return null; }
}

// GET /api/dominios/:id/emails
router.get("/dominios/:id/emails", async (req, res): Promise<void> => {
  const creds = await getZohoCreds();
  if (!creds) {
    res.status(503).json({ error: "Zoho Admin não configurado. Adicione ZOHO_ORG_ID e ZOHO_ADMIN_TOKEN nas credenciais." });
    return;
  }
  const domRow = await db.execute(sql`SELECT dominio FROM dominios WHERE id = ${parseInt(req.params.id)}`);
  if (!domRow.rows.length) { res.status(404).json({ error: "Domínio não encontrado" }); return; }
  const dominio = (domRow.rows[0] as { dominio: string }).dominio;
  try {
    const r = await fetch(`https://mail.zoho.com/api/organization/${creds.orgId}/accounts?domain=${dominio}&limit=50`, {
      headers: { "Authorization": `Zoho-oauthtoken ${creds.token}` },
    });
    const json = await r.json();
    res.json(json);
  } catch (e) {
    res.status(500).json({ error: "Falha ao consultar Zoho" });
  }
});

// POST /api/dominios/:id/emails
router.post("/dominios/:id/emails", async (req, res): Promise<void> => {
  const creds = await getZohoCreds();
  if (!creds) {
    res.status(503).json({ error: "Zoho Admin não configurado" }); return;
  }
  const { accountName, displayName, password } = req.body ?? {};
  if (!accountName || !password) {
    res.status(400).json({ error: "accountName e password são obrigatórios" }); return;
  }
  const domRow = await db.execute(sql`SELECT dominio FROM dominios WHERE id = ${parseInt(req.params.id)}`);
  if (!domRow.rows.length) { res.status(404).json({ error: "Domínio não encontrado" }); return; }
  const dominio = (domRow.rows[0] as { dominio: string }).dominio;
  try {
    const r = await fetch(`https://mail.zoho.com/api/organization/${creds.orgId}/accounts`, {
      method: "POST",
      headers: { "Authorization": `Zoho-oauthtoken ${creds.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ accountName: `${accountName}@${dominio}`, displayName: displayName ?? accountName, password }),
    });
    const json = await r.json();
    if (r.ok) { res.status(201).json(json); }
    else { res.status(400).json({ error: "Zoho retornou erro", detalhe: json }); }
  } catch {
    res.status(500).json({ error: "Falha ao criar e-mail no Zoho" });
  }
});

// POST /api/dominios/:id/aliases
router.post("/dominios/:id/aliases", async (req, res): Promise<void> => {
  const creds = await getZohoCreds();
  if (!creds) {
    res.status(503).json({ error: "Zoho Admin não configurado" }); return;
  }
  const { accountId, aliasPrefix } = req.body ?? {};
  if (!accountId || !aliasPrefix) {
    res.status(400).json({ error: "accountId e aliasPrefix são obrigatórios" }); return;
  }
  const domRow = await db.execute(sql`SELECT dominio FROM dominios WHERE id = ${parseInt(req.params.id)}`);
  if (!domRow.rows.length) { res.status(404).json({ error: "Domínio não encontrado" }); return; }
  const dominio = (domRow.rows[0] as { dominio: string }).dominio;
  try {
    const r = await fetch(`https://mail.zoho.com/api/organization/${creds.orgId}/accounts/${accountId}/aliases`, {
      method: "POST",
      headers: { "Authorization": `Zoho-oauthtoken ${creds.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ alias: `${aliasPrefix}@${dominio}` }),
    });
    const json = await r.json();
    if (r.ok) { res.status(201).json(json); }
    else { res.status(400).json({ error: "Zoho retornou erro", detalhe: json }); }
  } catch {
    res.status(500).json({ error: "Falha ao criar alias no Zoho" });
  }
});

export default router;
