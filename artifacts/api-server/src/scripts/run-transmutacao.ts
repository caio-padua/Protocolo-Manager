import {
  runTransmutacao,
  DEFAULT_CATALOGO_URL,
  DEFAULT_PACIENTES_URL,
} from "../lib/transmutacao";

const consoleLog: {
  info: (...a: any[]) => void;
  warn: (...a: any[]) => void;
  error: (...a: any[]) => void;
} = {
  info: (...a) => console.log("[info]", ...a),
  warn: (...a) => console.warn("[warn]", ...a),
  error: (...a) => console.error("[error]", ...a),
};

runTransmutacao({
  catalogoUrl: process.env.CATALOGO_URL ?? DEFAULT_CATALOGO_URL,
  pacientesUrl: process.env.PACIENTES_URL ?? DEFAULT_PACIENTES_URL,
  log: consoleLog,
})
  .then((report) => {
    console.log("\n===== RELATORIO TRANSMUTACAO =====");
    console.log(JSON.stringify(report, null, 2));
    process.exit(0);
  })
  .catch((err) => {
    console.error("FALHA:", err);
    process.exit(1);
  });
