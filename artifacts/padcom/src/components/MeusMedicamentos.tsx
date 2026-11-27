import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Pill, Plus, ShieldCheck, Trash2 } from "lucide-react";

// MEUS MEDICAMENTOS & ROTINA (PaxCare, /area). Tudo vem de rotas token-bound
// (/area-paciente/medicacoes*); o paciente nunca informa o próprio id.
// Lei do lugar fixo: o formulário fica sempre no mesmo lugar, botões não mudam de texto nem de posição,
// e excluir é em dois passos com slot reservado ao lado (sem janela modal).
const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type Periodo = "jejum" | "manha" | "meio_manha" | "almoco" | "tarde" | "meio_tarde" | "noite" | "final_noite" | "ceia";
type Refeicao = "antes" | "com" | "apos" | "indiferente";
type Estado = "nao_validada" | "validada" | "recusada" | "encerrada";

// Espelho do motor de lembretes (MAPA_PERIODO): mesma ordem, mesma sigla, mesmo horário de início.
const REGUA: { k: Periodo; sigla: string; nome: string; hora: string }[] = [
  { k: "jejum", sigla: "JE", nome: "Jejum", hora: "05:00" },
  { k: "manha", sigla: "IM", nome: "Início da manhã", hora: "07:00" },
  { k: "meio_manha", sigla: "MM", nome: "Meio da manhã", hora: "09:00" },
  { k: "almoco", sigla: "AL", nome: "Almoço", hora: "11:00" },
  { k: "tarde", sigla: "IT", nome: "Início da tarde", hora: "13:30" },
  { k: "meio_tarde", sigla: "MT", nome: "Meio da tarde", hora: "16:00" },
  { k: "noite", sigla: "NO", nome: "Noite", hora: "18:00" },
  { k: "final_noite", sigla: "FN", nome: "Final da noite", hora: "20:00" },
  { k: "ceia", sigla: "CE", nome: "Ceia", hora: "22:30" },
];
const NOME_PERIODO = Object.fromEntries(REGUA.map((r) => [r.k, r.nome])) as Record<Periodo, string>;

const UNIDADES: { v: string; l: string }[] = [
  { v: "mg", l: "mg" }, { v: "mcg", l: "mcg" }, { v: "g", l: "g" }, { v: "mL", l: "mL" }, { v: "UI", l: "UI" },
  { v: "gotas", l: "gotas" }, { v: "comprimido", l: "comprimido(s)" }, { v: "capsula", l: "cápsula(s)" },
  { v: "sache", l: "sachê(s)" }, { v: "ampola", l: "ampola(s)" }, { v: "aplicacao", l: "aplicação(ões)" },
];
const REFEICOES: { v: Refeicao; l: string }[] = [
  { v: "antes", l: "Antes da refeição" }, { v: "com", l: "Junto com a refeição" },
  { v: "apos", l: "Após a refeição" }, { v: "indiferente", l: "Tanto faz" },
];
const ROTULO_UNIDADE = Object.fromEntries(UNIDADES.map((u) => [u.v, u.l])) as Record<string, string>;
const ROTULO_REFEICAO = Object.fromEntries(REFEICOES.map((r) => [r.v, r.l])) as Record<string, string>;

type Prescrita = { nome: string; dose: string | null; observacao: string | null; periodos: string[] };
type Propria = {
  id: number; nome: string; estado: Estado; pausada: boolean; doseValor: number | null; doseUnidade: string | null;
  refeicao: Refeicao | null; observacao: string | null; periodos: Periodo[]; motivoRecusa: string | null;
};
type Clinica = { empresaId: number; nome: string; cidade: string | null; estado: string | null; consentido: boolean };
type Dados = { prescritas: Prescrita[]; proprias: Propria[]; clinicas: Clinica[]; consentimento: { versao: string; texto: string; hash: string } };

const ESTADO_TEXTO: Record<Estado, string> = {
  nao_validada: "Aguardando conferência da clínica",
  validada: "Conferido pela clínica",
  recusada: "Recusado pela clínica",
  encerrada: "Encerrado",
};

function fmtDose(v: number | null, u: string | null) {
  return v != null && u ? `${String(v).replace(".", ",")} ${ROTULO_UNIDADE[u] ?? u}` : "dose não informada";
}

