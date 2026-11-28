import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { drizzle } from "drizzle-orm/node-postgres";
import { getTableConfig } from "drizzle-orm/pg-core";
import { createHash } from "node:crypto";
import { PDFDocument,PDFRawStream,PDFName } from "pdf-lib";
import { startIsolatedPostgres } from "./helpers/postgres-isolado";
import { comoJpeg, comoPng, rabisco } from "./helpers/rubrica-sintetica";

// Rubrica do cliente em imagem — armazenamento, carregador do RAS FAP e rotas, contra um Postgres descartável
// e com a cadeia real de autenticação (token, tenantContext, requireCollaborator). Dados 100% sintéticos
// (Código Paxter, Art. 82); o armazenamento privado é trocado por um mapa em memória.
const state = vi.hoisted(() => ({
  database: null as any,
  arquivos: new Map<string, Buffer>(),
  leituras: 0,
  armazenamentoCaido: false,
}));
vi.mock("@workspace/db", async () => {
  const schema = await import("@workspace/db/schema");
  const db = new Proxy({}, {
    get(_target, key) {
      // O módulo legado da rota executa migrações ao ser importado: nunca aplicar a banco configurado da aplicação.
      if (!state.database && key === "execute") return async () => ({ rows: [] });
      const value = state.database?.[key];
      return typeof value === "function" ? value.bind(state.database) : value;
    },
  });
  return { ...schema, db };
});
vi.mock("../lib/objectStorage", () => ({
  ObjectStorageService: class {
    async savePrivateObject(caminho: string, buffer: Buffer): Promise<string> {
      if (state.armazenamentoCaido) throw new Error("armazenamento indisponível");
      state.arquivos.set(caminho, buffer);
      return caminho;
    }
    async readPrivateObject(caminho: string): Promise<Buffer> {
      state.leituras++;
      const arquivo = state.arquivos.get(caminho);
      if (state.armazenamentoCaido || !arquivo) throw new Error("objeto não encontrado");
      return arquivo;
    }
  },
}));
vi.mock("../lib/whatsapp", () => ({ sendWhatsapp: vi.fn(), isWhatsappConfigured: vi.fn() }));
vi.mock("../lib/email-service", () => ({ sendTelegramOnboardingEmail: vi.fn() }));
vi.mock("../lib/telegram-magic-link", () => ({ emitirLinkMagico: vi.fn() }));
vi.mock("../routes/agentes-integracoes", () => ({ logIntegracao: vi.fn() }));

import {
  clientsTable, empresasTable, locationProfessionalsTable, locationsTable, professionalEmpresasTable, professionalsTable,
} from "@workspace/db/schema";
import { createCollaboratorToken } from "../lib/collaborator-auth";
import { tenantContextMiddleware } from "../middleware/tenantContext";
import clientRubricaRouter from "../routes/client-rubrica";
import { ensureClientRubricas, lerRubricaAtiva, lerRubricaHistorica, salvarRubricaCliente } from "../lib/client-rubrica";
import { prepararRubrica } from "../lib/client-rubrica-imagem";
import { loadProtocolRasRegistros } from "../lib/ras-fap-registros";
import { gerarRasFapPdf } from "../lib/ras-fap";

let isolated: Awaited<ReturnType<typeof startIsolatedPostgres>>;
const q = (text: string, values?: unknown[]) => isolated.pool.query(text, values);

const app = express();
app.use(express.json(), tenantContextMiddleware, clientRubricaRouter);
const tokenEmpresa5 = createCollaboratorToken({ professionalId: 101, role: "admin", credentialVersion: 0 });
const tokenEmpresa6 = createCollaboratorToken({ professionalId: 102, role: "admin", credentialVersion: 0 });
const tokenVersaoVelha = createCollaboratorToken({ professionalId: 103, role: "admin", credentialVersion: 0 });
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

function createTableSql(table: any) {
  const definition = getTableConfig(table);
  const columns = definition.columns.map((column) => {
    if (column.name === "id") return `"id" SERIAL PRIMARY KEY`;
    const defaultNow = ["created_at", "updated_at"].includes(column.name) ? " DEFAULT now()" : "";
    return `"${column.name}" ${column.getSQLType()}${defaultNow}`;
  });
  return `CREATE TABLE "${definition.name}" (${columns.join(", ")});`;
}

