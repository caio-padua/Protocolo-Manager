import { useEffect, useMemo, useState } from "react";
import {
  GRUPOS,
  PAPEIS,
  permissoesDefault,
  type Matriz,
} from "@workspace/governanca";
import {
  Landmark,
  Crown,
  FileText,
  FlaskConical,
  Lock,
  ShieldCheck,
  Stethoscope,
  Users,
} from "lucide-react";
import { ConsoleShell } from "./comunicacao/_shared";
import { getCollabToken } from "@/lib/collab-auth";
import { usePermissoes } from "@/lib/permissoes";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const GRUPO_ICON: Record<string, typeof FileText> = {
  Exames: FlaskConical,
  Documentos: FileText,
  Clínico: Stethoscope,
  Gestão: ShieldCheck,
};

// Chave 3D dourada por papel (copiado do mockup validado ENTREGA 37). Quando a
// ferramenta e soCeo, mostra cadeado no lugar da chave (sempre reservada).
function Toggle({
  on,
  onClick,
  locked,
  label,
  disabled,
}: {
  on: boolean;
  onClick: () => void;
  locked?: boolean;
  label?: string;
  disabled?: boolean;
}) {
  if (locked) {
    return (
      <span
        className="concave-3d inline-flex h-6 w-11 items-center justify-center opacity-60"
        title="Reservado ao CEO"
      >
        <Lock className="h-3 w-3 text-[#647c97]" />
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={on}
      aria-label={label}
      className="relative inline-flex h-6 w-11 items-center rounded-[5px] transition-colors disabled:cursor-not-allowed disabled:opacity-70"
      style={{
        background: on
          ? "linear-gradient(180deg,#d8b96a,#a9863f)"
          : "linear-gradient(160deg,#ece6d7,#f6f1e6)",
        border: on ? "1px solid rgba(120,92,36,0.7)" : "1px solid rgba(184,146,77,0.4)",
        boxShadow: on
          ? "inset 0 2px 0 rgba(255,246,214,0.9), inset 0 -4px 8px rgba(120,80,20,0.3)"
          : "inset 0 3px 6px rgba(7,22,43,0.18)",
      }}
    >
      <span
        className="absolute h-5 w-5 rounded-[3px] transition-all"
        style={{
          left: on ? 22 : 2,
          background: "linear-gradient(180deg,#ffffff,#efe8d6)",
          border: "1px solid rgba(184,146,77,0.5)",
          boxShadow: "0 2px 4px rgba(7,22,43,0.35), inset 0 1px 0 #fff",
        }}
      />
    </button>
  );
}

function Kpi({ rotulo, valor, Icon }: { rotulo: string; valor: string; Icon: typeof Users }) {
  return (
    <div className="concave-3d flex items-center gap-2 px-3 py-2">
      <Icon className="h-4 w-4 text-[#647c97]" />
      <div className="leading-tight">
        <div className="text-[8px] font-bold uppercase tracking-wide text-[#647c97]">{rotulo}</div>
        <div className="text-[16px] font-bold text-[#16294a]">{valor}</div>
      </div>
    </div>
  );
}

export default function Governanca() {
  const { isCeo, acessoTotal, loading: permLoading } = usePermissoes();
  const [mat, setMat] = useState<Matriz>(permissoesDefault);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  // So o CEO edita. Sem sessao de colaborador (acesso total), tambem liberamos
  // a edicao — o back ainda valida (403 se nao for CEO), entao e seguro.
  const podeEditar = acessoTotal || isCeo;

  async function carregar() {
    setCarregando(true);
    try {
      const token = getCollabToken();
      const res = await fetch(`${BASE}/api/settings/governanca`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (res.ok) {
        const data = (await res.json()) as { matriz: Matriz };
        setMat(data.matriz);
      }
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    void carregar();
  }, []);

  function flip(itemId: string, papelId: string) {
    if (!podeEditar) return;
    setMat((prev) => ({
      ...prev,
      [itemId]: { ...prev[itemId], [papelId]: !prev[itemId]?.[papelId] },
    }));
    setAviso(null);
  }

  async function salvar() {
    setSalvando(true);
    setAviso(null);
    try {
      const token = getCollabToken();
      const res = await fetch(`${BASE}/api/settings/governanca`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ matriz: mat }),
      });
      if (res.ok) {
        const data = (await res.json()) as { matriz: Matriz };
        setMat(data.matriz);
        setAviso("Liberações salvas.");
      } else if (res.status === 403) {
        setAviso("Só o CEO altera as permissões.");
      } else {
        setAviso("Falha ao salvar. Tente de novo.");
      }
    } catch {
      setAviso("Falha ao salvar. Tente de novo.");
    } finally {
      setSalvando(false);
    }
  }

  function restaurar() {
    if (!podeEditar) return;
    setMat(permissoesDefault());
    setAviso("Padrão restaurado — clique em Salvar para aplicar.");
  }

  const grupos = useMemo(
    () => GRUPOS.map((g) => ({ ...g, Icon: GRUPO_ICON[g.grupo] ?? FileText })),
    [],
  );
  const totalFerramentas = useMemo(() => grupos.reduce((a, g) => a + g.itens.length, 0), [grupos]);
  const totalOn = useMemo(
    () => Object.values(mat).reduce((acc, row) => acc + Object.values(row).filter(Boolean).length, 0),
    [mat],
  );

  return (
    <ConsoleShell
      icon={Landmark}
      title="Permissões e Acessos"
      subtitle="Quem pode usar cada ferramenta. Ligue a chave dourada para liberar o papel; desligue para bloquear. As telas obedecem na hora."
    >
      {/* KPIs + selo do decisor */}
      <section className="panel-3d px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex gap-2">
            <Kpi rotulo="Papéis" valor={String(PAPEIS.length)} Icon={Users} />
            <Kpi rotulo="Ferramentas" valor={String(totalFerramentas)} Icon={FileText} />
            <Kpi rotulo="Liberações ativas" valor={String(totalOn)} Icon={ShieldCheck} />
          </div>
          <div
            className="flex items-center gap-2 rounded-md bg-[#0e1c34] px-3 py-1.5"
            style={{ border: "1px solid rgba(231,205,143,0.30)" }}
          >
            <Crown className="h-3.5 w-3.5 text-[#e7cd8f]" />
            <div className="leading-tight">
              <div className="text-[8px] uppercase tracking-wide text-slate-400">Decisor (CEO)</div>
              <div className="text-[12px] font-semibold text-white">Dr. Caio Pádua</div>
            </div>
          </div>
        </div>
        {/* legenda */}
        <div className="mt-3 flex flex-wrap items-center gap-4 text-[10.5px] text-[#647c97]">
          <span className="flex items-center gap-1.5">
            <Toggle on onClick={() => {}} /> liberado
          </span>
          <span className="flex items-center gap-1.5">
            <Toggle on={false} onClick={() => {}} /> bloqueado
          </span>
          <span className="flex items-center gap-1.5">
            <Toggle on={false} onClick={() => {}} locked /> reservado ao CEO
          </span>
        </div>
      </section>

      {/* MATRIZ */}
      <section className="panel-3d px-5 py-4">
        {carregando || permLoading ? (
          <div className="py-10 text-center text-[12px] text-[#647c97]">Carregando permissões…</div>
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[720px]">
              {/* cabecalho de papeis */}
              <div className="grid items-stretch" style={{ gridTemplateColumns: "280px repeat(5, 1fr)" }}>
                <div className="concave-3d flex items-end px-3 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[#647c97]">
                  Ferramenta \ Papel
                </div>
                {PAPEIS.map((p) => (
                  <div
                    key={p.id}
                    className="concave-3d flex flex-col items-center justify-end gap-1 px-2 py-2 text-center"
                  >
                    <span className="text-[11px] font-bold leading-tight text-[#16294a]">{p.nome}</span>
                  </div>
                ))}
              </div>

              {/* grupos + linhas */}
              {grupos.map((g) => (
                <div key={g.grupo}>
                  <div className="mt-2 flex items-center gap-2 px-1 py-1.5">
                    <g.Icon className="h-3.5 w-3.5 text-[#c2a05a]" />
                    <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#16294a]">
                      {g.grupo}
                    </span>
                  </div>
                  {g.itens.map((it, idx) => (
                    <div
                      key={it.id}
                      className="grid items-center"
                      style={{
                        gridTemplateColumns: "280px repeat(5, 1fr)",
                        background: idx % 2 === 0 ? "rgba(255,255,255,0.55)" : "transparent",
                      }}
                    >
                      <div className="flex items-center gap-2 px-3 py-2 text-[12.5px] font-semibold text-[#16294a]">
                        {it.soCeo && <Crown className="h-3.5 w-3.5 text-[#c2a05a]" />}
                        {it.nome}
                      </div>
                      {PAPEIS.map((p) => (
                        <div key={p.id} className="flex items-center justify-center py-2">
                          <Toggle
                            on={!!mat[it.id]?.[p.id]}
                            onClick={() => flip(it.id, p.id)}
                            locked={it.soCeo}
                            disabled={!podeEditar}
                            label={`Permissão ${it.nome} para ${p.nome}`}
                          />
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* acoes */}
      <section className="panel-3d flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <span className="flex items-center gap-1.5 text-[11px] text-[#647c97]">
          <Lock className="h-3.5 w-3.5" />
          {podeEditar ? "Só o CEO altera estas liberações." : "Somente leitura — apenas o CEO edita."}
        </span>
        <div className="flex items-center gap-3">
          {aviso && <span className="text-[11px] font-semibold text-[#16294a]">{aviso}</span>}
          <button
            type="button"
            onClick={restaurar}
            disabled={!podeEditar || salvando}
            className="btn-3d-soft inline-flex items-center gap-1.5 px-4 py-2.5 text-[12px] font-bold uppercase tracking-wide disabled:opacity-50"
          >
            Restaurar padrão
          </button>
          <button
            type="button"
            onClick={salvar}
            disabled={!podeEditar || salvando}
            className="btn-3d inline-flex items-center gap-1.5 px-5 py-2.5 text-[12px] font-bold uppercase tracking-wide disabled:opacity-50"
          >
            <ShieldCheck className="h-4 w-4" /> {salvando ? "Salvando…" : "Salvar liberações"}
          </button>
        </div>
      </section>
    </ConsoleShell>
  );
}
