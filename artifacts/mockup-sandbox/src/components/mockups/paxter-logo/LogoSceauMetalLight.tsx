import SYM from "../../../assets/paxter-symbol.png";

const IVORY = "#f3ede0";

const goldText: React.CSSProperties = {
  backgroundImage:
    "linear-gradient(180deg,#caa24f 0%,#a87f2f 32%,#8a6526 58%,#b8903f 82%,#e0c074 100%)",
  WebkitBackgroundClip: "text",
  backgroundClip: "text",
  color: "transparent",
  WebkitTextFillColor: "transparent",
};

function Seal({ size }: { size: number }) {
  return (
    <div
      style={{
        position: "relative",
        width: size,
        height: size,
        borderRadius: "50%",
        background:
          "radial-gradient(circle at 50% 35%, #143150 0%, #0b1c30 60%, #081320 100%)",
        boxShadow:
          "0 12px 30px rgba(20,30,45,.28), inset 0 0 0 2px rgba(214,176,92,.95), inset 0 0 0 6px rgba(8,19,32,1), inset 0 0 0 7px rgba(214,176,92,.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: "20%",
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(214,176,92,.4) 0%, rgba(214,176,92,0) 70%)",
          filter: "blur(3px)",
        }}
      />
      <img
        src={SYM}
        alt="PAXTER"
        style={{
          width: "60%",
          height: "60%",
          objectFit: "contain",
          mixBlendMode: "screen",
          position: "relative",
        }}
      />
    </div>
  );
}

export default function LogoSceauMetalLight() {
  return (
    <div
      className="w-full h-full flex flex-col"
      style={{ minHeight: "100vh", background: IVORY }}
    >
      <div className="flex-1 flex flex-col items-center justify-center px-10">
        <Seal size={172} />
        <div
          className="mt-7"
          style={{
            fontFamily: "'Playfair Display', serif",
            fontWeight: 600,
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
            width: 120,
            height: 1,
            marginTop: 16,
            background: "linear-gradient(90deg,transparent,#a87f2f,transparent)",
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
      </div>

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
          COMO APARECE EM TELA / DOCUMENTO CLARO
        </div>
        <div
          style={{
            background: "#ffffff",
            border: "1px solid rgba(0,0,0,.08)",
            borderRadius: 8,
            padding: "12px 16px",
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <Seal size={46} />
          <div
            style={{
              fontFamily: "'Playfair Display', serif",
              fontWeight: 600,
              fontSize: 20,
              letterSpacing: "0.20em",
              paddingLeft: "0.20em",
              ...goldText,
            }}
          >
            PAXTER
          </div>
        </div>
      </div>
    </div>
  );
}
