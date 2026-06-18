import { useState } from "react";
import type { Substance } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Star, ChevronDown, Moon, Zap, Activity, Brain, ShieldCheck, Sparkles, HeartPulse, Dumbbell } from "lucide-react";
import { fmt } from "./money";

// Frasco-ampola (vial ~2 ml) — vetor achatado nos tons da marca (tampa em
// verde-petroleo, vidro claro, liquido na cor da substancia). Mesmo estilo
// flat do porquinho. Assinatura preservada: Ampola({ color, width }).
export function Ampola({ color, width = 40 }: { color: string; width?: number }) {
  const c = color || "#45B8CC";
  const cid = c.replace(/[^a-zA-Z0-9]/g, "");
  const height = Math.round(width * 1.7);
  const bodyPath = "M11 15 Q11 13 13 13 L27 13 Q29 13 29 15 L29 60 Q29 64 25 64 L15 64 Q11 64 11 60 Z";
  return (
    <svg width={width} height={height} viewBox="0 0 40 68" className="shrink-0" role="img" aria-label="Frasco-ampola">
      <defs>
        <clipPath id={`vial-${cid}`}>
          <path d={bodyPath} />
        </clipPath>
      </defs>
      {/* tampa crimp (lacre) nos tons da marca */}
      <rect x="12" y="3" width="16" height="4" rx="1.5" fill="hsl(180 30% 42%)" />
      <rect x="11" y="6.5" width="18" height="7" rx="1.2" fill="hsl(180 32% 30%)" />
      <rect x="14" y="8" width="1.4" height="4" rx="0.7" fill="hsl(180 24% 52%)" />
      <rect x="19.3" y="8" width="1.4" height="4" rx="0.7" fill="hsl(180 24% 52%)" />
      <rect x="24.6" y="8" width="1.4" height="4" rx="0.7" fill="hsl(180 24% 52%)" />
      {/* corpo de vidro */}
      <path d={bodyPath} fill="hsl(187 44% 96%)" stroke="hsl(180 34% 30%)" strokeWidth="1.6" />
      {/* liquido (cor da substancia) ~ metade do frasco = 2 ml */}
      <rect x="10" y="34" width="20" height="32" fill={c} clipPath={`url(#vial-${cid})`} opacity="0.85" />
      <ellipse cx="20" cy="34" rx="9" ry="2.6" fill={c} clipPath={`url(#vial-${cid})`} />
      {/* brilho */}
      <rect x="14" y="19" width="2.4" height="20" rx="1.2" fill="#ffffff" opacity="0.5" />
      {/* marcas de medida */}
      <line x1="24" y1="30" x2="27.5" y2="30" stroke="hsl(180 30% 45%)" strokeWidth="1" strokeLinecap="round" />
      <line x1="24" y1="44" x2="27.5" y2="44" stroke="hsl(180 30% 45% / 0.7)" strokeWidth="0.8" strokeLinecap="round" />
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
