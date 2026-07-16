import { useEffect, useState } from "react";
import { Network, RefreshCw, Crown, Building2, GitBranch } from "lucide-react";
import { ConsoleShell } from "./comunicacao/_shared";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type TipoLicenciamento = "propria" | "sub_unidade" | "licenciada_direta" | "licenciada_por_clinica";

interface EmpresaNo {
  id: number;
  nome: string;
  tipoLicenciamento: TipoLicenciamento;
  status: string;
  donoNome: string | null;
  valorMensalContrato: string | null;
  isPlatformOwner: boolean;
  driveFolderEmpresaId: string | null;
  locations: string[];
  filhos: EmpresaNo[];
}

const TIPO_META: Record<string, { label: string; cor: string; bg: string; borda: string }> = {
  propria:               { label: "Própria",           cor: "#3D7A7A", bg: "#e6f2f2", borda: "#3D7A7A" },
  sub_unidade:           { label: "Sub-unidade",       cor: "#647c97", bg: "#eef2f7", borda: "#647c97" },
  licenciada_direta:     { label: "Licenciada Direta", cor: "#45B8CC", bg: "#e3f7fb", borda: "#45B8CC" },
  licenciada_por_clinica:{ label: "Lic. Clínica",     cor: "#c2a05a", bg: "#faf2e3", borda: "#c2a05a" },
};

function TipoBadge({ tipo }: { tipo: string }) {
  const m = TIPO_META[tipo] ?? { label: tipo, cor: "#647c97", bg: "#eee", borda: "#aaa" };
  return (
    <span
      className="inline-block rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
      style={{ color: m.cor, background: m.bg, border: `1px solid ${m.borda}` }}
    >{m.label}</span>
  );
}

function NoCard({ no }: { no: EmpresaNo }) {
  const m = TIPO_META[no.tipoLicenciamento] ?? TIPO_META.propria;
  return (
    <div
      className="panel-3d w-[210px] shrink-0"
      style={{ borderLeft: `4px solid ${m.borda}` }}
    >
      <div className="bevel-3d flex items-center gap-1.5 px-3 py-2">
        {no.isPlatformOwner && <Crown className="h-3.5 w-3.5 shrink-0 text-[#c2a05a]" />}
        <span className="truncate text-[12px] font-bold text-[#16294a]">{no.nome}</span>
      </div>
      <div className="px-3 py-2 space-y-1.5">
        <TipoBadge tipo={no.tipoLicenciamento} />
        {no.donoNome && (
          <div className="text-[10px] text-[#647c97]">
            <span className="font-semibold">Resp.:</span> {no.donoNome}
          </div>
        )}
        {no.valorMensalContrato && (
          <div className="text-[10px] text-[#647c97]">
            <span className="font-semibold">Plano:</span>{" "}
            {`R$ ${parseFloat(no.valorMensalContrato).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}/mês`}
          </div>
        )}
        {no.locations.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-0.5">
            {no.locations.slice(0, 3).map(l => (
              <span key={l} className="concave-3d px-1.5 py-0.5 text-[9px] text-[#647c97]">{l}</span>
            ))}
            {no.locations.length > 3 && (
              <span className="text-[9px] text-[#647c97]">+{no.locations.length - 3}</span>
            )}
          </div>
        )}
        <div className={`text-[9px] font-bold ${no.status === "ATIVO" ? "text-[#3D7A7A]" : "text-[#c0392b]"}`}>
          {no.status}
        </div>
      </div>
    </div>
  );
}

