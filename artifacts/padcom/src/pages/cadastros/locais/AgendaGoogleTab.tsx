import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, CalendarCheck, Link2, FileUp, Globe, MapPin } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { collabAuthHeaders } from "@/lib/collab-auth";
import { PAPEIS_AGENDA, type PapelAgenda } from "./locais-modo";
import { lerEnderecoGoogle, type EnderecoLido } from "./endereco-google";

const apiBase = import.meta.env.VITE_API_URL || "/api";

interface AgendaGoogle {
  googleCalendarId: string; nome: string; cor: string | null; descricao: string | null;
  principal: boolean; papelSugerido: PapelAgenda | null;
  vinculadaLocalId: number | null; vinculadaLocalNome: string | null;
}
interface Previa {
  calendarioNome: string | null; totalLidos: number; sessoesDoSistema: number; novos: number;
  jaExistem: number; recorrentes: number; cancelados: number; ignorados: number;
  motivosIgnorados: Array<{ motivo: string; quantidade: number }>;
  periodo: { de: string; ate: string } | null;
  amostra: Array<{ titulo: string | null; inicio: string; diaInteiro: boolean }>;
}
interface Resultado { gravados: number; jaExistiam: number; sessoesDoSistema: number; ignorados: number }

export interface AgendaGoogleTabProps {
  localId: number | null;
  googleCalendarId: string | null;
  papelInicial: PapelAgenda | null;
  onVinculado: (v: { googleCalendarId: string; cor: string | null }) => void;
  onUsarEndereco: (e: EnderecoLido) => void;
}

async function chamar<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: collabAuthHeaders({ "Content-Type": "application/json", ...(init?.headers as Record<string, string> | undefined) }),
  });
  const corpo = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((corpo as { error?: string }).error ?? `Falha (${res.status})`);
  return corpo as T;
}

const fmtData = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
const fmtNum = (n: number) => n.toLocaleString("pt-BR");

function Titulo({ children }: { children: React.ReactNode }) {
  return <p className="uppercase tracking-widest text-[10px] font-extrabold text-muted-foreground">{children}</p>;
}

