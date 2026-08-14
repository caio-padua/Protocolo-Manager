/* Teste real: envia o banner animado PAXTER ao Telegram do CEO (chat vinculado). */
import { sendTelegramAnimation } from "../lib/telegram.js";

const DOMINIO = "https://e4777049-2482-4493-bc8d-9ddd502ce731-00-33xz3y36vyw2i.riker.replit.dev";

async function main() {
  const chatId = process.env.PADAXOR_TELEGRAM_CHAT_ID;
  if (!chatId) {
    console.error("ERRO: PADAXOR_TELEGRAM_CHAT_ID não configurado como Replit Secret.");
    process.exit(1);
  }
  const caption =
    "<b>PAXTER — Teste de canal Telegram</b>\n\n" +
    "Instituto Padua confirma: canal vinculado ao seu cadastro com prova de posse.\n" +
    "Banner animado, marca oficial, entrega ponta a ponta.\n\n" +
    "<i>Motor Clinico | Protocolos Injetaveis</i>";
  const r = await sendTelegramAnimation(
    chatId,
    `${DOMINIO}/api/brand/paxter-banner.gif`,
    `${DOMINIO}/api/brand/paxter-banner.png`,
    caption,
  );
  console.log(JSON.stringify(r));
  process.exit(r.sent ? 0 : 1);
}

main().catch((e) => {
  console.error("ERRO:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
