import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Banknote, CreditCard, Flag, LineChart as LineIcon, Target } from "lucide-react";
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from "recharts";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { TrilhoAbas } from "@/components/ui/trilho-abas";
import { BlockTitle } from "@/components/settings/SettingsUI";
import { Percentual, Valor } from "@/components/numeral/Numeral";
import { finApi, type FinCredito, type FinEmpresa, type FinMarco, type FinMeta, type FinResumoGoals, type PeriodoTipo } from "@/lib/pax-finance-api";
import { Ajuda, Campo, Indicador, btnCls, btnSoftCls, campoCls, reaisParaCentavos, rotuloMes } from "../pax-finance-ui";
import { Touro } from "./Touro";

const PERIODOS: { v: PeriodoTipo; r: string; ph: string }[] = [
  { v: "month", r: "Mês", ph: "AAAA-MM" }, { v: "quarter", r: "Trimestre", ph: "AAAA-Q1" }, { v: "semester", r: "Semestre", ph: "AAAA-S1" },
  { v: "year", r: "Ano", ph: "AAAA" }, { v: "rolling12", r: "Últimos 12 meses", ph: "automático" },
];
const ETAPAS: Record<string, string> = { meta_interna: "Meta interna", requisito_preliminar: "Requisito preliminar", simulacao: "Simulação", pre_analise_bancaria: "Pré-análise bancária", aprovacao_formal: "Aprovação formal" };
const CAMPOS_CREDITO: [string, string, string][] = [
  ["elegibilidade", "Elegibilidade", "Quem pode contratar, segundo a fonte oficial."], ["requisitos", "Requisitos", "Exigências da linha."],
  ["tempoCnpjMeses", "Tempo mínimo de CNPJ (meses)", "Tempo de empresa exigido."], ["faturamentoExigidoCents", "Faturamento exigido (R$)", "Faturamento mínimo ou máximo exigido."],
  ["percentualTeto", "Teto sobre o faturamento", "Quanto do faturamento pode ser financiado."], ["juros", "Juros", "Taxa informada pela fonte."], ["prazo", "Prazo", "Prazo total."],
  ["carencia", "Carência", "Tempo antes da primeira parcela."], ["garantias", "Garantias", "Garantias exigidas."], ["documentos", "Documentos", "Documentos pedidos."],
];
const CENARIOS = [2000000, 3000000, 4000000, 5000000];

function TooltipGrafico({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="panel-3d-sub p-2 text-[12px]" data-testid="grafico-tooltip">
      <div className="mb-1 font-bold">{label}</div>
      {payload.filter((p) => p.value != null).map((p) => (
        <div key={p.name} className="flex items-center justify-between gap-3"><span style={{ color: p.color }}>{p.name}</span><Valor valor={p.value / 100} semCentavos /></div>
      ))}
    </div>
  );
}

