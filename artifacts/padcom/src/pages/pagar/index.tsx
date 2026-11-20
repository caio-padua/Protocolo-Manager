/**
 * /pagar/:token — tela publica de pagamento PaxMed (celular do cliente, sem login).
 * Valor, situacao e link de pagamento vem do Asaas a cada abertura (GET /api/pagamento/:token).
 * Nunca mostra valor de copia local: se o provedor nao responder, mostra erro claro.
 * A previa do link no Telegram/WhatsApp e ESTATICA (cartao PaxMed generico): so a tela traz o valor.
 */
import { useEffect, useState } from "react";
import { useRoute } from "wouter";
import { Valor } from "@/components/numeral/Numeral";
import "./pagar.css";

const BASE = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
interface Dados {
  clinica: string; valor: number; situacao: "pendente" | "paga" | "vencida" | "cancelada" | "outra";
  situacaoProvedor: string; vencimento: string | null; pagaEm: string | null; teste: boolean; linkPagamento: string | null;
}
const ROTULO: Record<Dados["situacao"], string> = {
  pendente: "Aguardando pagamento", paga: "Pagamento confirmado", vencida: "Vencida", cancelada: "Cobrança cancelada", outra: "Situação em análise",
};
const dataBR = (iso: string | null) => (iso ? iso.split("-").reverse().join("/") : "");

export default function PagarPage() {
  const [, params] = useRoute("/pagar/:token");
  const token = params?.token ?? "";
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    document.title = "PaxMed · Pagamento";
    let vivo = true;
    fetch(`${BASE}/api/pagamento/${encodeURIComponent(token)}`)
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
      <div className="pgl-pilha">
        <header className="pgl-placa">
          <div className="pgl-marca">
            <img className="pgl-sim" src={`${BASE}/paxmed-link-simbolo.png`} alt="Símbolo PaxMed" />
            <img className="pgl-nome" src={`${BASE}/paxmed-link-nome.png`} alt="PAXMED" />
          </div>
          <p className="pgl-tag">Clinical Intelligence System</p>
        </header>
        <main className="pgl-gaveta">
          {erro ? (
            <p className="pgl-erro" data-testid="pagar-erro">{erro}</p>
          ) : !dados ? (
            <p className="pgl-erro">Consultando a situação no provedor…</p>
          ) : (
            <>
              <h1 className="pgl-clinica" data-testid="pagar-clinica">{dados.clinica}</h1>
              <p className="pgl-sub">Pagamento</p>
              {dados.teste && <span className="pgl-teste">Cobrança de teste</span>}
              <p className="pgl-valor" data-testid="pagar-valor"><Valor valor={dados.valor} /></p>
              <div className="pgl-situacao" data-s={dados.situacao} data-testid="pagar-situacao"><i />{ROTULO[dados.situacao]}</div>
              {dados.situacao === "paga" && dados.pagaEm && <p className="pgl-meta">Pago em {dataBR(dados.pagaEm)}</p>}
              {dados.situacao !== "paga" && dados.vencimento && <p className="pgl-meta">Vencimento: {dataBR(dados.vencimento)}</p>}
              {dados.linkPagamento && (
                <a className="pgl-botao" href={dados.linkPagamento} target="_blank" rel="noopener noreferrer" data-testid="pagar-botao">Pagar agora</a>
              )}
              <p className="pgl-aviso">
                {dados.situacao === "paga" ? "Nada mais a fazer. Obrigado."
                  : "O pagamento é concluído no ambiente seguro do Asaas. Valor e situação são consultados no provedor a cada abertura."}
              </p>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
