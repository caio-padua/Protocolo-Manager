import { useState } from "react";
import {
  useListAnamneseBlocos,
  useListAnamnesePerguntas,
  useUpdateAnamnesePergunta,
  useSimularMotor,
} from "@workspace/api-client-react";
import type {
  AnamnesePergunta,
  AnamneseOpcao,
  SimulacaoResultado,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Brain,
  AlertTriangle,
  Activity,
  ListChecks,
  FlaskConical,
  Stethoscope,
  Gauge,
  Save,
  Play,
  RotateCcw,
  ChevronRight,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

function gradeColor(grade: string): string {
  if (grade.includes("AMPLIADA"))
    return "bg-red-100 text-red-800 border-red-300 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800";
  if (grade.includes("SOFISTICADA"))
    return "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800";
  if (grade.includes("INTERMEDIARIA"))
    return "bg-cyan-100 text-cyan-800 border-cyan-300 dark:bg-cyan-900/30 dark:text-cyan-300 dark:border-cyan-800";
  return "bg-green-100 text-green-800 border-green-300 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800";
}

function BlocosEditor() {
  const { data: blocos, isLoading } = useListAnamneseBlocos();
  const [blocoAtivo, setBlocoAtivo] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(6)].map((_, i) => (
          <Skeleton key={i} className="h-16 rounded-md" />
        ))}
      </div>
    );
  }

  const blocoSel = blocoAtivo ?? blocos?.[0]?.bloco ?? null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-5">
      <div className="space-y-1.5">
        <p className="text-[11px] font-semibold tracking-[0.18em] uppercase text-muted-foreground mb-2">
          14 Blocos da Anamnese
        </p>
        {blocos?.map((b) => {
          const active = b.bloco === blocoSel;
          return (
            <button
              key={b.bloco}
              onClick={() => setBlocoAtivo(b.bloco)}
              data-testid={`bloco-item-${b.bloco}`}
              className={`w-full text-left px-3 py-2.5 border transition-all flex items-center justify-between gap-2 ${
                active
                  ? "bg-primary/10 border-primary/40 text-foreground"
                  : "bg-card border-border hover:bg-muted/50 text-muted-foreground"
              }`}
              style={{ borderRadius: "6px" }}
            >
              <span className="text-sm font-medium truncate">{b.bloco}</span>
              <span className="flex items-center gap-1 flex-shrink-0">
                {(b.comAlarme ?? 0) > 0 && (
                  <Badge
                    variant="outline"
                    className="text-[10px] px-1.5 bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-300"
                  >
                    {b.comAlarme} alarme
                  </Badge>
                )}
                {(b.comEscala ?? 0) > 0 && (
                  <Badge
                    variant="outline"
                    className="text-[10px] px-1.5 bg-cyan-100 text-cyan-700 border-cyan-300 dark:bg-cyan-900/30 dark:text-cyan-300"
                  >
                    {b.comEscala} escala
                  </Badge>
                )}
                <Badge variant="secondary" className="text-[10px] px-1.5">
                  {b.total}
                </Badge>
              </span>
            </button>
          );
        })}
      </div>

      <div>{blocoSel && <PerguntasEditor bloco={blocoSel} />}</div>
    </div>
  );
}

function PerguntasEditor({ bloco }: { bloco: string }) {
  const { data: perguntas, isLoading, refetch } = useListAnamnesePerguntas({
    bloco,
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <ChevronRight className="h-4 w-4 text-primary" />
        <h3 className="text-base font-semibold tracking-tight">{bloco}</h3>
      </div>
      {isLoading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-14 rounded-md" />
          ))}
        </div>
      ) : (
        perguntas?.map((p) => (
          <PerguntaRow key={p.id} pergunta={p} onSaved={refetch} />
        ))
      )}
    </div>
  );
}

