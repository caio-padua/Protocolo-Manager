
// Sessão persistente do cliente na /area (celular). O token de renovação vive em COOKIE protegido (HttpOnly,
// SameSite=Strict): o script da página não consegue lê-lo, então um ataque de script (XSS) não o rouba.
// No aparelho fica só um MARCADOR sem segredo ("cookie") para saber se vale tentar renovar. CPF, senha e
// nascimento NUNCA são guardados. Sessões antigas (token em localStorage) migram para o cookie na 1ª renovação.
const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const CHAVE = "paxcare.area.sessao.v1";
const MARCADOR = "cookie";
const CABECALHOS = { "Content-Type": "application/json", "X-Paxcare-Csrf": "1" };

export type SessaoRenovada = { id: number; name: string; cpf: string | null; token: string };

function ler(): string | null {
  try { return window.localStorage.getItem(CHAVE); } catch { return null; }
}
function gravar(valor: string | null) {
  try { if (valor) window.localStorage.setItem(CHAVE, valor); else window.localStorage.removeItem(CHAVE); } catch { /* armazenamento bloqueado */ }
}

export const temSessaoGuardada = () => ler() !== null;

/** Chamado logo após o login: o servidor grava o cookie protegido; aqui só marcamos que há sessão. */
export async function iniciarSessaoPersistente(tokenAcesso: string): Promise<void> {
  try {
    const r = await fetch(`${API_BASE}/api/area-paciente/sessao/iniciar`, {
      method: "POST", credentials: "same-origin", headers: { ...CABECALHOS, Authorization: `Bearer ${tokenAcesso}` },
    });
    if (r.ok) gravar(MARCADOR);
  } catch { /* sem rede agora: o cliente segue com o token curto */ }
}

/** Renova: devolve o cliente com token novo; null quando a sessão não vale mais (vai ao login). */
export async function renovarSessaoPersistente(): Promise<SessaoRenovada | null | "indisponivel"> {
  const guardado = ler();
  if (!guardado) return null;
  const legado = guardado !== MARCADOR ? { refreshToken: guardado } : {}; // migração única do formato antigo
  try {
    const r = await fetch(`${API_BASE}/api/area-paciente/sessao/renovar`, {
      method: "POST", credentials: "same-origin", headers: CABECALHOS, body: JSON.stringify(legado),
    });
    if (r.status === 401 || r.status === 400 || r.status === 403) { gravar(null); return null; }
    if (!r.ok) return "indisponivel"; // erro do servidor/limite: NÃO apaga a sessão (tenta de novo depois)
    const d = (await r.json()) as SessaoRenovada;
    gravar(MARCADOR);
    return { id: d.id, name: d.name, cpf: d.cpf, token: d.token };
  } catch { return "indisponivel"; }
}

export async function encerrarSessaoPersistente(): Promise<void> {
  const guardado = ler();
  gravar(null);
  if (!guardado) return;
  try {
    await fetch(`${API_BASE}/api/area-paciente/sessao/encerrar`, {
      method: "POST", credentials: "same-origin", headers: CABECALHOS,
      body: JSON.stringify(guardado !== MARCADOR ? { refreshToken: guardado } : {}),
    });
  } catch { /* o servidor expira sozinho */ }
}
