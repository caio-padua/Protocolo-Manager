import { useState } from "react";
import type { Substance } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Star, ChevronDown, Moon, Zap, Activity, Brain, ShieldCheck, Sparkles, HeartPulse, Dumbbell } from "lucide-react";
import { fmt } from "./money";

// Frasco-ampola (vial ~2 ml) — vetor nos tons da marca: lacre crimp em
// verde-petroleo com flip-off, vidro com degrade (sheen), liquido na cor da
// substancia com menisco, rotulo translucido. Assinatura preservada: Ampola({ color, width }).
export function Ampola({ color, width = 40 }: { color: string; width?: number }) {
  const c = color || "#45B8CC";
  const cid = c.replace(/[^a-zA-Z0-9]/g, "");
  const height = Math.round(width * 1.7);
  const bodyPath = "M15 13 L25 13 L25 14.5 Q30 16.5 30 22 L30 60 Q30 65 25 65 L15 65 Q10 65 10 60 L10 22 Q10 16.5 15 14.5 Z";
  return (
    <svg width={width} height={height} viewBox="0 0 40 68" className="shrink-0" role="img" aria-label="Frasco-ampola">
      <defs>
        <clipPath id={`vial-${cid}`}>
          <path d={bodyPath} />
        </clipPath>
        <linearGradient id={`glass-${cid}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="26%" stopColor="hsl(187 46% 95%)" />
          <stop offset="72%" stopColor="hsl(187 40% 89%)" />
          <stop offset="100%" stopColor="hsl(187 32% 80%)" />
        </linearGradient>
        <linearGradient id={`liq-${cid}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={c} stopOpacity="0.6" />
          <stop offset="45%" stopColor={c} stopOpacity="0.95" />
          <stop offset="100%" stopColor={c} stopOpacity="0.78" />
        </linearGradient>
      </defs>
      {/* lacre crimp (aluminio) + flip-off central nos tons da marca */}
      <rect x="12.5" y="2.5" width="15" height="3.6" rx="1.6" fill="hsl(180 22% 58%)" />
      <rect x="11.5" y="5.6" width="17" height="8" rx="1.6" fill="hsl(180 30% 40%)" />
      <rect x="11.5" y="5.6" width="17" height="2.4" rx="1.6" fill="hsl(180 26% 55%)" />
      <rect x="17.5" y="3.2" width="5" height="2.3" rx="1.1" fill={c} opacity="0.85" />
      {/* corpo de vidro com degrade */}
      <path d={bodyPath} fill={`url(#glass-${cid})`} stroke="hsl(180 30% 50%)" strokeWidth="1.1" />
      {/* liquido (cor da substancia) com menisco ~ 2 ml */}
      <rect x="9" y="36" width="22" height="30" fill={`url(#liq-${cid})`} clipPath={`url(#vial-${cid})`} />
      <ellipse cx="20" cy="36" rx="10" ry="2.3" fill={c} opacity="0.9" clipPath={`url(#vial-${cid})`} />
      {/* rotulo branco translucido com linhas */}
      <rect x="10.5" y="44" width="19" height="13" fill="#ffffff" opacity="0.72" clipPath={`url(#vial-${cid})`} />
      <line x1="13" y1="48" x2="27" y2="48" stroke={c} strokeWidth="1.1" strokeLinecap="round" opacity="0.85" />
      <line x1="13" y1="51.5" x2="24" y2="51.5" stroke="hsl(180 18% 58%)" strokeWidth="0.9" strokeLinecap="round" />
      <line x1="13" y1="54.3" x2="25.5" y2="54.3" stroke="hsl(180 18% 64%)" strokeWidth="0.8" strokeLinecap="round" />
      {/* brilhos de vidro */}
      <rect x="13.5" y="18" width="2.6" height="22" rx="1.3" fill="#ffffff" opacity="0.6" clipPath={`url(#vial-${cid})`} />
      <rect x="25.6" y="22" width="1.4" height="30" rx="0.7" fill="#ffffff" opacity="0.32" clipPath={`url(#vial-${cid})`} />
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
