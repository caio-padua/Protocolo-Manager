import { AlertTriangle, Check, CheckCheck, Clock } from "lucide-react";

// Bolhas fieis aos aplicativos. Honestidade: tique azul so quando o provedor informou "Lido";
// relogio so quando a mensagem esta na fila; alerta so em falha real. Sem dado = so a hora.

export type BolhaProps = {
  canal: "wwp" | "tg";
  direcao: "entrada" | "saida";
  texto: string;
  horario: string; // ex.: 14:32
  entrega: string; // rotulo vindo da API
};

function Tiques({ canal, entrega }: { canal: "wwp" | "tg"; entrega: string }) {
  if (entrega === "Falhou") return <AlertTriangle className="h-3 w-3 text-rose-600" aria-label="Falhou" />;
  if (entrega === "Na fila") return <Clock className="h-3 w-3 text-[#667781]" aria-label="Na fila" />;
  if (entrega === "Lido") return <CheckCheck className={`h-3.5 w-3.5 ${canal === "wwp" ? "text-[#53bdeb]" : "text-[#3390ec]"}`} aria-label="Lido" />;
  if (entrega === "Entregue") return <CheckCheck className="h-3.5 w-3.5 text-[#667781]" aria-label="Entregue" />;
  if (entrega === "Enviado") return <Check className="h-3.5 w-3.5 text-[#667781]" aria-label="Enviado" />;
  return null;
}

export function BolhaMensagem({ canal, direcao, texto, horario, entrega }: BolhaProps) {
  const minha = direcao === "saida";
  const wwp = canal === "wwp";
  const cor = wwp
    ? (minha ? "bg-[#d9fdd3]" : "bg-white")
    : (minha ? "bg-[#e1f1fd]" : "bg-white");
  const cauda = minha ? (wwp ? "rounded-tr-[2px]" : "rounded-br-[2px]") : (wwp ? "rounded-tl-[2px]" : "rounded-bl-[2px]");
  return (
    <div className={`flex w-full ${minha ? "justify-end" : "justify-start"}`} data-testid={`bolha-${canal}-${direcao}`}>
      <div className={`relative max-w-[85%] rounded-[8px] ${cauda} ${cor} px-2.5 pb-1 pt-1.5 text-[13.5px] leading-[1.4] text-[#111b21] shadow-[0_1px_0.5px_rgba(11,20,26,0.13)]`}>
        <span className="whitespace-pre-wrap break-words">{texto}</span>
        <span className="float-right ml-2 mt-1 flex items-center gap-1 text-[10px] text-[#667781]">
          {horario}
          {minha && <Tiques canal={canal} entrega={entrega} />}
        </span>
      </div>
    </div>
  );
}

export function FundoConversa({ canal, children }: { canal: "wwp" | "tg"; children: React.ReactNode }) {
  const fundo = canal === "wwp" ? "bg-[#efeae2]" : "bg-[#9fbfd8]";
  return <div className={`flex flex-col gap-1.5 rounded-[10px] p-3 ${fundo}`}>{children}</div>;
}
