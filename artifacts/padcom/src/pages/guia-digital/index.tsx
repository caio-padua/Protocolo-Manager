/**
 * /guia-digital — Página PÚBLICA para pacientes.
 *
 * Ensina: instalar o PWA, entrar na Área do Paciente e usar o Telegram.
 * Design: sistema Paxter 3D + terno risca de giz (header navy com pinstripe dourado).
 * Fonte de leitura: Lora (.leva-q) — reservada ao paciente.
 * Audio: Web Speech API — TTS nativo pt-BR, zero custo, zero API externa.
 */

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import {
  Apple, Smartphone, Monitor, LogIn, MessageCircle,
  ChevronDown, ChevronUp, Volume2, VolumeX, Copy, CheckCheck,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { PaxterSymbolGlass } from "@/components/layout/paxter-fx/PaxterSymbolGlass";
import { useScreenTheme } from "@/components/theme/useScreenTheme";
import { ThemeToggle } from "@/components/theme/ThemeToggle";

// ── URLs ──────────────────────────────────────────────────────────────────────
const AREA_URL_DEFAULT = import.meta.env.VITE_AREA_URL
  ?? `${window.location.origin}${import.meta.env.BASE_URL}area`.replace(/([^:])\/\//g, "$1/");
const API_BASE  = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

// ── Configuração multi-tenant do Guia Digital ─────────────────────────────────
interface GuiaConfig {
  clinicaNome: string;
  botHandle:   string;  // ex: "@Paduaclinica_bot"
  botLink:     string;  // ex: "t.me/Paduaclinica_bot"
  areaUrl:     string;
}

const DEFAULT_CONFIG: GuiaConfig = {
  clinicaNome: "Instituto Pádua",
  botHandle:   "@Paduaclinica_bot",
  botLink:     "t.me/Paduaclinica_bot",
  areaUrl:     AREA_URL_DEFAULT,
};

const GuiaConfigContext = createContext<GuiaConfig>(DEFAULT_CONFIG);

// Hook: lê ?tenant= da URL e busca a config no backend.
// Nunca bloqueia a renderização — usa DEFAULT_CONFIG enquanto carrega.
function useGuiaConfigLoader(): GuiaConfig {
  const [config, setConfig] = useState<GuiaConfig>(DEFAULT_CONFIG);
  useEffect(() => {
    const slug = new URLSearchParams(window.location.search).get("tenant");
    if (!slug) return; // sem tenant → usa fallback Instituto Pádua
    fetch(`${API_BASE}/api/onboarding/config?tenant=${encodeURIComponent(slug)}`)
      .then((r) => r.ok
        ? r.json() as Promise<{ clinicaNome: string; botHandle: string | null; areaUrl: string | null }>
        : Promise.reject())
      .then((d) => {
        const handle = d.botHandle ?? DEFAULT_CONFIG.botHandle;
        setConfig({
          clinicaNome: d.clinicaNome || DEFAULT_CONFIG.clinicaNome,
          botHandle:   handle,
          botLink:     `t.me/${handle.replace(/^@/, "")}`,
          areaUrl:     d.areaUrl || DEFAULT_CONFIG.areaUrl,
        });
      })
      .catch(() => {/* fallback silencioso — Instituto Pádua permanece */});
  }, []);
  return config;
}

// ── Evento de analytics — silencioso, nunca bloqueia o paciente ───────────────
function registrarEvento(device: string, secao: string): void {
  fetch(`${API_BASE}/api/onboarding/evento`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ empresa_id: 5, device, secao }),
  }).catch(() => {/* silencioso */});
}

