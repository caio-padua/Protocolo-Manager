import "./fita-tela.css";

/**
 * Faixa de topo da tela (modelo 11 aprovado): fundo no mesmo tom do menu lateral, formando um "L" invertido com ele,
 * e um painel pequeno com o nome da tela que parece flutuar sobre a área de trabalho.
 * O nome tem de ser IGUAL ao do item do menu lateral. O espaçamento lateral vem de quem a usa (--fita-pad).
 */
export function FitaTela({ nome, className = "" }: { nome: string; className?: string }) {
  return (
    <div className={`fita-tela ${className}`} data-testid="fita-tela">
      <div className="fita-painel">
        <h1 className="fita-titulo">{nome}</h1>
      </div>
    </div>
  );
}
