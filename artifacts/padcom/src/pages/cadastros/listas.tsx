import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListCatalogOptions,
  useCreateCatalogOption,
  useUpdateCatalogOption,
  useDeleteCatalogOption,
} from "@workspace/api-client-react";
import { CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Plus, Trash2, Check, X, Pencil, FolderTree } from "lucide-react";
import { toast } from "sonner";

const CATALOG_OPTIONS_KEY = ["/api/catalog-options"] as const;

const KINDS: { kind: string; title: string; subtitle: string }[] = [
  {
    kind: "substance_category",
    title: "Categorias",
    subtitle: "Usadas no campo CATEGORIA do cadastro de substâncias.",
  },
  {
    kind: "substance_type",
    title: "Tipos",
    subtitle: "Usados no campo TIPO / CATEGORIA (EXIBIÇÃO) das substâncias.",
  },
];

function OptionList({ kind, subtitle }: { kind: string; subtitle: string }) {
  const qc = useQueryClient();
  const { data, isLoading } = useListCatalogOptions({ kind, all: "true" });
  const createMut = useCreateCatalogOption();
  const updateMut = useUpdateCatalogOption();
  const deleteMut = useDeleteCatalogOption();

  const invalidate = () => qc.invalidateQueries({ queryKey: CATALOG_OPTIONS_KEY });

  const [novo, setNovo] = useState("");
  const [editId, setEditId] = useState<number | null>(null);
  const [editLabel, setEditLabel] = useState("");

  const options = data ?? [];

  async function adicionar() {
    const label = novo.trim();
    if (!label) return;
    if (options.some((o) => o.label.toLowerCase() === label.toLowerCase())) {
      toast.error("Essa opção já existe.");
      return;
    }
    await createMut.mutateAsync({ data: { kind, label } });
    setNovo("");
    toast.success("Opção adicionada.");
    invalidate();
  }

  async function salvarEdicao(id: number) {
    const label = editLabel.trim();
    if (!label) return;
    await updateMut.mutateAsync({ id, data: { kind, label } });
    setEditId(null);
    setEditLabel("");
    toast.success("Opção atualizada.");
    invalidate();
  }

  async function alternarAtivo(id: number, active: boolean) {
    await updateMut.mutateAsync({ id, data: { kind, label: options.find((o) => o.id === id)!.label, active } });
    invalidate();
  }

  async function remover(id: number) {
    await deleteMut.mutateAsync({ id });
    toast.success("Opção desativada.");
    invalidate();
  }

  return (
    <div className="space-y-4">
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{subtitle}</p>

      <div className="flex items-center gap-2">
        <Input
          placeholder="Nova opção..."
          value={novo}
          onChange={(e) => setNovo(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") adicionar(); }}
          className="max-w-xs field-engraved"
        />
        <Button className="btn-3d" onClick={adicionar} disabled={createMut.isPending || !novo.trim()}>
          <Plus className="w-4 h-4 mr-1" /> Adicionar
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-10 panel-3d-sub" />
          <Skeleton className="h-10 panel-3d-sub" />
          <Skeleton className="h-10 panel-3d-sub" />
        </div>
      ) : options.length === 0 ? (
        <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide py-6 text-center">
          Nenhuma opção cadastrada ainda.
        </p>
      ) : (
        <div className="panel-3d overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-primary/10">
                <TableHead className="text-[10px] font-black uppercase tracking-widest text-primary">Opção</TableHead>
                <TableHead className="text-[10px] font-black uppercase tracking-widest text-primary w-28">Situação</TableHead>
                <TableHead className="text-[10px] font-black uppercase tracking-widest text-primary w-40 text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {options.map((o) => (
                <TableRow key={o.id} className={`neon-hover transition-all ${o.active ? "" : "opacity-50"}`}>
                  <TableCell>
                    {editId === o.id ? (
                      <div className="flex items-center gap-2">
                        <Input
                          value={editLabel}
                          onChange={(e) => setEditLabel(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") salvarEdicao(o.id);
                            if (e.key === "Escape") setEditId(null);
                          }}
                          className="max-w-xs h-8 field-engraved"
                          autoFocus
                        />
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => salvarEdicao(o.id)}>
                          <Check className="w-4 h-4 text-emerald-600" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditId(null)}>
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    ) : (
                      <span className="font-semibold">{o.label}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Switch checked={o.active} onCheckedChange={(v) => alternarAtivo(o.id, v)} />
                      <span className={`concave-3d px-2 py-0.5 text-[9px] font-black uppercase tracking-widest ${o.active ? "text-emerald-700" : "text-muted-foreground"}`}>
                        {o.active ? "Ativa" : "Inativa"}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    {editId !== o.id && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={() => { setEditId(o.id); setEditLabel(o.label); }}
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                    )}
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-destructive"
                      onClick={() => remover(o.id)}
                      title="Desativar"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

export default function CadastroListas() {
  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <div className="bevel-3d w-10 h-10 flex items-center justify-center text-primary">
          <FolderTree className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-2xl font-black tracking-tight uppercase">Listas Gerenciáveis</h1>
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mt-1">
            Opções que aparecem nos menus suspensos do sistema.
          </p>
        </div>
      </div>

      <div className="panel-3d">
        <div className="px-6 pt-5 pb-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-primary">Substâncias</span>
        </div>
        <CardContent className="pt-2">
          <Tabs defaultValue={KINDS[0].kind}>
            <TabsList className="concave-3d p-1 mb-4">
              {KINDS.map((k) => (
                <TabsTrigger key={k.kind} value={k.kind} className="text-xs font-bold uppercase tracking-wide">
                  {k.title}
                </TabsTrigger>
              ))}
            </TabsList>
            {KINDS.map((k) => (
              <TabsContent key={k.kind} value={k.kind} className="pt-2">
                <OptionList kind={k.kind} subtitle={k.subtitle} />
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </div>
    </div>
  );
}
