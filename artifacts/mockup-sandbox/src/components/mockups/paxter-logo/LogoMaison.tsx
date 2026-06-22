import SYM from "../../../assets/paxter-symbol.png";

const NAVY = "#0c1a2e";
const IVORY = "#f3ede0";

const goldText: React.CSSProperties = {
  backgroundImage:
    "linear-gradient(180deg,#caa24f 0%,#a87f2f 30%,#8a6526 55%,#b8903f 80%,#e0c074 100%)",
  WebkitBackgroundClip: "text",
  backgroundClip: "text",
  color: "transparent",
  WebkitTextFillColor: "transparent",
};

function Emblem({ size }: { size: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.22,
        background: NAVY,
        boxShadow:
          "0 10px 30px rgba(0,0,0,.25), inset 0 0 0 1.5px rgba(202,162,79,.85), inset 0 0 0 5px rgba(12,26,46,1), inset 0 0 0 6px rgba(202,162,79,.35)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <img
        src={SYM}
        alt="PAXTER"
        style={{
          width: "82%",
          height: "82%",
          objectFit: "contain",
          mixBlendMode: "screen",
        }}
      />
    </div>
  );
}

export default function LogoMaison() {
  return (
    <div
      className="w-full h-full flex flex-col"
      style={{ background: IVORY, minHeight: "100vh" }}
    >
      <div className="flex-1 flex flex-col items-center justify-center px-10">
        <Emblem size={148} />
        <div
          className="mt-7"
          style={{
            fontFamily: "'Playfair Display', serif",
            fontWeight: 500,
            fontSize: 52,
            letterSpacing: "0.30em",
            lineHeight: 1,
            paddingLeft: "0.30em",
            ...goldText,
          }}
        >
          PAXTER
        </div>
        <div
          style={{
            width: 96,
            height: 1,
            marginTop: 18,
            background:
              "linear-gradient(90deg,transparent,#a87f2f,transparent)",
          }}
        />
        <div
          className="mt-4 text-center"
          style={{
            fontFamily: "'Montserrat', sans-serif",
            fontWeight: 500,
            fontSize: 10.5,
            letterSpacing: "0.34em",
            color: "#5b6b7a",
            paddingLeft: "0.34em",
          }}
        >
          MOTOR CLÍNICO · PROTOCOLOS INJETÁVEIS
        </div>
        <div
          className="mt-2 text-center"
          style={{
            fontFamily: "'Montserrat', sans-serif",
            fontWeight: 600,
            fontSize: 9,
            letterSpacing: "0.42em",
            color: "#a87f2f",
            paddingLeft: "0.42em",
          }}
        >
          CLINICAL INTELLIGENCE
        </div>
      </div>

      <SidebarStrip />
    </div>
  );
}

function SidebarStrip() {
  return (
    <div
      className="px-6 pb-6 pt-4"
      style={{ borderTop: "1px solid rgba(0,0,0,.08)" }}
    >
      <div
        style={{
          fontFamily: "'Montserrat', sans-serif",
          fontSize: 8.5,
          letterSpacing: "0.22em",
          color: "#8a97a3",
          marginBottom: 8,
        }}
      >
        COMO APARECE NO MENU LATERAL
      </div>
      <div
        style={{
          background: NAVY,
          borderRadius: 8,
          padding: "14px 16px",
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        <Emblem size={40} />
        <div
          style={{
            fontFamily: "'Playfair Display', serif",
            fontWeight: 500,
            fontSize: 19,
            letterSpacing: "0.20em",
            paddingLeft: "0.20em",
            ...goldText,
          }}
        >
          PAXTER
        </div>
      </div>
    </div>
  );
}
