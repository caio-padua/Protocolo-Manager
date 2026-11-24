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

    expect(resultado.propostas).toHaveLength(4);
    expect(
      resultado.propostas
        .filter((proposta) => proposta.perguntaId === "Q013")
        .every((proposta) => proposta.justificativa.includes("pergunta ampla")),
    ).toBe(true);
    expect(resultado.propostas).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ destinoId: 4 }),
        expect.objectContaining({ perguntaId: "C-URO02", destinoId: 2 }),
      ]),
    );
  });
});