// ── Detecção de dispositivo ───────────────────────────────────────────────────
function detectDevice(): "iphone" | "android" | "desktop" {
  const ua = navigator.userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) return "iphone";
  if (/android/.test(ua))           return "android";
  return "desktop";
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook TTS — Web Speech API nativa (pt-BR, zero custo)
// ─────────────────────────────────────────────────────────────────────────────
function useTTS() {
  const activeRef = useRef<SpeechSynthesisUtterance | null>(null);
  const [falando, setFalando] = useState(false);

  const falar = useCallback((texto: string) => {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(texto);
    utt.lang  = "pt-BR";
    utt.rate  = 0.82;   // ritmo pausado — locutor jornalístico
    utt.pitch = 0.82;   // timbre grave — Cid Moreira / William Bonner
    // Tentar voz masculina pt-BR disponível no sistema
    const voices = window.speechSynthesis.getVoices();
    const mascPtBR = voices.find((v) =>
      /pt[-_]BR/i.test(v.lang) &&
      /Daniel|Lucas|Ricardo|Leandro|Felipe|Google.*Brasil|male/i.test(v.name)
    );
    const anyPtBR = voices.find((v) => /pt[-_]BR/i.test(v.lang));
    const anyPt   = voices.find((v) => /^pt/i.test(v.lang));
    const escolhida = mascPtBR ?? anyPtBR ?? anyPt;
    if (escolhida) utt.voice = escolhida;
    utt.onstart = () => setFalando(true);
    utt.onend   = () => { setFalando(false); activeRef.current = null; };
    utt.onerror = () => { setFalando(false); activeRef.current = null; };
    activeRef.current = utt;
    window.speechSynthesis.speak(utt);
  }, []);

  const parar = useCallback(() => {
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    setFalando(false);
  }, []);

  useEffect(() => () => { if ("speechSynthesis" in window) window.speechSynthesis.cancel(); }, []);

  return { falar, parar, falando };
}

