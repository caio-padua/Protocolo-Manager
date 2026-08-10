/**
 * /guia-digital — Página PÚBLICA para pacientes.
 *
 * Ensina: instalar o PWA, entrar na Área do Paciente e usar o Telegram.
 * Design: sistema Paxter 3D — panel-3d / bevel-3d / concave-3d / screen-3d.
 * Fonte de leitura: Lora (.leva-q) — reservada ao paciente.
 * Cor: navy/ouro canônico do skill-layout-paxter.
 */

import { useEffect, useState } from "react";
import {
  Apple, Smartphone, Monitor, LogIn, MessageCircle,
  ChevronDown, ChevronUp, CheckCircle2, AlertTriangle, Info,
} from "lucide-react";
import { PaxterSymbolGlass } from "@/components/layout/paxter-fx/PaxterSymbolGlass";

// ── URLs ──────────────────────────────────────────────────────────────────────
const AREA_URL = `${window.location.origin}${import.meta.env.BASE_URL}area`.replace(/([^:])\/\//g, "$1/");

// ── Detecção de dispositivo ───────────────────────────────────────────────────
function detectDevice(): "iphone" | "android" | "desktop" {
  const ua = navigator.userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) return "iphone";
  if (/android/.test(ua)) return "android";
  return "desktop";
}

// ─────────────────────────────────────────────────────────────────────────────
// Componentes-átomo Paxter
// ─────────────────────────────────────────────────────────────────────────────

/** Número de passo em alto-relevo (screen-3d) + texto em Lora */
function Passo({ n, texto, detalhe }: { n: number; texto: string; detalhe?: string }) {
  return (
    <div className="flex gap-3 items-start py-2.5">
      {/* número saliente */}
      <div className="screen-3d shrink-0 w-8 h-8 flex items-center justify-center text-sm font-black leading-none">
        {n}
      </div>
      <div className="flex-1 min-w-0 space-y-1">
        <p className="leva-q m-0 text-[1rem] font-semibold text-primary leading-snug">{texto}</p>
        {detalhe && (
          <p className="leva-q m-0 text-[0.875rem] text-muted-foreground leading-relaxed">{detalhe}</p>
        )}
      </div>
    </div>
  );
}

/** Sub-título de grupo como placa Bevel saliente */
function PlacaGrupo({ texto }: { texto: string }) {
  return (
    <div className="bevel-3d inline-flex items-center gap-2 px-3 py-1.5 text-[11px] font-black uppercase tracking-widest mt-5 mb-2">
      {texto}
    </div>
  );
}

