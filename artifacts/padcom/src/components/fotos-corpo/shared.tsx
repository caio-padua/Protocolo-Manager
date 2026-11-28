import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

export type AnguloChave = "frente" | "costas" | "perfil_esquerdo" | "perfil_direito";
export type AnguloInfo = { chave: AnguloChave; rotulo: string; como: string };
export type SerieFotos = { data: string; fotos: Record<AnguloChave, { id: number } | null> };

export const dataBr = (iso: string) => {
  const [a, m, d] = iso.split("-");
  return a && m && d ? `${d}/${m}/${a}` : iso;
};

/**
 * Imagem que exige login: busca o arquivo com o cabecalho de autorizacao e mostra por endereco local
 * temporario (a foto corporal nunca tem endereco publico).
 */
export function ImagemAutenticada({ url, headers, alt, className, onPronta }: {
  url: string; headers: Record<string, string>; alt: string; className?: string;
  onPronta?: (el: HTMLImageElement | null) => void;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [erro, setErro] = useState(false);
  const chaveHeaders = JSON.stringify(headers);
  useEffect(() => {
    let vivo = true;
    let objeto: string | null = null;
    setSrc(null); setErro(false);
    fetch(url, { headers: JSON.parse(chaveHeaders) as Record<string, string> })
      .then((r) => { if (!r.ok) throw new Error("falhou"); return r.blob(); })
      .then((b) => { if (!vivo) return; objeto = URL.createObjectURL(b); setSrc(objeto); })
      .catch(() => { if (vivo) setErro(true); });
    return () => { vivo = false; if (objeto) URL.revokeObjectURL(objeto); };
  }, [url, chaveHeaders]);
  if (erro) return <div className={`${className ?? ""} flex items-center justify-center text-[10px] text-muted-foreground`}>Foto indisponível</div>;
  if (!src) return <div className={`${className ?? ""} flex items-center justify-center text-muted-foreground`}><Loader2 className="h-4 w-4 animate-spin" /></div>;
  return <img src={src} alt={alt} className={className} draggable={false} ref={onPronta} />;
}

/** Silhueta simples de orientacao (nao e foto): mostra a pose esperada em cada angulo. */
export function Silhueta({ angulo, className }: { angulo: AnguloChave; className?: string }) {
  const perfil = angulo === "perfil_esquerdo" || angulo === "perfil_direito";
  const espelho = angulo === "perfil_direito" ? "translate(100 0) scale(-1 1)" : undefined;
  return (
    <svg viewBox="0 0 100 200" className={className} role="img" aria-label={`Silhueta de ${angulo.replace("_", " ")}`}>
      <g fill="currentColor" opacity="0.55" transform={espelho}>
        {perfil ? (
          <>
            <circle cx="50" cy="22" r="12" />
            <path d="M62 22 l6 4 l-6 2 z" />
            <rect x="45" y="34" width="10" height="8" rx="3" />
            <path d="M38 42 h24 q4 0 4 6 v52 q0 4 -4 4 h-24 q-4 0 -4 -4 v-52 q0 -6 4 -6 z" />
            <rect x="44" y="102" width="12" height="82" rx="5" />
            <rect x="44" y="184" width="22" height="8" rx="4" />
            <rect x="46" y="46" width="8" height="52" rx="4" opacity="0.7" />
          </>
        ) : (
          <>
            <circle cx="50" cy="22" r="12" />
            <rect x="45" y="34" width="10" height="8" rx="3" />
            <path d="M30 42 h40 q6 0 6 6 v46 h-8 v-38 h-2 v46 h-32 v-46 h-2 v38 h-8 v-46 q0 -6 6 -6 z" />
            <rect x="35" y="96" width="13" height="88" rx="5" />
            <rect x="52" y="96" width="13" height="88" rx="5" />
            <rect x="33" y="184" width="17" height="8" rx="4" />
            <rect x="50" y="184" width="17" height="8" rx="4" />
          </>
        )}
      </g>
    </svg>
  );
}