/** Rubrica sintética já preparada (PNG só de tinta); `grossura` muda o traço e portanto o hash. */
const rubrica = (grossura = 3) => prepararRubrica(comoPng(rabisco(580, 170, { grossura, margem: 0.05 })));
const SUBS = [501, 502];

beforeAll(async () => {
  isolated = await startIsolatedPostgres();
  state.database = drizzle(isolated.pool);
  for (const table of [clientsTable, professionalsTable, empresasTable, locationsTable, locationProfessionalsTable, professionalEmpresasTable]) {
    await q(createTableSql(table));
  }
  await q(`
    INSERT INTO empresas (id, nome, tipo, ativa, status, razao_social) VALUES
      (5, 'Clínica A', 'clinic', true, 'ATIVO', 'Clínica A Ltda'),
      (6, 'Clínica B', 'clinic', true, 'ATIVO', 'Clínica B Ltda');
    INSERT INTO professionals (id, role, category, active, credential_version, empresa_id, is_platform_owner) VALUES
      (101, 'admin', 'admin', true, 0, 5, false),
      (102, 'admin', 'admin', true, 0, 6, false),
      (103, 'admin', 'admin', true, 7, 5, false);
    INSERT INTO clients (id, empresa_id, name, deleted_at) VALUES
      (10, 5, 'Carlúcia Ferreira Souza', NULL),
      (11, 5, 'Beatriz Lima Andrade', NULL),
      (12, 5, 'Cliente Excluída', now()),
      (20, 6, 'Cliente Outra Clínica', NULL);
    CREATE TABLE sessions (id int PRIMARY KEY, empresa_id int, client_id int, protocol_id int, status text,
      week_number int, scheduled_date text);
    CREATE TABLE substance_applications (id serial PRIMARY KEY, session_id int, substance_id int, status text,
      availability text DEFAULT 'disp', applied_at text, confirmed_by int);
    -- protocolo 100 (cliente 10): 1 plena, 2 cadastro, 3 aguardando, 4 sem aplicação
    INSERT INTO sessions VALUES (1000,5,10,100,'completed',1,'2026-11-09'), (1001,5,10,100,'completed',2,'2026-11-16'),
      (1002,5,10,100,'completed',3,'2026-11-23'), (1003,5,10,100,'scheduled',4,'2026-11-30');
    -- protocolo 101 (cliente 11, sem rubrica): 1 plena
    INSERT INTO sessions VALUES (1100,5,11,101,'completed',1,'2026-11-09');
    -- protocolo 102 (cliente 10): só aguardando
    INSERT INTO sessions VALUES (1200,5,10,102,'completed',1,'2026-11-09');
    INSERT INTO substance_applications (session_id, substance_id, status, applied_at) VALUES
      (1000,501,'applied','2026-11-10T01:30:00.000Z'), (1001,501,'applied','2026-11-17T12:00:00.000Z'),
      (1002,501,'applied','2026-11-24T12:00:00.000Z'), (1100,501,'applied','2026-11-10T01:30:00.000Z'),
      (1200,501,'applied','2026-11-10T01:30:00.000Z');
  `);
  const { ensureVisitConfirmations } = await import("../lib/ensure-visit-confirmations");
  await ensureVisitConfirmations();
  await q(`INSERT INTO visit_confirmations (session_id, empresa_id, client_id, state) VALUES
    (1000,5,10,'rubrica_chave'), (1001,5,10,'rubrica_desafio'), (1002,5,10,'pendente'),
    (1100,5,11,'rubrica_chave'), (1200,5,10,'pendente')`);
  // Fixture nova com ausência comprovada; não é retropreenchimento de dados reais.
  await q("UPDATE visit_confirmations SET rubrica_snapshot_at=NOW() WHERE session_id=1100");
}, 120_000);

afterAll(async () => {
  state.database = null;
  if (isolated) await isolated.stop();
}, 60_000);

beforeEach(() => { state.armazenamentoCaido = false; });

const ativas = async (clientId: number) =>
  (await q("SELECT id, sha256, object_path FROM client_rubricas WHERE client_id=$1 AND ativa", [clientId])).rows;
