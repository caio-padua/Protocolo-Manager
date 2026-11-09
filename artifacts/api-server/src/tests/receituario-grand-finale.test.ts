import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";
import {
  GRAND_FINALE, carimbarRodapeGrandFinale, desenharPaginaGrandFinale,
  prepararArteGrandFinale,
} from "../lib/documentos/receituario-grand-finale";
import { ASSINATURA_3A1C_ALTURA, desenharAssinatura3a1c } from "../lib/documentos/bloco-assinatura-3a1c";
import { generateReceituarioPdfV2, type ReceituarioDataV2 } from "../lib/receituario-pdf";

function simbolo(): Uint8Array {
  const png = new PNG({ width: 4, height: 4 });
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = 210; png.data[i + 1] = 170; png.data[i + 2] = 70; png.data[i + 3] = 255;
  }
  return PNG.sync.write(png);
}

function identidade(nome: string) {
  return {
    textos: { nomeCabecalho: nome, rodapeLinha1: nome, rodapeLinha2: "Rua fictícia, 10",
      rodapeLinha3: "Cidade de exemplo" },
    simboloDourado: simbolo(),
  };
}

function extrair(bytes: Uint8Array, modo: "-layout" | "-bbox" = "-layout"): string {
  const dir = mkdtempSync(join(tmpdir(), "grand-finale-"));
  try {
    const file = join(dir, "prova.pdf");
    writeFileSync(file, bytes);
    return execFileSync("pdftotext", [modo, file, "-"], { encoding: "utf8" });
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
const texto = (bytes: Uint8Array) => extrair(bytes);

describe("Arte Grand Finale com identidade variável", () => {
  it.each(["Clínica Alfa", "Clínica Beta"])("compõe somente a identidade %s e a faixa existente", async (nome) => {
    const doc = await PDFDocument.create();
    const fontes = {
      titulo: await doc.embedFont(StandardFonts.TimesRomanBold),
      texto: await doc.embedFont(StandardFonts.Helvetica),
    };
    const arte = await prepararArteGrandFinale(doc, identidade(nome));
    const pagina = doc.addPage([GRAND_FINALE.largura, GRAND_FINALE.altura]);
    desenharPaginaGrandFinale(pagina, arte, fontes, "simples");
    carimbarRodapeGrandFinale(pagina, arte, fontes, 1, 1);
    await desenharAssinatura3a1c(doc, pagina, GRAND_FINALE.assinaturaBase, {
      profissional: "Profissional fictício", crm: "12345/SP",
    });
    const result = texto(await doc.save());
    expect(result).toContain(nome);
    expect(result).toContain("Profissional fictício");
    expect(result).toContain("GERADA SEM ASSINATURA DIGITAL");
    expect(result).toContain("Página 1 de 1");
    expect(result).not.toContain("Instituto Pádua");
    expect(result).not.toContain("Caio Henrique");
    expect(result).not.toContain("ASSINADO DIGITALMENTE");
  });

  it("recusa identidade ausente, textos que não cabem e paginação inválida", async () => {
    const doc = await PDFDocument.create();
    await expect(prepararArteGrandFinale(doc, { ...identidade(""), simboloDourado: new Uint8Array() }))
      .rejects.toThrow(/identidade empresarial/i);
    const arte = await prepararArteGrandFinale(doc, identidade("Nome muito grande ".repeat(60)));
    const fontes = {
      titulo: await doc.embedFont(StandardFonts.TimesRomanBold),
      texto: await doc.embedFont(StandardFonts.Helvetica),
    };
    const pagina = doc.addPage([GRAND_FINALE.largura, GRAND_FINALE.altura]);
    expect(() => desenharPaginaGrandFinale(pagina, arte, fontes, "especial")).toThrow(/não cabe/);
    expect(() => carimbarRodapeGrandFinale(pagina, arte, fontes, 2, 1)).toThrow(/paginação|numeração/i);
  });

  it("aceita apenas formato de página A4", async () => {
    const doc = await PDFDocument.create();
    const arte = await prepararArteGrandFinale(doc, identidade("Clínica Alfa"));
    const fontes = {
      titulo: await doc.embedFont(StandardFonts.TimesRomanBold),
      texto: await doc.embedFont(StandardFonts.Helvetica),
    };
    expect(() => desenharPaginaGrandFinale(doc.addPage([612, 792]), arte, fontes, "simples"))
      .toThrow(/A4/);
  });
});

describe("Prova Grand Finale pelo gerador de receitas existente", () => {
  const base: ReceituarioDataV2 = {
    homologacao: true, modelo2bProva: true, modeloGrandFinaleProva: true,
    identidade2bProva: identidade("Clínica Alfa"),
    assinaturaDigitalEstado: "sem_certificado_vencido",
    medicoName: "Profissional fictício", medicoCrm: "12345/SP",
    clinicaNome: "Clínica Alfa", clinicaEndereco: "Rua Alfa, 10",
    pacienteNome: "Cliente fictício", pacienteEndereco: "Rua Beta, 20",
    dataEmissao: "2026-11-09", tipoReceita: "simples",
    formulas: Array.from({ length: 7 }, (_, index) => ({
      nome: `Fórmula sintética ${index + 1}`, ativos: "Conteúdo fictício",
      posologia: "Somente para demonstração.",
    })),
  };
  it("mantém todas as fórmulas e a faixa atual em todas as páginas da prova", async () => {
    const bytes = await generateReceituarioPdfV2(base);
    const document = await PDFDocument.load(bytes);
    const paginas = texto(bytes).split("\f").filter(s => s.trim());
    expect(document.getPageCount()).toBeGreaterThan(1);
    expect(paginas).toHaveLength(document.getPageCount());
    for (const pagina of paginas) {
      expect(pagina).toContain("Clínica Alfa");
      expect(pagina).toContain("Cliente fictício");
      expect(pagina).toContain("GERADA SEM ASSINATURA DIGITAL");
      expect(pagina).toContain("SEM VALIDADE CLÍNICA");
      expect(pagina).not.toContain("Instituto Pádua");
    }
    for (let i = 1; i <= 7; i++) expect(paginas.join("\n")).toContain(`Fórmula sintética ${i}`);
  });
  it("não permite ativar a prova na emissão clínica nem em produção", async () => {
    await expect(generateReceituarioPdfV2({ ...base, homologacao: false })).rejects.toThrow(/prova Grand Finale/i);
    const anterior = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try { await expect(generateReceituarioPdfV2(base)).rejects.toThrow(/ambiente de teste/i); }
    finally { process.env.NODE_ENV = anterior; }
  });
  it("recusa assinatura e identidade visual de outra clínica na prova", async () => {
    await expect(generateReceituarioPdfV2({ ...base, clinicaNome: "Clínica Beta" }))
      .rejects.toThrow(/identidade da clínica/i);
    await expect(generateReceituarioPdfV2(base, {} as never)).rejects.toThrow(/não aceita assinatura/i);
  });
  it("mantém observações longas e recusa palavras que excedem a largura", async () => {
    const observacao = Array.from({ length: 25 }, (_, i) => `observação ${i + 1}`).join(" ");
    const pdf = await generateReceituarioPdfV2({
      ...base, formulas: [{ nome: "Fórmula", observacao }],
      farmaciaNome: "Farmácia fictícia que possui um nome longo, mas deve aparecer integralmente",
    });
    const result = texto(pdf).replace(/\s+/g, " ");
    expect(result).toContain("observação 25");
    expect(result).toContain("deve aparecer integralmente");
    await expect(generateReceituarioPdfV2({
      ...base, formulas: [{ nome: "Fórmula", ativos: "A".repeat(2000) }],
    })).rejects.toThrow(/não cabe na largura/i);
  });
  it("recusa identificação que não cabe em vez de cortá-la", async () => {
    await expect(generateReceituarioPdfV2({
      ...base, pacienteNome: "Nome fictício excepcionalmente comprido ".repeat(15),
    })).rejects.toThrow(/dados de identificação excedem/i);
  });
  it("preserva o conteúdo especial obrigatório sem usar a faixa antiga", async () => {
    const result = texto(await generateReceituarioPdfV2({ ...base, tipoReceita: "especial", formulas: [base.formulas[0]] }));
    expect(result).toContain("Receituário de controle especial");
    expect(result).toContain("Identificação do comprador");
    expect(result).toContain("Identificação da farmácia");
    expect(result).toContain("Fórmula sintética 1");
  });
  it("reserva espaço entre conteúdo, certificado, quadros e rodapé especial", () => {
    const alturaImagem = GRAND_FINALE.quadrosEspecialAltura * 210 / 190;
    const topoQuadros = GRAND_FINALE.quadrosEspecialBase + GRAND_FINALE.quadrosEspecialAltura;
    const fundoImagem = topoQuadros + alturaImagem * 3 / 210 - alturaImagem;
    expect(fundoImagem).toBeGreaterThan(GRAND_FINALE.rodapeEspecialTopo);
    expect(GRAND_FINALE.assinaturaEspecialBase).toBeGreaterThan(topoQuadros);
    expect(GRAND_FINALE.corpoEspecialBase).toBeGreaterThan(
      GRAND_FINALE.assinaturaEspecialBase + ASSINATURA_3A1C_ALTURA,
    );
  });
  it("ancora comprador e farmácia lado a lado abaixo da assinatura em receita longa", async () => {
    const bytes = await generateReceituarioPdfV2({ ...base, tipoReceita: "especial" });
    const paginas = extrair(bytes, "-bbox").match(/<page\b[\s\S]*?<\/page>/g) ?? [];
    expect(paginas.length).toBeGreaterThan(1);
    expect(paginas.slice(0, -1).every(p => !p.includes(">comprador</word>"))).toBe(true);
    const ultima = paginas[paginas.length - 1];
    function posicao(pagina: string, palavra: string) {
      const match = pagina.match(new RegExp(`<word xMin="([\\d.]+)" yMin="([\\d.]+)"[^>]*>${palavra}</word>`));
      if (!match) throw new Error(`Palavra ausente: ${palavra}`);
      return { x: Number(match[1]), y: Number(match[2]) };
    }
    const comprador = posicao(ultima, "comprador");
    const fornecedor = posicao(ultima, "farmácia");
    const assinatura = posicao(ultima, "GERADA");
    expect(comprador.x).toBeLessThan(fornecedor.x);
    expect(Math.abs(comprador.y - fornecedor.y)).toBeLessThan(1);
    expect(comprador.y).toBeGreaterThan(400);
    expect(assinatura.y).toBeLessThan(comprador.y);
    for (const pagina of paginas) expect(pagina).toContain(">GERADA</word>");
    const textoCompleto = texto(bytes);
    for (let i = 1; i <= 7; i++) expect(textoCompleto).toContain(`Fórmula sintética ${i}`);
  }, 15_000);
  it("mantém uma fórmula extensa e suas linhas fora dos quadros inferiores", async () => {
    const ativos = Array.from({ length: 42 }, (_, i) => `ATIVO${String(i + 1).padStart(3, "0")} texto de demonstração`).join("\n");
    const bytes = await generateReceituarioPdfV2({
      ...base, tipoReceita: "especial",
      formulas: [{ nome: "Fórmula longa", ativos, posologia: "Somente para demonstração." }],
      farmaciaNome: "Farmácia de demonstração",
    });
    const paginas = extrair(bytes, "-bbox").match(/<page\b[\s\S]*?<\/page>/g) ?? [];
    const ultima = paginas[paginas.length - 1];
    expect(ultima).toContain(">comprador</word>");
    expect(ultima).toContain(">farmácia</word>");
    const topoCertificado = GRAND_FINALE.altura - (GRAND_FINALE.assinaturaEspecialBase + ASSINATURA_3A1C_ALTURA);
    for (const item of ultima.matchAll(/<word\b[^>]*yMax="([\d.]+)"[^>]*>ATIVO\d{3}<\/word>/g)) {
      expect(Number(item[1])).toBeLessThan(topoCertificado);
    }
    const resultado = texto(bytes);
    for (let i = 1; i <= 42; i++) expect(resultado).toContain(`ATIVO${String(i).padStart(3, "0")}`);
  }, 15_000);
});
