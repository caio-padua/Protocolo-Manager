import { useCallback, useEffect, useMemo, useState } from "react";
import { useListClients } from "@workspace/api-client-react";
import { AlertTriangle, CheckCircle2, Download, FileUp, Loader2, RefreshCw, ShieldAlert } from "lucide-react";
import { collabAuthHeaders } from "@/lib/collab-auth";
import { PaxterClientSelector } from "@/components/PaxterClientSelector";
import { brData, brDataHora, brl, dz, type Modalidade, type PedidoVisto } from "@/components/meus-jogos/tipos";

// Aba "Jogos do cliente" (gestor). Acompanha os pedidos INDIVIDUAIS de Meus Jogos do cliente escolhido (somente da clinica do gestor).
// Nada aqui aposta nem devolve dinheiro: devolucao e ato humano registrado; "registrado" so existe com comprovante oficial anexado.

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const G = `${BASE}/api/boloes/gestao/meus-jogos`;
const BTN = "btn-3d-soft min-h-[44px] px-3 text-xs font-black uppercase tracking-wider disabled:opacity-60 inline-flex items-center justify-center gap-2";
const LBL = "block text-[11px] font-black uppercase tracking-wider text-primary";
const INP = "field-engraved w-full min-h-[44px] px-2 text-sm";
const MODS: { k: Modalidade; n: string }[] = [{ k: "megasena", n: "Mega-Sena" }, { k: "lotofacil", n: "Lotofácil" }, { k: "quina", n: "Quina" }, { k: "lotomania", n: "Lotomania" }];

type Config = { margemMinutos: number; metaMinutos: number; tetoPedidoCentavos: number; fechamentoOficial: Partial<Record<Modalidade, string>>; fonteFechamento: string | null };
type Fonte = { modalidade: Modalidade; nome: string; fonteUrl: string; situacao: { desatualizado: boolean; motivo: string | null; verificadoEm: string }; conferencia: { ok: boolean; verificadoEm: string; divergencias: string[] } | null };
type Painel = { config: Config; execucao: { disponivel: boolean; motivo: string; ambiente: string }; snapshotVerificadoEm: string; fontes: Fonte[] };
type PedidoGestor = PedidoVisto & { motivoInterno: string | null; devolucaoRef: string | null };
type DadosCliente = { cliente: { id: number; nome: string }; membroAtivo: boolean; favoritos: number; pedidos: PedidoGestor[] };

