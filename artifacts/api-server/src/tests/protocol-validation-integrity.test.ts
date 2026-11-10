import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

// Isolated route tests: synthetic store, no clinical database or external sends.
const state = vi.hoisted(() => ({
  rows: {} as Record<string, any[]>,
  tail: Promise.resolve(),
  failInsert: false,
  denyIdentity: false,
  lockCalls: 0,
  inserts: 0,
}));

vi.mock("@workspace/db", () => {
  const names = {
    protocolsTable: "protocols", protocolItemsTable: "items",
    clientsTable: "clients", substancesTable: "substances",
    professionalsTable: "professionals", sessionsTable: "sessions",
    substanceApplicationsTable: "applications", paymentsTable: "payments",
    assinaturaSolicitacoesTable: "solicitacoes", assinaturaTemplatesTable: "templates",
    protocolEmissoesTable: "emissoes", locationProfessionalsTable: "memberships",
  };
  function chain(rows: any[]): any {
    const q: any = {
      where: () => q, orderBy: () => q, limit: () => q,
      for: (mode: string) => { expect(mode).toBe("update"); state.lockCalls++; return q; },
      then: (ok: any, fail: any) => Promise.resolve(rows).then(ok, fail),
    };
    return q;
  }
  function storeApi(rows: Record<string, any[]>) {
    return {
      select: () => ({ from: (table: any) => chain(rows[table.name] ?? []) }),
      insert: (table: any) => ({
        values: (values: any) => {
          state.inserts++;
          const promise = Promise.resolve().then(() => {
            if (state.failInsert && table.name === "applications") throw new Error("synthetic database failure");
            const row = { id: state.inserts, createdAt: new Date("2030-01-01T12:00:00Z"), ...values };
            (rows[table.name] ??= []).push(row);
            return [row];
          });
          return Object.assign(promise, { returning: () => promise });
        },
      }),
      update: (table: any) => ({
        set: (values: any) => ({
          where: () => ({
            returning: async () => {
              Object.assign(rows[table.name][0], values);
              return rows[table.name];
            },
          }),
        }),
      }),
    };
  }
  const db = {
    select: () => storeApi(state.rows).select(),
    transaction: async (run: any) => {
      // Serial queue models the row lock; separate PostgreSQL proof is still required.
      const previous = state.tail;
      let release!: () => void;
      state.tail = new Promise<void>(resolve => { release = resolve; });
      await previous;
      const draft = structuredClone(state.rows);
      try {
        const result = await run(storeApi(draft));
        state.rows = draft;
        return result;
      } finally { release(); }
    },
  };
  return {
    db,
    ...Object.fromEntries(Object.entries(names).map(([key, name]) => [key, {
      name, id: `${name}.id`, protocolId: `${name}.protocol_id`,
    }])),
  };
});
vi.mock("../middleware/moduleGuard", () => ({ moduleGuard: () => (_r: any, _s: any, n: any) => n() }));
vi.mock("../middleware/tenantContext", () => ({ resolveEmpresaId: () => 99 }));
vi.mock("../routes/collaborator", () => ({
  requireCollaborator: (r: any, s: any, n: any) => {
    if (r.headers.authorization !== "Bearer synthetic-session") { s.sendStatus(401); return; }
    r.collaborator = { professionalId: 98 };
    n();
  },
}));
vi.mock("../lib/clinical-emitter", () => ({
  ClinicalIdentityError: class extends Error {},
  resolveClinicalMember: async () => {
    if (state.denyIdentity) throw new Error("synthetic scope denial");
    return { clinic: { id: 97, empresaId: 99 } };
  },
}));
vi.mock("../lib/google-drive", () => ({
  ensureClientFolderStructure: vi.fn(), uploadFileToDrive: vi.fn(),
  uploadToFolderById: vi.fn(), shareWithClient: vi.fn(),
  isDriveConnected: vi.fn(), formatPhysicalRASFileName: vi.fn(),
}));
vi.mock("../lib/pdf-signer", () => ({
  generateProtocolDocumentPdf: vi.fn(), generatePhysicalRASPdf: vi.fn(), getCertInfo: vi.fn(),
}));
vi.mock("../lib/pdf-carta-tratamento", () => ({
  generateProtocolLetterPdf: vi.fn(), buildCartaTratamentoDto: vi.fn(),
}));
vi.mock("../lib/prescription-signing", () => ({ withLoggedDoctorCertificate: vi.fn() }));
vi.mock("../lib/assinatura/service", () => ({ enviarAssinatura: vi.fn() }));
vi.mock("../lib/cadernos-resolver", () => ({ resolverCodigosCadernos: vi.fn() }));
vi.mock("../lib/ras-fap-alert", () => ({ notifySlackRasFapFailure: vi.fn() }));
vi.mock("../lib/slack-reporter", () => ({ postSlackAlert: vi.fn() }));
vi.mock("../lib/google-gmail", () => ({ isGmailConnected: vi.fn(async () => true) }));
vi.mock("../lib/email-service", () => ({
  sendProtocolEmail: vi.fn(), sendCartaTratamentoEmail: vi.fn(),
  sendProtocolOnboardingEmail: vi.fn(async () => ({ success: true })),
}));
vi.mock("../lib/session-ics", () => ({ buildEventsForSessions: vi.fn(async () => []) }));
vi.mock("../lib/ics", () => ({ buildVCalendar: vi.fn() }));

