import { useMemo, useRef, useState } from "react";
import { tituloProprio } from "@/lib/utils";
import {
  Search,
  Plus,
  X,
  Trash2,
  FileText,
  Layers,
  Clock,
  Building2,
  ShieldAlert,
  ShieldCheck,
  Send,
  ExternalLink,
  MessageSquare,
  AlertTriangle,
  Eye,
  FileSignature,
  Loader2,
  CheckCircle2,
  FolderPlus,
} from "lucide-react";
import {
  CATEGORIES,
  FORMULAS,
  VIAS,
  PERIODOS,
  parseBody,
  tomadaToText,
  getPrecoMedio,
  formatBRL,
  type Tomada,
  type FormulaSeed,
  PROTOCOLOS_SEED,
  type Protocolo,
  type SelectedFormula,
} from "../../prescricao/data";
import { useQuery } from "@tanstack/react-query";
import { useListPharmacies, usePreviewPrescription, useEmitPrescription, useCreateClinicalApproval, getListClinicalApprovalsQueryKey, getCountClinicalApprovalsQueryKey } from "@workspace/api-client-react";
import type { PrescriptionItemInput, RecipePlan, EmitResult } from "@workspace/api-client-react";
import { ANVISA_CONTROLLED_CLASSES, recipeTypeForControlledClass } from "@/lib/anvisa";
import { useToast } from "@/hooks/use-toast";
import { BASE } from "../../comunicacao/_shared";
import { useProtocolosSalvos } from "../../prescricao/useProtocolosSalvos";
import { PrescricoesEmitidas, PrescriptionPdfLink } from "../../prescricao/PrescricoesEmitidas";
import { useClinicalIdentity } from "@/hooks/use-clinical-identity";
import { ClinicalIdentityPanel } from "@/components/ClinicalIdentityPanel";
import { ClinicalDraftGate, ClinicalDraftNotice, type IdentityQuery } from "@/components/ClinicalDraft";
import { useClinicalDraft } from "@/hooks/use-clinical-draft";
import { emptyPrescriptionDraft, prescriptionDraftSchema } from "./clinical-draft-schemas";
import { getCollabToken } from "@/lib/collab-auth";
import { useQueryClient } from "@tanstack/react-query";

// ===========================================================================
// PAINEL: PRESCRICAO DE FORMULAS (client-scoped) — extraido de prescricao/index.tsx.
// Reaproveita os MESMOS hooks/motores da tela original:
//   GET  /api/clients/:id                (prefil do paciente)
//   GET  /api/prescription-formulas      (catalogo do banco)
//   useListPharmacies                    (farmacias)
//   usePreviewPrescription               (previa do desmembramento)
//   useEmitPrescription                  (emissao -> PDFs + sncrAlerts)
// NAO altera o motor de desmembramento nem os contratos de API.
// ===========================================================================

const GOLD = "#c2a05a";
const SAFE_CLINICAL_ERROR =
  "Falha interna ao salvar. O rascunho foi preservado; confira o histórico antes de tentar novamente.";

function safeClinicalErrorMessage(error: unknown): string {
  const raw = error instanceof Error
    ? error.message
    : typeof error === "string"
      ? error
      : error && typeof error === "object" && "message" in error
        ? String((error as { message: unknown }).message)
        : "";
  const jsonStart = raw.indexOf("{");
  const jsonEnd = raw.lastIndexOf("}");
  if (jsonStart >= 0 && jsonEnd > jsonStart) {
    try {
      const payload = JSON.parse(raw.slice(jsonStart, jsonEnd + 1)) as { error?: unknown };
      if (typeof payload.error === "string" && payload.error.trim()) {
        const message = payload.error.trim();
        if (!/<!doctype|<html|failed query|insert into|select\s.+\sfrom|stack trace/i.test(message)) {
          return message.slice(0, 300);
        }
      }
    } catch {
      // A resposta não é JSON confiável; abaixo mostramos somente uma mensagem genérica.
    }
  }
  if (/HTTP\s+5\d\d\b|<!doctype|<html|failed query|insert into|select\s.+\sfrom|stack trace/i.test(raw)) {
    return SAFE_CLINICAL_ERROR;
  }
  return raw.trim().slice(0, 300) || SAFE_CLINICAL_ERROR;
}

const INTERNAL_COLORS: { value: string; label: string; hex: string }[] = [
  { value: "", label: "— sem cor —", hex: "" },
  { value: "Azul", label: "Azul", hex: "#2563eb" },
  { value: "Verde", label: "Verde", hex: "#16a34a" },
  { value: "Amarelo", label: "Amarelo", hex: "#ca8a04" },
  { value: "Vermelho", label: "Vermelho", hex: "#dc2626" },
  { value: "Laranja", label: "Laranja", hex: "#ea580c" },
  { value: "Roxo", label: "Roxo", hex: "#7c3aed" },
];

type RouteState = { pharmacyId: number | null; isControlled: boolean; anvisaType: string; internalColor: string };
const EMPTY_ROUTE: RouteState = { pharmacyId: null, isControlled: false, anvisaType: "", internalColor: "" };

interface ClientData {
  name: string;
  cpf: string | null;
  phone: string | null;
  email: string | null;
  birthDate: string | null;
}

export default function PrescricaoFormulasPanel({ clientId }: { clientId: number }) {
  const identity = useClinicalIdentity(clientId);
  return <ClinicalDraftGate identity={identity} clientId={clientId} kind="prescription">
    {scope => <PrescriptionEditor key={scope} scope={scope} clientId={clientId} identity={identity} />}
  </ClinicalDraftGate>;
}

