import { useCallback, useEffect, useState } from "react";
import { api } from "./api-comunicacao";

// Categorias de mensagens (regras versionadas por clinica) e as tres trilhas financeiras SEPARADAS.
// Honestidade: estado sem dado gravado aparece como "Não informado"; envio nunca vira prova de pagamento.

export const ROT_ESTADO: Record<string, string> = {
  nao_informado: "Não informado", informado: "Informado", registrado: "Registrado", recebido: "Recebido", enviado: "Enviado",
  entregue: "Entregue", lido: "Lido", falhou: "Falhou", criada: "Criada", recusada: "Recusada",
  pago: "Pago", nao_pago: "Não pago", conciliado: "Conciliado", aguardando_extrato: "Aguardando extrato",
  PENDING: "Pendente", RECEIVED: "Recebida", CONFIRMED: "Confirmada", OVERDUE: "Vencida", REFUNDED: "Estornada",
};
const rot = (e: string) => ROT_ESTADO[e] ?? e;
const dh = (iso: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—");
const brl = (c: number | null | undefined) => (c == null ? "—" : (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
const campo = "field-engraved rounded-[4px] px-2 py-1.5 text-xs";

type Categoria = { id: number; nome: string; natureza: "financeira" | "operacional"; ativo: boolean };
type Regra = { id: number; padrao: string; categoria_id: number; categoria_nome: string; versao: number; vigente_desde: string; vigente_ate: string | null; motivo: string | null; criado_por_nome: string | null };
type Evento = { id: number; entidade: string; acao: string; ator_nome: string | null; criado_em: string; depois: Record<string, unknown> | null };
type Dados = {
  categorias: Categoria[]; regras: Regra[]; podeEditar: boolean;
  contextosSemCategoria: { contexto: string | null; total: number }[];
  totais: { categoriaId: number | null; nome: string; natureza: string; total: number }[];
};

export function PainelCategorias() {
  const [d, setD] = useState<Dados | null>(null);
  const [trilha, setTrilha] = useState<Evento[]>([]);
  const [msg, setMsg] = useState("");
  const [nome, setNome] = useState("");
  const [nat, setNat] = useState<"financeira" | "operacional">("operacional");
  const [padrao, setPadrao] = useState("");
  const [catRegra, setCatRegra] = useState("");
  const [retro, setRetro] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [verHist, setVerHist] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const [a, t] = await Promise.all([api<Dados>("/comunicacao/categorias?periodo=tudo"), api<{ eventos: Evento[] }>("/comunicacao/trilha?limite=30")]);
      setD(a); setTrilha(t.eventos);
    } catch (e) { setMsg(e instanceof Error ? e.message : "Falha ao carregar."); }
  }, []);
  useEffect(() => { void carregar(); }, [carregar]);

  const executar = async (fn: () => Promise<unknown>, ok: string) => {
    setMsg("");
    try { await fn(); setMsg(ok); await carregar(); } catch (e) { setMsg(e instanceof Error ? e.message : "Falha."); }
  };
  const criarCat = () => executar(async () => { await api("/comunicacao/categorias", { method: "POST", body: JSON.stringify({ nome, natureza: nat }) }); setNome(""); }, "Categoria criada.");
  const alternar = (c: Categoria) => executar(() => api(`/comunicacao/categorias/${c.id}`, { method: "PATCH", body: JSON.stringify({ ativo: !c.ativo }) }), c.ativo ? "Categoria desativada (nada foi apagado)." : "Categoria reativada.");
  const salvarRegra = () => executar(async () => {
    await api("/comunicacao/regras", { method: "POST", body: JSON.stringify({ padrao, categoriaId: Number(catRegra), retroativa: retro, motivo }) });
    setPadrao(""); setMotivo("");
  }, "Regra salva em nova versão. A versão anterior foi encerrada, não apagada.");
  const encerrar = (r: Regra) => executar(() => api(`/comunicacao/regras/${r.id}`, { method: "DELETE" }), "Regra encerrada: as mensagens desse padrão voltam a aparecer sem categoria.");

  if (!d) return <p className="text-[12px] text-muted-foreground">{msg || "Carregando…"}</p>;
  const abertas = d.regras.filter((r) => r.vigente_ate === null);
  const lista = verHist ? d.regras : abertas;
  const ativas = d.categorias.filter((c) => c.ativo);

  return (
    <div className="space-y-4 text-[12px]" data-testid="painel-categorias">
      <p className="text-muted-foreground">A categoria é calculada na leitura: a mensagem original nunca é alterada. Padrão exato (<code>exame_recebido</code>) ou com asterisco no fim (<code>cobranca*</code>). O padrão mais específico vence.</p>
      {msg && <p role="status" className="concave-3d px-3 py-2">{msg}</p>}

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {d.totais.map((t) => (
          <div key={`${t.categoriaId}`} className="panel-3d-sub p-3">
            <p className="text-[10px] font-bold uppercase text-muted-foreground">{t.natureza === "financeira" ? "Envolve valor" : t.natureza === "operacional" ? "Sem valor" : "Pendente de regra"}</p>
            <p className="font-bold">{t.nome}</p>
            <p className="tabular-nums text-lg font-bold">{t.total.toLocaleString("pt-BR")}</p>
          </div>
        ))}
      </div>

      {d.contextosSemCategoria.length > 0 && (
        <div className="concave-3d space-y-1 p-3">
          <p className="font-bold uppercase text-muted-foreground">Mensagens sem categoria (nada é escondido)</p>
          <ul className="flex flex-wrap gap-2">
            {d.contextosSemCategoria.map((c) => (
              <li key={c.contexto ?? "vazio"}>
                {c.contexto
                  ? <button disabled={!d.podeEditar} onClick={() => setPadrao(c.contexto!)} className="bevel-3d px-2 py-1 text-[11px]" title="Usar este contexto numa regra">{c.contexto} · {c.total}</button>
                  : <span className="bevel-3d px-2 py-1 text-[11px]">Contexto não informado · {c.total}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-2">
        <p className="font-bold uppercase text-muted-foreground">Categorias da clínica</p>
        <ul className="space-y-1">
          {d.categorias.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-border/50 py-1">
              <span><b>{c.nome}</b> · {c.natureza === "financeira" ? "Envolve valor" : "Sem valor"}{!c.ativo && " · desativada"}</span>
              {d.podeEditar && <button className="bevel-3d px-2 py-1 text-[10px] font-bold uppercase" onClick={() => void alternar(c)}>{c.ativo ? "Desativar" : "Reativar"}</button>}
            </li>
          ))}
        </ul>
        {d.podeEditar ? (
          <div className="flex flex-wrap items-end gap-2">
            <label className="font-semibold">Nova categoria<input className={`${campo} mt-1 block`} maxLength={60} value={nome} onChange={(e) => setNome(e.target.value)} /></label>
            <label className="font-semibold">Natureza<select className={`${campo} mt-1 block`} value={nat} onChange={(e) => setNat(e.target.value as "financeira" | "operacional")}><option value="operacional">Sem valor financeiro</option><option value="financeira">Envolve valor financeiro</option></select></label>
            <button disabled={nome.trim().length < 2} onClick={() => void criarCat()} className="btn-3d-soft px-4 py-2 text-xs font-bold">Criar categoria</button>
          </div>
        ) : <p className="text-muted-foreground">Somente o administrador da clínica cria e edita categorias.</p>}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="font-bold uppercase text-muted-foreground">Regras de enquadramento</p>
          <label className="flex items-center gap-1"><input type="checkbox" checked={verHist} onChange={(e) => setVerHist(e.target.checked)} />Mostrar todas as versões</label>
        </div>
        <div className="max-h-64 overflow-auto">
          <table className="w-full border-collapse text-[11px]">
            <thead><tr className="border-b border-border text-left uppercase text-muted-foreground"><th className="px-2 py-1">Padrão</th><th className="px-2 py-1">Categoria</th><th className="px-2 py-1">Versão</th><th className="px-2 py-1">Vale a partir de</th><th className="px-2 py-1">Situação</th><th /></tr></thead>
            <tbody>
              {lista.map((r) => (
                <tr key={r.id} className="border-t border-border/50">
                  <td className="px-2 py-1 font-mono">{r.padrao}</td><td className="px-2 py-1">{r.categoria_nome}</td><td className="px-2 py-1">v{r.versao}</td>
                  <td className="px-2 py-1">{new Date(r.vigente_desde).getFullYear() <= 1970 ? "Desde o início" : dh(r.vigente_desde)}</td>
                  <td className="px-2 py-1">{r.vigente_ate ? `Encerrada em ${dh(r.vigente_ate)}` : "Em vigor"}</td>
                  <td className="px-2 py-1">{d.podeEditar && !r.vigente_ate && <button className="bevel-3d px-2 py-1 text-[10px] font-bold uppercase" onClick={() => void encerrar(r)}>Encerrar</button>}</td>
                </tr>
              ))}
              {!lista.length && <tr><td colSpan={6} className="px-2 py-2 text-muted-foreground">Nenhuma regra.</td></tr>}
            </tbody>
          </table>
        </div>
        {d.podeEditar && (
          <div className="flex flex-wrap items-end gap-2">
            <label className="font-semibold">Padrão do contexto<input className={`${campo} mt-1 block`} placeholder="ex.: cobranca*" value={padrao} onChange={(e) => setPadrao(e.target.value)} /></label>
            <label className="font-semibold">Categoria<select className={`${campo} mt-1 block`} value={catRegra} onChange={(e) => setCatRegra(e.target.value)}><option value="">Escolher…</option>{ativas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></label>
            <label className="font-semibold">Motivo (opcional)<input className={`${campo} mt-1 block`} maxLength={300} value={motivo} onChange={(e) => setMotivo(e.target.value)} /></label>
            <label className="flex items-center gap-1 font-semibold"><input type="checkbox" checked={retro} onChange={(e) => setRetro(e.target.checked)} />Valer também para mensagens antigas</label>
            <button disabled={!padrao || !catRegra} onClick={() => void salvarRegra()} className="btn-3d-soft px-4 py-2 text-xs font-bold">Salvar regra (nova versão)</button>
          </div>
        )}
      </div>

      <div className="space-y-1">
        <p className="font-bold uppercase text-muted-foreground">Trilha de auditoria (somente acréscimo)</p>
        <div className="max-h-48 overflow-auto">
          <table className="w-full border-collapse text-[11px]"><tbody>
            {trilha.map((e) => (
              <tr key={e.id} className="border-t border-border/50"><td className="whitespace-nowrap px-2 py-1 tabular-nums">{dh(e.criado_em)}</td><td className="px-2 py-1">{e.ator_nome ?? "—"}</td><td className="px-2 py-1">{e.entidade} · {e.acao.replace("_", " ")}</td><td className="px-2 py-1 font-mono text-muted-foreground">{String(e.depois?.padrao ?? e.depois?.nome ?? "")}</td></tr>
            ))}
            {!trilha.length && <tr><td className="px-2 py-2 text-muted-foreground">Nenhum evento.</td></tr>}
          </tbody></table>
        </div>
      </div>
    </div>
  );
}

type EtapaFin = { chave: string; rotulo: string; estado: string; quando: string | null; nota: string };
type Fin = {
  tarifaMensagem: { tarifasAtivas: number; tarifasCadastradas: number; porAmbiente: { ambiente: string; mensagens: number; cobradas: number; isentas: number; semTarifa: number; valorCobradoCentavos: number }[] };
  cobrancaServico: { id: number; clienteNome: string | null; descricao: string | null; valorCentavos: number; ambiente: string; chargeId: string | null; etapas: EtapaFin[] }[];
  asaas: { itens: { chargeId: string; origem: string; rotulo: string | null; ambiente: string; brutoCentavos: number | null; recebidoExtratoCentavos: number | null; etapas: EtapaFin[]; conciliacao: { acao: string; quando: string; causa: string | null }[] }[]; foraDaVisaoSemClinica: number };
};

function Etapas({ e }: { e: EtapaFin[] }) {
  return (
    <ul className="grid gap-1 sm:grid-cols-3">
      {e.map((x) => (
        <li key={x.chave} className="concave-3d p-2">
          <p className="text-[10px] font-bold uppercase text-muted-foreground">{x.rotulo}</p>
          <p className="font-bold">{rot(x.estado)}</p>
          <p className="text-[10px] text-muted-foreground">{x.quando ? dh(x.quando) : "—"} · {x.nota}</p>
        </li>
      ))}
    </ul>
  );
}
const Selo = ({ amb }: { amb: string }) => <span className="bevel-3d ml-2 px-1.5 py-0.5 text-[9px] font-bold uppercase">{amb === "teste" ? "Teste" : "Ambiente não informado"}</span>;

export function PainelFinanceiro() {
  const [f, setF] = useState<Fin | null>(null);
  const [erro, setErro] = useState("");
  useEffect(() => { api<Fin>("/comunicacao/financeiro").then(setF).catch((e) => setErro(e.message)); }, []);
  if (erro) return <p className="concave-3d px-3 py-2 text-[12px] text-rose-700">{erro}</p>;
  if (!f) return <p className="text-[12px] text-muted-foreground">Carregando…</p>;
  return (
    <div className="space-y-5 text-[12px]" data-testid="painel-financeiro">
      <p className="text-muted-foreground">Três assuntos diferentes, cada um com seus próprios estados. Uma mensagem de cobrança não prova pagamento, e envio não prova entrega, leitura ou conclusão do serviço. Esta tela só lê: não cria cobrança, não ativa tarifa e não muda preço.</p>

      <section className="space-y-2">
        <h4 className="font-bold uppercase">1. Tarifa de mensagem — custo cobrado da clínica</h4>
        <p className="text-muted-foreground">Tarifas ativas: <b>{f.tarifaMensagem.tarifasAtivas}</b> de {f.tarifaMensagem.tarifasCadastradas} cadastradas. Quem edita é o Licenciado.</p>
        <div className="overflow-x-auto"><table className="w-full border-collapse text-[11px]">
          <thead><tr className="border-b border-border text-left uppercase text-muted-foreground"><th className="px-2 py-1">Ambiente</th><th className="px-2 py-1">Mensagens</th><th className="px-2 py-1">Cobradas</th><th className="px-2 py-1">Isentas</th><th className="px-2 py-1">Sem tarifa</th><th className="px-2 py-1">Valor cobrado</th></tr></thead>
          <tbody>
            {f.tarifaMensagem.porAmbiente.map((a) => <tr key={a.ambiente} className="border-t border-border/50"><td className="px-2 py-1 font-bold uppercase">{a.ambiente}</td><td className="px-2 py-1">{a.mensagens}</td><td className="px-2 py-1">{a.cobradas}</td><td className="px-2 py-1">{a.isentas}</td><td className="px-2 py-1">{a.semTarifa}</td><td className="px-2 py-1 tabular-nums">{brl(a.valorCobradoCentavos)}</td></tr>)}
            {!f.tarifaMensagem.porAmbiente.length && <tr><td colSpan={6} className="px-2 py-2 text-muted-foreground">Nenhum consumo registrado.</td></tr>}
          </tbody>
        </table></div>
        <p className="text-[10px] text-muted-foreground">Teste e produção ficam em linhas separadas e nunca são somados.</p>
      </section>

      <section className="space-y-2">
        <h4 className="font-bold uppercase">2. Cobrança de serviço — da clínica ao cliente</h4>
        {f.cobrancaServico.map((c) => (
          <div key={c.id} className="panel-3d-sub space-y-2 p-3">
            <p><b>{c.clienteNome ?? "Cliente"}</b> · {brl(c.valorCentavos)}{c.descricao ? ` · ${c.descricao}` : ""}<Selo amb={c.ambiente} /></p>
            <Etapas e={c.etapas} />
          </div>
        ))}
        {!f.cobrancaServico.length && <p className="concave-3d px-3 py-2 text-muted-foreground">Nenhuma cobrança de serviço registrada para esta clínica.</p>}
      </section>

      <section className="space-y-2">
        <h4 className="font-bold uppercase">3. Pagamento e conciliação — Asaas</h4>
        {f.asaas.itens.map((a) => (
          <div key={a.chargeId} className="panel-3d-sub space-y-2 p-3">
            <p><b>{a.rotulo ?? a.origem}</b> · {brl(a.brutoCentavos)} · recebido no extrato: {brl(a.recebidoExtratoCentavos)}<Selo amb={a.ambiente} /> <span className="font-mono text-[10px] text-muted-foreground">…{a.chargeId.slice(-6)}</span></p>
            <Etapas e={a.etapas} />
            {a.conciliacao.length > 0 && <p className="text-[10px] text-muted-foreground">Conciliação: {a.conciliacao.map((x) => `${x.acao} em ${dh(x.quando)}`).join(" · ")}</p>}
          </div>
        ))}
        {!f.asaas.itens.length && <p className="concave-3d px-3 py-2 text-muted-foreground">Nenhuma cobrança do Asaas atribuída a esta clínica.</p>}
        {f.asaas.foraDaVisaoSemClinica > 0 && <p className="text-[10px] text-muted-foreground">{f.asaas.foraDaVisaoSemClinica} cobrança(s) antigas sem clínica gravada ficam fora desta visão até serem atribuídas.</p>}
      </section>
    </div>
  );
}
