import { useCallback, useEffect, useMemo, useState } from "react";
import { tituloProprio } from "@/lib/utils";
import { useListClients, useCreateAnamneseSession } from "@workspace/api-client-react";
import { PaxterClientSelector } from "@/components/PaxterClientSelector";
import { useToast } from "@/hooks/use-toast";
import {
  Link2,
  Activity,
  ListChecks,
  UserRound,
  Copy,
  Check,
  MessageCircle,
  Plus,
  Loader2,
  ExternalLink,
  AlertTriangle,
  ClipboardCheck,
} from "lucide-react";
import { useLocation } from "wouter";

// ===========================================================================
// COCKPIT DA ANAMNESE (anamnese externa) — mesma moldura do Cockpit da Consulta:
// faixa navy + regua de abas + conteudo CLARO (skill-layout-paxter).
// Abas: Status & Link · Doencas do Motor · Revisao.
// Spec: specs/cockpit-cliente-abas.md
// ===========================================================================

const NAVY = "#16294a";
const CREAM = "hsl(40 33% 96%)";

type AbaId = "status" | "doencas" | "revisao";

const ABAS: { id: AbaId; rotulo: string; Icon: typeof Link2 }[] = [
  { id: "status", rotulo: "Status & Link", Icon: Link2 },
  { id: "doencas", rotulo: "Doenças do Motor", Icon: Activity },
  { id: "revisao", rotulo: "Revisão", Icon: ListChecks },
];

// DTO consolidado do Cockpit (artifacts/api-server/src/routes/cockpit.ts).
interface CockpitDTO {
  cliente: { id: number; nome: string; telefone: string | null; email: string | null };
  passado: { respostasAnamnese: number };
  presente: {
    escoreTotal: number;
    gradeGlobal: string;
    redFlag: boolean;
    sintomas: string[];
    doencas: string[];
    alarmes: { perguntaId: string; pergunta: string }[];
  };
}

function idade(birthDate: string | null | undefined): number | null {
  if (!birthDate) return null;
  const d = new Date(`${birthDate}T12:00:00-03:00`);
  if (Number.isNaN(d.getTime())) return null;
  const hoje = new Date();
  let anos = hoje.getFullYear() - d.getFullYear();
  const m = hoje.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && hoje.getDate() < d.getDate())) anos--;
  return anos;
}

// So digitos do telefone para o link wa.me (DDI Brasil 55).
function telParaWa(tel: string | null | undefined): string | null {
  const d = (tel ?? "").replace(/\D/g, "");
  if (!d) return null;
  return d.startsWith("55") ? d : `55${d}`;
}

