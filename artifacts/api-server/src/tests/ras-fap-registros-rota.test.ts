import { beforeEach, describe, expect, it, vi } from "vitest";

// K9 — ligação ao motor: as rotas que emitem o RAS FAP entregam os registros ao gerador do PDF
// e, se a leitura dos registros falhar, nenhum documento é gerado nem enviado (dados sintéticos).
const fake = vi.hoisted(() => ({ rowsByTable: new Map<unknown, any[]>() }));

vi.mock("@workspace/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@workspace/db")>();
  const query = (table: unknown) => {
    const q: any = {
      where: () => q, orderBy: () => q, limit: () => q,
      then: (resolve: any, reject: any) => Promise.resolve(fake.rowsByTable.get(table) ?? []).then(resolve, reject),
    };
    return q;
  };
  return {
    ...actual,
    db: {
      select: vi.fn(() => ({ from: (table: unknown) => query(table) })),
      insert: vi.fn(() => ({ values: vi.fn(async () => undefined) })),
      execute: vi.fn(),
    },
  };
});
vi.mock("../middleware/moduleGuard", () => ({
  moduleGuard: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock("../routes/collaborator", () => ({
  requireCollaborator(req: any, _res: any, next: any) {
    req.collaborator = { professionalId: 42, credentialVersion: 0 };
    req.tenantContext = { empresaId: 5, isPlatformOwner: false, authenticated: true };
    next();
  },
}));
vi.mock("../lib/clinical-emitter", async (importOriginal) => ({
  ...await importOriginal<typeof import("../lib/clinical-emitter")>(),
  resolveClinicalMember: vi.fn(async () => ({ clinic: { empresaId: 5 } })),
}));
vi.mock("../lib/protocol-ras-grid", () => ({ loadProtocolRasGrid: vi.fn() }));
vi.mock("../lib/ras-fap-registros", () => ({ loadProtocolRasRegistros: vi.fn() }));
vi.mock("../lib/google-drive", () => ({
  ensureClientFolderStructure: vi.fn(), uploadFileToDrive: vi.fn(), uploadToFolderById: vi.fn(),
  shareWithClient: vi.fn(), isDriveConnected: vi.fn(), formatRASFileName: vi.fn(),
  formatPhysicalRASFileName: vi.fn(() => "RAS FAP teste.pdf"),
}));
vi.mock("../lib/pdf-signer", () => ({
  generateSignedRASPdf: vi.fn(), generatePhysicalRASPdf: vi.fn(), getCertInfo: vi.fn(),
}));
vi.mock("../lib/email-service", () => ({ sendProtocolEmail: vi.fn() }));
vi.mock("../lib/google-gmail", () => ({ isGmailConnected: vi.fn() }));
vi.mock("../lib/assinatura/service", () => ({ enviarAssinatura: vi.fn() }));
vi.mock("../lib/cadernos-resolver", () => ({ resolverCodigosCadernos: vi.fn() }));
vi.mock("../lib/messaging/index.js", () => ({ enviarMensagemPaxter: vi.fn(), absoluteBaseUrl: vi.fn() }));

import express from "express";
import request from "supertest";
import { clientsTable, protocolItemsTable, protocolsTable, substancesTable } from "@workspace/db";
import { loadProtocolRasGrid } from "../lib/protocol-ras-grid";
import { loadProtocolRasRegistros } from "../lib/ras-fap-registros";
import { generatePhysicalRASPdf } from "../lib/pdf-signer";
import { sendProtocolEmail } from "../lib/email-service";
import { isGmailConnected } from "../lib/google-gmail";
import rasRouter from "../routes/ras";

const app = express();
app.use(express.json());
app.use("/api", rasRouter);

const protocolo = {
  id: 42, empresaId: 5, clientId: 10, professionalId: null, nurseId: null, schedulingMode: "exact",
  title: "Protocolo sintético", unit: "UNIDADE TESTE", startDate: "2026-11-09",
};
const grade = [{ number: 1, date: "2026-11-09", counters: ["1/1", "1/1"] }];
const registros = new Map([[1, { sentinela: true }]]);

beforeEach(() => {
  vi.clearAllMocks();
  fake.rowsByTable = new Map<unknown, any[]>([
    [protocolsTable, [protocolo]],
    [clientsTable, [{ id: 10, empresaId: 5, name: "Caio Henrique Souza Padua", cpf: "529.982.247-25", email: "cliente@exemplo.test", phone: "", birthDate: null }]],
    [protocolItemsTable, [
      { substanceId: 501, dose: "1 mg", totalSessions: 1, intervalDays: 7, startDate: "2026-11-09" },
      { substanceId: 502, dose: "2 mg", totalSessions: 1, intervalDays: 7, startDate: "2026-11-09" },
    ]],
    [substancesTable, [
      { id: 501, name: "SUBSTANCIA A", procedureType: "im", color: "#c9a24f" },
      { id: 502, name: "SUBSTANCIA B", procedureType: "sc", color: "#c9a24f" },
    ]],
  ]);
  vi.mocked(loadProtocolRasGrid).mockResolvedValue(grade as any);
  vi.mocked(loadProtocolRasRegistros).mockResolvedValue(registros as any);
  vi.mocked(generatePhysicalRASPdf).mockResolvedValue(new Uint8Array([37, 80, 68, 70]));
  vi.mocked(isGmailConnected).mockResolvedValue(true);
  vi.mocked(sendProtocolEmail).mockResolvedValue({ success: true } as any);
});

describe("K9 — as rotas do RAS FAP entregam os registros ao gerador", () => {
  it("T-K9-19: GET /ras/physical/:id lê os registros do protocolo na ordem das substâncias e passa ao PDF", async () => {
    const res = await request(app).get("/api/ras/physical/42");
    expect(res.status).toBe(200);
    expect(loadProtocolRasRegistros).toHaveBeenCalledWith(expect.objectContaining({ id: 42, schedulingMode: "exact", empresaId: 5, clientId: 10 }), [501, 502]);
    expect(generatePhysicalRASPdf).toHaveBeenCalledTimes(1);
    const dados = vi.mocked(generatePhysicalRASPdf).mock.calls[0]![0] as any;
    expect(dados.registros).toBe(registros);
    expect(dados.persistedGrid).toBe(grade);
    expect(dados.substances.map((s: any) => s.name)).toEqual(["SUBSTANCIA A", "SUBSTANCIA B"]); // mesma ordem de [501, 502]
  });

  it("T-K9-20: POST reenviar-email passa os mesmos registros ao PDF que segue por e-mail", async () => {
    const res = await request(app).post("/api/ras/physical/42/reenviar-email");
    expect(res.status).toBe(200);
    expect(loadProtocolRasRegistros).toHaveBeenCalledWith(expect.objectContaining({ id: 42 }), [501, 502]);
    const dados = vi.mocked(generatePhysicalRASPdf).mock.calls[0]![0] as any;
    expect(dados.registros).toBe(registros);
    expect(sendProtocolEmail).toHaveBeenCalledTimes(1);
  });

  it("T-K9-21: falha na leitura dos registros = erro explícito; nenhum PDF gerado e nenhum e-mail enviado", async () => {
    vi.mocked(loadProtocolRasRegistros).mockRejectedValue(new Error("RAS: numeração das visitas ambígua; os registros não podem ser ligados à grade"));
    const leitura = await request(app).get("/api/ras/physical/42");
    expect(leitura.status).toBe(500);
    expect(leitura.body.details).toMatch(/numeração das visitas ambígua/);
    const reenvio = await request(app).post("/api/ras/physical/42/reenviar-email");
    expect(reenvio.status).toBe(500);
    expect(generatePhysicalRASPdf).not.toHaveBeenCalled();
    expect(sendProtocolEmail).not.toHaveBeenCalled();
  });
});

// A identidade da clínica (empresas.nome) e a pertença da unidade têm teste próprio em clinic-unit.test.ts;
// aqui o foco é outro, então o módulo fica fixo e sem consulta ao banco simulado.
vi.mock("../lib/clinic-unit", () => ({
  comNomeDaClinica: async (m: any) => ({ ...m, clinic: { ...m.clinic, name: m.clinic.name ?? "Clínica sintética" } }),
  nomeDaClinica: async () => "Clínica sintética",
  unidadePertenceAClinica: async () => true,
  MENSAGEM_UNIDADE_FORA_DA_CLINICA: "A unidade salva no protocolo pertence a outra clínica e não corresponde à clínica vinculada ao cliente.",
}));

// A identidade do médico do protocolo tem teste próprio; aqui o foco é a entrega dos registros ao PDF.
vi.mock("../lib/prescription-signing", async (importOriginal) => ({
  ...await importOriginal<typeof import("../lib/prescription-signing")>(),
  resolveProtocolDoctor: vi.fn(async () => ({ professional: { name: "Médico sintético", crm: "123", uf: "SP" } })),
}));
