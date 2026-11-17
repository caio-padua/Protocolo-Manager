import jpeg from "jpeg-js";

/**
 * Fotos de evolucao corporal — FONTE UNICA de angulos e orientacoes (Area do Cliente e Cockpit leem daqui,
 * via API). Instrucoes baseadas em guias de fotos de progresso e em padrao de fotografia clinica
 * (ver specs/fotos-evolucao-corporal.md).
 */
export const ANGULOS = ["frente", "costas", "perfil_esquerdo", "perfil_direito"] as const;
export type Angulo = (typeof ANGULOS)[number];

export const ehAngulo = (v: unknown): v is Angulo => typeof v === "string" && (ANGULOS as readonly string[]).includes(v);

export const ANGULOS_INFO: Record<Angulo, { rotulo: string; como: string }> = {
  frente: {
    rotulo: "Frente",
    como: "De frente para a câmera, pés na largura dos ombros, braços soltos ao lado do corpo com as palmas voltadas para as coxas. Olhe para a frente. Não encolha a barriga nem estufe o peito: fique do jeito natural.",
  },
  costas: {
    rotulo: "Costas",
    como: "De costas para a câmera, mesma postura da foto de frente: pés na largura dos ombros e braços soltos ao lado do corpo. Cabelo preso para aparecer o pescoço e os ombros.",
  },
  perfil_esquerdo: {
    rotulo: "Perfil esquerdo",
    como: "Vire o corpo inteiro (não só a cabeça) de modo que o seu lado ESQUERDO fique voltado para a câmera. Braços soltos ao lado do corpo, olhando para a frente, sem encolher a barriga.",
  },
  perfil_direito: {
    rotulo: "Perfil direito",
    como: "Vire o corpo inteiro (não só a cabeça) de modo que o seu lado DIREITO fique voltado para a câmera. Braços soltos ao lado do corpo, olhando para a frente, sem encolher a barriga.",
  },
};

export const ORIENTACOES_GERAIS: { titulo: string; itens: string[] }[] = [
  {
    titulo: "Antes de começar",
    itens: [
      "Escolha um canto da casa com parede lisa e de cor clara, sem móveis ou objetos atrás de você. Use SEMPRE o mesmo lugar.",
      "Fique de frente para a luz (janela ou lâmpada à sua frente). Evite luz forte vindo de cima ou de trás, porque cria sombras que mudam o formato do corpo na foto.",
      "Tire as fotos de manhã, depois de ir ao banheiro e antes de comer ou beber. O corpo muda de forma ao longo do dia.",
      "Use sempre a mesma roupa: roupa de baixo ou de ginástica justa, que deixe a pele à mostra. Cabelo preso e sem joias, relógio ou maquiagem pesada.",
    ],
  },
  {
    titulo: "Posição do celular",
    itens: [
      "Apoie o celular em pé (na vertical), com a câmera traseira, na altura do umbigo, bem reto, sem inclinar para cima ou para baixo.",
      "Fique a cerca de 2 a 2,5 metros da câmera. O corpo deve aparecer inteiro, da cabeça aos pés, sem cortar.",
      "Marque o chão com uma fita no lugar dos seus pés e no lugar do celular. Nas próximas vezes, repita exatamente o mesmo.",
      "Use o temporizador de 10 segundos ou peça a uma pessoa para fotografar. Não use foto tirada no espelho nem câmera frontal (selfie).",
    ],
  },
  {
    titulo: "Quando enviar",
    itens: [
      "Envie as 4 fotos (frente, costas, perfil esquerdo e perfil direito) de uma vez, no mesmo dia e nas mesmas condições.",
      "Repita a cada 2 a 4 semanas, ou na frequência que a equipe indicar. Cada envio fica guardado na sua data, e a equipe compara a evolução entre as datas.",
      "A data de cada série é a do dia em que as fotos foram tiradas. Se tirou em outro dia, escolha a data correta antes de enviar.",
    ],
  },
];

export const MAX_BYTES_FOTO = 10 * 1024 * 1024;
const MAX_MEGAPIXELS = 12;
const MAX_LADO = 8_000;

export class FotoCorpoError extends Error {}

export interface FotoPronta { buffer: Buffer; width: number; height: number }

/**
 * Decodifica o JPEG por inteiro com decoder de JavaScript puro (um decoder nativo ja derrubou o Node 24
 * neste projeto) e regrava do zero: EXIF, GPS, miniatura e identificacao do aparelho nao sobrevivem.
 * O tipo e conferido pelos bytes, nao pelo que o navegador declarou.
 */
export function prepararFotoCorpo(buffer: Buffer): FotoPronta {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8 || buffer[2] !== 0xff) {
    throw new FotoCorpoError("Envie a foto em formato JPEG.");
  }
  let img: { data: Uint8Array; width: number; height: number };
  try {
    img = jpeg.decode(buffer, { useTArray: true, formatAsRGBA: true, maxResolutionInMP: MAX_MEGAPIXELS, maxMemoryUsageInMB: 256 }) as typeof img;
  } catch {
    throw new FotoCorpoError("Não foi possível ler a foto. Ela pode estar incompleta ou muito grande. Tire outra e envie de novo.");
  }
  if (img.width < 200 || img.height < 200 || img.width > MAX_LADO || img.height > MAX_LADO) {
    throw new FotoCorpoError("A foto é pequena demais ou grande demais. Envie uma foto tirada pelo celular.");
  }
  const saida = jpeg.encode({ data: img.data, width: img.width, height: img.height }, 88);
  return { buffer: Buffer.from(saida.data), width: img.width, height: img.height };
}