const todas = async (clientId: number) =>
  (await q("SELECT id, ativa, object_path FROM client_rubricas WHERE client_id=$1 ORDER BY id", [clientId])).rows;

describe("Rubrica do cliente em imagem — armazenamento", () => {
  it("T-RUB-7: a tabela nasce sozinha, repetir não quebra e só pode haver UMA ativa por cliente (R11)", async () => {
    await ensureClientRubricas();
    await ensureClientRubricas();
    const indices = (await q("SELECT indexdef FROM pg_indexes WHERE tablename='client_rubricas'")).rows.map((r: any) => r.indexdef);
    expect(indices.some((d: string) => /UNIQUE/i.test(d) && /\(client_id\)/.test(d) && /WHERE/i.test(d))).toBe(true);
    await q(`INSERT INTO client_rubricas (client_id, empresa_id, object_path, sha256, width, height, origem_mime)
             VALUES (999,5,'x/1.png','a',1,1,'image/png')`);
    await expect(q(`INSERT INTO client_rubricas (client_id, empresa_id, object_path, sha256, width, height, origem_mime)
             VALUES (999,5,'x/2.png','b',1,1,'image/png')`)).rejects.toMatchObject({ code: "23505" });
    await q("DELETE FROM client_rubricas WHERE client_id=999"); // limpeza do sintético desta prova
  });

  it("T-RUB-8: grava e lê a rubrica ativa; outra empresa, outro cliente e cliente sem rubrica não leem nada (F63)", async () => {
    const r = rubrica(3);
    const salva = await salvarRubricaCliente({ clientId: 10, empresaId: 5, professionalId: 101, pronta: r });
    expect(salva.alterada).toBe(true);
    const lida = await lerRubricaAtiva(10, 5);
    expect(lida?.equals(r.png)).toBe(true);
    expect(await lerRubricaAtiva(10, 6)).toBeNull(); // empresa errada
    expect(await lerRubricaAtiva(11, 5)).toBeNull(); // cliente sem rubrica
    expect(await lerRubricaAtiva(20, 6)).toBeNull(); // outro cliente, outra empresa
    const [linha] = (await q("SELECT * FROM client_rubricas WHERE client_id=10")).rows;
    expect(linha.object_path).toMatch(/^client-rubricas\/5\/10\/[0-9a-f-]{36}\.png$/); // privado, fora de uploads/
    expect(linha.uploaded_by_professional_id).toBe(101);
    expect(linha.sha256).toBe(r.sha256);
  });

  it("T-RUB-12: trocar mantém a antiga no histórico; o mesmo arquivo de novo não cria versão (F66)", async () => {
    const antes = await todas(10);
    const nova = rubrica(5);
    const trocou = await salvarRubricaCliente({ clientId: 10, empresaId: 5, professionalId: 101, pronta: nova });
    expect(trocou.alterada).toBe(true);
    const depois = await todas(10);
    expect(depois.length).toBe(antes.length + 1);
    expect(depois.filter((l: any) => l.ativa).length).toBe(1);
    for (const linha of depois) expect(state.arquivos.has(linha.object_path)).toBe(true); // nenhum arquivo apagado
    expect((await lerRubricaAtiva(10, 5))?.equals(nova.png)).toBe(true);

    const arquivosAntes = state.arquivos.size;
    const repetida = await salvarRubricaCliente({ clientId: 10, empresaId: 5, professionalId: 101, pronta: nova });
    expect(repetida.alterada).toBe(false);
    expect((await todas(10)).length).toBe(depois.length);
    expect(state.arquivos.size).toBe(arquivosAntes); // nem arquivo órfão
  });

  it("T-RUB-11: quatro envios simultâneos do mesmo cliente terminam com UMA ativa e nenhum erro (F65)", async () => {
    const antes = (await todas(11)).length;
    const envios = [2, 4, 6, 8].map((g) => salvarRubricaCliente({ clientId: 11, empresaId: 5, professionalId: 101, pronta: rubrica(g) }));
    const resultados = await Promise.all(envios);
    expect(resultados.every((r) => r.alterada)).toBe(true);
    expect((await todas(11)).length).toBe(antes + 4);
    expect((await ativas(11)).length).toBe(1);
    // limpa para os próximos testes (o cliente 11 deve seguir sem rubrica no carregador)
    await q("DELETE FROM client_rubricas WHERE client_id=11");
  });

  it("T-RUB-14: rubrica registrada mas ilegível LANÇA erro; nunca devolve 'sem rubrica' em silêncio (F69)", async () => {
    state.armazenamentoCaido = true;
    await expect(lerRubricaAtiva(10, 5)).rejects.toThrow(/registrada, mas a imagem não pôde ser lida/);
    state.armazenamentoCaido = false;
    // falha ao GRAVAR o arquivo: nenhuma linha fica apontando para um arquivo que não existe
    const antes = (await todas(10)).length;
    state.armazenamentoCaido = true;
    await expect(salvarRubricaCliente({ clientId: 10, empresaId: 5, professionalId: 101, pronta: rubrica(7) })).rejects.toThrow();
    state.armazenamentoCaido = false;
    expect((await todas(10)).length).toBe(antes);
  });
});

