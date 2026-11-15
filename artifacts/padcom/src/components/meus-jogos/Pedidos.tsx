import { useState } from "react";
import { AlertTriangle, Check, CircleDashed, Download, Loader2, ScanSearch, XCircle } from "lucide-react";
import { baixarComprovanteCliente, chamarMeusJogos, ErroApi } from "./api";
import { brData, brDataHora, brl, dz, type PedidoVisto, type PassoLinha } from "./tipos";
import AvatarComprovante from "./AvatarComprovante";

// Pedidos individuais com linha do tempo. "Registrado" so aparece com comprovante oficial; "pago" so apos confirmacao do Asaas pelo servidor.
function Passo({ p }: { p: PassoLinha }) {
  const cfg = {
    feito: { Icon: Check, cls: "bg-emerald-600 text-white", t: "concluído" },
    atual: { Icon: Loader2, cls: "bg-accent text-accent-foreground", t: "em andamento" },
    pendente: { Icon: CircleDashed, cls: "bg-muted text-muted-foreground", t: "pendente" },
    falhou: { Icon: XCircle, cls: "bg-red-600 text-white", t: "não ocorreu" },
    em_conferencia: { Icon: ScanSearch, cls: "bg-amber-500 text-black", t: "em conferência" },
  }[p.estado];
  return (
    <li className="flex flex-col items-center gap-1 flex-1 min-w-0" data-estado={p.estado}>
      <span className={`w-7 h-7 rounded-full flex items-center justify-center ${cfg.cls}`}><cfg.Icon className={`w-4 h-4 ${p.estado === "atual" ? "animate-spin" : ""}`} aria-hidden="true" /></span>
      <span className="text-[9px] font-black uppercase tracking-wide text-primary text-center leading-tight">{p.rotulo}</span>
      <span className="sr-only">{cfg.t}</span>
    </li>
  );
}

