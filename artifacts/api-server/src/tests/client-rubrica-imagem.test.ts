import { describe, expect, it } from "vitest";
import { deflateSync, crc32 } from "node:zlib";
import { PNG } from "pngjs";
import { PAPEL, rabisco, comoJpeg, comoPng } from "./helpers/rubrica-sintetica";
import { RUBRICA_MAX_BYTES, RubricaImagemError, prepararRubrica } from "../lib/client-rubrica-imagem";

// Rubrica do cliente em imagem — preparo do arquivo (funções puras). Dados 100% sintéticos (Código Paxter, Art. 82):
// as "rubricas" são curvas desenhadas aqui, não imagens de clientes.

/** Capítulos (chunks) de um PNG, na ordem em que aparecem. */
function chunksDoPng(png: Buffer): string[] {
  const tipos: string[] = [];
  let pos = 8;
  while (pos < png.length) {
    const tamanho = png.readUInt32BE(pos);
    tipos.push(png.toString("latin1", pos + 4, pos + 8));
    pos += 12 + tamanho;
  }
  return tipos;
}

function erroDe(buffer: Buffer): RubricaImagemError {
  try {
    prepararRubrica(buffer);
  } catch (error) {
    expect(error).toBeInstanceOf(RubricaImagemError);
    return error as RubricaImagemError;
  }
  throw new Error("era esperado recusar o arquivo");
}

/** PNG mínimo, válido só no cabeçalho, que ANUNCIA as dimensões dadas (sem pixels de verdade). */
function pngQueAnuncia(largura: number, altura: number): Buffer {
  const cab = Buffer.alloc(8 + 4 + 4 + 13 + 4);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(cab, 0);
  cab.writeUInt32BE(13, 8);
  cab.write("IHDR", 12, "latin1");
  cab.writeUInt32BE(largura, 16);
  cab.writeUInt32BE(altura, 20);
  cab[24] = 8; cab[25] = 6; // 8 bits, RGBA
  return cab;
}

