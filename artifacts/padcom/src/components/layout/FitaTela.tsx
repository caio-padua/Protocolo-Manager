import "./fita-tela.css";

/**
 * Fita de terno de giz com o nome da tela, encostada no teto (modelo 11 aprovado pelo CEO).
 * O nome tem de ser IGUAL ao do item do menu lateral. A fita não ocupa linha própria: é uma régua de 20px
 * em alto-relevo (up bevel). O espaçamento lateral vem de quem a usa (variável CSS --fita-pad).
 */
export function FitaTela({ nome, className = "" }: { nome: string; className?: string }) {
  return (
    <div className={`fita-tela ${className}`} data-testid="fita-tela">
      <span className="fita-vidro" role="heading" aria-level={1} aria-label={nome}>
        {nome.toUpperCase().split(" ").map((palavra, i) => (
          <span key={i} className="p" aria-hidden>
            {[...palavra].map((letra, k) => <span key={k} className="l" data-l={letra}>{letra}</span>)}
          </span>
        ))}
      </span>
    </div>
  );
}
