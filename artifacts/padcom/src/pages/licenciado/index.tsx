import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { clearCollabSession, collabAuthHeaders } from "@/lib/collab-auth";
import paxmedWordmark from "../../../../api-server/assets/paxmed-wordmark.png";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const ABAS = ["Planos e Módulos", "Tarifas e Créditos", "Custos e Margem", "Integrações e IA", "Piloto e Evidências"] as const;
type Aba = typeof ABAS[number];
type Linha = Record<string, any>;
type Catalogo = { planos: Linha[]; itens: Linha[]; tarifas: Linha[]; custos: Linha[]; config: Record<string, any> };
const dinheiro = (centavos?: number | null) => centavos == null ? "não informado" : (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const reaisParaCentavos = (v: string) => Math.round(Number(v.replace(",", ".")) * 100);

async function requisicao<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${BASE}/api${path}`, {
    ...init,
    headers: collabAuthHeaders({ "Content-Type": "application/json", ...(init.headers as Record<string, string> ?? {}) }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Falha ao consultar o servidor (${response.status}).`);
  return body as T;
}

function Titulo({ children }: { children: React.ReactNode }) {
  return <h2 className="bevel-3d mb-3 px-3 py-2 text-sm font-bold uppercase tracking-wider text-[#18243a]">{children}</h2>;
}
function Campo({ label, value, onChange, type = "text" }: { label: string; value: string | number; onChange: (v: string) => void; type?: string }) {
  return <label className="block text-xs font-semibold text-slate-600">{label}<input type={type} value={value ?? ""} onChange={(e) => onChange(e.target.value)} className="field-engraved mt-1 w-full rounded-[4px] px-3 py-2 text-sm text-slate-900" /></label>;
}
function Estado({ children, tom = "neutro" }: { children: React.ReactNode; tom?: "neutro" | "ok" | "alerta" }) {
  const cls = tom === "ok" ? "border-emerald-300 bg-emerald-50 text-emerald-800" : tom === "alerta" ? "border-amber-300 bg-amber-50 text-amber-900" : "border-slate-300 bg-slate-50 text-slate-700";
  return <span className={`inline-flex rounded-[4px] border px-2 py-1 text-xs font-semibold ${cls}`}>{children}</span>;
}

