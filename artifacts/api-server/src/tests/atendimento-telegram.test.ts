/** Atendimento por IA: só orientação aprovada, queixa clínica vai para pessoa, pausa humana, uma resposta por mensagem. */
import { describe, it, expect, vi } from "vitest";
import {
  processarAtendimento, classificarQueixa, candidatas, escolhaDeterministica, normalizar,
  TEXTO_ENCAMINHADO, TEXTOS_QUEIXA_PARA_REVISAO,
  type DepsAtendimento, type ConfigAtendimentoIA, type OrientacaoAprovada, type EntradaAtendimento,
} from "../lib/atendimento-telegram";

const ORI: OrientacaoAprovada[] = [
  { id: 1, tema: "Como armazenar o frasco", perguntasExemplo: "onde guardar a medicação, geladeira, armazenamento do frasco", resposta: "RESPOSTA APROVADA 1: guarde na geladeira." },
  { id: 2, tema: "Jejum antes do exame", perguntasExemplo: "preciso estar em jejum para o exame de sangue, quantas horas de jejum", resposta: "RESPOSTA APROVADA 2: jejum de 8 horas." },
];
const CFG: ConfigAtendimentoIA = { modo: "ligado", permitidos: new Set(), queixaRevisada: false };
const E = (texto: string, over: Partial<EntradaAtendimento> = {}): EntradaAtendimento =>
  ({ inboxMessageId: 10, empresaId: 5, clienteId: 7, clienteNome: "Paciente Teste", chatId: "555", texto, ...over });

function deps(over: Partial<DepsAtendimento> & { cfg?: ConfigAtendimentoIA; modo?: "ia" | "humano"; reivindicadas?: Set<number> } = {}) {
  const reiv = over.reivindicadas ?? new Set<number>();
  const log: string[] = [];
  const d: DepsAtendimento = {
    lerConfig: async () => over.cfg ?? CFG,
    modoDoCliente: async () => over.modo ?? "ia",
    reivindicar: async (id) => (reiv.has(id) ? false : (reiv.add(id), true)),
    carregarOrientacoes: async () => ORI,
    enviarAoPaciente: vi.fn(async () => true),
    registrarSaida: vi.fn(async () => {}),
    passarParaHumano: vi.fn(async () => {}),
    alertarEquipe: vi.fn(async () => true),
    registrarDesfecho: vi.fn(async () => {}),
    ...over,
  };
  return { d, log };
}

describe("detecção de queixa clínica", () => {
  it.each([
    ["passei mal depois da injeção", "queixa"],
    ["estou com tontura e enjoo", "queixa"],
    ["estou com falta de ar", "emergencia"],
    ["dor no peito depois da aplicação", "emergencia"],
    ["meu rosto está com inchaço no rosto", "emergencia"],
    ["qual o horário da clínica", null],
    ["onde guardar o frasco", null],
  ])("%s => %s", (t, esperado) => expect(classificarQueixa(t)).toBe(esperado));
});

describe("escolha de orientação", () => {
  it("normaliza acento e caixa", () => expect(normalizar("Médicação, JEJUM!")).toBe("medicacao jejum"));
  it("pergunta que casa forte escolhe a orientação certa", () => {
    const c = candidatas("quantas horas de jejum para o exame de sangue?", ORI);
    expect(escolhaDeterministica(c)?.id).toBe(2);
  });
  it("uma palavra só não basta; empate não escolhe", () => {
    expect(escolhaDeterministica(candidatas("jejum", ORI))).toBeNull();
    expect(escolhaDeterministica(candidatas("preciso de ajuda", ORI))).toBeNull();
  });
});

