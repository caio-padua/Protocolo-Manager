import { vitrineAsset } from "@paxmed/assets";
const paxmedWordmarkArt = { url: vitrineAsset("paxmed_wordmark.png") };
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useIsMobile } from "@paxmed/hooks/use-mobile";
const parxisSymbolAsset = { url: vitrineAsset("paxmed-symbol-hero-champagne.png") };
const parxisWordmarkAsset = { url: vitrineAsset("parxis-wordmark.png") };
const padconLogoAsset = { url: vitrineAsset("padcon-logo-cropped.png") };
const paxmedFooterLogoAsset = { url: vitrineAsset("paxmed-symbol-champagne.png") };
const atelierWideAsset = { url: vitrineAsset("parxis-atelier-wide-padcon.png") };
const ampoulesWideAsset = { url: vitrineAsset("parxis-ampoules-wide-padcon.png") };
const ampoulesAtelierUrl = atelierWideAsset.url;
import { useLang, tr, formatNumber, type Lang } from "@paxmed/contexts/LanguageContext";
import { content } from "@paxmed/content/parxis";
import { GoldCorners } from "@paxmed/components/GoldCorners";
import { LangSwitcher } from "@paxmed/components/LangSwitcher";
import { PaxmedLiveLogo } from "@paxmed/components/PaxmedLiveLogo";

void ampoulesWideAsset;
const heroBg4K = atelierWideAsset;
const heroBgQHD = atelierWideAsset;
const heroBgFHD = atelierWideAsset;
const heroBgTablet = atelierWideAsset;
const heroBgMobile = atelierWideAsset;

const parxisSymbolUrl = parxisSymbolAsset.url;
const parxisWordmarkUrl = parxisWordmarkAsset.url;

/** Metadados da página, iguais aos do projeto de origem. */
export const META = [
      { title: "PAXMED — Inteligência Clínica para Protocolos Injetáveis" },
      {
        name: "description",
        content:
          "PAXMED: inteligência clínica para médicos e clínicas integrativas, da consulta aos protocolos injetáveis.",
      },
      { property: "og:title", content: "PAXMED — Inteligência Clínica para Protocolos Injetáveis" },
      { property: "og:description", content: "Conheça a plataforma PAXMED para médicos e clínicas integrativas." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ];

export function Index() {
  return (
    <main
      className="parxis-app relative min-h-screen text-foreground overflow-x-hidden"
      style={{
        ["--parxis-symbol-url" as string]: `url(${parxisSymbolUrl})`,
        ["--parxis-wordmark-url" as string]: `url(${parxisWordmarkUrl})`,
        ["--parxis-atelier-url" as string]: `url(${ampoulesAtelierUrl})`,
        ["--parxis-wool-url" as string]: `url(${ampoulesAtelierUrl})`,
        ["--parxis-leather-url" as string]: `url(${ampoulesAtelierUrl})`,
        ["--parxis-fixed-url" as string]: `url(${ampoulesAtelierUrl})`,
      }}
    >
      <a
        href="#top"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:px-4 focus:py-2 focus:rounded-md focus:bg-[color:var(--gold)] focus:text-[#0a0505] focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-[color:var(--gold)] focus:ring-offset-2 focus:ring-offset-black"
      >
        Pular para o conteúdo
      </a>
      {/* Camada 1 — couro travado no viewport (background-attachment: fixed).
          Fica atrás de tudo. O Hero, sendo opaco, tapa esta camada na primeira dobra;
          a partir daí, todas as seções são vidro fumê e deixam esta imagem aparecer. */}
      <div className="parxis-fixed-bg" aria-hidden />
      <div className="parxis-fixed-veil" aria-hidden />

      <Nav />
      <Hero />
      <Manifesto />
      <Features />
      <Technology />
      <ForClinics />
      <Testimonial />
      <VideoTestimonials />
      <Ecosystem />
      <Scarcity />
      <CTA />
      <Footer />
    </main>
  );
}

/* ————————————————— NAV ————————————————— */
function Nav() {
  const { lang } = useLang();
  const c = content.nav;
  const link =
    "whitespace-nowrap rounded-sm hover:text-[color:var(--gold)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--gold)] focus-visible:ring-offset-2 focus-visible:ring-offset-black";
  return (
    <header className="fixed top-0 inset-x-0 z-50 backdrop-blur-md bg-[rgba(5,5,5,0.62)] border-b border-[rgba(242,184,23,0.12)]">
      <div className="mx-auto max-w-7xl px-3 sm:px-6 lg:px-10 h-14 sm:h-16 grid grid-cols-[minmax(0,1fr)_auto] xl:flex items-center justify-between gap-3 sm:gap-6">
        <a href="#top" aria-label="PAXMED — ir para o topo" className={"flex items-center gap-3 min-w-0 " + link}>
          <PaxmedLiveLogo />
        </a>
        <nav
          aria-label="Seções"
          className="hidden xl:flex items-center gap-7 text-xs uppercase tracking-[0.2em] text-muted-foreground"
        >
          <a href="#manifesto" className={link}>
            {tr(c.links.manifesto, lang)}
          </a>
          <a href="#recursos" className={link}>
            {tr(c.links.features, lang)}
          </a>
          <a href="#tecnologia" className={link}>
            {tr(c.links.technology, lang)}
          </a>
          <a href="#clinicas" className={link}>
            {tr(c.links.circle, lang)}
          </a>
          <a href="#ecossistema" className={link}>
            {tr(c.links.ecosystem, lang)}
          </a>
        </nav>
        <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
          <ContrastToggle />
          <span className="hidden sm:contents">
            <MotionToggle />
          </span>
          <LangSwitcher />
        </div>
      </div>
      <div className="border-t border-[rgba(242,184,23,0.10)]">
        <div className="mx-auto max-w-7xl px-3 sm:px-6 lg:px-10 py-2 grid grid-cols-2 sm:flex items-center sm:justify-end gap-2 sm:gap-3">
          <AccessLinks />
          <a href="#contato" className="parxis-btn parxis-btn-primary parxis-btn-sm !hidden md:!inline-flex">
            <span className="parxis-btn-inner whitespace-nowrap">{tr(c.cta, lang)}</span>
          </a>
        </div>
      </div>
    </header>
  );
}

/** Acessos B2B (médico/clínica) e B2C (paciente) → site oficial. */
function AccessLinks({ large = false }: { large?: boolean }) {
  const { lang } = useLang();
  const c = content.nav;
  const cls =
    "parxis-btn parxis-btn-ghost " +
    (large ? "" : "parxis-btn-sm !px-2 sm:!px-4 !tracking-[0.08em] sm:!tracking-[0.2em]");
  return (
    <>
      <a href="/login" className={cls}>
        <span className="parxis-btn-inner whitespace-nowrap">
          {large ? (
            tr(c.doctor, lang)
          ) : (
            <>
              <span className="sm:hidden">{lang === "pt" ? "Médico / Clínica" : "Physician / Clinic"}</span>
              <span className="hidden sm:inline">{tr(c.doctor, lang)}</span>
            </>
          )}
        </span>
      </a>
      <a href="/area" className={cls}>
        <span className="parxis-btn-inner whitespace-nowrap">{tr(c.patient, lang)}</span>
      </a>
    </>
  );
}

/* ————————————————— MOTION TOGGLE ————————————————— */
type MotionMode = "full" | "reduce";
function MotionToggle() {
  const { lang } = useLang();
  const [mode, setMode] = useState<MotionMode | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem("parxis-motion") as MotionMode | null;
    const systemReduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const initial: MotionMode = stored ?? (systemReduce ? "reduce" : "full");
    document.documentElement.dataset.motion = initial;
    setMode(initial);
  }, []);

  const toggle = () => {
    const next: MotionMode = mode === "reduce" ? "full" : "reduce";
    document.documentElement.dataset.motion = next;
    localStorage.setItem("parxis-motion", next);
    setMode(next);
  };

  if (mode === null) return null;
  const reduced = mode === "reduce";
  const title = reduced ? tr(content.nav.a11y.motionOff, lang) : tr(content.nav.a11y.motionOn, lang);

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={reduced}
      aria-label={title}
      title={title}
      className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[rgba(242,184,23,0.3)] text-[color:var(--gold)] hover:bg-[rgba(242,184,23,0.08)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--gold)] focus-visible:ring-offset-2 focus-visible:ring-offset-black"
    >
      <svg
        aria-hidden="true"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {reduced ? (
          <>
            <circle cx="12" cy="12" r="9" />
            <path d="M8 12h8" />
          </>
        ) : (
          <>
            <path d="M12 3v3" />
            <path d="M12 18v3" />
            <path d="M5.6 5.6l2.1 2.1" />
            <path d="M16.3 16.3l2.1 2.1" />
            <path d="M3 12h3" />
            <path d="M18 12h3" />
            <path d="M5.6 18.4l2.1-2.1" />
            <path d="M16.3 7.7l2.1-2.1" />
            <circle cx="12" cy="12" r="3.5" />
          </>
        )}
      </svg>
    </button>
  );
}

