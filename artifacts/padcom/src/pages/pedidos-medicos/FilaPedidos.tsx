import type React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { abrirPdfExame } from "@/lib/abrir-pdf-exame";
import { Download, Eye, FileSignature, Loader2, Pencil, RotateCcw, Send } from "lucide-react";
import { collabAuthHeaders } from "@/lib/collab-auth";
import { BarraGrupo } from "@/components/ui/barra-grupo";
import { PlacaTitulo } from "@/components/ui/placa-titulo";
import { ChaveOuro } from "@/components/ui/chave-ouro";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type Item = {
  id: number; kind: "receita" | "pedido_exames"; kindLabel: string; clientId: number; clientName: string;
  details: string; status: "pago" | "em_analise" | "emitido"; paidAt: string | null; createdAt: string;
  isento: boolean; draftItems: string | null; docToken: string | null;
  liberadoAuto: boolean; auditoriaStatus: string | null; auditoriaNota: string | null;
  docSendStatus: string | null; docSentAt: string | null; docSendError: string | null;
  assignedProfessionalId: number | null; assignedReason: string | null; asResponsible: boolean;
};

const REASON: Record<string, string> = {
  habitual: "Médico habitual do cliente",
  responsavel_tecnico: "Encaminhado ao responsável técnico",
  sem_destino: "Sem médico apto: aguardando o responsável técnico",
  encaminhado: "Encaminhado pelo responsável técnico",
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}/api/pedidos-medicos${path}`, {
    ...init, headers: collabAuthHeaders(init?.body ? { "Content-Type": "application/json" } : {}),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? "Não foi possível concluir.");
  return body as T;
}

const linhas = (t: string | null | undefined) =>
  String(t ?? "").split(/\r?\n/).map((l) => l.replace(/^[\s\-•*\d.)]+/, "").trim()).filter(Boolean);

export function FilaPedidos() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState<number | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [texto, setTexto] = useState("");
  const [refusing, setRefusing] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const [aberta, setAberta] = useState<{ member: boolean; padrao: boolean }>({ member: true, padrao: true });
  const [primeira, setPrimeira] = useState<"member" | "padrao">("member");
  const [validacao, setValidacao] = useState<boolean | null>(null);
  useEffect(() => { api<{ ativa: boolean }>("/validacao-medica").then((r) => setValidacao(r.ativa)).catch(() => setValidacao(null)); }, []);
  async function trocarValidacao() {
    const nova = !validacao;
    try { setValidacao((await api<{ ativa: boolean }>("/validacao-medica", { method: "PUT", body: JSON.stringify({ ativa: nova }) })).ativa); }
    catch (e) { setError((e as Error).message); }
  }

  const load = useCallback(async () => {
    try { setItems(await api<Item[]>("/fila")); setError(""); } catch (e) { setError((e as Error).message); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const pendentes = useMemo(() => (items ?? []).filter((i) => i.status !== "emitido"), [items]);
  const emitidos = useMemo(() => (items ?? []).filter((i) => i.status === "emitido"), [items]);
  const atencao = emitidos.filter((i) => i.docSendStatus === "falha" || !i.docToken).length;

  async function run(id: number, fn: () => Promise<unknown>, okMsg?: string) {
    setBusy(id); setError(""); setInfo("");
    try { await fn(); if (okMsg) setInfo(okMsg); await load(); } catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  }

  async function previa(id: number) {
    setError("");
    const res = await fetch(`${BASE}/api/pedidos-medicos/${id}/previa`, { headers: collabAuthHeaders() });
    if (!res.ok) { setError((await res.json().catch(() => ({}))).error ?? "Não foi possível gerar a prévia."); return; }
    const url = URL.createObjectURL(await res.blob());
    window.open(url, "_blank", "noopener");
  }

  const baixar = (token: string) => { abrirPdfExame(token).catch((e: Error) => setError(e.message)); };

  const dia = (i: Item) => new Date(i.createdAt).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const hora = (i: Item) => new Date(i.createdAt).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
  // Card = mesmo cliente no MESMO DIA (fuso de Brasilia): tudo que ele pediu naquele dia fica junto.
  // Dia diferente = card novo. Cards com o pedido mais novo ficam em cima; os antigos descem e nunca somem.
  function cards(list: Item[]) {
    const m = new Map<string, Item[]>();
    for (const i of list) { const k = `${i.clientId}|${dia(i)}`; m.set(k, [...(m.get(k) ?? []), i]); }
    return [...m.entries()].map(([k, v]) => {
      const itens = v.sort((x, y) => new Date(y.createdAt).getTime() - new Date(x.createdAt).getTime() || y.id - x.id);
      return { k, itens, ultimo: new Date(itens[0].createdAt).getTime() };
    }).sort((x, y) => y.ultimo - x.ultimo);
  }
  const Linha = (it: Item, conteudo: React.ReactNode) => (
    <div key={it.id} className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-3 items-start">
      <span className="bevel-3d inline-flex h-10 items-center justify-center text-sm font-black text-primary tabular-nums" title={`Pedido feito às ${hora(it)}`}>{hora(it)}</span>
      {conteudo}
    </div>
  );

  function Pedido({ it }: { it: Item }) {
    const mine = it.assignedProfessionalId !== null && !it.asResponsible;
    const exames = it.kind === "pedido_exames";
    const itens = linhas(it.draftItems ?? it.details);
    const aba = it.kind === "receita" ? "prescricao" : "exames";
    return (
      <div className="concave-3d p-3 space-y-3">
        <div className="flex items-center gap-2">
          <span className="bevel-3d pm-pendente inline-flex h-6 items-center px-2 text-[10px] font-black uppercase tracking-[0.18em]">Pendente</span>
          <span className="text-sm font-semibold text-primary">{it.kindLabel} nº {it.id}</span>
                  </div>
        {it.assignedReason && <p className="text-xs text-muted-foreground">{REASON[it.assignedReason] ?? it.assignedReason}</p>}
        {exames ? (
          editing === it.id ? (
            <div className="space-y-2">
              <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={5} aria-label="Itens do pedido, um por linha"
                className="w-full rounded-md border border-border bg-background p-2 text-sm" />
              <p className="text-xs text-muted-foreground">Um exame por linha. O documento sai exatamente com esta lista.</p>
              <div className="flex gap-2">
                <button type="button" disabled={busy === it.id || linhas(texto).length === 0} className="btn-3d px-4 h-9 text-xs font-black uppercase tracking-wider disabled:opacity-40"
                  onClick={() => run(it.id, async () => { await api(`/${it.id}/itens`, { method: "PUT", body: JSON.stringify({ itens: linhas(texto) }) }); setEditing(null); }, "Itens salvos.")}>Salvar itens</button>
                <button type="button" className="btn-3d-soft px-4 h-9 text-xs font-black uppercase tracking-wider" onClick={() => setEditing(null)}>Cancelar</button>
              </div>
            </div>
          ) : (
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">Pré-pronto: itens do documento</p>
              <ol className="list-decimal pl-5 text-sm space-y-0.5">{itens.map((l, i) => <li key={i} className="break-words">{l}</li>)}</ol>
            </div>
          )
        ) : <p className="text-sm break-words">{it.details}</p>}
        <div className="flex flex-wrap items-center gap-2">
          {exames && mine && (<>
            <button type="button" title="Ver prévia (sem certificado)" aria-label="Ver prévia" onClick={() => void previa(it.id)} className="btn-3d-soft h-10 w-10 inline-flex items-center justify-center"><Eye className="w-4 h-4" /></button>
            <button type="button" title="Editar itens" aria-label="Editar itens" onClick={() => { setEditing(it.id); setTexto(itens.join("\n")); }} className="btn-3d-soft h-10 w-10 inline-flex items-center justify-center"><Pencil className="w-4 h-4" /></button>
            <button type="button" disabled={busy === it.id}
              onClick={() => { if (window.confirm(`Assinar com o seu certificado digital e enviar a ${it.clientName}?`)) void run(it.id, async () => {
                const r = await api<{ envio: { status: string; error: string | null } }>(`/${it.id}/assinar-enviar`, { method: "POST", body: "{}" });
                if (r.envio.status !== "enviado") throw new Error(`Documento assinado e salvo, mas o envio falhou: ${r.envio.error ?? "motivo não informado"}. Use Reenviar.`);
              }, "Assinado e enviado ao cliente."); }}
              className="btn-3d px-4 h-10 text-xs font-black uppercase tracking-wider inline-flex items-center gap-2 disabled:opacity-40">
              {busy === it.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSignature className="w-4 h-4" />} Assinar e enviar
            </button></>)}
          {!exames && mine && (<>
            <Link href={`/cockpit/${it.clientId}/${aba}`} className="btn-3d-soft px-4 h-10 text-xs font-black uppercase tracking-wider inline-flex items-center">Abrir no Cockpit</Link>
            <button type="button" disabled={busy === it.id} className="btn-3d px-4 h-10 text-xs font-black uppercase tracking-wider disabled:opacity-40"
              onClick={() => { if (window.confirm("Confirme que a receita já foi emitida e assinada no Cockpit.")) void run(it.id, async () => {
                if (it.status === "pago") await api(`/${it.id}/iniciar`, { method: "POST", body: "{}" });
                await api(`/${it.id}/emitido`, { method: "POST", body: "{}" }); }); }}>Receita já emitida</button></>)}
          {mine && <button type="button" onClick={() => { setRefusing(refusing === it.id ? null : it.id); setReason(""); }} className="btn-3d-soft px-3 h-10 text-xs font-black uppercase tracking-wider ml-auto">Recusar</button>}
          {it.asResponsible && it.assignedProfessionalId !== null && <p className="text-xs text-muted-foreground">Com outro médico.</p>}
          {it.assignedProfessionalId === null && <button type="button" className="btn-3d px-4 h-10 text-xs font-black uppercase tracking-wider" onClick={() => run(it.id, () => api(`/${it.id}/iniciar`, { method: "POST", body: "{}" }))}>Assumir pedido</button>}
        </div>
        {refusing === it.id && (
          <div className="space-y-2">
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={1000} aria-label="Motivo da recusa" placeholder="Motivo da recusa (o cliente verá). Mínimo de 10 caracteres." className="w-full rounded-md border border-border bg-background p-2 text-sm" />
            <p className="text-xs text-muted-foreground">A recusa deixa o reembolso pendente. O sistema não devolve o dinheiro sozinho.</p>
            <button type="button" disabled={busy === it.id || reason.trim().length < 10} className="btn-3d px-4 h-10 text-xs font-black uppercase tracking-wider disabled:opacity-40"
              onClick={() => run(it.id, async () => { await api(`/${it.id}/recusar`, { method: "POST", body: JSON.stringify({ reason }) }); setRefusing(null); })}>Confirmar recusa</button>
          </div>
        )}
      </div>
    );
  }

  function Concluido({ it }: { it: Item }) {
    const semDoc = !it.docToken; const falha = it.docSendStatus === "falha";
    return (
      <div className="concave-3d p-3 space-y-2">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-semibold text-primary">{it.kindLabel} nº {it.id}</span>
          <span className="ml-auto text-[10px] font-black uppercase tracking-widest">{semDoc ? "Emitido, sem documento" : falha ? "Assinado, envio falhou" : it.liberadoAuto ? "Assinado automaticamente e enviado" : "Assinado e enviado"}</span>
        </div>
        {it.liberadoAuto && (
          <div className="bevel-3d p-2 space-y-1">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-primary">Liberado automaticamente: para a sua conferência</p>
            <p className={`text-xs ${it.auditoriaStatus === "atencao" || it.auditoriaStatus === "falha_liberacao" ? "pm-pendente font-semibold" : "text-muted-foreground"}`}>
              {it.auditoriaStatus === "sem_ressalvas" ? "Conferência da IA: sem ressalvas." :
               it.auditoriaStatus === "atencao" ? `Conferência da IA: atenção. ${it.auditoriaNota ?? ""}` :
               it.auditoriaStatus === "sem_ia" ? "A IA não conseguiu conferir. Confira a lista manualmente." : "Conferência da IA em andamento."}
            </p>
          </div>
        )}
        {falha && it.docSendError && <p className="text-xs text-muted-foreground">Motivo: {it.docSendError}</p>}
        <div className="flex gap-2">
          {it.docToken && <button type="button" title="Baixar documento assinado" aria-label="Baixar documento assinado" onClick={() => baixar(it.docToken!)} className="btn-3d-soft h-10 w-10 inline-flex items-center justify-center"><Download className="w-4 h-4" /></button>}
          {falha && <button type="button" disabled={busy === it.id} onClick={() => run(it.id, async () => {
            const r = await api<{ envio: { status: string; error: string | null } }>(`/${it.id}/reenviar`, { method: "POST", body: "{}" });
            if (r.envio.status !== "enviado") throw new Error(r.envio.error ?? "O envio falhou de novo.");
          }, "Reenviado ao cliente.")} className="btn-3d px-4 h-10 text-xs font-black uppercase tracking-wider inline-flex items-center gap-2"><Send className="w-4 h-4" /> Reenviar</button>}
          {semDoc && it.kind === "pedido_exames" && <button type="button" disabled={busy === it.id} onClick={() => run(it.id, () => api(`/${it.id}/reabrir`, { method: "POST", body: "{}" }), "Pedido reaberto.")} className="btn-3d px-4 h-10 text-xs font-black uppercase tracking-wider inline-flex items-center gap-2"><RotateCcw className="w-4 h-4" /> Reabrir</button>}
        </div>
      </div>
    );
  }

  function Esteira({ id, titulo, lista }: { id: "member" | "padrao"; titulo: string; lista: Item[] }) {
    const abertaAgora = aberta[id];
    const pend = lista.filter((i) => i.status !== "emitido");
    const alternar = () => { setAberta((a) => ({ ...a, [id]: !a[id] })); if (!aberta[id]) setPrimeira(id); };
    return (
      <div className={`pm-esteira panel-3d p-3 ${abertaAgora ? "flex-1 min-w-0" : "md:w-24 md:shrink-0"} ${primeira === id ? "order-first" : "order-last"}`} data-aberta={abertaAgora ? "sim" : "nao"}>
        {abertaAgora ? (
          <div className="space-y-3">
            <BarraGrupo titulo={titulo} aberto onAlternar={alternar} testIdControle={`esteira-${id}`} />
            <p className="text-xs text-muted-foreground px-1">{pend.length === 0 ? "Nada pendente nesta esteira." : `${pend.length} aguardando a sua avaliação.`}</p>
            <div className="space-y-3 max-h-[68vh] overflow-y-auto pr-1">
              {lista.length === 0 && <p className="text-sm text-muted-foreground">Nenhum pedido nesta esteira.</p>}
              {cards(lista).map((g) => (
                <article key={g.k} className="panel-3d-sub p-3 space-y-3" data-testid="card-pedido">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="bevel-3d inline-flex h-8 min-w-0 flex-1 items-center px-3 text-[11px] font-black uppercase tracking-[0.14em] text-primary"><span className="truncate" title={g.itens[0].clientName}>{g.itens[0].clientName}</span></span>
                    <span className="concave-3d inline-flex h-8 items-center px-3 text-xs font-black tabular-nums text-primary" title="Dia em que o cliente fez os pedidos">{dia(g.itens[0])}</span>
                  </div>
                  <p className="px-1 text-xs text-muted-foreground">{g.itens.length === 1 ? "1 solicitação neste dia." : `${g.itens.length} solicitações neste dia.`} Cada pedido mostra a hora à esquerda.</p>
                  {g.itens.map((it) => Linha(it, it.status === "emitido" ? Concluido({ it }) : Pedido({ it })))}
                </article>
              ))}
            </div>
          </div>
        ) : (
          <button type="button" onClick={alternar} aria-expanded={false} aria-label={`Abrir ${titulo}`}
            className="bevel-3d w-full flex md:flex-col items-center justify-between gap-3 px-3 py-3 md:py-5 text-primary md:min-h-[14rem]">
            <span className="text-[11px] font-black uppercase tracking-[0.18em] md:pm-esteira-fechada">{titulo}{pend.length > 0 ? ` (${pend.length} pendente${pend.length > 1 ? "s" : ""})` : ""}</span>
            <span aria-hidden className="text-lg font-black">+</span>
          </button>
        )}
      </div>
    );
  }

  const member = (items ?? []).filter((i) => i.isento);
  const padrao = (items ?? []).filter((i) => !i.isento);
  return (
    <section className="space-y-4" aria-label="Linha de produção dos pedidos">
      <div className="panel-3d p-4 space-y-3">
        <PlacaTitulo titulo="Validação médica" />
        <div className="concave-3d flex items-center gap-3 px-3 py-2.5">
          <ChaveOuro id="validacao-medica" checked={validacao === true} disabled={validacao === null} onCheckedChange={() => void trocarValidacao()} aria-label="Exigir validação médica antes de liberar" />
          <label htmlFor="validacao-medica" className="text-sm font-semibold text-primary">Exigir a minha validação antes de liberar o documento</label>
        </div>
        <p className="text-xs text-muted-foreground">
          {validacao === false
            ? "Desligada: o pedido de exames pago é assinado com o seu certificado 5 minutos depois e enviado ao cliente. Ele aparece aqui como concluído, para você conferir, e uma IA aponta ressalvas."
            : "Ligada: todo pedido espera a sua avaliação e a sua assinatura, inclusive o de Pax Member."}
        </p>
      </div>
      {error && <p role="alert" className="text-destructive text-sm">{error}</p>}
      {info && <p role="status" className="text-sm text-primary">{info}</p>}
      <div className="panel-3d p-4 space-y-3">
        <PlacaTitulo titulo="Linha de produção" />
        <div className="grid gap-2 sm:grid-cols-3">
          <div className="concave-3d px-3 py-2"><p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">1. Aguardando você</p><p className="text-2xl font-black text-primary">{pendentes.length}</p></div>
          <div className="concave-3d px-3 py-2"><p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">2. Assinado e enviado</p><p className="text-2xl font-black text-primary">{emitidos.filter((i) => i.docSendStatus === "enviado").length}</p></div>
          <div className="concave-3d px-3 py-2"><p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">3. Precisa de atenção</p><p className="text-2xl font-black text-primary">{atencao}</p></div>
        </div>
        <p className="text-xs text-muted-foreground">Clique em uma esteira para abrir ou recolher. Cada card reúne tudo o que o mesmo cliente pediu no mesmo dia. Os cards mais novos ficam em cima e os antigos descem, sem sumir.</p>
        {items === null && !error && <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />}
        {items && (
          <div className="flex flex-col md:flex-row gap-4 items-stretch">
            {Esteira({ id: "member", titulo: "Pax Member: preferência na avaliação", lista: member })}
            {Esteira({ id: "padrao", titulo: "Não Member: sem preferência", lista: padrao })}
          </div>
        )}
      </div>
    </section>
  );
}
