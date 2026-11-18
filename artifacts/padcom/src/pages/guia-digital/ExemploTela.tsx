import { useEffect, useState, type ReactNode } from "react";
import { Eye, X, Share, MoreVertical, Plus, Download, SquarePlus, Check, ChevronLeft, ChevronRight, BookOpen, Copy as CopyIcon } from "lucide-react";

/**
 * Exemplos de tela do Manual do Cliente: ILUSTRACOES esquematicas (nao sao capturas reais).
 * O alvo do toque vem com neon dourado. Abre num quadro por cima; fecha com X, fora ou ESC.
 */
export type TipoExemplo =
  | "iphone-compartilhar" | "iphone-lista" | "iphone-adicionar"
  | "android-menu" | "android-instalar" | "android-confirma"
  | "desktop-icone";

const TITULOS: Record<TipoExemplo, { t: string; d: string }> = {
  "iphone-compartilhar": { t: "Safari: botão Compartilhar", d: "Fica no meio da barra de baixo. Toque nele." },
  "iphone-lista": { t: "Lista do Compartilhar", d: "Role a lista com o dedo e toque em Adicionar à Tela de Início." },
  "iphone-adicionar": { t: "Confirmar o atalho", d: "Toque em Adicionar, no canto superior direito." },
  "android-menu": { t: "Chrome: menu dos 3 pontinhos", d: "Fica no canto superior direito." },
  "android-instalar": { t: "Menu do Chrome", d: "Toque em Instalar aplicativo ou Adicionar à tela inicial." },
  "android-confirma": { t: "Confirmar a instalação", d: "Toque em Instalar (ou Adicionar)." },
  "desktop-icone": { t: "Barra de endereço", d: "O ícone de instalar fica no fim da barra, antes dos 3 pontinhos." },
};

function Celular({ children, claro = true }: { children: ReactNode; claro?: boolean }) {
  return (
    <div className="mx-auto w-[220px] h-[340px] rounded-[28px] border-[6px] border-[#16284a] overflow-hidden relative shadow-xl"
      style={{ background: claro ? "#f4f4f6" : "#1c1c1e" }}>
      <div className="absolute left-1/2 -translate-x-1/2 top-1 w-16 h-4 rounded-full bg-[#16284a] z-10" />
      {children}
    </div>
  );
}

const alvo = "ex-destaque";

