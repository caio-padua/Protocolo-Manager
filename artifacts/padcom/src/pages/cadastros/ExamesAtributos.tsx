import { useEffect, useState, type ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { collabAuthHeaders } from "@/lib/collab-auth";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Check, X, Upload, ChevronDown, ExternalLink, RotateCcw } from "lucide-react";
import { SeletorCorVidro } from "@/components/VidroCor";
import { useRef } from "react";

// Cores oficiais por natureza (retângulos indicadores). Prefixos de código são só visuais.
export const NATUREZA_COR: Record<string, string> = {
  "LABORATORIAL": "#0F1E36",
  "IMAGEM": "#B45309",
  "COMPOSICAO CORPORAL": "#047857",
  "METODOS GRAFICOS": "#4338CA",
  "ENDOSCOPICOS": "#BE123C",
};

export const GRADE_COR: Record<string, string> = {
  "GRADE BASICA": "#10B981",
  "GRADE INTERMEDIARIA": "#3B82F6",
  "GRADE AMPLIADA": "#F59E0B",
  "GRADE SOFISTICADA": "#8B5CF6",
};

// Cores editaveis (tela Opcoes). Sem personalizacao, vale o padrao oficial acima.
export function useCores() {
  const q = useQuery<Array<{ chave: string; cor: string }>>({
    queryKey: ["/api/cadastros/exames-cores"],
    queryFn: async () => {
      const r = await fetch("/api/cadastros/exames-cores");
      if (!r.ok) throw new Error("Falha ao carregar cores");
      return r.json();
    },
  });
  const mapa = new Map((q.data ?? []).map((c) => [c.chave, c.cor]));
  return {
    natureza: (n: string) => mapa.get(n.toUpperCase()) ?? NATUREZA_COR[n.toUpperCase()] ?? "#475569",
    grade: (g: string) => mapa.get(g) ?? GRADE_COR[g] ?? "#64748B",
    personalizada: (chave: string) => mapa.has(chave),
  };
}

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

export const NATUREZA_SIGLA: Record<string, string> = { "LABORATORIAL": "LAB", "IMAGEM": "IMG", "COMPOSICAO CORPORAL": "COMP", "METODOS GRAFICOS": "GRAF", "ENDOSCOPICOS": "ENDO" };

export function NaturezaChip({ natureza, sugerida, curto }: { natureza: string | null; sugerida?: boolean; curto?: boolean }) {
  const cores = useCores();
  if (!natureza) return <span className="text-xs text-muted-foreground">—</span>;
  const cor = cores.natureza(natureza);
  return (
    <span
      className="inline-block rounded-[4px] px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-white"
      style={{ backgroundColor: cor, opacity: sugerida ? 0.75 : 1 }}
      title={sugerida ? `${natureza} — sugerida pela modalidade (não gravada)` : natureza}
      data-testid="chip-natureza"
    >
      {curto ? (NATUREZA_SIGLA[natureza.toUpperCase()] ?? natureza) : natureza}
    </span>
  );
}

export interface Atributos {
  exameId: number;
  natureza: string | null;
  metodo: string | null;
  regiao: string | null;
  material: string | null;
  necessitaSedacao: boolean | null;
  lateralidade: string | null;
  contraste: string | null;
  tipoResultado: string | null;
  prioridade: string | null;
  eixos: string[];
  sinonimos: string[];
  gatilhos: string[];
  periodizacaoModo: string | null;
  publicoAlvo: string | null;
  idadeMinima: number | null;
  idadeMaxima: number | null;
  repetirMeses: number | null;
  regraAntecipacao: string | null;
  diretrizes: string[];
  artigos: Artigo[];
}
export interface Artigo { texto: string; link: string; autores?: string; titulo?: string; revista?: string; ano?: string }

// Texto exibido da referência (aceita os campos antigos separados).
export function textoArtigo(a: Artigo): string {
  return a.texto?.trim() || [a.autores, a.titulo, a.revista, a.ano].filter(Boolean).join(". ");
}
const URL_NO_TEXTO = /https?:\/\/[^\s)>\]]+/i;
export function linkArtigo(a: Artigo): string {
  return a.link?.trim() || (textoArtigo(a).match(URL_NO_TEXTO)?.[0] ?? "");
}