function ReguaHorarios({ valor, onChange, disabled }: { valor: Periodo[]; onChange?: (p: Periodo[]) => void; disabled?: boolean }) {
  return (
    <div className="grid grid-cols-9 gap-1" role="group" aria-label="Horários-chave do dia">
      {REGUA.map((r) => {
        const on = valor.includes(r.k);
        const cls = on ? "concave-3d text-accent" : "btn-3d-soft text-primary";
        const corpo = (
          <>
            <span className="block text-[11px] font-black leading-none">{r.sigla}</span>
            <span className="block text-[8px] leading-none mt-1 tracking-tight">{r.hora}</span>
          </>
        );
        if (!onChange) {
          return <div key={r.k} title={`${r.nome} · ${r.hora}`} className={`rounded-md min-h-[40px] flex flex-col items-center justify-center ${cls}`} aria-label={`${r.nome} ${r.hora}: ${on ? "marcado" : "não marcado"}`}>{corpo}</div>;
        }
        return (
          <button type="button" key={r.k} disabled={disabled} aria-pressed={on} title={`${r.nome} · ${r.hora}`}
            aria-label={`${r.nome} ${r.hora}`} onClick={() => onChange(on ? valor.filter((x) => x !== r.k) : [...valor, r.k])}
            className={`rounded-md min-h-[52px] flex flex-col items-center justify-center ${cls}`}>
            {corpo}
          </button>
        );
      })}
    </div>
  );
}

const VAZIO = { nome: "", doseValor: "", doseUnidade: "mg", refeicao: "" as Refeicao | "", observacao: "", periodos: [] as Periodo[] };

