import { useCallback, useEffect, useMemo, useState } from "react";
import { collabAuthHeaders } from "@/lib/collab-auth";

// Central de acompanhamento (acolhimento) de médicos e clientes. Leitura; só o titular da plataforma.
// Etapa "comprovada" = há registro com data e fonte. "Sem registro" NÃO significa que não aconteceu.
// Os textos abaixo são para ação MANUAL: esta tela nunca envia mensagem nem grava "enviado".
const API = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;
type Etapa = { codigo: string; rotulo: string; estado: "comprovado" | "pendente" | "sem_registro" | "nao_aplicavel"; em: string | null; fonte: string; nota?: string };
type Item = { chave: string; tipo: "medico" | "cliente"; origem: string; nome: string; contato: string | null; consentimentoContato: string; etapas: Etapa[]; pendencias: string[] };
type Modelo = { codigo: string; publico: string; titulo: string; texto: string };
const ESTADO: Record<string, string> = { comprovado: "Comprovado", pendente: "Pendente", sem_registro: "Sem registro", nao_aplicavel: "Não se aplica" };
const ORIGEM: Record<string, string> = { pedido_comercial: "Pedido comercial PAXMED", convite_clinico: "Convite clínico do paciente", cliente: "Cliente" };
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }) : "sem data");

