import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { conferirHash, gerarHash, precisaRegravarRotulo } from "./passwordScheme.js";

// Portao do Colaborador (Onda 8.2). Login POR colaborador (decisao do CEO em
// 20/06/2026) para permitir auditoria de quem entrou e o que fez. Reaproveita o
// mesmo segredo HMAC do portal do cliente (SESSION_SECRET) para assinar o token
// de sessao; o escopo "collab" impede reaproveitar tokens de outros fluxos.
const TOKEN_SECRET = process.env.SESSION_SECRET || randomBytes(32).toString("hex");
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000; // 12 horas

export interface CollaboratorClaims {
  professionalId: number;
  role: string;
}

export function createCollaboratorToken(claims: CollaboratorClaims): string {
  const exp = Date.now() + TOKEN_TTL_MS;
  const payload = `collab:${claims.professionalId}:${claims.role}:${exp}`;
  const sig = createHmac("sha256", TOKEN_SECRET).update(payload).digest("hex");
  return Buffer.from(`${payload}:${sig}`).toString("base64url");
}

export function verifyCollaboratorToken(token: string): CollaboratorClaims | null {
  try {
    const decoded = Buffer.from(token, "base64url").toString();
    const parts = decoded.split(":");
    if (parts.length !== 5) return null;
    const [scope, idStr, role, expStr, sig] = parts;
    if (scope !== "collab") return null;
    const payload = `${scope}:${idStr}:${role}:${expStr}`;
    const expected = createHmac("sha256", TOKEN_SECRET).update(payload).digest("hex");
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    if (Date.now() > Number(expStr)) return null;
    return { professionalId: Number(idStr), role };
  } catch {
    return null;
  }
}

// Senha do COLABORADOR. A derivacao e o rotulo vivem em passwordScheme.ts,
// compartilhado com o esquema do paciente. Motivo de existir um modulo comum:
// ate 30/07/2026 os dois esquemas gravavam com o rotulo identico `scrypt$` e
// derivavam de formas incompativeis, e um hash no campo errado devolvia
// `false` — indistinguivel de senha errada. Custou uma noite de investigacao.
// Ver item 10 da linha de producao.
export function hashPassword(plain: string): string {
  return gerarHash("colaborador", plain);
}

export function verifyPassword(plain: string, stored: string | null): boolean {
  return conferirHash("colaborador", plain, stored);
}

// Reexportado para as rotas conseguirem regravar o rotulo antigo no proximo
// login bem-sucedido, sem pedir nada ao colaborador.
export { precisaRegravarRotulo };
