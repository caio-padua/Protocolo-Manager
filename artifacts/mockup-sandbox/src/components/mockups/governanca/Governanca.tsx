import "../validacao/_group.css";
import { useState } from "react";
import { Selo } from "../documentos/_dockit";
import {
  GRUPOS as GRUPOS_DATA,
  PAPEIS,
  permissoesDefault,
} from "./_permissoes";
import {
  ArrowLeft,
  Crown,
  FileText,
  Lock,
  ShieldCheck,
  Stethoscope,
  Users,
} from "lucide-react";

/* ============================================================
   GOVERNANÇA — Quem pode fazer o quê
   O CEO libera/bloqueia cada ferramenta por papel (toggle).
   Dados (papéis, ferramentas, defaults) vêm de _permissoes.ts
   — a mesma fonte que o Laudo lê para obedecer.
   ============================================================ */

const GRUPO_ICON: Record<string, typeof FileText> = {
  Documentos: FileText,
  "Clínico": Stethoscope,
  "Gestão": ShieldCheck,
};
const GRUPOS = GRUPOS_DATA.map((g) => ({ ...g, Icon: GRUPO_ICON[g.grupo] ?? FileText }));

function Toggle({ on, onClick, locked, label }: { on: boolean; onClick: () => void; locked?: boolean; label?: string }) {
  if (locked) {
    return (
      <span className="concave-3d inline-flex h-6 w-11 items-center justify-center opacity-60" title="Reservado ao CEO">
        <Lock className="h-3 w-3 text-[#647c97]" />
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      aria-label={label}
      className="relative inline-flex h-6 w-11 items-center rounded-[5px] transition-colors"
      style={{
        background: on ? "linear-gradient(180deg,#d8b96a,#a9863f)" : "linear-gradient(160deg,#ece6d7,#f6f1e6)",
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

export function Governanca() {
  const [mat, setMat] = useState(permissoesDefault);

  function flip(itemId: string, papelId: string) {
    setMat((prev) => ({ ...prev, [itemId]: { ...prev[itemId], [papelId]: !prev[itemId][papelId] } }));
  }

  const totalOn = Object.values(mat).reduce(
    (acc, row) => acc + Object.values(row).filter(Boolean).length,
    0,
  );

  return (
    <div className="cockpit-root min-h-screen w-full font-sans">
      {/* barra de topo (governanca, dono = CEO) */}
      <header
        className="flex items-center justify-between px-7 py-3"
        style={{ background: "linear-gradient(180deg,#1b3260 0%,#16294a 60%,#101f3a 100%)", borderBottom: "1px solid rgba(231,205,143,0.35)" }}
      >
        <div className="flex items-center gap-4">
          <Selo />
          <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.18em] text-slate-300">
            <ArrowLeft className="h-3.5 w-3.5" /> Menu
          </span>
          <span className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-white">
            <ShieldCheck className="h-4 w-4 text-[#e7cd8f]" /> Permissões e Acessos · Quem pode o quê
          </span>
        </div>
        <div className="flex items-center gap-2 rounded-md bg-[#0e1c34] px-3 py-1.5" style={{ border: "1px solid rgba(231,205,143,0.30)" }}>
          <Crown className="h-3.5 w-3.5 text-[#e7cd8f]" />
          <div className="leading-tight">
            <div className="text-[8px] uppercase tracking-wide text-slate-400">Decisor (CEO)</div>
            <div className="text-[12px] font-semibold text-white">Dr. Caio Pádua</div>
          </div>
        </div>
      </header>

      <main className="px-7 py-6">
        {/* introducao */}
        <section className="panel-3d mb-5 px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-[22px] font-bold tracking-wide text-[#16294a]">Permissões e Acessos</h1>
              <p className="mt-0.5 max-w-3xl text-[12px] leading-relaxed text-[#647c97]">
                Aqui você (CEO) decide <strong>quem pode usar cada ferramenta</strong>. Ligue o botão para liberar
                o papel; desligue para bloquear. As telas obedecem na hora: o que estiver bloqueado some para aquele papel.
              </p>
            </div>
            <div className="flex gap-2">
              <Kpi rotulo="Papéis" valor={String(PAPEIS.length)} Icon={Users} />
              <Kpi rotulo="Ferramentas" valor={String(GRUPOS.reduce((a, g) => a + g.itens.length, 0))} Icon={FileText} />
              <Kpi rotulo="Liberações ativas" valor={String(totalOn)} Icon={ShieldCheck} />
            </div>
          </div>
          {/* legenda */}
          <div className="mt-3 flex flex-wrap items-center gap-4 text-[10.5px] text-[#647c97]">
            <span className="flex items-center gap-1.5"><Toggle on onClick={() => {}} /> liberado</span>
            <span className="flex items-center gap-1.5"><Toggle on={false} onClick={() => {}} /> bloqueado</span>
            <span className="flex items-center gap-1.5"><Toggle on={false} onClick={() => {}} locked /> reservado ao CEO</span>
          </div>
        </section>

        {/* MATRIZ */}
        <section className="panel-3d px-5 py-4">
          <div className="overflow-hidden rounded">
            {/* cabecalho de papeis */}
            <div className="grid items-stretch" style={{ gridTemplateColumns: "280px repeat(5, 1fr)" }}>
              <div className="concave-3d flex items-end px-3 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[#647c97]">
                Ferramenta \ Papel
              </div>
              {PAPEIS.map((p) => (
                <div
                  key={p.id}
                  className="concave-3d flex flex-col items-center justify-end gap-1 px-2 py-2 text-center"
                  style={p.destaque ? { outline: "2px solid #c2a05a", outlineOffset: -2 } : undefined}
                >
                  <span className="text-[11px] font-bold leading-tight text-[#16294a]">{p.nome}</span>
                  {p.destaque && (
                    <span className="rounded bg-[#16294a] px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-[#e7cd8f]">foco</span>
                  )}
                </div>
              ))}
            </div>

            {/* grupos + linhas */}
            {GRUPOS.map((g) => (
              <div key={g.grupo}>
                <div className="mt-2 flex items-center gap-2 px-1 py-1.5">
                  <g.Icon className="h-3.5 w-3.5 text-[#c2a05a]" />
                  <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#16294a]">{g.grupo}</span>
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
                          on={!!mat[it.id][p.id]}
                          onClick={() => flip(it.id, p.id)}
                          locked={it.soCeo}
                          label={`Permissão ${it.nome} para ${p.nome}`}
                        />
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </section>

        {/* acoes */}
        <section className="panel-3d mt-5 flex items-center justify-between gap-3 px-5 py-4">
          <span className="flex items-center gap-1.5 text-[11px] text-[#647c97]">
            <Lock className="h-3.5 w-3.5" /> Só o CEO altera estas liberações.
          </span>
          <div className="flex gap-3">
            <button type="button" className="btn-3d-soft inline-flex items-center gap-1.5 px-4 py-2.5 text-[12px] font-bold uppercase tracking-wide">
              Restaurar padrão
            </button>
            <button type="button" className="btn-3d inline-flex items-center gap-1.5 px-5 py-2.5 text-[12px] font-bold uppercase tracking-wide">
              <ShieldCheck className="h-4 w-4" /> Salvar liberações
            </button>
          </div>
        </section>

        <p className="mt-6 text-center text-[10px] uppercase tracking-[0.2em] text-[#9fb0c4]">
          Padcon Conect · Motor de Encantamento · Permissões e Acessos
        </p>
      </main>
    </div>
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

export default Governanca;