export default function AcolhimentoPage() {
  const [dados, setDados] = useState<{ total: number; resumo: Record<string, number>; pendencias: Record<string, string>; itens: Item[] } | null>(null);
  const [tipo, setTipo] = useState(""); const [origem, setOrigem] = useState(""); const [pendencia, setPendencia] = useState(""); const [q, setQ] = useState("");
  const [erro, setErro] = useState("");
  const [aberto, setAberto] = useState<string | null>(null);
  const [historico, setHistorico] = useState<{ eventos: { em: string | null; evento: string; fonte: string }[]; nota: string } | null>(null);
  const [modelos, setModelos] = useState<{ modelos: Modelo[]; assinatura: string | null; aviso: string } | null>(null);
  const [modeloCod, setModeloCod] = useState(""); const [texto, setTexto] = useState(""); const [copiado, setCopiado] = useState(false);

  const carregar = useCallback(async () => {
    const p = new URLSearchParams(); if (tipo) p.set("tipo", tipo); if (origem) p.set("origem", origem); if (pendencia) p.set("pendencia", pendencia); if (q.trim()) p.set("q", q.trim());
    try {
      const r = await fetch(`${API}/ceo/acolhimento?${p}`, { headers: collabAuthHeaders() });
      if (r.status === 403) throw new Error("Somente o titular da plataforma vê este acompanhamento.");
      if (!r.ok) throw new Error(r.status === 401 ? "Entre como colaborador." : "Não foi possível carregar o acompanhamento.");
      setDados(await r.json()); setErro("");
    } catch (e) { setDados(null); setErro((e as Error).message); }
  }, [tipo, origem, pendencia, q]);
  useEffect(() => { const t = setTimeout(() => void carregar(), 250); return () => clearTimeout(t); }, [carregar]);
  useEffect(() => { void (async () => { try { const r = await fetch(`${API}/ceo/acolhimento/modelos`, { headers: collabAuthHeaders() }); if (r.ok) setModelos(await r.json()); } catch { /* modelos são opcionais */ } })(); }, []);

  const item = useMemo(() => dados?.itens.find((i) => i.chave === aberto) ?? null, [dados, aberto]);
  async function abrir(i: Item) {
    if (aberto === i.chave) { setAberto(null); return; }
    setAberto(i.chave); setHistorico(null); setModeloCod(""); setTexto(""); setCopiado(false);
    try {
      const r = await fetch(`${API}/ceo/acolhimento/historico?chave=${encodeURIComponent(i.chave)}`, { headers: collabAuthHeaders() });
      if (r.ok) setHistorico(await r.json());
    } catch { /* histórico indisponível não impede a leitura das etapas */ }
  }
  function escolher(cod: string, i: Item) {
    setModeloCod(cod); setCopiado(false);
    const m = modelos?.modelos.find((x) => x.codigo === cod);
    setTexto(m ? `${m.texto.replace("{{nome}}", i.nome.split(" ")[0])}${modelos?.assinatura ? `\n\n${modelos.assinatura}` : ""}` : "");
  }
  const copiar = async (t: string) => { try { await navigator.clipboard.writeText(t); setCopiado(true); } catch { setErro("Não foi possível copiar; selecione o texto e copie manualmente."); } };
  const modelosDoItem = (i: Item) => modelos?.modelos.filter((m) => m.publico === i.tipo) ?? [];

  return (
    <div className="space-y-4 max-w-5xl" data-testid="acolhimento">
      <header className="panel-3d rounded-xl overflow-hidden">
        <div className="login-card-topbar px-5 py-4">
          <p className="text-accent text-[9px] font-black uppercase tracking-widest">ACOLHIMENTO</p>
          <h1 className="text-primary font-black text-2xl mt-0.5" style={{ fontFamily: "'EB Garamond', serif" }}>Acompanhamento de médicos e clientes</h1>
          <p className="text-muted-foreground text-xs mt-1">Cada etapa mostra data e fonte quando há registro. “Sem registro” não prova que não aconteceu. Nada é enviado por esta tela.</p>
        </div>
      </header>

      <div className="panel-3d-sub rounded-xl p-3 grid grid-cols-1 sm:grid-cols-4 gap-2">
        <select aria-label="Quem" value={tipo} onChange={(e) => setTipo(e.target.value)} className="concave-3d rounded-lg px-3 min-h-[44px] text-sm" data-testid="filtro-tipo">
          <option value="">Médicos e clientes</option><option value="medico">Só médicos</option><option value="cliente">Só clientes</option></select>
        <select aria-label="Origem" value={origem} onChange={(e) => setOrigem(e.target.value)} className="concave-3d rounded-lg px-3 min-h-[44px] text-sm" data-testid="filtro-origem">
          <option value="">Todas as origens</option>{Object.entries(ORIGEM).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <select aria-label="Pendência" value={pendencia} onChange={(e) => setPendencia(e.target.value)} className="concave-3d rounded-lg px-3 min-h-[44px] text-sm" data-testid="filtro-pendencia">
          <option value="">Todas as pendências</option>{Object.entries(dados?.pendencias ?? {}).map(([k, v]) => <option key={k} value={k}>{v}{dados?.resumo[k] ? ` (${dados.resumo[k]})` : ""}</option>)}</select>
        <input aria-label="Buscar por nome ou e-mail" placeholder="Buscar nome ou e-mail" value={q} onChange={(e) => setQ(e.target.value)} className="concave-3d rounded-lg px-3 min-h-[44px] text-sm" data-testid="filtro-busca" />
      </div>

      <div role="status" aria-live="polite" className="min-h-[20px] text-xs text-red-600">{erro}</div>
      {!dados && !erro && <div className="concave-3d rounded-lg px-4 py-3 text-sm">Carregando…</div>}
      {dados && dados.itens.length === 0 && <div className="concave-3d rounded-lg px-4 py-3 text-sm">Nenhuma pessoa neste filtro.</div>}

      {dados?.itens.map((i) => (
        <section key={i.chave} className="panel-3d rounded-xl p-4 space-y-2" aria-label={i.nome} data-testid={`acolhimento-${i.chave}`}>
          <button type="button" onClick={() => void abrir(i)} aria-expanded={aberto === i.chave} className="w-full text-left min-h-[44px]">
            <p className="text-primary font-black text-base break-words">{i.nome}</p>
            <p className="text-xs text-muted-foreground break-words">{ORIGEM[i.origem]}{i.contato ? ` · ${i.contato}` : ""}</p>
          </button>
          <div className="flex flex-wrap gap-1.5 min-h-[24px]">
            {i.pendencias.length === 0 && <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Sem pendência</span>}
            {i.pendencias.map((p) => <span key={p} className="bevel-3d px-2 py-1 text-[10px] font-black uppercase tracking-wider">{dados.pendencias[p] ?? p}</span>)}
          </div>
          {aberto === i.chave && item && (
            <div className="space-y-3 pt-2">
              <ol className="space-y-1.5" data-testid="etapas">
                {item.etapas.map((e) => (
                  <li key={e.codigo} className="concave-3d rounded-lg px-3 py-2 text-xs" data-estado={e.estado}>
                    <span className="font-black">{e.rotulo}</span> · {ESTADO[e.estado]} · {e.em ? fmt(e.em) : "sem data"}
                    <span className="block text-muted-foreground break-words">Fonte: {e.fonte}{e.nota ? ` — ${e.nota}` : ""}</span>
                  </li>
                ))}
              </ol>
              <div data-testid="historico">
                <p className="text-[10px] font-black uppercase tracking-widest">Histórico</p>
                {!historico && <p className="text-xs text-muted-foreground">Carregando…</p>}
                {historico && historico.eventos.length === 0 && <p className="text-xs text-muted-foreground">Nenhum evento gravado.</p>}
                {historico?.eventos.map((v, n) => <p key={n} className="text-xs break-words">{fmt(v.em)} · {v.evento} <span className="text-muted-foreground">({v.fonte})</span></p>)}
                {historico?.nota && <p className="text-xs text-muted-foreground mt-1">{historico.nota}</p>}
              </div>
              <div className="panel-3d-sub rounded-lg p-3 space-y-2" data-testid="mensagem-manual">
                <p className="text-[10px] font-black uppercase tracking-widest">Mensagem para ação manual</p>
                <p className="text-xs text-muted-foreground">{i.consentimentoContato}</p>
                <select aria-label="Modelo de mensagem" value={modeloCod} onChange={(e) => escolher(e.target.value, i)} className="concave-3d rounded-lg px-3 min-h-[44px] text-sm w-full">
                  <option value="">Escolha um modelo</option>{modelosDoItem(i).map((m) => <option key={m.codigo} value={m.codigo}>{m.titulo}</option>)}</select>
                <textarea aria-label="Texto da mensagem (editável)" value={texto} onChange={(e) => { setTexto(e.target.value); setCopiado(false); }} rows={6} className="concave-3d rounded-lg px-3 py-2 text-sm w-full" />
                <div className="flex flex-wrap gap-2 items-center">
                  <button type="button" disabled={!texto.trim()} onClick={() => void copiar(texto)} className="btn-3d-soft min-h-[44px] px-4 text-[10px] font-black uppercase tracking-widest disabled:opacity-50">Copiar texto</button>
                  <button type="button" disabled={!texto.trim()} onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, "_blank", "noopener")} className="btn-3d-soft min-h-[44px] px-4 text-[10px] font-black uppercase tracking-widest disabled:opacity-50">Abrir WhatsApp (você escolhe o contato)</button>
                  <span role="status" aria-live="polite" className="text-xs min-w-[8rem]">{copiado ? "Texto copiado." : ""}</span>
                </div>
              </div>
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
