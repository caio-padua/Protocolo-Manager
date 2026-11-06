import { describe, expect, it } from "vitest";
import {
  getCertBufferSync,
  getCertPasswordsSync,
  isDoctorCertificateActive,
  runWithDoctorCertificate,
} from "../lib/cert-source";

describe("certificado do médico autenticado", () => {
  const doctorA = { buffer: Buffer.from("medico-a"), password: "Senha-A" };
  const doctorB = { buffer: Buffer.from("medico-b"), password: "Senha-B" };

  it("usa somente o certificado do médico dentro da chamada", async () => {
    expect(isDoctorCertificateActive()).toBe(false);
    await runWithDoctorCertificate(doctorA, async () => {
      expect(isDoctorCertificateActive()).toBe(true);
      expect(getCertBufferSync().toString()).toBe("medico-a");
      expect(getCertPasswordsSync()).toEqual(["Senha-A"]);
    });
    expect(isDoctorCertificateActive()).toBe(false);
  });

  it("isola chamadas simultâneas de médicos diferentes", async () => {
    const seen: string[] = [];
    const run = (c: typeof doctorA, delay: number) =>
      runWithDoctorCertificate(c, async () => {
        await new Promise((r) => setTimeout(r, delay));
        seen.push(getCertBufferSync().toString());
      });
    await Promise.all([run(doctorA, 20), run(doctorB, 1)]);
    expect(seen.sort()).toEqual(["medico-a", "medico-b"]);
  });
});
