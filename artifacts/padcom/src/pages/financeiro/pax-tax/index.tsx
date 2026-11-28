import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Building2, FileText, History, Users } from "lucide-react";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { TrilhoAbas } from "@/components/ui/trilho-abas";
import { Switch } from "@/components/ui/switch";
import { BlockTitle } from "@/components/settings/SettingsUI";
import { Valor } from "@/components/numeral/Numeral";
import { PaginaComEmpresa } from "../SeletorEmpresa";
import { finApi, type FinAgente, type FinEntidade, type FinResumoGoals } from "@/lib/pax-finance-api";
import { Ajuda, Campo, Dado, Indicador, btnCls, btnSoftCls, campoCls, reaisParaCentavos, InputReais } from "../pax-finance-ui";
import { Regras } from "./Regras";
import { Simulador } from "./Simulador";
import { PainelTributario } from "./PainelTributario";
import { LedgerAba } from "./Ledger";
import { Laboratorio24m } from "./Laboratorio24m";
import { Conformidade } from "./Conformidade";
import { DocumentosImport } from "./DocumentosImport";
import { CnaeEmpresa } from "./CnaeEmpresa";

const PAPEL: Record<string, string> = { socio: "Sócio", administrador: "Administrador", socio_administrador: "Sócio administrador", procurador: "Procurador" };
const SIMPLES: Record<string, string> = { nao_verificada: "Não verificada", confirmada: "Confirmada", nao_optante: "Não optante" };
type Auditoria = { id: number; actorId: number | null; action: string; entity: string; criadoEm: string; detail: Record<string, unknown> };

function Origem({ docs: bruto }: { docs?: string[] | string | null }) {
  const docs = Array.isArray(bruto) ? bruto : bruto ? [String(bruto)] : [];
  if (!docs.length) return null;
  return <Ajuda texto={`Origem do dado: ${docs.join("; ")}. Conferir a página exata antes de validar.`} rotulo="Origem" />;
}

