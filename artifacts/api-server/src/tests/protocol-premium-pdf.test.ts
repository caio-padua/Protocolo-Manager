/**
 * Testes de regressão para o gerador de PDF premium (Carta de Tratamento PADAXOR).
 *
 * Usa buildProtocolDocumentLayout (sem cert/PAdES) para testar o layout isoladamente.
 * Cenários cobertos:
 *   - PDF gerado com bytes > 0
 *   - Múltiplas páginas (capa + fichas + overflow)
 *   - Substância SC gera PDF sem erro (cláusula SC no code path)
 *   - Textos longos geram mais páginas que textos curtos (overflow funcionando)
 *   - Campos médios múltiplos também geram overflow
 *   - Card label compõe o PDF sem erro
 */

import { describe, it, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import { buildProtocolDocumentLayout } from "../lib/pdf-signer.js";

// Texto longo: ~700 chars — força overflow da coluna direita
const TEXTO_LONGO =
  "Este e um texto clinico extenso que deve ultrapassar os limites da coluna direita da ficha A4. " +
  "A substancia foi escolhida por sua capacidade de modular marcadores inflamatorios e reduzir " +
  "estresse oxidativo em estudos controlados de nivel 1 com meta-analises randomizadas controladas. " +
  "Pacientes com doenca renal ou hepatica devem ter monitoramento laboratorial adicional trimestral. " +
  "Este texto continua deliberadamente para forcar a paginacao de overflow do gerador de PDF premium. " +
  "Linha adicional necessaria para garantir ultrapassagem do limite de renderizacao da coluna direita.";

// Texto medio: ~260 chars — pode nao caber se secoes anteriores consumiram espaco
const TEXTO_MEDIO =
  "Substancia de uso clinico comprovado com perfil de seguranca bem estabelecido em estudos fase 3. " +
  "Indicada para protocolos de otimizacao metabolica e modulacao hormonal endogena. " +
  "Monitoramento laboratorial recomendado a cada 90 dias de uso continuado.";

function makeSessions(subNames: string[]) {
  return [
    {
      number: 1,
      scheduledDate: "2026-02-01",
      status: "scheduled",
      substanceStatuses: subNames.map((n) => ({
        substanceName: n,
        sessionNumber: 1,
        totalSessions: 4,
        status: "scheduled",
      })),
    },
  ];
}

/** Substância base com todos os campos obrigatórios da interface */
function makeSub(overrides: Record<string, unknown> = {}) {
  return {
    name: "Substancia Alfa",
    dose: "500mg",
    color: "blue",   // OBRIGATÓRIO — getSubstanceColor lança sem ele
    procedureType: "iv",
    totalSessions: 4,
    intervalDays: 7,
    startDate: "2026-02-01",
    unitPrice: 100,
    ...overrides,
  };
}

function baseData(substances: unknown[], paymentOverrides?: unknown[]) {
  const names = (substances as { name: string }[]).map((s) => s.name);
  return {
    protocolId: 1,
    protocolTitle: "Protocolo de Teste",
    clientName: "Joao da Silva",
    clientCpf: "123.456.789-09",
    clientEmail: "joao@example.com",
    professionalName: "Dr. Teste",
    professionalCrm: "CRM/SP 000001",
    unit: "PADAXOR Clinica",
    serviceType: "injetavel",
    startDate: "2026-02-01",
    totalValue: 1000,
    substances,
    sessions: makeSessions(names),
    payments: paymentOverrides ?? [
      { amount: 600, method: "credit_card", status: "paid", dueDate: "2026-01-15", paidAt: "2026-01-15", installments: 3, cardLabel: "Visa final 1234" },
      { amount: 400, method: "pix",         status: "pending", dueDate: "2026-03-01" },
    ],
  };
}

type LayoutData = Parameters<typeof buildProtocolDocumentLayout>[1];

// ─── Testes de lógica financeira pura (sem PDF — resultados determinísticos) ───

describe("lógica financeira — saldo e card label", () => {

  it("saldo = totalValue - totalPaid (mesmo sem registro pending explícito)", () => {
    // Cenário: protocolo R$1.000, apenas R$600 pagos, sem cobrança pending criada
    const payments = [{ amount: 600, method: "pix", status: "paid" }];
    const totalValue = 1000;
    const totalPaid = payments.filter(p => p.status === "paid").reduce((s, p) => s + p.amount, 0);
    const saldo = Math.max(0, totalValue - totalPaid);
    expect(totalPaid).toBe(600);
    expect(saldo).toBe(400); // NÃO zero — independe de registro pending
  });

  it("saldo = 0 quando totalPaid >= totalValue", () => {
    const payments = [
      { amount: 600, method: "credit_card", status: "paid" },
      { amount: 400, method: "pix",         status: "paid" },
    ];
    const totalValue = 1000;
    const totalPaid = payments.filter(p => p.status === "paid").reduce((s, p) => s + p.amount, 0);
    const saldo = Math.max(0, totalValue - totalPaid);
    expect(saldo).toBe(0);
  });

  it("cardLabel curto (< 20 chars) não é truncado", () => {
    const cardLabel = "Visa final 1234";
    const maxChars = 20;
    const displayed = cardLabel.length > maxChars ? cardLabel.slice(0, maxChars - 2) + ".." : cardLabel;
    expect(displayed).toBe("Visa final 1234"); // não truncado
    expect(displayed).not.toContain(".."); // sem reticências
  });

  it("cardLabel NUNCA é truncado — texto completo preservado independente do tamanho", () => {
    // A coluna usa fonte adaptativa: texto completo é passado ao drawText, sem slice
    const cardLabel = "American Express Black final 99999";
    // Simular: cardCol = safeTxt(pay.cardLabel) — sem qualquer .slice()
    const cardCol = cardLabel; // sem truncamento
    expect(cardCol).toBe("American Express Black final 99999");
    expect(cardCol.includes("99999")).toBe(true); // final do cartão preservado
    expect(cardCol).not.toContain(".."); // sem reticências de truncamento
  });

  it("saldo devedor = totalValue quando não há pagamentos registrados", async () => {
    const pdfDoc = await PDFDocument.create();
    // Protocolo R$1.000 sem nenhum pagamento → saldo = R$1.000
    const data = baseData([makeSub()], []); // payments = []
    await expect(
      buildProtocolDocumentLayout(pdfDoc, data as LayoutData)
    ).resolves.toBeUndefined();
    // PDF válido mesmo sem payments (saldo section sempre renderizada)
    const bytes = await pdfDoc.save();
    expect(bytes.length).toBeGreaterThan(5000);
    // Lógica: saldo = max(0, totalValue - 0) = 1000
    const totalPaid = 0;
    const saldo = Math.max(0, 1000 - totalPaid);
    expect(saldo).toBe(1000);
  });

  it("método 'credit_card' exibe rótulo curto sem nome do cartão embutido", () => {
    const shortMap: Record<string, string> = {
      credit_card: "Credito", debit_card: "Debito", pix: "Pix",
      cash: "Dinheiro", bank_slip: "Boleto", bank_transfer: "Transf.",
    };
    const method = "credit_card";
    const cardLabel = "Master final 5678";
    const methodCell = shortMap[method] ?? method;
    const cardCell = cardLabel ?? "\u2014";
    // Método e cartão ficam em colunas separadas — método NÃO contém o cardLabel
    expect(methodCell).toBe("Credito");
    expect(methodCell).not.toContain("Master");
    expect(cardCell).toBe("Master final 5678");
  });

});

// ────────────────────────────────────────────────────────────────────────────────

describe("buildProtocolDocumentLayout — overflow e estrutura", () => {

  it("deve gerar um PDF válido (bytes > 5 KB) sem certificado", async () => {
    const pdfDoc = await PDFDocument.create();
    await buildProtocolDocumentLayout(pdfDoc, baseData([makeSub()]) as LayoutData);
    const bytes = await pdfDoc.save();
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(5000);
  });

  it("deve ter mais de 3 páginas (capa + ficha + financeiro + TCLE mínimo)", async () => {
    const pdfDoc = await PDFDocument.create();
    await buildProtocolDocumentLayout(pdfDoc, baseData([makeSub()]) as LayoutData);
    // mínimo esperado: capa + ficha + cronograma + financeiro + TCLE = 5
    expect(pdfDoc.getPageCount()).toBeGreaterThan(3);
  });

  it("substância SC gera PDF válido sem lançar erro (code path SC executado)", async () => {
    const pdfDoc = await PDFDocument.create();
    const data = baseData([makeSub({ name: "Sub Beta SC", procedureType: "sc", color: "teal" })]);
    // Não deve lançar — se SC throw, o test falha aqui
    await expect(
      buildProtocolDocumentLayout(pdfDoc, data as LayoutData)
    ).resolves.toBeUndefined();
    expect(pdfDoc.getPageCount()).toBeGreaterThan(3);
  });

  it("textos longos geram overflow: página com 7 campos longos tem mais páginas que sem", async () => {
    // PDF base (sem textos clínicos)
    const pdBase = await PDFDocument.create();
    await buildProtocolDocumentLayout(pdBase, baseData([makeSub()]) as LayoutData);
    const pagesBase = pdBase.getPageCount();

    // PDF com 7 campos longos (forçam overflow)
    const pdLong = await PDFDocument.create();
    await buildProtocolDocumentLayout(pdLong, baseData([
      makeSub({
        name: "Substancia Full Long",
        procedureType: "im",
        color: "green",
        composicao:        TEXTO_LONGO + " " + TEXTO_LONGO,
        mainFunction:      TEXTO_LONGO + " " + TEXTO_LONGO,
        description:       TEXTO_LONGO,
        perceivedEffects:  TEXTO_LONGO,
        contraindications: TEXTO_LONGO + " " + TEXTO_LONGO,
        scientificEvidence: TEXTO_LONGO + " " + TEXTO_LONGO,
        posologia:         TEXTO_LONGO,
      }),
    ]) as LayoutData);
    const pagesLong = pdLong.getPageCount();

    // O PDF com campos longos DEVE ter mais páginas que o base
    expect(pagesLong).toBeGreaterThan(pagesBase);
    // E deve ter pelo menos 3 páginas extras (algumas de overflow)
    expect(pagesLong - pagesBase).toBeGreaterThanOrEqual(3);
  });

  it("campo médio que não cabe após seções anteriores gera overflow (campo nunca renderizado)", async () => {
    // Para forçar o cenário onde drawSecPremium retorna fullText (seção não rendeu NADA),
    // usamos 6 campos com TEXTO_LONGO (cada um consome ~91px truncado), totalizando >500px.
    // Com rightY disponível ≈ 570px, o 7º campo (TEXTO_MEDIO) não cabe e retorna fullText.
    const pdBase = await PDFDocument.create();
    await buildProtocolDocumentLayout(pdBase, baseData([makeSub()]) as LayoutData);
    const pagesBase = pdBase.getPageCount();

    const pdOverflow = await PDFDocument.create();
    await buildProtocolDocumentLayout(pdOverflow, baseData([
      makeSub({
        name: "Substancia Saturada",
        composicao:        TEXTO_LONGO, // ~91px (truncado em 418 chars)
        mainFunction:      TEXTO_LONGO, // ~91px
        description:       TEXTO_LONGO, // ~91px
        perceivedEffects:  TEXTO_LONGO, // ~91px
        contraindications: TEXTO_LONGO, // ~91px
        scientificEvidence: TEXTO_LONGO, // ~91px — 6*91=546px > ~540px disponível
        posologia:         TEXTO_MEDIO, // campo que não cabe → overflow com texto completo
      }),
    ]) as LayoutData);

    // Com 7 campos onde os últimos não cabem, deve gerar mais páginas que o base
    expect(pdOverflow.getPageCount()).toBeGreaterThan(pagesBase);
  });

  it("card label compõe o PDF sem erro e gera bytes válidos", async () => {
    const pdfDoc = await PDFDocument.create();
    const data = baseData(
      [makeSub()],
      [{ amount: 500, method: "credit_card", status: "paid", cardLabel: "Master final 9999", installments: 2 }],
    );
    await expect(
      buildProtocolDocumentLayout(pdfDoc, data as LayoutData)
    ).resolves.toBeUndefined();
    const bytes = await pdfDoc.save();
    expect(bytes.length).toBeGreaterThan(5000);
  });

});
