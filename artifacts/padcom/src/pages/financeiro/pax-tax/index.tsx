import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Landmark, ScrollText, Users } from "lucide-react";
import { brlDeCentavos, centavosDeTexto, finApi, type FinEmpresa, type FinRegra, type FinSocio } from "@/lib/pax-finance-api";

const NAVY = "#0B1F3A";
const MUDO = "#5b6b82";
const ROTULO_STATUS: Record<string, string> = { rascunho: "Rascunho", pendente: "Pendente de aprovação", aprovada: "Aprovada", ativa: "Ativa", substituida: "Substituída" };
const ROTULO_PAPEL: Record<string, string> = { socio: "Sócio", administrador: "Administrador", socio_administrador: "Sócio administrador", responsavel_tecnico: "Responsável técnico", procurador: "Procurador" };

function Campo({ rotulo, dica, children }: { rotulo: string; dica: string; children: React.ReactNode }) {
  return (
    <label className="block text-[12px]" title={dica}>
      <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: MUDO }}>{rotulo}</span>
      {children}
    </label>
  );
}
const inp = "w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-[13px] text-slate-900";

export default function PaxTax() {
  const qc = useQueryClient();
  const [erro, setErro] = useState("");
  const emp = useQuery({ queryKey: ["fin", "company"], queryFn: () => finApi<FinEmpresa>("/company") });
  const socios = useQuery({ queryKey: ["fin", "partners"], queryFn: () => finApi<FinSocio[]>("/partners") });
  const regras = useQuery({ queryKey: ["fin", "rules"], queryFn: () => finApi<FinRegra[]>("/rules") });
  const refetchTudo = () => void qc.invalidateQueries({ queryKey: ["fin"] });
  const agir = useMutation({
    mutationFn: (a: { path: string; method?: string; body?: unknown }) => finApi(a.path, { method: a.method ?? "POST", body: a.body ?? {} }),
    onSuccess: () => { setErro(""); refetchTudo(); },
    onError: (e: Error) => setErro(e.message),
  });

  const perfil = emp.data?.perfil;
  const [pf, setPf] = useState({ opcaoSimples: "", municipioIss: "", uf: "", capital: "", origem: "", regime: "" });
  const [novoSocio, setNovoSocio] = useState({ nome: "", papel: "socio", participacao: "", inicio: "" });
  const [nr, setNr] = useState({ ruleKey: "", tributo: "", esfera: "federal", regime: "", anexo: "", base: "", aliquota: "", parcela: "", min: "", max: "", fonteOficial: "", fonteUrl: "", consulta: "", inicio: "" });

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4" data-testid="pax-tax">
      <header>
        <h1 className="text-[20px] font-bold" style={{ color: NAVY }}>Pax Tax — Gestão Tributária e Multi-CNPJ</h1>
        <p className="text-[12px]" style={{ color: MUDO }}>
          Cadastro fiscal, vínculos societários e parâmetros tributários com versão e vigência. Nada aqui calcula imposto ainda: o simulador do Fator R e do Simples Nacional é a próxima fase.
          Dados extraídos de documentos entram como rascunho e só valem após validação humana.
        </p>
        {erro && <p className="mt-2 rounded bg-red-50 p-2 text-[12px] text-red-700" data-testid="fin-erro">{erro}</p>}
      </header>

      <section className="panel-3d-sub p-4" data-testid="fin-empresa">
        <h2 className="mb-2 flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-[0.14em]" style={{ color: NAVY }}><Landmark className="h-4 w-4" /> Empresa (CNPJ — Cadastro Nacional da Pessoa Jurídica)</h2>
        {emp.isLoading ? <p className="text-[12px]">Carregando…</p> : emp.error ? <p className="text-[12px] text-red-700">{(emp.error as Error).message}</p> : emp.data && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3 text-[13px] lg:grid-cols-4" style={{ color: NAVY }}>
              <div title="Lido do cadastro de empresas; não é copiado para o domínio financeiro."><b>Nome</b><br />{emp.data.empresa.razaoSocial ?? emp.data.empresa.nome}</div>
              <div><b>CNPJ</b><br />{emp.data.empresa.cnpj ?? "não cadastrado"}</div>
              <div title="Classificação Nacional de Atividades Econômicas"><b>CNAE principal</b><br />{emp.data.empresa.cnae ?? "—"}</div>
              <div title="Regime registrado no cadastro de empresas; não comprova a opção pelo Simples Nacional."><b>Regime no cadastro</b><br />{emp.data.empresa.regimeCadastro ?? "—"}</div>
            </div>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
              <Campo rotulo="Opção pelo Simples" dica="O comprovante de CNPJ não prova a opção pelo Simples Nacional. Confirme no Portal do Simples."><select className={inp} value={pf.opcaoSimples || perfil?.opcaoSimples || "nao_verificada"} onChange={(e) => setPf({ ...pf, opcaoSimples: e.target.value })}><option value="nao_verificada">Não verificada</option><option value="confirmada">Confirmada</option><option value="nao_optante">Não optante</option></select></Campo>
              <Campo rotulo="Regime declarado" dica="Regime informado pelo contador (proposta)."><input className={inp} defaultValue={perfil?.regimeDeclarado ?? ""} onChange={(e) => setPf({ ...pf, regime: e.target.value })} /></Campo>
              <Campo rotulo="Município do ISS" dica="Imposto Sobre Serviços: município que tributa o serviço."><input className={inp} defaultValue={perfil?.municipioIss ?? ""} onChange={(e) => setPf({ ...pf, municipioIss: e.target.value })} /></Campo>
              <Campo rotulo="UF" dica="Unidade da Federação (estado)."><input className={inp} maxLength={2} defaultValue={perfil?.uf ?? ""} onChange={(e) => setPf({ ...pf, uf: e.target.value })} /></Campo>
              <Campo rotulo="Capital social (R$)" dica="Valor declarado no contrato. Proposta até validação humana."><input className={inp} defaultValue={perfil?.capitalSocialCents != null ? (perfil.capitalSocialCents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : ""} onChange={(e) => setPf({ ...pf, capital: e.target.value })} /></Campo>
              <Campo rotulo="Origem do capital" dica="Documento ou fonte de onde veio o valor."><input className={inp} defaultValue={perfil?.capitalSocialOrigem ?? ""} onChange={(e) => setPf({ ...pf, origem: e.target.value })} /></Campo>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className="btn-3d-gold rounded-md px-3 py-1.5 text-[12px] font-bold uppercase" data-testid="fin-salvar-perfil" title="Salvar como rascunho. Qualquer alteração exige nova validação."
                onClick={() => agir.mutate({ path: "/company/profile", method: "PUT", body: {
                  opcaoSimples: pf.opcaoSimples || perfil?.opcaoSimples || "nao_verificada",
                  regimeDeclarado: (pf.regime || perfil?.regimeDeclarado) ?? null, municipioIss: (pf.municipioIss || perfil?.municipioIss) ?? null,
                  uf: (pf.uf || perfil?.uf) ?? null, capitalSocialCents: pf.capital ? centavosDeTexto(pf.capital) : perfil?.capitalSocialCents ?? null,
                  capitalSocialOrigem: (pf.origem || perfil?.capitalSocialOrigem) ?? null } })}>Salvar rascunho</button>
              <button type="button" disabled={!perfil || perfil.statusValidacao === "validado"} className="rounded-md border border-slate-400 px-3 py-1.5 text-[12px] font-bold uppercase disabled:opacity-40" title="Validação humana do cadastro fiscal (registra quem e quando)." onClick={() => agir.mutate({ path: "/company/profile/validate" })}>Validar cadastro</button>
              <span className="text-[12px]" style={{ color: MUDO }}>Situação: <b>{perfil ? (perfil.statusValidacao === "validado" ? "validado por humano" : "rascunho — aguardando validação") : "ainda não preenchido"}</b></span>
            </div>
          </div>
        )}
      </section>

      <section className="panel-3d-sub p-4" data-testid="fin-socios">
        <h2 className="mb-2 flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-[0.14em]" style={{ color: NAVY }}><Users className="h-4 w-4" /> Sócios, administradores e vínculos</h2>
        <p className="mb-2 text-[11px]" style={{ color: MUDO }}>Sem CPF, RG ou endereço residencial neste cadastro. Vínculos não são apagados: são encerrados com data.</p>
        <table className="w-full text-[12px]" style={{ color: NAVY }}>
          <thead><tr className="text-left text-[10px] uppercase" style={{ color: MUDO }}><th>Nome</th><th>Papel</th><th title="Participação no capital, em percentual">Participação</th><th>Início</th><th>Fim</th><th>Situação</th><th /></tr></thead>
          <tbody>{(socios.data ?? []).map((s) => (
            <tr key={s.id} className="border-t border-slate-200">
              <td>{s.nome}</td><td>{ROTULO_PAPEL[s.papel] ?? s.papel}</td><td>{s.participacaoBp === null ? "—" : `${(s.participacaoBp / 100).toLocaleString("pt-BR")} %`}</td>
              <td>{s.vigenciaInicio ?? "—"}</td><td>{s.vigenciaFim ?? "em vigor"}</td><td>{s.statusValidacao === "validado" ? "validado" : "rascunho"}</td>
              <td className="text-right">{s.statusValidacao !== "validado" && <button type="button" className="underline" onClick={() => agir.mutate({ path: `/partners/${s.id}/validate` })}>Validar</button>}</td>
            </tr>))}
            {socios.data?.length === 0 && <tr><td colSpan={7} className="py-2" style={{ color: MUDO }}>Nenhum vínculo cadastrado.</td></tr>}
          </tbody>
        </table>
        <div className="mt-3 grid grid-cols-2 items-end gap-3 lg:grid-cols-5">
          <Campo rotulo="Nome" dica="Nome da pessoa ou empresa sócia."><input className={inp} value={novoSocio.nome} onChange={(e) => setNovoSocio({ ...novoSocio, nome: e.target.value })} /></Campo>
          <Campo rotulo="Papel" dica="Função no contrato social."><select className={inp} value={novoSocio.papel} onChange={(e) => setNovoSocio({ ...novoSocio, papel: e.target.value })}>{Object.entries(ROTULO_PAPEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Campo>
          <Campo rotulo="Participação (%)" dica="Percentual das quotas. Deixe vazio se não se aplica."><input className={inp} value={novoSocio.participacao} onChange={(e) => setNovoSocio({ ...novoSocio, participacao: e.target.value })} /></Campo>
          <Campo rotulo="Início" dica="Data de início do vínculo (AAAA-MM-DD)."><input className={inp} type="date" value={novoSocio.inicio} onChange={(e) => setNovoSocio({ ...novoSocio, inicio: e.target.value })} /></Campo>
          <button type="button" className="btn-3d-gold rounded-md px-3 py-2 text-[12px] font-bold uppercase" data-testid="fin-add-socio" onClick={() => {
            const p = novoSocio.participacao ? Math.round(Number(novoSocio.participacao.replace(",", ".")) * 100) : null;
            agir.mutate({ path: "/partners", body: { nome: novoSocio.nome, papel: novoSocio.papel, participacaoBp: p, vigenciaInicio: novoSocio.inicio || null } });
          }}>Adicionar vínculo</button>
        </div>
      </section>

      <section className="panel-3d-sub p-4" data-testid="fin-regras">
        <h2 className="mb-2 flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-[0.14em]" style={{ color: NAVY }}><ScrollText className="h-4 w-4" /> Parâmetros tributários versionados</h2>
        <p className="mb-2 text-[11px]" style={{ color: MUDO }}>Nenhuma alíquota ou limite está fixo no sistema. Uma regra só vale em cálculo oficial depois de aprovada com fonte oficial, endereço e data de consulta.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]" style={{ color: NAVY }}>
            <thead><tr className="text-left text-[10px] uppercase" style={{ color: MUDO }}><th>Regra</th><th>Versão</th><th>Tributo</th><th title="Alíquota nominal em percentual">Alíquota</th><th title="Parcela a deduzir, em reais">Deduzir</th><th>Faixa (R$)</th><th>Vigência</th><th>Fonte</th><th>Situação</th><th /></tr></thead>
            <tbody>{(regras.data ?? []).map((r) => (
              <tr key={r.id} className="border-t border-slate-200 align-top">
                <td>{r.ruleKey}</td><td>v{r.version}</td><td>{r.tributo} ({r.esfera})</td>
                <td>{r.aliquotaPct === null ? "—" : `${r.aliquotaPct.toLocaleString("pt-BR")} %`}</td><td>{brlDeCentavos(r.parcelaDeduzirCents)}</td>
                <td>{brlDeCentavos(r.limiteMinCents)} a {brlDeCentavos(r.limiteMaxCents)}</td><td>{r.vigenciaInicio} → {r.vigenciaFim ?? "aberta"}</td>
                <td>{r.fonteUrl ? <a className="underline" href={r.fonteUrl} target="_blank" rel="noreferrer" title={`Consultada em ${r.fonteConsultadaEm ?? "—"}`}>{r.fonteOficial}</a> : <span className="text-amber-700">sem fonte</span>}</td>
                <td><b>{ROTULO_STATUS[r.status] ?? r.status}</b></td>
                <td className="whitespace-nowrap text-right">
                  {r.status === "rascunho" && <button type="button" className="underline" onClick={() => agir.mutate({ path: `/rules/${r.id}/submit` })}>Enviar</button>}
                  {r.status === "pendente" && <button type="button" className="underline" onClick={() => agir.mutate({ path: `/rules/${r.id}/approve` })}>Aprovar</button>}
                  {r.status === "aprovada" && <button type="button" className="underline" onClick={() => agir.mutate({ path: `/rules/${r.id}/activate` })}>Ativar</button>}
                </td>
              </tr>))}
              {regras.data?.length === 0 && <tr><td colSpan={10} className="py-2" style={{ color: MUDO }}>Nenhuma regra cadastrada. Cadastre pela fonte oficial; o sistema não traz valores prontos.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-6">
          <Campo rotulo="Chave da regra" dica="Identificador estável, ex.: simples.anexo3.faixa1. Nova versão usa a mesma chave."><input className={inp} value={nr.ruleKey} onChange={(e) => setNr({ ...nr, ruleKey: e.target.value })} /></Campo>
          <Campo rotulo="Tributo" dica="Ex.: DAS (Documento de Arrecadação do Simples), ISS, IRRF (Imposto de Renda Retido na Fonte)."><input className={inp} value={nr.tributo} onChange={(e) => setNr({ ...nr, tributo: e.target.value })} /></Campo>
          <Campo rotulo="Esfera" dica="Quem arrecada o tributo."><select className={inp} value={nr.esfera} onChange={(e) => setNr({ ...nr, esfera: e.target.value })}><option value="federal">Federal</option><option value="estadual">Estadual</option><option value="municipal">Municipal</option></select></Campo>
          <Campo rotulo="Anexo" dica="Anexo do Simples Nacional, quando aplicável."><input className={inp} value={nr.anexo} onChange={(e) => setNr({ ...nr, anexo: e.target.value })} /></Campo>
          <Campo rotulo="Alíquota (%)" dica="Alíquota nominal conforme a fonte oficial."><input className={inp} value={nr.aliquota} onChange={(e) => setNr({ ...nr, aliquota: e.target.value })} /></Campo>
          <Campo rotulo="Parcela a deduzir (R$)" dica="Valor a deduzir conforme a fonte oficial."><input className={inp} value={nr.parcela} onChange={(e) => setNr({ ...nr, parcela: e.target.value })} /></Campo>
          <Campo rotulo="Faixa de (R$)" dica="Limite inferior da faixa de receita."><input className={inp} value={nr.min} onChange={(e) => setNr({ ...nr, min: e.target.value })} /></Campo>
          <Campo rotulo="Faixa até (R$)" dica="Limite superior da faixa de receita."><input className={inp} value={nr.max} onChange={(e) => setNr({ ...nr, max: e.target.value })} /></Campo>
          <Campo rotulo="Fonte oficial" dica="Nome da norma ou órgão."><input className={inp} value={nr.fonteOficial} onChange={(e) => setNr({ ...nr, fonteOficial: e.target.value })} /></Campo>
          <Campo rotulo="Endereço da fonte (URL)" dica="Link da norma publicada."><input className={inp} value={nr.fonteUrl} onChange={(e) => setNr({ ...nr, fonteUrl: e.target.value })} /></Campo>
          <Campo rotulo="Consultada em" dica="Data em que a fonte foi consultada."><input className={inp} type="date" value={nr.consulta} onChange={(e) => setNr({ ...nr, consulta: e.target.value })} /></Campo>
          <Campo rotulo="Vigência desde" dica="Data de início da vigência."><input className={inp} type="date" value={nr.inicio} onChange={(e) => setNr({ ...nr, inicio: e.target.value })} /></Campo>
        </div>
        <button type="button" className="btn-3d-gold mt-3 rounded-md px-3 py-1.5 text-[12px] font-bold uppercase" data-testid="fin-add-regra" onClick={() => agir.mutate({ path: "/rules", body: {
          ruleKey: nr.ruleKey, tributo: nr.tributo, esfera: nr.esfera, anexo: nr.anexo || null, aliquotaPct: nr.aliquota ? Number(nr.aliquota.replace(",", ".")) : null,
          parcelaDeduzirCents: centavosDeTexto(nr.parcela), limiteMinCents: centavosDeTexto(nr.min), limiteMaxCents: centavosDeTexto(nr.max),
          fonteOficial: nr.fonteOficial || null, fonteUrl: nr.fonteUrl || null, fonteConsultadaEm: nr.consulta || null, vigenciaInicio: nr.inicio } })}>Criar rascunho de regra</button>
      </section>
    </div>
  );
}
