import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

// Portao do Colaborador (Onda 8.2). Login POR colaborador (decisao do CEO em
// 20/06/2026) para permitir auditoria de quem entrou e o que fez. Reaproveita o
// mesmo segredo HMAC do portal do cliente (SESSION_SECRET) para assinar o token
// de sessao; o escopo "collab" impede reaproveitar tokens de outros fluxos.
const TOKEN_SECRET = process.env.SESSION_SECRET || randomBytes(32).toString("hex");
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000; // 12 horas

export interface CollaboratorClaims {
  professionalId: number;
  role: string;
  credentialVersion?: number;
}

export function createCollaboratorToken(claims: CollaboratorClaims): string {
  const exp = Date.now() + TOKEN_TTL_MS;
  const credentialVersion = Number.isInteger(claims.credentialVersion)
    ? Math.max(0, claims.credentialVersion!)
    : 0;
  const payload = `collab:${claims.professionalId}:${claims.role}:${credentialVersion}:${exp}`;
  const sig = createHmac("sha256", TOKEN_SECRET).update(payload).digest("hex");
  return Buffer.from(`${payload}:${sig}`).toString("base64url");
}

export function verifyCollaboratorToken(token: string): CollaboratorClaims | null {
  try {
    const decoded = Buffer.from(token, "base64url").toString();
    const parts = decoded.split(":");
    if (parts.length !== 5 && parts.length !== 6) return null;
    const [scope, idStr, role] = parts;
    const legacy = parts.length === 5;
    const credentialVersion = legacy ? 0 : Number(parts[3]);
    const expStr = legacy ? parts[3] : parts[4];
    const sig = parts[legacy ? 4 : 5];
    if (scope !== "collab") return null;
    const professionalId = Number(idStr);
    const expiresAt = Number(expStr);
    if (
      !Number.isInteger(professionalId) ||
      professionalId <= 0 ||
      !Number.isInteger(credentialVersion) ||
      credentialVersion < 0 ||
      !Number.isFinite(expiresAt)
    ) return null;
    const payload = legacy
      ? `${scope}:${idStr}:${role}:${expStr}`
      : `${scope}:${idStr}:${role}:${credentialVersion}:${expStr}`;
    const expected = createHmac("sha256", TOKEN_SECRET).update(payload).digest("hex");
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    if (Date.now() > expiresAt) return null;
    return { professionalId, role, credentialVersion };
  } catch {
    return null;
  }
}

// Hash de senha com scrypt + salt aleatorio. Formato persistido:
// "scrypt$<salt-hex>$<derivado-hex>". A senha em texto puro NUNCA e gravada.
export function hashPassword(plain: string): string {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(plain, salt, 64).toString("hex");
  return `scrypt$${salt}$${derived}`;
}

export function verifyPassword(plain: string, stored: string | null): boolean {
  if (!stored) return false;
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const [, salt, expectedHex] = parts;
  try {
    const derived = scryptSync(plain, salt, 64);
    const expected = Buffer.from(expectedHex, "hex");
    if (derived.length !== expected.length) return false;
    return timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}
