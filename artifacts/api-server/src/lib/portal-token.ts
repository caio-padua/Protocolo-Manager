import { createHmac, randomBytes } from "node:crypto";

// Token HMAC assinado para o portal publico (cliente se identifica por CPF +
// data de nascimento e recebe este token de curta duracao). Usado tanto no
// portal de upload de arquivos quanto no portal de anamnese.
const TOKEN_SECRET = process.env.SESSION_SECRET || randomBytes(32).toString("hex");
const TOKEN_TTL_MS = 30 * 60 * 1000;

export function createPortalToken(clientId: number): string {
  const exp = Date.now() + TOKEN_TTL_MS;
  const payload = `${clientId}:${exp}`;
  const sig = createHmac("sha256", TOKEN_SECRET).update(payload).digest("hex");
  return Buffer.from(`${payload}:${sig}`).toString("base64url");
}

export function verifyPortalToken(token: string): number | null {
  try {
    const decoded = Buffer.from(token, "base64url").toString();
    const parts = decoded.split(":");
    if (parts.length !== 3) return null;
    const [clientIdStr, expStr, sig] = parts;
    const payload = `${clientIdStr}:${expStr}`;
    const expected = createHmac("sha256", TOKEN_SECRET).update(payload).digest("hex");
    if (sig !== expected) return null;
    if (Date.now() > Number(expStr)) return null;
    return Number(clientIdStr);
  } catch {
    return null;
  }
}