interface Opcao {
  id: number;
  nome: string;
  ativo: boolean;
  total: number;
}
type Tipo = "natureza" | "metodo" | "eixo" | "regiao" | "material" | "gatilho" | "diretriz";

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
      <div className="flex items-center justify-between">
        <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{rotulo}</label>
        <span className="concave-3d px-2 py-0.5 text-[10px] font-black tabular-nums">{valores.length} de {todos.length} marcado(s)</span>
      </div>
      {/* Grade fixa: todas as opções com o mesmo tamanho, alinhadas em colunas e linhas. */}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-4" data-testid={`grade-${tipo}`}>
        {todos.length === 0 && <span className="col-span-full text-xs text-muted-foreground">Nenhuma opção cadastrada. Crie abaixo.</span>}
        {todos.map((n) => (
          <button key={n} type="button" onClick={() => alterna(n)} aria-pressed={valores.includes(n)} title={n}
            className="paxter-seletor flex h-9 items-center justify-center px-2 text-center text-[10px] font-black uppercase leading-tight tracking-wide">
            <span className="line-clamp-2 break-words">{n.replace(/_/g, " ")}</span>
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

const VAZIO = (id: number): Atributos => ({ exameId: id, natureza: null, metodo: null, regiao: null, material: null, necessitaSedacao: null, lateralidade: null, contraste: null, tipoResultado: null, prioridade: null, eixos: [], sinonimos: [], gatilhos: [], periodizacaoModo: null, publicoAlvo: null, idadeMinima: null, idadeMaxima: null, repetirMeses: null, regraAntecipacao: null, diretrizes: [], artigos: [] });

// Botão de estado Ativo/Inativo: retangular, sempre do mesmo tamanho e na mesma posição.
// Ativo = afundado (insert bevel) com luz verde; Inativo = saliente com luz apagada.
export function BotaoAtivo({ ativo, onChange, rotulo, disabled }: { ativo: boolean; onChange: (v: boolean) => void; rotulo: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={ativo}
      aria-label={`${ativo ? "Desativar" : "Ativar"} ${rotulo}`}
      title={ativo ? "Ativo. Clique para desativar." : "Inativo. Clique para ativar."}
      disabled={disabled}
      onClick={() => onChange(!ativo)}
      className="paxter-seletor inline-flex h-8 w-[108px] shrink-0 items-center justify-center text-[10px] font-black uppercase tracking-wider disabled:opacity-50"
      data-testid="botao-ativo"
    >
      {ativo ? "Ativo" : "Inativo"}
    </button>
  );
}

// Seção da ficha: só a seção escolhida na barra de botões fica visível (sem acordeão, sem rolagem dupla).
// Fica montada (hidden) para não perder o que foi digitado ao trocar de seção.
function Faixa({ titulo, resumo, aberta, children, id }: { titulo: string; resumo?: string; aberta: boolean; onToggle?: () => void; children: ReactNode; id: string }) {
  return (
    <section hidden={!aberta} className="panel-3d-sub shrink-0 space-y-3 p-4" data-testid={`faixa-${id}`}>
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,50%)] items-center gap-3">
        <div className="bevel-3d truncate px-3 py-1.5 text-[11px] font-black uppercase tracking-widest">{titulo}</div>
        <div className="truncate text-right text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{resumo ?? ""}</div>
      </div>
      {children}
    </section>
  );
}

// Ficha única do exame (gaveta lateral): cadastro + atributos + vínculos + periodização + embasamento, com um só "Salvar".
// `topo` traz os campos de cadastro; `antesDeSalvar` grava o cadastro e devolve o id (necessário para exame novo).
export function AtributosDialog({ exame, atual, modalidade, onClose, topo, antesDeSalvar, podeSalvar = true, titulo = "Ficha do exame", onClonar }: {
  exame: { id: number | null; nome: string } | null;
  atual?: Atributos;
  modalidade?: string | null;
  onClose: () => void;
  topo?: ReactNode;
  antesDeSalvar?: () => Promise<number>;
  podeSalvar?: boolean;
  titulo?: string;
  onClonar?: () => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [f, setF] = useState<Atributos | null>(null);
  const [sin, setSin] = useState("");
  const [abertas, setAbertas] = useState<Record<string, boolean>>({ cadastro: true });
  useEffect(() => {
    if (exame) {
      setF(atual ?? { ...VAZIO(exame.id ?? 0), natureza: naturezaSugerida(modalidade) });
      setSin("");
      setAbertas(topo ? { cadastro: true } : { classificacao: true });
    }
  }, [exame?.id, !!exame]); // eslint-disable-line react-hooks/exhaustive-deps
  const impacto = useQuery<{ vinculos: Array<{ blocoId: string; nomeBloco: string; grau: string; ativo: boolean | null }> }>({
    queryKey: ["/api/cadastros/exames", exame?.id, "impacto"],
    queryFn: async () => (await fetch(`/api/cadastros/exames/${exame!.id}/impacto`)).json(),
    enabled: !!exame?.id,
  });
  const salvar = useMutation<unknown, Error>({
    mutationFn: async () => {
      const id = antesDeSalvar ? await antesDeSalvar() : f!.exameId;
      const r = await fetch(`/api/cadastros/exames/${id}/atributos`, {
        method: "PUT",
        headers: collabAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ ...f, exameId: undefined }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "O cadastro foi salvo, mas os atributos não");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/cadastros/exames-atributos"] });
      toast({ title: "Exame salvo" });
      onClose();
    },
    onError: (e) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
  if (!exame || !f) return null;
  const nat = (f.natureza ?? "").toUpperCase();
  const faltaImagem = nat === "IMAGEM" && (!f.regiao || !f.lateralidade || !f.contraste);
  const idadeInvalida = f.idadeMinima != null && f.idadeMaxima != null && f.idadeMinima > f.idadeMaxima;
  const ehLab = nat === "LABORATORIAL";
  const ehImg = nat === "IMAGEM";
  const set = <K extends keyof Atributos>(k: K, v: Atributos[K]) => setF((x) => (x ? { ...x, [k]: v } : x));
  const alterna = (k: string) => setAbertas({ [k]: true });
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
  const nVinc = impacto.data?.vinculos.length ?? 0;
  const resPer = [f.periodizacaoModo, f.repetirMeses ? `a cada ${f.repetirMeses} meses` : null].filter(Boolean).join(" • ") || "não definida";
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="fixed left-auto right-0 top-0 flex h-screen max-h-screen w-[96vw] max-w-[1180px] flex-col translate-x-0 translate-y-0 overflow-y-auto rounded-none sm:rounded-none" data-testid="gaveta-exame">
        <DialogHeader><DialogTitle>{titulo}</DialogTitle></DialogHeader>
        <div className="flex items-stretch gap-2">
          <div className="screen-3d flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-xs font-black">
            <NaturezaChip natureza={f.natureza} /> <span className="min-w-0 flex-1 truncate">{exame.nome || "Novo exame"}</span>
          </div>
          {onClonar && (
            <Button type="button" className="btn-3d h-auto shrink-0 px-4 text-[11px] font-black uppercase tracking-wide" onClick={onClonar} title="Cria um exame NOVO já preenchido com os dados deste. O original não muda." data-testid="button-clonar-exame">
              Copiar para novo exame
            </Button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-5" role="tablist" aria-label="Seções da ficha" data-testid="secoes-ficha">
          {[
            ...(topo ? [["cadastro", "1. Cadastro"]] : []),
            ["classificacao", "2. Classificação"],
            ["vinculos", "3. Vínculos"],
            ["periodizacao", "4. Periodização"],
            ["embasamento", "5. Embasamento"],
          ].map(([k, rot]) => (
            <button key={k} type="button" role="tab" aria-selected={!!abertas[k]} aria-pressed={!!abertas[k]} onClick={() => alterna(k)} className="paxter-seletor h-10 truncate px-2 text-[11px] font-black uppercase tracking-wide" data-testid={`aba-${k}`}>{rot}</button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          O código, o bloco e a grade do exame não mudam por atributos. Um só botão salva a ficha inteira.
        </p>

        {topo && <Faixa id="cadastro" titulo="1. Cadastro do exame" resumo={exame.nome} aberta={!!abertas.cadastro} onToggle={() => alterna("cadastro")}>{topo}</Faixa>}

        <Faixa id="classificacao" titulo="2. Identidade e classificação" resumo={[f.natureza, f.metodo].filter(Boolean).join(" • ") || "não classificado"} aberta={!!abertas.classificacao} onToggle={() => alterna("classificacao")}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <OpcaoSelect tipo="natureza" rotulo="Natureza" valor={f.natureza ?? ""} onChange={(v) => set("natureza", v || null)} />
            <OpcaoSelect tipo="metodo" rotulo="Método" valor={f.metodo ?? ""} onChange={(v) => set("metodo", v || null)} />
            {ehLab && <OpcaoSelect tipo="material" rotulo="Material" valor={f.material ?? ""} onChange={(v) => set("material", v || null)} />}
            {!ehLab && nat !== "" && <OpcaoSelect tipo="regiao" rotulo={ehImg ? "Região anatômica *" : "Região"} valor={f.regiao ?? ""} onChange={(v) => set("regiao", v || null)} />}
            {nat === "ENDOSCOPICOS" && (
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Necessita sedação</label>
                <Select value={f.necessitaSedacao == null ? "__none__" : f.necessitaSedacao ? "sim" : "nao"} onValueChange={(v) => v !== "" && set("necessitaSedacao", v === "__none__" ? null : v === "sim")}>
                  <SelectTrigger className="field-engraved" data-testid="select-necessita-sedacao"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— Não informado —</SelectItem>
                    <SelectItem value="sim">Sim</SelectItem>
                    <SelectItem value="nao">Não</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            {ehImg && <Simples k="lateralidade" rotulo="Lateralidade *" opcoes={["DIREITA", "ESQUERDA", "BILATERAL", "NAO SE APLICA"]} />}
            {ehImg && <Simples k="contraste" rotulo="Contraste *" opcoes={["COM CONTRASTE", "SEM CONTRASTE", "COM E SEM CONTRASTE", "NAO SE APLICA"]} />}
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Tipo de resultado</label>
              <div className="grid grid-cols-2 gap-2" data-testid="grade-tipo-resultado">
                {Array.from(new Set(["VALOR NUMERICO", "LAUDO DESCRITIVO", "CURVA / TRACADO", "IMAGEM", ...(f.tipoResultado ? [f.tipoResultado] : [])])).map((t) => (
                  <button key={t} type="button" aria-pressed={f.tipoResultado === t} title={t}
                    onClick={() => set("tipoResultado", f.tipoResultado === t ? null : t)}
                    className="paxter-seletor flex h-9 items-center justify-center px-2 text-center text-[10px] font-black uppercase tracking-wide">
                    <span className="line-clamp-2 break-words">{t}</span>
                  </button>
                ))}
              </div>
            </div>
            <Simples k="prioridade" rotulo="Prioridade" opcoes={["ROTINA", "PRIORITARIO", "URGENTE"]} />
            <div className="sm:col-span-2"><OpcaoMulti tipo="eixo" rotulo="Eixos clínicos" valores={f.eixos} onChange={(v) => set("eixos", v)} /></div>
            <div className="sm:col-span-2"><OpcaoMulti tipo="gatilho" rotulo="Gatilhos" valores={f.gatilhos} onChange={(v) => set("gatilhos", v)} /></div>
            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Sinônimos (busca)</label>
              <div className="flex flex-wrap gap-1.5">
                {f.sinonimos.map((x) => (
                  <Badge key={x} variant="secondary" className="gap-1 text-[10px]">{x}<button type="button" aria-label={`Remover ${x}`} onClick={() => set("sinonimos", f.sinonimos.filter((y) => y !== x))}><X className="h-3 w-3" /></button></Badge>
                ))}
              </div>
              <div className="flex gap-1.5">
                <Input value={sin} onChange={(e) => setSin(e.target.value)} placeholder="Novo sinônimo" className="field-engraved" />
                <Button type="button" size="icon" className="btn-3d" disabled={!sin.trim()} aria-label="Adicionar sinônimo" onClick={() => { set("sinonimos", Array.from(new Set([...f.sinonimos, sin.trim()]))); setSin(""); }}><Plus className="h-4 w-4" /></Button>
              </div>
            </div>
            {faltaImagem && <div className="rounded-[4px] bg-destructive/10 px-3 py-1.5 text-xs font-bold text-destructive sm:col-span-2" role="alert">Para exame de IMAGEM, região anatômica, lateralidade e contraste são obrigatórios.</div>}
          </div>
        </Faixa>

        <Faixa id="vinculos" titulo="3. Vínculos nos blocos clínicos" resumo={exame.id ? `${nVinc} vínculo(s)` : "exame novo"} aberta={!!abertas.vinculos} onToggle={() => alterna("vinculos")}>
          <div className="concave-3d px-3 py-2 text-xs">
            {nVinc === 0 ? <span className="text-muted-foreground">Nenhum vínculo na grade.</span> : (
              <ul className="space-y-0.5">
                {impacto.data!.vinculos.map((v, i) => <li key={i} className={v.ativo === false ? "opacity-50" : ""}>{v.nomeBloco} — {v.grau}{v.ativo === false ? " (tirado do bloco)" : ""}</li>)}
              </ul>
            )}
          </div>
          <p className="mt-2 text-[10px] text-muted-foreground">Para incluir, mover ou tirar o exame de um bloco, use a aba "Blocos clínicos e grades".</p>
        </Faixa>

        <Faixa id="periodizacao" titulo="4. Periodização preventiva (check-up)" resumo={resPer} aberta={!!abertas.periodizacao} onToggle={() => alterna("periodizacao")}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-6">
            <div className="space-y-1.5 sm:col-span-3">
              <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Modo</label>
              <Select value={f.periodizacaoModo ?? "__none__"} onValueChange={(v) => v !== "" && set("periodizacaoModo", v === "__none__" ? null : v)}>
                <SelectTrigger className="field-engraved"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Nenhum —</SelectItem>
                  <SelectItem value="SOB DEMANDA">Sob demanda</SelectItem>
                  <SelectItem value="PERIODICO">Periódico</SelectItem>
                  <SelectItem value="POR RISCO">Por risco</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-3">
              <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Público-alvo</label>
              <Select value={f.publicoAlvo ?? "__none__"} onValueChange={(v) => v !== "" && set("publicoAlvo", v === "__none__" ? null : v)}>
                <SelectTrigger className="field-engraved"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Nenhum —</SelectItem>
                  <SelectItem value="AMBOS">Ambos</SelectItem>
                  <SelectItem value="MASCULINO">Masculino</SelectItem>
                  <SelectItem value="FEMININO">Feminino</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {([["idadeMinima", "Idade mínima"], ["idadeMaxima", "Idade máxima"], ["repetirMeses", "Repetir a cada (meses)"]] as const).map(([k, r]) => (
              <div key={k} className="space-y-1.5 sm:col-span-2">
                <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{r}</label>
                <Input type="number" min={0} value={f[k] ?? ""} onChange={(e) => set(k, e.target.value === "" ? null : Math.trunc(Number(e.target.value)))} className="field-engraved" />
              </div>
            ))}
            <div className="space-y-1.5 sm:col-span-6">
              <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Regra de antecipação</label>
              <Input value={f.regraAntecipacao ?? ""} onChange={(e) => set("regraAntecipacao", e.target.value || null)} placeholder="Texto livre, definido pelo médico" className="field-engraved" />
            </div>
            {idadeInvalida && <div className="text-xs font-bold text-destructive sm:col-span-6" role="alert">A idade mínima não pode ser maior que a máxima.</div>}
            <div className="text-[10px] text-muted-foreground sm:col-span-2">Cadastro de referência. Não gera regra clínica automática nem altera as sugestões do cérebro.</div>
          </div>
        </Faixa>

        <Faixa id="embasamento" titulo="5. Embasamento científico" resumo={`${f.diretrizes.length} diretriz(es) • ${f.artigos.length} artigo(s)`} aberta={!!abertas.embasamento} onToggle={() => alterna("embasamento")}>
          <div className="space-y-3">
            <OpcaoMulti tipo="diretriz" rotulo="Diretrizes clínicas" valores={f.diretrizes} onChange={(v) => set("diretrizes", v)} />
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Artigos científicos / referências</label>
                <Button type="button" size="sm" variant="outline" onClick={() => set("artigos", [...f.artigos, { texto: "", link: "" }])} data-testid="button-novo-artigo"><Plus className="mr-1 h-4 w-4" /> Referência</Button>
              </div>
              {f.artigos.map((a, i) => {
                const link = linkArtigo(a);
                const t = a.texto ?? textoArtigo(a);
                return (
                  <div key={i} className="concave-3d space-y-1.5 p-2">
                    <Textarea rows={3} value={a.texto ?? textoArtigo(a)} aria-label="Referência bibliográfica completa" placeholder="Cole aqui a referência completa (autores, título, revista, ano). Se houver link no texto, ele é detectado."
                      className="field-engraved" onChange={(e) => set("artigos", f.artigos.map((x, j) => (j === i ? { ...x, texto: e.target.value } : x)))} />
                    <div className="flex items-center gap-2">
                      <Input value={a.link} aria-label="Link ou DOI" placeholder="Link / URL do artigo (https://...)" className="field-engraved flex-1"
                        onChange={(e) => set("artigos", f.artigos.map((x, j) => (j === i ? { ...x, link: e.target.value } : x)))} />
                      <Button type="button" variant="ghost" size="sm" className="btn-3d-soft h-9 w-28 shrink-0 text-[11px] font-black" disabled={!/^https?:\/\//i.test((a.link ?? "").trim())}
                        title="Abre o artigo em uma nova aba para conferir o link" data-testid={`abrir-link-${i}`}
                        onClick={() => window.open(a.link.trim(), "_blank", "noopener,noreferrer")}>
                        Abrir Link <ExternalLink className="ml-1 h-3 w-3" aria-hidden="true" />
                      </Button>
                    </div>
                    <div className="flex items-center gap-2">
                      {link && /^https?:\/\//i.test(link) && (
                        <a href={link} target="_blank" rel="noopener noreferrer" className="btn-3d-soft inline-flex items-center gap-1 rounded-[6px] px-2 py-1 text-[11px] font-black" data-testid={`link-artigo-${i}`}>
                          Abrir artigo <ExternalLink className="h-3 w-3" aria-hidden="true" />
                        </a>
                      )}
                      {t && <span className="line-clamp-2 flex-1 text-[11px] text-muted-foreground">{t}</span>}
                      <Button type="button" size="sm" variant="ghost" className="ml-auto text-destructive" onClick={() => set("artigos", f.artigos.filter((_, j) => j !== i))}>Remover</Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </Faixa>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button className="btn-3d" disabled={salvar.isPending || faltaImagem || idadeInvalida || !podeSalvar} onClick={() => salvar.mutate()} data-testid="button-salvar-atributos">{salvar.isPending ? "Salvando..." : "Salvar exame"}</Button>
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
  { tipo: "diretriz", rotulo: "Diretrizes" },
];

// Cor editável (mesmo seletor da Agenda). Sem personalização vale o padrão oficial.
function CorEditavel({ chave, padrao }: { chave: string; padrao: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const cores = useCores();
  const atual = chave.startsWith("GRADE") ? cores.grade(chave) : cores.natureza(chave);
  const salvar = useMutation<void, Error, string | null>({
    mutationFn: async (cor) => {
      const url = `/api/cadastros/exames-cores/${encodeURIComponent(chave)}`;
      const r = cor
        ? await fetch(url, { method: "PUT", headers: collabAuthHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ cor }) })
        : await fetch(url, { method: "DELETE", headers: collabAuthHeaders() });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Falha ao salvar a cor");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/cadastros/exames-cores"] }),
    onError: (e) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
  return (
    <>
      <div className="flex w-[150px] items-center"><SeletorCorVidro rotulo={`Cor de ${chave}`} valor={atual} onChange={(c) => salvar.mutate(c.toUpperCase())} /></div>
      <div className="flex w-9 items-center justify-center">
        {cores.personalizada(chave) && (
          <Button type="button" size="icon" variant="ghost" aria-label={`Voltar ao padrão (${padrao})`} title={`Voltar ao padrão (${padrao})`} onClick={() => salvar.mutate(null)}><RotateCcw className="h-4 w-4" /></Button>
        )}
      </div>
    </>
  );
}

const GRADES_COR = [
  { chave: "GRADE BASICA", rotulo: "Grade básica" },
  { chave: "GRADE INTERMEDIARIA", rotulo: "Grade intermediária" },
  { chave: "GRADE AMPLIADA", rotulo: "Grade ampliada" },
  { chave: "GRADE SOFISTICADA", rotulo: "Grade sofisticada" },
];
export function PainelGrades() {
  return (
    <div className="panel-3d divide-y">
      {GRADES_COR.map((g) => (
        <div key={g.chave} className="flex items-center gap-3 px-3 py-2">
          <span className="min-w-0 flex-1 text-sm font-bold">{g.rotulo}</span>
          <CorEditavel chave={g.chave} padrao={GRADE_COR[g.chave]} />
        </div>
      ))}
      <div className="px-3 py-2 text-[11px] text-muted-foreground">A cor aparece na borda e no fundo suave dos cartões da aba "Blocos clínicos e grades". Só muda a aparência.</div>
    </div>
  );
}

function PainelOpcoes({ tipo, rotulo }: { tipo: Tipo; rotulo: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading } = useOpcoes(tipo);
  const criar = useCriarOpcao(tipo);
  const [novo, setNovo] = useState("");
  const [edit, setEdit] = useState<{ id: number; nome: string } | null>(null);
  const [verInativos, setVerInativos] = useState(false);
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
  const ativos = (data ?? []).filter((o) => o.ativo);
  const inativos = (data ?? []).filter((o) => !o.ativo);
  // Todas as linhas usam as MESMAS colunas fixas: nome | cor | restaurar cor | contagem | editar | ativo.
  const linha = (o: NonNullable<typeof data>[number]) => (
    <div key={o.id} className={`grid grid-cols-[minmax(0,1fr)_150px_36px_112px_40px_108px] items-center gap-3 px-3 py-2 ${o.ativo ? "" : "opacity-60"}`}>
      {edit?.id === o.id ? (
        <div className="col-span-full flex items-center gap-2">
          <Input autoFocus value={edit.nome} onChange={(e) => setEdit({ id: o.id, nome: e.target.value })} className="field-engraved" />
          <Button size="icon" className="btn-3d" aria-label="Salvar nome" disabled={renomear.isPending} onClick={() => renomear.mutate()}><Check className="h-4 w-4" /></Button>
          <Button size="icon" variant="outline" aria-label="Cancelar" onClick={() => setEdit(null)}><X className="h-4 w-4" /></Button>
        </div>
      ) : (
        <>
          <div className="min-w-0">{tipo === "natureza" ? <NaturezaChip natureza={o.nome} /> : <span className="block truncate text-sm font-bold">{o.nome}</span>}</div>
          {tipo === "natureza" && NATUREZA_COR[o.nome.toUpperCase()] ? (
            <CorEditavel chave={o.nome.toUpperCase()} padrao={NATUREZA_COR[o.nome.toUpperCase()]} />
          ) : (
            <><div className="w-[150px] text-center text-xs text-muted-foreground">—</div><div className="w-9" /></>
          )}
          <div className="concave-3d px-2 py-1 text-center text-[10px] font-black tabular-nums">{o.total} exame(s)</div>
          <Button size="icon" variant="ghost" aria-label={`Renomear ${o.nome}`} onClick={() => setEdit({ id: o.id, nome: o.nome })}><Pencil className="h-4 w-4" /></Button>
          <BotaoAtivo ativo={o.ativo} rotulo={o.nome} onChange={(v) => alterna.mutate({ id: o.id, ativo: v })} />
        </>
      )}
    </div>
  );
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
        {ativos.map(linha)}
        {!isLoading && ativos.length === 0 && <div className="p-3 text-sm text-muted-foreground">Nenhuma opção ativa.</div>}
      </div>
      {inativos.length > 0 && (
        <div className="space-y-2">
          <button type="button" aria-expanded={verInativos} onClick={() => setVerInativos((v) => !v)} className="paxter-seletor flex h-9 w-full items-center justify-between px-3 text-[11px] font-black uppercase tracking-wide" data-testid={`button-desativados-${tipo}`}>
            <span>Desativadas ({inativos.length}) — guardadas, fora das listas de escolha</span>
            <ChevronDown className={`h-4 w-4 transition-transform ${verInativos ? "rotate-180" : ""}`} />
          </button>
          {verInativos && <div className="panel-3d divide-y">{inativos.map(linha)}</div>}
        </div>
      )}
    </div>
  );
}

export function GestaoOpcoes({ extras: extrasRecebidos = [] }: { extras?: Array<{ chave: string; rotulo: string; conteudo: ReactNode }> }) {
  const extras = [{ chave: "grades-cor", rotulo: "Grades", conteudo: <PainelGrades /> }, ...extrasRecebidos];
  return (
    <Tabs defaultValue="natureza" className="space-y-3">
      <TabsList className="h-auto flex-wrap justify-start gap-2 bg-transparent p-0">
        {TIPOS.map((t) => (
          <TabsTrigger key={t.tipo} value={t.tipo} className="paxter-seletor h-9 px-4 text-[11px] font-black uppercase tracking-wide">{t.rotulo}</TabsTrigger>
        ))}
        {extras.map((x) => (
          <TabsTrigger key={x.chave} value={x.chave} className="paxter-seletor h-9 px-4 text-[11px] font-black uppercase tracking-wide">{x.rotulo}</TabsTrigger>
        ))}
      </TabsList>
      {TIPOS.map((t) => (
        <TabsContent key={t.tipo} value={t.tipo}><PainelOpcoes tipo={t.tipo} rotulo={t.rotulo} /></TabsContent>
      ))}
      {extras.map((x) => (
        <TabsContent key={x.chave} value={x.chave}>{x.conteudo}</TabsContent>
      ))}
    </Tabs>
  );
}

// ---------------- Upload do manual (PDF) + visualizador ----------------
export function UploadManualExames() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [aberto, setAberto] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pagina, setPagina] = useState(1);
  const [zoom, setZoom] = useState(100);
  const enviar = useMutation<unknown, Error>({
    mutationFn: async () => {
      const fd = new FormData();
      fd.append("arquivo", arquivo!);
      const r = await fetch("/api/cadastros/exames/manual", { method: "POST", headers: collabAuthHeaders(), body: fd });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Falha ao enviar");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/cadastros/exames/manual"] });
      setArquivo(null);
      if (inputRef.current) inputRef.current.value = "";
      toast({ title: "Arquivo enviado" });
    },
    onError: (e) => toast({ title: "Não foi possível enviar", description: e.message, variant: "destructive" }),
  });
  async function abrir() {
    setErro(null);
    setPagina(1);
    setZoom(100);
    setAberto(true);
    try {
      const r = await fetch("/api/cadastros/exames/manual/arquivo", { headers: collabAuthHeaders() });
      if (!r.ok) throw new Error(r.status === 404 ? "Nenhum manual foi enviado ainda." : "Não foi possível carregar o PDF.");
      setUrl(URL.createObjectURL(await r.blob()));
    } catch (e) {
      setUrl(null);
      setErro(e instanceof Error ? e.message : "Falha ao carregar o PDF");
    }
  }
  function fechar() {
    setAberto(false);
    if (url) URL.revokeObjectURL(url);
    setUrl(null);
  }
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="upload-manual-exames">
      <input ref={inputRef} type="file" accept="application/pdf,.pdf" className="max-w-[220px] text-xs" aria-label="Escolher PDF do manual"
        onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} data-testid="input-manual-pdf" />
      <Button size="sm" variant="outline" disabled={!arquivo || enviar.isPending} onClick={() => enviar.mutate()} data-testid="button-enviar-manual">
        <Upload className="mr-1.5 h-4 w-4" /> {enviar.isPending ? "Enviando..." : "Enviar PDF"}
      </Button>
      <Button size="sm" onClick={abrir} data-testid="button-visualizar-manual" className="border border-[#C9A24B] bg-[#0F1E36] font-black text-[#E5C16C] hover:bg-[#16294a]">
        Visualizar Arquitetura e Fluxo (Manual PDF)
      </Button>
      <Dialog open={aberto} onOpenChange={(o) => !o && fechar()}>
        <DialogContent className="flex h-[90vh] w-[90vw] max-w-[90vw] flex-col gap-2">
          <DialogHeader><DialogTitle>Arquitetura e Fluxo — Manual PDF</DialogTitle></DialogHeader>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Button size="sm" variant="outline" disabled={pagina <= 1} onClick={() => setPagina((p) => Math.max(1, p - 1))} aria-label="Página anterior">‹ Anterior</Button>
            <span className="font-black" data-testid="pagina-atual">Página {pagina}</span>
            <Button size="sm" variant="outline" onClick={() => setPagina((p) => p + 1)} aria-label="Próxima página">Próxima ›</Button>
            <span className="mx-2">|</span>
            <Button size="sm" variant="outline" disabled={zoom <= 50} onClick={() => setZoom((z) => z - 25)} aria-label="Diminuir zoom">−</Button>
            <span className="font-black">{zoom}%</span>
            <Button size="sm" variant="outline" disabled={zoom >= 300} onClick={() => setZoom((z) => z + 25)} aria-label="Aumentar zoom">+</Button>
            {url && (
              <a href={url} download="manual-exames.pdf" className="ml-auto" data-testid="link-baixar-manual">
                <Button size="sm" className="btn-3d">Baixar</Button>
              </a>
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-hidden rounded border bg-muted">
            {erro && <div className="p-4 text-sm font-bold" role="alert">{erro}</div>}
            {!erro && !url && <div className="p-4 text-sm" role="status">Carregando o PDF...</div>}
            {url && <iframe key={`${pagina}-${zoom}`} title="Manual PDF" src={`${url}#page=${pagina}&zoom=${zoom}`} className="h-full w-full" data-testid="iframe-manual" />}
          </div>
          <p className="text-[10px] text-muted-foreground">O visualizador do navegador também permite rolar todas as páginas.</p>
        </DialogContent>
      </Dialog>
    </div>
  );
}
