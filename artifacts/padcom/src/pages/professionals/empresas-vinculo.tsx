// Vínculo empresarial do profissional (Corpo Clínico):
//   posição 1 = vínculo ORIGINÁRIO (escolhido na aba DADOS, somente leitura nas demais abas);
//   posições 2 a 5 = empresas adicionais onde o profissional também presta serviço.
// A agenda do profissional só abre nas empresas listadas aqui (regra aplicada no servidor).
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Building2, Loader2, Lock } from "lucide-react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { collabAuthHeaders } from "@/lib/collab-auth";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export const LIMITE_EMPRESAS = 5;
const REMOVER = "__remover__";

export type EmpresaOpcao = { id: number; nome: string };

export type VinculoEmpresaLinha = {
  ordem: number;
  empresaId: number;
  nome: string;
  papel: "originario" | "adicional";
};

export type AgendaBloqueante = { locationId: number; nome: string };

export type ErroDoServidor = {
  mensagem: string;
  agendas: AgendaBloqueante[];
};

const ROTULO_POSICAO: Record<number, string> = {
  1: "Principal (originária)",
  2: "Secundária",
  3: "Terciária",
  4: "Quaternária",
  5: "Quinária",
};

export const rotuloDaPosicao = (ordem: number): string => ROTULO_POSICAO[ordem] ?? `Posição ${ordem}`;

/** Lê a mensagem real do servidor (corpo JSON com `error`) de um ApiError ou de uma Response já lida. */
export function lerErroDoServidor(corpo: unknown, padrao: string): ErroDoServidor {
  const dados = (corpo && typeof corpo === "object" && "data" in corpo
    ? (corpo as { data?: unknown }).data
    : corpo) as { error?: unknown; agendas?: unknown } | null | undefined;
  const mensagem = typeof dados?.error === "string" && dados.error.trim() ? dados.error : padrao;
  const agendas = Array.isArray(dados?.agendas)
    ? (dados!.agendas as AgendaBloqueante[]).filter((a) => a && typeof a.nome === "string")
    : [];
  return { mensagem, agendas };
}

/** Texto único para toast: mensagem do servidor + agendas que impedem a mudança. */
export function textoDoErro(erro: ErroDoServidor): string {
  return erro.agendas.length
    ? `${erro.mensagem} Agendas: ${erro.agendas.map((a) => a.nome).join(", ")}.`
    : erro.mensagem;
}

/** Empresas ativas onde o profissional pode ser vinculado (lista exige login de colaborador). */
export function useEmpresasOpcoes() {
  const [empresas, setEmpresas] = useState<EmpresaOpcao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    void fetch(`${BASE}/api/empresas`, { headers: collabAuthHeaders(), cache: "no-store" })
      .then(async (resposta) => {
        if (!resposta.ok) {
          throw new Error(lerErroDoServidor(await resposta.json().catch(() => null), "Não foi possível carregar as empresas.").mensagem);
        }
        return resposta.json() as Promise<Array<{ id: number; nome: string; ativa?: boolean }>>;
      })
      .then((linhas) => {
        if (!vivo) return;
        setEmpresas(linhas.filter((linha) => linha.ativa === true).map(({ id, nome }) => ({ id, nome })));
        setErro(null);
      })
      .catch((falha: unknown) => {
        if (vivo) setErro(falha instanceof Error ? falha.message : "Não foi possível carregar as empresas.");
      })
      .finally(() => { if (vivo) setCarregando(false); });
    return () => { vivo = false; };
  }, []);

  return { empresas, carregando, erro };
}

