/**
 * /comunicacao/guia-paciente
 *
 * Tela ADMIN para o CEO selecionar um paciente e enviar o link
 * do Guia Digital (PWA + Telegram) por WhatsApp e/ou Telegram.
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Send, Copy, CheckCheck, Smartphone, Loader2, AlertCircle, CheckCircle2, MessageCircle, Key, RefreshCw } from "lucide-react";
import { PaxterClientSelector } from "@/components/PaxterClientSelector";
import { useListClients } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { getCollabToken } from "@/lib/collab-auth";
const API_BASE    = import.meta.env.BASE_URL.replace(/\/$/, "");

// VITE_SITE_URL é OBRIGATÓRIA em produção (ex: "https://app.padcon.com.br").
// Fallback para window.location.origin foi REMOVIDO: no Replit development ela
// produz uma URL efêmera que muda a cada reinício — o link enviado ao paciente quebraria.
const _siteBase = import.meta.env.VITE_SITE_URL
  ?? import.meta.env.VITE_AREA_URL?.replace(/\/area\/?$/, "")
  ?? null;
const GUIA_BASE: string = _siteBase
  ? `${_siteBase}${import.meta.env.BASE_URL}guia-digital`.replace(/([^:])\/\//g, "$1/")
  : "⚠️ [VITE_SITE_URL NÃO CONFIGURADA — obrigatória antes do lançamento]";

// ── Config da empresa logada (para gerar link com ?tenant=slug) ───────────────
interface MinhaConfig { slug: string | null; clinicaNome: string; }

function useMinhaConfig(): MinhaConfig {
  const [cfg, setCfg] = useState<MinhaConfig>({ slug: null, clinicaNome: "Instituto Pádua" });
  useEffect(() => {
    fetch(`${API_BASE}/api/onboarding/minha-config`)
      .then((r) => r.ok ? r.json() as Promise<MinhaConfig> : Promise.reject())
      .then((d) => setCfg({ slug: d.slug ?? null, clinicaNome: d.clinicaNome || "Instituto Pádua" }))
      .catch(() => {/* usa fallback silenciosamente */});
  }, []);
  return cfg;
}

// ── Badge de status Telegram ──────────────────────────────────────────────────
type TgStatus = { vinculado: boolean; desde: string | null };

