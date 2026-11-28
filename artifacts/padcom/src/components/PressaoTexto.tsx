import { useLayoutEffect, useRef, useState } from "react";
import { Numeral } from "@/components/numeral/Numeral";

/** Pressão arterial "120 / 80": usa os espaços ao redor da barra só quando cabem; se faltar largura, mostra "120/80". */
export function PressaoTexto({ texto, peso = 700, numeral = true }: { texto: string; peso?: number; numeral?: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [compacto, setCompacto] = useState(false);
  const espacado = texto.includes(" / ");
  useLayoutEffect(() => {
    const el = ref.current, pai = el?.closest<HTMLElement>("td,th,b,p,div,strong,li");
    if (!el || !pai || !espacado) return;
    const medir = () => {
      const cs = getComputedStyle(pai);
      let util = pai.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      // Descontar folgas (margem, borda e recuo) dos invólucros entre o texto e o recipiente.
      for (let e = el.parentElement; e && e !== pai; e = e.parentElement) {
        const c = getComputedStyle(e);
        util -= parseFloat(c.paddingLeft) + parseFloat(c.paddingRight) + parseFloat(c.borderLeftWidth) + parseFloat(c.borderRightWidth) + parseFloat(c.marginLeft) + parseFloat(c.marginRight);
      }
      util -= parseFloat(cs.borderLeftWidth) + parseFloat(cs.borderRightWidth);
      // Mede sempre a versão com espaços: se ela cabe, os espaços voltam.
      const larg = el.dataset.compacto === "1" ? Number(el.dataset.larguraEspacada ?? 0) : el.offsetWidth;
      if (!el.dataset.larguraEspacada || el.dataset.compacto !== "1") el.dataset.larguraEspacada = String(larg);
      setCompacto(larg > util + 0.5);
    };
    medir();
    const ro = new ResizeObserver(() => { el.dataset.compacto = "0"; setCompacto(false); requestAnimationFrame(medir); });
    ro.observe(pai);
    return () => ro.disconnect();
  }, [texto, espacado]);
  const final = espacado && compacto ? texto.replace(" / ", "/") : texto;
  if (ref.current) ref.current.dataset.compacto = espacado && compacto ? "1" : "0";
  return <span ref={ref} style={{ whiteSpace: "nowrap", display: "inline-block" }} data-compacto="0">{numeral ? <Numeral peso={peso}>{final}</Numeral> : final}</span>;
}
