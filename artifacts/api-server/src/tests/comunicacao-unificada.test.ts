import { describe, expect, it, vi } from "vitest";
vi.mock("@workspace/db", () => ({ pool: { query: vi.fn() }, db: {} }));
vi.mock("../routes/whatsapp-status", () => ({ mascararTelefone: (t: string) => `***${String(t).slice(-4)}` }));
import { entregaDaLinha, origemDaLinha, inicioDoPeriodo, type LinhaConversa } from "../lib/comunicacao-unificada";
import { impressaoDigitalDoConjunto, montarJson, montarPdf, montarXlsx, type Contexto } from "../lib/comunicacao-backup";

const linha = (o: Partial<LinhaConversa> = {}): LinhaConversa => ({
  ref: "t1", canal: "tg", clienteId: 1, clienteNome: "Maria", empresaId: 5, empresaNome: "Clínica A", destino: "chat ••••1234",
  direcao: "entrada", contexto: null, origem: "cliente", entrega: "Recebido", erro: null, cobranca: "teste", valorCentavos: null,
  previa: "Oi", corpo: "Oi 😀 tudo bem?", criadoEm: "2026-11-20T15:00:00.000Z",
  categoriaId: null, categoriaNome: null, natureza: "sem_categoria", regraVersao: null, etapas: [], ...o,
});
const ctx = (linhas: LinhaConversa[]): Contexto => ({
  nomeBase: "26.11.20 BACKUP MSG TG GERAL", canal: "TG", escopo: "geral", clinica: "Clínica A", periodoTexto: "Todo o histórico",
  geradoEm: "20/11/2026 12:00:00", cliente: null, linhas, digital: impressaoDigitalDoConjunto(linhas),
});

describe("direcao, origem e entrega", () => {
  it("entrada e sempre do cliente e Recebida", () => {
    expect(origemDaLinha("wwp", "entrada", null)).toBe("cliente");
    expect(entregaDaLinha("wwp", "entrada", "received")).toBe("Recebido");
  });
  it("origem de saida segue o contexto; sem contexto nao inventa", () => {
    expect(origemDaLinha("wwp", "saida", "inbound_reply")).toBe("ia");
    expect(origemDaLinha("tg", "saida", "cockpit_telegram")).toBe("humano");
    expect(origemDaLinha("wwp", "saida", "lembrete_prescricao")).toBe("automatico");
    expect(origemDaLinha("tg", "saida", null)).toBe("nao_informado");
  });
  it("entrega so mostra Lido com dado do provedor", () => {
    expect(entregaDaLinha("wwp", "saida", "sent")).toBe("Enviado");
    expect(entregaDaLinha("wwp", "saida", "read")).toBe("Lido");
    expect(entregaDaLinha("wwp", "saida", "xyz")).toBe("Não informado");
    expect(entregaDaLinha("tg", "saida", null)).toBe("Enviado");
  });
  it("periodo tudo nao tem inicio; 7d comeca meia-noite de Brasilia", () => {
    expect(inicioDoPeriodo("tudo")).toBeNull();
    expect(inicioDoPeriodo("hoje", new Date("2026-11-20T15:00:00Z"))!.toISOString()).toBe("2026-11-20T03:00:00.000Z");
  });
});

describe("arquivos de backup", () => {
  const linhas = [linha(), linha({ ref: "t2", direcao: "saida", origem: "humano", entrega: "Enviado", cobranca: "paga", valorCentavos: 12 })];
  it("impressao digital muda quando o conteudo muda", () => {
    const a = impressaoDigitalDoConjunto(linhas);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(impressaoDigitalDoConjunto([linha({ corpo: "outro" }), linhas[1]])).not.toBe(a);
  });
  it("JSON traz mensagens integras e digital", () => {
    const j = JSON.parse(montarJson(ctx(linhas)).toString("utf8"));
    expect(j.totalMensagens).toBe(2);
    expect(j.mensagens[0].conteudo).toBe("Oi 😀 tudo bem?");
    expect(j.integridade.valor).toHaveLength(64);
  });
  it("XLSX e PDF sao arquivos validos mesmo com emoji", async () => {
    const x = await montarXlsx(ctx(linhas));
    expect(x.subarray(0, 2).toString()).toBe("PK");
    const p = await montarPdf(ctx(linhas));
    expect(p.subarray(0, 5).toString()).toBe("%PDF-");
  });
});
