import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Star, X } from "lucide-react";
import { finApi } from "@/lib/pax-finance-api";
import { btnCls, btnSoftCls } from "../pax-finance-ui";

type Cnae = { codigo: string; descricao: string | null; areaSaude: string | null };
type Empresa = { principal: Cnae | null; secundarios: Cnae[] };

function Busca({ placeholder, onEscolher, testId }: { placeholder: string; onEscolher: (c: Cnae) => void; testId: string }) {
  const [q, setQ] = useState(""); const [todas, setTodas] = useState(false); const [aberto, setAberto] = useState(false); const [lista, setLista] = useState<Cnae[]>([]);
  const [erro, setErro] = useState<string | null>(null); const seq = useRef(0);
  useEffect(() => {
    if (!aberto) return; const mine = ++seq.current;
    const t = setTimeout(() => {
      finApi<Cnae[]>(`/cnae/search?q=${encodeURIComponent(q)}&todas=${todas ? 1 : 0}&limite=30`, { semEmpresa: true })
        .then((r) => { if (mine === seq.current) { setLista(r); setErro(null); } }).catch((e: Error) => { if (mine === seq.current) setErro(e.message); });
    }, 250);
    return () => clearTimeout(t);
  }, [q, todas, aberto]);
  return (
    <div className="relative">
      <div className="flex items-center gap-2"><Search className="h-4 w-4 shrink-0" />
        <input className="min-h-[44px] w-full rounded border border-border bg-background px-2 text-[13px]" placeholder={placeholder} value={q} data-testid={testId}
          onChange={(e) => { setQ(e.target.value); setAberto(true); }} onFocus={() => setAberto(true)} role="combobox" aria-expanded={aberto} aria-autocomplete="list" /></div>
      <label className="mt-1 flex items-center gap-2 text-[12px]"><input type="checkbox" checked={todas} onChange={(e) => { setTodas(e.target.checked); setAberto(true); }} />Incluir atividades de outras áreas (fora da saúde)</label>
      {aberto && (
        <ul className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded border border-border bg-popover p-1 text-[12px] shadow-lg" role="listbox">
          {erro && <li className="p-2 text-destructive">{erro}</li>}
          {!erro && !lista.length && <li className="p-2 text-muted-foreground">Nenhuma atividade encontrada.</li>}
          {lista.map((c) => (
            <li key={c.codigo}><button type="button" role="option" className="block min-h-[44px] w-full rounded p-2 text-left hover:bg-muted" data-testid={`cnae-op-${c.codigo}`}
              onClick={() => { onEscolher(c); setQ(""); setAberto(false); }}><b>{c.codigo}</b> {c.descricao}{c.areaSaude && <span className="block text-muted-foreground">{c.areaSaude}</span>}</button></li>))}
          <li><button type="button" className="w-full p-2 text-left text-muted-foreground underline" onClick={() => setAberto(false)}>Fechar lista</button></li>
        </ul>)}
    </div>
  );
}

export function CnaeEmpresa() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["fin", "cnae-empresa"], queryFn: () => finApi<Empresa>("/cnae/company") });
  const [principal, setPrincipal] = useState<Cnae | null>(null); const [sec, setSec] = useState<Cnae[]>([]); const [sujo, setSujo] = useState(false);
  useEffect(() => { if (q.data && !sujo) { setPrincipal(q.data.principal); setSec(q.data.secundarios); } }, [q.data, sujo]);
  const salva = useMutation({
    mutationFn: () => finApi("/cnae/company", { method: "PUT", body: { principal: principal?.codigo ?? null, secundarios: sec.map((s) => s.codigo) } }),
    onSuccess: () => { setSujo(false); qc.invalidateQueries({ queryKey: ["fin", "cnae-empresa"] }); qc.invalidateQueries({ queryKey: ["fin", "docs-registry"] }); },
  });
  const mudar = (fn: () => void) => { fn(); setSujo(true); };
  return (
    <section className="panel-3d-sub space-y-3 p-3 text-[12px]" data-testid="cnae-empresa">
      <b className="uppercase">Atividades da empresa (CNAE)</b>
      <p className="text-muted-foreground">Busque pelo código ou por palavras (ex.: “hospital”, “8630”, “laboratório”). A lista mostra primeiro as atividades da saúde. A empresa pode trocar a principal e acrescentar quantas secundárias precisar.</p>
      {q.isError && <p className="text-destructive" role="alert">{(q.error as Error).message}</p>}
      <div><div className="mb-1 font-bold uppercase text-muted-foreground">Atividade principal</div>
        {principal ? <div className="flex items-center justify-between gap-2 rounded border border-border p-2" data-testid="cnae-principal"><span><Star className="mr-1 inline h-3.5 w-3.5" /><b>{principal.codigo}</b> {principal.descricao ?? "(fora do cadastro)"}</span>
          <button type="button" className="min-h-[44px] px-2" aria-label="Remover atividade principal" onClick={() => mudar(() => setPrincipal(null))}><X className="h-4 w-4" /></button></div>
          : <p className="text-muted-foreground">Nenhuma definida.</p>}
        <div className="mt-2"><Busca placeholder="Escolher a atividade principal" testId="cnae-busca-principal" onEscolher={(c) => mudar(() => { setPrincipal(c); setSec((s) => s.filter((x) => x.codigo !== c.codigo)); })} /></div></div>
      <div><div className="mb-1 font-bold uppercase text-muted-foreground">Atividades secundárias ({sec.length})</div>
        <ul className="space-y-1" data-testid="cnae-secundarios">{sec.map((s) => (<li key={s.codigo} className="flex items-center justify-between gap-2 rounded border border-border p-2"><span><b>{s.codigo}</b> {s.descricao ?? "(fora do cadastro)"}</span>
          <button type="button" className="min-h-[44px] px-2" aria-label={`Remover ${s.codigo}`} onClick={() => mudar(() => setSec((x) => x.filter((y) => y.codigo !== s.codigo)))}><X className="h-4 w-4" /></button></li>))}</ul>
        <div className="mt-2"><Busca placeholder="Acrescentar atividade secundária" testId="cnae-busca-secundaria"
          onEscolher={(c) => mudar(() => { if (c.codigo !== principal?.codigo) setSec((s) => (s.some((x) => x.codigo === c.codigo) ? s : [...s, c])); })} /></div></div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className={`${btnCls} min-h-[44px]`} disabled={!sujo || salva.isPending} onClick={() => salva.mutate()} data-testid="cnae-salvar"><Plus className="mr-1 inline h-4 w-4" />{salva.isPending ? "Salvando…" : "Salvar atividades"}</button>
        {sujo && <button type="button" className={`${btnSoftCls} min-h-[44px]`} onClick={() => setSujo(false)}>Descartar mudanças</button>}
        {salva.isError && <span className="text-destructive" role="alert">{(salva.error as Error).message}</span>}
        {salva.isSuccess && !sujo && <span data-testid="cnae-ok">Atividades salvas. O cadastro do Pax Finance voltou a rascunho para sua validação.</span>}
      </div>
    </section>
  );
}
