/**
 * Adesão: identidade estável (medicacao_id na chave), migração que preserva histórico e job diário das 00:05.
 * Banco PostgreSQL DESCARTÁVEL, dados sintéticos. Nenhuma mensagem é enviada.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { iniciarPgDescartavel } from "./helpers/pg-descartavel";
import { criarTabelasMedicacoes, registrarMedicacao } from "../lib/cliente-medicacoes";
import { calcularAdesao, criarTabelaTomadas, horariosDoDia, materializarDiasSemAbertura, registrarTomada, sincronizarAgendaDoDia } from "../lib/cliente-medicacao-adesao";

const bd = iniciarPgDescartavel();
let pool: pg.Pool;
const HOJE = "2026-11-26";

async function nova(clientId: number, nome: string) {
  return (await registrarMedicacao(pool, { clientId, origem: "autodeclarada", nome, doseValor: 1, doseUnidade: "mg", periodos: ["manha"] })).id;
}

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: bd.url });
  await pool.query("CREATE TABLE clients (id SERIAL PRIMARY KEY, name TEXT)");
  await pool.query("CREATE TABLE empresas (id SERIAL PRIMARY KEY, nome TEXT)");
  await pool.query("INSERT INTO clients (name) VALUES ('Sintético 1'),('Sintético 2'),('Sintético 3'),('Sintético 4')");
  await pool.query("INSERT INTO empresas (nome) VALUES ('Clínica A')");
  await pool.query("CREATE TABLE lembretes_prescricao (cliente_id INT PRIMARY KEY, periodos JSONB)");
  await criarTabelasMedicacoes(pool);
}, 120_000);
afterAll(async () => { await pool?.end().catch(() => {}); bd.parar(); });

describe("migração do esquema antigo: histórico preservado, chave nova", () => {
  it("tabelas legadas (chave por nome) migram sem perder linha e passam a aceitar mesmo nome com ids diferentes", async () => {
    await pool.query(`CREATE TABLE cliente_medicacao_tomadas (id SERIAL PRIMARY KEY, client_id INT NOT NULL REFERENCES clients(id), origem TEXT NOT NULL, nome_chave TEXT NOT NULL,
      data DATE NOT NULL, periodo TEXT NOT NULL, status TEXT NOT NULL, criado_em TIMESTAMPTZ NOT NULL DEFAULT now(), atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now())`);
    await pool.query(`CREATE UNIQUE INDEX ux_cliente_medicacao_tomadas ON cliente_medicacao_tomadas (client_id, origem, nome_chave, data, periodo)`);
    await pool.query(`CREATE TABLE cliente_medicacao_agenda_dia (client_id INT NOT NULL REFERENCES clients(id), data DATE NOT NULL, origem TEXT NOT NULL, nome_chave TEXT NOT NULL,
      periodo TEXT NOT NULL, medicacao_id INT, registrado_em TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY (client_id, data, origem, nome_chave, periodo))`);
    const idUnico = await nova(1, "Losartana");
    await pool.query(`INSERT INTO cliente_medicacao_agenda_dia (client_id,data,origem,nome_chave,periodo,medicacao_id) VALUES (1,'2026-11-20','propria','losartana','IM',NULL),(1,'2026-11-20','prescrita','dipirona','IM',NULL)`);
    await pool.query(`INSERT INTO cliente_medicacao_tomadas (client_id,origem,nome_chave,data,periodo,status) VALUES (1,'propria','losartana','2026-11-20','IM','tomei')`);
    await criarTabelaTomadas(pool);
    await criarTabelaTomadas(pool); // idempotente
    expect((await pool.query("SELECT count(*)::int n FROM cliente_medicacao_agenda_dia")).rows[0].n).toBe(2);
    expect((await pool.query("SELECT count(*)::int n FROM cliente_medicacao_tomadas")).rows[0].n).toBe(1);
    // nome com UM só cadastro: o id é recuperado; prescrita segue sem id
    expect(Number((await pool.query("SELECT medicacao_id FROM cliente_medicacao_tomadas")).rows[0].medicacao_id)).toBe(idUnico);
    expect((await pool.query("SELECT medicacao_id FROM cliente_medicacao_agenda_dia WHERE origem='prescrita'")).rows[0].medicacao_id).toBeNull();
    // chave antiga não existe mais: mesmo nome, ids diferentes, mesmo dia/horário
    await pool.query(`INSERT INTO cliente_medicacao_agenda_dia (client_id,data,origem,nome_chave,periodo,medicacao_id) VALUES (1,'2026-11-20','propria','losartana','IM',9991),(1,'2026-11-20','propria','losartana','IM',9992)`);
    // e o mesmo id no mesmo horário continua único
    await expect(pool.query(`INSERT INTO cliente_medicacao_agenda_dia (client_id,data,origem,nome_chave,periodo,medicacao_id) VALUES (1,'2026-11-20','propria','losartana','IM',9991)`)).rejects.toThrow();
  });
});

describe("dois remédios de mesmo nome (retirado e recadastrado) não colapsam", () => {
  it("o tomei vale só para o cadastro vigente e o antigo fica visível como retirado", async () => {
    const velho = await nova(2, "Vitamina D");
    await sincronizarAgendaDoDia(pool, 2, HOJE);
    await pool.query(`UPDATE cliente_medicacoes SET removido_em=now() WHERE id=$1`, [velho]);
    const novo = await nova(2, "Vitamina D");
    expect(novo).not.toBe(velho);
    await registrarTomada(pool, { clientId: 2, hoje: HOJE, origem: "propria", nome: "Vitamina D", sigla: "IM", status: "tomei" });
    const ag = (await pool.query(`SELECT medicacao_id, situacao FROM cliente_medicacao_agenda_dia WHERE client_id=2 AND data=$1 ORDER BY medicacao_id`, [HOJE])).rows;
    expect(ag.map((x) => [Number(x.medicacao_id), x.situacao])).toEqual([[velho, "retirado"], [novo, "ativo"]]);
    const t = (await pool.query(`SELECT medicacao_id FROM cliente_medicacao_tomadas WHERE client_id=2`)).rows;
    expect(t.map((x) => Number(x.medicacao_id))).toEqual([novo]);
    const hoje = await horariosDoDia(pool, 2, HOJE);
    expect(hoje).toHaveLength(1);
    expect(hoje[0].referenciaId).toBe(novo);
    expect(hoje[0].status).toBe("tomei");
    const a = await calcularAdesao(pool, 2, HOJE);
    const dia = a.propria.historico.find((d) => d.data === HOJE)!;
    expect(dia.esperado).toBe(1); expect(dia.tomei).toBe(1); expect(dia.retirado).toBe(1);
  });
  it("referenciaId de outro remédio não registra tomada alheia", async () => {
    await expect(registrarTomada(pool, { clientId: 2, hoje: HOJE, origem: "propria", nome: "Vitamina D", sigla: "IM", status: "esqueci", referenciaId: 424242 }))
      .rejects.toMatchObject({ codigo: "horario_nao_encontrado" });
  });
});

describe("job diário (00:05 BRT): só o conhecido; resto desconhecido; nada inventado", () => {
  it("remédio intocado vira ativo; alterado depois e fórmula da clínica viram desconhecido; sem tomada inventada; idempotente", async () => {
    const intocada = await nova(3, "Magnésio");
    const alterada = await nova(3, "Cálcio");
    await pool.query(`INSERT INTO lembretes_prescricao (cliente_id, periodos) VALUES (3, $1)`, [JSON.stringify([{ sigla: "IM", nome: "Manhã", tipo: "tomar", formulas: [{ nome: "Fórmula Clínica", dose: "1 cp" }] }])]);
    // criadas em 01/11; a "Cálcio" foi alterada em 25/11 (qualquer alteração posterior torna o dia desconhecido)
    await pool.query(`UPDATE cliente_medicacoes SET criado_em='2026-11-01T12:00:00Z', atualizado_em='2026-11-02T12:00:00Z' WHERE id=$1`, [intocada]);
    await pool.query(`UPDATE cliente_medicacoes SET criado_em='2026-11-01T12:00:00Z', atualizado_em='2026-11-25T18:00:00Z' WHERE id=$1`, [alterada]);
    await sincronizarAgendaDoDia(pool, 3, "2026-11-23"); // primeiro uso: 23/11
    await nova(4, "Zinco"); // nunca abriu o app: não ganha histórico
    const r1 = await materializarDiasSemAbertura(pool, HOJE);
    expect(r1.falhas).toBe(0);
    const linhas = (await pool.query(`SELECT to_char(data,'YYYY-MM-DD') d, nome_chave n, situacao s, registro_origem o FROM cliente_medicacao_agenda_dia WHERE client_id=3 AND registro_origem='job_diario' ORDER BY d, n`)).rows;
    expect([...new Set(linhas.map((x) => x.d))]).toEqual(["2026-11-24", "2026-11-25"]); // nunca antes/no primeiro dia
    const sit = (d: string, n: string) => linhas.find((x) => x.d === d && x.n === n)?.s;
    expect(sit("2026-11-24", "magnesio")).toBe("ativo");
    expect(sit("2026-11-24", "calcio")).toBe("desconhecido"); // alterada depois: sem versões, a rotina de 24/11 não é confiável
    expect(sit("2026-11-25", "calcio")).toBe("desconhecido");
    expect(sit("2026-11-25", "magnesio")).toBe("ativo");
    expect(sit("2026-11-24", "formula clinica")).toBe("desconhecido");
    expect((await pool.query(`SELECT count(*)::int n FROM cliente_medicacao_agenda_dia WHERE client_id=4`)).rows[0].n).toBe(0);
    expect((await materializarDiasSemAbertura(pool, HOJE)).linhas).toBe(0); // execução dupla
    expect((await pool.query(`SELECT count(*)::int n FROM cliente_medicacao_tomadas WHERE client_id=3`)).rows[0].n).toBe(0);
    const j7 = (await calcularAdesao(pool, 3, HOJE)).propria.janelas[0];
    expect(j7.tomei).toBe(0); expect(j7.esqueci).toBe(0);
    expect(j7.semRegistro).toBe(j7.esperado); // desconhecido fora do denominador; nunca "tomei"
  });
  it("conta excluída é pulada; falha de um cliente não derruba os outros", async () => {
    await pool.query(`CREATE TABLE area_paciente_contas_excluidas (client_id INT PRIMARY KEY, excluida_em TIMESTAMPTZ DEFAULT now(), aviso_versao TEXT)`);
    await sincronizarAgendaDoDia(pool, 4, "2026-11-20");
    await pool.query(`INSERT INTO area_paciente_contas_excluidas (client_id, aviso_versao) VALUES (4,'t')`);
    await materializarDiasSemAbertura(pool, HOJE);
    expect((await pool.query(`SELECT count(*)::int n FROM cliente_medicacao_agenda_dia WHERE client_id=4 AND registro_origem='job_diario'`)).rows[0].n).toBe(0);
    const falho = { query: async (q: string, v?: unknown[]) => { if (/FROM cliente_medicacoes WHERE client_id/.test(q) && v?.[0] === 3) throw new Error("falha simulada"); return pool.query(q, v as unknown[]); } };
    const r = await materializarDiasSemAbertura(falho as never, "2026-11-30");
    expect(r.falhas).toBeGreaterThanOrEqual(1);
  });
});
