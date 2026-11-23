import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { collabAuthHeaders } from "@/lib/collab-auth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Check, X } from "lucide-react";

// Cores oficiais por natureza (retângulos indicadores). Prefixos de código são só visuais.
export const NATUREZA_COR: Record<string, string> = {
  "LABORATORIAL": "#0F1E36",
  "IMAGEM": "#B45309",
  "COMPOSICAO CORPORAL": "#047857",
  "METODOS GRAFICOS": "#4338CA",
  "ENDOSCOPICOS": "#BE123C",
};

// Sugestão apenas visual a partir da modalidade existente (nada é gravado por isso).
export function naturezaSugerida(modalidade: string | null | undefined): string | null {
  const m = (modalidade ?? "").trim().toUpperCase();
  if (!m) return null;
  if (m === "LABORATORIAL" || m === "GENETICA") return "LABORATORIAL";
  if (["USG", "TC", "RM", "RX", "MAMOGRAFIA", "DENSITOMETRIA", "CARDIO / IMAGEM"].includes(m)) return "IMAGEM";
  if (m.startsWith("ENDOSC")) return "ENDOSCOPICOS";
  if (m === "CARDIO") return "METODOS GRAFICOS";
  return null;
}

export function NaturezaChip({ natureza, sugerida }: { natureza: string | null; sugerida?: boolean }) {
  if (!natureza) return <span className="text-xs text-muted-foreground">—</span>;
  const cor = NATUREZA_COR[natureza.toUpperCase()] ?? "#475569";
  return (
    <span
      className="inline-block rounded-[4px] px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-white"
      style={{ backgroundColor: cor, opacity: sugerida ? 0.75 : 1 }}
      title={sugerida ? "Sugerida pela modalidade (não gravada)" : "Natureza cadastrada"}
      data-testid="chip-natureza"
    >
      {natureza}
    </span>
  );
}

export interface Atributos {
  exameId: number;
  natureza: string | null;
  metodo: string | null;
  regiao: string | null;
  material: string | null;
  lateralidade: string | null;
  contraste: string | null;
  tipoResultado: string | null;
  prioridade: string | null;
  eixos: string[];
  sinonimos: string[];
  gatilhos: string[];
}

interface Opcao {
  id: number;
  nome: string;
  ativo: boolean;
  total: number;
}
type Tipo = "natureza" | "metodo" | "eixo" | "regiao" | "material" | "gatilho";

export function useOpcoes(tipo: Tipo, enabled = true) {
  return useQuery<Opcao[]>({
    queryKey: ["/api/cadastros/opcoes-exame", tipo],
    queryFn: async () => {
      const r = await fetch(`/api/cadastros/opcoes-exame?tipo=${tipo}`);
      if (!r.ok) throw new Error("Falha ao carregar opções");
      return r.json();
    },
    enabled,
  });
}

export function useAtributos() {
  return useQuery<Atributos[]>({
    queryKey: ["/api/cadastros/exames-atributos"],
    queryFn: async () => {
      const r = await fetch("/api/cadastros/exames-atributos");
      if (!r.ok) throw new Error("Falha ao carregar atributos");
      return r.json();
    },
  });
}

function useCriarOpcao(tipo: Tipo) {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation<Opcao, Error, string>({
    mutationFn: async (nome) => {
      const r = await fetch("/api/cadastros/opcoes-exame", {
        method: "POST",
        headers: collabAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ tipo, nome }),
      });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(b.error ?? "Falha ao criar opção");
      return b;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/cadastros/opcoes-exame", tipo] }),
    onError: (e) => toast({ title: "Não foi possível criar", description: e.message, variant: "destructive" }),
  });
}

// Select de opção única com "+ Nova" sem sair do formulário.
function OpcaoSelect({ tipo, valor, onChange, rotulo }: { tipo: Tipo; valor: string; onChange: (v: string) => void; rotulo: string }) {
  const { data } = useOpcoes(tipo);
  const criar = useCriarOpcao(tipo);
  const [novo, setNovo] = useState<string | null>(null);
  const nomes = (data ?? []).filter((o) => o.ativo).map((o) => o.nome);
  const legado = valor && !nomes.includes(valor) ? valor : null;
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{rotulo}</label>
      <div className="flex gap-1.5">
        <Select value={valor || "__none__"} onValueChange={(v) => v !== "" && onChange(v === "__none__" ? "" : v)}>
          <SelectTrigger className="field-engraved" data-testid={`select-attr-${tipo}`}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">— Nenhum —</SelectItem>
            {legado && <SelectItem value={legado}>{legado} (inativa)</SelectItem>}
            {nomes.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button type="button" variant="outline" size="icon" aria-label={`Nova opção de ${rotulo}`} onClick={() => setNovo("")}><Plus className="h-4 w-4" /></Button>
      </div>
      {novo !== null && (
        <div className="flex gap-1.5">
          <Input autoFocus value={novo} onChange={(e) => setNovo(e.target.value)} placeholder="Nova opção" className="field-engraved" />
          <Button type="button" size="icon" className="btn-3d" disabled={!novo.trim() || criar.isPending} aria-label="Criar"
            onClick={() => criar.mutate(novo, { onSuccess: (o) => { onChange(o.nome); setNovo(null); } })}><Check className="h-4 w-4" /></Button>
          <Button type="button" variant="outline" size="icon" aria-label="Cancelar" onClick={() => setNovo(null)}><X className="h-4 w-4" /></Button>
        </div>
      )}
    </div>
  );
}

