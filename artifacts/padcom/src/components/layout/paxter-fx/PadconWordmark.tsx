import padconWordmarkUrl from "@/assets/padcon-wordmark.png";

type Props = {
  /** Altura em pixels da palavra PADCON. A largura ajusta proporcionalmente. */
  height?: number;
  className?: string;
  /** Contorno preto fino p/ dar NITIDEZ a arte sobre fundos claros (creme). */
  outlined?: boolean;
};

/** Contorno em 4 direcoes (offset solido, blur 0) = borda preta fina e nitida ao
 *  redor dos pixels opacos do PNG. Sutil (0,6px) para nao engrossar a arte. */
const CONTORNO_PRETO =
  "drop-shadow(0.6px 0 0 rgba(0,0,0,0.7)) drop-shadow(-0.6px 0 0 rgba(0,0,0,0.7)) drop-shadow(0 0.6px 0 rgba(0,0,0,0.7)) drop-shadow(0 -0.6px 0 rgba(0,0,0,0.7))";

/**
 * Marca PADCON: desenho OFICIAL (ouro) recortado da arte da empresa, com fundo
 * transparente. NAO e texto digitado — e a imagem real vetorizada/recortada.
 * Renderizada flutuante, sem placa.
 */
export function PadconWordmark({ height = 18, className, outlined }: Props) {
  return (
    <img
      src={padconWordmarkUrl}
      alt="PADCON"
      className={className}
      style={{
        height,
        width: "auto",
        display: "block",
        filter: outlined ? CONTORNO_PRETO : undefined,
      }}
      draggable={false}
    />
  );
}

export default PadconWordmark;
