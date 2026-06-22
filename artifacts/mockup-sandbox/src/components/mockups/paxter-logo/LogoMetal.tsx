import SYM from "../../../assets/paxter-symbol.png";

const goldText: React.CSSProperties = {
  backgroundImage:
    "linear-gradient(178deg,#fbf0d4 0%,#ecd28f 24%,#cda94e 52%,#9a7530 76%,#f3dfa8 100%)",
  WebkitBackgroundClip: "text",
  backgroundClip: "text",
  color: "transparent",
  WebkitTextFillColor: "transparent",
};

function FloatMark({ size }: { size: number }) {
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
            "radial-gradient(circle, rgba(214,176,92,.42) 0%, rgba(214,176,92,0) 68%)",
          filter: "blur(4px)",
        }}
      />
      <img
        src={SYM}
        alt="PAXTER"
        style={{
          width: "100%",
          height: "100%",
          objectFit: "contain",
          mixBlendMode: "screen",
          position: "relative",
        }}
      />
    </div>
  );
}

export default function LogoMetal() {
  return (
    <div
      className="w-full h-full flex flex-col"
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(120% 90% at 50% 22%, #14304d 0%, #0c1c30 45%, #07111d 100%)",
      }}
    >
      <div className="flex-1 flex flex-col items-center justify-center px-10">
        <FloatMark size={170} />
        <div
          className="mt-5"
          style={{
            fontFamily: "'Playfair Display', serif",
            fontWeight: 600,
            fontSize: 56,
            letterSpacing: "0.26em",
            lineHeight: 1,
            paddingLeft: "0.26em",
            ...goldText,
          }}
        >
          PAXTER
        </div>
        <div
          style={{
            width: 130,
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
            color: "#c7b489",
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
            letterSpacing: "0.44em",
            color: "#d6b05c",
            paddingLeft: "0.44em",
          }}
        >
          CLINICAL INTELLIGENCE
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
            color: "rgba(199,180,137,.7)",
            marginBottom: 8,
          }}
        >
          COMO APARECE NO MENU LATERAL
        </div>
        <div
          style={{
            background: "rgba(7,17,29,.6)",
            border: "1px solid rgba(214,176,92,.18)",
            borderRadius: 8,
            padding: "14px 16px",
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <FloatMark size={44} />
          <div
            style={{
              fontFamily: "'Playfair Display', serif",
              fontWeight: 600,
              fontSize: 21,
              letterSpacing: "0.18em",
              paddingLeft: "0.18em",
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
