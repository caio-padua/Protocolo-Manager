import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Search,
  Loader2,
  Coins,
  CheckCircle2,
  XCircle,
  RotateCcw,
  History,
  Bot,
  Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ConsoleShell, BASE, BlockTitle } from "@/pages/comunicacao/_shared";
import { IntegrationVaultCard } from "@/components/integrations/IntegrationVault";

// ============================================================================
// CENTRAL DE PESQUISA (Apify) — Task 235.
//
// Tela própria, separada da Dieta: aciona robôs de pesquisa via Apify e traz
// o resultado de volta. Primeiro uso: preço médio de um alimento numa
// cidade/região. A estrutura (tabela `pesquisas`, rotas /api/pesquisas) já
// nasce genérica para caber outros tipos de pesquisa no futuro (ex.: cliente
// potencial por bairro) sem precisar refazer esta tela.
// ============================================================================

interface Alimento {
  id: number;
  nome: string;
  grupo: string | null;
}

interface PesquisaPrecoInsumoAmostra {
  preco: number;
  contexto: string;
  fonte?: string;
}
interface PesquisaPrecoInsumoResultado {
  precoMedio: number;
  amostras: PesquisaPrecoInsumoAmostra[];
}
interface Pesquisa {
  id: number;
  tipo: string;
  status: "em_andamento" | "concluida" | "erro";
  parametros: { alimentoId: number; alimentoNome: string; cidade: string };
  resultadoResumo: PesquisaPrecoInsumoResultado | null;
  erro: string | null;
  aplicadoEm: string | null;
  origemPesquisaId: number | null;
  createdAt: string;
  updatedAt: string;
}

const TIPO_LABELS: Record<string, string> = {
  preco_insumo: "Preço de insumo",
};
function tipoLabel(tipo: string): string {
  return TIPO_LABELS[tipo] ?? tipo;
}