export default function CockpitAnamnese() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [clienteId, setClienteId] = useState<number | null>(null);
  const [aba, setAba] = useState<AbaId>("status");

  const { data: clients } = useListClients();
  const opcoes = useMemo(
    () => (clients ?? []).map((c) => ({ id: c.id, name: c.name, cpf: c.cpf, phone: c.phone, photoUrl: c.photoUrl })),
    [clients],
  );
  const cliente = useMemo(
    () => (clients ?? []).find((c) => c.id === clienteId) ?? null,
    [clients, clienteId],
  );
  const anos = idade(cliente?.birthDate);

  return (
    <div className="min-h-screen w-full font-sans" style={{ background: CREAM }}>
      {/* Faixa de topo navy */}
      <header
        className="flex flex-wrap items-center justify-between gap-3 px-7 py-3"
        style={{
          background: "linear-gradient(180deg,#1b3260 0%,#16294a 60%,#101f3a 100%)",
          borderBottom: "1px solid rgba(231,205,143,0.35)",
        }}
      >
        <div className="flex items-center gap-3">
          <span
            className="font-serif text-[19px] font-semibold tracking-[0.16em]"
            style={{ color: "#e7cd8f", textShadow: "0 1px 0 rgba(0,0,0,0.45)" }}
          >
            PAXTER
          </span>
          <span className="text-[11px] uppercase tracking-[0.22em] text-slate-300">
            Cockpit da Anamnese
          </span>
        </div>
        <div className="flex items-center gap-4">
          <PaxterClientSelector
            clientes={opcoes}
            value={clienteId}
            onChange={(id) => setClienteId(id)}
            placeholder="Selecionar cliente…"
          />
          <div className="text-right leading-tight">
            {cliente ? (
              <>
                <div className="text-[13px] font-semibold uppercase tracking-wide text-white">
                  {tituloProprio(cliente.name)}
                </div>
                <div className="text-[11px] text-slate-300">
                  {cliente.cpf ? `CPF ${cliente.cpf}` : "CPF não informado"}
                  {anos != null ? ` · ${anos} anos` : ""}
                </div>
              </>
            ) : (
              <div className="flex items-center gap-2 text-[12px] text-slate-300">
                <UserRound className="h-4 w-4" /> Nenhum cliente selecionado
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Régua de abas */}
      <nav className="flex flex-wrap items-end gap-1 px-7 pt-3" style={{ background: "#13233f" }}>
        {ABAS.map(({ id, rotulo, Icon }) => {
          const ativo = aba === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setAba(id)}
              className={`flex items-center gap-1.5 rounded-t-[5px] px-4 py-2 text-[12px] font-semibold uppercase tracking-wide ${
                ativo ? "text-[#16294a]" : "text-slate-300 hover:text-white"
              }`}
              style={
                ativo
                  ? { background: CREAM, borderTop: "2px solid #e7cd8f" }
                  : { background: "rgba(255,255,255,0.04)" }
              }
            >
              <Icon className="h-3.5 w-3.5" />
              {rotulo}
            </button>
          );
        })}
      </nav>

      {/* Conteúdo claro */}
      <main className="px-7 py-6">
        {clienteId == null ? (
          <div className="panel-3d mx-auto mt-10 max-w-xl p-8 text-center">
            <UserRound className="mx-auto mb-3 h-8 w-8" style={{ color: "#9a7b32" }} />
            <div className="text-[15px] font-bold uppercase tracking-[0.12em]" style={{ color: NAVY }}>
              Selecione o cliente
            </div>
            <p className="mt-2 text-sm text-[#647c97]">
              Escolha o cliente na faixa superior para gerar o link da anamnese,
              acompanhar as doenças do motor e revisar as respostas.
            </p>
          </div>
        ) : (
          <div key={clienteId}>
            {aba === "status" && (
              <StatusLinkPanel
                clientId={clienteId}
                nome={cliente?.name ?? ""}
                telefone={cliente?.phone ?? null}
                toast={toast}
              />
            )}
            {aba === "doencas" && <DoencasPanel clientId={clienteId} />}
            {aba === "revisao" && (
              <RevisaoPanel clientId={clienteId} onAbrirCompleta={() => setLocation("/anamnese/revisao")} />
            )}
          </div>
        )}
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hook: carrega o DTO consolidado do Cockpit.
// ---------------------------------------------------------------------------
function useCockpit(clientId: number) {
  const [data, setData] = useState<CockpitDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    let ativo = true;
    setLoading(true);
    setErro(false);
    fetch(`/api/cockpit/${clientId}`)
      .then((r) => {
        if (!r.ok) throw new Error("falha");
        return r.json();
      })
      .then((dto: CockpitDTO) => {
        if (ativo) setData(dto);
      })
      .catch(() => {
        if (ativo) setErro(true);
      })
      .finally(() => {
        if (ativo) setLoading(false);
      });
    return () => {
      ativo = false;
    };
  }, [clientId]);

  return { data, loading, erro };
}