export default function Licenciado() {
  const [, setLocation] = useLocation();
  const [aba, setAba] = useState<Aba>(ABAS[0]);
  const [catalogo, setCatalogo] = useState<Catalogo | null>(null);
  const [margem, setMargem] = useState<any>(null);
  const [credenciais, setCredenciais] = useState<Linha[]>([]);
  const [contratos, setContratos] = useState<Linha[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [salvando, setSalvando] = useState("");
  const [cambio, setCambio] = useState("");
  const [sandboxApiKey, setSandboxApiKey] = useState("");
  const [sandboxWebhook, setSandboxWebhook] = useState("");
  const [modo, setModo] = useState<"admin" | "clinica">("admin");
  const [visaoClinica, setVisaoClinica] = useState<Linha | null>(null);
  const [condicaoContrato, setCondicaoContrato] = useState<"mensal" | "anual_antecipado">("mensal");

  const carregar = useCallback(async () => {
    setCarregando(true); setErro("");
    try {
      if (modo === "clinica") {
        setVisaoClinica(null);
        setVisaoClinica(await requisicao<Linha>("/catalogo/minha-clinica"));
        return;
      }
      const [c, m, v, k] = await Promise.all([
        requisicao<Catalogo>("/catalogo/admin"),
        requisicao<any>("/catalogo/admin/margem"),
        requisicao<{ credenciais: Linha[] }>("/cofre/estado"),
        requisicao<Linha[]>("/catalogo/admin/contratos"),
      ]);
      setCatalogo(c); setMargem(m); setCredenciais(v.credenciais); setContratos(k);
      setCambio(c.config?.cambio_planejamento == null ? "" : String(c.config.cambio_planejamento));
    } catch (e) { setErro(e instanceof Error ? e.message : "Falha ao carregar os dados."); }
    finally { setCarregando(false); }
  }, [modo]);

  useEffect(() => { void carregar(); }, [carregar]);
  const sair = () => { clearCollabSession(); setLocation("/entrada"); };
  const salvar = async (id: string, path: string, body: unknown) => {
    setSalvando(id); setAviso("");
    try { await requisicao(path, { method: "PUT", body: JSON.stringify(body) }); setAviso("Alteração salva e persistida."); await carregar(); }
    catch (e) { setAviso(e instanceof Error ? e.message : "Não foi possível salvar."); }
    finally { setSalvando(""); }
  };
  const abrirContratoLemos = async (planoCodigo: string) => {
    setSalvando(`contrato-${planoCodigo}`); setAviso("");
    try {
      await requisicao("/catalogo/admin/contratos", { method: "POST", body: JSON.stringify({ empresaId: 2, planoCodigo, rotulo: "PILOTO DE HOMOLOGAÇÃO — Instituto Lemos", condicao: condicaoContrato }) });
      setAviso("Contrato de piloto criado em homologação, sem alteração fiscal ou cobrança."); await carregar();
    } catch (e) { setAviso(e instanceof Error ? e.message : "Não foi possível criar o piloto."); }
    finally { setSalvando(""); }
  };
  const salvarCredenciaisSandbox = async () => {
    if (!sandboxApiKey.trim() && !sandboxWebhook.trim()) { setAviso("Preencha a chave própria ou o token de webhook do sandbox."); return; }
    setSalvando("asaas-sandbox"); setAviso("");
    try {
      await requisicao("/settings/payment-gateway/sandbox", { method: "PUT", body: JSON.stringify({ apiKey: sandboxApiKey, webhookToken: sandboxWebhook }) });
      setSandboxApiKey(""); setSandboxWebhook("");
      setAviso("Metadados do sandbox foram atualizados no cofre cifrado. Os valores não são exibidos."); await carregar();
    } catch (e) { setAviso(e instanceof Error ? e.message : "Não foi possível salvar no cofre."); }
    finally { setSalvando(""); }
  };

  const itensPorTipo = useMemo(() => ({
    modulos: catalogo?.itens.filter((x) => x.tipo === "modulo") ?? [],
    servicos: catalogo?.itens.filter((x) => x.tipo === "servico") ?? [],
    complementos: catalogo?.itens.filter((x) => x.tipo === "complemento") ?? [],
  }), [catalogo]);

  return <div className="min-h-screen bg-[#e8edf5] text-slate-900">
    <header className="flex items-center justify-between border-b-4 border-[#e7cd8f]/50 bg-[#0a1120] px-5 py-4 text-white">
      <img src={paxmedWordmark} alt="PaxMed" width={1024} height={172} className="h-auto w-48 shrink-0" />
      <div className="flex items-center gap-3"><button onClick={() => { setVisaoClinica(null); setModo(modo === "admin" ? "clinica" : "admin"); setAviso(""); }} className="btn-3d-soft px-3 py-2 text-xs">{modo === "admin" ? "Minha Clínica" : "Administração CEO"}</button><span className="text-xs text-slate-300">{modo === "admin" ? "ADMINISTRAÇÃO COMERCIAL · HOMOLOGAÇÃO" : "VISÃO RESTRITA DA CLÍNICA"}</span><button onClick={sair} className="btn-3d-soft px-3 py-2 text-xs">Sair</button></div>
    </header>
    <main className="mx-auto max-w-7xl space-y-4 px-4 py-5 sm:px-6">
      {modo === "admin" && <section className="panel-3d p-4 sm:p-5">
        <h1 className="bevel-3d inline-flex px-4 py-2 text-lg font-bold uppercase tracking-wide">Administração de Planos e Tarifas</h1>
        <p className="mt-3 text-sm text-slate-600">Valores abaixo são propostas editáveis de homologação. Nenhuma cobrança recorrente ou integração fica ativa por estar cadastrada.</p>
        <nav className="mt-4 flex gap-2 overflow-x-auto pb-1" aria-label="Áreas de administração">
          {ABAS.map((x) => <button key={x} onClick={() => setAba(x)} aria-pressed={aba === x} className={`shrink-0 rounded-[4px] border px-3 py-2 text-xs font-bold uppercase ${aba === x ? "concave-3d border-[#b79a58] text-[#6d531c]" : "btn-3d-soft text-slate-700"}`}>{x}</button>)}
        </nav>
      </section>}
      {erro && <div role="alert" className="paxter-alert paxter-alert-amber p-4 text-sm">{erro} Se a sessão está válida e a tela segue bloqueada, a permissão de administração precisa ser conferida; não remova a autenticação.</div>}
      {aviso && <div role="status" className="paxter-alert paxter-alert-amber p-3 text-sm">{aviso}</div>}
      {carregando && <section className="panel-3d p-5 text-sm">Carregando informações salvas…</section>}

      {!carregando && modo === "clinica" && visaoClinica && <section className="space-y-4">
        <div className="panel-3d p-4"><Titulo>Meu contrato e saldo</Titulo>
          <p className="mb-3 text-xs font-semibold">{visaoClinica.ambienteCredito === "teste" ? "Carteira de teste — separada do dinheiro real" : visaoClinica.ambienteCredito === "real" ? "Carteira do ambiente real" : "Ambiente da carteira não informado"}</p>
          {visaoClinica.mensagensAguardandoRetomada > 0 && <p role="alert" className="paxter-alert paxter-alert-amber mb-3 p-3 text-sm">Há mensagens já cobradas aguardando conferência para retomada; não faça nova recarga para tentar reenviá-las.</p>}
          {visaoClinica.contrato ? <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <div className="concave-3d p-3 text-sm"><b>Plano</b><p>{visaoClinica.contrato.plano ?? "—"}</p></div>
            <div className="concave-3d p-3 text-sm"><b>Ambiente</b><p>{visaoClinica.contrato.ambiente} · {visaoClinica.contrato.status}</p></div>
            <div className="concave-3d p-3 text-sm"><b>Mensalidade contratada</b><p>{dinheiro(visaoClinica.contrato.mensalidadeCentavos)}</p></div>
            <div className="concave-3d p-3 text-sm"><b>Condição e valor do período</b><p>{visaoClinica.contrato.condicao} · {dinheiro(visaoClinica.contrato.valorPeriodoCentavos)}</p></div>
            <div className="concave-3d p-3 text-sm"><b>Franquia incluída</b><p>{dinheiro(visaoClinica.contrato.franquiaTextoCentavos)}</p></div>
            <div className="concave-3d p-3 text-sm"><b>Saldo comprado</b><p>{dinheiro(visaoClinica.saldoCentavos)}</p><p className="mt-1 text-xs">{visaoClinica.ambienteCredito === "teste" ? "Ambiente de teste — sem saldo real" : visaoClinica.ambienteCredito === "real" ? "Ambiente real" : "Ambiente não informado"}</p></div>
            <div className="concave-3d p-3 text-sm"><b>Renovação</b><p>{visaoClinica.contrato.renovacao ?? "—"}</p></div>
            <div className="concave-3d p-3 text-sm sm:col-span-2 lg:col-span-3"><b>Módulos incluídos</b><p>{Array.isArray(visaoClinica.contrato.modulos) ? visaoClinica.contrato.modulos.join(" · ") : "—"}</p></div>
          </div> : <p className="text-sm text-slate-600">Nenhum contrato foi vinculado a esta clínica.</p>}
        </div>
        <div className="panel-3d p-4"><Titulo>Tarifas aplicáveis e recargas</Titulo>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="panel-3d-sub space-y-2 p-3"><b className="text-sm">Tarifas</b>{visaoClinica.tarifas?.map((t: Linha) => <p key={t.tipo_evento} className="concave-3d flex justify-between gap-3 p-2 text-xs"><span>{t.tipo_evento}</span><b>{dinheiro(Number(t.valor_centavos))}</b></p>)}</div>
            <div className="panel-3d-sub space-y-2 p-3"><b className="text-sm">Recargas</b>{visaoClinica.recargas?.length ? visaoClinica.recargas.map((r: Linha) => <p key={r.id} className="concave-3d flex justify-between gap-3 p-2 text-xs"><span>{r.ambiente} · {r.status}</span><b>{dinheiro(Number(r.valor_centavos))}</b></p>) : <p className="text-xs text-slate-500">Nenhuma recarga registrada.</p>}</div>
          </div>
        </div>
        <div className="panel-3d p-4"><Titulo>Extrato e consumo</Titulo>
          <div className="space-y-2">{visaoClinica.extrato?.length ? visaoClinica.extrato.map((e: Linha) => <div key={e.id} className="concave-3d grid gap-1 p-3 text-xs sm:grid-cols-[8rem_1fr_8rem]"><span>{new Date(e.criado_em).toLocaleString("pt-BR")}</span><span>{e.descricao ?? e.tipo_evento ?? e.natureza} · {e.natureza}</span><b>{dinheiro(Number(e.valor_centavos))}</b></div>) : <p className="text-sm text-slate-500">Nenhum movimento no extrato.</p>}</div>
          <p className="mt-3 text-xs text-slate-500">Esta visão não apresenta custos internos do provedor nem a margem da plataforma.</p>
        </div>
      </section>}

      {!carregando && modo === "admin" && catalogo && aba === "Planos e Módulos" && <section className="space-y-4">
        <div className="panel-3d p-4"><Titulo>Planos comerciais propostos</Titulo>
          <div className="grid gap-4 lg:grid-cols-2">
            {catalogo.planos.map((p) => <article key={p.codigo} className="panel-3d-sub space-y-3 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2"><h3 className="bevel-3d px-3 py-1.5 font-bold uppercase">{p.nome}</h3><Estado tom={p.status === "ativo" ? "ok" : "alerta"}>{p.ambiente} · {p.status}</Estado></div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Campo label="Nome" value={p.nome} onChange={(v) => setCatalogo({ ...catalogo, planos: catalogo.planos.map((x) => x.codigo === p.codigo ? { ...x, nome: v } : x) })}/>
                <Campo label="Mensalidade (reais)" type="number" value={(Number(p.preco_mensal_centavos) / 100).toFixed(2)} onChange={(v) => setCatalogo({ ...catalogo, planos: catalogo.planos.map((x) => x.codigo === p.codigo ? { ...x, preco_mensal_centavos: reaisParaCentavos(v) } : x) })}/>
                <Campo label="Desconto anual (%)" type="number" value={p.desconto_anual_pct} onChange={(v) => setCatalogo({ ...catalogo, planos: catalogo.planos.map((x) => x.codigo === p.codigo ? { ...x, desconto_anual_pct: Number(v) } : x) })}/>
                <Campo label="Compromisso (meses)" type="number" value={p.compromisso_meses} onChange={(v) => setCatalogo({ ...catalogo, planos: catalogo.planos.map((x) => x.codigo === p.codigo ? { ...x, compromisso_meses: Number(v) } : x) })}/>
                <Campo label="Prescritores incluídos" type="number" value={p.prescritores_incluidos} onChange={(v) => setCatalogo({ ...catalogo, planos: catalogo.planos.map((x) => x.codigo === p.codigo ? { ...x, prescritores_incluidos: Number(v) } : x) })}/>
                <Campo label="Unidades incluídas" type="number" value={p.unidades_incluidas} onChange={(v) => setCatalogo({ ...catalogo, planos: catalogo.planos.map((x) => x.codigo === p.codigo ? { ...x, unidades_incluidas: Number(v) } : x) })}/>
                <Campo label="Franquia mensal de texto (reais)" type="number" value={(Number(p.franquia_texto_centavos) / 100).toFixed(2)} onChange={(v) => setCatalogo({ ...catalogo, planos: catalogo.planos.map((x) => x.codigo === p.codigo ? { ...x, franquia_texto_centavos: reaisParaCentavos(v) } : x) })}/>
                <Campo label="Fim da validade da proposta" type="date" value={p.validade_proposta ?? ""} onChange={(v) => setCatalogo({ ...catalogo, planos: catalogo.planos.map((x) => x.codigo === p.codigo ? { ...x, validade_proposta: v || null } : x) })}/>
                <Campo label="Início da vigência" type="date" value={p.vigencia_inicio ?? ""} onChange={(v) => setCatalogo({ ...catalogo, planos: catalogo.planos.map((x) => x.codigo === p.codigo ? { ...x, vigencia_inicio: v || null } : x) })}/>
                <Campo label="Fim da vigência" type="date" value={p.vigencia_fim ?? ""} onChange={(v) => setCatalogo({ ...catalogo, planos: catalogo.planos.map((x) => x.codigo === p.codigo ? { ...x, vigencia_fim: v || null } : x) })}/>
                <label className="block text-xs font-semibold text-slate-600">Status<select value={p.status} onChange={(e) => setCatalogo({ ...catalogo, planos: catalogo.planos.map((x) => x.codigo === p.codigo ? { ...x, status: e.target.value } : x) })} className="field-engraved mt-1 w-full rounded-[4px] px-3 py-2 text-sm text-slate-900"><option value="proposta">Proposta</option><option value="rascunho">Rascunho</option><option value="ativo">Ativo</option><option value="inativo">Inativo</option></select></label>
              </div>
              <Campo label="Descrição" value={p.descricao ?? ""} onChange={(v) => setCatalogo({ ...catalogo, planos: catalogo.planos.map((x) => x.codigo === p.codigo ? { ...x, descricao: v } : x) })}/>
              <Campo label="Condição anual" value={p.condicao_anual ?? ""} onChange={(v) => setCatalogo({ ...catalogo, planos: catalogo.planos.map((x) => x.codigo === p.codigo ? { ...x, condicao_anual: v } : x) })}/>
              <Campo label="Observações" value={p.observacoes ?? ""} onChange={(v) => setCatalogo({ ...catalogo, planos: catalogo.planos.map((x) => x.codigo === p.codigo ? { ...x, observacoes: v } : x) })}/>
              <p className="text-xs text-slate-500">Proposta: {p.proposta_ref ?? "—"} · data: {p.proposta_data ?? "—"} · versão: {p.versao}</p>
              <details className="concave-3d p-3"><summary className="cursor-pointer text-xs font-semibold">Módulos incluídos</summary><div className="mt-2 grid gap-2 sm:grid-cols-2">
                {itensPorTipo.modulos.map((m) => <label key={m.codigo} className="flex items-start gap-2 text-xs"><input type="checkbox" checked={(p.modulos ?? []).includes(m.codigo)} onChange={(e) => {
                  const modulos = e.target.checked ? [...new Set([...(p.modulos ?? []), m.codigo])] : (p.modulos ?? []).filter((x: string) => x !== m.codigo);
                  setCatalogo({ ...catalogo, planos: catalogo.planos.map((x) => x.codigo === p.codigo ? { ...x, modulos } : x) });
                }}/>{m.nome}</label>)}
              </div></details>
              <div className="concave-3d grid gap-1 p-3 text-xs sm:grid-cols-3">
                <span>Mensal: <b>{dinheiro(p.financeiro.mensalidadeCentavos)}</b></span>
                <span>Total anual antecipado: <b>{dinheiro(p.financeiro.totalAnualAntecipadoCentavos)}</b></span>
                <span>Equivalente mensal: <b>{dinheiro(p.financeiro.equivalenteMensalAnualCentavos)}</b></span>
                <span>Prescritores: {p.prescritores_incluidos}</span><span>Unidades: {p.unidades_incluidas}</span><span>Módulos: {p.modulos?.length ?? 0}</span>
              </div>
              {p.observacoes && <p className="text-xs text-amber-900">{p.observacoes}</p>}
              <button disabled={!!salvando} onClick={() => void salvar(`plano-${p.codigo}`, `/catalogo/admin/planos/${p.codigo}`, {
                nome: p.nome, preco_mensal_centavos: p.preco_mensal_centavos, desconto_anual_pct: p.desconto_anual_pct,
                compromisso_meses: p.compromisso_meses, prescritores_incluidos: p.prescritores_incluidos,
                unidades_incluidas: p.unidades_incluidas, franquia_texto_centavos: p.franquia_texto_centavos,
                validade_proposta: p.validade_proposta || null, descricao: p.descricao ?? null,
                condicao_anual: p.condicao_anual ?? null, observacoes: p.observacoes ?? null,
                vigencia_inicio: p.vigencia_inicio || null, vigencia_fim: p.vigencia_fim || null,
                status: p.status, modulos: p.modulos,
              })} className="btn-3d px-4 py-2 text-xs font-bold uppercase">{salvando === `plano-${p.codigo}` ? "Salvando…" : "Salvar plano"}</button>
            </article>)}
          </div>
        </div>
        {[["Módulos e adicionais", itensPorTipo.modulos], ["Serviços não recorrentes", itensPorTipo.servicos], ["Complementos", itensPorTipo.complementos]].map(([titulo, itens]) => <div key={titulo as string} className="panel-3d p-4">
          <Titulo>{titulo as string}</Titulo><div className="grid gap-3 md:grid-cols-2">
            {(itens as Linha[]).map((i) => <article key={i.codigo} className="panel-3d-sub grid gap-2 p-3 sm:grid-cols-[1fr_9rem_8rem] sm:items-end">
              <div><b className="text-sm">{i.nome}</b><p className="text-xs text-slate-500">{i.unidade} · {i.recorrencia} · {i.disponibilidade}</p></div>
              <Campo label="Preço (reais)" type="number" value={i.preco_centavos == null ? "" : (Number(i.preco_centavos) / 100).toFixed(2)} onChange={(v) => setCatalogo({ ...catalogo, itens: catalogo.itens.map((x) => x.codigo === i.codigo ? { ...x, preco_centavos: v === "" ? null : reaisParaCentavos(v) } : x) })}/>
              <button disabled={!!salvando} onClick={() => void salvar(`item-${i.codigo}`, `/catalogo/admin/itens/${i.codigo}`, { preco_centavos: i.preco_centavos })} className="btn-3d-soft px-3 py-2 text-xs font-bold">Salvar</button>
            </article>)}
          </div>
        </div>)}
      </section>}

      {!carregando && modo === "admin" && catalogo && aba === "Tarifas e Créditos" && <section className="panel-3d p-4">
        <Titulo>Tarifas, regras e disponibilidade</Titulo><p className="mb-3 text-xs text-slate-600">Custo de envio só é cobrável após aceite do provedor; falha de envio e transferência para atendente não são consumo solucionado.</p>
        <div className="space-y-3">{catalogo.tarifas.map((t) => <TarifaEditor key={t.codigo} tarifa={t} salvando={salvando === `tarifa-${t.codigo}`} onSave={(body) => void salvar(`tarifa-${t.codigo}`, `/catalogo/admin/tarifas/${t.codigo}`, body)}/>)}</div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="panel-3d-sub p-4"><b>Opções de recarga configuradas</b><p className="mt-2 text-sm">{(catalogo.config.recargas_sugeridas_centavos ?? []).map((v: number) => dinheiro(v)).join(" · ") || "não configuradas"}</p><p className="mt-1 text-xs text-slate-500">Sem bônus e sem renovação automática. Crédito comprado sem vencimento automático.</p></div>
          <div className="panel-3d-sub p-4"><b>Alertas de uso da franquia</b><p className="mt-2 text-sm">{(catalogo.config.alertas_pct ?? []).map((v: number) => `${v}%`).join(" · ") || "não configurados"} · {catalogo.config.alerta_saldo_zero ? "saldo zero" : "sem alerta de saldo zero"}</p><p className="mt-1 text-xs text-slate-500">A franquia elegível do plano é consumida antes do crédito comprado.</p></div>
        </div>
      </section>}

      {!carregando && modo === "admin" && catalogo && aba === "Custos e Margem" && <section className="space-y-4">
        <div className="panel-3d p-4"><Titulo>Parâmetros editáveis de planejamento</Titulo>
          <div className="grid gap-3 sm:grid-cols-3">
            <Campo label="Câmbio efetivo (reais por dólar)" type="number" value={catalogo.config.cambio_efetivo ?? ""} onChange={(v) => setCatalogo({ ...catalogo, config: { ...catalogo.config, cambio_efetivo: v === "" ? null : Number(v) } })}/>
            <Campo label="Câmbio para hipótese de planejamento" type="number" value={cambio} onChange={setCambio}/>
            <Campo label="Margem-alvo (%)" type="number" value={catalogo.config.margem_alvo_pct ?? ""} onChange={(v) => setCatalogo({ ...catalogo, config: { ...catalogo.config, margem_alvo_pct: Number(v) } })}/>
          </div>
          <p className="mt-2 text-xs text-amber-900">Câmbio de planejamento é hipótese. Custo efetivo, impostos, infraestrutura e suporte não informados bloqueiam margem real.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button disabled={!!salvando} onClick={() => void salvar("config-fx-efetivo", "/catalogo/admin/config/cambio_efetivo", { valor: String(catalogo.config.cambio_efetivo ?? "").trim() === "" ? null : Number(catalogo.config.cambio_efetivo) })} className="btn-3d-soft px-3 py-2 text-xs">Salvar câmbio efetivo informado</button>
            <button disabled={!!salvando} onClick={() => void salvar("config-fx", "/catalogo/admin/config/cambio_planejamento", { valor: cambio === "" ? null : Number(cambio) })} className="btn-3d-soft px-3 py-2 text-xs">Salvar câmbio de hipótese</button>
            <button disabled={!!salvando} onClick={() => void salvar("config-margem", "/catalogo/admin/config/margem_alvo_pct", { valor: Number(catalogo.config.margem_alvo_pct) })} className="btn-3d-soft px-3 py-2 text-xs">Salvar margem-alvo</button>
          </div>
        </div>
        <div className="panel-3d p-4"><Titulo>Custos informados e cenários</Titulo>
          <div className="grid gap-3 md:grid-cols-2">{margem?.linhas?.map((l: any) => {
            const custo = catalogo.custos.find((x) => x.codigo === l.custoCodigo);
            return custo ? <CustoEditor key={l.custoCodigo} custo={custo} margem={l} salvando={salvando === `custo-${custo.codigo}`} onSave={(body) => void salvar(`custo-${custo.codigo}`, `/catalogo/admin/custos/${custo.codigo}`, body)}/> : null;
          })}</div>
          <p className="mt-3 text-sm text-amber-900">{margem?.aviso}</p>
        </div>
      </section>}

      {!carregando && modo === "admin" && aba === "Integrações e IA" && <section className="panel-3d p-4">
        <Titulo>Credenciais e ambiente</Titulo>
        <p className="mb-3 text-sm text-slate-600">São exibidos apenas estado configurado, ambiente, validade e data da verificação. O valor secreto nunca é mostrado.</p>
        {!credenciais.length ? <p className="text-sm">Estado indisponível; tente recarregar.</p> : <div className="grid gap-3 md:grid-cols-2">
          {credenciais.map((c) => <article key={c.chave} className="panel-3d-sub grid gap-2 p-3 sm:grid-cols-[1fr_auto]">
            <div><b className="text-sm">{c.rotulo}</b><p className="text-xs text-slate-600">Ambiente: {c.ambiente} · Origem: {c.origem ?? "não configurada"}</p>
              <p className="text-xs">Configurada: {c.configurada ? "sim" : "não"} · Validade: {c.validade}</p>
              <p className="text-xs">Verificada em: {c.verificadaEm ? new Date(c.verificadaEm).toLocaleString("pt-BR") : "não verificada"}</p>
              {c.rotacao === "pendente" && <p className="text-xs font-semibold text-amber-900">Rotação pendente: exige troca pelo titular no provedor e gravação protegida.</p>}
            </div>
            <Estado tom={c.configurada && c.validade === "valida" ? "ok" : "alerta"}>{c.rotacao === "pendente" ? "rotação pendente" : c.validade}</Estado>
          </article>)}
        </div>}
        <div className="mt-4 rounded-[4px] border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
          <b>Asaas Sandbox:</b> chave {credenciais.find((c) => c.chave === "asaas.sandbox.apiKey")?.configurada ? "guardada no cofre" : "não configurada"}; webhook {credenciais.find((c) => c.chave === "asaas.sandbox.webhookToken")?.configurada ? "guardado no cofre" : "não configurado"}. A produção permanece isolada. Nenhuma cobrança de teste foi criada.
        </div>
        <div className="panel-3d-sub mt-4 space-y-3 p-4">
          <h3 className="bevel-3d px-3 py-2 text-xs font-bold uppercase">Atualizar credenciais próprias do sandbox</h3>
          <p className="text-xs text-slate-600">A chave deve vir da conta independente do sandbox. Não cole credenciais neste chat. Os campos vazios não substituem o valor guardado.</p>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-xs font-semibold text-slate-700">Chave de API do sandbox
              <input type="password" autoComplete="new-password" value={sandboxApiKey} onChange={(e) => setSandboxApiKey(e.target.value)} className="field-engraved mt-1 w-full rounded-[4px] px-3 py-2 text-sm" placeholder="Cole aqui a chave da conta sandbox" />
            </label>
            <label className="text-xs font-semibold text-slate-700">Token do webhook sandbox
              <input type="password" autoComplete="new-password" value={sandboxWebhook} onChange={(e) => setSandboxWebhook(e.target.value)} className="field-engraved mt-1 w-full rounded-[4px] px-3 py-2 text-sm" placeholder="Segredo definido na configuração do webhook sandbox" />
            </label>
          </div>
          <button disabled={!!salvando} onClick={() => void salvarCredenciaisSandbox()} className="btn-3d px-4 py-2 text-xs font-bold uppercase">{salvando === "asaas-sandbox" ? "Salvando…" : "Salvar no cofre cifrado"}</button>
        </div>
      </section>}

      {!carregando && modo === "admin" && catalogo && aba === "Piloto e Evidências" && <section className="space-y-4">
        <div className="panel-3d p-4"><Titulo>Piloto Instituto Lemos · empresa existente 2</Titulo>
          <p className="text-sm text-slate-600">A clínica não será duplicada. Contrato abaixo é uma proposta de homologação; não altera dados fiscais nem histórico.</p>
          {contratos.filter((c) => Number(c.empresa_id) === 2).map((c) => <div key={c.id} className="concave-3d mt-3 p-3 text-sm">Contrato {c.rotulo} · {c.ambiente} · {c.status} · {dinheiro(Number(c.preco_mensal_centavos))}</div>)}
          <label className="mt-3 block max-w-sm text-xs font-semibold">Condição do contrato de homologação<select value={condicaoContrato} onChange={(e) => setCondicaoContrato(e.target.value as "mensal" | "anual_antecipado")} className="field-engraved mt-1 w-full rounded-[4px] px-3 py-2 text-sm text-slate-900"><option value="mensal">Mensal, sem renovação automática</option><option value="anual_antecipado">Anual antecipado, desconto aplicado</option></select></label>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">{catalogo.planos.map((p) => <button key={p.codigo} disabled={!!salvando || contratos.some((c) => Number(c.empresa_id) === 2 && ["piloto", "ativo"].includes(c.status))} onClick={() => void abrirContratoLemos(p.codigo)} className="btn-3d-soft px-3 py-2 text-xs font-bold">Criar contrato-piloto · {p.nome}</button>)}</div>
        </div>
        <div className="panel-3d p-4"><Titulo>Execuções e evidências</Titulo>
          <div className="grid gap-2 sm:grid-cols-2">{[
            ["Rotação do Telegram", "pendente — depende de rotação no BotFather e verificação da nova credencial"],
            ["Conta e chave Asaas sandbox", "pendente — conta sandbox independente e chave ausentes"],
            ["Webhook sandbox autêntico", "não comprovado — ainda não há credencial sandbox"],
            ["Pacientes sintéticos Lemos", "pendente — não gravar em base compartilhada antes do mecanismo isolado"],
            ["Teste de entrega Telegram", "não comprovado — nenhum envio externo executado"],
            ["Histórico de pagamentos", "preservado — sem cobrança repetida ou recarga automática"],
          ].map(([a, b]) => <div key={a} className="concave-3d grid gap-1 p-3"><b className="text-xs">{a}</b><span className="text-xs text-slate-600">{b}</span></div>)}</div>
        </div>
      </section>}
      <footer className="flex justify-end"><button onClick={() => void carregar()} className="btn-3d-soft px-4 py-2 text-xs font-bold">Recarregar dados salvos</button></footer>
    </main>
  </div>;
}

function TarifaEditor({ tarifa, salvando, onSave }: { tarifa: Linha; salvando: boolean; onSave: (body: Linha) => void }) {
  const [preco, setPreco] = useState(tarifa.preco_centavos == null ? "" : (Number(tarifa.preco_centavos) / 100).toFixed(2));
  const [ativo, setAtivo] = useState(Boolean(tarifa.ativo));
  const [disponibilidade, setDisponibilidade] = useState(tarifa.disponibilidade);
  return <article className="panel-3d-sub grid gap-3 p-3 lg:grid-cols-[minmax(12rem,1fr)_9rem_12rem_auto] lg:items-end">
    <div><b className="text-sm">{tarifa.nome_evento}</b><p className="text-xs text-slate-500">{tarifa.unidade} · {tarifa.regra_fracionamento}</p><p className="text-xs text-slate-500">{tarifa.regra_cobranca}</p></div>
    <Campo label="Preço (reais)" type="number" value={preco} onChange={setPreco}/>
    <label className="text-xs font-semibold text-slate-600">Disponibilidade<select value={disponibilidade} onChange={(e) => setDisponibilidade(e.target.value)} className="field-engraved mt-1 w-full rounded-[4px] px-2 py-2 text-xs"><option value="integrado">Integrado</option><option value="cadastrado_nao_integrado">Cadastrado, não integrado</option><option value="indisponivel">Indisponível</option></select></label>
    <div className="flex items-center gap-2"><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)}/>Ativa</label><button disabled={salvando} onClick={() => onSave({ preco_centavos: preco === "" ? null : reaisParaCentavos(preco), ativo, disponibilidade })} className="btn-3d-soft px-3 py-2 text-xs font-bold">{salvando ? "Salvando…" : "Salvar"}</button></div>
  </article>;
}