type ActivationResult = {
  codigo: string;
  emailEnviado: boolean;
  mensagem: string;
};
function TelegramStatusBadge({ clientId }: { clientId: number }) {
  const { toast } = useToast();
  const [status,    setStatus]    = useState<TgStatus | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [erro,      setErro]      = useState(false);
  const [tick,      setTick]      = useState(0);

  // Activation flow
  const [activating,       setActivating]       = useState(false);
  const [activationResult, setActivationResult] = useState<ActivationResult | null>(null);
  const [noEmailWarning,   setNoEmailWarning]   = useState(false);
  const [countdown,        setCountdown]        = useState(0);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const authHeaders = useCallback((): Record<string, string> => {
    const token = getCollabToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, []);

  const recheck = useCallback(() => setTick((t) => t + 1), []);

  const fetchStatus = useCallback(() => {
    setLoading(true);
    setErro(false);
    fetch(`${API_BASE}/api/clientes/${clientId}/telegram-status`, {
      headers: authHeaders(),
    })
      .then((r) => r.ok ? r.json() as Promise<TgStatus> : Promise.reject(r.status))
      .then((d) => setStatus(d))
      .catch(() => setErro(true))
      .finally(() => setLoading(false));
  }, [clientId, authHeaders]);

  useEffect(() => {
    setStatus(null);
    setActivationResult(null);
    setNoEmailWarning(false);
    setCountdown(0);
    if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
    fetchStatus();
  }, [clientId, tick, fetchStatus]);

  useEffect(() => () => { if (countdownRef.current) clearInterval(countdownRef.current); }, []);

  const iniciarCountdown30 = useCallback(() => {
    setCountdown(30);
    if (countdownRef.current) clearInterval(countdownRef.current);
    countdownRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(countdownRef.current!);
          countdownRef.current = null;
          setActivationResult(null);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  const gerarSenha = useCallback(async () => {
    if (activating) return;
    setActivating(true);
    setNoEmailWarning(false);
    try {
      const res = await fetch(`${API_BASE}/api/clients/${clientId}/activate-telegram`, {
        method: "POST",
        headers: authHeaders(),
      });

      if (res.status === 409) {
        // Já vinculado — atualiza o badge para verde
        recheck();
        return;
      }

      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        toast({
          title: "Erro ao gerar senha",
          description: body.error ?? `Erro ${res.status} — tente novamente`,
          variant: "destructive",
        });
        return;
      }

      const data = await res.json() as ActivationResult;
      setActivationResult(data);
      if (!data.emailEnviado) setNoEmailWarning(true);
      iniciarCountdown30();
    } catch {
      toast({
        title: "Falha de conexão",
        description: "Não foi possível gerar a senha. Verifique sua conexão e tente novamente.",
        variant: "destructive",
      });
    } finally {
      setActivating(false);
    }
  }, [clientId, activating, authHeaders, recheck, iniciarCountdown30, toast]);

  const RefreshBtn = () => (
    <button
      type="button"
      onClick={recheck}
      disabled={loading}
      title="Verificar novamente"
      className="ml-1 opacity-50 hover:opacity-100 transition-opacity disabled:cursor-not-allowed"
    >
      <RefreshCw size={11} className={loading ? "animate-spin" : ""} />
    </button>
  );

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground/70">
        <span className="paxter-led" />
        <span>Verificando status do Telegram…</span>
      </div>
    );
  }

  if (erro) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground/50">
        <span className="paxter-led" />
        <span>Não foi possível verificar</span>
        <RefreshBtn />
      </div>
    );
  }

  if (!status) return null;

  if (status.vinculado) {
    const desde = status.desde
      ? new Date(status.desde).toLocaleDateString("pt-BR")
      : null;
    return (
      <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700">
        <span className="paxter-led paxter-led-green flex-shrink-0" />
        <span>Telegram vinculado{desde ? ` desde ${desde}` : ""}</span>
        <RefreshBtn />
      </div>
    );
  }

  // ── Estado âmbar: não vinculado ──
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs font-semibold text-amber-600">
        <span className="paxter-led paxter-led-amber paxter-led-breathe flex-shrink-0" />
        <span>Ainda não vinculou ao Telegram</span>
        <RefreshBtn />
      </div>

      {/* Botão de ativação */}
      {!activationResult && (
        <button
          onClick={gerarSenha}
          disabled={activating}
          className="btn-3d-soft flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest"
        >
          {activating
            ? <Loader2 className="w-3 h-3 animate-spin" />
            : <Key className="w-3 h-3" />}
          {activating ? "Gerando…" : "Gerar Senha de Ativação"}
        </button>
      )}

      {/* Resultado da ativação */}
      {activationResult && (
        <div className="concave-3d rounded-lg p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/60">
              Senha de Ativação
            </span>
            {countdown > 0 && (
              <span className="text-[9px] text-muted-foreground/50">{countdown}s</span>
            )}
          </div>
          <p className="font-mono text-sm font-black text-primary tracking-widest">
            {activationResult.codigo}
          </p>

          {activationResult.emailEnviado ? (
            <div className="flex items-center gap-1.5 text-[10px] text-emerald-700 font-semibold">
              <CheckCircle2 className="w-3 h-3 flex-shrink-0" />
              <span>E-mail enviado para o paciente</span>
            </div>
          ) : noEmailWarning ? (
            <div className="flex items-start gap-1.5 text-[10px] text-amber-600 font-semibold">
              <AlertCircle className="w-3 h-3 flex-shrink-0 mt-px" />
              <span>Paciente sem e-mail cadastrado — repasse o código acima diretamente ao paciente</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-[10px] text-amber-600 font-semibold">
              <AlertCircle className="w-3 h-3 flex-shrink-0" />
              <span>E-mail não enviado — repasse o código ao paciente</span>
            </div>
          )}

          <button
            onClick={gerarSenha}
            disabled={activating}
            className="btn-3d-soft flex items-center gap-1.5 px-2 py-1 text-[9px] font-black uppercase tracking-widest"
          >
            <Key className="w-2.5 h-2.5" />
            Regerar senha
          </button>
        </div>
      )}
    </div>
  );
}

