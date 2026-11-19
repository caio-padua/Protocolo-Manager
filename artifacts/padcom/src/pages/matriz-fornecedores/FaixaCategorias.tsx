export type OpcaoCategoria = { chave: string; titulo: string; n: number };

/**
 * Faixa de categorias: caixas Saliente (bevel-3d) em linha; clicar numa lista só aquela categoria,
 * clicar de novo (ou em "Todas") volta a todas. Fica entre as ferramentas e a planilha.
 */
export function FaixaCategorias({ opcoes, valor, onChange }: { opcoes: OpcaoCategoria[]; valor: string | null; onChange: (v: string | null) => void }) {
  return (
    <div className="mx-fc panel-3d-sub" role="group" aria-label="Filtrar por categoria" data-testid="faixa-categorias">
      <span className="mx-fc-t bevel-3d">Categorias</span>
      <div className="mx-fc-l">
        <button type="button" className="mx-fc-b bevel-3d" data-sel={valor === null ? 1 : 0} aria-pressed={valor === null} onClick={() => onChange(null)}>Todas</button>
        {opcoes.map((o) => (
          <button key={o.chave} type="button" className="mx-fc-b bevel-3d" data-sel={valor === o.chave ? 1 : 0} aria-pressed={valor === o.chave}
            onClick={() => onChange(valor === o.chave ? null : o.chave)} title={`${o.n} apresentações`}>{o.titulo}</button>
        ))}
      </div>
    </div>
  );
}
