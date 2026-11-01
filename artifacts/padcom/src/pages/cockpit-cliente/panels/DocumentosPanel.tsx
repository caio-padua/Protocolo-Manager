import { useEffect, useMemo, useState, type ElementType } from "react";
import {
  FileSignature, Share2, Stethoscope, CheckCircle2, Send,
  Download, Layers, Clock, CalendarDays, Eye,
} from "lucide-react";
import { CidPicker } from "@/components/CidPicker";
import { useToast } from "@/hooks/use-toast";
import { useClinicalIdentity } from "@/hooks/use-clinical-identity";
import { getCollabToken } from "@/lib/collab-auth";
import ClinicalHistoryToggle from "@/components/ClinicalHistoryToggle";
import ClinicalDocumentResendForm from "@/components/ClinicalDocumentResendForm";
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
  const identity = useClinicalIdentity(clientId);
  const cliente = identity.data?.client ?? null;
  const profissional = identity.data?.professional ?? null;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <AtestadoInline
          clientId={clientId}
          cliente={cliente}
          profissional={profissional}
          identityReady={Boolean(identity.data) && !identity.isError && !identity.isFetching}
          toast={toast}
        />
        <EncaminhamentoInline
          clientId={clientId}
          cliente={cliente}
          profissional={profissional}
          identityReady={Boolean(identity.data) && !identity.isError && !identity.isFetching}
          toast={toast}
        />
      </div>
      {identity.isError && <p role="alert" className="text-sm text-destructive">
        Não foi possível validar o médico, o cliente e a clínica. Atualize a identidade antes de emitir documentos.
      </p>}
    </div>
  );
}

type ClienteLike = { id: number; name: string; cpf?: string | null; phone?: string | null; email?: string | null } | null;
type ProfLike = { id: number; name: string; crm?: string | null; uf?: string | null } | null;
type ToastFn = ReturnType<typeof useToast>["toast"];

function authHeaders(json = false): Record<string, string> {
  const token = getCollabToken();
  if (!token) throw new Error("Faça login de colaborador para continuar.");
  return {
    ...(json ? { "Content-Type": "application/json" } : {}),
    Authorization: `Bearer ${token}`,
  };
}

