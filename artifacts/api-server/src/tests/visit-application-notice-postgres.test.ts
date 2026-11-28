import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { drizzle } from "drizzle-orm/node-postgres";
import { startIsolatedPostgres } from "./helpers/postgres-isolado";

const state = vi.hoisted(() => ({ database: null as any }));
const hermes = vi.hoisted(() => {
  const calls: any[] = [];
  return {
    calls,
    send: vi.fn(async (_doc: any, _destination: any, canal: string[], context: any) => {
      calls.push({ canal: canal[0], context });
      return { resultados: [{ canal: canal[0], sent: true, via: canal[0] === "WHATSAPP" ? "twilio" : "gmail" }] };
    }),
  };
});
vi.mock("@workspace/db", () => ({
  db: new Proxy({}, {
    get(_target, key) {
      const value = state.database?.[key];
      return typeof value === "function" ? value.bind(state.database) : value;
    },
  }),
}));
vi.mock("../lib/messaging/engine", () => ({ enviarMensagemPaxter: hermes.send }));

import { flushApplicationNotices, getApplicationNoticeSummary, queueApplicationNotice } from "../lib/visit-application-notice";
import type { ChannelSenders } from "../lib/visit-confirmation";
import { realChannels, realNoticeChannels } from "../lib/visit-confirmation-channels";

let isolated: Awaited<ReturnType<typeof startIsolatedPostgres>>;
const sent: Array<{ channel: string; destination: string; doc: any }> = [];
let acceptAll = true;

function channels(): ChannelSenders {
  return {
    async sendEmail(to, doc) {
      sent.push({ channel: "email", destination: to, doc });
      return { success: acceptAll };
    },
    async sendWhatsapp(to, doc) {
      sent.push({ channel: "whatsapp", destination: to, doc });
      return { sent: acceptAll, via: acceptAll ? "twilio" : "link" };
    },
    async sendTelegram(to, doc) {
      sent.push({ channel: "telegram", destination: to, doc });
      return { sent: acceptAll, mock: false };
    },
  };
}

beforeAll(async () => {
  isolated = await startIsolatedPostgres();
  state.database = drizzle(isolated.pool);
  await isolated.pool.query(`
    CREATE TABLE clients (
      id integer PRIMARY KEY, empresa_id integer NOT NULL, status text NOT NULL, name text,
      email text, phone text, telegram_chat_id text
    );
    CREATE TABLE protocols (id integer PRIMARY KEY, empresa_id integer, client_id integer);
    CREATE TABLE sessions (
      id integer PRIMARY KEY, empresa_id integer, client_id integer, protocol_id integer,
      status text NOT NULL, agenda_archived boolean NOT NULL DEFAULT false,
      scheduled_date text NOT NULL, scheduled_time text NOT NULL
    );
    CREATE TABLE substances (id integer PRIMARY KEY, name text, color text);
    CREATE TABLE substance_applications (
      id integer PRIMARY KEY, session_id integer, substance_id integer, dose text,
      session_number integer, total_sessions integer, status text, availability text
    );
    CREATE TABLE visit_application_notices (
      id serial PRIMARY KEY, session_id integer NOT NULL, empresa_id integer NOT NULL, client_id integer NOT NULL,
      state text NOT NULL DEFAULT 'reservado', applied_count integer NOT NULL, due_count integer NOT NULL,
      channels jsonb NOT NULL DEFAULT '[]'::jsonb, reserved_at timestamptz NOT NULL DEFAULT now(),
      finished_at timestamptz
    );
    CREATE UNIQUE INDEX visit_application_notices_session_uk ON visit_application_notices(session_id);
    INSERT INTO clients VALUES
      (1,5,'active','Cliente Sintético','cliente@example.test','+5511999990000','telegram-sintetico'),
      (2,6,'active','Cliente de Outra Empresa','outro@example.test',NULL,NULL),
      (3,5,'inactive','Cliente Inativo','inativo@example.test',NULL,NULL);
    INSERT INTO protocols VALUES (1,5,1),(2,6,2),(3,5,2),(4,5,3);
    INSERT INTO sessions VALUES
      (101,5,1,1,'completed',false,'2030-01-10','14:30'),
      (102,5,1,1,'completed',false,'2030-01-11','14:30'),
      (103,5,1,1,'completed',false,'2030-01-12','14:30'),
      (104,6,2,2,'completed',false,'2030-01-13','14:30'),
      (105,5,2,3,'completed',false,'2030-01-14','14:30'),
      (106,5,3,4,'completed',false,'2030-01-15','14:30');
    INSERT INTO substances VALUES (1,'Substância <sintética>','#225588'),(2,'Segunda substância','#885522');
    INSERT INTO substance_applications VALUES
      (1,101,1,'80 mg / 2 ml',1,3,'applied','disp'),
      (2,101,2,'100 mcg',2,3,'missed','disp'),
      (3,101,1,'80 mg',3,3,'applied','prox'),
      (4,102,1,'80 mg',1,1,'applied','disp'),
      (5,103,1,'80 mg',1,1,'missed','disp'),
      (6,104,1,'80 mg',1,1,'applied','disp'),
      (7,105,1,'80 mg',1,1,'applied','disp'),
      (8,106,1,'80 mg',1,1,'applied','disp');
  `);
}, 60_000);

