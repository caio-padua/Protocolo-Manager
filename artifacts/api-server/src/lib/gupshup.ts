// Status de configuração do gateway Gupshup (WhatsApp Business API).
// As credenciais vêm do COFRE cifrado (gupshup.*); getSecret cai para o env
// (GUPSHUP_API_KEY / GUPSHUP_APP_NAME) quando o cofre está vazio. Esta onda só
// reporta se as credenciais existem — ainda NÃO há motor de envio por Gupshup
// (não pedido). Honesto: sem credenciais, fica "não configurado" (luz âmbar),
// nunca simula conexão.
import { getSecret } from "./secure-settings";

export async function isGupshupConfigured(): Promise<boolean> {
  // A API do Gupshup precisa das TRÊS para enviar: apikey, src.name (appName) e
  // source (número WhatsApp Business). Sem qualquer uma, fica "não configurado".
  const [apiKey, appName, sourceNumber] = await Promise.all([
    getSecret("gupshup.apiKey"),
    getSecret("gupshup.appName"),
    getSecret("gupshup.sourceNumber"),
  ]);
  return Boolean(apiKey && appName && sourceNumber);
}
