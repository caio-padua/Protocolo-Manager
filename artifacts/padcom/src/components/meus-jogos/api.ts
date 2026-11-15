const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const RAIZ = `${API_BASE}/api/area-paciente/meus-jogos`;

export class ErroApi extends Error {
  constructor(msg: string, public status: number, public motivo?: string) { super(msg); }
}

/** Chamada autenticada pelo token do portal. O cliente nunca e enviado no corpo: o servidor o le do token. */
export async function chamarMeusJogos<T>(token: string, caminho: string, init?: { method?: string; json?: unknown }): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${RAIZ}${caminho}`, {
      method: init?.method ?? "GET",
      headers: { Authorization: `Bearer ${token}`, ...(init?.json !== undefined ? { "Content-Type": "application/json" } : {}) },
      body: init?.json !== undefined ? JSON.stringify(init.json) : undefined,
    });
  } catch { throw new ErroApi("Sem conexão. Tente novamente.", 0); }
  const corpo = await res.json().catch(() => ({}));
  if (!res.ok) throw new ErroApi(res.status === 401 ? "Sessão expirada. Entre novamente." : corpo.error ?? "Não foi possível concluir.", res.status, corpo.motivo);
  return corpo as T;
}

export async function baixarComprovanteCliente(token: string, pedidoId: number): Promise<void> {
  const res = await fetch(`${RAIZ}/pedidos/${pedidoId}/comprovante`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new ErroApi((await res.json().catch(() => ({}))).error ?? "Comprovante indisponível.", res.status);
  const url = URL.createObjectURL(await res.blob());
  window.open(url, "_blank", "noopener");
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
