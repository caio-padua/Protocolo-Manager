// Status de configuração do gateway Gupshup (WhatsApp Business API).
// As credenciais vêm do COFRE cifrado (gupshup.*); getSecret cai para o env
// (GUPSHUP_API_KEY / GUPSHUP_APP_NAME) quando o cofre está vazio. Esta onda só
// reporta se as credenciais existem — ainda NÃO há motor de envio por Gupshup
// (não pedido). Honesto: sem credenciais, fica "não configurado" (luz âmbar),
// nunca simula conexão.
import { getSecret } from "./secure-settings";

export async function isGupshupConfigured(): Promise<boolean> {
  const [apiKey, appName] = await Promise.all([
    getSecret("gupshup.apiKey"),
    getSecret("gupshup.appName"),
  ]);
  return Boolean(apiKey && appName);
}
