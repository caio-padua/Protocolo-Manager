import { useEffect, useRef, useState } from "react";
import { ArrowDownToLine, ArrowUpToLine, ChevronDown, LayoutGrid, Rows3, PanelTop } from "lucide-react";
import CockpitContent, { type CockpitContentProps } from "./CockpitContent";
import { ABAS, type AbaId } from "./CockpitTabs";
import { ErroFerramenta } from "./ErroFerramenta";

export type ModoCockpit = "abas" | "telas" | "ficha";

interface Props extends Omit<CockpitContentProps, "aba" | "marcarTelegramAoAbrir" | "visivel"> {
  aba: AbaId;
  modo: ModoCockpit;
  onModo: (modo: ModoCockpit) => void;
  onFerramentaVisivel: (aba: AbaId) => void;
  focoSolicitado: { id: AbaId; sequencia: number } | null;
  clienteVisivel: boolean;
}

export default function CockpitViews({
  aba, modo, onModo, onFerramentaVisivel, focoSolicitado, clienteVisivel, ...conteudo
}: Props) {
  const listaRef = useRef<HTMLDivElement>(null);
  const [visitadas, setVisitadas] = useState<Set<AbaId>>(() => new Set([aba]));
  const [abertas, setAbertas] = useState<Set<AbaId>>(() => new Set(ABAS.map((item) => item.id)));

  useEffect(() => {
    setVisitadas((atuais) => atuais.has(aba) ? atuais : new Set([...atuais, aba]));
  }, [aba]);

  useEffect(() => {
    if (!focoSolicitado || modo === "abas") return;
    const { id } = focoSolicitado;
    setVisitadas((atuais) => atuais.has(id) ? atuais : new Set([...atuais, id]));
    setAbertas((atuais) => atuais.has(id) ? atuais : new Set([...atuais, id]));
    const quadro = requestAnimationFrame(() => {
      document.getElementById(`cc-ferramenta-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => cancelAnimationFrame(quadro);
  }, [focoSolicitado, modo]);

  // A ficha pode conter ferramentas pesadas. As seções abrem juntas, mas cada
  // ferramenta é montada somente ao se aproximar da janela; não é uma cópia.
  useEffect(() => {
    const lista = listaRef.current;
    if (!lista || modo === "abas") return;
    const secoes = [...lista.querySelectorAll<HTMLElement>('[data-cockpit-section][data-aberta="true"]')];
    if (typeof IntersectionObserver === "undefined") {
      setVisitadas((atuais) => new Set([...atuais, ...secoes.map((item) => item.dataset.cockpitSection as AbaId)]));
      return;
    }
    const observer = new IntersectionObserver((entradas) => {
      const ids = entradas.filter((entrada) => entrada.isIntersecting)
        .map((entrada) => (entrada.target as HTMLElement).dataset.cockpitSection as AbaId);
      if (!ids.length) return;
      setVisitadas((atuais) => {
        if (ids.every((id) => atuais.has(id))) return atuais;
        return new Set([...atuais, ...ids]);
      });
    }, { rootMargin: "700px 0px" });
    secoes.forEach((secao) => observer.observe(secao));
    return () => observer.disconnect();
  }, [modo, abertas]);

  // Destaca a seção mais visível sem trocar a rota apenas por rolar a página.
  useEffect(() => {
    if (modo === "abas") {
      onFerramentaVisivel(aba);
      return;
    }
    let quadro = 0;
    const atualizar = () => {
      if (quadro) return;
      quadro = requestAnimationFrame(() => {
        quadro = 0;
        const secoes = [...(listaRef.current?.querySelectorAll<HTMLElement>("[data-cockpit-section]") ?? [])];
        let melhor: { id: AbaId; altura: number } | null = null;
        for (const secao of secoes) {
          const retangulo = secao.getBoundingClientRect();
          const altura = Math.max(0, Math.min(window.innerHeight, retangulo.bottom) - Math.max(68, retangulo.top));
          if (altura > 0 && (!melhor || altura > melhor.altura)) {
            melhor = { id: secao.dataset.cockpitSection as AbaId, altura };
          }
        }
        if (melhor) onFerramentaVisivel(melhor.id);
      });
    };
    atualizar();
    window.addEventListener("scroll", atualizar, { passive: true, capture: true });
    window.addEventListener("resize", atualizar);
    return () => {
      window.removeEventListener("scroll", atualizar, true);
      window.removeEventListener("resize", atualizar);
      if (quadro) cancelAnimationFrame(quadro);
    };
  }, [modo, aba, abertas, onFerramentaVisivel]);

  function alternar(id: AbaId) {
    if (id === "protocolos" && conteudo.protocoloEmAndamento && abertas.has(id)) return;
    setAbertas((atuais) => {
      const proximas = new Set(atuais);
      if (proximas.has(id)) proximas.delete(id);
      else proximas.add(id);
      return proximas;
    });
  }

  return (
    <div className="cc-workspace">
      <div className="cc-workspace-bar">
        <div>
          <span>ESPAÇO DE TRABALHO</span>
          <h2>Um cliente. Doze ferramentas.</h2>
        </div>
        <div className="cc-modes" role="group" aria-label="Modo de visualização do Cockpit">
          <button type="button" data-active={modo === "abas"} aria-pressed={modo === "abas"} onClick={() => onModo("abas")}>
            <PanelTop size={15} aria-hidden="true" /> ABAS
          </button>
          <button type="button" data-active={modo === "telas"} aria-pressed={modo === "telas"} onClick={() => onModo("telas")}>
            <LayoutGrid size={15} aria-hidden="true" /> TELAS · TODAS ABERTAS
          </button>
          <button type="button" data-active={modo === "ficha"} aria-pressed={modo === "ficha"} onClick={() => onModo("ficha")}>
            <Rows3 size={15} aria-hidden="true" /> FICHA CONTÍNUA
          </button>
        </div>
      </div>

      {modo === "ficha" && (
        <div className="cc-ficha-controls" role="group" aria-label="Controles da ficha contínua">
          <span>{abertas.size} / {ABAS.length} ABERTAS</span>
          <button type="button" disabled={abertas.size === ABAS.length}
            onClick={() => setAbertas(new Set(ABAS.map((item) => item.id)))}>
            <ArrowDownToLine size={14} aria-hidden="true" /> EXPANDIR TUDO
          </button>
          <button type="button" disabled={abertas.size === 0 || conteudo.protocoloEmAndamento}
            title={conteudo.protocoloEmAndamento ? "Aguarde a conclusão do protocolo." : undefined}
            onClick={() => setAbertas(new Set())}>
            <ArrowUpToLine size={14} aria-hidden="true" /> RECOLHER TUDO
          </button>
        </div>
      )}

      <div ref={listaRef} className={`cc-panels cc-panels-${modo}`}>
        {ABAS.map((ferramenta, indice) => {
          const aberta = modo === "telas" || (modo === "ficha" ? abertas.has(ferramenta.id) : aba === ferramenta.id);
          const mostrarSecao = modo !== "abas" || aba === ferramenta.id;
          const mostrarConteudo = clienteVisivel && mostrarSecao && aberta;
          const nomeId = `cc-titulo-${ferramenta.id}`;
          return (
            <section key={ferramenta.id} id={`cc-ferramenta-${ferramenta.id}`}
              data-cockpit-section={ferramenta.id} data-aberta={aberta}
              data-ferramenta={ferramenta.id} className="cc-panel"
              aria-labelledby={modo === "abas" ? undefined : nomeId} hidden={!mostrarSecao}>
              {modo !== "abas" && (
                <div className="cc-panel-heading">
                  {modo === "ficha" ? (
                    <button type="button" className="cc-panel-toggle" aria-expanded={aberta}
                      aria-controls={`cc-conteudo-${ferramenta.id}`}
                      disabled={ferramenta.id === "protocolos" && conteudo.protocoloEmAndamento && aberta}
                      onClick={() => alternar(ferramenta.id)}>
                      <span className="cc-panel-index">{String(indice + 1).padStart(2, "0")}</span>
                      <ferramenta.Icon size={17} aria-hidden="true" />
                      <strong id={nomeId}>{ferramenta.rotulo}</strong>
                      <ChevronDown size={16} className={aberta ? "is-open" : ""} aria-hidden="true" />
                    </button>
                  ) : (
                    <div className="cc-panel-title">
                      <span className="cc-panel-index">{String(indice + 1).padStart(2, "0")}</span>
                      <ferramenta.Icon size={17} aria-hidden="true" />
                      <strong id={nomeId}>{ferramenta.rotulo}</strong>
                    </div>
                  )}
                </div>
              )}
              <div key="conteudo" id={`cc-conteudo-${ferramenta.id}`} className="cc-panel-body" hidden={!aberta}>
                {visitadas.has(ferramenta.id) ? (
                  <ErroFerramenta nome={ferramenta.rotulo}>
                    <CockpitContent {...conteudo} aba={ferramenta.id}
                      visivel={mostrarConteudo}
                      marcarTelegramAoAbrir={false} />
                  </ErroFerramenta>
                ) : (
                  <div className="cc-panel-loading" role="status">A ferramenta será carregada ao se aproximar desta seção.</div>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
