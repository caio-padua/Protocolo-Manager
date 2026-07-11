import { useEffect, useMemo, useState, type ElementType } from "react";
import {
  FileSignature, Share2, Stethoscope, CheckCircle2, Send,
  Download, ExternalLink, Layers, Clock, CalendarDays,
} from "lucide-react";
import { useListClients, useListProfessionals } from "@workspace/api-client-react";
import { CidPicker } from "@/components/CidPicker";
import { useToast } from "@/hooks/use-toast";
import {
  VARIAVEIS_DOC, aplicarVariaveis, montarValores,
} from "@/lib/doc-variaveis";

// ===========================================================================
// PAINEL DE DOCUMENTOS INLINE (Cockpit da Consulta — aba Documentos):
// Atestado + Encaminhamento lado a lado, ambos INLINE (sem navegar).
// Cliente vem do clientId; nunca pede o cliente de novo. Conteudo CLARO.
// ===========================================================================

const NAVY = "#16294a";
const OURO = "#9a7b32";

const API = import.meta.env.BASE_URL + "api";

const PROF_DEFAULT = { nome: "Dr. Caio Henrique Pádua", crm: "125475", uf: "SP" };

const TIPOS_ATESTADO: { value: string; label: string }[] = [
  { value: "comparecimento", label: "Comparecimento" },
  { value: "afastamento", label: "Afastamento" },
  { value: "acompanhante", label: "Acompanhante" },
  { value: "aptidao", label: "Aptidão" },
];

const URGENCIAS: { value: string; label: string }[] = [
  { value: "eletivo", label: "Eletivo" },
  { value: "prioritario", label: "Prioritário" },
  { value: "urgente", label: "Urgente" },
];

interface DocumentTemplate {
  id: number;
  tipo: string;
  nome: string;
  corpo: string;
}

interface AtestadoRow {
  id: number;
  tipo: string;
  status: string;
  driveWebViewLink: string | null;
  emittedAt: string | null;
}

interface EncaminhamentoRow {
  id: number;
  especialidadeDestino: string;
  status: string;
  driveWebViewLink: string | null;
  pdfUrl: string;
  emittedAt: string | null;
}

export default function DocumentosPanel({ clientId }: { clientId: number }) {
  const { toast } = useToast();

  const { data: clients } = useListClients();
  const { data: profissionais = [] } = useListProfessionals();
  const cliente = useMemo(
    () => (clients ?? []).find((c) => c.id === clientId) ?? null,
    [clients, clientId],
  );

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <AtestadoInline
          clientId={clientId}
          cliente={cliente}
          profissionais={profissionais}
          toast={toast}
        />
        <EncaminhamentoInline
          clientId={clientId}
          cliente={cliente}
          profissionais={profissionais}
          toast={toast}
        />
      </div>
    </div>
  );
}

type ClienteLike = { id: number; name: string; cpf?: string | null; phone?: string | null; email?: string | null } | null;
type ProfLike = { id: number; name: string; crm?: string | null };
type ToastFn = ReturnType<typeof useToast>["toast"];

