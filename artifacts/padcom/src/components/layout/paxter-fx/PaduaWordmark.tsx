import paduaWordmarkUrl from "@/assets/padua-wordmark.png";
import paduaWordmark3dUrl from "@/assets/padua-wordmark-outlined.png";

type Props = {
  /** Altura em pixels da logo INSTITUTO PADUA. A largura ajusta proporcionalmente. */
  height?: number;
  className?: string;
  /** Usa a arte com RELEVO 3D (bevel + elevacao) embutido, p/ destacar sobre o creme. */
  outlined?: boolean;
};

/**
 * Logo INSTITUTO PADUA: desenho OFICIAL (ouro) recortado da arte da marca
 * (Logotipo 4), com fundo transparente. NAO e texto digitado — e a imagem real
 * da logo aprovada, renderizada flutuante, sem placa.
 *
 * RELEVO 3D (decisao do CEO 24/06/2026): a arte original do Padua e FINA e quase
 * chapada (diferente do PADCON, que ja vem 3D pesado). Para "saltar" como o PADCON,
 * o asset `padua-wordmark-outlined.png` recebe bevel + elevacao embutidos (gerado por
 * ImageMagick: shade do alfa em Overlay = luz no topo / sombra embaixo, mais um leve
 * drop-shadow suave p/ flutuar). Isso cria 3D e os "contornos escuros" naturais SO no
 * lado da sombra — sem borda uniforme tipo adesivo (rejeitada) e sem placa.
 * Tentativa anterior por contorno em CSS (`drop-shadow`) saia suja e foi descartada.
 */
export function PaduaWordmark({ height = 38, className, outlined }: Props) {
  return (
    <img
      src={outlined ? paduaWordmark3dUrl : paduaWordmarkUrl}
      alt="Instituto Padua"
      className={className}
      style={{
        height,
        width: "auto",
        display: "block",
        // Asset 3D ja vem com cor/contraste tratados; so um leve realce de saturacao p/
        // o ouro nao perder vida sobre o creme. Brilho alto ACHATARIA o relevo, entao nao.
        // A arte chapada (sem 3D) usa o realce antigo mais forte.
        filter: outlined
          ? "saturate(1.12)"
          : "saturate(1.55) brightness(1.18) contrast(1.08)",
      }}
      draggable={false}
    />
  );
}

export default PaduaWordmark;
