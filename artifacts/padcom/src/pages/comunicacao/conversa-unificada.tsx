import { useCallback, useEffect, useState } from "react";
import { Link } from "wouter";
import { Maximize2, Minimize2, RefreshCw, X, Download, Archive } from "lucide-react";
import { BASE } from "./_shared";
import { collabAuthHeaders } from "@/lib/collab-auth";
import { BolhaMensagem, FundoConversa } from "./bolhas-mensagem";

// Conversa unificada WWP (WhatsApp) + TG (Telegram), tarifas e backup. Dados sempre da clinica da sessao.

type Periodo = "hoje" | "7d" | "30d" | "tudo";
type Linha = {
  ref: string; canal: "wwp" | "tg"; clienteId: number | null; clienteNome: string | null; empresaNome: string | null;
  destino: string; direcao: "entrada" | "saida"; contexto: string | null; origem: string; entrega: string; erro: string | null;
  cobranca: string; valorCentavos: number | null; previa: string; corpo: string; criadoEm: string;
};
type Resumo = {
  porCanal: Record<"wwp" | "tg", { total: number; enviadas: number; recebidas: number; falhas: number }>;
  porCobranca: Record<string, number>; valorPagoCentavos: number;
};
type Arquivo = { id: number; lote: string; canal: string; escopo: string; formato: string; nome_arquivo: string; tamanho_bytes: number; sha256: string; total_mensagens: number; gerado_por_nome: string | null; criado_em: string };
type Download = { id: number; baixado_por_nome: string | null; baixado_em: string; nome_arquivo: string; formato: string };

const ROT_COBRANCA: Record<string, string> = { paga: "Paga", isenta: "Isenta", sem_tarifa: "Sem tarifa", teste: "Teste", nao_tarifado: "Não tarifado", sem_registro: "Sem registro" };
const ROT_ORIGEM: Record<string, string> = { cliente: "Cliente", humano: "Humano", ia: "IA", automatico: "Automático", nao_informado: "Não informado" };
const dh = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
const hora = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
const brl = (c: number | null) => c == null ? "—" : (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(`${BASE}/api${path}`, { ...init, headers: collabAuthHeaders({ "Content-Type": "application/json" }) });
  const corpo = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((corpo as { error?: string }).error ?? `Falha (${r.status})`);
  return corpo as T;
}

