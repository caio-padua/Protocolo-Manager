import { useEffect, useMemo, useRef, useState } from "react";
import {
  Share2, User, Stethoscope, FileText, Send, Eye, Download, ExternalLink,
  ClipboardList, AlertTriangle, Layers,
} from "lucide-react";
import { BASE, ConsoleShell, BlockTitle } from "../../comunicacao/_shared";
import { ClientPicker } from "@/components/ClientPicker";
import { VARIAVEIS_DOC, aplicarVariaveis, montarValores } from "@/lib/doc-variaveis";
import { useToast } from "@/hooks/use-toast";

interface ClienteOption {
  id: number;
  name: string;
  cpf?: string | null;
  phone?: string | null;
  email?: string | null;
}

interface ProfOption {
  id: number;
  name: string;
  crm?: string | null;
  unit?: string | null;
  category?: string | null;
}

interface ModeloDoc {
  id: number;
  tipo: string;
  nome: string;
  corpo: string;
}

interface Encaminhamento {
  id: number;
  clientName: string;
  especialidadeDestino: string;
  profissionalDestino: string | null;
  urgencia: string;
  motivo: string;
  status: string;
  driveWebViewLink: string | null;
  createdAt: string;
  emittedAt: string | null;
  pdfUrl: string;
}

const URGENCIAS: { value: string; label: string }[] = [
  { value: "eletivo", label: "Eletivo" },
  { value: "prioritario", label: "Prioritário" },
  { value: "urgente", label: "Urgente" },
];

// Cor de STATUS por urgência (ambar=prioritário, vermelho=urgente); nunca chrome.
function urgenciaChip(urgencia: string) {
  if (urgencia === "urgente") {
    return { label: "URGENTE", cls: "text-rose-700 dark:text-rose-400", led: "paxter-led-red" };
  }
  if (urgencia === "prioritario") {
    return { label: "PRIORITÁRIO", cls: "text-amber-700 dark:text-amber-400", led: "paxter-led-amber" };
  }
  return { label: "ELETIVO", cls: "text-muted-foreground", led: "paxter-led-green" };
}

function statusChip(status: string) {
  if (status === "emitted") {
    return { label: "EMITIDO", cls: "text-emerald-700 dark:text-emerald-400", led: "paxter-led-green" };
  }
  return { label: "RASCUNHO", cls: "text-amber-700 dark:text-amber-400", led: "paxter-led-amber" };
}

const inputCls =
  "field-engraved w-full rounded-md border px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-accent/40";

