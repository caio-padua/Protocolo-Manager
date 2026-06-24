import paduaWordmarkUrl from "@/assets/padua-wordmark.png";

type Props = {
  /** Altura em pixels da logo INSTITUTO PADUA. A largura ajusta proporcionalmente. */
  height?: number;
  className?: string;
  /** Contorno preto fino p/ dar NITIDEZ a arte sobre fundos claros (creme). */
  outlined?: boolean;
};

/** Contorno em 8 direcoes (4 retas 1,0px + 4 diagonais 0,8px, offset solido blur 0,
 *  preto 0.95) = borda preta GROSSA e continua que DELIMITA o logo sobre o creme.
 *  Mais grossa que o PADCON de proposito: a arte do Padua tem traco mais fino e leva
 *  filtro de cor, entao precisa de borda maior p/ ficar igualmente recortada. */
const CONTORNO_PRETO =
  "drop-shadow(1px 0 0 rgba(0,0,0,0.95)) drop-shadow(-1px 0 0 rgba(0,0,0,0.95)) drop-shadow(0 1px 0 rgba(0,0,0,0.95)) drop-shadow(0 -1px 0 rgba(0,0,0,0.95)) drop-shadow(0.8px 0.8px 0 rgba(0,0,0,0.95)) drop-shadow(-0.8px 0.8px 0 rgba(0,0,0,0.95)) drop-shadow(0.8px -0.8px 0 rgba(0,0,0,0.95)) drop-shadow(-0.8px -0.8px 0 rgba(0,0,0,0.95))";

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
        // Ouro mais CHEIO (menos clareado) p/ ganhar contraste contra o creme e ficar
        // bem delimitado. Antes brightness 1.42 clareava demais e o logo "sumia"; baixei
        // p/ 1.18 e dei +contraste. Aproximacao por filtro; nao redesenha a arte.
        filter: `saturate(1.55) brightness(1.18) contrast(1.08)${outlined ? ` ${CONTORNO_PRETO}` : ""}`,
      }}
      draggable={false}
    />
  );
}

export default PaduaWordmark;
