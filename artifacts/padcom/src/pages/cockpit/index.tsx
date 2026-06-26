import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import { useToast } from "@/hooks/use-toast";
import PaxterLogo from "@/components/branding/PaxterLogo";
import {
  Stethoscope,
  History,
  Activity,
  FileCheck2,
  FlaskConical,
  ClipboardList,
  Syringe,
  Pill,
  Salad,
  Dumbbell,
  AlertTriangle,
  Send,
  ExternalLink,
} from "lucide-react";

// ============================================================================
// ONDA E — COCKPIT DA CONSULTA do Master Loop Paxter.
// Consolida a consulta em 3 colunas: PASSADO (historico), PRESENTE (Cerebro:
// escore/doencas vivas) e FUTURO (prescricao sugerida em blocos expansiveis).
// Os accordions sao BURROS: so renderizam o DTO que o Cerebro monta. O botao
// "Finalizar e Emitir Tudo" gera o PDF, aprova os orcamentos e dispara a
// mensageria inteligente (lembretes por periodo/dia).
// ============================================================================

const GOLD = "#c2a05a";
const GOLD_FORTE = "#d9bd7e";

interface ItemFuturo {
  id: number;
  nome: string;
  ref: string | null;
  peso: number;
}
interface Sugestao {
  objetivoSugerido: string;
  estiloSugerido?: string | null;
  divisaoSugerida?: string | null;
  justificativa: string;
}
interface CockpitDTO {
  cliente: { id: number; nome: string; telefone: string | null; email: string | null };
  passado: {
    protocolos: { id: number; status: string; createdAt: string }[];
    orcamentos: { id: number; title: string; status: string; totalCents: number }[];
    respostasAnamnese: number;
  };
  presente: {
    escoreTotal: number;
    gradeGlobal: string;
    redFlag: boolean;
    blocos: { bloco: string; escore: number; grade: string }[];
    sintomas: string[];
    doencas: string[];
    alarmes: { perguntaId: string; pergunta: string }[];
  };
  futuro: {
    formulas: ItemFuturo[];
    exames: ItemFuturo[];
    injetaveis: ItemFuturo[];
    implantes: ItemFuturo[];
    dieta: Sugestao | null;
    treino: Sugestao | null;
  };
}
interface ClienteOpt {
  id: number;
  name: string;
}
interface EmitirResp {
  ok: boolean;
  orcamentosAprovados: number;
  lembretes: { agendados: number; porTipo: { formula: number; exame: number; injetavel: number } };
  pdfUrl: string;
  whatsapp: { sent: boolean; via: string; link: string };
}