/* ————————————————— CONTRAST TOGGLE ————————————————— */
type ContrastMode = "normal" | "light";
function ContrastToggle() {
  const { lang } = useLang();
  const [mode, setMode] = useState<ContrastMode | null>(null);

  useEffect(() => {
    const raw = localStorage.getItem("parxis-contrast");
    const stored: ContrastMode | null = raw === "light" || raw === "normal" ? (raw as ContrastMode) : null;
    const initial: ContrastMode = stored ?? "normal";
    document.documentElement.dataset.contrast = initial;
    setMode(initial);
  }, []);

  const toggle = () => {
    const next: ContrastMode = mode === "light" ? "normal" : "light";
    document.documentElement.dataset.contrast = next;
    localStorage.setItem("parxis-contrast", next);
    setMode(next);
  };

  if (mode === null) return null;
  const light = mode === "light";
  const title = light ? tr(content.nav.a11y.contrastOn, lang) : tr(content.nav.a11y.contrastOff, lang);

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={light}
      aria-label={title}
      title={title}
      className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[rgba(242,184,23,0.3)] text-[color:var(--gold)] hover:bg-[rgba(242,184,23,0.08)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--gold)] focus-visible:ring-offset-2 focus-visible:ring-offset-black"
    >
      <svg
        aria-hidden="true"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {light ? (
          <>
            <path d="M12 2v20" />
            <path d="M12 2a10 10 0 0 1 0 20 10 10 0 0 1 0-20z" />
          </>
        ) : (
          <>
            <circle cx="12" cy="12" r="9" />
            <path d="M12 3v18" />
          </>
        )}
      </svg>
    </button>
  );
}