describe("Rubrica do cliente em imagem — integridade do arquivo guardado", () => {
  beforeAll(async()=>{
    // Estas confirmações SINTÉTICAS têm versão conhecida, para continuar provando integridade.
    const [v]=await ativas(10);
    await q(`UPDATE visit_confirmations SET rubrica_version_id=$1,rubrica_sha256=$2,rubrica_snapshot_at=NOW()
      WHERE session_id IN (1000,1001)`,[v.id,v.sha256]);
  });
  it("T-RUB-14c: PNG válido porém DIFERENTE do registrado derruba a leitura, o GET e o RAS (F75)", async () => {
    const [linha] = await ativas(10);
    const original = state.arquivos.get(linha.object_path)!;
    state.arquivos.set(linha.object_path, rubrica(9).png); // outro PNG, perfeitamente legível
    try {
      await expect(lerRubricaAtiva(10, 5)).rejects.toThrow(/não confere com o registro/);
      await expect(loadProtocolRasRegistros({ id: 100, schedulingMode: "exact", empresaId: 5, clientId: 10 }, SUBS))
        .rejects.toThrow(/integridade da imagem não confere/);
      const rota = await request(app).get("/clients/10/rubrica").set(auth(tokenEmpresa5));
      expect(rota.status).toBe(500);
      expect(rota.headers["content-type"]).not.toBe("image/png");
    } finally {
      state.arquivos.set(linha.object_path, original);
    }
    expect((await lerRubricaAtiva(10, 5))?.equals(original)).toBe(true); // restaurado: volta a funcionar
  });
});

describe("Rubrica do cliente em imagem — carregador do RAS FAP", () => {
  const protocolo = (id: number, clientId: number, empresaId: number | null = 5) =>
    ({ id, schedulingMode: "exact", empresaId, clientId });

  it("T-RUB-13: a imagem do cliente do protocolo vai só nas marcas plena e cadastro (R17, R19, F67)", async () => {
    const esperada = (await lerRubricaAtiva(10, 5))!;
    const mapa = (await loadProtocolRasRegistros(protocolo(100, 10), SUBS))!;
    expect(mapa.get(1)!.confirmacaoCliente).toBe("plena");
    expect(mapa.get(1)!.rubricaPng?.equals(esperada)).toBe(true);
    expect(mapa.get(2)!.confirmacaoCliente).toBe("cadastro");
    expect(mapa.get(2)!.rubricaPng?.equals(esperada)).toBe(true);
    expect(mapa.get(3)!.confirmacaoCliente).toBe("aguardando");
    expect(mapa.get(3)!.rubricaPng).toBeUndefined();
    expect(mapa.get(4)!.confirmacaoCliente).toBeNull(); // sem aplicação não mostra nada
    expect(mapa.get(4)!.rubricaPng).toBeUndefined();
  });

  it("T-RUB-13b: cliente sem rubrica cai nas iniciais e nunca recebe a imagem de outro cliente", async () => {
    const mapa = (await loadProtocolRasRegistros(protocolo(101, 11), SUBS))!;
    expect(mapa.get(1)!.confirmacaoCliente).toBe("plena");
    expect(mapa.get(1)!.rubricaPng).toBeUndefined();
    expect(mapa.get(1)!.clienteNome).toBe("Beatriz Lima Andrade"); // as iniciais saem deste nome
  });

  it("T-RUB-13c: rubrica do mesmo cliente gravada para OUTRA empresa não é lida (F63)", async () => {
    await q(`INSERT INTO client_rubricas (client_id, empresa_id, object_path, sha256, width, height, origem_mime)
             VALUES (11, 6, 'client-rubricas/6/11/intrusa.png', 'intrusa', 10, 10, 'image/png')`);
    state.arquivos.set("client-rubricas/6/11/intrusa.png", Buffer.from("png-de-outra-empresa"));
    const mapa = (await loadProtocolRasRegistros(protocolo(101, 11, 5), SUBS))!;
    expect(mapa.get(1)!.rubricaPng).toBeUndefined();
    await q("DELETE FROM client_rubricas WHERE client_id=11");
  });

  it("T-RUB-13d: sem marca de rubrica no protocolo, o carregador nem lê o armazenamento", async () => {
    const leiturasAntes = state.leituras;
    const mapa = (await loadProtocolRasRegistros(protocolo(102, 10), SUBS))!;
    expect(mapa.get(1)!.confirmacaoCliente).toBe("aguardando");
    expect(state.leituras).toBe(leiturasAntes);
  });

  it("T-RUB-14b: rubrica registrada e ilegível derruba a emissão do RAS (sem iniciais em silêncio, R18)", async () => {
    state.armazenamentoCaido = true;
    await expect(loadProtocolRasRegistros(protocolo(100, 10), SUBS)).rejects.toThrow(/imagem registrada indisponível/);
  });
});