function moeda(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function Cockpit() {
  const { toast } = useToast();
  const [clienteId, setClienteId] = useState<number | null>(null);

  const { data: clientes } = useQuery<ClienteOpt[]>({
    queryKey: ["cockpit-clientes"],
    queryFn: async () => {
      const r = await fetch("/api/clients");
      if (!r.ok) throw new Error("falha ao listar clientes");
      const rows = await r.json();
      return (rows as { id: number; name: string }[]).map((c) => ({ id: c.id, name: c.name }));
    },
  });

  const { data: dto, isLoading } = useQuery<CockpitDTO>({
    queryKey: ["cockpit", clienteId],
    enabled: clienteId != null,
    queryFn: async () => {
      const r = await fetch(`/api/cockpit/${clienteId}`);
      if (!r.ok) throw new Error("falha ao carregar cockpit");
      return r.json();
    },
  });

  const emitir = useMutation<EmitirResp>({
    mutationFn: async () => {
      const r = await fetch(`/api/cockpit/${clienteId}/emitir`, { method: "POST" });
      if (!r.ok) throw new Error("falha ao emitir");
      return r.json();
    },
    onSuccess: (res) => {
      toast({
        title: "Consulta finalizada e emitida",
        description: `${res.orcamentosAprovados} orcamento(s) aprovado(s) | ${res.lembretes.agendados} lembrete(s) agendado(s) | WhatsApp ${res.whatsapp.via === "twilio" ? "enviado" : "link gerado"}.`,
      });
      if (res.whatsapp.via === "link" && res.whatsapp.link) window.open(res.whatsapp.link, "_blank");
    },
    onError: () => toast({ title: "Erro ao emitir", variant: "destructive" }),
  });

  const gradeCor = useMemo(() => {
    const g = dto?.presente.gradeGlobal ?? "";
    if (dto?.presente.redFlag || g.includes("AMPLIADA")) return "#ef4444";
    if (g.includes("SOFISTICADA")) return "#f59e0b";
    if (g.includes("INTERMEDIARIA")) return GOLD_FORTE;
    if (g.includes("BASICA")) return "#22c55e";
    return "#64748b";
  }, [dto]);

  return (
    <div className="dark min-h-full rounded-xl bg-[#16284a] p-5 text-slate-100">
      {/* Cabecalho com logo dourada no canto superior direito */}
      <header className="relative mb-5 flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="bevel-3d flex h-11 w-11 items-center justify-center">
            <Stethoscope className="h-6 w-6" style={{ color: GOLD_FORTE }} />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight" style={{ color: GOLD_FORTE }}>
              Cockpit da Consulta
            </h1>
            <p className="text-sm text-slate-300">
              Passado &rarr; Presente &rarr; Futuro: a consulta inteira numa tela so
            </p>
          </div>
        </div>
        <PaxterLogo variant="compact" tone="dark" className="hidden shrink-0 sm:flex" />
      </header>

      {/* Barra: seletor de cliente + botao Finalizar e Emitir Tudo */}
      <div className="panel-3d mb-5 flex flex-wrap items-center gap-3 rounded-lg p-3">
        <span className="text-xs font-semibold uppercase tracking-widest text-slate-400">Cliente</span>
        <div className="min-w-[280px] flex-1">
          <Select value={clienteId ? String(clienteId) : ""} onValueChange={(v) => setClienteId(Number(v))}>
            <SelectTrigger className="field-engraved">
              <SelectValue placeholder="Escolha um cliente para abrir a consulta..." />
            </SelectTrigger>
            <SelectContent>
              {(clientes ?? []).slice(0, 200).map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          className="btn-3d-soft gap-2 font-semibold"
          style={{ color: GOLD_FORTE }}
          disabled={!dto || emitir.isPending}
          onClick={() => emitir.mutate()}
        >
          <Send className="h-4 w-4" />
          {emitir.isPending ? "Emitindo..." : "Finalizar e Emitir Tudo"}
        </Button>
      </div>

      {clienteId == null ? (
        <div className="panel-3d flex min-h-[300px] items-center justify-center rounded-lg p-8 text-center text-slate-400">
          Selecione um cliente para consolidar a consulta nas tres colunas.
        </div>
      ) : isLoading || !dto ? (
        <div className="grid grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-[420px] rounded-lg bg-white/5" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* COLUNA 1 — PASSADO */}
          <section className="panel-3d rounded-lg p-4">
            <div className="mb-3 flex items-center gap-2 border-b border-white/10 pb-2">
              <History className="h-5 w-5" style={{ color: GOLD }} />
              <h2 className="text-sm font-bold uppercase tracking-widest" style={{ color: GOLD }}>
                Passado
              </h2>
            </div>
            <div className="mb-3 text-lg font-semibold">{dto.cliente.nome}</div>
            <div className="mb-3 text-xs text-slate-400">
              {dto.cliente.telefone ?? "sem telefone"} &middot; {dto.cliente.email ?? "sem e-mail"}
            </div>
            <div className="space-y-3">
              <div className="screen-3d rounded-md p-3">
                <div className="text-xs uppercase tracking-wide text-slate-400">Respostas de anamnese</div>
                <div className="text-2xl font-bold" style={{ color: GOLD_FORTE }}>
                  {dto.passado.respostasAnamnese}
                </div>
              </div>
              <div>
                <div className="mb-1 text-xs uppercase tracking-wide text-slate-400">Protocolos</div>
                {dto.passado.protocolos.length === 0 ? (
                  <div className="text-sm text-slate-500">Nenhum protocolo.</div>
                ) : (
                  dto.passado.protocolos.map((p) => (
                    <div key={p.id} className="panel-3d-sub mb-2 flex items-center justify-between rounded-md p-2 text-sm">
                      <span>Protocolo #{p.id}</span>
                      <span className="text-xs uppercase text-emerald-400">{p.status}</span>
                    </div>
                  ))
                )}
              </div>
              <div>
                <div className="mb-1 text-xs uppercase tracking-wide text-slate-400">Orcamentos</div>
                {dto.passado.orcamentos.length === 0 ? (
                  <div className="text-sm text-slate-500">Nenhum orcamento.</div>
                ) : (
                  dto.passado.orcamentos.map((o) => (
                    <div key={o.id} className="panel-3d-sub mb-2 flex items-center justify-between rounded-md p-2 text-sm">
                      <span className="truncate">{o.title}</span>
                      <span className="ml-2 shrink-0 text-xs uppercase text-slate-300">
                        {o.status} &middot; {moeda(o.totalCents)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </section>

          {/* COLUNA 2 — PRESENTE (Cerebro) */}
          <section className="panel-3d rounded-lg p-4">
            <div className="mb-3 flex items-center gap-2 border-b border-white/10 pb-2">
              <Activity className="h-5 w-5" style={{ color: GOLD }} />
              <h2 className="text-sm font-bold uppercase tracking-widest" style={{ color: GOLD }}>
                Presente
              </h2>
            </div>
            <div className="screen-3d mb-3 rounded-md p-4 text-center">
              <div className="text-xs uppercase tracking-widest text-slate-400">Grade Global</div>
              <div className="my-1 text-xl font-extrabold" style={{ color: gradeCor }}>
                {dto.presente.gradeGlobal}
              </div>
              <div className="text-sm text-slate-300">
                Escore total: <span className="font-bold">{dto.presente.escoreTotal}</span>
              </div>
              {dto.presente.redFlag && (
                <div className="mt-2 flex items-center justify-center gap-1 text-xs font-bold text-red-400">
                  <AlertTriangle className="h-4 w-4" /> SINAL DE ALARME
                </div>
              )}
            </div>
            {dto.presente.alarmes.length > 0 && (
              <div className="mb-3 rounded-md border border-red-500/40 bg-red-500/10 p-2 text-xs text-red-200">
                {dto.presente.alarmes.map((a) => (
                  <div key={a.perguntaId}>{a.pergunta}</div>
                ))}
              </div>
            )}
            <div className="mb-3">
              <div className="mb-1 text-xs uppercase tracking-wide text-slate-400">Doencas vivas</div>
              <div className="flex flex-wrap gap-1">
                {dto.presente.doencas.length === 0 ? (
                  <span className="text-sm text-slate-500">Nenhuma acesa.</span>
                ) : (
                  dto.presente.doencas.map((d) => (
                    <span key={d} className="rounded bg-white/10 px-2 py-0.5 text-xs">
                      {d}
                    </span>
                  ))
                )}
              </div>
            </div>
            <div className="mb-3">
              <div className="mb-1 text-xs uppercase tracking-wide text-slate-400">Sintomas</div>
              <div className="flex flex-wrap gap-1">
                {dto.presente.sintomas.length === 0 ? (
                  <span className="text-sm text-slate-500">Nenhum.</span>
                ) : (
                  dto.presente.sintomas.map((s) => (
                    <span key={s} className="rounded bg-white/10 px-2 py-0.5 text-xs">
                      {s}
                    </span>
                  ))
                )}
              </div>
            </div>
            <div>
              <div className="mb-1 text-xs uppercase tracking-wide text-slate-400">Blocos (escore)</div>
              {dto.presente.blocos
                .filter((b) => b.escore > 0)
                .map((b) => (
                  <div key={b.bloco} className="panel-3d-sub mb-1 flex items-center justify-between rounded-md p-2 text-xs">
                    <span className="truncate">{b.bloco}</span>
                    <span className="ml-2 shrink-0 font-bold" style={{ color: GOLD_FORTE }}>
                      {b.escore}
                    </span>
                  </div>
                ))}
            </div>
          </section>

          {/* COLUNA 3 — FUTURO (accordions burros do DTO) */}
          <section className="panel-3d rounded-lg p-4">
            <div className="mb-3 flex items-center gap-2 border-b border-white/10 pb-2">
              <FileCheck2 className="h-5 w-5" style={{ color: GOLD }} />
              <h2 className="text-sm font-bold uppercase tracking-widest" style={{ color: GOLD }}>
                Futuro / Prescricao
              </h2>
            </div>
            <Accordion type="multiple" defaultValue={["exames", "injetaveis", "dieta"]} className="space-y-2">
              <BlocoFuturo id="formulas" titulo="Formulas" icon={<FlaskConical className="h-4 w-4" />} itens={dto.futuro.formulas} />
              <BlocoFuturo id="exames" titulo="Exames" icon={<ClipboardList className="h-4 w-4" />} itens={dto.futuro.exames} />
              <BlocoFuturo id="injetaveis" titulo="Injetaveis" icon={<Syringe className="h-4 w-4" />} itens={dto.futuro.injetaveis} />
              <BlocoFuturo id="implantes" titulo="Implantes" icon={<Pill className="h-4 w-4" />} itens={dto.futuro.implantes} />
              <BlocoSugestao id="dieta" titulo="Dieta" icon={<Salad className="h-4 w-4" />} sugestao={dto.futuro.dieta} campo="estiloSugerido" />
              <BlocoSugestao id="treino" titulo="Treino" icon={<Dumbbell className="h-4 w-4" />} sugestao={dto.futuro.treino} campo="divisaoSugerida" />
            </Accordion>
          </section>
        </div>
      )}

      {emitir.data && (
        <div className="panel-3d mt-4 flex flex-wrap items-center gap-4 rounded-lg p-3 text-sm">
          <span className="font-semibold" style={{ color: GOLD_FORTE }}>
            Ultima emissao:
          </span>
          <span>{emitir.data.orcamentosAprovados} orcamento(s) aprovado(s)</span>
          <span>{emitir.data.lembretes.agendados} lembrete(s) agendado(s)</span>
          <a href={emitir.data.pdfUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline" style={{ color: GOLD }}>
            <ExternalLink className="h-3 w-3" /> Abrir PDF da consulta
          </a>
        </div>
      )}
    </div>
  );
}

function BlocoFuturo({
  id,
  titulo,
  icon,
  itens,
}: {
  id: string;
  titulo: string;
  icon: React.ReactNode;
  itens: ItemFuturo[];
}) {
  return (
    <AccordionItem value={id} className="panel-3d-sub rounded-md border-0 px-3">
      <AccordionTrigger className="hover:no-underline" style={{ color: GOLD_FORTE }}>
        <span className="flex items-center gap-2">
          {icon}
          {titulo}
          <span className="rounded bg-white/10 px-1.5 text-xs text-slate-300">{itens.length}</span>
        </span>
      </AccordionTrigger>
      <AccordionContent>
        {itens.length === 0 ? (
          <div className="text-sm text-slate-500">Nada sugerido pelo Cerebro.</div>
        ) : (
          <ul className="space-y-1">
            {itens.map((it) => (
              <li key={it.id} className="flex items-center justify-between rounded bg-white/5 px-2 py-1 text-sm">
                <span>{it.nome}</span>
                {it.ref && <span className="text-xs text-slate-400">{it.ref}</span>}
              </li>
            ))}
          </ul>
        )}
      </AccordionContent>
    </AccordionItem>
  );
}

function BlocoSugestao({
  id,
  titulo,
  icon,
  sugestao,
  campo,
}: {
  id: string;
  titulo: string;
  icon: React.ReactNode;
  sugestao: Sugestao | null;
  campo: "estiloSugerido" | "divisaoSugerida";
}) {
  const detalhe = sugestao ? (sugestao[campo] ?? null) : null;
  return (
    <AccordionItem value={id} className="panel-3d-sub rounded-md border-0 px-3">
      <AccordionTrigger className="hover:no-underline" style={{ color: GOLD_FORTE }}>
        <span className="flex items-center gap-2">
          {icon}
          {titulo}
          {sugestao && <span className="rounded bg-white/10 px-1.5 text-xs text-slate-300">1</span>}
        </span>
      </AccordionTrigger>
      <AccordionContent>
        {!sugestao ? (
          <div className="text-sm text-slate-500">Nada sugerido pelo Cerebro.</div>
        ) : (
          <div className="space-y-1 text-sm">
            <div>
              <span className="text-slate-400">Objetivo: </span>
              <span className="font-semibold">{sugestao.objetivoSugerido}</span>
            </div>
            {detalhe && (
              <div>
                <span className="text-slate-400">Estilo: </span>
                <span>{detalhe}</span>
              </div>
            )}
            <div className="text-xs text-slate-400">{sugestao.justificativa}</div>
          </div>
        )}
      </AccordionContent>
    </AccordionItem>
  );
}