export default function PaxGoals() {
  const qc = useQueryClient();
  const [aba, setAba] = useState("metas");
  const [tipo, setTipo] = useState<PeriodoTipo>("month");
  const [chave, setChave] = useState("");
  const [erro, setErro] = useState("");
  const [metaTxt, setMetaTxt] = useState("");
  const [livre, setLivre] = useState("");
  const [credMeta, setCredMeta] = useState({ valor: "", titulo: "Crédito consecutivo para capital de giro e expansão", plano: "" });

  const emp = useQuery({ queryKey: ["fin", "company"], queryFn: () => finApi<FinEmpresa>("/company") });
  const q = `?periodType=${tipo}${chave ? `&periodKey=${encodeURIComponent(chave)}` : ""}`;
  const res = useQuery({ queryKey: ["fin", "goals-summary", tipo, chave], queryFn: () => finApi<FinResumoGoals>(`/goals/summary${q}`), retry: false });
  const marcos = useQuery({ queryKey: ["fin", "milestones"], queryFn: () => finApi<FinMarco[]>("/milestones") });
  const metas = useQuery({ queryKey: ["fin", "goals"], queryFn: () => finApi<FinMeta[]>("/goals") });
  const credito = useQuery({ queryKey: ["fin", "credit"], queryFn: () => finApi<FinCredito[]>("/credit-lines") });
  const agir = useMutation({
    mutationFn: (a: { path: string; method?: string; body?: unknown }) => finApi(a.path, { method: a.method ?? "POST", body: a.body ?? {} }),
    onSuccess: () => { setErro(""); void qc.invalidateQueries({ queryKey: ["fin"] }); },
    onError: (e: Error) => setErro(e.message),
  });

  const d = res.data;
  const dadosGrafico = useMemo(() => {
    if (!d) return [];
    const metaMes = d.resumo.metaCents && d.janela.total ? Math.round(d.resumo.metaCents / d.janela.total) : null;
    const media = d.resumo.mediaMensalCents;
    const ultimoReal = d.serie.filter((s) => !s.futuro).length - 1;
    return d.serie.map((s, i) => ({ mes: rotuloMes(s.mes), Recebido: s.futuro ? null : s.recebidoCents, "Em aberto": s.abertoCents || null, "Meta do mês": metaMes, "Projeção": s.futuro ? media : i === ultimoReal ? media : null }));
  }, [d]);
  const media = d?.resumo.mediaMensalCents ?? null;

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-3 md:p-4" data-testid="pax-goals">
      <header className="panel-3d p-4">
        <h1 className="text-[20px] font-bold uppercase tracking-wide">PAX GOALS — Metas, Faturamento e Crédito</h1>
        <p className="mt-1 text-[12px] text-muted-foreground">Acompanha quanto a empresa recebeu em relação à meta. Recebido, em aberto, nota emitida e reconhecido são números diferentes e nunca são somados.</p>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-4">
          <Campo rotulo="Empresa" ajuda="Vem da sessão do colaborador. Cada empresa só enxerga os próprios dados; não é possível ver outra empresa por aqui.">
            <div className={`${campoCls} flex items-center`} data-testid="goals-empresa">{emp.data?.empresa.razaoSocial ?? emp.data?.empresa.nome ?? "Carregando…"}</div>
          </Campo>
          <Campo rotulo="Período" ajuda="Janela de tempo usada nos indicadores e no gráfico.">
            <select className={campoCls} value={tipo} onChange={(e) => { setTipo(e.target.value as PeriodoTipo); setChave(""); }} data-testid="goals-periodo">
              {PERIODOS.map((p) => <option key={p.v} value={p.v}>{p.r}</option>)}
            </select>
          </Campo>
          <Campo rotulo="Qual período" ajuda="Deixe vazio para o período atual. Exemplos: mês 2026-11, trimestre 2026-Q4, semestre 2026-S2, ano 2026.">
            <input className={campoCls} value={chave} disabled={tipo === "rolling12"} placeholder={PERIODOS.find((p) => p.v === tipo)?.ph} onChange={(e) => setChave(e.target.value.trim())} data-testid="goals-chave" />
          </Campo>
          <Campo rotulo="Meta deste período (R$)" ajuda="Meta de faturamento recebido. Fica salva só para esta empresa e este período.">
            <div className="flex gap-2">
              <input className={campoCls} inputMode="decimal" value={metaTxt} onChange={(e) => setMetaTxt(e.target.value)} placeholder="0,00" data-testid="goals-meta-input" />
              <button type="button" className={btnCls} data-testid="goals-meta-salvar" onClick={() => { const c = reaisParaCentavos(metaTxt); if (!c || !d) { setErro("Informe um valor maior que zero."); return; } agir.mutate({ path: "/goals", method: "PUT", body: { tipo: "faturamento", periodType: tipo, periodKey: d.periodKey, targetCents: c } }); }}>Salvar</button>
            </div>
          </Campo>
        </div>
        {erro && <p className="mt-2 rounded bg-destructive/10 p-2 text-[12px] text-destructive" data-testid="fin-erro">{erro}</p>}
        {d && d.legadoNaoAtribuido > 0 && <p className="mt-2 text-[11px] text-muted-foreground" data-testid="goals-legado">Existe {d.legadoNaoAtribuido} meta antiga (tela anterior) marcada como legado não atribuído. Ela está preservada e não foi ligada a nenhuma empresa.</p>}
      </header>

      <Tabs value={aba} onValueChange={setAba}>
        <TrilhoAbas rotulo="Seções do PAX GOALS" testidPrefixo="goals-aba" itens={[
          { value: "metas", label: "Metas e faturamento", grupo: "a" }, { value: "credito", label: "Crédito", grupo: "b" },
        ]} />

        <TabsContent value="metas" className="mt-3 space-y-4">
          {res.isError && <div className="panel-3d-sub p-3 text-[12px] text-destructive" data-testid="goals-erro">{(res.error as Error).message}</div>}
          {res.isLoading && <div className="panel-3d-sub p-3 text-[12px]">Carregando indicadores…</div>}
          {d && (<>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="goals-indicadores">
              <Indicador rotulo="Meta" ajuda="Valor que a empresa quer receber neste período." centavos={d.resumo.metaCents} destaque nota={d.resumo.metaCents === null ? "Meta não definida" : undefined} />
              <Indicador rotulo="Recebido" ajuda="Dinheiro que já entrou: cobranças pagas no período (data do pagamento)." centavos={d.conceitos.recebidoCents} destaque />
              <Indicador rotulo="% atingido" ajuda="Recebido dividido pela meta." texto={<Percentual valor={d.resumo.pctAtingido} />} destaque />
              <Indicador rotulo="Diferença" ajuda="Projeção de fechamento menos a meta. Negativo = tende a ficar abaixo. É estimativa, não resultado." centavos={d.resumo.diferencaProjecaoCents} />
              <Indicador rotulo="Falta" ajuda="Quanto ainda falta para a meta." centavos={d.resumo.faltaCents} />
              <Indicador rotulo="Média mensal" ajuda="Recebido dividido pelos meses já decorridos do período." centavos={d.resumo.mediaMensalCents} />
              <Indicador rotulo="Projeção" ajuda="Média mensal multiplicada pelos meses do período. É uma estimativa e não deve ser tratada como faturamento realizado." centavos={d.resumo.projecaoFechamentoCents} nota="Estimativa" />
              <Indicador rotulo="Em aberto" ajuda="Cobranças ainda não pagas. Ainda não é dinheiro recebido." centavos={d.conceitos.abertoCents} nota={d.conceitos.vencidoCents ? undefined : undefined} />
            </div>

            <section className="panel-3d p-4" data-testid="goals-conceitos">
              <BlockTitle icon={Banknote}>Quatro números que não se misturam</BlockTitle>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                <Indicador rotulo="Recebido" ajuda="Cobranças pagas." centavos={d.conceitos.recebidoCents} />
                <Indicador rotulo="Em aberto" ajuda="A receber, incluindo vencidas." centavos={d.conceitos.abertoCents + d.conceitos.vencidoCents} nota={`Vencidas: R$ ${(d.conceitos.vencidoCents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`} />
                <Indicador rotulo="NFS-e emitida" ajuda="Notas de serviço emitidas no período. Ainda sem fonte confiável conectada." centavos={d.conceitos.emitidoCents} nota={d.conceitos.emitidoNota} />
                <Indicador rotulo="Reconhecido" ajuda="Receita lançada por competência no livro-caixa gerencial." centavos={d.conceitos.reconhecidoCents} nota={d.conceitos.reconhecidoCents === null ? "Sem lançamentos de competência" : undefined} />
              </div>
            </section>

            <section className="panel-3d p-4" data-testid="goals-grafico">
              <BlockTitle icon={LineIcon} trailing={<Ajuda texto="Barras: recebido e em aberto por mês. Linha cheia: meta dividida pelos meses. Linha tracejada: projeção (estimativa). Toque ou passe o mouse para ver os valores." />}>Meta × realizado</BlockTitle>
              <div className="h-[260px] w-full">
                <ResponsiveContainer>
                  <ComposedChart data={dadosGrafico} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="mes" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} width={52} tickFormatter={(v: number) => `${Math.round(v / 100000)}k`} />
                    <RTooltip content={<TooltipGrafico />} />
                    <Bar dataKey="Recebido" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="Em aberto" fill="hsl(var(--muted-foreground))" radius={[3, 3, 0, 0]} />
                    <Line dataKey="Meta do mês" stroke="hsl(var(--foreground))" strokeWidth={2} dot={false} connectNulls />
                    <Line dataKey="Projeção" stroke="hsl(var(--primary))" strokeWidth={2} strokeDasharray="6 4" dot={false} connectNulls />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">Fonte: {d.origem}. Projeção é estimativa, não faturamento realizado.</p>
            </section>
          </>)}

          <section className="panel-3d p-4" data-testid="goals-trilha">
            <BlockTitle icon={Flag} trailing={<Ajuda texto="Quatro marcos de faturamento mensal que você define. O touro marca até onde a média mensal atual já chegou." />}>Trilha de marcos</BlockTitle>
            <Trilha marcos={marcos.data ?? []} media={media} onSalvar={(m) => agir.mutate({ path: "/milestones", method: "PUT", body: m })} />
          </section>

          <section className="panel-3d p-4" data-testid="goals-cenarios">
            <BlockTitle icon={Target} trailing={<Ajuda texto="Quantos meses seriam necessários se a empresa recebesse esse valor por mês até atingir a meta do período. É simulação, não é resultado." />}>Cenários de faturamento mensal</BlockTitle>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              {[...CENARIOS, reaisParaCentavos(livre)].map((c, i) => (
                <div key={i} className="panel-3d-sub p-3 text-center" data-testid={`cenario-${i}`}>
                  {c === null ? (
                    <input className={campoCls} placeholder="Valor livre (R$)" inputMode="decimal" value={livre} onChange={(e) => setLivre(e.target.value)} aria-label="Cenário livre em reais por mês" />
                  ) : (<>
                    <div className="text-[16px]"><Valor valor={c / 100} semCentavos /><span className="text-[11px] text-muted-foreground"> /mês</span></div>
                    <div className="mt-1 text-[12px]">{d?.resumo.metaCents ? <>≈ <b>{Math.ceil((d.resumo.metaCents - d.resumo.recebidoCents) / c) > 0 ? Math.ceil((d.resumo.metaCents - d.resumo.recebidoCents) / c) : 0}</b> meses (estimativa)</> : "Defina a meta"}</div>
                  </>)}
                </div>
              ))}
            </div>
            {reaisParaCentavos(livre) !== null && <p className="mt-2 text-[12px]" />}
          </section>

          <section className="panel-3d p-4" data-testid="goals-lista">
            <BlockTitle icon={Target}>Metas salvas desta empresa</BlockTitle>
            {(metas.data ?? []).length === 0 ? <p className="text-[12px] text-muted-foreground">Nenhuma meta salva ainda.</p> : (
              <ul className="space-y-2">{(metas.data ?? []).map((m) => (
                <li key={m.id} className="panel-3d-sub flex flex-wrap items-center justify-between gap-2 p-3 text-[12px]">
                  <span><b>{m.tipo === "credito" ? "Crédito" : "Faturamento"}</b> · {m.periodType} {m.periodKey}{m.titulo ? ` · ${m.titulo}` : ""}</span>
                  <span className="flex items-center gap-3"><Valor valor={m.targetCents / 100} semCentavos />
                    <button type="button" className={btnSoftCls} onClick={() => agir.mutate({ path: `/goals/${m.id}`, method: "DELETE" })}>Remover meta</button></span>
                </li>))}</ul>)}
          </section>
        </TabsContent>

        <TabsContent value="credito" className="mt-3 space-y-4">
          <section className="panel-3d p-4" data-testid="goals-credito-aviso">
            <BlockTitle icon={CreditCard}>Crédito: o que está comprovado e o que não está</BlockTitle>
            <p className="text-[12px]">Faturamento alto <b>não garante</b> crédito. Cada banco analisa o caso. Os cartões abaixo separam cinco etapas: meta interna, requisito preliminar, simulação, pré-análise bancária e aprovação formal. Nenhuma condição vem pronta: só vale depois de registrar fonte oficial, endereço e data de verificação.</p>
          </section>
          {(credito.data ?? []).length === 0 && (
            <div className="panel-3d-sub p-3 text-[12px]">Nenhuma linha cadastrada. <button type="button" className={btnCls} data-testid="credito-semear" onClick={() => agir.mutate({ path: "/credit-lines/seed" })}>Criar cartões das 6 linhas (vazios)</button></div>
          )}
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {(credito.data ?? []).map((c) => <CartaoCredito key={c.lineKey} c={c} salvar={(b) => agir.mutate({ path: `/credit-lines/${c.lineKey}`, method: "PUT", body: b })} />)}
          </div>
          <section className="panel-3d p-4" data-testid="goals-credito-meta">
            <BlockTitle icon={Target} trailing={<Ajuda texto="Meta interna da empresa. Não é promessa nem aprovação de banco." />}>Meta: crédito consecutivo</BlockTitle>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <Campo rotulo="Título" ajuda="Nome da meta."><input className={campoCls} value={credMeta.titulo} onChange={(e) => setCredMeta({ ...credMeta, titulo: e.target.value })} /></Campo>
              <Campo rotulo="Valor desejado (R$)" ajuda="Quanto de crédito a empresa pretende obter."><input className={campoCls} inputMode="decimal" value={credMeta.valor} onChange={(e) => setCredMeta({ ...credMeta, valor: e.target.value })} /></Campo>
              <Campo rotulo="Plano de ação e calendário" ajuda="Passos e datas internas para chegar lá."><textarea className={`${campoCls} py-2`} rows={2} value={credMeta.plano} onChange={(e) => setCredMeta({ ...credMeta, plano: e.target.value })} /></Campo>
            </div>
            <button type="button" className={`${btnCls} mt-3`} data-testid="credito-meta-salvar" onClick={() => { const c = reaisParaCentavos(credMeta.valor); if (!c) { setErro("Informe o valor desejado."); return; } agir.mutate({ path: "/goals", method: "PUT", body: { tipo: "credito", periodType: "year", periodKey: String(new Date().getFullYear()), targetCents: c, titulo: credMeta.titulo, note: credMeta.plano || null } }); }}>Salvar meta de crédito</button>
          </section>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Trilha({ marcos, media, onSalvar }: { marcos: FinMarco[]; media: number | null; onSalvar: (m: { ordem: number; nome: string; valorMensalCents: number }) => void }) {
  const [ed, setEd] = useState<Record<number, { nome: string; valor: string }>>({});
  const lista = [1, 2, 3, 4].map((o) => marcos.find((m) => m.ordem === o) ?? null);
  const atingidos = lista.filter((m) => m && media !== null && media >= m.valorMensalCents).length;
  return (
    <div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        {lista.map((m, i) => {
          const o = i + 1; const e = ed[o] ?? { nome: m?.nome ?? "", valor: m ? (m.valorMensalCents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : "" };
          const ok = !!m && media !== null && media >= m.valorMensalCents;
          return (
            <div key={o} className="panel-3d-sub space-y-2 p-3" data-testid={`marco-${o}`}>
              <div className={`flex items-center gap-2 ${ok ? "text-primary" : "text-muted-foreground"}`}><Touro /><b className="text-[12px] uppercase">Marco {o}</b>{ok && <span className="text-[10px] uppercase">atingido</span>}</div>
              <input className={campoCls} placeholder="Nome do marco" aria-label={`Nome do marco ${o}`} value={e.nome} onChange={(x) => setEd({ ...ed, [o]: { ...e, nome: x.target.value } })} />
              <input className={campoCls} placeholder="Faturamento mensal (R$)" aria-label={`Valor mensal do marco ${o}`} inputMode="decimal" value={e.valor} onChange={(x) => setEd({ ...ed, [o]: { ...e, valor: x.target.value } })} />
              <button type="button" className={btnSoftCls} onClick={() => { const c = reaisParaCentavos(e.valor); if (c && e.nome.trim().length > 1) onSalvar({ ordem: o, nome: e.nome.trim(), valorMensalCents: c }); }}>Salvar marco</button>
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-[12px] text-muted-foreground">{media === null ? "Sem média mensal ainda." : <>Média mensal atual: <Valor valor={media / 100} semCentavos />. Marcos atingidos: {atingidos} de {lista.filter(Boolean).length} definidos.</>}</p>
    </div>
  );
}

function CartaoCredito({ c, salvar }: { c: FinCredito; salvar: (b: unknown) => void }) {
  const [f, setF] = useState<Record<string, string>>(() => Object.fromEntries(CAMPOS_CREDITO.map(([k]) => [k, c.conditions[k] == null ? "" : k === "faturamentoExigidoCents" ? String(Number(c.conditions[k]) / 100) : String(c.conditions[k])])));
  const [etapa, setEtapa] = useState(c.etapa);
  const [fonte, setFonte] = useState({ oficial: c.fonteOficial ?? "", url: c.fonteUrl ?? "", em: c.verificadaEm ?? "" });
  const verificada = c.status === "verificada";
  return (
    <div className="panel-3d-sub space-y-2 p-3" data-testid={`credito-${c.lineKey}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <b className="text-[13px] uppercase">{c.nome}</b>
        <span className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase ${verificada ? "bevel-3d-ok" : "bevel-3d"}`}>{verificada ? `Verificada em ${c.verificadaEm}` : "Aguardando verificação"}</span>
      </div>
      <p className="text-[11px] text-muted-foreground">Versão {c.version}. {verificada ? "" : "Sem fonte oficial registrada: nenhum valor abaixo deve ser tratado como verdadeiro."}</p>
      <Campo rotulo="Etapa" ajuda="Em que ponto a empresa está com esta linha. Meta interna e simulação não são aprovação."><select className={campoCls} value={etapa} onChange={(e) => setEtapa(e.target.value)}>{Object.entries(ETAPAS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Campo>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {CAMPOS_CREDITO.map(([k, r, a]) => (
          <Campo key={k} rotulo={r} ajuda={a}><input className={campoCls} value={f[k]} placeholder="Aguardando verificação" onChange={(e) => setF({ ...f, [k]: e.target.value })} /></Campo>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Campo rotulo="Fonte oficial" ajuda="Órgão ou norma de onde vieram as condições."><input className={campoCls} value={fonte.oficial} onChange={(e) => setFonte({ ...fonte, oficial: e.target.value })} /></Campo>
        <Campo rotulo="Endereço da fonte" ajuda="Link da página oficial."><input className={campoCls} value={fonte.url} onChange={(e) => setFonte({ ...fonte, url: e.target.value })} /></Campo>
        <Campo rotulo="Verificada em" ajuda="Data em que a fonte foi conferida."><input className={campoCls} type="date" value={fonte.em} onChange={(e) => setFonte({ ...fonte, em: e.target.value })} /></Campo>
      </div>
      <button type="button" className={btnCls} onClick={() => {
        const cond: Record<string, string | number | null> = {};
        for (const [k] of CAMPOS_CREDITO) { const v = f[k].trim(); if (!v) { cond[k] = null; continue; } cond[k] = k === "tempoCnpjMeses" ? Math.round(Number(v)) : k === "faturamentoExigidoCents" ? reaisParaCentavos(v) : v; }
        salvar({ nome: c.nome, etapa, conditions: cond, fonteOficial: fonte.oficial || null, fonteUrl: fonte.url || null, verificadaEm: fonte.em || null });
      }}>Salvar nova versão</button>
    </div>
  );
}
