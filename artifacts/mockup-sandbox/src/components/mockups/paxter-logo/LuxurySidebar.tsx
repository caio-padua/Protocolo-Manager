import { useState } from "react";
import {
  LayoutDashboard,
  Users,
  FlaskConical,
  Calendar,
  CalendarCog,
  FileText,
  Box,
  CreditCard,
  Beaker,
  FolderCog,
  Plus,
  type LucideIcon,
} from "lucide-react";
import SYM from "../../../assets/paxter-symbol.png";

export type CrestVariant =
  | "sceauMetal"
  | "metal"
  | "sceau"
  | "maison"
  | "quiet";

const NAV: { name: string; icon: LucideIcon }[] = [
  { name: "Dashboard", icon: LayoutDashboard },
  { name: "Clientes", icon: Users },
  { name: "Protocolos", icon: FlaskConical },
  { name: "Agenda", icon: Calendar },
  { name: "Motor de Agenda", icon: CalendarCog },
  { name: "RAS", icon: FileText },
  { name: "Estoque", icon: Box },
  { name: "Financeiro", icon: CreditCard },
  { name: "Substâncias", icon: Beaker },
  { name: "Cadastros", icon: FolderCog },
];

function Crest({ variant, size }: { variant: CrestVariant; size: number }) {
  const img = (
    <img
      src={SYM}
      alt="PAXTER"
      style={{
        width: "62%",
        height: "62%",
        objectFit: "contain",
        mixBlendMode: "screen",
        position: "relative",
        zIndex: 2,
      }}
    />
  );

  if (variant === "quiet") {
    return (
      <div
        style={{
          width: size,
          height: size,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          filter: "saturate(.7) brightness(.92)",
        }}
      >
        <img
          src={SYM}
          alt="PAXTER"
          style={{
            width: "78%",
            height: "78%",
            objectFit: "contain",
            mixBlendMode: "screen",
          }}
        />
      </div>
    );
  }

  if (variant === "metal") {
    return (
      <div
        style={{
          position: "relative",
          width: size,
          height: size,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: "8%",
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(214,176,92,.55) 0%, rgba(214,176,92,0) 68%)",
            filter: "blur(5px)",
          }}
        />
        <img
          src={SYM}
          alt="PAXTER"
          style={{
            width: "92%",
            height: "92%",
            objectFit: "contain",
            mixBlendMode: "screen",
            position: "relative",
            zIndex: 2,
          }}
        />
      </div>
    );
  }

  if (variant === "maison") {
    return (
      <div
        style={{
          position: "relative",
          width: size,
          height: size,
          borderRadius: 14,
          background:
            "radial-gradient(circle at 50% 30%, #163454 0%, #0b1d31 70%, #081421 100%)",
          boxShadow:
            "0 8px 20px rgba(0,0,0,.4), inset 0 0 0 1.5px rgba(214,176,92,.9), inset 0 1px 0 rgba(255,255,255,.12)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {img}
      </div>
    );
  }

  // sceau + sceauMetal (selo redondo)
  const glow = variant === "sceauMetal";
  return (
    <div
      style={{
        position: "relative",
        width: size,
        height: size,
        borderRadius: "50%",
        background:
          "radial-gradient(circle at 50% 32%, #163454 0%, #0b1d31 62%, #081421 100%)",
        boxShadow:
          "0 8px 22px rgba(0,0,0,.45), inset 0 0 0 1.5px rgba(214,176,92,.95), inset 0 0 0 4px rgba(8,19,32,1), inset 0 0 0 4.8px rgba(214,176,92,.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {glow && (
        <div
          style={{
            position: "absolute",
            inset: "20%",
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(214,176,92,.45) 0%, rgba(214,176,92,0) 70%)",
            filter: "blur(3px)",
          }}
        />
      )}
      {img}
    </div>
  );
}