function CustoEditor({ custo, margem, salvando, onSave }: { custo: Linha; margem: Linha; salvando: boolean; onSave: (body: Linha) => void }) {
  const [referencia, setReferencia] = useState(custo.custo_referencia == null ? "" : String(custo.custo_referencia));
  const [referenciaSaida, setReferenciaSaida] = useState(custo.custo_referencia_saida == null ? "" : String(custo.custo_referencia_saida));
  const [efetivo, setEfetivo] = useState(custo.custo_efetivo == null ? "" : String(custo.custo_efetivo));
  const [fonte, setFonte] = useState(custo.fonte ?? "");
  const [fonteData, setFonteData] = useState(custo.fonte_data ?? "");
  const [moeda, setMoeda] = useState(custo.moeda ?? "");
  const [unidade, setUnidade] = useState(custo.unidade ?? "");
  const [oficial, setOficial] = useState(Boolean(custo.fonte_oficial));
  const [limite, setLimite] = useState(custo.limite_clinica ?? "");
  const bodyNumber = (s: string) => s.trim() === "" ? null : Number(s.replace(",", "."));
  return <article className="panel-3d-sub space-y-3 p-3">
    <div className="flex justify-between gap-2"><b className="text-sm">{custo.provedor} · {custo.servico}</b><Estado tom={oficial ? "ok" : "alerta"}>{oficial ? "Fonte marcada oficial" : "Fonte não confirmada"}</Estado></div>
    <div className="grid gap-2 sm:grid-cols-2">
      <Campo label={`Referência (${moeda}/${unidade})`} type="number" value={referencia} onChange={setReferencia}/>
      <Campo label="Referência de saída (se houver)" type="number" value={referenciaSaida} onChange={setReferenciaSaida}/>
      <Campo label="Custo efetivo contratado" type="number" value={efetivo} onChange={setEfetivo}/>
      <Campo label="Moeda do custo" value={moeda} onChange={setMoeda}/>
      <Campo label="Unidade de cobrança do custo" value={unidade} onChange={setUnidade}/>
      <Campo label="Data da fonte" type="date" value={fonteData} onChange={setFonteData}/>
      <Campo label="Limites por clínica" value={limite} onChange={setLimite}/>
      <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={oficial} onChange={(e) => setOficial(e.target.checked)}/>Fonte oficial conferida</label>
    </div>
    <Campo label="Fonte e observação" value={fonte} onChange={setFonte}/>
    <div className="concave-3d p-2 text-xs">
      Custo real: {margem.real.custoCentavos == null ? "não informado" : dinheiro(margem.real.custoCentavos)} ·
      cenário de planejamento: {margem.hipotese.custoCentavos == null ? "não calculado" : dinheiro(margem.hipotese.custoCentavos)} ·
      margem: {margem.hipotese.margemPct == null ? "não informada" : `${margem.hipotese.margemPct}%`} (hipótese)
    </div>
    <div className="flex justify-between gap-2"><p className="text-[11px] text-slate-500">{margem.hipotese.rotulo}</p><button disabled={salvando} onClick={() => onSave({
      custo_referencia: bodyNumber(referencia), custo_referencia_saida: bodyNumber(referenciaSaida), custo_efetivo: bodyNumber(efetivo),
      moeda, unidade, fonte, fonte_data: fonteData || null, fonte_oficial: oficial, limite_clinica: limite || null,
    })} className="btn-3d-soft px-3 py-1.5 text-xs font-bold">{salvando ? "Salvando…" : "Salvar custo"}</button></div>
  </article>;
}