function Cartao({ p, token, onMudou }: { p: PedidoVisto; token: string; onMudou: () => void }) {
  const [ocupado, setOcupado] = useState(false);
  const [msg, setMsg] = useState("");
  const [pix, setPix] = useState<{ payload: string; encodedImage: string } | null>(null);
  const [link, setLink] = useState<string | null>(p.invoiceUrl);

  async function agir(fn: () => Promise<void>) {
    setOcupado(true); setMsg("");
    try { await fn(); onMudou(); } catch (e) { setMsg(e instanceof ErroApi ? e.message : "Não foi possível concluir."); } finally { setOcupado(false); }
  }
  const pagar = () => agir(async () => {
    const r = await chamarMeusJogos<{ invoiceUrl: string | null; pix: { payload: string; encodedImage: string } | null }>(token, `/pedidos/${p.id}/pagar`, { method: "POST" });
    setLink(r.invoiceUrl); setPix(r.pix);
  });
  const cancelar = () => agir(async () => { await chamarMeusJogos(token, `/pedidos/${p.id}/cancelar`, { method: "POST" }); });
  const copiar = async () => { if (pix) { try { await navigator.clipboard.writeText(pix.payload); setMsg("Código PIX copiado."); } catch { setMsg("Não foi possível copiar. Selecione o código e copie manualmente."); } } };

  const critico = p.status === "falha_em_conferencia" || p.status === "devolucao_pendente";
  return (
    <article className="panel-3d-sub rounded-xl p-3 space-y-3" data-testid="mj-pedido" data-status={p.status} aria-label={`Pedido ${p.id}`}>
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-primary text-sm font-black">{p.nome} · concurso {p.concurso}</p>
          <p className="text-muted-foreground text-[11px]">Sorteio em {brData(p.dataSorteio)} · pedido {p.id} · {brl(p.totalCentavos)}</p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${p.status === "efetivado" ? "bg-emerald-600 text-white" : critico ? "bg-amber-500 text-black" : "bg-muted text-primary"}`} data-testid="mj-pedido-rotulo">{p.rotulo}</span>
      </header>
      {p.status === "efetivado" && p.comprovante && <AvatarComprovante />}
      <ol className="flex items-start gap-1" aria-label="Andamento do pedido">{p.linhaDoTempo.map((x) => <Passo key={x.chave} p={x} />)}</ol>
      {p.falha && <p role="status" className="concave-3d rounded-lg px-3 py-2 text-xs leading-snug text-primary flex gap-2"><AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" aria-hidden="true" />{p.falha.texto}</p>}
      <ul className="space-y-1">
        {p.jogos.map((j) => (
          <li key={j.ordem} className="concave-3d rounded-lg px-3 py-2 text-xs flex flex-wrap items-center justify-between gap-1">
            <span className="text-primary font-black tabular-nums">Jogo {j.ordem}: {j.dezenas.map(dz).join(" ")}</span>
            <span className="text-muted-foreground">{brl(j.precoCentavos)}</span>
          </li>
        ))}
      </ul>
      {p.status === "aguardando_pagamento" && <p className="text-[11px] text-muted-foreground leading-snug">Pague até {brDataHora(p.prazos.limiteInternoEm)}. Depois disso o pedido expira e nada é cobrado.</p>}
      {p.pagoEm && p.status === "pago_na_fila" && <p className="text-[11px] text-muted-foreground leading-snug">Pagamento confirmado em {brDataHora(p.pagoEm)}. Meta de registro: {p.prazos.metaEfetivacaoEm ? brDataHora(p.prazos.metaEfetivacaoEm) : "—"}.{p.atrasadoNaMeta ? " Estamos além da meta; a equipe foi sinalizada." : ""}</p>}
      {p.comprovante && (
        <button type="button" disabled={ocupado} onClick={() => agir(() => baixarComprovanteCliente(token, p.id))} className="btn-3d-soft w-full min-h-[44px] px-3 text-xs font-black uppercase tracking-wider inline-flex items-center justify-center gap-2" data-testid="mj-baixar-comprovante">
          <Download className="w-4 h-4" aria-hidden="true" /> Baixar comprovante oficial
        </button>
      )}
      {p.podePagar && !pix && !link && (
        <button type="button" disabled={ocupado} onClick={pagar} className="btn-3d-soft w-full min-h-[48px] px-3 text-xs font-black uppercase tracking-wider disabled:opacity-60" data-testid="mj-pagar">
          {ocupado ? "Gerando cobrança…" : `Pagar ${brl(p.totalCentavos)} por PIX`}
        </button>
      )}
      {(pix || link) && p.status === "aguardando_pagamento" && (
        <div className="concave-3d rounded-lg p-3 space-y-2" data-testid="mj-pix">
          {pix?.encodedImage && <img alt="QR Code PIX do pedido" className="mx-auto w-44 h-44 bg-white p-1 rounded" src={`data:image/png;base64,${pix.encodedImage}`} />}
          {pix && <button type="button" onClick={copiar} className="btn-3d-soft w-full min-h-[44px] px-3 text-xs font-black uppercase tracking-wider">Copiar código PIX</button>}
          {link && <a href={link} target="_blank" rel="noopener noreferrer" className="btn-3d-soft w-full min-h-[44px] px-3 text-xs font-black uppercase tracking-wider inline-flex items-center justify-center">Abrir a cobrança</a>}
          <p className="text-[11px] text-muted-foreground leading-snug">Depois de pagar, esta tela só mostra “pago” quando o banco confirmar. Pode levar alguns instantes.</p>
        </div>
      )}
      {p.podeCancelar && <button type="button" disabled={ocupado} onClick={cancelar} className="w-full min-h-[44px] text-[11px] font-black uppercase tracking-wider text-muted-foreground underline underline-offset-4">Cancelar este pedido</button>}
      {msg && <p role="status" className="text-xs text-primary">{msg}</p>}
    </article>
  );
}

export default function Pedidos({ pedidos, token, carregando, erro, onMudou }: { pedidos: PedidoVisto[] | null; token: string; carregando: boolean; erro: string; onMudou: () => void }) {
  return (
    <section className="space-y-3" aria-label="Meus pedidos" data-testid="mj-pedidos">
      {erro && <p role="alert" className="concave-3d rounded-lg px-3 py-2 text-xs text-red-700 dark:text-red-300">{erro}</p>}
      {carregando && !pedidos && <p className="concave-3d rounded-lg px-3 py-3 text-xs text-muted-foreground text-center">Carregando pedidos…</p>}
      {pedidos && pedidos.length === 0 && <p className="concave-3d rounded-lg px-3 py-4 text-xs text-muted-foreground text-center" data-testid="mj-pedidos-vazio">Você ainda não fez nenhum pedido. Monte seus jogos na aba Jogar.</p>}
      {pedidos?.map((p) => <Cartao key={`${p.id}-${p.status}`} p={p} token={token} onMudou={onMudou} />)}
    </section>
  );
}