// Seleção múltipla (eixos, gatilhos) com "+ Nova".
function OpcaoMulti({ tipo, valores, onChange, rotulo }: { tipo: Tipo; valores: string[]; onChange: (v: string[]) => void; rotulo: string }) {
  const { data } = useOpcoes(tipo);
  const criar = useCriarOpcao(tipo);
  const [novo, setNovo] = useState("");
  const nomes = (data ?? []).filter((o) => o.ativo).map((o) => o.nome);
  const todos = Array.from(new Set([...nomes, ...valores]));
  const alterna = (n: string) => onChange(valores.includes(n) ? valores.filter((x) => x !== n) : [...valores, n]);
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{rotulo}</label>
      <div className="flex flex-wrap gap-1.5">
        {todos.length === 0 && <span className="text-xs text-muted-foreground">Nenhuma opção cadastrada. Crie abaixo.</span>}
        {todos.map((n) => (
          <button key={n} type="button" onClick={() => alterna(n)} aria-pressed={valores.includes(n)}
            className={`rounded-[4px] border px-2 py-0.5 text-[10px] font-bold uppercase ${valores.includes(n) ? "bg-primary text-primary-foreground" : "bg-background"}`}>
            {n}
          </button>
        ))}
      </div>
      <div className="flex gap-1.5">
        <Input value={novo} onChange={(e) => setNovo(e.target.value)} placeholder={`Criar ${rotulo.toLowerCase()}`} className="field-engraved" />
        <Button type="button" size="icon" className="btn-3d" disabled={!novo.trim() || criar.isPending} aria-label={`Criar ${rotulo}`}
          onClick={() => criar.mutate(novo, { onSuccess: (o) => { onChange([...valores, o.nome]); setNovo(""); } })}><Plus className="h-4 w-4" /></Button>
      </div>
    </div>
  );
}

const VAZIO = (id: number): Atributos => ({ exameId: id, natureza: null, metodo: null, regiao: null, material: null, lateralidade: null, contraste: null, tipoResultado: null, prioridade: null, eixos: [], sinonimos: [], gatilhos: [] });

