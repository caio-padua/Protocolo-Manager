import { describe, expect, it } from "vitest";
import { decidirAcesso, type PapeisClinica } from "../lib/papeis-acesso";

const base: PapeisClinica = { admin: false, doctor: false, nurse: false, reception: false, finance: false };
const perfis: Record<string, PapeisClinica> = {
  adminNaoMedico: { ...base, admin: true },
  medicoAdmin: { ...base, admin: true, doctor: true },
  associado: { ...base, doctor: true },
  enfermagem: { ...base, nurse: true },
  recepcao: { ...base, reception: true },
  financeiro: { ...base, finance: true },
  semPapel: base,
};

const pode = (perfil: string, metodo: string, path: string, extra: Partial<Parameters<typeof decidirAcesso>[0]> = {}) =>
  decidirAcesso({ path, metodo, autenticado: true, donoPlataforma: false, papeis: perfis[perfil], ...extra });

// [perfil, método, caminho, esperado]
const matriz: [string, string, string, boolean][] = [
  ["adminNaoMedico", "POST", "/prescriptions", false],
  ["adminNaoMedico", "GET", "/receituario/1", false],
  ["adminNaoMedico", "GET", "/payments", true],
  ["adminNaoMedico", "POST", "/payments", true],
  ["adminNaoMedico", "POST", "/asaas/invoice/launch", true],
  ["adminNaoMedico", "PUT", "/professionals/3", true],
  ["adminNaoMedico", "GET", "/fornecedores", true],
  ["adminNaoMedico", "GET", "/prontuario/5", false],
  ["medicoAdmin", "POST", "/prescriptions", true],
  ["medicoAdmin", "GET", "/cockpit/5", true],
  ["medicoAdmin", "POST", "/payments", true],
  ["medicoAdmin", "PUT", "/professionals/3", true],
  ["associado", "POST", "/prescriptions", true],
  ["associado", "GET", "/prontuario/5", true],
  ["associado", "GET", "/exames-lab/x", true],
  ["associado", "GET", "/payments", false],
  ["associado", "GET", "/fornecedores", false],
  ["associado", "GET", "/padteam/x", false],
  ["associado", "PUT", "/professionals/3", false],
  ["associado", "GET", "/professionals", true],
  ["enfermagem", "POST", "/prescriptions", false],
  ["enfermagem", "GET", "/prescriptions", false],
  ["enfermagem", "GET", "/cockpit/5", true],
  ["enfermagem", "GET", "/payments", false],
  ["enfermagem", "GET", "/sessions", true],
  ["recepcao", "GET", "/payments", true],
  ["recepcao", "GET", "/budgets", true],
  ["recepcao", "POST", "/payments", false],
  ["recepcao", "PUT", "/payments/1", false],
  ["recepcao", "GET", "/prontuario/5", false],
  ["recepcao", "GET", "/exames-lab/x", false],
  ["recepcao", "GET", "/clients/5/fotos-corpo", false],
  ["recepcao", "GET", "/fornecedores", false],
  ["recepcao", "GET", "/clients", true],
  ["financeiro", "GET", "/payments", true],
  ["financeiro", "POST", "/asaas/invoice/launch", true],
  ["financeiro", "GET", "/pax-finance/ledger", true],
  ["financeiro", "GET", "/prontuario/5", false],
  ["financeiro", "GET", "/exames-lab/x", false],
  ["financeiro", "GET", "/cockpit/5", false],
  ["financeiro", "GET", "/clients/5/avaliacoes", false],
  ["financeiro", "POST", "/prescriptions", false],
  ["semPapel", "GET", "/payments", false],
  ["semPapel", "GET", "/prontuario/5", false],
];

describe("autorização por papel x clínica", () => {
  it.each(matriz)("%s %s %s => permitido=%s", (perfil, metodo, path, esperado) => {
    expect(pode(perfil, metodo, path).ok).toBe(esperado);
  });

  it("negado devolve 403 com domínio", () => {
    const d = pode("recepcao", "POST", "/payments");
    expect(d).toMatchObject({ ok: false, status: 403, dominio: "financeiro" });
  });

  it("não autenticado em rota protegida => 401, em rota livre => permitido", () => {
    expect(pode("associado", "GET", "/payments", { autenticado: false, papeis: null })).toMatchObject({ ok: false, status: 401 });
    expect(pode("associado", "GET", "/health", { autenticado: false, papeis: null }).ok).toBe(true);
  });

  it("webhook e arquivo por token continuam públicos por desenho", () => {
    expect(pode("semPapel", "POST", "/asaas/webhook", { autenticado: false, papeis: null }).ok).toBe(true);
    expect(pode("semPapel", "GET", "/exam-requests/file/abc", { autenticado: false, papeis: null }).ok).toBe(true);
  });

  it("combinação de papéis é união (enfermagem + financeiro)", () => {
    const comb = { ...base, nurse: true, finance: true };
    expect(decidirAcesso({ path: "/payments", metodo: "POST", autenticado: true, donoPlataforma: false, papeis: comb }).ok).toBe(true);
    expect(decidirAcesso({ path: "/cockpit/1", metodo: "GET", autenticado: true, donoPlataforma: false, papeis: comb }).ok).toBe(true);
    expect(decidirAcesso({ path: "/prescriptions", metodo: "POST", autenticado: true, donoPlataforma: false, papeis: comb }).ok).toBe(false);
  });

  it("papéis de outra clínica não valem: sem linha na clínica atual => negado", () => {
    expect(decidirAcesso({ path: "/payments", metodo: "GET", autenticado: true, donoPlataforma: false, papeis: null }).ok).toBe(false);
  });

  it("CEO (dono da plataforma) mantém acesso total", () => {
    expect(decidirAcesso({ path: "/prescriptions", metodo: "POST", autenticado: true, donoPlataforma: true, papeis: null }).ok).toBe(true);
  });
});
