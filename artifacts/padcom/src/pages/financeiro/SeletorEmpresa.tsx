import { useEffect, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2 } from "lucide-react";
import { finApi, getFinCompany, setFinCompany, type FinEmpresaSeletor } from "@/lib/pax-finance-api";
import { Ajuda, campoCls } from "./pax-finance-ui";

const ehPadumann = (e: FinEmpresaSeletor) => (e.cnpj ?? "").replace(/\D/g, "") === "69410873000179" || e.aliases.includes("Padumann");

/** Seletor persistente de empresa (CNPJ). Pre-seleciona PADUMANN; o servidor valida a autorizacao a cada chamada. */
export function PaginaComEmpresa({ children }: { children: (empresaId: number) => ReactNode }) {
  const qc = useQueryClient();
  const [id, setId] = useState<number | null>(null);
  const lista = useQuery({ queryKey: ["finsel", "companies"], queryFn: () => finApi<{ atualId: number; empresas: FinEmpresaSeletor[] }>("/companies", { semEmpresa: true }), retry: false });
  const empresas = lista.data?.empresas ?? [];
  useEffect(() => {
    if (!lista.data) return;
    const guardada = getFinCompany();
    const escolhida = empresas.find((e) => e.id === guardada) ?? empresas.find(ehPadumann) ?? empresas.find((e) => e.id === lista.data!.atualId) ?? empresas[0];
    if (escolhida) { setFinCompany(escolhida.id); setId(escolhida.id); }
  }, [lista.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const atual = empresas.find((e) => e.id === id);
  const trocar = (novo: number) => { setFinCompany(novo); qc.removeQueries({ queryKey: ["fin"] }); setId(novo); };
  return (
    <>
      <div className="mx-auto max-w-6xl p-3 pb-0 md:p-4 md:pb-0" data-testid="seletor-empresa">
        <div className="panel-3d-sub flex flex-col gap-2 p-3 md:flex-row md:items-center">
          <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground"><Building2 className="h-4 w-4" />Empresa (CNPJ)
            <Ajuda texto="Tudo nesta página passa a mostrar apenas a empresa escolhida. O servidor confere se você tem acesso. Sua escolha fica salva neste navegador." rotulo="Empresa" /></span>
          <select className={`${campoCls} md:max-w-md`} value={id ?? ""} onChange={(e) => trocar(Number(e.target.value))} disabled={!empresas.length} data-testid="seletor-empresa-select">
            {empresas.map((e) => <option key={e.id} value={e.id}>{e.nomeFantasia}{e.cnpj ? ` — ${e.cnpj}` : ""}</option>)}
          </select>
          {atual && (
            <div className="text-[12px]" data-testid="seletor-empresa-detalhe">
              <b data-testid="seletor-fantasia">{atual.nomeFantasia}</b> · <span data-testid="seletor-razao">{atual.razaoSocial ?? "Razão social não informada"}</span> · <span data-testid="seletor-cnpj">{atual.cnpj ?? "CNPJ não informado"}</span>
              {atual.statusCadastro === "rascunho" && <span className="ml-2 rounded bg-muted px-2 py-0.5 text-[10px] font-bold uppercase">Cadastro de laboratório — pendente de validação documental</span>}
            </div>
          )}
        </div>
        {lista.isError && <p className="mt-2 text-[12px] text-destructive" data-testid="seletor-erro">{(lista.error as Error).message}</p>}
      </div>
      {id ? <div key={id}>{children(id)}</div> : !lista.isError && <div className="p-4 text-[12px]">Carregando empresas…</div>}
    </>
  );
}
