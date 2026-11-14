import pino from "pino";
import { redigir } from "./redact.js";

const isProduction = process.env.NODE_ENV === "production";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: [
    "req.headers.authorization",
    "req.headers.cookie",
    "res.headers['set-cookie']",
  ],
  // Etapa 0: redacao por NOME (sem diferenciar maiusculas) e por VALOR em todo
  // objeto registrado, inclusive erros e URLs.
  formatters: {
    log: (obj) => redigir(obj as Record<string, unknown>),
  },
  hooks: {
    logMethod(args, method) {
      const a = args.map((x) => (typeof x === "string" ? redigir(x) : x)) as typeof args;
      method.apply(this, a);
    },
  },
  ...(isProduction
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: { colorize: true },
        },
      }),
});
