import "./AbaTitulo.css";

/** Aba de fichario no teto da area de trabalho: nome do menu ativo (1a linha) e resumo curto (2a linha). */
export function AbaTitulo({ titulo, resumo }: { titulo: string | null; resumo?: string | null }) {
  if (!titulo) return null;
  return (
    <div className="aba-teto">
      <div className="aba-teto-faixa" aria-hidden />
      <div className="aba-teto-aba" role="heading" aria-level={1}>
        <span className="aba-t">{titulo}</span>
        {resumo ? <span className="aba-s">{resumo}</span> : null}
      </div>
    </div>
  );
}