export default function LuxurySidebar({
  variant = "sceauMetal",
}: {
  variant?: CrestVariant;
}) {
  const [active, setActive] = useState("Agenda");

  return (
    <div
      style={{
        width: "100%",
        minHeight: "100vh",
        background: "#0a1828",
        display: "flex",
        justifyContent: "center",
        padding: "0",
        fontFamily: "'Montserrat', sans-serif",
      }}
    >
      <style>{`
        .lx-side{ position:relative; width:300px; min-height:100vh; padding:26px 16px 22px;
          color:#fff;
          background:
            radial-gradient(120% 40% at 24% 0%, rgba(214,176,92,.16), transparent 30%),
            linear-gradient(180deg,#0d294a 0%,#0a1f3a 46%,#061426 100%);
          border-right:1px solid rgba(214,176,92,.36);
          box-shadow:14px 0 34px rgba(6,20,38,.30); }
        .lx-side::before{ content:""; position:absolute; inset:9px; border:1px solid rgba(214,176,92,.22);
          border-radius:12px; pointer-events:none; }
        .lx-item{ position:relative; z-index:1; width:100%; min-height:42px; padding:0 12px;
          display:grid; grid-template-columns:24px 1fr auto; align-items:center; gap:11px;
          border:1px solid transparent; border-radius:8px; background:transparent;
          color:rgba(255,255,255,.82); font-size:13.5px; font-weight:600; text-align:left; cursor:pointer;
          transition:background .16s,border-color .16s,color .16s,box-shadow .16s,transform .16s; }
        .lx-item svg{ color:rgba(224,193,122,.9); width:17px; height:17px; }
        .lx-item:hover{ color:#fff; transform:translateY(-1px); border-color:rgba(214,176,92,.4);
          background:rgba(255,255,255,.05); box-shadow:0 8px 18px rgba(6,20,38,.25),0 0 16px rgba(214,176,92,.12); }
        .lx-item.is-active{ color:#fff; border-color:rgba(214,176,92,.78);
          background:linear-gradient(180deg,rgba(20,52,90,.96),rgba(8,26,49,.96));
          box-shadow:0 0 22px rgba(214,176,92,.22),inset 0 2px 0 rgba(255,255,255,.10),inset 0 -3px 7px rgba(0,0,0,.26); }
        .lx-item.is-active svg{ color:#f0dba8; }
        .lx-item.is-active::before{ content:""; position:absolute; left:-1px; top:8px; bottom:8px; width:3px;
          border-radius:3px; background:linear-gradient(180deg,#f0dba8,#cda94e);
          box-shadow:0 0 10px rgba(240,219,168,.6); }
        .lx-dot{ width:7px; height:7px; border-radius:50%; background:#f0dba8;
          box-shadow:0 0 10px rgba(240,219,168,.7); opacity:0; }
        .lx-item.is-active .lx-dot{ opacity:1; }
        .lx-cta{ position:relative; z-index:1; width:100%; margin-top:18px; min-height:46px;
          display:flex; align-items:center; justify-content:center; gap:8px;
          border:1px solid rgba(214,176,92,.6); border-radius:9px; cursor:pointer;
          font-size:13px; font-weight:800; letter-spacing:.04em; color:#1a1205;
          background:linear-gradient(180deg,#f6e7b6 0%,#e3c172 46%,#c79a42 100%);
          box-shadow:0 12px 22px rgba(6,20,38,.34),inset 0 2px 0 rgba(255,255,255,.7),inset 0 -4px 8px rgba(120,86,20,.4);
          transition:transform .16s,box-shadow .16s,filter .16s; }
        .lx-cta:hover{ transform:translateY(-2px); filter:brightness(1.04);
          box-shadow:0 18px 30px rgba(6,20,38,.4),0 0 22px rgba(214,176,92,.4),inset 0 2px 0 rgba(255,255,255,.8),inset 0 -4px 8px rgba(120,86,20,.4); }
        .lx-cta:active{ transform:translateY(0); box-shadow:0 6px 12px rgba(6,20,38,.32),inset 0 2px 6px rgba(120,86,20,.5); }
      `}</style>

      <aside className="lx-side">
        {/* MARCA */}
        <div
          style={{
            position: "relative",
            zIndex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 12,
            paddingBottom: 18,
            marginBottom: 16,
            borderBottom: "1px solid rgba(214,176,92,.26)",
          }}
        >
          <Crest variant={variant} size={62} />
          <div style={{ textAlign: "center" }}>
            <div
              style={{
                fontFamily: "'Playfair Display', serif",
                fontWeight: 600,
                fontSize: 26,
                letterSpacing: "0.22em",
                paddingLeft: "0.22em",
                backgroundImage:
                  "linear-gradient(178deg,#fbf0d4,#ecd28f 30%,#cda94e 60%,#f3dfa8)",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
                WebkitTextFillColor: "transparent",
              }}
            >
              PAXTER
            </div>
            <div
              style={{
                marginTop: 7,
                fontSize: 8,
                fontWeight: 700,
                letterSpacing: "0.16em",
                paddingLeft: "0.16em",
                whiteSpace: "nowrap",
                color: "#e0c17a",
              }}
            >
              CLINICAL INTELLIGENCE SYSTEM
            </div>
            <div
              style={{
                marginTop: 5,
                fontSize: 7.5,
                fontWeight: 600,
                letterSpacing: "0.18em",
                color: "rgba(159,176,191,.8)",
              }}
            >
              MOTOR CLÍNICO · PROTOCOLOS INJETÁVEIS
            </div>
          </div>
        </div>

        {/* MENU */}
        <nav style={{ display: "grid", gap: 4 }}>
          {NAV.map(({ name, icon: Icon }) => (
            <button
              key={name}
              type="button"
              className={`lx-item ${active === name ? "is-active" : ""}`}
              onClick={() => setActive(name)}
            >
              <Icon />
              <span>{name}</span>
              <span className="lx-dot" />
            </button>
          ))}
        </nav>

        {/* BOTAO PRINCIPAL */}
        <button type="button" className="lx-cta">
          <Plus size={16} strokeWidth={3} />
          NOVO PROTOCOLO
        </button>

        <div
          style={{
            position: "relative",
            zIndex: 1,
            marginTop: 10,
            textAlign: "center",
            fontSize: 7.5,
            letterSpacing: "0.16em",
            color: "rgba(159,176,191,.6)",
          }}
        >
          PASSE O MOUSE E CLIQUE NOS ITENS
        </div>
      </aside>
    </div>
  );
}
