import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Valida o `initData` que o Telegram entrega ao mini aplicativo (web_app).
 * Regra oficial: segredo = HMAC_SHA256("WebAppData", tokenDoBot); assinatura =
 * HMAC_SHA256(segredo, linhas "chave=valor" ordenadas e unidas por \n, sem o campo hash).
 * Devolve o id numérico de quem abriu, ou null se a assinatura ou o prazo não conferirem.
 */
export function validarInitData(
  initData: unknown,
  tokenDoBot: string,
  agora: Date = new Date(),
  validadeSegundos = 6 * 60 * 60,
): { userId: string } | null {
  if (typeof initData !== "string" || initData.length === 0 || initData.length > 4096) return null;
  const params = new URLSearchParams(initData);
  const recebido = params.get("hash");
  if (!recebido || !/^[0-9a-f]{64}$/.test(recebido)) return null;
  params.delete("hash");
  const linhas = [...params.entries()].map(([k, v]) => `${k}=${v}`).sort().join("\n");
  const segredo = createHmac("sha256", "WebAppData").update(tokenDoBot).digest();
  const esperado = createHmac("sha256", segredo).update(linhas).digest();
  const lido = Buffer.from(recebido, "hex");
  if (lido.length !== esperado.length || !timingSafeEqual(lido, esperado)) return null;
  const authDate = Number(params.get("auth_date"));
  if (!Number.isFinite(authDate)) return null;
  const idade = agora.getTime() / 1000 - authDate;
  if (idade < -60 || idade > validadeSegundos) return null;
  try {
    const user = JSON.parse(params.get("user") ?? "") as { id?: unknown };
    return typeof user.id === "number" && Number.isSafeInteger(user.id) ? { userId: String(user.id) } : null;
  } catch {
    return null;
  }
}