function PrescriptionEditor({ clientId, identity, scope }: { clientId: number; identity: IdentityQuery; scope: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const draft = useClinicalDraft(scope, prescriptionDraftSchema, emptyPrescriptionDraft);
  const { duracao, cid, selected, defaultPharmacyId, routing } = draft.value;
  const setDuracao = draft.field("duracao");
  const setCid = draft.field("cid");
  const setSelected = draft.field("selected");
  const setDefaultPharmacyId = draft.field("defaultPharmacyId");
  const setRouting = draft.field("routing");

  const [activeCategory, setActiveCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [leftTab, setLeftTab] = useState<"cat" | "proto">("cat");

  const [previewPlans, setPreviewPlans] = useState<RecipePlan[] | null>(null);
  const [emitResult, setEmitResult] = useState<EmitResult | null>(null);
  // ── Motor Único (emite PDF com o modelo ativo do banco) ───────────────────
  const [emitirMotorUnicoLoading, setEmitirMotorUnicoLoading] = useState(false);
  // ── PDF Visual (Puppeteer server-side — fiel ao template HTML) ────────────
  const [gerarPdfVisualLoading, setGerarPdfVisualLoading] = useState(false);
  const [approvalQueued, setApprovalQueued] = useState(false);
  const requestKeyRef = useRef<{ fingerprint: string; key: string } | null>(null);
  const createApproval = useCreateClinicalApproval({ request: { headers: { Authorization: `Bearer ${getCollabToken() ?? ""}` } } });

  const { data: pharmacies } = useListPharmacies();

  // Prefil do paciente pelo cliente do topo.
  const {
    data: client,
    isLoading: clientLoading,
    isError: clientError,
    refetch: refetchClient,
  } = { data: identity.data?.client, isLoading: identity.isPending,
    isError: identity.isError, refetch: identity.refetch };

  const {
    data: dbFormulas,
    isLoading: formulasLoading,
    isError: formulasError,
    refetch: refetchFormulas,
  } = useQuery<FormulaSeed[]>({
    queryKey: ["prescription-formulas"],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/prescription-formulas`);
      if (!r.ok) throw new Error("Falha ao carregar formulas do banco");
      return r.json();
    },
  });

  const previewMutation = usePreviewPrescription({
    mutation: {
      onSuccess: (res) => { if (draft.isCurrent()) setPreviewPlans(res); },
      onError: () => { if (draft.isCurrent()) toast({ title: "Erro ao gerar prévia do desmembramento", variant: "destructive" }); },
    },
  });
  const emitMutation = useEmitPrescription({
    request: { headers: { Authorization: `Bearer ${getCollabToken() ?? ""}` } },
    mutation: {
      onSuccess: (res) => {
        if (!draft.isCurrent()) return;
        if (!Array.isArray(res.recipes) || !res.recipes.length) {
          toast({ title: "Emissão sem documentos confirmados — rascunho preservado", variant: "destructive" });
          return;
        }
        setEmitResult(res);
        toast({
          title: res.signatureStatus === "unsigned_expired"
            ? `Prescrição gerada sem assinatura (${res.recipes.length})`
            : `Receitas assinadas (${res.recipes.length})`,
          description: res.signatureStatus === "unsigned_expired"
            ? "O documento não foi enviado e exige assinatura manual antes de uso clínico."
            : "Confira os documentos no histórico.",
        });
      },
      onError: (error) => { if (draft.isCurrent()) toast({ title: "Erro ao emitir receitas — rascunho preservado", description: safeClinicalErrorMessage(error), variant: "destructive" }); },
    },
  });

  const getRoute = (id: string): RouteState => routing[id] || EMPTY_ROUTE;
  const setRoute = (id: string, patch: Partial<RouteState>) => {
    setRouting((prev) => ({ ...prev, [id]: { ...(prev[id] || EMPTY_ROUTE), ...patch } }));
    setPreviewPlans(null);
    setEmitResult(null);
  };
  const changeDefaultPharmacy = (id: number | null) => {
    setDefaultPharmacyId(id);
    setPreviewPlans(null);
    setEmitResult(null);
  };

  const pharmaciesForType = (anvisaType: string) =>
    (pharmacies ?? []).filter((p) => !anvisaType || (p.controlledTypes ?? []).includes(anvisaType));

  const sncrFlags = useMemo(() => {
    const m = new Map<string, string>();
    (emitResult?.sncrAlerts ?? []).forEach((a) => m.set(a.controlledType, a.status));
    return m;
  }, [emitResult]);

  const allFormulas = useMemo(() => {
    const ids = new Set(FORMULAS.map((f) => f.id));
    const extras = (dbFormulas ?? []).filter((f) => !ids.has(f.id));
    return [...FORMULAS, ...extras];
  }, [dbFormulas]);

  const stats = useMemo(() => {
    const s: Record<string, number> = { all: allFormulas.length };
    allFormulas.forEach((f) => {
      s[f.cat] = (s[f.cat] || 0) + 1;
    });
    return s;
  }, [allFormulas]);

  const filtered = useMemo(
    () =>
      allFormulas.filter((f) => {
        const mc = activeCategory === "all" || f.cat === activeCategory;
        const ms =
          !search ||
          f.name.toLowerCase().includes(search.toLowerCase()) ||
          f.body.toLowerCase().includes(search.toLowerCase());
        return mc && ms;
      }),
    [activeCategory, search, allFormulas],
  );

  const addFormula = (f: FormulaSeed) => {
    setSelected((prev) => {
      if (prev.find((s) => s.id === f.id)) return prev;
      const { ativos, tomadas } = parseBody(f.body);
      return [...prev, { id: f.id, cat: f.cat, name: f.name, ativos, tomadas, preco: getPrecoMedio(f) }];
    });
    setPreviewPlans(null);
    setEmitResult(null);
  };
  // Protocolos: conjunto de fórmulas adicionado de uma vez (mesmo comportamento da tela Prescrição).
  const { salvos: protocolosSalvos, salvar: salvarProtocolo, remover: removerProtocolo } = useProtocolosSalvos();
  const allProtocolos: Protocolo[] = [...PROTOCOLOS_SEED, ...protocolosSalvos];
  const addProtocolo = (p: Protocolo) => {
    setSelected((prev) => {
      const next = [...prev];
      for (const id of p.formulaIds) {
        const f = allFormulas.find((x) => x.id === id);
        if (!f || next.find((s) => s.id === f.id)) continue;
        const { ativos, tomadas } = parseBody(f.body);
        next.push({ id: f.id, cat: f.cat, name: f.name, ativos, tomadas, preco: getPrecoMedio(f) });
      }
      return next;
    });
    setPreviewPlans(null);
    setEmitResult(null);
  };
  // Prescrição Modelo: só preenche o rascunho com fórmulas JÁ existentes no catálogo
  // (posologia do próprio catálogo). Não emite, não assina, não envia.
  const PRESCRICAO_MODELO_IDS = [
    "lugol-5", "t3-10mcg", "t4-30mcg", "blend-tireoide-cafe", "ki-gotas", "ki-selenio-caps",
    "mio-inositol-500", "cabergolina-blend", "tamoxifeno-15", "raloxifeno-60", "silimarina-leve",
  ];
  const addPrescricaoModelo = () => {
    setSelected((prev) => {
      const next = [...prev];
      for (const id of PRESCRICAO_MODELO_IDS) {
        const f = allFormulas.find((x) => x.id === id);
        if (!f || next.find((s) => s.id === f.id)) continue;
        const { ativos, tomadas } = parseBody(f.body);
        next.push({ id: f.id, cat: f.cat, name: f.name, ativos, tomadas, preco: getPrecoMedio(f) });
      }
      return next;
    });
    setPreviewPlans(null);
    setEmitResult(null);
  };
  const removeFormula = (id: string) => {
    setSelected((prev) => prev.filter((s) => s.id !== id));
    setPreviewPlans(null);
    setEmitResult(null);
  };
  const updateAtivos = (id: string, val: string) =>
    setSelected((prev) => prev.map((s) => (s.id === id ? { ...s, ativos: val } : s)));
  const updateTomada = (id: string, ti: number, field: keyof Tomada, val: string) =>
    setSelected((prev) =>
      prev.map((s) => {
        if (s.id !== id) return s;
        const tomadas = s.tomadas.map((t, i) =>
          i === ti ? { ...t, [field]: field === "doses" ? Number(val) : val, raw: undefined } : t,
        );
        return { ...s, tomadas };
      }),
    );
  const addTomada = (id: string) =>
    setSelected((prev) =>
      prev.map((s) => (s.id === id ? { ...s, tomadas: [...s.tomadas, { doses: 1, via: "VO", periodo: "", hora: "" }] } : s)),
    );
  const removeTomada = (id: string, ti: number) =>
    setSelected((prev) => prev.map((s) => (s.id === id ? { ...s, tomadas: s.tomadas.filter((_, i) => i !== ti) } : s)));

  const buildItems = (): PrescriptionItemInput[] =>
    selected.map((f) => {
      const r = getRoute(f.id);
      const vias = [...new Set(f.tomadas.map((t) => t.via).filter(Boolean))].join(", ");
      const periodos = f.tomadas.map((t) => t.periodo).filter(Boolean).join("; ");
      const doses = f.tomadas
        .map((t) => `${t.doses}${t.hora ? ` (${t.hora})` : ""}`)
        .filter(Boolean)
        .join("; ");
      return {
        name: f.name,
        ativos: f.ativos,
        posologia: f.tomadas.map(tomadaToText).join("; "),
        dose: doses || null,
        via: vias || null,
        periodo: periodos || null,
        category: f.cat,
        internalColor: r.internalColor || null,
        isControlled: r.isControlled,
        anvisaType: r.isControlled ? r.anvisaType || null : null,
        pharmacyId: r.pharmacyId ?? defaultPharmacyId ?? null,
      };
    });

  const buildLegacyFormulaPayload = () =>
    selected.map((formula) => ({
      nome: formula.name,
      ativos: formula.ativos,
      posologia: formula.tomadas.map(tomadaToText).join("; ") || undefined,
      via: [...new Set(formula.tomadas.map((tomada) => tomada.via).filter(Boolean))].join(", ") || "VO",
    }));

  const validateRouting = (requirePharmacy: boolean): string | null => {
    for (const f of selected) {
      const r = getRoute(f.id);
      if (r.isControlled && !r.anvisaType) return `Selecione o tipo Anvisa do controlado em "${f.name}".`;
      const pid = r.pharmacyId ?? defaultPharmacyId ?? null;
      if (requirePharmacy && !pid)
        return "Selecione a farmácia de cada fórmula (ou defina a farmácia padrão).";
      if (r.isControlled && r.anvisaType && pid) {
        const ph = (pharmacies ?? []).find((p) => p.id === pid);
        if (ph && !(ph.controlledTypes ?? []).includes(r.anvisaType))
          return `A farmácia "${ph.name}" não atende o controlado ${r.anvisaType} (fórmula "${f.name}").`;
      }
    }
    return null;
  };

  const handleEmitirMotorUnico = async () => {
    setEmitirMotorUnicoLoading(true);
    try {
      const r = await fetch(`${BASE}/api/receituario/emitir-prescricao`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("collab_token") ?? ""}` },
        body: JSON.stringify({
          clientId,
          formulas: buildLegacyFormulaPayload(),
          tipoReceita: "especial",
        }),
      });
      const d = await r.json() as { ok?: boolean; driveUrl?: string };
      if (d.ok) {
        alert(`Receituário emitido com sucesso!${d.driveUrl ? " Salvo no Drive." : ""}`);
      } else {
        alert("Erro ao emitir receituário. Verifique os logs.");
      }
    } catch (e) {
      alert(`Erro de conexão: ${String(e)}`);
    } finally {
      setEmitirMotorUnicoLoading(false);
    }
  };

  const handleGerarPdfVisual = async () => {
    setGerarPdfVisualLoading(true);
    try {
      const r = await fetch(`${BASE}/api/receituario/emitir-cliente`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("collab_token") ?? ""}` },
        body: JSON.stringify({
          clientId,
          formulas: buildLegacyFormulaPayload(),
          tipoReceita: "especial",
        }),
      });
      const d = await r.json() as { ok?: boolean; driveUrl?: string };
      if (d.ok) {
        alert(`PDF Visual gerado!${d.driveUrl ? " Salvo no Drive." : ""}`);
      } else {
        alert("Erro ao gerar PDF Visual. Verifique os logs.");
      }
    } catch (e) {
      alert(`Erro de conexão: ${String(e)}`);
    } finally {
      setGerarPdfVisualLoading(false);
    }
  };

  const handlePreview = () => {
    setEmitResult(null);
    const err = validateRouting(false);
    if (err) {
      toast({ title: err, variant: "destructive" });
      return;
    }
    previewMutation.mutate({ data: { items: buildItems() } });
  };

  const handleEmit = (signatureMode: "signed" | "unsigned_expired" = "signed") => {
    if (draft.pending || emitMutation.isPending) return;
    if (!identity.data?.canPrescribe || identity.isFetching || identity.isError) {
      toast({ title: "Identidade clínica pendente", description: identity.data?.issue ?? identity.error?.message, variant: "destructive" });
      return;
    }
    if (!client?.name?.trim()) {
      toast({ title: "Cliente sem nome — não é possível emitir", variant: "destructive" });
      return;
    }
    const err = validateRouting(true);
    if (err) {
      toast({ title: err, variant: "destructive" });
      return;
    }
    const snapshot = draft.value;
    emitMutation.mutate({
      data: {
        signatureMode,
        clientId,
        clientName: client.name.trim(),
        clientCpf: client.cpf || null,
        clientPhone: client.phone || null,
        clientEmail: client.email || null,
        professionalId: identity.data.professional.id,
        durationDays: duracao || null,
        cid: cid || null,
        items: buildItems(),
      },
    }, { onSuccess: res => {
      if (Array.isArray(res.recipes) && res.recipes.length) draft.complete(snapshot);
    } });
  };

  const handleSubmitForReview = () => {
    if (draft.pending || createApproval.isPending || !identity.data?.canPreparePrescription || !draft.isCurrent()) return;
    const payload = { durationDays: duracao || null, cid: cid || null, items: buildItems() };
    if (!payload.items.length) {
      toast({ title: "Inclua ao menos uma fórmula antes de enviar para revisão.", variant: "destructive" });
      return;
    }
    const fingerprint = JSON.stringify(payload);
    if (!requestKeyRef.current || requestKeyRef.current.fingerprint !== fingerprint) {
      requestKeyRef.current = { fingerprint, key: `rx:${crypto.randomUUID()}` };
    }
    const snapshot = draft.value;
    createApproval.mutate({ data: {
      requestKey: requestKeyRef.current.key,
      kind: "prescricao",
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
        toast({ title: "Prescrição enviada para conferência", description: "O médico responsável revisará e emitirá sob a própria identidade." });
      },
      onError: error => toast({ title: "Não foi possível enviar para conferência", description: `${safeClinicalErrorMessage(error)} — o rascunho foi preservado.`, variant: "destructive" }),
    });
  };

  const idade = client?.birthDate
    ? Math.floor((Date.now() - new Date(client.birthDate).getTime()) / 31557600000)
    : 0;
  const totalInterno = useMemo(() => selected.reduce((sum, s) => sum + (s.preco || 0), 0), [selected]);

  const inputCls =
    "concave-3d rounded-md bg-transparent px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-[#c2a05a]/40";

  // ---- Estados de carregamento / erro do cliente + catálogo ----
  if (clientLoading || formulasLoading) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando prescrição…
      </div>
    );
  }
  if (clientError) {
    return (
      <div className="bevel-3d flex items-center justify-between gap-2 px-3 py-3 text-sm text-destructive">
        <span className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" /> {identity.error?.message ?? "Não foi possível validar a identidade clínica."}
        </span>
        <button
          type="button"
          onClick={() => void refetchClient()}
          className="btn-3d-soft rounded px-2 py-1 text-xs font-semibold uppercase"
        >
          Tentar novamente
        </button>
      </div>
    );
  }
  if (formulasError) {
    return (
      <div className="bevel-3d flex items-center justify-between gap-2 px-3 py-3 text-sm text-destructive">
        <span className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" /> Falha ao carregar o catálogo de fórmulas.
        </span>
        <button
          type="button"
          onClick={() => void refetchFormulas()}
          className="btn-3d-soft rounded px-2 py-1 text-xs font-semibold uppercase"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  return (
    <div className="cockpit-prescricao-visual space-y-4">
      <fieldset disabled={emitMutation.isPending || previewMutation.isPending || createApproval.isPending} className="min-w-0">
        <ClinicalDraftNotice draft={draft} identity={identity} />
      </fieldset>
      {approvalQueued && <p role="status" className="bevel-3d px-3 py-2 text-sm text-emerald-800">Solicitação registrada para revisão do médico responsável. Nenhuma mensagem foi enviada.</p>}
      {emitMutation.isError && <p role="alert" className="text-sm text-destructive">Falha ao emitir: {safeClinicalErrorMessage(emitMutation.error)}</p>}
      {!draft.pending && <fieldset disabled={emitMutation.isPending || previewMutation.isPending || createApproval.isPending} className="min-w-0 space-y-4">
      <ClinicalIdentityPanel
        identity={identity}
        allowUnsignedPrescription
        canGenerateUnsigned={buildItems().length > 0 && !draft.pending}
        unsignedGenerationPending={emitMutation.isPending}
        onGenerateUnsigned={() => handleEmit("unsigned_expired")}
      />
      {/* Cabeçalho do paciente (prefil) + duração/CID */}
      <div className="screen-3d rounded-md p-3">
        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Paciente</p>
        <div className="mt-1 text-lg font-semibold text-foreground">{client?.name ? tituloProprio(client.name) : ""}</div>
        <div className="text-xs text-muted-foreground">
          {[client?.cpf ? `CPF ${client.cpf}` : null, idade ? `${idade} anos` : null, client?.phone, client?.email]
            .filter(Boolean)
            .join(" · ") || "sem dados de contato"}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <div className="concave-3d flex items-center gap-2 rounded-md px-3 py-1.5">
            <label className="whitespace-nowrap text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              Duração:
            </label>
            <input
              type="number"
              className={`w-20 ${inputCls}`}
              value={duracao}
              onChange={(e) => setDuracao(e.target.value)}
            />
            <span className="text-xs text-muted-foreground">dias</span>
          </div>
          <input
            className={`min-w-[220px] flex-1 ${inputCls}`}
            placeholder="CID (ex: N484 + E291 + F90)"
            value={cid}
            onChange={(e) => setCid(e.target.value)}
          />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={addPrescricaoModelo}
            data-testid="button-prescricao-modelo"
            className="btn-3d-soft flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold"
            style={{ color: GOLD }}
          >
            <FileText className="h-4 w-4" />
            Prescrição Modelo
          </button>
          <span className="text-xs text-muted-foreground">
            Preenche o rascunho com fórmulas do catálogo. Não emite nem envia: confira e clique em "Emitir receitas".
          </span>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_420px]">
        {/* Catálogo e Protocolos — mesmo visual da tela Prescrição (menu) */}
        <section className="panel-3d min-w-0 space-y-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="bevel-3d inline-flex items-center gap-2 px-3 py-1.5 text-sm font-bold uppercase tracking-widest text-primary">
              <FileText className="h-4 w-4" /> Catálogo e Protocolos
            </h3>
            <span className="shrink-0 font-mono text-xs text-muted-foreground">
              {leftTab === "cat" ? `${filtered.length} disponíveis` : `${allProtocolos.length} protocolos`}
            </span>
          </div>
          <div className="concave-3d grid max-w-md grid-cols-2 gap-1 p-1">
            <button
              onClick={() => setLeftTab("cat")}
              className={`flex items-center justify-center gap-1.5 rounded-md py-2 text-sm font-semibold transition ${leftTab === "cat" ? "btn-3d-soft" : "text-muted-foreground"}`}
            >
              <FileText className="h-4 w-4" /> Categorias
            </button>
            <button
              onClick={() => setLeftTab("proto")}
              className={`flex items-center justify-center gap-1.5 rounded-md py-2 text-sm font-semibold transition ${leftTab === "proto" ? "btn-3d-soft" : "text-muted-foreground"}`}
            >
              <Layers className="h-4 w-4" /> Protocolos
            </button>
          </div>
          {leftTab === "cat" ? (
            <>
              <div className="relative max-w-md">
                <Search className="absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  className={`w-full pl-9 ${inputCls}`}
                  placeholder="Buscar fórmula…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setActiveCategory("all")}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition ${activeCategory === "all" ? "btn-3d" : "btn-3d-soft"}`}
                >
                  <FileText className="h-3.5 w-3.5" /> Todas <span className="font-mono opacity-70">{stats.all}</span>
                </button>
                {CATEGORIES.map((c) => {
                  const Icon = c.icon;
                  const n = stats[c.id] || 0;
                  if (!n) return null;
                  const active = activeCategory === c.id;
                  return (
                    <button
                      key={c.id}
                      onClick={() => setActiveCategory(c.id)}
                      className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition ${active ? "btn-3d" : "btn-3d-soft"}`}
                    >
                      <Icon className="h-3.5 w-3.5 shrink-0" />
                      <span className="max-w-[150px] truncate">{c.label}</span>
                      <span className="font-mono opacity-70">{n}</span>
                    </button>
                  );
                })}
              </div>
              <div className="grid max-h-[560px] grid-cols-1 gap-3 overflow-y-auto pr-1 2xl:grid-cols-2">
                {filtered.map((f) => {
                  const cat = CATEGORIES.find((c) => c.id === f.cat);
                  const isSel = !!selected.find((s) => s.id === f.id);
                  return (
                    <div key={f.id} className={`panel-3d-sub flex flex-col p-3 ${isSel ? "panel-3d-active" : ""}`}>
                      <div className="min-w-0 flex-1">
                        {cat && (
                          <span className="rounded-sm bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                            {cat.label}
                          </span>
                        )}
                        <h4 className="mt-1 text-sm font-semibold text-foreground">{f.name}</h4>
                        <p className="mt-1 line-clamp-2 font-mono text-[11px] text-muted-foreground">
                          {f.body.split("\n").slice(0, 2).join(" • ")}
                        </p>
                        <span
                          className="mt-1.5 inline-flex items-center gap-1 rounded-sm border border-amber-200 bg-amber-50 px-1.5 py-0.5 font-mono text-[10px] font-bold text-amber-700"
                          title="Valor médio de mercado — uso interno, não aparece para o cliente"
                        >
                          ≈ {formatBRL(getPrecoMedio(f))} <span className="font-sans tracking-wide">INTERNO</span>
                        </span>
                      </div>
                      <button
                        onClick={() => (isSel ? removeFormula(f.id) : addFormula(f))}
                        className={`mt-2.5 flex w-full items-center justify-center gap-1 rounded-md px-3 py-2 text-xs font-semibold ${isSel ? "btn-3d-soft" : "btn-3d"}`}
                      >
                        {isSel ? (
                          <>
                            <CheckCircle2 className="h-4 w-4" /> Incluída
                          </>
                        ) : (
                          <>
                            <Plus className="h-4 w-4" /> Adicionar
                          </>
                        )}
                      </button>
                    </div>
                  );
                })}
                {filtered.length === 0 && (
                  <p className="col-span-full py-8 text-center text-sm text-muted-foreground">Nenhuma fórmula encontrada.</p>
                )}
              </div>
            </>
          ) : (
            <div className="grid max-h-[560px] grid-cols-1 gap-3 overflow-y-auto pr-1">
              <p className="px-1 text-xs text-muted-foreground">Clique para adicionar o conjunto inteiro à receita.</p>
              {allProtocolos.map((p) => (
                <div key={p.id} className="panel-3d-sub p-3">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                      <Layers className="h-4 w-4 text-primary" /> {p.nome}
                    </h4>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {p.id.startsWith("db-") && (
                        <button
                          onClick={() => void removerProtocolo(p.id)}
                          title="Remover da minha lista"
                          className="p-1 text-destructive hover:opacity-80"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                      <button
                        onClick={() => addProtocolo(p)}
                        className="btn-3d flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-semibold"
                      >
                        <Plus className="h-3.5 w-3.5" /> Adicionar
                      </button>
                    </div>
                  </div>
                  <p className="mt-1.5 text-[11px] text-muted-foreground">
                    {p.formulaIds
                      .map((id) => allFormulas.find((f) => f.id === id)?.name)
                      .filter(Boolean)
                      .join(" • ")}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Receita selecionada + roteamento + emissão */}
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <h3 className="mr-auto flex items-center gap-2 text-sm font-bold uppercase tracking-widest" style={{ color: GOLD }}>
              <FileSignature className="h-4 w-4" /> Receita ({selected.length})
            </h3>
            {selected.length > 0 && (
              <button
                onClick={() => void salvarProtocolo(selected.map((s) => s.id))}
                className="flex items-center gap-1 text-xs font-semibold text-primary hover:opacity-80"
              >
                <FolderPlus className="h-4 w-4" /> Salvar protocolo
              </button>
            )}
            {selected.length > 0 && (
              <button
                onClick={() => {
                  if (draft.discard()) {
                    setPreviewPlans(null);
                    setEmitResult(null);
                  }
                }}
                className="flex items-center gap-1 text-xs font-semibold text-destructive hover:opacity-80"
              >
                <Trash2 className="h-3.5 w-3.5" /> Descartar rascunho
              </button>
            )}
          </div>

          {selected.length === 0 ? (
            <div className="concave-3d flex items-center justify-center rounded-md py-10 text-center text-sm text-muted-foreground">
              Adicione fórmulas do catálogo ao lado.
            </div>
          ) : (
            <div className="max-h-[360px] space-y-2 overflow-y-auto pr-1">
              {selected.map((f, idx) => (
                <div key={f.id} className="panel-3d-sub overflow-hidden rounded-md">
                  <div className="concave-3d flex items-center justify-between gap-2 px-3 py-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="font-mono text-xs font-bold text-muted-foreground">#{idx + 1}</span>
                      <span className="truncate text-sm font-semibold text-foreground">{f.name}</span>
                    </div>
                    <button onClick={() => removeFormula(f.id)} className="text-destructive hover:opacity-80">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="space-y-3 p-3">
                    <div>
                      <label className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                        Ativos (edite mg / adicione / retire)
                      </label>
                      <textarea
                        value={f.ativos}
                        onChange={(e) => updateAtivos(f.id, e.target.value)}
                        className={`mt-1 w-full resize-y font-mono text-xs ${inputCls}`}
                        rows={Math.min(f.ativos.split("\n").length + 1, 12)}
                      />
                    </div>
                    <div>
                      <div className="mb-1 flex items-center justify-between">
                        <label className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                          <Clock className="h-3.5 w-3.5" />
                          Tomadas
                        </label>
                        <button
                          onClick={() => addTomada(f.id)}
                          className="flex items-center gap-1 text-xs font-semibold"
                          style={{ color: GOLD }}
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Tomada
                        </button>
                      </div>
                      <div className="space-y-2">
                        {f.tomadas.map((t, ti) => (
                          <div key={ti} className="concave-3d grid grid-cols-12 items-center gap-1.5 rounded-md p-2">
                            <select
                              value={t.doses}
                              onChange={(e) => updateTomada(f.id, ti, "doses", e.target.value)}
                              className={`col-span-2 text-center font-mono !px-1 !py-2 ${inputCls}`}
                            >
                              {[1, 2, 3, 4, 5, 6].map((n) => (
                                <option key={n} value={n} className="bg-background text-foreground">
                                  {n}
                                </option>
                              ))}
                            </select>
                            <select
                              value={t.via || "VO"}
                              onChange={(e) => updateTomada(f.id, ti, "via", e.target.value)}
                              className={`col-span-2 !px-1 !py-2 ${inputCls}`}
                            >
                              {VIAS.map((v) => (
                                <option key={v} value={v} className="bg-background text-foreground">
                                  {v}
                                </option>
                              ))}
                            </select>
                            <input
                              list="cockpit-periodos-list"
                              value={t.periodo}
                              onChange={(e) => updateTomada(f.id, ti, "periodo", e.target.value)}
                              placeholder="Período…"
                              className={`col-span-5 !px-2 !py-2 ${inputCls}`}
                            />
                            <input
                              value={t.hora}
                              onChange={(e) => updateTomada(f.id, ti, "hora", e.target.value)}
                              placeholder="14h"
                              className={`col-span-2 text-center font-mono !px-1 !py-2 ${inputCls}`}
                            />
                            <button
                              onClick={() => removeTomada(f.id, ti)}
                              className="col-span-1 flex justify-center text-destructive hover:opacity-80"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          <datalist id="cockpit-periodos-list">
            {PERIODOS.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>

          {selected.length > 0 && (
            <div className="concave-3d flex items-center justify-between gap-2 rounded-md px-3 py-2">
              <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                Total estimado — uso interno
              </span>
              <span className="font-mono text-base font-bold" style={{ color: GOLD }}>
                {formatBRL(totalInterno)}
              </span>
            </div>
          )}

          {/* Roteamento para farmácias + emissão */}
          {selected.length > 0 && (
            <div className="space-y-3">
              <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest" style={{ color: GOLD }}>
                <Building2 className="h-4 w-4" /> Roteamento e Emissão
              </h3>

              {!pharmacies?.length ? (
                <div className="bevel-3d flex items-center gap-2 rounded-md px-3 py-2 text-xs text-amber-700">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  Nenhuma farmácia cadastrada. Cadastre em Farmácias antes de emitir.
                </div>
              ) : (
                <>
                  <div className="concave-3d flex flex-wrap items-center gap-2 rounded-md px-3 py-2">
                    <label className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                      <Building2 className="h-3.5 w-3.5" />
                      Farmácia padrão:
                    </label>
                    <select
                      className="concave-3d rounded-md bg-transparent px-3 py-1.5 text-sm text-foreground"
                      value={defaultPharmacyId ?? ""}
                      onChange={(e) => changeDefaultPharmacy(e.target.value ? Number(e.target.value) : null)}
                    >
                      <option value="" className="bg-background text-foreground">
                        — selecione —
                      </option>
                      {pharmacies.map((p) => (
                        <option key={p.id} value={p.id} className="bg-background text-foreground">
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    {selected.map((f, idx) => {
                      const r = getRoute(f.id);
                      const recipe = r.isControlled ? recipeTypeForControlledClass(r.anvisaType) : null;
                      const sncrFlag = r.isControlled && r.anvisaType ? sncrFlags.get(r.anvisaType) : undefined;
                      return (
                        <div key={f.id} className="panel-3d-sub rounded-md p-3">
                          <div className="mb-2 flex items-center gap-2">
                            <span className="font-mono text-xs font-bold text-muted-foreground">#{idx + 1}</span>
                            <span className="truncate text-sm font-semibold text-foreground">{f.name}</span>
                            {sncrFlag && (
                              <span className="ml-auto flex shrink-0 items-center gap-1 rounded-sm border border-amber-400/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
                                <AlertTriangle className="h-3 w-3" />
                                {sncrFlag === "low" ? "SNCR ACABANDO" : sncrFlag === "exhausted" ? "SNCR ESGOTADO" : "SEM INTERVALO SNCR"}
                              </span>
                            )}
                          </div>
                          <div className="grid grid-cols-1 items-center gap-2 md:grid-cols-12">
                            <div className="md:col-span-5">
                              <select
                                className="concave-3d w-full rounded-md bg-transparent px-2 py-2 text-xs text-foreground"
                                value={r.pharmacyId ?? ""}
                                onChange={(e) => setRoute(f.id, { pharmacyId: e.target.value ? Number(e.target.value) : null })}
                              >
                                <option value="" className="bg-background text-foreground">
                                  Usar farmácia padrão
                                </option>
                                {(r.isControlled && r.anvisaType ? pharmaciesForType(r.anvisaType) : pharmacies).map((p) => (
                                  <option key={p.id} value={p.id} className="bg-background text-foreground">
                                    {p.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <label className="flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-foreground md:col-span-3">
                              <input
                                type="checkbox"
                                checked={r.isControlled}
                                onChange={(e) => setRoute(f.id, { isControlled: e.target.checked })}
                                className="h-4 w-4 accent-amber-500"
                              />
                              <ShieldAlert className="h-3.5 w-3.5 text-amber-700" />
                              Controlado
                            </label>
                            {r.isControlled && (
                              <div className="flex items-center gap-2 md:col-span-4">
                                <select
                                  className="field-engraved w-full rounded-md border border-amber-400/40 bg-transparent px-2 py-2 text-xs text-foreground"
                                  value={r.anvisaType}
                                  onChange={(e) => setRoute(f.id, { anvisaType: e.target.value })}
                                >
                                  <option value="" className="bg-background text-foreground">
                                    Tipo Anvisa…
                                  </option>
                                  {ANVISA_CONTROLLED_CLASSES.map((c) => (
                                    <option key={c.value} value={c.value} className="bg-background text-foreground">
                                      {c.label}
                                    </option>
                                  ))}
                                </select>
                                {recipe && (
                                  <span
                                    className="shrink-0 rounded-sm border px-1.5 py-1 text-[10px] font-bold"
                                    style={{ background: recipe.color, color: "#0f172a", borderColor: "#cbd5e1" }}
                                  >
                                    {recipe.colorName}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-dashed border-border pt-2">
                            <label className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                              <Layers className="h-3 w-3" />
                              Cor interna
                            </label>
                            <select
                              className="concave-3d rounded-md bg-transparent px-2 py-1.5 text-xs text-foreground"
                              value={r.internalColor}
                              onChange={(e) => setRoute(f.id, { internalColor: e.target.value })}
                            >
                              {INTERNAL_COLORS.map((c) => (
                                <option key={c.value} value={c.value} className="bg-background text-foreground">
                                  {c.label}
                                </option>
                              ))}
                            </select>
                            {r.internalColor && (
                              <span
                                className="h-3.5 w-3.5 shrink-0 rounded-[2px] border border-input"
                                style={{ background: INTERNAL_COLORS.find((c) => c.value === r.internalColor)?.hex }}
                              />
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={handlePreview}
                      disabled={previewMutation.isPending}
                      className="btn-3d-soft flex items-center gap-2 rounded-md px-4 py-2.5 text-sm font-semibold disabled:opacity-40"
                      style={{ color: GOLD }}
                    >
                      {previewMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
                      {previewMutation.isPending ? "Gerando…" : "Prévia do desmembramento"}
                    </button>
                    {identity.data?.canPrescribe ? (
                      <button
                        onClick={() => handleEmit()}
                        disabled={emitMutation.isPending || identity.isFetching || identity.isError}
                        data-testid="button-emit-prescriptions"
                        className="btn-3d-soft flex items-center gap-2 rounded-md px-4 py-2.5 text-sm font-semibold disabled:opacity-40"
                        style={{ color: GOLD }}
                      >
                        {emitMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                        {emitMutation.isPending ? "Emitindo…" : "Emitir receitas"}
                      </button>
                    ) : identity.data?.canPreparePrescription ? (
                      <button
                        onClick={handleSubmitForReview}
                        disabled={createApproval.isPending || identity.isFetching || identity.isError}
                        data-testid="button-submit-prescription-review"
                        className="btn-3d flex items-center gap-2 rounded-md px-4 py-2.5 text-sm font-bold disabled:opacity-40"
                      >
                        {createApproval.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                        {createApproval.isPending ? "Enviando para revisão…" : "Enviar ao médico responsável"}
                      </button>
                    ) : null}
                    {/* ── Motor Único (lê modelo ativo do banco) ── */}
                    {identity.data?.canPrescribe && <button
                      onClick={() => { void handleEmitirMotorUnico(); }}
                      disabled
                      title="Emissão alternativa suspensa até a homologação da assinatura e dos envios"
                      className="btn-3d flex items-center gap-2 rounded-md px-4 py-2.5 text-sm font-semibold disabled:opacity-40"
                    >
                      {emitirMotorUnicoLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                      Emitir Receituário
                    </button>}
                    {/* ── PDF Visual (Puppeteer server-side) ── */}
                    {identity.data?.canPrescribe && <button
                      onClick={() => { void handleGerarPdfVisual(); }}
                      disabled
                      title="PDF visual alternativo suspenso até a homologação da assinatura e dos envios"
                      className="btn-3d-soft flex items-center gap-2 rounded-md px-4 py-2.5 text-sm font-semibold disabled:opacity-40"
                    >
                      {gerarPdfVisualLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                      Gerar PDF Visual
                    </button>}
                  </div>

                  {/* Prévia */}
                  {previewPlans && !emitResult && (
                    <div className="space-y-2">
                      <h4 className="text-[11px] font-bold uppercase tracking-wide" style={{ color: GOLD }}>
                        Prévia — {previewPlans.length} receita(s) será(ão) gerada(s)
                      </h4>
                      {previewPlans.map((plan, i) => (
                        <div key={i} className="panel-3d-sub flex items-start gap-3 rounded-md p-3">
                          {plan.anvisaColor ? (
                            <span
                              className="mt-0.5 h-3 w-3 shrink-0 rounded-[2px] border border-input"
                              style={{ background: plan.anvisaColor }}
                            />
                          ) : (
                            <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                          )}
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-foreground">{plan.title}</p>
                            <p className="text-xs text-muted-foreground">
                              {plan.items.length} fórmula(s)
                              {plan.anvisaColorName ? ` · Receituário ${plan.anvisaColorName}` : ""}
                              {plan.needsSncr ? " · exige nº SNCR" : ""}
                              {plan.pharmacyId ? ` · ${pharmacies.find((p) => p.id === plan.pharmacyId)?.name ?? "Farmácia"}` : ""}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                </>
              )}
            </div>
          )}

                  {/* Resultado independe do formulário, que fica vazio após o sucesso. */}
                  {emitResult && (
                    <div className="space-y-3">
                      {emitResult.sncrAlerts.length > 0 && (
                        <div className="space-y-1">
                          {emitResult.sncrAlerts.map((a, i) => (
                            <div
                              key={i}
                              className={`flex items-center gap-2 rounded-md border px-3 py-2 text-xs ${a.status === "exhausted" ? "border-red-500/40 bg-red-500/10 text-red-700" : "border-amber-400/40 bg-amber-500/10 text-amber-700"}`}
                            >
                              <AlertTriangle className="h-4 w-4 shrink-0" />
                              {a.message}
                            </div>
                          ))}
                        </div>
                      )}

                      <h4 className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide" style={{ color: GOLD }}>
                        <FileSignature className="h-3.5 w-3.5" />
                        Receitas emitidas ({emitResult.recipes.length})
                      </h4>
                      {emitResult.recipes.map((rec) => (
                        <div key={rec.id} className="panel-3d-sub flex flex-wrap items-center justify-between gap-2 rounded-md p-3">
                          <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground">{rec.title}</p>
                            <p className="text-xs text-muted-foreground">
                              {rec.anvisaColorName ? `Receituário ${rec.anvisaColorName}` : "Manipulação"}
                              {rec.sncrNumber ? ` · SNCR nº ${rec.sncrNumber}` : ""}
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <PrescriptionPdfLink
                              href={`${BASE}${rec.pdfUrl}`}
                              className="flex items-center gap-1 text-xs font-semibold hover:underline"
                            >
                              <FileText className="h-3.5 w-3.5" />
                              Abrir PDF
                            </PrescriptionPdfLink>
                            {rec.driveWebViewLink && (
                              <a
                                href={rec.driveWebViewLink}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center gap-1 text-xs font-semibold hover:underline"
                                style={{ color: GOLD }}
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                                Drive
                              </a>
                            )}
                          </div>
                        </div>
                      ))}

                      {emitResult.pharmacyDispatches.length > 0 && (
                        <div className="space-y-2">
                          <h4 className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide" style={{ color: GOLD }}>
                            <MessageSquare className="h-3.5 w-3.5" />
                            WhatsApp às farmácias
                          </h4>
                          {emitResult.pharmacyDispatches.map((d) => (
                            <div key={d.pharmacyId} className="panel-3d-sub flex flex-wrap items-center justify-between gap-2 rounded-md p-3">
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-foreground">{d.pharmacyName}</p>
                                <p className="text-xs text-muted-foreground">
                                  {d.recipeCount} receita(s) · {d.sent ? "enviado automaticamente" : "envio manual"}
                                </p>
                              </div>
                              {d.whatsappLink && (
                                <a
                                  href={d.whatsappLink}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex shrink-0 items-center gap-2 rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                                >
                                  <MessageSquare className="h-4 w-4" />
                                  Abrir WhatsApp
                                </a>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
        <PrescricoesEmitidas clientId={clientId} emissionId={emitResult?.prescriptionId} />
        </div>
      </div>
      </fieldset>}
    </div>
  );
}
