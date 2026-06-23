// Fonte unica da marca PAXTER.
// PAXTER  = o sistema clinico (produto comercial).
// PADCON  = a empresa que desenvolve o Paxter (PADCON - Advanced Systems Architecture).
// Instituto Padua = a clinica que opera o sistema.
//
// PAXTER_SITE_URL: enderECO do site institucional do Paxter. Hoje e um PLACEHOLDER;
// quando o site existir, trocar SO esta linha — todos os logos clicaveis e QR codes
// apontam para ca (data-bind pronto, decisao do CEO em 22/06/2026).
export const PAXTER_SITE_URL = "https://paxter.com.br";

// Site institucional da PADCON (empresa que desenvolve o Paxter). PLACEHOLDER ate
// existir; quando o site existir, trocar SO esta linha (data-bind pronto).
export const PADCON_SITE_URL = "https://padcon.com.br";

export const PAXTER = {
  nome: "PAXTER",
  taglineEn: "Clinical Intelligence System",
  subtitulo: "Motor Clínico · Protocolos Injetáveis",
  empresa: "PADCON",
  empresaTagline: "Advanced Systems Architecture",
  desenvolvidoPor: "desenvolvido pela PADCON",
  clinica: "Instituto Pádua",
  siteUrl: PAXTER_SITE_URL,
} as const;
