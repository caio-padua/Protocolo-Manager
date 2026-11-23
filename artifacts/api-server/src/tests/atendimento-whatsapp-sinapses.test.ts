import { afterEach, describe, expect, it, vi } from "vitest";
import { criarAgrupador } from "../lib/agrupador-mensagens";
import { ramificacaoDaIntencao, ramificacaoValida, ramificacaoDoGrupoDeFrase, TRONCOS } from "../lib/atendimento-taxonomia";
import { perguntaNaoClinicaSegura } from "../lib/telegram-aprendiz";
import { planejarAtendimentoWhatsapp, type DepsOperacionaisWhatsapp } from "../lib/atendimento-whatsapp";
import type { DepsAtendimento, EntradaAtendimento } from "../lib/atendimento-telegram";

afterEach(() => vi.useRealTimers());

describe("agrupador de mensagens (4 s)", () => {
  it("junta mensagens seguidas em um único disparo", async () => {
    vi.useFakeTimers();
    const fn = vi.fn(async () => {});
    const a = criarAgrupador(fn);
    a.agendar("5|x"); await vi.advanceTimersByTimeAsync(3000);
    a.agendar("5|x"); await vi.advanceTimersByTimeAsync(3000);
    expect(fn).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1100);
    expect(fn).toHaveBeenCalledTimes(1);
  });
  it("não mistura conversas diferentes", async () => {
    vi.useFakeTimers();
    const fn = vi.fn(async () => {});
    const a = criarAgrupador(fn);
    a.agendar("5|a"); a.agendar("5|b");
    await vi.advanceTimersByTimeAsync(4100);
    expect(fn).toHaveBeenCalledTimes(2);
  });
  it("teto impede adiar para sempre", async () => {
    let t = 0;
    vi.useFakeTimers();
    const fn = vi.fn(async () => {});
    const a = criarAgrupador(fn, { agora: () => t, tetoMs: 12000 });
    for (let i = 0; i < 5; i++) { a.agendar("5|x"); t += 3000; await vi.advanceTimersByTimeAsync(3000); }
    await vi.advanceTimersByTimeAsync(1000);
    expect(fn).toHaveBeenCalled();
  });
});

describe("taxonomia (tronco e ramificação)", () => {
  it("tem os seis troncos pedidos e ramos válidos", () => {
    expect(Object.values(TRONCOS).map((t) => t.nome)).toEqual(
      ["Recepção", "Agendamento", "Receitas & Exames", "Financeiro", "Pós-Consulta", "Triagem Clínica"]);
    expect(ramificacaoValida("agendamento", "marcar")).toBe(true);
    expect(ramificacaoValida("agendamento", "inexistente")).toBe(false);
    expect(ramificacaoValida("x", "marcar")).toBe(false);
  });
  it("mapeia intenção e grupo de frase", () => {
    expect(ramificacaoDaIntencao("orcamento")).toEqual({ tronco: "financeiro", ramo: "orcamento" });
    expect(ramificacaoDaIntencao("clinica").tronco).toBe("triagem_clinica");
    expect(ramificacaoDoGrupoDeFrase("Perguntas do agendamento").tronco).toBe("agendamento");
  });
});

describe("pergunta inédita só se não for clínica nem tiver dado pessoal", () => {
  it("aceita dúvida administrativa", () => expect(perguntaNaoClinicaSegura("vocês atendem em estacionamento próprio")).toBe(true));
  it("recusa clínica, comercial e dado pessoal", () => {
    expect(perguntaNaoClinicaSegura("qual a dose que devo tomar hoje")).toBe(false);
    expect(perguntaNaoClinicaSegura("quanto custa a consulta de hoje")).toBe(false);
    expect(perguntaNaoClinicaSegura("meu cpf 123.456.789-09 está certo")).toBe(false);
  });
});

function depsBase(): DepsAtendimento {
  return {
    lerConfig: async () => ({ modo: "ligado", permitidos: new Set(), queixaRevisada: false }),
    modoDoCliente: async () => "ia", reivindicar: async () => true,
    carregarOrientacoes: async () => [], enviarAoPaciente: async () => true, registrarSaida: async () => {},
    passarParaHumano: async () => {}, alertarEquipe: async () => true,
    textoEncaminhado: async () => "encaminhado", registrarDesfecho: async () => {},
  };
}
const entrada = (texto: string): EntradaAtendimento => ({
  inboxMessageId: 1, empresaId: 5, clienteId: 1, clienteNome: "T", chatId: "x", texto, canal: "whatsapp", simulacao: true,
});

describe("coordenador com IA leve", () => {
  const ops = (extra: Partial<DepsOperacionaisWhatsapp>): DepsOperacionaisWhatsapp => ({
    menuAtivo: async () => false, frase: async (c) => `frase:${c}`, consultarRetorno: async () => null, agendar: async () => null, ...extra,
  });
  it("IA só escolhe a intenção; texto vem da frase aprovada", async () => {
    const p = await planejarAtendimentoWhatsapp(depsBase(), entrada("preciso conversar sobre a parte financeira"),
      ops({ classificarIA: async () => "humano" }));
    expect(p.intencao).toBe("humano");
    expect(p.resposta).toBe("frase:atendimento_pedido_equipe");
  });
  it("sem intenção da IA, registra a inédita e envia o menu", async () => {
    const reg = vi.fn(async () => {});
    const p = await planejarAtendimentoWhatsapp(depsBase(), entrada("vocês têm estacionamento próximo"),
      ops({ classificarIA: async () => null, registrarInedita: reg }));
    expect(reg).toHaveBeenCalledWith("vocês têm estacionamento próximo", "desconhecida", "regra");
    expect(p.resposta).toBe("frase:atendimento_menu");
  });
  it("queixa clínica nunca chega à IA nem ao registro", async () => {
    const ia = vi.fn(async () => "agendar" as const); const reg = vi.fn(async () => {});
    const p = await planejarAtendimentoWhatsapp(depsBase(), entrada("estou com dor no peito"), ops({ classificarIA: ia, registrarInedita: reg }));
    expect(ia).not.toHaveBeenCalled(); expect(reg).not.toHaveBeenCalled();
    expect(p.desfecho).not.toBe("menu_enviado");
  });
});