/* ————————————————— HERO ————————————————— */
function Hero() {
  const { lang } = useLang();
  const c = content.hero;
  return (
    <section
      id="top"
      className="parxis-hero relative pt-40 pb-24 lg:pt-48 lg:pb-32 overflow-hidden"
      style={{
        ["--hero-bg-4k" as string]: `url(${heroBg4K.url})`,
        ["--hero-bg-qhd" as string]: `url(${heroBgQHD.url})`,
        ["--hero-bg-fhd" as string]: `url(${heroBgFHD.url})`,
        ["--hero-bg-tablet" as string]: `url(${heroBgTablet.url})`,
        ["--hero-bg-mobile" as string]: `url(${heroBgMobile.url})`,
      }}
    >
      <ParallaxPanels />
      <GoldCorners inset={20} size={34} thickness={2} />
      <div className="absolute inset-x-8 top-24 parxis-gold-rule opacity-60" />
      <div className="absolute inset-x-8 bottom-8 parxis-gold-rule opacity-40" />

      <div className="mx-auto max-w-7xl px-6 lg:px-10 grid lg:grid-cols-2 gap-16 items-center relative">
        <div className="parxis-reveal">
          <p className="parxis-enter parxis-enter-1 text-[10px] md:text-xs uppercase tracking-[0.42em] text-[color:var(--gold)] mb-8">
            {tr(c.eyebrow, lang)}
          </p>
          <h1 className="parxis-enter parxis-enter-2 font-serif text-5xl md:text-6xl lg:text-7xl leading-[1.02] tracking-tight">
            {tr(c.titlePre, lang)} <span className="parxis-gold-text italic">{tr(c.titleGold, lang)}</span>
            {tr(c.titlePost, lang)}
          </h1>
          <div className="parxis-enter parxis-enter-3 parxis-gold-rule w-32 my-10" />
          <p className="parxis-enter parxis-enter-3 text-base md:text-lg text-muted-foreground leading-relaxed max-w-xl font-light">
            {tr(c.lead, lang)}
          </p>

          <div className="parxis-enter parxis-enter-4 mt-12 flex flex-wrap gap-4">
            <a href="#contato" className="parxis-btn parxis-btn-primary group">
              <span className="parxis-btn-inner">
                {tr(c.ctaPrimary, lang)}
                <span aria-hidden className="transition-transform group-hover:translate-x-1">
                  →
                </span>
              </span>
            </a>
          </div>
          <div className="parxis-enter parxis-enter-4 mt-5 flex flex-wrap gap-3">
            <AccessLinks large />
          </div>

          <div className="parxis-enter parxis-enter-4 mt-14 grid grid-cols-3 gap-6 max-w-md">
            {c.stats.map((it, i) => (
              <div key={i}>
                <div className="font-serif text-3xl text-[color:var(--gold)]">{tr(it.k, lang)}</div>
                <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mt-1 leading-snug">
                  {tr(it.v, lang)}
                </div>
              </div>
            ))}
          </div>
        </div>

        <ParxisMonogram />
      </div>
    </section>
  );
}

/* ————————————————— PAINÉIS PARALLAX ————————————————— */
function ParallaxPanels() {
  const panelRefs = useRef<(HTMLDivElement | null)[]>([]);
  const rafRef = useRef(0);
  const isMobile = useIsMobile();
  const amplitude = isMobile ? 0.42 : 1;
  const lerp = isMobile ? 0.08 : 0.12;
  const speeds = isMobile ? [0.09, -0.13, 0.17, -0.07, 0.04] : [0.22, -0.32, 0.42, -0.18, 0.1];

  useEffect(() => {
    if (document.documentElement.dataset.motion === "reduce") return;
    let targetY = 0;
    let currentY = 0;
    const onScroll = () => {
      targetY = window.scrollY;
    };
    const tick = () => {
      currentY += (targetY - currentY) * lerp;
      panelRefs.current.forEach((el, i) => {
        if (el) {
          const y = currentY * speeds[i] * amplitude;
          el.style.transform = i === 4 ? `translate(-50%, ${y}px)` : `translateY(${y}px)`;
        }
      });
      rafRef.current = requestAnimationFrame(tick);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(rafRef.current);
    };
  }, [amplitude, lerp, speeds]);

  return (
    <div className="parxis-panels" aria-hidden>
      {[...Array(5)].map((_, i) => (
        <div
          key={i}
          ref={(el) => {
            panelRefs.current[i] = el;
          }}
          className={`parxis-panel parxis-panel-${i + 1}`}
        />
      ))}
    </div>
  );
}

/* ————————————————— MONOGRAMA ————————————————— */
function ParxisMonogram() {
  const stageRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    let raf = 0;
    let targetX = 0,
      targetY = 0,
      curX = 0,
      curY = 0;
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      targetX = ((e.clientX - r.left) / r.width - 0.5) * 2;
      targetY = ((e.clientY - r.top) / r.height - 0.5) * 2;
    };
    const onLeave = () => {
      targetX = 0;
      targetY = 0;
    };
    const tick = () => {
      curX += (targetX - curX) * 0.08;
      curY += (targetY - curY) * 0.08;
      el.style.setProperty("--mx", curX.toFixed(3));
      el.style.setProperty("--my", curY.toFixed(3));
      raf = requestAnimationFrame(tick);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerleave", onLeave);
    tick();
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return (
    <div
      ref={stageRef}
      className="parxis-stage relative flex items-center justify-center min-h-[560px] lg:min-h-[640px]"
      aria-label="PAXMED"
    >
      <div className="parxis-halo-conic" aria-hidden />
      <div className="parxis-aura parxis-aura-1" aria-hidden />
      <div className="parxis-aura parxis-aura-2" aria-hidden />
      <div className="parxis-ring" aria-hidden />
      <div className="parxis-particles" aria-hidden>
        {Array.from({ length: 14 }).map((_, i) => (
          <span key={i} style={{ ["--i" as string]: i }} />
        ))}
      </div>
      <div className="parxis-symbol-wrap" aria-hidden>
        <div className="parxis-symbol-tilt">
          <div className="parxis-symbol-levitate">
            <div className="parxis-symbol-img" role="img" aria-label="Símbolo PAXMED" />
            <div className="parxis-symbol-sheen" aria-hidden />
          </div>
          <div className="parxis-shadow" aria-hidden />
          <div className="parxis-surface" aria-hidden />
        </div>
      </div>
      <div
        className="parxis-wordmark paxmed-wordmark-art"
        role="img"
        aria-label="PAXMED"
        style={{ backgroundImage: `url(${paxmedWordmarkArt.url})` }}
      />
    </div>
  );
}

