import { describe, expect, it } from "vitest";
import { decidirAcesso, type PapeisClinica } from "../lib/papeis-acesso.js";
import { montarMapaPermissoes } from "../lib/perfis-permissoes.js";

/**
 * Fatia 4 — bateria final determinística dos 6 perfis.
 * Tabela ESPERADA escrita à mão (independente do código) x decisão real do servidor,
 * para leitura (GET) e escrita (POST) em cada domínio. Também cobre CEO, sem login e sem papel.
 */
const v: PapeisClinica = { admin: false, doctor: false, nurse: false, reception: false, finance: false };
const PERFIS: Record<string, PapeisClinica> = {
  "admin-nao-medico": { ...v, admin: true },
  "medico-admin": { ...v, admin: true, doctor: true },
  "medico-associado": { ...v, doctor: true },
  enfermagem: { ...v, nurse: true },
  recepcao: { ...v, reception: true },
  financeiro: { ...v, finance: true },
};
const CAMINHO: Record<string, string> = {
  prescricao: "/prescriptions/1",
  prontuario: "/prontuario/1",
  "custos-fornecedor": "/fornecedores",
  financeiro: "/payments/1",
  equipe: "/padteam",
};
// [ler, escrever] esperado por perfil e domínio
const ESPERADO: Record<string, Record<string, [boolean, boolean]>> = {
  "admin-nao-medico": { prescricao: [false, false], prontuario: [false, false], "custos-fornecedor": [true, true], financeiro: [true, true], equipe: [true, true] },
  "medico-admin": { prescricao: [true, true], prontuario: [true, true], "custos-fornecedor": [true, true], financeiro: [true, true], equipe: [true, true] },
  "medico-associado": { prescricao: [true, true], prontuario: [true, true], "custos-fornecedor": [false, false], financeiro: [false, false], equipe: [false, false] },
  enfermagem: { prescricao: [false, false], prontuario: [true, true], "custos-fornecedor": [false, false], financeiro: [false, false], equipe: [false, false] },
  recepcao: { prescricao: [false, false], prontuario: [false, false], "custos-fornecedor": [false, false], financeiro: [true, false], equipe: [false, false] },
  financeiro: { prescricao: [false, false], prontuario: [false, false], "custos-fornecedor": [true, true], financeiro: [true, true], equipe: [false, false] },
};
const decide = (papeis: PapeisClinica | null, path: string, metodo: string, extra: Partial<{ autenticado: boolean; donoPlataforma: boolean }> = {}) =>
  decidirAcesso({ path, metodo, autenticado: true, donoPlataforma: false, papeis, ...extra });

describe("bateria final: 6 perfis x 5 domínios x leitura/escrita", () => {
  for (const [perfil, dominios] of Object.entries(ESPERADO)) {
    for (const [dom, [ler, escrever]] of Object.entries(dominios)) {
      it(`${perfil} | ${dom} | ler=${ler} escrever=${escrever}`, () => {
        const lido = decide(PERFIS[perfil], CAMINHO[dom], "GET");
        const escrito = decide(PERFIS[perfil], CAMINHO[dom], "POST");
        expect(lido.ok).toBe(ler);
        expect(escrito.ok).toBe(escrever);
        if (!lido.ok) expect(lido.status).toBe(403);
        if (!escrito.ok) expect(escrito.status).toBe(403);
      });
    }
  }
});

describe("bateria final: bordas", () => {
  it("sem login em rota protegida = 401", () => {
    for (const p of Object.values(CAMINHO)) {
      const d = decide(null, p, "GET", { autenticado: false });
      expect(d.ok).toBe(false);
      if (!d.ok) expect(d.status).toBe(401);
    }
  });
  it("sem papel cadastrado na clínica = 403 em todos os domínios", () => {
    for (const p of Object.values(CAMINHO)) {
      expect(decide(null, p, "GET").ok).toBe(false);
      expect(decide(v, p, "POST").ok).toBe(false);
    }
  });
  it("dono da plataforma (CEO) passa em todos", () => {
    for (const p of Object.values(CAMINHO)) {
      expect(decide(null, p, "DELETE", { donoPlataforma: true }).ok).toBe(true);
    }
  });
  it("rota fora da matriz não é bloqueada pelo guarda", () => {
    expect(decide(null, "/health", "GET").ok).toBe(true);
  });
  it("exceções públicas por desenho: webhook Asaas e arquivo de exame por link", () => {
    expect(decide(null, "/asaas/webhook", "POST", { autenticado: false }).ok).toBe(true);
    expect(decide(null, "/exam-requests/file/abc", "GET", { autenticado: false }).ok).toBe(true);
  });
  it("cadastro de equipe: escrita só administrador; leitura livre", () => {
    expect(decide(PERFIS.recepcao, "/professionals", "GET").ok).toBe(true);
    expect(decide(PERFIS.recepcao, "/professionals/5", "PATCH").ok).toBe(false);
    expect(decide(PERFIS["admin-nao-medico"], "/professionals/5", "PATCH").ok).toBe(true);
  });
  it("papéis se somam: recepção + financeiro escreve no financeiro", () => {
    expect(decide({ ...v, reception: true, finance: true }, "/payments/1", "PUT").ok).toBe(true);
  });
});

describe("bateria final: mapa da Cabine = tabela esperada", () => {
  it("cada perfil do mapa reproduz exatamente a tabela escrita à mão", () => {
    const mapa = montarMapaPermissoes();
    expect(mapa.map((m) => m.id).sort()).toEqual(Object.keys(ESPERADO).sort());
    for (const m of mapa) {
      for (const [dom, [ler, escrever]] of Object.entries(ESPERADO[m.id])) {
        const d = m.dominios.find((x) => x.dominio === dom);
        expect(d, `${m.id}/${dom}`).toBeDefined();
        expect([d!.ler, d!.escrever]).toEqual([ler, escrever]);
      }
    }
  });
});
