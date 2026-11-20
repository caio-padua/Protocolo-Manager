/**
 * /pagar/:token — tela publica de pagamento PaxMed (celular do cliente, sem login).
 * Mostra o MESMO flyer do Telegram/WhatsApp (molde unico, servido pela API com dados ao vivo do Asaas)
 * e, quando ha o que pagar, o botao que abre o link correto do Asaas.
 * Nunca mostra valor de copia local: sem resposta do provedor, mostra erro claro.
 */
import { useEffect, useState } from "react";
import { useRoute } from "wouter";
import "./pagar.css";

const BASE = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
interface Dados { situacao: string; linkPagamento: string | null }

export default function PagarPage() {
  const [, params] = useRoute("/pagar/:token");
  const token = encodeURIComponent(params?.token ?? "");
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    document.title = "PaxMed · Pagamento";
    let vivo = true;
    fetch(`${BASE}/api/pagamento/${token}`)
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j?.error ?? "Link indisponível.");
        return j as Dados;
      })
      .then((d) => vivo && setDados(d))
      .catch((e: Error) => vivo && setErro(e.message));
    return () => { vivo = false; };
  }, [token]);

  return (
    <div className="pgl-root" data-testid="pagar-root">
      {erro ? (
        <p className="pgl-erro" data-testid="pagar-erro">{erro}</p>
      ) : (
        <div className="pgl-pilha">
          {dados && (
            <img className="pgl-flyer" data-testid="pagar-flyer" alt="Pagamento PaxMed" src={`${BASE}/api/pagamento/${token}/flyer.png?t=${Date.now()}`} />
          )}
          {dados?.linkPagamento && (
            <a className="pgl-botao" href={dados.linkPagamento} target="_blank" rel="noopener noreferrer" data-testid="pagar-botao">Pagar agora</a>
          )}
        </div>
      )}
    </div>
  );
}