describe("fluxo de atendimento", () => {
  it("desligado: não responde, não reivindica, não alerta", async () => {
    const { d } = deps({ cfg: { ...CFG, modo: "desligado" } });
    expect(await processarAtendimento(d, E("onde guardar a medicação no frasco"))).toBe("desligado");
    expect(d.enviarAoPaciente).not.toHaveBeenCalled();
  });
  it("lista: cliente fora da lista não é atendido", async () => {
    const { d } = deps({ cfg: { ...CFG, modo: "lista", permitidos: new Set([99]) } });
    expect(await processarAtendimento(d, E("onde guardar a medicação no frasco"))).toBe("fora_da_lista");
    expect(d.enviarAoPaciente).not.toHaveBeenCalled();
  });
  it("orientação aprovada é enviada PALAVRA POR PALAVRA e registrada", async () => {
    const { d } = deps();
    const r = await processarAtendimento(d, E("onde devo guardar a medicação, na geladeira? armazenamento do frasco"));
    expect(r).toBe("orientacao_enviada");
    expect(d.enviarAoPaciente).toHaveBeenCalledWith("555", ORI[0].resposta);
    expect(d.registrarSaida).toHaveBeenCalledWith(expect.objectContaining({ texto: ORI[0].resposta }));
    expect(d.registrarDesfecho).toHaveBeenCalledWith(10, "orientacao_enviada", 1);
    expect(d.passarParaHumano).not.toHaveBeenCalled();
  });
  it("sem orientação que sirva: encaminha, alerta, pausa a IA e não inventa", async () => {
    const { d } = deps();
    const r = await processarAtendimento(d, E("para que serve a minha vitamina X? qual o motivo de eu tomar"));
    expect(r).toBe("encaminhado_humano");
    expect(d.enviarAoPaciente).toHaveBeenCalledWith("555", TEXTO_ENCAMINHADO);
    expect(d.passarParaHumano).toHaveBeenCalledWith(7, "sem_orientacao_aprovada");
    expect(d.alertarEquipe).toHaveBeenCalledTimes(1);
  });
  it("a IA só pode escolher entre as candidatas; id inventado vira encaminhamento", async () => {
    const { d } = deps({ escolherComIA: async () => 999 });
    expect(await processarAtendimento(d, E("quantas horas de jejum para o exame de sangue?"))).toBe("encaminhado_humano");
  });
  it("a IA escolhe entre candidatas e a resposta continua sendo o texto aprovado", async () => {
    const { d } = deps({ escolherComIA: async () => 2 });
    await processarAtendimento(d, E("jejum exame sangue horas"));
    expect(d.enviarAoPaciente).toHaveBeenCalledWith("555", ORI[1].resposta);
  });
  it("IA indisponível: cai na regra determinística (forte) ou encaminha", async () => {
    const { d } = deps({ escolherComIA: async () => { throw new Error("fora"); } });
    expect(await processarAtendimento(d, E("quantas horas de jejum para o exame de sangue?"))).toBe("orientacao_enviada");
    const { d: d2 } = deps({ escolherComIA: async () => { throw new Error("fora"); } });
    expect(await processarAtendimento(d2, E("jejum"))).toBe("encaminhado_humano");
  });
  it("mesma mensagem reentregue = uma resposta só", async () => {
    const reivindicadas = new Set<number>();
    const { d } = deps({ reivindicadas });
    await processarAtendimento(d, E("quantas horas de jejum para o exame de sangue?"));
    expect(await processarAtendimento(d, E("quantas horas de jejum para o exame de sangue?"))).toBe("ja_tratado");
    expect(d.enviarAoPaciente).toHaveBeenCalledTimes(1);
  });
  it("profissional assumiu: pausado, sem resposta automática", async () => {
    const { d } = deps({ modo: "humano" });
    expect(await processarAtendimento(d, E("quantas horas de jejum para o exame de sangue?"))).toBe("pausado_humano");
    expect(d.enviarAoPaciente).not.toHaveBeenCalled();
    expect(d.alertarEquipe).not.toHaveBeenCalled();
  });
  it("falha no envio é registrada e não conta como resposta", async () => {
    const { d } = deps({ enviarAoPaciente: vi.fn(async () => false) });
    expect(await processarAtendimento(d, E("quantas horas de jejum para o exame de sangue?"))).toBe("falha_envio");
    expect(d.registrarSaida).not.toHaveBeenCalled();
  });
});

describe("queixa clínica (Etapa 8)", () => {
  it("alerta sem aceite não promete encaminhamento nem envia texto ao cliente",async()=>{
    const {d}=deps({cfg:{...CFG,queixaRevisada:true},alertarEquipe:vi.fn(async()=>false)});
    expect(await processarAtendimento(d,E("estou com falta de ar"))).toBe("falha_alerta");
    expect(d.enviarAoPaciente).not.toHaveBeenCalled();
    expect(d.registrarDesfecho).toHaveBeenCalledWith(expect.any(Number),"falha_alerta",null);
    for(const texto of Object.values(TEXTOS_QUEIXA_PARA_REVISAO)) expect(texto).not.toContain("Já avisei");
  });
  it("queixa NUNCA recebe orientação nem IA, mesmo que case com uma orientação; vai para pessoa com prioridade", async () => {
    const escolherComIA = vi.fn(async () => 1);
    const { d } = deps({ escolherComIA });
    const r = await processarAtendimento(d, E("passei mal depois de guardar o frasco na geladeira, estou com tontura"));
    expect(r).toBe("queixa_encaminhada");
    expect(escolherComIA).not.toHaveBeenCalled();
    expect(d.passarParaHumano).toHaveBeenCalledWith(7, "queixa_clinica");
    expect(String((d.alertarEquipe as any).mock.calls[0][0])).toMatch(/PRIORIDADE/);
  });
  it("enquanto o Dr. Caio não revisar, nenhum texto automático de queixa sai", async () => {
    const { d } = deps();
    await processarAtendimento(d, E("estou com falta de ar"));
    expect(d.enviarAoPaciente).not.toHaveBeenCalled();
    expect(String((d.alertarEquipe as any).mock.calls[0][0])).toMatch(/URGENTE/);
  });
  it("revisado: emergência recebe orientação de procurar atendimento sem esperar a clínica", async () => {
    const { d } = deps({ cfg: { ...CFG, queixaRevisada: true } });
    expect(await processarAtendimento(d, E("estou com falta de ar"))).toBe("queixa_texto_enviado");
    expect(d.enviarAoPaciente).toHaveBeenCalledWith("555", TEXTOS_QUEIXA_PARA_REVISAO.emergencia);
  });
  it("rascunhos de queixa não diagnosticam, não ajustam dose, não dizem que é normal", () => {
    for (const t of Object.values(TEXTOS_QUEIXA_PARA_REVISAO)) {
      expect(normalizar(t)).not.toMatch(/\b(normal|diagnostic|reduza|aumente|suspenda|dose)\b/);
      expect(t).toMatch(/192/);
    }
  });
});
