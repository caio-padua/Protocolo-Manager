import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  UserRound,
  CalendarDays,
  MapPin,
  Phone,
  Instagram,
  Sparkles,
  AlertTriangle,
  ShieldAlert,
  Droplet,
  Cigarette,
  Stethoscope,
  Pill,
} from "lucide-react";
import { BASE } from "../../comunicacao/_shared";

// ===========================================================================
// CRACHÁ CLÍNICO DO PACIENTE (Cockpit da Consulta) — decisão do CEO 14/07/2026.
// Junta dados de CADASTRO e CLÍNICOS num cabeçalho tipo prontuário: o médico bate
// o olho e lê o paciente num relance. Grade FIXA (skill-layout-paxter, Padrão
// 12/13): campo sem dado nunca some — mostra "—". Fonte clínica: fichaClinica
// (jsonb do cliente) + DTO do motor da anamnese (/api/cockpit/:id). Honestidade
// (Art. 47): nada inventado; ausência = "—".
// ===========================================================================

const NAVY = "#16294a";
const GOLD = "#9a7b32";
const BORDER = "#d8cfbc";
const RED = "#b4413c";
const GREEN = "#3f7a3f";

type ClientData = {
  id: number;
  name: string;
  cpf?: string | null;
  phone?: string | null;
  email?: string | null;
  birthDate?: string | null;
  address?: string | null;
  instagram?: string | null;
  comoConheceu?: string | null;
  photoUrl?: string | null;
  fichaClinica?: Record<string, unknown> | null;
};

type CockpitDto = {
  presente?: {
    doencas?: string[];
    redFlag?: boolean;
    alarmes?: { perguntaId: string; pergunta: string }[];
  };
};

// Data de nascimento chega em formatos variados: "1972-03-14" (data pura),
// "1972-03-14T00:00:00.000Z" (timestamp completo) ou "14/03/1972" (BR). O bug
// antigo concatenava "T12:00:00-03:00" sobre o timestamp completo → data inválida
// → NaN → devolvia o ISO cru ("ano-primeiro"). Aqui extraímos ano/mês/dia e
// montamos a data ao MEIO-DIA local (imune a fuso), aceitando os três formatos.
function parseData(raw?: string | null): Date | null {
  if (!raw) return null;
  const s = String(raw).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); // ISO (data ou timestamp)
  if (m) {
    const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }
  m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/); // BR DD/MM/AAAA
  if (m) {
    const dt = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), 12, 0, 0);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }
  const dt = new Date(s);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function idade(birthDate?: string | null): number | null {
  const d = parseData(birthDate);
  if (!d) return null;
  const hoje = new Date();
  let anos = hoje.getFullYear() - d.getFullYear();
  const m = hoje.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && hoje.getDate() < d.getDate())) anos--;
  return anos;
}

function dataBr(iso?: string | null): string {
  const d = parseData(iso);
  if (!d) return "—";
  return d.toLocaleDateString("pt-BR");
}

