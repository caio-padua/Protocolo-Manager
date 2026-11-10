import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { abreviarNomeCliente } from "./abreviarNomeCliente";

/** A abreviação nunca modifica o cadastro e o nome completo continua acessível. */
export function NomeClienteResponsivo({ nome }: { nome: string }) {
  const caixa = useRef<HTMLDivElement>(null);
  const titulo = useRef<HTMLHeadingElement>(null);
  const medidor = useRef<HTMLSpanElement>(null);
  const identificador = useId();
  const [mostrarCompleto, setMostrarCompleto] = useState(false);
  const [ajuste, setAjuste] = useState({ original: nome, exibido: nome, precisaCortar: false });
  const exibido = ajuste.original === nome ? ajuste.exibido : nome;
  const precisaCortar = ajuste.original === nome && ajuste.precisaCortar;
  const podeConsultar = exibido !== nome || precisaCortar;

  useLayoutEffect(() => { setMostrarCompleto(false); }, [nome]);
  useEffect(() => {
    if (!podeConsultar) setMostrarCompleto(false);
  }, [podeConsultar]);
  useEffect(() => {
    if (!mostrarCompleto) return;
    const fecharAoSair = (evento: PointerEvent) => {
      if (!caixa.current?.contains(evento.target as Node)) setMostrarCompleto(false);
    };
    const fecharPeloTeclado = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") setMostrarCompleto(false);
    };
    document.addEventListener("pointerdown", fecharAoSair);
    document.addEventListener("keydown", fecharPeloTeclado);
    return () => {
      document.removeEventListener("pointerdown", fecharAoSair);
      document.removeEventListener("keydown", fecharPeloTeclado);
    };
  }, [mostrarCompleto]);

  useLayoutEffect(() => {
    const elemento = titulo.current;
    const medida = medidor.current;
    if (!elemento || !medida) return;
    let ativo = true;
    const atualizar = () => {
      if (!ativo) return;
      const largura = elemento.clientWidth;
      const medir = (texto: string) => {
        medida.textContent = texto;
        return medida.getBoundingClientRect().width;
      };
      const proximo = abreviarNomeCliente(nome, largura, medir);
      const cortar = largura > 0 && medir(proximo) > largura;
      setAjuste((anterior) =>
        anterior.original === nome && anterior.exibido === proximo && anterior.precisaCortar === cortar
          ? anterior : { original: nome, exibido: proximo, precisaCortar: cortar },
      );
    };
    atualizar();
    const observador = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(atualizar);
    observador?.observe(elemento);
    window.addEventListener("resize", atualizar);
    document.fonts?.addEventListener("loadingdone", atualizar);
    void document.fonts?.ready.then(atualizar);
    return () => {
      ativo = false;
      observador?.disconnect();
      window.removeEventListener("resize", atualizar);
      document.fonts?.removeEventListener("loadingdone", atualizar);
    };
  }, [nome]);

  return (
    <div className="cc-name-wrapper" ref={caixa}>
      <h1 ref={titulo} aria-label={nome} title={nome}>
        {podeConsultar ? (
          <button type="button" className="cc-name-trigger" title={nome}
            aria-label={`Mostrar nome completo: ${nome}`} aria-expanded={mostrarCompleto}
            aria-controls={mostrarCompleto ? identificador : undefined}
            onClick={() => setMostrarCompleto((atual) => !atual)}>
            {exibido}
          </button>
        ) : exibido}
        <span ref={medidor} className="cc-name-measure" aria-hidden="true" />
      </h1>
      {mostrarCompleto && podeConsultar && (
        <div id={identificador} className="cc-name-popover" role="status">
          <span>NOME COMPLETO</span>
          <strong>{nome}</strong>
        </div>
      )}
    </div>
  );
}
