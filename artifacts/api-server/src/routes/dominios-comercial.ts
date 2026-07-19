import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import {
  asaasCreateCustomer,
  asaasCreateCharge,
} from "../lib/asaas.js";

const router: IRouter = Router();

// ─── Inicializar tabela proposta_dominio ──────────────────────────────────────
async function initTable() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS proposta_dominio (
      id                      SERIAL PRIMARY KEY,
      -- Clínica cliente
      clinica_nome            TEXT NOT NULL,
      clinica_cnpj            TEXT,
      clinica_email           TEXT,
      clinica_telefone        TEXT,
      clinica_responsavel     TEXT,
      -- Produto solicitado
      dominio                 TEXT NOT NULL,
      plano                   TEXT NOT NULL DEFAULT 'basico',
      emails_incluidos        INTEGER NOT NULL DEFAULT 1,
      -- Valores negociados
      valor_adesao_centavos   INTEGER NOT NULL DEFAULT 0,
      valor_mensal_centavos   INTEGER NOT NULL,
      -- Status do ciclo de vida
      status                  TEXT NOT NULL DEFAULT 'rascunho',
      -- rascunho | aprovada | cobranca_gerada | paga | ativa | cancelada
      -- Asaas
      asaas_customer_id       TEXT,
      asaas_charge_id         TEXT,
      asaas_subscription_id   TEXT,
      asaas_invoice_url       TEXT,
      asaas_pix_qr            TEXT,
      -- Domínio vinculado após ativação
      dominio_id              INTEGER,
      -- Notas internas
      notas                   TEXT,
      -- Timestamps
      criado_em               TIMESTAMP NOT NULL DEFAULT NOW(),
      atualizado_em           TIMESTAMP NOT NULL DEFAULT NOW(),
      pago_em                 TIMESTAMP,
      ativo_em                TIMESTAMP
    )
  `);
}
initTable().catch(() => {});

// ─── GET /api/dominios-comercial/propostas ────────────────────────────────────
router.get("/dominios-comercial/propostas", async (_req, res): Promise<void> => {
  try {
    const rows = await db.execute(sql`
      SELECT * FROM proposta_dominio ORDER BY criado_em DESC
    `);
    res.json({ items: rows.rows });
  } catch (e: unknown) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Erro" });
  }
});

// ─── GET /api/dominios-comercial/propostas/:id ───────────────────────────────
router.get("/dominios-comercial/propostas/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }
  try {
    const rows = await db.execute(sql`SELECT * FROM proposta_dominio WHERE id = ${id}`);
    if (!rows.rows.length) { res.status(404).json({ error: "Não encontrado" }); return; }
    res.json(rows.rows[0]);
  } catch (e: unknown) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Erro" });
  }
});

// ─── POST /api/dominios-comercial/propostas ──────────────────────────────────
router.post("/dominios-comercial/propostas", async (req, res): Promise<void> => {
  const b = req.body ?? {};
  const {
    clinica_nome, clinica_cnpj, clinica_email, clinica_telefone,
    clinica_responsavel, dominio, plano, emails_incluidos,
    valor_adesao_centavos, valor_mensal_centavos, notas,
  } = b;

  if (!clinica_nome || !dominio || !valor_mensal_centavos) {
    res.status(400).json({ error: "clinica_nome, dominio e valor_mensal_centavos são obrigatórios" });
    return;
  }
  if (valor_mensal_centavos < 500) {
    res.status(400).json({ error: "Valor mensal mínimo: R$ 5,00" });
    return;
  }

  try {
    const result = await db.execute(sql`
      INSERT INTO proposta_dominio (
        clinica_nome, clinica_cnpj, clinica_email, clinica_telefone,
        clinica_responsavel, dominio, plano, emails_incluidos,
        valor_adesao_centavos, valor_mensal_centavos, notas, status
      ) VALUES (
        ${clinica_nome}, ${clinica_cnpj ?? null}, ${clinica_email ?? null},
        ${clinica_telefone ?? null}, ${clinica_responsavel ?? null},
        ${dominio}, ${plano ?? "basico"}, ${emails_incluidos ?? 1},
        ${valor_adesao_centavos ?? 0}, ${valor_mensal_centavos},
        ${notas ?? null}, 'rascunho'
      ) RETURNING *
    `);
    res.status(201).json(result.rows[0]);
  } catch (e: unknown) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Erro ao criar" });
  }
});

// ─── PATCH /api/dominios-comercial/propostas/:id ─────────────────────────────
router.patch("/dominios-comercial/propostas/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }
  const b = req.body ?? {};
  try {
    const result = await db.execute(sql`
      UPDATE proposta_dominio SET
        clinica_nome            = COALESCE(${b.clinica_nome ?? null}, clinica_nome),
        clinica_cnpj            = COALESCE(${b.clinica_cnpj ?? null}, clinica_cnpj),
        clinica_email           = COALESCE(${b.clinica_email ?? null}, clinica_email),
        clinica_telefone        = COALESCE(${b.clinica_telefone ?? null}, clinica_telefone),
        clinica_responsavel     = COALESCE(${b.clinica_responsavel ?? null}, clinica_responsavel),
        dominio                 = COALESCE(${b.dominio ?? null}, dominio),
        plano                   = COALESCE(${b.plano ?? null}, plano),
        emails_incluidos        = COALESCE(${b.emails_incluidos ?? null}, emails_incluidos),
        valor_adesao_centavos   = COALESCE(${b.valor_adesao_centavos ?? null}, valor_adesao_centavos),
        valor_mensal_centavos   = COALESCE(${b.valor_mensal_centavos ?? null}, valor_mensal_centavos),
        notas                   = COALESCE(${b.notas ?? null}, notas),
        status                  = COALESCE(${b.status ?? null}, status),
        atualizado_em           = NOW()
      WHERE id = ${id}
      RETURNING *
    `);
    if (!result.rows.length) { res.status(404).json({ error: "Não encontrado" }); return; }
    res.json(result.rows[0]);
  } catch (e: unknown) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Erro ao atualizar" });
  }
});

// ─── POST /api/dominios-comercial/propostas/:id/gerar-cobranca ──────────────
// Cria customer no Asaas + cobrança de adesão (se valor > 0) + assinatura mensal.
router.post("/dominios-comercial/propostas/:id/gerar-cobranca", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }

  try {
    const rows = await db.execute(sql`SELECT * FROM proposta_dominio WHERE id = ${id}`);
    if (!rows.rows.length) { res.status(404).json({ error: "Não encontrado" }); return; }
    const p = rows.rows[0] as Record<string, unknown>;

    if (!p.clinica_cnpj && !p.clinica_email) {
      res.status(400).json({ error: "CNPJ ou e-mail da clínica são necessários para gerar cobrança no Asaas" });
      return;
    }

    // 1. Garante o customer no Asaas
    let customerId = p.asaas_customer_id as string | null;
    if (!customerId) {
      const customer = await asaasCreateCustomer({
        name: p.clinica_nome as string,
        cpfCnpj: (p.clinica_cnpj as string) ?? "00000000000",
        email: p.clinica_email as string | null,
        phone: p.clinica_telefone as string | null,
      });
      customerId = customer.id;
      await db.execute(sql`
        UPDATE proposta_dominio SET asaas_customer_id = ${customerId}, atualizado_em = NOW()
        WHERE id = ${id}
      `);
    }

    const adesaoCentavos = Number(p.valor_adesao_centavos ?? 0);
    const mensalCentavos = Number(p.valor_mensal_centavos ?? 0);

    let chargeId: string | null = null;
    let invoiceUrl: string | null = null;
    let pixQr: string | null = null;

    // 2. Cobrança de adesão (se valor > 0)
    if (adesaoCentavos >= 500) {
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 3);
      const dueDateStr = dueDate.toISOString().slice(0, 10);

      const charge = await asaasCreateCharge({
        customer: customerId,
        billingType: "UNDEFINED",
        value: adesaoCentavos / 100,
        dueDate: dueDateStr,
        description: `Adesão módulo domínio PAXTER — ${p.dominio}`,
        externalReference: `proposta_${id}_adesao`,
      });
      chargeId = charge.id;
      invoiceUrl = charge.invoiceUrl ?? null;
      pixQr = (charge as Record<string, unknown>).pixQrCodeUrl as string ?? null;
    }

    // 3. Assinatura recorrente mensal via Asaas subscriptions
    let subscriptionId: string | null = null;
    if (mensalCentavos >= 500) {
      const nextBilling = new Date();
      nextBilling.setDate(nextBilling.getDate() + (adesaoCentavos >= 500 ? 30 : 3));
      const nextBillingStr = nextBilling.toISOString().slice(0, 10);

      try {
        const apiKey = await import("../lib/secure-settings.js").then(m => m.getSecret("asaas.apiKey"));
        const baseUrl = await import("../lib/secure-settings.js").then(m => m.getSetting("asaas.baseUrl"));
        const url = `${(baseUrl ?? "").trim() || process.env.ASAAS_BASE_URL || "https://api.asaas.com/v3"}/subscriptions`;

        const subResp = await fetch(url, {
          method: "POST",
          signal: AbortSignal.timeout(20000),
          headers: {
            access_token: apiKey ?? "",
            "Content-Type": "application/json",
            "User-Agent": "PaxterManager",
          },
          body: JSON.stringify({
            customer: customerId,
            billingType: "UNDEFINED",
            value: mensalCentavos / 100,
            nextDueDate: nextBillingStr,
            cycle: "MONTHLY",
            description: `Módulo domínio PAXTER mensal — ${p.dominio}`,
            externalReference: `proposta_${id}_mensal`,
          }),
        });
        const subJson = await subResp.json() as Record<string, unknown>;
        if (subResp.ok && subJson.id) {
          subscriptionId = String(subJson.id);
        }
      } catch {
        // Assinatura falha silenciosamente se Asaas não tiver plano habilitado
      }
    }

    // 4. Persiste e atualiza status
    await db.execute(sql`
      UPDATE proposta_dominio SET
        asaas_customer_id    = ${customerId},
        asaas_charge_id      = ${chargeId},
        asaas_subscription_id = ${subscriptionId},
        asaas_invoice_url    = ${invoiceUrl},
        asaas_pix_qr         = ${pixQr},
        status               = 'cobranca_gerada',
        atualizado_em        = NOW()
      WHERE id = ${id}
    `);

    res.json({
      ok: true,
      asaas_customer_id: customerId,
      asaas_charge_id: chargeId,
      asaas_subscription_id: subscriptionId,
      invoice_url: invoiceUrl,
      pix_qr: pixQr,
      message: "Cobrança gerada no Asaas com sucesso",
    });
  } catch (e: unknown) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Erro ao gerar cobrança" });
  }
});

// ─── POST /api/dominios-comercial/propostas/:id/ativar ───────────────────────
// Ativação manual (CEO confirma pagamento ou dispensa adesão).
router.post("/dominios-comercial/propostas/:id/ativar", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }
  try {
    const rows = await db.execute(sql`SELECT * FROM proposta_dominio WHERE id = ${id}`);
    if (!rows.rows.length) { res.status(404).json({ error: "Não encontrado" }); return; }
    const p = rows.rows[0] as Record<string, unknown>;
    const dom = p.dominio as string;

    // Ativa ou cria o domínio na tabela dominios com modulo_pago=true
    const existing = await db.execute(sql`SELECT id FROM dominios WHERE dominio = ${dom}`);
    let dominioId: number;
    if (existing.rows.length) {
      dominioId = (existing.rows[0] as Record<string, unknown>).id as number;
      await db.execute(sql`
        UPDATE dominios SET
          modulo_pago = true,
          valor_mensal_centavos = ${Number(p.valor_mensal_centavos)},
          atualizado_em = NOW()
        WHERE id = ${dominioId}
      `);
    } else {
      const ins = await db.execute(sql`
        INSERT INTO dominios (dominio, registrador, status, modulo_pago, valor_mensal_centavos,
          titular_nome, zoho_auto_alias, dns_provider)
        VALUES (${dom}, 'manual', 'ativo', true, ${Number(p.valor_mensal_centavos)},
          ${p.clinica_nome as string}, false, 'outro')
        ON CONFLICT (dominio) DO UPDATE SET
          modulo_pago = true, valor_mensal_centavos = ${Number(p.valor_mensal_centavos)},
          atualizado_em = NOW()
        RETURNING id
      `);
      dominioId = (ins.rows[0] as Record<string, unknown>).id as number;
    }

    await db.execute(sql`
      UPDATE proposta_dominio SET
        status       = 'ativa',
        dominio_id   = ${dominioId},
        ativo_em     = NOW(),
        pago_em      = COALESCE(pago_em, NOW()),
        atualizado_em = NOW()
      WHERE id = ${id}
    `);

    res.json({ ok: true, dominio_id: dominioId, message: "Proposta ativada. Domínio marcado como módulo pago." });
  } catch (e: unknown) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Erro ao ativar" });
  }
});

// ─── POST /api/dominios-comercial/propostas/:id/cancelar ─────────────────────
router.post("/dominios-comercial/propostas/:id/cancelar", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }
  try {
    await db.execute(sql`
      UPDATE proposta_dominio SET status = 'cancelada', atualizado_em = NOW()
      WHERE id = ${id}
    `);
    res.json({ ok: true });
  } catch (e: unknown) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Erro" });
  }
});

// ─── POST /api/dominios-comercial/webhook-pago ───────────────────────────────
// Recebe confirmação de pagamento do Asaas e ativa automaticamente a proposta.
// O campo externalReference deve ser "proposta_<id>_adesao" ou "proposta_<id>_mensal".
router.post("/dominios-comercial/webhook-pago", async (req, res): Promise<void> => {
  try {
    const body = req.body ?? {};
    const event = body.event as string ?? "";
    const ref = (body.payment?.externalReference as string) ?? (body.subscription?.externalReference as string) ?? "";
    const match = ref.match(/^proposta_(\d+)_/);
    if (!match) { res.json({ ok: true, ignored: true }); return; }
    const propId = parseInt(match[1]);
    if (isNaN(propId)) { res.json({ ok: true, ignored: true }); return; }

    if (event === "PAYMENT_RECEIVED" || event === "PAYMENT_CONFIRMED") {
      await db.execute(sql`
        UPDATE proposta_dominio SET pago_em = NOW(), atualizado_em = NOW()
        WHERE id = ${propId} AND pago_em IS NULL
      `);
      // Auto-ativa se ainda não ativa
      const rows = await db.execute(sql`SELECT status FROM proposta_dominio WHERE id = ${propId}`);
      if (rows.rows.length && (rows.rows[0] as Record<string, unknown>).status !== "ativa") {
        await fetch(`http://localhost:${process.env.PORT ?? 8080}/api/dominios-comercial/propostas/${propId}/ativar`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        }).catch(() => {});
      }
    }
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Erro no webhook" });
  }
});

export default router;
