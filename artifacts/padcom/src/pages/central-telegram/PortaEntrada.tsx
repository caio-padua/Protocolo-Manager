import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Loader2, QrCode } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { getCollabToken } from "@/lib/collab-auth";

interface Painel {
  bot?: { usuario: string; link: string };
  canalAtivo: boolean | null;
  webhook: { consultado: boolean; saudavel: boolean; pendentes: number } | null;
  vinculados: number | null;
  modos?: { atendimentoIa: string; atendimentoLista: number };
}
const api = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;

const MODO: Record<string, string> = {
  desligado: "Desligado: ninguém é atendido pela assistente",
  lista: "Lista: só clientes autorizados são atendidos pela assistente",
  ligado: "Ligado: qualquer pessoa é atendida pela assistente",
};

/**
 * Porta de entrada do bot. O número de celular da clínica no Telegram é uma conta pessoal e não pode ser ligado
 * a um bot; o caminho oficial é o link/QR do bot, que abre a conversa e inicia o atendimento.
 */
export default function PortaEntrada() {
  const [copiado, setCopiado] = useState(false);
  const q = useQuery<Painel>({
    queryKey: ["central-telegram-porta"],
    retry: false,
    refetchInterval: 60_000,
    queryFn: async ({ signal }) => {
      const r = await fetch(`${api}/telegram-inbox/painel-operacional`, { signal, headers: { Authorization: `Bearer ${getCollabToken() ?? ""}` } });
      if (!r.ok) throw new Error("painel");
      return r.json();
    },
  });
  const bot = q.data?.bot;
  const texto = bot
    ? `Olá! Para falar com o Instituto Pádua pelo Telegram, toque neste link e depois em INICIAR: ${bot.link}`
    : "";
  const copiar = async () => {
    try { await navigator.clipboard.writeText(texto); setCopiado(true); toast.success("Convite copiado."); setTimeout(() => setCopiado(false), 2500); }
    catch { toast.error("Não foi possível copiar."); }
  };
  const webhookOk = q.data?.webhook?.consultado && q.data.webhook.saudavel;
  const linhas: Array<[string, string]> = q.data ? [
    ["Recebimento do Telegram", q.data.webhook == null || !q.data.webhook.consultado ? "Não foi possível consultar agora" : webhookOk ? "Funcionando, sem mensagens paradas" : "Com problema: veja a Central de Auditoria"],
    ["Clientes com Telegram vinculado", q.data.vinculados == null ? "Não foi possível consultar" : String(q.data.vinculados)],
    ["Atendimento da assistente", q.data.modos ? `${MODO[q.data.modos.atendimentoIa] ?? q.data.modos.atendimentoIa}${q.data.modos.atendimentoIa === "lista" ? ` (${q.data.modos.atendimentoLista} autorizados)` : ""}` : "Não foi possível consultar"],
  ] : [];
  return (
    <section className="panel-3d-sub p-4" aria-label="Porta de entrada do Telegram" data-testid="porta-entrada-telegram">
      <h2 className="mb-1 flex items-center gap-2 text-lg font-black"><QrCode className="h-5 w-5" /> Porta de entrada do bot</h2>
      <p className="mb-3 text-xs text-muted-foreground">Mostre este QR ou envie o convite. A pessoa abre o bot, toca em INICIAR e a conversa começa. Cliente novo recebe as instruções de vínculo.</p>
      {q.isLoading && <p className="flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</p>}
      {q.isError && <p role="alert" className="text-sm font-semibold text-red-700">Não foi possível carregar a porta de entrada. Tente novamente.</p>}
      {bot && (
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
          <div className="shrink-0 rounded-[6px] bg-white p-2"><QRCodeSVG value={bot.link} size={132} /></div>
          <div className="w-full min-w-0 flex-1 space-y-3">
            <p className="break-all text-sm"><strong>@{bot.usuario}</strong> · <a className="underline" href={bot.link} target="_blank" rel="noopener noreferrer">{bot.link}</a></p>
            <button type="button" onClick={copiar} className="btn-3d inline-flex h-9 items-center gap-2 px-3 text-[11px] font-bold">
              {copiado ? <Check className="h-4 w-4" /> : null} COPIAR CONVITE
            </button>
            <dl className="bevel-3d divide-y divide-border/30 p-3 text-xs">
              {linhas.map(([k, v]) => (
                <div key={k} className="flex flex-col gap-0.5 py-1.5 first:pt-0 last:pb-0 sm:flex-row sm:gap-3">
                  <dt className="font-bold sm:w-56 sm:shrink-0">{k}</dt><dd className="min-w-0 flex-1">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      )}
    </section>
  );
}