// Lê listas soltas da fichaClinica sem quebrar quando o dado é string única ou ausente.
function comoLista(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x)).filter(Boolean);
  if (typeof v === "string" && v.trim()) {
    return v
      .split(/[;,\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

function comoTexto(v: unknown): string {
  if (typeof v === "string" && v.trim()) return v.trim();
  if (typeof v === "number") return String(v);
  return "";
}

// Campo fixo com rótulo em cima e valor embaixo (colunas verticais, Padrão 12).
function Campo({
  icon,
  rotulo,
  valor,
}: {
  icon?: React.ReactNode;
  rotulo: string;
  valor: string;
}) {
  return (
    <div className="min-w-0">
      <div
        className="mb-0.5 flex items-center gap-1 text-[9px] font-bold uppercase tracking-[0.14em]"
        style={{ color: GOLD }}
      >
        {icon}
        {rotulo}
      </div>
      <div
        className="concave-3d truncate px-2 py-1 text-[12px] font-semibold"
        style={{ color: NAVY }}
        title={valor}
      >
        {valor || "—"}
      </div>
    </div>
  );
}

// Bloco clínico: rótulo + linha de chips (ou "—" quando vazio).
function BlocoChips({
  icon,
  rotulo,
  itens,
  cor,
  fundo,
}: {
  icon?: React.ReactNode;
  rotulo: string;
  itens: string[];
  cor: string;
  fundo: string;
}) {
  return (
    <div className="min-w-0">
      <div
        className="mb-1 flex items-center gap-1 text-[9px] font-bold uppercase tracking-[0.14em]"
        style={{ color: GOLD }}
      >
        {icon}
        {rotulo}
      </div>
      <div className="concave-3d px-2 py-1.5">
        {itens.length === 0 ? (
          <span className="text-[12px] font-semibold" style={{ color: "#9aa7b6" }}>
            —
          </span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {itens.map((t, i) => (
              <span
                key={`${t}-${i}`}
                className="rounded-[4px] px-2 py-0.5 text-[11px] font-semibold"
                style={{ color: cor, background: fundo, border: `1px solid ${cor}44` }}
                title={t}
              >
                {t}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ClienteCracha({ clientId }: { clientId: number }) {
  const [fotoQuebrada, setFotoQuebrada] = useState(false);
  const { data: client } = useQuery<ClientData>({
    queryKey: ["cracha-client", clientId],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/clients/${clientId}`);
      if (!r.ok) throw new Error("Falha ao carregar cliente");
      return r.json();
    },
  });

  const { data: cockpit } = useQuery<CockpitDto>({
    queryKey: ["cracha-cockpit", clientId],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/cockpit/${clientId}`);
      if (!r.ok) throw new Error("Falha ao carregar consulta");
      return r.json();
    },
  });

  const anos = idade(client?.birthDate);
  const ficha = (client?.fichaClinica ?? {}) as Record<string, unknown>;

  const clinico = useMemo(() => {
    const detectadasAnamnese = cockpit?.presente?.doencas ?? [];
    const patologias = comoLista(ficha.patologias ?? ficha.patologiasDiagnosticadas);
    const suspeitas = Array.from(
      new Set([...comoLista(ficha.suspeitas), ...detectadasAnamnese]),
    );
    const alergias = comoLista(ficha.alergias);
    const medicacoes = comoLista(ficha.medicacoes ?? ficha.medicacoesContinuas);
    const habitos = comoLista(ficha.habitos);
    const tipoSanguineo = comoTexto(ficha.tipoSanguineo ?? ficha.tipo_sanguineo);
    const sexo = comoTexto(ficha.sexo);
    const redFlag = Boolean(cockpit?.presente?.redFlag);
    return { patologias, suspeitas, alergias, medicacoes, habitos, tipoSanguineo, sexo, redFlag };
  }, [ficha, cockpit]);

  const cidadeUf = useMemo(() => {
    const addr = client?.address ?? "";
    if (!addr) return "";
    return addr;
  }, [client]);

  const linha2 = [
    anos != null ? `${anos} anos` : null,
    clinico.sexo || null,
    client?.cpf ? `CPF ${client.cpf}` : null,
  ]
    .filter(Boolean)
    .join("  ·  ");

  return (
    <div
      className="panel-3d mb-6 overflow-hidden p-0"
      style={{ borderTop: `3px solid ${GOLD}` }}
    >
      <div className="flex flex-col gap-0 lg:flex-row">
        {/* ZONA 1 — IDENTIDADE (foto + nome) */}
        <div
          className="flex items-center gap-3 p-4 lg:w-[290px] lg:shrink-0"
          style={{ borderRight: `1px solid ${BORDER}` }}
        >
          <div
            className="flex h-[60px] w-[60px] shrink-0 items-center justify-center overflow-hidden rounded-[8px]"
            style={{ background: "#eef1f5", border: `2px solid ${GOLD}` }}
          >
            {client?.photoUrl && !fotoQuebrada ? (
              <img
                src={client.photoUrl}
                alt={client.name}
                className="h-full w-full object-cover"
                onError={() => setFotoQuebrada(true)}
              />
            ) : (
              <UserRound className="h-7 w-7" style={{ color: "#9aa7b6" }} />
            )}
          </div>
          <div className="min-w-0">
            <div
              className="truncate text-[17px] font-bold leading-tight"
              style={{ color: NAVY }}
              title={client?.name}
            >
              {client?.name ?? "—"}
            </div>
            <div className="mt-0.5 text-[12px] font-medium" style={{ color: "#647c97" }}>
              {linha2 || "—"}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px]" style={{ color: "#647c97" }}>
              {client?.phone && (
                <span className="flex items-center gap-1">
                  <Phone className="h-3 w-3" /> {client.phone}
                </span>
              )}
              {client?.instagram && (
                <span className="flex items-center gap-1">
                  <Instagram className="h-3 w-3" /> {client.instagram}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ZONA 2 — CADASTRO */}
        <div
          className="grid grid-cols-2 content-start gap-x-4 gap-y-2.5 p-4 lg:w-[260px] lg:shrink-0"
          style={{ borderRight: `1px solid ${BORDER}`, background: "rgba(154,123,50,0.04)" }}
        >
          <Campo icon={<CalendarDays className="h-3 w-3" />} rotulo="Nascimento" valor={dataBr(client?.birthDate)} />
          <Campo icon={<Droplet className="h-3 w-3" />} rotulo="Tipo Sanguíneo" valor={clinico.tipoSanguineo || "—"} />
          <div className="col-span-2">
            <Campo icon={<MapPin className="h-3 w-3" />} rotulo="Endereço" valor={cidadeUf || "—"} />
          </div>
          <div className="col-span-2">
            <Campo icon={<Sparkles className="h-3 w-3" />} rotulo="Como conheceu" valor={client?.comoConheceu || "—"} />
          </div>
        </div>

        {/* ZONA 3 — CLÍNICO (a mais destacada) */}
        <div className="flex-1 p-4">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: NAVY }}>
              <Stethoscope className="h-3.5 w-3.5" style={{ color: GOLD }} /> Quadro Clínico
            </div>
            {clinico.redFlag ? (
              <span
                className="flex items-center gap-1 rounded-[4px] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                style={{ color: "#fff", background: RED }}
              >
                <ShieldAlert className="h-3 w-3" /> Sinal de Alarme
              </span>
            ) : (
              <span
                className="flex items-center gap-1 rounded-[4px] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                style={{ color: GREEN, background: "rgba(63,122,63,0.12)", border: `1px solid ${GREEN}44` }}
              >
                Sem alarme
              </span>
            )}
          </div>
          <div className="grid grid-cols-1 gap-x-6 gap-y-3 md:grid-cols-2">
            <BlocoChips
              icon={<Stethoscope className="h-3 w-3" />}
              rotulo="Patologias Diagnosticadas"
              itens={clinico.patologias}
              cor={NAVY}
              fundo="rgba(22,41,74,0.06)"
            />
            <BlocoChips
              icon={<AlertTriangle className="h-3 w-3" />}
              rotulo="Suspeitas / Detectadas na Anamnese"
              itens={clinico.suspeitas}
              cor="#8a6d1f"
              fundo="rgba(154,123,50,0.10)"
            />
            <BlocoChips
              icon={<ShieldAlert className="h-3 w-3" />}
              rotulo="Alergias"
              itens={clinico.alergias}
              cor={RED}
              fundo="rgba(180,65,60,0.08)"
            />
            <BlocoChips
              icon={<Pill className="h-3 w-3" />}
              rotulo="Medicações Contínuas"
              itens={clinico.medicacoes}
              cor={NAVY}
              fundo="rgba(22,41,74,0.06)"
            />
            <BlocoChips
              icon={<Cigarette className="h-3 w-3" />}
              rotulo="Hábitos"
              itens={clinico.habitos}
              cor="#647c97"
              fundo="rgba(100,124,151,0.10)"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
