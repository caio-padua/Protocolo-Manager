import paduaWordmarkUrl from "@/assets/padua-wordmark.png";

type Props = {
  /** Altura em pixels da logo INSTITUTO PADUA. A largura ajusta proporcionalmente. */
  height?: number;
  className?: string;
};

/**
 * Logo INSTITUTO PADUA: desenho OFICIAL (ouro) recortado da arte da marca
 * (Logotipo 4), com fundo transparente. NAO e texto digitado — e a imagem real
 * da logo aprovada, renderizada flutuante, sem placa.
 */
export function PaduaWordmark({ height = 38, className }: Props) {
  return (
    <img
      src={paduaWordmarkUrl}
      alt="Instituto Padua"
      className={className}
      style={{ height, width: "auto", display: "block" }}
      draggable={false}
    />
  );
}

export default PaduaWordmark;
