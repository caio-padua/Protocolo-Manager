import { randomBytes } from "node:crypto";

import { conferirHash, gerarHash, precisaRegravarRotulo } from "./passwordScheme.js";

// Acesso leve do paciente (Bloco D). A derivacao e o rotulo vivem em
// passwordScheme.ts, compartilhado com o esquema do colaborador. Motivo de
// existir um modulo comum: ate 30/07/2026 os dois gravavam com o rotulo
// identico `scrypt$` e derivavam de formas incompativeis, e um hash no campo
// errado devolvia `false` — indistinguivel de senha errada.
// Ver item 10 da linha de producao.
// A senha em texto puro NUNCA e gravada nem registrada em log.

export function hashPassword(plain: string): string {
  return gerarHash("paciente", plain);
}

export function verifyPassword(plain: string, stored: string | null | undefined): boolean {
  return conferirHash("paciente", plain, stored);
}

export { precisaRegravarRotulo };

// Senha provisoria legivel: 8 caracteres sem simbolos ambiguos (sem I, O, 0, 1).
// Uso unico — o paciente e OBRIGADO a trocar no 1o acesso (mustChangePassword).
export function generateProvisionalPassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(8);
  let out = "";
  for (let i = 0; i < 8; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

// Token opaco para o link "definir/recuperar acesso" (Bloco D, R14 / caso extremo 6).
export function generateAccessToken(): string {
  return randomBytes(24).toString("hex");
}

// Regras minimas da nova senha definida pelo paciente no 1o acesso.
export function isStrongEnough(plain: string): boolean {
  return typeof plain === "string" && plain.trim().length >= 6;
}
