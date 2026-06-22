import SYM from "../../../assets/paxter-symbol.png";

const goldText: React.CSSProperties = {
  backgroundImage:
    "linear-gradient(180deg,#f3dfa8 0%,#d6b05c 38%,#a87f2f 70%,#e6cd8a 100%)",
  WebkitBackgroundClip: "text",
  backgroundClip: "text",
  color: "transparent",
  WebkitTextFillColor: "transparent",
};

function Seal({ size }: { size: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background:
          "radial-gradient(circle at 50% 35%, #143150 0%, #0b1c30 60%, #081320 100%)",
        boxShadow:
          "0 12px 34px rgba(0,0,0,.4), inset 0 0 0 2px rgba(214,176,92,.9), inset 0 0 0 6px rgba(8,19,32,1), inset 0 0 0 7px rgba(214,176,92,.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <img
        src={SYM}
        alt="PAXTER"
        style={{
          width: "60%",
          height: "60%",
          objectFit: "contain",
          mixBlendMode: "screen",
        }}
      />
    </div>
  );
}

export default function LogoSceau() {
  return (
    <div
      className="w-full h-full flex flex-col"
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(110% 80% at 50% 40%, #102942 0%, #0a1828 55%, #060f1a 100%)",
      }}
    >
      <div className="flex-1 flex flex-col items-center justify-center px-10">
        <Seal size={176} />
        <div
          className="mt-8"
          style={{
            fontFamily: "'Libre Baskerville', serif",
            fontWeight: 700,
            fontSize: 46,
            letterSpacing: "0.34em",
            lineHeight: 1,
            paddingLeft: "0.34em",
            ...goldText,
          }}
        >
          PAXTER
        </div>
        <div
          className="mt-5 flex items-center"
          style={{ gap: 10 }}
        >
          <span
            style={{
              width: 28,
              height: 1,
              background: "linear-gradient(90deg,transparent,#a87f2f)",
            }}
          />
          <span
            style={{
              fontFamily: "'Montserrat', sans-serif",
              fontWeight: 500,
              fontSize: 9.5,
              letterSpacing: "0.32em",
              color: "#9fb0bf",
              paddingLeft: "0.32em",
            }}
          >
            MOTOR CLÍNICO · PROTOCOLOS INJETÁVEIS
          </span>
          <span
            style={{
              width: 28,
              height: 1,
              background: "linear-gradient(90deg,#a87f2f,transparent)",
            }}
          />
        </div>
      </div>

      <div
        className="px-6 pb-6 pt-4"
        style={{ borderTop: "1px solid rgba(214,176,92,.16)" }}
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
            border: "1px solid rgba(214,176,92,.16)",
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
              fontFamily: "'Libre Baskerville', serif",
              fontWeight: 700,
              fontSize: 19,
              letterSpacing: "0.24em",
              paddingLeft: "0.24em",
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
