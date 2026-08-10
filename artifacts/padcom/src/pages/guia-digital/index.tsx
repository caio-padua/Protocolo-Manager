/**
 * /guia-digital — Página PÚBLICA (sem login) para pacientes.
 *
 * Ensina passo a passo:
 *  1. Como instalar o aplicativo (PWA) no celular e no computador
 *  2. Como entrar na Área do Paciente
 *  3. Como vincular e usar o Telegram
 *
 * Escrita para usuário leigo e idoso: frases curtas, fontes grandes,
 * ícones visuais, sem jargão técnico.
 */

import { useEffect, useState } from "react";
import { CheckCircle2, ChevronDown, ChevronUp, Smartphone, Monitor, MessageCircle, LogIn } from "lucide-react";

// ─── URL da Área do Paciente ──────────────────────────────────────────────────
const AREA_URL = `${window.location.origin}${import.meta.env.BASE_URL}area`.replace(/([^:])\/\//g, "$1/");
const BOT_URL  = "https://t.me/Paduaclinica_bot";

// ─── Detecta dispositivo ─────────────────────────────────────────────────────
function detectDevice(): "iphone" | "android" | "desktop" {
  const ua = navigator.userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) return "iphone";
  if (/android/.test(ua)) return "android";
  return "desktop";
}

