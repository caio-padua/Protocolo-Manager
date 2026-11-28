import CadastroExames from "@/pages/cadastros/exames";
import { usePermissoes } from "@/lib/permissoes";

// CADASTRO DE EXAMES — tela unica (catalogo, blocos e opcoes). As rotas legadas
// /cadastros/exames e /cadastros/console-exames continuam no codigo, mas fora do menu.

export default function CadastroExamesUnificado() {
  const { loading, me, matriz, isCeo, pode } = usePermissoes();

  if (loading) {
    return <div className="panel-3d p-4" role="status">Conferindo permissões de acesso...</div>;
  }
  if (!me || (!isCeo && !matriz) || !pode("exames_faixas")) {
    return <div className="panel-3d p-4" role="alert">Não foi possível autorizar o acesso ao cadastro de exames.</div>;
  }

  // Tela única: um só cabeçalho (dentro de CadastroExames), manual em PDF e as 3 abas.
  return (
    <div className="mx-auto max-w-[1400px]">
      <CadastroExames />
    </div>
  );
}
