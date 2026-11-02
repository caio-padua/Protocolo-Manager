import { useCallback, useEffect, useMemo, useState } from "react";
import { Building2, HardDrive, Pencil, Plus, RefreshCw, Save, X } from "lucide-react";
import { ConsoleShell } from "@/pages/comunicacao/_shared";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface Empresa {
  id: number;
  nome: string;
  cnpj: string | null;
  status: string;
  ativa: boolean;
  donoNome: string | null;
  telefone: string | null;
  emailGeral: string | null;
  valorMensalContrato: string | null;
  royaltyPercent: string | null;
  driveFolderEmpresaId: string | null;
}

interface Formulario {
  nome: string;
  cnpj: string;
  donoNome: string;
  telefone: string;
  emailGeral: string;
}

const FORMULARIO_VAZIO: Formulario = {
  nome: "",
  cnpj: "",
  donoNome: "",
  telefone: "",
  emailGeral: "",
};

function moeda(valor: string | null): string {
  if (!valor) return "—";
  const numero = Number(valor);
  return Number.isFinite(numero)
    ? numero.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
    : "—";
}

function Campo({
  titulo,
  valor,
  alterar,
  tipo = "text",
}: {
  titulo: string;
  valor: string;
  alterar: (valor: string) => void;
  tipo?: string;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[10px] font-bold uppercase tracking-wider text-[#647c97]">{titulo}</span>
      <input
        type={tipo}
        value={valor}
        onChange={(event) => alterar(event.target.value)}
        className="concave-3d w-full rounded-md px-3 py-2 text-sm text-[#16294a] outline-none focus:ring-2 focus:ring-[#45B8CC]/40"
      />
    </label>
  );
}

export default function EmpresasIndependentes() {
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [modalAberto, setModalAberto] = useState(false);
  const [empresaEditando, setEmpresaEditando] = useState<number | null>(null);
  const [formulario, setFormulario] = useState<Formulario>(FORMULARIO_VAZIO);
  const [mensagem, setMensagem] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [driveCarregando, setDriveCarregando] = useState<number | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const resposta = await fetch(`${BASE}/api/empresas`);
      if (!resposta.ok) throw new Error("Não foi possível carregar as empresas.");
      const dados = await resposta.json() as Empresa[];
      setEmpresas(Array.isArray(dados) ? dados : []);
    } catch (erro) {
      setMensagem({
        tipo: "erro",
        texto: erro instanceof Error ? erro.message : "Falha ao carregar os cadastros.",
      });
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { void carregar(); }, [carregar]);

  const ativas = useMemo(() => empresas.filter((empresa) => empresa.ativa).length, [empresas]);

  function abrirNovo() {
    setEmpresaEditando(null);
    setFormulario(FORMULARIO_VAZIO);
    setModalAberto(true);
  }

  function abrirEdicao(empresa: Empresa) {
    setEmpresaEditando(empresa.id);
    setFormulario({
      nome: empresa.nome,
      cnpj: empresa.cnpj ?? "",
      donoNome: empresa.donoNome ?? "",
      telefone: empresa.telefone ?? "",
      emailGeral: empresa.emailGeral ?? "",
    });
    setModalAberto(true);
  }

  async function salvar(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSalvando(true);
    setMensagem(null);
    try {
      const resposta = await fetch(
        empresaEditando
          ? `${BASE}/api/empresas/${empresaEditando}`
          : `${BASE}/api/empresas`,
        {
          method: empresaEditando ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(formulario),
        },
      );
      const dados = await resposta.json().catch(() => ({}));
      if (!resposta.ok) throw new Error(dados.error ?? "Não foi possível salvar.");
      setModalAberto(false);
      setMensagem({ tipo: "ok", texto: empresaEditando ? "Cadastro atualizado." : "Cadastro criado." });
      await carregar();
    } catch (erro) {
      setMensagem({
        tipo: "erro",
        texto: erro instanceof Error ? erro.message : "Falha ao salvar o cadastro.",
      });
    } finally {
      setSalvando(false);
    }
  }

  async function configurarDrive(empresa: Empresa) {
    setDriveCarregando(empresa.id);
    setMensagem(null);
    try {
      const resposta = await fetch(`${BASE}/api/empresas/${empresa.id}/setup-drive`, { method: "POST" });
      const dados = await resposta.json().catch(() => ({}));
      if (!resposta.ok) throw new Error(dados.error ?? "Não foi possível configurar a pasta.");
      setMensagem({ tipo: "ok", texto: `Pasta do Drive vinculada a ${empresa.nome}.` });
      await carregar();
    } catch (erro) {
      setMensagem({
        tipo: "erro",
        texto: erro instanceof Error ? erro.message : "Falha ao configurar o Drive.",
      });
    } finally {
      setDriveCarregando(null);
    }
  }

  return (
    <ConsoleShell
      icon={Building2}
      title="Empresas independentes"
      subtitle="Cadastros clínicos sem empresa-mãe, filial ou repasse automático"
    >
      <section className="panel-3d space-y-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="concave-3d rounded-md px-4 py-2">
            <span className="block text-[9px] font-bold uppercase tracking-wider text-[#647c97]">Cadastros</span>
            <span className="text-xl font-black tabular-nums text-[#16294a]">{empresas.length}</span>
          </div>
          <div className="concave-3d rounded-md px-4 py-2">
            <span className="block text-[9px] font-bold uppercase tracking-wider text-[#647c97]">Ativas</span>
            <span className="text-xl font-black tabular-nums text-emerald-700">{ativas}</span>
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
          <button
            type="button"
            onClick={abrirNovo}
            className="btn-3d inline-flex items-center gap-2 px-3 py-2 text-[10px] font-bold uppercase tracking-wider"
          >
            <Plus size={14} />
            Nova empresa clínica
          </button>
        </div>

        <div className="bevel-3d rounded-md px-4 py-3 text-xs leading-relaxed text-[#334763]">
          Os dados empresariais deste ambiente são simulações. Os vínculos antigos e os valores contratuais
          aparecem somente como histórico; não formam hierarquia, cobrança, repasse nem receita.
        </div>

        {mensagem && (
          <div
            role="status"
            className={`rounded-md border px-3 py-2 text-xs ${
              mensagem.tipo === "ok"
                ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                : "border-red-300 bg-red-50 text-red-800"
            }`}
          >
            {mensagem.texto}
          </div>
        )}

        {carregando ? (
          <div className="concave-3d rounded-md px-4 py-10 text-center text-sm text-[#647c97]">
            Carregando cadastros…
          </div>
        ) : empresas.length === 0 ? (
          <div className="concave-3d rounded-md px-4 py-10 text-center text-sm text-[#647c97]">
            Nenhuma empresa clínica cadastrada.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-separate border-spacing-y-2 text-left">
              <thead>
                <tr className="text-[9px] font-black uppercase tracking-wider text-[#647c97]">
                  <th className="px-3 pb-1">Empresa clínica</th>
                  <th className="px-3 pb-1">Responsável e contato</th>
                  <th className="px-3 pb-1">Estado</th>
                  <th className="px-3 pb-1">Valores históricos, não aplicados</th>
                  <th className="px-3 pb-1 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {empresas.map((empresa) => (
                  <tr key={empresa.id} className="panel-3d text-xs text-[#16294a]">
                    <td className="rounded-l-md px-3 py-3">
                      <strong className="block uppercase">{empresa.nome}</strong>
                      <span className="text-[10px] text-[#647c97]">CNPJ: {empresa.cnpj || "—"}</span>
                    </td>
                    <td className="px-3 py-3">
                      <span className="block">{empresa.donoNome || "Responsável: —"}</span>
                      <span className="block text-[10px] text-[#647c97]">
                        {[empresa.telefone, empresa.emailGeral].filter(Boolean).join(" · ") || "Contato: —"}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <span className={empresa.ativa ? "font-bold text-emerald-700" : "font-bold text-[#647c97]"}>
                        {empresa.ativa ? "ATIVA" : empresa.status}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-[10px] text-[#647c97]">
                      <span className="block">Mensalidade registrada: {moeda(empresa.valorMensalContrato)}</span>
                      <span className="block">Percentual registrado: {empresa.royaltyPercent ?? "—"}%</span>
                    </td>
                    <td className="rounded-r-md px-3 py-3">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => abrirEdicao(empresa)}
                          className="btn-3d-soft inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[9px] font-bold uppercase"
                        >
                          <Pencil size={11} /> Editar
                        </button>
                        {!empresa.driveFolderEmpresaId && (
                          <button
                            type="button"
                            onClick={() => void configurarDrive(empresa)}
                            disabled={driveCarregando === empresa.id}
                            className="btn-3d-soft inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[9px] font-bold uppercase disabled:opacity-50"
                          >
                            <HardDrive size={11} /> Drive
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {modalAberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#07162b]/65 p-3">
          <form onSubmit={salvar} className="panel-3d w-full max-w-2xl space-y-4 p-4 sm:p-6">
            <header className="bevel-3d flex items-center gap-3 rounded-md px-4 py-3">
              <Building2 size={18} className="text-[#c2a05a]" />
              <div className="min-w-0">
                <h2 className="text-sm font-black uppercase tracking-wide text-[#16294a]">
                  {empresaEditando ? "Editar empresa clínica" : "Nova empresa clínica"}
                </h2>
                <p className="text-[10px] text-[#647c97]">Este cadastro não aceita empresa-mãe nem filial.</p>
              </div>
              <button type="button" onClick={() => setModalAberto(false)} className="concave-3d ml-auto rounded p-1.5" aria-label="Fechar">
                <X size={15} />
              </button>
            </header>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Campo titulo="Nome" valor={formulario.nome} alterar={(nome) => setFormulario((f) => ({ ...f, nome }))} />
              <Campo titulo="CNPJ de teste" valor={formulario.cnpj} alterar={(cnpj) => setFormulario((f) => ({ ...f, cnpj }))} />
              <Campo titulo="Responsável" valor={formulario.donoNome} alterar={(donoNome) => setFormulario((f) => ({ ...f, donoNome }))} />
              <Campo titulo="Telefone" valor={formulario.telefone} alterar={(telefone) => setFormulario((f) => ({ ...f, telefone }))} />
              <div className="sm:col-span-2">
                <Campo titulo="E-mail geral" tipo="email" valor={formulario.emailGeral} alterar={(emailGeral) => setFormulario((f) => ({ ...f, emailGeral }))} />
              </div>
            </div>

            <div className="bevel-3d rounded-md px-3 py-2 text-[10px] leading-relaxed text-[#647c97]">
              Os valores contratuais antigos são preservados fora deste formulário e não são calculados nem cobrados.
            </div>

            <footer className="flex justify-end gap-2 border-t border-[#c8b98d]/40 pt-3">
              <button type="button" onClick={() => setModalAberto(false)} className="btn-3d-soft px-4 py-2 text-[10px] font-bold uppercase">
                Cancelar
              </button>
              <button type="submit" disabled={salvando} className="btn-3d inline-flex items-center gap-2 px-4 py-2 text-[10px] font-bold uppercase disabled:opacity-50">
                <Save size={13} /> {salvando ? "Salvando…" : "Salvar"}
              </button>
            </footer>
          </form>
        </div>
      )}
    </ConsoleShell>
  );
}