function PerguntaRow({
  pergunta,
  onSaved,
}: {
  pergunta: AnamnesePergunta;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [texto, setTexto] = useState(pergunta.pergunta);
  const [peso, setPeso] = useState(String(pergunta.pesoGravidade ?? 1));

  const update = useUpdateAnamnesePergunta({
    mutation: {
      onSuccess: () => {
        toast({ title: "Pergunta atualizada!" });
        setEditing(false);
        onSaved();
      },
      onError: () =>
        toast({ title: "Erro ao salvar pergunta", variant: "destructive" }),
    },
  });

  const opcoes: AnamneseOpcao[] = pergunta.opcoes ?? [];

  return (
    <div
      className="border border-border bg-card p-3"
      style={{ borderRadius: "6px" }}
      data-testid={`pergunta-row-${pergunta.perguntaId}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <Badge variant="outline" className="text-[10px] font-mono px-1.5">
              {pergunta.perguntaId}
            </Badge>
            {pergunta.sistema && (
              <Badge variant="secondary" className="text-[10px] px-1.5">
                {pergunta.sistema}
              </Badge>
            )}
            {pergunta.escalaValidada && (
              <Badge className="text-[10px] px-1.5 bg-cyan-600 hover:bg-cyan-600">
                {pergunta.escalaValidada}
              </Badge>
            )}
            {pergunta.eSinalAlarme && (
              <Badge className="text-[10px] px-1.5 bg-red-600 hover:bg-red-600 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" /> ALARME
              </Badge>
            )}
            <span className="text-[10px] text-muted-foreground">
              peso {pergunta.pesoGravidade ?? 1}
            </span>
          </div>

          {editing ? (
            <div className="space-y-2 mt-2">
              <Input
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                className="text-sm"
                data-testid={`input-pergunta-${pergunta.perguntaId}`}
              />
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  Peso gravidade
                </span>
                <Input
                  type="number"
                  value={peso}
                  onChange={(e) => setPeso(e.target.value)}
                  className="w-20 text-sm"
                  data-testid={`input-peso-${pergunta.perguntaId}`}
                />
              </div>
            </div>
          ) : (
            <p className="text-sm leading-snug">{pergunta.pergunta}</p>
          )}

          {!editing && opcoes.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {opcoes.map((o, i) => (
                <span
                  key={i}
                  className="text-[10px] px-1.5 py-0.5 bg-muted border border-border text-muted-foreground"
                  style={{ borderRadius: "4px" }}
                >
                  {o.label} ({o.peso})
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="flex-shrink-0">
          {editing ? (
            <div className="flex gap-1">
              <Button
                size="sm"
                onClick={() =>
                  update.mutate({
                    id: pergunta.id,
                    data: { pergunta: texto, pesoGravidade: Number(peso) },
                  })
                }
                disabled={update.isPending}
                data-testid={`button-save-${pergunta.perguntaId}`}
              >
                <Save className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setEditing(false);
                  setTexto(pergunta.pergunta);
                  setPeso(String(pergunta.pesoGravidade ?? 1));
                }}
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </Button>
            </div>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setEditing(true)}
              data-testid={`button-edit-${pergunta.perguntaId}`}
            >
              Editar
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

const EXEMPLOS: { nome: string; descricao: string; respostas: Record<string, string | number> }[] = [
  {
    nome: "Caso 1 — Metabólico + humor",
    descricao:
      "Diabetes, sede excessiva, perda de peso (alarme), dor torácica (alarme), PHQ-9 e GAD-7 graves.",
    respostas: {
      D02: "sim",
      "C-END01": "sim",
      "C-GER01": "sim",
      "C-CAR01": "sim",
      PHQ2: 3,
      GAD1: 3,
    },
  },
  {
    nome: "Caso 2 — Baixa complexidade",
    descricao: "Poucas queixas, sem sinais de alarme.",
    respostas: {
      "C-END01": "sim",
    },
  },
];

function Simulador() {
  const { data: blocos } = useListAnamneseBlocos();
  const [respostas, setRespostas] = useState<Record<string, string | number>>(
    EXEMPLOS[0].respostas,
  );
  const [resultado, setResultado] = useState<SimulacaoResultado | null>(null);

  const simular = useSimularMotor({
    mutation: {
      onSuccess: (data) => setResultado(data),
    },
  });

  function rodar(r: Record<string, string | number>) {
    const respArr = Object.entries(r).map(([perguntaId, valor]) => ({
      perguntaId,
      valor,
    }));
    simular.mutate({ data: { respostas: respArr } });
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-5">
      <Card style={{ borderRadius: "6px" }}>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Play className="h-4 w-4 text-primary" /> Entradas do caso clínico
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <p className="text-[11px] font-semibold tracking-[0.18em] uppercase text-muted-foreground">
              Casos de exemplo
            </p>
            <div className="flex flex-col gap-2">
              {EXEMPLOS.map((ex) => (
                <button
                  key={ex.nome}
                  onClick={() => {
                    setRespostas(ex.respostas);
                    rodar(ex.respostas);
                  }}
                  data-testid={`exemplo-${ex.nome}`}
                  className="text-left border border-border bg-card hover:bg-muted/50 p-3 transition-all"
                  style={{ borderRadius: "6px" }}
                >
                  <p className="text-sm font-medium">{ex.nome}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {ex.descricao}
                  </p>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-[11px] font-semibold tracking-[0.18em] uppercase text-muted-foreground">
              Respostas ativas ({Object.keys(respostas).length})
            </p>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(respostas).map(([k, v]) => (
                <span
                  key={k}
                  className="text-[11px] px-2 py-1 bg-primary/10 border border-primary/30 font-mono"
                  style={{ borderRadius: "4px" }}
                >
                  {k} = {String(v)}
                </span>
              ))}
            </div>
          </div>

          <Button
            onClick={() => rodar(respostas)}
            disabled={simular.isPending}
            className="w-full"
            data-testid="button-rodar-motor"
          >
            <Play className="h-4 w-4 mr-2" />
            {simular.isPending ? "Processando..." : "Rodar Motor"}
          </Button>
          {blocos && (
            <p className="text-[11px] text-muted-foreground text-center">
              Motor consome {blocos.length} blocos da base — nada hardcoded.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="space-y-4">
        {!resultado ? (
          <Card style={{ borderRadius: "6px" }}>
            <CardContent className="py-12 text-center text-muted-foreground">
              <Gauge className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p className="text-sm">
                Escolha um caso e clique em Rodar Motor para ver o resultado.
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            <Card style={{ borderRadius: "6px" }}>
              <CardContent className="pt-5">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-[11px] font-semibold tracking-[0.18em] uppercase text-muted-foreground">
                      Escore total
                    </p>
                    <p className="text-3xl font-bold">{resultado.escoreTotal}</p>
                  </div>
                  <Badge
                    className={`text-sm px-3 py-1 border ${gradeColor(resultado.gradeGlobal)}`}
                    variant="outline"
                  >
                    {resultado.gradeGlobal}
                  </Badge>
                </div>
                <div className="space-y-1.5">
                  {resultado.blocos.map((b) => (
                    <div
                      key={b.bloco}
                      className="flex items-center justify-between text-sm border border-border px-2.5 py-1.5"
                      style={{ borderRadius: "4px" }}
                    >
                      <span className="truncate">{b.bloco}</span>
                      <span className="flex items-center gap-2 flex-shrink-0">
                        <span className="font-semibold">{b.escore}</span>
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${gradeColor(b.grade)}`}
                        >
                          {b.grade.replace("GRADE ", "")}
                        </Badge>
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {resultado.alarmes.length > 0 && (
              <Card
                className="border-red-300 dark:border-red-800"
                style={{ borderRadius: "6px" }}
              >
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2 text-red-700 dark:text-red-300">
                    <AlertTriangle className="h-4 w-4" /> Sinais de alarme (
                    {resultado.alarmes.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-1.5">
                  {resultado.alarmes.map((a) => (
                    <div
                      key={a.perguntaId}
                      className="text-sm flex items-center gap-2"
                    >
                      <Badge
                        variant="outline"
                        className="text-[10px] font-mono px-1.5"
                      >
                        {a.perguntaId}
                      </Badge>
                      <span>{a.pergunta}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <ResultList
                icon={<Activity className="h-4 w-4" />}
                titulo="Sintomas acesos"
                itens={resultado.sintomas}
                cor="text-amber-600"
              />
              <ResultList
                icon={<Stethoscope className="h-4 w-4" />}
                titulo="Hipóteses (doenças)"
                itens={resultado.doencas}
                cor="text-cyan-600"
              />
            </div>

            <ResultList
              icon={<FlaskConical className="h-4 w-4" />}
              titulo={`Exames sugeridos (${resultado.exames.length})`}
              itens={resultado.exames}
              cor="text-primary"
            />
          </>
        )}
      </div>
    </div>
  );
}

function ResultList({
  icon,
  titulo,
  itens,
  cor,
}: {
  icon: React.ReactNode;
  titulo: string;
  itens: string[];
  cor: string;
}) {
  return (
    <Card style={{ borderRadius: "6px" }}>
      <CardHeader className="pb-2">
        <CardTitle className={`text-sm flex items-center gap-2 ${cor}`}>
          {icon} {titulo}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {itens.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhum.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {itens.map((s) => (
              <span
                key={s}
                className="text-[11px] px-2 py-1 bg-muted border border-border"
                style={{ borderRadius: "4px" }}
              >
                {s}
              </span>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function MegaAnamnese() {
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center gap-3">
        <div
          className="w-10 h-10 flex items-center justify-center bg-primary/10 border border-primary/30"
          style={{ borderRadius: "6px" }}
        >
          <Brain className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Mega Anamnese</h1>
          <p className="text-muted-foreground">
            Anamnese integrativa nível Harvard + Motor clínico — editável,
            DB-driven.
          </p>
        </div>
      </div>

      <Tabs defaultValue="simulador" className="w-full">
        <TabsList>
          <TabsTrigger value="simulador" data-testid="tab-simulador">
            <Gauge className="h-4 w-4 mr-2" /> Simulador do Motor
          </TabsTrigger>
          <TabsTrigger value="blocos" data-testid="tab-blocos">
            <ListChecks className="h-4 w-4 mr-2" /> Blocos &amp; Perguntas
          </TabsTrigger>
        </TabsList>
        <TabsContent value="simulador" className="mt-5">
          <Simulador />
        </TabsContent>
        <TabsContent value="blocos" className="mt-5">
          <BlocosEditor />
        </TabsContent>
      </Tabs>
    </div>
  );
}
