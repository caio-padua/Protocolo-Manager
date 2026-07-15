/* Script one-off: grava telegram.webhookSecret no cofre e lista clientes do CEO. */
import crypto from "crypto";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { setSecret, getSecret } from "../lib/secure-settings.js";

async function main() {
  const tok = await getSecret("telegram.botToken");
  console.log("token no cofre:", tok ? "SIM (termina em " + tok.slice(-6) + ")" : "NAO");

  let seg = await getSecret("telegram.webhookSecret");
  if (!seg) {
    seg = crypto.randomBytes(24).toString("hex");
    await setSecret("telegram.webhookSecret", seg, "agent-setup");
  }
  const chk = await getSecret("telegram.webhookSecret");
  console.log("webhookSecret no cofre:", chk === seg ? "OK" : "FALHOU");
  console.log("SEGREDO=" + seg);

  const rows = await db.execute(
    sql`SELECT id, name, phone, validation_password, telegram_chat_id FROM clients WHERE phone LIKE '%977154000%' OR name ILIKE '%caio%' OR name ILIKE '%padua%'`,
  );
  console.log(JSON.stringify((rows as { rows?: unknown[] }).rows ?? rows, null, 1));
  process.exit(0);
}

main().catch((e) => {
  console.error("ERRO:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
