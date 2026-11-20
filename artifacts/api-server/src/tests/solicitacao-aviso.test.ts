import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { decidirPam, lerModo, processarAviso, rejeicaoConfirmada, type DepsAviso } from "../lib/solicitacao-aviso";
import { CATEGORIAS, validarModelo, renderTexto } from "../lib/comunicacao-padrao";

describe("decisão do PAM", () => {
  it("benefício ativo isenta; sem benefício oferece o PAM", () => {
    expect(decidirPam(true)).toBe("isento");
    expect(decidirPam(false)).toBe("oferta");
  });
});
describe("modo de envio do aviso", () => {
  it("ausente ou ilegível vira teste; só 'ligado' e 'desligado' explícitos mudam", () => {
    for (const v of [null, undefined, "", "xyz", "TESTE"]) expect(lerModo(v)).toBe("teste");
    expect(lerModo("ligado")).toBe("ligado"); expect(lerModo(" Desligado ")).toBe("desligado");
  });
});
describe("modelo do aviso de pedido recebido", () => {
  it("é válido, não promete emissão e não inventa valor", () => {
    expect(validarModelo("pedido_recebido", CATEGORIAS.pedido_recebido.texto)).toBeNull();
    const t = renderTexto(CATEGORIAS.pedido_recebido.texto, { nome: "Ana", assistente: "Helena", clinica: "Clínica X", referencia: "Receita" });
    expect(t).toContain("avaliado pelo médico"); expect(t).toContain("Nada é emitido antes");
    expect(t).not.toMatch(/R\$|\{\w+\}/);
  });
  it("a oferta do PAM cita a opção avulsa", () => { expect(CATEGORIAS.oferta_pam.texto).toContain("avulsa"); });
});
describe("anamnese é serviço separado e a solicitação não copia dado clínico", () => {
  it("o aviso só usa o resumo (concluída ou não) e a rota grava o aviso fora da transação do pedido", () => {
    const svc = readFileSync(new URL("../lib/anamnese-consulta.ts", import.meta.url), "utf8");
    expect(svc).toContain("empresa_id=${empresaId}");
    expect(svc).not.toMatch(/anamnese_resposta|answers/);
    const rota = readFileSync(new URL("../routes/area-paciente-pedidos.ts", import.meta.url), "utf8");
    expect(rota).toMatch(/void avisarPedidoRecebido/);
  });
});

/** Banco e envio falsos: provam a maquina de estados sem tocar em cliente real. */
function fake(over: Partial<DepsAviso> = {}) {
  const log: string[] = []; let reservado = false;
  const d: DepsAviso = {
    reservar: async () => { if (reservado) return null; reservado = true; return 1; },
    fechar: async (_i, s) => { log.push(s); },
    enviar: async () => { log.push("enviou"); return { status: "aceito", flyerEnviado: false, envioId: 7 }; },
    ehErroDeValidacao: (e) => (e as Error).name === "Validacao",
    ...over,
  };
  return { d, log };
}
describe("máquina de estados do aviso (sem duplicar entrega)", () => {
  it("duas tentativas simultâneas: só uma envia", async () => {
    const { d, log } = fake();
    const [a, b] = await Promise.all([processarAviso("pedido_recebido", "teste", "teste", d), processarAviso("pedido_recebido", "teste", "teste", d)]);
    expect([a.resultado, b.resultado].sort()).toEqual(["aceito", "duplicado"]);
    expect(log.filter((x) => x === "enviou")).toHaveLength(1);
  });
  it("envio feito e falha depois no registro: nunca vira recusado (não libera reenvio)", async () => {
    const falha = Object.assign(new Error("banco caiu"), {});
    const { d, log } = fake({ enviar: async () => { log.push("enviou"); throw falha; } });
    const r = await processarAviso("pedido_recebido", "teste", "teste", d);
    expect(r.resultado).toBe("incerto"); expect(log).not.toContain("recusado");
  });
  it("erro de validação antes do envio é recusado e pode ser retomado", async () => {
    const v = Object.assign(new Error("chat sem vínculo"), { name: "Validacao" });
    const { d } = fake({ enviar: async () => { throw v; } });
    expect((await processarAviso("oferta_pam", "teste", "teste", d)).resultado).toBe("recusado");
  });
  it("flyer saiu e o texto foi recusado: incerto, não recusado", async () => {
    const { d } = fake({ enviar: async () => ({ status: "recusado", flyerEnviado: true, envioId: 3, erro: "texto: x" }) });
    expect((await processarAviso("oferta_pam", "teste", "teste", d)).resultado).toBe("incerto");
  });
  it("fora da lista de teste e modo desligado não enviam", async () => {
    const a = fake(); const b = fake();
    expect((await processarAviso("pedido_recebido", "teste", "producao", a.d)).resultado).toBe("nao_enviado");
    expect((await processarAviso("pedido_recebido", "desligado", "teste", b.d)).resultado).toBe("nao_enviado");
    expect(a.log).not.toContain("enviou"); expect(b.log).not.toContain("enviou");
  });
  it("modo ligado entrega também em produção", async () => {
    expect((await processarAviso("pedido_recebido", "ligado", "producao", fake().d)).resultado).toBe("aceito");
  });
  it("falha ao reservar propaga: nada foi enviado nem fica pendente", async () => {
    const { d, log } = fake({ reservar: async () => { throw new Error("consulta falhou"); } });
    await expect(processarAviso("pedido_recebido", "teste", "teste", d)).rejects.toThrow();
    expect(log).toHaveLength(0);
  });
});

describe("resultado do transporte: recusa confirmada x ambíguo", () => {
  it("só 4xx do Telegram e falta de token contam como recusa; rede, tempo esgotado, resposta inválida e 5xx são incertos", async () => {
    expect(rejeicaoConfirmada("texto: telegram_http_400")).toBe(true);
    expect(rejeicaoConfirmada("texto: sem token")).toBe(true);
    for (const e of ["texto: telegram_falha_de_rede_ou_timeout", "texto: telegram_resultado_invalido", "texto: telegram_http_502", "texto: outra coisa", undefined, null])
      expect(rejeicaoConfirmada(e as string | undefined)).toBe(false);
    const casos: Array<[string, string]> = [["texto: telegram_http_400", "recusado"], ["texto: telegram_falha_de_rede_ou_timeout", "incerto"], ["texto: telegram_resultado_invalido", "incerto"]];
    for (const [erro, esperado] of casos) {
      const { d } = fake({ enviar: async () => ({ status: "recusado", flyerEnviado: false, envioId: 1, erro }) });
      expect((await processarAviso("pedido_recebido", "teste", "teste", d)).resultado).toBe(esperado);
    }
  });
});
describe("consulta de anamnese contra o banco real (somente leitura)", () => {
  it("responde pelo cliente da clínica e não vaza para outra clínica", async () => {
    const { consultarAnamnese } = await import("../lib/anamnese-consulta");
    const a = await consultarAnamnese(1924, 5);
    expect(typeof a.concluida).toBe("boolean");
    expect(await consultarAnamnese(1924, 999999)).toEqual({ concluida: false, concluidaEm: null });
  });
});
