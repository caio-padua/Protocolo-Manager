import paxterSymbol from "@/assets/paxter-symbol.png";
import { LOCKUP_STYLE } from "../../_shared/paxterLockup";
import {
  LayoutDashboard,
  Users,
  FlaskConical,
  Calendar,
  FileText,
  Box,
  CreditCard,
} from "lucide-react";

const NAVY = "hsl(218 50% 18%)";
const FG = "hsl(40 30% 90%)";
const BORDER = "hsl(218 35% 27%)";
const GOLD = "hsl(39 48% 56%)";
const ACCENT = "hsl(218 42% 26%)";

const items = [
  { name: "Dashboard", icon: LayoutDashboard },
  { name: "Clientes", icon: Users },
  { name: "Protocolos", icon: FlaskConical },
  { name: "Agenda", icon: Calendar },
  { name: "RAS", icon: FileText, active: true },
  { name: "Estoque", icon: Box },
  { name: "Financeiro", icon: CreditCard },
];

interface SidebarShellProps {
  /** Frase principal em ouro polido (estilo "Clinical Intelligence System"). */
  line1: string;
  /** Frase secundaria em ouro (Cinzel, maiusculo, espacado). Opcional. */
  line2?: string;
}

export function SidebarShell({ line1, line2 }: SidebarShellProps) {
  return (
    <div
      className="min-h-screen w-full flex items-center justify-center p-8"
      style={{ background: "#e8eaf0" }}
    >
      {/* Estilo oficial do lockup: fontes Cinzel/Cormorant + face de ouro + relevo 3D */}
      <style dangerouslySetInnerHTML={{ __html: LOCKUP_STYLE }} />

      <div
        className="w-64 flex flex-col overflow-hidden"
        style={{
          background: NAVY,
          color: FG,
          height: 680,
          borderRadius: 8,
          boxShadow: "0 20px 50px rgba(13,24,48,0.35)",
        }}
      >
        {/* Header block — wordmark OFICIAL + tagline em ouro */}
        <div className="p-5" style={{ borderBottom: `1px solid ${BORDER}` }}>
          <div className="flex items-center gap-2.5">
            <img
              src={paxterSymbol}
              alt="PAXTER"
              className="h-11 w-11 object-contain shrink-0"
              style={{
                mixBlendMode: "screen",
                filter:
                  "brightness(1.2) drop-shadow(0 0 16px rgba(214,176,92,0.55))",
              }}
            />
            {/* PAXTER — Cinzel, face de ouro, relevo (classes oficiais do lockup) */}
            <span
              className="pax-word gold-face-dark relief-md-dark"
              style={{ fontSize: 27 }}
            >
              PAXTER
            </span>
          </div>

          <div className="mt-3.5 pl-0.5 flex flex-col gap-1">
            {/* Frase 1 — Cormorant ouro polido (estilo Clinical Intelligence System) */}
            <span
              className="pax-cis gold-face-dark relief-sm-dark"
              style={{ fontSize: 14.5, lineHeight: 1.1 }}
            >
              {line1}
            </span>
            {/* Frase 2 — Cinzel maiusculo espacado em ouro */}
            {line2 && (
              <span
                className="pax-precision gold-face-dark"
                style={{
                  fontSize: 8.5,
                  letterSpacing: "0.26em",
                  opacity: 0.92,
                }}
              >
                {line2.toUpperCase()}
              </span>
            )}
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-hidden">
          {items.map((item) => {
            const Icon = item.icon;
            const active = item.active;
            return (
              <div
                key={item.name}
                className="flex items-center gap-3 px-3 py-2.5"
                style={{
                  borderRadius: 4,
                  border: active ? `1px solid ${GOLD}66` : "1px solid transparent",
                  background: active ? ACCENT : "transparent",
                  color: active ? FG : "rgba(230,224,210,0.7)",
                  fontWeight: active ? 500 : 400,
                }}
              >
                <Icon
                  className="w-[18px] h-[18px]"
                  style={{ color: active ? GOLD : "rgba(230,224,210,0.5)" }}
                />
                <span className="text-sm" style={{ letterSpacing: "0.02em" }}>
                  {item.name}
                </span>
              </div>
            );
          })}
        </nav>

        {/* Footer user */}
        <div className="p-3" style={{ borderTop: `1px solid ${BORDER}` }}>
          <div className="flex items-center gap-3 px-3 py-2">
            <div
              className="w-8 h-8 flex items-center justify-center text-xs font-bold"
              style={{
                borderRadius: 4,
                background: `${GOLD}33`,
                color: GOLD,
                border: `1px solid ${GOLD}4d`,
              }}
            >
              DP
            </div>
            <div className="flex flex-col">
              <span
                className="text-sm font-medium"
                style={{ letterSpacing: "0.02em" }}
              >
                Dr. Padua
              </span>
              <span
                className="uppercase"
                style={{
                  fontSize: 10,
                  color: "rgba(230,224,210,0.5)",
                  letterSpacing: "0.04em",
                }}
              >
                Administrador
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