/** Dica/alerta usando vocabulário 3D Paxter */
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
      </div>
    );
  }
  if (tipo === "aviso") {
    return (
      <div className="paxter-alert paxter-alert-amber flex gap-3 items-start px-4 py-3 my-3 rounded-[6px]">
        <span className="paxter-led paxter-led-amber paxter-led-breathe shrink-0 mt-1" />
        <p className="leva-q m-0 text-[0.9rem] leading-relaxed flex-1">{texto}</p>
      </div>
    );
  }
  // info
  return (
    <div className="bevel-3d flex gap-3 items-start px-4 py-3 my-3 rounded-[6px]">
      <span className="paxter-led paxter-led-breathe shrink-0 mt-1" />
      <p className="leva-q m-0 text-[0.9rem] leading-relaxed flex-1">{texto}</p>
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
          <p className="m-0 text-sm font-black uppercase tracking-widest text-primary leading-none">
            {titulo}
          </p>
          <p className="m-0 mt-1 text-xs text-muted-foreground">{subtitulo}</p>
        </div>
        {aberta
          ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
          : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
      </button>

      {/* Conteúdo em well concavo */}
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
  return (
    <div>
      <Alerta
        tipo="aviso"
        texto="No iPhone, o aplicativo SÓ pode ser instalado pelo Safari — o ícone da bússola azul. Se estiver usando Chrome ou outro navegador, abra o Safari primeiro."
      />

      <PlacaGrupo texto="📲 Instalar no iPhone — Safari" />
      <Passo n={1} texto="Abra o Safari no seu iPhone (ícone de bússola azul)" />
      <Passo
        n={2}
        texto={`Na barra de endereço (parte de cima), acesse: ${AREA_URL}`}
        detalhe="Ou toque no link que recebeu pelo WhatsApp — ele abre direto."
      />
      <Passo
        n={3}
        texto="Toque no botão Compartilhar no centro da barra inferior"
        detalhe="É um quadrado com uma seta apontando para cima ↑"
      />
      <Passo
        n={4}
        texto="Deslize a lista para baixo e toque em → Adicionar à Tela de Início"
        detalhe="Se não aparecer, deslize mais — o botão está no meio da lista."
      />
      <Passo n={5} texto="Toque em → Adicionar no canto superior direito" />
      <Alerta
        tipo="ok"
        texto="Pronto! O ícone do Instituto Pádua aparece na sua tela inicial. Toque nele para entrar a qualquer hora!"
      />

      <PlacaGrupo texto="🖥 Computador Mac — Safari" />
      <Passo n={1} texto="Abra o Safari no seu Mac" />
      <Passo n={2} texto={`Digite o endereço: ${AREA_URL}`} />
      <Passo
        n={3}
        texto="O site funciona direto no navegador — não precisa instalar nada"
        detalhe="Para facilitar, salve nos Favoritos: pressione ⌘+D."
      />
    </div>
  );
}

function GuiaAndroid() {
  return (
    <div>
      <PlacaGrupo texto="📲 Instalar pelo Chrome (recomendado)" />
      <Alerta
        tipo="info"
        texto="Chrome é o ícone colorido de círculo (vermelho, verde, amarelo e azul). É o navegador mais comum no Android."
      />
      <Passo n={1} texto="Abra o Chrome no seu celular" />
      <Passo
        n={2}
        texto={`Na barra de endereço, acesse: ${AREA_URL}`}
        detalhe="Ou toque no link recebido pelo WhatsApp."
      />
      <Passo n={3} texto="Toque nos 3 pontinhos ⋮ no canto superior direito" />
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
      <Passo n={2} texto={`Acesse: ${AREA_URL}`} />
      <Passo n={3} texto="Toque nas 3 linhas ☰ no canto inferior direito" />
      <Passo n={4} texto="Toque em → Adicionar página à → Tela inicial" />
      <Alerta tipo="ok" texto="Pronto!" />

      <PlacaGrupo texto="📲 Firefox ou Edge" />
      <Passo n={1} texto="Abra o Firefox ou Edge" />
      <Passo n={2} texto={`Acesse: ${AREA_URL}`} />
      <Passo
        n={3}
        texto="Toque nos 3 pontinhos → Instalar ou Adicionar à tela inicial"
      />
      <Alerta tipo="ok" texto="Pronto!" />
    </div>
  );
}

function GuiaComputador() {
  return (
    <div>
      <PlacaGrupo texto="🖥 Chrome ou Edge — instalar como aplicativo" />
      <Alerta
        tipo="info"
        texto="No computador, o aplicativo pode ser instalado pelo Chrome ou Edge. Funciona como um programa separado, sem precisar abrir o navegador toda vez."
      />
      <Passo n={1} texto="Abra o Chrome ou o Edge no seu computador" />
      <Passo n={2} texto={`Na barra de endereço, cole ou digite: ${AREA_URL}`} />
      <Passo
        n={3}
        texto="Procure o ícone de instalação na barra de endereço"
        detalhe="No Chrome: ícone de tela com seta (⊕) à direita da barra. No Edge: ícone de janela com seta."
      />
      <Passo n={4} texto="Clique nesse ícone e depois em → Instalar" />
      <Alerta
        tipo="ok"
        texto="O aplicativo abre numa janela própria, sem barra do navegador — como um programa instalado!"
      />
      <Alerta
        tipo="aviso"
        texto="Se o ícone não aparecer no Chrome: clique nos 3 pontinhos ⋮ → Transmitir, salvar e compartilhar → Instalar página como aplicativo."
      />

      <PlacaGrupo texto="🖥 Firefox ou Safari (Mac)" />
      <Passo n={1} texto={`Abra o navegador e acesse: ${AREA_URL}`} />
      <Passo
        n={2}
        texto="O site funciona normalmente — não precisa instalar"
        detalhe="Para facilitar, salve nos Favoritos: Ctrl+D (Windows) ou ⌘+D (Mac)."
      />
    </div>
  );
}

function GuiaLogin() {
  return (
    <div>
      <Alerta
        tipo="info"
        texto="Para entrar na Área do Paciente, você usa seu CPF e sua data de nascimento. Não precisa criar senha!"
      />
      <Passo
        n={1}
        texto="Abra o aplicativo no celular ou acesse pelo navegador"
        detalhe={`Endereço: ${AREA_URL}`}
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
        texto="Se der erro, verifique se digitou o CPF completo (11 números) e a data correta. Qualquer problema, entre em contato com o Instituto."
      />
    </div>
  );
}

function GuiaTelegram() {
  return (
    <div>
      <Alerta
        tipo="info"
        texto="O Telegram é um aplicativo gratuito de mensagens — parecido com o WhatsApp. Quando vinculado, você recebe as mensagens do Instituto Pádua por lá também."
      />

      <PlacaGrupo texto="1 — Instale o Telegram (se ainda não tiver)" />
      <Passo n={1} texto="iPhone: abra a App Store, pesquise Telegram e toque em OBTER" />
      <Passo n={2} texto="Android: abra a Play Store, pesquise Telegram e toque em INSTALAR" />
      <Passo n={3} texto="Crie sua conta com seu número de celular (igual ao WhatsApp)" />
      <Alerta tipo="ok" texto="O Telegram é gratuito e seguro. Mais de 900 milhões de pessoas usam no mundo." />

      <PlacaGrupo texto="2 — Vincule ao Instituto Pádua" />
      <Alerta
        tipo="aviso"
        texto="Antes de começar, peça ao consultório para gerar a sua senha de ativação. Você receberá uma senha de 6 letras pelo WhatsApp."
      />
      <Passo n={1} texto="Abra o Telegram no seu celular" />
      <Passo
        n={2}
        texto="Toque na lupa 🔍 e pesquise por: @Paduaclinica_bot"
        detalhe="Ou toque diretamente neste link: t.me/Paduaclinica_bot"
      />
      <Passo n={3} texto="Toque em INICIAR (ou escreva /start e envie)" />
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
      <Passo n={3} texto="Procure @Paduaclinica_bot na lista de conversas" />
    </div>
  );
}


// ─────────────────────────────────────────────────────────────────────────────
// Página principal
// ─────────────────────────────────────────────────────────────────────────────

const SECOES = [
  { id: "sec-iphone",     key: "iphone",     icon: Apple,          titulo: "iPhone",                          subtitulo: "Safari, Chrome ou outro navegador no iPhone",  device: "iphone"  },
  { id: "sec-android",    key: "android",    icon: Smartphone,     titulo: "Android",                         subtitulo: "Chrome, Samsung Browser, Firefox, Edge",       device: "android" },
  { id: "sec-computador", key: "computador", icon: Monitor,        titulo: "Computador",                      subtitulo: "Windows ou Mac — Chrome, Edge, Safari",        device: "desktop" },
  { id: "sec-login",      key: "login",      icon: LogIn,          titulo: "Como entrar na Área do Paciente", subtitulo: "CPF + data de nascimento — sem senha",         device: null      },
  { id: "sec-telegram",   key: "telegram",   icon: MessageCircle,  titulo: "Telegram",                        subtitulo: "Aplicativo gratuito, alternativa ao WhatsApp", device: null      },
] as const;

type SecKey = typeof SECOES[number]["key"];

export default function GuiaDigital() {
  const device = detectDevice();

  // Abre automaticamente a seção do dispositivo + login
  const [aberta, setAberta] = useState<Record<SecKey, boolean>>(() => ({
    iphone:     device === "iphone",
    android:    device === "android",
    computador: device === "desktop",
    login:      true,
    telegram:   false,
  }));

  const toggle = (key: SecKey) =>
    setAberta((prev) => ({ ...prev, [key]: !prev[key] }));

  // Scroll suave para a seção do dispositivo
  useEffect(() => {
    const map: Record<string, string> = {
      iphone: "sec-iphone", android: "sec-android", desktop: "sec-computador",
    };
    const el = document.getElementById(map[device]);
    if (el) setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "start" }), 400);
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

  return (
    <div className="min-h-screen bg-background">

      {/* ── Header navy ────────────────────────────────────────────────────── */}
      <header className="bg-primary px-5 py-4 flex items-center gap-4">
        <PaxterSymbolGlass size={40} tone="dark" />
        <div className="flex-1 min-w-0">
          <img
            src="/brand/padaxor-wordmark-trim.png"
            alt="PADAXOR"
            className="h-[22px] object-contain object-left"
            draggable={false}
          />
          <p
            className="m-0 mt-0.5 text-[0.75rem] tracking-[0.1em] text-accent/80"
            style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontWeight: 600 }}
          >
            Guia Digital do Paciente
          </p>
        </div>
      </header>

      {/* ── Hero ────────────────────────────────────────────────────────────── */}
      <div className="bg-primary px-5 pt-1 pb-5 text-center border-t border-white/10">
        <p className="leva-q text-white text-lg font-semibold leading-snug m-0">
          Olá! Aqui você aprende a usar o Instituto Pádua no seu celular e computador.
        </p>
        <p className="leva-q text-white/65 text-[0.9rem] mt-2 m-0 leading-relaxed">
          Siga os passos do seu dispositivo. É simples e rápido!
        </p>
      </div>

      {/* ── Navegação rápida — pills btn-3d-soft ────────────────────────────── */}
      <div className="px-4 py-3 border-b border-border bg-card flex flex-wrap gap-2">
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
        {device !== "desktop" && (
          <div className="panel-3d rounded-[8px] px-4 py-3 flex items-center gap-3">
            <span className="paxter-led paxter-led-green paxter-led-on shrink-0" />
            <p className="leva-q m-0 text-[0.9rem] text-primary leading-snug">
              Detectamos que você está num{" "}
              <strong>{device === "iphone" ? "iPhone" : "celular Android"}</strong>.
              {" "}A seção certa já está aberta!
            </p>
          </div>
        )}

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

        {/* Rodapé de contato */}
        <div className="panel-3d rounded-[8px] overflow-hidden">
          <div className="bg-primary px-5 py-5 text-center space-y-2">
            <div className="flex items-center justify-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-accent shrink-0" />
              <p
                className="m-0 text-accent font-black text-sm uppercase tracking-widest"
              >
                Ficou com dúvida?
              </p>
            </div>
            <p className="leva-q m-0 text-white/75 text-[0.9rem] leading-relaxed">
              Entre em contato com o Instituto Pádua pelo WhatsApp ou telefone.
              <br />Estamos aqui para ajudar!
            </p>
            <p
              className="m-0 text-accent/60 text-[0.7rem] uppercase tracking-widest mt-3"
            >
              Instituto Pádua — Clinical Intelligence System
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}
