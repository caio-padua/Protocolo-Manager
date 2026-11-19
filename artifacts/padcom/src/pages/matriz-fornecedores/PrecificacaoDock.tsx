import { useMemo, useState } from "react";
import { Calculator, ChevronDown, Minus, Plus, RefreshCw, Save } from "lucide-react";
import { CATEGORIAS, type Arredondamento, type Calc, type Categoria, type ConfigCategoria, type Parametros } from "./calculo";
import { NumField, P, V, pctTxt, sinal } from "./componentes";

type Props = {
  parametros: Parametros; categorias: ConfigCategoria[]; todos: Calc[]; atual: Calc | undefined;
  sujo: boolean; salvando: boolean;
  onParametros: (p: Parametros) => void; onCategorias: (c: ConfigCategoria[]) => void;
  onSalvar: () => void; onAplicar: (cat: Categoria) => void; avisar: (t: string) => void;
};

const limitar = (n: number) => Math.min(95, Math.max(0, Math.round(n * 10) / 10));

export function PrecificacaoDock({ parametros: p, categorias, todos, atual, sujo, salvando, onParametros, onCategorias, onSalvar, onAplicar, avisar }: Props) {
  const [aberto, setAberto] = useState(true);
  const [igual, setIgual] = useState(35);
  const encargos = p.impostosPct + p.cartaoPct + p.comissaoPct + p.despesasPct;
  const mudar = (k: keyof Parametros, v: number | Arredondamento) => onParametros({ ...p, [k]: v });
  const cfg = (cat: Categoria) => categorias.find((c) => c.categoria === cat)!;
  const setCat = (cat: Categoria, patch: Partial<ConfigCategoria>) => onCategorias(categorias.map((c) => (c.categoria === cat ? { ...c, ...patch } : c)));
  const catsAtivas = CATEGORIAS.filter((x) => todos.some((t) => t.linha.categoria === x.id));
  const todasAuto = catsAtivas.every((x) => cfg(x.id).modo === "auto");

  const statCat = useMemo(() => {
    const out = {} as Record<Categoria, { n: number; avg: number | null; pend: number; diff: number | null; ruim: boolean }>;
    for (const cat of CATEGORIAS) {
      const ls = todos.filter((t) => t.linha.categoria === cat.id);
      const com = ls.filter((t) => t.pub !== null);
      const pend = ls.filter((t) => t.pend);
      const diffs = pend.filter((t) => t.pub).map((t) => (((t.venda as number) - (t.pub as number)) / (t.pub as number)) * 100);
      out[cat.id] = {
        n: ls.length, pend: pend.length, ruim: ls.some((t) => t.invalido),
        avg: com.length ? Math.round(com.reduce((a, t) => a + (t.pub as number), 0) / com.length) : null,
        diff: diffs.length ? diffs.reduce((a, b) => a + b, 0) / diffs.length : null,
      };
    }
    return out;
  }, [todos]);

  const nomeCat = (c: Categoria) => CATEGORIAS.find((x) => x.id === c)?.curto ?? c;
  const ajusteGeral = (d: number) => { onCategorias(categorias.map((c) => ({ ...c, margemPct: limitar(c.margemPct + d) }))); avisar(`Todas as margens ${d > 0 ? "subiram" : "desceram"} ${Math.abs(d)} ponto (falta salvar)`); };
  const igualar = () => { onCategorias(categorias.map((c) => ({ ...c, margemPct: limitar(igual) }))); avisar(`Todas as categorias com margem de ${pctTxt(igual)} (falta salvar)`); };
  const todas = (auto: boolean) => { onCategorias(categorias.map((c) => ({ ...c, modo: auto ? "auto" : "congelado" }))); avisar(auto ? "Todos os preços vão acompanhar custo e margem ao salvar" : "Todos os preços ficam congelados ao salvar"); };

  const f = atual?.forma ?? null;
  const itens: [string, number, string][] = f ? [
    ["Custo do produto", f.referencia, "#16284a"], ["Frete e perda", f.entrada, "#5f719b"], ["Impostos", f.impostos, "#a86a0c"],
    ["Cartão", f.cartao, "#d3a14a"], ["Comissão", f.comissao, "#c9b27a"], ["Despesas rateadas", f.despesas, "#9aa4b8"], ["Lucro líquido", f.lucro, "#3fa66b"],
  ] : [];

  return (
    <section className="mx-panel mx-dock" aria-label="Precificação">
      <header className="mx-dock-h">
        <button type="button" className="mx-dock-t" aria-expanded={aberto} onClick={() => setAberto((v) => !v)}>
          <ChevronDown size={16} className="mx-chev" data-open={aberto ? 1 : 0} /><Calculator size={16} />Precificação
        </button>
        <span className="mx-dock-f">Venda = custo efetivo ÷ (1 − impostos − cartão − comissão − despesas − margem)</span>
        <div className="mx-dock-act">
          {sujo && <span className="mx-dirty" role="status">Alterações não salvas</span>}
          <div className="mx-well mx-adj" role="group" aria-label="Ajuste geral das margens">
            <span>Ajuste geral</span>
            <button type="button" aria-label="Diminuir todas as margens em 1 ponto" onClick={() => ajusteGeral(-1)}><Minus size={13} /></button>
            <b>1 pt</b>
            <button type="button" aria-label="Aumentar todas as margens em 1 ponto" onClick={() => ajusteGeral(1)}><Plus size={13} /></button>
          </div>
          <div className="mx-well mx-adj" role="group" aria-label="Igualar todas as margens">
            <span>Igualar todas a</span>
            <NumField label="Margem única em porcentagem" value={igual} onChange={setIgual} w={52} /><b>%</b>
            <button type="button" className="mx-adj-go" onClick={igualar}>Igualar</button>
          </div>
          <button type="button" className="mx-switch mx-switch-all" role="switch" aria-checked={todasAuto} onClick={() => todas(!todasAuto)}>
            <i /><span>{todasAuto ? "Todos atualizam sozinhos" : "Atualizar todos sozinhos"}</span>
          </button>
          <button type="button" className="mx-btn mx-btn-gold" disabled={!sujo || salvando} onClick={onSalvar}><Save size={15} />{salvando ? "Salvando…" : "Salvar e aplicar"}</button>
        </div>
      </header>
      {aberto && (
        <div className="mx-dock-b">
          <div className="mx-dz mx-dz-a">
            <h3><b>1</b>Custos e encargos <em>valem para todos os produtos</em></h3>
            <div className="mx-flds">
              {([
                ["fretePct", "Frete e entrada", "sobre o custo"], ["perdaPct", "Perda (quebra)", "quebra e validade"], ["impostosPct", "Impostos", "sobre a venda"],
                ["cartaoPct", "Taxa de cartão", "média, sobre a venda"], ["comissaoPct", "Comissão", "sobre a venda"], ["despesasPct", "Despesas rateadas", "sobre a venda"],
              ] as [keyof Parametros, string, string][]).map(([k, nome, dica]) => (
                <div className="mx-fld" key={k}><span>{nome}</span>
                  <div className="mx-well mx-fld-in"><NumField label={`${nome} em porcentagem`} value={p[k] as number} onChange={(v) => mudar(k, v)} w={58} /><b>%</b></div>
                  <em>{dica}</em></div>
              ))}
              <div className="mx-fld"><span>Arredondar preço</span>
                <div className="mx-well mx-seg mx-seg-s" role="group" aria-label="Arredondamento do preço">
                  {([["nenhum", "Não"], ["inteiro", ",00"], ["90", ",90"]] as [Arredondamento, string][]).map(([k, t]) => (
                    <button key={k} type="button" aria-pressed={p.arredondamento === k} onClick={() => mudar("arredondamento", k)}>{t}</button>))}
                </div>
                <em>sempre para cima</em>
              </div>
              <div className="mx-fld mx-fld-sum"><span>Encargos sobre a venda</span><div className="mx-sumv"><P v={encargos} peso={800} className="mx-serif" /></div><em>impostos + cartão + comissão + despesas</em></div>
            </div>
            <p className="mx-note mx-ex">Zero significa &quot;ainda não preenchido&quot;. Confirmar as alíquotas com o contador antes de salvar.</p>
          </div>

          <div className="mx-dz mx-dz-b">
            <h3><b>2</b>Margem de lucro por categoria <em>o interruptor decide se o preço acompanha</em></h3>
            <div className="mx-cats" style={{ ["--n" as string]: catsAtivas.length }}>
              {catsAtivas.map((x) => {
                const st = statCat[x.id]; const c = cfg(x.id); const auto = c.modo === "auto";
                return (
                  <div key={x.id} className="mx-cat" data-auto={auto ? 1 : 0} data-bad={st.ruim ? 1 : 0}>
                    <div className="mx-cat-h"><b>{x.curto}</b><em>{st.n} produtos</em></div>
                    <div className="mx-well mx-mgin2">
                      <button type="button" aria-label={`Diminuir margem de ${x.curto}`} onClick={() => setCat(x.id, { margemPct: limitar(c.margemPct - 1) })}><Minus size={13} /></button>
                      <NumField label={`Margem de ${x.curto} em porcentagem`} value={c.margemPct} onChange={(v) => setCat(x.id, { margemPct: v })} w={52} /><b>%</b>
                      <button type="button" aria-label={`Aumentar margem de ${x.curto}`} onClick={() => setCat(x.id, { margemPct: limitar(c.margemPct + 1) })}><Plus size={13} /></button>
                    </div>
                    <input type="range" className="mx-range" min={0} max={70} step={0.5} value={Math.min(c.margemPct, 70)} aria-label={`Ajustar margem de ${x.curto}`}
                      onChange={(e) => setCat(x.id, { margemPct: Number(e.target.value) })} />
                    <div className="mx-cat-m"><span>Preço médio</span>{st.avg === null ? <span className="mx-empty">—</span> : <V c={st.avg} />}</div>
                    <button type="button" className="mx-switch" role="switch" aria-checked={auto} onClick={() => setCat(x.id, { modo: auto ? "congelado" : "auto" })}>
                      <i /><span>{auto ? "Atualiza sozinho" : "Congelado"}</span>
                    </button>
                    <div className="mx-cat-s" data-k={st.ruim ? "bad" : st.pend ? "pend" : "ok"}>
                      {st.ruim ? <>Inviável: soma passa de 95%</>
                        : st.pend ? (<><span>{st.pend} preços mudariam{st.diff !== null ? ` (${sinal(st.diff)})` : ""}</span>
                          <button type="button" disabled={salvando} onClick={() => onAplicar(x.id)}><RefreshCw size={11} />Aplicar agora</button></>)
                        : auto ? <>Preços em dia com o custo</> : <>Congelado, sem diferença</>}
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="mx-note mx-ex">Ao publicar, o preço segue para o Orçamento e para o cadastro da Substância (só onde há uma única apresentação). Cada mudança fica no histórico.</p>
          </div>

          <div className="mx-dz mx-dz-c">
            <h3><b>3</b>Como se forma o preço <em>{atual ? `${atual.linha.produto} ${atual.linha.doseTotal}` : "selecione uma linha"}</em></h3>
            {f ? (<>
              <div className="mx-stack" role="img" aria-label="Composição do preço de venda">
                {itens.map(([n, v, c]) => <i key={n} style={{ flexGrow: Math.max(v, 0), background: c }} title={n} />)}
              </div>
              <ul className="mx-legend">
                {itens.map(([n, v, c]) => (
                  <li key={n}><span className="mx-sw" style={{ background: c }} /><span>{n}</span><V c={Math.round(v)} /><P v={(v / f.venda) * 100} peso={500} className="mx-pc" /></li>
                ))}
                <li className="mx-legend-t"><span /><span>Preço de venda</span><V c={Math.round(f.venda)} /><P v={100} peso={500} className="mx-pc" /></li>
              </ul>
            </>) : <p className="mx-note">{atual?.invalido ? "A soma de encargos e margem passa de 95%." : "Esta linha ainda não tem preço de custo."}</p>}
          </div>
        </div>
      )}
    </section>
  );
}
