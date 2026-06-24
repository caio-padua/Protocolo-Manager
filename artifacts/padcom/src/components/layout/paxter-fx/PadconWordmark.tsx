import padconWordmarkUrl from "@/assets/padcon-wordmark.png";

type Props = {
  /** Altura em pixels da palavra PADCON. A largura ajusta proporcionalmente. */
  height?: number;
  className?: string;
  /** Contorno preto fino p/ dar NITIDEZ a arte sobre fundos claros (creme). */
  outlined?: boolean;
};

/** Contorno em 8 direcoes (4 retas 0,7px + 4 diagonais 0,5px, offset solido blur 0,
 *  preto 0.92) = borda preta NITIDA e continua ao redor dos pixels opacos do PNG.
 *  8 direcoes fecham os "vaos" das diagonais que 4 direcoes deixavam (ouro sobre creme). */
const CONTORNO_PRETO =
  "drop-shadow(0.7px 0 0 rgba(0,0,0,0.92)) drop-shadow(-0.7px 0 0 rgba(0,0,0,0.92)) drop-shadow(0 0.7px 0 rgba(0,0,0,0.92)) drop-shadow(0 -0.7px 0 rgba(0,0,0,0.92)) drop-shadow(0.5px 0.5px 0 rgba(0,0,0,0.92)) drop-shadow(-0.5px 0.5px 0 rgba(0,0,0,0.92)) drop-shadow(0.5px -0.5px 0 rgba(0,0,0,0.92)) drop-shadow(-0.5px -0.5px 0 rgba(0,0,0,0.92))";

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
