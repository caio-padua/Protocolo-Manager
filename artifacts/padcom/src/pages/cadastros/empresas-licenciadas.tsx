import { Building2, ArrowUpRight, CircleOff } from "lucide-react";
import { ConsoleShell } from "@/pages/comunicacao/_shared";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function CadastroLegadoEmpresas() {
  return (
    <ConsoleShell
      icon={Building2}
      title="Cadastro legado de empresas"
      subtitle="Tela preservada para consulta da decisão de desativação"
    >
      <section className="panel-3d mx-auto max-w-3xl space-y-4 p-4 sm:p-6">
        <div className="rounded-md border border-red-300 bg-red-50/80 p-3">
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-red-800">
            <CircleOff size={14} />
            Desativada
          </div>
          <p className="mt-1 text-xs leading-relaxed text-red-900">
            Este cadastro não cria nem altera empresas. Os dados e a rota foram preservados.
            Use o cadastro principal para empresas clínicas independentes.
          </p>
        </div>

        <div className="concave-3d rounded-md p-4">
          <h2 className="text-xs font-black uppercase tracking-wide text-[#16294a]">Cadastro ativo</h2>
          <p className="mt-1 text-xs leading-relaxed text-[#647c97]">
            O cadastro principal reúne dados empresariais, endereço, contato, informações fiscais,
            códigos semânticos e documentos.
          </p>
        </div>

        <div className="flex justify-end">
          <a
            href={`${BASE}/cadastros/empresas`}
            className="btn-3d inline-flex items-center gap-2 px-4 py-2 text-[10px] font-bold uppercase tracking-wider"
          >
            Abrir cadastro principal
            <ArrowUpRight size={13} />
          </a>
        </div>
      </section>
    </ConsoleShell>
  );
}
