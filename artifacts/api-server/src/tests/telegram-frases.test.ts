import { describe, it, expect } from "vitest";
import { criarFrase, mapaPadrao, validarTextoFrase, FRASES_PADRAO } from "../lib/telegram-frases";
import { conduzirAgendamento, ESTADO_INICIAL, lerIdentidade, lerVinculo, type DepsAgendamento, type EstadoConversa } from "../lib/telegram-agendamento";

const oferta = { data: "2026-11-17", hora: "10:00", recursoId: 1, modalidade: "online" as const };
function deps(over: Partial<DepsAgendamento> = {}): DepsAgendamento {
  return {
    frase: criarFrase(mapaPadrao()), hojeISO: () => "2026-11-16",
    buscarHorarios: async () => ({ ofertas: [oferta], semAgenda: false }),
    reservar: async () => ({ ok: false, motivo: "erro" }), registrarPedido: async () => 77,
    encaminharEquipe: async () => {}, endereco: async () => null,
    conferirIdentidade: async (p) => (p.cpf4 === "1234" && p.ano === "1985" ? { ok: true, clienteId: 9 } : { ok: false }),
    ...over,
  };
}
async function conv(textos: string[], d: DepsAgendamento) {
  let est: EstadoConversa | null = null; const resp: Array<string | null> = [];
  for (const t of textos) { const r = await conduzirAgendamento(est, t, { ehCliente: false, nomeClinica: "Clínica X" }, d, new Date().toISOString()); est = r.estado; resp.push(r.resposta); }
  return { est: est!, resp };
}

describe("frases cadastradas", () => {
  it("variavel desconhecida e obrigatoria ausente sao recusadas", () => {
    expect(validarTextoFrase("ofereceu_horarios", "Sem lista aqui")).toMatch(/obrigat/);
    expect(validarTextoFrase("ofereceu_horarios", "{lista} {foo}")).toMatch(/não existe/);
    expect(validarTextoFrase("ofereceu_horarios", "Olha: {lista}")).toBeNull();
  });
  it("todo padrao e valido contra si mesmo", () => {
    for (const [k, d] of Object.entries(FRASES_PADRAO)) expect(validarTextoFrase(k, d.texto)).toBeNull();
  });
  it("frase ausente e erro explicito", () => { expect(() => criarFrase({})("reservado")).toThrow(); });
  it("o texto vem do mapa (editado), nao do codigo", async () => {
    const m = { ...mapaPadrao(), pergunta_ja_paciente: "TEXTO EDITADO PELO CEO" };
    const { resp } = await conv(["quero marcar uma consulta"], deps({ frase: criarFrase(m) }));
    expect(resp[0]).toContain("TEXTO EDITADO PELO CEO");
  });
});

describe("quem e a pessoa", () => {
  it("le o vinculo", () => {
    expect(lerVinculo("já sou cliente")).toBe("cliente");
    expect(lerVinculo("primeira vez")).toBe("nova");
    expect(lerVinculo("não sou paciente")).toBe("nova");
    expect(lerVinculo("talvez")).toBeNull();
  });
  it("le a identidade", () => {
    expect(lerIdentidade("Maria Souza 1234 1985")).toEqual({ nome: "Maria Souza", cpf4: "1234", ano: "1985" });
    expect(lerIdentidade("Maria Souza 1234")).toBeNull();
    expect(lerIdentidade("Maria 1234 1985")).toBeNull();
  });
  it("pergunta se ja e cliente antes de qualquer outra coisa", async () => {
    const { resp } = await conv(["quero marcar uma consulta"], deps());
    expect(resp[0]).toMatch(/já é cliente/);
  });
  it("cliente conferido segue para modalidade e termina em pedido (nunca reserva)", async () => {
    let reservou = false; let pedido: EstadoConversa | null = null;
    const d = deps({ reservar: async () => { reservou = true; return { ok: true, sessionId: 1 }; }, registrarPedido: async (p) => { pedido = p.estado; return 5; } });
    const { resp, est } = await conv(["quero marcar uma consulta", "já sou cliente", "Maria Souza 1234 1985", "online qualquer dia tanto faz", "1", "11 91234 5678"], d);
    expect(resp[2]).toMatch(/Cadastro conferido/);
    expect(resp[5]).toMatch(/NÃO está reservado/);
    expect(resp[5]).toMatch(/dados de cadastro foram conferidos/);
    expect(reservou).toBe(false);
    expect((pedido as EstadoConversa | null)?.clienteId).toBe(9);
    expect(est.etapa).toBe("concluido");
  });
  it("dados que nao batem: resposta generica, 2a falha vai para a equipe", async () => {
    let equipe = "";
    const d = deps({ encaminharEquipe: async (m) => { equipe = m; } });
    const { resp } = await conv(["quero marcar uma consulta", "já sou cliente", "Maria Souza 9999 1985", "Maria Souza 8888 1985"], d);
    expect(resp[2]).toMatch(/Não consegui confirmar/);
    expect(resp[2]).not.toMatch(/CPF está|nascimento está/);
    expect(resp[3]).toMatch(/Encaminhei/);
    expect(equipe).toBe("identidade_nao_confirmada");
  });
  it("primeira vez segue o fluxo antigo (pede nome)", async () => {
    const { resp } = await conv(["quero marcar uma consulta", "primeira vez", "online qualquer dia tanto faz", "1"], deps());
    expect(resp[3]).toMatch(/nome completo/);
  });
});
