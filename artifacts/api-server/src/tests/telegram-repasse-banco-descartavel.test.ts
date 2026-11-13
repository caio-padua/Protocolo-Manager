/**
 * Outbox do repasse ao chat de alerta — SQL real em BANCO DESCARTÁVEL (socket Unix em /tmp;
 * nunca toca DATABASE_URL). Dados 100% sintéticos.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import {
  aplicarMigracaoOutbox, registrarRepasse, tentarRepasse, processarRepassesVencidos,
  marcarEnviandoAbandonadoComoIncerto, resumoRepasses, classificarResultado, MAX_TENTATIVAS,
  type DepsOutbox, type ResultadoEnvio,
} from "../lib/telegram-repasse-outbox";
import { aplicarMigracaoPendenciaVinculo, registrarPendenciaVinculo } from "../lib/telegram-vinculo-pendencia";
import { repassarMensagemAoCeo } from "../lib/telegram-relay-ceo";

const PG_BIN = process.env.PG_BIN_DIR ?? "/nix/store/bgwr5i8jf8jpg75rr53rz3fqv5k8yrwp-postgresql-16.10/bin";
let dir = "";
let proc: ChildProcess | null = null;
let pool: pg.Pool;
let db: ReturnType<typeof drizzle>;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "pgrepasse-"));
  const dados = join(dir, "dados");
  execFileSync(join(PG_BIN, "initdb"), ["-D", dados, "-A", "trust", "-U", "teste"], { stdio: "ignore" });
  proc = spawn(join(PG_BIN, "postgres"), ["-D", dados, "-c", "listen_addresses=", "-k", dir, "-c", "max_connections=60"], { stdio: "ignore" });
  for (let i = 0; i < 60; i++) {
    if (existsSync(join(dir, ".s.PGSQL.5432"))) break;
    await new Promise((r) => setTimeout(r, 250));
  }
  pool = new pg.Pool({ host: dir, user: "teste", database: "postgres", max: 30 });
  for (let i = 0; i < 80; i++) {
    try { await pool.query("SELECT 1"); break; } catch { await new Promise((r) => setTimeout(r, 250)); }
  }
  await pool.query(`
    CREATE TABLE clients (id SERIAL PRIMARY KEY, name TEXT, cpf TEXT,
      empresa_id INTEGER NOT NULL DEFAULT 5, telegram_chat_id TEXT DEFAULT '111');
    CREATE TABLE telegram_inbox_messages (
      id SERIAL PRIMARY KEY, empresa_id INTEGER NOT NULL DEFAULT 5,
      cliente_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      chat_id TEXT NOT NULL, texto TEXT NOT NULL, recebida_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      lida_em TIMESTAMPTZ, direcao TEXT NOT NULL DEFAULT 'entrada', update_id BIGINT);
    INSERT INTO clients (name, cpf) VALUES ('Paciente Sintetico', '12345678900');
  `);
  db = drizzle(pool);
  await aplicarMigracaoOutbox(db);
}, 60000);

afterAll(async () => {
  await pool?.end().catch(() => {});
  if (proc) { proc.kill("SIGINT"); await new Promise((r) => setTimeout(r, 800)); }
  if (dir && dir.startsWith(join(tmpdir(), "pgrepasse-"))) rmSync(dir, { recursive: true, force: true });
});

let seq = 0;
async function novaMensagem(texto = "mensagem sintetica"): Promise<number> {
  const r = await pool.query("INSERT INTO telegram_inbox_messages (cliente_id, chat_id, texto, update_id) VALUES (1,'111',$1,$2) RETURNING id", [texto, ++seq]);
  return r.rows[0].id;
}
const estadoDe = async (id: number) => (await pool.query("SELECT estado, tentativas, ultimo_erro FROM telegram_repasse_ceo WHERE id=$1", [id])).rows[0];
const vencer = (id: number) => pool.query("UPDATE telegram_repasse_ceo SET proxima_tentativa_em = NOW() - interval '1 second' WHERE id=$1", [id]);
const enviarCom = (r: ResultadoEnvio | Error, chamadas: string[] = []): DepsOutbox => ({
  enviar: async (l) => { chamadas.push(l.texto); if (r instanceof Error) throw r; return r; },
});

describe("outbox do repasse", () => {
  it("O1 migração idempotente e registro idempotente (mesmo par = mesma linha)", async () => {
    await aplicarMigracaoOutbox(db);
    const m = await novaMensagem();
    const a = await registrarRepasse(db, m, "CEO");
    const b = await registrarRepasse(db, m, "CEO");
    expect(b).toBe(a);
    expect((await estadoDe(a)).estado).toBe("pendente");
  });

  it("O2 aceito pelo Telegram: estado aceito_telegram, 1 tentativa, texto vem da mensagem SALVA", async () => {
    const m = await novaMensagem("texto salvo no banco");
    const id = await registrarRepasse(db, m, "CEO");
    const ch: string[] = [];
    const r = await tentarRepasse(db, id, enviarCom({ kind: "entregue" }, ch));
    expect(r).toEqual({ kind: "tratado", estado: "aceito_telegram" });
    expect(ch).toEqual(["texto salvo no banco"]);
    expect((await estadoDe(id)).tentativas).toBe(1);
  });

  it("privacidade no fluxo SQL → montador: não carrega CPF e oculta identificadores no alerta", async () => {
    const texto = "Teste não clínico 12345678900 / 123.456.789-00 / exemplo@teste.invalid";
    const m = await novaMensagem(texto);
    const id = await registrarRepasse(db, m, "CEO");
    const enviar = vi.fn().mockResolvedValue({ sent: true, mock: false });
    await tentarRepasse(db, id, { enviar: async linha => {
      expect(linha.cpf).toBeNull();
      expect(linha.nome).toBe("");
      return repassarMensagemAoCeo({
        chatIdCeo: linha.chat_id_destino, chatIdRemetente: linha.chat_id_remetente,
        clienteId: linha.cliente_id, nome: linha.nome, cpfDisplay: "",
        texto: linha.texto,
      }, { enviar, log: { info: vi.fn(), warn: vi.fn() } });
    } });
    expect((await estadoDe(id)).estado).toBe("aceito_telegram");
    const alerta = enviar.mock.calls[0][1] as string;
    expect(alerta).not.toContain("12345678900");
    expect(alerta).not.toContain("123.456.789-00");
    expect(alerta).not.toContain("exemplo@teste.invalid");
    expect((await pool.query("SELECT texto FROM telegram_inbox_messages WHERE id=$1", [m])).rows[0].texto).toBe(texto);
  });

  it("O3 aceito não é reenviado nunca mais (nem pelo worker)", async () => {
    const m = await novaMensagem("texto-do-o3");
    const id = await registrarRepasse(db, m, "CEO");
    await tentarRepasse(db, id, enviarCom({ kind: "entregue" }));
    const ch: string[] = [];
    expect(await tentarRepasse(db, id, enviarCom({ kind: "entregue" }, ch))).toEqual({ kind: "nao_reivindicado" });
    await pool.query("UPDATE telegram_repasse_ceo SET proxima_tentativa_em = NOW() - interval '1 hour' WHERE id=$1", [id]);
    await processarRepassesVencidos(db, enviarCom({ kind: "entregue" }, ch));
    expect(ch).not.toContain("texto-do-o3"); // (o worker pode enviar OUTRAS linhas pendentes de testes anteriores)
  });

  it("O4 recusa temporária (HTTP 500) = falhou com espera; só reenvia quando vence; depois aceita", async () => {
    const m = await novaMensagem();
    const id = await registrarRepasse(db, m, "CEO");
    expect(await tentarRepasse(db, id, enviarCom({ kind: "falhou", erro: "telegram_http_500: x" }))).toEqual({ kind: "tratado", estado: "falhou" });
    const ch: string[] = [];
    // ainda não venceu: nada é reenviado
    expect(await tentarRepasse(db, id, enviarCom({ kind: "entregue" }, ch))).toEqual({ kind: "nao_reivindicado" });
    await vencer(id);
    expect(await tentarRepasse(db, id, enviarCom({ kind: "entregue" }, ch))).toEqual({ kind: "tratado", estado: "aceito_telegram" });
    expect((await estadoDe(id)).tentativas).toBe(2);
    expect(ch).toHaveLength(1);
  });

  it("O5 recusa permanente (HTTP 400/403) = esgotado, sem nova tentativa; erro registrado sem texto", async () => {
    const m = await novaMensagem("conteudo clinico sigiloso");
    const id = await registrarRepasse(db, m, "CEO");
    await tentarRepasse(db, id, enviarCom({ kind: "falhou", erro: "telegram_http_403: bot was blocked conteudo clinico sigiloso" }));
    const e = await estadoDe(id);
    expect(e.estado).toBe("esgotado");
    expect(e.ultimo_erro).toBe("telegram_http_403");
  });

  it("O6 rede caiu / exceção = incerto; NUNCA reenvia sozinho", async () => {
    const m = await novaMensagem("texto-do-o6");
    const id = await registrarRepasse(db, m, "CEO");
    expect(await tentarRepasse(db, id, enviarCom(new Error("socket hang up")))).toEqual({ kind: "tratado", estado: "incerto" });
    await vencer(id);
    const ch: string[] = [];
    await processarRepassesVencidos(db, enviarCom({ kind: "entregue" }, ch));
    expect(ch).not.toContain("texto-do-o6");
    expect((await estadoDe(id)).estado).toBe("incerto");
  });

  it("O7 sem token (simulado) NÃO conta como entregue: falhou com erro simulado_sem_token", async () => {
    const m = await novaMensagem();
    const id = await registrarRepasse(db, m, "CEO");
    await tentarRepasse(db, id, enviarCom({ kind: "simulado" }));
    const e = await estadoDe(id);
    expect(e.estado).toBe("falhou");
    expect(e.ultimo_erro).toBe("simulado_sem_token");
  });

  it("O8 processo caiu no meio do envio: 'enviando' antigo vira incerto; recente permanece", async () => {
    const m1 = await novaMensagem(); const m2 = await novaMensagem();
    const velho = await registrarRepasse(db, m1, "CEO");
    const novo = await registrarRepasse(db, m2, "CEO");
    await pool.query("UPDATE telegram_repasse_ceo SET estado='enviando', atualizado_em = NOW() - interval '10 minutes' WHERE id=$1", [velho]);
    await pool.query("UPDATE telegram_repasse_ceo SET estado='enviando', atualizado_em = NOW() WHERE id=$1", [novo]);
    expect(await marcarEnviandoAbandonadoComoIncerto(db)).toBe(1);
    expect((await estadoDe(velho)).estado).toBe("incerto");
    expect((await estadoDe(novo)).estado).toBe("enviando");
    await pool.query("UPDATE telegram_repasse_ceo SET estado='aceito_telegram' WHERE id=$1", [novo]);
  });

  it("O9 concorrência: 20 tentativas simultâneas da mesma linha = 1 envio", async () => {
    const m = await novaMensagem();
    const id = await registrarRepasse(db, m, "CEO");
    const ch: string[] = [];
    const lento: DepsOutbox = { enviar: async (l) => { ch.push(l.texto); await new Promise((r) => setTimeout(r, 50)); return { kind: "entregue" }; } };
    const rs = await Promise.all(Array.from({ length: 20 }, () => tentarRepasse(db, id, lento)));
    expect(rs.filter((x) => x.kind === "tratado")).toHaveLength(1);
    expect(ch).toHaveLength(1);
  });

  it("O10 limite de tentativas: temporária repetida vira esgotado na 6ª", async () => {
    const m = await novaMensagem();
    const id = await registrarRepasse(db, m, "CEO");
    let ultimo = "";
    for (let i = 0; i < MAX_TENTATIVAS; i++) {
      await vencer(id);
      const r = await tentarRepasse(db, id, enviarCom({ kind: "falhou", erro: "telegram_http_429" }));
      ultimo = r.kind === "tratado" ? r.estado : "x";
    }
    expect(ultimo).toBe("esgotado");
    expect((await estadoDe(id)).tentativas).toBe(MAX_TENTATIVAS);
  });

  it("O11 worker retoma pendentes após 'reinício' e o resumo conta por estado", async () => {
    const m = await novaMensagem();
    const id = await registrarRepasse(db, m, "CEO_OUTRO");
    const ch: string[] = [];
    const r = await processarRepassesVencidos(db, enviarCom({ kind: "entregue" }, ch));
    expect(r.aceitos).toBeGreaterThanOrEqual(1);
    expect((await estadoDe(id)).estado).toBe("aceito_telegram");
    const res = await resumoRepasses(db);
    expect(res["aceito_telegram"]).toBeGreaterThanOrEqual(1);
    expect(res["incerto"]).toBeGreaterThanOrEqual(1);
  });

  it("O13 falha temporária persiste e processo novo retoma após reinício com transporte simulado", async () => {
    const m = await novaMensagem("mensagem sintetica para retry apos reinicio");
    const id = await registrarRepasse(db, m, "CEO");
    const primeira = await tentarRepasse(
      db,
      id,
      enviarCom({ kind: "falhou", erro: "telegram_http_503: falha sintetica" }),
    );
    expect(primeira).toEqual({ kind: "tratado", estado: "falhou" });
    expect((await estadoDe(id)).tentativas).toBe(1);

    await vencer(id);
    await pool.query(
      "UPDATE telegram_repasse_ceo SET proxima_tentativa_em = NOW() + interval '1 hour' WHERE id <> $1 AND estado IN ('pendente','falhou')",
      [id],
    );
    const childScript = [
      'import pg from "pg";',
      'import { drizzle } from "drizzle-orm/node-postgres";',
      'import { processarRepassesVencidos } from "./src/lib/telegram-repasse-outbox.ts";',
      'const pool = new pg.Pool({ host: process.env.TEST_PG_HOST, user: "teste", database: "postgres", max: 4 });',
      'const db = drizzle(pool);',
      'const retomada = await processarRepassesVencidos(db, { enviar: async () => ({ kind: "entregue" }) });',
      'const row = await pool.query("SELECT estado, tentativas FROM telegram_repasse_ceo WHERE id = $1", [Number(process.env.TEST_REPASSE_ID)]);',
      'console.log(JSON.stringify({ retomada, estado: row.rows[0]?.estado, tentativas: Number(row.rows[0]?.tentativas) }));',
      'await pool.end();',
    ].join("\n");
    const output = execFileSync(
      process.execPath,
      ["--import", "tsx", "--input-type=module", "-e", childScript],
      {
        cwd: process.cwd(),
        env: {
          PATH: process.env.PATH ?? "",
          HOME: process.env.HOME ?? "",
          TEST_PG_HOST: dir,
          TEST_REPASSE_ID: String(id),
        },
        encoding: "utf8",
      },
    );
    const retomada = JSON.parse(output.trim());
    expect(retomada.retomada.examinados).toBe(1);
    expect(retomada.retomada.aceitos).toBe(1);
    expect(retomada.estado).toBe("aceito_telegram");
    expect(retomada.tentativas).toBe(2);
    expect((await estadoDe(id)).estado).toBe("aceito_telegram");
  });

  it("O12 apagar a mensagem de origem não deixa repasse órfão (cascata) e não quebra o worker", async () => {
    const m = await novaMensagem();
    const id = await registrarRepasse(db, m, "CEO_X");
    await pool.query("DELETE FROM telegram_inbox_messages WHERE id=$1", [m]);
    expect((await pool.query("SELECT 1 FROM telegram_repasse_ceo WHERE id=$1", [id])).rowCount).toBe(0);
  });

  it.each([
    "empresa_cliente", "empresa_mensagem", "chat_removido", "chat_trocado",
    "chat_duplicado", "mensagem_saida",
  ])("revalida vínculo antes de retomar: %s bloqueia sem envio", async (caso) => {
    const chat = `vinculo-sintetico-${++seq}`;
    const c = (await pool.query(
      "INSERT INTO clients (name, cpf, empresa_id, telegram_chat_id) VALUES ('Sintetico', NULL, 5, $1) RETURNING id", [chat],
    )).rows[0].id;
    const m = (await pool.query(
      "INSERT INTO telegram_inbox_messages (empresa_id, cliente_id, chat_id, texto) VALUES (5,$1,$2,'teste sintetico') RETURNING id",
      [c, chat],
    )).rows[0].id;
    const id = await registrarRepasse(db, m, "CEO");
    if (caso === "empresa_cliente") await pool.query("UPDATE clients SET empresa_id=7 WHERE id=$1", [c]);
    if (caso === "empresa_mensagem") await pool.query("UPDATE telegram_inbox_messages SET empresa_id=7 WHERE id=$1", [m]);
    if (caso === "chat_removido") await pool.query("UPDATE clients SET telegram_chat_id=NULL WHERE id=$1", [c]);
    if (caso === "chat_trocado") await pool.query("UPDATE clients SET telegram_chat_id='outro' WHERE id=$1", [c]);
    if (caso === "chat_duplicado") await pool.query(
      "INSERT INTO clients (name, empresa_id, telegram_chat_id) VALUES ('Outro sintetico',7,$1)", [chat],
    );
    if (caso === "mensagem_saida") await pool.query("UPDATE telegram_inbox_messages SET direcao='saida' WHERE id=$1", [m]);
    const enviar = vi.fn().mockResolvedValue({ kind: "entregue" });
    expect(await tentarRepasse(db, id, { enviar })).toEqual({ kind: "tratado", estado: "esgotado" });
    expect(enviar).not.toHaveBeenCalled();
    expect(await estadoDe(id)).toMatchObject({ tentativas: 1, ultimo_erro: "vinculo_origem_alterado" });
    await vencer(id);
    expect(await tentarRepasse(db, id, { enviar })).toEqual({ kind: "nao_reivindicado" });
    expect(enviar).not.toHaveBeenCalled();
  });

  it("falha do banco na revalidação não envia; recuperação preserva estado incerto", async () => {
    const m = await novaMensagem("teste sintetico falha de leitura");
    const id = await registrarRepasse(db, m, "CEO");
    const enviar = vi.fn().mockResolvedValue({ kind: "entregue" });
    const indisponivel = {
      execute: async (query: SQL) => {
        const texto = new PgDialect().sqlToQuery(query).sql;
        if (texto.includes("WHERE telegram_chat_id =")) throw new Error("falha sintetica");
        return db.execute(query);
      },
    };
    await expect(tentarRepasse(indisponivel, id, { enviar })).rejects.toThrow("falha sintetica");
    expect(enviar).not.toHaveBeenCalled();
    expect((await estadoDe(id)).estado).toBe("enviando");
    await pool.query("UPDATE telegram_repasse_ceo SET atualizado_em=NOW()-interval '10 minutes' WHERE id=$1", [id]);
    await marcarEnviandoAbandonadoComoIncerto(db);
    expect((await estadoDe(id)).estado).toBe("incerto");
    expect(await tentarRepasse(db, id, { enviar })).toEqual({ kind: "nao_reivindicado" });
    expect(enviar).not.toHaveBeenCalled();
  });
});

describe("classificarResultado (tabela)", () => {
  it("regras documentadas", () => {
    expect(classificarResultado({ kind: "falhou", erro: "telegram_http_429" }, 1).estado).toBe("falhou");
    expect(classificarResultado({ kind: "falhou", erro: "telegram_http_502" }, 1).estado).toBe("falhou");
    expect(classificarResultado({ kind: "falhou", erro: "telegram_http_400" }, 1).estado).toBe("esgotado");
    expect(classificarResultado({ kind: "falhou", erro: "ECONNRESET" }, 1).estado).toBe("incerto");
    expect(classificarResultado({ kind: "falhou", erro: "sem_resultado" }, 1).estado).toBe("incerto");
    expect(classificarResultado({ kind: "omitido_remetente_e_ceo" }, 1).estado).toBe("aceito_telegram");
  });
});

describe("pendência de vínculo ambíguo (banco real)", () => {
  it("P1 migração idempotente; registra uma vez por (chat, update); candidatos ordenados e sem repetição", async () => {
    await aplicarMigracaoPendenciaVinculo(db);
    await aplicarMigracaoPendenciaVinculo(db);
    expect(await registrarPendenciaVinculo(db, { chatId: "555", updateId: 10, candidatos: [8, 7, 8], texto: "oi" })).toBe(true);
    expect(await registrarPendenciaVinculo(db, { chatId: "555", updateId: 10, candidatos: [7, 8], texto: "oi" })).toBe(false);
    expect(await registrarPendenciaVinculo(db, { chatId: "555", updateId: 11, candidatos: [7, 8], texto: "de novo" })).toBe(true);
    const r = await pool.query("SELECT candidatos, texto, resolvido_em FROM telegram_vinculo_pendencias WHERE update_id=10");
    expect(r.rows).toEqual([{ candidatos: [7, 8], texto: "oi", resolvido_em: null }]);
    const n = await pool.query("SELECT count(*)::int n FROM telegram_vinculo_pendencias");
    expect(n.rows[0].n).toBe(2);
  });
  it("P2 concorrência: 15 entregas simultâneas do mesmo update = 1 pendência", async () => {
    const rs = await Promise.all(Array.from({ length: 15 }, () => registrarPendenciaVinculo(db, { chatId: "556", updateId: 20, candidatos: [1, 2], texto: "x" })));
    expect(rs.filter(Boolean)).toHaveLength(1);
  });
});