// ─────────────────────────────────────────────────────────────────────────────
// Botão de áudio — ícone bevel com estado ativo
// ─────────────────────────────────────────────────────────────────────────────
function BotaoAudio({ texto, detalhe }: { texto: string; detalhe?: string }) {
  const { falar, parar, falando } = useTTS();
  const frase = detalhe ? `${texto}. ${detalhe}` : texto;
  return (
    <button
      onClick={() => (falando ? parar() : falar(frase))}
      className={`bevel-3d shrink-0 w-7 h-7 flex items-center justify-center rounded-[4px] border-none bg-transparent cursor-pointer transition-opacity ${falando ? "opacity-100 bevel-3d-ok" : "opacity-40 hover:opacity-80"}`}
      title={falando ? "Parar áudio" : "Ouvir este passo"}
      aria-label={falando ? "Parar áudio" : "Ouvir este passo"}
    >
      {falando
        ? <VolumeX className="w-3.5 h-3.5 text-primary" />
        : <Volume2  className="w-3.5 h-3.5 text-primary" />}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Separador horizontal — riscas de giz (ouro fino)
// ─────────────────────────────────────────────────────────────────────────────
function Divisor() {
  return (
    <div className="flex items-center gap-3 my-4">
      <div className="flex-1 h-px bg-border/50" />
      <div className="w-1 h-1 rounded-full bg-accent/40" />
      <div className="flex-1 h-px bg-border/50" />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Componentes-átomo Paxter
// ─────────────────────────────────────────────────────────────────────────────

/** Número de passo em alto-relevo (screen-3d) + texto Lora + botão TTS */
function Passo({ n, texto, detalhe }: { n: number; texto: string; detalhe?: string }) {
  return (
    <div className="flex gap-3 items-start py-3 border-b border-border/25 last:border-0">
      {/* número saliente */}
      <div className="screen-3d shrink-0 w-9 h-9 flex items-center justify-center text-sm font-black leading-none">
        {n}
      </div>
      {/* texto */}
      <div className="flex-1 min-w-0 space-y-1">
        <p className="leva-q m-0 text-[0.975rem] font-semibold text-primary leading-snug">{texto}</p>
        {detalhe && (
          <p className="leva-q m-0 text-[0.85rem] text-muted-foreground leading-relaxed">{detalhe}</p>
        )}
      </div>
      {/* TTS */}
      <BotaoAudio texto={texto} detalhe={detalhe} />
    </div>
  );
}

/** Sub-título de grupo como placa Bevel saliente (com índice de reinício do divisor) */
function PlacaGrupo({ texto, primeiro = false }: { texto: string; primeiro?: boolean }) {
  return (
    <>
      {!primeiro && <Divisor />}
      <div className="bevel-3d inline-flex items-center gap-2 px-3 py-1.5 text-[11px] font-black uppercase tracking-widest mb-3">
        {texto}
      </div>
    </>
  );
}

/** Alerta com LED + texto Lora + botão TTS */
function Alerta({
  tipo,
  texto,
}: {
  tipo: "info" | "ok" | "aviso";
  texto: string;
}) {
  if (tipo === "ok") {
    return (
      <div className="bevel-3d bevel-3d-ok flex gap-3 items-start px-4 py-3 my-3 rounded-[6px]">
        <span className="paxter-led paxter-led-green shrink-0 mt-1" />
        <p className="leva-q m-0 text-[0.9rem] leading-relaxed flex-1">{texto}</p>
        <BotaoAudio texto={texto} />
      </div>
    );
  }
  if (tipo === "aviso") {
    return (
      <div className="paxter-alert paxter-alert-amber flex gap-3 items-start px-4 py-3 my-3 rounded-[6px]">
        <span className="paxter-led paxter-led-amber paxter-led-breathe shrink-0 mt-1" />
        <p className="leva-q m-0 text-[0.9rem] leading-relaxed flex-1">{texto}</p>
        <BotaoAudio texto={texto} />
      </div>
    );
  }
  // info
  return (
    <div className="bevel-3d flex gap-3 items-start px-4 py-3 my-3 rounded-[6px]">
      <span className="paxter-led paxter-led-breathe shrink-0 mt-1" />
      <p className="leva-q m-0 text-[0.9rem] leading-relaxed flex-1">{texto}</p>
      <BotaoAudio texto={texto} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Seção colapsável — panel-3d / panel-3d-active
// ─────────────────────────────────────────────────────────────────────────────
function Secao({
  id,
  icon: Icon,
  titulo,
  subtitulo,
  aberta,
  onToggle,
  children,
}: {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  titulo: string;
  subtitulo: string;
  aberta: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div id={id} className={`panel-3d rounded-[8px] overflow-hidden ${aberta ? "panel-3d-active" : ""}`}>
      {/* Cabeçalho clicável */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-4 px-5 py-4 text-left border-none bg-transparent cursor-pointer"
      >
        {/* Ícone em placa bevel */}
        <div className={`bevel-3d shrink-0 p-2 rounded-[5px] ${aberta ? "bevel-3d-ok" : ""}`}>
          <Icon className="w-4 h-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p
            className="m-0 text-sm font-black uppercase tracking-widest text-primary leading-none"
            style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontWeight: 700, fontSize: "0.9rem" }}
          >
            {titulo}
          </p>
          <p className="leva-q m-0 mt-1 text-xs text-muted-foreground">{subtitulo}</p>
        </div>
        {aberta
          ? <ChevronUp   className="w-4 h-4 text-muted-foreground shrink-0" />
          : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
      </button>

      {/* Conteúdo em well côncavo */}
      {aberta && (
        <div className="concave-3d mx-4 mb-4 rounded-[6px] px-5 py-4">
          {children}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Conteúdo das seções
// ─────────────────────────────────────────────────────────────────────────────

function GuiaIphone() {
  const config = useContext(GuiaConfigContext);
  return (
    <div>
      <Alerta
        tipo="aviso"
        texto="No iPhone, o aplicativo SÓ pode ser instalado pelo Safari — o ícone de bússola azul. Se estiver usando outro navegador, abra o Safari primeiro."
      />

      <PlacaGrupo primeiro texto="📲 Instalar no iPhone — Safari" />
      <Passo n={1} texto="Abra o Safari no seu iPhone (ícone de bússola azul)" />
      <Passo
        n={2}
        texto={`Na barra de endereço, acesse: ${config.areaUrl}`}
        detalhe="Ou toque no link recebido pelo WhatsApp — ele abre direto."
      />
      <Passo
        n={3}
        texto="Toque no botão Compartilhar na barra inferior"
        detalhe="É um quadrado com uma seta apontando para cima ↑ — no centro da barra."
      />
      <Passo
        n={4}
        texto="Deslize a lista para baixo e toque em → Adicionar à Tela de Início"
        detalhe="Se não aparecer, deslize mais — o botão está no meio da lista."
      />
      <Passo n={5} texto="Toque em → Adicionar no canto superior direito" />
      <Alerta
        tipo="ok"
        texto={`Pronto! O ícone do ${config.clinicaNome} aparece na sua tela inicial. Toque nele para entrar a qualquer hora!`}
      />

      <PlacaGrupo texto="🖥 Computador Mac — Safari" />
      <Passo n={1} texto="Abra o Safari no seu Mac" />
      <Passo n={2} texto={`Digite o endereço: ${config.areaUrl}`} />
      <Passo
        n={3}
        texto="O site funciona direto no navegador — não precisa instalar nada"
        detalhe="Para facilitar, salve nos Favoritos: pressione Comando + D."
      />
    </div>
  );
}

function GuiaAndroid() {
  const config = useContext(GuiaConfigContext);
  return (
    <div>
      <PlacaGrupo primeiro texto="📲 Instalar pelo Chrome (recomendado)" />
      <Alerta
        tipo="info"
        texto="Chrome é o ícone colorido de círculo — vermelho, verde, amarelo e azul. É o mais comum no Android."
      />
      <Passo n={1} texto="Abra o Chrome no seu celular" />
      <Passo
        n={2}
        texto={`Na barra de endereço, acesse: ${config.areaUrl}`}
        detalhe="Ou toque no link recebido pelo WhatsApp."
      />
      <Passo n={3} texto="Toque nos 3 pontinhos no canto superior direito" />
      <Passo
        n={4}
        texto="Toque em → Adicionar à tela inicial"
        detalhe="Se aparecer → Instalar aplicativo, toque nessa opção — é ainda melhor!"
      />
      <Passo n={5} texto="Toque em → Adicionar na janela que aparecer" />
      <Alerta tipo="ok" texto="Pronto! O ícone aparece na sua tela inicial." />

      <PlacaGrupo texto="📲 Samsung Internet" />
      <Alerta
        tipo="info"
        texto="Samsung Internet é o ícone azul com globo, pré-instalado em celulares Samsung."
      />
      <Passo n={1} texto="Abra o Samsung Internet" />
      <Passo n={2} texto={`Acesse: ${config.areaUrl}`} />
      <Passo n={3} texto="Toque nas 3 linhas no canto inferior direito" />
      <Passo n={4} texto="Toque em → Adicionar página à → Tela inicial" />
      <Alerta tipo="ok" texto="Pronto!" />

      <PlacaGrupo texto="📲 Firefox ou Edge" />
      <Passo n={1} texto="Abra o Firefox ou Edge" />
      <Passo n={2} texto={`Acesse: ${config.areaUrl}`} />
      <Passo n={3} texto="Toque nos 3 pontinhos → Instalar ou → Adicionar à tela inicial" />
      <Alerta tipo="ok" texto="Pronto!" />
    </div>
  );
}

function GuiaComputador() {
  const config = useContext(GuiaConfigContext);
  return (
    <div>
      <PlacaGrupo primeiro texto="🖥 Chrome ou Edge — instalar como aplicativo" />
      <Alerta
        tipo="info"
        texto="No computador, o aplicativo pode ser instalado pelo Chrome ou Edge. Funciona como um programa separado, sem abrir o navegador toda vez."
      />
      <Passo n={1} texto="Abra o Chrome ou o Edge no seu computador" />
      <Passo n={2} texto={`Na barra de endereço, cole ou digite: ${config.areaUrl}`} />
      <Passo
        n={3}
        texto="Procure o ícone de instalação na barra de endereço"
        detalhe="No Chrome: ícone de tela com seta à direita da barra. No Edge: ícone de janela com seta."
      />
      <Passo n={4} texto="Clique nesse ícone e depois em → Instalar" />
      <Alerta
        tipo="ok"
        texto="O aplicativo abre numa janela própria, sem barra do navegador — como um programa instalado!"
      />
      <Alerta
        tipo="aviso"
        texto="Se o ícone não aparecer no Chrome: clique nos 3 pontinhos → Transmitir, salvar e compartilhar → Instalar página como aplicativo."
      />

      <PlacaGrupo texto="🖥 Firefox ou Safari (Mac)" />
      <Passo n={1} texto={`Abra o navegador e acesse: ${config.areaUrl}`} />
      <Passo
        n={2}
        texto="O site funciona normalmente — não precisa instalar"
        detalhe="Para facilitar, salve nos Favoritos: Ctrl+D (Windows) ou Comando+D (Mac)."
      />
    </div>
  );
}

function GuiaLogin() {
  const config = useContext(GuiaConfigContext);
  return (
    <div>
      <Alerta
        tipo="info"
        texto="Para entrar na Área do Paciente, você usa seu CPF e sua data de nascimento. Não precisa criar senha!"
      />
      <Passo
        n={1}
        texto="Abra o aplicativo no celular ou acesse pelo navegador"
        detalhe={`Endereço: ${config.areaUrl}`}
      />
      <Passo
        n={2}
        texto="No campo CPF, digite seus 11 números"
        detalhe="Somente números, sem pontos ou traço. Exemplo: 12345678901"
      />
      <Passo
        n={3}
        texto="No campo Data de Nascimento, informe o dia, mês e ano"
        detalhe="Exemplo: 15/05/1965"
      />
      <Passo n={4} texto="Toque ou clique no botão azul ENTRAR" />
      <Alerta tipo="ok" texto="Você está dentro! Veja seus protocolos, consultas e documentos." />
      <Alerta
        tipo="aviso"
        texto="Se der erro, verifique se digitou o CPF completo com 11 números e a data correta. Qualquer problema, entre em contato com o consultório."
      />
    </div>
  );
}

function GuiaTelegram() {
  const config = useContext(GuiaConfigContext);
  return (
    <div>
      <Alerta
        tipo="info"
        texto={`O Telegram é um aplicativo gratuito de mensagens — parecido com o WhatsApp. Quando vinculado, você recebe as mensagens do ${config.clinicaNome} por lá também.`}
      />

      <PlacaGrupo primeiro texto="1 — Instale o Telegram (se ainda não tiver)" />
      <Passo n={1} texto="iPhone: abra a App Store, pesquise Telegram e toque em OBTER" />
      <Passo n={2} texto="Android: abra a Play Store, pesquise Telegram e toque em INSTALAR" />
      <Passo n={3} texto="Crie sua conta com seu número de celular (igual ao WhatsApp)" />
      <Alerta tipo="ok" texto="O Telegram é gratuito e seguro. Mais de 900 milhões de pessoas usam no mundo." />

      <PlacaGrupo texto={`2 — Vincule ao ${config.clinicaNome}`} />
      <Alerta
        tipo="aviso"
        texto="Antes de começar, peça ao consultório para gerar a sua senha de ativação. Você receberá uma senha de 6 letras pelo WhatsApp."
      />
      <Passo n={1} texto="Abra o Telegram no seu celular" />
      <Passo
        n={2}
        texto={`Toque na lupa e pesquise por: ${config.botHandle}`}
        detalhe={`Ou toque diretamente neste link: ${config.botLink}`}
      />
      <Passo n={3} texto="Toque em INICIAR ou escreva /start e envie" />
      <Passo
        n={4}
        texto="O robô vai pedir a senha — digite a senha de 6 letras recebida pelo WhatsApp"
        detalhe="Exemplo: K4SYFX — exatamente como recebeu, sem espaço."
      />
      <Alerta
        tipo="ok"
        texto="Pronto! Você receberá as mensagens do consultório pelo Telegram. O robô confirmará com uma mensagem de boas-vindas com o seu nome."
      />

      <PlacaGrupo texto="3 — Pelo computador" />
      <Passo n={1} texto="Acesse: web.telegram.org no navegador do seu computador" />
      <Passo n={2} texto="Entre com o mesmo número de celular — use o QR Code ou o código SMS" />
      <Passo n={3} texto={`Procure ${config.botHandle} na lista de conversas`} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Card QR Code — só exibido no computador (device === "desktop")
// Paciente aponta a câmera do celular e o guia abre direto no dispositivo certo
// ─────────────────────────────────────────────────────────────────────────────
function CardQRCode() {
  // window.location.href inclui ?tenant= se presente — link correto por clínica
  const url = window.location.href;
  return (
    <div className="panel-3d rounded-[8px] overflow-hidden">
      <div className="px-5 py-5 flex flex-col items-center gap-4 text-center">
        {/* Título em placa bevel */}
        <div className="bevel-3d inline-flex items-center gap-2 px-3 py-1.5 text-[11px] font-black uppercase tracking-widest">
          📱 Abrir no celular
        </div>

        {/* QR Code — fundo branco garante leitura em qualquer tema */}
        <div className="rounded-[8px] p-3 bg-white shadow-inner">
          <QRCodeSVG
            value={url}
            size={180}
            fgColor="#1a2744"
            bgColor="#ffffff"
            level="M"
          />
        </div>

        {/* Instrução em Lora (fonte do paciente) */}
        <p className="leva-q m-0 text-[0.9rem] text-muted-foreground leading-relaxed">
          Quer instalar no seu celular?
          <br />
          Aponte a câmera para este código
        </p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Card de link — URL visível em insert côncavo + botão copiar
// ─────────────────────────────────────────────────────────────────────────────
function CardLink() {
  const [copiado, setCopiado] = useState(false);
  const url = window.location.href;
  const copiar = () => {
    navigator.clipboard?.writeText(url).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    });
  };
  return (
    <div className="panel-3d rounded-[8px] px-5 py-4">
      <div className="bevel-3d inline-flex items-center gap-2 px-3 py-1.5 text-[11px] font-black uppercase tracking-widest mb-3">
        🔗 Link deste Guia
      </div>
      <div className="flex items-stretch gap-3">
        {/* URL em insert côncavo — selecionar tudo ao clicar facilita copiar manual */}
        <div
          className="concave-3d flex-1 px-4 py-3 text-[11px] text-primary/80 break-all font-mono rounded-[6px] leading-relaxed select-all cursor-text"
          onClick={copiar}
          title="Clique para copiar"
        >
          {url}
        </div>
        <button
          onClick={copiar}
          className="btn-3d-soft shrink-0 flex flex-col items-center justify-center gap-1 px-4 py-2 rounded-[5px]"
          title="Copiar link"
        >
          {copiado ? <CheckCheck className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          <span className="text-[9px] font-black uppercase tracking-wide">
            {copiado ? "Copiado" : "Copiar"}
          </span>
        </button>
      </div>
      <p className="leva-q m-0 mt-2 text-[0.78rem] text-muted-foreground leading-relaxed">
        Copie e envie ao paciente pelo WhatsApp, SMS ou e-mail.
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Página principal
// ─────────────────────────────────────────────────────────────────────────────

const SECOES = [
  { id: "sec-iphone",     key: "iphone",     icon: Apple,         titulo: "iPhone",                          subtitulo: "Safari, Chrome ou outro navegador no iPhone",  device: "iphone"  },
  { id: "sec-android",    key: "android",    icon: Smartphone,    titulo: "Android",                         subtitulo: "Chrome, Samsung Browser, Firefox, Edge",       device: "android" },
  { id: "sec-computador", key: "computador", icon: Monitor,       titulo: "Computador",                      subtitulo: "Windows ou Mac — Chrome, Edge, Safari",        device: "desktop" },
  { id: "sec-login",      key: "login",      icon: LogIn,         titulo: "Como entrar na Área do Paciente", subtitulo: "CPF + data de nascimento — sem senha",         device: null      },
  { id: "sec-telegram",   key: "telegram",   icon: MessageCircle, titulo: "Telegram",                        subtitulo: "Aplicativo gratuito, alternativa ao WhatsApp", device: null      },
] as const;

type SecKey = typeof SECOES[number]["key"];

// leva-fabric — risca de giz ouro/navy vem do index.css (light + dark automático)

export default function GuiaDigital() {
  const device = detectDevice();
  const config = useGuiaConfigLoader();
  const { theme, toggle: toggleTheme } = useScreenTheme();
  const themeClass = theme === "dark" ? "dark" : "";

  const [aberta, setAberta] = useState<Record<SecKey, boolean>>(() => ({
    iphone:     device === "iphone",
    android:    device === "android",
    computador: device === "desktop",
    login:      true,
    telegram:   false,
  }));

  const toggle = (key: SecKey) => {
    // Registrar evento somente quando ABRE (não quando fecha)
    if (!aberta[key]) registrarEvento(device, key);
    setAberta((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Scroll suave para a seção do dispositivo
  useEffect(() => {
    const map: Record<string, string> = {
      iphone: "sec-iphone", android: "sec-android", desktop: "sec-computador",
    };
    const el = document.getElementById(map[device]);
    if (el) setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "start" }), 500);
  }, []);

  const navegar = (id: string, key: SecKey) => {
    setAberta((p) => ({ ...p, [key]: true }));
    setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  };

  const conteudo: Record<SecKey, React.ReactNode> = {
    iphone:     <GuiaIphone />,
    android:    <GuiaAndroid />,
    computador: <GuiaComputador />,
    login:      <GuiaLogin />,
    telegram:   <GuiaTelegram />,
  };

  const deviceLabel: Record<string, string> = {
    iphone:  "iPhone",
    android: "celular Android",
    desktop: "computador",
  };

  return (
    <GuiaConfigContext.Provider value={config}>
    <div className={`${themeClass} relative min-h-screen bg-background text-foreground`}>

      {/* ── Header navy + leva-fabric (risca de giz, luz+escuro automático) ──── */}
      <header className="relative bg-primary px-5 py-5">
        <div className="leva-fabric" aria-hidden="true" />
        <div className="relative z-[1] flex items-center gap-4">
          <PaxterSymbolGlass size={44} tone="dark" />
          <div className="flex-1 min-w-0">
            <img
              src="/brand/padaxor-wordmark-trim.png"
              alt="PADAXOR"
              className="h-[22px] object-contain object-left"
              draggable={false}
            />
            <p
              className="m-0 mt-1 text-[0.8rem] tracking-[0.12em] text-accent/80"
              style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontWeight: 600, letterSpacing: "0.12em" }}
            >
              Guia Digital do Paciente
            </p>
          </div>
          {/* Toggle claro/escuro — ouro, cantos quadrados Paxter */}
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
        </div>
      </header>

      {/* ── Hero — faixa navy com leva-fabric ────────────────────────────────── */}
      <div className="relative bg-primary" style={{ borderTop: "1px solid rgba(212,175,55,0.15)" }}>
        <div className="leva-fabric" aria-hidden="true" />
        <div className="relative z-[1] px-5 pt-2 pb-6 text-center">
          <p
            className="leva-q text-white text-[1.15rem] font-semibold leading-snug m-0"
            style={{ fontFamily: "'Lora', Georgia, serif" }}
          >
            Olá! Aqui você aprende a usar o {config.clinicaNome} no seu celular e computador.
          </p>
          <p
            className="leva-q text-white/60 text-[0.9rem] mt-2 m-0 leading-relaxed"
            style={{ fontFamily: "'Lora', Georgia, serif" }}
          >
            Siga os passos da seção do seu dispositivo.
            <br />
            Toque no ícone <Volume2 className="inline w-3.5 h-3.5 mx-0.5 opacity-70" /> ao lado de cada passo para ouvir em voz alta.
          </p>
        </div>
      </div>

      {/* ── Navegação rápida — acesso direto a cada seção ────────────────────── */}
      <div className="px-4 py-3 border-b border-border bg-card flex flex-wrap gap-2 items-center">
        {SECOES.map(({ id, key, icon: Icon, titulo }) => (
          <button
            key={key}
            onClick={() => navegar(id, key)}
            className="btn-3d-soft flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-black uppercase tracking-wide rounded-[5px]"
          >
            <Icon className="w-3 h-3" />
            {titulo.split(" ")[0]}
          </button>
        ))}
      </div>

      {/* ── Corpo ───────────────────────────────────────────────────────────── */}
      <div className="max-w-lg mx-auto px-4 py-5 space-y-4">

        {/* Banner de dispositivo detectado */}
        <div className="panel-3d rounded-[8px] px-5 py-3 flex items-start gap-3">
          <span className="paxter-led paxter-led-green shrink-0 mt-1.5" />
          <div className="flex-1 space-y-0.5">
            <p className="m-0 text-[11px] font-black uppercase tracking-widest text-primary">
              Dispositivo detectado
            </p>
            <p className="leva-q m-0 text-[0.9rem] text-primary/80 leading-snug">
              Você está num <strong>{deviceLabel[device]}</strong>. A seção certa já está aberta abaixo.
            </p>
          </div>
        </div>

        {/* QR Code — só no computador, para o paciente abrir no celular */}
        {device === "desktop" && <CardQRCode />}

        {/* Card do link — URL visível em insert côncavo, fácil de compartilhar */}
        <CardLink />

        {/* Linha ouro separadora */}
        <div className="h-px bg-accent/20" />

        {/* Seções colapsáveis */}
        {SECOES.map(({ id, key, icon, titulo, subtitulo }) => (
          <Secao
            key={key}
            id={id}
            icon={icon}
            titulo={titulo}
            subtitulo={subtitulo}
            aberta={aberta[key]}
            onToggle={() => toggle(key)}
          >
            {conteudo[key]}
          </Secao>
        ))}

        {/* Rodapé */}
        <div className="panel-3d rounded-[8px] overflow-hidden">
          <div className="relative bg-primary px-5 py-6 text-center space-y-2">
            <div className="leva-fabric" aria-hidden="true" />
            <p
              className="m-0 text-accent font-black text-sm uppercase tracking-widest"
              style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: "1rem" }}
            >
              Ficou com dúvida?
            </p>
            <p className="leva-q m-0 text-white/70 text-[0.9rem] leading-relaxed">
              Entre em contato com o {config.clinicaNome} pelo WhatsApp ou telefone.
              <br />Estamos aqui para ajudar!
            </p>
            <div className="h-px bg-accent/20 mt-4" />
            <p className="m-0 text-accent/40 text-[0.65rem] uppercase tracking-widest mt-3">
              {config.clinicaNome} — Clinical Intelligence System
            </p>
          </div>
        </div>

      </div>
    </div>
    </GuiaConfigContext.Provider>
  );
}
