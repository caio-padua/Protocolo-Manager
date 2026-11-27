/**
 * Decide, só pelo domínio e pelo caminho, se a página aberta é uma vitrine ou o Manager.
 * Regra única e pura (testável). Só os caminhos listados mudam; /login, /area, /api, cockpit, anamnese, convites,
 * exames e portal continuam sendo do Manager em qualquer domínio. Nenhum prefixo de subdomínio (app.) é criado.
 */
export type Vitrine = "paxcare" | "paxmed" | null;

const HOSTS_PAXCARE = new Set(["paxcare.com.br", "www.paxcare.com.br"]);
const HOSTS_PAXMED = new Set(["paxmed.com.br", "www.paxmed.com.br"]);
// Caminhos que, no domínio da vitrine, mostram a vitrine (o resto é do Manager).
const CAMINHOS_PAXCARE = new Set(["/", "/medicos"]);
const CAMINHOS_PAXMED = new Set(["/"]);

export function vitrineDoEndereco(hostname: string, pathname: string): Vitrine {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  const caminho = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  if (HOSTS_PAXCARE.has(host) && CAMINHOS_PAXCARE.has(caminho)) return "paxcare";
  if (HOSTS_PAXMED.has(host) && CAMINHOS_PAXMED.has(caminho) && true) return "paxmed";
  return null;
}
