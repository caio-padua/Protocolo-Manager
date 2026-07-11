import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, Sun, CloudSun, Moon, Battery, Smile, HeartPulse, Droplet, BedDouble } from "lucide-react";
import { BASE } from "../../comunicacao/_shared";

// ===========================================================================
// PULSO DIÁRIO (Acompanhamento Diário) — faixa no cabeçalho do Cockpit.
// O serviço de mensageria pergunta ao cliente, por PERÍODO do dia (manhã/tarde/
// noite), como ele está: energia, disposição, pressão arterial e glicemia. Cada
// resposta é uma linha de /api/pulso-diario. Aqui mostramos o ÚLTIMO dia com
// registro (3 períodos) + uma tira de tendência dos últimos dias.
// Honestidade (Art. 47): nada inventado; período/dia sem dado mostra "—".
// ===========================================================================

const NAVY = "#16294a";
const GOLD = "#9a7b32";
const RED = "#b4413c";
const AMBER = "#b8804a";
const GREEN = "#3f7a3f";
const MUTE = "#9aa7b6";

type Pulso = {
  id: number;
  clienteId: number;
  data: string; // YYYY-MM-DD
  periodo: string; // manha | tarde | noite
  energia: number | null;
  disposicao: number | null;
  sono: number | null;
  pressaoSistolica: number | null;
  pressaoDiastolica: number | null;
  glicemia: number | null;
  humor: string | null;
  observacao: string | null;
  origem: string;
};

const PERIODOS = [
  { chave: "manha", nome: "Manhã", icon: Sun },
  { chave: "tarde", nome: "Tarde", icon: CloudSun },
  { chave: "noite", nome: "Noite", icon: Moon },
] as const;

function dataBr(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

// Cor da pressão arterial (limiares clínicos padrão: ≥140/90 = elevada).
function corPressao(sis: number | null, dia: number | null): string {
  if (sis == null && dia == null) return NAVY;
  if ((sis ?? 0) >= 160 || (dia ?? 0) >= 100) return RED;
  if ((sis ?? 0) >= 140 || (dia ?? 0) >= 90) return AMBER;
  return GREEN;
}

// Cor da glicemia (limiares de jejum padrão: 100-125 = alterada; ≥126 = alta).
function corGlicemia(g: number | null): string {
  if (g == null) return NAVY;
  if (g >= 126) return RED;
  if (g >= 100) return AMBER;
  return GREEN;
}

// Barrinha 0..10 (energia / disposição).
function Barra({ valor, cor }: { valor: number | null; cor: string }) {
  const pct = valor == null ? 0 : Math.max(0, Math.min(10, valor)) * 10;
  return (
    <div className="mt-0.5 h-1.5 w-full overflow-hidden rounded-full" style={{ background: "rgba(22,41,74,0.10)" }}>
      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: cor }} />
    </div>
  );
}

function Metrica({
  icon,
  rotulo,
  valor,
  sufixo,
  cor,
  barra,
}: {
  icon: React.ReactNode;
  rotulo: string;
  valor: string;
  sufixo?: string;
  cor: string;
  barra?: number | null;
}) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1 text-[8px] font-bold uppercase tracking-[0.12em]" style={{ color: GOLD }}>
        {icon}
        {rotulo}
      </div>
      <div className="flex items-baseline gap-0.5">
        <span className="text-[15px] font-bold leading-none" style={{ color: cor }}>
          {valor}
        </span>
        {sufixo && valor !== "—" && (
          <span className="text-[9px] font-semibold" style={{ color: MUTE }}>
            {sufixo}
          </span>
        )}
      </div>
      {barra !== undefined && <Barra valor={barra} cor={cor} />}
    </div>
  );
}