// ---------------------------------------------------------------------------
// ATESTADO INLINE
// ---------------------------------------------------------------------------
function AtestadoInline({
  clientId, cliente, profissionais, toast,
}: {
  clientId: number;
  cliente: ClienteLike;
  profissionais: ProfLike[];
  toast: ToastFn;
}) {
  const [professionalId, setProfessionalId] = useState<number | null>(null);
  const [tipo, setTipo] = useState("comparecimento");
  const [dias, setDias] = useState("");
  const [dataInicio, setDataInicio] = useState("");
  const [cid, setCid] = useState("");
  const [finalidade, setFinalidade] = useState("");
  const [modelos, setModelos] = useState<DocumentTemplate[]>([]);
  const [modeloId, setModeloId] = useState<number | null>(null);
  const [corpo, setCorpo] = useState("");
  const [observacao, setObservacao] = useState("");
  const [emitindo, setEmitindo] = useState(false);
  const [historico, setHistorico] = useState<AtestadoRow[]>([]);

  const profSel = useMemo(() => profissionais.find((p) => p.id === professionalId) ?? null, [profissionais, professionalId]);

  useEffect(() => {
    fetch(`${API}/document-templates?tipo=atestado`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setModelos(Array.isArray(d) ? d : []))
      .catch(() => setModelos([]));
  }, []);

  const carregarHistorico = () => {
    fetch(`${API}/atestados?clientId=${clientId}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setHistorico(Array.isArray(d) ? d : []))
      .catch(() => setHistorico([]));
  };
  useEffect(carregarHistorico, [clientId]);

  const valores = useMemo(
    () =>
      montarValores({
        cliente: { nome: cliente?.name, cpf: cliente?.cpf },
        profissional: {
          nome: profSel?.name ?? PROF_DEFAULT.nome,
          crm: profSel?.crm ?? PROF_DEFAULT.crm,
          uf: PROF_DEFAULT.uf,
        },
        extras: { dias, cid, finalidade },
      }),
    [cliente, profSel, dias, cid, finalidade],
  );

  function aplicarModelo(id: number | null) {
    setModeloId(id);
    if (id == null) return;
    const m = modelos.find((x) => x.id === id);
    if (m) setCorpo(m.corpo);
  }

  function inserirVariavel(chave: string) {
    setCorpo((c) => `${c}{{${chave}}}`);
  }

  async function emitir() {
    if (!cliente) {
      toast({ title: "Cliente não carregado", variant: "destructive" });
      return;
    }
    const corpoAplicado = aplicarVariaveis(corpo, valores);
    if (!corpoAplicado.trim()) {
      toast({ title: "O corpo do atestado está vazio", variant: "destructive" });
      return;
    }
    setEmitindo(true);
    try {
      const criar = await fetch(`${API}/atestados`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          clientName: cliente.name,
          clientCpf: cliente.cpf ?? null,
          clientPhone: cliente.phone ?? null,
          clientEmail: cliente.email ?? null,
          professionalId: professionalId ?? null,
          professionalName: profSel?.name ?? PROF_DEFAULT.nome,
          professionalCrm: profSel?.crm ?? PROF_DEFAULT.crm,
          professionalUf: PROF_DEFAULT.uf,
          tipo,
          dias: dias.trim() ? Number(dias) : null,
          dataInicio: dataInicio.trim() || null,
          cid: cid.trim() || null,
          finalidade: finalidade.trim() || null,
          corpo: corpoAplicado,
          observacao: observacao.trim() || null,
        }),
      });
      if (!criar.ok) throw new Error("Falha ao criar o atestado");
      const criado = await criar.json();

      const emit = await fetch(`${API}/atestados/${criado.id}/emitir`, { method: "POST" });
      if (!emit.ok) throw new Error("Falha ao emitir o atestado");
      const emitido = await emit.json();

      toast({ title: "Atestado emitido!", description: "PDF gerado com sucesso." });
      window.open(`${API}/atestados/${emitido.id}/pdf`, "_blank");
      carregarHistorico();
    } catch (err) {
      toast({
        title: "Erro ao emitir atestado",
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    } finally {
      setEmitindo(false);
    }
  }

  return (
    <section className="panel-3d space-y-4 p-5">
      <BlockTitle icon={FileSignature}>Atestado</BlockTitle>

      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[#647c97]">Profissional</label>
        <select
          className="field-engraved h-10 w-full px-3"
          value={professionalId ?? ""}
          onChange={(e) => setProfessionalId(e.target.value ? Number(e.target.value) : null)}
        >
          <option value="">{`${PROF_DEFAULT.nome} — CRM ${PROF_DEFAULT.crm}/${PROF_DEFAULT.uf} (padrão)`}</option>
          {profissionais.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}{p.crm ? ` — CRM ${p.crm}` : ""}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[#647c97]">Tipo</label>
          <select className="field-engraved h-10 w-full px-3" value={tipo} onChange={(e) => setTipo(e.target.value)}>
            {TIPOS_ATESTADO.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-[#647c97]">
            <Clock className="h-3 w-3" /> Dias
          </label>
          <input
            type="number" min={0} className="field-engraved h-10 w-full px-3"
            value={dias} onChange={(e) => setDias(e.target.value)} placeholder="ex.: 3"
          />
        </div>
        <div>
          <label className="mb-1 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-[#647c97]">
            <CalendarDays className="h-3 w-3" /> Início
          </label>
          <input
            type="date" className="field-engraved h-10 w-full px-3"
            value={dataInicio} onChange={(e) => setDataInicio(e.target.value)}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[#647c97]">CID</label>
          <CidPicker value={cid} onChange={setCid} placeholder="ex.: J06.9 ou gripe" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[#647c97]">Finalidade</label>
          <input
            className="field-engraved h-10 w-full px-3"
            value={finalidade} onChange={(e) => setFinalidade(e.target.value)} placeholder="ex.: tratamento clínico"
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[#647c97]">Modelo</label>
        <select
          className="field-engraved h-10 w-full px-3"
          value={modeloId ?? ""}
          onChange={(e) => aplicarModelo(e.target.value ? Number(e.target.value) : null)}
        >
          <option value="">— escolher um modelo —</option>
          {modelos.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
        </select>
      </div>

      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[#647c97]">Variáveis</label>
        <div className="flex flex-wrap gap-1.5">
          {VARIAVEIS_DOC.map((v) => (
            <button
              key={v.chave}
              type="button"
              onClick={() => inserirVariavel(v.chave)}
              className="bevel-3d px-2 py-1 text-xs font-medium text-[#647c97] hover:text-[#16294a]"
              title={v.rotulo}
            >
              {`{{${v.chave}}}`}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[#647c97]">Corpo</label>
        <textarea
          className="field-engraved min-h-[140px] w-full resize-y p-3 text-sm leading-relaxed"
          value={corpo} onChange={(e) => setCorpo(e.target.value)}
          placeholder="Escreva o texto do atestado ou selecione um modelo. Use {{variáveis}}."
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[#647c97]">Observações</label>
        <textarea
          className="field-engraved min-h-[60px] w-full resize-y p-3 text-sm"
          value={observacao} onChange={(e) => setObservacao(e.target.value)}
          placeholder="Observações internas (opcional)."
        />
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={emitir}
          disabled={emitindo}
          className="btn-3d inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          style={{ background: NAVY }}
        >
          <CheckCircle2 className="h-4 w-4" />
          {emitindo ? "Emitindo…" : "Emitir atestado"}
        </button>
      </div>

      <HistoricoDocs
        titulo="Últimos atestados"
        vazio="Nenhum atestado emitido para este cliente."
        itens={historico.map((a) => ({
          id: a.id,
          rotulo: TIPOS_ATESTADO.find((t) => t.value === a.tipo)?.label ?? a.tipo,
          status: a.status,
          emittedAt: a.emittedAt,
          driveWebViewLink: a.driveWebViewLink,
          pdfUrl: `${API}/atestados/${a.id}/pdf`,
        }))}
      />
    </section>
  );
}

// ---------------------------------------------------------------------------
// ENCAMINHAMENTO INLINE
// ---------------------------------------------------------------------------
function EncaminhamentoInline({
  clientId, cliente, profissionais, toast,
}: {
  clientId: number;
  cliente: ClienteLike;
  profissionais: ProfLike[];
  toast: ToastFn;
}) {
  const [profId, setProfId] = useState<number | null>(null);
  const [especialidade, setEspecialidade] = useState("");
  const [profDestino, setProfDestino] = useState("");
  const [urgencia, setUrgencia] = useState("eletivo");
  const [motivo, setMotivo] = useState("");
  const [resumo, setResumo] = useState("");
  const [modelos, setModelos] = useState<DocumentTemplate[]>([]);
  const [modeloId, setModeloId] = useState<number | null>(null);
  const [corpo, setCorpo] = useState("");
  const [emitindo, setEmitindo] = useState(false);
  const [historico, setHistorico] = useState<EncaminhamentoRow[]>([]);

  const profissional = useMemo(() => profissionais.find((p) => p.id === profId) ?? null, [profissionais, profId]);

  useEffect(() => {
    fetch(`${API}/document-templates?tipo=encaminhamento`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setModelos(Array.isArray(d) ? d : []))
      .catch(() => setModelos([]));
  }, []);

  const carregarHistorico = () => {
    fetch(`${API}/encaminhamentos?clientId=${clientId}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setHistorico(Array.isArray(d) ? d : []))
      .catch(() => setHistorico([]));
  };
  useEffect(carregarHistorico, [clientId]);

  const valores = () =>
    montarValores({
      cliente: { nome: cliente?.name, cpf: cliente?.cpf },
      profissional: { nome: profissional?.name, crm: profissional?.crm },
      extras: { especialidade, motivo, urgencia },
    });

  function aplicarModelo(id: number | null) {
    setModeloId(id);
    if (id == null) return;
    const m = modelos.find((x) => x.id === id);
    if (m) setCorpo(aplicarVariaveis(m.corpo, valores()));
  }

  function inserirVariavel(chave: string) {
    setCorpo((c) => `${c}{{${chave}}}`);
  }

  const previa = useMemo(
    () => aplicarVariaveis(corpo, valores()),
    [corpo, cliente, profissional, especialidade, motivo, urgencia],
  );

  async function emitir() {
    if (!cliente) {
      toast({ title: "Cliente não carregado", variant: "destructive" });
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
      const criar = await fetch(`${API}/encaminhamentos`, {
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
          corpo: previa,
        }),
      });
      if (!criar.ok) throw new Error("Falha ao criar o encaminhamento");
      const criado = await criar.json();

      const emit = await fetch(`${API}/encaminhamentos/${criado.id}/emitir`, { method: "POST" });
      if (!emit.ok) throw new Error("Falha ao emitir o encaminhamento");
      const emitido = await emit.json();

      toast({ title: "Encaminhamento emitido!", description: "PDF gerado com sucesso." });
      window.open(`${API}/encaminhamentos/${emitido.id}/pdf`, "_blank");
      carregarHistorico();
    } catch (err) {
      toast({
        title: "Erro ao emitir encaminhamento",
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    } finally {
      setEmitindo(false);
    }
  }

  return (
    <section className="panel-3d space-y-4 p-5">
      <BlockTitle icon={Share2}>Encaminhamento</BlockTitle>

      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[#647c97]">Profissional (origem)</label>
        <select
          className="field-engraved h-10 w-full px-3"
          value={profId ?? ""}
          onChange={(e) => setProfId(e.target.value ? Number(e.target.value) : null)}
        >
          <option value="">— selecione —</option>
          {profissionais.map((p) => (
            <option key={p.id} value={p.id}>{p.name}{p.crm ? ` — CRM ${p.crm}` : ""}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[#647c97]">Especialidade de destino</label>
          <input
            className="field-engraved h-10 w-full px-3"
            value={especialidade} onChange={(e) => setEspecialidade(e.target.value)} placeholder="ex.: Cardiologia"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[#647c97]">Profissional de destino</label>
          <input
            className="field-engraved h-10 w-full px-3"
            value={profDestino} onChange={(e) => setProfDestino(e.target.value)} placeholder="opcional"
          />
        </div>
        <div className="col-span-2">
          <label className="mb-1 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-[#647c97]">
            <Stethoscope className="h-3 w-3" /> Urgência
          </label>
          <select className="field-engraved h-10 w-full px-3" value={urgencia} onChange={(e) => setUrgencia(e.target.value)}>
            {URGENCIAS.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
          </select>
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[#647c97]">Motivo</label>
        <textarea
          className="field-engraved min-h-[60px] w-full resize-y p-3 text-sm"
          value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo / justificativa do encaminhamento"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[#647c97]">Resumo clínico</label>
        <textarea
          className="field-engraved min-h-[60px] w-full resize-y p-3 text-sm"
          value={resumo} onChange={(e) => setResumo(e.target.value)} placeholder="Resumo do quadro clínico (opcional)"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[#647c97]">Modelo</label>
        <select
          className="field-engraved h-10 w-full px-3"
          value={modeloId ?? ""}
          onChange={(e) => aplicarModelo(e.target.value ? Number(e.target.value) : null)}
        >
          <option value="">— sem modelo —</option>
          {modelos.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
        </select>
      </div>

      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[#647c97]">Variáveis</label>
        <div className="flex flex-wrap gap-1.5">
          {VARIAVEIS_DOC.map((v) => (
            <button
              key={v.chave}
              type="button"
              onClick={() => inserirVariavel(v.chave)}
              className="bevel-3d px-2 py-1 text-xs font-medium text-[#647c97] hover:text-[#16294a]"
              title={v.rotulo}
            >
              {`{{${v.chave}}}`}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[#647c97]">Corpo</label>
        <textarea
          className="field-engraved min-h-[140px] w-full resize-y p-3 text-sm leading-relaxed"
          value={corpo} onChange={(e) => setCorpo(e.target.value)}
          placeholder="Corpo do encaminhamento (use as {{variáveis}} acima)."
        />
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={emitir}
          disabled={emitindo}
          className="btn-3d inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          style={{ background: NAVY }}
        >
          <Send className="h-4 w-4" />
          {emitindo ? "Emitindo…" : "Emitir encaminhamento"}
        </button>
      </div>

      <HistoricoDocs
        titulo="Últimos encaminhamentos"
        vazio="Nenhum encaminhamento para este cliente."
        itens={historico.map((e) => ({
          id: e.id,
          rotulo: e.especialidadeDestino,
          status: e.status,
          emittedAt: e.emittedAt,
          driveWebViewLink: e.driveWebViewLink,
          pdfUrl: `${API}/encaminhamentos/${e.id}/pdf`,
        }))}
      />
    </section>
  );
}

// ---------------------------------------------------------------------------
// Lista compacta de documentos com botão PDF.
// ---------------------------------------------------------------------------
interface DocListItem {
  id: number;
  rotulo: string;
  status: string;
  emittedAt: string | null;
  driveWebViewLink: string | null;
  pdfUrl: string;
}

function HistoricoDocs({ titulo, vazio, itens }: { titulo: string; vazio: string; itens: DocListItem[] }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide" style={{ color: OURO }}>
        <Layers className="h-3.5 w-3.5" /> {titulo}
      </div>
      {itens.length === 0 ? (
        <p className="text-sm text-[#647c97]">{vazio}</p>
      ) : (
        <ul className="space-y-2">
          {itens.map((a) => (
            <li key={a.id} className="concave-3d flex items-center justify-between rounded-md bg-white px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-[#16294a]">
                  {a.rotulo}
                  <span className="ml-2 text-xs text-[#647c97]">#{a.id}</span>
                </p>
                <p className="text-xs text-[#647c97]">
                  {a.status === "emitted" ? "Emitido" : "Rascunho"}
                  {a.emittedAt ? ` — ${new Date(a.emittedAt).toLocaleString("pt-BR")}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <a
                  href={a.pdfUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="bevel-3d inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-[#647c97] hover:text-[#16294a]"
                >
                  <Download className="h-3.5 w-3.5" /> PDF
                </a>
                {a.driveWebViewLink && (
                  <a
                    href={a.driveWebViewLink}
                    target="_blank"
                    rel="noreferrer"
                    className="bevel-3d inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-[#647c97] hover:text-[#16294a]"
                  >
                    <ExternalLink className="h-3.5 w-3.5" /> Drive
                  </a>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function BlockTitle({ icon: Icon, children }: { icon: ElementType; children: React.ReactNode }) {
  return (
    <span className="bevel-3d inline-flex items-center gap-2 px-3 py-1.5 text-base font-semibold uppercase tracking-wide" style={{ color: NAVY }}>
      <Icon className="h-4 w-4" style={{ color: OURO }} />
      {children}
    </span>
  );
}