export default function EncaminhamentosPage() {
  const { toast } = useToast();

  const [clientes, setClientes] = useState<ClienteOption[]>([]);
  const [profissionais, setProfissionais] = useState<ProfOption[]>([]);
  const [modelos, setModelos] = useState<ModeloDoc[]>([]);
  const [lista, setLista] = useState<Encaminhamento[]>([]);

  const [clientId, setClientId] = useState<number | null>(null);
  const [profId, setProfId] = useState<number | null>(null);
  const [especialidade, setEspecialidade] = useState("");
  const [profDestino, setProfDestino] = useState("");
  const [urgencia, setUrgencia] = useState("eletivo");
  const [motivo, setMotivo] = useState("");
  const [resumo, setResumo] = useState("");
  const [modeloId, setModeloId] = useState<number | null>(null);
  const [corpo, setCorpo] = useState("");
  const [emitindo, setEmitindo] = useState(false);

  const corpoRef = useRef<HTMLTextAreaElement>(null);

  const cliente = useMemo(() => clientes.find((c) => c.id === clientId) ?? null, [clientes, clientId]);
  const profissional = useMemo(() => profissionais.find((p) => p.id === profId) ?? null, [profissionais, profId]);

  useEffect(() => {
    fetch(`${BASE}/api/clients`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setClientes(Array.isArray(d) ? d : []))
      .catch(() => setClientes([]));
    fetch(`${BASE}/api/professionals`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setProfissionais(Array.isArray(d) ? d : []))
      .catch(() => setProfissionais([]));
    fetch(`${BASE}/api/document-templates?tipo=encaminhamento`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setModelos(Array.isArray(d) ? d : []))
      .catch(() => setModelos([]));
  }, []);

  const carregarLista = () => {
    if (clientId == null) {
      setLista([]);
      return;
    }
    fetch(`${BASE}/api/encaminhamentos?clientId=${clientId}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setLista(Array.isArray(d) ? d : []))
      .catch(() => setLista([]));
  };

  useEffect(carregarLista, [clientId]);

  // Valores atuais para aplicar variáveis no corpo (Modelo -> corpo editável).
  const valores = () =>
    montarValores({
      cliente: { nome: cliente?.name, cpf: cliente?.cpf },
      profissional: { nome: profissional?.name, crm: profissional?.crm },
      extras: { especialidade, motivo, urgencia },
    });

  const aplicarModelo = (id: number | null) => {
    setModeloId(id);
    if (id == null) return;
    const m = modelos.find((x) => x.id === id);
    if (m) setCorpo(aplicarVariaveis(m.corpo, valores()));
  };

  const inserirVariavel = (chave: string) => {
    const ta = corpoRef.current;
    const token = `{{${chave}}}`;
    if (!ta) {
      setCorpo((c) => c + token);
      return;
    }
    const start = ta.selectionStart ?? corpo.length;
    const end = ta.selectionEnd ?? corpo.length;
    const novo = corpo.slice(0, start) + token + corpo.slice(end);
    setCorpo(novo);
    requestAnimationFrame(() => {
      ta.focus();
      const pos = start + token.length;
      ta.setSelectionRange(pos, pos);
    });
  };

  const previa = useMemo(() => aplicarVariaveis(corpo, valores()), [corpo, cliente, profissional, especialidade, motivo, urgencia]);

  const handleEmitir = async () => {
    if (clientId == null || !cliente) {
      toast({ title: "Escolha o cliente para emitir", variant: "destructive" });
      return;
    }
    if (!especialidade.trim()) {
      toast({ title: "Informe a especialidade de destino", variant: "destructive" });
      return;
    }
    if (!motivo.trim()) {
      toast({ title: "Informe o motivo do encaminhamento", variant: "destructive" });
      return;
    }
    setEmitindo(true);
    try {
      const corpoFinal = aplicarVariaveis(corpo, valores());
      const createRes = await fetch(`${BASE}/api/encaminhamentos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          clientName: cliente.name,
          clientCpf: cliente.cpf ?? null,
          clientPhone: cliente.phone ?? null,
          clientEmail: cliente.email ?? null,
          professionalId: profId ?? null,
          professionalName: profissional?.name ?? null,
          professionalCrm: profissional?.crm ?? null,
          professionalUf: "SP",
          especialidadeDestino: especialidade.trim(),
          profissionalDestino: profDestino.trim() || null,
          urgencia,
          motivo: motivo.trim(),
          resumoClinico: resumo.trim() || null,
          corpo: corpoFinal,
        }),
      });
      if (!createRes.ok) throw new Error("create");
      const created = await createRes.json();

      const emitRes = await fetch(`${BASE}/api/encaminhamentos/${created.id}/emitir`, { method: "POST" });
      if (!emitRes.ok) throw new Error("emit");
      const emitted = await emitRes.json();

      toast({ title: "Encaminhamento emitido!", description: emitted.driveWebViewLink ? "PDF gerado e enviado ao Drive." : "PDF gerado." });
      window.open(`${BASE}${emitted.pdfUrl}`, "_blank");
      carregarLista();
    } catch {
      toast({ title: "Erro ao emitir encaminhamento", variant: "destructive" });
    } finally {
      setEmitindo(false);
    }
  };

  return (
    <ConsoleShell icon={Share2} title="Encaminhamentos" subtitle="Encaminhamento clínico a especialista — PDF de marca e Drive">
      {/* BLOCO — DADOS */}
      <section className="panel-3d p-5">
        <BlockTitle icon={User}>Dados do Encaminhamento</BlockTitle>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Cliente</label>
            <ClientPicker clientes={clientes} value={clientId} onChange={setClientId} placeholder="Escolha um cliente..." />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Profissional (origem)</label>
            <select className={inputCls} value={profId ?? ""} onChange={(e) => setProfId(e.target.value ? Number(e.target.value) : null)}>
              <option value="">— selecione —</option>
              {profissionais.map((p) => (
                <option key={p.id} value={p.id}>{p.name}{p.crm ? ` (CRM ${p.crm})` : ""}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Especialidade de destino</label>
            <input className={inputCls} placeholder="ex.: Cardiologia" value={especialidade} onChange={(e) => setEspecialidade(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Profissional de destino (opcional)</label>
            <input className={inputCls} placeholder="ex.: Dr. Fulano" value={profDestino} onChange={(e) => setProfDestino(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Urgência</label>
            <select className={inputCls} value={urgencia} onChange={(e) => setUrgencia(e.target.value)}>
              {URGENCIAS.map((u) => (
                <option key={u.value} value={u.value}>{u.label}</option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <div className="concave-3d flex w-full items-center gap-2 px-3 py-2">
              <span className={`paxter-led paxter-led-breathe ${urgenciaChip(urgencia).led}`} />
              <span className={`text-[11px] font-bold uppercase tracking-wide ${urgenciaChip(urgencia).cls}`}>
                {urgenciaChip(urgencia).label}
              </span>
            </div>
          </div>
        </div>

        <div className="mt-3 space-y-3">
          <div>
            <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Motivo</label>
            <textarea className={`${inputCls} min-h-[64px]`} placeholder="Motivo / justificativa do encaminhamento" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Resumo clínico (opcional)</label>
            <textarea className={`${inputCls} min-h-[64px]`} placeholder="Resumo do quadro clínico" value={resumo} onChange={(e) => setResumo(e.target.value)} />
          </div>
        </div>
      </section>

      {/* BLOCO — MODELO E CORPO */}
      <section className="panel-3d p-5">
        <BlockTitle icon={FileText}>Modelo e Corpo do Documento</BlockTitle>
        <div className="mb-3">
          <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Modelo de documento</label>
          <select className={inputCls} value={modeloId ?? ""} onChange={(e) => aplicarModelo(e.target.value ? Number(e.target.value) : null)}>
            <option value="">— sem modelo —</option>
            {modelos.map((m) => (
              <option key={m.id} value={m.id}>{m.nome}</option>
            ))}
          </select>
        </div>

        <div className="mb-2 flex flex-wrap gap-1.5">
          {VARIAVEIS_DOC.map((v) => (
            <button
              key={v.chave}
              type="button"
              onClick={() => inserirVariavel(v.chave)}
              className="btn-3d-soft rounded-md px-2 py-1 text-[11px] font-semibold"
              title={v.rotulo}
            >
              {`{{${v.chave}}}`}
            </button>
          ))}
        </div>

        <textarea
          ref={corpoRef}
          className={`${inputCls} min-h-[200px] font-mono text-[13px]`}
          placeholder="Corpo do encaminhamento (use as variáveis acima)"
          value={corpo}
          onChange={(e) => setCorpo(e.target.value)}
        />
      </section>

      {/* BLOCO — PRÉVIA */}
      <section className="panel-3d p-5">
        <BlockTitle icon={Eye}>Prévia do Documento</BlockTitle>
        <div className="concave-3d whitespace-pre-wrap px-4 py-3 text-[13px] leading-relaxed text-foreground/90 min-h-[120px]">
          {previa.trim() ? previa : <span className="text-muted-foreground">A prévia do corpo aparece aqui conforme você escreve.</span>}
        </div>
        <div className="mt-4 flex justify-end">
          <button
            onClick={handleEmitir}
            disabled={emitindo}
            className="btn-3d inline-flex items-center gap-2 rounded-md px-5 py-2.5 text-sm font-semibold disabled:opacity-60"
          >
            <Send className="h-4 w-4" />
            {emitindo ? "Emitindo…" : "Emitir Encaminhamento"}
          </button>
        </div>
      </section>

      {/* BLOCO — LISTA */}
      <section className="panel-3d p-5">
        <BlockTitle icon={ClipboardList}>Encaminhamentos do Cliente</BlockTitle>
        {clientId == null ? (
          <div className="concave-3d flex items-center justify-center py-10 text-center text-sm text-muted-foreground">
            Escolha um cliente para ver os encaminhamentos.
          </div>
        ) : lista.length === 0 ? (
          <div className="concave-3d flex flex-col items-center justify-center py-10 text-center text-muted-foreground">
            <Layers className="mb-2 h-10 w-10 text-border" />
            <p className="text-sm">Nenhum encaminhamento para este cliente.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {lista.map((e) => {
              const sc = statusChip(e.status);
              const uc = urgenciaChip(e.urgencia);
              return (
                <div key={e.id} className="panel-3d-sub p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Stethoscope className="h-4 w-4 shrink-0 text-primary" />
                        <span className="truncate text-sm font-semibold uppercase tracking-tight text-foreground">
                          {e.especialidadeDestino}
                        </span>
                      </div>
                      {e.profissionalDestino && (
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">Destino: {e.profissionalDestino}</p>
                      )}
                      <p className="mt-1 line-clamp-2 text-[12px] text-muted-foreground">{e.motivo}</p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest">
                        <span className={`paxter-led ${sc.led} paxter-led-on`} />
                        <span className={sc.cls}>{sc.label}</span>
                      </span>
                      <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest">
                        <span className={`paxter-led ${uc.led}`} />
                        <span className={uc.cls}>{uc.label}</span>
                      </span>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <a
                      href={`${BASE}${e.pdfUrl}`}
                      target="_blank"
                      rel="noreferrer"
                      className="btn-3d-soft inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold"
                    >
                      <Download className="h-3.5 w-3.5" />Baixar PDF
                    </a>
                    {e.driveWebViewLink && (
                      <a
                        href={e.driveWebViewLink}
                        target="_blank"
                        rel="noreferrer"
                        className="btn-3d-soft inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />Ver no Drive
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </ConsoleShell>
  );
}
