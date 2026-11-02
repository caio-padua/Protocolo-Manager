import { randomBytes, randomInt, scryptSync, timingSafeEqual } from "node:crypto";

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

// Senha provisoria de uso unico, gerada segundo a politica global. O cliente e
// OBRIGADO a definir uma senha propria no primeiro acesso (mustChangePassword).
export function generateProvisionalPassword(): string {
  const uppercase = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const digits = "23456789";
  const symbols = "@!#$%*?";
  const alphabet = `${uppercase}abcdefghjkmnpqrstuvwxyz${digits}${symbols}`;
  const pick = (characters: string) => characters[randomInt(characters.length)]!;
  const remaining = [pick(digits), pick(symbols)];
  while (remaining.length < 11) remaining.push(pick(alphabet));

  for (let index = remaining.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(index + 1);
    [remaining[index], remaining[swapIndex]] = [remaining[swapIndex]!, remaining[index]!];
  }

  return `${pick(uppercase)}${remaining.join("")}`;
}

// Token opaco para o link "definir/recuperar acesso" (Bloco D, R14 / caso extremo 6).
export function generateAccessToken(): string {
  return randomBytes(24).toString("hex");
}
