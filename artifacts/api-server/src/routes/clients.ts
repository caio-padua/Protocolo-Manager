import { Router, type IRouter } from "express";
import { eq, ilike, or } from "drizzle-orm";
import { db, clientsTable } from "@workspace/db";
import {
  ListClientsQueryParams,
  CreateClientBody,
  GetClientParams,
  UpdateClientParams,
  UpdateClientBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/clients", async (req, res): Promise<void> => {
  const query = ListClientsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  let queryBuilder = db.select().from(clientsTable);

  const conditions: ReturnType<typeof ilike>[] = [];
  if (query.data.search) {
    conditions.push(ilike(clientsTable.name, `%${query.data.search}%`));
    conditions.push(ilike(clientsTable.cpf, `%${query.data.search}%`));
  }

  let clients;
  if (query.data.status) {
    clients = await db.select().from(clientsTable).where(eq(clientsTable.status, query.data.status));
  } else if (conditions.length > 0) {
    clients = await db.select().from(clientsTable).where(or(...conditions));
  } else {
    clients = await db.select().from(clientsTable);
  }

  res.json(clients.map(c => ({
    ...c,
    birthDate: c.birthDate ?? null,
    address: c.address ?? null,
    pais: c.pais ?? null,
    instagram: c.instagram ?? null,
    comoConheceu: c.comoConheceu ?? null,
    notes: c.notes ?? null,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  })));
});

router.post("/clients", async (req, res): Promise<void> => {
  const parsed = CreateClientBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [client] = await db.insert(clientsTable).values(parsed.data).returning();
  res.status(201).json({
    ...client,
    birthDate: client.birthDate ?? null,
    address: client.address ?? null,
    pais: client.pais ?? null,
    instagram: client.instagram ?? null,
    comoConheceu: client.comoConheceu ?? null,
    notes: client.notes ?? null,
    createdAt: client.createdAt.toISOString(),
    updatedAt: client.updatedAt.toISOString(),
  });
});

router.get("/clients/:id", async (req, res): Promise<void> => {
  const params = GetClientParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, params.data.id));
  if (!client) {
    res.status(404).json({ error: "Client not found" });
    return;
  }

  res.json({
    ...client,
    birthDate: client.birthDate ?? null,
    address: client.address ?? null,
    pais: client.pais ?? null,
    instagram: client.instagram ?? null,
    comoConheceu: client.comoConheceu ?? null,
    notes: client.notes ?? null,
    createdAt: client.createdAt.toISOString(),
    updatedAt: client.updatedAt.toISOString(),
  });
});

router.put("/clients/:id", async (req, res): Promise<void> => {
  const params = UpdateClientParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateClientBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [client] = await db.update(clientsTable).set(parsed.data).where(eq(clientsTable.id, params.data.id)).returning();
  if (!client) {
    res.status(404).json({ error: "Client not found" });
    return;
  }

  res.json({
    ...client,
    birthDate: client.birthDate ?? null,
    address: client.address ?? null,
    pais: client.pais ?? null,
    instagram: client.instagram ?? null,
    comoConheceu: client.comoConheceu ?? null,
    notes: client.notes ?? null,
    createdAt: client.createdAt.toISOString(),
    updatedAt: client.updatedAt.toISOString(),
  });
});

router.patch("/clients/:id", async (req, res): Promise<void> => {
  const params = UpdateClientParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateClientBody.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [client] = await db.update(clientsTable).set(parsed.data).where(eq(clientsTable.id, params.data.id)).returning();
  if (!client) {
    res.status(404).json({ error: "Client not found" });
    return;
  }

  res.json({
    ...client,
    birthDate: client.birthDate ?? null,
    address: client.address ?? null,
    pais: client.pais ?? null,
    instagram: client.instagram ?? null,
    comoConheceu: client.comoConheceu ?? null,
    notes: client.notes ?? null,
    createdAt: client.createdAt.toISOString(),
    updatedAt: client.updatedAt.toISOString(),
  });
});

router.get("/cep/:cep", async (req, res): Promise<void> => {
  const cep = req.params.cep.replace(/\D/g, "");
  if (cep.length !== 8) {
    res.status(400).json({ error: "CEP invalido" });
    return;
  }
  try {
    const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
    const data = await response.json();
    if (data.erro) {
      res.status(404).json({ error: "CEP nao encontrado" });
      return;
    }
    res.json({
      cep: data.cep,
      logradouro: data.logradouro,
      complemento: data.complemento,
      bairro: data.bairro,
      localidade: data.localidade,
      uf: data.uf,
    });
  } catch (err) {
    res.status(500).json({ error: "Erro ao consultar CEP" });
  }
});

export default router;
