import paduaWordmarkUrl from "@/assets/padua-wordmark.png";

type Props = {
  /** Altura em pixels da logo INSTITUTO PADUA. A largura ajusta proporcionalmente. */
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
 * Logo INSTITUTO PADUA: desenho OFICIAL (ouro) recortado da arte da marca
 * (Logotipo 4), com fundo transparente. NAO e texto digitado — e a imagem real
 * da logo aprovada, renderizada flutuante, sem placa.
 */
export function PaduaWordmark({ height = 38, className, outlined }: Props) {
  return (
    <img
      src={paduaWordmarkUrl}
      alt="Instituto Padua"
      className={className}
      style={{
        height,
        width: "auto",
        display: "block",
        // Harmoniza o ouro FOSCO da arte oficial com o ouro VIVO do PADCON (decisao
        // de cor pendente do CEO: A/B/C). Aproximacao por filtro; nao redesenha a arte.
        filter: `saturate(1.5) brightness(1.42) contrast(1.0)${outlined ? ` ${CONTORNO_PRETO}` : ""}`,
      }}
      draggable={false}
    />
  );
}

export default PaduaWordmark;