function Tela({ tipo }: { tipo: TipoExemplo }) {
  if (tipo === "iphone-compartilhar") return (
    <Celular>
      <div className="pt-8 px-3 text-[10px] text-center text-neutral-500">paxmed.exemplo/area</div>
      <div className="mx-3 mt-3 h-24 rounded-md bg-white border border-neutral-200 flex items-center justify-center text-[11px] font-bold text-[#16284a]">PaxMed</div>
      <div className="absolute bottom-0 inset-x-0 h-14 bg-white/95 border-t border-neutral-200 grid grid-cols-5 place-items-center text-neutral-600">
        <ChevronLeft className="w-5 h-5" /><ChevronRight className="w-5 h-5" />
        <span className={`${alvo} p-1.5 bg-white text-blue-600`}><Share className="w-5 h-5" /></span>
        <BookOpen className="w-5 h-5" /><CopyIcon className="w-5 h-5" />
      </div>
    </Celular>
  );
  if (tipo === "iphone-lista") return (
    <Celular claro={false}>
      <div className="absolute inset-x-0 bottom-0 top-16 rounded-t-2xl bg-[#2c2c2e] p-3 space-y-2 text-[11px] text-white">
        {["Copiar", "Adicionar aos Favoritos", "Adicionar à Tela de Início", "Imprimir"].map((r) => (
          <div key={r} className={`flex items-center justify-between rounded-lg bg-[#3a3a3c] px-3 h-10 ${r.startsWith("Adicionar à") ? alvo : ""}`}>
            <span>{r}</span>{r.startsWith("Adicionar à") && <Plus className="w-4 h-4" />}
          </div>
        ))}
      </div>
    </Celular>
  );
  if (tipo === "iphone-adicionar") return (
    <Celular claro={false}>
      <div className="pt-8 px-3 flex items-center justify-between text-[12px] text-blue-400">
        <span>Cancelar</span><span className="text-white font-semibold text-[11px]">Adicionar à Tela de Início</span>
        <span className={`${alvo} px-2 py-1 font-bold bg-[#2c2c2e]`}>Adicionar</span>
      </div>
      <div className="mx-3 mt-6 rounded-xl bg-[#2c2c2e] p-3 flex items-center gap-3">
        <div className="w-12 h-12 rounded-xl bg-[#16284a] text-[#e6c36a] flex items-center justify-center font-black text-xs">PX</div>
        <div className="text-white text-[12px] font-semibold">PaxMed</div>
      </div>
    </Celular>
  );
  if (tipo === "android-menu") return (
    <Celular>
      <div className="pt-7 px-2 h-14 flex items-center gap-2 bg-white border-b border-neutral-200">
        <div className="flex-1 h-7 rounded-full bg-neutral-100 text-[10px] flex items-center px-3 text-neutral-500">paxmed.exemplo/area</div>
        <span className={`${alvo} p-1 bg-white text-neutral-700`}><MoreVertical className="w-5 h-5" /></span>
      </div>
      <div className="mx-3 mt-4 h-24 rounded-md bg-white border border-neutral-200 flex items-center justify-center text-[11px] font-bold text-[#16284a]">PaxMed</div>
    </Celular>
  );
  if (tipo === "android-instalar") return (
    <Celular>
      <div className="absolute right-2 top-10 w-44 rounded-lg bg-white shadow-lg border border-neutral-200 py-1 text-[11px] text-neutral-800">
        {["Nova guia", "Histórico", "Instalar aplicativo", "Configurações"].map((r) => (
          <div key={r} className={`px-3 h-9 flex items-center gap-2 ${r === "Instalar aplicativo" ? alvo + " bg-white font-bold" : ""}`}>
            {r === "Instalar aplicativo" && <Download className="w-4 h-4" />}{r}
          </div>
        ))}
      </div>
    </Celular>
  );
  if (tipo === "android-confirma") return (
    <Celular>
      <div className="absolute inset-x-4 top-24 rounded-2xl bg-white shadow-xl border border-neutral-200 p-4 text-[12px] text-neutral-800">
        <div className="font-bold mb-3">Instalar aplicativo?</div>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-[#16284a] text-[#e6c36a] flex items-center justify-center font-black text-[10px]">PX</div>PaxMed
        </div>
        <div className="flex justify-end gap-2">
          <span className="px-3 py-1.5 text-neutral-500">Cancelar</span>
          <span className={`${alvo} px-3 py-1.5 bg-blue-600 text-white font-bold`}>Instalar</span>
        </div>
      </div>
    </Celular>
  );
  return (
    <div className="mx-auto w-full max-w-[420px] rounded-xl border-[5px] border-[#16284a] bg-neutral-100 overflow-hidden">
      <div className="h-10 bg-white border-b border-neutral-200 flex items-center gap-2 px-3">
        <div className="flex-1 h-6 rounded-full bg-neutral-100 text-[10px] flex items-center px-3 text-neutral-500">paxmed.exemplo/area</div>
        <span className={`${alvo} p-1 bg-white text-neutral-700`}><Download className="w-4 h-4" /></span>
        <MoreVertical className="w-4 h-4 text-neutral-600" />
      </div>
      <div className="h-32 flex items-center justify-center text-[11px] font-bold text-[#16284a]">PaxMed</div>
    </div>
  );
}

export function ExemploTelaBotao({ tipo }: { tipo: TipoExemplo }) {
  const [aberto, setAberto] = useState(false);
  useEffect(() => {
    if (!aberto) return;
    const f = (e: KeyboardEvent) => { if (e.key === "Escape") setAberto(false); };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, [aberto]);
  return (
    <>
      <button type="button" data-testid={`guia-exemplo-${tipo}`} onClick={() => setAberto(true)}
        className="bevel-3d shrink-0 w-9 h-9 flex items-center justify-center rounded-[4px] border-none bg-transparent cursor-pointer text-primary opacity-80 hover:opacity-100"
        title="Ver um exemplo da tela" aria-label="Ver um exemplo da tela">
        <Eye className="w-4 h-4" />
      </button>
      {aberto && (
        <div role="dialog" aria-modal="true" aria-label={TITULOS[tipo].t} data-testid="guia-exemplo-modal"
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60" onClick={() => setAberto(false)}>
          <div className="panel-3d w-full max-w-[460px] max-h-[92vh] overflow-auto p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="grid grid-cols-[1fr_auto] items-center gap-3">
              <span className="text-[12px] font-black uppercase tracking-widest">{TITULOS[tipo].t}</span>
              <button type="button" onClick={() => setAberto(false)} aria-label="Fechar exemplo"
                className="bevel-3d w-9 h-9 flex items-center justify-center rounded-[4px] border-none bg-transparent cursor-pointer"><X className="w-4 h-4" /></button>
            </div>
            <Tela tipo={tipo} />
            <p className="leva-q m-0 text-[0.95rem] font-semibold text-center">{TITULOS[tipo].d}</p>
            <p className="m-0 text-[11px] text-center opacity-70">Ilustração de exemplo. A tela do seu aparelho pode ser um pouco diferente.</p>
          </div>
        </div>
      )}
    </>
  );
}

/** Figurinha do botao que o cliente vai procurar na tela (mesma forma e cor do aparelho). Tamanho fixo = alinhado. */
export function GlifoPasso({ tipo }: { tipo: TipoExemplo }) {
  const base = "shrink-0 h-9 min-w-9 px-1 flex items-center justify-center rounded-[6px] border border-neutral-300 bg-white text-[10px] font-bold leading-none";
  const c: Record<TipoExemplo, ReactNode> = {
    "iphone-compartilhar": <Share className="w-5 h-5 text-blue-600" />,
    "iphone-lista": <SquarePlus className="w-5 h-5 text-neutral-800" />,
    "iphone-adicionar": <Check className="w-5 h-5 text-blue-600" />,
    "android-menu": <MoreVertical className="w-5 h-5 text-neutral-700" />,
    "android-instalar": <Download className="w-5 h-5 text-neutral-700" />,
    "android-confirma": <Check className="w-5 h-5 text-blue-600" />,
    "desktop-icone": <Download className="w-5 h-5 text-neutral-700" />,
  };
  return <span className={base} data-testid={`guia-glifo-${tipo}`} aria-hidden>{c[tipo]}</span>;
}
