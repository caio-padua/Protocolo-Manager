import { useCallback, useEffect, useState } from "react";
import { Copy, ExternalLink, Loader2, MonitorSmartphone, Send, Smartphone, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { api, haQuanto, NAVY, OURO, MUDO } from "./util";

type Aberta = { id: number; link: string; iniciadaEm: string; ultimaAtividade: string | null; respondidas: number };
type Estado = { total: number; emAberto: Aberta | null };

/**
 * Consulta em andamento: o medico abre a nova anamnese na propria tela ou manda o link ao celular do cliente.
 * A sessao nova herda so o que nao muda; o estado atual comeca em branco.
 */
export default function NovaConsulta({ clientId, aberto, onFechar, onMudou }: { clientId: number; aberto: boolean; onFechar: () => void; onMudou: () => void }) {
  const { toast } = useToast();
  const [estado, setEstado] = useState<Estado | null>(null);
  const [ocupado, setOcupado] = useState<"" | "abrir" | "enviar" | "copiar">("");
  const [confirmaEnvio, setConfirmaEnvio] = useState(false);

  const ler = useCallback(async () => {
    try { setEstado(await api<Estado>(`/api/collaborator/anamnese/clientes/${clientId}/consulta`)); } catch { /* o painel principal ja mostra erro de acesso */ }
  }, [clientId]);
  useEffect(() => { void ler(); }, [ler, aberto]);
  // Acompanha o preenchimento enquanto a consulta esta aberta (cliente respondendo no celular).
  useEffect(() => {
    if (!estado?.emAberto) return;
    const t = setInterval(() => { void ler(); }, 15_000);
    return () => clearInterval(t);
  }, [estado?.emAberto, ler]);

  async function abrirSessao(): Promise<{ link: string; herdadas: number; retomada: boolean }> {
    const r = await api<{ link: string; herdadas: number; retomada: boolean }>(`/api/collaborator/anamnese/clientes/${clientId}/nova`, { method: "POST", body: "{}" });
    await ler(); onMudou();
    return r;
  }
  async function abrirNaTela() {
    const aba = window.open("", "_blank"); // abre antes do await: evita o bloqueio de pop-up
    setOcupado("abrir");
    try {
      const r = await abrirSessao();
      if (aba) aba.location.href = r.link; else window.location.href = r.link;
      toast({ title: r.retomada ? "Consulta retomada" : "Nova anamnese aberta", description: r.retomada ? "Já havia uma anamnese em andamento; foi reaberta." : `${r.herdadas} respostas que não mudam já vieram preenchidas.` });
    } catch (e) { aba?.close(); toast({ title: "Não foi possível abrir", description: (e as Error).message, variant: "destructive" }); }
    finally { setOcupado(""); }
  }
  async function copiar() {
    setOcupado("copiar");
    try {
      const link = estado?.emAberto?.link ?? (await abrirSessao()).link;
      await navigator.clipboard.writeText(link);
      toast({ title: "Link copiado", description: "Cole no WhatsApp ou onde preferir. Quem tem o link responde por esta anamnese." });
    } catch (e) { toast({ title: "Não foi possível copiar", description: (e as Error).message, variant: "destructive" }); }
    finally { setOcupado(""); }
  }
  async function enviar() {
    setOcupado("enviar"); setConfirmaEnvio(false);
    try {
      if (!estado?.emAberto) await abrirSessao();
      const r = await api<{ status: string; erro: string | null }>(`/api/collaborator/anamnese/clientes/${clientId}/enviar-link`, { method: "POST", body: "{}" });
      toast({ title: r.status === "aceito" ? "Link enviado ao celular" : "Envio não confirmado", description: r.erro ?? "O Telegram do cliente aceitou a mensagem." });
    } catch (e) { toast({ title: "Não foi possível enviar", description: (e as Error).message, variant: "destructive" }); }
    finally { setOcupado(""); }
  }

  const a = estado?.emAberto ?? null;
  const pct = a && estado ? Math.min(100, Math.round((a.respondidas / Math.max(1, estado.total)) * 100)) : 0;
  if (!aberto && !a) return null;

  return (
    <div className="panel-3d-active p-4 space-y-3" data-testid="nova-consulta">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-bold uppercase tracking-[0.14em]" style={{ color: NAVY }}>
            {a ? "Anamnese da consulta em andamento" : "Nova anamnese na consulta"}
          </div>
          <p className="mt-1 text-[12px]" style={{ color: MUDO }}>
            {a
              ? `Iniciada ${haQuanto(a.iniciadaEm)}. O cliente responde só o que muda; o que não muda já veio preenchido.`
              : "O que não muda (identidade, cirurgias, alergias, família) vem preenchido da anamnese anterior. O estado atual vem em branco, para o cliente responder agora."}
          </p>
        </div>
        {!a && <button type="button" onClick={onFechar} aria-label="Fechar" className="rounded p-1 hover:bg-black/5"><X className="h-4 w-4" style={{ color: MUDO }} /></button>}
      </div>

      {a && estado && (
        <div className="concave-3d px-3 py-2">
          <div className="flex items-center justify-between text-[12px]" style={{ color: NAVY }}>
            <span className="font-semibold">{a.respondidas} de {estado.total} perguntas com resposta</span>
            <span className="font-bold" style={{ color: OURO }}>{pct}%</span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full" style={{ background: "#e7e0cc" }}>
            <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: OURO }} />
          </div>
          <div className="mt-1 text-[11px]" style={{ color: MUDO }}>
            {a.ultimaAtividade ? `Última resposta ${haQuanto(a.ultimaAtividade)}. ` : ""}Atualiza sozinho a cada 15 segundos.
          </div>
        </div>
      )}

      <div className="grid gap-2 sm:grid-cols-3">
        <button type="button" disabled={!!ocupado} onClick={() => void abrirNaTela()} className="btn-3d flex items-center justify-center gap-2 rounded-md px-3 py-2.5 text-[12px] font-semibold uppercase tracking-wide" data-testid="anamnese-abrir-tela">
          {ocupado === "abrir" ? <Loader2 className="h-4 w-4 animate-spin" /> : <MonitorSmartphone className="h-4 w-4" />}
          {a ? "Abrir na minha tela" : "Responder aqui comigo"}
        </button>
        <button type="button" disabled={!!ocupado} onClick={() => setConfirmaEnvio(true)} className="btn-3d-soft flex items-center justify-center gap-2 rounded-md px-3 py-2.5 text-[12px] font-semibold uppercase tracking-wide" data-testid="anamnese-enviar-celular">
          {ocupado === "enviar" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Smartphone className="h-4 w-4" />}
          Enviar ao celular dela
        </button>
        <button type="button" disabled={!!ocupado} onClick={() => void copiar()} className="btn-3d-soft flex items-center justify-center gap-2 rounded-md px-3 py-2.5 text-[12px] font-semibold uppercase tracking-wide">
          {ocupado === "copiar" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />}
          Copiar link
        </button>
      </div>

      {confirmaEnvio && (
        <div className="concave-3d flex flex-wrap items-center gap-3 px-3 py-2.5" role="alertdialog" aria-label="Confirmar envio">
          <Send className="h-4 w-4 shrink-0" style={{ color: OURO }} />
          <span className="min-w-[200px] flex-1 text-[12px]" style={{ color: NAVY }}>
            Isto envia agora uma mensagem ao Telegram do cliente, com o link desta anamnese. Confirmar?
          </span>
          <button type="button" className="btn-3d-soft rounded-md px-3 py-1.5 text-[11px] font-semibold uppercase" onClick={() => setConfirmaEnvio(false)}>Cancelar</button>
          <button type="button" className="btn-3d rounded-md px-3 py-1.5 text-[11px] font-semibold uppercase" onClick={() => void enviar()}>Enviar agora</button>
        </div>
      )}
      {a && (
        <a href={a.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] underline" style={{ color: MUDO }}>
          <ExternalLink className="h-3 w-3" /> Reabrir esta anamnese
        </a>
      )}
    </div>
  );
}