// ─── Aba DADOS: vínculo originário ───────────────────────────────────────────
export function EmpresaOriginariaSelect({
  value, onChange, empresas, carregando, erro, valorAtual, nomeAtual, disabled,
}: {
  value: string;
  onChange: (empresaId: string) => void;
  empresas: EmpresaOpcao[];
  carregando: boolean;
  erro: string | null;
  /** Empresa gravada hoje (pode estar inativa e, por isso, fora da lista de ativas). */
  valorAtual: string;
  nomeAtual: string | null;
  disabled?: boolean;
}) {
  const opcoes = useMemo(() => {
    const lista = [...empresas];
    if (valorAtual && !lista.some((e) => String(e.id) === valorAtual)) {
      lista.push({ id: Number(valorAtual), nome: nomeAtual ?? `Empresa ${valorAtual}` });
    }
    return lista;
  }, [empresas, valorAtual, nomeAtual]);

  return (
    <div className="space-y-1.5">
      <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
        Vínculo originário *
      </Label>
      <Select
        value={value}
        onValueChange={(v) => { if (v) onChange(v); }}
        disabled={disabled || carregando || !!erro}
      >
        <SelectTrigger className="field-engraved" aria-label="Vínculo originário">
          <SelectValue placeholder={carregando ? "Carregando empresas…" : "Selecione a empresa de origem"} />
        </SelectTrigger>
        <SelectContent>
          {opcoes.map((empresa) => (
            <SelectItem key={empresa.id} value={String(empresa.id)}>{empresa.nome}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {erro ? (
        <p className="text-[10px] font-bold text-destructive">{erro}</p>
      ) : (
        <p className="text-[10px] font-semibold text-muted-foreground">
          Empresa de origem do profissional. As demais empresas são escolhidas na aba VÍNCULOS.
        </p>
      )}
    </div>
  );
}

// ─── Aba VÍNCULOS: empresas onde presta serviço (até 5) ──────────────────────
export function EmpresasPrestacaoPanel({
  professionalId, vinculos, empresas, empresasErro, canEdit, onChange,
}: {
  professionalId: number;
  vinculos: VinculoEmpresaLinha[];
  empresas: EmpresaOpcao[];
  empresasErro: string | null;
  canEdit: boolean;
  onChange: (vinculos: VinculoEmpresaLinha[]) => void;
}) {
  const { toast } = useToast();
  const [slotOcupado, setSlotOcupado] = useState<number | null>(null);
  const [conflito, setConflito] = useState<ErroDoServidor | null>(null);

  const originaria = vinculos.find((v) => v.papel === "originario");
  const adicionais = useMemo(
    () => vinculos.filter((v) => v.papel === "adicional").sort((a, b) => a.ordem - b.ordem),
    [vinculos],
  );

  const gravar = useCallback(async (posicao: number, proximos: number[]) => {
    setSlotOcupado(posicao);
    setConflito(null);
    try {
      const resposta = await fetch(`${BASE}/api/professionals/${professionalId}/empresas`, {
        method: "PUT",
        headers: collabAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ adicionaisIds: proximos }),
      });
      const corpo = await resposta.json().catch(() => null);
      if (!resposta.ok) {
        const erro = lerErroDoServidor(corpo, "Não foi possível salvar as empresas do profissional.");
        if (resposta.status === 409) setConflito(erro);
        else toast({ title: "Falha ao salvar o vínculo", description: textoDoErro(erro), variant: "destructive" });
        return;
      }
      onChange((corpo as { vinculos: VinculoEmpresaLinha[] }).vinculos);
      toast({ title: "Empresas do profissional salvas" });
    } catch {
      toast({ title: "Falha ao salvar o vínculo", description: "Sem resposta do servidor. Nada foi alterado.", variant: "destructive" });
    } finally {
      setSlotOcupado(null);
    }
  }, [professionalId, onChange, toast]);

  const escolher = (posicao: number, valor: string) => {
    const atuais = adicionais.map((v) => v.empresaId);
    const indice = posicao - 2;
    const proximos = atuais.slice();
    if (valor === REMOVER) proximos.splice(indice, 1);
    else if (indice < proximos.length) proximos[indice] = Number(valor);
    else proximos.push(Number(valor));
    void gravar(posicao, proximos);
  };

  return (
    <div className="panel-3d-sub space-y-3 px-3 py-3">
      <div className="flex items-center gap-2">
        <Building2 className="h-3.5 w-3.5 text-primary shrink-0" />
        <p className="text-[10px] font-black uppercase tracking-widest text-foreground">
          Empresas onde presta serviço (até {LIMITE_EMPRESAS})
        </p>
        <span className="concave-3d ml-auto px-2 py-0.5 text-[9px] font-black text-muted-foreground tabular-nums">
          {vinculos.length}/{LIMITE_EMPRESAS}
        </span>
      </div>
      <p className="text-[10px] font-semibold text-muted-foreground">
        A agenda do profissional só abre nas empresas desta lista. Cada escolha é salva na hora.
      </p>

      {empresasErro ? (
        <p className="text-[10px] font-bold text-destructive">{empresasErro}</p>
      ) : null}

      <div className="space-y-2">
        {[1, 2, 3, 4, 5].map((posicao) => {
          const rotulo = ROTULO_POSICAO[posicao];
          if (posicao === 1) {
            return (
              <div key={posicao} className="grid grid-cols-1 gap-1 sm:grid-cols-[9.5rem_1fr] sm:items-center sm:gap-3">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{rotulo}</Label>
                <div className="concave-3d flex items-center gap-2 px-3 py-2">
                  <Lock className="h-3 w-3 shrink-0 text-muted-foreground" />
                  <span className="truncate text-[11px] font-black uppercase tracking-wide text-foreground">
                    {originaria?.nome ?? "—"}
                  </span>
                  <span className="ml-auto shrink-0 text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
                    Altere na aba Dados
                  </span>
                </div>
              </div>
            );
          }

          // Posição pela ordem da lista: o servidor sempre compacta as posições 2 a 5 ao gravar.
          const atual: VinculoEmpresaLinha | undefined = adicionais[posicao - 2];
          const anteriorPreenchida = adicionais.length >= posicao - 2;
          const habilitado = canEdit && slotOcupado === null && (atual !== undefined || anteriorPreenchida);
          const usadas = new Set<number>([
            ...(originaria ? [originaria.empresaId] : []),
            ...adicionais.filter((v) => v !== atual).map((v) => v.empresaId),
          ]);
          const opcoes = empresas.filter((e) => !usadas.has(e.id));
          if (atual && !opcoes.some((e) => e.id === atual.empresaId)) {
            opcoes.push({ id: atual.empresaId, nome: atual.nome });
          }
          const livre = atual === undefined;

          return (
            <div key={posicao} className="grid grid-cols-1 gap-1 sm:grid-cols-[9.5rem_1fr] sm:items-center sm:gap-3">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{rotulo}</Label>
              <div className="flex items-center gap-2">
                <Select
                  value={atual ? String(atual.empresaId) : ""}
                  onValueChange={(v) => { if (v) escolher(posicao, v); }}
                  disabled={!habilitado || (livre && opcoes.length === 0)}
                >
                  <SelectTrigger className="field-engraved flex-1" aria-label={`Empresa ${rotulo.toLowerCase()}`}>
                    <SelectValue placeholder={livre && !habilitado ? "—" : "Adicionar empresa…"} />
                  </SelectTrigger>
                  <SelectContent>
                    {opcoes.map((empresa) => (
                      <SelectItem key={empresa.id} value={String(empresa.id)}>{empresa.nome}</SelectItem>
                    ))}
                    {atual ? <SelectItem value={REMOVER}>— Remover este vínculo —</SelectItem> : null}
                  </SelectContent>
                </Select>
                <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                  {slotOcupado === posicao ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : null}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {conflito ? (
        <div role="alert" className="concave-3d space-y-1.5 px-3 py-2.5">
          <p className="flex items-start gap-2 text-[11px] font-bold text-foreground">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
            <span>{conflito.mensagem}</span>
          </p>
          {conflito.agendas.length ? (
            <ul className="space-y-0.5 pl-6 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {conflito.agendas.map((agenda) => (
                <li key={agenda.locationId}>— {agenda.nome}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