import router from "../routes/protocols";
import { sendProtocolOnboardingEmail } from "../lib/email-service";
const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  req.log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any;
  next();
});
app.use("/api", router);
app.use((err: Error, _req: any, res: any, _next: any) => res.status(500).json({ error: err.message, stack: err.stack }));

const validate = (query = "") => request(app)
  .post(`/api/protocols/1/validate${query}`)
  .set("Authorization", "Bearer synthetic-session");

beforeEach(() => {
  vi.clearAllMocks();
  state.tail = Promise.resolve();
  state.failInsert = false;
  state.denyIdentity = false;
  state.lockCalls = 0;
  state.inserts = 0;
  state.rows = {
    protocols: [{
      id: 1, clientId: 96, empresaId: 99, professionalId: null,
      status: "suggested", startDate: "2030-01-01", totalSessions: 2,
      completedSessions: 0, unit: "Local sintético", serviceType: "clinic",
      createdAt: new Date("2030-01-01T12:00:00Z"),
      updatedAt: new Date("2030-01-01T12:00:00Z"),
    }],
    clients: [{ id: 96, name: "Cliente sintético", email: "synthetic@example.invalid" }],
    items: [{ substanceId: 95, dose: "dose sintética", totalSessions: 2, intervalDays: 7 }],
    sessions: [], applications: [],
  };
});

describe("Bloqueio da validação antiga sem reserva", () => {
  it("recusa criar sessões sem passar pela prévia e reserva", async () => {
    const response = await validate("?scheduledTime=10:00");
    expect(response.status, JSON.stringify(response.body)).toBe(409);
    expect(response.body.message).toContain("não reserva horários");
    expect(state.rows.sessions).toEqual([]);
    expect(state.rows.protocols[0].status).toBe("suggested");
    expect(state.lockCalls).toBe(1);
    expect(state.inserts).toBe(0);
    expect(sendProtocolOnboardingEmail).not.toHaveBeenCalled();
  });
  it("recusa repetição sem criar sessões", async () => {
    expect((await validate()).status).toBe(409);
    expect((await validate()).status).toBe(409);
    expect(state.rows.sessions).toEqual([]);
    expect(state.inserts).toBe(0);
  });
  it("preserva sessões históricas sem convertê-las em reservas", async () => {
    state.rows.protocols[0].status = "validated";
    state.rows.sessions.push({ id: 90, status: "scheduled", resourceId: null, durationMinutes: null });
    const before = structuredClone(state.rows.sessions);
    expect((await validate()).status).toBe(409);
    expect(state.rows.sessions).toEqual(before);
    expect(state.inserts).toBe(0);
  });
  it.each(["24:00", "10:60", "9:00", "invalid", ""])("recusa horário inválido %s", async time => {
    expect((await validate(`?scheduledTime=${time}`)).status).toBe(400);
    expect(state.inserts).toBe(0);
  });
  it("mantém o banco inalterado após nova chamada", async () => {
    expect((await validate("?scheduledTime=10:00")).status).toBe(409);
    const before = structuredClone(state.rows);
    expect((await validate("?scheduledTime=11:00")).status).toBe(409);
    expect(state.rows).toEqual(before);
    expect(sendProtocolOnboardingEmail).not.toHaveBeenCalled();
  });
  it("recusa chamadas concorrentes sem gravar sessões", async () => {
    const responses = await Promise.all([validate("?scheduledTime=10:00"), validate("?scheduledTime=10:00")]);
    expect(responses.map(r => r.status)).toEqual([409, 409]);
    expect(state.rows.sessions).toHaveLength(0);
    expect(state.rows.applications).toHaveLength(0);
    expect(sendProtocolOnboardingEmail).not.toHaveBeenCalled();
  });
  it("não tenta persistir mesmo quando o banco teria falhado", async () => {
    state.failInsert = true;
    expect((await validate()).status).toBe(409);
    expect(state.rows.sessions).toHaveLength(0);
    expect(state.rows.protocols[0].status).toBe("suggested");
    expect(state.inserts).toBe(0);
    expect(sendProtocolOnboardingEmail).not.toHaveBeenCalled();
  });
  it.each(["active", "completed", "cancelled"])("não reconstrói protocolo %s", async status => {
    state.rows.protocols[0].status = status;
    expect((await validate()).status).toBe(409);
    expect(state.inserts).toBe(0);
  });
  it("não apaga sessões preexistentes de protocolo sugerido", async () => {
    state.rows.sessions.push({ id: 90, status: "completed" });
    expect((await validate()).status).toBe(409);
    expect(state.rows.sessions).toEqual([{ id: 90, status: "completed" }]);
  });
  it("bloqueia protocolo sem substâncias", async () => {
    state.rows.items = [];
    expect((await validate()).status).toBe(409);
    expect(state.inserts).toBe(0);
  });
  it("respeita supressão explícita de onboarding", async () => {
    expect((await validate("?skipOnboardingEmail=true")).status).toBe(409);
    expect(sendProtocolOnboardingEmail).not.toHaveBeenCalled();
  });
  it("não inicia persistência sem sessão", async () => {
    expect((await request(app).post("/api/protocols/1/validate")).status).toBe(401);
    expect(state.lockCalls).toBe(0);
  });
  it("não inicia persistência quando a identidade clínica é recusada", async () => {
    state.denyIdentity = true;
    expect((await validate()).status).toBe(404);
    expect(state.lockCalls).toBe(0);
  });
});