async function openClinicalPdf(path: string, download = false, fileName = "documento-clinico.pdf") {
  const tab = download ? null : window.open("about:blank", "_blank");
  if (tab) tab.opener = null;
  try {
    const response = await fetch(path, { headers: authHeaders() });
    if (!response.ok) throw new Error("Não foi possível abrir o PDF autorizado.");
    const url = URL.createObjectURL(await response.blob());
    if (download) {
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
    } else if (tab) {
      tab.location.href = url;
    } else {
      URL.revokeObjectURL(url);
      throw new Error("Permita abrir uma nova aba para visualizar o documento.");
    }
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (error) {
    tab?.close();
    throw error;
  }
}

// ---------------------------------------------------------------------------
// ATESTADO INLINE
// ---------------------------------------------------------------------------
function AtestadoInline({
  clientId, cliente, profissional, identityReady, toast,
}: {
  clientId: number;
  cliente: ClienteLike;
  profissional: ProfLike;
  identityReady: boolean;
  toast: ToastFn;
}) {
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
  const [historicoAberto, setHistoricoAberto] = useState(false);
  const [historicoErro, setHistoricoErro] = useState("");

  useEffect(() => {
    fetch(`${API}/document-templates?tipo=atestado`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setModelos(Array.isArray(d) ? d : []))
      .catch(() => setModelos([]));
  }, []);

  useEffect(() => {
    if (!historicoAberto) {
      setHistorico([]);
      setHistoricoErro("");
      return;
    }
    let ativo = true;
    setHistoricoErro("");
    let headers: Record<string, string>;
    try {
      headers = authHeaders();
    } catch (error) {
      setHistoricoErro(error instanceof Error ? error.message : "Faça login de colaborador.");
      return;
    }
    fetch(`${API}/atestados?clientId=${clientId}`, { headers })
      .then(async (response) => {
        if (!response.ok) {
          const data = await response.json().catch(() => null);
          throw new Error(data?.error || "Não foi possível carregar o histórico.");
        }
        return response.json();
      })
      .then((data) => { if (ativo) setHistorico(Array.isArray(data) ? data : []); })
      .catch((error: unknown) => {
        if (ativo) setHistoricoErro(error instanceof Error ? error.message : "Falha ao carregar o histórico.");
      });
    return () => { ativo = false; };
  }, [clientId, historicoAberto]);

  const valores = useMemo(
    () =>
      montarValores({
        cliente: { nome: cliente?.name, cpf: cliente?.cpf },
        profissional: {
          nome: profissional?.name,
          crm: profissional?.crm,
          uf: profissional?.uf,
        },
        extras: { dias, cid, finalidade },
      }),
    [cliente, profissional, dias, cid, finalidade],
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
    if (!cliente || !profissional || !identityReady) {
      toast({ title: "Identidade clínica não validada", description: "Confira o vínculo do médico, da clínica e do cliente.", variant: "destructive" });
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
        headers: authHeaders(true),
        body: JSON.stringify({
          clientId,
          clientName: cliente.name,
          clientCpf: cliente.cpf ?? null,
          clientPhone: cliente.phone ?? null,
          clientEmail: cliente.email ?? null,
          professionalId: profissional.id,
          professionalName: profissional.name,
          professionalCrm: profissional.crm ?? null,
          professionalUf: profissional.uf ?? null,
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

      const emit = await fetch(`${API}/atestados/${criado.id}/emitir`, { method: "POST", headers: authHeaders() });
      if (!emit.ok) throw new Error("Falha ao emitir o atestado");
      const emitido = await emit.json();

      toast({ title: "Atestado emitido!", description: "PDF gerado com sucesso." });
      setHistoricoAberto(true);
      try {
          await openClinicalPdf(`${API}/clinical-documents/atestado/${emitido.id}/pdf`);
      } catch (error) {
        toast({ title: "Atestado emitido", description: error instanceof Error ? error.message : "O PDF foi emitido, mas não abriu nesta aba." });
      }
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

      <div className="screen-3d rounded-md p-3">
        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Profissional autenticado</p>
        <p className="mt-1 text-sm font-semibold text-foreground">{profissional?.name ?? "Identidade em validação"}</p>
        <p className="text-xs text-muted-foreground">
          {profissional?.crm ? `CRM ${profissional.crm}${profissional.uf ? `/${profissional.uf}` : ""}` : "Registro profissional não disponível"}
        </p>
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
      disabled={emitindo || !identityReady}
          className="btn-3d inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          style={{ background: NAVY }}
        >
          <CheckCircle2 className="h-4 w-4" />
          {emitindo ? "Emitindo…" : "Emitir atestado"}
        </button>
      </div>

      <ClinicalHistoryToggle label="Histórico de atestados emitidos" open={historicoAberto} onOpenChange={setHistoricoAberto} />
      {historicoAberto && <div className="space-y-3">
        {historicoErro && <p role="alert" className="text-sm text-destructive">{historicoErro}</p>}
        <HistoricoDocs
          titulo="Atestados anteriores"
          vazio="Nenhum atestado emitido para este cliente."
          clientId={clientId}
          documentType="atestado"
          itens={historico.map((a) => ({
            id: a.id,
            rotulo: TIPOS_ATESTADO.find((t) => t.value === a.tipo)?.label ?? a.tipo,
            status: a.status,
            emittedAt: a.emittedAt,
            pdfUrl: `${API}/clinical-documents/atestado/${a.id}/pdf`,
          }))}
        />
      </div>}
    </section>
  );
}

// ---------------------------------------------------------------------------
// ENCAMINHAMENTO INLINE
// ---------------------------------------------------------------------------
function EncaminhamentoInline({
  clientId, cliente, profissional, identityReady, toast,
}: {
  clientId: number;
  cliente: ClienteLike;
  profissional: ProfLike;
  identityReady: boolean;
  toast: ToastFn;
}) {
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
  const [historicoAberto, setHistoricoAberto] = useState(false);
  const [historicoErro, setHistoricoErro] = useState("");

  useEffect(() => {
    fetch(`${API}/document-templates?tipo=encaminhamento`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setModelos(Array.isArray(d) ? d : []))
      .catch(() => setModelos([]));
  }, []);

  useEffect(() => {
    if (!historicoAberto) {
      setHistorico([]);
      setHistoricoErro("");
      return;
    }
    let ativo = true;
    setHistoricoErro("");
    let headers: Record<string, string>;
    try {
      headers = authHeaders();
    } catch (error) {
      setHistoricoErro(error instanceof Error ? error.message : "Faça login de colaborador.");
      return;
    }
    fetch(`${API}/encaminhamentos?clientId=${clientId}`, { headers })
      .then(async (response) => {
        if (!response.ok) {
          const data = await response.json().catch(() => null);
          throw new Error(data?.error || "Não foi possível carregar o histórico.");
        }
        return response.json();
      })
      .then((data) => { if (ativo) setHistorico(Array.isArray(data) ? data : []); })
      .catch((error: unknown) => {
        if (ativo) setHistoricoErro(error instanceof Error ? error.message : "Falha ao carregar o histórico.");
      });
    return () => { ativo = false; };
  }, [clientId, historicoAberto]);

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
    if (!cliente || !profissional || !identityReady) {
      toast({ title: "Identidade clínica não validada", description: "Confira o vínculo do médico, da clínica e do cliente.", variant: "destructive" });
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
        headers: authHeaders(true),
        body: JSON.stringify({
          clientId,
          clientName: cliente.name,
          clientCpf: cliente.cpf ?? null,
          clientPhone: cliente.phone ?? null,
          clientEmail: cliente.email ?? null,
          professionalId: profissional.id,
          professionalName: profissional.name,
          professionalCrm: profissional.crm ?? null,
          professionalUf: profissional.uf ?? null,
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

      const emit = await fetch(`${API}/encaminhamentos/${criado.id}/emitir`, { method: "POST", headers: authHeaders() });
      if (!emit.ok) throw new Error("Falha ao emitir o encaminhamento");
      const emitido = await emit.json();

      toast({ title: "Encaminhamento emitido!", description: "PDF gerado com sucesso." });
      setHistoricoAberto(true);
      try {
          await openClinicalPdf(`${API}/clinical-documents/encaminhamento/${emitido.id}/pdf`);
      } catch (error) {
        toast({ title: "Encaminhamento emitido", description: error instanceof Error ? error.message : "O PDF foi emitido, mas não abriu nesta aba." });
      }
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

      <div className="screen-3d rounded-md p-3">
        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Profissional autenticado</p>
        <p className="mt-1 text-sm font-semibold text-foreground">{profissional?.name ?? "Identidade em validação"}</p>
        <p className="text-xs text-muted-foreground">
          {profissional?.crm ? `CRM ${profissional.crm}${profissional.uf ? `/${profissional.uf}` : ""}` : "Registro profissional não disponível"}
        </p>
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
          disabled={emitindo || !identityReady}
          className="btn-3d inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          style={{ background: NAVY }}
        >
          <Send className="h-4 w-4" />
          {emitindo ? "Emitindo…" : "Emitir encaminhamento"}
        </button>
      </div>

      <ClinicalHistoryToggle label="Histórico de encaminhamentos emitidos" open={historicoAberto} onOpenChange={setHistoricoAberto} />
      {historicoAberto && <div className="space-y-3">
        {historicoErro && <p role="alert" className="text-sm text-destructive">{historicoErro}</p>}
        <HistoricoDocs
          titulo="Encaminhamentos anteriores"
          vazio="Nenhum encaminhamento emitido para este cliente."
          clientId={clientId}
          documentType="encaminhamento"
          itens={historico.map((e) => ({
            id: e.id,
            rotulo: e.especialidadeDestino,
            status: e.status,
            emittedAt: e.emittedAt,
            pdfUrl: `${API}/clinical-documents/encaminhamento/${e.id}/pdf`,
          }))}
        />
      </div>}
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
  pdfUrl: string;
}

function HistoricoDocs({ titulo, vazio, clientId, documentType, itens }: {
  titulo: string;
  vazio: string;
  clientId: number;
  documentType: "atestado" | "encaminhamento";
  itens: DocListItem[];
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide" style={{ color: OURO }}>
        <Layers className="h-3.5 w-3.5" /> {titulo}
      </div>
      {itens.length === 0 ? (
        <p className="text-sm text-[#647c97]">{vazio}</p>
      ) : (
        <ul className="space-y-2">
          {itens.map((item) => <ClinicalDocumentHistoryRow
            key={item.id} item={item} clientId={clientId} documentType={documentType}
          />)}
        </ul>
      )}
    </div>
  );
}

function ClinicalDocumentHistoryRow({ item, clientId, documentType }: {
  item: DocListItem;
  clientId: number;
  documentType: "atestado" | "encaminhamento";
}) {
  const [pdfError, setPdfError] = useState("");
  return <li className="concave-3d space-y-3 rounded-md bg-white px-3 py-2">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-[#16294a]">
          {item.rotulo}<span className="ml-2 text-xs text-[#647c97]">#{item.id}</span>
        </p>
        <p className="text-xs text-[#647c97]">
          {item.status === "emitted" ? "Emitido" : "Rascunho"}
          {item.emittedAt ? ` — ${new Date(item.emittedAt).toLocaleString("pt-BR")}` : ""}
        </p>
      </div>
      {item.status === "emitted" && <div className="flex shrink-0 flex-wrap items-center gap-2">
        <button type="button" onClick={() => {
          setPdfError("");
          void openClinicalPdf(item.pdfUrl).catch((error) => setPdfError(error instanceof Error ? error.message : "Falha ao abrir o PDF."));
        }} className="bevel-3d inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-[#647c97] hover:text-[#16294a]">
          <Eye className="h-3.5 w-3.5" /> Abrir
        </button>
        <button type="button" onClick={() => {
          setPdfError("");
          void openClinicalPdf(`${item.pdfUrl}?download=1`, true, `${documentType}-${item.id}.pdf`)
            .catch((error) => setPdfError(error instanceof Error ? error.message : "Falha ao baixar o PDF."));
        }} className="bevel-3d inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-[#647c97] hover:text-[#16294a]">
          <Download className="h-3.5 w-3.5" /> Baixar
        </button>
      </div>}
    </div>
    {pdfError && <p role="alert" className="text-xs text-destructive">{pdfError}</p>}
    {item.status === "emitted" && <ClinicalDocumentResendForm clientId={clientId} documentType={documentType} documentId={item.id} />}
  </li>;
}

function BlockTitle({ icon: Icon, children }: { icon: ElementType; children: React.ReactNode }) {
  return (
    <span className="bevel-3d inline-flex items-center gap-2 px-3 py-1.5 text-base font-semibold uppercase tracking-wide" style={{ color: NAVY }}>
      <Icon className="h-4 w-4" style={{ color: OURO }} />
      {children}
    </span>
  );
}