// ---------------------------------------------------------------------------
// ABA 1 — Status & Link: cria sessao e monta o link publico da anamnese.
// ---------------------------------------------------------------------------
function StatusLinkPanel({
  clientId,
  nome,
  telefone,
  toast,
}: {
  clientId: number;
  nome: string;
  telefone: string | null;
  toast: ReturnType<typeof useToast>["toast"];
}) {
  const { data, loading } = useCockpit(clientId);
  const createSession = useCreateAnamneseSession();
  const [copiado, setCopiado] = useState(false);
  const [criada, setCriada] = useState(false);

  const anamneseUrl = useMemo(() => {
    const base = import.meta.env.BASE_URL; // ja termina com "/"
    return `${window.location.origin}${base}anamnese/v2`;
  }, []);

  const respostas = data?.passado.respostasAnamnese ?? 0;
  const concluida = respostas > 0;

  const mensagem = useMemo(() => {
    const firstName = (nome.split(" ")[0] || nome).trim();
    return (
      `Olá${firstName ? `, ${firstName}` : ""}! Aqui é do Instituto Pádua (Paxter). ` +
      `Antes da sua sessão, preencha sua ficha de saúde (anamnese) neste link: ` +
      `${anamneseUrl}\n\n` +
      `Você vai se identificar com CPF e data de nascimento. Leva poucos minutos. Obrigado!`
    );
  }, [nome, anamneseUrl]);

  const waHref = useMemo(() => {
    const wa = telParaWa(telefone);
    return wa
      ? `https://wa.me/${wa}?text=${encodeURIComponent(mensagem)}`
      : `https://wa.me/?text=${encodeURIComponent(mensagem)}`;
  }, [telefone, mensagem]);

  const copiarLink = useCallback(() => {
    navigator.clipboard.writeText(anamneseUrl).then(
      () => {
        setCopiado(true);
        setTimeout(() => setCopiado(false), 2000);
        toast({ title: "Link copiado", description: "Cole no canal do cliente." });
      },
      () => toast({ title: "Não foi possível copiar", variant: "destructive" }),
    );
  }, [anamneseUrl, toast]);

  const criarSessao = useCallback(() => {
    createSession.mutate(
      { data: { mode: "paciente" } },
      {
        onSuccess: () => {
          setCriada(true);
          toast({
            title: "Sessão criada",
            description: "Envie o link para o cliente iniciar a anamnese.",
          });
        },
        onError: () =>
          toast({ title: "Falha ao criar sessão", variant: "destructive" }),
      },
    );
  }, [createSession, toast]);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Status da anamnese */}
      <section className="panel-3d p-5">
        <div className="mb-4 flex items-center gap-2">
          <ClipboardCheck className="h-4 w-4" style={{ color: "#9a7b32" }} />
          <h2 className="text-[13px] font-bold uppercase tracking-[0.12em]" style={{ color: NAVY }}>
            Status da anamnese
          </h2>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-[#647c97]">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
          </div>
        ) : (
          <div className="space-y-3">
            <div className="concave-3d flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-2.5">
                <span
                  className={`paxter-led ${concluida ? "paxter-led-green paxter-led-on" : "paxter-led-amber paxter-led-breathe"}`}
                />
                <span className="text-[13px] font-semibold" style={{ color: NAVY }}>
                  {concluida ? "Concluída" : "Pendente"}
                </span>
              </div>
              <span className="text-[12px] text-[#647c97]">
                {respostas} resposta{respostas === 1 ? "" : "s"} registrada{respostas === 1 ? "" : "s"}
              </span>
            </div>
            {!concluida && (
              <p className="text-[12px] text-[#647c97]">
                Ainda não há respostas registradas. Envie o link para o cliente
                preencher a ficha de saúde antes da consulta.
              </p>
            )}
          </div>
        )}
      </section>

      {/* Link público */}
      <section className="panel-3d p-5">
        <div className="mb-4 flex items-center gap-2">
          <Link2 className="h-4 w-4" style={{ color: "#9a7b32" }} />
          <h2 className="text-[13px] font-bold uppercase tracking-[0.12em]" style={{ color: NAVY }}>
            Link da anamnese
          </h2>
        </div>

        <div className="space-y-3">
          <div className="concave-3d break-all px-4 py-3 text-[12px] text-[#33507a]">
            {anamneseUrl}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={copiarLink}
              className="btn-3d-soft flex items-center gap-2 px-4 py-2 text-[12px] font-semibold"
              style={{ color: NAVY }}
            >
              {copiado ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copiado ? "Copiado" : "Copiar link"}
            </button>
            <a
              href={waHref}
              target="_blank"
              rel="noreferrer"
              className="btn-3d-soft flex items-center gap-2 px-4 py-2 text-[12px] font-semibold"
              style={{ color: "#128C4B" }}
            >
              <MessageCircle className="h-4 w-4" /> WhatsApp
            </a>
            <button
              type="button"
              onClick={criarSessao}
              disabled={createSession.isPending}
              className="btn-3d-soft flex items-center gap-2 px-4 py-2 text-[12px] font-semibold disabled:opacity-60"
              style={{ color: NAVY }}
            >
              {createSession.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Criar sessão
            </button>
          </div>

          {criada && (
            <p className="text-[12px] text-emerald-700">
              Sessão criada — o cliente inicia identificando-se com CPF e data de nascimento.
            </p>
          )}
          <p className="text-[11px] text-[#8a97a8]">
            O cliente se identifica no link (CPF + data de nascimento); a sessão é
            amarrada com segurança ao cadastro dele.
          </p>
        </div>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ABA 2 — Doencas do Motor: cards claros com paxter-led por severidade.
// ---------------------------------------------------------------------------
function DoencasPanel({ clientId }: { clientId: number }) {
  const { data, loading, erro } = useCockpit(clientId);

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-[#647c97]">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando doenças do motor…
      </div>
    );
  }
  if (erro || !data) {
    return (
      <div className="panel-3d p-6 text-sm text-[#647c97]">
        Não foi possível carregar as doenças do motor.
      </div>
    );
  }

  const { presente } = data;
  const semNada =
    presente.doencas.length === 0 &&
    presente.alarmes.length === 0 &&
    presente.sintomas.length === 0;

  return (
    <div className="space-y-6">
      {/* Resumo do escore */}
      <section className="panel-3d flex flex-wrap items-center gap-4 p-5">
        <div className="screen-3d px-4 py-3 text-center">
          <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#647c97]">
            Escore
          </div>
          <div className="text-[22px] font-bold" style={{ color: NAVY }}>
            {presente.escoreTotal}
          </div>
        </div>
        <div className="screen-3d px-4 py-3 text-center">
          <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#647c97]">
            Grade
          </div>
          <div className="text-[22px] font-bold" style={{ color: NAVY }}>
            {presente.gradeGlobal || "—"}
          </div>
        </div>
        {presente.redFlag && (
          <div className="paxter-alert paxter-alert-red flex items-center gap-2 px-4 py-3">
            <span className="paxter-led paxter-led-red paxter-led-on" />
            <span className="text-[12px] font-bold uppercase tracking-wide text-rose-700">
              Sinal de alarme
            </span>
          </div>
        )}
      </section>

      {semNada ? (
        <div className="panel-3d p-6 text-sm text-[#647c97]">
          Nenhuma doença, alarme ou sintoma aceso — o cliente pode ainda não ter
          respondido a anamnese.
        </div>
      ) : (
        <div className="space-y-6">
          {presente.alarmes.length > 0 && (
            <CardGrupo
              titulo="Alarmes"
              itens={presente.alarmes.map((a) => a.pergunta)}
              led="paxter-led-red"
              cor="#B91C1C"
              Icon={AlertTriangle}
            />
          )}
          {presente.doencas.length > 0 && (
            <CardGrupo
              titulo="Doenças acesas"
              itens={presente.doencas}
              led="paxter-led-green"
              cor="#0f6b3c"
              Icon={Activity}
            />
          )}
          {presente.sintomas.length > 0 && (
            <CardGrupo
              titulo="Sintomas"
              itens={presente.sintomas}
              led="paxter-led-amber"
              cor="#9a7b32"
              Icon={Activity}
            />
          )}
        </div>
      )}
    </div>
  );
}

