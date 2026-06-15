import {
  runTransmutacaoMotor,
  DEFAULT_EXAMES_URL,
  DEFAULT_MOTOR_URL,
  DEFAULT_ENDOVENOSOS_URL,
} from "../lib/transmutacao-motor";

const consoleLog: {
  info: (...a: any[]) => void;
  warn: (...a: any[]) => void;
  error: (...a: any[]) => void;
} = {
  info: (...a) => console.log("[info]", ...a),
  warn: (...a) => console.warn("[warn]", ...a),
  error: (...a) => console.error("[error]", ...a),
};

runTransmutacaoMotor({
  examesUrl: process.env.EXAMES_URL ?? DEFAULT_EXAMES_URL,
  motorUrl: process.env.MOTOR_URL ?? DEFAULT_MOTOR_URL,
  endovenososUrl: process.env.ENDOVENOSOS_URL ?? DEFAULT_ENDOVENOSOS_URL,
  log: consoleLog,
})
  .then((report) => {
    console.log("\n===== RELATORIO TRANSMUTACAO MOTOR =====");
    console.log(JSON.stringify(report, null, 2));
    process.exit(0);
  })
  .catch((err) => {
    console.error("FALHA:", err);
    process.exit(1);
  });