function PaxTaxCorpo() {
  const qc = useQueryClient();
  const [aba, setAba] = useState("perfil");
  const [sel, setSel] = useState<number | null>(null);
  const [erro, setErro] = useState("");
  const [lim, setLim] = useState<{ mes: string | null; ano: string | null }>({ mes: null, ano: null });
  const limites = useQuery({ queryKey: ["fin", "limites"], queryFn: () => finApi<{ anualCents: number; mensalCents: number; fonte: string }>("/limites-regime") });
  const limAuto = { mes: limites.data ? String(limites.data.mensalCents / 100) : "", ano: limites.data ? String(limites.data.anualCents / 100) : "" };
  const limV = { mes: lim.mes ?? limAuto.mes, ano: lim.ano ?? limAuto.ano };
  const [novaPessoa, setNovaPessoa] = useState({ nome: "", papel: "socio", part: "" });
  const [fiscal, setFiscal] = useState<Record<number, { regime: string; opcao: string; im: string; ie: string }>>({});

  const ents = useQuery({ queryKey: ["fin", "entities"], queryFn: () => finApi<FinEntidade[]>("/entities") });
  const mes = useQuery({ queryKey: ["fin", "tax-mes"], queryFn: () => finApi<FinResumoGoals>("/goals/summary?periodType=month") });
  const ano = useQuery({ queryKey: ["fin", "tax-12"], queryFn: () => finApi<FinResumoGoals>("/goals/summary?periodType=rolling12") });
  const agentes = useQuery({ queryKey: ["fin", "agents"], queryFn: () => finApi<FinAgente[]>("/agents"), enabled: aba === "documentos" });
  const auditoria = useQuery({ queryKey: ["fin", "audit"], queryFn: () => finApi<Auditoria[]>("/audit"), enabled: aba === "auditoria" });
  const agirM = useMutation({
    mutationFn: (a: { path: string; method?: string; body?: unknown }) => finApi(a.path, { method: a.method ?? "POST", body: a.body ?? {} }),
    onSuccess: () => { setErro(""); void qc.invalidateQueries({ queryKey: ["fin"] }); },
    onError: (e: Error) => setErro(e.message),
  });
  const agir = (a: { path: string; method?: string; body?: unknown }) => agirM.mutate(a);

  const lista = ents.data ?? [];
  const e = lista.find((x) => x.id === sel) ?? lista[0];
  const fx = e ? (fiscal[e.id] ?? { regime: e.regimeEfetivo ?? "", opcao: e.opcaoSimples, im: e.inscricaoMunicipal ?? "", ie: e.inscricaoEstadual ?? "" }) : null;
  const sede = e?.sede ?? {};

  const recMes = mes.data?.conceitos.recebidoCents ?? null;
  const rec12 = ano.data?.conceitos.recebidoCents ?? null;
  const semaforo = (valor: number | null, limTxt: string) => {
    const l = reaisParaCentavos(limTxt);
    if (valor === null || !l) return { rotulo: "Defina o limite", cls: "bevel-3d", pct: null as number | null };
    const pct = (valor / l) * 100;
    return pct >= 100 ? { rotulo: "Acima do limite", cls: "bevel-3d text-destructive", pct } : pct >= 80 ? { rotulo: "Atenção", cls: "bevel-3d paxter-alert", pct } : { rotulo: "Dentro do limite", cls: "bevel-3d-ok", pct };
  };
  const sm = semaforo(recMes, limV.mes), sa = semaforo(rec12, limV.ano);

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-3 md:p-4" data-testid="pax-tax">
      <header className="panel-3d p-4">
        <h1 className="text-[20px] font-bold uppercase tracking-wide">Impostos & CNPJs — Gestão Tributária, Multi-CNPJ e Simulações</h1>
        <p className="mt-1 text-[12px] text-muted-foreground">Cadastro fiscal por CNPJ, regras com versão e simulações. Dados vindos de documentos entram como rascunho e só valem após conferência humana. Nada aqui emite nota, guia ou cobrança.</p>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
          <Campo rotulo="CNPJ" ajuda="Cada CNPJ tem cadastro, sócios e simulações próprios. Só aparecem CNPJs desta empresa da sessão.">
            <select className={campoCls} value={e?.id ?? ""} onChange={(x) => setSel(Number(x.target.value))} data-testid="tax-cnpj">
              {lista.length === 0 && <option value="">Nenhum CNPJ cadastrado</option>}
              {lista.map((x) => <option key={x.id} value={x.id}>{x.cnpj} — {x.razaoSocial}</option>)}
            </select>
          </Campo>
          <Campo rotulo="Status fiscal" ajuda="Rascunho = ainda não conferido por uma pessoa. Validado = conferido, com registro de quem e quando.">
            <div className={`${campoCls} flex items-center font-bold uppercase`} data-testid="tax-status">{e ? (e.statusValidacao === "validado" ? "Validado por humano" : "Rascunho — aguardando conferência") : "—"}</div>
          </Campo>
          <div className="flex items-end gap-2">
            {lista.length === 0 && <button type="button" className={btnCls} data-testid="tax-seed" title="Carrega os dados dos 3 documentos da PADUMANN como rascunho" onClick={() => agir({ path: "/entities/seed-padumann" })}>Carregar rascunho PADUMANN</button>}
            {e && e.statusValidacao !== "validado" && <button type="button" className={btnSoftCls} data-testid="tax-validar" onClick={() => agir({ path: `/entities/${e.id}/validate` })}>Validar após conferir</button>}
          </div>
        </div>
        {erro && <p className="mt-2 rounded bg-destructive/10 p-2 text-[12px] text-destructive" data-testid="fin-erro">{erro}</p>}
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="tax-cards">
        <Indicador rotulo="Regime" ajuda="Regime em que a empresa realmente está. Só é preenchido com documento." texto={<Dado v={e?.regimeEfetivo} vazio="Aguardando documento" />} />
        <Indicador rotulo="CNAE principal" ajuda="Atividade econômica principal do CNPJ." texto={<Dado v={e?.cnaePrincipal} />} nota={e?.cnaePrincipalDescricao ?? undefined} />
        <Indicador rotulo="Recebido 12 meses" ajuda="Soma do que entrou nos últimos 12 meses. É caixa e serve só de referência: o RBT12 oficial usa a receita bruta por competência." centavos={rec12} nota="Referência (caixa)" />
        <Indicador rotulo="Alíquota efetiva" ajuda="Só aparece quando há regra aprovada ativa. Veja a aba Simuladores." texto={<Dado v={null} vazio="Aguardando regra aprovada" />} />
        <Indicador rotulo="ISS" ajuda="Imposto municipal sobre serviços. Depende da alíquota do município, que ainda não foi informada." texto={<Dado v={null} vazio="Não informado" />} />
        <Indicador rotulo="DAS" ajuda="Guia única do Simples Nacional. Ainda não há apuração." texto={<Dado v={null} vazio="Sem apuração" />} />
        <Indicador rotulo="Folha / contribuições" ajuda="Folha de pagamento e encargos. Ainda sem documento." texto={<Dado v={null} vazio="Aguardando documento" />} />
        <Indicador rotulo="Pendências" ajuda="Itens que impedem validar o cadastro." texto={<b>{e ? [e.regimeEfetivo ? 0 : 1, e.inscricaoMunicipal ? 0 : 1, e.opcaoSimples === "nao_verificada" ? 1 : 0, e.statusValidacao === "validado" ? 0 : 1].reduce((a, b) => a + b, 0) : "—"}</b>} />
      </div>

      <section className="panel-3d p-4" data-testid="tax-semaforo">
        <BlockTitle icon={AlertTriangle} trailing={<Ajuda texto="Compara o que entrou com o limite do Simples Nacional (já preenchido pelo sistema; você pode trocar para testar)." />}>Semáforo de faturamento</BlockTitle>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {[{ r: "Mês atual", v: recMes, l: limV.mes, k: "mes" as const, s: sm }, { r: "Últimos 12 meses (RBT12 de referência)", v: rec12, l: limV.ano, k: "ano" as const, s: sa }].map((x) => (
            <div key={x.k} className="panel-3d-sub space-y-2 p-3">
              <div className="flex items-center justify-between text-[12px]"><b>{x.r}</b><span className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase ${x.s.cls}`} data-testid={`semaforo-${x.k}`}>{x.s.rotulo}</span></div>
              <div className="text-[18px]"><Valor valor={x.v === null ? null : x.v / 100} semCentavos /></div>
              <Campo rotulo="Limite (R$)" ajuda={limites.data?.fonte ?? "Limite do Simples Nacional."}><InputReais className={campoCls}  value={x.l} onChange={(ev) => setLim({ ...lim, [x.k]: ev.target.value })} placeholder="Aguardando verificação" /></Campo>
            </div>))}
        </div>
        <p className="mt-3 rounded bg-muted p-2 text-[12px]" data-testid="tax-risco-societario"><b>Risco de vínculos societários:</b> sócios com participação em outras empresas podem alterar o enquadramento e somar limites. Confira os vínculos de cada sócio antes de confirmar o regime. O sistema ainda não cruza esses vínculos sozinho.</p>
      </section>

      <Tabs value={aba} onValueChange={setAba}>
        <TrilhoAbas rotulo="Seções de Impostos & CNPJs" testidPrefixo="tax-aba" itens={[
          { value: "perfil", label: "Perfil da empresa", grupo: "a" }, { value: "socios", label: "Sócios e responsáveis", grupo: "a" },
          { value: "parametros", label: "Parâmetros e alíquotas", grupo: "b" }, { value: "simuladores", label: "Simuladores", grupo: "b" },
          { value: "documentos", label: "Documentos e inteligências", grupo: "c" }, { value: "lab", label: "Simulação 24 meses", grupo: "c" }, { value: "ledger", label: "Fechamento do Mês", grupo: "c" }, { value: "auditoria", label: "Auditoria e histórico", grupo: "d" },
        ]} />

        <TabsContent value="perfil" className="mt-3 space-y-4">
          {!e ? <div className="panel-3d-sub p-3 text-[12px]" data-testid="tax-vazio">Nenhum CNPJ cadastrado nesta empresa. Use “Carregar rascunho PADUMANN” acima ou cadastre manualmente.</div> : (
            <section className="panel-3d p-4" data-testid="tax-perfil">
              <BlockTitle icon={Building2}>Perfil — {e.razaoSocial}</BlockTitle>
              <p className="mb-3 text-[12px] text-muted-foreground">Rascunho a partir dos documentos. O ícone de ajuda de cada campo mostra o documento de origem. Nenhum dado pessoal (CPF, RG, endereço residencial) é guardado aqui.</p>
              <dl className="grid grid-cols-1 gap-3 text-[13px] md:grid-cols-3">
                {([
                  ["CNPJ", e.cnpj + (e.cnpjValido ? "" : " (dígitos inválidos)"), "cnpj"], ["Constituição", e.dataConstituicao ? e.dataConstituicao.split("-").reverse().join("/") : null, "dataConstituicao"],
                  ["Natureza jurídica", e.naturezaJuridica, "naturezaJuridica"], ["Porte", e.porte, "porte"],
                  ["Capital social", e.capitalSocialCents === null ? null : <Valor key="c" valor={e.capitalSocialCents / 100} />, "capitalSocial"], ["Capital integralizado", e.capitalIntegralizado === null ? null : e.capitalIntegralizado ? "Sim" : "Não", "capitalIntegralizado"],
                  ["Sede", sede.logradouro ? `${sede.logradouro}, ${sede.numero}, ${sede.complemento} — ${sede.bairro}, ${sede.municipio}/${sede.uf}, CEP ${sede.cep}` : null, "sede"],
                  ["CNAE principal", e.cnaePrincipal ? `${e.cnaePrincipal} — ${e.cnaePrincipalDescricao ?? ""}` : null, "cnaePrincipal"],
                ] as [string, React.ReactNode, string][]).map(([r, v, k]) => (
                  <div key={r} className="panel-3d-sub p-3"><dt className="flex items-center gap-1 text-[10px] font-bold uppercase text-muted-foreground">{r}<Origem docs={e.origemCampos[k]} /></dt><dd className="mt-1"><Dado v={v} /></dd></div>
                ))}
              </dl>
              <div className="mt-3 panel-3d-sub p-3" data-testid="tax-cnaes">
                <div className="flex items-center gap-1 text-[10px] font-bold uppercase text-muted-foreground">CNAEs secundários ({e.cnaesSecundarios.length})<Origem docs={e.origemCampos.cnaesSecundarios} /></div>
                <div className="mt-2 flex flex-wrap gap-1.5">{e.cnaesSecundarios.map((c) => <span key={c} className="bevel-3d rounded px-2 py-0.5 text-[11px]">{c}</span>)}</div>
              </div>
              {fx && (
                <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-4">
                  <Campo rotulo="Regime efetivo" ajuda="Regime em que a empresa está de fato. Preencha só com documento."><input className={campoCls} value={fx.regime} placeholder="Aguardando documento" onChange={(ev) => setFiscal({ ...fiscal, [e.id]: { ...fx, regime: ev.target.value } })} /></Campo>
                  <Campo rotulo="Opção pelo Simples" ajuda="O comprovante de CNPJ não prova a opção. Confirme no Portal do Simples Nacional."><select className={campoCls} value={fx.opcao} onChange={(ev) => setFiscal({ ...fiscal, [e.id]: { ...fx, opcao: ev.target.value } })}>{Object.entries(SIMPLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Campo>
                  <Campo rotulo="Inscrição municipal" ajuda="Número na prefeitura. Ainda não informado."><input className={campoCls} value={fx.im} placeholder="Não informado" onChange={(ev) => setFiscal({ ...fiscal, [e.id]: { ...fx, im: ev.target.value } })} /></Campo>
                  <Campo rotulo="Inscrição estadual" ajuda="Número na Secretaria da Fazenda, quando existir."><input className={campoCls} value={fx.ie} placeholder="Não informado" onChange={(ev) => setFiscal({ ...fiscal, [e.id]: { ...fx, ie: ev.target.value } })} /></Campo>
                </div>
              )}
              {fx && <button type="button" className={`${btnCls} mt-3`} data-testid="tax-salvar-fiscal" title="Salvar volta o cadastro para rascunho" onClick={() => agir({ path: `/entities/${e.id}`, method: "PUT", body: { cnpj: e.cnpj, razaoSocial: e.razaoSocial, nomeFantasia: null, dataConstituicao: e.dataConstituicao, naturezaJuridica: e.naturezaJuridica, porte: e.porte, capitalSocialCents: e.capitalSocialCents, cnaePrincipal: e.cnaePrincipal, regimeEfetivo: fx.regime || null, opcaoSimples: fx.opcao, inscricaoMunicipal: fx.im || null, inscricaoEstadual: fx.ie || null } })}>Salvar como rascunho</button>}
            </section>
          )}
        </TabsContent>

        <TabsContent value="socios" className="mt-3">
          <section className="panel-3d p-4" data-testid="tax-socios">
            <BlockTitle icon={Users}>Sócios e responsáveis</BlockTitle>
            {!e ? <p className="text-[12px] italic text-muted-foreground">Selecione ou cadastre um CNPJ.</p> : (<>
              <div className="space-y-2">{e.pessoas.map((p) => (
                <div key={p.id} className="panel-3d-sub flex flex-wrap items-center justify-between gap-2 p-3 text-[13px]" data-testid="tax-pessoa">
                  <div><b>{p.nome}</b><br /><span className="text-[12px] text-muted-foreground">{PAPEL[p.papel] ?? p.papel}{p.registroProfissional ? ` · ${p.registroProfissional}` : ""}</span></div>
                  <div className="text-right text-[12px]">Participação: {p.participacaoBp === null ? <i className="text-muted-foreground">não é sócio / não informada</i> : <b>{(p.participacaoBp / 100).toLocaleString("pt-BR")}%</b>}<Origem docs={p.origemDoc.documentos} /><br />{p.statusValidacao === "validado" ? "validado" : "rascunho"}</div>
                </div>))}
                {e.pessoas.length === 0 && <p className="text-[12px] italic text-muted-foreground">Nenhuma pessoa cadastrada.</p>}
              </div>
              <div className="mt-4 grid grid-cols-1 items-end gap-3 md:grid-cols-4">
                <Campo rotulo="Nome" ajuda="Nome da pessoa. Não digite CPF nem RG."><input className={campoCls} value={novaPessoa.nome} onChange={(ev) => setNovaPessoa({ ...novaPessoa, nome: ev.target.value })} /></Campo>
                <Campo rotulo="Papel" ajuda="Função no contrato social."><select className={campoCls} value={novaPessoa.papel} onChange={(ev) => setNovaPessoa({ ...novaPessoa, papel: ev.target.value })}>{Object.entries(PAPEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Campo>
                <Campo rotulo="Participação (%)" ajuda="Deixe vazio se não é sócio."><input className={campoCls} inputMode="decimal" value={novaPessoa.part} onChange={(ev) => setNovaPessoa({ ...novaPessoa, part: ev.target.value })} /></Campo>
                <button type="button" className={btnCls} onClick={() => agir({ path: `/entities/${e.id}/people`, body: { nome: novaPessoa.nome, papel: novaPessoa.papel, participacaoBp: novaPessoa.part ? Math.round(Number(novaPessoa.part.replace(",", ".")) * 100) : null } })}>Adicionar</button>
              </div>
            </>)}
          </section>
          {e && <div className="mt-4"><Conformidade entidadeId={e.id} /></div>}
        </TabsContent>

        <TabsContent value="parametros" className="mt-3"><Regras agir={agir} /></TabsContent>
        <TabsContent value="simuladores" className="mt-3 space-y-4">
          <PainelTributario />
          <details className="panel-3d-sub p-3" data-testid="sim-por-regras"><summary className="min-h-[44px] cursor-pointer text-[12px] font-bold uppercase leading-[44px] md:min-h-0 md:leading-normal">Simulador antigo por regras cadastradas (aba Parâmetros)</summary><div className="mt-3"><Simulador /></div></details>
        </TabsContent>

        <TabsContent value="documentos" className="mt-3">
          <section className="panel-3d p-4" data-testid="tax-documentos">
            <BlockTitle icon={FileText}>Documentos e inteligências</BlockTitle>
            <DocumentosImport />
            <CnaeEmpresa />
            <p className="my-3 text-[12px]"><b>Ainda não implementado:</b> envio de imagem, XML, CSV, XLSX e OFX financeiros, e extração financeira. Nenhum documento financeiro real é enviado a provedores de inteligência artificial.</p>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              {(agentes.data ?? []).map((a) => (
                <div key={a.id} className="panel-3d-sub flex items-center justify-between gap-3 p-3 text-[12px]" data-testid="tax-ia">
                  <div><b>{a.nome}</b><br /><span className="text-muted-foreground" data-testid={`ia-estado-${a.id}`}>{a.estado === "nao_auditado" ? "NÃO AUDITADO" : "Não configurado"}: {a.motivo}</span></div>
                  <Switch checked={false} disabled aria-label={`${a.nome} (bloqueada: ${a.motivo})`} />
                </div>))}
              {agentes.isError && <p className="text-[12px] text-destructive">{(agentes.error as Error).message}</p>}
            </div>
          </section>
        </TabsContent>

        <TabsContent value="lab" className="mt-3"><Laboratorio24m /></TabsContent>

        <TabsContent value="ledger" className="mt-3"><LedgerAba /></TabsContent>

        <TabsContent value="auditoria" className="mt-3">
          <section className="panel-3d p-4" data-testid="tax-auditoria">
            <BlockTitle icon={History}>Auditoria e histórico</BlockTitle>
            <ul className="space-y-1.5 text-[12px]">{(auditoria.data ?? []).map((a) => (
              <li key={a.id} className="panel-3d-sub flex flex-wrap justify-between gap-2 p-2"><span><b>{a.action}</b> · {a.entity}</span><span className="text-muted-foreground">{new Date(a.criadoEm).toLocaleString("pt-BR")} · usuário {a.actorId ?? "—"}</span></li>))}
              {auditoria.data?.length === 0 && <li className="italic text-muted-foreground">Nenhum registro ainda.</li>}</ul>
          </section>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function PaxTax() {
  return <PaginaComEmpresa>{() => <PaxTaxCorpo />}</PaginaComEmpresa>;
}
