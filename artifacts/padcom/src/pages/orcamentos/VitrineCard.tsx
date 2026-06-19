import { useState } from "react";
import type { Substance } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Star, ChevronDown, Moon, Zap, Activity, Brain, ShieldCheck, Sparkles, HeartPulse, Dumbbell } from "lucide-react";
import { fmt } from "./money";

// Ampola injetavel classica (vidro tipo OPC) — vetor nos tons da marca:
// ponta de quebra, haste estreita, ANEL DE QUEBRA colorido (na cor da
// substancia), bulbo, ombro e corpo cilindrico com liquido + menisco e
// brilhos de vidro. Assinatura preservada: Ampola({ color, width }).
export function Ampola({ color, width = 40 }: { color: string; width?: number }) {
  const c = color || "#45B8CC";
  const cid = c.replace(/[^a-zA-Z0-9]/g, "");
  const height = Math.round(width * 1.7);
  // Corpo: ombro -> cilindro -> fundo arredondado.
  const bodyPath =
    "M11 27 Q11 23.5 14.5 22 Q15.6 21 16 19.5 L24 19.5 Q24.4 21 25.5 22 Q29 23.5 29 27 L29 60 Q29 64 24.5 64 L15.5 64 Q11 64 11 60 Z";
  return (
    <svg width={width} height={height} viewBox="0 0 40 68" className="shrink-0" role="img" aria-label="Ampola">
      <defs>
        <clipPath id={`amp-${cid}`}>
          <path d={bodyPath} />
        </clipPath>
        <linearGradient id={`glass-${cid}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="28%" stopColor="hsl(187 46% 95%)" />
          <stop offset="72%" stopColor="hsl(187 40% 88%)" />
          <stop offset="100%" stopColor="hsl(187 32% 78%)" />
        </linearGradient>
        <linearGradient id={`liq-${cid}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={c} stopOpacity="0.62" />
          <stop offset="45%" stopColor={c} stopOpacity="0.95" />
          <stop offset="100%" stopColor={c} stopOpacity="0.8" />
        </linearGradient>
      </defs>
      {/* ponta de quebra */}
      <path d="M20 2.5 L22 6.6 Q20 7.4 18 6.6 Z" fill="hsl(187 35% 82%)" stroke="hsl(180 30% 55%)" strokeWidth="0.7" strokeLinejoin="round" />
      {/* haste estreita */}
      <path d="M18.1 6.8 L21.9 6.8 L21.4 13.6 L18.6 13.6 Z" fill={`url(#glass-${cid})`} stroke="hsl(180 30% 55%)" strokeWidth="0.9" strokeLinejoin="round" />
      {/* anel de quebra colorido (na cor da substancia) */}
      <rect x="17.4" y="12" width="5.2" height="1.9" rx="0.95" fill={c} />
      {/* bulbo */}
      <path d="M16.4 13.8 Q15.9 19.2 20 19.6 Q24.1 19.2 23.6 13.8 Z" fill={`url(#glass-${cid})`} stroke="hsl(180 30% 55%)" strokeWidth="0.9" strokeLinejoin="round" />
      {/* corpo de vidro */}
      <path d={bodyPath} fill={`url(#glass-${cid})`} stroke="hsl(180 30% 50%)" strokeWidth="1.1" strokeLinejoin="round" />
      {/* liquido (cor da substancia) com menisco */}
      <rect x="9" y="34" width="22" height="31" fill={`url(#liq-${cid})`} clipPath={`url(#amp-${cid})`} />
      <ellipse cx="20" cy="34" rx="9.6" ry="1.9" fill={c} opacity="0.92" clipPath={`url(#amp-${cid})`} />
      {/* anel impresso (graduacao) na parte vazia */}
      <line x1="12.6" y1="29.5" x2="27.4" y2="29.5" stroke="hsl(180 24% 62%)" strokeWidth="0.7" opacity="0.7" clipPath={`url(#amp-${cid})`} />
      {/* brilhos de vidro */}
      <rect x="13.4" y="25" width="2.6" height="35" rx="1.3" fill="#ffffff" opacity="0.55" clipPath={`url(#amp-${cid})`} />
      <rect x="25.4" y="29" width="1.3" height="29" rx="0.65" fill="#ffffff" opacity="0.3" clipPath={`url(#amp-${cid})`} />
    </svg>
  );
}

const BENEFIT_FIELDS: { key: keyof Substance; label: string; icon: typeof Moon }[] = [
  { key: "longevityBenefit", label: "Longevidade", icon: Sparkles },
  { key: "sleepBenefit", label: "Sono", icon: Moon },
  { key: "energyBenefit", label: "Energia", icon: Zap },
  { key: "physicalPerformance", label: "Performance", icon: Activity },
  { key: "muscleStrength", label: "Forca muscular", icon: Dumbbell },
  { key: "mentalClarity", label: "Clareza mental", icon: Brain },
  { key: "immuneSupport", label: "Imunidade", icon: ShieldCheck },
  { key: "libidoBenefit", label: "Libido", icon: HeartPulse },
];

export function VitrineCard({ substance, priceCents, sessions }: { substance: Substance; priceCents?: number; sessions?: number }) {
  const [open, setOpen] = useState(false);
  const benefits = BENEFIT_FIELDS.filter((b) => {
    const v = substance[b.key];
    return typeof v === "string" && v.trim().length > 0;
  });
  const stars = substance.starRating ?? 0;

  return (
    <Card className="overflow-hidden border-l-4" style={{ borderLeftColor: substance.color || "#45B8CC" }}>
      <CardContent className="p-4">
        <div className="flex gap-4">
          <Ampola color={substance.color} />
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="font-bold text-lg leading-tight">{substance.name}</h3>
                <span className="text-xs uppercase tracking-wide text-muted-foreground">{substance.category}</span>
              </div>
              {priceCents != null && (
                <div className="text-right shrink-0">
                  <div className="font-bold">{fmt(priceCents)}</div>
                  <div className="text-[10px] text-muted-foreground">por sessao</div>
                </div>
              )}
            </div>

            {stars > 0 && (
              <div className="flex items-center gap-0.5 mt-1">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className={`h-3.5 w-3.5 ${i < stars ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"}`} />
                ))}
              </div>
            )}

            {substance.mainFunction && (
              <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{substance.mainFunction}</p>
            )}

            {sessions != null && (
              <div className="mt-2">
                <Badge variant="outline" className="text-[10px]">{sessions} sessoes</Badge>
                {substance.timeToEffect ? <Badge variant="outline" className="text-[10px] ml-1">efeito: {substance.timeToEffect}</Badge> : null}
              </div>
            )}

            {benefits.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-3">
                {benefits.slice(0, open ? benefits.length : 4).map((b) => {
                  const Icon = b.icon;
                  return (
                    <span key={String(b.key)} className="inline-flex items-center gap-1 text-[11px] bg-muted px-2 py-0.5 rounded-full">
                      <Icon className="h-3 w-3" /> {b.label}
                    </span>
                  );
                })}
                {benefits.length > 4 && (
                  <button onClick={() => setOpen((o) => !o)} className="inline-flex items-center gap-0.5 text-[11px] text-primary">
                    {open ? "ver menos" : `+${benefits.length - 4}`} <ChevronDown className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`} />
                  </button>
                )}
              </div>
            )}

            {open && (
              <div className="mt-3 space-y-2 border-t pt-3">
                {benefits.map((b) => (
                  <div key={String(b.key)} className="text-xs">
                    <span className="font-semibold">{b.label}: </span>
                    <span className="text-muted-foreground">{String(substance[b.key])}</span>
                  </div>
                ))}
                {substance.perceivedEffects && (
                  <div className="text-xs"><span className="font-semibold">Efeitos percebidos: </span><span className="text-muted-foreground">{substance.perceivedEffects}</span></div>
                )}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
