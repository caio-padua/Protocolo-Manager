import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { getAuth } from "@clerk/express";
import type { PaxterDoc } from "../lib/messaging/types.js";
import { enviarMensagemPaxter } from "../lib/messaging/engine.js";
import { absoluteBaseUrl } from "../lib/messaging/base-url.js";
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
import { eq, sql, desc, asc, and, inArray, isNull } from "drizzle-orm";
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
const DEV_PRIMARY_RECOVERY_TTL_MS = 10 * 60 * 1000;
const DEV_PRIMARY_RECOVERY_START_LIMIT = 10;
const DEV_PRIMARY_RECOVERY_WINDOW_MS = 10 * 60 * 1000;
const PASSWORD_RECOVERY_TTL_MS = 30 * 60 * 1000;
const PASSWORD_RECOVERY_WINDOW_MS = 15 * 60 * 1000;
const PASSWORD_RECOVERY_REQUEST_LIMIT = 4;
const PASSWORD_RECOVERY_IP_LIMIT = 20;
const devPrimaryRecoveryChallenges = new Map<
  string,
  { professionalId: number; expiresAt: number; inProgress: boolean }
>();
const devPrimaryRecoveryStarts = new Map<string, number[]>();
const passwordRecoveryRequests = new Map<string, number[]>();
const passwordRecoveryIpRequests = new Map<string, number[]>();
const passwordRecoveryAccountRequests = new Map<string, number[]>();

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

function isDevelopmentRecoveryAvailable(): boolean {
  return process.env.NODE_ENV === "development" &&
    Boolean(process.env.REPLIT_DEV_DOMAIN?.trim());
}

function recoveryChallengeDigest(challenge: string): string {
  return createHash("sha256").update(challenge).digest("hex");
}

interface PasswordRecoveryClaims {
  professionalId: number;
  credentialVersion: number;
  expiresAt: number;
  environment: "development" | "production";
  nonce: string;
}

function passwordRecoveryEnvironment(): "development" | "production" {
  return process.env.NODE_ENV === "production" ? "production" : "development";
}

