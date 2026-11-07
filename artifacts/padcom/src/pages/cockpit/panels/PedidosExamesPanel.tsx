import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Loader2,
  Search,
  Trash2,
  Send,
  FileText,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  Droplets,
  ScanLine,
  Activity,
  List,
  Layers,
  Plus,
} from "lucide-react";
import { BASE } from "../../comunicacao/_shared";
import { useClinicalIdentity } from "@/hooks/use-clinical-identity";
import { ClinicalIdentityPanel } from "@/components/ClinicalIdentityPanel";
import ExamDocumentHistoryPanel from "./ExamDocumentHistoryPanel";
import { ClinicalDraftGate, ClinicalDraftNotice, type IdentityQuery } from "@/components/ClinicalDraft";
import { useClinicalDraft } from "@/hooks/use-clinical-draft";
import { emptyExamDraft, examDraftSchema } from "./clinical-draft-schemas";
import PersonalExamSets from "./PersonalExamSets";
import { useCreateClinicalApproval, useEmitExamRequest, getListClinicalApprovalsQueryKey, getCountClinicalApprovalsQueryKey } from "@workspace/api-client-react";
import { getCollabToken } from "@/lib/collab-auth";
import { useQueryClient } from "@tanstack/react-query";
import ClinicalDemonstrationPanel from "./ClinicalDemonstrationPanel";

// ---------------------------------------------------------------------------
// PAINEL: PEDIDOS DE EXAMES (client-scoped) — extraido de consulta/index.tsx.
// Catalogo + carrinho + medico solicitante + envio (e-mail/WhatsApp).
// Consome apenas motores existentes:
//   GET  /api/catalogos/exames    (catalogo)
//   GET  /api/professionals       (medicos)
//   POST /api/exam-requests/emit  (gera PDF + envio)
// ---------------------------------------------------------------------------

type Tipo = "SANGUE" | "IMAGEM" | "OUTROS";

interface ProfOption {
  id: number;
  name: string;
  crm?: string | null;
  role?: string | null;
}
interface Exam {
  id: number;
  codigoExame: string | null;
  nomeExame: string | null;
  grupoPrincipal: string | null;
  subgrupo: string | null;
  modalidade: string | null;
  materialOuSetor: string | null;
  preparo: string | null;
  ativo?: boolean | null;
}
interface CartItem {
  id: number;
  nomeExame: string;
  codigoExame: string | null;
  grupoPrincipal: string | null;
  preparo: string | null;
  tipo: Tipo;
}
interface EmitResult {
  pdfs: Array<{ id: number; tipoLabel: string; fileName: string; examCount: number; url: string }>;
  email: { attempted: boolean; success: boolean; error?: string };
  whatsapp: { attempted: boolean; success: boolean; error?: string };
  confirmed?: boolean;
}

const TIPO_COLOR: Record<Tipo, string> = {
  SANGUE: "#B91C1C",
  IMAGEM: "#1D4ED8",
  OUTROS: "#7C3AED",
};
const TIPO_META: Record<Tipo, { label: string; icon: typeof Droplets; color: string }> = {
  SANGUE: { label: "Sangue / Laboratorial", icon: Droplets, color: "#B91C1C" },
  IMAGEM: { label: "Imagem", icon: ScanLine, color: "#1D4ED8" },
  OUTROS: { label: "Outros / Procedimentos", icon: Activity, color: "#7C3AED" },
};
interface BlocoGrau { grau: string; exames: Array<{ nomeExame: string; codigoPadcom: string | null; ordem: number | null }> }
interface Bloco { codigoBloco: string; nomeBloco: string | null; tipoMacro: string | null; totalExames: number; graus: BlocoGrau[] }
const IMAGING_MODALITIES = ["USG", "TC", "RM", "RX", "DENSITOMETRIA", "MAMOGRAFIA"];

