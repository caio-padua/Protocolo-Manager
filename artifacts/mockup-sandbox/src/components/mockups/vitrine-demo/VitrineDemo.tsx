import "../area-cliente/_group.css";
import { useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowRight,
  BadgeCheck,
  Calendar,
  ChevronRight,
  Crown,
  Download,
  FileText,
  FlaskConical,
  HeartPulse,
  Lock,
  Plus,
  Share2,
  Smartphone,
  Sparkles,
  Stethoscope,
  TestTube2,
  Upload,
  X,
} from "lucide-react";
import { PaxterSymbolPremium } from "../_shared/PaxterSymbolPremium";
import { LOCKUP_STYLE, PaxterWord } from "../_shared/paxterLockup";

/* ----------------------------------------------------------------------------
   VITRINE / DEMONSTRAÇÃO PÚBLICA (prospect) — decisão B do CEO (26/06/2026).
   Ajuste do CEO (26/06/2026): tecido de TERNO NAVY como FUNDO de tudo (invertido);
   demo CLICÁVEL (amostra do app com abas); moldura de celular mostrando "como vai
   ser o aplicativo"; botão "INSTALAR O APLICATIVO" (PWA).
   Página pública, SÓ LEITURA, dados de EXEMPLO, sem login, sem PII real.
---------------------------------------------------------------------------- */

const VITRINE_STYLE = `
.suit-navy-bg{
  background-color:#0f1d36;
  background-image:
    repeating-linear-gradient(45deg, rgba(255,255,255,0.035) 0 1.5px, transparent 1.5px 5px),
    repeating-linear-gradient(-45deg, rgba(0,0,0,0.16) 0 1.5px, transparent 1.5px 5px),
    linear-gradient(180deg,#1d3565 0%,#16294a 55%,#0d182b 100%);
}
.gold-hair{border:1px solid rgba(231,205,143,0.28)}
.device{
  border-radius:30px;
  background:linear-gradient(180deg,#070f1f,#020611);
  padding:9px;
  box-shadow:0 22px 48px -16px rgba(0,0,0,0.8), inset 0 0 0 1px rgba(231,205,143,0.22);
}
.device-screen{
  border-radius:22px;
  overflow:hidden;
  background:hsl(40 33% 96%);
  background-image:
    repeating-linear-gradient(45deg, rgba(120,90,30,0.045) 0 1.5px, transparent 1.5px 4px);
}
.device-notch{height:22px;display:flex;align-items:center;justify-content:center}
.device-notch::before{content:"";width:80px;height:6px;border-radius:4px;background:#070f1f}
@keyframes ctaGlow{0%,100%{box-shadow:0 6px 18px -6px rgba(7,22,43,0.55)}50%{box-shadow:0 6px 28px -4px rgba(231,205,143,0.75)}}
.cta-glow{animation:ctaGlow 3000ms ease-in-out infinite}
@media (prefers-reduced-motion: reduce){.cta-glow{animation:none}}
.tab-on{background:linear-gradient(180deg,#e7cd8f,#c2a05a);color:#3a2c08;box-shadow:inset 0 1px 0 rgba(255,255,255,0.5)}
.tab-off{background:rgba(7,22,43,0.06);color:#5b6b80}
.fade-in{animation:fadeIn 260ms ease}
@keyframes fadeIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
`;

const TIERS = [
  { nome: "BRONZE", essencia: "O cuidado essencial do seu protocolo." },
  { nome: "OURO", essencia: "Acompanhamento ampliado e prioridade no atendimento." },
  { nome: "PLATINA", essencia: "Concierge dedicada e mais solicitações inclusas." },
  { nome: "NOIR", essencia: "Tudo incluso. O círculo mais reservado." },
];

const PILARES = [
  { Icon: HeartPulse, t: "Protocolos sob medida", s: "Injetáveis para a sua longevidade" },
  { Icon: Stethoscope, t: "Equipe dedicada", s: "Médico e enfermagem em cada sessão" },
  { Icon: TestTube2, t: "Exames inteligentes", s: "Leitura guiada por IA clínica" },
  { Icon: FileText, t: "Documentos na palma", s: "Receitas e laudos quando precisar" },
];

const TABS = [
  { id: "protocolos", rotulo: "Protocolo", Icon: Activity },
  { id: "agenda", rotulo: "Agenda", Icon: Calendar },
  { id: "exames", rotulo: "Exames", Icon: TestTube2 },
  { id: "docs", rotulo: "Documentos", Icon: FileText },
] as const;

