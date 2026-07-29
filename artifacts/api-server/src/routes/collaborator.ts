import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import {
  db,
  professionalsTable,
  collaboratorAuditTable,
  clientsTable,
  anamneseSessionsTable,
  anamneseFindingsTable,
  anamneseRefusalsTable,
  anamneseGroupNotesTable,
  anamneseSessionAnswersTable,
  anamneseQuestionarioTable,
} from "@workspace/db";
import { eq, sql, desc, and, inArray, isNotNull } from "drizzle-orm";
import {
  createCollaboratorToken,
  verifyCollaboratorToken,
  hashPassword,
  verifyPassword,
  type CollaboratorClaims,
} from "../lib/collaborator-auth.js";
import { destinoPorPerfil } from "../lib/role-destino.js";

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
  const senhaConfere = prof ? verifyPassword(password, prof.passwordHash) : false;
  const ok = prof && prof.active && senhaConfere;
  if (!ok) {
    // Distingue as tres causas de recusa. A resposta ao cliente continua
    // generica; isto e so para a auditoria, que e interna.
    // Nunca registrar a senha — apenas o comprimento recebido.
    await recordAudit({
      professionalId: null,
      professionalName: null,
      action: "login_fail",
      detail: {
        username,
        motivo: !prof
          ? "usuario_nao_encontrado"
          : !prof.active
            ? "usuario_inativo"
            : "senha_incorreta",
        senhaLen: password.length,
      },
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
    professional: {
      id: prof.id,
      name: prof.name,
      role: prof.role,
      category: prof.category,
      isPrimaryDoctor: prof.isPrimaryDoctor,
    },
    // Destino pronto para o site publico redirecionar (mapa em lib/role-destino.ts).
    destino: destinoPorPerfil({
      isPrimaryDoctor: prof.isPrimaryDoctor,
      category: prof.category,
    }),
  });
});

