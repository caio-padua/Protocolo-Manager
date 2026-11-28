import { Component, type ErrorInfo, type ReactNode } from "react";

export class ErroFerramenta extends Component<{ nome: string; children: ReactNode }, { falhou: boolean }> {
  state = { falhou: false };
  static getDerivedStateFromError() { return { falhou: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Falha ao abrir ferramenta do Cockpit:", this.props.nome, error, info.componentStack);
  }
  render() {
    if (this.state.falhou) return (
      <div role="alert" className="panel-3d-sub p-4 text-sm">
        Não foi possível abrir {this.props.nome}. As demais ferramentas continuam disponíveis.
        <button type="button" className="btn-3d-soft ml-2 px-3 py-2" onClick={() => this.setState({ falhou: false })}>
          Tentar novamente
        </button>
      </div>
    );
    return this.props.children;
  }
}
