/**
 * Medicações do cliente + consentimento por clínica — SQL real em BANCO DESCARTAVEL (nunca toca DATABASE_URL).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";
import {
  criarTabelasMedicacoes, decidirMedicacao, hashTexto, itensLembreteDeMedicacoes, listarParaClinica,
  mesclarItensSemDuplicar, PERIODOS_MEDICACAO, registrarConsentimento, registrarMedicacao, revogarConsentimento,
  textoDeConsentimentoVigente, ErroMedicacao,
} from "../lib/cliente-medicacoes";
import { enfileirarPdfExame, handlerPdfExameReal, payloadPdfValido } from "../lib/fila-pdf-exames";
import { criarTabelaFila } from "../lib/fila-motor";
import { MAPA_PERIODO } from "../lib/lembrete-periodo";

const PG_BIN = process.env.PG_BIN_DIR ?? "/nix/store/bgwr5i8jf8jpg75rr53rz3fqv5k8yrwp-postgresql-16.10/bin";
let dir = "";
let proc: ChildProcess | null = null;
let pool: pg.Pool;
const HOJE = "2026-11-26";
const hashVigente = () => textoDeConsentimentoVigente().hash;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "pgmed-"));
  const dados = join(dir, "dados");
  execFileSync(join(PG_BIN, "initdb"), ["-D", dados, "-A", "trust", "-U", "teste"], { stdio: "ignore" });
  proc = spawn(join(PG_BIN, "postgres"), ["-D", dados, "-c", "listen_addresses=", "-k", dir], { stdio: "ignore" });
  for (let i = 0; i < 60; i++) { if (existsSync(join(dir, ".s.PGSQL.5432"))) break; await new Promise((r) => setTimeout(r, 250)); }
  pool = new pg.Pool({ host: dir, user: "teste", database: "postgres", max: 10 });
  for (let i = 0; i < 80; i++) { try { await pool.query("SELECT 1"); break; } catch { await new Promise((r) => setTimeout(r, 250)); } }
  // Tabelas-mãe sintéticas (a produção já as tem).
  await pool.query("CREATE TABLE clients (id SERIAL PRIMARY KEY, name TEXT)");
  await pool.query("CREATE TABLE empresas (id SERIAL PRIMARY KEY, nome TEXT)");
  await pool.query("INSERT INTO clients (name) VALUES ('Cliente Sintetico 1'), ('Cliente Sintetico 2')");
  await pool.query("INSERT INTO empresas (nome) VALUES ('Clinica A'), ('Clinica B')");
  await criarTabelasMedicacoes(pool);
  await criarTabelasMedicacoes(pool); // idempotente
  await criarTabelaFila(pool);
}, 60000);

afterAll(async () => {
  await pool?.end().catch(() => {});
  if (proc) { proc.kill("SIGINT"); await new Promise((r) => setTimeout(r, 800)); }
  if (dir.startsWith(join(tmpdir(), "pgmed-"))) rmSync(dir, { recursive: true, force: true });
});

describe("origem e estado", () => {
  it("autodeclarada nasce nao_validada e o servidor ignora estado enviado", async () => {
    const r = await registrarMedicacao(pool, { clientId: 1, origem: "autodeclarada", nome: "Losartana", doseValor: 50, doseUnidade: "mg", periodos: ["manha"], ...({ estado: "validada" } as object) });
    expect(r.estado).toBe("nao_validada");
  });
  it("prescrita nasce validada e exige a clinica prescritora", async () => {
    await expect(registrarMedicacao(pool, { clientId: 1, origem: "prescrita", nome: "Sem Clinica" })).rejects.toMatchObject({ codigo: "empresa_origem_obrigatoria" });
    const r = await registrarMedicacao(pool, { clientId: 1, origem: "prescrita", empresaOrigemId: 1, nome: "Metformina", doseValor: 850, doseUnidade: "mg", periodos: ["almoco", "ceia"] });
    expect(r.estado).toBe("validada");
  });
  it("duplicada ativa e recusada com 409; outra origem com o mesmo nome e permitida", async () => {
    await expect(registrarMedicacao(pool, { clientId: 1, origem: "autodeclarada", nome: "LOSARTANA " })).rejects.toMatchObject({ codigo: "medicacao_ja_cadastrada", status: 409 });
    await expect(registrarMedicacao(pool, { clientId: 1, origem: "prescrita", empresaOrigemId: 1, nome: "losartana" })).resolves.toBeTruthy();
  });
  it("dose incompleta, periodo invalido e nome vazio sao recusados", async () => {
    await expect(registrarMedicacao(pool, { clientId: 2, origem: "autodeclarada", nome: "X", doseValor: 5 })).rejects.toMatchObject({ codigo: "dose_incompleta" });
    await expect(registrarMedicacao(pool, { clientId: 2, origem: "autodeclarada", nome: "X", periodos: ["madrugada" as never] })).rejects.toMatchObject({ codigo: "periodo_invalido" });
    await expect(registrarMedicacao(pool, { clientId: 2, origem: "autodeclarada", nome: "  " })).rejects.toMatchObject({ codigo: "nome_invalido" });
  });
  it("o banco recusa autodeclarada validada sem profissional (defesa em profundidade)", async () => {
    await expect(pool.query(
      `INSERT INTO cliente_medicacoes (client_id, origem, nome, nome_chave, estado) VALUES (2,'autodeclarada','Y','y','validada')`,
    )).rejects.toThrow();
  });
});

describe("consentimento por clinica com hash", () => {
  it("hash do texto vigente e verificavel; hash errado e recusado", async () => {
    expect(hashVigente()).toBe(hashTexto(textoDeConsentimentoVigente().texto));
    await expect(registrarConsentimento(pool, { clientId: 1, empresaId: 1, hashAceito: "0".repeat(64) })).rejects.toMatchObject({ codigo: "texto_de_consentimento_desatualizado" });
  });
  it("aceite concorrente nao duplica; revogar e aceitar de novo preserva historico", async () => {
    const r = await Promise.all([1, 2, 3, 4].map(() => registrarConsentimento(pool, { clientId: 1, empresaId: 1, hashAceito: hashVigente() })));
    expect(r.filter((x) => !x.jaExistia)).toHaveLength(1);
    expect(await revogarConsentimento(pool, { clientId: 1, empresaId: 1 })).toBe(true);
    expect(await revogarConsentimento(pool, { clientId: 1, empresaId: 1 })).toBe(false);
    await registrarConsentimento(pool, { clientId: 1, empresaId: 1, hashAceito: hashVigente() });
    const n = (await pool.query("SELECT count(*)::int n FROM cliente_medicacao_consentimentos WHERE client_id=1 AND empresa_id=1")).rows[0].n;
    expect(n).toBe(2);
  });
});

describe("validacao e visibilidade por clinica", () => {
  it("sem consentimento a clinica B nao valida nem ve a autodeclarada", async () => {
    const id = (await pool.query("SELECT id FROM cliente_medicacoes WHERE client_id=1 AND origem='autodeclarada' AND nome='Losartana'")).rows[0].id;
    await expect(decidirMedicacao(pool, { medicacaoId: id, profissionalId: 9, empresaId: 2, decisao: "validar" })).rejects.toMatchObject({ codigo: "sem_consentimento_para_a_clinica", status: 403 });
    const vistaB = await listarParaClinica(pool, 1, 2);
    expect(vistaB.find((m: any) => m.nome === "Losartana" && m.origem === "autodeclarada")).toBeUndefined();
  });
  it("prescrita de uma clinica nao aparece para outra sem consentimento", async () => {
    const vistaB = await listarParaClinica(pool, 1, 2);
    expect(vistaB.find((m: any) => m.nome === "Metformina")).toBeUndefined();
    const vistaA = await listarParaClinica(pool, 1, 1);
    expect(vistaA.find((m: any) => m.nome === "Metformina")).toBeTruthy();
  });
  it("com consentimento a clinica A valida; recusa exige motivo; nao decide duas vezes", async () => {
    const id = (await pool.query("SELECT id FROM cliente_medicacoes WHERE client_id=1 AND origem='autodeclarada' AND nome='Losartana'")).rows[0].id;
    await expect(decidirMedicacao(pool, { medicacaoId: id, profissionalId: 9, empresaId: 1, decisao: "recusar" })).rejects.toMatchObject({ codigo: "motivo_obrigatorio" });
    expect(await decidirMedicacao(pool, { medicacaoId: id, profissionalId: 9, empresaId: 1, decisao: "validar" })).toBe("validada");
    await expect(decidirMedicacao(pool, { medicacaoId: id, profissionalId: 9, empresaId: 1, decisao: "validar" })).rejects.toMatchObject({ status: 409 });
  });
  it("prescrita nao passa por validacao", async () => {
    const id = (await pool.query("SELECT id FROM cliente_medicacoes WHERE client_id=1 AND nome='Metformina'")).rows[0].id;
    await expect(decidirMedicacao(pool, { medicacaoId: id, profissionalId: 9, empresaId: 1, decisao: "validar" })).rejects.toMatchObject({ codigo: "somente_autodeclarada_precisa_de_validacao" });
  });
});

describe("integracao com o motor de lembretes", () => {
  it("entram so validadas; periodos correspondem ao mapa canonico; dose sem conversao", async () => {
    const itens = await itensLembreteDeMedicacoes(pool, 1, HOJE);
    const los = itens.find((i) => i.nome === "Losartana")!;
    const met = itens.find((i) => i.nome === "Metformina")!;
    expect(los.dose).toBe("50 mg");
    expect(los.periodos).toEqual(["manha"]);
    expect(met.periodos).toEqual(["almoco", "ceia"]);
    expect(met.alertas).toBeUndefined();
    for (const p of PERIODOS_MEDICACAO) expect(MAPA_PERIODO[p]).toBeTruthy();
    expect(PERIODOS_MEDICACAO).toHaveLength(9);
  });
  it("autodeclarada nao validada nao entra", async () => {
    await registrarMedicacao(pool, { clientId: 2, origem: "autodeclarada", nome: "Pendente", doseValor: 1, doseUnidade: "mg", periodos: ["noite"] });
    expect(await itensLembreteDeMedicacoes(pool, 2, HOJE)).toHaveLength(0);
  });
  it("revogar o consentimento tira a autodeclarada validada do lembrete na hora", async () => {
    expect((await itensLembreteDeMedicacoes(pool, 1, HOJE)).some((i) => i.nome === "Losartana")).toBe(true);
    await revogarConsentimento(pool, { clientId: 1, empresaId: 1 });
    const depois = await itensLembreteDeMedicacoes(pool, 1, HOJE);
    expect(depois.some((i) => i.nome === "Losartana")).toBe(false);
    expect(depois.some((i) => i.nome === "Metformina")).toBe(true);
    await registrarConsentimento(pool, { clientId: 1, empresaId: 1, hashAceito: hashVigente() });
  });
  it("dose ausente gera alerta (motor nao envia) e janela de datas e respeitada", async () => {
    await registrarMedicacao(pool, { clientId: 2, origem: "prescrita", empresaOrigemId: 1, nome: "Sem Dose", periodos: ["jejum"] });
    await registrarMedicacao(pool, { clientId: 2, origem: "prescrita", empresaOrigemId: 1, nome: "Futura", doseValor: 1, doseUnidade: "mg", periodos: ["jejum"], dataInicio: "2026-12-01" });
    await registrarMedicacao(pool, { clientId: 2, origem: "prescrita", empresaOrigemId: 1, nome: "Vencida", doseValor: 1, doseUnidade: "mg", periodos: ["jejum"], dataFim: "2026-11-01" });
    await registrarMedicacao(pool, { clientId: 2, origem: "prescrita", empresaOrigemId: 1, nome: "Sem Horario", doseValor: 1, doseUnidade: "mg" });
    const itens = await itensLembreteDeMedicacoes(pool, 2, HOJE);
    expect(itens.map((i) => i.nome)).toEqual(["Sem Dose"]);
    expect(itens[0].alertas).toEqual(["dose_nao_estruturada"]);
  });
  it("mesclar nao duplica por nome e a prescricao da clinica vence", () => {
    const base = [{ tipo: "formula" as const, nome: "Metformina", dose: "500 mg" }];
    const extras = [{ tipo: "formula" as const, nome: "METFORMINA", dose: "850 mg" }, { tipo: "formula" as const, nome: "Outra" }];
    const m = mesclarItensSemDuplicar(base, extras);
    expect(m.map((i) => i.nome)).toEqual(["Metformina", "Outra"]);
    expect(m[0].dose).toBe("500 mg");
  });
});

describe("fila de PDFs de exame", () => {
  const base = { empresaId: 1, clienteId: 1, driveFileId: "drv-1", nome: "a.pdf", caminho: "x/a.pdf", mimeType: "application/pdf", tipoArquivo: "pdf" as const };
  it("enfileira uma vez por arquivo do Drive", async () => {
    const a = await enfileirarPdfExame(pool, base);
    const b = await enfileirarPdfExame(pool, base);
    expect(a.duplicada).toBe(false);
    expect(b.duplicada).toBe(true);
  });
  it("payload invalido e recusado", async () => {
    await expect(enfileirarPdfExame(pool, { ...base, driveFileId: "" })).rejects.toThrow("payload_pdf_invalido");
    expect(payloadPdfValido({ clienteId: "1" })).toBe(false);
  });
  it("handler com payload corrompido falha de forma definitiva", async () => {
    await expect(handlerPdfExameReal({ payload: { x: 1 } } as never, new AbortController().signal)).rejects.toMatchObject({ name: "ErroDefinitivo" });
  });
});
