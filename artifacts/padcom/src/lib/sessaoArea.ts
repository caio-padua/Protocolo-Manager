// Sessão persistente do cliente na /area (celular). Só o token de renovação (opaco, rotativo, revogável
// no servidor) fica no aparelho; CPF, senha e nascimento NUNCA são guardados. Se o armazenamento
// estiver bloqueado, tudo continua funcionando em memória (o cliente só precisará entrar de novo).
const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const CHAVE = "paxcare.area.sessao.v1";

export type SessaoRenovada = { id: number; name: string; cpf: string | null; token: string };

function ler(): string | null {
  try { return window.localStorage.getItem(CHAVE); } catch { return null; }
}
function gravar(valor: string | null) {
  try { if (valor) window.localStorage.setItem(CHAVE, valor); else window.localStorage.removeItem(CHAVE); } catch { /* armazenamento bloqueado */ }
}

export const temSessaoGuardada = () => ler() !== null;

/** Chamado logo após o login: troca o token de acesso por um token de renovação guardado no aparelho. */
export async function iniciarSessaoPersistente(tokenAcesso: string): Promise<void> {
  try {
    const r = await fetch(`${API_BASE}/api/area-paciente/sessao/iniciar`, { method: "POST", headers: { Authorization: `Bearer ${tokenAcesso}` } });
    if (r.ok) gravar(((await r.json()) as { refreshToken: string }).refreshToken);
  } catch { /* sem rede agora: o cliente segue com o token curto */ }
}

/** Renova: devolve o cliente com token novo; null quando a sessão não vale mais (vai ao login). */
export async function renovarSessaoPersistente(): Promise<SessaoRenovada | null | "indisponivel"> {
  const guardado = ler();
  if (!guardado) return null;
  try {
    const r = await fetch(`${API_BASE}/api/area-paciente/sessao/renovar`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refreshToken: guardado }),
    });
    if (r.status === 401 || r.status === 400) { gravar(null); return null; }
    if (!r.ok) return "indisponivel"; // erro do servidor: NÃO apaga a sessão (tenta de novo depois)
    const d = (await r.json()) as SessaoRenovada & { refreshToken: string };
    gravar(d.refreshToken);
    return { id: d.id, name: d.name, cpf: d.cpf, token: d.token };
  } catch { return "indisponivel"; }
}

export async function encerrarSessaoPersistente(): Promise<void> {
  const guardado = ler();
  gravar(null);
  if (!guardado) return;
  try {
    await fetch(`${API_BASE}/api/area-paciente/sessao/encerrar`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refreshToken: guardado }),
    });
  } catch { /* o servidor expira sozinho */ }
}
