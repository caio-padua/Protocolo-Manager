import { useState, type ReactNode } from "react";
import { ChevronDown, FolderTree, Compass, Info } from "lucide-react";
import CadastroExames from "@/pages/cadastros/exames";
import { usePermissoes } from "@/lib/permissoes";

// CADASTRO DE EXAMES — entrada unica que REUNE (sem duplicar) as duas telas reais:
//   1. Catalogo de exames, blocos e categorias  (pages/cadastros/exames)
//   2. Curadoria das 5 faixas (bloqueada ate existir autorizacao no servidor).
// As rotas /cadastros/exames e /cadastros/console-exames continuam intactas.

function Secao({
  id,
  icon: Icon,
  titulo,
  subtitulo,
  aberta,
  inicializada,
  onToggle,
  children,
}: {
  id: string;
  icon: typeof Compass;
  titulo: string;
  subtitulo: string;
  aberta: boolean;
  inicializada: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section className="panel-3d-sub overflow-hidden" data-testid={`secao-${id}`}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={aberta}
        data-testid={`toggle-${id}`}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-primary/5 transition-colors"
      >
        <div className="bevel-3d flex h-9 w-9 shrink-0 items-center justify-center text-primary">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-black uppercase tracking-widest">{titulo}</div>
          <div className="truncate text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{subtitulo}</div>
        </div>
        <span className="text-[10px] font-black uppercase tracking-wide text-muted-foreground">
          {aberta ? "Recolher" : "Expandir"}
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${aberta ? "rotate-180" : ""}`} />
      </button>
      {inicializada && <div hidden={!aberta} className="border-t border-border/60 p-3 md:p-4">{children}</div>}
    </section>
  );
}

export default function CadastroExamesUnificado() {
  const { loading, me, matriz, isCeo, pode } = usePermissoes();
  const [catalogoAberto, setCatalogoAberto] = useState(true);
  const [faixasAberto, setFaixasAberto] = useState(false);
  const [faixasInicializadas, setFaixasInicializadas] = useState(false);
  const ambas = catalogoAberto && faixasAberto;

  if (loading) {
    return <div className="panel-3d p-4" role="status">Conferindo permissões de acesso...</div>;
  }
  if (!me || (!isCeo && !matriz) || !pode("exames_faixas")) {
    return <div className="panel-3d p-4" role="alert">Não foi possível autorizar o acesso ao cadastro de exames.</div>;
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <div className="panel-3d flex flex-col gap-3 border-l-4 border-primary/60 p-4 sm:flex-row sm:items-center">
        <div className="bevel-3d flex h-12 w-12 shrink-0 items-center justify-center text-primary">
          <FolderTree className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-black uppercase tracking-tight md:text-3xl">Cadastro de Exames</h1>
          <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Catálogo, blocos, categorias e curadoria das cinco faixas em uma só tela.
          </p>
        </div>
        <button
          type="button"
          data-testid="button-toggle-todas"
          onClick={() => {
            setCatalogoAberto(!ambas);
            setFaixasAberto(!ambas);
            if (!ambas) setFaixasInicializadas(true);
          }}
          className="btn-3d-soft rounded-[6px] px-3 py-2 text-[10px] font-black uppercase tracking-wide"
        >
          {ambas ? "Recolher tudo" : "Expandir tudo"}
        </button>
      </div>

      <div className="concave-3d flex items-start gap-2.5 px-3 py-2.5 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <span>
          A importação dos documentos de fichas e do compêndio ainda não foi feita. A segurança da curadoria
          existente ainda precisa ser corrigida e o conjunto ainda não foi homologado. Não use esta tela como
          referência para decisões clínicas até sua conclusão.
        </span>
      </div>

      <Secao
        id="catalogo"
        icon={FolderTree}
        titulo="Catálogo de exames"
        subtitulo="Exames, blocos e categorias"
        aberta={catalogoAberto}
        inicializada
        onToggle={() => setCatalogoAberto((v) => !v)}
      >
        <CadastroExames />
      </Secao>

      <Secao
        id="faixas"
        icon={Compass}
        titulo="Curadoria das cinco faixas"
        subtitulo="Apelidos, unidades, direção e faixas"
        aberta={faixasAberto}
        inicializada={faixasInicializadas}
        onToggle={() => {
          setFaixasInicializadas(true);
          setFaixasAberto((v) => !v);
        }}
      >
        <div className="concave-3d p-4 text-sm" role="status">
          A edição das faixas nesta nova tela está bloqueada enquanto a proteção de acesso e a
          importação dos documentos são concluídas.
        </div>
      </Secao>
    </div>
  );
}
