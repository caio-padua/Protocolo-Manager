// Abre o PDF de uma solicitação de exame SEM colocar o token na URL: o token vai no cabeçalho X-Link-Token,
// o PDF volta como arquivo e abre numa aba por endereço local (blob). A aba é aberta antes (clique do usuário)
// para o navegador não bloquear como pop-up.
const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export async function abrirPdfExame(token: string): Promise<void> {
  const aba = window.open("", "_blank");
  try {
    const r = await fetch(`${BASE}/api/exam-requests/arquivo`, { headers: { "X-Link-Token": token } });
    if (!r.ok) throw new Error(r.status === 404 ? "Documento não encontrado." : "Não foi possível abrir o documento.");
    const url = URL.createObjectURL(await r.blob());
    if (aba) aba.location.href = url; else window.location.href = url;
    setTimeout(() => URL.revokeObjectURL(url), 5 * 60_000);
  } catch (e) {
    aba?.close();
    throw e;
  }
}