function ArvoreNo({ no, nivel }: { no: EmpresaNo; nivel: number }) {
  const temFilhos = no.filhos.length > 0;
  return (
    <div className="flex flex-col items-center">
      <NoCard no={no} />
      {temFilhos && (
        <>
          <div className="w-px h-5 bg-[rgba(22,41,74,0.25)]" />
          <div className="flex items-start justify-center">
            <div className="flex gap-5 items-start">
              {no.filhos.map(filho => (
                <div key={filho.id} className="flex flex-col items-center">
                  <div className="w-px h-5 bg-[rgba(22,41,74,0.25)]" />
                  <ArvoreNo no={filho} nivel={nivel + 1} />
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function contarNos(no: EmpresaNo): number {
  return 1 + no.filhos.reduce((a, f) => a + contarNos(f), 0);
}

export default function Hierarquia() {
  const [raiz, setRaiz] = useState<EmpresaNo | null>(null);
  const [raizes, setRaizes] = useState<EmpresaNo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  async function carregar() {
    setCarregando(true);
    setErro(null);
    try {
      const r = await fetch(`${BASE}/api/empresas/hierarquia`);
      const d = await r.json();
      setRaiz(d.raiz ?? null);
      setRaizes(d.raizes ?? []);
    } catch {
      setErro("Erro ao carregar hierarquia.");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => { void carregar(); }, []);

  const nosParaExibir = raiz ? [raiz] : raizes;
  const totalNos = nosParaExibir.reduce((acc, n) => acc + contarNos(n), 0);

  return (
    <ConsoleShell
      icon={Network}
      title="Hierarquia PAXTER"
      subtitle="Organograma da pirâmide de licenciamento — clínicas, sub-unidades e royalties"
    >
      {/* Cabeçalho */}
      <section className="panel-3d px-5 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <GitBranch className="h-4 w-4 text-[#45B8CC]" />
          <span className="text-[12px] font-bold uppercase tracking-wide text-[#16294a]">
            {totalNos} {totalNos === 1 ? "empresa" : "empresas"} na pirâmide
          </span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-3">
            {Object.entries(TIPO_META).map(([k, v]) => (
              <span key={k} className="flex items-center gap-1 text-[10px]" style={{ color: v.cor }}>
                <span className="w-2.5 h-2.5 rounded-sm inline-block"
                  style={{ background: v.bg, border: `1.5px solid ${v.borda}` }} />
                {v.label}
              </span>
            ))}
          </div>
          <button onClick={carregar} className="concave-3d p-1.5">
            <RefreshCw className={`h-4 w-4 text-[#647c97] ${carregando ? "animate-spin" : ""}`} />
          </button>
        </div>
      </section>

      {/* Organograma */}
      <section className="panel-3d px-5 py-8">
        {carregando && (
          <div className="py-16 text-center text-[13px] text-[#647c97]">
            Carregando organograma…
          </div>
        )}
        {erro && (
          <div className="py-16 text-center text-[13px] text-[#c0392b]">{erro}</div>
        )}
        {!carregando && !erro && nosParaExibir.length === 0 && (
          <div className="py-16 text-center">
            <Building2 className="h-10 w-10 mx-auto text-[#647c97] mb-3 opacity-40" />
            <p className="text-[13px] text-[#647c97]">
              Nenhuma empresa cadastrada — acesse o{" "}
              <a href="/cadastros/empresas-licenciadas" className="text-[#45B8CC] underline underline-offset-2">
                Centro de Comando
              </a>{" "}
              para adicionar.
            </p>
          </div>
        )}
        {!carregando && !erro && nosParaExibir.length > 0 && (
          <div className="overflow-x-auto pb-4">
            <div className="flex gap-8 justify-center min-w-max">
              {nosParaExibir.map(no => (
                <ArvoreNo key={no.id} no={no} nivel={0} />
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Link para Centro de Comando */}
      <section className="panel-3d px-5 py-3 flex items-center justify-between">
        <span className="text-[11px] text-[#647c97]">
          Para criar empresas, editar licenciamentos e configurar o Drive por empresa:
        </span>
        <a
          href="/cadastros/empresas-licenciadas"
          className="btn-3d inline-flex items-center gap-2 px-4 py-2 text-[11px] font-bold uppercase tracking-wide"
        >
          <Crown className="h-3.5 w-3.5" /> Centro de Comando
        </a>
      </section>
    </ConsoleShell>
  );
}
