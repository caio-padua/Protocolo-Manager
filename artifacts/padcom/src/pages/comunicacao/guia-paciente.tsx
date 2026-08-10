/**
 * /comunicacao/guia-paciente
 *
 * Tela ADMIN para o CEO selecionar um paciente e enviar o link
 * do Guia Digital (PWA + Telegram) por WhatsApp e/ou Telegram.
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { Send, Copy, CheckCheck, Smartphone, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { PaxterClientSelector } from "@/components/PaxterClientSelector";
import { useListClients } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";

const API_BASE  = import.meta.env.BASE_URL.replace(/\/$/, "");
const GUIA_URL  = `${window.location.origin}${import.meta.env.BASE_URL}guia-digital`.replace(/([^:])\/\//g, "$1/");

type Canal = "WHATSAPP" | "TELEGRAM";

type EnvioResult = {
  canal: Canal;
  ok: boolean;
  mensagem: string;
};

export default function GuiaPaciente() {
  const { data: clientes } = useListClients();
  const { toast } = useToast();

  const [clientId, setClientId] = useState<number | null>(null);
  const [copiado,  setCopiado]  = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [resultados, setResultados] = useState<EnvioResult[]>([]);
  const [countdown, setCountdown]   = useState(0); // segundos restantes do cooldown
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Inicia o timer de 60s de cooldown
  const iniciarCountdown = useCallback(() => {
    setCountdown(60);
    if (countdownRef.current) clearInterval(countdownRef.current);
    countdownRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(countdownRef.current!);
          countdownRef.current = null;
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  // Limpa o intervalo ao desmontar
  useEffect(() => () => { if (countdownRef.current) clearInterval(countdownRef.current); }, []);

  const clientesSelecionados = (clientes ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    cpf: c.cpf ?? undefined,
    phone: c.phone ?? undefined,
    photoUrl: c.photoUrl ?? undefined,
  }));

  const selected = clientesSelecionados.find((c) => c.id === clientId) ?? null;

  // ── Copiar link ──────────────────────────────────────────────────────────
  const copiarLink = useCallback(() => {
    navigator.clipboard.writeText(GUIA_URL).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
      toast({ title: "Link copiado!", description: "Cole no WhatsApp ou e-mail." });
    });
  }, [toast]);

  // ── Enviar guia ─────────────────────────────────────────────────────────
  async function enviar(canais: Canal[]) {
    if (!clientId || !selected || loading || countdown > 0) return;
    setLoading(true);
    setResultados([]);
    try {
      const res = await fetch(`${API_BASE}/api/onboarding/enviar-guia`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, canais, guiaUrl: GUIA_URL }),
      });

      // ── 429: disparo duplo bloqueado pelo servidor ──
      if (res.status === 429) {
        iniciarCountdown();
        toast({ title: "Guia já enviado", description: "Aguarde um momento antes de reenviar.", variant: "destructive" });
        setResultados([{ canal: canais[0], ok: false, mensagem: "Guia já enviado. Aguarde um momento." }]);
        return;
      }

      const data = await res.json() as { ok: boolean; resultados: EnvioResult[] };
      setResultados(data.resultados ?? []);
      if (data.ok) {
        iniciarCountdown(); // bloquear reenvio imediato mesmo no sucesso
        toast({ title: "Guia enviado!", description: `Enviado para ${selected.name}.` });
      } else {
        toast({ title: "Atenção", description: "Verifique os resultados abaixo.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Erro de conexão", description: "Tente novamente.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">

      {/* ── Cabeçalho ── */}
      <div className="panel-3d rounded-xl overflow-hidden">
        <div className="bg-primary px-6 py-5 flex items-center gap-3">
          <Smartphone className="w-6 h-6 text-accent" />
          <div>
            <h1 className="text-white font-black text-base uppercase tracking-widest leading-none">
              ENVIAR GUIA DIGITAL
            </h1>
            <p className="text-primary-foreground/70 text-xs mt-1">
              Selecione o paciente e envie o passo a passo de instalação (PWA + Telegram) por WhatsApp ou Telegram
            </p>
          </div>
        </div>
      </div>

      {/* ── Seletor de paciente ── */}
      <div className="panel-3d rounded-xl p-5 space-y-4">
        <div>
          <label className="block text-primary text-xs font-black uppercase tracking-widest mb-2">
            Paciente
          </label>
          <PaxterClientSelector
            clientes={clientesSelecionados}
            value={clientId}
            onChange={setClientId}
            placeholder="Selecionar cliente…"
          />
        </div>

        {/* Dados do selecionado */}
        {selected && (
          <div className="concave-3d rounded-lg p-4 space-y-1 text-sm">
            <p className="font-black text-primary uppercase tracking-wider">{selected.name}</p>
            <p className="text-muted-foreground">
              {selected.phone ? `📞 ${selected.phone}` : "⚠️ Sem telefone cadastrado"}
            </p>
            <p className="text-muted-foreground text-xs">
              {selected.cpf ? `CPF: ${selected.cpf}` : "Sem CPF"}
            </p>
          </div>
        )}
      </div>

      {/* ── Link do guia ── */}
      <div className="panel-3d rounded-xl p-5 space-y-3">
        <p className="text-primary text-xs font-black uppercase tracking-widest">Link do Guia Digital</p>

        <div className="concave-3d rounded-lg p-3 flex items-center gap-3">
          <span className="flex-1 text-xs text-muted-foreground break-all font-mono">{GUIA_URL}</span>
          <button
            onClick={copiarLink}
            className="btn-3d-soft flex items-center gap-1.5 px-3 py-2 text-xs font-black uppercase"
          >
            {copiado ? <CheckCheck className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copiado ? "Copiado!" : "Copiar"}
          </button>
        </div>

        <p className="text-muted-foreground text-xs">
          Este link abre o guia diretamente no celular do paciente. Você pode copiar e enviar manualmente pelo WhatsApp, SMS ou e-mail.
        </p>
      </div>

      {/* ── Envio automático ── */}
      {selected && (
        <div className="panel-3d rounded-xl p-5 space-y-4">
          <p className="text-primary text-xs font-black uppercase tracking-widest">Enviar automaticamente</p>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {/* WhatsApp */}
            <button
              onClick={() => enviar(["WHATSAPP"])}
              disabled={loading || !selected.phone || countdown > 0}
              className="btn-3d flex items-center justify-center gap-2 py-3 text-sm font-black uppercase tracking-wider disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {countdown > 0 ? `Aguarde ${countdown}s…` : "WhatsApp"}
            </button>

            {/* WhatsApp + Telegram */}
            <button
              onClick={() => enviar(["WHATSAPP", "TELEGRAM"])}
              disabled={loading || !selected.phone || countdown > 0}
              className="btn-3d-soft flex items-center justify-center gap-2 py-3 text-sm font-black uppercase tracking-wider disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {countdown > 0 ? `Aguarde ${countdown}s…` : "WhatsApp + Telegram"}
            </button>
          </div>

          {/* Banner de cooldown */}
          {countdown > 0 && (
            <div className="flex items-center gap-2 text-amber-700 text-xs concave-3d rounded-lg px-3 py-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              Guia já enviado. Aguarde {countdown} segundo{countdown !== 1 ? "s" : ""} antes de reenviar.
            </div>
          )}

          {!selected.phone && (
            <div className="flex items-center gap-2 text-amber-700 text-xs">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              Este paciente não tem telefone cadastrado. Cadastre o telefone no cockpit antes de enviar.
            </div>
          )}

          {/* Resultados do envio */}
          {resultados.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-border/40">
              {resultados.map((r) => (
                <div key={r.canal} className="flex items-start gap-2 text-sm">
                  {r.ok
                    ? <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                    : <AlertCircle  className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                  }
                  <span className={r.ok ? "text-emerald-700" : "text-red-600"}>
                    <strong>{r.canal}:</strong> {r.mensagem}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Preview do link ── */}
      <div className="panel-3d rounded-xl p-5">
        <p className="text-primary text-xs font-black uppercase tracking-widest mb-3">
          Prévia — o que o paciente vai receber
        </p>
        <div className="concave-3d rounded-lg p-4 text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
          {`🏥 *Instituto Pádua — Seu Guia Digital*

Olá${selected ? `, ${selected.name.split(" ")[0]}` : ""}! 👋

Preparamos um passo a passo especial para você instalar o aplicativo do Instituto Pádua no seu celular e aprender a usar o Telegram.

É bem simples! Clique no link abaixo e siga as instruções na tela:

👉 ${GUIA_URL}

Qualquer dúvida, estamos à disposição! 😊`}
        </div>
      </div>

    </div>
  );
}
