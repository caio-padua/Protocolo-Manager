import { useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { collabAuthHeaders } from "@/lib/collab-auth";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { type Atributos, AtributosDialog, BotaoAtivo, GestaoOpcoes, UploadManualExames, NaturezaChip, naturezaSugerida, useAtributos, useCores } from "./ExamesAtributos";
import {
  Search,
  Plus,
  Pencil,
  Trash2,
  FolderInput,
  ChevronDown,
  ArrowLeft,
  ArrowRight,
  MinusCircle,
  TestTube,
  Layers,
  Tags,
  FolderTree,
  Boxes,
} from "lucide-react";

interface Exam {
  id: number;
  codigoExame: string | null;
  nomeExame: string | null;
  grupoPrincipal: string | null;
  subgrupo: string | null;
  modalidade: string | null;
  materialOuSetor: string | null;
  finalidadePrincipal: string | null;
  preparo: string | null;
  blocoOficial: string | null;
  sexoAplicavel: string | null;
  exameDeRastreio: string | null;
  ativo: boolean | null;
}

interface BlocoGrau {
  grau: string;
  exames: Array<{ id: number; nomeExame: string; codigoPadcom: string | null; ordem: number | null }>;
}
interface Bloco {
  codigoBloco: string;
  nomeBloco: string | null;
  tipoMacro: string | null;
  totalExames: number;
  graus: BlocoGrau[];
}
type FormState = {
  id: number | null;
  codigoExame: string;
  areaCodigo: string;
  gradeCodigo: string;
  nomeExame: string;
  grupoPrincipal: string;
  subgrupo: string;
  modalidade: string;
  materialOuSetor: string;
  finalidadePrincipal: string;
  preparo: string;
  sexoAplicavel: string;
  exameDeRastreio: string;
};

const EMPTY_FORM: FormState = {
  id: null,
  codigoExame: "",
  areaCodigo: "",
  gradeCodigo: "",
  nomeExame: "",
  grupoPrincipal: "",
  subgrupo: "",
  modalidade: "",
  materialOuSetor: "",
  finalidadePrincipal: "",
  preparo: "",
  sexoAplicavel: "",
  exameDeRastreio: "",
};

function txt(v: unknown): string {
  if (v === null || v === undefined) return "—";
  const s = String(v).trim();
  return s.length ? s : "—";
}

interface Classificacao {
  id: number;
  nome: string;
  ativo: boolean;
  total: number;
}
type CampoClass = "categoria" | "subgrupo" | "modalidade" | "material_setor";
const CAMPOS_CLASS: Array<{ campo: CampoClass; rotulo: string; plural: string; ajuda: string }> = [
  { campo: "categoria", rotulo: "Grupo / Categoria", plural: "Categorias", ajuda: "Grande área clínica do exame. Ex.: HEMATOLOGICO, IMAGEM, ENDOCRINO." },
  { campo: "subgrupo", rotulo: "Subgrupo", plural: "Subgrupos", ajuda: "Divisão dentro da categoria. Ex.: TIREOIDE, DST, LIPIDICO CARDIOMETABOLICO." },
  { campo: "modalidade", rotulo: "Modalidade", plural: "Modalidades", ajuda: "Tipo de método. Ex.: LABORATORIAL, USG, TC, RM, RX." },
  { campo: "material_setor", rotulo: "Setor / Especialidade", plural: "Setor / Especialidade", ajuda: "Setor executor ou especialidade. O material biológico (soro, plasma, urina...) fica em Opções > Materiais." },
];
const SEM_VALOR = "__none__";
const FAIXA_MATIZES = [215, 160, 28, 275, 345, 190, 95, 40];

function useClassificacoes(campo: CampoClass) {
  return useQuery<Classificacao[]>({
    queryKey: ["/api/cadastros/classificacoes", campo],
    queryFn: async () => {
      const r = await fetch(`/api/cadastros/classificacoes?campo=${campo}`);
      if (!r.ok) throw new Error("Falha ao carregar classificações");
      return r.json();
    },
  });
}

// Lista suspensa alimentada pelo cadastro de classificações. Valor antigo que
// ainda não consta no cadastro continua visível (nunca é apagado ao editar).
function ClassSelect({
  campo,
  value,
  onChange,
}: {
  campo: CampoClass;
  value: string;
  onChange: (v: string) => void;
}) {
  const { data } = useClassificacoes(campo);
  const atuais = (data ?? []).filter((c) => c.ativo).map((c) => c.nome);
  const legado = value && !atuais.some((n) => n.toUpperCase() === value.trim().toUpperCase()) ? value : null;
  return (
    <Select
      value={value ? value : SEM_VALOR}
      onValueChange={(v) => {
        if (v === "") return;
        onChange(v === SEM_VALOR ? "" : v);
      }}
    >
      <SelectTrigger className="field-engraved" data-testid={`select-${campo}`}>
        <SelectValue placeholder="Selecione" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={SEM_VALOR}>— Nenhum —</SelectItem>
        {legado && <SelectItem value={legado}>{legado} (fora do cadastro)</SelectItem>}
        {atuais.map((n) => (
          <SelectItem key={n} value={n}>
            {n}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// ============================ ABA EXAMES =====================================
function ExamesTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [categoria, setCategoria] = useState("__all__");
  const [naturezaFiltro, setNaturezaFiltro] = useState("__all__");
  const [dialogOpen, setDialogOpen] = useState(false);
  const criadoId = useRef<number | null>(null); // evita duplicar o exame se os atributos falharem e o médico tentar de novo
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [cloneAttr, setCloneAttr] = useState<Atributos | undefined>(undefined);
  const { data: atributos } = useAtributos();
  const attrPorId = useMemo(() => new Map((atributos ?? []).map((a) => [a.exameId, a])), [atributos]);

  const { data: exams, isLoading } = useQuery<Exam[]>({
    queryKey: ["/api/cadastros/exames"],
    queryFn: async () => {
      const r = await fetch("/api/cadastros/exames");
      if (!r.ok) throw new Error("Falha ao carregar exames");
      return r.json();
    },
  });

  const categorias = useMemo(() => {
    const set = new Set<string>();
    for (const e of exams ?? []) if (e.grupoPrincipal?.trim()) set.add(e.grupoPrincipal.trim());
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [exams]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (exams ?? []).filter((e) => {
      if (categoria !== "__all__" && (e.grupoPrincipal ?? "").trim() !== categoria) return false;
      if (naturezaFiltro !== "__all__") {
        const nat = (attrPorId.get(e.id)?.natureza ?? naturezaSugerida(e.modalidade) ?? "").toUpperCase();
        if (nat !== naturezaFiltro) return false;
      }
      if (!q) return true;
      const a = attrPorId.get(e.id);
      return [e.nomeExame, e.codigoExame, e.grupoPrincipal, e.subgrupo, e.modalidade, a?.natureza, a?.metodo, a?.regiao, ...(a?.sinonimos ?? []), ...(a?.eixos ?? []), ...(a?.gatilhos ?? [])]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [exams, search, categoria, naturezaFiltro, attrPorId]);

  const [fechados, setFechados] = useState<Set<string>>(new Set());
  const gruposVisiveis = useMemo(() => {
    const m = new Map<string, Exam[]>();
    for (const e of filtered) {
      const k = e.grupoPrincipal?.trim() || "SEM CATEGORIA";
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(e);
    }
    return Array.from(m, ([nome, itens]) => ({ nome, itens })).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [filtered]);

  const saveMutation = useMutation<Exam, Error>({
    mutationFn: async () => {
      const body = {
        nomeExame: form.nomeExame,
        grupoPrincipal: form.grupoPrincipal || null,
        subgrupo: form.subgrupo || null,
        modalidade: form.modalidade || null,
        materialOuSetor: form.materialOuSetor || null,
        finalidadePrincipal: form.finalidadePrincipal || null,
        preparo: form.preparo || null,
        sexoAplicavel: form.sexoAplicavel || null,
        exameDeRastreio: form.exameDeRastreio || null,
      };
      const url = form.id
        ? `/api/cadastros/exames/${form.id}`
        : "/api/cadastros/exames";
      const r = await fetch(url, {
        method: form.id ? "PUT" : "POST",
        headers: collabAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(form.id ? body : { ...body, areaCodigo: form.areaCodigo, gradeCodigo: form.gradeCodigo }),
      });
      if (!r.ok) {
        const b = await r.json().catch(() => ({}));
        throw new Error(b.error ?? "Falha ao salvar exame");
      }
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/cadastros/exames"] });
      qc.invalidateQueries({ queryKey: ["/api/catalogos/exames"] });
    },
    onError: (err) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const toggleMutation = useMutation<Exam, Error, { id: number; ativo: boolean }>({
    mutationFn: async ({ id, ativo }) => {
      const r = await fetch(`/api/cadastros/exames/${id}/ativo`, {
        method: "PATCH",
        headers: collabAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ ativo }),
      });
      if (!r.ok) throw new Error("Falha ao alterar status");
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/cadastros/exames"] });
      qc.invalidateQueries({ queryKey: ["/api/catalogos/exames"] });
    },
    onError: (err) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  function openNew() {
    setCloneAttr(undefined);
    criadoId.current = null;
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  }
  function clonarAtual() {
    // Cópia da ficha como exame NOVO: sem código (gerado pelo sistema) e sem vínculos de bloco.
    const a = form.id ? attrPorId.get(form.id) : undefined;
    criadoId.current = null;
    setCloneAttr(a ? { ...a, exameId: 0 } : undefined);
    setForm((f) => ({ ...f, id: null, codigoExame: "", areaCodigo: "", gradeCodigo: "", nomeExame: `${f.nomeExame} (CÓPIA)` }));
    toast({ title: "Exame clonado", description: "Escolha a área e a grade do código novo. Os vínculos de bloco não são copiados." });
  }
  function openEdit(e: Exam) {
    setCloneAttr(undefined);
    criadoId.current = null;
    setForm({
      id: e.id,
      codigoExame: e.codigoExame ?? "",
      areaCodigo: "",
      gradeCodigo: "",
      nomeExame: e.nomeExame ?? "",
      grupoPrincipal: e.grupoPrincipal ?? "",
      subgrupo: e.subgrupo ?? "",
      modalidade: e.modalidade ?? "",
      materialOuSetor: e.materialOuSetor ?? "",
      finalidadePrincipal: e.finalidadePrincipal ?? "",
      preparo: e.preparo ?? "",
      sexoAplicavel: e.sexoAplicavel ?? "",
      exameDeRastreio: e.exameDeRastreio ?? "",
    });
    setDialogOpen(true);
  }

  const opcoesCodigo = useQuery<{ areas: Array<{ codigo: string; rotulo: string }>; grades: Array<{ codigo: string; rotulo: string }> }>({
    queryKey: ["/api/cadastros/exames/codigo/opcoes"],
    queryFn: async () => {
      const r = await fetch("/api/cadastros/exames/codigo/opcoes");
      if (!r.ok) throw new Error("Falha ao carregar opções do código");
      return r.json();
    },
    enabled: dialogOpen && form.id === null,
  });
  const previa = useQuery<{ semantico: string }, Error>({
    queryKey: ["/api/cadastros/exames/codigo/previa", form.nomeExame.trim(), form.areaCodigo, form.gradeCodigo],
    queryFn: async () => {
      const r = await fetch("/api/cadastros/exames/codigo/previa", {
        method: "POST",
        headers: collabAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ nomeExame: form.nomeExame.trim(), areaCodigo: form.areaCodigo, gradeCodigo: form.gradeCodigo }),
      });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(b.error ?? "Código inválido");
      return b;
    },
    enabled: dialogOpen && form.id === null && form.nomeExame.trim().length > 0 && form.areaCodigo.length === 4 && form.gradeCodigo.length === 4,
    retry: false,
  });

  const canSave =
    form.nomeExame.trim().length > 0 &&
    (form.id !== null || (form.areaCodigo.length === 4 && form.gradeCodigo.length === 4 && !!previa.data)) &&
    !saveMutation.isPending;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar exame..."
            className="pl-9 field-engraved"
          />
        </div>
        <div className="flex items-center gap-3">
          <Select value={naturezaFiltro} onValueChange={setNaturezaFiltro}>
            <SelectTrigger className="w-[150px] field-engraved" data-testid="filtro-natureza">
              <SelectValue placeholder="Natureza" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todas as naturezas</SelectItem>
              {["LABORATORIAL", "IMAGEM", "COMPOSICAO CORPORAL", "METODOS GRAFICOS", "ENDOSCOPICOS"].map((n) => (
                <SelectItem key={n} value={n}>{n}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={categoria} onValueChange={setCategoria}>
            <SelectTrigger className="w-[220px] field-engraved">
              <SelectValue placeholder="Categoria" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todas as categorias</SelectItem>
              {categorias.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="screen-3d px-3 py-1.5 text-xs font-black whitespace-nowrap tracking-wide">
            {isLoading ? "..." : `${filtered.length} de ${exams?.length ?? 0}`}
          </div>
          <Button onClick={openNew} className="btn-3d">
            <Plus className="mr-1.5 h-4 w-4" /> Novo exame
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : (
        <div className="panel-3d overflow-hidden" data-testid="lista-exames-faixas">
          <div className="hidden md:grid grid-cols-[minmax(0,2.6fr)_minmax(0,1.1fr)_minmax(0,1.6fr)_112px_48px] gap-3 bg-primary/10 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-primary">
            <div>Exame</div>
            <div>Natureza / Modalidade</div>
            <div>Preparo</div>
            <div className="text-center">Ativo</div>
            <div className="text-right">Ação</div>
          </div>
          {gruposVisiveis.length === 0 ? (
            <div className="h-24 flex items-center justify-center text-sm text-muted-foreground">Nenhum exame encontrado.</div>
          ) : (
            gruposVisiveis.map((g, gi) => {
              const hue = FAIXA_MATIZES[gi % FAIXA_MATIZES.length];
              const fechado = fechados.has(g.nome);
              return (
                <section key={g.nome} data-testid={`faixa-${g.nome}`}>
                  <button
                    type="button"
                    onClick={() => setFechados((s) => { const n = new Set(s); if (n.has(g.nome)) n.delete(g.nome); else n.add(g.nome); return n; })}
                    className="flex w-full items-center gap-3 px-4 py-2 text-left text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.25),inset_0_-2px_0_rgba(0,0,0,0.25)]"
                    style={{ background: `linear-gradient(90deg, hsl(${hue} 55% 24%), hsl(${hue} 50% 38%) 70%, hsl(${hue} 55% 46%))`, borderLeft: `6px solid hsl(${hue} 80% 65%)` }}
                    aria-expanded={!fechado}
                  >
                    <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${fechado ? "-rotate-90" : ""}`} />
                    <span className="min-w-0 flex-1 truncate text-xs font-black uppercase tracking-widest">{g.nome}</span>
                    <span className="rounded-full bg-black/25 px-2.5 py-0.5 text-[11px] font-black">{g.itens.length}</span>
                  </button>
                  {!fechado && g.itens.map((e, i) => {
                    const nat = attrPorId.get(e.id)?.natureza;
                    return (
                      <div
                        key={e.id}
                        className={`neon-hover grid grid-cols-[minmax(0,1fr)_112px_48px] md:grid-cols-[minmax(0,2.6fr)_minmax(0,1.1fr)_minmax(0,1.6fr)_112px_48px] items-center gap-3 px-4 py-2.5 ${e.ativo === false ? "opacity-50" : ""}`}
                        style={{ background: `hsl(${hue} 45% ${i % 2 === 0 ? "97%" : "93%"} / 0.9)`, borderLeft: `6px solid hsl(${hue} 55% 60% / 0.55)` }}
                      >
                        <div className="min-w-0">
                          <div className="break-words text-sm font-bold leading-tight text-[#1b2433]">{txt(e.nomeExame)}</div>
                          <div className="mt-0.5 truncate font-mono text-[10px] tracking-wide text-[#5b6578]" title={txt(e.codigoExame)}>{txt(e.codigoExame)}</div>
                        </div>
                        <div className="hidden md:flex min-w-0 flex-col items-start gap-1">
                          {nat ? <NaturezaChip curto natureza={nat} /> : <NaturezaChip curto natureza={naturezaSugerida(e.modalidade)} sugerida />}
                          <span className="truncate text-[11px] text-[#5b6578]">{txt(e.modalidade)}</span>
                        </div>
                        <div className="hidden md:block min-w-0 text-xs text-[#5b6578] line-clamp-2">{txt(e.preparo)}</div>
                        <div className="flex justify-center">
                          <BotaoAtivo ativo={e.ativo !== false} rotulo={txt(e.nomeExame)} onChange={(v) => toggleMutation.mutate({ id: e.id, ativo: v })} />
                        </div>
                        <div className="flex justify-end">
                          <Button variant="ghost" size="icon" onClick={() => openEdit(e)} aria-label="Editar" title="Editar ficha completa do exame" data-testid={`button-editar-${e.id}`}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </section>
              );
            })
          )}
        </div>
      )}

      <AtributosDialog
        exame={dialogOpen ? { id: form.id, nome: form.nomeExame } : null}
        atual={form.id ? attrPorId.get(form.id) : cloneAttr}
        onClonar={form.id ? clonarAtual : undefined}
        modalidade={form.modalidade}
        titulo={form.id ? "Editar exame" : "Novo exame"}
        podeSalvar={canSave}
        antesDeSalvar={async () => {
          if (form.id) return (await saveMutation.mutateAsync()).id;
          if (criadoId.current) return criadoId.current;
          criadoId.current = (await saveMutation.mutateAsync()).id;
          return criadoId.current;
        }}
        onClose={() => setDialogOpen(false)}
        topo={(
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {form.id !== null ? (
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Código</label>
                  <Input value={form.codigoExame} disabled className="field-engraved" />
                </div>
              ) : (
                <div className="space-y-1.5 sm:col-span-2">
                  <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Código (gerado pelo sistema) *</label>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <Select value={form.areaCodigo || SEM_VALOR} onValueChange={(v) => { if (v !== "") setForm((f) => ({ ...f, areaCodigo: v === SEM_VALOR ? "" : v })); }}>
                      <SelectTrigger className="field-engraved" data-testid="select-area-codigo"><SelectValue placeholder="Área (bloco)" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={SEM_VALOR}>— Escolha a área —</SelectItem>
                        {(opcoesCodigo.data?.areas ?? []).map((a) => (
                          <SelectItem key={a.codigo} value={a.codigo}>{a.codigo} — {a.rotulo}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={form.gradeCodigo || SEM_VALOR} onValueChange={(v) => { if (v !== "") setForm((f) => ({ ...f, gradeCodigo: v === SEM_VALOR ? "" : v })); }}>
                      <SelectTrigger className="field-engraved" data-testid="select-grade-codigo"><SelectValue placeholder="Grade" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={SEM_VALOR}>— Escolha a grade —</SelectItem>
                        {(opcoesCodigo.data?.grades ?? []).map((g) => (
                          <SelectItem key={g.codigo} value={g.codigo}>{g.codigo} — {g.rotulo}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="screen-3d px-3 py-1.5 text-xs font-black tracking-wide" data-testid="previa-codigo" role="status">
                    {previa.isError
                      ? previa.error.message
                      : previa.data
                        ? `Código: ${previa.data.semantico}`
                        : "Digite o nome e escolha área e grade para ver o código."}
                  </div>
                </div>
              )}
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Nome do exame *</label>
                <Input
                  value={form.nomeExame}
                  onChange={(e) => setForm((f) => ({ ...f, nomeExame: e.target.value }))}
                  placeholder="Ex.: Hemograma completo"
                  className="field-engraved"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Grupo / Categoria</label>
                <ClassSelect campo="categoria" value={form.grupoPrincipal} onChange={(v) => setForm((f) => ({ ...f, grupoPrincipal: v }))} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Subgrupo</label>
                <ClassSelect campo="subgrupo" value={form.subgrupo} onChange={(v) => setForm((f) => ({ ...f, subgrupo: v }))} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Modalidade</label>
                <ClassSelect campo="modalidade" value={form.modalidade} onChange={(v) => setForm((f) => ({ ...f, modalidade: v }))} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Setor / Especialidade</label>
                <ClassSelect campo="material_setor" value={form.materialOuSetor} onChange={(v) => setForm((f) => ({ ...f, materialOuSetor: v }))} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Finalidade principal</label>
                <Input
                  value={form.finalidadePrincipal}
                  onChange={(e) => setForm((f) => ({ ...f, finalidadePrincipal: e.target.value }))}
                  className="field-engraved"
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Preparo</label>
                <Textarea
                  rows={2}
                  value={form.preparo}
                  onChange={(e) => setForm((f) => ({ ...f, preparo: e.target.value }))}
                  placeholder="Ex.: Jejum de 8 horas"
                  className="field-engraved"
                />
              </div>
            </div>
        )}
      />
    </div>
  );
}

// ============================ ABA BLOCOS =====================================
function BlocosTab() {
  const coresUi = useCores();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  // mover: exame da grade -> outro bloco/grau; incluir: exame do catálogo -> bloco/grau
  const [mover, setMover] = useState<{ id: number; nome: string; blocoId: string; grau: string } | null>(null);
  const [incluir, setIncluir] = useState<{ blocoId: string; nomeBloco: string; grau: string; exameId: string } | null>(null);
  const [buscaExame, setBuscaExame] = useState("");
  const [abertos, setAbertos] = useState<string[]>([]);

  const opcoes = useQuery<{ blocos: Array<{ codigoBloco: string; nomeBloco: string }>; graus: string[] }>({
    queryKey: ["/api/cadastros/blocos/opcoes"],
    queryFn: async () => {
      const r = await fetch("/api/cadastros/blocos/opcoes");
      if (!r.ok) throw new Error("Falha ao carregar blocos");
      return r.json();
    },
  });
  const catalogo = useQuery<Exam[]>({
    queryKey: ["/api/cadastros/exames"],
    queryFn: async () => {
      const r = await fetch("/api/cadastros/exames");
      if (!r.ok) throw new Error("Falha ao carregar exames");
      return r.json();
    },
    enabled: incluir !== null,
  });

  const refazer = () => {
    qc.invalidateQueries({ queryKey: ["/api/cadastros/blocos"] });
    qc.invalidateQueries({ queryKey: ["/api/cadastros/blocos/opcoes"] });
  };
  const chamar = async (url: string, method: string, body: unknown, falha: string) => {
    const r = await fetch(url, {
      method,
      headers: collabAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      const b = await r.json().catch(() => ({}));
      throw new Error(b.error ?? falha);
    }
    return r.json();
  };
  const moverMut = useMutation<unknown, Error>({
    mutationFn: () => chamar(`/api/cadastros/blocos/exames/${mover!.id}/mover`, "PATCH", { blocoId: mover!.blocoId, grau: mover!.grau }, "Falha ao mover"),
    onSuccess: () => {
      refazer();
      setMover(null);
      toast({ title: "Exame movido" });
    },
    onError: (err) => toast({ title: "Não foi possível mover", description: err.message, variant: "destructive" }),
  });
  const devolverMut = useMutation<unknown, Error, { id: number }>({
    mutationFn: ({ id }) => chamar(`/api/cadastros/blocos/exames/${id}/ativo`, "PATCH", { ativo: true }, "Falha ao devolver ao bloco"),
    onSuccess: () => {
      refazer();
      toast({ title: "Exame devolvido ao bloco" });
    },
    onError: (err) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });
  const tirarMut = useMutation<unknown, Error, { id: number }>({
    mutationFn: ({ id }) => chamar(`/api/cadastros/blocos/exames/${id}/ativo`, "PATCH", { ativo: false }, "Falha ao tirar do bloco"),
    onSuccess: (_d, { id }) => {
      refazer();
      toast({
        title: "Exame tirado do bloco",
        description: "Continua no catálogo; só deixou de fazer parte deste bloco.",
        action: <ToastAction altText="Desfazer" onClick={() => devolverMut.mutate({ id })} data-testid="button-desfazer-tirar">Desfazer</ToastAction>,
      });
    },
    onError: (err) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });
  const moverGrauMut = useMutation<unknown, Error, { id: number; blocoId: string; grau: string }>({
    mutationFn: ({ id, blocoId, grau }) => chamar(`/api/cadastros/blocos/exames/${id}/mover`, "PATCH", { blocoId, grau }, "Falha ao mover"),
    onSuccess: (_d, v) => {
      refazer();
      toast({ title: "Exame movido", description: `Agora em ${v.grau}.` });
    },
    onError: (err) => toast({ title: "Não foi possível mover", description: err.message, variant: "destructive" }),
  });
  const incluirMut = useMutation<unknown, Error>({
    mutationFn: () => chamar("/api/cadastros/blocos/exames", "POST", { blocoId: incluir!.blocoId, grau: incluir!.grau, exameId: Number(incluir!.exameId) }, "Falha ao incluir"),
    onSuccess: () => {
      refazer();
      setIncluir(null);
      setBuscaExame("");
      toast({ title: "Exame incluído no bloco" });
    },
    onError: (err) => toast({ title: "Não foi possível incluir", description: err.message, variant: "destructive" }),
  });
  const examesEscolha = (catalogo.data ?? [])
    .filter((e) => e.ativo !== false && e.nomeExame)
    .filter((e) => !buscaExame.trim() || (e.nomeExame ?? "").toLowerCase().includes(buscaExame.trim().toLowerCase()))
    .slice(0, 60);
  const { data: blocos, isLoading } = useQuery<Bloco[]>({
    queryKey: ["/api/cadastros/blocos"],
    queryFn: async () => {
      const r = await fetch("/api/cadastros/blocos");
      if (!r.ok) throw new Error("Falha ao carregar blocos");
      return r.json();
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return blocos ?? [];
    return (blocos ?? []).filter(
      (b) =>
        (b.nomeBloco ?? "").toLowerCase().includes(q) ||
        (b.tipoMacro ?? "").toLowerCase().includes(q),
    );
  }, [blocos, search]);

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="relative w-full sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar bloco..."
            className="pl-9 field-engraved"
          />
        </div>
        <div className="screen-3d px-3 py-1.5 text-xs font-black whitespace-nowrap tracking-wide">
          {filtered.length} blocos
        </div>
      </div>
      <div className="concave-3d flex items-start gap-2.5 px-3 py-2.5 text-sm text-muted-foreground">
        <Boxes className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
        <span>
          Cada bloco é um painel de exames com graus (Básica, Intermediária, Sofisticada). No Prescritor de Exames você
          adiciona um painel inteiro de uma só vez.
        </span>
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => setAbertos(filtered.map((b) => b.codigoBloco))} data-testid="button-expandir-blocos">Expandir todos</Button>
        <Button type="button" size="sm" variant="outline" onClick={() => setAbertos([])} data-testid="button-recolher-blocos">Recolher todos</Button>
      </div>

      <Accordion type="multiple" value={abertos} onValueChange={setAbertos} className="space-y-2">
        {filtered.map((b) => (
          <AccordionItem
            key={b.codigoBloco}
            value={b.codigoBloco}
            className="panel-3d-sub border-l-4 border-primary/50 px-4"
          >
            <AccordionTrigger className="hover:no-underline neon-hover">
              <div className="flex flex-1 items-center justify-between pr-3">
                <span className="text-xs font-black uppercase tracking-wide">{b.nomeBloco}</span>
                <div className="flex items-center gap-2">
                  {b.tipoMacro && (
                    <Badge variant="secondary" className="text-[10px] uppercase">
                      {b.tipoMacro}
                    </Badge>
                  )}
                  <Badge variant="outline" className="text-[10px]">
                    {b.graus.length} graus
                  </Badge>
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <div className="flex justify-end pb-2">
                <Button
                  size="sm"
                  className="btn-3d"
                  data-testid={`button-incluir-exame-${b.codigoBloco}`}
                  onClick={() => setIncluir({ blocoId: b.codigoBloco, nomeBloco: b.nomeBloco ?? b.codigoBloco, grau: b.graus[0]?.grau ?? "GRADE BASICA", exameId: "" })}
                >
                  <Plus className="mr-1.5 h-4 w-4" /> Incluir exame neste bloco
                </Button>
              </div>
              <div className="grid grid-cols-1 gap-3 pb-2 md:grid-cols-3">
                {b.graus.map((g, gi) => (
                  <div key={g.grau} className="panel-3d-sub p-3 border-l-4 text-slate-900" style={{ borderLeftColor: coresUi.grade(g.grau), backgroundColor: `color-mix(in srgb, ${coresUi.grade(g.grau)} 10%, white)` }} data-testid={`grade-${g.grau}`}>
                    <div className="mb-2 text-[10px] font-black uppercase tracking-widest text-primary">
                      {g.grau} ({g.exames.length})
                    </div>
                    <ul className="space-y-0.5">
                      {g.exames.map((ex, i) => (
                        <li key={ex.id ?? i} className="flex items-center justify-between gap-1 text-xs text-muted-foreground">
                          <span className="min-w-0 flex-1">{ex.nomeExame}</span>
                          <button
                            type="button"
                            aria-label={`Mover ${ex.nomeExame} para ${b.graus[gi - 1]?.grau ?? "grau anterior"}`}
                            title={gi > 0 ? `Mover para ${b.graus[gi - 1].grau}` : "Já está no primeiro grau"}
                            data-testid={`button-grau-anterior-${ex.id}`}
                            className="btn-3d-soft rounded-[6px] p-1 disabled:opacity-30"
                            disabled={gi === 0 || moverGrauMut.isPending}
                            onClick={() => moverGrauMut.mutate({ id: ex.id, blocoId: b.codigoBloco, grau: b.graus[gi - 1].grau })}
                          >
                            <ArrowLeft className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            aria-label={`Mover ${ex.nomeExame} para ${b.graus[gi + 1]?.grau ?? "próximo grau"}`}
                            title={gi < b.graus.length - 1 ? `Mover para ${b.graus[gi + 1].grau}` : "Já está no último grau"}
                            data-testid={`button-grau-seguinte-${ex.id}`}
                            className="btn-3d-soft rounded-[6px] p-1 disabled:opacity-30"
                            disabled={gi >= b.graus.length - 1 || moverGrauMut.isPending}
                            onClick={() => moverGrauMut.mutate({ id: ex.id, blocoId: b.codigoBloco, grau: b.graus[gi + 1].grau })}
                          >
                            <ArrowRight className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            aria-label={`Mover ${ex.nomeExame}`}
                            title="Levar para outro bloco ou outra categoria (abre janela)"
                            data-testid={`button-mover-exame-${ex.id}`}
                            className="btn-3d-soft rounded-[6px] p-1"
                            onClick={() => setMover({ id: ex.id, nome: ex.nomeExame, blocoId: b.codigoBloco, grau: g.grau })}
                          >
                            <FolderInput className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            aria-label={`Tirar ${ex.nomeExame} do bloco`}
                            title="Tirar do bloco (não apaga o exame)"
                            data-testid={`button-tirar-exame-${ex.id}`}
                            className="btn-3d-soft rounded-[6px] p-1 text-destructive"
                            disabled={tirarMut.isPending}
                            onClick={() => tirarMut.mutate({ id: ex.id })}
                          >
                            <MinusCircle className="h-3 w-3" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>

      <Dialog open={mover !== null} onOpenChange={(o) => !o && setMover(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Mover exame</DialogTitle>
          </DialogHeader>
          {mover && (
            <div className="space-y-3">
              <div className="screen-3d px-3 py-1.5 text-xs font-black">{mover.nome}</div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Bloco de destino</label>
                <Select value={mover.blocoId} onValueChange={(v) => v && setMover((m) => (m ? { ...m, blocoId: v } : m))}>
                  <SelectTrigger className="field-engraved" data-testid="select-bloco-destino"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(opcoes.data?.blocos ?? []).map((o) => (
                      <SelectItem key={o.codigoBloco} value={o.codigoBloco}>{o.nomeBloco}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Grau de destino</label>
                <Select value={mover.grau} onValueChange={(v) => v && setMover((m) => (m ? { ...m, grau: v } : m))}>
                  <SelectTrigger className="field-engraved" data-testid="select-grau-destino"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(opcoes.data?.graus ?? []).map((g) => (
                      <SelectItem key={g} value={g}>{g}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {(() => {
                // Prévia de impacto (só leitura, calculada a partir da grade já carregada).
                const grauDe = (bid: string, gr: string) => (blocos ?? []).find((x) => x.codigoBloco === bid)?.graus.find((g) => g.grau === gr);
                const nomeBloco = (bid: string) => (blocos ?? []).find((x) => x.codigoBloco === bid)?.nomeBloco ?? bid;
                const origem = (blocos ?? []).flatMap((x) => x.graus.map((g) => ({ b: x.codigoBloco, g: g.grau, ex: g.exames }))).find((o) => o.ex.some((e) => e.id === mover.id));
                const destino = grauDe(mover.blocoId, mover.grau);
                const mesmo = !!origem && origem.b === mover.blocoId && origem.g === mover.grau;
                const nomeAlvo = mover.nome.trim().toUpperCase();
                const jaNoDestino = !mesmo && !!destino?.exames.some((e) => (e.nomeExame ?? "").trim().toUpperCase() === nomeAlvo);
                return (
                  <div className="concave-3d space-y-1 px-3 py-2 text-xs" data-testid="previa-impacto-mover" role="status">
                    <div className="text-[10px] font-black uppercase tracking-widest text-primary">Prévia de impacto</div>
                    {mesmo ? <div>Origem e destino são iguais: nada muda.</div> : (
                      <>
                        {origem && <div>Sai de: {nomeBloco(origem.b)} / {origem.g} ({origem.ex.length} → {origem.ex.length - 1} exames)</div>}
                        <div>Entra em: {nomeBloco(mover.blocoId)} / {mover.grau} ({destino?.exames.length ?? 0} → {(destino?.exames.length ?? 0) + 1} exames)</div>
                        {jaNoDestino && <div className="font-bold text-destructive">Já existe um exame com este nome no destino; o servidor pode recusar.</div>}
                        <div className="text-muted-foreground">Muda quais exames o cérebro sugere para este bloco e grade.</div>
                      </>
                    )}
                  </div>
                );
              })()}
              <p className="text-xs text-muted-foreground">O código do exame não muda. O exame entra no fim da lista do destino.</p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setMover(null)}>Cancelar</Button>
            <Button className="btn-3d" disabled={moverMut.isPending} onClick={() => moverMut.mutate()} data-testid="button-confirmar-mover">
              {moverMut.isPending ? "Movendo..." : "Mover"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={incluir !== null} onOpenChange={(o) => !o && setIncluir(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Incluir exame no bloco</DialogTitle>
          </DialogHeader>
          {incluir && (
            <div className="space-y-3">
              <div className="screen-3d px-3 py-1.5 text-xs font-black">{incluir.nomeBloco}</div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Grau</label>
                <Select value={incluir.grau} onValueChange={(v) => v && setIncluir((m) => (m ? { ...m, grau: v } : m))}>
                  <SelectTrigger className="field-engraved"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(opcoes.data?.graus ?? []).map((g) => (
                      <SelectItem key={g} value={g}>{g}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Exame</label>
                <Input value={buscaExame} onChange={(e) => setBuscaExame(e.target.value)} placeholder="Buscar exame..." className="field-engraved" />
                <Select value={incluir.exameId} onValueChange={(v) => v && setIncluir((m) => (m ? { ...m, exameId: v } : m))}>
                  <SelectTrigger className="field-engraved" data-testid="select-exame-incluir"><SelectValue placeholder="Escolha o exame" /></SelectTrigger>
                  <SelectContent>
                    {examesEscolha.map((e) => (
                      <SelectItem key={e.id} value={String(e.id)}>{e.nomeExame}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIncluir(null)}>Cancelar</Button>
            <Button className="btn-3d" disabled={!incluir?.exameId || incluirMut.isPending} onClick={() => incluirMut.mutate()} data-testid="button-confirmar-incluir">
              {incluirMut.isPending ? "Incluindo..." : "Incluir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================ ABA CATEGORIAS =================================
// Sub-tela de cadastro das classificações usadas nos menus suspensos do exame.
function ClassificacaoPainel({ item }: { item: (typeof CAMPOS_CLASS)[number] }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [novo, setNovo] = useState("");
  const [busca, setBusca] = useState("");
  const { data, isLoading } = useClassificacoes(item.campo);

  const criar = useMutation<unknown, Error>({
    mutationFn: async () => {
      const r = await fetch("/api/cadastros/classificacoes", {
        method: "POST",
        headers: collabAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ campo: item.campo, nome: novo }),
      });
      if (!r.ok) {
        const b = await r.json().catch(() => ({}));
        throw new Error(b.error ?? "Falha ao cadastrar");
      }
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/cadastros/classificacoes", item.campo] });
      setNovo("");
      toast({ title: `${item.rotulo} cadastrado(a)` });
    },
    onError: (err) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const alternar = useMutation<unknown, Error, { id: number; ativo: boolean }>({
    mutationFn: async ({ id, ativo }) => {
      const r = await fetch(`/api/cadastros/classificacoes/${id}/ativo`, {
        method: "PATCH",
        headers: collabAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ ativo }),
      });
      if (!r.ok) throw new Error("Falha ao alterar status");
      return r.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/cadastros/classificacoes", item.campo] }),
    onError: (err) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const excluir = useMutation<unknown, Error, { id: number }>({
    mutationFn: async ({ id }) => {
      const r = await fetch(`/api/cadastros/classificacoes/${id}`, {
        method: "DELETE",
        headers: collabAuthHeaders(),
      });
      if (!r.ok) {
        const b = await r.json().catch(() => ({}));
        throw new Error(b.error ?? "Falha ao excluir");
      }
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/cadastros/classificacoes", item.campo] });
      toast({ title: "Cadastro excluído" });
    },
    onError: (err) => toast({ title: "Não foi possível excluir", description: err.message, variant: "destructive" }),
  });

  const [editId, setEditId] = useState<number | null>(null);
  const [editNome, setEditNome] = useState("");
  const renomear = useMutation<{ exames_atualizados: number }, Error, { id: number }>({
    mutationFn: async ({ id }) => {
      const r = await fetch(`/api/cadastros/classificacoes/${id}`, {
        method: "PATCH",
        headers: collabAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ nome: editNome }),
      });
      if (!r.ok) {
        const b = await r.json().catch(() => ({}));
        throw new Error(b.error ?? "Falha ao renomear");
      }
      return r.json();
    },
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ["/api/cadastros/classificacoes"] });
      qc.invalidateQueries({ queryKey: ["/api/cadastros/exames"] });
      setEditId(null);
      toast({ title: "Nome atualizado", description: `${d.exames_atualizados} exame(s) acompanharam a mudança.` });
    },
    onError: (err) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const q = busca.trim().toLowerCase();
  const lista = (data ?? []).filter((c) => !q || c.nome.toLowerCase().includes(q));

  return (
    <div className="space-y-3">
      <div className="concave-3d flex items-start gap-2.5 px-3 py-2.5 text-sm text-muted-foreground">
        <Tags className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
        <span>
          {item.ajuda} Desativar remove a opção da lista suspensa sem apagar nada. Editar o nome atualiza também os exames que usam esse nome.
        </span>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          value={novo}
          onChange={(e) => setNovo(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && novo.trim() && !criar.isPending) criar.mutate();
          }}
          placeholder={`Novo(a) ${item.rotulo.toLowerCase()}...`}
          className="field-engraved sm:max-w-sm"
          data-testid={`input-nova-${item.campo}`}
        />
        <Button
          onClick={() => criar.mutate()}
          disabled={!novo.trim() || criar.isPending}
          className="btn-3d"
          data-testid={`button-cadastrar-${item.campo}`}
        >
          <Plus className="mr-1.5 h-4 w-4" /> Cadastrar
        </Button>
        <div className="relative sm:ml-auto sm:w-56">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar..." className="pl-9 field-engraved" />
        </div>
      </div>
      {isLoading ? (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {lista.map((c) => (
            <div
              key={c.id}
              className={`panel-3d-sub flex items-center justify-between gap-2 border-l-4 border-primary/50 p-3 ${c.ativo ? "" : "opacity-50"}`}
            >
              <div className="min-w-0 flex-1">
                {editId === c.id ? (
                  <div className="flex gap-1">
                    <Input
                      value={editNome}
                      onChange={(e) => setEditNome(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && editNome.trim()) renomear.mutate({ id: c.id });
                        if (e.key === "Escape") setEditId(null);
                      }}
                      className="field-engraved h-8"
                      autoFocus
                    />
                    <Button size="sm" className="btn-3d h-8" disabled={!editNome.trim() || renomear.isPending} onClick={() => renomear.mutate({ id: c.id })}>
                      OK
                    </Button>
                  </div>
                ) : (
                  <div className="truncate text-xs font-black uppercase tracking-wide">{c.nome}</div>
                )}
                <div className="mt-1 screen-3d inline-block px-2 py-0.5 text-xs font-black">{c.total} exames</div>
              </div>
              {editId !== c.id && (
                <button
                  type="button"
                  aria-label={`Editar ${c.nome}`}
                  data-testid={`button-editar-classificacao-${c.id}`}
                  className="btn-3d-soft rounded-[6px] p-1.5"
                  onClick={() => {
                    setEditId(c.id);
                    setEditNome(c.nome);
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              )}
              {c.total === 0 && editId !== c.id && (
                <button
                  type="button"
                  aria-label={`Excluir ${c.nome}`}
                  title="Excluir (só aparece quando nenhum exame usa este nome)"
                  data-testid={`button-excluir-classificacao-${c.id}`}
                  className="btn-3d-soft rounded-[6px] p-1.5 text-destructive"
                  disabled={excluir.isPending}
                  onClick={() => excluir.mutate({ id: c.id })}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
<BotaoAtivo ativo={c.ativo} rotulo={c.nome} onChange={(v) => alternar.mutate({ id: c.id, ativo: v })} />
            </div>
          ))}
          {lista.length === 0 && <div className="text-sm text-muted-foreground">Nada cadastrado ainda.</div>}
        </div>
      )}
    </div>
  );
}

// ============================ PÁGINA =========================================
// Bloco independente: cadastro das classificações (usado como seção própria da tela unificada).
export function ClassificacoesCadastro() {
  return (
    <Tabs defaultValue="categoria" className="space-y-4">
      <TabsList className="h-auto flex-wrap justify-start gap-2 bg-transparent p-0">
        {CAMPOS_CLASS.map((c) => (
          <TabsTrigger key={c.campo} value={c.campo} className="paxter-seletor h-9 px-4 text-[11px] font-black uppercase tracking-wide">
            {c.plural}
          </TabsTrigger>
        ))}
      </TabsList>
      {CAMPOS_CLASS.map((c) => (
        <TabsContent key={c.campo} value={c.campo}>
          <ClassificacaoPainel item={c} />
        </TabsContent>
      ))}
    </Tabs>
  );
}

// As 4 listas legadas (Categorias, Subgrupos, Modalidades, Material/Setor) ficam ocultas na tela; o código e os dados continuam.
const MOSTRAR_CLASSIFICACOES_LEGADAS = false;

export default function CadastroExames({ comClassificacoes = MOSTRAR_CLASSIFICACOES_LEGADAS }: { comClassificacoes?: boolean }) {
  return (
    <div className="space-y-6">
      <div className="panel-3d p-4 flex items-center gap-4 border-l-4 border-primary/60">
        <div className="bevel-3d w-12 h-12 flex items-center justify-center text-primary shrink-0">
          <FolderTree className="h-6 w-6" />
        </div>
        <div className="min-w-0">
          <h1 className="text-2xl md:text-3xl font-black tracking-tight uppercase">Cadastro de Exames</h1>
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mt-1">
            Cadastre e organize exames, blocos e categorias do sistema.
          </p>
        </div>
        <div className="ml-auto"><UploadManualExames /></div>
      </div>

      <Tabs defaultValue="exames" className="space-y-4">
        <TabsList className="h-auto flex-wrap justify-start gap-2 bg-transparent p-0">
          <TabsTrigger value="exames" className="paxter-seletor h-10 gap-1.5 px-5 text-xs font-black uppercase tracking-wide">
            <TestTube className="h-4 w-4" /> Catálogo
          </TabsTrigger>
          <TabsTrigger value="blocos" className="paxter-seletor h-10 gap-1.5 px-5 text-xs font-black uppercase tracking-wide">
            <Layers className="h-4 w-4" /> Blocos clínicos e grades
          </TabsTrigger>
          <TabsTrigger value="opcoes" className="paxter-seletor h-10 gap-1.5 px-5 text-xs font-black uppercase tracking-wide">
            <Tags className="h-4 w-4" /> Gerenciamento de opções
          </TabsTrigger>
        </TabsList>
        <TabsContent value="exames">
          <ExamesTab />
        </TabsContent>
        <TabsContent value="blocos">
          <BlocosTab />
        </TabsContent>
        <TabsContent value="opcoes" className="space-y-6">
          <GestaoOpcoes extras={comClassificacoes ? CAMPOS_CLASS.map((c) => ({ chave: `class-${c.campo}`, rotulo: c.plural, conteudo: <ClassificacaoPainel item={c} /> })) : []} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
