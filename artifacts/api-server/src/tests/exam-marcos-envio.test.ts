/** SPEC 3 (adendo 16/11/2026): marcos explícitos do envio. Dados 100% sintéticos; função pura. Nível: MOCK/puro. */
import { describe, it, expect } from "vitest";
import { montarMarcosEnvio, type EntradaMarcos } from "../lib/exam-marcos";

const T = (m: number) => new Date(Date.UTC(2026, 10, 16, 12, m));
const base = (o: Partial<EntradaMarcos> = {}): EntradaMarcos => ({
  status: "processando", createdAt: T(0), conf1At: null, conf2At: null, analitos: 0, marcos: {}, identidade: {}, ...o,
});
const est = (r: ReturnType<typeof montarMarcosEnvio>) => r.etapas.map((e) => e.estado[0]).join("");

describe("marcos do envio de exame", () => {
  it("0 a 100%: só o upload registrado = 17% (1 de 6)", () => {
    const r = montarMarcosEnvio(base());
    expect(est(r)).toBe("cppppp"); expect(r.percentual).toBe(17);
  });
  it("leitura executando não conta como concluída", () => {
    const r = montarMarcosEnvio(base({ marcos: { leitura_preliminar: { estado: "executando", em: T(1) } } }));
    expect(r.etapas[1].estado).toBe("executando"); expect(r.concluidas).toBe(1);
  });
  it("leitura e dados concluídos, identidade ainda SEM registro: identidade pendente (nada inferido)", () => {
    const r = montarMarcosEnvio(base({ marcos: { leitura_preliminar: { estado: "concluido", em: T(1) }, dados_extraidos: { estado: "concluido", em: T(2) } } }));
    expect(est(r)).toBe("cccppp"); expect(r.etapas[3].estado).toBe("pendente"); expect(r.percentual).toBe(50);
  });
  it("status 'recebido' NÃO prova identidade (sem registro de verificação)", () => {
    const r = montarMarcosEnvio(base({ status: "recebido", analitos: 3 }));
    expect(r.etapas[3].estado).toBe("pendente"); expect(r.etapas[3].metodo).toBe("Sem registro de verificação");
    expect(r.percentual).toBeLessThan(100);
  });
  it("quarentena: verificação com revisão = pendente, aguardando equipe", () => {
    const r = montarMarcosEnvio(base({ status: "quarentena", marcos: { leitura_preliminar: { estado: "concluido", em: T(1) }, dados_extraidos: { estado: "concluido", em: T(2) } }, identidade: { verificacao: { verdict: "revisao", em: T(3), ruleSetVersion: 1 } } }));
    expect(r.etapas[3].estado).toBe("pendente"); expect(r.etapas[3].metodo).toBe("Aguardando conferência da equipe");
  });
  it("identidade confirmada automática e humana concluem; rejeição humana falha", () => {
    const m = { leitura_preliminar: { estado: "concluido" as const, em: T(1) }, dados_extraidos: { estado: "concluido" as const, em: T(2) } };
    expect(montarMarcosEnvio(base({ status: "recebido", marcos: m, identidade: { verificacao: { verdict: "confirmada", em: T(3), ruleSetVersion: 2 } } })).etapas[3].estado).toBe("concluido");
    expect(montarMarcosEnvio(base({ status: "processando", marcos: m, identidade: { verificacao: { verdict: "contradicao", em: T(3), ruleSetVersion: 2 }, liberacaoHumana: { em: T(4) } } })).etapas[3].metodo).toBe("Confirmada pela equipe");
    const rej = montarMarcosEnvio(base({ status: "identidade_rejeitada", marcos: m, identidade: { verificacao: { verdict: "contradicao", em: T(3), ruleSetVersion: 2 }, rejeicaoHumana: { em: T(4) } } }));
    expect(rej.etapas[3].estado).toBe("falhou"); expect(rej.percentual).toBeLessThan(100);
  });
  it("C1 concluída só com registro de C1; C2 só em status 'conferido'", () => {
    const m = { leitura_preliminar: { estado: "concluido" as const, em: T(1) }, dados_extraidos: { estado: "concluido" as const, em: T(2) } };
    const id = { verificacao: { verdict: "confirmada", em: T(3), ruleSetVersion: 1 } };
    const c1 = montarMarcosEnvio(base({ status: "conferido_1", marcos: m, identidade: id, conf1At: T(5) }));
    expect(est(c1)).toBe("ccccc".slice(0, 5) + "p"); expect(c1.percentual).toBe(83);
    const c2 = montarMarcosEnvio(base({ status: "conferido", marcos: m, identidade: id, conf1At: T(5), conf2At: T(6), analitos: 12 }));
    expect(est(c2)).toBe("cccccc"); expect(c2.percentual).toBe(100);
  });
  it("100% nunca aparece com identidade ou C1 ausentes, mesmo com status conferido (envio legado)", () => {
    const r = montarMarcosEnvio(base({ status: "conferido", analitos: 30, conf2At: null }));
    expect(r.percentual).toBeLessThan(100); expect(r.etapas[5].estado).toBe("concluido"); expect(r.etapas[3].estado).toBe("pendente");
  });
  it("erro de leitura: falha na primeira etapa pendente, sem 100%", () => {
    const r = montarMarcosEnvio(base({ status: "erro" }));
    expect(r.etapas[1].estado).toBe("falhou"); expect(r.percentual).toBeLessThan(100);
  });
  it("etapa avançada é rótulo neutro e nunca entra no percentual", () => {
    const r = montarMarcosEnvio(base());
    expect(r.etapaAvancada).toEqual({ rotulo: "Cérebro e sinapses (medicina de alta precisão) — configuração pendente", estado: "pendente" }); expect(r.total).toBe(6);
  });
  it("trilha temporal ISO e sem dado pessoal no método", () => {
    const r = montarMarcosEnvio(base({ marcos: { leitura_preliminar: { estado: "concluido", em: T(1) } } }));
    expect(r.etapas[1].em).toBe(T(1).toISOString());
    expect(JSON.stringify(r)).not.toMatch(/cpf\s*\d|\d{3}\.\d{3}\.\d{3}/i);
  });
});