function Segmentos({ feitas, total }: { feitas: number; total: number }) {
  return (
    <div className="flex gap-[3px]">
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className="h-[10px] flex-1"
          style={{
            background: i < feitas ? "linear-gradient(180deg,#e7cd8f,#c2a05a)" : "rgba(7,22,43,0.12)",
            boxShadow: i < feitas ? "inset 0 1px 0 rgba(255,255,255,0.4)" : "inset 0 1px 2px rgba(7,22,43,0.18)",
          }}
        />
      ))}
    </div>
  );
}

function AppPreview() {
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("protocolos");
  return (
    <div className="device mx-auto w-[260px]">
      <div className="device-screen">
        <div className="device-notch" />
        {/* top bar do app */}
        <div className="flex items-center justify-center gap-1.5 px-3 pb-2 pt-1">
          <PaxterSymbolPremium size={16} tone="light" />
          <PaxterWord theme="light" fontSize={13} />
        </div>

        {/* abas clicáveis */}
        <div className="grid grid-cols-4 gap-[3px] px-2">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex flex-col items-center gap-0.5 py-1.5 text-[8px] font-bold uppercase tracking-[0.04em] ${tab === t.id ? "tab-on" : "tab-off"}`}
            >
              <t.Icon className="h-3.5 w-3.5" />
              {t.rotulo}
            </button>
          ))}
        </div>

        {/* conteúdo da aba */}
        <div className="min-h-[210px] px-3 pb-3 pt-2">
          {tab === "protocolos" && (
            <div className="fade-in">
              <div className="text-[10px] font-bold text-[#16294a]">Longevidade & Energia</div>
              <div className="mt-1.5"><Segmentos feitas={4} total={8} /></div>
              <div className="mt-1 text-[8px] text-[#9a7b32]">4 de 8 sessões</div>
              {["NAD+ 100mg", "Glutationa 600mg", "Vitamina D 50.000UI"].map((s) => (
                <div key={s} className="mt-2 flex items-center gap-2 bg-white/70 px-2 py-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ background: "#3d7a7a" }} />
                  <span className="text-[9px] font-medium text-[#16294a]">{s}</span>
                </div>
              ))}
            </div>
          )}
          {tab === "agenda" && (
            <div className="fade-in">
              <div className="bg-white/75 px-2.5 py-2" style={{ borderLeft: "3px solid #45b8cc" }}>
                <div className="text-[8px] font-bold uppercase tracking-wide text-[#45b8cc]">Próxima sessão</div>
                <div className="mt-0.5 text-[11px] font-bold text-[#16294a]">Quinta, 02/07 · 14h30</div>
                <div className="text-[9px] text-[#5b6b80]">Endovenosa · 30 min · Clínica Tatuapé</div>
              </div>
              <div className="mt-2 bg-white/55 px-2.5 py-2" style={{ borderLeft: "3px solid rgba(7,22,43,0.2)" }}>
                <div className="text-[10px] font-medium text-[#16294a]">Quinta, 09/07 · 14h30</div>
                <div className="text-[9px] text-[#5b6b80]">5ª sessão</div>
              </div>
            </div>
          )}
          {tab === "exames" && (
            <div className="fade-in">
              <div className="concave-3d flex flex-col items-center gap-1.5 px-3 py-4 text-center">
                <Upload className="h-6 w-6 text-[#9a7b32]" />
                <div className="text-[10px] font-bold text-[#16294a]">Enviar exame</div>
                <div className="text-[8px] leading-snug text-[#5b6b80]">Fotografe ou anexe — vai direto para a sua pasta segura.</div>
              </div>
              <div className="mt-2 flex items-center gap-2 bg-white/70 px-2 py-1.5">
                <FlaskConical className="h-3.5 w-3.5 text-[#3d7a7a]" />
                <span className="text-[9px] text-[#16294a]">Hemograma · 12/06 · lido</span>
              </div>
            </div>
          )}
          {tab === "docs" && (
            <div className="fade-in">
              {[
                { t: "Receita — Protocolo Longevidade", d: "20/06" },
                { t: "Laudo — Avaliação inicial", d: "05/06" },
                { t: "Termo de consentimento", d: "05/06" },
              ].map((d) => (
                <div key={d.t} className="mt-2 flex items-center justify-between bg-white/70 px-2 py-1.5">
                  <div className="flex items-center gap-2">
                    <FileText className="h-3.5 w-3.5 text-[#9a7b32]" />
                    <span className="text-[9px] font-medium text-[#16294a]">{d.t}</span>
                  </div>
                  <span className="text-[8px] text-[#5b6b80]">{d.d}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function InstallSheet({ onClose }: { onClose: () => void }) {
  const [plat, setPlat] = useState<"ios" | "android">("ios");
  useEffect(() => {
    const ua = navigator.userAgent || "";
    if (/android/i.test(ua)) setPlat("android");
  }, []);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: "rgba(4,10,22,0.6)" }} onClick={onClose}>
      <div className="suit-navy-bg gold-hair w-full max-w-[430px] px-5 pb-6 pt-4 fade-in" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Smartphone className="h-5 w-5 text-[#e7cd8f]" />
            <span className="text-[14px] font-bold uppercase tracking-[0.1em] text-white">Instalar o aplicativo</span>
          </div>
          <button onClick={onClose} className="text-slate-300"><X className="h-5 w-5" /></button>
        </div>

        {/* seletor de plataforma (retangular) */}
        <div className="grid grid-cols-2 gap-[3px]">
          <button onClick={() => setPlat("ios")} className={`py-2 text-[12px] font-bold uppercase tracking-wide ${plat === "ios" ? "tab-on" : "tab-off"}`}>iPhone</button>
          <button onClick={() => setPlat("android")} className={`py-2 text-[12px] font-bold uppercase tracking-wide ${plat === "android" ? "tab-on" : "tab-off"}`}>Android</button>
        </div>

        {plat === "ios" ? (
          <div className="mt-3 flex flex-col gap-2 fade-in">
            {[
              { Icon: Share2, t: "Toque em Compartilhar", s: "o ícone do quadrado com a seta para cima" },
              { Icon: Plus, t: "Toque em “Adicionar à Tela de Início”", s: "o ícone PAXTER vira um app no seu iPhone" },
            ].map((p, i) => (
              <div key={i} className="suit-navy-bg gold-hair flex items-center gap-3 px-3 py-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-[6px]" style={{ background: "rgba(231,205,143,0.14)" }}>
                  <p.Icon className="h-4 w-4 text-[#e7cd8f]" />
                </div>
                <div>
                  <div className="text-[12px] font-bold text-white">{p.t}</div>
                  <div className="text-[10px] text-slate-300">{p.s}</div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-3 fade-in">
            <button className="btn-3d flex w-full items-center justify-center gap-2 px-4 py-3 text-[13px] font-bold uppercase tracking-[0.08em] text-[#3a2c08]">
              <Download className="h-4 w-4" /> Instalar
            </button>
            <div className="mt-2 text-center text-[10px] leading-snug text-slate-300">
              Demonstração. No aplicativo publicado, o seu Android instala por aqui com um toque.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function VitrineDemo() {
  const [showInstall, setShowInstall] = useState(false);
  const installRef = useRef<HTMLDivElement>(null);

  return (
    <div ref={installRef} className="area-root suit-navy-bg min-h-screen w-full font-sans">
      <style>{LOCKUP_STYLE + VITRINE_STYLE}</style>

      <div className="relative mx-auto w-full max-w-[430px] overflow-hidden suit-navy-bg" style={{ boxShadow: "0 24px 60px -20px rgba(0,0,0,0.8)" }}>
        {/* FITA — MODO DEMONSTRAÇÃO */}
        <div className="flex items-center justify-center gap-2 px-4 py-[6px]" style={{ background: "linear-gradient(90deg,#e7cd8f,#c2a05a)" }}>
          <Sparkles className="h-3.5 w-3.5 text-[#3a2c08]" />
          <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#3a2c08]">Demonstração — exemplo</span>
        </div>

        {/* FAIXA — PAXTER (o sistema) */}
        <div className="flex items-center justify-center gap-2 px-4 py-4 gold-hair" style={{ borderLeft: "none", borderRight: "none", borderTop: "none" }}>
          <PaxterSymbolPremium size={36} tone="dark" />
          <PaxterWord theme="dark" fontSize={24} />
        </div>

        {/* HERO */}
        <div className="px-5 pb-5 pt-6 text-center">
          <div className="font-serif text-[26px] font-bold leading-tight text-white">
            Veja como é ser<br />um cliente PAXTER
          </div>
          <div className="mx-auto mt-3 max-w-[320px] text-[12px] leading-snug text-slate-300">
            Experimente o aplicativo agora. Toque nas abas e sinta a sua jornada na palma da mão.
          </div>
        </div>

        {/* AMOSTRA CLICÁVEL DO APP (moldura de celular) */}
        <div className="px-4 pb-2">
          <AppPreview />
          <div className="mt-2 text-center text-[10px] uppercase tracking-[0.14em] text-[#cbb778]">Toque nas abas acima</div>
        </div>

        <div className="px-4 pb-40 pt-4">
          {/* PILARES */}
          <div className="mb-3 mt-2 inline-flex items-center gap-2 bg-white/90 px-3 py-[6px]">
            <HeartPulse className="h-4 w-4" style={{ color: "#9a7b32" }} />
            <span className="text-[12px] font-bold uppercase tracking-[0.12em] text-[#16294a]">O que você recebe</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {PILARES.map((p) => (
              <div key={p.t} className="screen-3d px-3 py-3">
                <div className="concave-3d mb-2 flex h-9 w-9 items-center justify-center">
                  <p.Icon className="h-5 w-5" style={{ color: "#9a7b32" }} />
                </div>
                <div className="text-[12px] font-bold leading-tight text-[#16294a]">{p.t}</div>
                <div className="mt-1 text-[10px] leading-snug text-[#5b6b80]">{p.s}</div>
              </div>
            ))}
          </div>

          {/* OS CÍRCULOS PAXTER (escada aspiracional, sem preço) */}
          <div className="mb-3 mt-6 inline-flex items-center gap-2 bg-white/90 px-3 py-[6px]">
            <Crown className="h-4 w-4" style={{ color: "#9a7b32" }} />
            <span className="text-[12px] font-bold uppercase tracking-[0.12em] text-[#16294a]">Os Círculos PAXTER</span>
          </div>
          <div className="flex flex-col gap-2">
            {TIERS.map((t, i) => (
              <div key={t.nome} className="gold-hair flex items-center gap-3 px-3 py-3" style={{ background: "rgba(255,255,255,0.05)" }}>
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[6px]" style={{ background: "rgba(231,205,143,0.12)" }}>
                  {i >= 2 ? <Crown className="h-5 w-5" style={{ color: "#e7cd8f" }} /> : <Sparkles className="h-4 w-4" style={{ color: "#cbb778" }} />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-bold tracking-[0.06em] text-white">{t.nome}</div>
                  <div className="text-[11px] leading-snug text-slate-300">{t.essencia}</div>
                </div>
                {i >= 2 && <Lock className="h-4 w-4 shrink-0" style={{ color: "#c2a05a" }} />}
              </div>
            ))}
          </div>

          {/* prova de elegância */}
          <div className="mt-6 flex items-center gap-3 px-4 py-3 gold-hair" style={{ background: "rgba(255,255,255,0.04)" }}>
            <FlaskConical className="h-5 w-5 shrink-0 text-[#e7cd8f]" />
            <span className="text-[11px] leading-snug text-slate-300">
              Cada protocolo é desenhado pela equipe médica — nada de fórmula de prateleira.
            </span>
          </div>
        </div>

        {/* CTA FIXO — INSTALAR + QUERO SER CLIENTE */}
        <div className="sticky bottom-0 suit-navy-bg px-4 py-3 gold-hair" style={{ borderLeft: "none", borderRight: "none", borderBottom: "none", boxShadow: "0 -8px 22px -12px rgba(0,0,0,0.6)" }}>
          <button onClick={() => setShowInstall(true)} className="btn-3d cta-glow flex w-full items-center justify-center gap-2 px-4 py-3 text-[14px] font-bold uppercase tracking-[0.08em] text-[#3a2c08]">
            <Download className="h-4 w-4" /> Instalar o aplicativo
          </button>
          <button className="mt-2 flex w-full items-center justify-center gap-2 px-4 py-3 text-[13px] font-bold uppercase tracking-[0.08em] text-white gold-hair" style={{ background: "rgba(255,255,255,0.06)" }}>
            Quero ser cliente <ArrowRight className="h-4 w-4" />
          </button>
          <button className="mt-2 flex w-full items-center justify-center gap-1 text-center text-[11px] font-bold uppercase tracking-[0.08em] text-[#cbb778]">
            Já sou cliente — entrar <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {showInstall && <InstallSheet onClose={() => setShowInstall(false)} />}
    </div>
  );
}
