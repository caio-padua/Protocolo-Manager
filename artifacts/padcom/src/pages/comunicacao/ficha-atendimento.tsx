import { useCallback, useEffect, useState } from "react";
import { ClipboardList, ShieldAlert, RefreshCw } from "lucide-react";
import { BlockTitle, BASE } from "./_shared";
import { getCollabToken } from "@/lib/collab-auth";

// Ficha auditável do atendimento automático (WhatsApp e Telegram) + interruptores.
// Reaproveita a Central de Auditoria: sem tela duplicada. Contatos sempre mascarados pelo servidor.

type Ficha = {
  id: string; canal: string; contato_mascarado: string; texto_resumo: string; intencao_principal: string | null;
  fonte_chave: string | null; fonte_versao: string | null; ia_usada: boolean; estado_final: string; motivo: string | null;
  recebido_em: string | null; processado_em: string; resposta_id: string | null;
};
type Evento = { id: string; tipo: string; estado?: string | null; resultado?: string | null; motivo?: string | null; criado_em: string; responsavel?: number | null };
type Controle = { escopo: string; canal: string | null; cliente_id: number | null; ligado: boolean; modo: string; bloqueio_emergencial: boolean };

const ESTADOS = ["", "enviado", "entregue", "pendente", "incerto", "falhou", "bloqueado", "encaminhado", "ignorado"];
const POR_PAGINA = 20;
const cab = () => { const t = getCollabToken(); return { "Content-Type": "application/json", ...(t ? { Authorization: `Bearer ${t}` } : {}) }; };
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—");
const desde = (p: string): string | undefined => {
  const dias = p === "hoje" ? 1 : p === "7d" ? 7 : p === "30d" ? 30 : 0;
  return dias ? new Date(Date.now() - dias * 86_400_000).toISOString() : undefined;
};

