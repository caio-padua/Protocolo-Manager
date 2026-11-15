import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Dices, Eraser, Heart, Loader2, Plus, ShieldAlert, Trash2, X } from "lucide-react";
import Volante from "./Volante";
import Pedidos from "./Pedidos";
import Resultados from "./Resultados";
import { chamarMeusJogos, ErroApi } from "./api";
import {
  brData, brDataHora, brl, dz, novaChave, sortearDezenas,
  type Catalogo, type Favorito, type Modalidade, type PedidoVisto, type ResultadosModalidade,
} from "./tipos";

// MEUS JOGOS (Area do Cliente): jogos INDIVIDUAIS, separados da Conexao Milionaria (boloes).
// A tela monta e precifica pelo catalogo do servidor (fonte oficial CAIXA); nunca inventa preco, resultado ou estado.
// Sem canal de registro conectado, o pedido NAO pode ser confirmado e a tela diz isso com clareza.

type Aba = "jogar" | "pedidos" | "resultados";
const ABAS: { k: Aba; t: string }[] = [{ k: "jogar", t: "Jogar" }, { k: "pedidos", t: "Pedidos" }, { k: "resultados", t: "Resultados" }];
const ORDEM: Modalidade[] = ["megasena", "lotofacil", "quina", "lotomania"];
const vazio = <T,>(v: T): Record<Modalidade, T> => ({ megasena: v, lotofacil: v, quina: v, lotomania: v });
const EM_ANDAMENTO = new Set(["aguardando_pagamento", "pago_na_fila", "processando"]);
const titulo = { fontFamily: "'EB Garamond', serif" } as const;