afterAll(async () => {
  state.database = null;
  await isolated?.stop();
}, 60_000);

beforeEach(async () => {
  sent.length = 0;
  hermes.calls.length = 0;
  hermes.send.mockClear();
  acceptAll = true;
  await isolated.pool.query("TRUNCATE visit_application_notices RESTART IDENTITY");
});

describe("K10 — aviso de aplicação ao cliente", () => {
  it("T-K10-1: envia pelos três canais, conta somente ocorrências devidas e limita nomes/doses ao e-mail", async () => {
    queueApplicationNotice(101, 5, channels());
    await flushApplicationNotices();

    const summary = await getApplicationNoticeSummary(101, 5);
    expect(summary).toMatchObject({ estado: "enviado", aplicadas: 1, previstas: 2 });
    expect(summary?.canais.map((item) => item.estado)).toEqual(["aceito", "aceito", "aceito"]);
    expect(sent.map((item) => item.channel)).toEqual(["email", "whatsapp", "telegram"]);
    const emailDoc = sent[0].doc;
    expect(emailDoc.titulo).toBe("Aplicação realizada com sucesso");
    expect(emailDoc.paragrafos).toContain("Aplicadas: 1 de 2.");
    expect(emailDoc.paragrafos).toContain("As demais não foram aplicadas nesta visita.");
    expect(emailDoc.blocosHtml.join(" ")).toContain("Substância &lt;sintética&gt;");
    expect(emailDoc.blocosHtml.join(" ")).toContain("Aplicado");
    expect(sent.slice(1).every(({ doc }) =>
      doc.paragrafos.join(" ").includes("Aplicadas: 1 de 2.") &&
      !JSON.stringify(doc).includes("Substância <sintética>") &&
      !JSON.stringify(doc).includes("80 mg"),
    )).toBe(true);
  });

  it("T-K10-2: envios concorrentes reservam a visita uma vez", async () => {
    queueApplicationNotice(102, 5, channels());
    queueApplicationNotice(102, 5, channels());
    await flushApplicationNotices();

    expect(sent).toHaveLength(3);
    const { rows } = await isolated.pool.query("SELECT count(*)::int AS n FROM visit_application_notices WHERE session_id=102");
    expect(rows[0].n).toBe(1);
  });

  it("T-K10-3: não avisa sem aplicação feita ou quando empresa/protocolo não correspondem", async () => {
    queueApplicationNotice(103, 5, channels());
    queueApplicationNotice(104, 5, channels());
    queueApplicationNotice(105, 5, channels());
    queueApplicationNotice(106, 5, channels());
    await flushApplicationNotices();

    expect(sent).toHaveLength(0);
    const { rows } = await isolated.pool.query("SELECT count(*)::int AS n FROM visit_application_notices");
    expect(rows[0].n).toBe(0);
  });

  it("T-K10-4: registra falha dos três canais e não repete automaticamente", async () => {
    acceptAll = false;
    queueApplicationNotice(102, 5, channels());
    await flushApplicationNotices();
    expect(await getApplicationNoticeSummary(102, 5)).toMatchObject({
      estado: "nao_enviado", aplicadas: 1, previstas: 1,
      canais: [{ estado: "falhou" }, { estado: "falhou" }, { estado: "falhou" }],
    });

    acceptAll = true;
    queueApplicationNotice(102, 5, channels());
    await flushApplicationNotices();
    expect(sent).toHaveLength(3);
  });

  it("T-K10-5: os canais K10 passam pelo motor Hermes e mantêm a omissão da chave exclusiva à K8", async () => {
    const doc = { titulo: "Aplicação realizada com sucesso", paragrafos: ["Aviso de teste"] };
    await realNoticeChannels.sendWhatsapp("+5511999990000", doc);
    await realChannels.sendWhatsapp("+5511999990000", { titulo: "123456", paragrafos: ["Chave"] });

    expect(hermes.send).toHaveBeenCalledTimes(2);
    expect(hermes.calls[0].canal).toBe("WHATSAPP");
    expect(hermes.calls[0].context).not.toHaveProperty("corpoParaLog");
    expect(hermes.calls[1].context.corpoParaLog).toContain("chave");
  });
});
