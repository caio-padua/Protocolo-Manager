import { Router, type IRouter, type Request, type Response } from "express";
import { eq, sql } from "drizzle-orm";
import { z } from "zod/v4";
import { clientsTable, db } from "@workspace/db";
import { verifyPortalToken } from "../lib/portal-token";
import { asaasCreateCharge, asaasCreateCustomer, asaasGetCharge, asaasGetPixQrCode } from "../lib/asaas";
import { brtISODate } from "../lib/brt";
import { PEDIDO_LABEL, isPedidoKind, resolvePedidoAmount, type PedidoKind } from "../lib/pedido-medico";

// ===========================================================================
// PEDIDO MEDICO DO CLIENTE (Area do Cliente). O clientId vem SEMPRE do token do
// cliente, nunca do corpo ou da URL (anti-IDOR). O cliente descreve o que precisa;
// quem decide e assina o conteudo clinico e o medico, no login dele.
// ===========================================================================

const router: IRouter = Router();
const MAX_OPEN_UNPAID = 3;

function portalClientId(req: Request): number | null {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) return null;
  return verifyPortalToken(auth.slice(7));
}

function unauthorized(res: Response) {
  res.status(401).json({ error: "Sessão expirada. Identifique-se novamente." });
}

interface PedidoRow {
  id: number; client_id: number; kind: PedidoKind; details: string; status: string;
  amount: string | null; asaas_charge_id: string | null; asaas_invoice_url: string | null;
  asaas_customer_id: string | null; created_at: string; paid_at: string | null; decision_note: string | null;
}

function publicView(r: PedidoRow) {
  return {
    id: r.id,
    kind: r.kind,
    kindLabel: PEDIDO_LABEL[r.kind],
    details: r.details,
    status: r.status,
    amount: r.amount === null ? null : Number(r.amount),
    invoiceUrl: r.asaas_invoice_url,
    paidAt: r.paid_at,
    createdAt: r.created_at,
    // So a recusa ao cliente mostra o motivo; nunca expomos medico, unidade ou ids internos.
    refusalNote: r.status === "recusado" ? r.decision_note : null,
  };
}

const CreateBody = z.object({
  kind: z.string(),
  details: z.string().trim().min(5, "Descreva o que você precisa.").max(2000),
}).strict();

const ChargeBody = z.object({ method: z.enum(["pix", "card"]).optional() }).strict();

router.post("/area-paciente/pedidos-medicos", async (req: Request, res: Response): Promise<void> => {
  const clientId = portalClientId(req);
  if (!clientId) return unauthorized(res);
  const parsed = CreateBody.safeParse(req.body);
  if (!parsed.success || !isPedidoKind(parsed.data.kind)) {
    res.status(400).json({ error: "Informe o tipo (receita ou pedido de exames) e descreva o que precisa." });
    return;
  }
  const kind = parsed.data.kind;
  try {
    const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, clientId)).limit(1);
    if (!client) return unauthorized(res);
    if (!client.empresaId || !client.locationId) {
      res.status(409).json({ error: "Seu cadastro ainda não está vinculado a uma unidade. Fale com a clínica." });
      return;
    }
    const amount = await resolvePedidoAmount(kind);
    if (amount === null) {
      res.status(503).json({ error: "Este pedido ainda não está disponível: o valor não foi configurado pela clínica." });
      return;
    }
    // Trava por cliente: dois cliques simultaneos nao passam do limite de pedidos abertos.
    const created = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"pedido-medico:" + clientId}))`);
      const open = await tx.execute(sql`
        SELECT COUNT(*)::int AS n FROM client_medical_requests
         WHERE client_id = ${clientId} AND status = 'aguardando_pagamento'`);
      if (Number((open.rows[0] as { n: number }).n) >= MAX_OPEN_UNPAID) return null;
      const ins = await tx.execute(sql`
        INSERT INTO client_medical_requests (client_id, empresa_id, location_id, kind, details, amount)
        VALUES (${clientId}, ${client.empresaId}, ${client.locationId}, ${kind}, ${parsed.data.details}, ${amount})
        RETURNING *`);
      return ins.rows[0] as unknown as PedidoRow;
    });
    if (!created) {
      res.status(429).json({ error: "Você já tem pedidos aguardando pagamento. Pague ou cancele um deles." });
      return;
    }
    res.status(201).json(publicView(created));
  } catch (err) {
    req.log.error({ err: String(err) }, "Erro ao criar pedido médico do cliente");
    res.status(500).json({ error: "Não foi possível registrar o pedido." });
  }
});

router.get("/area-paciente/pedidos-medicos", async (req: Request, res: Response): Promise<void> => {
  const clientId = portalClientId(req);
  if (!clientId) return unauthorized(res);
  try {
    const rows = await db.execute(sql`
      SELECT * FROM client_medical_requests WHERE client_id = ${clientId}
       ORDER BY created_at DESC, id DESC LIMIT 100`);
    res.json((rows.rows as unknown as PedidoRow[]).map(publicView));
  } catch (err) {
    req.log.error({ err: String(err) }, "Erro ao listar pedidos médicos do cliente");
    res.status(500).json({ error: "Não foi possível carregar seus pedidos." });
  }
});

router.post("/area-paciente/pedidos-medicos/:id/cobranca", async (req: Request, res: Response): Promise<void> => {
  const clientId = portalClientId(req);
  if (!clientId) return unauthorized(res);
  const id = Number(req.params.id);
  const body = ChargeBody.safeParse(req.body ?? {});
  if (!Number.isSafeInteger(id) || id <= 0 || !body.success) {
    res.status(400).json({ error: "Pedido inválido." });
    return;
  }
  const method = body.data.method ?? "pix";
  try {
    const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, clientId)).limit(1);
    const cpf = String(client?.cpf ?? "").replace(/\D/g, "");
    if (!client || cpf.length !== 11) {
      res.status(400).json({ error: "Seu cadastro precisa ter CPF para gerar a cobrança." });
      return;
    }
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"pedido-cobranca:" + id}))`);
      // O pedido precisa ser DESTE cliente: filtro no banco, nao so na tela.
      const found = await tx.execute(sql`
        SELECT * FROM client_medical_requests WHERE id = ${id} AND client_id = ${clientId}`);
      const row = found.rows[0] as unknown as PedidoRow | undefined;
      if (!row) return { code: 404 as const };
      if (row.status !== "aguardando_pagamento") return { code: 409 as const };
      if (row.asaas_charge_id) return { code: 200 as const, row, created: false };
      const amount = Number(row.amount);
      const customer = await asaasCreateCustomer({ name: client.name, cpfCnpj: cpf, phone: client.phone ?? null });
      const due = new Date(Date.now() + 24 * 3600 * 1000);
      const charge = await asaasCreateCharge({
        customerId: customer.id,
        billingType: method === "card" ? "UNDEFINED" : "PIX",
        value: amount,
        dueDate: brtISODate(due),
        description: `${PEDIDO_LABEL[row.kind]} — pedido ${row.id}`,
      });
      await tx.execute(sql`
        UPDATE client_medical_requests
           SET asaas_charge_id = ${charge.id}, asaas_invoice_url = ${charge.invoiceUrl ?? null},
               asaas_customer_id = ${customer.id}, updated_at = NOW()
         WHERE id = ${id}`);
      return {
        code: 201 as const,
        created: true,
        row: { ...row, asaas_charge_id: charge.id, asaas_invoice_url: charge.invoiceUrl ?? null },
      };
    });
    if (result.code === 404) { res.status(404).json({ error: "Pedido não encontrado." }); return; }
    if (result.code === 409) { res.status(409).json({ error: "Este pedido não está aguardando pagamento." }); return; }

    let pix: { pixQrImage: string; pixPayload: string; pixExpiration: string | null } | null = null;
    if (method === "pix" && result.row.asaas_charge_id) {
      try {
        const qr = await asaasGetPixQrCode(result.row.asaas_charge_id);
        if (qr.encodedImage && qr.payload) {
          pix = { pixQrImage: qr.encodedImage, pixPayload: qr.payload, pixExpiration: qr.expirationDate };
        }
      } catch (qrErr) {
        req.log.warn({ err: String(qrErr) }, "QR PIX indisponível no pedido médico (usando fatura)");
      }
    }
    res.status(result.code).json({ ...publicView(result.row), ...(pix ?? {}) });
  } catch (err) {
    req.log.error({ err: String(err) }, "Erro ao gerar cobrança do pedido médico");
    res.status(502).json({ error: "Não foi possível gerar a cobrança agora. Tente novamente." });
  }
});