export default function MeusJogosCliente({ token }: { token: string }) {
  const [catalogo, setCatalogo] = useState<Catalogo | null>(null);
  const [erro, setErro] = useState("");
  const [aba, setAba] = useState<Aba>("jogar");
  const [mod, setMod] = useState<Modalidade>("megasena");
  const [marcadas, setMarcadas] = useState<Record<Modalidade, number[]>>(vazio<number[]>([]));
  const [carrinho, setCarrinho] = useState<Record<Modalidade, number[][]>>(vazio<number[][]>([]));
  const [qtdAleatoria, setQtdAleatoria] = useState<Record<Modalidade, number>>({ megasena: 6, lotofacil: 15, quina: 5, lotomania: 50 });
  const [favoritos, setFavoritos] = useState<Favorito[]>([]);
  const [aviso, setAviso] = useState("");
  const [revisando, setRevisando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [pedidos, setPedidos] = useState<PedidoVisto[] | null>(null);
  const [erroPedidos, setErroPedidos] = useState("");
  const [resultados, setResultados] = useState<ResultadosModalidade[] | null>(null);
  const [erroResultados, setErroResultados] = useState(""); const [carregandoRes, setCarregandoRes] = useState(false);
  const chave = useRef<{ assinatura: string; valor: string } | null>(null);

  const cat = useMemo(() => catalogo?.modalidades.find((m) => m.chave === mod) ?? null, [catalogo, mod]);

  const carregarCatalogo = useCallback(async () => {
    try { setCatalogo(await chamarMeusJogos<Catalogo>(token, "")); setErro(""); }
    catch (e) { setErro(e instanceof ErroApi ? e.message : "Não foi possível carregar Meus Jogos."); }
  }, [token]);
  const carregarFavoritos = useCallback(async () => {
    try { setFavoritos((await chamarMeusJogos<{ favoritos: Favorito[] }>(token, "/favoritos")).favoritos); } catch { /* lista de favoritos e acessorio */ }
  }, [token]);
  const carregarPedidos = useCallback(async () => {
    try { setPedidos((await chamarMeusJogos<{ pedidos: PedidoVisto[] }>(token, "/pedidos")).pedidos); setErroPedidos(""); }
    catch (e) { setErroPedidos(e instanceof ErroApi ? e.message : "Não foi possível carregar os pedidos."); }
  }, [token]);
  const carregarResultados = useCallback(async () => {
    setCarregandoRes(true);
    try { setResultados((await chamarMeusJogos<{ modalidades: ResultadosModalidade[] }>(token, "/resultados")).modalidades); setErroResultados(""); }
    catch (e) { setErroResultados(e instanceof ErroApi ? e.message : "Não foi possível carregar os resultados."); }
    finally { setCarregandoRes(false); }
  }, [token]);

  useEffect(() => { void carregarCatalogo(); void carregarFavoritos(); void carregarPedidos(); }, [carregarCatalogo, carregarFavoritos, carregarPedidos]);
  useEffect(() => { if (aba === "resultados" && !resultados) void carregarResultados(); }, [aba, resultados, carregarResultados]);
  // Atualizacao automatica enquanto ha pedido em andamento (o servidor confere o pagamento direto no Asaas).
  const haAndamento = pedidos?.some((p) => EM_ANDAMENTO.has(p.status)) ?? false;
  useEffect(() => {
    if (aba !== "pedidos" || !haAndamento) return;
    const t = window.setInterval(() => void carregarPedidos(), 15_000);
    return () => window.clearInterval(t);
  }, [aba, haAndamento, carregarPedidos]);

  // ---- volante
  const sel = marcadas[mod];
  const precoDe = (q: number) => cat?.precos.find((p) => p.quantidade === q)?.precoCentavos ?? null;
  const precoSel = precoDe(sel.length);
  const alternar = (n: number) => { setAviso(""); setMarcadas((m) => ({ ...m, [mod]: m[mod].includes(n) ? m[mod].filter((x) => x !== n) : [...m[mod], n].sort((a, b) => a - b) })); };
  const limpar = () => { setAviso(""); setMarcadas((m) => ({ ...m, [mod]: [] })); };
  const aleatorio = () => {
    if (!cat) return; setAviso("");
    const q = cat.dezenasMin === cat.dezenasMax ? cat.dezenasMin : qtdAleatoria[mod];
    setMarcadas((m) => ({ ...m, [mod]: sortearDezenas(cat.dezenaMin, cat.dezenaMax, q) }));
  };
  const faltam = cat ? Math.max(0, cat.dezenasMin - sel.length) : 0;
  const valido = precoSel !== null;
  const faixaTexto = !cat ? "" : sel.length === 0 ? `Toque nas dezenas. A ${cat.nome} aceita de ${cat.dezenasMin} a ${cat.dezenasMax}.`
    : !valido ? (faltam > 0 ? `Marque mais ${faltam} dezena(s) para formar um jogo.` : `Não há preço oficial para ${sel.length} dezenas.`) : "Jogo válido.";

  const jogos = carrinho[mod];
  const total = jogos.reduce((s, j) => s + (precoDe(j.length) ?? 0), 0);
  const jaNoPedido = valido && jogos.some((j) => j.join(",") === sel.join(","));
  const adicionar = () => {
    if (!valido) return;
    if (jaNoPedido) { setAviso("Este jogo já está no pedido."); return; }
    if (jogos.length >= 20) { setAviso("Um pedido aceita no máximo 20 jogos."); return; }
    setCarrinho((c) => ({ ...c, [mod]: [...c[mod], sel] })); setMarcadas((m) => ({ ...m, [mod]: [] })); setAviso(""); setRevisando(false);
  };
  const removerDoPedido = (i: number) => { setCarrinho((c) => ({ ...c, [mod]: c[mod].filter((_, k) => k !== i) })); setRevisando(false); };

  // ---- favoritos
  const favs = favoritos.filter((f) => f.modalidade === mod);
  async function favoritar() {
    if (!valido) return;
    try {
      const r = await chamarMeusJogos<{ jaExistia: boolean }>(token, "/favoritos", { method: "POST", json: { modalidade: mod, dezenas: sel } });
      setAviso(r.jaExistia ? "Este jogo já estava nos seus favoritos." : "Jogo salvo nos favoritos."); void carregarFavoritos();
    } catch (e) { setAviso(e instanceof ErroApi ? e.message : "Não foi possível salvar o favorito."); }
  }
  async function removerFavorito(id: number) {
    try { await chamarMeusJogos(token, `/favoritos/${id}`, { method: "DELETE" }); void carregarFavoritos(); } catch (e) { setAviso(e instanceof ErroApi ? e.message : "Não foi possível remover."); }
  }

  // ---- confirmacao (a chave de idempotencia muda quando o conteudo muda; repetir o mesmo envio nunca duplica o pedido)
  async function confirmar() {
    if (!cat?.disponibilidade.aberto || jogos.length === 0) return;
    const assinatura = `${mod}|${jogos.map((j) => j.join(",")).sort().join(";")}`;
    if (!chave.current || chave.current.assinatura !== assinatura) chave.current = { assinatura, valor: novaChave() };
    setEnviando(true); setAviso("");
    try {
      await chamarMeusJogos(token, "/pedidos", { method: "POST", json: { modalidade: mod, jogos, chave: chave.current.valor } });
      chave.current = null; setCarrinho((c) => ({ ...c, [mod]: [] })); setRevisando(false);
      await carregarPedidos(); setAba("pedidos");
    } catch (e) {
      setAviso(e instanceof ErroApi ? e.message : "Não foi possível criar o pedido.");
      if (e instanceof ErroApi && e.motivo) void carregarCatalogo();
    } finally { setEnviando(false); }
  }

  // ---------------------------------------------------------------- render
  if (erro && !catalogo) return <p role="alert" className="panel-3d rounded-xl p-4 text-sm text-red-700 dark:text-red-300" data-testid="mj-erro">{erro}</p>;
  if (!catalogo || !cat) return <p className="panel-3d rounded-xl p-6 text-center text-xs text-muted-foreground flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Carregando Meus Jogos…</p>;

  const d = cat.disponibilidade;
  return (
    <div className="space-y-4" data-testid="meus-jogos">
      <header className="panel-3d rounded-xl overflow-hidden">
        <div className="login-card-topbar px-5 py-4">
          <p className="text-accent text-[9px] font-black uppercase tracking-widest">Grupo VIP · jogos individuais</p>
          <h2 className="text-primary font-black text-2xl mt-0.5 tracking-wide" style={titulo}>Meus Jogos</h2>
          <p className="text-muted-foreground text-xs leading-snug mt-1">Monte o seu jogo, confira o preço oficial e acompanhe cada pedido até o comprovante. Separado da Conexão Milionária.</p>
        </div>
      </header>

      {!catalogo.membro ? (
        <section className="panel-3d rounded-xl p-4 flex gap-3" data-testid="mj-nao-membro">
          <ShieldAlert className="w-5 h-5 shrink-0 text-accent" aria-hidden="true" />
          <p className="text-xs leading-relaxed text-primary">Meus Jogos é exclusivo de quem participa do Grupo VIP. Aceite o convite na tela do Grupo VIP para liberar esta área.</p>
        </section>
      ) : (
        <>
          <div role="tablist" aria-label="Seções de Meus Jogos" className="grid grid-cols-3 gap-2">
            {ABAS.map((a) => (
              <button key={a.k} type="button" role="tab" id={`mj-tab-${a.k}`} aria-selected={aba === a.k} aria-controls="mj-painel" onClick={() => setAba(a.k)} data-testid={`mj-aba-${a.k}`}
                className={`min-h-[44px] rounded-lg text-[11px] font-black uppercase tracking-wider ${aba === a.k ? "bevel-3d text-primary" : "btn-3d-soft"}`}>
                {a.t}{a.k === "pedidos" && haAndamento ? " •" : ""}
              </button>
            ))}
          </div>

          <div role="tabpanel" id="mj-painel" aria-labelledby={`mj-tab-${aba}`} className="space-y-4">
            {aba !== "pedidos" && (
              <div role="radiogroup" aria-label="Modalidade" className="grid grid-cols-2 gap-2">
                {ORDEM.map((k) => {
                  const m = catalogo.modalidades.find((x) => x.chave === k)!;
                  return (
                    <button key={k} type="button" role="radio" aria-checked={mod === k} onClick={() => { setMod(k); setAviso(""); setRevisando(false); }} data-testid={`mj-mod-${k}`}
                      className={`min-h-[48px] rounded-lg px-2 text-xs font-black uppercase tracking-wide ${mod === k ? "bevel-3d text-primary" : "btn-3d-soft"}`}>
                      {m.nome}{carrinho[k].length > 0 ? ` (${carrinho[k].length})` : ""}
                    </button>
                  );
                })}
              </div>
            )}

            {aba === "jogar" && (
              <>
                <section className="panel-3d rounded-xl overflow-hidden" aria-label={`Volante da ${cat.nome}`}>
                  <div className="login-card-topbar px-4 py-3">
                    <h3 className="text-primary font-black text-lg tracking-wide" style={titulo}>{cat.nome}</h3>
                    <p className="text-muted-foreground text-[11px] leading-snug">{cat.sorteios}. De {cat.dezenasMin === cat.dezenasMax ? `exatamente ${cat.dezenasMin}` : `${cat.dezenasMin} a ${cat.dezenasMax}`} dezenas, de {dz(cat.dezenaMin)} a {dz(cat.dezenaMax)}.</p>
                  </div>
                  <div className="p-3 space-y-3">
                    <p role="status" data-testid="mj-disponibilidade" data-aberto={d.aberto ? "sim" : "nao"} data-motivo={d.motivo ?? ""}
                      className={`rounded-lg px-3 py-2 text-xs leading-snug ${d.aberto ? "concave-3d text-primary" : "concave-3d text-amber-800 dark:text-amber-300"}`}>
                      {d.aberto && d.concurso && d.prazos
                        ? <>Próximo concurso: <strong>{d.concurso.numero}</strong>, em {brData(d.concurso.data)}. Pedidos até {brDataHora(d.prazos.limiteInternoEm)}.</>
                        : <><strong>Pedidos indisponíveis agora.</strong> {d.mensagem}</>}
                    </p>
                    {d.fonte.desatualizado && <p className="text-[11px] text-amber-800 dark:text-amber-300" data-testid="mj-fonte-desatualizada">Dados desatualizados: {d.fonte.motivo}</p>}

                    <Volante min={cat.dezenaMin} max={cat.dezenaMax} marcadas={sel} maximo={cat.dezenasMax} onAlternar={alternar} nome={cat.nome} />

                    {/* faixa: selecao, quantidade e preco oficial */}
                    <div className="panel-3d-sub rounded-xl p-3 sticky bottom-[76px] z-10" data-testid="mj-faixa" aria-live="polite">
                      <p className="text-primary text-xs font-black tabular-nums break-words" data-testid="mj-faixa-selecao">{sel.length ? sel.map(dz).join(" ") : "Nenhuma dezena marcada"}</p>
                      <div className="flex items-end justify-between gap-2 mt-1">
                        <p className="text-muted-foreground text-[11px] leading-snug" data-testid="mj-faixa-texto">{sel.length} marcada(s). {faixaTexto}</p>
                        <p className="text-primary font-black text-lg tabular-nums shrink-0" style={titulo} data-testid="mj-faixa-preco">{precoSel !== null ? brl(precoSel) : "—"}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <button type="button" onClick={limpar} disabled={sel.length === 0} className="btn-3d-soft min-h-[44px] px-3 text-[11px] font-black uppercase tracking-wider inline-flex items-center justify-center gap-2 disabled:opacity-50" data-testid="mj-limpar"><Eraser className="w-4 h-4" aria-hidden="true" /> Limpar</button>
                      <button type="button" onClick={aleatorio} className="btn-3d-soft min-h-[44px] px-3 text-[11px] font-black uppercase tracking-wider inline-flex items-center justify-center gap-2" data-testid="mj-aleatorio"><Dices className="w-4 h-4" aria-hidden="true" /> Aleatório</button>
                    </div>
                    {cat.dezenasMin !== cat.dezenasMax && (
                      <div className="flex items-center gap-2">
                        <label htmlFor="mj-qtd" className="text-[11px] font-black uppercase tracking-wider text-primary">Dezenas no aleatório</label>
                        <select id="mj-qtd" className="field-engraved min-h-[44px] px-2 text-sm" value={qtdAleatoria[mod]} onChange={(e) => setQtdAleatoria((q) => ({ ...q, [mod]: Number(e.target.value) }))}>
                          {cat.precos.map((p) => <option key={p.quantidade} value={p.quantidade}>{p.quantidade} · {brl(p.precoCentavos)}</option>)}
                        </select>
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                      <button type="button" onClick={favoritar} disabled={!valido} className="btn-3d-soft min-h-[44px] px-3 text-[11px] font-black uppercase tracking-wider inline-flex items-center justify-center gap-2 disabled:opacity-50" data-testid="mj-favoritar"><Heart className="w-4 h-4" aria-hidden="true" /> Favorito</button>
                      <button type="button" onClick={adicionar} disabled={!valido} className="btn-3d-soft min-h-[44px] px-3 text-[11px] font-black uppercase tracking-wider inline-flex items-center justify-center gap-2 disabled:opacity-50" data-testid="mj-adicionar"><Plus className="w-4 h-4" aria-hidden="true" /> Ao pedido</button>
                    </div>
                    {aviso && <p role="status" className="text-xs text-primary" data-testid="mj-aviso">{aviso}</p>}
                  </div>
                </section>

                {favs.length > 0 && (
                  <section className="panel-3d rounded-xl p-3 space-y-2" aria-label="Favoritos" data-testid="mj-favoritos">
                    <h3 className="text-primary text-xs font-black uppercase tracking-widest">Favoritos · {cat.nome}</h3>
                    {favs.map((f) => (
                      <div key={f.id} className="concave-3d rounded-lg px-2 py-1 flex items-center gap-1">
                        <button type="button" className="flex-1 min-h-[44px] text-left text-xs text-primary font-black tabular-nums" onClick={() => { setMarcadas((m) => ({ ...m, [mod]: f.dezenas })); setAviso(""); }} aria-label={`Usar favorito ${f.apelido ?? ""} ${f.dezenas.map(dz).join(" ")}`}>
                          {f.apelido ? <span className="block text-accent text-[10px] uppercase tracking-wider">{f.apelido}</span> : null}{f.dezenas.map(dz).join(" ")}
                        </button>
                        <button type="button" className="min-w-[44px] min-h-[44px] flex items-center justify-center text-muted-foreground" onClick={() => void removerFavorito(f.id)} aria-label="Remover favorito"><Trash2 className="w-4 h-4" aria-hidden="true" /></button>
                      </div>
                    ))}
                  </section>
                )}

                <section className="panel-3d rounded-xl overflow-hidden" aria-label="Resumo do pedido" data-testid="mj-resumo">
                  <div className="login-card-topbar px-4 py-3"><h3 className="text-primary text-xs font-black uppercase tracking-widest">Resumo do pedido · {cat.nome}</h3></div>
                  <div className="p-3 space-y-2">
                    {jogos.length === 0 && <p className="concave-3d rounded-lg px-3 py-3 text-xs text-muted-foreground text-center">Nenhum jogo no pedido. Marque as dezenas e toque em “Ao pedido”.</p>}
                    {jogos.map((j, i) => (
                      <div key={j.join("-")} className="concave-3d rounded-lg pl-3 pr-1 flex items-center gap-1" data-testid="mj-resumo-jogo">
                        <p className="flex-1 py-2 text-xs text-primary font-black tabular-nums">Jogo {i + 1}: {j.map(dz).join(" ")} <span className="text-muted-foreground font-semibold">· {brl(precoDe(j.length) ?? 0)}</span></p>
                        <button type="button" className="min-w-[44px] min-h-[44px] flex items-center justify-center text-muted-foreground" onClick={() => removerDoPedido(i)} aria-label={`Remover jogo ${i + 1}`}><X className="w-4 h-4" aria-hidden="true" /></button>
                      </div>
                    ))}
                    {jogos.length > 0 && (
                      <>
                        <p className="flex items-baseline justify-between text-primary"><span className="text-xs font-black uppercase tracking-wider">Total</span><span className="font-black text-xl tabular-nums" style={titulo} data-testid="mj-total">{brl(total)}</span></p>
                        {total > catalogo.tetoPedidoCentavos && <p role="alert" className="text-xs text-red-700 dark:text-red-300">O total passa do limite de {brl(catalogo.tetoPedidoCentavos)} por pedido. Remova algum jogo.</p>}
                        {!revisando ? (
                          <button type="button" className="btn-3d-soft w-full min-h-[48px] px-3 text-xs font-black uppercase tracking-wider disabled:opacity-60" disabled={!d.aberto || total > catalogo.tetoPedidoCentavos} onClick={() => setRevisando(true)} data-testid="mj-revisar">Revisar e confirmar</button>
                        ) : (
                          <div className="panel-3d-sub rounded-xl p-3 space-y-2" data-testid="mj-confirmacao">
                            <p className="text-xs text-primary leading-relaxed">Você vai pedir {jogos.length} jogo(s) da {cat.nome} para o concurso {d.concurso?.numero} por <strong>{brl(total)}</strong>. Depois de confirmar, você paga por PIX na aba Pedidos. O jogo só é considerado registrado quando o comprovante oficial estiver anexado. Se o prazo passar sem registro, o valor é devolvido.</p>
                            <div className="grid grid-cols-2 gap-2">
                              <button type="button" className="btn-3d-soft min-h-[48px] text-[11px] font-black uppercase tracking-wider" onClick={() => setRevisando(false)}>Voltar</button>
                              <button type="button" className="btn-3d-soft min-h-[48px] text-[11px] font-black uppercase tracking-wider disabled:opacity-60 inline-flex items-center justify-center gap-2" disabled={enviando} onClick={() => void confirmar()} data-testid="mj-confirmar">{enviando && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />} Confirmar pedido</button>
                            </div>
                          </div>
                        )}
                        {!d.aberto && <p className="text-[11px] text-amber-800 dark:text-amber-300 leading-snug" data-testid="mj-confirmar-bloqueado">Confirmação desativada: {d.mensagem}</p>}
                      </>
                    )}
                  </div>
                </section>
              </>
            )}

            {aba === "pedidos" && <Pedidos pedidos={pedidos} token={token} carregando={pedidos === null && !erroPedidos} erro={erroPedidos} onMudou={() => void carregarPedidos()} />}
            {aba === "resultados" && <Resultados dados={resultados?.find((r) => r.modalidade === mod)} carregando={carregandoRes} erro={erroResultados} onAtualizar={() => void carregarResultados()} />}
          </div>
        </>
      )}
    </div>
  );
}
