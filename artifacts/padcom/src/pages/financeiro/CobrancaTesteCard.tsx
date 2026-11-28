import type { ReactNode } from "react";
import { CheckCircle2, Clock3, XCircle, ShieldCheck, ShieldAlert, ReceiptText, Send, QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Numeral, Valor } from "@/components/numeral/Numeral";
import { formatCpf } from "@/components/PaxterClientSelector/useClientFilter";

export interface CobrancaTeste {
  id: number; cliente: string | null; cliente_cpf: string | null; valor_centavos: number; tipo: string; descricao: string;
  estado: string; asaas_charge_id: string | null; asaas_status: string | null; invoice_url: string | null; erro: string | null;
  criado_em: string | null; pago_em: string | null; liquido_centavos: number | null;
  link_email_em: string | null; link_telegram_em: string | null;
}

const STATUS_PAGO = new Set(["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"]);
const STATUS_NAO = new Set(["OVERDUE", "REFUNDED", "REFUND_REQUESTED", "REFUND_IN_PROGRESS", "CHARGEBACK_REQUESTED", "CHARGEBACK_DISPUTE", "DELETED"]);

export type Situacao = "compensado" | "aguardando" | "nao_compensado";

/** Situacao do dinheiro: so "compensado" quando o Asaas confirmou o pagamento. */
export function situacaoDe(i: Pick<CobrancaTeste, "estado" | "asaas_status" | "pago_em">): Situacao {
  if (i.estado === "recusada") return "nao_compensado";
  if (i.pago_em || STATUS_PAGO.has(String(i.asaas_status))) return "compensado";
  if (STATUS_NAO.has(String(i.asaas_status))) return "nao_compensado";
  return "aguardando";
}

/** Validado = pago E com o valor liquido que o Asaas informou. Qualquer outro caso = nao validado. */
export function validadoDe(i: CobrancaTeste): boolean {
  return situacaoDe(i) === "compensado" && i.liquido_centavos != null;
}

const SITUACAO: Record<Situacao, { texto: string; Icone: typeof Clock3; classe: string }> = {
  compensado: { texto: "Compensado", Icone: CheckCircle2, classe: "bg-emerald-600 text-white border-emerald-800" },
  aguardando: { texto: "Aguardando", Icone: Clock3, classe: "bg-amber-400 text-amber-950 border-amber-600" },
  nao_compensado: { texto: "Não compensado", Icone: XCircle, classe: "bg-neutral-900 text-white border-black" },
};

const SOMBRA_SELO = "shadow-[inset_0_1px_0_rgba(255,255,255,0.35),inset_0_-2px_0_rgba(0,0,0,0.25),0_1px_2px_rgba(0,0,0,0.35)]";

/** Selo de tamanho fixo: mesma largura, mesma altura e mesma posicao em todos os cards. */
function Selo({ rotulo, texto, Icone, classe }: { rotulo: string; texto: string; Icone: typeof Clock3; classe: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/70 leading-none mb-1">{rotulo}</div>
      <div
        className={`h-9 w-full flex items-center justify-center gap-1.5 rounded-[4px] border px-2 text-[11px] font-black uppercase tracking-wider whitespace-nowrap ${classe} ${SOMBRA_SELO}`}
      >
        <Icone className="w-4 h-4 shrink-0" />
        <span>{texto}</span>
      </div>
    </div>
  );
}

/** Slot fixo: rotulo em maiusculas + valor gravado; vazio mostra "—" e mantem o espaco. */
function Campo({ rotulo, children, className = "" }: { rotulo: string; children?: ReactNode; className?: string }) {
  const vazio = children == null || children === "";
  return (
    <div className={`concave-3d px-2.5 py-1.5 min-w-0 ${className}`}>
      <div className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/70 leading-none mb-1">{rotulo}</div>
      <div className={`text-[12px] font-bold leading-tight min-w-0 ${vazio ? "text-muted-foreground/40" : "text-foreground"}`}>
        {vazio ? "—" : children}
      </div>
    </div>
  );
}

const FUSO = "America/Sao_Paulo";
function dataHora(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const data = d.toLocaleDateString("pt-BR", { timeZone: FUSO, day: "2-digit", month: "2-digit", year: "numeric" });
  const hora = d.toLocaleTimeString("pt-BR", { timeZone: FUSO, hour: "2-digit", minute: "2-digit" });
  return `${data} às ${hora}`;
}
function dataBr(iso: string | null): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

const FAIXA: Record<Situacao, string> = { compensado: "bg-emerald-600", aguardando: "bg-amber-400", nao_compensado: "bg-neutral-900" };

