import { describe, expect, it, vi } from "vitest";
import { planejarAtendimentoWhatsapp, perguntaInstitucional, type DepsOperacionaisWhatsapp, type StatusSilencioso } from "../lib/atendimento-whatsapp";
import type { DepsAtendimento, EntradaAtendimento } from "../lib/atendimento-telegram";
import { mapaPadrao, criarFrase, comGlobais } from "../lib/telegram-frases";

const APRES = "Olá!\n\nMe chamo Helena.";
const e = (texto: string): EntradaAtendimento => ({ inboxMessageId: 1_000_000_000_001, empresaId: 5, clienteId: 12, clienteNome: "Dayana", chatId: "5500", texto, canal: "whatsapp" });
const deps = (): DepsAtendimento => ({
  lerConfig: vi.fn(async () => ({ modo: "lista" as const, permitidos: new Set([12]), queixaRevisada: false })),
  modoDoCliente: vi.fn(async () => "ia" as const), reivindicar: vi.fn(async () => true),
  carregarOrientacoes: vi.fn(async () => []), textoApresentacao: vi.fn(async () => APRES),
  responderDocumento: vi.fn(async () => null), buscarFaq: vi.fn(async () => null),
  escolherComIA: vi.fn(async () => { throw Error("IA proibida"); }), conferirComIA: vi.fn(async () => { throw Error("IA proibida"); }),
  enviarAoPaciente: vi.fn(async () => true), registrarSaida: vi.fn(async () => {}), passarParaHumano: vi.fn(async () => {}),
  alertarEquipe: vi.fn(async () => true), textoEncaminhado: vi.fn(async () => "x"), registrarDesfecho: vi.fn(async () => {}),
});
const ops = (st: StatusSilencioso): DepsOperacionaisWhatsapp => {
  const F = comGlobais(criarFrase(mapaPadrao()), { clinica: "Instituto Pádua" });
  return { menuAtivo: async () => false, frase: async (k, v) => F(k as never, v), consultarRetorno: async () => null, agendar: async () => null,
    linkMarcacao: () => "https://x.test/agendar", statusSilencioso: async () => st };
};

describe("4 aberturas por status", () => {
  it.each([
    [{ tipo: "consulta", nome: "Dayana Ludman", data: "26/11/2026", hora: "09:00", unidade: "Sede" } as StatusSilencioso, "Localizei o seu cadastro.\n\nA sua consulta está agendada para 26/11/2026, às 09:00, em Sede."],
    [{ tipo: "protocolo", nome: "Dayana" } as StatusSilencioso, "protocolo em andamento no Instituto Pádua"],
    [{ tipo: "antigo", nome: "Dayana" } as StatusSilencioso, "agendar um retorno ou um novo acompanhamento"],
    [{ tipo: "novo" } as StatusSilencioso, "qual é o seu nome completo"],
  ])("saudação com status %#", async (st, trecho) => {
    const p = await planejarAtendimentoWhatsapp(deps(), e("Olá, bom dia"), ops(st));
    expect(p.resposta).toContain(trecho);
    expect(p.resposta).not.toMatch(/\{\w+\}/);
  });
  it("sem consulta futura nunca mostra data", async () => {
    const p = await planejarAtendimentoWhatsapp(deps(), e("Olá"), ops({ tipo: "antigo", nome: "Ana" }));
    expect(p.resposta).not.toMatch(/\d{2}\/\d{2}\/\d{4}/);
  });
});
describe("respostas institucionais aprovadas", () => {
  it("reconhece as perguntas", () => {
    expect(perguntaInstitucional("Quem é o Dr. Caio Pádua?")).toBe("quem_e_dr_caio");
    expect(perguntaInstitucional("Qual o valor da consulta?")).toBe("preco_consulta");
    expect(perguntaInstitucional("Estou com dor")).toBeNull();
  });
  it("preço traz R$ 750,00, o link e a continuidade", async () => {
    const p = await planejarAtendimentoWhatsapp(deps(), e("Quanto custa a consulta?"), ops({ tipo: "antigo", nome: "Ana" }));
    expect(p.resposta).toContain("R$ 750,00");
    expect(p.resposta).toContain("https://x.test/agendar");
    expect(p.resposta).toContain("Endereços das unidades");
  });
  it("sintoma clínico pausa e alerta, sem resposta clínica", async () => {
    const p = await planejarAtendimentoWhatsapp(deps(), e("Estou com tontura forte depois da aplicação"), ops({ tipo: "antigo", nome: "Ana" }));
    expect(p.pausa).toBeTruthy(); expect(p.alerta).toBeTruthy();
    expect(p.resposta ?? "").not.toMatch(/R\$ 750/);
  });
});

describe("agenda não é local", () => {
  it("aplicação de enfermagem mostra endereço físico e nunca o nome da agenda", async () => {
    const st: StatusSilencioso = { tipo: "consulta", nome: "Dayana", data: "26/11/2026", hora: "09:00", unidade: "Instituto Pádua — Rua Guaxupé, 327, Vila Formosa, São Paulo/SP", atendimento: "aplicacao" };
    const p = await planejarAtendimentoWhatsapp(deps(), e("Olá"), ops(st));
    expect(p.resposta).toContain("A sua aplicação está agendada para 26/11/2026, às 09:00, em Instituto Pádua — Rua Guaxupé, 327");
    expect(p.resposta).not.toMatch(/AGENDA (MEDICO|ENFERMAGEM)/);
  });
});
