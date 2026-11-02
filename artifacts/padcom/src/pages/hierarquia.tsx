import { useCallback, useEffect, useState } from "react";
import { Building2, Network, RefreshCw } from "lucide-react";
import { ConsoleShell } from "@/pages/comunicacao/_shared";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface EmpresaIndependente {
  id: number;
  nome: string;
  status: string;
  donoNome: string | null;
  driveFolderEmpresaId: string | null;
  locations: string[];
}

export default function VisaoEmpresasIndependentes() {
  const [empresas, setEmpresas] = useState<EmpresaIndependente[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro("");
    try {
      const resposta = await fetch(`${BASE}/api/empresas/hierarquia`);
      if (!resposta.ok) throw new Error("Não foi possível carregar a visão de empresas.");
      const dados = await resposta.json();
      setEmpresas(Array.isArray(dados.raizes) ? dados.raizes : []);
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : "Falha ao carregar os dados.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { void carregar(); }, [carregar]);

  return (
    <ConsoleShell
      icon={Network}
      title="Visão de empresas independentes"
      subtitle="Empresas clínicas em lista plana; as unidades permanecem vinculadas ao cadastro da própria empresa"
    >
      <section className="panel-3d space-y-4 p-4 sm:p-5">
        <div className="flex items-center gap-3">
          <div className="bevel-3d rounded-md px-4 py-2">
            <span className="block text-[9px] font-bold uppercase tracking-wider text-[#647c97]">Empresas clínicas</span>
            <span className="text-xl font-black tabular-nums text-[#16294a]">{empresas.length}</span>
          </div>
          <button
            type="button"
            onClick={() => void carregar()}
            disabled={carregando}
            className="btn-3d-soft ml-auto inline-flex items-center gap-2 px-3 py-2 text-[10px] font-bold uppercase tracking-wider"
          >
            <RefreshCw size={13} className={carregando ? "animate-spin" : ""} />
            Atualizar
          </button>
        </div>

        <div className="bevel-3d flex items-start gap-3 rounded-md px-4 py-3 text-xs leading-relaxed text-[#334763]">
          <Building2 size={16} className="mt-0.5 shrink-0 text-[#c2a05a]" />
          Cada cadastro empresarial é independente. Esta tela não cria relações de empresa-mãe, filial,
          licenciamento ou repasse. Os locais listados são unidades clínicas do próprio cadastro.
        </div>

        {erro && <p role="alert" className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-800">{erro}</p>}
        {carregando ? (
          <div className="concave-3d rounded-md px-4 py-10 text-center text-sm text-[#647c97]">Carregando…</div>
        ) : empresas.length === 0 ? (
          <div className="concave-3d rounded-md px-4 py-10 text-center text-sm text-[#647c97]">
            Nenhuma empresa clínica disponível.
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {empresas.map((empresa) => (
              <article key={empresa.id} className="panel-3d space-y-3 p-4">
                <header className="flex items-start gap-3">
                  <span className="bevel-3d rounded p-2 text-[#c2a05a]"><Building2 size={16} /></span>
                  <div className="min-w-0">
                    <h2 className="text-xs font-black uppercase tracking-wide text-[#16294a]">{empresa.nome}</h2>
                    <p className="mt-1 text-[10px] text-[#647c97]">
                      {empresa.donoNome || "Responsável não informado"} · {empresa.status}
                    </p>
                  </div>
                  <span className="ml-auto shrink-0 rounded border border-emerald-300 bg-emerald-50 px-2 py-1 text-[8px] font-black uppercase tracking-wider text-emerald-800">
                    Independente
                  </span>
                </header>
                <div className="concave-3d rounded-md p-3">
                  <p className="mb-2 text-[9px] font-bold uppercase tracking-wider text-[#647c97]">
                    Unidades clínicas ({empresa.locations?.length ?? 0})
                  </p>
                  {empresa.locations?.length ? (
                    <ul className="space-y-1 text-[11px] text-[#334763]">
                      {empresa.locations.map((nome, index) => <li key={`${empresa.id}-${index}`}>• {nome}</li>)}
                    </ul>
                  ) : (
                    <p className="text-[10px] text-[#647c97]">Nenhuma unidade ativa vinculada.</p>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </ConsoleShell>
  );
}
