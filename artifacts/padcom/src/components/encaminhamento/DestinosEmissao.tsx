/**
 * DESTINOS DA EMISSÃO — escolha de para onde a receita vai ANTES de emitir.
 * Mesmo desenho dos slots do PainelEncaminhamento. O destinatário vem do cadastro lido pelo servidor;
 * nada digitado aqui vira destinatário. Escolher não envia nada: o envio só acontece pelo botão
 * "Emitir e enviar", com a confirmação marcada.
 */
import { useEffect, useState } from "react";
import { CheckCircle2, FolderInput, Mail, MessageCircle, Send } from "lucide-react";
import { getCollabToken } from "@/lib/collab-auth";

const API = import.meta.env.BASE_URL + "api";

export type CanalEnvio = "WHATSAPP" | "TELEGRAM" | "EMAIL";
export type DestinoEmissao = CanalEnvio | "DRIVE";
type Alvo = { channel: CanalEnvio; recipient: string };

export const NOME_DESTINO: Record<DestinoEmissao, string> = {
  WHATSAPP: "WhatsApp", TELEGRAM: "Telegram", EMAIL: "E-mail", DRIVE: "Drive",
};

const ITENS: Array<{ id: DestinoEmissao; Icone: typeof Mail; funcao: string }> = [
  { id: "WHATSAPP", Icone: MessageCircle, funcao: "Envia o PDF pelo WhatsApp" },
  { id: "TELEGRAM", Icone: Send, funcao: "Envia o PDF pelo Telegram" },
  { id: "EMAIL", Icone: Mail, funcao: "Envia o PDF por e-mail" },
  { id: "DRIVE", Icone: FolderInput, funcao: "Guarda na pasta do cliente" },
];

export default function DestinosEmissao({ clientId, marcados, onChange, disabled }: {
  clientId: number; marcados: DestinoEmissao[]; onChange: (v: DestinoEmissao[]) => void; disabled?: boolean;
}) {
  const [alvos, setAlvos] = useState<Alvo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");

  useEffect(() => {
    const token = getCollabToken();
    if (!token) { setErro("Faça login de colaborador para conferir os canais."); setCarregando(false); return; }
    const ac = new AbortController();
    setCarregando(true); setErro("");
    fetch(`${API}/clinical-documents/delivery-targets/${clientId}`, { headers: { Authorization: `Bearer ${token}` }, signal: ac.signal })
      .then(async (r) => {
        const d = await r.json().catch(() => null);
        if (!r.ok) throw new Error(d?.error || "Não foi possível conferir os destinatários.");
        if (!ac.signal.aborted) setAlvos(Array.isArray(d?.targets) ? d.targets : []);
      })
      .catch((e: unknown) => { if (!ac.signal.aborted) setErro(e instanceof Error ? e.message : "Falha ao consultar os canais."); })
      .finally(() => { if (!ac.signal.aborted) setCarregando(false); });
    onChange([]);
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  const contato = (c: DestinoEmissao) => c === "DRIVE" ? "Pasta RECEITAS do cliente" : alvos.find((a) => a.channel === c)?.recipient ?? "";
  const alternar = (c: DestinoEmissao) => onChange(marcados.includes(c) ? marcados.filter((x) => x !== c) : [...marcados, c]);

  return (
    <div className="space-y-2" aria-label="Para onde enviar a receita">
      <div className="bevel-3d inline-flex rounded-[3px] px-2.5 py-1 text-[10px] font-black uppercase tracking-widest">Para onde vai a receita</div>
      <div className="grid grid-cols-2 gap-2">
        {ITENS.map(({ id, Icone, funcao }) => {
          const valor = contato(id);
          const ligado = marcados.includes(id);
          const off = !valor || Boolean(disabled) || carregando;
          return (
            <button
              key={id} type="button" role="checkbox" aria-checked={ligado} disabled={off} onClick={() => alternar(id)}
              aria-label={`${NOME_DESTINO[id]}: ${funcao}${valor ? `. Contato: ${valor}` : ". Sem contato cadastrado"}`}
              title={valor ? `${funcao} (${valor})` : "Sem contato cadastrado"}
              data-testid={`destino-${id.toLowerCase()}`}
              className={`flex w-full min-w-0 items-center gap-2.5 rounded-[3px] px-3 py-2 text-left transition
                ${ligado ? "btn-3d-apertado" : off ? "concave-3d" : "btn-3d-soft"} ${off ? "cursor-not-allowed opacity-55" : "cursor-pointer"}`}
            >
              <Icone className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block text-[12px] font-bold leading-tight">{NOME_DESTINO[id]}</span>
                <span className="block text-[10px] leading-tight text-muted-foreground">{funcao}</span>
                <span className="block truncate text-[10px] leading-tight text-muted-foreground/80">{valor || "sem contato cadastrado"}</span>
              </span>
              {ligado && <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />}
            </button>
          );
        })}
      </div>
      {carregando && <p role="status" className="text-[11px]">Conferindo os canais cadastrados…</p>}
      {erro && <p role="alert" className="text-[12px] font-bold text-destructive">{erro}</p>}
      <p className="text-[11px] text-muted-foreground">
        Marcar não envia. "Emitir receita" só gera; "Emitir e enviar" gera e envia.
      </p>
    </div>
  );
}
