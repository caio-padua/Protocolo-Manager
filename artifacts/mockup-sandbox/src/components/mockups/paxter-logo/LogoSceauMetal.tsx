import SYM from "../../../assets/paxter-symbol.png";

const goldText: React.CSSProperties = {
  backgroundImage:
    "linear-gradient(178deg,#fbf0d4 0%,#ecd28f 24%,#cda94e 52%,#9a7530 76%,#f3dfa8 100%)",
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
          "0 14px 38px rgba(0,0,0,.45), inset 0 0 0 2px rgba(214,176,92,.95), inset 0 0 0 6px rgba(8,19,32,1), inset 0 0 0 7px rgba(214,176,92,.5)",
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

export default function LogoSceauMetal() {
  return (
    <div
      className="w-full h-full flex flex-col"
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(115% 85% at 50% 30%, #14304d 0%, #0a1828 55%, #060f1a 100%)",
      }}
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
            height: 2,
            marginTop: 16,
            background:
              "linear-gradient(90deg,transparent,#d6b05c 18%,#f3e0a8 50%,#d6b05c 82%,transparent)",
          }}
        />
        <div
          className="mt-4 text-center"
          style={{
            fontFamily: "'Montserrat', sans-serif",
            fontWeight: 500,
            fontSize: 10.5,
            letterSpacing: "0.34em",
            color: "#9fb0bf",
            paddingLeft: "0.34em",
          }}
        >
          MOTOR CLÍNICO · PROTOCOLOS INJETÁVEIS
        </div>
      </div>

      <div
        className="px-6 pb-6 pt-4"
        style={{ borderTop: "1px solid rgba(214,176,92,.18)" }}
      >
        <div
          style={{
            fontFamily: "'Montserrat', sans-serif",
            fontSize: 8.5,
            letterSpacing: "0.22em",
            color: "rgba(159,176,191,.7)",
            marginBottom: 8,
          }}
        >
          COMO APARECE NO MENU LATERAL
        </div>
        <div
          style={{
            background: "rgba(6,15,26,.6)",
            border: "1px solid rgba(214,176,92,.18)",
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
