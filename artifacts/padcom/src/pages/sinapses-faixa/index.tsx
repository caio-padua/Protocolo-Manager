import "../matriz-fornecedores/matriz.css";
import "./sinapses-faixa.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  useApproveSinapseProposal,
  useGenerateInitialSinapseProposals,
  useGetSinapsesClinicasPainel,
  useRejectSinapseProposal,
  useUpdateSinapseProposal,
} from "@workspace/api-client-react";
import { collabAuthHeaders } from "@/lib/collab-auth";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Termostato } from "./Termostato";
import { CabecalhoGradeSaidas, LinhaGradeSaidas, FichaContador, ResumoDestino } from "./GradeSaidas";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Maximize2, Minimize2, ChevronDown, ChevronRight, Lock, Unlock, Search, Pencil, Play, Eye, AlertTriangle } from "lucide-react";

// ============================================================================
// SINAPSES CLINICAS - modelo "Faixa": blocos de dendritos (codigos) nas pontas,
// fios no centro e sanfona vertical com as correspondencias de cada pergunta.
// Dados reais (GET /api/cadastros/sinapses/painel). Excluir = desativar.
// Simulacao nao grava nada. Nao toca o Cockpit nem o motor.
// ============================================================================

type Categoria = "EXAME" | "PRESCRICAO" | "INJETAVEL_IM" | "INJETAVEL_SC" | "INJETAVEL_EV" | "IMPLANTE";
type TipoDestino = "exame" | "bloco_exames" | "formula" | "injetavel" | "implante";
type Modo = "VISUALIZACAO" | "EDICAO" | "SIMULACAO";
const CATEGORIAS: Array<{ chave: Categoria; rotulo: string; sigla: string; cor: string }> = [
  { chave: "EXAME", rotulo: "Exames", sigla: "EXA", cor: "#2563eb" },
  { chave: "PRESCRICAO", rotulo: "Prescrições", sigla: "FOR", cor: "#7c3aed" },
  { chave: "INJETAVEL_IM", rotulo: "Injetáveis IM", sigla: "IM", cor: "#ea580c" },
  { chave: "INJETAVEL_SC", rotulo: "Injetáveis SC", sigla: "SC", cor: "#0d9488" },
  { chave: "INJETAVEL_EV", rotulo: "Injetáveis EV", sigla: "EV", cor: "#dc2626" },
  { chave: "IMPLANTE", rotulo: "Implantes", sigla: "IMP", cor: "#ca8a04" },
];
const COR = Object.fromEntries(CATEGORIAS.map((c) => [c.chave, c.cor])) as Record<Categoria, string>;
const ROTULO = Object.fromEntries(CATEGORIAS.map((c) => [c.chave, c.rotulo])) as Record<Categoria, string>;
const SIGLA = Object.fromEntries(CATEGORIAS.map((c) => [c.chave, c.sigla])) as Record<Categoria, string>;
const PALETA_BLOCOS = ["#1d4ed8", "#0f766e", "#b45309", "#7c3aed", "#be123c", "#15803d", "#0369a1", "#a21caf", "#c2410c", "#4d7c0f", "#475569", "#9d174d"];
const ROW_H_DESKTOP = 24;
const ROW_H_TOUCH = 40;

interface Pergunta { perguntaId: string; pergunta: string; bloco: string | null; eSinalAlarme: boolean }
interface Destino { tipo: TipoDestino; id: number; nome: string; rotulo?: string; detalhe?: string | null; incompleto?: boolean }
interface Sinapse { id: number; perguntaId: string; categoria: Categoria; destinoTipo: TipoDestino; destinoId: number; cloneDe: number | null }
interface Proposta { id: number; perguntaId: string; categoria: Categoria; destinoTipo: TipoDestino; destinoId: number; eixo: string; justificativa: string; status: "PENDENTE" | "APROVADA" | "RECUSADA" }
interface Painel { perguntas: Pergunta[]; destinos: Record<Categoria, Destino[]>; injetaveisSemVia: number; blocoCores?: Record<string, string>; sinapses: Sinapse[]; propostas: Proposta[] }
interface ConexaoGrafico { id: string; perguntaId: string; categoria: Categoria; destinoTipo: TipoDestino; destinoId: number; estado: "ATIVA" | "PENDENTE" | "SEM_SAIDA" }

const chave = (c: Categoria, tipo: string, id: number) => `${c}|${tipo}|${id}`;
const codigoDestino = (c: Categoria, _tipo: string, id: number) => `${SIGLA[c]}-${id}`;
const semAcento = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const emCampo = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
};

function Faixa({ titulo, fichas, aberta, onToggle, direita, children, testid, ampliada }: { ampliada?: boolean; titulo: string; fichas?: Array<{ rotulo: string; valor: number; cor?: string }>; aberta: boolean; onToggle: () => void; direita?: React.ReactNode; children: React.ReactNode; testid: string }) {
  return (
    <section className={ampliada ? "panel-3d-sub fixed inset-0 z-[60] overflow-auto p-3" : "panel-3d-sub p-2"} style={ampliada ? { background: "#f7f2e6" } : undefined} data-testid={testid}>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={onToggle} aria-expanded={aberta} className="tecla-3d flex min-w-[12rem] flex-1 items-center gap-2 px-3 py-1 text-left" data-testid={`${testid}-toggle`}>
          {aberta ? <ChevronDown className="h-4 w-4 opacity-70" /> : <ChevronRight className="h-4 w-4 opacity-70" />}
          <span className="text-[11px] font-semibold uppercase tracking-widest text-primary/80">{titulo}</span>
          {fichas && <span className="ml-auto flex flex-wrap items-center gap-3">{fichas.map((f) => <FichaContador key={f.rotulo} {...f} />)}</span>}
        </button>
        {direita}
      </div>
      {aberta && <div className="mt-2">{children}</div>}
    </section>
  );
}

