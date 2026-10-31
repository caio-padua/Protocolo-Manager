import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { getAuth } from "@clerk/express";
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
import { eq, sql, desc, asc, and, inArray, isNotNull, isNull } from "drizzle-orm";
import {
  createCollaboratorToken,
  verifyCollaboratorToken,
  hashPassword,
  verifyPassword,
  type CollaboratorClaims,
} from "../lib/collaborator-auth.js";
import { destinoPorPerfil } from "../lib/role-destino.js";
import { resolveClerkEnvironmentForRequest } from "../lib/clerk-environment.js";
import { requirePlatformOwner } from "../middleware/tenantContext.js";

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

function currentClerkUserId(req: Request): string | null {
  try {
    return getAuth(req).userId ?? null;
  } catch {
    return null;
  }
}

function clerkIdentityColumn(environment: "development" | "production") {
  return environment === "production"
    ? professionalsTable.clerkUserIdProd
    : professionalsTable.clerkUserIdDev;
}

function sessionForProfessional(prof: {
  id: number;
  name: string;
  role: string;
  category: string;
  isPrimaryDoctor: boolean;
  credentialVersion?: number | null;
}) {
  return {
    token: createCollaboratorToken({
      professionalId: prof.id,
      role: prof.role,
      credentialVersion: prof.credentialVersion ?? 0,
    }),
    professional: {
      id: prof.id,
      name: prof.name,
      role: prof.role,
      category: prof.category,
      isPrimaryDoctor: prof.isPrimaryDoctor,
    },
    destino: destinoPorPerfil({
      isPrimaryDoctor: prof.isPrimaryDoctor,
      category: prof.category,
    }),
  };
}

async function authenticatedClaims(req: Request): Promise<CollaboratorClaims | null> {
  const claims = readToken(req);
  if (!claims) return null;
  const [professional] = await db
    .select({
      id: professionalsTable.id,
      role: professionalsTable.role,
      active: professionalsTable.active,
      credentialVersion: professionalsTable.credentialVersion,
    })
    .from(professionalsTable)
    .where(eq(professionalsTable.id, claims.professionalId))
    .limit(1);
  if (
    !professional ||
    !professional.active ||
    (professional.credentialVersion ?? 0) !== (claims.credentialVersion ?? 0)
  ) return null;
  return {
    professionalId: professional.id,
    role: professional.role,
    credentialVersion: professional.credentialVersion ?? 0,
  };
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
  void authenticatedClaims(req)
    .then((claims) => {
      if (!claims) {
        res.status(401).json({ error: "Acesso restrito: faça login de colaborador" });
        return;
      }
      req.collaborator = claims;
      next();
    })
    .catch(next);
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
  void authenticatedClaims(req)
    .then((claims) => {
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
    })
    .catch(next);
}

// POST /api/collaborator/google/session — identidade Google vinculada ->
// token normal do colaborador. Google nunca substitui a autorizacao interna.
router.post("/collaborator/google/session", async (req, res): Promise<void> => {
  const environment = resolveClerkEnvironmentForRequest(req);
  if (!environment) {
    res.status(503).json({
      code: "google_auth_unavailable",
      error: "O acesso Google nao esta configurado neste ambiente.",
    });
    return;
  }

  const clerkUserId = currentClerkUserId(req);
  if (!clerkUserId) {
    res.status(401).json({
      code: "google_session_required",
      error: "Entre com sua conta Google.",
    });
    return;
  }

  const identityColumn = clerkIdentityColumn(environment);
  const [prof] = await db
    .select()
    .from(professionalsTable)
    .where(eq(identityColumn, clerkUserId))
    .limit(1);

  if (!prof || !prof.active) {
    await recordAudit({
      professionalId: null,
      professionalName: null,
      action: "login_google_fail",
      detail: { reason: "identity_unavailable", environment },
      ip: clientIp(req),
    });
    res.status(403).json({
      code: "google_account_unavailable",
      error: "Esta conta Google nao esta vinculada a um acesso ativo.",
    });
    return;
  }

  await recordAudit({
    professionalId: prof.id,
    professionalName: prof.name,
    action: "login_google_ok",
    detail: { environment },
    ip: clientIp(req),
  });
  res.json(sessionForProfessional(prof));
});

