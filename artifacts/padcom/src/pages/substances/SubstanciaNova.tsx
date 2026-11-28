import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useCreateSubstance, getListSubstancesQueryKey } from "@workspace/api-client-react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const PROCEDIMENTOS = [
  { v: "iv", t: "Endovenosa (EV)" }, { v: "im", t: "Intramuscular (IM)" },
  { v: "sc", t: "Subcutânea (SC)" }, { v: "implante", t: "Implante" },
];

/** Cadastro mínimo (nome, categoria, cor, via); o restante é completado em Editar. */
export function SubstanciaNova({ categorias, onClose, onCriada }: {
  categorias: string[]; onClose: () => void; onCriada: (id: number) => void;
}) {
  const qc = useQueryClient();
  const criar = useCreateSubstance();
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [color, setColor] = useState("#16284a");
  const [procedureType, setProcedureType] = useState("iv");
  const [erro, setErro] = useState<string | null>(null);

  const salvar = async () => {
    setErro(null);
    if (!name.trim() || !category.trim()) { setErro("Informe o nome e a categoria."); return; }
    try {
      const nova: any = await criar.mutateAsync({
        data: { name: name.trim(), category: category.trim(), color, stockQuantity: 0, procedureType } as any,
      });
      await qc.invalidateQueries({ queryKey: getListSubstancesQueryKey() });
      onCriada(nova?.id);
      onClose();
    } catch (e: any) {
      const st = e?.status;
      setErro(st === 403 ? "Seu acesso não permite cadastrar substâncias." : st === 401 ? "Entre novamente para cadastrar." : "Não foi possível cadastrar a substância.");
    }
  };

  return (
    <section className="panel-3d p-4 sm:p-5" aria-label="Nova substância" data-testid="form-nova-substancia">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="bevel-3d inline-flex items-center gap-2 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-primary">
          <Plus className="h-4 w-4" aria-hidden="true" /> Nova substância
        </div>
        <Button type="button" variant="outline" size="icon" className="btn-3d-soft h-9 w-9" aria-label="Fechar" onClick={onClose} disabled={criar.isPending}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground">Nome *
          <Input className="field-engraved mt-1 min-h-11" value={name} onChange={(e) => setName(e.target.value)} data-testid="input-nova-substancia-nome" />
        </label>
        <label className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground">Categoria *
          <Input className="field-engraved mt-1 min-h-11" list="categorias-substancia" value={category} onChange={(e) => setCategory(e.target.value)} data-testid="input-nova-substancia-categoria" />
          <datalist id="categorias-substancia">{categorias.map((c) => <option key={c} value={c} />)}</datalist>
        </label>
        <label className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground">Via de aplicação
          <select className="field-engraved mt-1 min-h-11 w-full border border-input px-3 text-sm text-foreground" value={procedureType} onChange={(e) => setProcedureType(e.target.value)}>
            {PROCEDIMENTOS.map((p) => <option key={p.v} value={p.v}>{p.t}</option>)}
          </select>
        </label>
        <label className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground">Cor de identificação
          <input type="color" className="mt-1 block h-11 w-full cursor-pointer border border-input bg-transparent" value={color} onChange={(e) => setColor(e.target.value)} />
        </label>
      </div>
      {erro && <p className="mt-3 text-sm text-amber-700" role="alert">{erro}</p>}
      <div className="mt-4 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" className="btn-3d-soft min-h-11" onClick={onClose} disabled={criar.isPending}>Cancelar</Button>
        <Button type="button" className="btn-3d min-h-11" onClick={salvar} disabled={criar.isPending} data-testid="button-salvar-nova-substancia">
          {criar.isPending ? "Salvando…" : "Cadastrar"}
        </Button>
      </div>
    </section>
  );
}
