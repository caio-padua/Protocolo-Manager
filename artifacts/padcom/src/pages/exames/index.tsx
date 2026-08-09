import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { PaxterClientSelector } from "@/components/PaxterClientSelector";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useToast } from "@/hooks/use-toast";
import {
  Search,
  Droplets,
  ScanLine,
  Activity,
  Trash2,
  FileDown,
  Mail,
  MessageCircle,
  Send,
  ClipboardList,
  List,
  Layers,
  Plus,
} from "lucide-react";

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

interface Client {
  id: number;
  name: string;
  cpf?: string | null;
  email?: string | null;
  phone?: string | null;
}

interface Professional {
  id: number;
  name: string;
  crm?: string | null;
}

type Tipo = "SANGUE" | "IMAGEM" | "OUTROS";

interface CartItem {
  id: number;
  nomeExame: string;
  codigoExame: string | null;
  grupoPrincipal: string | null;
  preparo: string | null;
  tipo: Tipo;
}

interface EmitResult {
  pdfs: Array<{ id: number; tipo: string; tipoLabel: string; fileName: string; examCount: number; url: string }>;
  email: { attempted: boolean; success: boolean; error?: string };
  whatsapp: { attempted: boolean; success: boolean; error?: string };
}

interface BlocoGrau {
  grau: string;
  exames: Array<{ nomeExame: string; codigoPadcom: string | null; ordem: number | null }>;
}
interface Bloco {
  codigoBloco: string;
  nomeBloco: string | null;
  tipoMacro: string | null;
  totalExames: number;
  graus: BlocoGrau[];
}

type ViewMode = "lista" | "bloco";

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return h;
}

const TIPO_META: Record<Tipo, { label: string; icon: typeof Droplets; color: string }> = {
  SANGUE: { label: "Sangue / Laboratorial", icon: Droplets, color: "#B91C1C" },
  IMAGEM: { label: "Imagem", icon: ScanLine, color: "#1D4ED8" },
  OUTROS: { label: "Outros / Procedimentos", icon: Activity, color: "#7C3AED" },
};

const IMAGING_MODALITIES = ["USG", "TC", "RM", "RX", "DENSITOMETRIA", "MAMOGRAFIA"];

