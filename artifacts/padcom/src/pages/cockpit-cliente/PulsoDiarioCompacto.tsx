import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity } from "lucide-react";
import { Numeral } from "@/components/numeral/Numeral";
import { BASE } from "@/pages/comunicacao/_shared";

// Pulso Diário compacto — mora dentro da coluna de informações do cliente, abaixo dos botões.
// Lê /api/pulso-diario (mesma fonte do painel antigo). Dado ausente = traço, nunca zero.

type Pulso = {
  id: number;
  data: string;
  periodo: string;
  energia: number | null;
  disposicao: number | null;
  sono: number | null;
  pressaoSistolica: number | null;
  pressaoDiastolica: number | null;
  glicemia: number | null;
  origem: string;
};

const PERIODOS = [
  { chave: "manha", nome: "Manhã" },
  { chave: "tarde", nome: "Tarde" },
  { chave: "noite", nome: "Noite" },
] as const;

type Tom = "ok" | "atencao" | "alto" | "neutro";

function tomPressao(sis: number | null, dia: number | null): Tom {
  if (sis == null && dia == null) return "neutro";
  if ((sis ?? 0) >= 160 || (dia ?? 0) >= 100) return "alto";
  if ((sis ?? 0) >= 140 || (dia ?? 0) >= 90) return "atencao";
  return "ok";
}

function tomGlicemia(g: number | null): Tom {
  if (g == null) return "neutro";
  if (g >= 126) return "alto";
  if (g >= 100) return "atencao";
  return "ok";
}

function dataBr(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

function Celula({ valor, tom = "neutro" }: { valor: number | string | null; tom?: Tom }) {
  if (valor == null) return <span className="cc-pulso-cel cc-pulso-vazio" aria-label="sem registro">—</span>;
  return (
    <span className="cc-pulso-cel" data-tom={tom}>
      <Numeral peso={700}>{valor}</Numeral>
    </span>
  );
}

export default function PulsoDiarioCompacto({ clientId }: { clientId: number }) {
  const { data, isLoading, isError, refetch } = useQuery<Pulso[]>({
    queryKey: ["pulso-diario", clientId],
    queryFn: async ({ signal }) => {
      const r = await fetch(`${BASE}/api/pulso-diario/${clientId}?dias=14`, { signal });
      if (!r.ok) throw new Error("Falha ao carregar o pulso diário.");
      return r.json();
    },
    retry: false,
  });

  const { dia, porPeriodo, demo } = useMemo(() => {
    const linhas = data ?? [];
    const dia = linhas.reduce<string | null>((m, l) => (m === null || l.data > m ? l.data : m), null);
    const doDia = linhas.filter((l) => l.data === dia);
    return {
      dia,
      porPeriodo: new Map(doDia.map((l) => [l.periodo, l])),
      demo: doDia.some((l) => l.origem === "demo"),
    };
  }, [data]);

  const estado = isError ? "Consulta indisponível" : isLoading ? "Carregando" : dia ? dataBr(dia) : "Sem registros";

  return (
    <section className="cc-pulso" aria-label="Pulso diário do cliente">
      <header className="cc-pulso-topo">
        <span className="cc-pulso-titulo"><Activity size={12} aria-hidden="true" /> PULSO DIÁRIO</span>
        <span className="cc-pulso-estado">
          {demo && <em title="Dados fictícios de demonstração">DEMONSTRAÇÃO</em>}
          {estado}
        </span>
      </header>

      {isError ? (
        <p className="cc-pulso-msg" role="alert">
          Não foi possível consultar o pulso diário.{" "}
          <button type="button" onClick={() => void refetch()}>Tentar novamente</button>
        </p>
      ) : isLoading ? (
        <p className="cc-pulso-msg" role="status">Carregando…</p>
      ) : !dia ? (
        <p className="cc-pulso-msg">Sem registros do cliente ainda.</p>
      ) : (
        <div className="cc-pulso-grade" role="table" aria-label={`Registros de ${dataBr(dia)}`}>
          <div className="cc-pulso-linha cc-pulso-cab" role="row">
            <span role="columnheader" />
            <span role="columnheader">Energia</span>
            <span role="columnheader">Disposição</span>
            <span role="columnheader">Sono</span>
            <span role="columnheader">Pressão</span>
            <span role="columnheader">Glicemia</span>
          </div>
          {PERIODOS.map((p) => {
            const r = porPeriodo.get(p.chave);
            const pa = r && (r.pressaoSistolica != null || r.pressaoDiastolica != null)
              ? `${r.pressaoSistolica ?? "—"}/${r.pressaoDiastolica ?? "—"}`
              : null;
            return (
              <div className="cc-pulso-linha" role="row" key={p.chave}>
                <span className="cc-pulso-per" role="rowheader">{p.nome}</span>
                <Celula valor={r?.energia ?? null} />
                <Celula valor={r?.disposicao ?? null} />
                <Celula valor={r?.sono ?? null} />
                <Celula valor={pa} tom={tomPressao(r?.pressaoSistolica ?? null, r?.pressaoDiastolica ?? null)} />
                <Celula valor={r?.glicemia ?? null} tom={tomGlicemia(r?.glicemia ?? null)} />
              </div>
            );
          })}
        </div>
      )}
      {dia && !isError && !isLoading && (
        <p className="cc-pulso-nota">Energia, disposição e sono de 0 a 10 · pressão em mmHg · glicemia em mg/dL</p>
      )}
    </section>
  );
}
