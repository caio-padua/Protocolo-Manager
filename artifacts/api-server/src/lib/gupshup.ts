// Status de configuração do gateway Gupshup (WhatsApp Business API).
// Esta onda só reporta se as credenciais existem no ambiente — ainda NÃO há
// motor de envio por Gupshup (não pedido). Honesto: sem credenciais, fica
// "não configurado" (luz âmbar na tela), nunca simula conexão.
const API_KEY = process.env.GUPSHUP_API_KEY;
const APP_NAME = process.env.GUPSHUP_APP_NAME;

export function isGupshupConfigured(): boolean {
  return Boolean(API_KEY && APP_NAME);
}
