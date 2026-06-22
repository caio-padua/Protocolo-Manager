import SYM from "../../../assets/paxter-symbol.png";

const ANTIQUE = "#cbac63";

function Mark({ size }: { size: number }) {
  return (
    <img
      src={SYM}
      alt="PAXTER"
      style={{
        width: size,
        height: size,
        objectFit: "contain",
        mixBlendMode: "screen",
      }}
    />
  );
}

export default function LogoQuiet() {
  return (
    <div
      className="w-full h-full flex flex-col"
      style={{ minHeight: "100vh", background: "#0a121d" }}
    >
      <div className="flex-1 flex flex-col items-center justify-center px-10">
        <Mark size={120} />
        <div
          className="mt-9"
          style={{
            fontFamily: "'Montserrat', sans-serif",
            fontWeight: 300,
            fontSize: 40,
            letterSpacing: "0.52em",
            lineHeight: 1,
            color: ANTIQUE,
            paddingLeft: "0.52em",
          }}
        >
          PAXTER
        </div>
        <div
          style={{
            width: 64,
            height: 1,
            marginTop: 22,
            background: "rgba(203,172,99,.55)",
          }}
        />
        <div
          className="mt-5 text-center"
          style={{
            fontFamily: "'Montserrat', sans-serif",
            fontWeight: 400,
            fontSize: 9.5,
            letterSpacing: "0.40em",
            color: "#7d8b98",
            paddingLeft: "0.40em",
          }}
        >
          MOTOR CLÍNICO · PROTOCOLOS INJETÁVEIS
        </div>
      </div>

      <div
        className="px-6 pb-6 pt-4"
        style={{ borderTop: "1px solid rgba(203,172,99,.14)" }}
      >
        <div
          style={{
            fontFamily: "'Montserrat', sans-serif",
            fontSize: 8.5,
            letterSpacing: "0.22em",
            color: "rgba(125,139,152,.8)",
            marginBottom: 8,
          }}
        >
          COMO APARECE NO MENU LATERAL
        </div>
        <div
          style={{
            background: "#0c1726",
            border: "1px solid rgba(203,172,99,.14)",
            borderRadius: 8,
            padding: "14px 16px",
            display: "flex",
            alignItems: "center",
            gap: 13,
          }}
        >
          <Mark size={38} />
          <div
            style={{
              fontFamily: "'Montserrat', sans-serif",
              fontWeight: 300,
              fontSize: 18,
              letterSpacing: "0.40em",
              color: ANTIQUE,
              paddingLeft: "0.40em",
            }}
          >
            PAXTER
          </div>
        </div>
      </div>
    </div>
  );
}
