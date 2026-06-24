import paduaWordmarkUrl from "@/assets/padua-wordmark.png";
import paduaWordmarkOutlinedUrl from "@/assets/padua-wordmark-outlined.png";

type Props = {
  /** Altura em pixels da logo INSTITUTO PADUA. A largura ajusta proporcionalmente. */
  height?: number;
  className?: string;
  /** Usa a arte com BORDA PRETA UNIFORME embutida (delimita o logo sobre o creme). */
  outlined?: boolean;
};

/**
 * Logo INSTITUTO PADUA: desenho OFICIAL (ouro) recortado da arte da marca
 * (Logotipo 4), com fundo transparente. NAO e texto digitado — e a imagem real
 * da logo aprovada, renderizada flutuante, sem placa.
 *
 * DELIMITACAO (decisao do CEO 24/06/2026 — opcao A): a borda preta vem EMBUTIDA
 * na imagem (`padua-wordmark-outlined.png`, contorno uniforme gerado por dilatacao
 * do alfa), NAO por `drop-shadow` em CSS — sombra empilhada saia irregular/suja.
 * A borda embutida abraca cada letra por igual e mantem o "INSTITUTO" legivel.
 */
export function PaduaWordmark({ height = 38, className, outlined }: Props) {
  return (
    <img
      src={outlined ? paduaWordmarkOutlinedUrl : paduaWordmarkUrl}
      alt="Instituto Padua"
      className={className}
      style={{
        height,
        width: "auto",
        display: "block",
        // Ouro mais CHEIO (menos clareado) p/ ganhar contraste contra o creme. O filtro
        // nao afeta a borda preta embutida (preto * brilho = preto). Aproximacao por
        // filtro; nao redesenha a arte.
        filter: "saturate(1.55) brightness(1.18) contrast(1.08)",
      }}
      draggable={false}
    />
  );
}

export default PaduaWordmark;
