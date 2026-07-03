import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

// Acesso leve do paciente (Bloco D). Senha SEMPRE com hash forte (scrypt nativo do
// Node — zero dependencia nova). Formato guardado: `scrypt$<saltHex>$<hashHex>`.
// NUNCA guardar/logar a senha em texto puro.

const KEYLEN = 64;

export function hashPassword(plain: string): string {
  const salt = randomBytes(16);
  const derived = scryptSync(plain, salt, KEYLEN);
  return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
}

export function verifyPassword(plain: string, stored: string | null | undefined): boolean {
  if (!stored) return false;
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  try {
    const salt = Buffer.from(parts[1], "hex");
    const expected = Buffer.from(parts[2], "hex");
    const derived = scryptSync(plain, salt, expected.length);
    return expected.length === derived.length && timingSafeEqual(expected, derived);
  } catch {
    return false;
  }
}

// Senha provisoria legivel: 8 caracteres sem simbolos ambiguos (sem I, O, 0, 1).
// Uso unico — o paciente e OBRIGADO a trocar no 1o acesso (mustChangePassword).
export function generateProvisionalPassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(8);
  let out = "";
  for (let i = 0; i < 8; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

// Token opaco para o link "definir/recuperar acesso" (Bloco D, R14 / caso extremo 6).
export function generateAccessToken(): string {
  return randomBytes(24).toString("hex");
}

// Regras minimas da nova senha definida pelo paciente no 1o acesso.
export function isStrongEnough(plain: string): boolean {
  return typeof plain === "string" && plain.trim().length >= 6;
}
