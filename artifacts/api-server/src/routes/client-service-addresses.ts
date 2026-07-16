import { Router, type IRouter } from "express";
import { db, clientServiceAddressesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

const router: IRouter = Router();

// ── GET /client-service-addresses?clientId=N ───────────────────────────────
// Lista todos os endereços de serviço de um cliente (usados pelo Lançador,
// Agenda, RAS/FAP e contratos jurídicos de Home Nurse).
router.get("/client-service-addresses", async (req, res): Promise<void> => {
  const clientId = parseInt(String(req.query.clientId ?? ""));
  if (isNaN(clientId)) {
    res.status(400).json({ error: "clientId é obrigatório" });
    return;
  }
  const rows = await db
    .select()
    .from(clientServiceAddressesTable)
    .where(eq(clientServiceAddressesTable.clientId, clientId));
  res.json(rows.map(fmt));
});

// ── POST /client-service-addresses ─────────────────────────────────────────
// Cria novo endereço de serviço. Se isDefault=true, remove o padrão anterior
// (apenas 1 endereço pode ser padrão por cliente).
router.post("/client-service-addresses", async (req, res): Promise<void> => {
  const {
    clientId, label, cep, logradouro, numero, complemento,
    bairro, cidade, estado, isDefault,
  } = req.body as {
    clientId?: number;
    label?: string;
    cep?: string | null;
    logradouro?: string;
    numero?: string | null;
    complemento?: string | null;
    bairro?: string | null;
    cidade?: string;
    estado?: string;
    isDefault?: boolean;
  };
  if (!clientId || !label?.trim() || !logradouro?.trim() || !cidade?.trim()) {
    res.status(400).json({ error: "clientId, label, logradouro e cidade são obrigatórios" });
    return;
  }

  // Se marcando como padrão, limpa o padrão atual do cliente.
  if (isDefault) {
    await db
      .update(clientServiceAddressesTable)
      .set({ isDefault: false })
      .where(
        and(
          eq(clientServiceAddressesTable.clientId, clientId),
          eq(clientServiceAddressesTable.isDefault, true),
        ),
      );
  }

  const [created] = await db
    .insert(clientServiceAddressesTable)
    .values({
      clientId,
      label: label.trim(),
      cep: cep ?? null,
      logradouro: logradouro.trim(),
      numero: numero ?? null,
      complemento: complemento ?? null,
      bairro: bairro ?? null,
      cidade: cidade.trim(),
      estado: estado?.trim() ?? "SP",
      isDefault: isDefault ?? false,
    })
    .returning();
  res.status(201).json(fmt(created));
});

// ── PATCH /client-service-addresses/:id ────────────────────────────────────
// Atualiza label ou campos de endereço. Se isDefault=true, remove o anterior.
router.patch("/client-service-addresses/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Id inválido" });
    return;
  }
  const [row] = await db
    .select()
    .from(clientServiceAddressesTable)
    .where(eq(clientServiceAddressesTable.id, id));
  if (!row) {
    res.status(404).json({ error: "Endereço não encontrado" });
    return;
  }

  const {
    label, cep, logradouro, numero, complemento, bairro, cidade, estado, isDefault,
  } = req.body as {
    label?: string;
    cep?: string | null;
    logradouro?: string;
    numero?: string | null;
    complemento?: string | null;
    bairro?: string | null;
    cidade?: string;
    estado?: string;
    isDefault?: boolean;
  };

  if (isDefault) {
    await db
      .update(clientServiceAddressesTable)
      .set({ isDefault: false })
      .where(
        and(
          eq(clientServiceAddressesTable.clientId, row.clientId),
          eq(clientServiceAddressesTable.isDefault, true),
        ),
      );
  }

  const [updated] = await db
    .update(clientServiceAddressesTable)
    .set({
      ...(label !== undefined ? { label: label.trim() } : {}),
      ...(cep !== undefined ? { cep } : {}),
      ...(logradouro !== undefined ? { logradouro: logradouro.trim() } : {}),
      ...(numero !== undefined ? { numero } : {}),
      ...(complemento !== undefined ? { complemento } : {}),
      ...(bairro !== undefined ? { bairro } : {}),
      ...(cidade !== undefined ? { cidade: cidade.trim() } : {}),
      ...(estado !== undefined ? { estado: estado.trim() } : {}),
      ...(isDefault !== undefined ? { isDefault } : {}),
    })
    .where(eq(clientServiceAddressesTable.id, id))
    .returning();
  res.json(fmt(updated));
});

// ── DELETE /client-service-addresses/:id ───────────────────────────────────
router.delete("/client-service-addresses/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Id inválido" });
    return;
  }
  await db.delete(clientServiceAddressesTable).where(eq(clientServiceAddressesTable.id, id));
  res.json({ success: true });
});

function fmt(r: typeof clientServiceAddressesTable.$inferSelect) {
  return {
    id: r.id,
    clientId: r.clientId,
    label: r.label,
    cep: r.cep ?? null,
    logradouro: r.logradouro,
    numero: r.numero ?? null,
    complemento: r.complemento ?? null,
    bairro: r.bairro ?? null,
    cidade: r.cidade,
    estado: r.estado,
    isDefault: r.isDefault,
    createdAt: r.createdAt.toISOString(),
  };
}

export default router;
