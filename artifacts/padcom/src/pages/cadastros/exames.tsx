import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
import {
  Search,
  Plus,
  Pencil,
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
  exames: Array<{ nomeExame: string; codigoPadcom: string | null; ordem: number | null }>;
}
interface Bloco {
  codigoBloco: string;
  nomeBloco: string | null;
  tipoMacro: string | null;
  totalExames: number;
  graus: BlocoGrau[];
}
interface Categoria {
  nome: string;
  total: number;
}

const PETROLEO = "#3D7A7A";

type FormState = {
  id: number | null;
  codigoExame: string;
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

// ============================ ABA EXAMES =====================================
function ExamesTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [categoria, setCategoria] = useState("__all__");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

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
      if (!q) return true;
      return [e.nomeExame, e.codigoExame, e.grupoPrincipal, e.subgrupo, e.modalidade]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [exams, search, categoria]);

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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form.id ? body : { ...body, codigoExame: form.codigoExame }),
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
      setDialogOpen(false);
      toast({ title: form.id ? "Exame atualizado" : "Exame criado" });
    },
    onError: (err) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const toggleMutation = useMutation<Exam, Error, { id: number; ativo: boolean }>({
    mutationFn: async ({ id, ativo }) => {
      const r = await fetch(`/api/cadastros/exames/${id}/ativo`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
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
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  }
  function openEdit(e: Exam) {
    setForm({
      id: e.id,
      codigoExame: e.codigoExame ?? "",
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

  const canSave =
    form.nomeExame.trim().length > 0 &&
    (form.id !== null || form.codigoExame.trim().length > 0) &&
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
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-3">
          <Select value={categoria} onValueChange={setCategoria}>
            <SelectTrigger className="w-[220px]">
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
          <Badge variant="outline" className="whitespace-nowrap text-xs font-semibold">
            {isLoading ? "..." : `${filtered.length} de ${exams?.length ?? 0}`}
          </Badge>
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
        <div className="panel-3d overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-primary/10">
                <TableHead className="text-[10px] font-black uppercase tracking-widest text-primary">Código</TableHead>
                <TableHead className="text-[10px] font-black uppercase tracking-widest text-primary">Exame</TableHead>
                <TableHead className="text-[10px] font-black uppercase tracking-widest text-primary">Grupo</TableHead>
                <TableHead className="text-[10px] font-black uppercase tracking-widest text-primary">Modalidade</TableHead>
                <TableHead className="text-[10px] font-black uppercase tracking-widest text-primary">Preparo</TableHead>
                <TableHead className="text-center text-[10px] font-black uppercase tracking-widest text-primary">Ativo</TableHead>
                <TableHead className="text-right text-[10px] font-black uppercase tracking-widest text-primary">Ação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center text-sm text-muted-foreground">
                    Nenhum exame encontrado.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((e) => (
                  <TableRow key={e.id} className={`neon-hover ${e.ativo === false ? "opacity-50" : ""}`}>
                    <TableCell className="align-top text-xs font-mono text-muted-foreground">{txt(e.codigoExame)}</TableCell>
                    <TableCell className="align-top text-sm font-bold">{txt(e.nomeExame)}</TableCell>
                    <TableCell className="align-top text-sm">{txt(e.grupoPrincipal)}</TableCell>
                    <TableCell className="align-top text-sm">{txt(e.modalidade)}</TableCell>
                    <TableCell className="align-top max-w-[280px] truncate text-sm text-muted-foreground">{txt(e.preparo)}</TableCell>
                    <TableCell className="text-center align-top">
                      <Switch
                        checked={e.ativo !== false}
                        onCheckedChange={(v) => toggleMutation.mutate({ id: e.id, ativo: v })}
                      />
                    </TableCell>
                    <TableCell className="text-right align-top">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(e)} aria-label="Editar">
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{form.id ? "Editar exame" : "Novo exame"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Código *</label>
              <Input
                value={form.codigoExame}
                disabled={form.id !== null}
                onChange={(e) => setForm((f) => ({ ...f, codigoExame: e.target.value }))}
                placeholder="EX: EXAMSANGUE0001"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Nome do exame *</label>
              <Input
                value={form.nomeExame}
                onChange={(e) => setForm((f) => ({ ...f, nomeExame: e.target.value }))}
                placeholder="Ex.: Hemograma completo"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Grupo / Categoria</label>
              <Input
                value={form.grupoPrincipal}
                onChange={(e) => setForm((f) => ({ ...f, grupoPrincipal: e.target.value }))}
                placeholder="Ex.: HEMATOLOGICO"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Subgrupo</label>
              <Input
                value={form.subgrupo}
                onChange={(e) => setForm((f) => ({ ...f, subgrupo: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Modalidade</label>
              <Input
                value={form.modalidade}
                onChange={(e) => setForm((f) => ({ ...f, modalidade: e.target.value }))}
                placeholder="Ex.: USG, TC, RM (vazio = sangue)"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Material / Setor</label>
              <Input
                value={form.materialOuSetor}
                onChange={(e) => setForm((f) => ({ ...f, materialOuSetor: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Finalidade principal</label>
              <Input
                value={form.finalidadePrincipal}
                onChange={(e) => setForm((f) => ({ ...f, finalidadePrincipal: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Preparo</label>
              <Textarea
                rows={2}
                value={form.preparo}
                onChange={(e) => setForm((f) => ({ ...f, preparo: e.target.value }))}
                placeholder="Ex.: Jejum de 8 horas"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={!canSave}
              className="btn-3d"
            >
              {saveMutation.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================ ABA BLOCOS =====================================
function BlocosTab() {
  const [search, setSearch] = useState("");
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
            className="pl-9"
          />
        </div>
        <Badge variant="outline" className="whitespace-nowrap text-xs font-semibold">
          {filtered.length} blocos
        </Badge>
      </div>
      <p className="text-sm text-muted-foreground">
        Cada bloco é um painel de exames com graus (Básica, Intermediária, Sofisticada). No Prescritor de Exames você
        adiciona um painel inteiro de uma só vez.
      </p>

      <Accordion type="multiple" className="space-y-2">
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
              <div className="grid grid-cols-1 gap-3 pb-2 md:grid-cols-3">
                {b.graus.map((g) => (
                  <div key={g.grau} className="panel-3d-sub p-3">
                    <div className="mb-2 text-[10px] font-black uppercase tracking-widest text-primary">
                      {g.grau} ({g.exames.length})
                    </div>
                    <ul className="space-y-0.5">
                      {g.exames.map((ex, i) => (
                        <li key={i} className="text-xs text-slate-600">
                          {ex.nomeExame}
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
    </div>
  );
}

// ============================ ABA CATEGORIAS =================================
function CategoriasTab() {
  const { data, isLoading } = useQuery<Categoria[]>({
    queryKey: ["/api/cadastros/categorias"],
    queryFn: async () => {
      const r = await fetch("/api/cadastros/categorias");
      if (!r.ok) throw new Error("Falha ao carregar categorias");
      return r.json();
    },
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {Array.from({ length: 12 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Categorias são o campo "Grupo" de cada exame. Para mover um exame de categoria, edite o exame na aba Exames.
      </p>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
        {(data ?? []).map((c) => (
          <div
            key={c.nome}
            className="panel-3d-sub p-3 border-l-4 border-primary/50 neon-hover"
          >
            <div className="text-xs font-black uppercase tracking-wide">{c.nome}</div>
            <div className="mt-1 screen-3d text-xs font-black px-2 py-0.5 inline-block">{c.total} exames</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================ PÁGINA =========================================
export default function CadastroExames() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="bevel-3d w-11 h-11 flex items-center justify-center text-primary">
          <FolderTree className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-3xl font-black tracking-tight uppercase">Cadastro de Exames</h1>
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mt-1">
            Cadastre e organize exames, blocos e categorias do sistema.
          </p>
        </div>
      </div>

      <Tabs defaultValue="exames" className="space-y-4">
        <TabsList className="concave-3d p-1">
          <TabsTrigger value="exames" className="gap-1.5 text-xs font-black uppercase tracking-wide">
            <TestTube className="h-4 w-4" /> Exames
          </TabsTrigger>
          <TabsTrigger value="blocos" className="gap-1.5 text-xs font-black uppercase tracking-wide">
            <Layers className="h-4 w-4" /> Blocos
          </TabsTrigger>
          <TabsTrigger value="categorias" className="gap-1.5 text-xs font-black uppercase tracking-wide">
            <Tags className="h-4 w-4" /> Categorias
          </TabsTrigger>
        </TabsList>
        <TabsContent value="exames">
          <ExamesTab />
        </TabsContent>
        <TabsContent value="blocos">
          <BlocosTab />
        </TabsContent>
        <TabsContent value="categorias">
          <CategoriasTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
