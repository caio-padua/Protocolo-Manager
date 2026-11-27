/**
 * Servidor COMPLETO (src/app.ts real) em :18999 sobre PostgreSQL descartável, com profissionais e clientes sintéticos.
 * Só liga com HARNESS_COMPLETO=1 e fica de pé até existir /tmp/harness.stop. Logins reais emitem os tokens.
 * Senha dos profissionais: Senha-Teste-9a!  Senha da cliente Ana (CPF 52998224725): Paciente-Teste-9a!
 */
import { describe, expect, it, vi } from "vitest";
import { existsSync, rmSync, writeFileSync } from "node:fs";
import { subirServidorCompleto } from "./helpers/servidor-completo";

vi.mock("../lib/sheets-dicionario", () => ({ sincronizarDicionarioSheets: vi.fn(async () => ({})) }));
vi.mock("../lib/seed-avatares", () => ({ runSeedAvatares: vi.fn(async () => ({})) }));

describe.skipIf(!process.env.HARNESS_COMPLETO)("harness servidor completo", () => {
  it("serve até /tmp/harness.stop", async () => {
    const s = await subirServidorCompleto();
    const { ensureClienteMedicacoes } = await import("../lib/ensure-cliente-medicacoes.js");
    await ensureClienteMedicacoes();
    const { hashPassword } = await import("../lib/collaborator-auth.js");
    const { hashPassword: hashPac } = await import("../lib/patient-auth");
    await s.pool.query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS sexo_biologico text`);
    await s.pool.query(`INSERT INTO empresas (id, nome, ativa, status, tipo) VALUES (5, 'Clinica Sintetica', true, 'ATIVO', 'clinic')`);
    await s.pool.query(`INSERT INTO professionals (id,name,email,password_hash,is_platform_owner,registration_number,empresa_id) VALUES
      (1,'Titular Sintetico','titular@teste.com',$1,true,'111111',5),(2,'Comum Sintetico','comum@teste.com',$1,false,'222222',5),
      (3,'Dr Convidado','dr@teste.com',$1,false,'123456',5)`, [hashPassword("Senha-Teste-9a!")]);
    await s.pool.query(`SELECT setval(pg_get_serial_sequence('professionals','id'), 10)`);
    await s.pool.query(`INSERT INTO clients (id,name,cpf,password_hash,must_change_password,empresa_id) VALUES
      (1,'Ana Sintetica','52998224725',$1,false,5),(2,'Beto Sintetico','11144477735',$2,true,5)`, [hashPac("Paciente-Teste-9a!"), hashPac("Provisoria-9a!")]);
    const srv = s.app.listen(18999, "127.0.0.1");
    rmSync("/tmp/harness.stop", { force: true });
    writeFileSync("/tmp/harness.ready", "1");
    while (!existsSync("/tmp/harness.stop")) await new Promise((r) => setTimeout(r, 500));
    srv.close(); await s.parar();
    expect(true).toBe(true);
  }, 3_600_000);
});