type Canal = "WHATSAPP" | "TELEGRAM";

type EnvioResult = {
  canal: Canal;
  ok: boolean;
  mensagem: string;
};

export default function GuiaPaciente() {
  const { data: clientes } = useListClients();
  const { toast } = useToast();
  const { slug, clinicaNome } = useMinhaConfig();

  // Link do guia — inclui ?tenant=slug para multi-clínica quando disponível
  const guiaUrl = slug
    ? `${GUIA_BASE}?tenant=${encodeURIComponent(slug)}`
    : GUIA_BASE;

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
    navigator.clipboard.writeText(guiaUrl).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
      toast({ title: "Link copiado!", description: "Cole no WhatsApp ou e-mail." });
    });
  }, [guiaUrl, toast]);

  // ── Enviar guia ─────────────────────────────────────────────────────────
  async function enviar(canais: Canal[]) {
    if (!clientId || !selected || loading || countdown > 0) return;
    setLoading(true);
    setResultados([]);
    try {
      const res = await fetch(`${API_BASE}/api/onboarding/enviar-guia`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, canais, guiaUrl }),
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

        {/* Dados do selecionado + badge Telegram */}
        {selected && (
          <div className="concave-3d rounded-lg p-4 space-y-3 text-sm">
            <div className="space-y-1">
              <p className="font-black text-primary uppercase tracking-wider">{selected.name}</p>
              <p className="text-muted-foreground">
                {selected.phone ? `📞 ${selected.phone}` : "⚠️ Sem telefone cadastrado"}
              </p>
              <p className="text-muted-foreground text-xs">
                {selected.cpf ? `CPF: ${selected.cpf}` : "Sem CPF"}
              </p>
            </div>
            {/* Badge de status Telegram — atualiza ao trocar de cliente */}
            <div className="border-t border-border/30 pt-2">
              <div className="flex items-center gap-1.5 mb-1.5">
                <MessageCircle size={10} className="text-muted-foreground/50" />
                <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/60">
                  Canal Telegram
                </span>
              </div>
              <TelegramStatusBadge clientId={selected.id} />
            </div>
          </div>
        )}
      </div>

      {/* ── Link do guia ── */}
      <div className="panel-3d rounded-xl p-5 space-y-3">
        <p className="text-primary text-xs font-black uppercase tracking-widest">Link do Guia Digital</p>

        <div className="concave-3d rounded-lg p-3 flex items-center gap-3">
          <span className="flex-1 text-xs text-muted-foreground break-all font-mono">{guiaUrl}</span>
          <button
            onClick={copiarLink}
            className="btn-3d-soft flex items-center gap-1.5 px-3 py-2 text-xs font-black uppercase"
          >
            {copiado ? <CheckCheck className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copiado ? "Copiado!" : "Copiar"}
          </button>
        </div>

        {/* ── Mini QR para conferência do CEO ── */}
        {slug && (
          <div className="flex items-start gap-4">
            <div className="panel-3d rounded-xl p-3 flex-shrink-0 self-start">
              <QRCodeSVG
                value={guiaUrl}
                size={180}
                level="M"
                includeMargin={false}
                bgColor="transparent"
                fgColor="var(--color-primary, #0d1b2a)"
              />
            </div>
            <div className="space-y-1 pt-1">
              <p className="text-primary text-[10px] font-black uppercase tracking-widest">Confirmar link</p>
              <p className="text-muted-foreground text-xs leading-relaxed">
                Aponte a câmera do celular para conferir se o link com <span className="font-mono font-semibold">?tenant={slug}</span> está correto antes de enviá-lo ao paciente.
              </p>
            </div>
          </div>
        )}

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
          {`🏥 *${clinicaNome} — Seu Guia Digital*

Olá${selected ? `, ${selected.name.split(" ")[0]}` : ""}! 👋

Preparamos um passo a passo especial para você instalar o aplicativo do ${clinicaNome} no seu celular e aprender a usar o Telegram.

É bem simples! Clique no link abaixo e siga as instruções na tela:

👉 ${guiaUrl}

Qualquer dúvida, estamos à disposição! 😊`}
        </div>
      </div>

    </div>
  );
}