function formatBRL(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function formatDataHora(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}
async function parseApiError(r: Response, fallback: string): Promise<string> {
  const json = await r.json().catch(() => null);
  return (json as { error?: string } | null)?.error ?? fallback;
}

function estadoPesquisa(status: Pesquisa["status"]): { led: string; label: string; color: string } {
  if (status === "em_andamento") return { led: "paxter-led-amber", label: "Em andamento", color: "text-amber-700 dark:text-amber-400" };
  if (status === "concluida") return { led: "paxter-led-green", label: "Concluída", color: "text-emerald-700 dark:text-emerald-400" };
  return { led: "paxter-led-red", label: "Erro", color: "text-rose-700 dark:text-rose-400" };
}

export default function CentralPesquisa() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [alimentoId, setAlimentoId] = useState<string>("");
  const [cidade, setCidade] = useState("");
  const [pesquisaAtualId, setPesquisaAtualId] = useState<number | null>(null);

  const { data: alimentos } = useQuery<Alimento[]>({
    queryKey: ["dieta", "alimentos"],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/dieta/catalogo/alimentos`);
      if (!r.ok) throw new Error("Falha ao carregar alimentos");
      return r.json();
    },
  });

  const { data: historico, isLoading: carregandoHistorico } = useQuery<Pesquisa[]>({
    queryKey: ["pesquisas"],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/pesquisas`);
      if (!r.ok) throw new Error("Falha ao carregar histórico");
      return r.json();
    },
    refetchInterval: (query) => {
      const lista = query.state.data as Pesquisa[] | undefined;
      return lista?.some((p) => p.status === "em_andamento") ? 4000 : false;
    },
  });

  // Poll dedicado da pesquisa em foco — garante avanço da máquina de estados
  // (lazy poll: o servidor só consulta o Apify quando alguém pergunta pelo status).
  const { data: pesquisaPolled } = useQuery<Pesquisa>({
    queryKey: ["pesquisas", pesquisaAtualId],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/pesquisas/${pesquisaAtualId}`);
      if (!r.ok) throw new Error("Falha ao consultar a pesquisa");
      return r.json();
    },
    enabled: pesquisaAtualId !== null,
    refetchInterval: (query) => {
      const p = query.state.data as Pesquisa | undefined;
      return p?.status === "em_andamento" ? 3000 : false;
    },
  });

  useEffect(() => {
    if (pesquisaPolled && pesquisaPolled.status !== "em_andamento") {
      queryClient.invalidateQueries({ queryKey: ["pesquisas"] });
    }
  }, [pesquisaPolled, queryClient]);

  const pesquisaDoHistorico = useMemo(
    () => historico?.find((p) => p.id === pesquisaAtualId) ?? null,
    [historico, pesquisaAtualId],
  );
  const exibida = pesquisaPolled ?? pesquisaDoHistorico;

  const iniciar = useMutation({
    mutationFn: async () => {
      const r = await fetch(`${BASE}/api/pesquisas/preco-insumo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alimentoId: Number(alimentoId), cidade: cidade.trim() }),
      });
      if (!r.ok) throw new Error(await parseApiError(r, "Falha ao iniciar a pesquisa."));
      return r.json() as Promise<Pesquisa>;
    },
    onSuccess: (row) => {
      setPesquisaAtualId(row.id);
      queryClient.invalidateQueries({ queryKey: ["pesquisas"] });
      if (row.status === "erro") {
        toast({ title: "Pesquisa não pôde ser acionada", description: row.erro ?? undefined, variant: "destructive" });
      } else {
        toast({ title: "Pesquisa disparada — acompanhe abaixo" });
      }
    },
    onError: (e: Error) => {
      toast({ title: "Não foi possível iniciar", description: e.message, variant: "destructive" });
    },
  });

  const aplicar = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`${BASE}/api/pesquisas/${id}/aplicar`, { method: "POST" });
      if (!r.ok) throw new Error(await parseApiError(r, "Falha ao aplicar o preço."));
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Preço aplicado ao catálogo" });
      queryClient.invalidateQueries({ queryKey: ["pesquisas"] });
      queryClient.invalidateQueries({ queryKey: ["dieta", "alimentos"] });
    },
    onError: (e: Error) => {
      toast({ title: "Não foi possível aplicar", description: e.message, variant: "destructive" });
    },
  });

  const refazer = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`${BASE}/api/pesquisas/${id}/refazer`, { method: "POST" });
      if (!r.ok) throw new Error(await parseApiError(r, "Falha ao refazer a pesquisa."));
      return r.json() as Promise<Pesquisa>;
    },
    onSuccess: (row) => {
      setPesquisaAtualId(row.id);
      queryClient.invalidateQueries({ queryKey: ["pesquisas"] });
      toast({ title: "Pesquisa refeita — acompanhe abaixo" });
    },
    onError: (e: Error) => {
      toast({ title: "Não foi possível refazer", description: e.message, variant: "destructive" });
    },
  });

  const podeIniciar = !!alimentoId && cidade.trim().length > 0 && !iniciar.isPending;

  return (
    <ConsoleShell
      icon={Search}
      title="Central de Pesquisa"
      subtitle="Robôs de pesquisa (Apify) — primeiro uso: preço médio de insumo"
    >
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[380px_1fr]">
        {/* ----- Coluna do formulário + cofre ----- */}
        <div className="space-y-5">
          <div className="panel-3d space-y-4 p-4">
            <BlockTitle icon={Coins}>Nova pesquisa de preço</BlockTitle>
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  Alimento do catálogo
                </label>
                <Select value={alimentoId} onValueChange={setAlimentoId}>
                  <SelectTrigger className="field-engraved">
                    <SelectValue placeholder="Selecionar alimento…" />
                  </SelectTrigger>
                  <SelectContent>
                    {(alimentos ?? []).map((a) => (
                      <SelectItem key={a.id} value={String(a.id)}>
                        {a.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  Cidade ou região
                </label>
                <div className="concave-3d flex h-10 items-center gap-1 px-1">
                  <Input
                    className="field-engraved h-8 flex-1 border-0 bg-transparent shadow-none focus-visible:ring-0"
                    value={cidade}
                    onChange={(e) => setCidade(e.target.value)}
                    placeholder="Ex.: São Paulo, SP"
                  />
                </div>
              </div>
              <Button type="button" className="btn-3d w-full" disabled={!podeIniciar} onClick={() => iniciar.mutate()}>
                {iniciar.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Search className="mr-2 h-4 w-4" />
                )}
                {iniciar.isPending ? "Acionando robô…" : "Pesquisar preço médio"}
              </Button>
            </div>
          </div>

          <IntegrationVaultCard
            provider="apify"
            icon={Bot}
            accent="text-amber-600"
            labelOn="Token no cofre"
            labelOff="Sem token"
            description={
              <p>
                Cole aqui o token de API da sua conta Apify e (opcional) o ID do robô de
                pesquisa de preço. Sem o token, o botão "Pesquisar preço médio" não
                consegue acionar o robô.
              </p>
            }
          />
        </div>

        {/* ----- Coluna de resultado + histórico ----- */}
        <div className="space-y-5">
          {exibida ? (
            <ResultadoCard
              pesquisa={exibida}
              onAplicar={() => aplicar.mutate(exibida.id)}
              aplicando={aplicar.isPending}
              onRefazer={() => refazer.mutate(exibida.id)}
              refazendo={refazer.isPending}
            />
          ) : (
            <div className="panel-3d p-6 text-sm text-muted-foreground">
              Escolha um alimento e uma cidade ao lado, depois clique em "Pesquisar preço
              médio" para acionar o robô.
            </div>
          )}

          <div className="panel-3d space-y-3 p-4">
            <BlockTitle icon={History}>Histórico de pesquisas</BlockTitle>
            {carregandoHistorico ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : !historico || historico.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma pesquisa feita ainda.</p>
            ) : (
              <div className="space-y-2">
                {historico.map((p) => (
                  <HistoricoRow
                    key={p.id}
                    pesquisa={p}
                    selecionada={p.id === pesquisaAtualId}
                    onVer={() => setPesquisaAtualId(p.id)}
                    onRefazer={() => refazer.mutate(p.id)}
                    refazendo={refazer.isPending}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </ConsoleShell>
  );
}

function ResultadoCard({
  pesquisa,
  onAplicar,
  aplicando,
  onRefazer,
  refazendo,
}: {
  pesquisa: Pesquisa;
  onAplicar: () => void;
  aplicando: boolean;
  onRefazer: () => void;
  refazendo: boolean;
}) {
  const estado = estadoPesquisa(pesquisa.status);
  const resultado = pesquisa.resultadoResumo;

  return (
    <div className="panel-3d space-y-4 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={`paxter-led paxter-led-breathe ${estado.led} shrink-0`} />
            <h3 className="truncate text-sm font-semibold uppercase tracking-[0.06em]">
              {pesquisa.parametros.alimentoNome}
            </h3>
          </div>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            {tipoLabel(pesquisa.tipo)} · {pesquisa.parametros.cidade} · {formatDataHora(pesquisa.createdAt)}
          </p>
        </div>
        <span className={`shrink-0 text-[11px] font-semibold uppercase tracking-wide ${estado.color}`}>
          {estado.label}
        </span>
      </div>

      {pesquisa.status === "em_andamento" && (
        <div className="concave-3d flex items-center gap-2 px-3 py-3 text-[13px] text-muted-foreground">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
          Aguardando o robô no Apify terminar a pesquisa…
        </div>
      )}

      {pesquisa.status === "erro" && (
        <div className="concave-3d flex items-start gap-2 px-3 py-3 text-rose-700 dark:text-rose-400">
          <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <p className="text-[13px] leading-relaxed">{pesquisa.erro ?? "Falha desconhecida."}</p>
        </div>
      )}

      {pesquisa.status === "concluida" && resultado && (
        <>
          <div className="concave-3d px-4 py-4 text-center">
            <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
              Preço médio encontrado
            </p>
            <p className="mt-1 text-3xl font-bold text-primary">{formatBRL(resultado.precoMedio)}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              baseado em {resultado.amostras.length} amostra{resultado.amostras.length === 1 ? "" : "s"}
            </p>
          </div>

          {resultado.amostras.length > 0 && (
            <div className="concave-3d max-h-56 space-y-2 overflow-y-auto px-3 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-foreground/80">
                Amostras usadas
              </p>
              {resultado.amostras.map((a, i) => (
                <div key={i} className="panel-3d-sub px-3 py-2 text-[12px]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-primary">{formatBRL(a.preco)}</span>
                    {a.fonte && (
                      <a
                        href={a.fonte}
                        target="_blank"
                        rel="noreferrer"
                        className="truncate text-[11px] text-sky-600 hover:underline dark:text-sky-400"
                      >
                        fonte
                      </a>
                    )}
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-muted-foreground">{a.contexto}</p>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between gap-3">
            {pesquisa.aplicadoEm ? (
              <p className="text-[11px] text-muted-foreground">
                Aplicado ao catálogo em {formatDataHora(pesquisa.aplicadoEm)}
              </p>
            ) : (
              <span />
            )}
            <Button type="button" className="btn-3d" disabled={aplicando} onClick={onAplicar}>
              {aplicando ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="mr-2 h-4 w-4" />
              )}
              {pesquisa.aplicadoEm ? "Aplicar novamente" : "Aplicar preço ao catálogo"}
            </Button>
          </div>
        </>
      )}

      {pesquisa.status === "erro" && (
        <div className="flex justify-end">
          <Button type="button" className="btn-3d-soft" disabled={refazendo} onClick={onRefazer}>
            {refazendo ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-2 h-4 w-4" />}
            Refazer pesquisa
          </Button>
        </div>
      )}
    </div>
  );
}

function HistoricoRow({
  pesquisa,
  selecionada,
  onVer,
  onRefazer,
  refazendo,
}: {
  pesquisa: Pesquisa;
  selecionada: boolean;
  onVer: () => void;
  onRefazer: () => void;
  refazendo: boolean;
}) {
  const estado = estadoPesquisa(pesquisa.status);
  return (
    <div className={`panel-3d-sub flex items-center justify-between gap-3 p-3 ${selecionada ? "ring-1 ring-primary/60" : ""}`}>
      <div className="flex min-w-0 items-center gap-2">
        <span className={`paxter-led paxter-led-breathe ${estado.led} shrink-0`} />
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold">{pesquisa.parametros.alimentoNome}</p>
          <p className="truncate text-[11px] text-muted-foreground">
            {tipoLabel(pesquisa.tipo)} · {pesquisa.parametros.cidade} · {formatDataHora(pesquisa.createdAt)}
            {pesquisa.status === "concluida" && pesquisa.resultadoResumo
              ? ` · ${formatBRL(pesquisa.resultadoResumo.precoMedio)}`
              : ""}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {pesquisa.status === "erro" && (
          <Button type="button" variant="ghost" size="sm" disabled={refazendo} onClick={onRefazer} title="Refazer">
            <RotateCcw className="h-4 w-4" />
          </Button>
        )}
        <Button type="button" variant="ghost" size="sm" onClick={onVer} title="Ver detalhe">
          <Eye className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
