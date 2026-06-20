import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { db, professionalsTable, collaboratorAuditTable } from "@workspace/db";
import { eq, sql, desc, isNotNull } from "drizzle-orm";
import {
  createCollaboratorToken,
  verifyCollaboratorToken,
  hashPassword,
  verifyPassword,
  type CollaboratorClaims,
} from "../lib/collaborator-auth.js";

const router: IRouter = Router();

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      collaborator?: CollaboratorClaims;
    }
  }
}

function readToken(req: Request): CollaboratorClaims | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) return null;
  return verifyCollaboratorToken(header.slice("Bearer ".length).trim());
}

function clientIp(req: Request): string {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd) return fwd.split(",")[0].trim();
  return req.ip ?? "";
}

// Verifica se o usuario (comparado sem diferenciar maiusculas) ja pertence a
// OUTRO profissional. Garante unicidade case-insensitive antes da escrita.
async function usernameTaken(username: string, exceptId: number): Promise<boolean> {
  const [hit] = await db
    .select({ id: professionalsTable.id })
    .from(professionalsTable)
    .where(sql`lower(${professionalsTable.loginUsername}) = lower(${username}) and ${professionalsTable.id} <> ${exceptId}`)
    .limit(1);
  return Boolean(hit);
}

// Violacao de unicidade do Postgres (codigo 23505). Garante 409 determinístico
// mesmo se duas escritas correrem entre o pre-check e o UPDATE.
function isUniqueViolation(e: unknown): boolean {
  return Boolean(e && typeof e === "object" && (e as { code?: string }).code === "23505");
}

async function recordAudit(entry: {
  professionalId: number | null;
  professionalName: string | null;
  action: string;
  method?: string;
  path?: string;
  detail?: unknown;
  ip?: string;
}): Promise<void> {
  try {
    await db.insert(collaboratorAuditTable).values({
      professionalId: entry.professionalId,
      professionalName: entry.professionalName ?? null,
      action: entry.action,
      method: entry.method ?? null,
      path: entry.path ?? null,
      detail: (entry.detail as Record<string, unknown> | undefined) ?? null,
      ip: entry.ip ?? null,
    });
  } catch {
    // auditoria nunca pode derrubar a requisicao principal
  }
}

// Middleware: exige token de colaborador valido. Anexa req.collaborator.
export function requireCollaborator(req: Request, res: Response, next: NextFunction): void {
  const claims = readToken(req);
  if (!claims) {
    res.status(401).json({ error: "Acesso restrito: faça login de colaborador" });
    return;
  }
  req.collaborator = claims;
  next();
}

// Guarda central: protege as ESCRITAS da Central de Cadastro (site-content e
// cadastros) e registra cada escrita na auditoria. Leituras (GET) seguem livres
// porque o paciente consome os textos/videos publicamente.
const PROTECTED_WRITE_PREFIXES = ["/site-content", "/cadastros"];
export function collaboratorGuard(req: Request, res: Response, next: NextFunction): void {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") {
    next();
    return;
  }
  const path = req.path;
  const isProtected = PROTECTED_WRITE_PREFIXES.some(
    (p) => path === p || path.startsWith(p + "/"),
  );
  if (!isProtected) {
    next();
    return;
  }
  const claims = readToken(req);
  if (!claims) {
    res.status(401).json({ error: "Acesso restrito: faça login de colaborador" });
    return;
  }
  req.collaborator = claims;
  const method = req.method;
  const ip = clientIp(req);
  res.on("finish", () => {
    if (res.statusCode >= 400) return;
    void (async () => {
      const [prof] = await db
        .select({ name: professionalsTable.name })
        .from(professionalsTable)
        .where(eq(professionalsTable.id, claims.professionalId))
        .limit(1);
      await recordAudit({
        professionalId: claims.professionalId,
        professionalName: prof?.name ?? null,
        action: "write",
        method,
        path,
        detail: { role: claims.role, status: res.statusCode },
        ip,
      });
    })();
  });
  next();
}

// POST /api/collaborator/login — usuario + senha -> token de 12h.
router.post("/collaborator/login", async (req, res): Promise<void> => {
  const username = typeof req.body?.username === "string" ? req.body.username.trim() : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  if (!username || !password) {
    res.status(400).json({ error: "Usuário e senha são obrigatórios" });
    return;
  }
  const [prof] = await db
    .select()
    .from(professionalsTable)
    .where(sql`lower(${professionalsTable.loginUsername}) = lower(${username})`)
    .limit(1);
  const ok = prof && prof.active && verifyPassword(password, prof.passwordHash);
  if (!ok) {
    await recordAudit({
      professionalId: null,
      professionalName: null,
      action: "login_fail",
      detail: { username },
      ip: clientIp(req),
    });
    // Mensagem generica: nao revela se o usuario existe.
    res.status(401).json({ error: "Usuário ou senha inválidos" });
    return;
  }
  await recordAudit({
    professionalId: prof.id,
    professionalName: prof.name,
    action: "login_ok",
    ip: clientIp(req),
  });
  const token = createCollaboratorToken({ professionalId: prof.id, role: prof.role });
  res.json({
    token,
    professional: { id: prof.id, name: prof.name, role: prof.role },
  });
});