// Confirmacao por consulta (alem do webhook): le o Asaas e, se pago, aplica a mesma
// transicao idempotente. Se o Asaas estiver fora do ar, devolve o ultimo estado conhecido.
router.get("/area-paciente/pedidos-medicos/:id", async (req: Request, res: Response): Promise<void> => {
  const clientId = portalClientId(req);
  if (!clientId) return unauthorized(res);
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) { res.status(400).json({ error: "Pedido inválido." }); return; }
  try {
    const found = await db.execute(sql`
      SELECT * FROM client_medical_requests WHERE id = ${id} AND client_id = ${clientId}`);
    let row = found.rows[0] as unknown as PedidoRow | undefined;
    if (!row) { res.status(404).json({ error: "Pedido não encontrado." }); return; }
    if (row.status === "aguardando_pagamento" && row.asaas_charge_id) {
      try {
        const charge = await asaasGetCharge(row.asaas_charge_id);
        if (charge.status === "RECEIVED" || charge.status === "CONFIRMED" || charge.status === "RECEIVED_IN_CASH") {
          const { markPedidoPaid } = await import("../lib/pedido-medico");
          await markPedidoPaid(row.asaas_charge_id, brtISODate());
          const again = await db.execute(sql`
            SELECT * FROM client_medical_requests WHERE id = ${id} AND client_id = ${clientId}`);
          row = again.rows[0] as unknown as PedidoRow;
        }
      } catch (e) {
        req.log.warn({ err: String(e) }, "Asaas indisponível ao consultar pedido médico");
      }
    }
    res.json(publicView(row));
  } catch (err) {
    req.log.error({ err: String(err) }, "Erro ao consultar pedido médico");
    res.status(500).json({ error: "Não foi possível carregar o pedido." });
  }
});

router.post("/area-paciente/pedidos-medicos/:id/cancelar", async (req: Request, res: Response): Promise<void> => {
  const clientId = portalClientId(req);
  if (!clientId) return unauthorized(res);
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) { res.status(400).json({ error: "Pedido inválido." }); return; }
  try {
    const upd = await db.execute(sql`
      UPDATE client_medical_requests SET status = 'cancelado', updated_at = NOW()
       WHERE id = ${id} AND client_id = ${clientId} AND status = 'aguardando_pagamento'
         AND asaas_charge_id IS NULL
   RETURNING *`);
    const row = upd.rows[0] as unknown as PedidoRow | undefined;
    if (!row) { res.status(409).json({ error: "Só é possível cancelar pedidos que aguardam pagamento e ainda não têm cobrança gerada." }); return; }
    res.json(publicView(row));
  } catch (err) {
    req.log.error({ err: String(err) }, "Erro ao cancelar pedido médico");
    res.status(500).json({ error: "Não foi possível cancelar o pedido." });
  }
});

export default router;