/** PNG ENTRELAÇADO (interlace=1) pequeno no cabeçalho, cujos dados descomprimem para `expansaoBytes` de zeros. */
function pngEntrelacadoComExpansao(expansaoBytes: number): Buffer {
  const capitulo = (tipo: string, dados: Buffer) => {
    const corpo = Buffer.concat([Buffer.from(tipo, "latin1"), dados]);
    const tam = Buffer.alloc(4); tam.writeUInt32BE(dados.length);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(corpo));
    return Buffer.concat([tam, corpo, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(100, 0); ihdr.writeUInt32BE(100, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[12] = 1; // 8 bits, RGBA, entrelaçado
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    capitulo("IHDR", ihdr), capitulo("IDAT", deflateSync(Buffer.alloc(expansaoBytes))), capitulo("IEND", Buffer.alloc(0)),
  ]);
}

describe("Rubrica do cliente em imagem — preparo do arquivo", () => {
  it("T-RUB-0: PNG e JPEG de rubrica viram um PNG só de tinta, recortado e com hash estável", () => {
    const original = rabisco(600, 300);
    const doPng = prepararRubrica(comoPng(original));
    const doJpeg = prepararRubrica(comoJpeg(original));
    expect(doPng.origemMime).toBe("image/png");
    expect(doJpeg.origemMime).toBe("image/jpeg");
    for (const r of [doPng, doJpeg]) {
      expect(r.png.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(true);
      expect(r.largura).toBeLessThan(600); // cortado rente ao traço (as margens de 20% saíram)
      expect(r.altura).toBeLessThan(300);
      expect(r.sha256).toMatch(/^[0-9a-f]{64}$/);
      const lido = PNG.sync.read(r.png);
      expect(lido.width).toBe(r.largura);
      expect(lido.height).toBe(r.altura);
    }
    // determinístico: o mesmo arquivo dá sempre o mesmo resultado; arquivos diferentes, hashes diferentes
    expect(prepararRubrica(comoPng(original)).sha256).toBe(doPng.sha256);
    expect(prepararRubrica(comoPng(rabisco(600, 300, { grossura: 5 }))).sha256).not.toBe(doPng.sha256);
  });

  it("T-RUB-1: o tipo vem dos BYTES; nome, extensão e tipo declarado não valem (F59)", () => {
    expect(erroDe(Buffer.from("isto é um texto qualquer, não uma imagem")).message).toMatch(/inválido/i);
    expect(erroDe(Buffer.from("GIF89a\x01\x00\x01\x00\x80\x00\x00", "latin1")).message).toMatch(/PNG ou JPEG/);
    expect(erroDe(Buffer.from("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n")).message).toMatch(/PNG ou JPEG/);
    expect(erroDe(Buffer.alloc(0)).message).toMatch(/vazio/i);
  });

  it("T-RUB-2: arquivo truncado ou corrompido é recusado com erro claro, sem derrubar nada (F60)", () => {
    const original = rabisco(500, 250);
    const jpg = comoJpeg(original);
    const png = comoPng(original);
    expect(erroDe(jpg.subarray(0, Math.floor(jpg.length / 2))).message).toMatch(/válida e completa|PNG ou JPEG/);
    // PNG cortado em qualquer ponto NÃO pode virar rubrica pela metade (o decoder sozinho aceitaria)
    for (const fracao of [0.3, 0.5, 0.7, 0.9, 0.99]) {
      expect(erroDe(png.subarray(0, Math.floor(png.length * fracao))).message, `PNG a ${fracao}`).toMatch(/válida e completa|PNG ou JPEG/);
    }
    expect(erroDe(png.subarray(0, png.length - 12)).message).toMatch(/válida e completa/); // sem o capítulo final
    for (const fracao of [0.5, 0.9, 0.99]) {
      expect(erroDe(jpg.subarray(0, Math.floor(jpg.length * fracao))).message, `JPEG a ${fracao}`).toMatch(/válida e completa/);
    }
    // assinatura de PNG seguida de lixo
    const lixo = Buffer.concat([png.subarray(0, 8), Buffer.from("lixo lixo lixo lixo lixo lixo lixo lixo")]);
    expect(erroDe(lixo).message).toMatch(/válida e completa|PNG ou JPEG/);
  });

  it("T-RUB-3: arquivo e imagem grandes demais são recusados ANTES de alocar pixels (F61)", () => {
    const grande = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(RUBRICA_MAX_BYTES)]);
    expect(erroDe(grande).message).toMatch(/2 MB/);
    // cabeçalho que anuncia 20000 x 20000 (400 megapixels): recusado só pelo cabeçalho
    expect(erroDe(pngQueAnuncia(20_000, 20_000)).message).toMatch(/grande demais/);
    // 4000 x 4000 = 16 megapixels (acima de 12)
    expect(erroDe(pngQueAnuncia(4_000, 4_000)).message).toMatch(/grande demais/);
  });

  it("T-RUB-3b: PNG entrelaçado é recusado ANTES de descomprimir — o arquivo pequeno não vira centenas de MB (F74)", () => {
    const bomba = pngEntrelacadoComExpansao(200 * 1024 * 1024); // ~200 MB de zeros comprimem para poucos KB
    expect(bomba.length).toBeLessThan(RUBRICA_MAX_BYTES);
    const inicio = Date.now();
    expect(erroDe(bomba).message).toMatch(/entrelaçado/);
    expect(Date.now() - inicio).toBeLessThan(1500); // recusado pelo cabeçalho: nada foi descomprimido
  });

  it("T-RUB-4: EXIF, GPS e metadados do arquivo original não sobrevivem (F62)", () => {
    const jpg = comoJpeg(rabisco(500, 250));
    const marcador = "GPS-SINTETICO-LAT-LON-NAO-VAZAR";
    const exif = Buffer.concat([Buffer.from("Exif\0\0", "latin1"), Buffer.from(marcador, "latin1")]);
    const app1 = Buffer.alloc(4);
    app1[0] = 0xff; app1[1] = 0xe1; app1.writeUInt16BE(exif.length + 2, 2);
    const comExif = Buffer.concat([jpg.subarray(0, 2), app1, exif, jpg.subarray(2)]);
    expect(comExif.includes(Buffer.from(marcador))).toBe(true); // o arquivo de entrada TEM o marcador
    const pronta = prepararRubrica(comExif);
    expect(pronta.png.includes(Buffer.from(marcador))).toBe(false);
    expect(pronta.png.includes(Buffer.from("Exif"))).toBe(false);
    // só os capítulos mínimos de imagem
    const tipos = chunksDoPng(pronta.png);
    expect(tipos[0]).toBe("IHDR");
    expect(tipos.at(-1)).toBe("IEND");
    expect(tipos.every((t) => ["IHDR", "IDAT", "IEND"].includes(t))).toBe(true);
  });

  it("T-RUB-5: fundo transparente e tinta preta; o branco do papel não cobre a linha zebrada (F68)", () => {
    const pronta = prepararRubrica(comoJpeg(rabisco(600, 300)));
    const lido = PNG.sync.read(pronta.png);
    const alfa = (x: number, y: number) => lido.data[(y * lido.width + x) * 4 + 3]!;
    let opacos = 0;
    let transparentes = 0;
    for (let y = 0; y < lido.height; y++) {
      for (let x = 0; x < lido.width; x++) {
        const o = (y * lido.width + x) * 4;
        expect([lido.data[o], lido.data[o + 1], lido.data[o + 2]]).toEqual([0, 0, 0]); // só preto
        if (alfa(x, y) > 200) opacos++;
        if (alfa(x, y) === 0) transparentes++;
      }
    }
    expect(opacos).toBeGreaterThan(100); // há traço de verdade
    expect(transparentes).toBeGreaterThan(lido.width * lido.height * 0.4); // e a maior parte é fundo transparente
    for (const [x, y] of [[0, 0], [lido.width - 1, 0], [0, lido.height - 1], [lido.width - 1, lido.height - 1]]) {
      expect(alfa(x!, y!)).toBe(0); // cantos são papel
    }
  });

  it("T-RUB-5b: papel cinza de foto e caneta clara ainda produzem rubrica; imagem grande é reduzida", () => {
    const cinza = prepararRubrica(comoPng(rabisco(800, 400, { fundo: { r: 232, g: 230, b: 226 }, tinta: { r: 90, g: 90, b: 140 } })));
    expect(cinza.largura).toBeGreaterThan(100);
    const enorme = prepararRubrica(comoPng(rabisco(3000, 2000, { grossura: 12, margem: 0.05 })));
    expect(enorme.largura).toBeLessThanOrEqual(900);
    expect(enorme.altura).toBeLessThanOrEqual(600);
    expect(enorme.png.length).toBeLessThan(RUBRICA_MAX_BYTES);
  });

  it("T-RUB-6: sem traço, fundo escuro e resolução baixa são recusados com motivo claro (F70)", () => {
    const branco = comoPng(rabisco(600, 300, { tinta: PAPEL })); // rabisco da mesma cor do papel = página em branco
    expect(erroDe(branco).message).toMatch(/traço da rubrica/);
    const escuro = comoPng(rabisco(600, 300, { fundo: { r: 15, g: 15, b: 15 }, tinta: { r: 0, g: 0, b: 0 } }));
    expect(erroDe(escuro).message).toMatch(/fundo escuro|traço/);
    const todoPreto = comoPng(rabisco(400, 300, { fundo: { r: 0, g: 0, b: 0 } }));
    expect(erroDe(todoPreto).message).toMatch(/fundo escuro|foto/);
    const minuscula = comoPng(rabisco(36, 20, { grossura: 1, margem: 0.05 }));
    expect(erroDe(minuscula).message).toMatch(/Resolução baixa|traço/);
  });
});