// Diálogo de atributos adicionais: campos mudam conforme a natureza.
export function AtributosDialog({ exame, atual, modalidade, onClose }: { exame: { id: number; nome: string } | null; atual?: Atributos; modalidade?: string | null; onClose: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [f, setF] = useState<Atributos | null>(null);
  const [sin, setSin] = useState("");
  useEffect(() => {
    if (exame) {
      setF(atual ?? { ...VAZIO(exame.id), natureza: naturezaSugerida(modalidade) });
      setSin("");
    }
  }, [exame?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const impacto = useQuery<{ vinculos: Array<{ blocoId: string; nomeBloco: string; grau: string; ativo: boolean | null }> }>({
    queryKey: ["/api/cadastros/exames", exame?.id, "impacto"],
    queryFn: async () => (await fetch(`/api/cadastros/exames/${exame!.id}/impacto`)).json(),
    enabled: !!exame,
  });
  const salvar = useMutation<unknown, Error>({
    mutationFn: async () => {
      const r = await fetch(`/api/cadastros/exames/${f!.exameId}/atributos`, {
        method: "PUT",
        headers: collabAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ ...f, exameId: undefined }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Falha ao salvar");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/cadastros/exames-atributos"] });
      toast({ title: "Atributos salvos" });
      onClose();
    },
    onError: (e) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
  if (!exame || !f) return null;
  const nat = (f.natureza ?? "").toUpperCase();
  const ehLab = nat === "LABORATORIAL";
  const ehImg = nat === "IMAGEM";
  const set = <K extends keyof Atributos>(k: K, v: Atributos[K]) => setF((x) => (x ? { ...x, [k]: v } : x));
  const Simples = ({ k, rotulo, opcoes }: { k: "lateralidade" | "contraste" | "prioridade"; rotulo: string; opcoes: string[] }) => (
    <div className="space-y-1.5">
      <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{rotulo}</label>
      <Select value={f[k] ?? "__none__"} onValueChange={(v) => v !== "" && set(k, v === "__none__" ? null : v)}>
        <SelectTrigger className="field-engraved"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">— Nenhum —</SelectItem>
          {opcoes.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader><DialogTitle>Atributos do exame</DialogTitle></DialogHeader>
        <div className="screen-3d flex items-center gap-2 px-3 py-1.5 text-xs font-black">
          <NaturezaChip natureza={f.natureza} /> <span>{exame.nome}</span>
        </div>
        <p className="text-xs text-muted-foreground">Estes campos são complementares. O código, o bloco e a grade do exame não mudam por aqui.</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <OpcaoSelect tipo="natureza" rotulo="Natureza" valor={f.natureza ?? ""} onChange={(v) => set("natureza", v || null)} />
          <OpcaoSelect tipo="metodo" rotulo="Método" valor={f.metodo ?? ""} onChange={(v) => set("metodo", v || null)} />
          {ehLab && <OpcaoSelect tipo="material" rotulo="Material" valor={f.material ?? ""} onChange={(v) => set("material", v || null)} />}
          {!ehLab && nat !== "" && <OpcaoSelect tipo="regiao" rotulo="Região" valor={f.regiao ?? ""} onChange={(v) => set("regiao", v || null)} />}
          {ehImg && <Simples k="lateralidade" rotulo="Lateralidade" opcoes={["DIREITA", "ESQUERDA", "BILATERAL", "NAO SE APLICA"]} />}
          {ehImg && <Simples k="contraste" rotulo="Contraste" opcoes={["COM CONTRASTE", "SEM CONTRASTE", "COM E SEM CONTRASTE", "NAO SE APLICA"]} />}
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Tipo de resultado</label>
            <Input value={f.tipoResultado ?? ""} onChange={(e) => set("tipoResultado", e.target.value || null)} placeholder="Ex.: numérico, laudo descritivo" className="field-engraved" />
          </div>
          <Simples k="prioridade" rotulo="Prioridade" opcoes={["ROTINA", "PRIORITARIO", "URGENTE"]} />
          <div className="sm:col-span-2"><OpcaoMulti tipo="eixo" rotulo="Eixos clínicos" valores={f.eixos} onChange={(v) => set("eixos", v)} /></div>
          <div className="sm:col-span-2"><OpcaoMulti tipo="gatilho" rotulo="Gatilhos" valores={f.gatilhos} onChange={(v) => set("gatilhos", v)} /></div>
          <div className="space-y-1.5 sm:col-span-2">
            <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Sinônimos (busca)</label>
            <div className="flex flex-wrap gap-1.5">
              {f.sinonimos.map((s) => (
                <Badge key={s} variant="secondary" className="gap-1 text-[10px]">{s}<button type="button" aria-label={`Remover ${s}`} onClick={() => set("sinonimos", f.sinonimos.filter((x) => x !== s))}><X className="h-3 w-3" /></button></Badge>
              ))}
            </div>
            <div className="flex gap-1.5">
              <Input value={sin} onChange={(e) => setSin(e.target.value)} placeholder="Novo sinônimo" className="field-engraved" />
              <Button type="button" size="icon" className="btn-3d" disabled={!sin.trim()} aria-label="Adicionar sinônimo" onClick={() => { set("sinonimos", Array.from(new Set([...f.sinonimos, sin.trim()]))); setSin(""); }}><Plus className="h-4 w-4" /></Button>
            </div>
          </div>
          <div className="concave-3d px-3 py-2 text-xs sm:col-span-2">
            <div className="font-black uppercase tracking-wide">Onde este exame está nos blocos (leitura)</div>
            {(impacto.data?.vinculos ?? []).length === 0 ? <span className="text-muted-foreground">Nenhum vínculo na grade.</span> : (
              <ul className="mt-1 space-y-0.5">
                {impacto.data!.vinculos.map((v, i) => <li key={i} className={v.ativo === false ? "opacity-50" : ""}>{v.nomeBloco} — {v.grau}{v.ativo === false ? " (tirado do bloco)" : ""}</li>)}
              </ul>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button className="btn-3d" disabled={salvar.isPending} onClick={() => salvar.mutate()} data-testid="button-salvar-atributos">{salvar.isPending ? "Salvando..." : "Salvar atributos"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------- Gestão de opções (aba "Opções") ----------------
const TIPOS: Array<{ tipo: Tipo; rotulo: string }> = [
  { tipo: "natureza", rotulo: "Naturezas" },
  { tipo: "metodo", rotulo: "Métodos" },
  { tipo: "eixo", rotulo: "Eixos" },
  { tipo: "regiao", rotulo: "Regiões" },
  { tipo: "material", rotulo: "Materiais" },
  { tipo: "gatilho", rotulo: "Gatilhos" },
];

function PainelOpcoes({ tipo, rotulo }: { tipo: Tipo; rotulo: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading } = useOpcoes(tipo);
  const criar = useCriarOpcao(tipo);
  const [novo, setNovo] = useState("");
  const [edit, setEdit] = useState<{ id: number; nome: string } | null>(null);
  const refaz = () => {
    qc.invalidateQueries({ queryKey: ["/api/cadastros/opcoes-exame", tipo] });
    qc.invalidateQueries({ queryKey: ["/api/cadastros/exames-atributos"] });
  };
  const chamar = async (url: string, body: unknown) => {
    const r = await fetch(url, { method: "PATCH", headers: collabAuthHeaders({ "Content-Type": "application/json" }), body: JSON.stringify(body) });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Falha");
  };
  const renomear = useMutation<void, Error>({
    mutationFn: () => chamar(`/api/cadastros/opcoes-exame/${edit!.id}`, { nome: edit!.nome }),
    onSuccess: () => { refaz(); setEdit(null); toast({ title: "Renomeado" }); },
    onError: (e) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
  const alterna = useMutation<void, Error, { id: number; ativo: boolean }>({
    mutationFn: ({ id, ativo }) => chamar(`/api/cadastros/opcoes-exame/${id}/ativo`, { ativo }),
    onSuccess: refaz,
    onError: (e) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input value={novo} onChange={(e) => setNovo(e.target.value)} placeholder={`Nova opção em ${rotulo}`} className="field-engraved sm:max-w-sm" data-testid={`input-nova-${tipo}`} />
        <Button className="btn-3d" disabled={!novo.trim() || criar.isPending} onClick={() => criar.mutate(novo, { onSuccess: () => setNovo("") })} data-testid={`button-criar-${tipo}`}>
          <Plus className="mr-1.5 h-4 w-4" /> Criar
        </Button>
      </div>
      <div className="panel-3d divide-y">
        {isLoading && <div className="p-3 text-sm text-muted-foreground">Carregando...</div>}
        {(data ?? []).map((o) => (
          <div key={o.id} className={`flex items-center gap-2 px-3 py-2 ${o.ativo ? "" : "opacity-50"}`}>
            {edit?.id === o.id ? (
              <>
                <Input autoFocus value={edit.nome} onChange={(e) => setEdit({ id: o.id, nome: e.target.value })} className="field-engraved" />
                <Button size="icon" className="btn-3d" aria-label="Salvar nome" disabled={renomear.isPending} onClick={() => renomear.mutate()}><Check className="h-4 w-4" /></Button>
                <Button size="icon" variant="outline" aria-label="Cancelar" onClick={() => setEdit(null)}><X className="h-4 w-4" /></Button>
              </>
            ) : (
              <>
                {tipo === "natureza" && <NaturezaChip natureza={o.nome} />}
                {tipo !== "natureza" && <span className="flex-1 text-sm font-bold">{o.nome}</span>}
                <span className="flex-1" />
                <Badge variant="outline" className="text-[10px]">{o.total} exame(s)</Badge>
                <Button size="icon" variant="ghost" aria-label={`Renomear ${o.nome}`} onClick={() => setEdit({ id: o.id, nome: o.nome })}><Pencil className="h-4 w-4" /></Button>
                <Switch checked={o.ativo} aria-label={`Ativar ${o.nome}`} onCheckedChange={(v) => alterna.mutate({ id: o.id, ativo: v })} />
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function GestaoOpcoes() {
  return (
    <Tabs defaultValue="natureza" className="space-y-3">
      <TabsList className="concave-3d h-auto flex-wrap justify-start p-1">
        {TIPOS.map((t) => (
          <TabsTrigger key={t.tipo} value={t.tipo} className="text-[11px] font-black uppercase tracking-wide">{t.rotulo}</TabsTrigger>
        ))}
      </TabsList>
      {TIPOS.map((t) => (
        <TabsContent key={t.tipo} value={t.tipo}><PainelOpcoes tipo={t.tipo} rotulo={t.rotulo} /></TabsContent>
      ))}
    </Tabs>
  );
}
