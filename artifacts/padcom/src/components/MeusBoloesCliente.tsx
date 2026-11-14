import { useCallback, useEffect, useState } from "react";
import { Download, Loader2, Ticket } from "lucide-react";

// Meus Bolões (Área do Cliente): somente leitura.
// Mostra só participações registradas pela clínica e baixa o recibo REAL da CAIXA já validado.
// Nada aqui vende, cobra, aposta ou gera bilhete.

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type Participacao = {
  id: number;
  campanha: { nome: string; concurso: string | null; dataSorteio: string | null };
  cotas: number;
  status: "pendente_registro" | "registrada" | "cancelada";
  registradaEm: string | null;
  comprovante: { id: number; tipo: "pdf" | "imagem"; bytes: number; validadoEm: string } | null;
};
type Resposta = { aviso: string; participacoes: Participacao[] };

const STATUS: Record<Participacao["status"], string> = {
  pendente_registro: "Registro ainda não comprovado",
  registrada: "Participação registrada",
  cancelada: "Participação cancelada",
};

const brDate = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
};
const kb = (b: number) => (b >= 1048576 ? `${(b / 1048576).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

function Campo({ label, value }: { label: string; value: string }) {
  return (
    <div className="concave-3d rounded-lg px-3 py-2 min-w-0">
      <p className="text-accent text-[9px] font-black uppercase tracking-widest">{label}</p>
      <p className="text-primary text-sm font-bold break-words">{value || "—"}</p>
    </div>
  );
}

export default function MeusBoloesCliente({ token }: { token: string }) {
  const [data, setData] = useState<Resposta | null>(null);
  const [error, setError] = useState("");
  const [baixando, setBaixando] = useState<number | null>(null);
  const [erroDownload, setErroDownload] = useState<Record<number, string>>({});

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/area-paciente/boloes`, { headers: { Authorization: `Bearer ${token}` } });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(res.status === 401 ? "Sessão expirada. Entre novamente." : body.error ?? "Não foi possível carregar seus bolões.");
      setData(body as Resposta);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, [token]);
  useEffect(() => { void load(); }, [load]);

  // Download por fetch + Bearer + blob: o token nunca vai na URL.
  async function baixar(p: Participacao) {
    if (!p.comprovante) return;
    setBaixando(p.comprovante.id);
    setErroDownload((m) => ({ ...m, [p.id]: "" }));
    try {
      const res = await fetch(`${API_BASE}/api/area-paciente/boloes/comprovantes/${p.comprovante.id}/download`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(res.status === 401 ? "Sessão expirada. Entre novamente." : body.error ?? "Não foi possível baixar o comprovante.");
      }
      const blob = await res.blob();
      const ext = p.comprovante.tipo === "pdf" ? "pdf" : blob.type === "image/png" ? "png" : "jpg";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `comprovante-caixa-${p.comprovante.id}.${ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (e) {
      setErroDownload((m) => ({ ...m, [p.id]: (e as Error).message }));
    } finally {
      setBaixando(null);
    }
  }

  return (
    <section className="space-y-3" aria-label="Meus Bolões" data-testid="meus-boloes">
      <div className="panel-3d rounded-xl overflow-hidden">
        <div className="login-card-topbar flex items-center gap-2 px-4 py-3">
          <Ticket className="w-4 h-4 text-accent" />
          <span className="text-primary text-xs font-black uppercase tracking-widest">MEUS BOLÕES</span>
        </div>
        <p className="px-4 py-3 text-muted-foreground text-xs leading-relaxed">
          {data?.aviso ?? "Aqui aparecem apenas as participações registradas pela clínica. O comprovante oficial é o recibo da CAIXA, já recebido e validado."}
        </p>
      </div>

      {error && <div className="panel-3d-sub rounded-xl p-4 text-sm text-destructive" role="alert">{error}</div>}
      {!data && !error && (
        <div className="panel-3d-sub rounded-xl p-6 flex items-center justify-center gap-2 text-muted-foreground text-sm">
          <Loader2 className="w-4 h-4 animate-spin" /> Carregando…
        </div>
      )}

      {data && data.participacoes.length === 0 && (
        <div className="panel-3d-sub rounded-xl p-8 text-center" data-testid="boloes-vazio">
          <p className="text-primary text-sm font-black">Nenhum bolão confirmado</p>
          <p className="text-muted-foreground text-xs mt-1">Quando a clínica registrar uma participação sua, ela aparecerá aqui.</p>
        </div>
      )}

      {data?.participacoes.map((p) => (
        <article key={p.id} className="panel-3d-sub rounded-xl p-3 space-y-3" data-testid="bolao-card">
          <div className="min-w-0">
            <h3 className="text-primary font-black text-sm uppercase tracking-wide break-words">{p.campanha.nome}</h3>
            <p className="text-accent text-[10px] font-black uppercase tracking-widest mt-0.5">{STATUS[p.status]}</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Campo label="COTAS" value={String(p.cotas)} />
            <Campo label="CONCURSO" value={p.campanha.concurso ?? ""} />
            <Campo label="SORTEIO" value={p.campanha.dataSorteio ? brDate(p.campanha.dataSorteio) : ""} />
            <Campo label="REGISTRO" value={p.registradaEm ? brDate(p.registradaEm) : ""} />
          </div>
          {p.status === "cancelada" ? null : p.comprovante ? (
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => void baixar(p)}
                disabled={baixando !== null}
                className="btn-3d-soft w-full flex items-center justify-center gap-2 h-12 text-xs font-black uppercase tracking-wider disabled:opacity-60"
              >
                {baixando === p.comprovante.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                Baixar recibo da CAIXA ({p.comprovante.tipo === "pdf" ? "PDF" : "imagem"}, {kb(p.comprovante.bytes)})
              </button>
              <p className="text-muted-foreground text-[10px] text-center">Recebido e validado em {brDate(p.comprovante.validadoEm)}.</p>
            </div>
          ) : (
            <p className="concave-3d rounded-lg px-3 py-2 text-muted-foreground text-xs text-center" data-testid="sem-comprovante">
              Comprovante oficial ainda não disponível
            </p>
          )}
          {erroDownload[p.id] && <p className="text-destructive text-xs" role="alert">{erroDownload[p.id]}</p>}
        </article>
      ))}
    </section>
  );
}