/** Painel horizontal recolhivel: maximizar/minimizar fica no extremo direito do cabecalho. */
export function PainelRecolhivel({ titulo, subtitulo, children, inicialAberto = true, acoes }: {
  titulo: string; subtitulo?: string; children: React.ReactNode; inicialAberto?: boolean; acoes?: React.ReactNode;
}) {
  const [aberto, setAberto] = useState(inicialAberto);
  return (
    <section className="panel-3d overflow-hidden">
      <div className="bevel-3d flex items-center justify-between gap-3 px-4 py-2.5">
        <div className="min-w-0">
          <p className="text-[13px] font-bold uppercase tracking-wide">{titulo}</p>
          {subtitulo && <p className="text-[10px] text-muted-foreground">{subtitulo}</p>}
        </div>
        <div className="flex items-center gap-2">
          {acoes}
          <button type="button" className="bevel-3d p-1.5" onClick={() => setAberto(!aberto)}
            aria-label={aberto ? "Minimizar painel" : "Maximizar painel"} title={aberto ? "Minimizar" : "Maximizar"}>
            {aberto ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>
      {aberto && <div className="p-4">{children}</div>}
    </section>
  );
}

/** Consulta periodica unica, so com a aba visivel. */
function usePolling(fn: () => void, ms: number) {
  useEffect(() => {
    fn();
    const t = setInterval(() => { if (document.visibilityState === "visible") fn(); }, ms);
    const v = () => { if (document.visibilityState === "visible") fn(); };
    document.addEventListener("visibilitychange", v);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", v); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ms]);
}

function Detalhe({ l, onFechar }: { l: Linha; onFechar: () => void }) {
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onFechar} />
      <aside className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col overflow-y-auto bg-background shadow-2xl" role="dialog" aria-label="Conteúdo completo">
        <div className="bevel-3d sticky top-0 flex items-center justify-between px-5 py-3">
          <span className="text-[13px] font-bold uppercase tracking-wide">{l.canal === "tg" ? "Telegram (TG)" : "WhatsApp (WWP)"} · {l.direcao === "entrada" ? "Recebida" : "Enviada"}</span>
          <button onClick={onFechar} className="concave-3d p-1.5" aria-label="Fechar"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-4 p-5">
          <FundoConversa canal={l.canal}>
            <BolhaMensagem canal={l.canal} direcao={l.direcao} texto={l.corpo} horario={hora(l.criadoEm)} entrega={l.entrega} />
          </FundoConversa>
          <dl className="panel-3d-sub grid grid-cols-2 gap-3 p-4 text-[12px]">
            {([
              ["Data e hora (Brasília)", dh(l.criadoEm)], ["Cliente", l.clienteNome ?? "—"], ["Destino", l.destino],
              ["Contexto", l.contexto ?? "—"], ["Origem", ROT_ORIGEM[l.origem]], ["Entrega", l.entrega],
              ["Cobrança", ROT_COBRANCA[l.cobranca]], ["Valor", brl(l.valorCentavos)], ["Clínica", l.empresaNome ?? "—"],
              ...(l.erro ? [["Código de erro", l.erro]] : []),
            ] as [string, string][]).map(([k, v]) => (
              <div key={k}><dt className="text-[10px] font-bold uppercase text-muted-foreground">{k}</dt><dd className="mt-0.5 break-words">{v}</dd></div>
            ))}
          </dl>
        </div>
      </aside>
    </>
  );
}

function Tabela({ periodo }: { periodo: Periodo }) {
  const [canal, setCanal] = useState<"" | "wwp" | "tg">("");
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [proximo, setProximo] = useState<string | null>(null);
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [det, setDet] = useState<Linha | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const q = `periodo=${periodo}${canal ? `&canal=${canal}` : ""}`;
      const [c, r] = await Promise.all([
        api<{ linhas: Linha[]; proximo: string | null }>(`/comunicacao/conversas?${q}&limite=50`),
        api<Resumo>(`/comunicacao/resumo?${q}`),
      ]);
      setLinhas(c.linhas); setProximo(c.proximo); setResumo(r); setErro("");
    } catch (e) { setErro(e instanceof Error ? e.message : "Falha ao carregar."); }
    finally { setCarregando(false); }
  }, [periodo, canal]);
  usePolling(() => { void carregar(); }, 30000);
  useEffect(() => { void carregar(); }, [carregar]);

  const maisAntigas = async () => {
    if (!proximo) return;
    const q = `periodo=${periodo}${canal ? `&canal=${canal}` : ""}&limite=50&cursor=${encodeURIComponent(proximo)}`;
    const c = await api<{ linhas: Linha[]; proximo: string | null }>(`/comunicacao/conversas?${q}`);
    setLinhas((a) => [...a, ...c.linhas]); setProximo(c.proximo);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {(["", "wwp", "tg"] as const).map((c) => (
          <button key={c} onClick={() => setCanal(c)} className={`bevel-3d px-3 py-1 text-[10px] font-bold uppercase ${canal === c ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>
            {c === "" ? "WWP + TG" : c === "wwp" ? "WWP" : "TG"}
          </button>
        ))}
        <button onClick={() => void carregar()} className="bevel-3d p-1.5" aria-label="Atualizar"><RefreshCw className={`h-3.5 w-3.5 ${carregando ? "animate-spin" : ""}`} /></button>
      </div>
      {resumo && (
        <div className="grid gap-2 text-[11px] sm:grid-cols-3">
          <div className="panel-3d-sub p-2"><b>WWP</b>: {resumo.porCanal.wwp.enviadas} enviadas · {resumo.porCanal.wwp.recebidas} recebidas · {resumo.porCanal.wwp.falhas} falhas</div>
          <div className="panel-3d-sub p-2"><b>TG</b>: {resumo.porCanal.tg.enviadas} enviadas · {resumo.porCanal.tg.recebidas} recebidas · {resumo.porCanal.tg.falhas} falhas</div>
          <div className="panel-3d-sub p-2"><b>Cobrança</b>: {resumo.porCobranca.paga} pagas · {resumo.porCobranca.isenta} isentas · {resumo.porCobranca.teste} teste · {brl(resumo.valorPagoCentavos)}</div>
        </div>
      )}
      {erro && <p className="concave-3d px-3 py-2 text-[12px] text-rose-700">{erro}</p>}
      <div className="max-h-[28rem] overflow-auto">
        <table className="w-full border-collapse text-[11px]">
          <thead className="sticky top-0 bg-background/95">
            <tr className="border-b border-border text-left uppercase tracking-wide text-muted-foreground">
              {["Data · Hora", "Canal", "Cliente", "Destino", "Direção", "Contexto", "Origem", "Entrega", "Cobrança", "Valor", "Clínica", "Prévia"].map((h) => <th key={h} className="whitespace-nowrap px-2 py-2 font-semibold">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.ref} className="cursor-pointer border-t border-border/50 align-top hover:bg-muted/30" onClick={() => setDet(l)}>
                <td className="whitespace-nowrap px-2 py-2 tabular-nums">{dh(l.criadoEm)}</td>
                <td className="px-2 py-2 font-bold">{l.canal === "tg" ? "TG" : "WWP"}</td>
                <td className="px-2 py-2">{l.clienteNome ?? "—"}</td>
                <td className="whitespace-nowrap px-2 py-2 font-mono">{l.destino}</td>
                <td className="px-2 py-2">{l.direcao === "entrada" ? "Recebida" : "Enviada"}</td>
                <td className="px-2 py-2 uppercase text-muted-foreground">{l.contexto ?? "—"}</td>
                <td className="px-2 py-2">{ROT_ORIGEM[l.origem]}</td>
                <td className="px-2 py-2">{l.entrega}</td>
                <td className="px-2 py-2">{ROT_COBRANCA[l.cobranca]}</td>
                <td className="px-2 py-2 tabular-nums">{brl(l.valorCentavos)}</td>
                <td className="px-2 py-2">{l.empresaNome ?? "—"}</td>
                <td className="max-w-[220px] truncate px-2 py-2 text-foreground/60">{l.previa}</td>
              </tr>
            ))}
            {!linhas.length && <tr><td colSpan={12} className="px-2 py-3 text-muted-foreground">{carregando ? "Carregando…" : "Nenhuma mensagem no período."}</td></tr>}
          </tbody>
        </table>
      </div>
      {proximo && <button onClick={() => void maisAntigas()} className="btn-3d-soft px-3 py-1.5 text-xs font-bold">Carregar mais antigas</button>}
      {det && <Detalhe l={det} onFechar={() => setDet(null)} />}
    </div>
  );
}

type Tarifa = { tipo_evento: string; valor_centavos: number; ativo: boolean; unidade: string; padrao: boolean; vigente_desde: string };
function PainelTarifas() {
  const [t, setT] = useState<Tarifa[] | null>(null);
  const [erro, setErro] = useState("");
  useEffect(() => {
    api<{ tarifas: Tarifa[] }>("/mensageria/credito").then((r) => setT(r.tarifas)).catch((e) => setErro(e.message));
  }, []);
  return (
    <div className="space-y-2 text-[12px]">
      {erro && <p className="concave-3d px-3 py-2 text-rose-700">{erro}</p>}
      {t && !t.length && <p className="concave-3d px-3 py-2 text-muted-foreground">Nenhuma tarifa ativa: as mensagens estão sem tarifa (nada é cobrado).</p>}
      {t && t.length > 0 && (
        <table className="w-full border-collapse text-[11px]">
          <thead><tr className="border-b border-border text-left uppercase text-muted-foreground"><th className="px-2 py-1">Evento</th><th className="px-2 py-1">Valor</th><th className="px-2 py-1">Unidade</th><th className="px-2 py-1">Vigente desde</th></tr></thead>
          <tbody>{t.map((x) => <tr key={x.tipo_evento} className="border-t border-border/50"><td className="px-2 py-1">{x.tipo_evento}</td><td className="px-2 py-1">{brl(x.valor_centavos)}</td><td className="px-2 py-1">{x.unidade}</td><td className="px-2 py-1">{dh(x.vigente_desde)}</td></tr>)}</tbody>
        </table>
      )}
      <p className="text-muted-foreground">Somente leitura aqui. Quem administra as tarifas edita em <Link href="/licenciado" className="font-bold underline">Licenciado → aba "Tarifas e Créditos"</Link>.</p>
    </div>
  );
}

function PainelBackup() {
  const [canal, setCanal] = useState("AMBOS");
  const [escopo, setEscopo] = useState("geral");
  const [clienteId, setClienteId] = useState("");
  const [periodo, setPeriodo] = useState<Periodo>("30d");
  const [arq, setArq] = useState<Arquivo[]>([]);
  const [dl, setDl] = useState<Download[]>([]);
  const [msg, setMsg] = useState("");
  const [gerando, setGerando] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const [a, d] = await Promise.all([api<{ arquivos: Arquivo[] }>("/comunicacao/backups"), api<{ downloads: Download[] }>("/comunicacao/backups/downloads")]);
      setArq(a.arquivos); setDl(d.downloads);
    } catch (e) { setMsg(e instanceof Error ? e.message : "Falha ao carregar."); }
  }, []);
  useEffect(() => { void carregar(); }, [carregar]);

  const gerar = async () => {
    setGerando(true); setMsg("");
    try {
      const r = await api<{ arquivos: unknown[] }>("/comunicacao/backups", { method: "POST", body: JSON.stringify({ canal, escopo, clienteId: escopo === "cliente" ? Number(clienteId) : undefined, periodo }) });
      setMsg(`Backup gerado: ${r.arquivos.length} arquivos (PDF, XLSX e JSON).`); await carregar();
    } catch (e) { setMsg(e instanceof Error ? e.message : "Falha ao gerar."); }
    finally { setGerando(false); }
  };
  const baixar = async (a: Arquivo) => {
    const r = await fetch(`${BASE}/api/comunicacao/backups/${a.id}/download`, { headers: collabAuthHeaders() });
    if (!r.ok) { setMsg("Não foi possível baixar o arquivo."); return; }
    const url = URL.createObjectURL(await r.blob());
    const el = document.createElement("a"); el.href = url; el.download = a.nome_arquivo; el.click(); URL.revokeObjectURL(url);
    void carregar();
  };

  const sel = "field-engraved rounded-[4px] px-2 py-1.5 text-xs";
  return (
    <div className="space-y-3 text-[12px]">
      <div className="flex flex-wrap items-end gap-3">
        <label className="font-semibold">Canal<select className={`${sel} mt-1 block`} value={canal} onChange={(e) => setCanal(e.target.value)}><option value="AMBOS">TG + WWP</option><option value="TG">TG (Telegram)</option><option value="WWP">WWP (WhatsApp)</option></select></label>
        <label className="font-semibold">Escopo<select className={`${sel} mt-1 block`} value={escopo} onChange={(e) => setEscopo(e.target.value)}><option value="geral">Geral</option><option value="cliente">Cliente individual</option></select></label>
        {escopo === "cliente" && <label className="font-semibold">Número do cliente<input className={`${sel} mt-1 block w-28`} value={clienteId} onChange={(e) => setClienteId(e.target.value.replace(/\D/g, ""))} /></label>}
        <label className="font-semibold">Período<select className={`${sel} mt-1 block`} value={periodo} onChange={(e) => setPeriodo(e.target.value as Periodo)}><option value="hoje">Hoje</option><option value="7d">7 dias</option><option value="30d">30 dias</option><option value="tudo">Todo o histórico</option></select></label>
        <button disabled={gerando || (escopo === "cliente" && !clienteId)} onClick={() => void gerar()} className="btn-3d-soft px-4 py-2 text-xs font-bold">{gerando ? "Gerando…" : "Gerar backup (PDF + XLSX + JSON)"}</button>
      </div>
      {msg && <p className="concave-3d px-3 py-2">{msg}</p>}
      <h4 className="flex items-center gap-1 font-bold uppercase text-muted-foreground"><Archive className="h-3.5 w-3.5" />Arquivos prontos</h4>
      <div className="max-h-60 overflow-auto">
        <table className="w-full border-collapse text-[11px]"><tbody>
          {arq.map((a) => (
            <tr key={a.id} className="border-t border-border/50">
              <td className="px-2 py-1.5">{a.nome_arquivo}</td>
              <td className="whitespace-nowrap px-2 py-1.5 text-muted-foreground">{a.total_mensagens} msgs · {(a.tamanho_bytes / 1024).toFixed(0)} KB</td>
              <td className="whitespace-nowrap px-2 py-1.5 text-muted-foreground">{dh(a.criado_em)}</td>
              <td className="px-2 py-1.5 font-mono text-[9px] text-muted-foreground" title={a.sha256}>SHA-256 {a.sha256.slice(0, 10)}…</td>
              <td className="px-2 py-1.5"><button className="bevel-3d p-1.5" onClick={() => void baixar(a)} aria-label={`Baixar ${a.nome_arquivo}`}><Download className="h-3.5 w-3.5" /></button></td>
            </tr>
          ))}
          {!arq.length && <tr><td className="px-2 py-2 text-muted-foreground">Nenhum backup gerado ainda.</td></tr>}
        </tbody></table>
      </div>
      <h4 className="font-bold uppercase text-muted-foreground">Histórico de downloads</h4>
      <div className="max-h-40 overflow-auto">
        <table className="w-full border-collapse text-[11px]"><tbody>
          {dl.map((d) => <tr key={d.id} className="border-t border-border/50"><td className="px-2 py-1">{dh(d.baixado_em)}</td><td className="px-2 py-1">{d.baixado_por_nome ?? "—"}</td><td className="px-2 py-1">{d.nome_arquivo}</td></tr>)}
          {!dl.length && <tr><td className="px-2 py-2 text-muted-foreground">Nenhum download registrado.</td></tr>}
        </tbody></table>
      </div>
    </div>
  );
}

export function SecaoComunicacaoUnificada({ periodo }: { periodo: Periodo }) {
  const [podeBackup, setPodeBackup] = useState(false);
  useEffect(() => { api<{ backup: boolean }>("/comunicacao/permissoes").then((p) => setPodeBackup(p.backup)).catch(() => setPodeBackup(false)); }, []);
  return (
    <div className="space-y-4">
      <PainelRecolhivel titulo="Conversa unificada · WWP + TG" subtitulo="Todas as mensagens da clínica, enviadas e recebidas. Clique numa linha para ver o conteúdo completo.">
        <Tabela periodo={periodo} />
      </PainelRecolhivel>
      <PainelRecolhivel titulo="Tarifas e valores" subtitulo="Tarifas ativas da clínica" inicialAberto={false}><PainelTarifas /></PainelRecolhivel>
      {podeBackup && (
        <PainelRecolhivel titulo="Backup de mensagens" subtitulo="Somente administrador da clínica" inicialAberto={false}><PainelBackup /></PainelRecolhivel>
      )}
    </div>
  );
}