/* ————————————————— MANIFESTO ————————————————— */
function Manifesto() {
  const { lang } = useLang();
  const c = content.manifesto;
  return (
    <section id="manifesto" className="parxis-glass relative py-28 lg:py-40">
      <div className="mx-auto max-w-4xl px-6 lg:px-10 text-center">
        <p className="text-[10px] uppercase tracking-[0.42em] text-[color:var(--gold)] mb-8">{tr(c.eyebrow, lang)}</p>
        <h2 className="font-serif text-3xl md:text-5xl leading-tight text-foreground">
          {tr(c.titlePre, lang)}
          <em className="parxis-gold-text not-italic">{tr(c.titleGold, lang)}</em>
          {tr(c.titlePost, lang)}
        </h2>
        <div className="parxis-gold-rule w-40 mx-auto my-10" />
        <p className="text-lg md:text-xl text-muted-foreground font-light leading-relaxed">{tr(c.body, lang)}</p>
      </div>
    </section>
  );
}

/* ————————————————— FEATURES ————————————————— */
function Features() {
  const { lang } = useLang();
  const c = content.features;
  return (
    <section id="recursos" className="parxis-glass parxis-glass-frame relative py-28 lg:py-36">
      <div className="parxis-bordo-stitch-frame" aria-hidden />
      <div className="mx-auto max-w-7xl px-6 lg:px-10">
        <div className="max-w-3xl mb-20">
          <p className="text-[10px] uppercase tracking-[0.42em] text-[color:var(--gold)] mb-6">{tr(c.eyebrow, lang)}</p>
          <h2 className="font-serif text-4xl md:text-5xl leading-tight">
            {tr(c.titlePre, lang)}
            <em className="parxis-gold-text not-italic">{tr(c.titleGold, lang)}</em>
            {tr(c.titlePost, lang)}
          </h2>
          <div className="parxis-gold-rule w-32 mt-8" />
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
          {c.items.map((f) => (
            <article key={f.n} className="parxis-card rounded-lg p-8 lg:p-10">
              <div className="font-serif text-[color:var(--gold)] text-sm tracking-[0.4em] mb-6">{f.n}</div>
              <h3 className="font-serif text-2xl leading-snug mb-4">{tr(f.title, lang)}</h3>
              <div className="parxis-gold-rule w-12 mb-5 opacity-60" />
              <p className="text-sm text-muted-foreground leading-relaxed font-light">{tr(f.body, lang)}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ————————————————— TECHNOLOGY ————————————————— */
function Technology() {
  const { lang } = useLang();
  const c = content.technology;
  return (
    <section id="tecnologia" className="parxis-glass relative py-28 lg:py-36">
      <div className="mx-auto max-w-6xl px-6 lg:px-10">
        <div className="text-center mb-20">
          <p className="text-[10px] uppercase tracking-[0.42em] text-[color:var(--gold)] mb-6">{tr(c.eyebrow, lang)}</p>
          <h2 className="font-serif text-4xl md:text-5xl leading-tight max-w-3xl mx-auto">
            {tr(c.titlePre, lang)}
            <em className="parxis-gold-text not-italic">{tr(c.titleGold, lang)}</em>
            {tr(c.titlePost, lang)}
          </h2>
          <div className="parxis-gold-rule w-32 mx-auto mt-8" />
        </div>
        <dl className="grid md:grid-cols-2 gap-x-16 gap-y-10">
          {c.items.map((t, i) => (
            <div key={i} className="border-l border-[rgba(242,184,23,0.25)] pl-6">
              <dt className="font-serif text-lg text-[color:var(--gold)]">{tr(t.term, lang)}</dt>
              <dd className="mt-2 text-sm text-muted-foreground leading-relaxed font-light">{tr(t.desc, lang)}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

/* ————————————————— FOR CLINICS ————————————————— */
function ForClinics() {
  const { lang } = useLang();
  const c = content.circle;
  return (
    <section id="clinicas" className="parxis-glass parxis-glass-frame relative py-28 lg:py-36">
      <div className="parxis-bordo-stitch-frame" aria-hidden />
      <div className="mx-auto max-w-7xl px-6 lg:px-10">
        <div className="max-w-3xl mb-20">
          <p className="text-[10px] uppercase tracking-[0.42em] text-[color:var(--gold)] mb-6">{tr(c.eyebrow, lang)}</p>
          <h2 className="font-serif text-4xl md:text-5xl leading-tight">
            {tr(c.titlePre, lang)}
            <em className="parxis-gold-text not-italic">{tr(c.titleGold, lang)}</em>
            {tr(c.titlePost, lang)}
          </h2>
          <p className="mt-6 text-base md:text-lg text-muted-foreground font-light leading-relaxed max-w-2xl">
            {tr(c.lead, lang)}
          </p>
        </div>
        <div className="grid md:grid-cols-3 gap-6 lg:gap-8">
          {c.steps.map((s, i) => (
            <article key={i} className="parxis-card rounded-lg p-10 flex flex-col">
              <h3 className="font-serif text-2xl mb-3">{tr(s.title, lang)}</h3>
              <p className="text-sm text-[color:var(--gold)] leading-relaxed mb-4">{tr(s.lead, lang)}</p>
              <div className="parxis-gold-rule w-16 mb-6 opacity-60" />
              <p className="text-sm text-muted-foreground font-light leading-relaxed">{tr(s.body, lang)}</p>
            </article>
          ))}
        </div>
        <div className="mt-16 parxis-card rounded-lg p-10 md:p-12 flex flex-col md:flex-row items-center gap-8">
          <div className="flex-1">
            <h4 className="font-serif text-2xl md:text-3xl mb-3">{tr(c.smallByChoice.title, lang)}</h4>
            <p className="text-sm md:text-base text-muted-foreground font-light leading-relaxed">
              {tr(c.smallByChoice.body, lang)}
            </p>
          </div>
          <div className="shrink-0 text-center md:text-right">
            <div className="font-serif text-5xl text-[color:var(--gold)]">{tr(c.smallByChoice.count, lang)}</div>
            <div className="text-[10px] uppercase tracking-[0.32em] text-muted-foreground mt-1">
              {tr(c.smallByChoice.unit, lang)}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ————————————————— TESTIMONIAL ————————————————— */
function Testimonial() {
  const { lang } = useLang();
  const c = content.testimonial;
  return (
    <section className="parxis-glass relative py-32 lg:py-44 overflow-hidden">
      <div className="mx-auto max-w-4xl px-6 lg:px-10 text-center">
        <div className="font-serif text-[color:var(--gold)] text-6xl mb-6 opacity-60">“</div>
        <p className="font-serif text-2xl md:text-3xl leading-relaxed italic text-foreground">{tr(c.quote, lang)}</p>
        <div className="parxis-gold-rule w-24 mx-auto my-10" />
        <div className="text-sm uppercase tracking-[0.32em] text-[color:var(--gold)]">{tr(c.name, lang)}</div>
        <div className="text-xs uppercase tracking-[0.28em] text-muted-foreground mt-2">{tr(c.role, lang)}</div>
      </div>
    </section>
  );
}

/* ————————————————— VIDEO TESTIMONIALS ————————————————— */
function VideoTestimonials() {
  const { lang } = useLang();
  const c = content.videos;
  const trackRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  const scrollTo = (i: number) => {
    const el = trackRef.current;
    if (!el) return;
    const card = el.children[i] as HTMLElement | undefined;
    if (!card) return;
    el.scrollTo({ left: card.offsetLeft - el.offsetLeft, behavior: "smooth" });
  };

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const onScroll = () => {
      const cards = Array.from(el.children) as HTMLElement[];
      const center = el.scrollLeft + el.clientWidth / 2;
      let best = 0,
        bestDist = Infinity;
      cards.forEach((cd, i) => {
        const cc = cd.offsetLeft + cd.clientWidth / 2 - el.offsetLeft;
        const d = Math.abs(cc - center);
        if (d < bestDist) {
          bestDist = d;
          best = i;
        }
      });
      setActive(best);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <section className="parxis-glass parxis-glass-frame relative py-28 lg:py-40 overflow-hidden">
      <div className="parxis-bordo-stitch-frame parxis-stitch-on-leather" aria-hidden />
      <div className="mx-auto max-w-7xl px-6 lg:px-10 relative">
        <div className="text-center mb-14">
          <p className="text-[10px] uppercase tracking-[0.42em] text-[color:var(--gold)] mb-6">{tr(c.eyebrow, lang)}</p>
          <h2 className="font-serif text-3xl md:text-5xl leading-tight">
            {tr(c.titlePre, lang)}
            <em className="parxis-gold-text not-italic">{tr(c.titleGold, lang)}</em>
            {tr(c.titlePost, lang)}
          </h2>
          <div className="parxis-gold-rule w-32 mx-auto mt-8" />
        </div>
        <div ref={trackRef} className="parxis-video-track">
          {c.items.map((v, i) => (
            <article key={v.id} className={`parxis-video-card ${i === active ? "is-active" : ""}`}>
              <button
                type="button"
                className="parxis-video-play"
                aria-label={`${tr(c.playAria, lang)} ${tr(v.title, lang)}`}
              >
                <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden>
                  <path d="M8 5v14l11-7z" fill="currentColor" />
                </svg>
              </button>
              <div className="parxis-video-meta">
                <div className="font-serif text-xl text-[color:var(--gold)]">{tr(v.title, lang)}</div>
                <div className="text-[10px] uppercase tracking-[0.32em] text-muted-foreground mt-2">
                  {tr(v.role, lang)}
                </div>
                <p className="mt-4 text-sm text-foreground/80 leading-relaxed italic font-light">
                  "{tr(v.quote, lang)}"
                </p>
              </div>
            </article>
          ))}
        </div>
        <div className="mt-10 flex items-center justify-center gap-3">
          {c.items.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => scrollTo(i)}
              className={`parxis-video-dot ${i === active ? "is-active" : ""}`}
              aria-label={`${tr(c.dotAria, lang)} ${i + 1}`}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

/* ————————————————— ECOSYSTEM ————————————————— */
function Ecosystem() {
  const { lang } = useLang();
  const c = content.ecosystem;
  return (
    <section id="ecossistema" className="parxis-glass relative py-28 lg:py-36">
      <div className="mx-auto max-w-4xl px-6 lg:px-10">
        <div className="parxis-card rounded-lg p-10 md:p-14 text-center relative">
          <GoldCorners inset={14} size={22} thickness={1.5} />
          <p className="text-[10px] uppercase tracking-[0.42em] text-[color:var(--gold)] mb-6">{tr(c.eyebrow, lang)}</p>
          <h2 className="font-serif text-3xl md:text-4xl leading-tight">
            {tr(c.titlePre, lang)}
            <em className="parxis-gold-text not-italic">{tr(c.titleGold, lang)}</em>
            {tr(c.titlePost, lang)}
          </h2>
          <div className="parxis-gold-rule w-24 mx-auto my-8" />
          <p className="text-base md:text-lg text-muted-foreground font-light leading-relaxed max-w-2xl mx-auto">
            {tr(c.body, lang)}
          </p>
          <div className="mt-10">
            <a
              href="https://padcon.replit.app/"
              target="_blank"
              rel="noopener noreferrer"
              className="parxis-btn parxis-btn-ghost"
            >
              <span className="parxis-btn-inner">
                {tr(c.cta, lang)}
                <span aria-hidden>→</span>
              </span>
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ————————————————— SCARCITY ————————————————— */
function Scarcity() {
  const { lang } = useLang();
  const c = content.scarcity;
  const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const deadline = new Date();
    deadline.setDate(deadline.getDate() + 14);
    deadline.setHours(23, 59, 59, 0);

    const calc = () => {
      const diff = deadline.getTime() - Date.now();
      if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0 };
      return {
        days: Math.floor(diff / 86400000),
        hours: Math.floor((diff % 86400000) / 3600000),
        minutes: Math.floor((diff % 3600000) / 60000),
        seconds: Math.floor((diff % 60000) / 1000),
      };
    };
    setTimeLeft(calc());
    const id = setInterval(() => setTimeLeft(calc()), 1000);
    return () => clearInterval(id);
  }, []);

  const slots = [
    { label: tr(c.slotLabels.days, lang), value: timeLeft.days },
    { label: tr(c.slotLabels.hours, lang), value: timeLeft.hours },
    { label: tr(c.slotLabels.minutes, lang), value: timeLeft.minutes },
    { label: tr(c.slotLabels.seconds, lang), value: timeLeft.seconds },
  ];

  return (
    <section className="parxis-glass relative py-20 lg:py-28 overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[720px] h-[720px] rounded-full bg-[color:var(--gold)] opacity-[0.03] blur-3xl" />
      </div>
      <div className="mx-auto max-w-5xl px-6 lg:px-10 relative">
        <div className="parxis-card rounded-2xl p-10 md:p-14 text-center border-[rgba(242,184,23,0.28)]">
          <p className="text-[10px] uppercase tracking-[0.42em] text-[color:var(--gold)] mb-6">{tr(c.eyebrow, lang)}</p>
          <div className="flex flex-col md:flex-row items-center justify-center gap-8 md:gap-12">
            <div className="text-center">
              <div className="font-serif text-6xl md:text-7xl text-[color:var(--gold)]">{tr(c.seats, lang)}</div>
              <div className="text-[10px] uppercase tracking-[0.32em] text-muted-foreground mt-2">
                {tr(c.seatsLabel, lang)}
              </div>
            </div>
            <div className="hidden md:block w-px h-20 bg-[rgba(242,184,23,0.25)]" />
            <div>
              <div className="text-xs uppercase tracking-[0.32em] text-muted-foreground mb-4">
                {tr(c.closingLabel, lang)}
              </div>
              {mounted ? (
                <div className="grid grid-cols-4 gap-3">
                  {slots.map((s) => (
                    <div
                      key={s.label}
                      className="min-w-[64px] px-3 py-4 rounded-lg bg-[rgba(242,184,23,0.08)] border border-[rgba(242,184,23,0.2)]"
                    >
                      <div className="font-serif text-2xl md:text-3xl text-[color:var(--gold)]">
                        {String(s.value).padStart(2, "0")}
                      </div>
                      <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mt-1">{s.label}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="h-[88px] flex items-center justify-center text-muted-foreground text-sm">
                  {tr(c.calculating, lang)}
                </div>
              )}
            </div>
          </div>
          <div className="parxis-gold-rule w-40 mx-auto my-10 opacity-70" />
          <p className="text-sm md:text-base text-muted-foreground font-light leading-relaxed max-w-2xl mx-auto">
            {tr(c.body, lang)}
          </p>
          <div className="mt-10">
            <a href="#contato" className="parxis-btn parxis-btn-primary group">
              <span className="parxis-btn-inner">
                {tr(c.cta, lang)}
                <span aria-hidden className="transition-transform group-hover:translate-x-1">
                  →
                </span>
              </span>
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ————————————————— CTA ————————————————— */
function CTA() {
  const { lang } = useLang();
  const c = content.cta;
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [consent, setConsent] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);

    const payload = {
      nome: String(fd.get("nome") ?? "").trim(),
      email: String(fd.get("email") ?? "").trim(),
      telefone: String(fd.get("telefone") ?? "").trim() || null,
      clinica: String(fd.get("clinica") ?? "").trim(),
      especialidade: String(fd.get("especialidade") ?? "").trim(),
      volume_protocolos: String(fd.get("volume_protocolos") ?? "").trim() || null,
      necessidade: String(fd.get("necessidade") ?? "").trim(),
    };

    if (payload.nome.length < 2 || payload.nome.length > 120) {
      toast.error(tr(c.toasts.nameShort, lang));
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) {
      toast.error(tr(c.toasts.email, lang));
      return;
    }
    if (payload.clinica.length < 2) {
      toast.error(tr(c.toasts.clinic, lang));
      return;
    }
    if (payload.especialidade.length < 2) {
      toast.error(tr(c.toasts.specialty, lang));
      return;
    }
    if (payload.necessidade.length < 5) {
      toast.error(tr(c.toasts.referrer, lang));
      return;
    }
    if (!consent) {
      toast.error(tr(c.toasts.consent, lang));
      return;
    }

    setLoading(true);
    // Mesmo endereço do Manager (nunca um endereço fixo de produção): grava o contato em /api/vitrine-contatos.
    let falhou = false;
    try {
      const resp = await fetch(`${import.meta.env.BASE_URL}api/vitrine-contatos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, source: "paxmed-vitrine" }),
      });
      falhou = !resp.ok;
    } catch {
      falhou = true;
    }
    setLoading(false);

    if (falhou) {
      toast.error(tr(c.toasts.error, lang));
      return;
    }

    toast.success(tr(c.toasts.success, lang));
    form.reset();
    setSubmitted(true);
  }

  return (
    <section id="contato" className="parxis-glass relative py-32 lg:py-40 border-y border-[rgba(242,184,23,0.15)]">
      <div className="mx-auto max-w-3xl px-6 lg:px-10 relative">
        <div className="text-center">
          <p className="text-[10px] uppercase tracking-[0.42em] text-[color:var(--gold)] mb-8">{tr(c.eyebrow, lang)}</p>
          <h2 className="font-serif text-4xl md:text-6xl leading-tight">
            {tr(c.titlePre, lang)}
            <em className="parxis-gold-text not-italic">{tr(c.titleGold, lang)}</em>
            {tr(c.titlePost, lang)}
          </h2>
          <div className="parxis-gold-rule w-40 mx-auto my-10" />
          <p className="text-base md:text-lg text-muted-foreground font-light leading-relaxed max-w-xl mx-auto">
            {tr(c.lead, lang)}
          </p>
        </div>

        {submitted ? (
          <div className="mt-14 parxis-card rounded-lg p-10 text-center">
            <div className="font-serif text-[color:var(--gold)] text-5xl mb-6 opacity-70">✦</div>
            <h3 className="font-serif text-2xl md:text-3xl mb-4">{tr(c.submitted.title, lang)}</h3>
            <p className="text-sm text-muted-foreground font-light leading-relaxed max-w-md mx-auto">
              {tr(c.submitted.body, lang)}
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-14 parxis-card rounded-lg p-8 md:p-10 text-left relative">
            <GoldCorners inset={10} size={18} thickness={1.5} />
            <div className="grid md:grid-cols-2 gap-5">
              <LeadField
                label={tr(c.fields.name, lang)}
                name="nome"
                required
                autoComplete="name"
                placeholder={tr(c.fields.namePh, lang)}
              />
              <LeadField
                label={tr(c.fields.email, lang)}
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder={tr(c.fields.emailPh, lang)}
              />
              <LeadField
                label={tr(c.fields.phone, lang)}
                name="telefone"
                type="tel"
                autoComplete="tel"
                placeholder={tr(c.fields.phonePh, lang)}
              />
              <LeadField
                label={tr(c.fields.clinic, lang)}
                name="clinica"
                required
                placeholder={tr(c.fields.clinicPh, lang)}
              />
              <div className="md:col-span-1">
                <label className="block text-[10px] uppercase tracking-[0.32em] text-[color:var(--gold)] mb-2">
                  {tr(c.fields.specialty, lang)}
                </label>
                <select
                  name="especialidade"
                  required
                  defaultValue=""
                  className="w-full bg-transparent border border-[rgba(242,184,23,0.35)] rounded-md px-4 py-3 text-sm text-foreground focus:outline-none focus:border-[color:var(--gold)] transition-colors"
                >
                  <option value="" disabled className="bg-[#120505]">
                    {tr(c.fields.selectPh, lang)}
                  </option>
                  {c.specialties.map((opt, i) => (
                    <option key={i} value={tr(opt, lang)} className="bg-[#120505]">
                      {tr(opt, lang)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-1">
                <label className="block text-[10px] uppercase tracking-[0.32em] text-[color:var(--gold)] mb-2">
                  {tr(c.fields.volume, lang)}
                </label>
                <select
                  name="volume_protocolos"
                  defaultValue=""
                  className="w-full bg-transparent border border-[rgba(242,184,23,0.35)] rounded-md px-4 py-3 text-sm text-foreground focus:outline-none focus:border-[color:var(--gold)] transition-colors"
                >
                  <option value="" className="bg-[#120505]">
                    {tr(c.fields.selectOptional, lang)}
                  </option>
                  {c.volumes.map((opt, i) => (
                    <option key={i} value={tr(opt, lang)} className="bg-[#120505]">
                      {tr(opt, lang)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="block text-[10px] uppercase tracking-[0.32em] text-[color:var(--gold)] mb-2">
                  {tr(c.fields.referrer, lang)}
                </label>
                <textarea
                  name="necessidade"
                  required
                  rows={4}
                  maxLength={2000}
                  placeholder={tr(c.fields.referrerPh, lang)}
                  className="w-full bg-transparent border border-[rgba(242,184,23,0.35)] rounded-md px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-[color:var(--gold)] transition-colors resize-none"
                />
              </div>
            </div>

            <div className="mt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
              <p className="text-[10px] uppercase tracking-[0.32em] text-muted-foreground">
                {tr(c.confidential, lang)}
              </p>
              <button
                type="submit"
                disabled={loading}
                className="parxis-btn parxis-btn-primary disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <span className="parxis-btn-inner">
                  {loading ? tr(c.sending, lang) : tr(c.submit, lang)}
                  {!loading && <span aria-hidden>→</span>}
                </span>
              </button>
            </div>
          </form>
        )}

        <p className="mt-6 text-[10px] uppercase tracking-[0.32em] text-muted-foreground">{tr(c.afterHint, lang)}</p>

        <div className="mt-10 parxis-card rounded-lg p-8 md:p-10 text-left">
          <h3 className="font-serif text-xl mb-5">{tr(c.terms.title, lang)}</h3>
          <div className="parxis-gold-rule w-16 mb-6 opacity-60" />
          <ul className="space-y-3 text-xs md:text-sm text-muted-foreground font-light leading-relaxed mb-6">
            {c.terms.items.map((it, i) => (
              <li key={i} className="flex gap-3">
                <span aria-hidden className="text-[color:var(--gold)] mt-0.5">
                  ✦
                </span>
                <span>{tr(it, lang)}</span>
              </li>
            ))}
          </ul>
          <label className="flex items-start gap-3 cursor-pointer group">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-1 h-4 w-4 accent-[color:var(--gold)] rounded border border-[rgba(242,184,23,0.45)] bg-transparent cursor-pointer"
            />
            <span className="text-xs text-muted-foreground font-light leading-relaxed">
              {tr(c.terms.consent, lang)}
              <span className="text-[color:var(--gold)]">{tr(c.terms.email, lang)}</span>.
            </span>
          </label>
        </div>
      </div>
    </section>
  );
}

function LeadField({
  label,
  name,
  type = "text",
  required,
  placeholder,
  autoComplete,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
  autoComplete?: string;
}) {
  return (
    <div>
      <label className="block text-[10px] uppercase tracking-[0.32em] text-[color:var(--gold)] mb-2">
        {label}
        {required && <span className="text-[color:var(--gold)]/60"> ·</span>}
      </label>
      <input
        type={type}
        name={name}
        required={required}
        placeholder={placeholder}
        autoComplete={autoComplete}
        maxLength={200}
        className="w-full bg-transparent border border-[rgba(242,184,23,0.35)] rounded-md px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-[color:var(--gold)] transition-colors"
      />
    </div>
  );
}

/* ————————————————— FOOTER ————————————————— */
function Footer() {
  const { lang } = useLang();
  const c = content.footer;
  const cols = c.columns;
  const columnData = [cols.house, cols.contact, cols.standards, cols.register];
  return (
    <footer className="bg-[color:var(--obsidian)] py-20 relative z-10">
      <div className="mx-auto max-w-7xl px-6 lg:px-10">
        {/* Brand row — each logo + wordmark pair locked to the same baseline/center midpoint */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-8 items-center pb-12 border-b border-[rgba(242,184,23,0.18)]">
          {/* LEFT — PAXMED symbol on far left, text midpoint aligned to the logo's midpoint */}
          <div className="flex items-center justify-center md:justify-start gap-5 md:gap-8 h-[110px] sm:h-[128px] md:h-[144px]">
            <div className="h-[92px] sm:h-[108px] md:h-[124px] flex items-center justify-center shrink-0">
              <img
                src={paxmedFooterLogoAsset.url}
                alt="PAXMED"
                className="h-full w-auto shrink-0 select-none object-contain"
                draggable={false}
              />
            </div>
            <div className="h-full flex flex-col items-center justify-center text-center leading-tight font-serif">
              <div className="font-sans text-[8px] sm:text-[9px] uppercase tracking-[0.32em] text-muted-foreground/70 mb-2">
                {lang === "pt" ? "Sistema de Inteligência Clínica" : "Clinical Intelligence System"}
              </div>
              <div className="font-serif font-semibold text-[18px] sm:text-[20px] md:text-[24px] tracking-[0.14em] bg-gradient-to-b from-[#F2E1B8] via-[#C9A96E] to-[#8C6E2E] bg-clip-text text-transparent drop-shadow-[0_1px_10px_rgba(201,169,110,0.35)] leading-none">
                PAXMED<span className="align-super text-[9px] sm:text-[10px] ml-0.5 text-[#C9A96E]">®</span>
              </div>
              <div className="font-serif text-[10px] sm:text-[11px] md:text-[12px] tracking-[0.08em] text-[#C9A96E]/75 whitespace-nowrap mt-1">
                Clinical Intelligence System
              </div>
            </div>
          </div>
          {/* RIGHT — PADCON symbol on far right, text midpoint aligned to the logo's midpoint */}
          <div className="flex items-center justify-center md:justify-end gap-5 md:gap-8 h-[110px] sm:h-[128px] md:h-[144px]">
            <div className="h-full flex flex-col items-center justify-center text-center leading-tight font-serif">
              <div className="font-sans text-[8px] sm:text-[9px] uppercase tracking-[0.32em] text-muted-foreground/70 mb-2">
                {lang === "pt" ? "Desenvolvido sob a Plataforma" : "Developed on the Platform"}
              </div>
              <div className="flex items-baseline justify-center gap-1.5">
                <div className="font-serif font-semibold text-[18px] sm:text-[20px] md:text-[24px] tracking-[0.14em] bg-gradient-to-b from-[#F2E1B8] via-[#C9A96E] to-[#8C6E2E] bg-clip-text text-transparent drop-shadow-[0_1px_10px_rgba(201,169,110,0.35)] leading-none">
                  PADCON<span className="align-super text-[9px] sm:text-[10px] ml-0.5 text-[#C9A96E]">®</span>
                </div>
                <div className="font-serif italic text-[16px] sm:text-[18px] md:text-[22px] tracking-[0.06em] bg-gradient-to-b from-[#F2E1B8] via-[#C9A96E] to-[#8C6E2E] bg-clip-text text-transparent leading-none">
                  Platform
                </div>
              </div>
              <div className="font-serif text-[10px] sm:text-[11px] md:text-[12px] tracking-[0.08em] text-[#C9A96E]/75 whitespace-nowrap mt-1">
                Advanced Systems Architecture
              </div>
            </div>
            <div className="h-[78px] sm:h-[92px] md:h-[106px] flex items-center justify-center shrink-0">
              <img
                src={padconLogoAsset.url}
                alt="PADCON"
                className="h-full w-auto shrink-0 select-none object-contain"
                draggable={false}
              />
            </div>
          </div>
        </div>

        {/* Four aligned data columns */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-10 md:gap-8 py-12">
          {columnData.map((col, i) => (
            <div key={i} className="min-w-0">
              <div className="text-[10px] uppercase tracking-[0.34em] parxis-gold-text mb-4">{tr(col.title, lang)}</div>
              <ul className="space-y-2.5 text-[11px] leading-relaxed text-muted-foreground/90 font-light tracking-wide">
                {col.lines.map((line, j) => (
                  <li key={j}>{tr(line, lang)}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="parxis-gold-rule opacity-40" />
        <div className="mt-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-3 text-[10px] uppercase tracking-[0.32em] text-muted-foreground">
          <span>{tr(c.rights, lang)}</span>
          <span className="text-muted-foreground/70">{tr(c.signature, lang)}</span>
        </div>
      </div>
    </footer>
  );
}

// keep types imported (silence unused): use formatNumber & Lang if future scarcity count formatting is needed
void formatNumber;
void ({} as Lang);