// GET /api/collaborator/me — dados do colaborador logado.
router.get("/collaborator/me", requireCollaborator, async (req, res): Promise<void> => {
  const claims = req.collaborator!;
  const [prof] = await db
    .select({
      id: professionalsTable.id,
      name: professionalsTable.name,
      role: professionalsTable.role,
      category: professionalsTable.category,
      isPrimaryDoctor: professionalsTable.isPrimaryDoctor,
    })
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

// ----------------------------------------------------------------------------
// Revisao da Anamnese (PII clinica) — SO colaborador autenticado
// ----------------------------------------------------------------------------

// GET /collaborator/anamnese/sessions — lista com resumo + nome do cliente
router.get(
  "/collaborator/anamnese/sessions",
  requireCollaborator,
  async (req, res): Promise<void> => {
    const filterClientId = req.query.clientId ? Number(req.query.clientId) : null;
    const filterStatus = typeof req.query.status === "string" ? req.query.status : null;

    const conds = [] as ReturnType<typeof eq>[];
    if (filterClientId !== null && Number.isFinite(filterClientId)) {
      conds.push(eq(anamneseSessionsTable.clientId, filterClientId));
    }
    if (filterStatus) {
      conds.push(eq(anamneseSessionsTable.status, filterStatus));
    }

    const rows = await db
      .select({
        id: anamneseSessionsTable.id,
        clientId: anamneseSessionsTable.clientId,
        clientName: clientsTable.name,
        mode: anamneseSessionsTable.mode,
        status: anamneseSessionsTable.status,
        startedAt: anamneseSessionsTable.startedAt,
        completedAt: anamneseSessionsTable.completedAt,
      })
      .from(anamneseSessionsTable)
      .leftJoin(clientsTable, eq(clientsTable.id, anamneseSessionsTable.clientId))
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(anamneseSessionsTable.completedAt), desc(anamneseSessionsTable.startedAt));

    const ids = rows.map((r) => r.id);
    const findings = ids.length
      ? await db
          .select({
            sessionId: anamneseFindingsTable.sessionId,
            tipo: anamneseFindingsTable.tipo,
            severidade: anamneseFindingsTable.severidade,
          })
          .from(anamneseFindingsTable)
          .where(inArray(anamneseFindingsTable.sessionId, ids))
      : [];

    const bySession = new Map<number, { diagnosticado: number; suspeito: number; temAlarme: boolean }>();
    for (const f of findings) {
      const cur = bySession.get(f.sessionId) ?? { diagnosticado: 0, suspeito: 0, temAlarme: false };
      if (f.tipo === "diagnosticado") cur.diagnosticado += 1;
      else if (f.tipo === "suspeito") cur.suspeito += 1;
      if ((f.severidade ?? "").toLowerCase() === "alta") cur.temAlarme = true;
      bySession.set(f.sessionId, cur);
    }

    res.json(
      rows.map((r) => {
        const c = bySession.get(r.id) ?? { diagnosticado: 0, suspeito: 0, temAlarme: false };
        return {
          id: r.id,
          clientId: r.clientId,
          clientName: r.clientName ?? null,
          mode: r.mode,
          status: r.status,
          startedAt: r.startedAt.toISOString(),
          completedAt: r.completedAt ? r.completedAt.toISOString() : null,
          diagnosticado: c.diagnosticado,
          suspeito: c.suspeito,
          temAlarme: c.temAlarme,
        };
      }),
    );
  },
);

// GET /collaborator/anamnese/sessions/:id — detalhe completo por id da sessao
router.get(
  "/collaborator/anamnese/sessions/:id",
  requireCollaborator,
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "id invalido" });
      return;
    }
    const [session] = await db
      .select({
        id: anamneseSessionsTable.id,
        clientId: anamneseSessionsTable.clientId,
        clientName: clientsTable.name,
        mode: anamneseSessionsTable.mode,
        status: anamneseSessionsTable.status,
        startedAt: anamneseSessionsTable.startedAt,
        completedAt: anamneseSessionsTable.completedAt,
      })
      .from(anamneseSessionsTable)
      .leftJoin(clientsTable, eq(clientsTable.id, anamneseSessionsTable.clientId))
      .where(eq(anamneseSessionsTable.id, id))
      .limit(1);
    if (!session) {
      res.status(404).json({ error: "Sessao nao encontrada" });
      return;
    }

    const [findings, refusals, notes, respostas] = await Promise.all([
      db
        .select()
        .from(anamneseFindingsTable)
        .where(eq(anamneseFindingsTable.sessionId, id))
        .orderBy(desc(anamneseFindingsTable.tipo)),
      db
        .select()
        .from(anamneseRefusalsTable)
        .where(eq(anamneseRefusalsTable.sessionId, id)),
      db
        .select()
        .from(anamneseGroupNotesTable)
        .where(eq(anamneseGroupNotesTable.sessionId, id)),
      // Respostas cruas + enunciado da pergunta (join por questionRowId -> id
      // numerico do questionario; perguntaId REPETE e nunca e chave).
      db
        .select({
          id: anamneseSessionAnswersTable.id,
          perguntaId: anamneseSessionAnswersTable.perguntaId,
          valor: anamneseSessionAnswersTable.valor,
          respondidoEm: anamneseSessionAnswersTable.respondidoEm,
          pergunta: anamneseQuestionarioTable.pergunta,
          bloco: anamneseQuestionarioTable.bloco,
          sistema: anamneseQuestionarioTable.sistema,
          tipoResposta: anamneseQuestionarioTable.tipoResposta,
          ordem: anamneseQuestionarioTable.ordem,
        })
        .from(anamneseSessionAnswersTable)
        .leftJoin(
          anamneseQuestionarioTable,
          eq(anamneseQuestionarioTable.id, anamneseSessionAnswersTable.questionRowId),
        )
        .where(eq(anamneseSessionAnswersTable.sessionId, id)),
    ]);

    const respostasOrdenadas = [...respostas].sort((a, b) => {
      const blocoA = a.bloco ?? "";
      const blocoB = b.bloco ?? "";
      if (blocoA !== blocoB) return blocoA.localeCompare(blocoB, "pt-BR");
      return (a.ordem ?? 0) - (b.ordem ?? 0);
    });

    res.json({
      id: session.id,
      clientId: session.clientId,
      clientName: session.clientName ?? null,
      mode: session.mode,
      status: session.status,
      startedAt: session.startedAt.toISOString(),
      completedAt: session.completedAt ? session.completedAt.toISOString() : null,
      findings: findings.map((f) => ({
        id: f.id,
        tipo: f.tipo,
        rotulo: f.rotulo,
        severidade: f.severidade ?? null,
        origemPerguntaId: f.origemPerguntaId,
      })),
      refusals: refusals.map((r) => ({
        id: r.id,
        escopo: r.escopo,
        alvo: r.alvo,
        motivo: r.motivo ?? null,
      })),
      notes: notes.map((n) => ({
        id: n.id,
        grupo: n.grupo,
        observacao: n.observacao,
      })),
      respostas: respostasOrdenadas.map((r) => ({
        id: r.id,
        perguntaId: r.perguntaId ?? null,
        pergunta: r.pergunta ?? null,
        bloco: r.bloco ?? null,
        sistema: r.sistema ?? null,
        tipoResposta: r.tipoResposta ?? null,
        valor: r.valor,
        respondidoEm: r.respondidoEm.toISOString(),
      })),
    });
  },
);

export default router;