// ─── Componente de passo numerado ────────────────────────────────────────────
function Passo({ n, texto, detalhe }: { n: number; texto: string; detalhe?: string }) {
  return (
    <div style={{ display: "flex", gap: 14, alignItems: "flex-start", padding: "10px 0" }}>
      <div style={{
        minWidth: 36, height: 36, borderRadius: "50%",
        background: "linear-gradient(135deg,#1a3260,#2a4e8a)",
        color: "#c2a05a", fontWeight: 900, fontSize: 18,
        display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: "0 2px 6px rgba(0,0,0,0.25)",
        flexShrink: 0,
      }}>
        {n}
      </div>
      <div>
        <p style={{ margin: 0, fontSize: "1.05rem", color: "#1a2e4a", lineHeight: 1.5, fontWeight: 600 }}>
          {texto}
        </p>
        {detalhe && (
          <p style={{ margin: "4px 0 0", fontSize: "0.9rem", color: "#5a6a80", lineHeight: 1.5 }}>
            {detalhe}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Caixa de destaque (dica visual) ─────────────────────────────────────────
function Dica({ cor, emoji, texto }: { cor: string; emoji: string; texto: string }) {
  return (
    <div style={{
      background: cor, borderRadius: 10, padding: "12px 16px",
      display: "flex", gap: 10, alignItems: "flex-start", margin: "12px 0",
    }}>
      <span style={{ fontSize: 22, lineHeight: 1 }}>{emoji}</span>
      <p style={{ margin: 0, fontSize: "0.95rem", color: "#1a2e4a", lineHeight: 1.5 }}>{texto}</p>
    </div>
  );
}

// ─── Seção colapsável ────────────────────────────────────────────────────────
function Secao({
  id, titulo, subtitulo, emoji, cor, aberta, onToggle, children,
}: {
  id: string; titulo: string; subtitulo: string; emoji: string;
  cor: string; aberta: boolean; onToggle: () => void; children: React.ReactNode;
}) {
  return (
    <div
      id={id}
      style={{
        borderRadius: 14, overflow: "hidden", marginBottom: 18,
        border: aberta ? `2px solid ${cor}` : "2px solid #e2d8c8",
        boxShadow: aberta ? `0 4px 20px ${cor}33` : "0 2px 8px rgba(0,0,0,0.08)",
        transition: "border 0.2s, box-shadow 0.2s",
      }}
    >
      {/* Cabeçalho da seção — clicável */}
      <button
        onClick={onToggle}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: 14,
          padding: "16px 18px", background: aberta ? cor : "#f8f4ec",
          border: "none", cursor: "pointer", textAlign: "left",
        }}
      >
        <span style={{ fontSize: 30, lineHeight: 1 }}>{emoji}</span>
        <div style={{ flex: 1 }}>
          <p style={{ margin: 0, fontSize: "1.1rem", fontWeight: 900, color: aberta ? "#fff" : "#1a2e4a", textTransform: "uppercase", letterSpacing: "0.04em" }}>
            {titulo}
          </p>
          <p style={{ margin: "2px 0 0", fontSize: "0.85rem", color: aberta ? "rgba(255,255,255,0.80)" : "#6a7a8a" }}>
            {subtitulo}
          </p>
        </div>
        {aberta
          ? <ChevronUp style={{ color: "#fff", flexShrink: 0 }} />
          : <ChevronDown style={{ color: "#6a7a8a", flexShrink: 0 }} />
        }
      </button>

      {/* Conteúdo */}
      {aberta && (
        <div style={{ background: "#fff", padding: "18px 20px" }}>
          {children}
        </div>
      )}
    </div>
  );
}

// ─── Seção: iPhone ────────────────────────────────────────────────────────────
function GuiaIphone() {
  return (
    <div>
      <Dica cor="#fff8e6" emoji="⚠️" texto="No iPhone, o aplicativo SÓ pode ser instalado pelo navegador Safari (o ícone da bússola 🧭). Se estiver usando Chrome ou outro navegador, abra o Safari primeiro." />

      <p style={{ fontWeight: 700, fontSize: "1rem", color: "#1a2e4a", margin: "16px 0 8px" }}>📲 Instalar no iPhone</p>
      <Passo n={1} texto='Abra o Safari no seu iPhone (ícone de bússola azul 🧭)' />
      <Passo n={2} texto={`Na barra de endereço (parte de cima da tela), digite: ${AREA_URL}`} detalhe="Ou toque no link que recebeu pelo WhatsApp — ele abre direto." />
      <Passo n={3} texto="No centro da barra inferior da tela, toque no botão Compartilhar" detalhe="É um quadrado com uma seta apontando para cima ↑ (cor azul)" />
      <Passo n={4} texto='Deslize a lista que aparece para baixo e toque em "Adicionar à Tela de Início"' detalhe="Se não aparecer, deslize mais para baixo — o botão está no meio da lista." />
      <Passo n={5} texto='No canto superior direito, toque em "Adicionar"' />
      <Dica cor="#edfaf3" emoji="✅" texto="Pronto! O ícone do Instituto Pádua aparece na sua tela inicial, como qualquer outro aplicativo. Toque nele para entrar a qualquer hora!" />

      <p style={{ fontWeight: 700, fontSize: "1rem", color: "#1a2e4a", margin: "20px 0 8px" }}>🖥 Acessar pelo computador (Mac — Safari)</p>
      <Passo n={1} texto="Abra o Safari no seu Mac" />
      <Passo n={2} texto={`Digite o endereço: ${AREA_URL}`} />
      <Passo n={3} texto="O site funciona direto no navegador — não precisa instalar nada" detalhe="Para facilitar o acesso, salve nos Favoritos: Arquivo → Adicionar à Dock ou pressione ⌘+D." />
    </div>
  );
}

// ─── Seção: Android ───────────────────────────────────────────────────────────
function GuiaAndroid() {
  return (
    <div>
      <p style={{ fontWeight: 700, fontSize: "1rem", color: "#1a2e4a", margin: "0 0 8px" }}>📲 Instalar pelo Chrome (recomendado)</p>
      <Dica cor="#e8f0fe" emoji="ℹ️" texto='Chrome é o ícone colorido de círculo (vermelho, verde, amarelo e azul). É o navegador mais comum no Android.' />
      <Passo n={1} texto="Abra o Chrome no seu celular" />
      <Passo n={2} texto={`Na barra de endereço, digite: ${AREA_URL}`} detalhe="Ou toque no link recebido pelo WhatsApp." />
      <Passo n={3} texto="Toque nos 3 pontinhos ⋮ no canto superior direito da tela" />
      <Passo n={4} texto='Toque em "Adicionar à tela inicial"' detalhe='Se aparecer "Instalar aplicativo", toque nessa opção — é ainda melhor!' />
      <Passo n={5} texto='Toque em "Adicionar" na janela que aparecer' />
      <Dica cor="#edfaf3" emoji="✅" texto="Pronto! O ícone aparece na sua tela inicial. Toque nele para entrar!" />

      <p style={{ fontWeight: 700, fontSize: "1rem", color: "#1a2e4a", margin: "20px 0 8px" }}>📲 Instalar pelo Samsung Internet</p>
      <Dica cor="#e8f0fe" emoji="ℹ️" texto='Samsung Internet é o ícone azul com globo, pré-instalado em celulares Samsung.' />
      <Passo n={1} texto="Abra o Samsung Internet" />
      <Passo n={2} texto={`Acesse: ${AREA_URL}`} />
      <Passo n={3} texto="Toque nas 3 linhas ☰ no canto inferior direito" />
      <Passo n={4} texto='"Adicionar página à" → "Tela inicial"' />
      <Dica cor="#edfaf3" emoji="✅" texto="Pronto!" />

      <p style={{ fontWeight: 700, fontSize: "1rem", color: "#1a2e4a", margin: "20px 0 8px" }}>📲 Instalar pelo Firefox</p>
      <Passo n={1} texto="Abra o Firefox" />
      <Passo n={2} texto={`Acesse: ${AREA_URL}`} />
      <Passo n={3} texto='Toque nos 3 pontinhos ⋮ → "Instalar"' detalhe='Também pode aparecer como "Adicionar à tela inicial".' />
      <Dica cor="#edfaf3" emoji="✅" texto="Pronto!" />

      <p style={{ fontWeight: 700, fontSize: "1rem", color: "#1a2e4a", margin: "20px 0 8px" }}>📲 Instalar pelo Microsoft Edge</p>
      <Passo n={1} texto="Abra o Edge" />
      <Passo n={2} texto={`Acesse: ${AREA_URL}`} />
      <Passo n={3} texto='Toque nos 3 pontinhos ⋯ → "Adicionar à tela inicial" ou "Instalar aplicativo"' />
      <Dica cor="#edfaf3" emoji="✅" texto="Pronto!" />
    </div>
  );
}

// ─── Seção: Computador ────────────────────────────────────────────────────────
function GuiaComputador() {
  return (
    <div>
      <p style={{ fontWeight: 700, fontSize: "1rem", color: "#1a2e4a", margin: "0 0 8px" }}>🖥 Instalar pelo Chrome ou Edge</p>
      <Dica cor="#e8f0fe" emoji="ℹ️" texto="No computador, o aplicativo pode ser instalado pelo Chrome ou Edge. Funciona como um programa separado, sem precisar abrir o navegador toda vez." />
      <Passo n={1} texto="Abra o Chrome ou o Edge no seu computador" />
      <Passo n={2} texto={`Na barra de endereço, cole ou digite: ${AREA_URL}`} />
      <Passo n={3} texto="Procure o ícone de instalação na barra de endereço" detalhe="No Chrome: ícone de tela com seta (⊕) à direita da barra. No Edge: ícone de janela com seta. Se não aparecer, veja abaixo." />
      <Passo n={4} texto='Clique nesse ícone e depois em "Instalar"' />
      <Dica cor="#edfaf3" emoji="✅" texto="O aplicativo abre numa janela própria, sem barra do navegador, como um programa instalado!" />

      <Dica cor="#fff8e6" emoji="💡" texto='Se o ícone de instalação não aparecer no Chrome: clique nos 3 pontinhos ⋮ → "Transmitir, salvar e compartilhar" → "Instalar página como aplicativo".' />

      <p style={{ fontWeight: 700, fontSize: "1rem", color: "#1a2e4a", margin: "20px 0 8px" }}>🖥 Pelo Firefox ou Safari (Mac)</p>
      <Passo n={1} texto={`Abra o navegador e acesse: ${AREA_URL}`} />
      <Passo n={2} texto="O site funciona normalmente — não precisa instalar" detalhe="Para facilitar, salve nos Favoritos pressionando Ctrl+D (Windows) ou ⌘+D (Mac)." />
    </div>
  );
}

// ─── Seção: Como entrar ───────────────────────────────────────────────────────
function GuiaLogin() {
  return (
    <div>
      <Dica cor="#e8f0fe" emoji="ℹ️" texto="Para entrar na Área do Paciente, você usa seu CPF e sua data de nascimento. Não precisa criar senha!" />
      <Passo n={1} texto="Abra o aplicativo no celular ou acesse pelo navegador" detalhe={`Endereço: ${AREA_URL}`} />
      <Passo n={2} texto="No campo CPF, digite seus 11 números" detalhe="Somente números, sem pontos ou traço. Exemplo: 12345678901" />
      <Passo n={3} texto="No campo Data de Nascimento, informe o seu dia, mês e ano" detalhe="Exemplo: 15/05/1965" />
      <Passo n={4} texto='Toque ou clique no botão azul "ENTRAR"' />
      <Dica cor="#edfaf3" emoji="✅" texto="Você está dentro! Veja seus protocolos, consultas e documentos." />
      <Dica cor="#fff8e6" emoji="💡" texto="Se der erro, verifique se digitou o CPF completo (11 números) e a data correta. Qualquer problema, entre em contato com o Instituto." />
    </div>
  );
}

// ─── Seção: Telegram ─────────────────────────────────────────────────────────
function GuiaTelegram() {
  return (
    <div>
      <Dica cor="#e8f4ff" emoji="ℹ️" texto="O Telegram é um aplicativo gratuito de mensagens — parecido com o WhatsApp. Quando vinculado, você recebe as mensagens do Instituto Pádua por lá também." />

      <p style={{ fontWeight: 700, fontSize: "1rem", color: "#1a2e4a", margin: "0 0 8px" }}>1️⃣ Instale o Telegram (se ainda não tiver)</p>
      <Passo n={1} texto="iPhone: abra a App Store, pesquise 'Telegram' e toque em OBTER" />
      <Passo n={2} texto="Android: abra a Play Store, pesquise 'Telegram' e toque em INSTALAR" />
      <Passo n={3} texto="Crie sua conta com seu número de celular (igual ao WhatsApp)" />
      <Dica cor="#edfaf3" emoji="✅" texto="O Telegram é gratuito e seguro. Mais de 900 milhões de pessoas usam no mundo." />

      <p style={{ fontWeight: 700, fontSize: "1rem", color: "#1a2e4a", margin: "20px 0 8px" }}>2️⃣ Vincule ao Instituto Pádua</p>
      <Dica cor="#fff8e6" emoji="⚠️" texto="Antes de começar, peça ao consultório para gerar a sua senha de ativação. Você receberá uma senha de 6 letras pelo WhatsApp." />
      <Passo n={1} texto="Abra o Telegram no seu celular" />
      <Passo n={2} texto='Toque na lupa 🔍 e pesquise por: @Paduaclinica_bot' detalhe='Ou toque diretamente neste link: t.me/Paduaclinica_bot' />
      <Passo n={3} texto='Toque em "INICIAR" (ou escreva /start e envie)' />
      <Passo n={4} texto="O robô vai pedir uma senha — digitar a senha de 6 letras que recebeu no WhatsApp" detalhe="Exemplo: K4SYFX — as letras e números exatamente como recebeu, sem espaço." />
      <Dica cor="#edfaf3" emoji="✅" texto="Pronto! Você receberá as mensagens do consultório pelo Telegram. O robô confirmará com uma mensagem de boas-vindas com o seu nome." />

      <p style={{ fontWeight: 700, fontSize: "1rem", color: "#1a2e4a", margin: "20px 0 8px" }}>3️⃣ Acessando pelo computador</p>
      <Passo n={1} texto="Acesse: web.telegram.org pelo navegador do seu computador" />
      <Passo n={2} texto="Entre com o mesmo número de celular — use o QR Code ou o código SMS" />
      <Passo n={3} texto="Procure @Paduaclinica_bot na lista de conversas" />
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function GuiaDigital() {
  const device = detectDevice();

  const [aberta, setAberta] = useState<Record<string, boolean>>({
    iphone:     device === "iphone",
    android:    device === "android",
    computador: device === "desktop",
    login:      true,
    telegram:   false,
  });

  const toggle = (id: string) =>
    setAberta((prev) => ({ ...prev, [id]: !prev[id] }));

  // Scroll para a seção do dispositivo detectado ao carregar
  useEffect(() => {
    const map: Record<string, string> = {
      iphone: "sec-iphone", android: "sec-android", desktop: "sec-computador",
    };
    const el = document.getElementById(map[device]);
    if (el) setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "start" }), 400);
  }, []);

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(160deg,#f8f4ec 0%,#f0e8d8 100%)",
      fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif",
    }}>
      {/* ── Header ── */}
      <header style={{
        background: "linear-gradient(160deg,#0f2040 0%,#1a3260 100%)",
        padding: "18px 20px 14px",
        display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
      }}>
        <img
          src="/brand/padaxor-wordmark-trim.png"
          alt="PADAXOR"
          style={{ height: 28, objectFit: "contain" }}
          draggable={false}
        />
        <p style={{
          margin: 0, color: "#c2a05a",
          fontFamily: "'Cormorant Garamond', Georgia, serif",
          fontWeight: 600, fontSize: "0.95rem", letterSpacing: "0.08em",
        }}>
          Guia Digital do Paciente
        </p>
      </header>

      {/* ── Hero ── */}
      <div style={{
        background: "#1a3260", color: "#fff",
        padding: "20px 20px 22px", textAlign: "center",
      }}>
        <p style={{ margin: 0, fontSize: "1.25rem", fontWeight: 700, lineHeight: 1.4 }}>
          Olá! Aqui você aprende a usar o Instituto Pádua no seu celular e computador 📱💻
        </p>
        <p style={{ margin: "10px 0 0", fontSize: "0.95rem", color: "rgba(255,255,255,0.75)", lineHeight: 1.5 }}>
          Siga os passos do seu dispositivo. É simples e rápido!
        </p>
      </div>

      {/* ── Índice rápido ── */}
      <div style={{ background: "#fff", padding: "14px 20px", borderBottom: "1px solid #e2d8c8" }}>
        <p style={{ margin: "0 0 10px", fontSize: "0.85rem", fontWeight: 700, color: "#6a7a8a", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Ir para:
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {[
            { id: "sec-iphone",     emoji: "🍎", label: "iPhone" },
            { id: "sec-android",    emoji: "🤖", label: "Android" },
            { id: "sec-computador", emoji: "🖥", label: "Computador" },
            { id: "sec-login",      emoji: "🔑", label: "Como entrar" },
            { id: "sec-telegram",   emoji: "✈️", label: "Telegram" },
          ].map(({ id, emoji, label }) => (
            <button
              key={id}
              onClick={() => {
                document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
                const key = id.replace("sec-", "");
                setAberta((p) => ({ ...p, [key]: true }));
              }}
              style={{
                background: "#f0e8d8", border: "1px solid #d5c8a8",
                borderRadius: 20, padding: "6px 14px",
                fontSize: "0.88rem", fontWeight: 600, color: "#1a2e4a",
                cursor: "pointer", display: "flex", alignItems: "center", gap: 5,
              }}
            >
              {emoji} {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Conteúdo ── */}
      <div style={{ maxWidth: 600, margin: "0 auto", padding: "20px 16px 40px" }}>

        {/* Indicador de dispositivo detectado */}
        {device !== "desktop" && (
          <div style={{
            background: "#1a3260", color: "#fff", borderRadius: 10,
            padding: "12px 16px", marginBottom: 18,
            display: "flex", gap: 10, alignItems: "center",
          }}>
            <Smartphone style={{ flexShrink: 0 }} />
            <p style={{ margin: 0, fontSize: "0.9rem", lineHeight: 1.4 }}>
              Detectamos que você está num <strong>{device === "iphone" ? "iPhone" : "celular Android"}</strong>. A seção certa já está aberta para você!
            </p>
          </div>
        )}

        <Secao
          id="sec-iphone" titulo="iPhone" subtitulo="Safari, Chrome ou outro navegador no iPhone"
          emoji="🍎" cor="#2d5be3" aberta={aberta.iphone} onToggle={() => toggle("iphone")}
        >
          <GuiaIphone />
        </Secao>

        <Secao
          id="sec-android" titulo="Android" subtitulo="Chrome, Samsung Browser, Firefox, Edge"
          emoji="🤖" cor="#2d9e5f" aberta={aberta.android} onToggle={() => toggle("android")}
        >
          <GuiaAndroid />
        </Secao>

        <Secao
          id="sec-computador" titulo="Computador" subtitulo="Windows ou Mac — Chrome, Edge, Safari"
          emoji="🖥" cor="#7c3aed" aberta={aberta.computador} onToggle={() => toggle("computador")}
        >
          <GuiaComputador />
        </Secao>

        <Secao
          id="sec-login" titulo="Como entrar na Área do Paciente" subtitulo="CPF + data de nascimento — sem senha"
          emoji="🔑" cor="#c2870a" aberta={aberta.login} onToggle={() => toggle("login")}
        >
          <GuiaLogin />
        </Secao>

        <Secao
          id="sec-telegram" titulo="Telegram — receba mensagens do consultório" subtitulo="Aplicativo gratuito, alternativa ao WhatsApp"
          emoji="✈️" cor="#0088cc" aberta={aberta.telegram} onToggle={() => toggle("telegram")}
        >
          <GuiaTelegram />
        </Secao>

        {/* Footer de contato */}
        <div style={{
          background: "linear-gradient(135deg,#0f2040,#1a3260)",
          borderRadius: 14, padding: "20px 20px",
          textAlign: "center", marginTop: 8,
        }}>
          <p style={{ margin: "0 0 6px", color: "#c2a05a", fontWeight: 700, fontSize: "1.05rem" }}>
            Ficou com dúvida?
          </p>
          <p style={{ margin: 0, color: "rgba(255,255,255,0.80)", fontSize: "0.95rem", lineHeight: 1.5 }}>
            Entre em contato com o Instituto Pádua pelo WhatsApp ou telefone.<br />
            Estamos aqui para ajudar!
          </p>
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            gap: 8, marginTop: 14,
          }}>
            <CheckCircle2 style={{ color: "#c2a05a" }} size={18} />
            <span style={{ color: "#fff", fontSize: "0.85rem", fontWeight: 600, letterSpacing: "0.05em" }}>
              INSTITUTO PÁDUA — Clinical Intelligence System
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