function CardGrupo({
  titulo,
  itens,
  led,
  cor,
  Icon,
}: {
  titulo: string;
  itens: string[];
  led: string;
  cor: string;
  Icon: typeof Activity;
}) {
  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <Icon className="h-4 w-4" style={{ color: cor }} />
        <h3 className="text-[12px] font-bold uppercase tracking-[0.12em]" style={{ color: NAVY }}>
          {titulo} ({itens.length})
        </h3>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {itens.map((nome, i) => (
          <div key={`${nome}-${i}`} className="panel-3d flex items-center gap-3 p-4">
            <span className={`paxter-led ${led} paxter-led-on shrink-0`} />
            <span className="text-[13px] font-medium" style={{ color: NAVY }}>
              {nome}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// ABA 3 — Revisao: resumo das respostas + atalho para a revisao completa.
// ---------------------------------------------------------------------------
function RevisaoPanel({
  clientId,
  onAbrirCompleta,
}: {
  clientId: number;
  onAbrirCompleta: () => void;
}) {
  const { data, loading, erro } = useCockpit(clientId);

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-[#647c97]">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando revisão…
      </div>
    );
  }
  if (erro || !data) {
    return (
      <div className="panel-3d p-6 text-sm text-[#647c97]">
        Não foi possível carregar a revisão.
      </div>
    );
  }

  const { presente, passado } = data;

  return (
    <div className="space-y-6">
      <section className="panel-3d p-5">
        <div className="mb-4 flex items-center gap-2">
          <ListChecks className="h-4 w-4" style={{ color: "#9a7b32" }} />
          <h2 className="text-[13px] font-bold uppercase tracking-[0.12em]" style={{ color: NAVY }}>
            Resumo das respostas
          </h2>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <ResumoInsert rotulo="Respostas" valor={String(passado.respostasAnamnese)} />
          <ResumoInsert rotulo="Escore" valor={String(presente.escoreTotal)} />
          <ResumoInsert rotulo="Grade" valor={presente.gradeGlobal || "—"} />
          <ResumoInsert
            rotulo="Doenças acesas"
            valor={String(presente.doencas.length)}
          />
        </div>

        <div className="mt-5 space-y-4">
          <ResumoLista titulo="Doenças" itens={presente.doencas} cor="#0f6b3c" />
          <ResumoLista titulo="Sintomas" itens={presente.sintomas} cor="#9a7b32" />
          <ResumoLista
            titulo="Alarmes"
            itens={presente.alarmes.map((a) => a.pergunta)}
            cor="#B91C1C"
          />
        </div>
      </section>

      <button
        type="button"
        onClick={onAbrirCompleta}
        className="btn-3d-soft flex items-center gap-2 px-5 py-2.5 text-[12px] font-semibold"
        style={{ color: NAVY }}
      >
        <ExternalLink className="h-4 w-4" /> Abrir revisão completa
      </button>
    </div>
  );
}

function ResumoInsert({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="concave-3d px-4 py-3 text-center">
      <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#647c97]">
        {rotulo}
      </div>
      <div className="text-[18px] font-bold" style={{ color: NAVY }}>
        {valor}
      </div>
    </div>
  );
}

function ResumoLista({ titulo, itens, cor }: { titulo: string; itens: string[]; cor: string }) {
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide" style={{ color: cor }}>
        {titulo} ({itens.length})
      </p>
      {itens.length === 0 ? (
        <p className="text-[12px] text-[#8a97a8]">—</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {itens.map((nome, i) => (
            <span
              key={`${nome}-${i}`}
              className="rounded-[4px] border px-2 py-1 text-[12px]"
              style={{ borderColor: cor, color: cor }}
            >
              {nome}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
