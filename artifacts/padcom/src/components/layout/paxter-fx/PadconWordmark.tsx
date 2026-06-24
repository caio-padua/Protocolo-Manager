import padconWordmarkUrl from "@/assets/padcon-wordmark.png";

type Props = {
  /** Altura em pixels da palavra PADCON. A largura ajusta proporcionalmente. */
  height?: number;
  className?: string;
};

/**
 * Marca PADCON: desenho OFICIAL (ouro) recortado da arte da empresa, com fundo
 * transparente. NAO e texto digitado — e a imagem real vetorizada/recortada.
 * Renderizada flutuante, sem placa.
 */
export function PadconWordmark({ height = 18, className }: Props) {
  return (
    <img
      src={padconWordmarkUrl}
      alt="PADCON"
      className={className}
      style={{ height, width: "auto", display: "block" }}
      draggable={false}
    />
  );
}