// POST /api/collaborator/google/link — exige, na mesma requisicao, sessao
// Clerk e token atual do profissional. Nenhum identificador vem do navegador.
router.post(
  "/collaborator/google/link",
  requireCollaborator,
  async (req, res): Promise<void> => {
    const claims = req.collaborator!;
    const environment = resolveClerkEnvironmentForRequest(req);
    if (!environment) {
      res.status(503).json({
        code: "google_auth_unavailable",
        error: "O acesso Google nao esta configurado neste ambiente.",
      });
      return;
    }

    const clerkUserId = currentClerkUserId(req);
    if (!clerkUserId) {
      await recordAudit({
        professionalId: claims.professionalId,
        professionalName: null,
        action: "google_link_fail",
        detail: { reason: "missing_google_session", environment },
        ip: clientIp(req),
      });
      res.status(401).json({
        code: "google_session_required",
        error: "Entre com sua conta Google.",
      });
      return;
    }

    const identityColumn = clerkIdentityColumn(environment);
    const [prof] = await db
      .select()
      .from(professionalsTable)
      .where(eq(professionalsTable.id, claims.professionalId))
      .limit(1);

    const rejectLink = async (reason: string, status: number): Promise<void> => {
      await recordAudit({
        professionalId: claims.professionalId,
        professionalName: prof?.name ?? null,
        action: "google_link_fail",
        detail: { reason, environment },
        ip: clientIp(req),
      });
      res.status(status).json({
        code: "google_link_rejected",
        error: "Esta conta Google nao pode ser vinculada a este acesso.",
      });
    };

    if (!prof || !prof.active) {
      await rejectLink("professional_unavailable", 403);
      return;
    }

    const currentIdentity =
      environment === "production" ? prof.clerkUserIdProd : prof.clerkUserIdDev;
    if (currentIdentity && currentIdentity !== clerkUserId) {
      await rejectLink("professional_already_linked", 409);
      return;
    }

    const [owner] = await db
      .select({ id: professionalsTable.id })
      .from(professionalsTable)
      .where(eq(identityColumn, clerkUserId))
      .limit(1);
    if (owner && owner.id !== prof.id) {
      await rejectLink("google_identity_already_linked", 409);
      return;
    }

    if (!currentIdentity) {
      try {
        const updated = await db
          .update(professionalsTable)
          .set(
            environment === "production"
              ? { clerkUserIdProd: clerkUserId }
              : { clerkUserIdDev: clerkUserId },
          )
          .where(
            and(
              eq(professionalsTable.id, prof.id),
              isNull(identityColumn),
            ),
          )
          .returning({ id: professionalsTable.id });

        if (updated.length === 0) {
          const [current] = await db
            .select({ identity: identityColumn })
            .from(professionalsTable)
            .where(eq(professionalsTable.id, prof.id))
            .limit(1);
          if (current?.identity !== clerkUserId) {
            await rejectLink("concurrent_link_conflict", 409);
            return;
          }
        }
      } catch (error) {
        if (isUniqueViolation(error)) {
          await rejectLink("google_identity_already_linked", 409);
          return;
        }
        throw error;
      }
    }

    await recordAudit({
      professionalId: prof.id,
      professionalName: prof.name,
      action: "google_link_ok",
      detail: { environment },
      ip: clientIp(req),
    });
    res.json(sessionForProfessional(prof));
  },
);

// POST /api/collaborator/login — usuario + senha -> token de 12h.
router.post("/collaborator/login", async (req, res): Promise<void> => {
  const identifierInput =
    typeof req.body?.identifier === "string"
      ? req.body.identifier
      : typeof req.body?.username === "string"
        ? req.body.username
        : "";
  const identifier = identifierInput.trim();
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  if (!identifier || !password) {
    res.status(400).json({ error: "E-mail, CPF ou usuário atual e senha são obrigatórios" });
    return;
  }
  const normalizedIdentifier = identifier.toLowerCase();
  const cpfDigits = identifier.replace(/[^0-9]/g, "");
  const matches = await db
    .select()
    .from(professionalsTable)
    .where(sql`
      (
        ${normalizedIdentifier} <> ''
        AND lower(btrim(coalesce(${professionalsTable.email}, ''))) = ${normalizedIdentifier}
      )
      OR (
        ${cpfDigits} <> ''
        AND regexp_replace(coalesce(${professionalsTable.cpf}, ''), '[^0-9]', '', 'g') = ${cpfDigits}
      )
      OR (
        nullif(btrim(coalesce(${professionalsTable.email}, '')), '') IS NULL
        AND nullif(regexp_replace(coalesce(${professionalsTable.cpf}, ''), '[^0-9]', '', 'g'), '') IS NULL
        AND lower(btrim(coalesce(${professionalsTable.loginUsername}, ''))) = ${normalizedIdentifier}
      )
    `)
    .limit(2);
  const prof = matches.length === 1 ? matches[0] : null;
  const senhaConfere = prof ? verifyPassword(password, prof.passwordHash) : false;
  const ok = prof && prof.active && senhaConfere;
  if (!ok) {
    // Nao guardar o identificador (e-mail/CPF/usuario), a senha ou seu tamanho.
    await recordAudit({
      professionalId: null,
      professionalName: null,
      action: "login_fail",
      detail: { reason: matches.length > 1 ? "ambiguous_identifier" : "invalid_credentials" },
      ip: clientIp(req),
    });
    res.status(401).json({ error: "Credenciais inválidas" });
    return;
  }
  await recordAudit({
    professionalId: prof.id,
    professionalName: prof.name,
    action: "login_ok",
    ip: clientIp(req),
  });
  res.json(sessionForProfessional(prof));
});