function noAccents(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function classifyTipo(
  modalidade: string | null,
  material: string | null,
  grupo: string | null,
): Tipo {
  const m = (modalidade ?? "").trim().toUpperCase();
  const mat = (material ?? "").trim().toUpperCase();
  const g = noAccents((grupo ?? "").trim().toUpperCase());

  // Endoscopia / procedimentos endoscópicos
  if (m.includes("ENDOSCOP") || g.includes("ENDOSCOP")) return "OUTROS";

  // Imagem — por modalidade, material ou grupo (muitos exames de imagem têm
  // modalidade nula e só o grupo "BLOCO ... DE IMAGEM / RESSONANCIA / RX ...")
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

  // Cardiológico funcional (ECG, ergometria, holter) — procedimento, não sangue
  if (m === "CARDIO" || mat === "FUNCIONAL") return "OUTROS";

  return "SANGUE";
}

export default function ExamesPage({
  clientId: clientIdProp,
  embedded,
  initialViewMode,
}: { clientId?: number; embedded?: boolean; initialViewMode?: ViewMode } = {}) {
  const { toast } = useToast();
  const [clientId, setClientId] = useState<number | null>(clientIdProp ?? null);
  const [professionalId, setProfessionalId] = useState<string>("");
  const [categoria, setCategoria] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>(initialViewMode ?? (embedded ? "bloco" : "lista"));
  const [blocoSearch, setBlocoSearch] = useState("");
  const [cart, setCart] = useState<Record<number, CartItem>>({});
  const [observacao, setObservacao] = useState("");
  const [sendEmail, setSendEmail] = useState(false);
  const [sendWhatsapp, setSendWhatsapp] = useState(false);
  const [result, setResult] = useState<EmitResult | null>(null);

  useEffect(() => {
    if (clientIdProp) setClientId(clientIdProp);
  }, [clientIdProp]);

  const { data: clients } = useQuery<Client[]>({
    queryKey: ["/api/clients"],
    queryFn: async () => {
      const r = await fetch("/api/clients");
      if (!r.ok) throw new Error("Falha ao carregar clientes");
      return r.json();
    },
  });

  const { data: professionals } = useQuery<Professional[]>({
    queryKey: ["/api/professionals"],
    queryFn: async () => {
      const r = await fetch("/api/professionals");
      if (!r.ok) throw new Error("Falha ao carregar profissionais");
      return r.json();
    },
  });

  const { data: exams, isLoading } = useQuery<Exam[]>({
    queryKey: ["/api/catalogos/exames"],
    queryFn: async () => {
      const r = await fetch("/api/catalogos/exames");
      if (!r.ok) throw new Error("Falha ao carregar exames");
      return r.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: blocos, isLoading: blocosLoading } = useQuery<Bloco[]>({
    queryKey: ["/api/cadastros/blocos"],
    queryFn: async () => {
      const r = await fetch("/api/cadastros/blocos");
      if (!r.ok) throw new Error("Falha ao carregar blocos");
      return r.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const examByName = useMemo(() => {
    const m = new Map<string, Exam>();
    for (const e of exams ?? []) {
      if (e.ativo === false) continue;
      if (e.nomeExame) {
        const k = noAccents(e.nomeExame).toUpperCase().trim();
        if (!m.has(k)) m.set(k, e); // primeiro vence; nao sobrescreve duplicata
      }
    }
    return m;
  }, [exams]);

  const examByCodigo = useMemo(() => {
    const m = new Map<string, Exam>();
    for (const e of exams ?? []) {
      if (e.ativo === false) continue;
      if (e.codigoExame) m.set(e.codigoExame.toUpperCase().trim(), e);
    }
    return m;
  }, [exams]);

  const filteredBlocos = useMemo(() => {
    const q = noAccents(blocoSearch).toLowerCase().trim();
    if (!q) return blocos ?? [];
    return (blocos ?? []).filter(
      (b) =>
        noAccents(b.nomeBloco ?? "").toLowerCase().includes(q) ||
        noAccents(b.tipoMacro ?? "").toLowerCase().includes(q),
    );
  }, [blocos, blocoSearch]);

  const categorias = useMemo(() => {
    const set = new Set<string>();
    for (const e of exams ?? []) {
      if (e.grupoPrincipal) set.add(e.grupoPrincipal);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [exams]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (exams ?? []).filter((e) => {
      if (e.ativo === false) return false;
      if (categoria !== "all" && e.grupoPrincipal !== categoria) return false;
      if (!term) return true;
      return [e.nomeExame, e.codigoExame, e.grupoPrincipal, e.subgrupo]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(term));
    });
  }, [exams, categoria, search]);

  const grouped = useMemo(() => {
    const g: Record<Tipo, Exam[]> = { SANGUE: [], IMAGEM: [], OUTROS: [] };
    for (const e of filtered) {
      g[classifyTipo(e.modalidade, e.materialOuSetor, e.grupoPrincipal)].push(e);
    }
    return g;
  }, [filtered]);

  const cartList = useMemo(() => Object.values(cart), [cart]);
  const cartByTipo = useMemo(() => {
    const g: Record<Tipo, CartItem[]> = { SANGUE: [], IMAGEM: [], OUTROS: [] };
    for (const i of cartList) g[i.tipo].push(i);
    return g;
  }, [cartList]);

  function toggleExam(e: Exam) {
    setCart((prev) => {
      const next = { ...prev };
      if (next[e.id]) {
        delete next[e.id];
      } else {
        next[e.id] = {
          id: e.id,
          nomeExame: e.nomeExame ?? "(sem nome)",
          codigoExame: e.codigoExame,
          grupoPrincipal: e.grupoPrincipal,
          preparo: e.preparo,
          tipo: classifyTipo(e.modalidade, e.materialOuSetor, e.grupoPrincipal),
        };
      }
      return next;
    });
  }

  function removeFromCart(id: number) {
    setCart((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  function addBlocoGrau(bloco: Bloco, grau: BlocoGrau) {
    let added = 0;
    let semMatch = 0;
    setCart((prev) => {
      const next = { ...prev };
      for (const ex of grau.exames) {
        const norm = noAccents(ex.nomeExame).toUpperCase().trim();
        // 1) casa por codigo (mais confiavel); 2) fallback por nome normalizado
        const match =
          (ex.codigoPadcom ? examByCodigo.get(ex.codigoPadcom.toUpperCase().trim()) : undefined) ??
          examByName.get(norm);
        if (match) {
          if (!next[match.id]) {
            next[match.id] = {
              id: match.id,
              nomeExame: match.nomeExame ?? ex.nomeExame,
              codigoExame: match.codigoExame,
              grupoPrincipal: match.grupoPrincipal,
              preparo: match.preparo,
              tipo: classifyTipo(match.modalidade, match.materialOuSetor, match.grupoPrincipal),
            };
            added++;
          }
        } else {
          // Sem match no catalogo: cria item por nome. Classifica pelo tipoMacro
          // do bloco (nao assume SANGUE). Resolve colisao de id sintetico por sondagem.
          semMatch++;
          let sid = -Math.abs(hashStr(norm)) - 1;
          while (next[sid] && next[sid].nomeExame !== ex.nomeExame) sid--;
          if (!next[sid]) {
            next[sid] = {
              id: sid,
              nomeExame: ex.nomeExame,
              codigoExame: ex.codigoPadcom,
              grupoPrincipal: bloco.tipoMacro,
              preparo: null,
              tipo: classifyTipo(null, null, bloco.tipoMacro),
            };
            added++;
          }
        }
      }
      return next;
    });
    toast({
      title: `${bloco.nomeBloco} — ${grau.grau}`,
      description:
        `${added} exame(s) adicionado(s) ao carrinho.` +
        (semMatch > 0 ? ` (${semMatch} sem correspondencia no catalogo)` : ""),
    });
  }

  const emitMutation = useMutation<EmitResult, Error>({
    mutationFn: async () => {
      const r = await fetch("/api/exam-requests/emit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: Number(clientId),
          professionalId: professionalId ? Number(professionalId) : undefined,
          observacao: observacao.trim() || undefined,
          sendEmail,
          sendWhatsapp,
          items: cartList.map((i) => ({
            nomeExame: i.nomeExame,
            codigoExame: i.codigoExame,
            grupoPrincipal: i.grupoPrincipal,
            preparo: i.preparo,
            tipo: i.tipo,
          })),
        }),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.error ?? "Falha ao gerar PDFs");
      }
      return r.json();
    },
    onSuccess: (data) => {
      setResult(data);
      const parts: string[] = [`${data.pdfs.length} PDF(s) gerado(s)`];
      if (data.email.attempted) parts.push(data.email.success ? "e-mail enviado" : `e-mail falhou (${data.email.error})`);
      if (data.whatsapp.attempted) parts.push(data.whatsapp.success ? "WhatsApp enviado" : `WhatsApp falhou (${data.whatsapp.error})`);
      toast({ title: "Solicitação de exames", description: parts.join(" • ") });
    },
    onError: (err) => {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    },
  });

  const canEmit = clientId && cartList.length > 0 && !emitMutation.isPending;

  return (
    <div className={embedded ? "space-y-6" : "p-6 space-y-6"}>
      {!embedded && (
        <div className="panel-3d p-4 flex items-center gap-4 border-l-4 border-primary/60">
          <div className="bevel-3d w-12 h-12 flex items-center justify-center text-primary shrink-0">
            <ClipboardList className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl md:text-3xl font-black tracking-tight uppercase">Prescritor de Exames</h1>
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mt-1">
              Separa SANGUE e IMAGEM e gera PDF por tipo, sem misturar.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Catálogo de exames */}
        <div className="lg:col-span-2 space-y-4">
          {/* Alternador de modo: Por Lista / Por Bloco */}
          <div className="concave-3d inline-flex p-0.5 gap-0.5">
            <button
              type="button"
              onClick={() => setViewMode("lista")}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-black uppercase tracking-wide transition-colors ${
                viewMode === "lista" ? "btn-3d" : "text-muted-foreground neon-hover px-3 py-1.5"
              }`}
              style={{ borderRadius: "4px" }}
            >
              <List className="w-4 h-4" /> Por Lista
            </button>
            <button
              type="button"
              onClick={() => setViewMode("bloco")}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-black uppercase tracking-wide transition-colors ${
                viewMode === "bloco" ? "btn-3d" : "text-muted-foreground neon-hover px-3 py-1.5"
              }`}
              style={{ borderRadius: "4px" }}
            >
              <Layers className="w-4 h-4" /> Por Bloco
            </button>
          </div>

          {viewMode === "lista" ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Select value={categoria} onValueChange={setCategoria}>
                  <SelectTrigger className="field-engraved">
                    <SelectValue placeholder="Categoria" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as categorias</SelectItem>
                    {categorias.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    className="pl-9 field-engraved"
                    placeholder="Buscar exame..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
              </div>

              {isLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              ) : (
                (Object.keys(TIPO_META) as Tipo[]).map((tipo) => {
                  const list = grouped[tipo];
                  if (list.length === 0) return null;
                  const Meta = TIPO_META[tipo];
                  const Icon = Meta.icon;
                  return (
                    <div key={tipo} className="panel-3d overflow-hidden">
                      <div
                        className="px-4 py-2.5 flex items-center gap-2 text-white text-xs font-black uppercase tracking-wider"
                        style={{ background: Meta.color }}
                      >
                        <Icon className="w-4 h-4" />
                        {Meta.label}
                        <span className="ml-auto opacity-80">{list.length}</span>
                      </div>
                      <div className="divide-y max-h-72 overflow-y-auto">
                        {list.map((e) => (
                          <label
                            key={e.id}
                            className="flex items-start gap-3 px-4 py-2 neon-hover cursor-pointer"
                          >
                            <Checkbox
                              checked={!!cart[e.id]}
                              onCheckedChange={() => toggleExam(e)}
                              className="mt-0.5"
                            />
                            <div className="min-w-0">
                              <div className="text-sm text-foreground">{e.nomeExame}</div>
                              <div className="text-xs text-muted-foreground">
                                {[e.codigoExame, e.grupoPrincipal].filter(Boolean).join(" • ")}
                              </div>
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })
              )}
            </>
          ) : (
            <>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  className="pl-9 field-engraved"
                  placeholder="Buscar bloco..."
                  value={blocoSearch}
                  onChange={(e) => setBlocoSearch(e.target.value)}
                />
              </div>
              <div className="concave-3d flex items-start gap-2.5 px-3 py-2.5 text-xs text-muted-foreground">
                <Layers className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
                <span>
                  Escolha um bloco e clique em um grau (Básica, Intermediária ou Sofisticada) para adicionar todos os
                  exames daquele painel ao carrinho de uma vez.
                </span>
              </div>

              {blocosLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : embedded ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {filteredBlocos.map((b) => (
                    <div
                      key={b.codigoBloco}
                      className="panel-3d-sub border-l-4 border-primary/50 p-3 flex flex-col"
                    >
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <span className="text-xs font-black uppercase tracking-wide">{b.nomeBloco}</span>
                        {b.tipoMacro && (
                          <Badge variant="secondary" className="text-[10px] uppercase">
                            {b.tipoMacro}
                          </Badge>
                        )}
                      </div>
                      <div className="space-y-3 flex-1">
                        {b.graus.map((g) => (
                          <div key={g.grau} className="concave-3d p-2.5 flex flex-col">
                            <div className="mb-1.5 text-[10px] font-black uppercase tracking-widest text-primary">
                              {g.grau} ({g.exames.length})
                            </div>
                            <ul className="space-y-0.5 mb-2 flex-1">
                              {g.exames.map((ex, i) => (
                                <li key={i} className="text-xs text-muted-foreground">
                                  {ex.nomeExame}
                                </li>
                              ))}
                            </ul>
                            <Button
                              size="sm"
                              className="btn-3d-soft w-full"
                              onClick={() => addBlocoGrau(b, g)}
                            >
                              <Plus className="w-3.5 h-3.5 mr-1" /> Adicionar painel
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <Accordion type="multiple" className="space-y-2">
                  {filteredBlocos.map((b) => (
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
                        <div className="grid grid-cols-1 gap-3 pb-2 md:grid-cols-3">
                          {b.graus.map((g) => (
                            <div key={g.grau} className="panel-3d-sub p-3 flex flex-col">
                              <div className="mb-2 text-[10px] font-black uppercase tracking-widest text-primary">
                                {g.grau} ({g.exames.length})
                              </div>
                              <ul className="space-y-0.5 mb-3 flex-1">
                                {g.exames.map((ex, i) => (
                                  <li key={i} className="text-xs text-muted-foreground">
                                    {ex.nomeExame}
                                  </li>
                                ))}
                              </ul>
                              <Button
                                size="sm"
                                className="btn-3d-soft w-full"
                                onClick={() => addBlocoGrau(b, g)}
                              >
                                <Plus className="w-3.5 h-3.5 mr-1" /> Adicionar painel
                              </Button>
                            </div>
                          ))}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              )}
            </>
          )}
        </div>

        {/* Carrinho + ações */}
        <div className="space-y-4">
          <div className="panel-3d p-4 space-y-3">
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Paciente</label>
              {clientIdProp ? (
                <div className="field-engraved px-3 py-2 text-sm text-foreground/90">
                  {clients?.find((c) => c.id === clientId)?.name ?? "Paciente selecionado"}
                </div>
              ) : (
                <PaxterClientSelector
                  clientes={clients ?? []}
                  value={clientId}
                  onChange={setClientId}
                  placeholder="Selecionar paciente"
                />
              )}
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                Médico solicitante (opcional)
              </label>
              <Select value={professionalId} onValueChange={setProfessionalId}>
                <SelectTrigger className="field-engraved">
                  <SelectValue placeholder="Selecionar médico" />
                </SelectTrigger>
                <SelectContent>
                  {(professionals ?? []).map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.name}
                      {p.crm ? ` — CRM ${p.crm}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="panel-3d-sub p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Selecionados</span>
              <span className="screen-3d text-xs font-black px-2 py-0.5">{cartList.length}</span>
            </div>
            {cartList.length === 0 ? (
              <p className="text-sm text-muted-foreground">Marque os exames à esquerda.</p>
            ) : (
              (Object.keys(TIPO_META) as Tipo[]).map((tipo) => {
                const list = cartByTipo[tipo];
                if (list.length === 0) return null;
                const Meta = TIPO_META[tipo];
                return (
                  <div key={tipo} className="space-y-1">
                    <div className="text-xs font-semibold uppercase" style={{ color: Meta.color }}>
                      {Meta.label} ({list.length})
                    </div>
                    {list.map((i) => (
                      <div key={i.id} className="flex items-center gap-2 text-sm text-foreground/80">
                        <span className="truncate flex-1">{i.nomeExame}</span>
                        <button
                          onClick={() => removeFromCart(i.id)}
                          className="text-muted-foreground hover:text-red-600"
                          aria-label="Remover"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                );
              })
            )}
          </div>

          <div className="panel-3d p-4 space-y-3">
            <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Observações (opcional)</label>
            <Textarea
              rows={2}
              placeholder="Jejum, instruções, etc."
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              className="field-engraved"
            />
            <label className="flex items-center gap-2 text-sm text-foreground/80 cursor-pointer">
              <Checkbox checked={sendEmail} onCheckedChange={(v) => setSendEmail(!!v)} />
              <Mail className="w-4 h-4 text-muted-foreground" /> Enviar por e-mail ao paciente
            </label>
            <label className="flex items-center gap-2 text-sm text-foreground/80 cursor-pointer">
              <Checkbox checked={sendWhatsapp} onCheckedChange={(v) => setSendWhatsapp(!!v)} />
              <MessageCircle className="w-4 h-4 text-muted-foreground" /> Enviar por WhatsApp ao paciente
            </label>
            <Button
              className="btn-3d w-full"
              disabled={!canEmit}
              onClick={() => emitMutation.mutate()}
            >
              <Send className="w-4 h-4 mr-2" />
              {emitMutation.isPending ? "Gerando..." : "Gerar e Enviar"}
            </Button>
          </div>

          {result && (
            <div className="panel-3d p-4 space-y-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">PDFs gerados</span>
              {result.pdfs.map((p) => (
                <a
                  key={p.id}
                  href={p.url}
                  target="_blank"
                  rel="noreferrer"
                  className="concave-3d flex items-center gap-2 text-sm text-primary px-3 py-1.5 neon-hover"
                >
                  <FileDown className="w-4 h-4" />
                  {p.tipoLabel} ({p.examCount})
                </a>
              ))}
              {result.email.attempted && (
                <div className="text-xs">
                  E-mail: {result.email.success ? "enviado" : `falhou — ${result.email.error}`}
                </div>
              )}
              {result.whatsapp.attempted && (
                <div className="text-xs">
                  WhatsApp: {result.whatsapp.success ? "enviado" : `falhou — ${result.whatsapp.error}`}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
