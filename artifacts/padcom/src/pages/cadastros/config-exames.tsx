import { useEffect, useState } from "react";
import { FlaskConical, ShieldCheck, Lock } from "lucide-react";
import { ConsoleShell, BlockTitle, ExplainRow } from "../comunicacao/_shared";
import { getCollabToken } from "@/lib/collab-auth";
import { usePermissoes } from "@/lib/permissoes";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface ExamesConfig {
  exigirValidacaoHumana: boolean;
  triagemAtiva: boolean;
  autoCriarDescoberto: boolean;
  autoAbsorverApelidoAltaConfianca: boolean;
}

type ChaveConfig = keyof ExamesConfig;

interface Interruptor {
  chave: ChaveConfig;
  titulo: string;
  ligado: string;
  desligado: string;
}

// Os 4 interruptores que o motor de exames obedece (spec Parte 4).
const INTERRUPTORES: Interruptor[] = [
  {
    chave: "exigirValidacaoHumana",
    titulo: "Exigir conferência humana na Evolução",
    ligado:
      "A Evolução do cliente só mostra resultados já CONFERIDOS por uma pessoa. Mais seguro.",
    desligado:
      "A Evolução mostra tudo que a inteligência artificial já leu, sem esperar conferência.",
  },
  {
    chave: "triagemAtiva",
    titulo: "Triagem automática ligada",
    ligado:
      "Quando um exame chega com grafia nova, o sistema tenta resolver sozinho (apelido conhecido ou cadastro novo).",
    desligado:
      "Nada é automatizado: toda grafia não reconhecida vai para a fila da Sala de Triagem para decisão humana.",
  },
  {
    chave: "autoCriarDescoberto",
    titulo: "Criar exame novo automaticamente",
    ligado:
      "Exame nunca visto antes é cadastrado sozinho (marcado como DESCOBERTO) e já entra na Evolução.",
    desligado:
      "Exame novo NÃO é cadastrado sozinho: vira um item A CONFERIR na fila, aguardando decisão humana.",
  },
  {
    chave: "autoAbsorverApelidoAltaConfianca",
    titulo: "Absorver apelido de alta confiança",
    ligado:
      "Quando a grafia é claramente um apelido de um exame já cadastrado, o sistema liga os dois sozinho.",
    desligado:
      "O apelido de alta confiança também espera decisão humana na fila, em vez de ligar sozinho.",
  },
];

// Chave 3D dourada (mesmo desenho da tela de Permissões).
function Toggle({
  on,
  onClick,
  label,
  disabled,
}: {
  on: boolean;
  onClick: () => void;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={on}
      aria-label={label}
      className="relative inline-flex h-6 w-11 shrink-0 items-center rounded-[5px] transition-colors disabled:cursor-not-allowed disabled:opacity-70"
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

export default function ConfigExames() {
  const { pode, loading: permLoading } = usePermissoes();
  const podeConfig = pode("exames_config");
  const [cfg, setCfg] = useState<ExamesConfig | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  async function carregar() {
    setCarregando(true);
    try {
      const token = getCollabToken();
      const res = await fetch(`${BASE}/api/settings/exames`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (res.ok) setCfg((await res.json()) as ExamesConfig);
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    void carregar();
  }, []);

  async function flip(chave: ChaveConfig) {
    if (!cfg || salvando) return;
    const novo = !cfg[chave];
    setCfg({ ...cfg, [chave]: novo });
    setSalvando(true);
    setAviso(null);
    try {
      const token = getCollabToken();
      const res = await fetch(`${BASE}/api/settings/exames`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ [chave]: novo }),
      });
      if (res.ok) {
        setCfg((await res.json()) as ExamesConfig);
        setAviso("Configuração salva.");
      } else {
        // reverte a chave em caso de falha
        setCfg((c) => (c ? { ...c, [chave]: !novo } : c));
        setAviso("Falha ao salvar. Tente de novo.");
      }
    } catch {
      setCfg((c) => (c ? { ...c, [chave]: !novo } : c));
      setAviso("Falha ao salvar. Tente de novo.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <ConsoleShell
      icon={FlaskConical}
      title="Configuração de Exames"
      subtitle="Os interruptores que o motor de triagem de exames obedece. Ligue a chave dourada para ativar; desligue para mandar tudo à fila de conferência humana."
    >
      {!permLoading && !podeConfig ? (
        <section className="panel-3d px-5 py-8 text-center">
          <Lock className="mx-auto mb-3 h-8 w-8 text-[#a9863f]" />
          <div className="text-[14px] font-bold text-[#16294a]">Acesso reservado ao CEO</div>
          <p className="mx-auto mt-1 max-w-md text-[12px] leading-relaxed text-[#647c97]">
            A Configuração de Exames é reservada ao Decisor (CEO). Seu papel não tem liberação para
            alterar a automação da triagem. Fale com o CEO se precisar de acesso.
          </p>
        </section>
      ) : (
      <>
      <section className="panel-3d px-5 py-4">
        <BlockTitle icon={ShieldCheck}>Automação da triagem</BlockTitle>
        {carregando || !cfg ? (
          <div className="py-8 text-center text-[12px] text-[#647c97]">Carregando configuração…</div>
        ) : (
          <div className="space-y-3">
            {INTERRUPTORES.map((it) => {
              const on = cfg[it.chave];
              return (
                <div key={it.chave} className="concave-3d flex items-start gap-4 px-4 py-3">
                  <div className="pt-0.5">
                    <Toggle
                      on={on}
                      onClick={() => void flip(it.chave)}
                      disabled={salvando}
                      label={it.titulo}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-bold text-[#16294a]">{it.titulo}</div>
                    <p className="mt-0.5 text-[11.5px] leading-relaxed text-[#647c97]">
                      {on ? it.ligado : it.desligado}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="panel-3d flex items-center justify-between gap-3 px-5 py-3">
        <span className="flex items-center gap-1.5 text-[11px] text-[#647c97]">
          <Lock className="h-3.5 w-3.5" /> Cada chave salva na hora que você liga ou desliga.
        </span>
        {aviso && <span className="text-[11px] font-semibold text-[#16294a]">{aviso}</span>}
      </section>

      <ExplainRow noLed>
        Quando a <strong>triagem automática</strong> está desligada, as duas chaves seguintes não
        têm efeito: tudo vai direto para a fila da Sala de Triagem.
      </ExplainRow>
      </>
      )}
    </ConsoleShell>
  );
}