function CardPeriodo({
  nome,
  icon,
  reg,
}: {
  nome: string;
  icon: React.ReactNode;
  reg: Pulso | undefined;
}) {
  const num = (v: number | null) => (v == null ? "—" : String(v));
  const pa =
    reg && (reg.pressaoSistolica != null || reg.pressaoDiastolica != null)
      ? `${reg.pressaoSistolica ?? "—"}/${reg.pressaoDiastolica ?? "—"}`
      : "—";
  return (
    <div className="screen-3d flex-1 p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: NAVY }}>
          <span style={{ color: GOLD }}>{icon}</span>
          {nome}
        </div>
        {reg?.humor && (
          <span
            className="rounded-[4px] px-1.5 py-0.5 text-[9px] font-semibold capitalize"
            style={{ color: NAVY, background: "rgba(154,123,50,0.12)" }}
          >
            {reg.humor}
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-2">
        <Metrica
          icon={<Battery className="h-2.5 w-2.5" />}
          rotulo="Energia"
          valor={num(reg?.energia ?? null)}
          sufixo="/10"
          cor={NAVY}
          barra={reg?.energia ?? null}
        />
        <Metrica
          icon={<Smile className="h-2.5 w-2.5" />}
          rotulo="Disposição"
          valor={num(reg?.disposicao ?? null)}
          sufixo="/10"
          cor={NAVY}
          barra={reg?.disposicao ?? null}
        />
        <Metrica
          icon={<BedDouble className="h-2.5 w-2.5" />}
          rotulo="Sono"
          valor={num(reg?.sono ?? null)}
          sufixo="/10"
          cor={NAVY}
          barra={reg?.sono ?? null}
        />
        <Metrica
          icon={<Droplet className="h-2.5 w-2.5" />}
          rotulo="Glicemia"
          valor={num(reg?.glicemia ?? null)}
          sufixo="mg/dL"
          cor={corGlicemia(reg?.glicemia ?? null)}
        />
        <div className="col-span-2">
          <Metrica
            icon={<HeartPulse className="h-2.5 w-2.5" />}
            rotulo="Pressão Arterial"
            valor={pa}
            sufixo="mmHg"
            cor={corPressao(reg?.pressaoSistolica ?? null, reg?.pressaoDiastolica ?? null)}
          />
        </div>
      </div>
      {reg?.observacao && (
        <div className="mt-2 text-[10px] italic leading-snug" style={{ color: "#647c97" }}>
          {reg.observacao}
        </div>
      )}
    </div>
  );
}

export default function AcompanhamentoDiarioPanel({ clientId }: { clientId: number }) {
  const { data, isLoading } = useQuery<Pulso[]>({
    queryKey: ["pulso-diario", clientId],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/pulso-diario/${clientId}?dias=14`);
      if (!r.ok) throw new Error("Falha ao carregar pulso diário");
      return r.json();
    },
  });

  const { diaAlvo, porPeriodo, dias } = useMemo(() => {
    const linhas = data ?? [];
    // Agrupa por dia (YYYY-MM-DD).
    const mapDias = new Map<string, Pulso[]>();
    for (const l of linhas) {
      const arr = mapDias.get(l.data) ?? [];
      arr.push(l);
      mapDias.set(l.data, arr);
    }
    const diasOrd = Array.from(mapDias.keys()).sort(); // asc
    const alvo = diasOrd.length ? diasOrd[diasOrd.length - 1] : null;
    const porP = new Map<string, Pulso>();
    if (alvo) {
      for (const l of mapDias.get(alvo) ?? []) porP.set(l.periodo, l);
    }
    // Tendência: média diária de energia (para a tira).
    const tend = diasOrd.map((d) => {
      const regs = (mapDias.get(d) ?? []).filter((r) => r.energia != null);
      const media = regs.length
        ? regs.reduce((s, r) => s + (r.energia ?? 0), 0) / regs.length
        : null;
      return { data: d, energia: media };
    });
    return { diaAlvo: alvo, porPeriodo: porP, dias: tend };
  }, [data]);

  return (
    <div className="panel-3d mb-6 p-4" style={{ borderTop: `3px solid ${GOLD}` }}>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: NAVY }}>
          <Activity className="h-3.5 w-3.5" style={{ color: GOLD }} /> Pulso Diário
        </div>
        <span className="text-[10px] font-semibold uppercase tracking-[0.12em]" style={{ color: MUTE }}>
          {diaAlvo ? `Último registro · ${dataBr(diaAlvo)}` : "Sem registros"}
        </span>
      </div>

      {isLoading ? (
        <div className="py-6 text-center text-[12px] font-semibold" style={{ color: MUTE }}>
          Carregando…
        </div>
      ) : !diaAlvo ? (
        <div className="concave-3d px-3 py-6 text-center text-[12px] font-semibold" style={{ color: MUTE }}>
          Sem registros do cliente ainda.
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-3 md:flex-row">
            {PERIODOS.map((p) => {
              const Icon = p.icon;
              return (
                <CardPeriodo
                  key={p.chave}
                  nome={p.nome}
                  icon={<Icon className="h-3.5 w-3.5" />}
                  reg={porPeriodo.get(p.chave)}
                />
              );
            })}
          </div>

          {/* Tira de tendência — média diária de energia nos últimos dias */}
          {dias.length > 1 && (
            <div className="mt-3">
              <div className="mb-1 text-[8px] font-bold uppercase tracking-[0.14em]" style={{ color: GOLD }}>
                Tendência de energia (últimos {dias.length} dias)
              </div>
              <div className="flex items-end gap-1" style={{ height: 40 }}>
                {dias.map((d) => {
                  const alt = d.energia == null ? 0 : Math.max(6, (d.energia / 10) * 40);
                  const ehAlvo = d.data === diaAlvo;
                  return (
                    <div
                      key={d.data}
                      className="flex-1 rounded-t-[2px]"
                      title={`${dataBr(d.data)} · energia média ${d.energia == null ? "—" : d.energia.toFixed(1)}`}
                      style={{
                        height: `${alt}px`,
                        background: d.energia == null ? "rgba(22,41,74,0.08)" : ehAlvo ? GOLD : "rgba(22,41,74,0.35)",
                      }}
                    />
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
