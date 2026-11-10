import { describe, expect, it } from "vitest";
import { inflateSync } from "node:zlib";
import { PDFParse } from "pdf-parse";
import { iniciaisDoMeio, marcaDoEstado, nomeEnfermeira, rubricaCliente, type RegistroRasFap } from "../lib/ras-fap-rubrica";
import { gerarRasFapPdf, type DadosRasFap, type LinhaGrade } from "../lib/ras-fap";

// K9 — formatos da rubrica (decididos pelo CEO em 12/06/2026) e o RAS FAP com os registros ligados.
const cabeAte = (max: number) => (t: string) => Array.from(t).length <= max;

describe("K9 — formatos da rubrica", () => {
  it("T-K9-1: Sobrenome, I.N.I. com todos os nomes do meio", () => {
    expect(rubricaCliente("Caio Henrique Souza Padua", cabeAte(40))).toBe("Padua, C.H.S.");
    expect(iniciaisDoMeio("Caio Henrique Souza Padua")).toBe("C.H.S.");
    expect(rubricaCliente("Maria Souza", cabeAte(40))).toBe("Souza, M.");
  });

  it("T-K9-2: partículas contam como nome do meio e acentos são preservados", () => {
    expect(rubricaCliente("Ângela da Silva Pádua", cabeAte(40))).toBe("Pádua, Â.D.S.");
  });

  it("T-K9-3: só o sobrenome encurta; as iniciais e o sufixo ficam inteiros", () => {
    // limite 16 caracteres (já com a folga de 2): "Vasconcelos, A.B." tem 17.
    const r = rubricaCliente("Ana Beatriz Vasconcelos", cabeAte(16));
    expect(r.endsWith(", A.B.")).toBe(true);
    expect(Array.from(r).length).toBeLessThanOrEqual(16);
    expect(r.startsWith("Vasconcelo")).toBe(true);
    const comMarca = rubricaCliente("Ana Beatriz Vasconcelos", cabeAte(24), " (cadastro)");
    expect(comMarca.endsWith(", A.B. (cadastro)")).toBe(true);
    expect(Array.from(comMarca).length).toBeLessThanOrEqual(24);
  });

  it("T-K9-4: nome de uma palavra só, vazio e muito apertado nunca somem", () => {
    expect(rubricaCliente("Madonna", cabeAte(40))).toBe("Madonna");
    expect(rubricaCliente("", cabeAte(40))).toBe("");
    expect(rubricaCliente(null, cabeAte(40))).toBe("");
    expect(rubricaCliente("Ana Beatriz Vasconcelos", cabeAte(2))).toBe("V, A.B.");
  });

  it("T-K9-5: enfermeira por extenso, cortada só se não couber", () => {
    expect(nomeEnfermeira("Enf. Carlos Mendes", cabeAte(30))).toBe("Enf. Carlos Mendes");
    expect(nomeEnfermeira("Enf. Carlos Mendes", cabeAte(10))).toBe("Enf. Carlo");
    expect(nomeEnfermeira("  ", cabeAte(10))).toBe("");
  });

  it("T-K9-6: estado da confirmação vira a marca do RAS FAP", () => {
    expect(marcaDoEstado("rubrica_chave")).toBe("plena");
    expect(marcaDoEstado("confirmada_email")).toBe("plena");
    expect(marcaDoEstado("rubrica_desafio")).toBe("cadastro");
    expect(marcaDoEstado("pendente")).toBe("aguardando");
    expect(marcaDoEstado("nao_confirmada")).toBe("nao_confirmada");
    expect(marcaDoEstado("sem_pedido")).toBeNull();
    expect(marcaDoEstado("chave_enviada")).toBeNull();
    expect(marcaDoEstado("qualquer_outro")).toBeNull();
    expect(marcaDoEstado(null)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// RAS FAP em PDF
// ---------------------------------------------------------------------------
const inicio = new Date(2026, 10, 10);
const grade: LinhaGrade[] = [1, 2, 3, 4, 5].map((n) => ({
  numero: n, data: new Date(2026, 10, 10 + 7 * (n - 1)), contadores: [`${n}/5`, n <= 3 ? `${n}/3` : null],
}));
const dados = (registros?: Map<number, RegistroRasFap>): DadosRasFap => ({
  nome: "MARIA SOUZA", medicoResponsavel: "DR TESTE", enfermeira: "ENF TESTE", unidade: "UNIDADE TESTE",
  dataAtendimento: inicio, protocoloNumero: "9", gradePersistida: grade, registros,
  substancias: [
    { nome: "COENZIMA Q10", sessoes: 5, frequenciaDias: 7, inicio },
    { nome: "VITAMINA B12", sessoes: 3, frequenciaDias: 7, inicio },
  ],
});
const reg = (o: Partial<RegistroRasFap>): RegistroRasFap => ({
  dataEfetiva: null, hora: null, enfermeira: null, clienteNome: "Maria Aparecida Souza Pádua",
  confirmacaoCliente: null, aplicadas: [false, false], ...o,
});
const registros = () => new Map<number, RegistroRasFap>([
  [1, reg({ dataEfetiva: "09/11/2026", hora: "22:30", enfermeira: "Enf. Carlos Mendes", confirmacaoCliente: "plena", aplicadas: [true, true] })],
  [2, reg({ dataEfetiva: "17/11/2026", hora: "09:20", enfermeira: "Enf. Carlos Mendes", confirmacaoCliente: "cadastro", aplicadas: [true, false] })],
  [3, reg({ dataEfetiva: "24/11/2026", hora: "10:05", enfermeira: "Enf. Carlos Mendes", confirmacaoCliente: "aguardando", aplicadas: [true, true] })],
  [4, reg({ dataEfetiva: "01/12/2026", hora: "11:00", enfermeira: "Ana Lima", confirmacaoCliente: "nao_confirmada", aplicadas: [true, false] })],
  // visita 5: sem aplicação registrada, mesmo com marca (nada aparece)
  [5, reg({ confirmacaoCliente: null, aplicadas: [false, false] })],
]);

async function texto(pdf: Buffer): Promise<string> {
  const parser = new PDFParse({ data: new Uint8Array(pdf) });
  try { return (await parser.getText()).text; } finally { await parser.destroy?.(); }
}
/** Quantidade de checks desenhados: só o check usa ponta e junção redondas (1 J / 1 j). */
function checksDesenhados(pdf: Buffer): number {
  const bruto = pdf.toString("latin1");
  let total = 0;
  for (const m of bruto.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    try { total += (inflateSync(Buffer.from(m[1]!, "latin1")).toString("latin1").match(/\n1 J\n1 j\n|1 J 1 j|1 J\r?\n1 j/g) ?? []).length; } catch { /* stream não comprimido */ }
  }
  return total;
}

describe("K9 — RAS FAP com os registros ligados", () => {
  it("T-K9-7: data e hora efetivas, enfermeira e rubrica do cliente aparecem na linha da visita", async () => {
    const t = await texto(await gerarRasFapPdf(dados(registros())));
    expect(t).toContain("09/11/2026");
    expect(t).toContain("22:30");
    // Nome longo: cortado para caber na célula com folga (decisão de 12/06/2026); nunca estoura a coluna.
    expect(t).toContain("Enf. Carlos Mend");
    expect(t).not.toContain("Enf. Carlos Mendes");
    expect(t).toContain("Pádua, M.A.S.");
    expect(t).toContain("Pádua, M.A.S. (cadastro)");
    expect(t).toContain("AGUARDANDO");
    expect(t).toContain("NÃO CONFIRMADA");
    expect(t).toContain("Ana Lima"); // nome curto aparece por extenso
  });

  it("T-K9-8: um check por aplicação registrada, nenhum onde não houve aplicação", async () => {
    // aplicadas: visita 1 = 2, visita 2 = 1, visita 3 = 2, visita 4 = 1, visita 5 = 0  ->  6 checks
    expect(checksDesenhados(await gerarRasFapPdf(dados(registros())))).toBe(6);
    expect(checksDesenhados(await gerarRasFapPdf(dados(undefined)))).toBe(0);
    expect(checksDesenhados(await gerarRasFapPdf(dados(new Map())))).toBe(0);
  });

  it("T-K9-9: sem registros (ou vazios) o documento tem o mesmo texto de antes; só a coluna efetiva/hora/rubrica muda com registro", async () => {
    const semRegistros = await texto(await gerarRasFapPdf(dados(undefined)));
    const vazio = await texto(await gerarRasFapPdf(dados(new Map())));
    expect(vazio).toBe(semRegistros);
    for (const marca of ["22:30", "Enf. Carlos Mend", "Ana Lima", "AGUARDANDO", "NÃO CONFIRMADA", "(cadastro)"]) {
      expect(semRegistros).not.toContain(marca);
    }
  });

  it("T-K9-10: visita sem aplicação registrada não mostra nada, e os 5 modos de impressão desenham os registros", async () => {
    for (const modo of ["PREMIUM", "SIMPLES", "MARCA", "MINIMAL", "BRONZE"] as const) {
      const pdf = await gerarRasFapPdf(dados(registros()), modo);
      expect(checksDesenhados(pdf), modo).toBe(6);
      const t = await texto(pdf);
      expect(t, modo).toContain("22:30");
      expect(t, modo).toContain("AGUARDANDO");
    }
  });
});