export default function MeusMedicamentos({ token, somenteLeitura = false }: { token: string; somenteLeitura?: boolean }) {
  const auth = { Authorization: `Bearer ${token}` };
  const [dados, setDados] = useState<Dados | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [form, setForm] = useState(VAZIO);
  const [editando, setEditando] = useState<number | null>(null);
  const [armado, setArmado] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const formRef = useRef<HTMLElement | null>(null);

  const carregar = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/api/area-paciente/medicacoes`, { headers: auth });
      if (!r.ok) throw new Error(r.status === 401 ? "Sessão expirada. Entre novamente." : "Não foi possível carregar seus medicamentos.");
      setDados(await r.json());
    } catch (e) { setMsg({ tipo: "erro", texto: (e as Error).message }); } finally { setCarregando(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);
  useEffect(() => { void carregar(); }, [carregar]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  async function chamar(metodo: string, caminho: string, corpo?: unknown): Promise<Response> {
    return fetch(`${API_BASE}/api/area-paciente/medicacoes${caminho}`, {
      method: metodo, headers: corpo === undefined ? auth : { ...auth, "Content-Type": "application/json" },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
  }
  async function erroDe(r: Response, padrao: string) {
    try { return ((await r.json()) as { error?: string }).error ?? padrao; } catch { return padrao; }
  }

  const doseNum = Number(form.doseValor.replace(",", "."));
  const formOk = form.nome.trim().length > 0 && Number.isFinite(doseNum) && doseNum > 0 && form.periodos.length > 0;

  async function salvar() {
    if (ocupado || !formOk) return;
    setOcupado(true); setMsg(null);
    const corpo = {
      nome: form.nome.trim(), doseValor: doseNum, doseUnidade: form.doseUnidade,
      refeicao: form.refeicao || null, observacao: form.observacao.trim() || null, periodos: form.periodos,
    };
    try {
      const r = editando ? await chamar("PATCH", `/${editando}`, corpo) : await chamar("POST", "", corpo);
      if (!r.ok) { setMsg({ tipo: "erro", texto: await erroDe(r, "Não foi possível salvar.") }); return; }
      setMsg({ tipo: "ok", texto: editando ? "Alterações salvas. A clínica vai conferir de novo." : "Medicamento salvo. Ele aguarda a conferência da clínica." });
      setForm(VAZIO); setEditando(null); await carregar();
    } catch { setMsg({ tipo: "erro", texto: "Sem conexão. Tente novamente." }); } finally { setOcupado(false); }
  }

  function editar(m: Propria) {
    setEditando(m.id);
    setForm({ nome: m.nome, doseValor: m.doseValor != null ? String(m.doseValor).replace(".", ",") : "", doseUnidade: m.doseUnidade ?? "mg", refeicao: m.refeicao ?? "", observacao: m.observacao ?? "", periodos: m.periodos });
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }
  function cancelarEdicao() { setEditando(null); setForm(VAZIO); }

  async function pausar(m: Propria) {
    if (ocupado) return;
    setOcupado(true); setMsg(null);
    try {
      const r = await chamar("PATCH", `/${m.id}`, { pausada: !m.pausada });
      if (!r.ok) setMsg({ tipo: "erro", texto: await erroDe(r, "Não foi possível alterar.") }); else await carregar();
    } finally { setOcupado(false); }
  }

  function armarExcluir(id: number) {
    setArmado(id);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setArmado(null), 4000);
  }
  async function excluir(id: number) {
    if (ocupado) return;
    setOcupado(true); setArmado(null); setMsg(null);
    try {
      const r = await chamar("DELETE", `/${id}`);
      if (!r.ok) setMsg({ tipo: "erro", texto: await erroDe(r, "Não foi possível excluir.") });
      else { if (editando === id) cancelarEdicao(); setMsg({ tipo: "ok", texto: "Medicamento excluído da sua lista." }); await carregar(); }
    } finally { setOcupado(false); }
  }

  async function autorizar(c: Clinica) {
    if (ocupado || !dados) return;
    setOcupado(true); setMsg(null);
    try {
      const r = await chamar("POST", "/consentimentos", { empresaId: c.empresaId, hash: dados.consentimento.hash });
      if (!r.ok) setMsg({ tipo: "erro", texto: await erroDe(r, "Não foi possível autorizar.") });
      else { setMsg({ tipo: "ok", texto: `Autorização registrada para ${c.nome}.` }); await carregar(); }
    } finally { setOcupado(false); }
  }
  async function revogar(c: Clinica) {
    if (ocupado) return;
    setOcupado(true); setMsg(null);
    try {
      const r = await chamar("DELETE", `/consentimentos/${c.empresaId}`);
      if (!r.ok) setMsg({ tipo: "erro", texto: await erroDe(r, "Não foi possível revogar.") });
      else { setMsg({ tipo: "ok", texto: `Autorização retirada de ${c.nome}.` }); await carregar(); }
    } finally { setOcupado(false); }
  }

  if (carregando) return <div className="concave-3d rounded-lg p-4 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" />Carregando…</div>;
  if (!dados) return msg ? <div role="alert" className="concave-3d rounded-lg px-4 py-3 text-sm text-red-600">{msg.texto}</div> : null;

  return (
    <div className="space-y-4" data-testid="meus-medicamentos">
      <header className="panel-3d rounded-xl overflow-hidden">
        <div className="login-card-topbar px-5 py-4">
          <p className="text-accent text-[9px] font-black uppercase tracking-widest">PaxCare</p>
          <h2 className="text-primary font-black text-2xl mt-0.5 tracking-wide" style={{ fontFamily: "'EB Garamond', serif" }}>Meus medicamentos &amp; rotina</h2>
          <p className="text-muted-foreground text-xs leading-snug mt-1">
            Veja o que a clínica prescreveu e cadastre o que você toma por conta de outros médicos ou suplementos.
            O lembrete só vale para o que você cadastrou depois que um profissional da clínica conferir.
          </p>
        </div>
      </header>

      <div role="status" aria-live="polite" className="min-h-[44px]">
        {msg && <div className={`concave-3d rounded-lg px-4 py-3 text-sm ${msg.tipo === "erro" ? "text-red-600" : "text-primary"}`}>{msg.texto}</div>}
      </div>

      <section className="panel-3d rounded-xl p-4 space-y-3" aria-label="Prescritos pela clínica">
        <h3 className="text-primary font-black text-xs uppercase tracking-widest flex items-center gap-2"><Pill className="w-4 h-4" />Prescritos pela clínica</h3>
        {dados.prescritas.length === 0 && <p className="text-xs text-muted-foreground">Nenhuma prescrição da clínica com horários definidos ainda.</p>}
        {dados.prescritas.map((p) => (
          <div key={p.nome} className="concave-3d rounded-lg p-3 space-y-1">
            <p className="text-primary font-black text-sm break-words">{p.nome}</p>
            <p className="text-xs text-muted-foreground">{p.dose ?? "dose conforme a receita"}{p.observacao ? ` · ${p.observacao}` : ""}</p>
            {p.periodos.length > 0 && <p className="text-[10px] uppercase tracking-widest text-accent">{p.periodos.join(" · ")}</p>}
          </div>
        ))}
      </section>

      <section className="panel-3d rounded-xl p-4 space-y-3" aria-label="Cadastrados por mim">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-primary font-black text-xs uppercase tracking-widest flex items-center gap-2"><Pill className="w-4 h-4" />Cadastrados por mim</h3>
          <button type="button" disabled={somenteLeitura} onClick={() => { formRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }); document.getElementById("mm-nome")?.focus(); }}
            className="btn-3d px-3 min-h-[44px] text-[10px] font-black uppercase tracking-widest flex items-center gap-1 disabled:opacity-40">
            <Plus className="w-3 h-3" />Adicionar medicamento / fórmula
          </button>
        </div>
        <p className="text-[11px] text-muted-foreground">Outros médicos e suplementos.</p>
        {dados.proprias.length === 0 && <p className="text-xs text-muted-foreground">Você ainda não cadastrou nenhum medicamento.</p>}
        {dados.proprias.map((m) => (
          <div key={m.id} className="concave-3d rounded-lg p-3 space-y-2">
            <div>
              <p className="text-primary font-black text-sm break-words">{m.nome}</p>
              <p className="text-xs text-muted-foreground">
                {fmtDose(m.doseValor, m.doseUnidade)}{m.refeicao ? ` · ${ROTULO_REFEICAO[m.refeicao]}` : ""}
              </p>
              <p className="text-[10px] uppercase tracking-widest text-accent mt-1">
                {ESTADO_TEXTO[m.estado]}{m.pausada ? " · Pausado" : ""}
              </p>
              {m.motivoRecusa && <p className="text-xs text-red-600 mt-1 break-words">Motivo: {m.motivoRecusa}</p>}
              {m.observacao && <p className="text-xs mt-1 break-words">{m.observacao}</p>}
            </div>
            <ReguaHorarios valor={m.periodos} />
            <p className="text-[10px] text-muted-foreground">{m.periodos.map((p) => NOME_PERIODO[p]).join(" · ")}</p>
            {!somenteLeitura && (
              <div className="flex items-center gap-2 flex-wrap">
                <button type="button" disabled={ocupado} onClick={() => editar(m)} className="btn-3d-soft px-3 min-h-[44px] text-[10px] font-black uppercase tracking-widest">Editar</button>
                <button type="button" disabled={ocupado} aria-pressed={m.pausada} onClick={() => void pausar(m)}
                  className={`px-3 min-h-[44px] text-[10px] font-black uppercase tracking-widest rounded-md ${m.pausada ? "concave-3d text-accent" : "btn-3d-soft"}`}>Pausado</button>
                <button type="button" disabled={ocupado} onClick={() => armarExcluir(m.id)} aria-label={`Excluir ${m.nome}`}
                  className="btn-3d-soft px-3 min-h-[44px] text-[10px] font-black uppercase tracking-widest flex items-center gap-1"><Trash2 className="w-3 h-3" />Excluir</button>
                <button type="button" tabIndex={armado === m.id ? 0 : -1} disabled={ocupado || armado !== m.id} onClick={() => void excluir(m.id)}
                  className={`btn-3d px-3 min-h-[44px] text-[10px] font-black uppercase tracking-widest ${armado === m.id ? "" : "invisible"}`}>Confirmar</button>
              </div>
            )}
          </div>
        ))}
      </section>

      {!somenteLeitura && (
        <section ref={formRef} className="panel-3d rounded-xl p-4 space-y-3" aria-label="Medicamento ou fórmula">
          <h3 className="text-primary font-black text-xs uppercase tracking-widest">Medicamento ou fórmula</h3>
          <p className="text-[11px] text-accent min-h-[16px]" aria-live="polite">{editando ? "Editando. Ao salvar, a clínica precisa conferir de novo." : "\u00A0"}</p>
          <label className="block text-[10px] font-black uppercase tracking-widest text-primary" htmlFor="mm-nome">Nome</label>
          <input id="mm-nome" value={form.nome} maxLength={200} onChange={(e) => setForm({ ...form, nome: e.target.value })}
            placeholder="Ex.: Vitamina D" className="field-engraved w-full min-h-[44px] rounded-md border bg-background px-3 text-sm" />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-primary" htmlFor="mm-dose">Dose</label>
              <input id="mm-dose" inputMode="decimal" value={form.doseValor} onChange={(e) => setForm({ ...form, doseValor: e.target.value.replace(/[^0-9,.]/g, "") })}
                placeholder="Ex.: 2000" className="field-engraved w-full min-h-[44px] rounded-md border bg-background px-3 text-sm" />
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-primary" htmlFor="mm-un">Unidade</label>
              <select id="mm-un" value={form.doseUnidade} onChange={(e) => setForm({ ...form, doseUnidade: e.target.value })} className="w-full min-h-[44px] rounded-md border bg-background px-2 text-sm">
                {UNIDADES.map((u) => <option key={u.v} value={u.v}>{u.l}</option>)}
              </select>
            </div>
          </div>
          <label className="block text-[10px] font-black uppercase tracking-widest text-primary" htmlFor="mm-ref">Refeição</label>
          <select id="mm-ref" value={form.refeicao} onChange={(e) => setForm({ ...form, refeicao: e.target.value as Refeicao | "" })} className="w-full min-h-[44px] rounded-md border bg-background px-2 text-sm">
            <option value="">Sem orientação</option>
            {REFEICOES.map((r) => <option key={r.v} value={r.v}>{r.l}</option>)}
          </select>
          <label className="block text-[10px] font-black uppercase tracking-widest text-primary" htmlFor="mm-obs">Observação (opcional)</label>
          <textarea id="mm-obs" value={form.observacao} maxLength={300} rows={2} onChange={(e) => setForm({ ...form, observacao: e.target.value })}
            className="field-engraved w-full rounded-md border bg-background px-3 py-2 text-sm" />
          <p className="block text-[10px] font-black uppercase tracking-widest text-primary">Horários-chave do dia</p>
          <ReguaHorarios valor={form.periodos} onChange={(p) => setForm({ ...form, periodos: p })} disabled={ocupado} />
          <p className="text-[10px] text-muted-foreground min-h-[14px]">{form.periodos.length ? REGUA.filter((r) => form.periodos.includes(r.k)).map((r) => `${r.nome} ${r.hora}`).join(" · ") : "Toque nos horários em que você toma."}</p>
          <div className="flex gap-2">
            <button type="button" disabled={ocupado || !formOk} onClick={() => void salvar()}
              className="btn-3d flex-1 min-h-[44px] text-xs font-black uppercase tracking-widest disabled:opacity-40">{ocupado ? "Salvando…" : "Salvar"}</button>
            <button type="button" disabled={ocupado || (!editando && form === VAZIO)} onClick={cancelarEdicao}
              className="btn-3d-soft px-4 min-h-[44px] text-xs font-black uppercase tracking-widest disabled:opacity-40">Limpar</button>
          </div>
        </section>
      )}

      <section className="panel-3d rounded-xl p-4 space-y-3" aria-label="Compartilhar com a clínica">
        <h3 className="text-primary font-black text-xs uppercase tracking-widest flex items-center gap-2"><ShieldCheck className="w-4 h-4" />Compartilhar com a clínica</h3>
        <p className="text-xs text-muted-foreground leading-snug">{dados.consentimento.texto}</p>
        {dados.clinicas.length === 0 && <p className="text-xs text-muted-foreground">Vincule uma clínica na seção Meu cofre de saúde (logo abaixo) para poder autorizar.</p>}
        {dados.clinicas.map((c) => (
          <div key={c.empresaId} className="concave-3d rounded-lg p-3 space-y-2">
            <p className="text-primary font-black text-sm">{c.nome}{c.cidade ? <span className="text-muted-foreground font-normal text-xs"> · {c.cidade}{c.estado ? `/${c.estado}` : ""}</span> : null}</p>
            <p className={`text-[10px] font-black uppercase tracking-widest ${c.consentido ? "text-accent" : "text-muted-foreground"}`}>{c.consentido ? "Autorizada" : "Não autorizada"}</p>
            {!somenteLeitura && (
              <div className="flex gap-2">
                <button type="button" disabled={ocupado || c.consentido} onClick={() => void autorizar(c)} className="btn-3d flex-1 min-h-[44px] text-[10px] font-black uppercase tracking-widest disabled:opacity-40">Autorizar</button>
                <button type="button" disabled={ocupado || !c.consentido} onClick={() => void revogar(c)} className="btn-3d-soft flex-1 min-h-[44px] text-[10px] font-black uppercase tracking-widest disabled:opacity-40">Revogar</button>
              </div>
            )}
          </div>
        ))}
      </section>
    </div>
  );
}
