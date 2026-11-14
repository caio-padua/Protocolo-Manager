import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, CircleDashed, Clock3, Download, Loader2, ShieldCheck, Ticket } from "lucide-react";

// Meus Bolões (Área do Cliente): somente leitura.
// Mostra só participações registradas pela clínica e baixa o recibo REAL da CAIXA já conferido.
// Três etapas DISTINTAS, nunca misturadas: pagamento (informado pela clínica), registro da aposta e entrega do comprovante.
// Nada aqui vende, cobra, aposta ou gera bilhete.

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type Participacao = {
  id: number;
  campanha: { nome: string; concurso: string | null; dataSorteio: string | null };
  cotas: number;
  status: "pendente_registro" | "registrada" | "cancelada";
  registradaEm: string | null;
  comprovante: { id: number; tipo: "pdf" | "imagem"; bytes: number; validadoEm: string; integridadeCodigo: string } | null;
  pagamento: "nao_informado" | "pendente" | "confirmado";
  entrega: "indisponivel" | "disponivel" | "baixado";
  baixadoEm: string | null;
};
type Resposta = { aviso: string; participacoes: Participacao[] };

type EtapaEstado = "feito" | "aguarda" | "vazio";
type Etapa = { chave: string; titulo: string; estado: EtapaEstado; texto: string };

const brDate = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
};
const kb = (b: number) => (b >= 1048576 ? `${(b / 1048576).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

function etapasDe(p: Participacao): Etapa[] {
  const pagamento: Etapa =
    p.pagamento === "confirmado"
      ? { chave: "pagamento", titulo: "Pagamento", estado: "feito", texto: "A clínica informou que o pagamento foi confirmado." }
      : p.pagamento === "pendente"
        ? { chave: "pagamento", titulo: "Pagamento", estado: "aguarda", texto: "A clínica informou que o pagamento está pendente." }
        : { chave: "pagamento", titulo: "Pagamento", estado: "vazio", texto: "A clínica ainda não informou o pagamento." };
  const registro: Etapa =
    p.status === "registrada"
      ? { chave: "registro", titulo: "Registro da aposta", estado: "feito", texto: p.registradaEm ? `Aposta registrada em ${brDate(p.registradaEm)}, com recibo oficial conferido.` : "Aposta registrada, com recibo oficial conferido." }
      : { chave: "registro", titulo: "Registro da aposta", estado: "aguarda", texto: "Aguardando o recibo oficial da CAIXA. Sem ele, o registro não é afirmado." };
  const entrega: Etapa =
    p.entrega === "baixado"
      ? { chave: "entrega", titulo: "Entrega do comprovante", estado: "feito", texto: p.baixadoEm ? `Você baixou o recibo em ${brDate(p.baixadoEm)}.` : "Você já baixou o recibo." }
      : p.entrega === "disponivel"
        ? { chave: "entrega", titulo: "Entrega do comprovante", estado: "feito", texto: "Recibo disponível para você baixar agora." }
        : { chave: "entrega", titulo: "Entrega do comprovante", estado: "aguarda", texto: "Comprovante oficial ainda não disponível." };
  return [pagamento, registro, entrega];
}

function IconeEtapa({ estado }: { estado: EtapaEstado }) {
  if (estado === "feito") return <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" aria-hidden="true" />;
  if (estado === "aguarda") return <Clock3 className="w-5 h-5 text-amber-600 shrink-0" aria-hidden="true" />;
  return <CircleDashed className="w-5 h-5 text-muted-foreground shrink-0" aria-hidden="true" />;
}

const ROTULO_ESTADO: Record<EtapaEstado, string> = { feito: "Concluída", aguarda: "Em espera", vazio: "Sem informação" };

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
      void load();
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
          <Ticket className="w-4 h-4 text-accent" aria-hidden="true" />
          <h2 className="text-primary text-xs font-black uppercase tracking-widest">MEUS BOLÕES</h2>
        </div>
        <p className="px-4 py-3 text-muted-foreground text-xs leading-relaxed">
          {data?.aviso ?? "Aqui aparecem apenas as participações registradas pela clínica. O comprovante oficial é o recibo da CAIXA, já recebido e conferido."}
        </p>
      </div>

      {error && <div className="panel-3d-sub rounded-xl p-4 text-sm text-destructive" role="alert">{error}</div>}
      {!data && !error && (
        <div className="panel-3d-sub rounded-xl p-6 flex items-center justify-center gap-2 text-muted-foreground text-sm" role="status">
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Carregando…
        </div>
      )}

      {data && data.participacoes.length === 0 && (
        <div className="panel-3d-sub rounded-xl p-8 text-center" data-testid="boloes-vazio">
          <p className="text-primary text-sm font-black">Nenhum bolão confirmado</p>
          <p className="text-muted-foreground text-xs mt-1">Quando a clínica registrar uma participação sua, ela aparecerá aqui.</p>
        </div>
      )}

      {data?.participacoes.map((p) => (
        <article key={p.id} className="panel-3d-sub rounded-xl p-3 space-y-3" data-testid="bolao-card" aria-label={`Bolão ${p.campanha.nome}`}>
          <div className="min-w-0">
            <h3 className="text-primary font-black text-sm uppercase tracking-wide break-words">{p.campanha.nome}</h3>
            {p.status === "cancelada" && <p className="text-destructive text-[10px] font-black uppercase tracking-widest mt-0.5">Participação cancelada</p>}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Campo label="COTAS" value={String(p.cotas)} />
            <Campo label="CONCURSO" value={p.campanha.concurso ?? ""} />
            <Campo label="SORTEIO" value={p.campanha.dataSorteio ? brDate(p.campanha.dataSorteio) : ""} />
            <Campo label="REGISTRO" value={p.registradaEm ? brDate(p.registradaEm) : ""} />
          </div>

          {p.status !== "cancelada" && (
            <ol className="space-y-2" aria-label="Etapas do bolão" data-testid="trilha-bolao">
              {etapasDe(p).map((e) => (
                <li key={e.chave} className="concave-3d rounded-lg px-3 py-2 flex items-start gap-3" data-etapa={e.chave} data-estado={e.estado}>
                  <IconeEtapa estado={e.estado} />
                  <div className="min-w-0">
                    <p className="text-primary text-[11px] font-black uppercase tracking-wider">
                      {e.titulo} <span className="text-muted-foreground font-bold normal-case tracking-normal">— {ROTULO_ESTADO[e.estado]}</span>
                    </p>
                    <p className="text-muted-foreground text-xs leading-snug">{e.texto}</p>
                  </div>
                </li>
              ))}
            </ol>
          )}

          {p.status === "cancelada" ? null : p.comprovante ? (
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => void baixar(p)}
                disabled={baixando !== null}
                className="btn-3d-soft w-full flex items-center justify-center gap-2 min-h-[48px] px-3 text-xs font-black uppercase tracking-wider disabled:opacity-60"
              >
                {baixando === p.comprovante.id ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Download className="w-4 h-4" aria-hidden="true" />}
                Baixar recibo da CAIXA ({p.comprovante.tipo === "pdf" ? "PDF" : "imagem"}, {kb(p.comprovante.bytes)})
              </button>
              <p className="text-muted-foreground text-[11px] text-center flex items-center justify-center gap-1.5 flex-wrap">
                <ShieldCheck className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                Conferido em {brDate(p.comprovante.validadoEm)} · código de integridade {p.comprovante.integridadeCodigo}
              </p>
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
