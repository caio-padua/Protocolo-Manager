import { describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
vi.mock("@workspace/db", async () => ({ ...await import("../../../../lib/db/src/schema"), db: {} }));
vi.mock("../lib/receituario-motor", () => ({ emitirReceituarioPdf: vi.fn() }));
vi.mock("../lib/whatsapp", () => ({ sendWhatsapp: vi.fn() }));
vi.mock("../lib/telegram", () => ({ sendTelegram: vi.fn() }));
vi.mock("../lib/google-gmail", () => ({ sendGmailMessage: vi.fn() }));
vi.mock("../lib/prescription-reminder-message", () => ({ prescriptionReminderMessage: vi.fn() }));
import { authorizedPrescriptionFilter } from "../routes/prescription-delivery";
import { clinicalClientFilter, reminderConsentFilter } from "../lib/reminder-consent";
const dialect = new PgDialect();
describe("isolamento por vínculo clínico, sem empresa fixa", () => {
  it("lista e leitura exigem relação profissional/local e empresa do paciente", () => {
    const query = dialect.sqlToQuery(authorizedPrescriptionFilter(41));
    expect(query.params).toEqual([41]);
    expect(query.sql).toContain('c.empresa_id = "prescriptions"."empresa_id"');
    expect(query.sql).toContain("location_professionals");
    expect(query.sql).toContain("p.active = true");
    expect(query.sql).toContain("p.professional_type = 'medico'");
    expect(query.sql).not.toContain("is_primary_doctor");
  });
  it("Central só lista pacientes da clínica com vínculo ativo", () => {
    const query = dialect.sqlToQuery(clinicalClientFilter(42));
    expect(query.params).toEqual([42]); expect(query.sql).toContain('"clients"."empresa_id"');
    expect(query.sql).toContain('"clients"."location_id"');
  });
  it("cron exige prova de confirmação para telefone, paciente, clínica e profissional ainda ativo", () => {
    const query = dialect.sqlToQuery(reminderConsentFilter());
    for (const fragment of ["reminder_authorization", "authorized", "recipient", "clientId", "locationId",
      "actorId", "p.active = true", 'd.empresa_id = "clients"."empresa_id"', 'l.id = "clients"."location_id"']) {
      expect(query.sql).toContain(fragment);
    }
  });
});