export default function CobrancaTesteCard({ i, enviando, onEnviarLink }: { i: CobrancaTeste; enviando: boolean; onEnviarLink: (id: number) => void }) {
  const sit = situacaoDe(i);
  const validado = validadoDe(i);
  const s = SITUACAO[sit];
  const podeEnviar = i.estado === "criada" && !i.pago_em && sit === "aguardando";
  const linkJaEnviado = !!i.link_email_em && !!i.link_telegram_em;
  const canais = [i.link_email_em ? "E-mail aceito" : null, i.link_telegram_em ? "Telegram aceito" : null].filter(Boolean).join(" · ");
  const descritivo = [i.descricao, i.asaas_charge_id || i.erro].filter(Boolean).join(" · ");
  const taxa = i.liquido_centavos != null ? i.valor_centavos - i.liquido_centavos : null;

  return (
    <article className="panel-3d-sub overflow-hidden">
      <div className="flex">
        <div className={`w-1 shrink-0 ${FAIXA[sit]}`} />
        <div className="flex-1 min-w-0">
          {/* ZONA 1 — barra do topo: numero, forma e comprovante (altura fixa) */}
          <div className="flex items-center gap-2 px-3 h-12 border-b border-muted/20">
            <span className="text-sm font-black tabular-nums text-primary">#{i.id}</span>
            <span className="text-muted-foreground/30 text-xs select-none">·</span>
            <span className="concave-3d inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              <QrCode className="w-3 h-3" />{i.tipo}
            </span>
            <div className="ml-auto">
              {i.invoice_url ? (
                <a
                  href={i.invoice_url} target="_blank" rel="noreferrer" aria-label={`Abrir comprovante da cobrança ${i.id}`}
                  className="btn-3d-soft inline-flex items-center gap-1.5 h-9 px-3 text-[11px] font-black uppercase tracking-wider text-primary"
                >
                  <ReceiptText className="w-4 h-4" />Comprovante
                </a>
              ) : (
                <span className="inline-flex items-center gap-1.5 h-9 px-3 text-[11px] font-black uppercase tracking-wider text-muted-foreground/40" aria-label="Sem comprovante">
                  <ReceiptText className="w-4 h-4" />Sem comprovante
                </span>
              )}
            </div>
          </div>

          {/* ZONA 2 — identidade: nome por extenso */}
          <div className="px-3 pt-3 pb-2">
            <div className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/70 leading-none mb-1">Cliente</div>
            <div className="text-[17px] leading-tight font-bold break-words min-h-[2.5rem]" style={{ fontFamily: "'EB Garamond', serif" }}>
              {i.cliente || "—"}
            </div>
          </div>

          {/* ZONA 3 — grade de campos fixos */}
          <div className="grid grid-cols-2 gap-1.5 px-3 pb-2">
            <Campo rotulo="CPF">{i.cliente_cpf ? <Numeral peso={700}>{formatCpf(i.cliente_cpf)}</Numeral> : null}</Campo>
            <Campo rotulo="Valor"><Valor valor={i.valor_centavos / 100} peso={800} /></Campo>
            <Campo rotulo="Horário">{dataHora(i.criado_em) ? <Numeral>{dataHora(i.criado_em)}</Numeral> : null}</Campo>
            <Campo rotulo="Pago em">{dataBr(i.pago_em) ? <Numeral>{dataBr(i.pago_em)}</Numeral> : null}</Campo>
            <Campo rotulo="Descritivo do Pix" className="col-span-2">
              <span className="break-all font-semibold text-[11px]">{descritivo}</span>
            </Campo>
            <Campo rotulo="Líquido recebido">{i.liquido_centavos != null ? <Valor valor={i.liquido_centavos / 100} /> : null}</Campo>
            <Campo rotulo="Taxa">{taxa != null ? <Valor valor={taxa / 100} /> : null}</Campo>
          </div>

          {/* ZONA 4 — selos de estado (sempre os dois, sempre no mesmo lugar e do mesmo tamanho) */}
          <div className="grid grid-cols-2 gap-1.5 px-3 pb-2">
            <Selo rotulo="Situação" texto={s.texto} Icone={s.Icone} classe={s.classe} />
            <Selo
              rotulo="Validação"
              texto={validado ? "Validado" : "Não validado"}
              Icone={validado ? ShieldCheck : ShieldAlert}
              classe={validado ? "bg-emerald-600 text-white border-emerald-800" : "bg-neutral-900 text-white border-black"}
            />
          </div>

          {/* ZONA 5 — envio do link (slot fixo) */}
          <div className="grid grid-cols-2 gap-1.5 px-3 pb-3">
            <Campo rotulo="Link ao cliente">{canais || "Não enviado"}</Campo>
            <div className="flex items-end">
              <Button
                type="button" variant="outline" className="btn-3d-soft w-full h-10 text-[11px] font-black uppercase tracking-wider"
                disabled={!podeEnviar || enviando || linkJaEnviado} onClick={() => onEnviarLink(i.id)}
              >
                <Send className="w-3.5 h-3.5 mr-1.5" />{linkJaEnviado ? "Link enviado" : "Enviar link"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}
