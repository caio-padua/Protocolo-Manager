import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getCollabToken } from "@/lib/collab-auth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { PaxterClientSelector } from "@/components/PaxterClientSelector";
import { Field, Metric, type Receita } from "./shared";
import TiposDeDieta from "./TiposDeDieta";
import Receitas from "./Receitas";
import ListaDeCompras from "./ListaDeCompras";
import {
  Salad,
  Plus,
  Trash2,
  Flame,
  Clock,
  Inbox,
  CheckCircle2,
  XCircle,
  FileText,
  Loader2,
  Mail,
  History,
  Download,
  Send,
  AlertCircle,
  SendHorizontal,
  Eye,
  BookOpen,
  ShoppingCart,
  Utensils,
  Info,
} from "lucide-react";

// -------------------------------------------------------------------------------
// ORGAO DIETA — ONDA A do Master Loop Paxter.
// Montador de cardapio TDAH-friendly: parametros -> conta TDEE ao vivo ->
// tabela de refeicoes (carro-chefe) -> salva prescricao. Fila de Indicacao
// mostra o que o Cerebro (motor) sugeriu e ainda aguarda validacao humana.
// -------------------------------------------------------------------------------
const FATOR_ATIVIDADE: Record<string, number> = {
  sedentario: 1.2,
  leve: 1.375,
  moderado: 1.55,
  intenso: 1.725,
  atleta: 1.9,
};
const FATOR_OBJETIVO: Record<string, number> = {
  emagrecimento: 0.8,
  longevidade: 0.95,
  manutencao: 1.0,
  hipertrofia: 1.15,
};

const REFEICOES = [
  { key: "cafe_manha", label: "Café da manhã", hora: "08:00" },
  { key: "lanche_manha", label: "Lanche da manhã", hora: "10:30" },
  { key: "almoco", label: "Almoço", hora: "13:00" },
  { key: "lanche_tarde", label: "Lanche da tarde", hora: "16:00" },
  { key: "jantar", label: "Jantar", hora: "20:00" },
  { key: "ceia", label: "Ceia", hora: "22:00" },
];

interface Alimento {
  id: number;
  codigo: string;
  nome: string;
  grupo: string | null;
  porcaoPadraoG: number | null;
  kcal100g: number | null;
  proteinaG100g: number | null;
  carboidratoG100g: number | null;
  gorduraG100g: number | null;
}
interface Cliente {
  id: number;
  name: string;
}
interface ItemLinha {
  uid: string;
  refeicao: string;
  horario: string;
  alimentoId: number | null;
  quantidadeG: number | null;
}

const round = (n: number) => Math.round(n);
const round1 = (n: number) => Math.round(n * 10) / 10;
const fmt = (n: number | null | undefined, sufixo = "") =>
  n === null || n === undefined || Number.isNaN(n) ? "—" : `${round1(n)}${sufixo}`;

function toMin(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}
function dentroDaJanela(hora: string, ini: string, fim: string): boolean {
  const h = toMin(hora);
  const i = toMin(ini);
  const f = toMin(fim);
  if (h === null || i === null || f === null) return true;
  if (i === f) return true;
  return i < f ? h >= i && h <= f : h >= i || h <= f;
}

