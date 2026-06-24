import paduaWordmarkUrl from "@/assets/padua-wordmark.png";

type Props = {
  /** Altura em pixels da logo INSTITUTO PADUA. A largura ajusta proporcionalmente. */
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