// GET /api/collaborator/me — dados do colaborador logado.
router.get("/collaborator/me", requireCollaborator, async (req, res): Promise<void> => {
  const claims = req.collaborator!;
  const environment = resolveClerkEnvironmentForRequest(req);
  const identityColumn = environment === "production"
    ? professionalsTable.clerkUserIdProd
    : environment === "development"
      ? professionalsTable.clerkUserIdDev
      : sql<string | null>`NULL`;
  const [prof] = await db
    .select({
      id: professionalsTable.id,
      name: professionalsTable.name,
      role: professionalsTable.role,
      category: professionalsTable.category,
      isPrimaryDoctor: professionalsTable.isPrimaryDoctor,
      cpf: professionalsTable.cpf,
      email: professionalsTable.email,
      crm: professionalsTable.crm,
      registrationCouncil: professionalsTable.registrationCouncil,
      registrationNumber: professionalsTable.registrationNumber,
      loginUsername: professionalsTable.loginUsername,
      hasPassword: sql<boolean>`${professionalsTable.passwordHash} IS NOT NULL`,
      active: professionalsTable.active,
      googleIdentity: identityColumn,
    })
    .from(professionalsTable)
    .where(eq(professionalsTable.id, claims.professionalId))
    .limit(1);
  if (!prof) {
    res.status(404).json({ error: "Colaborador não encontrado" });
    return;
  }
  const { googleIdentity, ...professional } = prof;
  res.json({
    professional: {
      ...professional,
      googleLinked: Boolean(googleIdentity),
    },
  });
});

// POST /api/collaborator/change-password — altera somente a senha da sessao.
// A nova versao invalida todos os tokens emitidos antes da troca.
router.post("/collaborator/change-password", requireCollaborator, async (req, res): Promise<void> => {
  const claims = req.collaborator!;
  const currentPassword =
    typeof req.body?.currentPassword === "string" ? req.body.currentPassword : "";
  const newPassword =
    typeof req.body?.newPassword === "string" ? req.body.newPassword : "";

  if (newPassword.length < 12 || newPassword.length > 128) {
    res.status(400).json({ error: "A nova senha deve ter entre 12 e 128 caracteres." });
    return;
  }
  if (!currentPassword || currentPassword.length > 512 || currentPassword === newPassword) {
    res.status(400).json({ error: "Confira a senha atual e escolha uma nova senha diferente." });
    return;
  }

  const [professional] = await db
    .select()
    .from(professionalsTable)
    .where(eq(professionalsTable.id, claims.professionalId))
    .limit(1);
  if (!professional || !professional.active || !professional.passwordHash) {
    res.status(409).json({ error: "Esta conta ainda não pode alterar a senha por este fluxo." });
    return;
  }
  if (!verifyPassword(currentPassword, professional.passwordHash)) {
    await recordAudit({
      professionalId: professional.id,
      professionalName: professional.name,
      action: "password_change_fail",
      detail: { reason: "current_password_invalid" },
      ip: clientIp(req),
    });
    res.status(401).json({ error: "A senha atual não confere." });
    return;
  }

  const nextCredentialVersion = (professional.credentialVersion ?? 0) + 1;
  const updated = await db
    .update(professionalsTable)
    .set({
      passwordHash: hashPassword(newPassword),
      credentialVersion: nextCredentialVersion,
    })
    .where(
      and(
        eq(professionalsTable.id, professional.id),
        eq(professionalsTable.credentialVersion, professional.credentialVersion ?? 0),
      ),
    )
    .returning({ id: professionalsTable.id });

  if (updated.length !== 1) {
    res.status(409).json({ error: "A conta mudou durante a operação. Entre novamente e tente de novo." });
    return;
  }

  const token = createCollaboratorToken({
    professionalId: professional.id,
    role: professional.role,
    credentialVersion: nextCredentialVersion,
  });
  await recordAudit({
    professionalId: professional.id,
    professionalName: professional.name,
    action: "password_changed",
    detail: { priorSessionsInvalidated: true },
    ip: clientIp(req),
  });
  res.json({
    ok: true,
    token,
    professional: {
      id: professional.id,
      name: professional.name,
      role: professional.role,
      category: professional.category,
      isPrimaryDoctor: professional.isPrimaryDoctor,
    },
  });
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
router.post(
  "/collaborator/credentials",
  requireCollaborator,
  requirePlatformOwner,
  async (req, res): Promise<void> => {
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
      .set({
        loginUsername: username,
        passwordHash: hashPassword(password),
        credentialVersion: sql`${professionalsTable.credentialVersion} + 1`,
      })
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
  },
);

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
