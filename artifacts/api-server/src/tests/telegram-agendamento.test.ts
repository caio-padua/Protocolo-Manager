import { describe, it, expect, vi } from "vitest";
import { conduzirAgendamento, ESTADO_INICIAL, type DepsAgendamento, type Oferta } from "../lib/telegram-agendamento";

const AGORA = new Date().toISOString();
const of = (data: string, hora: string): Oferta => ({ data, hora, recursoId: 24, modalidade: "online" });
function deps(over: Partial<DepsAgendamento> = {}): DepsAgendamento {
  return {
    hojeISO: () => "2026-11-16",
    buscarHorarios: vi.fn(async () => ({ ofertas: [of("2026-11-17", "09:00"), of("2026-11-18", "14:00")], semAgenda: false })),
    reservar: vi.fn(async () => ({ ok: true as const, sessionId: 1 })),
    registrarPedido: vi.fn(async () => 7),
    encaminharEquipe: vi.fn(async () => {}),
    endereco: vi.fn(async () => "Rua Teste, 1"),
    ...over,
  };
}
const conv = async (textos: string[], ehCliente: boolean, d: DepsAgendamento) => {
  let est = null as ReturnType<typeof ESTADO_INICIAL> | null;
  const resp: (string | null)[] = [];
  for (const t of textos) {
    const r = await conduzirAgendamento(est, t, { ehCliente, primeiroNome: ehCliente ? "Ana" : undefined }, d, AGORA);
    est = r.estado; resp.push(r.resposta);
  }
  return resp;
};

describe("assistente de agendamento no Telegram", () => {
  it("apresenta-se e pergunta online ou presencial", async () => {
    const r = await conv(["quero marcar consulta"], true, deps());
    expect(r[0]).toContain("assistente virtual da clínica");
    expect(r[0]).toContain("online ou presencial");
  });
  it("cliente: só diz reservado depois de reservar gravar", async () => {
    const d = deps();
    const r = await conv(["quero marcar consulta", "online", "terça de manhã", "1"], true, d);
    expect(d.reservar).toHaveBeenCalledTimes(1);
    expect(r[3]).toContain("está reservada");
  });
  it("cliente: falha na gravação nunca promete reserva", async () => {
    const d = deps({ reservar: vi.fn(async () => ({ ok: false as const, motivo: "erro" as const })) });
    const r = await conv(["marcar consulta", "online", "terça de manhã", "1"], true, d);
    expect(r[3]).toContain("NÃO foi feita");
    expect(r[3]).not.toContain("está reservada");
    expect(d.encaminharEquipe).toHaveBeenCalled();
  });
  it("visitante: nunca reserva, registra pedido e avisa que não está reservado", async () => {
    const d = deps();
    const r = await conv(["quero agendar", "presencial", "quarta à tarde", "2", "Maria da Silva", "11 91234 5678"], false, d);
    expect(d.reservar).not.toHaveBeenCalled();
    expect(d.registrarPedido).toHaveBeenCalledTimes(1);
    expect(r[5]).toContain("NÃO está reservado");
  });
  it("sem horário livre: encaminha à equipe sem inventar", async () => {
    const d = deps({ buscarHorarios: vi.fn(async () => ({ ofertas: [], semAgenda: false })) });
    const r = await conv(["marcar consulta", "online", "qualquer dia de manhã"], true, d);
    expect(r[2]).toContain("Não encontrei horário");
    expect(d.encaminharEquipe).toHaveBeenCalled();
  });
  it("período específico vence 'tanto faz' do dia", async () => {
    const { lerPeriodo } = await import("../lib/telegram-agendamento");
    expect(lerPeriodo("tanto faz, de tarde")).toBe("tarde");
    expect(lerPeriodo("qualquer horário")).toBe("qualquer");
  });
  it("queixa de saúde não é tratada", async () => {
    const r = await conduzirAgendamento(null, "estou com dor no peito, quero marcar consulta", { ehCliente: true }, deps(), AGORA);
    expect(r.tratada).toBe(false);
  });
  it("cliente fora do assunto não é tratado", async () => {
    const r = await conduzirAgendamento(null, "obrigado", { ehCliente: true }, deps(), AGORA);
    expect(r.tratada).toBe(false);
  });
});
