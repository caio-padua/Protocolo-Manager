import "./AbaTitulo.css";

/** Aba de fichario no teto da area de trabalho: mostra o nome do menu ativo. */
export function AbaTitulo({ titulo }: { titulo: string | null }) {
  if (!titulo) return null;
  return (
    <div className="aba-teto">
      <div className="aba-teto-faixa" aria-hidden />
      <div className="aba-teto-aba" role="heading" aria-level={1}>
        <span>{titulo}</span>
      </div>
    </div>
  );
}