describe("Rubrica do cliente em imagem — rotas (cadeia real de autenticação)", () => {
  const enviar = (id: number | string, token: string | null, buffer: Buffer, tipo = "image/png", nome = "rubrica.png") => {
    let r = request(app).post(`/clients/${id}/rubrica`);
    if (token) r = r.set(auth(token));
    return r.attach("file", buffer, { filename: nome, contentType: tipo });
  };
  const original = comoPng(rabisco(600, 300));

  it("T-RUB-9: exige profissional autenticado e da mesma empresa; cliente excluído ou de outra empresa = 404 (F63)", async () => {
    expect((await enviar(10, null, original)).status).toBe(401);
    expect((await enviar(10, tokenVersaoVelha, original)).status).toBe(401); // credencial vencida
    expect((await request(app).get("/clients/10/rubrica")).status).toBe(401);
    expect((await request(app).get("/clients/10/rubrica").set(auth(tokenVersaoVelha))).status).toBe(401);
    expect((await enviar(20, tokenEmpresa5, original)).status).toBe(404); // cliente da empresa 6
    expect((await enviar(12, tokenEmpresa5, original)).status).toBe(404); // cliente excluída
    expect((await enviar(99999, tokenEmpresa5, original)).status).toBe(404);
    expect((await request(app).get("/clients/20/rubrica").set(auth(tokenEmpresa5))).status).toBe(404);
    expect((await request(app).get("/clients/10/rubrica").set(auth(tokenEmpresa6))).status).toBe(404); // empresa 6 não vê cliente da 5
    expect((await enviar("abc", tokenEmpresa5, original)).status).toBe(400);
    expect((await enviar("1; DROP TABLE clients", tokenEmpresa5, original)).status).toBe(400);
  });

  it("T-RUB-10: GET devolve o PNG só por rota autenticada, sem cache; cliente sem rubrica = 404 (F64)", async () => {
    expect((await request(app).get("/clients/11/rubrica").set(auth(tokenEmpresa5))).status).toBe(404);
    const enviada = await enviar(11, tokenEmpresa5, original);
    expect(enviada.status).toBe(200);
    expect(enviada.body).toMatchObject({ hasRubrica: true, alterada: true });
    const lida = await request(app).get("/clients/11/rubrica").set(auth(tokenEmpresa5)).buffer(true).parse((res, cb) => {
      const partes: Buffer[] = [];
      res.on("data", (p: Buffer) => partes.push(p));
      res.on("end", () => cb(null, Buffer.concat(partes)));
    });
    expect(lida.status).toBe(200);
    expect(lida.headers["content-type"]).toBe("image/png");
    expect(lida.headers["cache-control"]).toBe("private, no-store");
    expect(lida.headers["x-content-type-options"]).toBe("nosniff");
    expect((lida.body as Buffer).subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    // o mesmo arquivo de novo: sucesso sem criar versão
    const repetida = await enviar(11, tokenEmpresa5, original);
    expect(repetida.status).toBe(200);
    expect(repetida.body.alterada).toBe(false);
    expect((await ativas(11)).length).toBe(1);
  });

  it("T-RUB-10b: JPEG também é aceito e vira PNG limpo (R14)", async () => {
    const r = await enviar(11, tokenEmpresa5, comoJpeg(rabisco(600, 300, { grossura: 6 })), "image/jpeg", "foto.jpg");
    expect(r.status).toBe(200);
    expect((await q("SELECT origem_mime FROM client_rubricas WHERE client_id=11 AND ativa")).rows[0].origem_mime).toBe("image/jpeg");
  });

  it("T-RUB-10c: arquivo inválido, grande demais ou sem traço = 400 com mensagem clara e nada gravado", async () => {
    const antes = (await todas(11)).length;
    const texto = await enviar(11, tokenEmpresa5, Buffer.from("não sou imagem"), "image/png", "falso.png");
    expect(texto.status).toBe(400);
    expect(texto.body.error).toMatch(/PNG ou JPEG/);
    const pdf = await enviar(11, tokenEmpresa5, Buffer.from("%PDF-1.7"), "application/pdf", "doc.pdf");
    expect(pdf.status).toBe(400);
    const grande = await enviar(11, tokenEmpresa5, Buffer.alloc(2 * 1024 * 1024 + 10, 1), "image/png", "grande.png");
    expect(grande.status).toBe(400);
    expect(grande.body.error).toMatch(/2 MB/);
    const branco = await enviar(11, tokenEmpresa5, comoPng(rabisco(600, 300, { tinta: { r: 255, g: 255, b: 255 } })));
    expect(branco.status).toBe(400);
    expect(branco.body.error).toMatch(/traço/);
    const semArquivo = await request(app).post("/clients/11/rubrica").set(auth(tokenEmpresa5));
    expect(semArquivo.status).toBe(400);
    expect((await todas(11)).length).toBe(antes);
  });
});

describe("histórico do documento nunca usa a imagem atual por inferência",()=>{
  const protocolo={id:100,schedulingMode:"exact",empresaId:5,clientId:10};
  const snapshot=async()=> (await q("SELECT rubrica_version_id,rubrica_sha256 FROM visit_confirmations WHERE session_id=1000")).rows[0];
  async function gerar(mapa:Awaited<ReturnType<typeof loadProtocolRasRegistros>>){
    return gerarRasFapPdf({nome:"CLIENTE SINTÉTICO",medicoResponsavel:"MÉDICO SINTÉTICO",enfermeira:"EQUIPE SINTÉTICA",
      unidade:"CLÍNICA SINTÉTICA",dataAtendimento:new Date("2026-11-13T15:00:00-03:00"),protocoloNumero:"100",
      gradePersistida:[{numero:1,data:new Date("2026-11-09T12:00:00-03:00"),contadores:["1/1","1/1"]}],
      registros:mapa,substancias:[{nome:"ITEM SINTÉTICO A",sessoes:1,frequenciaDias:7,inicio:new Date("2026-11-09T12:00:00-03:00")},
        {nome:"ITEM SINTÉTICO B",sessoes:1,frequenciaDias:7,inicio:new Date("2026-11-09T12:00:00-03:00")}]});
  }
  async function imagens(pdf:Buffer){
    const doc=await PDFDocument.load(pdf);
    return doc.context.enumerateIndirectObjects().flatMap(([,obj])=>
      obj instanceof PDFRawStream && obj.dict.get(PDFName.of("Subtype"))?.toString()==="/Image"?
        [createHash("sha256").update(obj.getContents()).digest("hex")]:[]).sort();
  }
  it("trocar a rubrica mantém a imagem histórica e as imagens do PDF regenerado",async()=>{
    const antes=(await loadProtocolRasRegistros(protocolo,SUBS))!;
    const rubricaAntes=antes.get(1)!.rubricaPng!;
    const pdfAntes=await gerar(antes);
    const vinculo=await snapshot();
    await salvarRubricaCliente({clientId:10,empresaId:5,professionalId:101,pronta:rubrica(7)});
    expect((await lerRubricaAtiva(10,5))?.equals(rubricaAntes)).toBe(false);
    const depois=(await loadProtocolRasRegistros(protocolo,SUBS))!;
    expect(depois.get(1)!.rubricaPng?.equals(rubricaAntes)).toBe(true);
    expect(depois.get(1)!.rubricaVersionId).toBe(vinculo.rubrica_version_id);
    expect(await imagens(await gerar(depois))).toEqual(await imagens(pdfAntes));
    expect((await lerRubricaHistorica(10,5,vinculo.rubrica_version_id,vinculo.rubrica_sha256)).equals(rubricaAntes)).toBe(true);
  });
  it("clínica, cliente ou hash divergente recusam antes de ler o arquivo",async()=>{
    const v=await snapshot();const leituras=state.leituras;
    await expect(lerRubricaHistorica(10,6,v.rubrica_version_id,v.rubrica_sha256)).rejects.toThrow(/vínculo/);
    await expect(lerRubricaHistorica(11,5,v.rubrica_version_id,v.rubrica_sha256)).rejects.toThrow(/vínculo/);
    await expect(lerRubricaHistorica(10,5,v.rubrica_version_id,"f".repeat(64))).rejects.toThrow(/vínculo/);
    expect(state.leituras).toBe(leituras);
  });
  it("referência adulterada para imagem de outra clínica no documento também recusa",async()=>{
    const original=await snapshot();
    await salvarRubricaCliente({clientId:20,empresaId:6,professionalId:102,pronta:rubrica(4)});
    const [outra]=await ativas(20);
    try{
      await q("UPDATE visit_confirmations SET rubrica_version_id=$1,rubrica_sha256=$2 WHERE session_id=1000",[outra.id,outra.sha256]);
      await expect(loadProtocolRasRegistros(protocolo,SUBS)).rejects.toThrow(/vínculo/);
    }finally{
      await q("UPDATE visit_confirmations SET rubrica_version_id=$1,rubrica_sha256=$2 WHERE session_id=1000",
        [original.rubrica_version_id,original.rubrica_sha256]);
    }
  });
  it("pendente ignora até uma referência de versão presente; ausência capturada permanece sem imagem",async()=>{
    const v=await snapshot();
    await q("UPDATE visit_confirmations SET rubrica_version_id=$1,rubrica_sha256=$2,rubrica_snapshot_at=NOW() WHERE session_id=1200",
      [v.rubrica_version_id,v.rubrica_sha256]);
    const leituras=state.leituras;
    const pendente=(await loadProtocolRasRegistros({id:102,schedulingMode:"exact",empresaId:5,clientId:10},SUBS))!;
    expect(pendente.get(1)!.rubricaPng).toBeUndefined();expect(state.leituras).toBe(leituras);
    const semImagem=(await loadProtocolRasRegistros({id:101,schedulingMode:"exact",empresaId:5,clientId:11},SUBS))!;
    expect(semImagem.get(1)!.rubricaHistorica).toBe("sem_imagem");expect(semImagem.get(1)!.rubricaPng).toBeUndefined();
  });
  it("versão não registrada no legado fica explícita, sem consultar a imagem de hoje",async()=>{
    const v=await snapshot();
    try{
      await q("UPDATE visit_confirmations SET rubrica_version_id=NULL,rubrica_sha256=NULL,rubrica_snapshot_at=NULL WHERE session_id IN(1000,1001)");
      const leituras=state.leituras;
      const mapa=(await loadProtocolRasRegistros(protocolo,SUBS))!;
      expect(mapa.get(1)!.rubricaHistorica).toBe("legado_sem_versao");expect(mapa.get(1)!.rubricaPng).toBeUndefined();
      expect(state.leituras).toBe(leituras);
    }finally{
      await q("UPDATE visit_confirmations SET rubrica_version_id=$1,rubrica_sha256=$2,rubrica_snapshot_at=NOW() WHERE session_id IN(1000,1001)",
        [v.rubrica_version_id,v.rubrica_sha256]);
    }
  });
});