async function chamar<T>(caminho: string, init?: { method?: string; json?: unknown; form?: FormData }): Promise<T> {
  const headers = collabAuthHeaders(init?.json !== undefined ? { "Content-Type": "application/json" } : {});
  const res = await fetch(`${G}${caminho}`, { method: init?.method ?? "GET", headers, body: init?.form ?? (init?.json !== undefined ? JSON.stringify(init.json) : undefined) });
  const corpo = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(res.status === 403 ? "Acesso restrito ao gestor da clínica." : res.status === 401 ? "Sessão expirada. Entre novamente." : corpo.error ?? "Não foi possível concluir.");
  return corpo as T;
}
async function abrirComprovante(id: number) {
  const res = await fetch(`${G}/pedidos/${id}/comprovante`, { headers: collabAuthHeaders() });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Comprovante indisponível.");
  const url = URL.createObjectURL(await res.blob());
  window.open(url, "_blank", "noopener");
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function Bloco({ titulo, children, id }: { titulo: string; children: React.ReactNode; id?: string }) {
  return (
    <section className="panel-3d rounded-xl overflow-hidden" aria-label={titulo} data-testid={id}>
      <div className="login-card-topbar px-4 py-3"><h2 className="text-primary text-xs font-black uppercase tracking-widest">{titulo}</h2></div>
      <div className="p-3 space-y-3">{children}</div>
    </section>
  );
}

function PedidoLinha({ p, rodar, ocupado }: { p: PedidoGestor; rodar: (fn: () => Promise<unknown>, ok: string) => void; ocupado: boolean }) {
  const [nota, setNota] = useState(""); const [ref, setRef] = useState("");
  const aguardaComprovante = p.status === "processando" || p.status === "falha_em_conferencia";
  return (
    <article className="panel-3d-sub rounded-xl p-3 space-y-2" data-testid="mj-gestor-pedido" data-status={p.status}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-primary text-sm font-black">{p.nome} · concurso {p.concurso} · {brl(p.totalCentavos)}</p>
          <p className="text-muted-foreground text-[11px]">Pedido {p.id} · sorteio {brData(p.dataSorteio)} · criado {brDataHora(p.criadoEm)}{p.pagoEm ? ` · pago ${brDataHora(p.pagoEm)}` : ""}</p>
        </div>
        <span className="rounded-full bg-muted px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-primary">{p.rotulo}</span>
      </div>
      <ul className="space-y-1">{p.jogos.map((j) => <li key={j.ordem} className="concave-3d rounded-lg px-3 py-1.5 text-xs text-primary font-black tabular-nums">Jogo {j.ordem}: {j.dezenas.map(dz).join(" ")}</li>)}</ul>
      {p.falha && <p className="concave-3d rounded-lg px-3 py-2 text-xs flex gap-2"><AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" aria-hidden="true" />{p.falha.texto}</p>}
      {p.atrasadoNaMeta && <p className="text-xs text-amber-800 dark:text-amber-300">Além da meta operacional de registro ({p.prazos.metaEfetivacaoEm ? brDataHora(p.prazos.metaEfetivacaoEm) : "—"}).</p>}
      {p.devolucaoRef && <p className="text-xs text-muted-foreground">Devolução registrada: {p.devolucaoRef}</p>}
      {p.comprovante && <button type="button" className={BTN} onClick={() => rodar(() => abrirComprovante(p.id), "")}><Download className="w-4 h-4" aria-hidden="true" /> Abrir comprovante ({p.comprovante.codigo})</button>}
      {aguardaComprovante && (
        <div className="space-y-2">
          <label className={LBL} htmlFor={`mjc-${p.id}`}>Anexar comprovante oficial (PDF, PNG ou JPEG)</label>
          <input id={`mjc-${p.id}`} type="file" accept="application/pdf,image/png,image/jpeg" className={INP} data-testid="mj-gestor-comprovante" disabled={ocupado}
            onChange={(e) => { const f = e.target.files?.[0]; if (!f) return; const form = new FormData(); form.append("file", f); rodar(() => chamar(`/pedidos/${p.id}/comprovante`, { method: "POST", form }), "Comprovante anexado. O pedido passa a registrado."); e.target.value = ""; }} />
          <p className="text-[11px] text-muted-foreground leading-snug"><FileUp className="w-3 h-3 inline mr-1" aria-hidden="true" />Só o comprovante oficial muda o pedido para registrado.</p>
        </div>
      )}
      {p.status === "falha_em_conferencia" && (
        <div className="space-y-2">
          <label className={LBL} htmlFor={`mja-${p.id}`}>Atestar que NÃO houve aposta (conferido na lotérica ou conta CAIXA)</label>
          <textarea id={`mja-${p.id}`} rows={2} maxLength={280} className="field-engraved w-full px-2 py-2 text-sm" value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Descreva como foi conferido" />
          <button type="button" className={BTN} disabled={ocupado || nota.trim().length < 10} data-testid="mj-gestor-atestar"
            onClick={() => rodar(() => chamar(`/pedidos/${p.id}/atestar-sem-aposta`, { method: "POST", json: { nota } }), "Atestado registrado. Devolução pendente.")}>Atestar sem aposta</button>
        </div>
      )}
      {p.status === "devolucao_pendente" && (
        <div className="space-y-2">
          <label className={LBL} htmlFor={`mjd-${p.id}`}>Referência da devolução já feita (ex.: código do PIX)</label>
          <input id={`mjd-${p.id}`} className={INP} maxLength={120} value={ref} onChange={(e) => setRef(e.target.value)} />
          <button type="button" className={BTN} disabled={ocupado || ref.trim().length < 3} data-testid="mj-gestor-devolver"
            onClick={() => rodar(() => chamar(`/pedidos/${p.id}/devolucao`, { method: "POST", json: { referencia: ref } }), "Devolução registrada.")}>Registrar devolução feita</button>
          <p className="text-[11px] text-muted-foreground leading-snug">O sistema não move dinheiro. Faça a devolução no Asaas e registre aqui.</p>
        </div>
      )}
    </article>
  );
}

export default function MeusJogosGestao() {
  const { data: todos } = useListClients();
  const opcoes = useMemo(() => (todos ?? []).map((cl) => ({ id: cl.id, name: cl.name, cpf: cl.cpf ?? null, phone: cl.phone ?? null, photoUrl: (cl as { photoUrl?: string | null }).photoUrl ?? null })), [todos]);
  const [cli, setCli] = useState<number | null>(null);
  const [dados, setDados] = useState<DadosCliente | null>(null);
  const [painel, setPainel] = useState<Painel | null>(null);
  const [cfg, setCfg] = useState<{ margem: string; meta: string; teto: string; fonte: string; hor: Record<Modalidade, string> }>({ margem: "240", meta: "30", teto: "500,00", fonte: "", hor: { megasena: "", lotofacil: "", quina: "", lotomania: "" } });
  const [ocupado, setOcupado] = useState(false);
  const [msg, setMsg] = useState(""); const [erro, setErro] = useState("");

  const carregarPainel = useCallback(async () => {
    try {
      const p = await chamar<Painel>("/painel"); setPainel(p);
      setCfg({ margem: String(p.config.margemMinutos), meta: String(p.config.metaMinutos), teto: (p.config.tetoPedidoCentavos / 100).toFixed(2).replace(".", ","), fonte: p.config.fonteFechamento ?? "",
        hor: { megasena: p.config.fechamentoOficial.megasena ?? "", lotofacil: p.config.fechamentoOficial.lotofacil ?? "", quina: p.config.fechamentoOficial.quina ?? "", lotomania: p.config.fechamentoOficial.lotomania ?? "" } });
      setErro("");
    } catch (e) { setErro((e as Error).message); }
  }, []);
  const carregarCliente = useCallback(async (id: number | null) => {
    if (!id) { setDados(null); return; }
    try { setDados(await chamar<DadosCliente>(`/cliente/${id}`)); setErro(""); } catch (e) { setDados(null); setErro((e as Error).message); }
  }, []);
  useEffect(() => { void carregarPainel(); }, [carregarPainel]);
  useEffect(() => { void carregarCliente(cli); }, [cli, carregarCliente]);

  function rodar(fn: () => Promise<unknown>, ok: string) {
    setOcupado(true); setMsg(""); setErro("");
    fn().then(() => { if (ok) setMsg(ok); return Promise.all([carregarCliente(cli), carregarPainel()]); })
      .catch((e: Error) => setErro(e.message)).finally(() => setOcupado(false));
  }
  function salvarConfig() {
    const teto = Math.round(Number(cfg.teto.replace(/\./g, "").replace(",", ".")) * 100);
    const fech: Partial<Record<Modalidade, string>> = {};
    for (const m of MODS) if (cfg.hor[m.k]) fech[m.k] = cfg.hor[m.k];
    rodar(() => chamar("/config", { method: "PUT", json: { margemMinutos: Number(cfg.margem), metaMinutos: Number(cfg.meta), tetoPedidoCentavos: teto, fechamentoOficial: fech, fonteFechamento: cfg.fonte.trim() || null } }), "Configuração salva.");
  }

  return (
    <div className="space-y-4" data-testid="meus-jogos-gestao">
      <Bloco titulo="Jogos do cliente (Meus Jogos)" id="mj-gestor-cliente">
        <p className="text-muted-foreground text-xs leading-relaxed">Escolha o cliente para acompanhar os pedidos individuais dele. Pedidos de bolão ficam em Conexão Milionária, separados.</p>
        <label className={LBL}>Cliente</label>
        <PaxterClientSelector clientes={opcoes} value={cli} onChange={setCli} placeholder="Selecionar cliente…" />
        {msg && <p role="status" className="text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-1"><CheckCircle2 className="w-4 h-4" aria-hidden="true" />{msg}</p>}
        {erro && <p role="alert" className="text-xs text-red-700 dark:text-red-300" data-testid="mj-gestor-erro">{erro}</p>}
        {dados && (
          <p className="concave-3d rounded-lg px-3 py-2 text-xs text-primary" data-testid="mj-gestor-resumo-cliente">
            <strong>{dados.cliente.nome}</strong> · {dados.membroAtivo ? "participa do Grupo VIP" : "NÃO participa do Grupo VIP (sem acesso a Meus Jogos)"} · {dados.favoritos} favorito(s) · {dados.pedidos.length} pedido(s)
          </p>
        )}
        {dados && dados.pedidos.length === 0 && <p className="concave-3d rounded-lg p-3 text-center text-muted-foreground text-xs" data-testid="mj-gestor-vazio">Este cliente ainda não fez pedidos em Meus Jogos.</p>}
        {dados?.pedidos.map((p) => <PedidoLinha key={`${p.id}-${p.status}`} p={p} rodar={rodar} ocupado={ocupado} />)}
      </Bloco>

      <Bloco titulo="Execução, prazos e fonte oficial" id="mj-gestor-painel">
        {!painel && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
        {painel && (
          <>
            <p className={`rounded-lg px-3 py-2 text-xs flex gap-2 concave-3d ${painel.execucao.disponivel ? "text-primary" : "text-amber-800 dark:text-amber-300"}`} data-testid="mj-gestor-execucao" data-disponivel={painel.execucao.disponivel ? "sim" : "nao"}>
              <ShieldAlert className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span><strong>{painel.execucao.disponivel ? "Execução conectada" : "Execução indisponível"}</strong> ({painel.execucao.ambiente}). {painel.execucao.motivo} Enquanto indisponível, nenhum pedido é aceito.</span>
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div><label className={LBL} htmlFor="mjg-margem">Margem interna (min antes do fechamento)</label><input id="mjg-margem" inputMode="numeric" className={INP} value={cfg.margem} onChange={(e) => setCfg({ ...cfg, margem: e.target.value.replace(/\D/g, "") })} /></div>
              <div><label className={LBL} htmlFor="mjg-meta">Meta após pagamento (min)</label><input id="mjg-meta" inputMode="numeric" className={INP} value={cfg.meta} onChange={(e) => setCfg({ ...cfg, meta: e.target.value.replace(/\D/g, "") })} /></div>
              <div><label className={LBL} htmlFor="mjg-teto">Teto por pedido (R$)</label><input id="mjg-teto" inputMode="decimal" className={INP} value={cfg.teto} onChange={(e) => setCfg({ ...cfg, teto: e.target.value.replace(/[^\d,.]/g, "") })} /></div>
            </div>
            <p className="text-[11px] text-muted-foreground leading-snug">Horário oficial de fechamento da aposta simples: informe com a fonte (comunicado ou página oficial da CAIXA). Sem horário, a modalidade fica bloqueada.</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {MODS.map((m) => (
                <div key={m.k}><label className={LBL} htmlFor={`mjg-h-${m.k}`}>{m.n}</label><input id={`mjg-h-${m.k}`} type="time" className={INP} value={cfg.hor[m.k]} onChange={(e) => setCfg({ ...cfg, hor: { ...cfg.hor, [m.k]: e.target.value } })} /></div>
              ))}
            </div>
            <label className={LBL} htmlFor="mjg-fonte">Fonte do horário de fechamento</label>
            <input id="mjg-fonte" className={INP} maxLength={200} value={cfg.fonte} onChange={(e) => setCfg({ ...cfg, fonte: e.target.value })} placeholder="Ex.: página oficial, comunicado, data da consulta" />
            <div className="flex flex-wrap gap-2">
              <button type="button" className={BTN} disabled={ocupado} onClick={salvarConfig} data-testid="mj-gestor-salvar-config">Salvar configuração</button>
              <button type="button" className={BTN} disabled={ocupado} onClick={() => rodar(() => chamar("/fonte/conferir", { method: "POST" }), "Conferência com as páginas oficiais concluída.")} data-testid="mj-gestor-conferir"><RefreshCw className="w-4 h-4" aria-hidden="true" /> Conferir regras e preços na CAIXA</button>
              <button type="button" className={BTN} disabled={ocupado} onClick={() => rodar(() => chamar("/fila/processar", { method: "POST" }), "Fila verificada.")}>Verificar fila agora</button>
            </div>
            <ul className="space-y-1.5" aria-label="Situação das regras por modalidade">
              {painel.fontes.map((f) => (
                <li key={f.modalidade} className="concave-3d rounded-lg px-3 py-2 text-xs" data-testid="mj-gestor-fonte" data-desatualizado={f.situacao.desatualizado ? "sim" : "nao"}>
                  <p className="text-primary font-black">{f.nome}: {f.situacao.desatualizado ? "DESATUALIZADO (pedidos bloqueados)" : "em dia"}</p>
                  <p className="text-muted-foreground">{f.situacao.motivo ?? `Verificado em ${brDataHora(f.situacao.verificadoEm)}.`}{f.conferencia?.divergencias?.length ? ` Divergências: ${f.conferencia.divergencias.join("; ")}` : ""}</p>
                </li>
              ))}
            </ul>
          </>
        )}
      </Bloco>
    </div>
  );
}
