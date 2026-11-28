import { useState } from "react";
import { Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fmtDataHora } from "@/lib/pit-stop-formato";
import { PitStopErro, type VagaAlternativa } from "@/lib/pit-stop-api";

/**
 * Encaixe da 1ª sessão no término da consulta presencial. O horário de término vem do usuário (vazio = agora, em Brasília);
 * quem acha a vaga é o servidor: hoje, a partir do término, com a EQUIPE COMPLETA livre. É a única exceção à antecedência
 * mínima e só vale para hoje. Sem vaga: nada muda e a tela mostra alternativas reais. É prévia: reservar só em "Confirmar e reservar".
 */
export function EncaixePrimeira({ itemNome, onEncaixar, onEscolher, ocupado }: {
  itemNome: string; ocupado: boolean;
  onEncaixar: (v: { horaTermino?: string; aceitarForaDaJanela: boolean }) => Promise<{ date: string; time: string } | null>;
  onEscolher: (data: string, hora: string) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [termino, setTermino] = useState("");
  const [aceite, setAceite] = useState(false);
  const [exigeAceite, setExigeAceite] = useState(false);
  const [erro, setErro] = useState<{ code: string; message: string; alternativas: VagaAlternativa[] } | null>(null);

  const rodar = async () => {
    setErro(null);
    try {
      await onEncaixar({ horaTermino: termino || undefined, aceitarForaDaJanela: aceite });
      setAberto(false); setExigeAceite(false); setAceite(false);
    } catch (e) {
      if (e instanceof PitStopErro) {
        setExigeAceite(e.code === "fora_da_janela_exige_aceite");
        setErro({ code: e.code, message: e.message, alternativas: Array.isArray(e.corpo.alternativas) ? (e.corpo.alternativas as VagaAlternativa[]) : [] });
      } else setErro({ code: "erro", message: "Não foi possível encaixar agora. Nada foi alterado.", alternativas: [] });
    }
  };

  if (!aberto) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => setAberto(true)} data-testid="encaixe-abrir">
        <Zap className="mr-1 h-4 w-4" />Encaixar a 1ª sessão no término da consulta
      </Button>
    );
  }
  return (
    <div className="concave-3d space-y-2 p-3" data-testid="encaixe-painel" aria-label={`Encaixar a primeira sessão de ${itemNome}`}>
      <p className="text-xs">O sistema procura a primeira vaga livre <b>hoje</b>, a partir do término da consulta, para a equipe inteira. É só uma proposta no plano: reservar acontece em “Confirmar e reservar”.</p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-[11px] font-bold">Término da consulta
          <input type="time" step={900} className="field-engraved mt-1 block min-h-10 px-2" value={termino} onChange={(e) => setTermino(e.target.value)} data-testid="encaixe-termino" />
          <span className="block text-[10px] font-normal text-muted-foreground">Em branco = agora (horário de Brasília).</span>
        </label>
        <Button type="button" size="sm" disabled={ocupado || (exigeAceite && !aceite)} onClick={() => void rodar()} data-testid="encaixe-achar">
          {ocupado ? "Procurando…" : "Achar a vaga e encaixar"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => { setAberto(false); setErro(null); }}>Fechar</Button>
      </div>
      {exigeAceite && (
        <label className="flex items-start gap-2 text-xs font-bold">
          <input type="checkbox" className="mt-0.5 h-4 w-4" checked={aceite} onChange={(e) => setAceite(e.target.checked)} data-testid="encaixe-aceite" />
          Aceito encaixar hoje, mesmo fora da janela de 4 dias da data nominal.
        </label>
      )}
      {erro && (
        <div role="alert" className="space-y-2" data-testid="encaixe-erro" data-code={erro.code}>
          <p className="text-xs font-bold text-red-800">{erro.message}</p>
          {erro.alternativas.length > 0 && (
            <div className="space-y-1">
              <p className="text-[11px] font-black uppercase tracking-widest">Próximas vagas reais</p>
              <div className="flex flex-wrap gap-2">
                {erro.alternativas.map((a) => (
                  <button key={`${a.date}-${a.time}`} type="button" className="bevel-3d min-h-9 px-3 text-xs font-bold" onClick={() => onEscolher(a.date, a.time)}>
                    {fmtDataHora(a.date, a.time)}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
