import { PNG } from "pngjs";

/**
 * Tratamento visual do Modelo 2B: mantém integralmente a transparência da
 * imagem original e substitui apenas a cor por ouro. Não grava nem publica
 * arquivos; autorização e persistência pertencem à camada que o chamar.
 */
export function aplicarOuroAoSimbolo(original: Uint8Array): Buffer {
  const bytes = Buffer.from(original);
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (bytes.length < 33 || bytes.length > 2 * 1024 * 1024 ||
      !bytes.subarray(0, 8).equals(signature) || bytes.toString("ascii", 12, 16) !== "IHDR") {
    throw new Error("Envie uma imagem PNG transparente de até 2 megabytes.");
  }
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (!width || !height || width > 4096 || height > 4096 || width * height > 8_000_000) {
    throw new Error("As dimensões da imagem são inválidas ou excessivas.");
  }

  let image: PNG;
  try {
    image = PNG.sync.read(bytes, { checkCRC: true });
  } catch {
    throw new Error("Não foi possível ler a imagem PNG.");
  }

  let transparent = 0;
  let visible = 0;
  for (let i = 3; i < image.data.length; i += 4) {
    const alpha = image.data[i];
    if (alpha === 0) transparent++;
    if (alpha >= 128) visible++;
  }
  const pixels = width * height;
  if (transparent < pixels * 0.01 || visible < pixels * 0.005) {
    throw new Error("O símbolo precisa ter fundo transparente e conteúdo visível.");
  }

  // Faixas de luz e sombra da paleta amostrada do símbolo dourado do
  // cabeçalho fornecido (percentis dos pixels dourados). Isso é uma
  // aproximação cromática, não uma cópia do relevo da arte original.
  // Os valores de alfa nunca são alterados; a geometria não é reconstruída.
  const stops: Array<[number, number, number, number]> = [
    [0, 151, 96, 23],
    [0.18, 240, 190, 83],
    [0.34, 241, 214, 144],
    [0.52, 200, 131, 27],
    [0.72, 240, 190, 83],
    [1, 151, 96, 23],
  ];
  for (let y = 0; y < height; y++) {
    const position = height === 1 ? 0 : y / (height - 1);
    const upper = stops.findIndex((s) => s[0] >= position);
    const end = upper <= 0 ? 1 : upper;
    const from = stops[end - 1];
    const to = stops[end];
    const amount = (position - from[0]) / (to[0] - from[0]);
    const brush = ((y * 17) % 7) - 3;
    const color = [1, 2, 3].map((channel) =>
      Math.max(0, Math.min(255, Math.round(from[channel] + (to[channel] - from[channel]) * amount + brush))),
    );
    for (let x = 0; x < width; x++) {
      const index = (y * width + x) * 4;
      image.data[index] = color[0];
      image.data[index + 1] = color[1];
      image.data[index + 2] = color[2];
    }
  }
  return PNG.sync.write(image);
}