export default function DietaPage() {
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <div className="flex items-center gap-3">
          <span className="bevel-3d flex h-11 w-11 items-center justify-center text-primary">
            <Salad className="h-6 w-6" />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Órgão Dieta
            </h1>
            <p className="text-sm text-muted-foreground">
              Montagem de cardápio com cálculo de calorias, macros e jejum intermitente
            </p>
          </div>
        </div>
      </header>

      <Tabs defaultValue="montar" className="space-y-5">
        <TabsList className="bevel-3d flex-wrap h-auto">
          <TabsTrigger value="montar">Montar cardápio</TabsTrigger>
          <TabsTrigger value="fila">Fila de indicação</TabsTrigger>
          <TabsTrigger value="historico">Histórico de Planos</TabsTrigger>
          <TabsTrigger value="tipos" className="gap-1.5">
            <Utensils className="h-3.5 w-3.5" /> Tipos de Dieta
          </TabsTrigger>
          <TabsTrigger value="receitas" className="gap-1.5">
            <BookOpen className="h-3.5 w-3.5" /> Receitas
          </TabsTrigger>
          <TabsTrigger value="compras" className="gap-1.5">
            <ShoppingCart className="h-3.5 w-3.5" /> Lista de Compras
          </TabsTrigger>
        </TabsList>

        <TabsContent value="montar">
          <MontarCardapio />
        </TabsContent>
        <TabsContent value="fila">
          <FilaIndicacao />
        </TabsContent>
        <TabsContent value="historico">
          <HistoricoPlanos />
        </TabsContent>
        <TabsContent value="tipos">
          <TiposDeDieta />
        </TabsContent>
        <TabsContent value="receitas">
          <Receitas />
        </TabsContent>
        <TabsContent value="compras">
          <ListaDeCompras />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function MontarCardapio() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: clientes } = useQuery<Cliente[]>({
    queryKey: ["dieta", "clientes"],
    queryFn: async () => {
      const r = await fetch("/api/clients");
      if (!r.ok) throw new Error("Falha ao carregar clientes");
      const d = await r.json();
      return Array.isArray(d) ? d : (d.data ?? []);
    },
  });

  const { data: alimentos } = useQuery<Alimento[]>({
    queryKey: ["dieta", "alimentos"],
    queryFn: async () => {
      const r = await fetch("/api/dieta/catalogo/alimentos");
      if (!r.ok) throw new Error("Falha ao carregar alimentos");
      return r.json();
    },
  });

  const alimentoById = useMemo(
    () => new Map((alimentos ?? []).map((a) => [a.id, a])),
    [alimentos],
  );

  const [clientId, setClientId] = useState<number | null>(null);
  // Ref atualizada SINCRONAMENTE no handler de troca de cliente.
  // Permite que onSuccess verifique se o cliente mudou durante geração assíncrona do PDF.
  const clientIdRef = useRef<number | null>(null);

  const [objetivo, setObjetivo] = useState("emagrecimento");
  const [peso, setPeso] = useState("");
  const [altura, setAltura] = useState("");
  const [idade, setIdade] = useState("");
  const [sexo, setSexo] = useState("M");
  const [atividade, setAtividade] = useState("moderado");
  const [jejum, setJejum] = useState(false);
  const [janelaIni, setJanelaIni] = useState("12:00");
  const [janelaFim, setJanelaFim] = useState("20:00");
  const [itens, setItens] = useState<ItemLinha[]>([]);

  // --- Inserir receita ---
  const [showReceitaPicker, setShowReceitaPicker] = useState(false);
  const [receitaPickerId, setReceitaPickerId] = useState<number | null>(null);
  const [receitaPickerRefeicao, setReceitaPickerRefeicao] = useState("almoco");
  const [receitaPickerPorcoes, setReceitaPickerPorcoes] = useState(1);
  // Filtro de receitas por tipo de dieta do paciente
  const [filtrarPorProtocolo, setFiltrarPorProtocolo] = useState(true);

  // Busca a prescrição ativa do cliente selecionado para descobrir o protocoloId
  const { data: prescricoesCliente } = useQuery<Array<{ id: number; status: string; protocoloId: number | null }>>({
    queryKey: ["dieta", "prescricoes-cliente", clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const r = await fetch(`/api/dieta/prescricoes?clientId=${clientId}`);
      if (!r.ok) return [];
      return r.json();
    },
  });

  const protocoloIdDoCliente = useMemo(() => {
    if (!prescricoesCliente) return null;
    const ativa = prescricoesCliente.find((p) => p.status === "ativa" && p.protocoloId);
    return ativa?.protocoloId ?? null;
  }, [prescricoesCliente]);

  // Protocolo efetivo para filtrar receitas (null = mostrar todas)
  const protocoloFiltroEfetivo = filtrarPorProtocolo && protocoloIdDoCliente ? protocoloIdDoCliente : null;

  const { data: receitas } = useQuery<Receita[]>({
    queryKey: ["dieta", "receitas", protocoloFiltroEfetivo],
    queryFn: async () => {
      const url = protocoloFiltroEfetivo
        ? `/api/dieta/receitas?protocoloId=${protocoloFiltroEfetivo}`
        : "/api/dieta/receitas";
      const r = await fetch(url);
      if (!r.ok) throw new Error("Falha ao carregar receitas");
      return r.json();
    },
  });

  function inserirReceita() {
    const receita = (receitas ?? []).find((r) => r.id === receitaPickerId);
    if (!receita) return;
    const ref = REFEICOES.find((r) => r.key === receitaPickerRefeicao);
    const horaMeal = ref?.hora ?? "13:00";
    const escala = receitaPickerPorcoes / (receita.porcoes || 1);
    const novas: ItemLinha[] = receita.ingredientes.map((ing) => ({
      uid: crypto.randomUUID(),
      refeicao: receitaPickerRefeicao,
      horario: horaMeal,
      alimentoId: ing.alimentoId,
      quantidadeG: Math.round(ing.quantidadeG * escala),
    }));
    setItens((prev) => [...prev, ...novas]);
    setShowReceitaPicker(false);
    setReceitaPickerId(null);
    setReceitaPickerPorcoes(1);

    // Warn immediately if IF is active and this meal falls outside the window
    const foraJanelaAgora =
      jejum && !dentroDaJanela(horaMeal, janelaIni, janelaFim);
    if (foraJanelaAgora) {
      toast({
        title: "⚠️ Refeição fora do jejum",
        description: `${receita.nome} foi adicionada em "${ref?.label ?? receitaPickerRefeicao}" (${horaMeal}), que está fora da janela ${janelaIni}–${janelaFim}. Ajuste o horário ou a janela para liberar o salvamento.`,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Receita inserida",
        description: `${receita.nome} — ${novas.length} ingrediente(s) adicionado(s) ao cardápio.`,
      });
    }
  }

  // --- Emissão de PDF ---
  const [caloriasAlvo, setCaloriasAlvo] = useState("");
  const [estiloAlimentar, setEstiloAlimentar] = useState("");
  const [enviarEmail, setEnviarEmail] = useState(false);

  // --- Passo de confirmação de e-mail (preview → confirm) ---
  const [pendingEmail, setPendingEmail] = useState<{
    pdfBase64: string;
    clientId: number;
    nomePaciente: string;
    caloriasAlvo: number;
    estiloAlimentar?: string;
    usedFallbackDownload?: boolean;
  } | null>(null);
  // Checkbox obrigatório quando o PDF foi baixado (popup bloqueado)
  const [reviewedFallback, setReviewedFallback] = useState(false);
  // Resetar o checkbox sempre que o painel de confirmação mudar
  useEffect(() => { setReviewedFallback(false); }, [pendingEmail]);

  // --- Handler síncrono de troca de cliente ---
  // Atualiza a ref ANTES de qualquer await, garantindo que onSuccess do emitirPdf
  // sempre compare contra o cliente corrente mesmo em race conditions.
  function handleClientChange(newId: number | null) {
    clientIdRef.current = newId; // síncrono — antes do setState e de qualquer re-render
    setClientId(newId);
    // Reativar o filtro de receitas por protocolo para o novo cliente
    setFiltrarPorProtocolo(true);
    // Limpar a receita selecionada para evitar seleção inválida com o novo filtro
    setReceitaPickerId(null);
    if (pendingEmail !== null) {
      setPendingEmail(null);
      toast({
        title: "Envio pendente cancelado",
        description: "O cliente foi alterado. O painel de confirmação foi descartado.",
      });
    }
  }

  // ---- Conta TDEE ao vivo (espelha o backend) ----
  const conta = useMemo(() => {
    const p = parseFloat(peso.replace(",", "."));
    const a = parseFloat(altura.replace(",", "."));
    const i = parseInt(idade, 10);
    if (!p || !a || !i) return { tmb: null, tdee: null, meta: null };
    const base = 10 * p + 6.25 * a - 5 * i;
    const tmb = sexo === "F" ? base - 161 : base + 5;
    const tdee = tmb * (FATOR_ATIVIDADE[atividade] ?? 1.55);
    const meta = tdee * (FATOR_OBJETIVO[objetivo] ?? 1.0);
    return { tmb: round(tmb), tdee: round(tdee), meta: round(meta) };
  }, [peso, altura, idade, sexo, atividade, objetivo]);

  // ---- Macros de cada linha + totais ----
  const linhasCalc = useMemo(() => {
    return itens.map((it) => {
      const al = it.alimentoId ? alimentoById.get(it.alimentoId) : undefined;
      const g = it.quantidadeG ?? 0;
      const f = g / 100;
      const kcal = al?.kcal100g != null ? al.kcal100g * f : null;
      const prot = al?.proteinaG100g != null ? al.proteinaG100g * f : null;
      const carb = al?.carboidratoG100g != null ? al.carboidratoG100g * f : null;
      const gord = al?.gorduraG100g != null ? al.gorduraG100g * f : null;
      const foraJanela = jejum && it.horario ? !dentroDaJanela(it.horario, janelaIni, janelaFim) : false;
      return { ...it, al, kcal, prot, carb, gord, foraJanela };
    });
  }, [itens, alimentoById, jejum, janelaIni, janelaFim]);

  const totais = useMemo(() => {
    return linhasCalc.reduce(
      (acc, l) => ({
        kcal: acc.kcal + (l.kcal ?? 0),
        prot: acc.prot + (l.prot ?? 0),
        carb: acc.carb + (l.carb ?? 0),
        gord: acc.gord + (l.gord ?? 0),
      }),
      { kcal: 0, prot: 0, carb: 0, gord: 0 },
    );
  }, [linhasCalc]);

  const algumForaJanela = linhasCalc.some((l) => l.foraJanela);
  const pctMeta = conta.meta ? Math.min(150, round((totais.kcal / conta.meta) * 100)) : null;

  function addLinha(refeicao = "almoco", hora = "13:00") {
    setItens((prev) => [
      ...prev,
      { uid: crypto.randomUUID(), refeicao, horario: hora, alimentoId: null, quantidadeG: null },
    ]);
  }
  function updLinha(uid: string, patch: Partial<ItemLinha>) {
    setItens((prev) => prev.map((it) => (it.uid === uid ? { ...it, ...patch } : it)));
  }
  function delLinha(uid: string) {
    setItens((prev) => prev.filter((it) => it.uid !== uid));
  }

  const salvar = useMutation({
    mutationFn: async () => {
      const body = {
        clientId: clientId ?? 0,
        objetivo,
        pesoKg: peso ? parseFloat(peso.replace(",", ".")) : null,
        alturaCm: altura ? parseFloat(altura.replace(",", ".")) : null,
        idade: idade ? parseInt(idade, 10) : null,
        sexo,
        nivelAtividade: atividade,
        jejumIntermitente: jejum,
        jejumJanelaInicio: jejum ? janelaIni : null,
        jejumJanelaFim: jejum ? janelaFim : null,
        status: "ativa" as const,
        itens: itens
          .filter((it) => it.alimentoId)
          .map((it, idx) => ({
            refeicao: it.refeicao,
            horario: it.horario || null,
            ordem: idx + 1,
            alimentoId: it.alimentoId,
            quantidadeG: it.quantidadeG,
          })),
      };
      const r = await fetch("/api/dieta/prescricoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || "Falha ao salvar prescrição");
      }
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Prescrição salva", description: "O cardápio foi gravado com sucesso." });
      qc.invalidateQueries({ queryKey: ["dieta"] });
      setItens([]);
    },
    onError: (e: Error) => {
      toast({ title: "Não foi possível salvar", description: e.message, variant: "destructive" });
    },
  });

  const podeSalvar = clientId && itens.some((it) => it.alimentoId) && !algumForaJanela;

  // --- Mutation: emitir PDF ---
  // FLUXO COM E-MAIL: gera o PDF → abre em nova aba → exibe painel de confirmação.
  // O e-mail SÓ é disparado quando o CEO clica "Confirmar envio" (ver confirmarEnvio abaixo).
  // NOTE: pdfWin é aberto SINCRONO (antes do fetch) para não ser bloqueado por popup blocker.
  const pdfWinRef = useRef<Window | null>(null);

  const emitirPdf = useMutation({
    mutationFn: async () => {
      const p = parseFloat(peso.replace(",", "."));
      const a = parseFloat(altura.replace(",", "."));
      const i = parseInt(idade, 10);
      if (!p || !a || !i) throw new Error("Preencha Peso, Altura e Idade antes de emitir.");
      if (enviarEmail && !clientId) throw new Error("Selecione um cliente para poder enviar por e-mail.");

      // Abre aba em branco AGORA (user activation), antes do await longo
      pdfWinRef.current = window.open("about:blank", "_blank");

      const kcalAlvo = caloriasAlvo ? parseFloat(caloriasAlvo.replace(",", ".")) : null;
      const body: Record<string, unknown> = {
        sexo,
        objetivo,
        pesoKg: p,
        alturaCm: a,
        idade: i,
        nivelAtividade: atividade,
        enviarEmail: false, // Nunca envia aqui — CEO revisa primeiro
      };
      if (clientId) body.clientId = clientId;
      if (kcalAlvo) body.caloriasAlvo = kcalAlvo;
      if (estiloAlimentar.trim()) body.estiloAlimentar = estiloAlimentar.trim();

      // Garante que fetch nunca fica pendurado indefinidamente —
      // servidor aborta em 120 s (DIETA_PDF_TIMEOUT_MS), cliente em 125 s.
      const CLIENT_TIMEOUT_MS = 125_000;
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), CLIENT_TIMEOUT_MS);

      let r: Response;
      try {
        r = await fetch("/api/dieta/emitir-pdf", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: ac.signal,
        });
        clearTimeout(timer);
      } catch (fetchErr) {
        clearTimeout(timer);
        pdfWinRef.current?.close();
        if (fetchErr instanceof Error && fetchErr.name === "AbortError") {
          throw new Error("Timeout ao gerar plano nutricional — tente novamente.");
        }
        throw fetchErr;
      }

      if (!r.ok) {
        pdfWinRef.current?.close();
        const err = await r.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error || "Falha ao gerar o plano nutricional.");
      }

      // Verificar se a imagem de assinatura falhou ao ser embutida (cabeçalho do servidor)
      const signatureImageFailed = r.headers.get("X-Signature-Image-Failed") === "true";

      // Resposta é sempre o PDF binário (enviarEmail: false)
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      let usedFallbackDownload = false;
      if (pdfWinRef.current && !pdfWinRef.current.closed) {
        pdfWinRef.current.location.href = url;
      } else {
        // Fallback: download programático (popup bloqueado ou aba fechada pelo usuário)
        usedFallbackDownload = true;
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = "PlanoNutricional.pdf";
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
      }
      setTimeout(() => URL.revokeObjectURL(url), 30_000);

      // Se o CEO marcou "Enviar por e-mail", converter o blob para base64 e aguardar confirmação
      let pdfBase64: string | null = null;
      if (enviarEmail && clientId) {
        const buf = await blob.arrayBuffer();
        const bytes = new Uint8Array(buf);
        let bin = "";
        for (const b of bytes) bin += String.fromCharCode(b);
        pdfBase64 = btoa(bin);
      }

      return {
        pdfBase64,
        clientId,
        nomePaciente: clientes?.find((c) => c.id === clientId)?.name ?? "Paciente",
        caloriasAlvo: kcalAlvo ?? p * 25,
        estiloAlimentar: estiloAlimentar.trim() || undefined,
        querEnviarEmail: enviarEmail && !!clientId,
        usedFallbackDownload,
        signatureImageFailed,
      };
    },
    onSuccess: (result) => {
      const desc = result.usedFallbackDownload
        ? "O plano nutricional foi baixado para o seu computador."
        : "O plano nutricional foi aberto em nova aba para revisão.";
      toast({ title: "PDF gerado!", description: desc });
      if (result.signatureImageFailed) {
        toast({
          title: "Atenção: imagem de assinatura não carregada",
          description: "A assinatura do médico está cadastrada, mas não foi possível embutir a imagem no PDF. O rodapé exibe linha tracejada para assinatura manuscrita.",
          variant: "destructive",
        });
      }
      // Atualiza o Histórico de Planos imediatamente (mesmo que a aba já esteja montada)
      qc.invalidateQueries({ queryKey: ["dieta", "planos-emitidos"] });
      if (result.querEnviarEmail && result.pdfBase64 && result.clientId) {
        if (result.clientId === clientIdRef.current) {
          // Exibir painel de confirmação de envio apenas se o cliente não mudou
          // durante a geração assíncrona do PDF (guarda contra race condition).
          setPendingEmail({
            pdfBase64: result.pdfBase64,
            clientId: result.clientId!,
            nomePaciente: result.nomePaciente,
            caloriasAlvo: result.caloriasAlvo,
            estiloAlimentar: result.estiloAlimentar,
            usedFallbackDownload: result.usedFallbackDownload,
          });
        } else {
          // O CEO trocou de cliente enquanto o PDF era gerado — descartar silenciosamente.
          toast({
            title: "Envio pendente cancelado",
            description: "O cliente foi alterado durante a geração do PDF. O envio foi descartado.",
          });
        }
      }
    },
    onError: (e: Error) => {
      toast({ title: "Não foi possível emitir", description: e.message, variant: "destructive" });
    },
  });

  // --- Mutation: confirmar envio do e-mail após revisão ---
  const confirmarEnvio = useMutation({
    mutationFn: async () => {
      if (!pendingEmail) throw new Error("Nenhum PDF pendente de envio.");
      const r = await fetch("/api/dieta/enviar-pdf-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: pendingEmail.clientId,
          pdfBase64: pendingEmail.pdfBase64,
          nomePaciente: pendingEmail.nomePaciente,
          caloriasAlvo: pendingEmail.caloriasAlvo,
          estiloAlimentar: pendingEmail.estiloAlimentar,
        }),
      });
      const json = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((json as { error?: string }).error || "Falha ao enviar o e-mail.");
      return json as { ok: boolean; emailDestino?: string; email?: { success: boolean; error?: string } };
    },
    onSuccess: (result) => {
      setPendingEmail(null);
      const entrega = result.email;
      if (entrega && entrega.success === false) {
        toast({
          title: "E-mail falhou",
          description: entrega.error ?? "Não foi possível entregar o e-mail ao paciente.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Plano enviado!",
          description: `E-mail enviado para ${result.emailDestino ?? pendingEmail?.nomePaciente}.`,
        });
      }
    },
    onError: (e: Error) => {
      toast({ title: "Não foi possível enviar", description: e.message, variant: "destructive" });
    },
  });

  const podeEmitir =
    !emitirPdf.isPending &&
    !!peso.trim() &&
    !!altura.trim() &&
    !!idade.trim() &&
    (!enviarEmail || !!clientId);

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[340px_1fr]">
      {/* ----- Coluna de parametros ----- */}
      <div className="space-y-5">
        <div className="panel-3d p-4 space-y-4">
          <h2 className="text-[11px] font-black uppercase tracking-widest text-primary">
            Cliente e objetivo
          </h2>
          <div className="space-y-3">
            <Field label="Cliente">
              <PaxterClientSelector
                clientes={clientes ?? []}
                value={clientId}
                onChange={handleClientChange}
                placeholder="Selecionar cliente…"
              />
            </Field>
            <Field label="Objetivo">
              <Select value={objetivo} onValueChange={setObjetivo}>
                <SelectTrigger className="field-engraved">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="emagrecimento">Emagrecimento (déficit 20%)</SelectItem>
                  <SelectItem value="longevidade">Longevidade (déficit leve 5%)</SelectItem>
                  <SelectItem value="manutencao">Manutenção</SelectItem>
                  <SelectItem value="hipertrofia">Hipertrofia (superávit 15%)</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
        </div>

        <div className="panel-3d p-4 space-y-4">
          <h2 className="text-[11px] font-black uppercase tracking-widest text-primary">
            Antropometria e atividade
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Peso (kg)">
              <Input value={peso} onChange={(e) => setPeso(e.target.value)} inputMode="decimal" placeholder="—" className="field-engraved" />
            </Field>
            <Field label="Altura (cm)">
              <Input value={altura} onChange={(e) => setAltura(e.target.value)} inputMode="decimal" placeholder="—" className="field-engraved" />
            </Field>
            <Field label="Idade">
              <Input value={idade} onChange={(e) => setIdade(e.target.value)} inputMode="numeric" placeholder="—" className="field-engraved" />
            </Field>
            <Field label="Sexo">
              <Select value={sexo} onValueChange={setSexo}>
                <SelectTrigger className="field-engraved">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="M">Masculino</SelectItem>
                  <SelectItem value="F">Feminino</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field label="Nível de atividade">
            <Select value={atividade} onValueChange={setAtividade}>
              <SelectTrigger className="field-engraved">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sedentario">Sedentário (x1,2)</SelectItem>
                <SelectItem value="leve">Leve (x1,375)</SelectItem>
                <SelectItem value="moderado">Moderado (x1,55)</SelectItem>
                <SelectItem value="intenso">Intenso (x1,725)</SelectItem>
                <SelectItem value="atleta">Atleta (x1,9)</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>

        {/* ----- Jejum intermitente ----- */}
        <div className="panel-3d p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-[11px] font-black uppercase tracking-widest text-primary">
              Jejum intermitente
            </h2>
            <button
              type="button"
              role="switch"
              aria-checked={jejum}
              onClick={() => setJejum((v) => !v)}
              className={`relative h-6 w-11 rounded-full border transition-colors ${
                jejum ? "bg-primary border-primary" : "bg-muted border-border"
              }`}
            >
              <span
                className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${
                  jejum ? "left-[22px]" : "left-0.5"
                }`}
              />
            </button>
          </div>
          {jejum && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Janela início">
                <Input type="time" value={janelaIni} onChange={(e) => setJanelaIni(e.target.value)} className="field-engraved" />
              </Field>
              <Field label="Janela fim">
                <Input type="time" value={janelaFim} onChange={(e) => setJanelaFim(e.target.value)} className="field-engraved" />
              </Field>
            </div>
          )}
        </div>

        {/* ----- Painel de calorias ao vivo ----- */}
        <div className="screen-3d p-4 space-y-3">
          <h2 className="text-[11px] font-black uppercase tracking-widest text-primary flex items-center gap-2">
            <Flame className="h-3.5 w-3.5" /> Energia (ao vivo)
          </h2>
          <div className="grid grid-cols-3 gap-2 text-center">
            <Metric label="TMB" value={fmt(conta.tmb)} unit="kcal" />
            <Metric label="TDEE" value={fmt(conta.tdee)} unit="kcal" />
            <Metric label="Meta" value={fmt(conta.meta)} unit="kcal" gold />
          </div>
          <div className="space-y-1.5">
            <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              <span>Cardápio: {fmt(totais.kcal)} kcal</span>
              <span>{pctMeta != null ? `${pctMeta}% da meta` : "—"}</span>
            </div>
            <div className="concave-3d h-3 overflow-hidden rounded-full">
              <div
                className={`h-full rounded-full transition-all ${
                  pctMeta != null && pctMeta > 110 ? "bg-amber-500" : "bg-primary"
                }`}
                style={{ width: `${Math.min(100, pctMeta ?? 0)}%` }}
              />
            </div>
            <div className="grid grid-cols-3 gap-2 pt-1 text-center text-[11px]">
              <span className="text-muted-foreground">P: <b className="text-foreground">{fmt(totais.prot, " g")}</b></span>
              <span className="text-muted-foreground">C: <b className="text-foreground">{fmt(totais.carb, " g")}</b></span>
              <span className="text-muted-foreground">G: <b className="text-foreground">{fmt(totais.gord, " g")}</b></span>
            </div>
          </div>
        </div>
      </div>

      {/* ----- Coluna do cardapio (tabela = carro-chefe) ----- */}
      <div className="space-y-4">
        {algumForaJanela && (
          <div className="panel-3d-sub border-l-4 border-amber-500 p-3 text-sm font-bold text-amber-700">
            Há refeições fora da janela de jejum ({janelaIni}–{janelaFim}). Ajuste o horário para salvar.
          </div>
        )}

        <div className="panel-3d overflow-hidden">
          <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
            <h2 className="text-[11px] font-black uppercase tracking-widest text-primary">
              Cardápio do dia
            </h2>
            <span className="concave-3d px-3 py-1 text-[10px] font-black uppercase tracking-widest text-primary">
              {itens.length} {itens.length === 1 ? "linha" : "linhas"}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-primary/5 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  <th className="px-3 py-2 text-left">Refeição</th>
                  <th className="px-3 py-2 text-left">Hora</th>
                  <th className="px-3 py-2 text-left">Alimento</th>
                  <th className="px-3 py-2 text-right">Qtd (g)</th>
                  <th className="px-3 py-2 text-right">kcal</th>
                  <th className="px-3 py-2 text-right">P</th>
                  <th className="px-3 py-2 text-right">C</th>
                  <th className="px-3 py-2 text-right">G</th>
                  <th className="px-2 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {linhasCalc.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-3 py-10 text-center text-sm text-muted-foreground">
                      Nenhum alimento ainda. Clique em “Adicionar alimento” para montar o cardápio.
                    </td>
                  </tr>
                ) : (
                  linhasCalc.map((l) => (
                    <tr
                      key={l.uid}
                      className={`border-t border-border/40 align-middle ${
                        l.foraJanela ? "bg-amber-500/10" : ""
                      }`}
                    >
                      <td className="px-3 py-1.5">
                        <Select value={l.refeicao} onValueChange={(v) => {
                          const ref = REFEICOES.find((r) => r.key === v);
                          updLinha(l.uid, { refeicao: v, horario: ref?.hora ?? l.horario });
                        }}>
                          <SelectTrigger className="field-engraved h-8 min-w-[130px] text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {REFEICOES.map((r) => (
                              <SelectItem key={r.key} value={r.key}>{r.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-3 py-1.5">
                        <Input type="time" value={l.horario} onChange={(e) => updLinha(l.uid, { horario: e.target.value })} className="field-engraved h-8 w-[96px] text-xs" />
                      </td>
                      <td className="px-3 py-1.5">
                        <Select value={l.alimentoId ? String(l.alimentoId) : ""} onValueChange={(v) => {
                          const al = alimentoById.get(Number(v));
                          updLinha(l.uid, { alimentoId: Number(v), quantidadeG: l.quantidadeG ?? al?.porcaoPadraoG ?? 100 });
                        }}>
                          <SelectTrigger className="field-engraved h-8 min-w-[200px] text-xs"><SelectValue placeholder="Escolher alimento" /></SelectTrigger>
                          <SelectContent className="max-h-72">
                            {(alimentos ?? []).map((a) => (
                              <SelectItem key={a.id} value={String(a.id)}>
                                {a.nome} <span className="text-muted-foreground">· {a.grupo}</span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        <Input
                          inputMode="numeric"
                          value={l.quantidadeG ?? ""}
                          onChange={(e) => updLinha(l.uid, { quantidadeG: e.target.value ? Number(e.target.value) : null })}
                          className="field-engraved h-8 w-[72px] text-right text-xs ml-auto"
                          placeholder="—"
                        />
                      </td>
                      <td className="px-3 py-1.5 text-right font-bold text-foreground">{fmt(l.kcal)}</td>
                      <td className="px-3 py-1.5 text-right text-muted-foreground">{fmt(l.prot)}</td>
                      <td className="px-3 py-1.5 text-right text-muted-foreground">{fmt(l.carb)}</td>
                      <td className="px-3 py-1.5 text-right text-muted-foreground">{fmt(l.gord)}</td>
                      <td className="px-2 py-1.5 text-center">
                        <button type="button" onClick={() => delLinha(l.uid)} aria-label="Remover" className="text-muted-foreground hover:text-red-500">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {linhasCalc.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-primary/30 bg-primary/5 text-sm font-black">
                    <td className="px-3 py-2 uppercase tracking-widest text-[10px] text-primary" colSpan={4}>Total do dia</td>
                    <td className="px-3 py-2 text-right text-primary">{fmt(totais.kcal)}</td>
                    <td className="px-3 py-2 text-right">{fmt(totais.prot)}</td>
                    <td className="px-3 py-2 text-right">{fmt(totais.carb)}</td>
                    <td className="px-3 py-2 text-right">{fmt(totais.gord)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-border/60 px-4 py-3">
            <Button variant="outline" size="sm" className="bevel-3d" onClick={() => addLinha()}>
              <Plus className="mr-1 h-4 w-4" /> Adicionar alimento
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="bevel-3d gap-1.5"
              onClick={() => setShowReceitaPicker((v) => !v)}
            >
              <BookOpen className="h-3.5 w-3.5" />
              {showReceitaPicker ? "Cancelar receita" : "Inserir receita"}
            </Button>
            <span className="text-[11px] text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" /> A refeição já vem com o horário sugerido; ajuste se precisar.
            </span>
          </div>

          {/* ----- Painel de inserção de receita ----- */}
          {showReceitaPicker && (
            <div className="concave-3d mx-4 mb-4 p-3 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  Inserir receita no cardápio
                </span>
                {protocoloIdDoCliente && (
                  <button
                    type="button"
                    onClick={() => {
                      setFiltrarPorProtocolo((v) => !v);
                      setReceitaPickerId(null);
                    }}
                    className={`flex items-center gap-1 rounded px-2 py-0.5 text-[9px] font-black uppercase tracking-widest transition-colors ${
                      filtrarPorProtocolo
                        ? "bevel-3d text-primary"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                    title={filtrarPorProtocolo ? "Clique para ver todas as receitas" : "Clique para filtrar pelo tipo de dieta do paciente"}
                  >
                    <Info className="h-3 w-3" />
                    {filtrarPorProtocolo ? "Filtrado pelo tipo de dieta" : "Todas as receitas"}
                  </button>
                )}
              </div>
              <div className="flex flex-wrap items-end gap-3">
                {/* Receita */}
                <div className="flex-1 min-w-[200px] space-y-1">
                  <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Receita</span>
                  <Select
                    value={receitaPickerId ? String(receitaPickerId) : ""}
                    onValueChange={(v) => setReceitaPickerId(Number(v))}
                  >
                    <SelectTrigger className="field-engraved h-8 text-xs">
                      <SelectValue placeholder="Selecionar receita…" />
                    </SelectTrigger>
                    <SelectContent className="max-h-72">
                      {(receitas ?? []).map((r) => (
                        <SelectItem key={r.id} value={String(r.id)}>
                          {r.nome}
                          {r.tipos.length > 0 && (
                            <span className="text-muted-foreground ml-1">· {r.tipos.map((t) => t.nome).join(", ")}</span>
                          )}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Refeição */}
                <div className="min-w-[150px] space-y-1">
                  <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Refeição</span>
                  <Select value={receitaPickerRefeicao} onValueChange={setReceitaPickerRefeicao}>
                    <SelectTrigger className="field-engraved h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {REFEICOES.map((r) => (
                        <SelectItem key={r.key} value={r.key}>{r.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Porções */}
                <div className="w-24 space-y-1">
                  <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Porções</span>
                  <input
                    type="number"
                    min={0.5}
                    step={0.5}
                    value={receitaPickerPorcoes}
                    onChange={(e) => setReceitaPickerPorcoes(Math.max(0.5, Number(e.target.value) || 1))}
                    className="field-engraved h-8 w-full rounded px-2 text-xs text-right"
                  />
                </div>

                {/* Botão inserir */}
                <Button
                  size="sm"
                  className="btn-3d gap-1.5 shrink-0"
                  disabled={!receitaPickerId}
                  onClick={inserirReceita}
                >
                  <Plus className="h-3.5 w-3.5" /> Inserir
                </Button>
              </div>

              {/* Preview dos ingredientes da receita selecionada */}
              {receitaPickerId && (() => {
                const rec = (receitas ?? []).find((r) => r.id === receitaPickerId);
                if (!rec) return null;
                const escala = receitaPickerPorcoes / (rec.porcoes || 1);
                return (
                  <div className="text-[11px] text-muted-foreground">
                    <span className="font-bold text-foreground">{rec.ingredientes.length} ingrediente(s)</span>
                    {" · "}{rec.porcoes} porção(ões) base
                    {escala !== 1 && <span className="text-primary font-bold"> → ×{escala.toFixed(2)} (escala)</span>}
                    <span className="ml-2 text-muted-foreground/70">
                      {rec.ingredientes.map((i) => `${i.alimentoNome ?? `#${i.alimentoId}`} ${Math.round(i.quantidadeG * escala)} g`).join(" · ")}
                    </span>
                  </div>
                );
              })()}
            </div>
          )}
        </div>

        <div className="flex justify-end">
          <Button
            className="btn-3d-soft"
            disabled={!podeSalvar || salvar.isPending}
            onClick={() => salvar.mutate()}
          >
            {salvar.isPending ? "Salvando…" : "Salvar prescrição"}
          </Button>
        </div>

        {/* ---- Painel: Emitir Plano Nutricional PDF ---- */}
        <div className="panel-3d p-4 space-y-4">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            <h2 className="text-[11px] font-black uppercase tracking-widest text-primary">
              Emitir Plano Nutricional PDF
            </h2>
          </div>

          <p className="text-[12px] text-muted-foreground">
            Gera um plano alimentar completo via IA (Claude) com cardápio semanal, suplementação e tabela de acompanhamento.
            Usa os dados antropométricos já preenchidos — confirme antes de emitir.
          </p>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Calorias alvo (opcional)">
              <Input
                value={caloriasAlvo}
                onChange={(e) => setCaloriasAlvo(e.target.value)}
                inputMode="decimal"
                placeholder="Calculado automaticamente"
                className="field-engraved"
              />
            </Field>
            <Field label="Estilo alimentar (opcional)">
              <Input
                value={estiloAlimentar}
                onChange={(e) => setEstiloAlimentar(e.target.value)}
                placeholder="Ex.: mediterrânea, low-carb…"
                className="field-engraved"
              />
            </Field>
          </div>

          {/* Revisão dos parâmetros usados */}
          <div className="screen-3d px-3 py-2 text-[11px] text-muted-foreground leading-relaxed">
            <span className="font-black text-foreground">Parâmetros:</span>{" "}
            {peso ? `${peso} kg` : <span className="text-amber-600 font-bold">peso ausente</span>}
            {" · "}
            {altura ? `${altura} cm` : <span className="text-amber-600 font-bold">altura ausente</span>}
            {" · "}
            {idade ? `${idade} anos` : <span className="text-amber-600 font-bold">idade ausente</span>}
            {" · "}{sexo === "M" ? "Masculino" : "Feminino"}
            {" · "}{atividade}
            {" · "}{objetivo}
          </div>

          <label className="flex cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              checked={enviarEmail}
              onChange={(e) => setEnviarEmail(e.target.checked)}
              className="h-4 w-4 rounded border-border accent-primary"
            />
            <span className="flex items-center gap-1.5 text-sm text-foreground">
              <Mail className="h-4 w-4 text-primary" />
              Enviar por e-mail para o paciente após gerar
            </span>
          </label>

          {!emitirPdf.isPending && (!peso.trim() || !altura.trim() || !idade.trim()) && (
            <p className="text-[11px] text-amber-600 font-bold">
              Preencha Peso, Altura e Idade na coluna esquerda para habilitar.
            </p>
          )}
          {!emitirPdf.isPending && enviarEmail && !clientId && peso.trim() && altura.trim() && idade.trim() && (
            <p className="text-[11px] text-amber-600 font-bold">
              Selecione um cliente para poder enviar o plano por e-mail.
            </p>
          )}

          <div className="flex items-center gap-3">
            <Button
              className="btn-3d"
              disabled={!podeEmitir || !!pendingEmail}
              onClick={() => emitirPdf.mutate()}
            >
              {emitirPdf.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Gerando plano…
                </>
              ) : (
                <>
                  <FileText className="mr-2 h-4 w-4" />
                  {enviarEmail ? "Gerar PDF para Revisão" : "Gerar e Emitir Plano"}
                </>
              )}
            </Button>
          </div>

          {emitirPdf.isPending && (
            <div className="panel-3d-sub border-l-4 border-primary/60 px-4 py-3 flex items-start gap-3">
              <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-primary" />
              <div className="space-y-0.5">
                <p className="text-[12px] font-bold text-foreground">
                  Gerando plano nutricional com IA — pode levar até 2 minutos.
                </p>
                <p className="text-[11px] text-muted-foreground">
                  O Claude está montando cardápio semanal, suplementação e tabela de acompanhamento. Aguarde sem fechar a aba.
                </p>
              </div>
            </div>
          )}

          {/* ---- Painel de confirmação de e-mail (aparece após revisão do PDF) ---- */}
          {pendingEmail && (
            <div className="panel-3d-sub border-l-4 border-primary p-4 space-y-3">
              <div className="flex items-center gap-2">
                {pendingEmail.usedFallbackDownload
                  ? <Download className="h-4 w-4 text-primary" aria-label="PDF baixado" />
                  : <Eye className="h-4 w-4 text-primary" aria-label="PDF aberto em nova aba" />}
                <span className="text-[11px] font-black uppercase tracking-widest text-primary">
                  Revisar e confirmar envio
                </span>
              </div>
              <p className="text-sm text-foreground">
                {pendingEmail.usedFallbackDownload
                  ? <>O PDF foi <span className="font-bold">baixado</span> para o seu computador (popup bloqueado pelo navegador). Revise o arquivo e, quando estiver pronto:</>
                  : <>O PDF foi aberto em nova aba para revisão.</>}{" "}
                <span className="font-bold">Enviar para {pendingEmail.nomePaciente}?</span>
              </p>
              {pendingEmail.usedFallbackDownload && (
                <p className="text-[11px] text-muted-foreground">
                  Plano: <span className="font-bold text-foreground">{pendingEmail.caloriasAlvo} kcal</span>
                  {pendingEmail.estiloAlimentar ? <> · {pendingEmail.estiloAlimentar}</> : null}
                </p>
              )}
              {pendingEmail.usedFallbackDownload && (
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={reviewedFallback}
                    onChange={(e) => setReviewedFallback(e.target.checked)}
                    className="h-4 w-4 rounded accent-primary"
                  />
                  <span className="text-sm text-foreground">Já revisei o arquivo baixado</span>
                </label>
              )}
              <div className="flex items-center gap-2">
                <Button
                  className="btn-3d"
                  disabled={confirmarEnvio.isPending || (!!pendingEmail.usedFallbackDownload && !reviewedFallback)}
                  onClick={() => confirmarEnvio.mutate()}
                >
                  {confirmarEnvio.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Enviando…
                    </>
                  ) : (
                    <>
                      <SendHorizontal className="mr-2 h-4 w-4" />
                      Confirmar envio
                    </>
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={confirmarEnvio.isPending}
                  onClick={() => setPendingEmail(null)}
                >
                  Cancelar
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FilaIndicacao() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data, isLoading, isError } = useQuery<Array<Record<string, unknown>>>({
    queryKey: ["dieta", "indicacoes", "pendente"],
    queryFn: async () => {
      const r = await fetch("/api/dieta/indicacoes?status=pendente");
      if (!r.ok) throw new Error("Falha ao carregar fila");
      return r.json();
    },
  });

  const descartar = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`/api/dieta/indicacoes/${id}/descartar`, { method: "POST" });
      if (!r.ok) throw new Error("Falha ao descartar");
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Indicação descartada" });
      qc.invalidateQueries({ queryKey: ["dieta", "indicacoes"] });
    },
  });

  if (isLoading) return <Skeleton className="h-40 w-full" />;
  if (isError)
    return (
      <div className="panel-3d-sub border-l-4 border-red-500 p-4 text-sm font-bold text-red-600">
        Não foi possível carregar a fila de indicação.
      </div>
    );

  const rows = data ?? [];
  if (rows.length === 0)
    return (
      <div className="panel-3d flex flex-col items-center justify-center gap-2 p-12 text-center">
        <Inbox className="h-10 w-10 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">
          Nenhuma indicação de dieta aguardando validação. O Cérebro escreve aqui ao analisar a anamnese.
        </p>
      </div>
    );

  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <div key={String(r.id)} className="panel-3d border-l-4 border-primary p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="concave-3d px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-primary">
                  #{String(r.id)}
                </span>
                <span className="font-bold text-foreground">{String(r.clientName ?? "—")}</span>
                {r.escore != null && (
                  <span className="rounded bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary">
                    Escore {String(r.escore)}
                  </span>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                {String(r.objetivoSugerido ?? "—")}
                {r.estiloSugerido ? ` · ${String(r.estiloSugerido)}` : ""}
              </p>
              {r.justificativa ? (
                <p className="text-[13px] text-foreground/80">{String(r.justificativa)}</p>
              ) : null}
            </div>
            <div className="flex shrink-0 gap-2">
              <Button variant="outline" size="sm" className="bevel-3d" disabled>
                <CheckCircle2 className="mr-1 h-4 w-4" /> Prescrever
              </Button>
              <Button variant="ghost" size="sm" onClick={() => descartar.mutate(Number(r.id))}>
                <XCircle className="mr-1 h-4 w-4" /> Descartar
              </Button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

interface PlanoEmitido {
  id: number;
  clienteId: number;
  nomePaciente: string;
  objetivo: string | null;
  estrategia: string | null;
  caloriasAlvo: number | null;
  pesoKg: number | null;
  alturaCm: number | null;
  emailDestino: string | null;
  emailEnviado: boolean;
  temPdf: boolean;
  pdfExpirado: boolean;
  pdfBytes: number | null;
  emitidoEm: string;
}
function HistoricoPlanos() {
  const { toast } = useToast();
  const [clienteId, setClienteId] = useState<number | null>(null);

  const { data: clientes } = useQuery<Cliente[]>({
    queryKey: ["dieta", "clientes"],
    queryFn: async () => {
      const r = await fetch("/api/clients");
      if (!r.ok) throw new Error("Falha ao carregar clientes");
      const d = await r.json();
      return Array.isArray(d) ? d : (d.data ?? []);
    },
  });

  const {
    data: planos,
    isLoading,
    isError,
    refetch,
  } = useQuery<PlanoEmitido[]>({
    queryKey: ["dieta", "planos-emitidos", clienteId],
    queryFn: async () => {
      if (!clienteId) return [];
      const token = getCollabToken();
      const r = await fetch(`/api/dieta/planos-emitidos?clienteId=${clienteId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!r.ok) throw new Error("Falha ao carregar histórico");
      return r.json();
    },
    enabled: !!clienteId,
  });

  // Estado do painel de reenvio com override de e-mail (task #219)
  const [reenviarModal, setReenviarModal] = useState<{
    plano: PlanoEmitido;
    email: string;
  } | null>(null);
  const [reenviando, setReenviando] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);

  async function handleDownload(plano: PlanoEmitido) {
    const token = getCollabToken();
    try {
      const r = await fetch(`/api/dieta/planos-emitidos/${plano.id}/pdf`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error((d as { error?: string }).error ?? "Falha ao baixar PDF");
      }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `PlanoNutricional_${plano.nomePaciente.replace(/\s+/g, "_")}_${plano.id}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e: unknown) {
      toast({ title: "Erro ao baixar PDF", description: (e as Error).message, variant: "destructive" });
    }
  }

  function openReenviarPanel(plano: PlanoEmitido) {
    setReenviarModal({ plano, email: plano.emailDestino ?? "" });
    setEmailError(null);
  }

  async function handleConfirmarReenvio() {
    if (!reenviarModal) return;
    const email = reenviarModal.email.trim();

    // Validação básica de e-mail
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
      setEmailError("Informe um e-mail válido antes de confirmar o envio.");
      return;
    }
    setEmailError(null);
    setReenviando(true);
    try {
      const token = getCollabToken();
      const r = await fetch(`/api/dieta/planos-emitidos/${reenviarModal.plano.id}/reenviar`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ email }),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) {
        throw new Error(d.error ?? "Falha ao reenviar");
      }
      toast({ title: "E-mail reenviado", description: `Plano enviado para ${email}` });
      setReenviarModal(null);
      refetch();
    } catch (e: unknown) {
      toast({ title: "Erro ao reenviar", description: (e as Error).message, variant: "destructive" });
    } finally {
      setReenviando(false);
    }
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  function formatBytes(b: number | null) {
    if (!b) return "—";
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
    return `${(b / (1024 * 1024)).toFixed(1)} MB`;
  }

  return (
    <div className="space-y-5">
      {/* Seletor de cliente */}
      <div className="panel-3d p-4 max-w-sm">
        <h2 className="mb-3 text-[11px] font-black uppercase tracking-widest text-primary">
          Selecionar paciente
        </h2>
        <PaxterClientSelector
          clientes={clientes ?? []}
          value={clienteId}
          onChange={setClienteId}
          placeholder="Selecionar cliente…"
        />
      </div>

      {!clienteId && (
        <div className="panel-3d flex flex-col items-center justify-center gap-2 p-12 text-center">
          <History className="h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">
            Selecione um paciente para ver os planos nutricionais já emitidos.
          </p>
        </div>
      )}

      {clienteId && isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="panel-3d h-24 animate-pulse bg-primary/5" />
          ))}
        </div>
      )}

      {clienteId && isError && (
        <div className="panel-3d border-l-4 border-red-500 p-4 flex items-center gap-3 text-sm font-bold text-red-600">
          <AlertCircle className="h-5 w-5 shrink-0" />
          Não foi possível carregar o histórico de planos.
        </div>
      )}

      {clienteId && !isLoading && !isError && (planos ?? []).length === 0 && (
        <div className="panel-3d flex flex-col items-center justify-center gap-2 p-12 text-center">
          <FileText className="h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">
            Nenhum plano nutricional emitido para este paciente ainda.
          </p>
        </div>
      )}

      {(planos ?? []).length > 0 && (
        <div className="panel-3d overflow-hidden">
          <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
            <h2 className="text-[11px] font-black uppercase tracking-widest text-primary flex items-center gap-2">
              <History className="h-3.5 w-3.5" />
              Planos emitidos — {(planos ?? []).length} {(planos ?? []).length === 1 ? "registro" : "registros"}
            </h2>
          </div>

          {/* Aviso de imutabilidade — documento jurídico congelado no momento da emissão */}
          <div className="flex items-start gap-2 bg-amber-500/8 border-b border-amber-500/20 px-4 py-2.5">
            <Info className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-600" />
            <p className="text-[11px] text-amber-700 leading-relaxed">
              Cada PDF é um documento imutável gerado no momento da emissão. Nome, CRM e dados do médico refletem o cadastro <b>naquela data</b> e não são atualizados retroativamente.
            </p>
          </div>

          <div className="divide-y divide-border/40">
            {(planos ?? []).map((p) => (
              <div key={p.id}>
                <div className="flex items-start justify-between gap-4 px-4 py-4">
                  {/* Lado esquerdo: info */}
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="concave-3d px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-primary">
                        #{p.id}
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        {formatDate(p.emitidoEm)}
                      </span>
                      {p.emailEnviado ? (
                        <span className="flex items-center gap-1 rounded bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                          <CheckCircle2 className="h-3 w-3" /> E-mail enviado
                        </span>
                      ) : (
                        <span className="rounded bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                          Sem e-mail
                        </span>
                      )}
                      {p.pdfExpirado ? (
                        <span className="rounded bg-orange-500/10 px-2 py-0.5 text-[10px] font-bold text-orange-700">
                          PDF expirado
                        </span>
                      ) : !p.temPdf ? (
                        <span className="rounded bg-red-500/10 px-2 py-0.5 text-[10px] font-bold text-red-700">
                          PDF indisponível
                        </span>
                      ) : null}
                    </div>

                    <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-sm">
                      {p.objetivo && (
                        <span className="text-muted-foreground">
                          <b className="text-foreground">Objetivo:</b> {p.objetivo}
                        </span>
                      )}
                      {p.caloriasAlvo && (
                        <span className="text-muted-foreground">
                          <b className="text-foreground">Meta:</b> {p.caloriasAlvo} kcal/dia
                        </span>
                      )}
                      {p.pesoKg && (
                        <span className="text-muted-foreground">
                          <b className="text-foreground">Peso:</b> {p.pesoKg} kg
                        </span>
                      )}
                      {p.estrategia && (
                        <span className="text-muted-foreground">
                          <b className="text-foreground">Estratégia:</b> {p.estrategia}
                        </span>
                      )}
                    </div>

                    {p.emailDestino && (
                      <p className="text-[11px] text-muted-foreground truncate max-w-xs">
                        {p.emailDestino}
                        {p.pdfBytes ? <span className="ml-2 opacity-60">· {formatBytes(p.pdfBytes)}</span> : null}
                      </p>
                    )}
                  </div>

                  {/* Lado direito: ações — ocultos quando PDF expirado */}
                  <div className="flex shrink-0 gap-2">
                    {p.temPdf && !p.pdfExpirado && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="bevel-3d gap-1.5"
                        onClick={() => handleDownload(p)}
                      >
                        <Download className="h-3.5 w-3.5" />
                        Baixar PDF
                      </Button>
                    )}
                    {p.temPdf && !p.pdfExpirado && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="bevel-3d gap-1.5"
                        disabled={reenviando && reenviarModal?.plano.id === p.id}
                        onClick={() =>
                          reenviarModal?.plano.id === p.id
                            ? setReenviarModal(null)
                            : openReenviarPanel(p)
                        }
                      >
                        <Send className="h-3.5 w-3.5" />
                        {reenviando && reenviarModal?.plano.id === p.id
                          ? "Enviando…"
                          : reenviarModal?.plano.id === p.id
                          ? "Cancelar"
                          : "Reenviar"}
                      </Button>
                    )}
                  </div>
                </div>

                {/* Painel inline de confirmação / override de e-mail */}
                {reenviarModal?.plano.id === p.id && (
                  <div className="mx-4 mb-4 panel-3d-sub border-l-4 border-primary p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-primary" />
                      <span className="text-[11px] font-black uppercase tracking-widest text-primary">
                        Confirmar destinatário e reenviar
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Confirme ou altere o e-mail de destino. O histórico registrará o endereço utilizado.
                    </p>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                        E-mail de destino
                      </label>
                      <Input
                        type="email"
                        className="field-engraved"
                        placeholder="paciente@exemplo.com"
                        value={reenviarModal.email}
                        onChange={(e) => {
                          setReenviarModal((prev) => prev ? { ...prev, email: e.target.value } : prev);
                          setEmailError(null);
                        }}
                        disabled={reenviando}
                      />
                      {emailError && (
                        <p className="text-[11px] font-bold text-red-600 flex items-center gap-1">
                          <AlertCircle className="h-3 w-3" /> {emailError}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        className="btn-3d gap-1.5"
                        disabled={reenviando}
                        onClick={handleConfirmarReenvio}
                      >
                        {reenviando ? (
                          <>
                            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Enviando…
                          </>
                        ) : (
                          <>
                            <SendHorizontal className="h-3.5 w-3.5" /> Confirmar envio
                          </>
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={reenviando}
                        onClick={() => setReenviarModal(null)}
                      >
                        Cancelar
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