function signPasswordRecoveryClaims(claims: PasswordRecoveryClaims): string | null {
  const secret = process.env.SESSION_SECRET;
  if (!secret) return null;
  const encoded = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const signature = createHmac("sha256", secret).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

function verifyPasswordRecoveryToken(token: string): PasswordRecoveryClaims | null {
  if (!token || token.length > 4096) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const secret = process.env.SESSION_SECRET;
  if (!secret) return null;
  const [encoded, signature] = parts;
  const expected = createHmac("sha256", secret).update(encoded).digest();
  let supplied: Buffer;
  try {
    supplied = Buffer.from(signature, "base64url");
  } catch {
    return null;
  }
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null;
  try {
    const claims = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as
      Partial<PasswordRecoveryClaims>;
    if (
      !Number.isSafeInteger(claims.professionalId) ||
      Number(claims.professionalId) <= 0 ||
      !Number.isSafeInteger(claims.credentialVersion) ||
      Number(claims.credentialVersion) < 0 ||
      !Number.isSafeInteger(claims.expiresAt) ||
      Number(claims.expiresAt) <= Date.now() ||
      claims.environment !== passwordRecoveryEnvironment() ||
      typeof claims.nonce !== "string" ||
      claims.nonce.length < 20
    ) return null;
    return claims as PasswordRecoveryClaims;
  } catch {
    return null;
  }
}

function allowRecoveryAttempt(
  bucket: Map<string, number[]>,
  key: string,
  maxAttempts: number,
): boolean {
  const now = Date.now();
  const recent = (bucket.get(key) ?? [])
    .filter((startedAt) => now - startedAt < PASSWORD_RECOVERY_WINDOW_MS);
  if (recent.length >= maxAttempts) {
    bucket.set(key, recent);
    return false;
  }
  recent.push(now);
  bucket.set(key, recent);
  return true;
}

function maskedAuditValue(value: unknown): string {
  if (value == null || value === "") return "—";
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  if (Array.isArray(value)) return value.map(String).join(", ").slice(0, 120) || "—";
  return String(value).slice(0, 120);
}

const PROFESSIONAL_HISTORY_FIELDS = {
  name: "Nome completo",
  role: "Cargo",
  category: "Categoria",
  professionalType: "Tipo profissional",
  registrationCouncil: "Conselho profissional",
  registrationNumber: "Número de registro",
  crm: "Registro médico",
  specialty: "Especialidade",
  unit: "Unidade principal",
  serviceTypes: "Tipos de atendimento",
  active: "Conta ativa",
} as const;

/**
 * Persiste somente diferenças de campos profissionais não secretos, e apenas
 * quando o profissional autenticado está alterando o próprio cadastro.
 */
export async function recordOwnProfessionalProfileChange(
  tx: any,
  req: Request,
  previous: Record<string, unknown>,
  next: Record<string, unknown>,
): Promise<void> {
  const actorId = req.collaborator?.professionalId;
  const targetId = Number(next.id ?? previous.id);
  if (!actorId || actorId !== targetId) return;

  const changes: Record<string, { before: string; after: string }> = {};
  for (const [key, label] of Object.entries(PROFESSIONAL_HISTORY_FIELDS)) {
    const before = previous[key];
    const after = next[key];
    if (JSON.stringify(before ?? null) === JSON.stringify(after ?? null)) continue;
    changes[label] = {
      before: maskedAuditValue(before),
      after: maskedAuditValue(after),
    };
  }
  for (const key of ["email", "cpf"] as const) {
    if (key in next && String(previous[key] ?? "") !== String(next[key] ?? "")) {
      changes[key === "email" ? "E-mail de acesso" : "CPF"] = {
        before: "Valor protegido",
        after: "Valor protegido",
      };
    }
  }
  if (!Object.keys(changes).length) return;

  const [actor] = await tx
    .select({ name: professionalsTable.name })
    .from(professionalsTable)
    .where(eq(professionalsTable.id, actorId))
    .limit(1);
  await tx.insert(collaboratorAuditTable).values({
    professionalId: actorId,
    professionalName: actor?.name ?? null,
    action: "professional_profile_updated",
    method: req.method,
    path: req.path,
    detail: { changes },
    ip: clientIp(req),
  });
}

const ACCOUNT_HISTORY_ACTIONS = [
  "identity_updated",
  "password_changed",
  "password_initialized",
  "password_recovered",
  "professional_profile_updated",
] as const;

function serializeOwnAccountHistoryEvent(row: {
  id: number;
  action: string;
  detail: unknown;
  createdAt: Date;
}): {
  id: number;
  action: string;
  label: string;
  createdAt: string;
  changes: { field: string; before: string; after: string }[];
} | null {
  const labels: Record<string, string> = {
    identity_updated: "Identificadores de acesso atualizados",
    password_changed: "Senha alterada",
    password_initialized: "Primeira senha cadastrada",
    password_recovered: "Senha redefinida por recuperação",
    professional_profile_updated: "Dados profissionais atualizados",
  };
  const label = labels[row.action];
  if (!label) return null;
  const detail = row.detail && typeof row.detail === "object"
    ? row.detail as Record<string, unknown>
    : {};
  const changes: { field: string; before: string; after: string }[] = [];

  if (row.action === "professional_profile_updated") {
    const storedChanges = detail.changes && typeof detail.changes === "object"
      ? detail.changes as Record<string, unknown>
      : {};
    const allowedLabels = new Set([
      ...Object.values(PROFESSIONAL_HISTORY_FIELDS),
      "E-mail de acesso",
      "CPF",
    ]);
    for (const [field, rawChange] of Object.entries(storedChanges)) {
      if (!allowedLabels.has(field) || !rawChange || typeof rawChange !== "object") continue;
      const change = rawChange as Record<string, unknown>;
      const protectedField = field === "E-mail de acesso" || field === "CPF";
      changes.push({
        field,
        before: protectedField ? "Valor protegido" : maskedAuditValue(change.before),
        after: protectedField ? "Valor protegido" : maskedAuditValue(change.after),
      });
    }
  } else if (row.action === "identity_updated") {
    if (detail.emailUpdated === true) {
      changes.push({ field: "E-mail de acesso", before: "Valor protegido", after: "Valor protegido" });
    }
    if (detail.cpfUpdated === true) {
      changes.push({ field: "CPF", before: "Valor protegido", after: "Valor protegido" });
    }
  }

  return {
    id: row.id,
    action: row.action,
    label,
    createdAt: row.createdAt.toISOString(),
    changes,
  };
}

function recoveryStartAllowed(ip: string): boolean {
  const now = Date.now();
  const recent = (devPrimaryRecoveryStarts.get(ip) ?? [])
    .filter((startedAt) => now - startedAt < DEV_PRIMARY_RECOVERY_WINDOW_MS);
  if (recent.length >= DEV_PRIMARY_RECOVERY_START_LIMIT) {
    devPrimaryRecoveryStarts.set(ip, recent);
    return false;
  }
  recent.push(now);
  devPrimaryRecoveryStarts.set(ip, recent);
  return true;
}

async function findUniqueActivePrimaryDoctor() {
  const candidates = await db
    .select()
    .from(professionalsTable)
    .where(
      and(
        eq(professionalsTable.isPrimaryDoctor, true),
        eq(professionalsTable.active, true),
      ),
    )
    .limit(2);
  if (
    candidates.length !== 1 ||
    !candidates[0].isPlatformOwner
  ) return null;
  return candidates[0];
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

export function normalizeCpf(raw: string): string {
  return raw.replace(/[^0-9]/g, "");
}

export function isValidCpf(raw: string): boolean {
  const cpf = normalizeCpf(raw);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const digit = (length: number): number => {
    let sum = 0;
    for (let i = 0; i < length; i += 1) {
      sum += Number(cpf[i]) * (length + 1 - i);
    }
    const remainder = (sum * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };
  return digit(9) === Number(cpf[9]) && digit(10) === Number(cpf[10]);
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
  const rawCpfDigits = normalizeCpf(identifier);
  const cpfDigits = rawCpfDigits.length === 11 ? rawCpfDigits : "";
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

const PASSWORD_RECOVERY_GENERIC_RESPONSE = {
  message: "Se houver uma conta ativa com esse identificador e e-mail cadastrado, enviaremos as instruções.",
};

// Solicitação pública de recuperação. A resposta é sempre igual para impedir
// que a tela seja usada para descobrir quais identificadores existem.
router.post("/collaborator/password-recovery/request", async (req, res): Promise<void> => {
  res.set("Cache-Control", "no-store");
  const rawIdentifier = typeof req.body?.identifier === "string"
    ? req.body.identifier.trim()
    : "";
  if (!rawIdentifier || rawIdentifier.length > 254) {
    res.status(202).json(PASSWORD_RECOVERY_GENERIC_RESPONSE);
    return;
  }

  const normalized = rawIdentifier.toLowerCase();
  const ipKey = createHash("sha256").update(req.ip ?? "unknown").digest("hex");
  const identifierKey = createHash("sha256")
    .update(`${ipKey}:${normalized}`)
    .digest("hex");
  if (
    !allowRecoveryAttempt(passwordRecoveryRequests, identifierKey, PASSWORD_RECOVERY_REQUEST_LIMIT) ||
    !allowRecoveryAttempt(passwordRecoveryIpRequests, ipKey, PASSWORD_RECOVERY_IP_LIMIT)
  ) {
    res.status(202).json(PASSWORD_RECOVERY_GENERIC_RESPONSE);
    return;
  }

  const digits = normalizeCpf(rawIdentifier);
  const canMatchCpf = digits.length === 11;
  const [matches] = await Promise.all([
    db
      .select()
      .from(professionalsTable)
      .where(sql`
        ${professionalsTable.active} = true
        AND (
          (${rawIdentifier.includes("@")} AND lower(btrim(coalesce(${professionalsTable.email}, ''))) = ${normalized})
          OR (${canMatchCpf} AND regexp_replace(coalesce(${professionalsTable.cpf}, ''), '[^0-9]', '', 'g') = ${digits})
          OR (
            lower(btrim(coalesce(${professionalsTable.loginUsername}, ''))) = ${normalized}
            AND coalesce(btrim(${professionalsTable.email}), '') = ''
            AND regexp_replace(coalesce(${professionalsTable.cpf}, ''), '[^0-9]', '', 'g') = ''
          )
        )
      `)
      .limit(2),
  ]);
  const professional = matches.length === 1 ? matches[0] : null;
  const email = professional?.email?.trim();
  if (
    professional &&
    !allowRecoveryAttempt(
      passwordRecoveryAccountRequests,
      String(professional.id),
      PASSWORD_RECOVERY_REQUEST_LIMIT,
    )
  ) {
    res.status(202).json(PASSWORD_RECOVERY_GENERIC_RESPONSE);
    return;
  }
  if (
    !professional ||
    !email ||
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    !process.env.SESSION_SECRET
  ) {
    res.status(202).json(PASSWORD_RECOVERY_GENERIC_RESPONSE);
    return;
  }

  const recoveryToken = signPasswordRecoveryClaims({
    professionalId: professional.id,
    credentialVersion: professional.credentialVersion ?? 0,
    expiresAt: Date.now() + PASSWORD_RECOVERY_TTL_MS,
    environment: passwordRecoveryEnvironment(),
    nonce: randomBytes(24).toString("base64url"),
  });
  if (!recoveryToken) {
    res.status(202).json(PASSWORD_RECOVERY_GENERIC_RESPONSE);
    return;
  }

  const recoveryUrl = new URL("/login", absoluteBaseUrl(req));
  recoveryUrl.searchParams.set("recoveryToken", recoveryToken);
  const doc: PaxterDoc = {
    eyebrow: "SEGURANÇA DA CONTA",
    titulo: "Redefinição de senha",
    paragrafos: [
      "Foi solicitada a criação de uma nova senha para o seu acesso profissional.",
      "O link é pessoal, vale por 30 minutos e funciona uma única vez.",
      "Se você não solicitou esta alteração, ignore esta mensagem.",
    ],
    botao: { label: "Criar nova senha", url: recoveryUrl.toString() },
    notaRodape: "Não encaminhe este link. A equipe da clínica nunca pedirá sua senha.",
    assunto: "Redefinição de senha — PAXTER",
  };

  try {
    const result = await enviarMensagemPaxter(
      doc,
      { email, nome: professional.name },
      ["EMAIL"],
      { baseUrl: absoluteBaseUrl(req), contexto: "recuperacao_acesso_profissional" },
    );
    const emailResult = result.resultados.find((item) => item.canal === "EMAIL");
    if (!emailResult?.sent || emailResult.mock) {
      // Não registrar identificador, endereço, token ou erro do provedor.
      console.warn("[collaborator] password recovery email not delivered");
    }
  } catch {
    // A mesma resposta é devolvida tanto para entrega falha quanto para conta
    // inexistente; não revelar dados nem confirmar envio não comprovado.
    console.warn("[collaborator] password recovery email delivery failed");
  }
  res.status(202).json(PASSWORD_RECOVERY_GENERIC_RESPONSE);
});

router.post("/collaborator/password-recovery/complete", async (req, res): Promise<void> => {
  res.set("Cache-Control", "no-store");
  const recoveryToken = typeof req.body?.recoveryToken === "string"
    ? req.body.recoveryToken
    : "";
  const newPassword = typeof req.body?.newPassword === "string"
    ? req.body.newPassword
    : "";
  if (newPassword.length < 12 || newPassword.length > 128) {
    res.status(400).json({ error: "A nova senha deve ter entre 12 e 128 caracteres." });
    return;
  }
  const claims = verifyPasswordRecoveryToken(recoveryToken);
  if (!claims) {
    res.status(401).json({ error: "O link é inválido ou expirou. Solicite uma nova recuperação." });
    return;
  }

  try {
    const nextCredentialVersion = claims.credentialVersion + 1;
    const nextPasswordHash = hashPassword(newPassword);
    const updatedProfessional = await db.transaction(async (tx) => {
      const [current] = await tx
        .select({
          id: professionalsTable.id,
          name: professionalsTable.name,
          role: professionalsTable.role,
          category: professionalsTable.category,
          isPrimaryDoctor: professionalsTable.isPrimaryDoctor,
          active: professionalsTable.active,
          credentialVersion: professionalsTable.credentialVersion,
        })
        .from(professionalsTable)
        .where(eq(professionalsTable.id, claims.professionalId))
        .for("update")
        .limit(1);
      if (
        !current ||
        !current.active ||
        (current.credentialVersion ?? 0) !== claims.credentialVersion
      ) {
        throw new Error("PASSWORD_RECOVERY_INVALID");
      }

      const [updated] = await tx
        .update(professionalsTable)
        .set({
          passwordHash: nextPasswordHash,
          credentialVersion: nextCredentialVersion,
        })
        .where(
          and(
            eq(professionalsTable.id, claims.professionalId),
            eq(professionalsTable.credentialVersion, claims.credentialVersion),
          ),
        )
        .returning({
          id: professionalsTable.id,
          name: professionalsTable.name,
          role: professionalsTable.role,
          category: professionalsTable.category,
          isPrimaryDoctor: professionalsTable.isPrimaryDoctor,
        });
      if (!updated) throw new Error("PASSWORD_RECOVERY_INVALID");

      await tx.insert(collaboratorAuditTable).values({
        professionalId: updated.id,
        professionalName: updated.name,
        action: "password_recovered",
        method: "POST",
        path: "/collaborator/password-recovery/complete",
        detail: { priorSessionsInvalidated: true },
        ip: clientIp(req),
      });
      return updated;
    });

    res.json({
      ...sessionForProfessional({
        ...updatedProfessional,
        credentialVersion: nextCredentialVersion,
      }),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "PASSWORD_RECOVERY_INVALID") {
      res.status(401).json({
        error: "O link é inválido, já foi usado ou expirou. Solicite uma nova recuperação.",
      });
      return;
    }
    throw error;
  }
});

// Recuperacao exclusiva do cadastro medico principal no preview privado de desenvolvimento.
// A plataforma restringe o dominio .replit.dev ao proprietario e colaboradores autorizados.
router.post("/collaborator/dev-primary-recovery/start", async (req, res): Promise<void> => {
  if (!isDevelopmentRecoveryAvailable()) {
    res.status(404).json({ error: "Não encontrado." });
    return;
  }
  res.set("Cache-Control", "no-store");
  if (!recoveryStartAllowed(clientIp(req))) {
    res.status(429).json({ error: "Aguarde antes de iniciar outra recuperação." });
    return;
  }

  for (const [digest, pending] of devPrimaryRecoveryChallenges) {
    if (pending.expiresAt <= Date.now()) {
      devPrimaryRecoveryChallenges.delete(digest);
    }
  }

  const professional = await findUniqueActivePrimaryDoctor();
  if (!professional) {
    res.status(409).json({
      error: "A recuperação não está disponível para este cadastro neste ambiente.",
    });
    return;
  }

  const challenge = randomBytes(32).toString("base64url");
  const digest = recoveryChallengeDigest(challenge);
  devPrimaryRecoveryChallenges.set(digest, {
    professionalId: professional.id,
    expiresAt: Date.now() + DEV_PRIMARY_RECOVERY_TTL_MS,
    inProgress: false,
  });
  res.json({ challenge, expiresInSeconds: DEV_PRIMARY_RECOVERY_TTL_MS / 1000 });
});

router.post("/collaborator/dev-primary-recovery/complete", async (req, res): Promise<void> => {
  if (!isDevelopmentRecoveryAvailable()) {
    res.status(404).json({ error: "Não encontrado." });
    return;
  }
  res.set("Cache-Control", "no-store");

  const challenge = typeof req.body?.challenge === "string" ? req.body.challenge : "";
  const newPassword = typeof req.body?.newPassword === "string" ? req.body.newPassword : "";
  if (!challenge) {
    res.status(401).json({ error: "A recuperação expirou. Inicie novamente." });
    return;
  }
  if (newPassword.length < 12 || newPassword.length > 128) {
    res.status(400).json({ error: "A senha deve ter entre 12 e 128 caracteres." });
    return;
  }

  const challengeDigest = recoveryChallengeDigest(challenge);
  const pending = devPrimaryRecoveryChallenges.get(challengeDigest);
  if (!pending || pending.expiresAt <= Date.now()) {
    devPrimaryRecoveryChallenges.delete(challengeDigest);
    res.status(401).json({ error: "A recuperação expirou. Inicie novamente." });
    return;
  }
  if (pending.inProgress) {
    res.status(409).json({ error: "Esta recuperação já está sendo processada." });
    return;
  }

  // Reserva sincrona antes de qualquer await para que duas requisicoes concorrentes
  // com o mesmo desafio nao possam trocar a senha duas vezes.
  pending.inProgress = true;
  try {
    const professional = await findUniqueActivePrimaryDoctor();
    if (!professional || professional.id !== pending.professionalId) {
      devPrimaryRecoveryChallenges.delete(challengeDigest);
      res.status(409).json({
        error: "O cadastro principal mudou. Inicie novamente a recuperação.",
      });
      return;
    }

    const previousCredentialVersion = professional.credentialVersion ?? 0;
    const nextCredentialVersion = previousCredentialVersion + 1;
    const nextPasswordHash = hashPassword(newPassword);

    await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(professionalsTable)
        .set({
          passwordHash: nextPasswordHash,
          credentialVersion: nextCredentialVersion,
        })
        .where(
          and(
            eq(professionalsTable.id, professional.id),
            eq(professionalsTable.credentialVersion, previousCredentialVersion),
            eq(professionalsTable.active, true),
            eq(professionalsTable.isPrimaryDoctor, true),
            eq(professionalsTable.isPlatformOwner, true),
          ),
        )
        .returning({ id: professionalsTable.id });

      if (!updated) {
        throw new Error("DEV_PRIMARY_RECOVERY_CONFLICT");
      }

      await tx.insert(collaboratorAuditTable).values({
        professionalId: professional.id,
        professionalName: professional.name,
        action: "dev_primary_password_recovered",
        method: "POST",
        path: "/collaborator/dev-primary-recovery/complete",
        detail: { environment: "development", priorSessionsInvalidated: true },
        ip: clientIp(req),
      });
    });

    devPrimaryRecoveryChallenges.delete(challengeDigest);
    res.json(sessionForProfessional({
      id: professional.id,
      name: professional.name,
      role: professional.role,
      category: professional.category,
      isPrimaryDoctor: professional.isPrimaryDoctor,
      credentialVersion: nextCredentialVersion,
    }));
  } catch (error) {
    devPrimaryRecoveryChallenges.delete(challengeDigest);
    if (error instanceof Error && error.message === "DEV_PRIMARY_RECOVERY_CONFLICT") {
      res.status(409).json({
        error: "O cadastro mudou durante a recuperação. Inicie novamente.",
      });
      return;
    }
    throw error;
  }
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

// Histórico pessoal: a identidade vem da sessão; nenhum ID-alvo é aceito.
router.get("/collaborator/me/history", requireCollaborator, async (req, res): Promise<void> => {
  res.set("Cache-Control", "no-store");
  const rows = await db
    .select({
      id: collaboratorAuditTable.id,
      action: collaboratorAuditTable.action,
      detail: collaboratorAuditTable.detail,
      createdAt: collaboratorAuditTable.createdAt,
    })
    .from(collaboratorAuditTable)
    .where(and(
      eq(collaboratorAuditTable.professionalId, req.collaborator!.professionalId),
      inArray(collaboratorAuditTable.action, [...ACCOUNT_HISTORY_ACTIONS]),
    ))
    .orderBy(desc(collaboratorAuditTable.createdAt))
    .limit(100);
  res.json({
    events: rows
      .map((row) => serializeOwnAccountHistoryEvent(row))
      .filter((event): event is NonNullable<typeof event> => event !== null),
  });
});

// PUT /api/collaborator/me/identity — atualiza identificadores apenas da sessao.
router.put(
  "/collaborator/me/identity",
  requireCollaborator,
  async (req, res): Promise<void> => {
    const claims = req.collaborator!;
    const currentPassword =
      typeof req.body?.currentPassword === "string" ? req.body.currentPassword : "";
    const emailInput = typeof req.body?.email === "string" ? req.body.email.trim() : "";
    const cpfInput = typeof req.body?.cpf === "string" ? req.body.cpf.trim() : "";
    const email = emailInput ? emailInput.toLowerCase() : null;
    const cpf = cpfInput ? normalizeCpf(cpfInput) : null;

    if (!email && !cpf) {
      res.status(400).json({ error: "Informe pelo menos um e-mail ou CPF." });
      return;
    }
    if (email && (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
      res.status(400).json({ error: "Informe um e-mail válido." });
      return;
    }
    if (cpf && !isValidCpf(cpf)) {
      res.status(400).json({ error: "Informe um CPF válido com 11 dígitos." });
      return;
    }
    if (!currentPassword || currentPassword.length > 512) {
      res.status(400).json({ error: "Confirme sua senha atual para alterar os identificadores." });
      return;
    }

    const [professional] = await db
      .select()
      .from(professionalsTable)
      .where(eq(professionalsTable.id, claims.professionalId))
      .limit(1);
    if (!professional || !professional.active || !professional.passwordHash) {
      res.status(409).json({ error: "Esta conta ainda não pode alterar os identificadores por este fluxo." });
      return;
    }
    if (!verifyPassword(currentPassword, professional.passwordHash)) {
      res.status(401).json({ error: "A senha atual não confere." });
      return;
    }

    const nextCredentialVersion = (professional.credentialVersion ?? 0) + 1;
    try {
      let updated: { id: number; email: string | null; cpf: string | null } | undefined;
      await db.transaction(async (tx) => {
        [updated] = await tx
          .update(professionalsTable)
          .set({
            ...(email ? { email } : {}),
            ...(cpf ? { cpf } : {}),
            credentialVersion: nextCredentialVersion,
          })
          .where(
            and(
              eq(professionalsTable.id, professional.id),
              eq(professionalsTable.credentialVersion, professional.credentialVersion ?? 0),
            ),
          )
          .returning({
            id: professionalsTable.id,
            email: professionalsTable.email,
            cpf: professionalsTable.cpf,
          });
        if (!updated) throw new Error("COLLABORATOR_IDENTITY_CONFLICT");

        await tx.insert(collaboratorAuditTable).values({
          professionalId: professional.id,
          professionalName: professional.name,
          action: "identity_updated",
          method: req.method,
          path: req.path,
          detail: {
            emailUpdated: Boolean(email && email !== professional.email),
            cpfUpdated: Boolean(cpf && cpf !== professional.cpf),
            priorSessionsInvalidated: true,
          },
          ip: clientIp(req),
        });
      });

      if (!updated) {
        res.status(409).json({ error: "O cadastro mudou durante a operação. Entre novamente e tente de novo." });
        return;
      }
      const token = createCollaboratorToken({
        professionalId: professional.id,
        role: professional.role,
        credentialVersion: nextCredentialVersion,
      });
      res.json({
        token,
        professional: {
          id: professional.id,
          name: professional.name,
          role: professional.role,
          category: professional.category,
          isPrimaryDoctor: professional.isPrimaryDoctor,
          cpf: updated.cpf,
          email: updated.email,
        },
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        res.status(409).json({ error: "Este e-mail ou CPF já está vinculado a outro cadastro." });
        return;
      }
      if (error instanceof Error && error.message === "COLLABORATOR_IDENTITY_CONFLICT") {
        res.status(409).json({ error: "O cadastro mudou durante a operação. Entre novamente e tente de novo." });
        return;
      }
      throw error;
    }
  },
);

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
  try {
    await db.transaction(async (tx) => {
      const updated = await tx
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
      if (updated.length !== 1) throw new Error("COLLABORATOR_PASSWORD_CONFLICT");
      await tx.insert(collaboratorAuditTable).values({
        professionalId: professional.id,
        professionalName: professional.name,
        action: "password_changed",
        method: req.method,
        path: req.path,
        detail: { priorSessionsInvalidated: true },
        ip: clientIp(req),
      });
    });
  } catch (error) {
    if (error instanceof Error && error.message === "COLLABORATOR_PASSWORD_CONFLICT") {
      res.status(409).json({ error: "A conta mudou durante a operação. Entre novamente e tente de novo." });
      return;
    }
    throw error;
  }

  const token = createCollaboratorToken({
    professionalId: professional.id,
    role: professional.role,
    credentialVersion: nextCredentialVersion,
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

// POST /api/collaborator/initial-password — cria a primeira senha da propria sessao.
// Nunca aceita um profissional-alvo enviado pelo navegador.
router.post("/collaborator/initial-password", requireCollaborator, async (req, res): Promise<void> => {
  const claims = req.collaborator!;
  const newPassword =
    typeof req.body?.newPassword === "string" ? req.body.newPassword : "";

  if (newPassword.length < 12 || newPassword.length > 128) {
    res.status(400).json({ error: "A senha deve ter entre 12 e 128 caracteres." });
    return;
  }

  const [professional] = await db
    .select()
    .from(professionalsTable)
    .where(eq(professionalsTable.id, claims.professionalId))
    .limit(1);
  if (!professional || !professional.active) {
    res.status(403).json({ error: "A conta autenticada não está ativa." });
    return;
  }
  if (professional.passwordHash) {
    res.status(409).json({
      error: "Esta conta já possui senha. Este fluxo só cadastra a primeira senha.",
    });
    return;
  }

  const previousCredentialVersion = professional.credentialVersion ?? 0;
  const nextCredentialVersion = previousCredentialVersion + 1;
  try {
    await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(professionalsTable)
        .set({
          passwordHash: hashPassword(newPassword),
          credentialVersion: nextCredentialVersion,
        })
        .where(
          and(
            eq(professionalsTable.id, professional.id),
            isNull(professionalsTable.passwordHash),
            eq(professionalsTable.credentialVersion, previousCredentialVersion),
          ),
        )
        .returning({ id: professionalsTable.id });
      if (!updated) throw new Error("COLLABORATOR_INITIAL_PASSWORD_CONFLICT");
      await tx.insert(collaboratorAuditTable).values({
        professionalId: professional.id,
        professionalName: professional.name,
        action: "password_initialized",
        method: req.method,
        path: req.path,
        detail: { priorSessionsInvalidated: true },
        ip: clientIp(req),
      });
    });
  } catch (error) {
    if (error instanceof Error && error.message === "COLLABORATOR_INITIAL_PASSWORD_CONFLICT") {
      res.status(409).json({
        error: "A conta mudou durante a operação. Atualize a tela e tente novamente.",
      });
      return;
    }
    throw error;
  }

  const token = createCollaboratorToken({
    professionalId: professional.id,
    role: professional.role,
    credentialVersion: nextCredentialVersion,
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

// O primeiro acesso nao pode ser reivindicado anonimamente por um cadastro
// escolhido no navegador. A provisao inicial exige operacao administrativa
// revisada; a rota de credenciais atende novas contas depois da autenticacao.
router.get("/collaborator/bootstrap-status", (_req, res): void => {
  res.json({ needsBootstrap: false, staff: [] });
});

router.post(
  "/collaborator/bootstrap",
  requireCollaborator,
  requirePlatformOwner,
  (_req, res): void => {
    res.status(410).json({
      error: "A criação pública do primeiro acesso foi desativada. Use a administração autenticada.",
    });
  },
);

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
router.get("/collaborator/audit", requireCollaborator, requirePlatformOwner, async (req, res): Promise<void> => {
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
