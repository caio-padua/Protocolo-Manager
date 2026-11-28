// Auditoria SEGURA do token do bot: nunca imprime o valor. Mostra apenas
// estado (configurado/igual/diferente) e validade (getMe do PROPRIO bot).
import { db, appSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getSecret } from "../lib/secure-settings.js";

async function valido(tok: string | null): Promise<string> {
  if (!tok) return "ausente";
  try {
    const r = await fetch(`https://api.telegram.org/bot${tok}/getMe`, { signal: AbortSignal.timeout(10000) });
    return r.ok ? "valido" : `invalido(HTTP ${r.status})`;
  } catch { return "erro_de_rede"; }
}

const [row] = await db.select().from(appSettingsTable).where(eq(appSettingsTable.key, "telegram.botToken"));
const cofre = await getSecret("telegram.botToken");
const legado = row?.value ?? null;
console.log(JSON.stringify({
  cofre: await valido(cofre),
  legado_em_texto_legivel: legado ? await valido(legado) : "ausente",
  iguais: !!cofre && !!legado && cofre === legado,
}));
process.exit(0);
