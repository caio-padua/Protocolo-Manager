import { describe, expect, it } from "vitest";
import {
  gerarPropostasSinapsesIniciais,
  type CategoriaSinapse,
  type DestinoSinapse,
} from "../lib/sinapses-propostas-iniciais";

const categorias: CategoriaSinapse[] = [
  "EXAME",
  "PRESCRICAO",
  "INJETAVEL_IM",
  "INJETAVEL_SC",
  "INJETAVEL_EV",
  "IMPLANTE",
];

const vazio = (): Record<CategoriaSinapse, DestinoSinapse[]> =>
  Object.fromEntries(categorias.map((categoria) => [categoria, []])) as unknown as Record<
    CategoriaSinapse,
    DestinoSinapse[]
  >;

describe("propostas iniciais de sinapses clínicas", () => {
  it("respeita eixos, exclui códigos não clínicos e não escolhe blocos vazios", () => {
    const destinos = vazio();
    destinos.EXAME = [
      { tipo: "bloco_exames", id: 1, nome: "BLOCO TIREOIDE" },
      { tipo: "bloco_exames", id: 2, nome: "BLOCO TIREOIDE", incompleto: true },
      { tipo: "bloco_exames", id: 3, nome: "BLOCO RENAL ESPECIFICO" },
      { tipo: "exame", id: 4, nome: "DENSITOMETRIA ÓSSEA" },
    ];
    destinos.PRESCRICAO = [
      { tipo: "formula", id: 5, nome: "FORMULA SONO E RECUPERACAO" },
      { tipo: "formula", id: 6, nome: "FORMULA SUPORTE METABOLICO" },
    ];
    destinos.INJETAVEL_IM = [{ tipo: "injetavel", id: 7, nome: "GABA" }];

    const resultado = gerarPropostasSinapsesIniciais(
      [
        { perguntaId: "PHQ3", pergunta: "Dificuldade para dormir?" },
        { perguntaId: "D02", pergunta: "Tem diagnóstico de diabetes?" },
        { perguntaId: "Q013", pergunta: "Doenças já diagnosticadas" },
        { perguntaId: "Q001", pergunta: "Nome completo" },
        { perguntaId: "Q002", pergunta: "CPF" },
        { perguntaId: "Q010", pergunta: "Queixa principal" },
        { perguntaId: "F02", pergunta: "Reação alérgica grave" },
      ],
      destinos,
    );

    expect(resultado.propostas).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ perguntaId: "PHQ3", categoria: "PRESCRICAO", destinoId: 5 }),
        expect.objectContaining({ perguntaId: "D02", categoria: "PRESCRICAO", destinoId: 6 }),
        expect.objectContaining({ perguntaId: "Q013", categoria: "EXAME", destinoId: 3 }),
        expect.objectContaining({ perguntaId: "Q013", categoria: "EXAME", destinoId: 4 }),
      ]),
    );
    expect(resultado.propostas).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ destinoId: 2 }),
        expect.objectContaining({ perguntaId: "Q001" }),
        expect.objectContaining({ perguntaId: "Q002" }),
        expect.objectContaining({ perguntaId: "Q010" }),
        expect.objectContaining({ perguntaId: "F02" }),
      ]),
    );
    expect(resultado.perguntasIgnoradas).toContainEqual({
      perguntaId: "F02",
      motivo: "Reação alérgica grave é um alerta de segurança e não foi associada a tratamento digestivo.",
    });
    expect(resultado.perguntasIgnoradas.map((item) => item.perguntaId)).toEqual(
      expect.arrayContaining(["Q001", "Q002", "Q010"]),
    );
  });

  it("não duplica ligações já ativas e informa os códigos ausentes", () => {
    const destinos = vazio();
    destinos.EXAME = [{ tipo: "bloco_exames", id: 1, nome: "BLOCO BASE INTEGRATIVA" }];
    const resultado = gerarPropostasSinapsesIniciais(
      [
        { perguntaId: "M-ENE01", pergunta: "Energia ao longo do dia" },
        { perguntaId: "GAD1", pergunta: "Sente-se ansioso?" },
      ],
      destinos,
      [
        {
          perguntaId: "M-ENE01",
          categoria: "EXAME",
          destinoTipo: "bloco_exames",
          destinoId: 1,
        },
      ],
    );

    expect(resultado.propostas).toHaveLength(0);
    expect(resultado.codigosAusentes).not.toContain("GAD1-7");
    expect(resultado.codigosAusentes).toContain("GAD2");
    expect(resultado.codigosAusentes).toContain("Q003");
  });

  it("aplica os destinos por categoria e preserva a observação de revisão ampla", () => {
    const destinos = vazio();
    destinos.EXAME = [
      { tipo: "bloco_exames", id: 1, nome: "BLOCO RENAL ESPECIFICO" },
      { tipo: "bloco_exames", id: 2, nome: "BLOCO CARDIOLOGICOS DE IMAGEM" },
    ];
    destinos.INJETAVEL_SC = [
      { tipo: "injetavel", id: 3, nome: "TRIPEPTIDEO-41" },
      { tipo: "injetavel", id: 4, nome: "VITAMINA D" },
    ];

    const resultado = gerarPropostasSinapsesIniciais(
      [
        { perguntaId: "Q013", pergunta: "Doenças já diagnosticadas" },
        { perguntaId: "C-URO02", pergunta: "Acorda à noite para urinar?" },
        { perguntaId: "D02", pergunta: "Diagnóstico de diabetes" },
      ],
      destinos,
    );

    expect(resultado.propostas).toHaveLength(5);
    expect(
      resultado.propostas.some(
        (proposta) => proposta.perguntaId === "Q013" && proposta.justificativa.includes("pergunta ampla"),
      ),
    ).toBe(true);
    expect(resultado.propostas).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ destinoId: 4 }),
        expect.objectContaining({ perguntaId: "C-URO02", destinoId: 2 }),
      ]),
    );
  });

  it("propõe ligação para todo destino completo, respeita a categoria e não reabre destino já proposto", () => {
    const destinos = vazio();
    destinos.EXAME = [
      { tipo: "bloco_exames", id: 11, nome: "BLOCO SEM CONTEÚDO", incompleto: true },
      { tipo: "exame", id: 12, nome: "EXAME CARDIOLÓGICO", detalhe: "CARDIOLÓGICO" },
      { tipo: "exame", id: 13, nome: "EXAME SEM TEMA" },
    ];
    destinos.PRESCRICAO = [{ tipo: "formula", id: 21, nome: "FÓRMULA PARA SONO" }];
    destinos.INJETAVEL_IM = [{ tipo: "injetavel", id: 31, nome: "COMPLEXO VITAMÍNICO" }];
    destinos.INJETAVEL_SC = [{ tipo: "injetavel", id: 32, nome: "INJETÁVEL SEM TEMA" }];
    destinos.INJETAVEL_EV = [{ tipo: "injetavel", id: 33, nome: "POOL CARDIOLÓGICO" }];
    destinos.IMPLANTE = [{ tipo: "implante", id: 41, nome: "TESTOSTERONA PELLET" }];

    const perguntas = [
      { perguntaId: "Q013", pergunta: "Doenças já diagnosticadas" },
      { perguntaId: "C-CAR01", pergunta: "Dor no peito?" },
      { perguntaId: "F58", pergunta: "Como avalia seu sono?" },
      { perguntaId: "C-GER03", pergunta: "Cansaço persistente?" },
      { perguntaId: "Q032", pergunta: "Aceita protocolo injetável?" },
      { perguntaId: "F20", pergunta: "Interesse sexual?" },
      { perguntaId: "Q001", pergunta: "Nome completo" },
      { perguntaId: "Q002", pergunta: "CPF" },
      { perguntaId: "F02", pergunta: "Reação grave (anafilaxia)?" },
    ];
    const resultado = gerarPropostasSinapsesIniciais(
      perguntas,
      destinos,
      [],
      [
        { perguntaId: "C-GER03", categoria: "INJETAVEL_SC", destinoTipo: "injetavel", destinoId: 32 },
      ],
    );

    const cobertura = new Set(
      [
        ...resultado.propostas.map((p) => `${p.categoria}|${p.destinoTipo}|${p.destinoId}`),
        "INJETAVEL_SC|injetavel|32",
      ],
    );
    for (const [categoria, itens] of Object.entries(destinos) as Array<
      [CategoriaSinapse, DestinoSinapse[]]
    >) {
      for (const item of itens.filter((d) => !d.incompleto)) {
        expect(cobertura.has(`${categoria}|${item.tipo}|${item.id}`)).toBe(true);
      }
    }
    expect(resultado.propostas).toHaveLength(6);
    expect(resultado.propostas).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ perguntaId: "C-CAR01", categoria: "EXAME", destinoId: 12 }),
        expect.objectContaining({ perguntaId: "F58", categoria: "PRESCRICAO", destinoId: 21 }),
        expect.objectContaining({ perguntaId: "F20", categoria: "IMPLANTE", destinoId: 41 }),
        expect.objectContaining({
          perguntaId: "Q013",
          destinoId: 13,
          eixo: "Aproximação clínica ampla — baixa confiança",
        }),
      ]),
    );
    expect(resultado.propostas.some((p) => ["Q001", "Q002", "F02"].includes(p.perguntaId))).toBe(false);
    expect(resultado.propostas.some((p) => p.destinoId === 11)).toBe(false);
    expect(
      resultado.propostas.find((p) => p.categoria === "EXAME" && p.destinoId === 13)?.justificativa,
    ).toContain("BAIXA CONFIANÇA");
  });
});
