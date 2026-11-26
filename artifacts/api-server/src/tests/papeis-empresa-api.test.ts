import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

// Papéis por (profissional, clínica) simulados; o middleware real roda sobre uma API mínima.
type Linha = { isClinicAdmin: boolean; isDoctor: boolean; isNurse: boolean; isReception: boolean; isFinance: boolean };
const f = { isClinicAdmin: false, isDoctor: false, isNurse: false, isReception: false, isFinance: false };
const PAPEIS: Record<string, Linha> = {
  "1:5": { ...f, isClinicAdmin: true }, // admin não médico
  "2:2": { ...f, isClinicAdmin: true, isDoctor: true }, // médico + admin, clínica 2
  "3:5": { ...f, isDoctor: true }, // associado
  "4:5": { ...f, isNurse: true },
  "5:5": { ...f, isReception: true },
  "6:5": { ...f, isFinance: true },
  "7:5": { ...f, isNurse: true, isFinance: true }, // combinação
};
let consulta = { prof: 0, emp: 0 };

vi.mock("@workspace/db", () => {
  const chain: Record<string, unknown> = {};
  chain.select = () => chain;
  chain.from = () => chain;
  chain.where = () => chain;
  chain.limit = async () => {
    const r = PAPEIS[`${consulta.prof}:${consulta.emp}`];
    return r ? [r] : [];
  };
  return { db: chain, professionalPapeisEmpresaTable: { professionalId: "p", empresaId: "e" } };
});
vi.mock("drizzle-orm", () => ({ and: () => null, eq: () => null }));

import { papeisEmpresaMiddleware } from "../middleware/papeisEmpresa";

let server: Server;
let base = "";

beforeAll(async () => {
  const app = express();
  app.use((req, _res, next) => {
    const prof = Number(req.headers["x-prof"] ?? 0);
    const emp = Number(req.headers["x-emp"] ?? 5);
    consulta = { prof, emp };
    req.tenantContext = {
      empresaId: emp,
      isPlatformOwner: req.headers["x-ceo"] === "1",
      perfilPlataforma: "recepcionista",
      authenticated: prof > 0 || req.headers["x-ceo"] === "1",
      professionalId: prof || null,
    };
    next();
  });
  app.use("/api", papeisEmpresaMiddleware);
  app.all(/.*/, (_req, res) => res.status(200).json({ ok: true }));
  await new Promise<void>((r) => { server = app.listen(0, () => r()); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
});
afterAll(() => { server.close(); });

const chamar = async (metodo: string, path: string, h: Record<string, string> = {}) =>
  (await fetch(base + path, { method: metodo, headers: h })).status;

const casos: [string, Record<string, string>, string, string, 200 | 403 | 401][] = [
  ["CEO em qualquer clínica", { "x-ceo": "1", "x-emp": "2" }, "POST", "/prescriptions", 200],
  ["admin não médico: financeiro", { "x-prof": "1" }, "POST", "/payments", 200],
  ["admin não médico: nota fiscal", { "x-prof": "1" }, "POST", "/asaas/invoice/launch", 200],
  ["admin não médico: equipe", { "x-prof": "1" }, "PUT", "/professionals/9", 200],
  ["admin não médico: prescrição", { "x-prof": "1" }, "POST", "/prescriptions", 403],
  ["médico+admin na própria clínica: prescrição", { "x-prof": "2", "x-emp": "2" }, "POST", "/prescriptions", 200],
  ["médico+admin na própria clínica: financeiro", { "x-prof": "2", "x-emp": "2" }, "GET", "/payments", 200],
  ["médico+admin em outra clínica: financeiro", { "x-prof": "2", "x-emp": "5" }, "GET", "/payments", 403],
  ["médico+admin em outra clínica: prescrição", { "x-prof": "2", "x-emp": "5" }, "POST", "/prescriptions", 403],
  ["associado: prescrição", { "x-prof": "3" }, "POST", "/prescriptions", 200],
  ["associado: prontuário", { "x-prof": "3" }, "GET", "/prontuario/1", 200],
  ["associado: financeiro", { "x-prof": "3" }, "GET", "/payments", 403],
  ["associado: fornecedores", { "x-prof": "3" }, "GET", "/fornecedores", 403],
  ["associado: equipe", { "x-prof": "3" }, "GET", "/padteam/x", 403],
  ["enfermagem: agenda", { "x-prof": "4" }, "GET", "/sessions", 200],
  ["enfermagem: cockpit", { "x-prof": "4" }, "GET", "/cockpit/1", 200],
  ["enfermagem: prescrição", { "x-prof": "4" }, "POST", "/prescriptions", 403],
  ["enfermagem: financeiro", { "x-prof": "4" }, "GET", "/payments", 403],
  ["recepção: ler financeiro", { "x-prof": "5" }, "GET", "/payments", 200],
  ["recepção: cadastro", { "x-prof": "5" }, "GET", "/clients", 200],
  ["recepção: editar financeiro", { "x-prof": "5" }, "PUT", "/payments/1", 403],
  ["recepção: prontuário", { "x-prof": "5" }, "GET", "/prontuario/1", 403],
  ["recepção: laudo de exame", { "x-prof": "5" }, "GET", "/exames-lab/x", 403],
  ["financeiro: valores", { "x-prof": "6" }, "GET", "/payments", 200],
  ["financeiro: nota fiscal", { "x-prof": "6" }, "POST", "/asaas/invoice/launch", 200],
  ["financeiro: repasses", { "x-prof": "6" }, "POST", "/asaas/transfer", 200],
  ["financeiro: prontuário", { "x-prof": "6" }, "GET", "/prontuario/1", 403],
  ["financeiro: laudos", { "x-prof": "6" }, "GET", "/exames-lab/x", 403],
  ["financeiro: evolução", { "x-prof": "6" }, "GET", "/evolucao-exames/1", 403],
  ["combinação enfermagem+financeiro: cockpit", { "x-prof": "7" }, "GET", "/cockpit/1", 200],
  ["combinação enfermagem+financeiro: nota fiscal", { "x-prof": "7" }, "POST", "/asaas/invoice/launch", 200],
  ["combinação enfermagem+financeiro: prescrição", { "x-prof": "7" }, "POST", "/prescriptions", 403],
  ["sem papel na clínica", { "x-prof": "99" }, "GET", "/payments", 403],
  ["sem autenticação: financeiro", {}, "GET", "/payments", 401],
  ["sem autenticação: prescrição", {}, "POST", "/prescriptions", 401],
  ["sem autenticação: prontuário", {}, "GET", "/prontuario/1", 401],
];

describe("API: autorização por papel e clínica (middleware real)", () => {
  it.each(casos)("%s", async (_nome, h, metodo, path, esperado) => {
    expect(await chamar(metodo, path, h)).toBe(esperado);
  });
});
