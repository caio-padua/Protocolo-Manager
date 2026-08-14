import { useCallback, useEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { Eye, EyeOff, ShieldCheck, KeyRound, Lock, Ban } from "lucide-react";
import { Input } from "@/components/ui/input";

// Base do artefato (prefixo de rota) — padrao usado nas demais paginas.
export const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export type ComunicacaoStatus = {
  telegram: boolean;
  /** true quando PADAXOR_TELEGRAM_CHAT_ID está configurado no servidor. */
  telegramChatIdConfigurado?: boolean;
  whatsapp: boolean;
  gmail: boolean;
  drive: boolean;
  onedrive: boolean;
};

// Busca o estado VERDADEIRO de cada canal no servidor (so booleanos).
export function useComunicacaoStatus() {
  const [status, setStatus] = useState<ComunicacaoStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const refetch = useCallback(() => {
    setLoading(true);
    return fetch(`${BASE}/api/comunicacao/status`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("status"))))
      .then((d) => {
        setStatus(d.status as ComunicacaoStatus);
        setError(false);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(`${BASE}/api/comunicacao/status`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("status"))))
      .then((d) => {
        if (!alive) return;
        setStatus(d.status as ComunicacaoStatus);
        setError(false);
      })
      .catch(() => {
        if (alive) setError(true);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  return { status, loading, error, refetch };
}

// Casca da tela: cabecalho em placa Saliente (bevel) + corpo.
export function ConsoleShell({
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <header className="panel-3d p-5">
        <div className="flex items-center gap-4">
          <div className="bevel-3d flex h-12 w-12 items-center justify-center text-primary">
            <Icon className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-semibold uppercase tracking-[0.08em]">{title}</h1>
            {subtitle && <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>}
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}

// Etiqueta gravada do bloco (placa Saliente).
export function BlockTitle({ icon: Icon, children }: { icon: LucideIcon; children: React.ReactNode }) {
  return (
    <div className="bevel-3d mb-3 inline-flex items-center gap-2 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-primary">
      <Icon className="h-4 w-4" />
      {children}
    </div>
  );
}

// Luzinha em vela (status de ferramenta): verde = ligado, ambar = desligado,
// vermelho = ERRO ao consultar (NUNCA confundir falha de leitura com "desligado").
// Ordem de prioridade: pending > error > on.
export function StatusVela({
  on,
  labelOn = "Ligado",
  labelOff = "Não configurado",
  pending = false,
  error = false,
}: {
  on: boolean;
  labelOn?: string;
  labelOff?: string;
  pending?: boolean;
  error?: boolean;
}) {
  const ledClass = pending
    ? ""
    : error
      ? "paxter-led-red"
      : on
        ? "paxter-led-green"
        : "paxter-led-amber";
  const textClass = error
    ? "text-rose-700 dark:text-rose-400"
    : on
      ? "text-emerald-700 dark:text-emerald-400"
      : "text-amber-700 dark:text-amber-400";
  const label = pending ? "Verificando…" : error ? "Indisponível" : on ? labelOn : labelOff;
  return (
    <span className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide">
      <span className={`paxter-led paxter-led-breathe ${ledClass}`} />
      <span className={textClass}>{label}</span>
    </span>
  );
}

// Cartao de uma ferramenta/canal dentro de um console.
export function ToolCard({
  icon: Icon,
  name,
  children,
  vela,
  accent = "text-primary",
}: {
  icon: LucideIcon;
  name: string;
  children: React.ReactNode;
  vela?: React.ReactNode;
  accent?: string;
}) {
  return (
    <div className="panel-3d-sub p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className={`bevel-3d flex h-9 w-9 items-center justify-center ${accent}`}>
            <Icon className="h-5 w-5" />
          </div>
          <h3 className="text-sm font-semibold uppercase tracking-[0.08em]">{name}</h3>
        </div>
        {vela}
      </div>
      <div className="mt-3 space-y-2 text-[13px] leading-relaxed text-muted-foreground">{children}</div>
    </div>
  );
}

// Uma ideia por linha, gravada (insert concavo), espelha a Densidade B.
// `noLed` esconde a luzinha a esquerda — usado quando o card ja tem UMA luz no
// cabecalho e a luz por linha vira poluicao (decisao do CEO 28/06/2026).
export function ExplainRow({ children, noLed = false }: { children: React.ReactNode; noLed?: boolean }) {
  return (
    <div className="concave-3d flex items-start gap-2.5 px-3 py-2 text-[13px]">
      {noLed ? null : <span className="paxter-led paxter-led-green mt-1.5 shrink-0" />}
      <span className="text-foreground/80">{children}</span>
    </div>
  );
}

// ===========================================================================
// PADRAO DO CARD DE INTEGRACAO/GATEWAY (skill-layout-paxter, Padrao 18).
// Cabecalho com icone PROPORCIONAL + luz de vela colada ao icone + status
// TEXTUAL em insert Concavo (largura fixa). Toggle no TOPO (ToggleWell), antes
// da informacao. Credencial com olho que revela o valor real do cofre.
// ===========================================================================

// Status TEXTUAL em insert Concavo de largura FIXA (posicao nao desliza).
// Prioridade: pending > error > on. Cor por estado (verde/ambar/vermelho).
export function StatusInsert({
  on,
  pending = false,
  error = false,
  labelOn = "Ligado",
  labelOff = "Não configurado",
}: {
  on: boolean;
  pending?: boolean;
  error?: boolean;
  labelOn?: string;
  labelOff?: string;
}) {
  const text = pending ? "Verificando…" : error ? "Indisponível" : on ? labelOn : labelOff;
  const color = pending
    ? "text-muted-foreground"
    : error
      ? "text-rose-700 dark:text-rose-400"
      : on
        ? "text-emerald-700 dark:text-emerald-400"
        : "text-amber-700 dark:text-amber-400";
  return (
    <span className="concave-3d inline-flex min-w-[124px] shrink-0 items-center justify-center px-3 py-1.5">
      <span className={`text-[11px] font-semibold uppercase tracking-wide ${color}`}>{text}</span>
    </span>
  );
}

// Faixa de status do COFRE — SEMPRE presente (configurado OU faltando), na mesma
// posicao em todos os cards de gateway, para que os campos abaixo fiquem
// alinhados por uma linha horizontal imaginaria (decisao do CEO 28/06/2026).
// Linha unica (altura fixa): verde "completo" / ambar "faltam N". O detalhe de
// QUAL campo falta vem do selo "Vazio" de cada campo — sem lista redundante.
export function VaultStatusStrip({
  configured,
  missingCount,
}: {
  configured: boolean;
  missingCount: number;
}) {
  const color = configured
    ? "text-emerald-700 dark:text-emerald-400"
    : "text-amber-700 dark:text-amber-400";
  const text = configured
    ? "Credenciais completas no cofre"
    : `Faltam ${missingCount} ${missingCount === 1 ? "credencial" : "credenciais"} — veja os campos marcados “Vazio”`;
  return (
    <div className={`concave-3d flex items-center gap-2 px-3 py-2 ${color}`}>
      {configured ? (
        <ShieldCheck className="h-4 w-4 shrink-0" />
      ) : (
        <KeyRound className="h-4 w-4 shrink-0" />
      )}
      <span className="text-[12px] font-semibold uppercase tracking-wide">{text}</span>
    </div>
  );
}

// Toggle em sulco Concavo (Padrao 5): rotulo a esquerda, Switch a direita.
// Posicao no TOPO do card (antes da informacao) — decisao do CEO 28/06/2026.
export function ToggleWell({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="concave-3d flex items-center justify-between gap-3 px-3 py-2.5">
      <div className="min-w-0">
        <p className="text-[12px] font-semibold uppercase tracking-wide text-foreground/80">{label}</p>
        {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

// Card de integracao/gateway PADRAO. Cabecalho: icone Bevel pequeno (h-8 w-8)
// + LED de vela colado ao icone + nome; status TEXTUAL em insert a direita.
// `toggle` (opcional) renderiza no TOPO, antes do conteudo.
export function IntegrationCard({
  icon: Icon,
  name,
  accent = "text-primary",
  on,
  pending = false,
  error = false,
  labelOn,
  labelOff,
  toggle,
  children,
}: {
  icon: LucideIcon;
  name: string;
  accent?: string;
  on: boolean;
  pending?: boolean;
  error?: boolean;
  labelOn?: string;
  labelOff?: string;
  toggle?: React.ReactNode;
  children: React.ReactNode;
}) {
  const ledClass = pending ? "" : error ? "paxter-led-red" : on ? "paxter-led-green" : "paxter-led-amber";
  return (
    <div className="panel-3d-sub space-y-3 p-4">
      {/* ZONA A — cabecalho: icone proporcional + LED colado + nome | status em insert */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <div className={`bevel-3d flex h-8 w-8 shrink-0 items-center justify-center ${accent}`}>
            <Icon className="h-4 w-4" />
          </div>
          <h3 className="truncate text-sm font-semibold uppercase tracking-[0.08em]">{name}</h3>
          {/* Luz de vela a DIREITA do nome (decisao do CEO 28/06/2026: melhor concordancia). */}
          <span className={`paxter-led paxter-led-breathe ${ledClass} shrink-0`} />
        </div>
        <StatusInsert on={on} pending={pending} error={error} labelOn={labelOn} labelOff={labelOff} />
      </div>

      {/* ZONA B — toggle no TOPO (antes da informacao) */}
      {toggle}

      {/* ZONA C/D — informacao + credenciais */}
      {children}
    </div>
  );
}

// Campo de credencial PADRAO (Padrao 18): rotulo MAIUSCULO EM CIMA, insert
// Concavo (retangulo de altura fixa) com input + OLHO que revela o valor real
// do cofre (carrega so ao clicar; rota protegida). Legenda fixa embaixo (slot
// constante: "No cofre: ••••1234 · cofre" ou "—"). Posicao nao desliza.
export function CredentialField({
  label,
  isSet,
  masked,
  source,
  secret,
  value,
  onChange,
  onReveal,
  normalize,
  placeholder,
}: {
  label: string;
  isSet: boolean;
  masked?: string | null;
  source?: string | null;
  secret: boolean;
  value: string;
  onChange: (v: string) => void;
  onReveal: () => Promise<string | null>;
  // Limpa o valor ao EXIBIR (revelado) E ao DIGITAR (ex.: tirar o prefixo
  // "whatsapp:", ou manter so digitos no numero de origem do Gupshup). A
  // sanitizacao definitiva e no servidor; aqui e so para o operador ver o valor
  // ja limpo enquanto digita.
  normalize?: (v: string) => string;
  placeholder?: string;
}) {
  const [revealed, setRevealed] = useState(false);
  const [revealing, setRevealing] = useState(false);

  async function toggleEye() {
    if (revealed) {
      setRevealed(false);
      return;
    }
    // Revelar: se o campo esta vazio e existe segredo, busca o valor real
    // (acao explicita do dono) e preenche o input para ele ver/editar.
    if (!value && isSet) {
      setRevealing(true);
      try {
        const real = await onReveal();
        if (real != null) onChange(normalize ? normalize(real) : real);
      } finally {
        setRevealing(false);
      }
    }
    setRevealed(true);
  }

  const inputType = secret && !revealed ? "password" : "text";
  const sourceLabel = source ? (source === "env" ? "ambiente" : "cofre") : null;

  return (
    <div className="space-y-1">
      {/* Rotulo + SELO de estado (palavra, nao luz): evita "tanta luzinha verde"
          e diz num relance se o campo tem valor — sem precisar clicar no olho.
          "Configurado" = guardado no cofre (NUNCA "autenticado": nao testamos a chave). */}
      <div className="flex items-center justify-between gap-2">
        <label className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          {label}
        </label>
        <span className="bevel-3d inline-flex shrink-0 items-center px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide">
          <span className={isSet ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400"}>
            {isSet ? "Configurado" : "Vazio"}
          </span>
        </span>
      </div>
      <div className="concave-3d flex h-10 items-center gap-1 pl-1 pr-1">
        <Input
          className="field-engraved h-8 flex-1 border-0 bg-transparent shadow-none focus-visible:ring-0"
          type={inputType}
          autoComplete="new-password"
          value={value}
          onChange={(e) => onChange(normalize ? normalize(e.target.value) : e.target.value)}
          placeholder={placeholder ?? (isSet ? "Clique no olho para ver, ou cole um novo valor" : `Cole: ${label}`)}
        />
        <button
          type="button"
          onClick={toggleEye}
          disabled={revealing}
          aria-label={revealed ? `Ocultar ${label}` : `Mostrar ${label}`}
          aria-pressed={revealed}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-[4px] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
        >
          {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {/* Legenda do cofre com DESTAQUE no valor (o CEO precisava forcar a atencao
          para ver que havia algo): rotulo discreto + valor em mono/forte. */}
      <p className="flex items-center gap-1.5 text-[11px] leading-none">
        <span className="uppercase tracking-wide text-muted-foreground">No cofre:</span>
        {isSet ? (
          <>
            <span className="font-mono text-[12px] font-bold tracking-wide text-foreground">
              {masked ?? "••••"}
            </span>
            {sourceLabel ? (
              <span className="uppercase tracking-wide text-muted-foreground">· {sourceLabel}</span>
            ) : null}
          </>
        ) : (
          <span className="font-semibold text-amber-700 dark:text-amber-400">vazio</span>
        )}
      </p>
    </div>
  );
}

// ===========================================================================
// SLOT SIMETRICO (Padrao 22) — o campo que NUNCA some
//
// Ordem do CEO (14/08/2026): "se um servico tem um campo, o outro tem que ter
// o mesmo campo, mesmo que nao use — o nao usado aparece em formato visual
// diferente". Dois canais lado a lado so sao comparaveis se a linha N de um
// for a linha N do outro. Esconder um campo desloca todos os vizinhos e
// destroi a leitura horizontal (Art. 53).
//
// UM esqueleto, TRES estados — mesma altura, mesma posicao, sempre:
//
//   1. EDITAVEL    selo Configurado/Vazio · input + OLHO         · legenda do cofre
//   2. SO LEITURA  selo Lido do servico   · valor + OLHO/CADEADO · legenda da origem
//   3. NAO SE APLICA selo cinza           · hachura + travessao  · legenda do motivo
//
// O estado 3 e reconhecivel a um metro de distancia: hachura diagonal no
// sulco, texto em italico e travessao no lugar do valor. Ninguem confunde com
// "campo vazio que eu preciso preencher".
// ===========================================================================

export type SlotEstado = "editavel" | "leitura" | "naoAplicavel";

function SeloSlot({ estado, isSet }: { estado: SlotEstado; isSet: boolean }) {
  const { texto, cor } =
    estado === "naoAplicavel"
      ? { texto: "Não se aplica", cor: "text-muted-foreground/70" }
      : estado === "leitura"
        ? isSet
          ? { texto: "Lido do serviço", cor: "text-sky-700 dark:text-sky-400" }
          : { texto: "Indisponível", cor: "text-amber-700 dark:text-amber-400" }
        : isSet
          ? { texto: "Configurado", cor: "text-emerald-700 dark:text-emerald-400" }
          : { texto: "Vazio", cor: "text-amber-700 dark:text-amber-400" };
  return (
    <span className="bevel-3d inline-flex shrink-0 items-center px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide">
      <span className={cor}>{texto}</span>
    </span>
  );
}

export function SlotCampo({
  rotulo,
  estado,
  isSet,
  masked,
  source,
  valorPublico,
  nota,
  placeholder,
  comOlho = false,
  value = "",
  onChange,
  onReveal,
}: {
  rotulo: string;
  estado: SlotEstado;
  isSet: boolean;
  masked?: string | null;
  source?: string | null;
  valorPublico?: string | null;
  nota?: string | null;
  placeholder?: string;
  comOlho?: boolean;
  value?: string;
  onChange?: (v: string) => void;
  onReveal?: () => Promise<string | null>;
}) {
  const [revelado, setRevelado] = useState(false);
  const [revelando, setRevelando] = useState(false);
  const [valorReal, setValorReal] = useState<string | null>(null);

  async function alternarOlho() {
    if (revelado) {
      setRevelado(false);
      return;
    }
    if (!onReveal) {
      setRevelado(true);
      return;
    }
    // So busca o valor de verdade quando o dono clica — nada trafega antes.
    if (estado === "editavel" && !value && isSet) {
      setRevelando(true);
      try {
        const real = await onReveal();
        if (real != null) onChange?.(real);
      } finally {
        setRevelando(false);
      }
    } else if (estado === "leitura" && valorReal == null) {
      setRevelando(true);
      try {
        setValorReal(await onReveal());
      } finally {
        setRevelando(false);
      }
    }
    setRevelado(true);
  }

  const rotuloOrigem =
    source === "env"
      ? "ambiente"
      : source === "vault"
        ? "cofre"
        : source === "telegram"
          ? "lido do Telegram"
          : source === "derivada"
            ? "derivada do servidor"
            : null;

  return (
    <div className="space-y-1">
      {/* ZONA 1 — rotulo + selo de estado (posicao fixa nos tres estados) */}
      <div className="flex items-center justify-between gap-2">
        <label
          className={`block text-[11px] font-semibold uppercase tracking-[0.08em] ${
            estado === "naoAplicavel" ? "text-muted-foreground/60" : "text-muted-foreground"
          }`}
        >
          {rotulo}
        </label>
        <SeloSlot estado={estado} isSet={isSet} />
      </div>

      {/* ZONA 2 — o sulco. Mesma altura (h-10) nos tres estados. */}
      {estado === "naoAplicavel" ? (
        <div
          className="concave-3d flex h-10 items-center gap-2 px-3 opacity-60"
          style={{
            backgroundImage:
              "repeating-linear-gradient(135deg, transparent 0 6px, rgba(127,127,127,0.14) 6px 12px)",
          }}
        >
          <span className="font-mono text-[15px] font-bold leading-none text-muted-foreground/70">—</span>
          <span className="truncate text-[12px] italic text-muted-foreground/70">
            Este canal não usa este campo
          </span>
          <Ban className="ml-auto h-4 w-4 shrink-0 text-muted-foreground/50" />
        </div>
      ) : estado === "leitura" ? (
        <div className="concave-3d flex h-10 items-center gap-1 pl-3 pr-1">
          <span
            className={`flex-1 truncate text-[12px] ${
              isSet ? "font-mono text-foreground" : "italic text-muted-foreground"
            }`}
            title={revelado ? (valorReal ?? valorPublico ?? "") : undefined}
          >
            {isSet
              ? revelado
                ? (valorReal ?? valorPublico ?? masked ?? "")
                : (valorPublico ?? masked ?? "••••")
              : "sem valor no momento"}
          </span>
          {comOlho ? (
            <button
              type="button"
              onClick={alternarOlho}
              disabled={revelando || !isSet}
              aria-label={revelado ? `Ocultar ${rotulo}` : `Mostrar ${rotulo}`}
              aria-pressed={revelado}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-[4px] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
            >
              {revelado ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          ) : (
            // Sem olho, mas o espaco e RESERVADO: a grade nao pode deslizar
            // entre um cartao e outro. O cadeado diz por que nao ha botao.
            <span
              className="grid h-8 w-8 shrink-0 place-items-center text-muted-foreground/40"
              title="Somente leitura — este valor vem do próprio serviço"
            >
              <Lock className="h-3.5 w-3.5" />
            </span>
          )}
        </div>
      ) : (
        <div className="concave-3d flex h-10 items-center gap-1 pl-1 pr-1">
          <Input
            className="field-engraved h-8 flex-1 border-0 bg-transparent shadow-none focus-visible:ring-0"
            type={comOlho && !revelado ? "password" : "text"}
            autoComplete="new-password"
            value={value}
            onChange={(e) => onChange?.(e.target.value)}
            placeholder={placeholder ?? (isSet ? "Clique no olho para ver, ou cole um novo valor" : `Preencher: ${rotulo}`)}
          />
          <button
            type="button"
            onClick={alternarOlho}
            disabled={revelando}
            aria-label={revelado ? `Ocultar ${rotulo}` : `Mostrar ${rotulo}`}
            aria-pressed={revelado}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-[4px] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
          >
            {revelado ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      )}

      {/* ZONA 3 — legenda. Slot constante: sempre existe uma linha aqui. */}
      <p className="flex items-center gap-1.5 text-[11px] leading-none">
        {estado === "naoAplicavel" ? (
          <span className="uppercase tracking-wide text-muted-foreground/60">Não usado neste canal</span>
        ) : estado === "leitura" ? (
          <>
            <span className="uppercase tracking-wide text-muted-foreground">Origem:</span>
            <span className="font-semibold text-foreground/80">{rotuloOrigem ?? "—"}</span>
          </>
        ) : (
          <>
            <span className="uppercase tracking-wide text-muted-foreground">No cofre:</span>
            {isSet ? (
              <>
                <span className="font-mono text-[12px] font-bold tracking-wide text-foreground">
                  {masked ?? "••••"}
                </span>
                {rotuloOrigem ? (
                  <span className="uppercase tracking-wide text-muted-foreground">· {rotuloOrigem}</span>
                ) : null}
              </>
            ) : (
              <span className="font-semibold text-amber-700 dark:text-amber-400">vazio</span>
            )}
          </>
        )}
      </p>

      {/* ZONA 4 — a razao, sempre escrita ("nao quero nada oculto"). */}
      {nota ? (
        <p className="text-[10px] leading-snug text-muted-foreground/70">{nota}</p>
      ) : null}
    </div>
  );
}