export function FichaAtendimento({ periodo }: { periodo: string }) {
  const [canal, setCanal] = useState(""); const [estado, setEstado] = useState(""); const [intencao, setIntencao] = useState("");
  const [ia, setIa] = useState(""); const [contato, setContato] = useState(""); const [pagina, setPagina] = useState(1);
  const [itens, setItens] = useState<Ficha[]>([]); const [total, setTotal] = useState(0); const [erro, setErro] = useState<string | null>(null);
  const [aberta, setAberta] = useState<string | null>(null); const [linha, setLinha] = useState<Evento[]>([]);
  const [ctl, setCtl] = useState<Controle[]>([]); const [motivo, setMotivo] = useState(""); const [aviso, setAviso] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const q = new URLSearchParams({ pagina: String(pagina), porPagina: String(POR_PAGINA) });
    const de = desde(periodo);
    if (de) q.set("de", de);
    if (canal) q.set("canal", canal); if (estado) q.set("estado", estado); if (intencao.trim()) q.set("intencao", intencao.trim());
    if (ia) q.set("ia", ia); if (contato.trim()) q.set("contato", contato.trim());
    try {
      const r = await fetch(`${BASE}/api/atendimento/fichas?${q}`, { headers: cab() });
      if (!r.ok) throw new Error(String(r.status));
      const j = await r.json(); setItens(j.itens ?? []); setTotal(Number(j.total ?? 0)); setErro(null);
      const c = await fetch(`${BASE}/api/atendimento/controle`, { headers: cab() });
      if (c.ok) setCtl((await c.json()).estado ?? []);
    } catch { setErro("Não foi possível carregar as fichas. Nada foi alterado."); }
  }, [pagina, periodo, canal, estado, intencao, ia, contato]);
  useEffect(() => { void carregar(); }, [carregar]);
  useEffect(() => { setPagina(1); }, [periodo, canal, estado, intencao, ia, contato]);

  const abrir = async (id: string) => {
    if (aberta === id) { setAberta(null); return; }
    setAberta(id); setLinha([]);
    const r = await fetch(`${BASE}/api/atendimento/fichas/${id}`, { headers: cab() });
    if (r.ok) setLinha((await r.json()).linhaDoTempo ?? []);
  };
  const alterar = async (corpo: Record<string, unknown>) => {
    if (motivo.trim().length < 3) { setAviso("Escreva o motivo (mínimo de 3 letras) antes de alterar."); return; }
    const r = await fetch(`${BASE}/api/atendimento/controle`, { method: "PUT", headers: cab(), body: JSON.stringify({ ...corpo, motivo: motivo.trim() }) });
    setAviso(r.ok ? "Alteração gravada com responsável, data, valor antigo, valor novo e motivo." : `Não gravou (${(await r.json().catch(() => ({}))).error ?? r.status}).`);
    if (r.ok) { setMotivo(""); void carregar(); }
  };
  const est = (escopo: string, c: string | null) => ctl.find((x) => x.escopo === escopo && (x.canal ?? null) === c && x.cliente_id == null);
  const ligado = (escopo: string, c: string | null) => est(escopo, c)?.ligado !== false;
  const emergencia = est("clinica", null)?.bloqueio_emergencial === true;
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const sel = "bevel-3d px-2 py-1 text-[11px] bg-background";

  return (
    <section className="panel-3d p-4" data-testid="ficha-atendimento">
      <BlockTitle icon={ClipboardList}>Ficha do atendimento automático</BlockTitle>
      <div className="mb-3 flex flex-wrap items-end gap-2 text-[11px]">
        <select aria-label="Canal" className={sel} value={canal} onChange={(e) => setCanal(e.target.value)}>
          <option value="">Todos os canais</option><option value="whatsapp">WhatsApp</option><option value="telegram">Telegram</option></select>
        <select aria-label="Resultado" className={sel} value={estado} onChange={(e) => setEstado(e.target.value)}>
          {ESTADOS.map((s) => <option key={s} value={s}>{s || "Todos os resultados"}</option>)}</select>
        <input aria-label="Intenção" className={sel} placeholder="Intenção (ex.: endereco)" value={intencao} onChange={(e) => setIntencao(e.target.value)} />
        <select aria-label="Uso de IA" className={sel} value={ia} onChange={(e) => setIa(e.target.value)}>
          <option value="">IA: tudo</option><option value="true">Usou IA</option><option value="false">Sem IA</option></select>
        <input aria-label="Contato mascarado" className={sel} placeholder="Contato (ex.: ***0012)" value={contato} onChange={(e) => setContato(e.target.value)} />
        <button className="bevel-3d inline-flex items-center gap-1 px-2 py-1 font-bold uppercase" onClick={() => void carregar()}><RefreshCw className="h-3 w-3" />Atualizar</button>
      </div>
      {erro && <p role="alert" className="mb-2 text-xs text-rose-700">{erro}</p>}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[11px]">
          <thead><tr className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {["Quando", "Canal", "Contato", "Pergunta", "Intenção", "Fonte", "IA", "Resultado"].map((h) => <th key={h} className="px-2 py-1">{h}</th>)}</tr></thead>
          <tbody>
            {itens.length === 0 && <tr><td colSpan={8} className="px-2 py-3 text-muted-foreground">Nenhuma ficha neste filtro.</td></tr>}
            {itens.map((f) => (
              <>
                <tr key={f.id} className="cursor-pointer border-t border-border/50" onClick={() => void abrir(f.id)}>
                  <td className="px-2 py-1">{fmt(f.recebido_em ?? f.processado_em)}</td><td className="px-2 py-1">{f.canal}</td>
                  <td className="px-2 py-1 font-mono">{f.contato_mascarado}</td><td className="px-2 py-1">{f.texto_resumo}</td>
                  <td className="px-2 py-1">{f.intencao_principal ?? "—"}</td><td className="px-2 py-1">{f.fonte_chave ?? "—"}{f.fonte_versao ? ` · ${f.fonte_versao}` : ""}</td>
                  <td className="px-2 py-1">{f.ia_usada ? "sim" : "não"}</td><td className="px-2 py-1 font-semibold">{f.estado_final}{f.motivo ? ` (${f.motivo})` : ""}</td>
                </tr>
                {aberta === f.id && (
                  <tr key={`${f.id}-t`}><td colSpan={8} className="bg-muted/30 px-3 py-2">
                    <ol className="list-decimal pl-4">{linha.map((e) => (
                      <li key={e.id}>{fmt(e.criado_em)} — {e.tipo}{e.estado ? `: ${e.estado}` : ""}{e.resultado ? `: ${e.resultado}` : ""}{e.motivo ? ` — ${e.motivo}` : ""}</li>))}</ol>
                  </td></tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-2 flex items-center justify-between text-[11px]">
        <span>{total} ficha(s)</span>
        <span className="flex items-center gap-2">
          <button className="bevel-3d px-2 py-1" disabled={pagina <= 1} onClick={() => setPagina((p) => p - 1)}>Anterior</button>
          Página {pagina} de {paginas}
          <button className="bevel-3d px-2 py-1" disabled={pagina >= paginas} onClick={() => setPagina((p) => p + 1)}>Próxima</button>
        </span>
      </div>

      <div className="mt-4 border-t border-border/50 pt-3">
        <BlockTitle icon={ShieldAlert}>Interruptores do atendimento automático</BlockTitle>
        <p className="mb-2 text-[11px] text-muted-foreground">Ordem de prevalência: bloqueio de emergência, contato em modo humano, canal desligado, clínica desligada. A lista de homologação é a última trava.</p>
        <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px]">
          <input aria-label="Motivo da alteração" className={`${sel} w-72`} placeholder="Motivo da alteração (obrigatório)" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          <button className="bevel-3d px-2 py-1 font-bold uppercase" onClick={() => void alterar({ escopo: "clinica", ligado: !ligado("clinica", null) })}>Clínica: {ligado("clinica", null) ? "ligada (desligar)" : "desligada (religar)"}</button>
          {(["whatsapp", "telegram"] as const).map((c) => (
            <button key={c} className="bevel-3d px-2 py-1 font-bold uppercase" onClick={() => void alterar({ escopo: "canal", canal: c, ligado: !ligado("canal", c) })}>
              {c}: {ligado("canal", c) ? "ligado (desligar)" : "desligado (religar)"}</button>))}
          <button className="bevel-3d px-2 py-1 font-bold uppercase text-rose-700" onClick={() => void alterar({ escopo: "clinica", bloqueioEmergencial: !emergencia })}>
            Emergência: {emergencia ? "ATIVA (liberar)" : "inativa (bloquear tudo)"}</button>
        </div>
        {aviso && <p role="status" className="text-[11px]">{aviso}</p>}
      </div>
    </section>
  );
}
