import { useCallback, useEffect, useState } from "react";
import { Building2, CheckCircle2, Phone, RefreshCw, UserRound } from "lucide-react";
import { getCollabToken } from "@/lib/collab-auth";

/* ----------------------------------------------------------------------------
   LEADS DA VITRINE — painel de verificação das entradas nas vitrines públicas
   de demonstração (paciente e dono de clínica). O "login" da vitrine é a
   captação: cada entrada vira uma linha aqui, para contato comercial.
---------------------------------------------------------------------------- */

type Lead = {
  id: number;
  tipo: "paciente" | "clinica";
  nome: string | null;
  cpf: string;
  cnpj: string | null;
  telefone: string;
  rota_origem: string | null;
  acessos: number;
  ultimo_acesso: string;
  contatado: boolean;
  contatado_em: string | null;
  observacao: string | null;
  criado_em: string;
};

function fmtCpf(d: string) {
  return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : d;
}
function fmtCnpj(d: string | null) {
  if (!d) return "—";
  return d.length === 14 ? `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}` : d;
}
function fmtTel(d: string) {
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return d;
}
function fmtDataHora(iso: string) {
  return iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
}

async function apiLeads(path: string, opts?: RequestInit) {
  const token = getCollabToken();
  const headers = new Headers(opts?.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (opts?.body) headers.set("Content-Type", "application/json");
  const res = await fetch(`/api${path}`, { ...opts, headers });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

export default function VitrineLeads() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [filtro, setFiltro] = useState<"todos" | "paciente" | "clinica">("todos");
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const q = filtro === "todos" ? "" : `?tipo=${filtro}`;
      const j = (await apiLeads(`/vitrine-leads${q}`)) as { leads: Lead[] };
      setLeads(j.leads);
    } catch {
      setErro("Não foi possível carregar os leads. Confira o seu acesso e tente de novo.");
    } finally {
      setCarregando(false);
    }
  }, [filtro]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function marcarContato(lead: Lead) {
    try {
      await apiLeads(`/vitrine-leads/${lead.id}/contato`, {
        method: "PATCH",
        body: JSON.stringify({ contatado: !lead.contatado }),
      });
      setLeads((ls) => ls.map((l) => (l.id === lead.id ? { ...l, contatado: !l.contatado, contatado_em: !l.contatado ? new Date().toISOString() : null } : l)));
    } catch {
      setErro("Falha ao atualizar o lead.");
    }
  }

  const kpiPacientes = leads.filter((l) => l.tipo === "paciente").length;
  const kpiClinicas = leads.filter((l) => l.tipo === "clinica").length;
  const kpiPendentes = leads.filter((l) => !l.contatado).length;

  return (
    <div className="p-6">
      {/* Cabeçalho */}
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold uppercase tracking-[0.08em]">Leads da Vitrine</h1>
          <p className="text-sm text-muted-foreground">
            Quem entrou nas vitrines públicas de demonstração — para contato comercial.
          </p>
        </div>
        <button onClick={() => void carregar()} className="btn-3d-soft flex items-center gap-2 px-4 py-2 text-sm font-bold uppercase tracking-wide">
          <RefreshCw className={`h-4 w-4 ${carregando ? "animate-spin" : ""}`} /> Atualizar
        </button>
      </div>

      {/* KPIs */}
      <div className="mb-5 grid grid-cols-3 gap-3">
        {[
          { rotulo: "PACIENTES", valor: kpiPacientes, Icon: UserRound },
          { rotulo: "CLÍNICAS", valor: kpiClinicas, Icon: Building2 },
          { rotulo: "SEM CONTATO", valor: kpiPendentes, Icon: Phone },
        ].map((k) => (
          <div key={k.rotulo} className="panel-3d-sub flex items-center gap-3 px-4 py-3">
            <div className="concave-3d flex h-10 w-10 items-center justify-center">
              <k.Icon className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{k.rotulo}</div>
              <div className="text-2xl font-bold">{k.valor}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Filtro */}
      <div className="mb-4 flex gap-2">
        {(["todos", "paciente", "clinica"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFiltro(f)}
            className={`px-4 py-1.5 text-[12px] font-bold uppercase tracking-wide ${filtro === f ? "btn-3d" : "btn-3d-soft"}`}
          >
            {f === "todos" ? "Todos" : f === "paciente" ? "Pacientes" : "Clínicas"}
          </button>
        ))}
      </div>

      {erro && <div className="mb-4 px-4 py-2 text-sm font-medium text-red-700" style={{ background: "rgba(180,40,40,0.12)" }}>{erro}</div>}

      {/* Tabela */}
      <div className="panel-3d-sub overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
              <th className="px-3 py-2.5">Tipo</th>
              <th className="px-3 py-2.5">Nome</th>
              <th className="px-3 py-2.5">CPF</th>
              <th className="px-3 py-2.5">CNPJ</th>
              <th className="px-3 py-2.5">Telefone</th>
              <th className="px-3 py-2.5">Acessos</th>
              <th className="px-3 py-2.5">Último acesso</th>
              <th className="px-3 py-2.5">Contato</th>
            </tr>
          </thead>
          <tbody>
            {leads.length === 0 && !carregando && (
              <tr><td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">Nenhum lead ainda. As entradas nas vitrines aparecem aqui.</td></tr>
            )}
            {leads.map((l) => (
              <tr key={l.id} className="border-b last:border-0">
                <td className="px-3 py-2.5">
                  <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-[11px] font-bold uppercase ${l.tipo === "clinica" ? "text-amber-700" : "text-sky-800"}`}>
                    {l.tipo === "clinica" ? <Building2 className="h-3.5 w-3.5" /> : <UserRound className="h-3.5 w-3.5" />}
                    {l.tipo === "clinica" ? "Clínica" : "Paciente"}
                  </span>
                </td>
                <td className="px-3 py-2.5 font-medium">{l.nome || "—"}</td>
                <td className="px-3 py-2.5 font-mono text-[13px]">{fmtCpf(l.cpf)}</td>
                <td className="px-3 py-2.5 font-mono text-[13px]">{fmtCnpj(l.cnpj)}</td>
                <td className="px-3 py-2.5">{fmtTel(l.telefone)}</td>
                <td className="px-3 py-2.5 text-center">{l.acessos}</td>
                <td className="px-3 py-2.5">{fmtDataHora(l.ultimo_acesso)}</td>
                <td className="px-3 py-2.5">
                  <button
                    onClick={() => void marcarContato(l)}
                    className={`flex items-center gap-1.5 px-3 py-1 text-[11px] font-bold uppercase tracking-wide ${l.contatado ? "bevel-3d-ok" : "btn-3d-soft"}`}
                    title={l.contatado ? `Contatado em ${fmtDataHora(l.contatado_em || "")}` : "Marcar como contatado"}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {l.contatado ? "Contatado" : "Pendente"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