// GET /api/collaborator/me — dados do colaborador logado.
router.get("/collaborator/me", requireCollaborator, async (req, res): Promise<void> => {
  const claims = req.collaborator!;
  const [prof] = await db
    .select({ id: professionalsTable.id, name: professionalsTable.name, role: professionalsTable.role })
    .from(professionalsTable)
    .where(eq(professionalsTable.id, claims.professionalId))
    .limit(1);
  if (!prof) {
    res.status(404).json({ error: "Colaborador não encontrado" });
    return;
  }
  res.json({ professional: prof });
});

// GET /api/collaborator/bootstrap-status — informa se ainda nao existe nenhuma
// credencial (primeiro acesso) e lista profissionais para escolher.
router.get("/collaborator/bootstrap-status", async (_req, res): Promise<void> => {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(professionalsTable)
    .where(isNotNull(professionalsTable.passwordHash));
  const needsBootstrap = Number(count) === 0;
  const staff = needsBootstrap
    ? await db
        .select({ id: professionalsTable.id, name: professionalsTable.name, role: professionalsTable.role })
        .from(professionalsTable)
        .where(eq(professionalsTable.active, true))
        .orderBy(professionalsTable.name)
    : [];
  res.json({ needsBootstrap, staff });
});

// POST /api/collaborator/bootstrap — cria a PRIMEIRA credencial. So funciona
// enquanto nenhum profissional tiver senha; depois fica desligado.
router.post("/collaborator/bootstrap", async (req, res): Promise<void> => {
  const professionalId = Number(req.body?.professionalId);
  const username = typeof req.body?.username === "string" ? req.body.username.trim() : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  if (!Number.isInteger(professionalId) || !username || password.length < 6) {
    res.status(400).json({ error: "Profissional, usuário e senha (mínimo 6 caracteres) são obrigatórios" });
    return;
  }
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(professionalsTable)
    .where(isNotNull(professionalsTable.passwordHash));
  if (Number(count) > 0) {
    res.status(409).json({ error: "Primeiro acesso já foi configurado. Use o login." });
    return;
  }
  const [prof] = await db
    .select()
    .from(professionalsTable)
    .where(eq(professionalsTable.id, professionalId))
    .limit(1);
  if (!prof) {
    res.status(404).json({ error: "Profissional não encontrado" });
    return;
  }
  if (await usernameTaken(username, professionalId)) {
    res.status(409).json({ error: "Este usuário já está em uso. Escolha outro." });
    return;
  }
  try {
    await db
      .update(professionalsTable)
      .set({ loginUsername: username, passwordHash: hashPassword(password), active: true })
      .where(eq(professionalsTable.id, professionalId));
  } catch (e) {
    if (isUniqueViolation(e)) {
      res.status(409).json({ error: "Este usuário já está em uso. Escolha outro." });
      return;
    }
    throw e;
  }
  await recordAudit({
    professionalId: prof.id,
    professionalName: prof.name,
    action: "login_ok",
    detail: { bootstrap: true },
    ip: clientIp(req),
  });
  const token = createCollaboratorToken({ professionalId: prof.id, role: prof.role });
  res.status(201).json({ token, professional: { id: prof.id, name: prof.name, role: prof.role } });
});

// POST /api/collaborator/credentials — define/reseta usuario+senha de um
// profissional. Exige colaborador logado.
router.post("/collaborator/credentials", requireCollaborator, async (req, res): Promise<void> => {
  const professionalId = Number(req.body?.professionalId);
  const username = typeof req.body?.username === "string" ? req.body.username.trim() : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  if (!Number.isInteger(professionalId) || !username || password.length < 6) {
    res.status(400).json({ error: "Profissional, usuário e senha (mínimo 6 caracteres) são obrigatórios" });
    return;
  }
  const [prof] = await db
    .select()
    .from(professionalsTable)
    .where(eq(professionalsTable.id, professionalId))
    .limit(1);
  if (!prof) {
    res.status(404).json({ error: "Profissional não encontrado" });
    return;
  }
  if (await usernameTaken(username, professionalId)) {
    res.status(409).json({ error: "Este usuário já está em uso. Escolha outro." });
    return;
  }
  try {
    await db
      .update(professionalsTable)
      .set({ loginUsername: username, passwordHash: hashPassword(password) })
      .where(eq(professionalsTable.id, professionalId));
  } catch (e) {
    if (isUniqueViolation(e)) {
      res.status(409).json({ error: "Este usuário já está em uso. Escolha outro." });
      return;
    }
    throw e;
  }
  const actor = req.collaborator!;
  const [actorProf] = await db
    .select({ name: professionalsTable.name })
    .from(professionalsTable)
    .where(eq(professionalsTable.id, actor.professionalId))
    .limit(1);
  await recordAudit({
    professionalId: actor.professionalId,
    professionalName: actorProf?.name ?? null,
    action: "write",
    method: "POST",
    path: "/collaborator/credentials",
    detail: { target: professionalId, role: actor.role },
    ip: clientIp(req),
  });
  res.json({ ok: true });
});

// GET /api/collaborator/audit — ultimos eventos (quem entrou e fez o que).
router.get("/collaborator/audit", requireCollaborator, async (req, res): Promise<void> => {
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  const rows = await db
    .select()
    .from(collaboratorAuditTable)
    .orderBy(desc(collaboratorAuditTable.createdAt))
    .limit(limit);
  res.json(
    rows.map((r) => ({
      id: r.id,
      professionalId: r.professionalId,
      professionalName: r.professionalName,
      action: r.action,
      method: r.method,
      path: r.path,
      detail: r.detail,
      ip: r.ip,
      createdAt: r.createdAt.toISOString(),
    })),
  );
});

export default router;