export default function SinapsesFaixa() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: painelGerado, isLoading, isError, refetch } = useGetSinapsesClinicasPainel();
  const data = painelGerado as Painel | undefined;

  const corDoBloco = useMemo(() => {
    const ordem: string[] = [];
    for (const p of data?.perguntas ?? []) { const b = p.bloco ?? "SEM BLOCO"; if (!ordem.includes(b)) ordem.push(b); }
    return (bloco: string | null) => { const b = bloco ?? "SEM BLOCO"; return data?.blocoCores?.[b] ?? PALETA_BLOCOS[Math.max(0, ordem.indexOf(b)) % PALETA_BLOCOS.length]; };
  }, [data]);
  const corDaPergunta = useMemo(() => { const m = new Map<string, string>(); for (const p of data?.perguntas ?? []) m.set(p.perguntaId, corDoBloco(p.bloco)); return m; }, [data, corDoBloco]);
  const [modo, setModo] = useState<Modo>("VISUALIZACAO");
  const [busca, setBusca] = useState("");
  const [cats, setCats] = useState<Categoria[]>([]);
  const [todos, setTodos] = useState(false);
  const [faixaAberta, setFaixaAberta] = useState(true);
  const [sanfonaAberta, setSanfonaAberta] = useState(true);
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const [sel, setSel] = useState<string[]>([]);
  const [ancora, setAncora] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [copia, setCopia] = useState<number[]>([]);
  const [propostaEditando, setPropostaEditando] = useState<number | null>(null);
  const [categoriaEdicao, setCategoriaEdicao] = useState<Categoria>("EXAME");
  const [buscaDestinoEdicao, setBuscaDestinoEdicao] = useState("");
  const [aprovarArmado, setAprovarArmado] = useState<number | null>(null);
  const [armadas, setArmadas] = useState<Set<number>>(new Set());
  const [arraste, setArraste] = useState<{ de: string; origens: string[]; x0: number; y0: number; x: number; y: number; clonar: boolean; fixo?: boolean } | null>(null);
  const arrasteRef = useRef(arraste);
  arrasteRef.current = arraste;
  const [alturaLinha, setAlturaLinha] = useState(ROW_H_DESKTOP);
  const [fioRecemSalvo, setFioRecemSalvo] = useState<string | null>(null);
  const brilhoTimer = useRef<number | null>(null);
  const [fioAberto, setFioAberto] = useState<string | null>(null);
  const graficoRef = useRef<HTMLDivElement | null>(null);
  const [loteArmado, setLoteArmado] = useState<string | null>(null);
  const [loteEmCurso, setLoteEmCurso] = useState(false);
  const [travada, setTravada] = useState<string | null>(null);
  const [fechadosE, setFechadosE] = useState<Set<string>>(new Set());
  const [fechadosD, setFechadosD] = useState<Set<string>>(new Set());
  const [ajudaAberta, setAjudaAberta] = useState(false);
  // Rolagem independente: perguntas (esquerda) e saidas (direita) rolam separadas; os fios acompanham os dois deslocamentos.
  const colEsqRef = useRef<HTMLDivElement | null>(null);
  const colDirRef = useRef<HTMLDivElement | null>(null);
  const centroRef = useRef<HTMLDivElement | null>(null);
  const [ampliada, setAmpliada] = useState(false);
  useEffect(() => { if (!ampliada) return; const t = (e: KeyboardEvent) => { if (e.key === "Escape" && !arrasteRef.current) setAmpliada(false); }; document.addEventListener("keydown", t); return () => document.removeEventListener("keydown", t); }, [ampliada]);
  const [mostrar, setMostrar] = useState({ ATIVA: true, PROPOSTA: true, SEM_SAIDA: true });
  const [rolE, setRolE] = useState(0);
  const [rolD, setRolD] = useState(0);
  const [alturaVisivel, setAlturaVisivel] = useState(480);
  // Menu de ligacoes de uma pergunta (dropdown fixo na tela, fora da area rolavel)
  const [menu, setMenu] = useState<{ perguntaId: string; x: number; y: number; acima: boolean } | null>(null);
  const [buscaSeletor, setBuscaSeletor] = useState("");
  const [seletorAberto, setSeletorAberto] = useState(false);
  const [telaSinapses, setTelaSinapses] = useState(false);
  const [telaVisao, setTelaVisao] = useState<"TUDO" | "ATIVAS" | "PROPOSTAS">("TUDO");
  const [destaqueAprov, setDestaqueAprov] = useState<string | null>(null);
  // Leva direto para a sanfona, na pergunta, onde a proposta e conferida (justificativa, editar, aprovar, recusar).
  const irParaAprovacao = (pid: string) => {
    setTelaSinapses(false);
    setSanfonaAberta(true);
    setAbertos((a) => new Set(a).add(pid));
    setDestaqueAprov(pid);
    window.setTimeout(() => document.querySelector(`[data-testid="faixa-item-${pid}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 120);
    window.setTimeout(() => setDestaqueAprov((v) => (v === pid ? null : v)), 3500);
  };
  const abrirTela = (v: "TUDO" | "ATIVAS" | "PROPOSTAS") => { setTelaVisao(v); setTelaSinapses(true); };
  const [seletorCats, setSeletorCats] = useState<Categoria[]>([]);
  const [desligadasMenu, setDesligadasMenu] = useState<Record<string, Array<{ categoria: Categoria; destinoTipo: string; destinoId: number }>>>({});

  useEffect(() => {
    const consulta = window.matchMedia("(max-width: 639px)");
    const atualizar = () => setAlturaLinha(consulta.matches ? ROW_H_TOUCH : ROW_H_DESKTOP);
    atualizar();
    consulta.addEventListener("change", atualizar);
    return () => consulta.removeEventListener("change", atualizar);
  }, []);

  useEffect(() => {
    const medir = () => { const h = graficoRef.current?.clientHeight; if (h) setAlturaVisivel(h); };
    medir();
    window.addEventListener("resize", medir);
    return () => window.removeEventListener("resize", medir);
  });
  useEffect(() => {
    if (!menu) return;
    const fechar = (e: Event) => {
      if ((e.target as HTMLElement | null)?.closest?.("[data-menu-sinapse]")) return;
      setMenu(null);
    };
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") setMenu(null); };
    document.addEventListener("pointerdown", fechar, true);
    document.addEventListener("keydown", tecla);
    window.addEventListener("scroll", fechar, true);
    return () => { document.removeEventListener("pointerdown", fechar, true); document.removeEventListener("keydown", tecla); window.removeEventListener("scroll", fechar, true); };
  }, [menu]);

  // Lingueta do seletor: fechada ate o usuario mexer no proprio seletor (o grafo nao a abre, para nao deslocar a tela durante a ligacao); fecha ao clicar fora ou com Escape.
  useEffect(() => {
    if (!seletorAberto) return;
    const fechar = (e: Event) => { if (!(e.target as HTMLElement | null)?.closest?.("[data-seletor-sinapse]")) setSeletorAberto(false); };
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") setSeletorAberto(false); };
    document.addEventListener("pointerdown", fechar, true);
    document.addEventListener("keydown", tecla);
    return () => { document.removeEventListener("pointerdown", fechar, true); document.removeEventListener("keydown", tecla); };
  }, [seletorAberto]);

  useEffect(() => () => {
    if (brilhoTimer.current !== null) window.clearTimeout(brilhoTimer.current);
  }, []);

  const invalidar = () => qc.invalidateQueries({ queryKey: ["/api/cadastros/sinapses/painel"] });
  const enviar = async (url: string, method: string, body: unknown) => {
    const r = await fetch(url, { method, headers: collabAuthHeaders({ "Content-Type": "application/json" }), body: JSON.stringify(body) });
    if (!r.ok) {
      const b = await r.json().catch(() => ({}));
      throw new Error(b.error ?? "Não foi possível salvar");
    }
    return r.json();
  };
  const onErro = (e: Error) => toast({ title: "Não foi salvo", description: e.message, variant: "destructive" });
  const criar = useMutation({
    mutationFn: (v: { perguntaId: string; categoria: Categoria; destinoTipo: string; destinoId: number }) => enviar("/api/cadastros/sinapses", "POST", v),
    // Otimista: o fio aparece no mesmo instante do clique; se o servidor recusar, volta ao estado anterior.
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: ["/api/cadastros/sinapses/painel"] });
      const anterior = qc.getQueryData<any>(["/api/cadastros/sinapses/painel"]);
      if (anterior?.sinapses && !anterior.sinapses.some((x: any) => x.perguntaId === v.perguntaId && x.categoria === v.categoria && x.destinoTipo === v.destinoTipo && x.destinoId === v.destinoId)) {
        qc.setQueryData(["/api/cadastros/sinapses/painel"], { ...anterior, sinapses: [...anterior.sinapses, { id: -Date.now(), perguntaId: v.perguntaId, categoria: v.categoria, destinoTipo: v.destinoTipo, destinoId: v.destinoId, cloneDe: null }] });
      }
      return { anterior };
    },
    onSuccess: (_resultado, variaveis) => {
      invalidar();
      setSel([variaveis.perguntaId]);
      const chaveFio = `${variaveis.perguntaId}|${chave(variaveis.categoria, variaveis.destinoTipo, variaveis.destinoId)}`;
      setFioRecemSalvo(chaveFio);
      if (brilhoTimer.current !== null) window.clearTimeout(brilhoTimer.current);
      brilhoTimer.current = window.setTimeout(() => {
        setFioRecemSalvo(null);
        brilhoTimer.current = null;
      }, 1100);
      toast({ title: "Ligação salva", description: "A sinapse acendeu e ficou selecionada." });
    },
    onError: (e: Error, _v, contexto) => { if (contexto?.anterior) qc.setQueryData(["/api/cadastros/sinapses/painel"], contexto.anterior); onErro(e); },
  });
  const salvarCorBloco = useMutation({
    mutationFn: (v: { bloco: string; cor: string }) => enviar("/api/cadastros/sinapses/bloco-cor", "PUT", v),
    onSuccess: () => { invalidar(); },
    onError: onErro,
  });
  const clonar = useMutation({
    mutationFn: (v: { perguntaOrigemId?: string; sinapseIds?: number[]; perguntaDestinoId: string }) => enviar("/api/cadastros/sinapses/clonar", "POST", v),
    onSuccess: (r: { copiadas: number }) => { invalidar(); toast({ title: `${r.copiadas} ligação(ões) copiada(s)`, description: "As originais não foram alteradas." }); },
    onError: onErro,
  });
  const desativar = useMutation({
    mutationFn: (id: number) => enviar(`/api/cadastros/sinapses/${id}/ativo`, "PATCH", { ativo: false }),
    onSuccess: () => { invalidar(); toast({ title: "Ligação desativada", description: "Nada foi apagado: ela só deixou de valer." }); },
    onError: onErro,
  });
  const gerarCarga = useGenerateInitialSinapseProposals({
    mutation: {
      onSuccess: (r) => {
        invalidar();
        const categorias = [
          ["Exames", r.destinosCobertosPorCategoria.EXAME, r.destinosElegiveisPorCategoria.EXAME],
          ["Fórmulas", r.destinosCobertosPorCategoria.PRESCRICAO, r.destinosElegiveisPorCategoria.PRESCRICAO],
          ["Injetáveis intramusculares", r.destinosCobertosPorCategoria.INJETAVEL_IM, r.destinosElegiveisPorCategoria.INJETAVEL_IM],
          ["Injetáveis subcutâneos", r.destinosCobertosPorCategoria.INJETAVEL_SC, r.destinosElegiveisPorCategoria.INJETAVEL_SC],
          ["Injetáveis endovenosos", r.destinosCobertosPorCategoria.INJETAVEL_EV, r.destinosElegiveisPorCategoria.INJETAVEL_EV],
          ["Implantes", r.destinosCobertosPorCategoria.IMPLANTE, r.destinosElegiveisPorCategoria.IMPLANTE],
        ] as const;
        const cobertos = categorias.reduce((soma, [, atual]) => soma + atual, 0);
        const elegiveis = categorias.reduce((soma, [, , total]) => soma + total, 0);
        const resumo = categorias.map(([nome, atual, total]) => `${nome} ${atual}/${total}`).join(" · ");
        const semLigacao = Object.values(r.destinosSemLigacaoPorCategoria).reduce((soma, atual) => soma + atual, 0);
        toast({
          title: `${r.inseridas} proposta(s) nova(s) gravada(s)`,
          description: `${cobertos}/${elegiveis} destinos com ligação; ${resumo}. ${semLigacao} sem ligação, ${r.inelegiveis.blocosDeExamesVazios} blocos vazios e ${r.inelegiveis.injetaveisSemVia} injetáveis sem via foram excluídos. As novas ligações continuam pendentes.`,
        });
      },
      onError: onErro,
    },
  });
  const editarProposta = useUpdateSinapseProposal({
    mutation: {
      onSuccess: () => { invalidar(); setPropostaEditando(null); setBuscaDestinoEdicao(""); toast({ title: "Proposta atualizada" }); },
      onError: onErro,
    },
  });
  const aprovarProposta = useApproveSinapseProposal({
    mutation: {
      onSuccess: () => { invalidar(); setAprovarArmado(null); toast({ title: "Ligação aprovada", description: "Ela agora aparece como ativa nesta tela. O motor clínico continua sem consumir sinapses." }); },
      onError: onErro,
    },
  });
  const recusarProposta = useRejectSinapseProposal({
    mutation: {
      onSuccess: () => { invalidar(); toast({ title: "Proposta recusada", description: "O registro foi preservado e não virou ligação ativa." }); },
      onError: onErro,
    },
  });

  const nomeDe = useMemo(() => {
    const m = new Map<string, Destino>();
    for (const c of CATEGORIAS) for (const d of data?.destinos[c.chave] ?? []) m.set(chave(c.chave, d.tipo, d.id), d);
    return m;
  }, [data]);
  const porPergunta = useMemo(() => {
    const m = new Map<string, Sinapse[]>();
    for (const s of data?.sinapses ?? []) {
      if (cats.length && !cats.includes(s.categoria)) continue;
      const a = m.get(s.perguntaId); if (a) a.push(s); else m.set(s.perguntaId, [s]);
    }
    return m;
  }, [data, cats]);
  const propostasPorPergunta = useMemo(() => {
    const m = new Map<string, Proposta[]>();
    for (const proposta of data?.propostas ?? []) {
      if (proposta.status !== "PENDENTE" || (cats.length && !cats.includes(proposta.categoria))) continue;
      const a = m.get(proposta.perguntaId); if (a) a.push(proposta); else m.set(proposta.perguntaId, [proposta]);
    }
    return m;
  }, [data, cats]);
  const conexoesPorPergunta = useMemo(() => {
    const m = new Map<string, ConexaoGrafico[]>();
    for (const s of data?.sinapses ?? []) {
      if (cats.length && !cats.includes(s.categoria)) continue;
      const a = m.get(s.perguntaId) ?? [];
      const destinoChave = chave(s.categoria, s.destinoTipo, s.destinoId);
      const destino = nomeDe.get(destinoChave);
      a.push({
        id: `ativa-${s.id}`,
        perguntaId: s.perguntaId,
        categoria: s.categoria,
        destinoTipo: s.destinoTipo,
        destinoId: s.destinoId,
        estado: destino && !destino.incompleto ? "ATIVA" : "SEM_SAIDA",
      });
      m.set(s.perguntaId, a);
    }
    if (modo !== "SIMULACAO") for (const p of data?.propostas ?? []) {
      if (p.status !== "PENDENTE" || (cats.length && !cats.includes(p.categoria))) continue;
      const a = m.get(p.perguntaId) ?? [];
      a.push({ id: `proposta-${p.id}`, perguntaId: p.perguntaId, categoria: p.categoria, destinoTipo: p.destinoTipo, destinoId: p.destinoId, estado: "PENDENTE" });
      m.set(p.perguntaId, a);
    }
    return m;
  }, [data, cats, modo, nomeDe]);

  const selecaoInicialFeita = useRef(false);
  useEffect(() => {
    // Seleciona uma pergunta so na abertura; depois, desmarcar deve deixar tudo sem fios.
    if (!data || sel.length || selecaoInicialFeita.current) return;
    selecaoInicialFeita.current = true;
    const primeira = data.perguntas.find((p) => p.perguntaId === "C-GER03" && conexoesPorPergunta.has(p.perguntaId))
      ?? data.perguntas.find((p) => conexoesPorPergunta.has(p.perguntaId));
    if (primeira) setSel([primeira.perguntaId]);
  }, [data, sel.length, conexoesPorPergunta]);

  const q = semAcento(busca.trim());
  // Esquerda: na EDICAO todas as perguntas (para ligar); nos demais modos so as que tem ligacao.
  const esquerda = useMemo(() => {
    return (data?.perguntas ?? []).filter((p) => {
      const lig = conexoesPorPergunta.get(p.perguntaId) ?? [];
      if (!todos && modo !== "EDICAO" && lig.length === 0) return false;
      if (!q) return true;
      return semAcento(`${p.perguntaId} ${p.pergunta} ${p.bloco ?? ""}`).includes(q) || lig.some((s) => semAcento(nomeDe.get(chave(s.categoria, s.destinoTipo, s.destinoId))?.nome ?? "").includes(q));
    }).sort((a, b) => a.perguntaId.localeCompare(b.perguntaId, "pt-BR", { numeric: true })); // ordem fixa por codigo: ligar nunca muda a posicao
  }, [data, porPergunta, conexoesPorPergunta, modo, q, nomeDe, todos]);

  // Direita: destinos ligados; na EDICAO com saida escolhida, o catalogo inteiro dela.
  const direita = useMemo(() => {
    const m = new Map<string, { k: string; cat: Categoria; tipo: TipoDestino; id: number; nome: string; nAtivas: number; nPropostas: number; nSemSaida: number; incompleto?: boolean }>();
    if (todos || modo === "EDICAO") {
      for (const c of (cats.length ? cats : CATEGORIAS.map((x) => x.chave))) for (const d of data?.destinos[c] ?? []) {
        if (q && !semAcento(d.nome).includes(q)) continue;
        m.set(chave(c, d.tipo, d.id), {
          k: chave(c, d.tipo, d.id),
          cat: c,
          tipo: d.tipo,
          id: d.id,
          nome: d.nome,
          nAtivas: 0,
          nPropostas: 0,
          nSemSaida: 0,
          incompleto: d.incompleto,
        });
      }
    }
    const visiveis = new Set(esquerda.map((p) => p.perguntaId));
    conexoesPorPergunta.forEach((lig, pid) => {
      if (!visiveis.has(pid)) return;
      for (const s of lig) {
        const k = chave(s.categoria, s.destinoTipo, s.destinoId);
        const e = m.get(k);
        if (e) {
          if (s.estado === "ATIVA") e.nAtivas++;
          else if (s.estado === "PENDENTE") e.nPropostas++;
          else e.nSemSaida++;
        } else {
          const destino = nomeDe.get(k);
          m.set(k, {
            k, cat: s.categoria, tipo: s.destinoTipo, id: s.destinoId,
            nome: nomeDe.get(k)?.nome ?? `#${s.destinoId}`,
            nAtivas: s.estado === "ATIVA" ? 1 : 0,
            nPropostas: s.estado === "PENDENTE" ? 1 : 0,
            nSemSaida: s.estado === "SEM_SAIDA" ? 1 : 0,
            incompleto: !destino || destino.incompleto,
          });
        }
      }
    });
    const ordemCat = (c: Categoria) => CATEGORIAS.findIndex((x) => x.chave === c);
    return Array.from(m.values()).sort((a, b) => ordemCat(a.cat) - ordemCat(b.cat) || a.nome.localeCompare(b.nome, "pt-BR", { numeric: true }));
  }, [data, modo, cats, q, esquerda, conexoesPorPergunta, nomeDe, todos]);

  // Linhas do grafo: cada lado e uma lista de grupos recolhiveis (blocos a esquerda, saidas por categoria a direita).
  // Item dentro de grupo recolhido prende o fio na barra do grupo.
  const { linhasE, yE } = useMemo(() => {
    const ordem = new Map<string, number>();
    (data?.perguntas ?? []).forEach((p, i) => { const b = p.bloco ?? "SEM BLOCO"; if (!ordem.has(b)) ordem.set(b, i); });
    const grupos = new Map<string, Pergunta[]>();
    for (const p of esquerda) { const b = p.bloco ?? "SEM BLOCO"; const a = grupos.get(b); if (a) a.push(p); else grupos.set(b, [p]); }
    const linhas: Array<{ tipo: "grupo"; k: string; n: number; nLig: number } | { tipo: "item"; p: Pergunta }> = [];
    const y = new Map<string, number>();
    Array.from(grupos.keys()).sort((x, z) => (ordem.get(x) ?? 0) - (ordem.get(z) ?? 0)).forEach((b) => {
      const itens = grupos.get(b)!;
      const nLig = itens.filter((p) => (conexoesPorPergunta.get(p.perguntaId)?.length ?? 0) > 0).length;
      const yGrupo = (linhas.length + 0.5) * alturaLinha;
      linhas.push({ tipo: "grupo", k: b, n: itens.length, nLig });
      const fechado = fechadosE.has(b);
      itens.forEach((p) => {
        if (fechado) { y.set(p.perguntaId, yGrupo); return; }
        y.set(p.perguntaId, (linhas.length + 0.5) * alturaLinha);
        linhas.push({ tipo: "item", p });
      });
    });
    return { linhasE: linhas, yE: y };
  }, [data, esquerda, conexoesPorPergunta, fechadosE, alturaLinha]);
  const { linhasD, yD } = useMemo(() => {
    const linhas: Array<{ tipo: "grupo"; k: Categoria; n: number; nLig: number } | { tipo: "item"; d: (typeof direita)[number] }> = [];
    const y = new Map<string, number>();
    for (const c of CATEGORIAS) {
      const itens = direita.filter((d) => d.cat === c.chave);
      if (!itens.length) continue;
      const yGrupo = (linhas.length + 0.5) * alturaLinha;
      linhas.push({ tipo: "grupo", k: c.chave, n: itens.length, nLig: itens.filter((d) => d.nAtivas + d.nPropostas + d.nSemSaida > 0).length });
      const fechado = fechadosD.has(c.chave);
      itens.forEach((d) => {
        if (fechado) { y.set(d.k, yGrupo); return; }
        y.set(d.k, (linhas.length + 0.5) * alturaLinha);
        linhas.push({ tipo: "item", d });
      });
    }
    return { linhasD: linhas, yD: y };
  }, [direita, fechadosD, alturaLinha]);
  const altura = Math.max(linhasE.length, linhasD.length, 1) * alturaLinha;
  const fios = useMemo(() => esquerda.flatMap((p) => (conexoesPorPergunta.get(p.perguntaId) ?? []).map((s) => ({ s, y1: yE.get(p.perguntaId)!, y2: yD.get(chave(s.categoria, s.destinoTipo, s.destinoId)) }))).filter((f) => f.y2 !== undefined), [esquerda, conexoesPorPergunta, yE, yD]);

  const ativa = travada ?? (sel.length === 1 ? sel[0] : null);
  const foco = arraste?.de ?? travada ?? hover ?? (sel.length === 1 ? sel[0] : null);
  const simAcesos = useMemo(() => {
    const set = new Set<string>();
    if (modo === "SIMULACAO") {
      for (const pid of sel) {
        for (const s of porPergunta.get(pid) ?? []) {
          const destino = nomeDe.get(chave(s.categoria, s.destinoTipo, s.destinoId));
          if (destino && !destino.incompleto) set.add(chave(s.categoria, s.destinoTipo, s.destinoId));
        }
      }
    }
    return set;
  }, [modo, sel, porPergunta, nomeDe]);
  const resumoSim = useMemo(() => {
    const r = Object.fromEntries(CATEGORIAS.map((c) => [c.chave, 0])) as Record<Categoria, number>;
    simAcesos.forEach((k) => { r[k.split("|")[0] as Categoria] += 1; });
    return r;
  }, [simAcesos]);

  // ---- selecao (clique, Ctrl, Shift) ----
  const clicar = (e: React.MouseEvent, id: string) => {
    if (arrasteRef.current) cancelarArraste(); // clicar em qualquer pergunta desarma o fio em andamento
    if (e.shiftKey && ancora) {
      const ordem = esquerda.map((p) => p.perguntaId);
      const a = ordem.indexOf(ancora), b = ordem.indexOf(id);
      if (a >= 0 && b >= 0) { const [i, j] = a < b ? [a, b] : [b, a]; setSel(ordem.slice(i, j + 1)); return; }
    }
    setAncora(id);
    if (e.ctrlKey || e.metaKey || modo === "SIMULACAO") { setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id])); return; }
    if (sel.length === 1 && sel[0] === id) { setSel([]); setHover(null); setTravada((t) => (t === id ? null : t)); return; }
    setSel([id]);
  };
  const centralizar = (perguntaId: string) => {
    const esq = colEsqRef.current;
    const dir = colDirRef.current;
    const y = yE.get(perguntaId);
    if (!esq || !dir || y === undefined) return;
    const ysD = (conexoesPorPergunta.get(perguntaId) ?? []).map((c) => yD.get(chave(c.categoria, c.destinoTipo, c.destinoId))).filter((v): v is number => v !== undefined);
    const reduzir = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const behavior = reduzir ? "auto" : "smooth";
    esq.scrollTo({ top: Math.max(0, y - esq.clientHeight / 2), behavior });
    if (ysD.length) dir.scrollTo({ top: Math.max(0, ysD.reduce((a, b) => a + b, 0) / ysD.length - dir.clientHeight / 2), behavior });
  };
  const propostasFiltradas = (perguntaId?: string) => {
    const visiveis = new Set(esquerda.map((p) => p.perguntaId));
    return (data?.propostas ?? []).filter((p) => p.status === "PENDENTE" && visiveis.has(p.perguntaId) && (!perguntaId || p.perguntaId === perguntaId) && (!cats.length || cats.includes(p.categoria)));
  };
  const aprovarLote = async (escopo: string, perguntaId?: string) => {
    if (loteEmCurso) return;
    const fila = propostasFiltradas(perguntaId).map((p) => p.id);
    if (loteArmado !== escopo) { setLoteArmado(escopo); window.setTimeout(() => setLoteArmado((v) => (v === escopo ? null : v)), 5000); return; }
    setLoteArmado(null);
    setLoteEmCurso(true);
    let ok = 0;
    const falhas: string[] = [];
    let i = 0;
    const trabalhador = async () => {
      while (i < fila.length) {
        const id = fila[i++];
        try { await enviar(`/api/cadastros/sinapses/propostas/${id}/aprovar`, "POST", {}); ok++; }
        catch (e) { falhas.push((e as Error).message); }
      }
    };
    await Promise.all([trabalhador(), trabalhador(), trabalhador(), trabalhador()]);
    setLoteEmCurso(false);
    invalidar();
    toast({
      title: falhas.length ? `${ok} aprovada(s), ${falhas.length} não aprovada(s)` : `${ok} proposta(s) aprovada(s)`,
      description: falhas.length ? `Primeiro motivo: ${falhas[0]}` : "Elas agora aparecem como ligações ativas.",
      variant: falhas.length ? "destructive" : undefined,
    });
  };
  const alternarAberto = (id: string) => setAbertos((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const copiar = useCallback(() => {
    const ids = sel.flatMap((p) => (data?.sinapses ?? []).filter((s) => s.perguntaId === p).map((s) => s.id));
    setCopia(ids);
    toast({ title: ids.length ? `${ids.length} ligação(ões) copiada(s)` : "Nada para copiar", description: ids.length ? "Selecione outras perguntas e use Ctrl+V." : undefined });
  }, [sel, data, toast]);
  const colar = useCallback(() => {
    if (!copia.length) { toast({ title: "Nada copiado ainda" }); return; }
    for (const pid of sel) clonar.mutate({ sinapseIds: copia, perguntaDestinoId: pid });
  }, [copia, sel, clonar, toast]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (emCampo(e.target)) return;
      const t = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && t === "c" && modo === "EDICAO") { e.preventDefault(); copiar(); return; }
      if ((e.ctrlKey || e.metaKey) && t === "v" && modo === "EDICAO") { e.preventDefault(); colar(); return; }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (t === "v" || t === "s") {
        arrasteRef.current = null;
        setArraste(null);
        setTravada(null);
        setModo(t === "v" ? "VISUALIZACAO" : "SIMULACAO");
      }
      if (t === "e") setModo("EDICAO");
      if (t === "escape") { setSel([]); setTravada(null); arrasteRef.current = null; setArraste(null); }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [modo, copiar, colar]);

  // ---- puxar o fio ----
  useEffect(() => {
    if (!arraste) return;
    const mover = (e: PointerEvent) => setArraste((a) => {
      if (!a) return a;
      let x = e.clientX;
      let y = e.clientY;
      if (!a.clonar) {
        let melhor = 24;
        document.querySelectorAll<HTMLElement>("[data-pino-destino]").forEach((el) => {
          const r = el.getBoundingClientRect();
          const dist = Math.hypot(r.left + r.width / 2 - e.clientX, r.top + r.height / 2 - e.clientY);
          if (dist < melhor) { melhor = dist; x = r.left + r.width / 2; y = r.top + r.height / 2; }
        });
      }
      const proximo = { ...a, x, y };
      arrasteRef.current = proximo;
      return proximo;
    });
    const soltar = (e: PointerEvent) => {
      const a = arrasteRef.current;
      if (!a) return;
      const alvo = document.elementFromPoint(a.clonar ? e.clientX : a.x, a.clonar ? e.clientY : a.y) as HTMLElement | null;
      if (a.clonar) {
        const destino = (alvo?.closest("[data-pergunta]") as HTMLElement | null)?.dataset.pergunta;
        if (destino && destino !== a.de) {
          arrasteRef.current = null;
          setArraste(null);
          clonar.mutate({ perguntaOrigemId: a.de, perguntaDestinoId: destino });
        }
        return;
      }
      if (a.fixo) return; // fio armado por clique: quem liga e o clique na saida (onClick)
      const d = (alvo?.closest("[data-dest]") as HTMLElement | null)?.dataset.dest;
      if (!d) return;
      arrasteRef.current = null;
      setArraste(null);
      const [categoria, destinoTipo, id] = d.split("|");
      for (const perguntaId of a.origens) criar.mutate({ perguntaId, categoria: categoria as Categoria, destinoTipo, destinoId: Number(id) });
    };
    // Ao rolar a pagina ou o grafo, a ponta de origem acompanha o pino (senao o fio fica solto na tela).
    const reancorar = () => setArraste((a) => {
      if (!a) return a;
      const pino = document.querySelector<HTMLElement>(`[data-testid="faixa-porta-${CSS.escape(a.de)}"]`);
      if (!pino) return a;
      const r = pino.getBoundingClientRect();
      const proximo = { ...a, x0: r.left + r.width / 2, y0: r.top + r.height / 2 };
      arrasteRef.current = proximo;
      return proximo;
    });
    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", soltar);
    window.addEventListener("scroll", reancorar, true);
    return () => { window.removeEventListener("pointermove", mover); window.removeEventListener("pointerup", soltar); window.removeEventListener("scroll", reancorar, true); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!arraste]);
  const armadoEm = useRef(0);
  const cancelarArraste = () => { arrasteRef.current = null; setArraste(null); };
  const iniciarNoPonto = (de: string, x: number, y: number, clonarOrigem = false) => {
    if (modo !== "EDICAO") return;
    // Clicar de novo no mesmo ponto desarma o fio.
    if (arrasteRef.current?.de === de) return; // ja armado: dois cliques rapidos (onClick) desarmam
    const proximo = {
      de,
      origens: sel.includes(de) && sel.length > 1 ? [...sel] : [de],
      x0: x,
      y0: y,
      x,
      y,
      clonar: clonarOrigem,
    };
    armadoEm.current = Date.now();
    arrasteRef.current = proximo;
    setArraste(proximo);
  };
  const iniciar = (e: React.PointerEvent<HTMLButtonElement>, de: string) => {
    if (modo !== "EDICAO") return;
    e.preventDefault();
    e.stopPropagation();
    const r = e.currentTarget.getBoundingClientRect();
    iniciarNoPonto(de, r.left + r.width / 2, r.top + r.height / 2, e.altKey);
  };
  // Clique numa saida com o fio armado: 1 clique liga e continua; 2 cliques rapidos (ja ligou no 1o) fecham; teclado liga e fecha.
  const cliqueNaSaida = (destino: string, detail: number) => {
    const a = arrasteRef.current;
    if (!a || a.clonar) return;
    if (detail >= 2) { cancelarArraste(); return; }
    const [categoria, destinoTipo, id] = destino.split("|");
    for (const perguntaId of a.origens) criar.mutate({ perguntaId, categoria: categoria as Categoria, destinoTipo, destinoId: Number(id) });
    if (detail === 0) cancelarArraste();
  };
  const concluirNoDestino = (destino: string) => {
    const a = arrasteRef.current;
    if (!a || a.clonar) return;
    arrasteRef.current = null;
    setArraste(null);
    const [categoria, destinoTipo, id] = destino.split("|");
    for (const perguntaId of a.origens) {
      criar.mutate({ perguntaId, categoria: categoria as Categoria, destinoTipo, destinoId: Number(id) });
    }
  };

  const ligarRapido = (d: { k: string; cat: Categoria; tipo: TipoDestino; id: number; incompleto?: boolean }) => {
    if (!travada || modo !== "EDICAO") return;
    if (d.incompleto) { toast({ title: "Saída sem conteúdo", description: "Este bloco está vazio e não pode receber ligação.", variant: "destructive" }); return; }
    const jaLigada = (data?.sinapses ?? []).some((x) => x.perguntaId === travada && chave(x.categoria, x.destinoTipo, x.destinoId) === d.k);
    if (jaLigada) { toast({ title: "Esta saída já está ligada", description: "Para desfazer, use “Ver sinapses desta pergunta” (olho) ao lado da busca." }); return; }
    const proposta = (data?.propostas ?? []).find((x) => x.status === "PENDENTE" && x.perguntaId === travada && chave(x.categoria, x.destinoTipo, x.destinoId) === d.k);
    if (proposta) { aprovarProposta.mutate({ id: proposta.id }); return; }
    criar.mutate({ perguntaId: travada, categoria: d.cat, destinoTipo: d.tipo, destinoId: d.id });
  };
  const cliqueExcluir = (id: number) => {
    if (armadas.has(id)) { setArmadas((s) => { const n = new Set(s); n.delete(id); return n; }); desativar.mutate(id); return; }
    setArmadas((s) => new Set(s).add(id));
    window.setTimeout(() => setArmadas((s) => { const n = new Set(s); n.delete(id); return n; }), 4000);
  };

  const total = data?.sinapses.length ?? 0;
  const totalPropostasPendentes = data?.propostas.filter((p) => p.status === "PENDENTE").length ?? 0;
  const ligacoesComSaidaReal = (data?.sinapses ?? []).filter((sinapse) => {
    const destino = nomeDe.get(chave(sinapse.categoria, sinapse.destinoTipo, sinapse.destinoId));
    return !!destino && !destino.incompleto;
  });
  const perguntasComSaidaReal = new Set(ligacoesComSaidaReal.map((sinapse) => sinapse.perguntaId)).size;
  const ligacoesSemSaida = total - ligacoesComSaidaReal.length;
  const propostasPorCategoria = useMemo(() => {
    const r = Object.fromEntries(CATEGORIAS.map((c) => [c.chave, 0])) as Record<Categoria, number>;
    for (const proposta of data?.propostas ?? []) if (proposta.status === "PENDENTE") r[proposta.categoria]++;
    return r;
  }, [data]);
  const ajuda =
    arraste
      ? arraste.clonar
        ? `Cópia iniciada em ${arraste.de}. Solte noutra pergunta para copiar; Escape cancela.`
        : `Fio iniciado em ${arraste.de}. Clique em uma ou mais saídas (1 clique liga e continua; 2 cliques rápidos ligam e fecham). 2 cliques rápidos na bolinha ou Escape desarmam.`
      : modo === "EDICAO"
      ? "Clique no ponto de uma pergunta e depois no ponto de uma saída. O fio segue o ponteiro. Também é possível arrastar. Alt + arraste até outra pergunta copia; Ctrl+C e Ctrl+V copiam perguntas selecionadas."
      : modo === "SIMULACAO"
        ? "Simulação, nada é gravado: marque perguntas como respondidas “sim” e veja quais saídas acenderiam."
        : "Clique num código para destacar os fios e abrir as correspondências na sanfona.";

  const perguntaAtiva = ativa ? data?.perguntas.find((x) => x.perguntaId === ativa) : undefined;
  const ligacoesAtiva = ativa ? (data?.sinapses ?? []).filter((x) => x.perguntaId === ativa) : [];
  const propostasAtiva = ativa ? (data?.propostas ?? []).filter((x) => x.status === "PENDENTE" && x.perguntaId === ativa) : [];
  const controlesFaixa = (
    <div className="flex w-full flex-wrap items-center justify-between gap-3" data-testid="faixa-mini-console">
          <div className="flex gap-3" role="group" aria-label="Modo da tela">
            {([["VISUALIZACAO", "Visualização", "V", Eye], ["EDICAO", "Edição", "E", Pencil], ["SIMULACAO", "Simulação", "S", Play]] as const).map(([m, rot, tecla, Ic]) => (
              <button key={m} type="button" aria-pressed={modo === m} title={`${rot} (${tecla})`} onClick={() => { if (m !== "EDICAO") { arrasteRef.current = null; setArraste(null); setTravada(null); } setModo(m); }} className="tecla-3d flex h-8 items-center gap-1.5 px-2.5 text-[11px] font-bold uppercase tracking-wide" data-testid={`faixa-modo-${m}`}>
                <Ic className="h-3.5 w-3.5" />{rot}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-3" data-testid="faixa-mini-console-acoes">
            {modo === "EDICAO" && perguntaAtiva && (
              <button type="button" aria-pressed={travada === perguntaAtiva.perguntaId} onClick={() => setTravada((v) => (v === perguntaAtiva.perguntaId ? null : perguntaAtiva.perguntaId))} className="tecla-3d flex h-8 shrink-0 items-center gap-1 px-2 text-[10px] font-bold uppercase" data-testid="faixa-travar" title="Com a pergunta travada, cada clique numa saída à direita liga essa saída a ela.">
                {travada === perguntaAtiva.perguntaId ? <><Lock className="h-3 w-3" />Travada</> : <><Unlock className="h-3 w-3" />Travar pergunta</>}
              </button>
            )}
            {modo === "EDICAO" && perguntaAtiva && propostasAtiva.length > 0 && (
              <button type="button" disabled={loteEmCurso} onClick={() => aprovarLote(`q-${perguntaAtiva.perguntaId}`, perguntaAtiva.perguntaId)} className="tecla-3d h-8 shrink-0 px-2 text-[10px] font-bold uppercase" data-testid="faixa-aprovar-da-pergunta">
                {loteEmCurso ? "Aprovando..." : loteArmado === `q-${perguntaAtiva.perguntaId}` ? `Confirmar ${propostasAtiva.length}` : `Aprovar ${propostasAtiva.length} proposta(s)`}
              </button>
            )}
            {modo === "EDICAO" && propostasFiltradas().length > 0 && (
              <button type="button" disabled={loteEmCurso} onClick={() => aprovarLote("todas")} className="tecla-3d h-8 px-2 text-[10px] font-bold uppercase" data-testid="button-aprovar-lote" title="Aprova todas as propostas pendentes das perguntas e filtros visíveis agora">
                {loteEmCurso ? "Aprovando..." : loteArmado === "todas" ? `Confirmar ${propostasFiltradas().length}` : "Aprovar propostas filtradas"}
              </button>
            )}
            <button type="button" className="tecla-3d h-8 px-2 text-[10px] font-bold uppercase" onClick={() => gerarCarga.mutate({ data: {} })} disabled={gerarCarga.isPending} data-testid="button-gerar-propostas">
              {gerarCarga.isPending ? "Gravando propostas…" : "Gerar propostas iniciais"}
            </button>
          </div>
    </div>
  );
  const alternarGrupo = (conjunto: Set<string>, atualizar: (v: Set<string>) => void, k: string) => {
    const n = new Set(conjunto);
    if (n.has(k)) n.delete(k); else n.add(k);
    atualizar(n);
  };
  const barraGrupo = ({ titulo, cor, n, nLig, fechado, onClick, testid }: { titulo: string; cor?: string; n: number; nLig: number; fechado: boolean; onClick: () => void; testid: string }) => (
    <button type="button" onClick={onClick} aria-expanded={!fechado} aria-pressed={fechado} data-testid={testid}
      className="tecla-3d flex h-full min-w-0 flex-1 items-center gap-1.5 px-1.5 text-left" title={`${titulo}: ${nLig} com ligação, ${n} no total. ${fechado ? "Clique para abrir." : "Clique para recolher."}`}>
      <span className="truncate text-[10px] font-black uppercase tracking-wider" style={{ color: cor }}>{titulo}</span>
      <span className="ml-auto min-w-[2.75rem] rounded-[6px] bg-black/5 px-2 py-0.5 text-center text-[10px] font-bold tabular-nums">{nLig}/{n}</span>
      <span className="w-3 shrink-0 text-center text-[12px] font-bold leading-none" aria-hidden="true">{fechado ? "+" : "−"}</span>
    </button>
  );

  return (
    <div className="sinapse-tela space-y-3" data-testid="pagina-sinapses-faixa">
      {/* PAINEL DE COMANDO UNICO E CONGELADO: linha 1 = titulo/contagem/ajuda; linha 2 = busca + correspondencia; mini console central de 2 andares */}
      <section className="sinapse-comando panel-3d-sub p-2" data-testid="faixa-comando">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="bevel-3d px-4 py-1.5 text-[13px] font-bold uppercase tracking-[0.18em] text-primary">Sinapses Clínicas</h1>
          <div className="flex flex-wrap items-center gap-3" data-testid="faixa-contagem" title="Ligação ativa = saída real conectada à pergunta. Proposta = sugestão ainda não aprovada; não alimenta o motor clínico.">
            <FichaContador rotulo="Ativas" valor={total} cor="#166534" />
            <FichaContador rotulo="Propostas" valor={totalPropostasPendentes} cor="#9b6b11" />
            <FichaContador rotulo="Com saída" valor={`${perguntasComSaidaReal}/${data?.perguntas.length ?? 0}`} />
            {ligacoesSemSaida > 0 && <FichaContador rotulo="Sem saída" valor={ligacoesSemSaida} cor="#b91c1c" />}
          </div>
          <p className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground" aria-live="polite" data-testid="faixa-ajuda" title={ajuda}>{ajuda}</p>
          <button type="button" aria-pressed={ajudaAberta} onClick={() => setAjudaAberta((v) => !v)} className="tecla-3d ml-auto h-9 w-9 text-[13px] font-bold" aria-label="Como usar esta tela" title="Como usar esta tela">?</button>
        </div>
        {ajudaAberta && (
          <div className="concave-3d mt-2 space-y-1 p-2 text-[11px] leading-snug" data-testid="faixa-ajuda-detalhe">
            <p><b>Para cadastrar rápido:</b> em Edição, clique numa pergunta, aperte <b>Travar pergunta</b> no painel central e clique nas saídas à direita. Cada clique liga (ou aprova a proposta daquela saída).</p>
            <p><b>Também funciona:</b> clicar no ponto da pergunta e depois no ponto de uma saída, ou arrastar. Alt + arraste copia as ligações; Ctrl+C e Ctrl+V copiam perguntas selecionadas. Escape cancela e destrava.</p>
            <p><b>Menu da pergunta:</b> o botão com a seta, à direita de cada pergunta, abre a lista das ligações dela. Em Edição, cada ligação tem uma tecla de ligar e desligar.</p>
            <p><b>Fios:</b> contínuo = saída real; tracejado dourado = proposta; tracejado vermelho = ligação ativa sem saída. As duas colunas rolam de forma independente. Esta tela só cadastra ligações; não emite nem envia nada.</p>
          </div>
        )}

        {/* BUSCA + CORRESPONDENCIA ATUAL */}
        {modo === "SIMULACAO" && (
          <div className="mt-2 grid grid-cols-3 gap-3 md:grid-cols-6" data-testid="faixa-resumo-simulacao">
            {CATEGORIAS.map((c) => (
              <div key={c.chave} className="concave-3d px-3 py-2 text-center text-[10px] font-bold uppercase" style={{ color: c.cor, opacity: resumoSim[c.chave] ? 1 : 0.45 }}>{c.sigla}: {resumoSim[c.chave]}</div>
            ))}
          </div>
        )}

      </section>

        {/* PAINEL DA PERGUNTA ATUAL: faixa independente, de ponta a ponta; esquerda = busca + pergunta; direita = seletor (lingueta fechada ate usar) */}
        <section className="bevel-3d grid w-full gap-2 p-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]" style={{ background: "#fbfcfe" }} data-testid="faixa-painel-pergunta">
          <div className="concave-3d min-w-0 self-start p-1.5" data-testid="faixa-painel-pergunta-texto">
            {/* Andar 1: busca + olho (gemeo do andar 1 do seletor: busca + seta) */}
            <div className="mb-2 flex items-center gap-3">
              <div className="relative min-w-0 flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar código, pergunta ou saída..." className="h-8 pl-9 field-engraved" data-testid="faixa-busca" />
              </div>
              <button type="button" disabled={!perguntaAtiva} onClick={() => abrirTela("TUDO")} aria-label="Ver sinapses desta pergunta" title={perguntaAtiva ? `Ver sinapses desta pergunta ` : "Escolha uma pergunta"} className="tecla-3d flex h-8 w-8 shrink-0 items-center justify-center disabled:opacity-50" data-testid="faixa-ver-sinapses">
                <Eye className="h-4 w-4" />
              </button>
            </div>
            {perguntaAtiva ? (
              <>
                {/* Andar 2: categoria e contagens, em fichas (gemeo da linha de grupos TODAS/EXA/FOR...) */}
                <div className="mb-2 flex flex-wrap items-center gap-3" data-testid="faixa-painel-pergunta-subtitulo">
                  <span className="bevel-3d flex h-7 max-w-full items-center px-2 text-[10px] font-black uppercase tracking-wide" title={perguntaAtiva.bloco ?? "Sem bloco"}><span className="truncate">{perguntaAtiva.bloco ?? "Sem bloco"}</span></span>
                  <button type="button" onClick={() => abrirTela("ATIVAS")} title="Ver só as ligações ativas" className="tecla-3d flex h-8 min-w-[6.5rem] items-center justify-between px-3 text-[10px] font-black uppercase" style={{ color: "#166534" }} data-testid="faixa-ver-ativas">Ativas <b className="ml-2 tabular-nums">{ligacoesAtiva.length}</b></button>
                  <button type="button" onClick={() => (propostasAtiva.length > 0 ? irParaAprovacao(perguntaAtiva.perguntaId) : abrirTela("PROPOSTAS"))} title={propostasAtiva.length > 0 ? "Conferir e aprovar na sanfona, logo abaixo" : "Sem propostas nesta pergunta"} className="tecla-3d flex h-8 min-w-[6.5rem] items-center justify-between px-3 text-[10px] font-black uppercase" style={{ color: "#9b6b11" }} data-testid="faixa-ver-propostas">Propostas <b className="ml-2 tabular-nums">{propostasAtiva.length}</b></button>
                  {perguntaAtiva.eSinalAlarme && <span className="bevel-3d flex h-7 items-center px-2 text-[10px] font-black text-red-700">sinal de alarme</span>}
                </div>
                {/* Andar 3: a pergunta (gemeo da lista de saidas) */}
                <div className="flex items-start gap-2 px-1 py-1">
                  <span className="bevel-3d shrink-0 px-2 py-0.5 text-center font-mono text-[11px] font-bold text-[#0f1e36]">{perguntaAtiva.perguntaId}</span>
                  <p className="min-w-0 text-[13px] font-semibold leading-snug text-[#0f1e36]" data-testid="faixa-painel-pergunta-titulo">{perguntaAtiva.pergunta}</p>
                </div>
              </>
            ) : (
              <p className="px-1 py-1 text-[13px] text-muted-foreground" data-testid="faixa-painel-pergunta-vazio">Selecione uma pergunta</p>
            )}
          </div>
          <div className="relative flex items-start" data-seletor-sinapse>
            {!perguntaAtiva && <div className="concave-3d flex min-h-[5.5rem] w-full items-center justify-center p-3 text-[12px] text-muted-foreground" data-testid="faixa-seletor-vazio">As saídas aparecem aqui quando você escolher uma pergunta.</div>}
            {perguntaAtiva && data && (() => {
              const editar = modo === "EDICAO";
              const ocupado = criar.isPending || desativar.isPending || aprovarProposta.isPending;
              const qs = semAcento(buscaSeletor.trim());
              const ativasPorChave = new Map(ligacoesAtiva.map((x) => [chave(x.categoria, x.destinoTipo, x.destinoId), x]));
              const propostasPorChave = new Map(propostasAtiva.map((x) => [chave(x.categoria, x.destinoTipo, x.destinoId), x]));
              return (
                <div className="concave-3d w-full p-1.5" data-testid="faixa-seletor-lista" role="listbox" aria-label={`Saídas de ${perguntaAtiva.perguntaId}`}>
                  <div className="mb-2 flex items-center gap-3">
                    <Input value={buscaSeletor} onFocus={() => setSeletorAberto(true)} onClick={() => setSeletorAberto(true)} onChange={(e) => { setBuscaSeletor(e.target.value); setSeletorAberto(true); }} placeholder="Pesquisar saída..." className="h-8 flex-1 field-engraved" data-testid="faixa-seletor-busca" />
                    <button type="button" aria-expanded={seletorAberto} aria-label={seletorAberto ? "Fechar lista de saídas" : "Abrir lista de saídas"} onClick={() => setSeletorAberto((v) => !v)} className="tecla-3d flex h-8 w-8 shrink-0 items-center justify-center" data-testid="faixa-seletor-lingueta">
                      {seletorAberto ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </button>
                  </div>
                  <div className="mb-2 flex flex-wrap items-center gap-3" role="group" aria-label="Filtrar saídas por grupo" data-testid="faixa-seletor-grupos">
                    <button type="button" aria-pressed={seletorCats.length === 0} onClick={() => { setSeletorCats([]); setSeletorAberto(true); }} className="tecla-3d h-7 min-w-[3.25rem] px-2 text-[10px] font-black" data-testid="faixa-seletor-cat-TODAS">TODAS</button>
                    {CATEGORIAS.map((c) => (
                      <button key={c.chave} type="button" aria-pressed={seletorCats.includes(c.chave)} title={c.rotulo} data-testid={`faixa-seletor-cat-${c.chave}`}
                        onClick={() => { setSeletorAberto(true); setSeletorCats((v) => (v.includes(c.chave) ? v.filter((x) => x !== c.chave) : [...v, c.chave])); }}
                        className="tecla-3d h-7 min-w-[3.25rem] px-2 text-[10px] font-black" style={{ color: c.cor }}>{c.sigla}</button>
                    ))}
                  </div>
                  {seletorAberto && !editar && <p className="px-1 pb-1 text-[10px] text-muted-foreground">Entre em Edição para marcar sim ou não.</p>}
                  {seletorAberto && <div className="max-h-44 overflow-y-auto p-0.5"><CabecalhoGradeSaidas />
                    {CATEGORIAS.filter((c) => seletorCats.length === 0 || seletorCats.includes(c.chave)).map((c) => {
                      const todosDest = data.destinos[c.chave] ?? [];
                      const lista = todosDest.filter((d) => !qs || semAcento(`${d.nome} ${codigoDestino(c.chave, d.tipo, d.id)}`).includes(qs));
                      const nSim = todosDest.filter((d) => ativasPorChave.has(chave(c.chave, d.tipo, d.id))).length;
                      return (
                        <div key={c.chave} className="mb-1" data-testid={`faixa-seletor-grupo-${c.chave}`}>
                          <div className="flex items-center gap-2 px-1 py-0.5 text-[10px] font-black uppercase tracking-wider" style={{ color: c.cor }}>
                            <span>{c.sigla} · {c.rotulo}</span><span className="ml-auto text-muted-foreground">{nSim} sim</span>
                          </div>
                          {lista.slice(0, 120).map((d) => {
                            const k = chave(c.chave, d.tipo, d.id);
                            const ativaX = ativasPorChave.get(k);
                            const propX = propostasPorChave.get(k);
                            const cod = codigoDestino(c.chave, d.tipo, d.id);
                            return (
                              <LinhaGradeSaidas key={k} codigo={cod} corCodigo={c.cor} nome={d.rotulo ?? d.nome} tipo={d.tipo} destinoId={d.id} estado={ativaX ? "ATIVA" : propX ? "PROPOSTA" : "NAO"} ligada={!!ativaX} desabilitada={!editar || ocupado}
                                rotuloAcessivel={`${cod} ${d.nome}`} dica={editar ? "Ligar ou desligar (desativa, não apaga)" : "Entre em Edição para ligar ou desligar"} testid={`faixa-seletor-${cod}`}
                                onAlternar={() => {
                                  if (ativaX) { setDesligadasMenu((m) => ({ ...m, [perguntaAtiva.perguntaId]: [...(m[perguntaAtiva.perguntaId] ?? []), { categoria: c.chave, destinoTipo: d.tipo, destinoId: d.id }] })); desativar.mutate(ativaX.id); }
                                  else if (propX) aprovarProposta.mutate({ id: propX.id });
                                  else criar.mutate({ perguntaId: perguntaAtiva.perguntaId, categoria: c.chave, destinoTipo: d.tipo, destinoId: d.id });
                                }} />
                            );
                          })}
                          {lista.length > 120 && <p className="px-1 text-[10px] text-muted-foreground">Mostrando 120 de {lista.length}. Use a pesquisa para afinar.</p>}
                          {lista.length === 0 && <p className="px-1 text-[10px] text-muted-foreground">Nenhuma saída encontrada.</p>}
                        </div>
                      );
                    })}
                  </div>}
                </div>
              );
            })()}
          </div>
        </section>

      {isLoading ? (
        <Skeleton className="h-96 w-full" />
      ) : isError || !data ? (
        <div className="panel-3d-sub p-6 text-sm text-red-600" data-testid="faixa-erro">
          Não foi possível carregar as sinapses. Isto não significa que não existam ligações.{" "}
          <button type="button" className="underline" onClick={() => refetch()}>Tentar de novo</button>
        </div>
      ) : (
        <>
          <Faixa testid="faixa-grafo" titulo="Faixa da sinapse" fichas={[{ rotulo: "Perguntas", valor: esquerda.length }, { rotulo: "Saídas", valor: direita.length }]} aberta={faixaAberta} onToggle={() => setFaixaAberta((v) => !v)} ampliada={ampliada} direita={<>{controlesFaixa}<button type="button" onClick={() => setAmpliada((v) => !v)} aria-pressed={ampliada} className="tecla-3d flex h-8 items-center gap-2 px-3 text-[10px] font-black uppercase" data-testid="faixa-ampliar" title={ampliada ? "Voltar ao tamanho normal (Esc)" : "Ampliar a faixa para a tela inteira"}>{ampliada ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}{ampliada ? "Reduzir" : "Ampliar"}</button></>}>
            <div className="mb-1.5 grid items-center gap-x-1" style={{ gridTemplateColumns: `minmax(0,1.2fr) minmax(${ampliada ? 420 : 240}px,1.2fr) minmax(0,1.2fr)` }} data-testid="faixa-cabecalho-colunas">
              <div className="flex flex-wrap items-center gap-1">
                <span className="text-[10px] font-black uppercase tracking-wider text-primary/80">Perguntas</span>
                <button type="button" className="tecla-3d h-7 px-2 text-[10px] font-bold" onClick={() => setFechadosE(new Set())} title="Abrir todos os blocos de perguntas">Abrir blocos +</button>
                <button type="button" className="tecla-3d h-7 px-2 text-[10px] font-bold" onClick={() => setFechadosE(new Set(linhasE.filter((l) => l.tipo === "grupo").map((l) => l.k)))} title="Recolher todos os blocos de perguntas">Recolher −</button>
                {modo !== "EDICAO" && <button type="button" aria-pressed={todos} onClick={() => setTodos((v) => !v)} className="tecla-3d h-7 px-2 text-[10px] font-bold" data-testid="faixa-todos">{todos ? "Só os ligados" : "Mostrar todos"}</button>}
              </div>
              <div className="concave-3d flex items-stretch gap-1 p-1" role="group" aria-label="Quais sinapses mostrar" title="Ligue ou desligue cada tipo de fio" data-testid="faixa-mostrar-fios">
                {([["ATIVA", "Ativas", "#1e3a8a"], ["PROPOSTA", "Propostas", "#b8892b"], ["SEM_SAIDA", "Sem saída", "#dc2626"]] as const).map(([k, r, cor]) => (
                  <button key={k} type="button" aria-pressed={mostrar[k]} onClick={() => setMostrar((m) => ({ ...m, [k]: !m[k] }))} title={`${mostrar[k] ? "Esconder" : "Mostrar"} sinapses: ${r}`} data-testid={`faixa-mostrar-${k}`}
                    className={`${mostrar[k] ? "tecla-3d" : "concave-3d"} flex min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1 py-1 text-[9px] font-black uppercase leading-none`} style={{ opacity: mostrar[k] ? 1 : 0.55 }}>
                    <svg width="100%" height="6" aria-hidden="true"><line x1="3" y1="3" x2="97%" y2="3" stroke={cor} strokeWidth="2.5" strokeLinecap="round" strokeDasharray={k === "ATIVA" ? undefined : k === "PROPOSTA" ? "0.1 5" : "5 4"} /></svg>
                    <span className="truncate">{r}</span>
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center justify-end gap-1" role="group" aria-label="Filtrar saídas por tipo">
                <button type="button" aria-pressed={cats.length === 0} onClick={() => setCats([])} className="tecla-3d h-7 px-2 text-[10px] font-black" data-testid="faixa-cat-TODAS" title="Todas as saídas, em blocos separados por tipo">TODAS</button>
                {CATEGORIAS.map((c) => {
                  const ativo = cats.includes(c.chave);
                  return (
                    <button key={c.chave} type="button" aria-pressed={ativo} title={c.rotulo} data-testid={`faixa-cat-${c.chave}`}
                      onClick={() => setCats((v) => (ativo ? v.filter((x) => x !== c.chave) : [...v, c.chave]))}
                      className="tecla-3d h-7 px-2 text-[10px] font-black" style={{ color: c.cor }}>{c.sigla}</button>
                  );
                })}
                <button type="button" className="tecla-3d h-7 w-7 text-[12px] font-bold" onClick={() => setFechadosD(new Set())} title="Abrir todos os blocos de saídas" aria-label="Abrir todos os blocos de saídas">+</button>
                <button type="button" className="tecla-3d h-7 w-7 text-[12px] font-bold" onClick={() => setFechadosD(new Set(linhasD.filter((l) => l.tipo === "grupo").map((l) => l.k)))} title="Recolher todos os blocos de saídas" aria-label="Recolher todos os blocos de saídas">−</button>
              </div>
            </div>
            {esquerda.length === 0 && direita.length === 0 ? (
              <div className="concave-3d p-6 text-center text-sm text-muted-foreground" data-testid="faixa-vazio">
                {total === 0 ? "Ainda não há ligações ativas. Entre em Edição (E), escolha uma saída e puxe o fio da pergunta." : "Nada corresponde à busca ou aos filtros."}
              </div>
            ) : (
              <div ref={graficoRef} className="concave-3d" style={{ height: ampliada ? "calc(100vh - 15rem)" : "max(20rem, calc(100vh - 25rem))" }} data-testid="faixa-grafo-rolagem">
                <div className="relative grid h-full" style={{ gridTemplateColumns: `minmax(0,1.2fr) minmax(${ampliada ? 420 : 240}px,1.2fr) minmax(0,1.2fr)` }}>
                  <div className="absolute bottom-0 left-1.5 top-0 z-20"><Termostato alvo={colEsqRef} rotulo="Rolar perguntas" testid="faixa-termostato-perguntas" /></div>
                  <div className="absolute bottom-0 right-1.5 top-0 z-20"><Termostato alvo={colDirRef} rotulo="Rolar saídas" testid="faixa-termostato-saidas" /></div>
                  {/* DENDRITOS ESQUERDA: rolagem propria */}
                  <div ref={colEsqRef} onScroll={(e) => setRolE(e.currentTarget.scrollTop)} className="sinapse-sem-trilho h-full overflow-y-auto border-r border-black/10 pl-7" data-testid="faixa-coluna-perguntas">
                  <div className="relative" style={{ height: altura }}>
                    {linhasE.map((linha, idx) => {
                      const topo = idx * alturaLinha + 1.5;
                      if (linha.tipo === "grupo") {
                        return (
                          <div key={`g-${linha.k}`} className="absolute flex w-full items-center gap-1 px-1" style={{ top: topo, height: alturaLinha - 3 }}>
                            <label className="bevel-3d relative block h-full w-5 shrink-0 cursor-pointer overflow-hidden !rounded-[3px] !p-0" style={{ background: `linear-gradient(180deg, rgba(255,255,255,0.35), rgba(0,0,0,0.18)), ${corDoBloco(linha.k)}` }} title="Cor desta categoria de perguntas (clique para trocar)" data-testid={`faixa-cor-${linha.k}`}>
                              <input type="color" aria-label={`Cor da categoria ${linha.k}`} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" value={corDoBloco(linha.k)} onChange={(e) => salvarCorBloco.mutate({ bloco: linha.k, cor: e.target.value })} />
                            </label>
                            {barraGrupo({ titulo: linha.k, n: linha.n, nLig: linha.nLig, fechado: fechadosE.has(linha.k), onClick: () => alternarGrupo(fechadosE, setFechadosE, linha.k), testid: `faixa-grupo-e-${linha.k}` })}
                            <span className="sinapse-pino-area" aria-hidden="true" />
                          </div>
                        );
                      }
                      const p = linha.p;
                      const ligacoesDaPergunta = porPergunta.get(p.perguntaId) ?? [];
                      const nSemSaida = ligacoesDaPergunta.filter((ligacao) => {
                        const destino = nomeDe.get(chave(ligacao.categoria, ligacao.destinoTipo, ligacao.destinoId));
                        return !destino || destino.incompleto;
                      }).length;
                      const nAtivas = ligacoesDaPergunta.length;
                      const nPendentes = propostasPorPergunta.get(p.perguntaId)?.length ?? 0;
                      const n = nAtivas + nPendentes;
                      const marcada = sel.includes(p.perguntaId) || travada === p.perguntaId;
                      return (
                        <div key={p.perguntaId} data-pergunta={p.perguntaId} className="absolute flex w-full items-center gap-1 px-1" style={{ top: topo, height: alturaLinha - 3 }}
                          onMouseEnter={() => setHover(p.perguntaId)} onMouseLeave={() => setHover(null)} title={`${p.perguntaId} · ${p.pergunta}`} aria-label={`${p.perguntaId}: ${p.pergunta}. ${nAtivas} ligações registradas, ${nSemSaida} sem saída e ${nPendentes} propostas pendentes.`}>
                          <span className="block h-full w-5 shrink-0 rounded-[3px]" style={marcada ? { background: `linear-gradient(180deg, rgba(255,255,255,0.35), rgba(0,0,0,0.18)), ${corDaPergunta.get(p.perguntaId) ?? "transparent"}` } : undefined} data-testid={`faixa-espinha-${p.perguntaId}`} aria-hidden="true" />
                          <button type="button" aria-pressed={marcada} onClick={(e) => clicar(e, p.perguntaId)} data-testid={`faixa-dendrito-${p.perguntaId}`}
                            className="tecla-3d flex h-full min-w-0 flex-1 items-center gap-1 px-1.5 text-left select-none" style={marcada ? { background: `linear-gradient(90deg, ${corDaPergunta.get(p.perguntaId) ?? "#999"}33, transparent 70%)` } : undefined}>
                            <span className="flex w-4 shrink-0 items-center justify-center">
                              {travada === p.perguntaId
                                ? <Lock className="h-3 w-3 text-[#9b6b11]" aria-label="Pergunta travada" role="img" />
                                : nSemSaida > 0
                                  ? <AlertTriangle className="h-3 w-3 text-red-600" aria-label={`${nSemSaida} ligação(ões) ativa(s) sem saída real`} role="img" />
                                  : p.eSinalAlarme ? <AlertTriangle className="h-3 w-3 text-red-600" aria-label="Sinal de alarme" role="img" /> : null}
                            </span>
                            <span className="concave-3d sinapse-janela-codigo font-mono text-[10px] font-bold text-[#0f1e36]">{p.perguntaId}</span>
                            <span className="min-w-0 flex-1 truncate text-[10px] opacity-90">{p.pergunta}</span>
                            <span className="ml-auto min-w-[2.25rem] rounded-[6px] bg-black/5 px-2 py-0.5 text-center text-[10px] font-bold tabular-nums">{n || ""}</span>
                          </button>
                          <button type="button" className="tecla-3d flex h-full w-6 shrink-0 items-center justify-center" data-menu-sinapse aria-haspopup="menu" aria-expanded={menu?.perguntaId === p.perguntaId}
                            data-testid={`faixa-menu-${p.perguntaId}`} aria-label={`Ligações da pergunta ${p.perguntaId}`} title="Ver e ligar ou desligar as ligações desta pergunta"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (menu?.perguntaId === p.perguntaId) { setMenu(null); return; }
                              const r = e.currentTarget.getBoundingClientRect();
                              const acima = r.bottom + 300 > window.innerHeight && r.top > 300;
                              setMenu({ perguntaId: p.perguntaId, x: Math.max(8, Math.min(r.right - 340, window.innerWidth - 348)), y: acima ? r.top - 4 : r.bottom + 4, acima });
                            }}>
                            <ChevronDown className="h-3 w-3" />
                          </button>
                          {modo === "EDICAO" && (
                            <button type="button" onPointerDown={(e) => iniciar(e, p.perguntaId)} onClick={(e) => {
                              e.stopPropagation();
                              // Dois cliques rápidos num pino em repouso ARMAM (o 2º clique do mesmo gesto é ignorado); dois cliques rápidos num pino já armado DESARMAM.
                              if (e.detail >= 2 && arrasteRef.current?.de === p.perguntaId) { if (Date.now() - armadoEm.current > 700) cancelarArraste(); return; }
                              if (e.detail === 1 && arrasteRef.current?.de === p.perguntaId && !arrasteRef.current.fixo) { const f = { ...arrasteRef.current, fixo: true }; arrasteRef.current = f; setArraste(f); return; }
                              if (e.detail === 0 && !arrasteRef.current) {
                                const r = e.currentTarget.getBoundingClientRect();
                                iniciarNoPonto(p.perguntaId, r.left + r.width / 2, r.top + r.height / 2);
                              }
                            }} data-testid={`faixa-porta-${p.perguntaId}`}
                              className={`sinapse-pino-area cursor-crosshair touch-none ${arraste?.de === p.perguntaId ? "sinapse-porta-origem-ativa" : ""}`}
                              aria-label={`Iniciar ligação a partir da pergunta ${p.perguntaId}`} aria-pressed={arraste?.de === p.perguntaId}
                              title="Clique aqui e depois no ponto de uma saída. Escape cancela.">
                              <span className="sinapse-pino" style={{ "--cor-pino": corDaPergunta.get(p.perguntaId) ?? "#64748b" } as React.CSSProperties} data-foco={marcada ? "1" : undefined} data-estado={arraste?.de === p.perguntaId ? "armado" : nAtivas ? "ativo" : nPendentes ? "proposta" : "livre"} aria-hidden="true" />
                            </button>
                          )}
                          {modo !== "EDICAO" && <span className="sinapse-pino-area" aria-hidden="true"><span className="sinapse-pino" style={{ "--cor-pino": corDaPergunta.get(p.perguntaId) ?? "#64748b" } as React.CSSProperties} data-foco={marcada ? "1" : undefined} data-estado={nAtivas ? "ativo" : nPendentes ? "proposta" : "livre"} /></span>}
                        </div>
                      );
                    })}
                  </div>
                  </div>
                  {/* FIOS */}
                  <div ref={centroRef} className="sinapse-escafandro h-full w-full"><div className="sinapse-vidro" onClick={() => setFioAberto(null)}>
                  <svg className="block" width="100%" height={alturaVisivel} viewBox={`0 0 100 ${alturaVisivel}`} preserveAspectRatio="none" aria-hidden>
                    <defs>
                      <linearGradient id="sinapse-gradiente-fibra" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="100" y2="0">
                        <stop offset="0%" stopColor="#1D4ED8" />
                        <stop offset="100%" stopColor="#D97706" />
                      </linearGradient>
                    </defs>
                    {fios.map(({ s, y1: y1Abs, y2: y2Abs }) => {
                      const y1 = y1Abs - rolE;
                      const y2 = (y2Abs as number) - rolD;
                      if ((y1 < -20 && y2 < -20) || (y1 > alturaVisivel + 20 && y2 > alturaVisivel + 20)) return null;
                      const emPerg = foco === s.perguntaId || (modo === "SIMULACAO" && sel.includes(s.perguntaId));
                      const em = emPerg || fioAberto === s.id;
                      const apagado = modo === "SIMULACAO" && sel.length > 0 && !em;
                      const semSaida = s.estado === "SEM_SAIDA";
                      const d = `M 0 ${y1} C 50 ${y1}, 50 ${y2}, 100 ${y2}`;
                      const corBloco = corDaPergunta.get(s.perguntaId) ?? "#1e3a8a";
                      const corFio = semSaida ? "#dc2626" : corBloco;
                      if (!mostrar[semSaida ? "SEM_SAIDA" : s.estado === "ATIVA" ? "ATIVA" : "PROPOSTA"] && !em) return null;
                      return (
                        <g key={s.id}>
                          <path d={d} fill="none" stroke={corFio} strokeWidth={em ? 2.4 : s.estado === "ATIVA" ? 1.1 : 2} strokeLinecap="round" strokeDasharray={s.estado === "ATIVA" ? undefined : semSaida ? "5 4" : "0.1 6"} vectorEffect="non-scaling-stroke"
                            style={{ opacity: apagado ? 0.06 : em ? 1 : s.estado === "ATIVA" ? 0.7 : 0.7, filter: em ? "drop-shadow(0 0 2px rgba(217,119,6,0.55))" : undefined }} data-testid={`faixa-fio-${s.id}`} />
                          {emPerg && s.estado === "ATIVA" && (
                            <path d={d} fill="none" stroke="#FDE68A" strokeWidth={3.5} strokeLinecap="round" strokeDasharray="1 24" vectorEffect="non-scaling-stroke" className="sinapse-impulso" style={{ pointerEvents: "none", filter: "drop-shadow(0 0 4px #F59E0B)" }} />
                          )}
                          <path d={d} fill="none" stroke="transparent" strokeWidth={14} vectorEffect="non-scaling-stroke" style={{ pointerEvents: "stroke", cursor: "pointer" }}
                            onClick={(e) => { e.stopPropagation(); setFioAberto((v) => (v === s.id ? null : s.id)); }} data-testid={`faixa-fio-clique-${s.id}`} />
                        </g>
                      );
                    })}
                  </svg>
                  </div></div>
                  {(() => {
                    const f = fios.find((x) => x.s.id === fioAberto);
                    if (!f || !centroRef.current) return null;
                    const dst = nomeDe.get(chave(f.s.categoria, f.s.destinoTipo, f.s.destinoId));
                    const proposta = f.s.id.startsWith("proposta-");
                    const idReal = Number(f.s.id.split("-")[1]);
                    const armada = proposta ? aprovarArmado === idReal : armadas.has(idReal);
                    const dadosProposta = proposta ? data?.propostas.find((x) => x.id === idReal) : undefined;
                    const semSaida = f.s.estado === "SEM_SAIDA";
                    const estadoTxt = proposta ? "Proposta a conferir" : semSaida ? "Ativa, sem saída real" : "Ligação ativa";
                    const corEstado = proposta ? "#9b6b11" : semSaida ? "#b91c1c" : "#166534";
                    const meio = (f.y1 - rolE + ((f.y2 as number) - rolD)) / 2;
                    return (
                      <div className="sinapse-balao" style={{ left: centroRef.current.offsetLeft + centroRef.current.offsetWidth + 10, top: Math.min(Math.max(meio, 150), alturaVisivel - 150), transform: "translateY(-50%)" }} onClick={(e) => e.stopPropagation()} data-testid="faixa-pilula-fio">
                        <div className="mb-2 text-[10px] font-black uppercase tracking-wider" style={{ color: corEstado }}>{estadoTxt}</div>
                        <div className="concave-3d mb-2 space-y-2 px-2 py-2 text-[11px]">
                          <div className="flex items-start gap-2"><span className="bevel-3d shrink-0 px-1.5 py-0.5 font-mono text-[10px] font-bold" style={{ color: corDaPergunta.get(f.s.perguntaId) }}>{f.s.perguntaId}</span><span className="min-w-0 font-semibold leading-snug">{data?.perguntas.find((x) => x.perguntaId === f.s.perguntaId)?.pergunta}</span></div>
                          <div className="flex items-start gap-2"><span className="bevel-3d shrink-0 px-1.5 py-0.5 font-mono text-[10px] font-bold" style={{ color: COR[f.s.categoria] }}>{codigoDestino(f.s.categoria, f.s.destinoTipo, f.s.destinoId)}</span><span className="min-w-0 font-semibold leading-snug">{dst?.nome ?? ""}</span></div>
                          {dadosProposta?.justificativa && <p className="text-[10px] leading-snug text-muted-foreground">{dadosProposta.eixo} · {dadosProposta.justificativa}</p>}
                        </div>
                        <div className="max-h-44 overflow-y-auto"><ResumoDestino tipo={f.s.destinoTipo} destinoId={f.s.destinoId} /></div>
                        <div className="flex items-center justify-end gap-3">
                          <button type="button" onClick={() => setFioAberto(null)} className="tecla-3d h-8 px-3 text-[10px] font-bold uppercase" data-testid="faixa-pilula-fechar">Fechar</button>
                          {modo === "EDICAO" && proposta && (
                            <>
                              <button type="button" onClick={() => recusarProposta.mutate({ id: idReal })} disabled={recusarProposta.isPending} className="tecla-3d h-8 px-3 text-[10px] font-bold uppercase text-red-700" data-testid="faixa-pilula-recusar">Recusar</button>
                              <button type="button" onClick={() => { if (armada) aprovarProposta.mutate({ id: idReal }); else setAprovarArmado(idReal); }} disabled={aprovarProposta.isPending} className="tecla-3d h-8 px-3 text-[10px] font-bold uppercase text-emerald-700" data-testid="faixa-pilula-aprovar" title={armada ? "Clique de novo para aprovar" : "Aprovar esta proposta"}>{armada ? "Confirmar" : "Aprovar"}</button>
                            </>
                          )}
                          {modo === "EDICAO" && !proposta && (
                            <button type="button" onClick={() => cliqueExcluir(idReal)} className="tecla-3d h-8 px-3 text-[10px] font-bold uppercase text-red-700" data-testid="faixa-pilula-desvincular" title={armada ? "Clique de novo para confirmar" : "Desvincular (desativa, não apaga)"}>{armada ? "Confirmar" : "Desvincular"}</button>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                  {/* DENDRITOS DIREITA: rolagem propria */}
                  <div ref={colDirRef} onScroll={(e) => setRolD(e.currentTarget.scrollTop)} className="sinapse-sem-trilho h-full overflow-y-auto border-l border-black/10 pr-7" data-testid="faixa-coluna-saidas">
                  <div className="relative" style={{ height: altura }}>
                    {linhasD.map((linha, idx) => {
                      const topo = idx * alturaLinha + 1.5;
                      if (linha.tipo === "grupo") {
                        const cor = COR[linha.k];
                        return (
                          <div key={`g-${linha.k}`} className="absolute flex w-full items-center gap-1 px-1" style={{ top: topo, height: alturaLinha - 3 }}>
                            <span className="sinapse-pino-area" aria-hidden="true" />
                            {barraGrupo({ titulo: ROTULO[linha.k], cor, n: linha.n, nLig: linha.nLig, fechado: fechadosD.has(linha.k), onClick: () => alternarGrupo(fechadosD, setFechadosD, linha.k), testid: `faixa-grupo-d-${linha.k}` })}
                          </div>
                        );
                      }
                      const d = linha.d;
                      const aceso = simAcesos.has(d.k) || (foco !== null && (conexoesPorPergunta.get(foco) ?? []).some((s) => chave(s.categoria, s.destinoTipo, s.destinoId) === d.k));
                      const apagado = modo === "SIMULACAO" && sel.length > 0 && !aceso;
                      const totalConexoes = d.nAtivas + d.nPropostas + d.nSemSaida;
                      const podeLigar = modo === "EDICAO" && !!travada;
                      const Corpo = (podeLigar ? "button" : "div") as "button";
                      return (
                        <div key={d.k} data-dest={d.incompleto ? undefined : d.k} className={`absolute flex w-full items-center gap-1 px-1 ${apagado ? "opacity-35" : !totalConexoes && modo !== "EDICAO" ? "opacity-60" : ""}`} style={{ top: topo, height: alturaLinha - 3 }}
                          title={`${codigoDestino(d.cat, d.tipo, d.id)} · ${ROTULO[d.cat]} · ${d.nome}${nomeDe.get(d.k)?.detalhe ? ` · ${nomeDe.get(d.k)?.detalhe}` : ""}${d.incompleto ? " · SEM SAÍDA: bloco sem exames cadastrados" : ""}`} aria-label={`${codigoDestino(d.cat, d.tipo, d.id)}: ${d.nome}. ${d.nAtivas} saídas conectadas, ${d.nSemSaida} ligações sem saída e ${d.nPropostas} propostas pendentes.`} data-testid={`faixa-saida-${d.k}`}>
                          {modo === "EDICAO" ? (
                            <button type="button" disabled={!!d.incompleto} onClick={(e) => { e.stopPropagation(); cliqueNaSaida(d.k, e.detail); }}
                              className="sinapse-pino-area disabled:cursor-not-allowed disabled:opacity-40"
                              data-pino-destino={d.incompleto ? undefined : d.k}
                              data-testid={`faixa-porta-destino-${d.k}`}
                              aria-label={d.incompleto ? `Destino ${codigoDestino(d.cat, d.tipo, d.id)} sem conteúdo; indisponível` : `Concluir ligação na saída ${codigoDestino(d.cat, d.tipo, d.id)}`}
                              title={d.incompleto ? "Bloco vazio: não pode receber ligação." : "Clique para concluir o fio iniciado numa pergunta."}>
                              <span style={{ "--cor-pino": COR[d.cat] } as React.CSSProperties} className={`sinapse-pino ${fioRecemSalvo?.endsWith(`|${d.k}`) ? "sinapse-pino-onda" : ""}`} data-estado={d.nAtivas ? "ativo" : d.nPropostas ? "proposta" : "livre"} aria-hidden="true" />
                            </button>
                          ) : (
                            <span className="sinapse-pino-area" aria-hidden="true"><span className="sinapse-pino" style={{ "--cor-pino": COR[d.cat] } as React.CSSProperties} data-estado={d.nAtivas ? "ativo" : d.nPropostas ? "proposta" : "livre"} /></span>
                          )}
                          <Corpo {...(podeLigar ? { type: "button" as const, onClick: () => ligarRapido(d), "data-testid": `faixa-ligar-${d.k}` } : {})} aria-pressed={aceso} className={`tecla-3d flex h-full min-w-0 flex-1 items-center gap-1.5 px-1.5 text-left ${podeLigar ? "cursor-pointer" : ""}`}>
                            <span className="concave-3d sinapse-janela-codigo font-mono text-[10px] font-bold" style={{ color: COR[d.cat] }}>{codigoDestino(d.cat, d.tipo, d.id)}</span>
                            <span className="min-w-0 flex-1 truncate text-[10px] opacity-90">{d.nome}</span>
                            {d.incompleto && <span className="shrink-0 text-[10px] font-bold text-red-700">SEM EXAMES</span>}
                            <span className="ml-auto min-w-[2.25rem] rounded-[6px] bg-black/5 px-2 py-0.5 text-center text-[10px] font-bold tabular-nums">{totalConexoes || ""}</span>
                          </Corpo>
                        </div>
                      );
                    })}
                  </div>
                  </div>
                </div>
              </div>
            )}
          </Faixa>

          <Faixa testid="faixa-sanfona" titulo="Sanfona das correspondências" fichas={[{ rotulo: "Perguntas", valor: esquerda.length }, { rotulo: "Propostas pendentes", valor: totalPropostasPendentes, cor: "#9b6b11" }]} aberta={sanfonaAberta} onToggle={() => setSanfonaAberta((v) => !v)}
            direita={sanfonaAberta ? (
              <div className="flex gap-1">
                <button type="button" className="tecla-3d px-2 py-1 text-[10px] font-bold" onClick={() => setAbertos(new Set(esquerda.map((p) => p.perguntaId)))}>Abrir todas</button>
                <button type="button" className="tecla-3d px-2 py-1 text-[10px] font-bold" onClick={() => setAbertos(new Set())}>Recolher todas</button>
              </div>
            ) : null}>
            <div className="concave-3d max-h-[28rem] overflow-y-auto">
              {esquerda.length === 0 && <div className="p-6 text-center text-sm text-muted-foreground">Nenhuma pergunta para mostrar.</div>}
              {esquerda.map((p, i) => {
                const lig = porPergunta.get(p.perguntaId) ?? [];
                  const pendentes = propostasPorPergunta.get(p.perguntaId) ?? [];
                const aberto = abertos.has(p.perguntaId);
                const marcada = sel.includes(p.perguntaId);
                return (
                  <div key={p.perguntaId} data-testid={`faixa-item-${p.perguntaId}`}
                    className={destaqueAprov === p.perguntaId ? "ring-2 ring-[#b8892b] ring-inset transition-shadow" : ""}
                    style={{ background: marcada ? "rgba(217,119,6,0.16)" : i % 2 === 0 ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.18)" }}
                    onMouseEnter={() => setHover(p.perguntaId)} onMouseLeave={() => setHover(null)}>
                    <button type="button" aria-expanded={aberto} onClick={(e) => { clicar(e, p.perguntaId); alternarAberto(p.perguntaId); centralizar(p.perguntaId); }} className="flex w-full items-center gap-3 px-3 py-1.5 text-left">
                      {aberto ? <ChevronDown className="h-4 w-4 shrink-0 opacity-60" /> : <ChevronRight className="h-4 w-4 shrink-0 opacity-60" />}
                      <span className="w-24 shrink-0 font-mono text-[11px] font-bold text-[#5b6578]">{p.perguntaId}</span>
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-[#1b2433]">{p.pergunta}</span>
                      {p.bloco && <span className="hidden shrink-0 text-[10px] uppercase tracking-wider text-muted-foreground md:inline">{p.bloco}</span>}
                      <span className="concave-3d flex h-7 min-w-[4.5rem] shrink-0 items-center justify-center gap-1 px-3 text-[11px] font-bold tabular-nums" title={`${lig.length} ativas; ${pendentes.length} propostas`}>
                        <span className="text-[#166534]">{lig.length}</span><span className="text-[#9b6b11]">/{pendentes.length}</span>
                      </span>
                    </button>
                    {aberto && (
                      <div className="space-y-1.5 px-10 pb-2.5">
                        {lig.length === 0 && pendentes.length === 0 && <div className="text-xs text-muted-foreground">Nenhuma correspondência ativa ou proposta para esta pergunta.</div>}
                        {modo === "EDICAO" && propostasFiltradas(p.perguntaId).length > 0 && (
                          <button type="button" disabled={loteEmCurso} onClick={() => aprovarLote(p.perguntaId, p.perguntaId)} className="tecla-3d px-2 py-1 text-[10px] font-bold" data-testid={`button-aprovar-lote-${p.perguntaId}`}>
                            {loteEmCurso ? "Aprovando..." : loteArmado === p.perguntaId ? `Confirmar ${propostasFiltradas(p.perguntaId).length}` : "Aprovar propostas filtradas"}
                          </button>
                        )}
                        {CATEGORIAS.map((c) => {
                          const itens = lig.filter((s) => s.categoria === c.chave);
                          const itensPendentes = pendentes.filter((s) => s.categoria === c.chave);
                          if (!itens.length && !itensPendentes.length) return null;
                          return (
                            <div key={c.chave} className="space-y-1.5">
                              <div className="flex flex-wrap items-center gap-1.5">
                              <span className="w-24 shrink-0 text-[10px] font-bold uppercase tracking-wider" style={{ color: c.cor }}>{c.rotulo}</span>
                              {itens.map((s) => {
                                const d = nomeDe.get(chave(s.categoria, s.destinoTipo, s.destinoId));
                                const semSaida = !d || d.incompleto;
                                const armada = armadas.has(s.id);
                                return (
                                    <span key={s.id} title={`${codigoDestino(s.categoria, s.destinoTipo, s.destinoId)} · ${d?.nome ?? `#${s.destinoId}`}${d?.detalhe ? ` · ${d.detalhe}` : ""}${semSaida ? " · sem saída real: destino ausente, inativo ou bloco vazio" : ""}`} className="inline-flex max-w-full items-center gap-1 rounded-[6px] border px-1.5 py-0.5 text-[11px] font-semibold"
                                    style={semSaida
                                      ? { color: "#b91c1c", borderColor: "#fecaca", background: "#fef2f2" }
                                      : { color: c.cor, borderColor: `color-mix(in srgb, ${c.cor} 45%, transparent)`, background: `color-mix(in srgb, ${c.cor} 10%, white)` }}>
                                    <span className="font-mono text-[10px] opacity-70">{codigoDestino(s.categoria, s.destinoTipo, s.destinoId)}</span>
                                    <span className="truncate">{d?.nome ?? `#${s.destinoId}`}</span>
                                    {semSaida && <span className="shrink-0 text-[10px] font-bold text-red-700">SEM SAÍDA</span>}
                                    {s.cloneDe && <span className="text-[10px] opacity-60">cópia</span>}
                                    {modo === "EDICAO" && (
                                      <button type="button" onClick={() => cliqueExcluir(s.id)} data-testid={`faixa-excluir-${s.id}`}
                                        className="inline-flex shrink-0 items-center gap-0.5 rounded-[6px] border border-current px-1 text-[10px] uppercase"
                                        title={armada ? "Clique de novo para confirmar" : "Excluir esta ligação (desativa, não apaga)"}>
                                        {armada ? <><Unlock className="h-3 w-3" />Confirmar</> : <><Lock className="h-3 w-3" />Excluir</>}
                                      </button>
                                    )}
                                  </span>
                                );
                              })}
                              </div>
                              {itensPendentes.map((proposta) => {
                                const d = nomeDe.get(chave(proposta.categoria, proposta.destinoTipo, proposta.destinoId));
                                const destinosFiltrados = (data.destinos[categoriaEdicao] ?? [])
                                  .filter((item) => !item.incompleto && semAcento(`${codigoDestino(categoriaEdicao, item.tipo, item.id)} ${item.nome}`).includes(semAcento(buscaDestinoEdicao.trim())))
                                  .slice(0, 8);
                                const editando = propostaEditando === proposta.id;
                                const armada = aprovarArmado === proposta.id;
                                return (
                                  <div key={proposta.id} className="rounded-[6px] concave-3d p-2" data-testid={`proposta-pendente-${proposta.id}`}>
                                    <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                                      <span className="w-24 shrink-0 text-[10px] font-bold uppercase tracking-wider text-[#8b681f]">Proposta</span>
                                      <span className="font-mono text-[10px] font-bold text-[#8b681f]" title={`${proposta.eixo} · ${d?.detalhe ?? ""}`}>{codigoDestino(proposta.categoria, proposta.destinoTipo, proposta.destinoId)}</span>
                                      <span className="min-w-0 flex-1 truncate text-[#30384a]" title={`${d?.nome ?? `#${proposta.destinoId}`} · ${proposta.eixo} · ${proposta.justificativa}`}>
                                        {d?.nome ?? `#${proposta.destinoId}`} · {proposta.eixo}
                                      </span>
                                      <button type="button" className="tecla-3d h-9 min-w-[5.5rem] px-3 text-[10px] font-bold uppercase" onClick={() => { setPropostaEditando(editando ? null : proposta.id); setCategoriaEdicao(proposta.categoria); setBuscaDestinoEdicao(""); }} data-testid={`button-editar-proposta-${proposta.id}`}>Editar</button>
                                      <button type="button" className="tecla-3d h-9 min-w-[5.5rem] px-3 text-[10px] font-bold uppercase" onClick={() => { if (armada) aprovarProposta.mutate({ id: proposta.id }); else setAprovarArmado(proposta.id); }} disabled={aprovarProposta.isPending} data-testid={`button-aprovar-proposta-${proposta.id}`}>
                                        {armada ? "Confirmar aprovação" : "Aprovar"}
                                      </button>
                                      <button type="button" className="tecla-3d h-9 min-w-[5.5rem] px-3 text-[10px] font-bold uppercase text-red-700" onClick={() => recusarProposta.mutate({ id: proposta.id })} disabled={recusarProposta.isPending} data-testid={`button-recusar-proposta-${proposta.id}`}>Recusar</button>
                                    </div>
                                    <p className="mt-1 pl-28 text-[10px] text-[#6b5b38]">{proposta.justificativa}</p>
                                    {armada && <p className="mt-1 pl-28 text-[10px] font-semibold text-[#6b5b38]">Confirme para mover esta linha para as ligações ativas desta tela. Isso não conecta o motor clínico.</p>}
                                    {editando && (
                                      <div className="mt-2 space-y-2 pl-28" data-testid={`editor-proposta-${proposta.id}`}>
                                        <div className="flex flex-wrap gap-1">
                                          {CATEGORIAS.map((categoria) => (
                                            <button key={categoria.chave} type="button" aria-pressed={categoriaEdicao === categoria.chave}
                                              className={`bevel-3d min-h-9 px-2 text-[10px] font-bold ${categoriaEdicao === categoria.chave ? "evo-bevel-ativo" : ""}`}
                                              onClick={() => setCategoriaEdicao(categoria.chave)} data-testid={`button-categoria-edicao-${proposta.id}-${categoria.chave}`}>
                                              {categoria.sigla}
                                            </button>
                                          ))}
                                        </div>
                                        <Input value={buscaDestinoEdicao} onChange={(e) => setBuscaDestinoEdicao(e.target.value)} placeholder="Buscar código ou nome do destino..." className="h-9 field-engraved text-xs" data-testid={`input-destino-proposta-${proposta.id}`} />
                                        <div className="grid gap-1 sm:grid-cols-2">
                                          {destinosFiltrados.map((item) => (
                                              <button key={`${item.tipo}-${item.id}`} type="button"
                                               className="concave-3d min-h-10 px-2 text-left text-[10px] hover:ring-1 hover:ring-[#b8892b]"
                                              onClick={() => editarProposta.mutate({ id: proposta.id, data: { categoria: categoriaEdicao, destinoTipo: item.tipo, destinoId: item.id } })}
                                              data-testid={`button-destino-proposta-${proposta.id}-${item.id}`}>
                                               <span className="mr-2 font-mono font-bold">{codigoDestino(categoriaEdicao, item.tipo, item.id)}</span>{item.nome}
                                               {item.detalhe && <span className="ml-2 text-muted-foreground">{item.detalhe}</span>}
                                            </button>
                                          ))}
                                          {destinosFiltrados.length === 0 && <p className="text-[10px] text-muted-foreground">Nenhum destino ativo corresponde à busca.</p>}
                                        </div>
                                        <button type="button" className="min-h-9 text-[10px] underline" onClick={() => setPropostaEditando(null)}>Fechar edição</button>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Faixa>
          {data.injetaveisSemVia > 0 && <p className="px-1 text-[11px] text-muted-foreground">{data.injetaveisSemVia} injetáveis sem via cadastrada não aparecem em IM, SC nem EV até a via ser preenchida no cadastro.</p>}
        </>
      )}

      {menu && data && (() => {
        const pid = menu.perguntaId;
        const perg = data.perguntas.find((x) => x.perguntaId === pid);
        const ativas = data.sinapses.filter((x) => x.perguntaId === pid);
        const pend = data.propostas.filter((x) => x.status === "PENDENTE" && x.perguntaId === pid);
        const jaTem = (c: Categoria, t: string, i: number) => ativas.some((x) => x.categoria === c && x.destinoTipo === t && x.destinoId === i) || pend.some((x) => x.categoria === c && x.destinoTipo === t && x.destinoId === i);
        const desl = (desligadasMenu[pid] ?? []).filter((x) => !jaTem(x.categoria, x.destinoTipo, x.destinoId));
        const editar = modo === "EDICAO";
        const ocupado = criar.isPending || desativar.isPending || aprovarProposta.isPending;
        return (
          <div data-menu-sinapse role="menu" aria-label={`Ligações de ${pid}`} data-testid="faixa-menu-ligacoes"
            className="panel-3d-sub fixed z-[80] w-[440px] max-w-[calc(100vw-16px)] p-1.5 shadow-xl" style={{ left: menu.x, top: menu.y, transform: menu.acima ? "translateY(-100%)" : undefined, background: "#fdfbf5" }}>
            <div className="mb-1 flex items-center gap-1.5 px-1">
              <span className="concave-3d sinapse-janela-codigo font-mono text-[10px] font-bold text-[#0f1e36]">{pid}</span>
              <span className="min-w-0 flex-1 truncate text-[11px] font-semibold" title={perg?.pergunta}>{perg?.pergunta}</span>
              <button type="button" className="tecla-3d h-6 w-6 text-[12px] font-bold" onClick={() => setMenu(null)} aria-label="Fechar menu">×</button>
            </div>
            <div className="concave-3d max-h-72 overflow-y-auto p-1">
              {ativas.length + pend.length + desl.length === 0 ? <p className="p-2 text-[11px] text-muted-foreground">Nenhuma ligação ainda. Em Edição, trave a pergunta e clique nas saídas.</p> : <CabecalhoGradeSaidas />}
              {ativas.map((x) => {
                const d = nomeDe.get(chave(x.categoria, x.destinoTipo, x.destinoId));
                const cod = codigoDestino(x.categoria, x.destinoTipo, x.destinoId);
                const semSaida = !d || d.incompleto;
                return (
                  <LinhaGradeSaidas key={`a${x.id}`} codigo={cod} corCodigo={semSaida ? "#b91c1c" : COR[x.categoria]} nome={d?.rotulo ?? d?.nome ?? "sem saída"} tipo={x.destinoTipo} destinoId={x.destinoId} estado={semSaida ? "SEM_SAIDA" : "ATIVA"} ligada desabilitada={!editar || ocupado}
                    rotuloAcessivel={`Desligar ${cod}`} dica={editar ? "Desligar (desativa, não apaga)" : "Entre em Edição para ligar ou desligar"} testid={`faixa-menu-tecla-${x.id}`}
                    onAlternar={() => {
                      setDesligadasMenu((m) => ({ ...m, [pid]: [...(m[pid] ?? []), { categoria: x.categoria, destinoTipo: x.destinoTipo, destinoId: x.destinoId }] }));
                      desativar.mutate(x.id);
                    }} />
                );
              })}
              {pend.map((x) => {
                const d = nomeDe.get(chave(x.categoria, x.destinoTipo, x.destinoId));
                const cod = codigoDestino(x.categoria, x.destinoTipo, x.destinoId);
                return (
                  <LinhaGradeSaidas key={`p${x.id}`} codigo={cod} corCodigo="#9b6b11" nome={d?.rotulo ?? d?.nome ?? `#${x.destinoId}`} tipo={x.destinoTipo} destinoId={x.destinoId} estado="PROPOSTA" ligada={false} desabilitada={!editar || ocupado}
                    rotuloAcessivel={`Aprovar proposta ${cod}`} dica={editar ? "Aprovar a proposta" : "Entre em Edição para ligar ou desligar"} testid={`faixa-menu-tecla-proposta-${x.id}`}
                    onAlternar={() => aprovarProposta.mutate({ id: x.id })} />
                );
              })}
              {desl.map((x, i) => {
                const d = nomeDe.get(chave(x.categoria, x.destinoTipo, x.destinoId));
                const cod = codigoDestino(x.categoria, x.destinoTipo, x.destinoId);
                return (
                  <LinhaGradeSaidas key={`d${i}-${cod}`} codigo={cod} corCodigo={COR[x.categoria]} nome={d?.rotulo ?? d?.nome ?? `#${x.destinoId}`} tipo={x.destinoTipo} destinoId={x.destinoId} estado="DESLIGADA" ligada={false} desabilitada={!editar || ocupado}
                    rotuloAcessivel={`Ligar de novo ${cod}`} dica={editar ? "Ligar de novo" : "Entre em Edição para ligar ou desligar"} testid={`faixa-menu-tecla-desligada-${cod}`}
                    onAlternar={() => criar.mutate({ perguntaId: pid, categoria: x.categoria, destinoTipo: x.destinoTipo, destinoId: x.destinoId })} />
                );
              })}
            </div>
          </div>
        );
      })()}

      {perguntaAtiva && (
        <Dialog open={telaSinapses} onOpenChange={setTelaSinapses}>
          <DialogContent className="flex h-[80vh] w-[min(56rem,94vw)] max-w-none flex-col gap-3 overflow-hidden border border-[#d9ccb0]" style={{ background: "#fdfbf5", opacity: 1 }} data-testid="faixa-tela-sinapses">
            <DialogHeader>
              <DialogTitle className="flex items-start gap-2 text-[15px]">
                <span className="concave-3d sinapse-janela-codigo shrink-0 font-mono text-[11px] font-bold text-[#0f1e36]">{perguntaAtiva.perguntaId}</span>
                <span className="min-w-0 leading-snug">{perguntaAtiva.pergunta}</span>
              </DialogTitle>
              <DialogDescription className="sr-only">Saídas ligadas e propostas desta pergunta</DialogDescription>
            </DialogHeader>
            <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Situação" data-testid="faixa-tela-visao">
              <span className="mr-2 text-[11px] font-black uppercase tracking-wider text-[#0f1e36]">{telaVisao === "ATIVAS" ? "Ligações ativas" : telaVisao === "PROPOSTAS" ? "Propostas" : "Todas as sinapses"}</span>
              {([["TUDO", "Todas"], ["ATIVAS", `Ativas (${ligacoesAtiva.length})`], ["PROPOSTAS", `Propostas (${propostasAtiva.length})`]] as const).map(([v, r]) => (
                <button key={v} type="button" aria-pressed={telaVisao === v} onClick={() => setTelaVisao(v)} className="tecla-3d h-7 px-3 text-[10px] font-black" data-testid={`faixa-tela-visao-${v}`}>{r}</button>
              ))}
            </div>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1" data-testid="faixa-correspondencia-chips">
              {(telaVisao === "PROPOSTAS" ? 0 : ligacoesAtiva.length) + (telaVisao === "ATIVAS" ? 0 : propostasAtiva.length) === 0 && <p className="text-[12px] text-muted-foreground">{telaVisao === "PROPOSTAS" ? "Nenhuma proposta." : telaVisao === "ATIVAS" ? "Nenhuma ligação ativa." : "Nenhuma saída ligada ainda."}</p>}
              {CATEGORIAS.map((c) => {
                const lig = telaVisao === "PROPOSTAS" ? [] : ligacoesAtiva.filter((x) => x.categoria === c.chave);
                const prop = telaVisao === "ATIVAS" ? [] : propostasAtiva.filter((x) => x.categoria === c.chave);
                if (!lig.length && !prop.length) return null;
                const editar = modo === "EDICAO";
                const ocupado = criar.isPending || desativar.isPending || aprovarProposta.isPending;
                return (
                  <section key={c.chave} className="concave-3d p-2" data-testid={`faixa-tela-sinapses-${c.chave}`}>
                    <h4 className="mb-1 text-[10px] font-black uppercase tracking-wider" style={{ color: c.cor }}>{c.sigla} · {c.rotulo} · {lig.length} ativa(s) · {prop.length} proposta(s)</h4>
                    <CabecalhoGradeSaidas />
                    {lig.map((x) => {
                      const dst = nomeDe.get(chave(x.categoria, x.destinoTipo, x.destinoId));
                      const semSaida = !dst || dst.incompleto;
                      const cod = codigoDestino(x.categoria, x.destinoTipo, x.destinoId);
                      return (
                        <LinhaGradeSaidas key={x.id} codigo={cod} corCodigo={semSaida ? "#b91c1c" : c.cor} nome={dst?.rotulo ?? dst?.nome ?? "sem saída"} tipo={x.destinoTipo} destinoId={x.destinoId} estado={semSaida ? "SEM_SAIDA" : "ATIVA"} ligada desabilitada={!editar || ocupado}
                          rotuloAcessivel={`Desvincular ${cod}`} dica={editar ? "Desligar (desativa, não apaga)" : "Entre em Edição para ligar ou desligar"} testid={`faixa-chip-desvincular-${x.id}`}
                          onAlternar={() => desativar.mutate(x.id)} />
                      );
                    })}
                    {prop.map((x) => {
                      const cod = codigoDestino(x.categoria, x.destinoTipo, x.destinoId);
                      return (
                        <LinhaGradeSaidas key={`p${x.id}`} codigo={cod} corCodigo="#9b6b11" nome={nomeDe.get(chave(x.categoria, x.destinoTipo, x.destinoId))?.rotulo ?? nomeDe.get(chave(x.categoria, x.destinoTipo, x.destinoId))?.nome ?? `#${x.destinoId}`} tipo={x.destinoTipo} destinoId={x.destinoId} estado="PROPOSTA" ligada={false} desabilitada={ocupado}
                          rotuloAcessivel={`Conferir proposta ${cod} na sanfona`} dica="Conferir e aprovar na sanfona" testid={`faixa-tela-proposta-${x.id}`}
                          onAlternar={() => irParaAprovacao(perguntaAtiva.perguntaId)} />
                      );
                    })}
                  </section>
                );
              })}
            </div>
          </DialogContent>
        </Dialog>
      )}

      {arraste && (
        <svg className="pointer-events-none fixed inset-0 z-[80]" width="100%" height="100%" aria-hidden>
          <path d={`M ${arraste.x0} ${arraste.y0} C ${arraste.x0 + 80} ${arraste.y0}, ${arraste.x - 80} ${arraste.y}, ${arraste.x} ${arraste.y}`} fill="none" stroke={arraste.clonar ? "#2563eb" : "#d97706"} strokeWidth={3} strokeDasharray={arraste.clonar ? "6 4" : undefined} style={{ filter: arraste.clonar ? undefined : "drop-shadow(0 0 4px #f3ce72)" }} />
          <circle cx={arraste.x} cy={arraste.y} r={5} fill={arraste.clonar ? "#2563eb" : "#d97706"} />
        </svg>
      )}
    </div>
  );
}