function noAccents(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
function classifyTipo(modalidade: string | null, material: string | null, grupo: string | null): Tipo {
  const m = (modalidade ?? "").trim().toUpperCase();
  const mat = (material ?? "").trim().toUpperCase();
  const g = noAccents((grupo ?? "").trim().toUpperCase());
  if (m.includes("ENDOSCOP") || g.includes("ENDOSCOP")) return "OUTROS";
  const imagingByMod = IMAGING_MODALITIES.includes(m) || m.includes("IMAGEM");
  const imagingByMat = mat.includes("IMAGEM");
  const imagingByGroup =
    g.includes("IMAGEM") ||
    g.includes("RESSONANCIA") ||
    g.includes("ULTRASSOM") ||
    g.includes("MAMOGRAFIA") ||
    g === "TC" ||
    g === "BLOCO RX";
  if (imagingByMod || imagingByMat || imagingByGroup) return "IMAGEM";
  if (m === "CARDIO" || mat === "FUNCIONAL") return "OUTROS";
  return "SANGUE";
}

export default function PedidosExamesPanel({ clientId }: { clientId: number }) {
  const identity = useClinicalIdentity(clientId);
  return <ClinicalDraftGate identity={identity} clientId={clientId} kind="exams">
    {scope => <ExamsEditor key={scope} scope={scope} clientId={clientId} identity={identity} />}
  </ClinicalDraftGate>;
}

function ExamsEditor({ clientId, identity, scope }: { clientId: number; identity: IdentityQuery; scope: string }) {
  const queryClient = useQueryClient();
  const draft = useClinicalDraft(scope, examDraftSchema, emptyExamDraft);
  const { cart, observacao, individualDocuments } = draft.value;
  const setCart = draft.field("cart");
  const setObservacao = draft.field("observacao");
  const setIndividualDocuments = draft.field("individualDocuments");
  const [exams, setExams] = useState<Exam[]>([]);
  const [carregandoExams, setCarregandoExams] = useState(true);
  const [erroExams, setErroExams] = useState(false);
  const [busca, setBusca] = useState("");
  const [cardiacOnly, setCardiacOnly] = useState(false);
  const [categoria, setCategoria] = useState("all");
  const [viewMode, setViewMode] = useState<"lista" | "bloco">("lista");
  const [blocos, setBlocos] = useState<Bloco[]>([]);
  const [blocoBusca, setBlocoBusca] = useState("");
  const [blocoAviso, setBlocoAviso] = useState<string | null>(null);
  const activeClient = useRef(clientId);
  activeClient.current = clientId;
  const [emitindo, setEmitindo] = useState(false);
  const [emitResult, setEmitResult] = useState<EmitResult | null>(null);
  const [emitErro, setEmitErro] = useState<string | null>(null);
  const [approvalQueued, setApprovalQueued] = useState(false);
  const requestKeyRef = useRef<{ fingerprint: string; key: string } | null>(null);
  const authRequest = { headers: { Authorization: `Bearer ${getCollabToken() ?? ""}` } };
  const emitExamMutation = useEmitExamRequest({ request: authRequest });
  const createApproval = useCreateClinicalApproval({ request: authRequest });


  const carregarExams = useCallback(() => {
    setCarregandoExams(true);
    setErroExams(false);
    fetch(`${BASE}/api/catalogos/exames`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("catalogo"))))
      .then((d: Exam[]) => setExams(Array.isArray(d) ? d : []))
      .catch(() => {
        setExams([]);
        setErroExams(true);
      })
      .finally(() => setCarregandoExams(false));
  }, []);

  useEffect(() => {
    carregarExams();
  }, [carregarExams]);

  useEffect(() => {
    fetch(`${BASE}/api/cadastros/blocos`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("blocos"))))
      .then((d: Bloco[]) => setBlocos(Array.isArray(d) ? d : []))
      .catch(() => setBlocos([]));
  }, []);

  const categorias = useMemo(() => {
    const set = new Set<string>();
    for (const e of exams) if (e.ativo !== false && e.grupoPrincipal) set.add(e.grupoPrincipal);
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [exams]);

  const examesFiltrados = useMemo(() => {
    const term = noAccents(busca.trim().toLowerCase());
    return exams.filter((e) => {
      if (e.ativo === false || !e.nomeExame) return false;
      if (categoria !== "all" && e.grupoPrincipal !== categoria) return false;
      if (cardiacOnly) {
        const text = noAccents([e.nomeExame, e.grupoPrincipal, e.subgrupo, e.modalidade].filter(Boolean).join(" ")).toUpperCase();
        if (!/CARDIO|ECOCARD|CORONARI|HOLTER|\bECG\b|\bMAPA\b|ERGOMETR|(?:ESCORE|SCORE).*CALCIO/.test(text)) return false;
      }
      if (!term) return true;
      return [e.nomeExame, e.codigoExame, e.grupoPrincipal, e.subgrupo]
        .filter(Boolean)
        .some((v) => noAccents(String(v).toLowerCase()).includes(term));
    });
  }, [exams, busca, cardiacOnly, categoria]);

  const agrupados = useMemo(() => {
    const g: Record<Tipo, Exam[]> = { SANGUE: [], IMAGEM: [], OUTROS: [] };
    for (const e of examesFiltrados) g[classifyTipo(e.modalidade, e.materialOuSetor, e.grupoPrincipal)].push(e);
    return g;
  }, [examesFiltrados]);

  const blocosFiltrados = useMemo(() => {
    const q = noAccents(blocoBusca).toLowerCase().trim();
    if (!q) return blocos;
    return blocos.filter((b) => noAccents(`${b.nomeBloco ?? ""} ${b.tipoMacro ?? ""}`).toLowerCase().includes(q));
  }, [blocos, blocoBusca]);

  const adicionarPainel = (g: BlocoGrau) => {
    const ativos = exams.filter((e) => e.ativo !== false && e.nomeExame);
    const porCodigo = new Map(ativos.filter((e) => e.codigoExame).map((e) => [e.codigoExame!.toUpperCase().trim(), e]));
    const porNome = new Map<string, Exam>();
    for (const e of ativos) { const k = noAccents(e.nomeExame!).toUpperCase().trim(); if (!porNome.has(k)) porNome.set(k, e); }
    const achados: Exam[] = [];
    let semCatalogo = 0;
    for (const ex of g.exames) {
      const m = (ex.codigoPadcom ? porCodigo.get(ex.codigoPadcom.toUpperCase().trim()) : undefined)
        ?? porNome.get(noAccents(ex.nomeExame).toUpperCase().trim());
      if (m) achados.push(m); else semCatalogo++;
    }
    setCart((prev) => {
      const next = { ...prev };
      for (const e of achados) {
        if (!next[e.id]) next[e.id] = {
          id: e.id, nomeExame: e.nomeExame ?? "(sem nome)", codigoExame: e.codigoExame,
          grupoPrincipal: e.grupoPrincipal, preparo: e.preparo,
          tipo: classifyTipo(e.modalidade, e.materialOuSetor, e.grupoPrincipal),
        };
      }
      return next;
    });
    setBlocoAviso(`${achados.length} exame(s) adicionado(s)` + (semCatalogo > 0
      ? `; ${semCatalogo} sem correspondência no catálogo ativo (não adicionados).` : "."));
  };

  const cartList = useMemo(() => Object.values(cart), [cart]);

  const toggleExam = (e: Exam) => {
    setCart((prev) => {
      const next = { ...prev };
      if (next[e.id]) delete next[e.id];
      else
        next[e.id] = {
          id: e.id,
          nomeExame: e.nomeExame ?? "(sem nome)",
          codigoExame: e.codigoExame,
          grupoPrincipal: e.grupoPrincipal,
          preparo: e.preparo,
          tipo: classifyTipo(e.modalidade, e.materialOuSetor, e.grupoPrincipal),
        };
      return next;
    });
  };

  const emissionItems = () => cartList.map((i) => ({
    nomeExame: i.nomeExame,
    codigoExame: i.codigoExame,
    grupoPrincipal: i.grupoPrincipal,
    preparo: i.preparo,
    tipo: i.tipo,
  }));

  const emitir = async () => {
    if (draft.pending || emitindo || cartList.length === 0 || !identity.data?.canRequestExams || identity.isFetching || identity.isError) return;
    const requestedClient = clientId;
    const snapshot = draft.value;
    setEmitindo(true);
    setEmitErro(null);
    setEmitResult(null);
    try {
      const response = await emitExamMutation.mutateAsync({ data: {
          clientId,
          professionalId: identity.data.professional.id,
          observacao: observacao.trim() || undefined,
          individualDocuments,
          sendEmail: false,
          sendWhatsapp: false,
          items: emissionItems(),
        } }) as unknown as EmitResult;
      if (!draft.isCurrent() || activeClient.current !== requestedClient) return;
      setEmitResult({
        pdfs: Array.isArray(response?.pdfs) ? response.pdfs : [],
        email: response?.email ?? { attempted: false, success: false },
        whatsapp: response?.whatsapp ?? { attempted: false, success: false },
        confirmed: true,
      });
      draft.complete(snapshot);
    } catch (e) {
      if (draft.isCurrent() && activeClient.current === requestedClient) setEmitErro(`${(e as Error).message} — rascunho preservado.`);
    } finally {
      if (draft.isCurrent() && activeClient.current === requestedClient) setEmitindo(false);
    }
  };

  const enviarParaRevisao = () => {
    if (draft.pending || createApproval.isPending || cartList.length === 0 || !identity.data?.canPrepareExamRequest) return;
    const payload = { observacao: observacao.trim() || undefined, individualDocuments, items: emissionItems() };
    const fingerprint = JSON.stringify(payload);
    if (!requestKeyRef.current || requestKeyRef.current.fingerprint !== fingerprint) {
      requestKeyRef.current = { fingerprint, key: `exam:${crypto.randomUUID()}` };
    }
    const snapshot = draft.value;
    setEmitErro(null);
    createApproval.mutate({ data: {
      requestKey: requestKeyRef.current.key,
      kind: "pedido_exames",
      clientId,
      payload,
    } }, {
      onSuccess: () => {
        if (!draft.isCurrent()) return;
        requestKeyRef.current = null;
        setApprovalQueued(true);
        draft.complete(snapshot);
        void queryClient.invalidateQueries({ queryKey: getListClinicalApprovalsQueryKey() });
        void queryClient.invalidateQueries({ queryKey: getCountClinicalApprovalsQueryKey() });
      },
      onError: error => {
        if (draft.isCurrent()) setEmitErro(`${error.message} — rascunho preservado.`);
      },
    });
  };

  return (
    <div className="space-y-3">
      <fieldset disabled={emitindo || createApproval.isPending || emitExamMutation.isPending} className="min-w-0">
        <ClinicalDraftNotice draft={draft} identity={identity} />
      </fieldset>
      {approvalQueued && <p role="status" className="bevel-3d px-3 py-2 text-sm text-emerald-800">Pedido enviado ao médico responsável para revisão. Nenhuma mensagem foi enviada.</p>}
      {!draft.pending && <fieldset disabled={emitindo || createApproval.isPending || emitExamMutation.isPending} className="grid min-w-0 grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
      {/* Catalogo */}
      <div className="min-w-0 space-y-3">
        {identity.data && !identity.isError && !identity.isFetching && (
          <PersonalExamSets key={`${scope}-${identity.data.professional.id}-${identity.data.clinic.id}`}
            clientId={clientId} professionalId={identity.data.professional.id} clinicId={identity.data.clinic.id}
            exams={exams} selectedIds={cartList.map(item => item.id)}
            disabled={emitindo || carregandoExams || erroExams || draft.pending}
            onApply={selected => setCart(previous => {
              const next = { ...previous };
              for (const exam of selected) next[exam.id] = {
                id: exam.id, nomeExame: exam.nomeExame!, codigoExame: exam.codigoExame,
                grupoPrincipal: exam.grupoPrincipal, preparo: exam.preparo,
                tipo: classifyTipo(exam.modalidade, exam.materialOuSetor, exam.grupoPrincipal),
              };
              return next;
            })} />
        )}
        <label className="concave-3d flex items-center gap-2 p-3 text-sm">
          <input type="checkbox" checked={cardiacOnly} onChange={event => setCardiacOnly(event.target.checked)} disabled={emitindo} />
          Mostrar exames cardiológicos
        </label>
        <div className="concave-3d inline-flex gap-0.5 p-0.5">
          {([["lista", List, "Por Lista"], ["bloco", Layers, "Por Bloco"]] as const).map(([m, Icon, label]) => (
            <button key={m} type="button" onClick={() => setViewMode(m)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-black uppercase tracking-wide ${viewMode === m ? "btn-3d" : "text-muted-foreground neon-hover"}`}
              style={{ borderRadius: "4px" }}>
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>
        {viewMode === "lista" ? (<>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <select value={categoria} onChange={(e) => setCategoria(e.target.value)} aria-label="Categoria"
            className="concave-3d h-10 w-full rounded-md bg-transparent px-3 text-sm">
            <option value="all">Todas as categorias</option>
            {categorias.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              className="concave-3d h-10 w-full rounded-md bg-transparent pl-9 pr-3 text-sm"
              placeholder="Buscar exame..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
        </div>
        {carregandoExams ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando catálogo…
          </div>
        ) : erroExams ? (
          <div className="bevel-3d flex items-center justify-between gap-2 px-3 py-3 text-sm text-destructive">
            <span className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 flex-shrink-0" /> Falha ao carregar o catálogo de exames.
            </span>
            <button type="button" onClick={() => carregarExams()}
              className="btn-3d-soft rounded px-2 py-1 text-xs font-semibold uppercase">
              Tentar novamente
            </button>
          </div>
        ) : examesFiltrados.length === 0 ? (
          <p className="px-3 py-6 text-sm text-muted-foreground">Nenhum exame encontrado.</p>
        ) : (
          (Object.keys(TIPO_META) as Tipo[]).map((tipo) => {
            const list = agrupados[tipo];
            if (list.length === 0) return null;
            const Meta = TIPO_META[tipo];
            const Icon = Meta.icon;
            return (
              <div key={tipo} className="panel-3d overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-white" style={{ background: Meta.color }}>
                  <Icon className="h-4 w-4" /> {Meta.label}
                  <span className="ml-auto opacity-80">{list.length}</span>
                </div>
                <div className="max-h-72 divide-y divide-border overflow-y-auto">
                  {list.map((e) => (
                    <label key={e.id} className="flex cursor-pointer items-start gap-3 px-4 py-2 neon-hover">
                      <input type="checkbox" disabled={emitindo} checked={!!cart[e.id]} onChange={() => toggleExam(e)} className="mt-1" />
                      <span className="min-w-0">
                        <span className="block text-sm">{e.nomeExame}</span>
                        <span className="block text-xs text-muted-foreground">
                          {[e.codigoExame, e.grupoPrincipal].filter(Boolean).join(" • ")}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            );
          })
        )}
        </>) : (<>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input className="concave-3d h-10 w-full rounded-md bg-transparent pl-9 pr-3 text-sm"
              placeholder="Buscar bloco..." value={blocoBusca} onChange={(e) => setBlocoBusca(e.target.value)} />
          </div>
          <p className="concave-3d px-3 py-2.5 text-xs text-muted-foreground">
            Escolha um bloco e clique em "Adicionar painel" no grau desejado para incluir todos os exames daquele painel de uma vez.
          </p>
          {blocoAviso && <p role="status" className="bevel-3d px-3 py-2 text-xs">{blocoAviso}</p>}
          <div className="max-h-[520px] space-y-3 overflow-y-auto">
            {blocosFiltrados.map((b) => (
              <div key={b.codigoBloco} className="panel-3d-sub border-l-4 border-primary/50 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-xs font-black uppercase tracking-wide">{b.nomeBloco}</span>
                  {b.tipoMacro && <span className="text-[10px] font-bold uppercase text-muted-foreground">{b.tipoMacro}</span>}
                </div>
                <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                  {b.graus.map((g) => (
                    <div key={g.grau} className="concave-3d flex flex-col p-2.5">
                      <div className="mb-1.5 text-[10px] font-black uppercase tracking-widest text-primary">{g.grau} ({g.exames.length})</div>
                      <ul className="mb-2 flex-1 space-y-0.5">
                        {g.exames.map((ex, i) => <li key={i} className="text-xs text-muted-foreground">{ex.nomeExame}</li>)}
                      </ul>
                      <button type="button" disabled={emitindo} onClick={() => adicionarPainel(g)}
                        className="btn-3d-soft inline-flex w-full items-center justify-center gap-1 rounded px-2 py-1.5 text-xs font-semibold uppercase">
                        <Plus className="h-3.5 w-3.5" /> Adicionar painel
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {blocosFiltrados.length === 0 && <p className="px-3 py-6 text-sm text-muted-foreground">Nenhum bloco encontrado.</p>}
          </div>
        </>)}
      </div>

      {/* Carrinho + acoes */}
      <div className="space-y-3">
        <div className="concave-3d rounded-md p-3">
          <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
            Selecionados ({cartList.length})
          </p>
          {cartList.length === 0 ? (
            <p className="text-xs text-muted-foreground">Marque exames no catálogo ao lado.</p>
          ) : (
            <ul className="max-h-40 space-y-1 overflow-y-auto">
              {cartList.map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate">{i.nomeExame}</span>
                  <button
                    type="button"
                    onClick={() =>
                      setCart((prev) => {
                        const n = { ...prev };
                        delete n[i.id];
                        return n;
                      })
                    }
                    className="text-muted-foreground hover:text-destructive"
                    aria-label="Remover"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <ClinicalIdentityPanel identity={identity} />

        <textarea
          className="concave-3d min-h-[64px] w-full rounded-md bg-transparent px-3 py-2 text-sm"
          placeholder="Observação (opcional)…"
          value={observacao}
          onChange={(e) => setObservacao(e.target.value)}
        />

        <label className="concave-3d flex items-start gap-2 p-3 text-sm">
          <input type="checkbox" checked={individualDocuments} disabled={emitindo}
            onChange={event => setIndividualDocuments(event.target.checked)} />
          Gerar um documento por exame, todos na mesma ação.
        </label>
        <p className="text-xs text-muted-foreground">A emissão direta não envia mensagens. Pedidos submetidos para revisão também não habilitam envio externo.</p>

        {identity.data?.canRequestExams && (
          <ClinicalDemonstrationPanel
            clientId={clientId}
            kind="exames"
            canCreate={cartList.length > 0 && !identity.isFetching && !identity.isError}
            payload={{ kind: "exames", examItems: emissionItems(), observacao: observacao.trim() || undefined }}
          />
        )}
        {identity.data?.canRequestExams ? (
          <button
            type="button"
            onClick={() => void emitir()}
            disabled={cartList.length === 0 || emitindo || !identity.data || identity.isFetching || identity.isError}
            data-testid="button-emit-exam-requests"
            className="btn-3d-soft inline-flex h-11 w-full items-center justify-center gap-2 text-sm font-semibold uppercase tracking-wide disabled:opacity-60"
          >
            {emitindo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Emitir pedidos de exames
          </button>
        ) : identity.data?.canPrepareExamRequest ? (
          <button
            type="button"
            onClick={enviarParaRevisao}
            disabled={cartList.length === 0 || createApproval.isPending || identity.isFetching || identity.isError}
            data-testid="button-submit-exam-review"
            className="btn-3d inline-flex h-11 w-full items-center justify-center gap-2 text-sm font-bold uppercase tracking-wide disabled:opacity-60"
          >
            {createApproval.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            {createApproval.isPending ? "Enviando para revisão…" : "Enviar ao médico responsável"}
          </button>
        ) : null}

        {emitErro && (
          <div className="bevel-3d flex items-start gap-2 px-3 py-2 text-xs text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" /> {emitErro}
          </div>
        )}
        {emitResult && (
          <div className="bevel-3d space-y-1 px-3 py-2 text-xs">
            <p className="flex items-center gap-1.5 font-semibold text-emerald-700">
              <CheckCircle2 className="h-4 w-4" /> {emitResult.pdfs.length ? `${emitResult.pdfs.length} PDF(s) gerado(s)` : "Emissão confirmada"}
            </p>
            {emitResult.confirmed && emitResult.pdfs.length === 0 && <p>Emissão confirmada pelo servidor. Consulte o histórico de documentos.</p>}
            {emitResult.pdfs.map((p) => (
              <a
                key={p.id}
                href={p.url.startsWith("http") ? p.url : `${BASE}${p.url}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 underline"
              >
                <FileText className="h-3.5 w-3.5" /> {p.tipoLabel} ({p.examCount})
              </a>
            ))}
            {emitResult.email.attempted && (
              <p className={emitResult.email.success ? "text-emerald-700" : "text-amber-700"}>
                E-mail: {emitResult.email.success ? "enviado" : `falhou (${emitResult.email.error})`}
              </p>
            )}
            {emitResult.whatsapp.attempted && (
              <p className={emitResult.whatsapp.success ? "text-emerald-700" : "text-amber-700"}>
                WhatsApp: {emitResult.whatsapp.success ? "enviado" : `falhou (${emitResult.whatsapp.error})`}
              </p>
            )}
          </div>
        )}
      </div>
      <ExamDocumentHistoryPanel key={`${clientId}-${identity.data?.professional.id ?? "sem-sessao"}`}
        historyScope={scope}
        clientId={clientId}
        enabled={!!identity.data && !identity.isError && !identity.isFetching} />
      </fieldset>}
    </div>
  );
}