export function AgendaGoogleTab({ localId, googleCalendarId, papelInicial, onVinculado, onUsarEndereco }: AgendaGoogleTabProps) {
  const queryClient = useQueryClient();
  const [escolhida, setEscolhida] = useState<string>("");
  const [papel, setPapel] = useState<PapelAgenda | null>(papelInicial);
  const [aplicarCor, setAplicarCor] = useState(true);

  const [texto, setTexto] = useState<string | null>(null);
  const [nomeArquivo, setNomeArquivo] = useState("");
  const [link, setLink] = useState("");
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const arquivoRef = useRef<HTMLInputElement>(null);

  const agendas = useQuery({
    queryKey: ["agendas-google-conta"],
    enabled: localId !== null,
    queryFn: () => chamar<{ agendas: AgendaGoogle[] }>(`${apiBase}/locations/google/agendas`),
    staleTime: 60_000,
  });

  const atual = useMemo(
    () => agendas.data?.agendas.find((a) => a.googleCalendarId === googleCalendarId) ?? null,
    [agendas.data, googleCalendarId],
  );
  const selecionada = useMemo(
    () => agendas.data?.agendas.find((a) => a.googleCalendarId === escolhida) ?? null,
    [agendas.data, escolhida],
  );
  const enderecoLido = useMemo(() => lerEnderecoGoogle((selecionada ?? atual)?.descricao), [selecionada, atual]);

  useEffect(() => { setPapel(papelInicial); }, [papelInicial, localId]);

  const vincular = useMutation({
    mutationFn: () => chamar<{ cor: string | null }>(`${apiBase}/locations/${localId}/agenda-google/vincular`, {
      method: "POST",
      body: JSON.stringify({ googleCalendarId: escolhida, papel, aplicarCor }),
    }),
    onSuccess: (r) => {
      onVinculado({ googleCalendarId: escolhida, cor: aplicarCor ? r.cor : null });
      queryClient.invalidateQueries({ queryKey: ["clinicas"] });
      queryClient.invalidateQueries({ queryKey: ["agendas-google-conta"] });
      toast.success("Agenda vinculada ao local.");
      setEscolhida("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const corpoImportacao = () => (texto !== null ? { texto } : { url: link.trim() });
  const fonteInformada = texto !== null || link.trim() !== "";

  const gerarPrevia = useMutation({
    mutationFn: () => chamar<{ previa: Previa }>(`${apiBase}/locations/${localId}/agenda-google/ics/previa`, {
      method: "POST", body: JSON.stringify(corpoImportacao()),
    }),
    onSuccess: (r) => { setPrevia(r.previa); setResultado(null); },
    onError: (e: Error) => { setPrevia(null); toast.error(e.message); },
  });

  const confirmar = useMutation({
    mutationFn: () => chamar<Resultado>(`${apiBase}/locations/${localId}/agenda-google/ics/confirmar`, {
      method: "POST", body: JSON.stringify(corpoImportacao()),
    }),
    onSuccess: (r) => { setResultado(r); setPrevia(null); toast.success(`${fmtNum(r.gravados)} compromissos importados.`); },
    onError: (e: Error) => toast.error(e.message),
  });

  const escolherArquivo = async (arquivo: File | undefined) => {
    setPrevia(null); setResultado(null);
    if (!arquivo) { setTexto(null); setNomeArquivo(""); return; }
    if (arquivo.size > 10 * 1024 * 1024) { toast.error("Arquivo maior que 10 MB."); return; }
    setTexto(await arquivo.text());
    setNomeArquivo(arquivo.name);
    setLink("");
  };

  if (localId === null) {
    return <p className="concave-3d p-4 text-sm">Salve o local primeiro. Depois volte a esta aba para escolher a agenda do Google e importar compromissos.</p>;
  }

  return (
    <div className="space-y-6">
      {/* 1. Agenda vinculada hoje */}
      <section className="space-y-2">
        <Titulo>Agenda Google deste local</Titulo>
        <div className="concave-3d p-3 flex items-center gap-3 text-sm">
          <CalendarCheck className="w-4 h-4 shrink-0 text-muted-foreground" aria-hidden />
          {googleCalendarId ? (
            <div className="min-w-0 flex items-center gap-2">
              {atual?.cor && <span className="w-4 h-4 rounded-[3px] shrink-0 border border-black/20" style={{ backgroundColor: atual.cor }} aria-hidden />}
              <span className="font-bold truncate">{atual?.nome ?? "Agenda fora da lista da conta Google"}</span>
              {papelInicial && <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground shrink-0">· {PAPEIS_AGENDA.find((p) => p.valor === papelInicial)?.rotulo}</span>}
            </div>
          ) : (
            <span className="text-muted-foreground">Nenhuma agenda vinculada.</span>
          )}
        </div>
      </section>

      {/* 2. Escolher outra da lista */}
      <section className="space-y-3">
        <Titulo>Escolher a agenda na conta Google da clínica</Titulo>
        {agendas.isLoading ? (
          <p role="status" className="text-sm flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Consultando o Google Agenda...</p>
        ) : agendas.isError ? (
          <div role="alert" className="concave-3d p-3 text-sm">
            {(agendas.error as Error).message}
            <Button type="button" className="btn-3d-soft ml-3" onClick={() => void agendas.refetch()}>Tentar novamente</Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2" role="group" aria-label="Agendas do Google">
            {(agendas.data?.agendas ?? []).map((a) => {
              const ocupada = a.vinculadaLocalId !== null && a.vinculadaLocalId !== localId;
              const ativo = escolhida === a.googleCalendarId;
              return (
                <button key={a.googleCalendarId} type="button" disabled={ocupada} aria-pressed={ativo}
                  onClick={() => { setEscolhida(a.googleCalendarId); setPapel(a.papelSugerido ?? papelInicial); }}
                  className={`bevel-3d p-2.5 flex items-center gap-2.5 text-left transition-colors disabled:opacity-40 ${ativo ? "ring-2 ring-[#b8892b]" : ""}`}>
                  <span className="w-4 h-4 rounded-[3px] shrink-0 border border-black/20" style={{ backgroundColor: a.cor ?? "#999" }} aria-hidden />
                  <span className="min-w-0">
                    <span className="block text-[11px] font-black uppercase tracking-tight leading-tight truncate" title={a.nome}>{a.nome}</span>
                    <span className="block text-[10px] text-muted-foreground truncate">
                      {ocupada ? `Já usada em: ${a.vinculadaLocalNome}` : a.vinculadaLocalId === localId ? "Vinculada a este local" : "Livre"}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {selecionada && (
          <div className="concave-3d p-3 space-y-3">
            <p className="text-sm"><span className="font-black">{selecionada.nome}</span></p>
            <div className="space-y-1.5">
              <Titulo>Papel desta agenda *</Titulo>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Papel da agenda">
                {PAPEIS_AGENDA.map((p) => (
                  <button key={p.valor} type="button" aria-pressed={papel === p.valor} title={p.explicacao}
                    onClick={() => setPapel(p.valor)}
                    className={`bevel-3d px-3 py-1.5 text-[10px] font-black uppercase tracking-widest ${papel === p.valor ? "bg-primary text-primary-foreground ring-2 ring-[#b8892b]" : ""}`}>
                    {p.rotulo}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground">
                {selecionada.papelSugerido
                  ? `Sugerido pelo nome da agenda: ${PAPEIS_AGENDA.find((p) => p.valor === selecionada.papelSugerido)?.rotulo}. Confirme ou troque.`
                  : "O nome não indica o papel. Escolha manualmente."}
              </p>
            </div>
            <label className="flex items-center gap-2 text-[11px] cursor-pointer">
              <input type="checkbox" checked={aplicarCor} onChange={(e) => setAplicarCor(e.target.checked)} />
              Usar a cor desta agenda no Google
              {selecionada.cor && <span className="w-4 h-4 rounded-[3px] border border-black/20" style={{ backgroundColor: selecionada.cor }} aria-hidden />}
            </label>
            <Button type="button" className="btn-3d px-5" disabled={vincular.isPending}
              onClick={() => {
                if (googleCalendarId && googleCalendarId !== escolhida &&
                  !window.confirm("Este local já usa outra agenda. Novas sessões irão para a agenda escolhida. As já criadas permanecem onde estão. Continuar?")) return;
                vincular.mutate();
              }}>
              {vincular.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Link2 className="w-4 h-4 mr-2" />}
              VINCULAR ESTA AGENDA AO LOCAL
            </Button>
          </div>
        )}

        {(selecionada ?? atual) && (
          <div className="concave-3d p-3 space-y-2 text-sm">
            <Titulo>Endereço guardado no Google</Titulo>
            {(selecionada ?? atual)?.descricao ? (
              <p className="text-[12px] whitespace-pre-line text-foreground/80">{(selecionada ?? atual)?.descricao}</p>
            ) : (
              <p className="text-muted-foreground text-[12px]">Esta agenda não tem descrição no Google.</p>
            )}
            {enderecoLido ? (
              <>
                <p className="text-[11px] text-muted-foreground">
                  Lido como: {enderecoLido.logradouro}, {enderecoLido.numero}{enderecoLido.complemento ? ` (${enderecoLido.complemento})` : ""} · {enderecoLido.bairro} · {enderecoLido.cidade}/{enderecoLido.estado} · CEP {enderecoLido.cep}
                </p>
                <Button type="button" className="btn-3d-soft" onClick={() => onUsarEndereco(enderecoLido)}>
                  <MapPin className="w-4 h-4 mr-2" /> PREENCHER A ABA ENDEREÇO COM ESTE TEXTO
                </Button>
                <p className="text-[10px] text-muted-foreground">Nada é salvo ainda: revise a aba Endereço e clique em SALVAR LOCAL.</p>
              </>
            ) : (selecionada ?? atual)?.descricao ? (
              <p className="text-[11px] text-muted-foreground">O texto não está no formato "Rua, número - bairro, cidade - UF, CEP". Digite o endereço manualmente na aba Endereço.</p>
            ) : null}
          </div>
        )}
      </section>

      {/* 3. Importar .ics */}
      <section className="space-y-3">
        <Titulo>Importar compromissos de um arquivo .ics ou link</Titulo>
        <p className="text-[11px] text-muted-foreground">
          Serve para carga de histórico ou para agendas de outra conta Google. Nada é gravado antes de você ver a prévia e confirmar.
          Eventos que o sistema criou para sessões de clientes são reconhecidos e não são importados.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="concave-3d p-3 space-y-2">
            <Titulo>Arquivo</Titulo>
            <input ref={arquivoRef} type="file" accept=".ics,text/calendar" className="hidden"
              onChange={(e) => void escolherArquivo(e.target.files?.[0])} />
            <Button type="button" className="btn-3d-soft" onClick={() => arquivoRef.current?.click()}>
              <FileUp className="w-4 h-4 mr-2" /> ESCOLHER ARQUIVO .ICS
            </Button>
            <p className="text-[11px] text-muted-foreground truncate">{nomeArquivo || "Nenhum arquivo escolhido."}</p>
          </div>
          <div className="concave-3d p-3 space-y-2">
            <Titulo>Link</Titulo>
            <Input className="field-engraved text-[11px]" placeholder="https://calendar.google.com/calendar/ical/..." value={link}
              onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }}
              onChange={(e) => { setLink(e.target.value); setTexto(null); setNomeArquivo(""); setPrevia(null); setResultado(null); }} />
            <p className="text-[10px] text-muted-foreground flex items-center gap-1.5"><Globe className="w-3 h-3" /> Só aceito o endereço secreto de exportação do Google Agenda.</p>
          </div>
        </div>
        <Button type="button" className="btn-3d px-5" disabled={!fonteInformada || gerarPrevia.isPending}
          onClick={() => gerarPrevia.mutate()}>
          {gerarPrevia.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          VER PRÉVIA (NÃO GRAVA NADA)
        </Button>

        {previa && (
          <div className="bevel-3d p-3 space-y-3" role="region" aria-label="Prévia da importação">
            <table className="w-full text-[12px]">
              <caption className="text-left text-[10px] font-black uppercase tracking-widest pb-2">
                Prévia da importação{previa.calendarioNome ? ` — ${previa.calendarioNome}` : ""}
              </caption>
              <thead>
                <tr className="bg-[#f6ecd2] text-left text-[10px] uppercase tracking-widest">
                  <th className="p-1.5">Item</th><th className="p-1.5 text-right">Quantidade</th>
                </tr>
              </thead>
              <tbody>
                {([
                  ["Eventos lidos no arquivo", previa.totalLidos],
                  ["Sessões de clientes criadas pelo sistema (não importadas)", previa.sessoesDoSistema],
                  ["Já importados antes (não duplicam)", previa.jaExistem],
                  ["Compromissos NOVOS que serão gravados", previa.novos],
                  ["Eventos que se repetem (regra guardada, sem expandir)", previa.recorrentes],
                  ["Cancelados no Google", previa.cancelados],
                  ["Ignorados por formato desconhecido", previa.ignorados],
                ] as const).map(([rotulo, n]) => (
                  <tr key={rotulo} className="border-t border-border/40">
                    <td className="p-1.5">{rotulo}</td><td className="p-1.5 text-right font-mono">{fmtNum(n)}</td>
                  </tr>
                ))}
                {previa.periodo && (
                  <tr className="border-t border-border/40">
                    <td className="p-1.5">Período dos eventos</td>
                    <td className="p-1.5 text-right font-mono">{fmtData(previa.periodo.de)} a {fmtData(previa.periodo.ate)}</td>
                  </tr>
                )}
              </tbody>
            </table>
            {previa.motivosIgnorados.length > 0 && (
              <ul className="text-[11px] text-muted-foreground list-disc pl-5">
                {previa.motivosIgnorados.map((m) => <li key={m.motivo}>{fmtNum(m.quantidade)} — {m.motivo}</li>)}
              </ul>
            )}
            <Button type="button" className="btn-3d px-5" disabled={previa.novos === 0 || confirmar.isPending}
              onClick={() => confirmar.mutate()}>
              {confirmar.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              CONFIRMAR IMPORTAÇÃO DE {fmtNum(previa.novos)} COMPROMISSOS
            </Button>
          </div>
        )}

        {resultado && (
          <p role="status" className="concave-3d p-3 text-sm">
            Importação concluída: {fmtNum(resultado.gravados)} gravados, {fmtNum(resultado.jaExistiam)} já existiam,{" "}
            {fmtNum(resultado.sessoesDoSistema)} eram sessões do sistema, {fmtNum(resultado.ignorados)} ignorados.
          </p>
        )}
      </section>
    </div>
  );
}
