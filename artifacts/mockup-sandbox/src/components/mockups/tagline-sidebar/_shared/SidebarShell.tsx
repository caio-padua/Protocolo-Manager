import "../../_shared/PaxterLogo.css";
import { LOCKUP_STYLE } from "../../_shared/paxterLockup";
import paxterSymbol from "@/assets/paxter-symbol.png";
import headlinePng from "@/assets/brand/paxter-headline.png";
import headlineWebp from "@/assets/brand/paxter-headline.webp";
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
  /** (legado — o texto agora vem da logo oficial em pixels reais) */
  line1?: string;
  /** Sub-tagline auxiliar em ouro, abaixo da logo oficial. Opcional. */
  line2?: string;
}

export function SidebarShell({ line2 }: SidebarShellProps) {
  return (
    <div
      className="min-h-screen w-full flex items-center justify-center p-8"
      style={{ background: "#e8eaf0" }}
    >
      {/* gold-face para a sub-tagline auxiliar (frase, nao a marca) */}
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
        {/* Header — LOGO OFICIAL PAXTER (pixels reais do anexo, ouro 3D + brilho) */}
        <div
          className="px-5 pt-6 pb-5 flex flex-col items-center text-center"
          style={{ borderBottom: `1px solid ${BORDER}` }}
        >
          <img
            src={paxterSymbol}
            alt="PAXTER"
            className="h-12 w-12 object-contain"
            style={{
              mixBlendMode: "screen",
              filter:
                "brightness(1.2) drop-shadow(0 0 16px rgba(214,176,92,0.55))",
            }}
          />

          {/* PAXTER + Clinical Intelligence System — ouro real recortado do anexo */}
          <span
            className="pax-word"
            style={{
              width: 180,
              marginTop: 12,
              display: "block",
              lineHeight: 0,
              position: "relative",
            }}
          >
            <picture>
              <source srcSet={headlineWebp} type="image/webp" />
              <img
                src={headlinePng}
                alt="PAXTER — Clinical Intelligence System"
                draggable={false}
                style={{ display: "block", width: "100%", height: "auto" }}
              />
            </picture>
            <span
              className="pax-sheen"
              aria-hidden="true"
              style={{
                WebkitMaskImage: `url(${headlinePng})`,
                maskImage: `url(${headlinePng})`,
              }}
            />
          </span>

          {/* Sub-tagline auxiliar opcional (ouro) */}
          {line2 && (
            <span
              className="font-cinzel gold-face-dark relief-sm-dark"
              style={{
                marginTop: 10,
                fontSize: 9,
                fontWeight: 600,
                letterSpacing: "0.24em",
                display: "inline-block",
              }}
            >
              {line2.toUpperCase()}
            </span>
          )}
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
