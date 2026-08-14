import "./_group.css";

/* ============================================================
   O ELO — camada de MONETIZAÇÃO multi-tenant.
   Encaixa nas peças que JÁ EXISTEM:
     empresas.modulos_ativos (JSONB) + moduleGuard
     empresas.tipo_contrato (por_demanda / full / pacote)
     avatar_modulos_contratados (nivel, tipo_cobranca, limite_mensal)
     avatar_uso_log (metering por chars e segundos)
   Nenhuma tabela nova de cobrança é necessária.
   ============================================================ */

const MODULOS = [
  {
    chave: "elo_essencial",
    nome: "ELO ESSENCIAL",
    promessa: "O paciente reporta. A clínica enxerga.",
    cobranca: "Mensalidade fixa por clínica",
    cor: "#6fb1e8",
    entrega: [
      "Aba MEU TRATAMENTO na Área do Cliente",
      "Reporte fórmula a fórmula, período a período",
      "As 4 frentes: fórmulas, injetável, dieta, consulta",
      "Painel de constância para o médico",
    ],
    reusa: "motor de lembrete por período (cron 9 janelas)",
  },
  {
    chave: "elo_causal",
    nome: "ELO CAUSAL",
    promessa: "Põe lado a lado o esforço do paciente e a resposta do corpo.",
    cobranca: "Por paciente ativo, por mês",
    cor: "#d9b978",
    destaque: true,
    entrega: [
      "Cruza aderência × marcador a cada laudo novo",
      "Veredito automático usando a direção do exame",
      "Painel de triagem: quem está fora da rota",
      "Recalcula sozinho quando o robô do Drive importa",
    ],
    reusa: "exam_results + exam_analyte_catalog.direction",
  },
  {
    chave: "elo_voz",
    nome: "ELO VOZ",
    promessa: "O resultado chega na voz do próprio médico.",
    cobranca: "Consumo (caracteres e segundos)",
    cor: "#c99be8",
    entrega: [
      "Narrativa causal falada pelo avatar do médico",
      "Entrega por WhatsApp e Telegram no motor atual",
      "Teto mensal por clínica, sem surpresa na fatura",
      "Vídeo opcional no nível 3",
    ],
    reusa: "clinic_avatars + avatar_uso_log (metering pronto)",
  },
  {
    chave: "elo_dossie",
    nome: "ELO DOSSIÊ",
    promessa: "Um documento que o paciente guarda a vida toda.",
    cobranca: "Por documento emitido",
    cor: "#5fc79a",
    entrega: [
      "PDF trimestral de causalidade, assinado (PAdES)",
      "Curva de cada marcador com a faixa de referência",
      "Instrumento de retenção e de indicação",
      "Sai pela Fábrica de Documentos que já existe",
    ],
    reusa: "motor Hermes + embedPadesSignature",
  },
];

function Cartao({ m }: { m: (typeof MODULOS)[number] }) {
  return (
    <div className={`panel-3d-sub overflow-hidden h-full ${m.destaque ? "paxter-neon-breathe" : ""}`}
         style={m.destaque ? ({ "--neon-glow": "hsl(39 75% 55% / .45)" } as React.CSSProperties) : undefined}>
      <div className="flex h-full">
        <div className="w-1 shrink-0" style={{ background: m.cor }} />
        <div className="flex-1 p-4 flex flex-col">
          {/* ZONA 1 */}
          <div className="flex items-center gap-2">
            <span className="paxter-led paxter-led-breathe"
                  style={{ "--led-glow": `${m.cor}dd`, background: `radial-gradient(circle at 35% 30%, #fff 0%, ${m.cor} 45%, ${m.cor}88 100%)` } as React.CSSProperties} />
            <span className="text-[10px] tracking-[0.18em] font-bold" style={{ color: m.cor }}>{m.nome}</span>
            {m.destaque && (
              <span className="ml-auto concave-3d px-1.5 py-0.5 text-[8px] tracking-[0.12em] font-bold gold">
                CORAÇÃO
              </span>
            )}
          </div>

          {/* ZONA 2 — promessa */}
          <p className="elo-serif mt-2 leading-snug" style={{ fontSize: 17, color: "#eef4fc" }}>{m.promessa}</p>

          {/* ZONA 3 — o que entrega */}
          <div className="concave-3d mt-3 p-2.5 space-y-1.5 flex-1">
            {m.entrega.map((e) => (
              <div key={e} className="flex gap-2 items-start">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" className="mt-1 shrink-0">
                  <path d="M4 12.5 9.5 18 20 6.5" stroke={m.cor} strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="text-[10.5px] ink-dim leading-snug">{e}</span>
              </div>
            ))}
          </div>

          {/* ZONA 4 — cobrança e reuso */}
          <div className="mt-3 space-y-1.5">
            <div className="screen-3d px-2.5 py-1.5">
              <div className="text-[8.5px] tracking-[0.14em] ink-faint font-semibold">COMO COBRA</div>
              <div className="text-[11px] font-semibold mt-0.5" style={{ color: m.cor }}>{m.cobranca}</div>
            </div>
            <div className="px-0.5">
              <div className="text-[8.5px] tracking-[0.14em] ink-faint font-semibold">REAPROVEITA</div>
              <div className="text-[9.5px] gold-dim mt-0.5 leading-tight">{m.reusa}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ModulosElo() {
  return (
    <div className="elo-root p-7">
      {/* CABEÇALHO */}
      <div className="panel-3d-hero px-6 py-5 mb-5">
        <div className="flex items-center gap-4">
          <div className="bevel-3d-gold w-12 h-12 rounded-md grid place-items-center shrink-0">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M9 12a3 3 0 0 1 3-3h1a3 3 0 0 1 0 6h-1" stroke="#f0dcae" strokeWidth="1.9" strokeLinecap="round" />
              <path d="M15 12a3 3 0 0 1-3 3h-1a3 3 0 0 1 0-6h1" stroke="#f0dcae" strokeWidth="1.9" strokeLinecap="round" />
            </svg>
          </div>
          <div>
            <h1 className="elo-serif leading-none" style={{ fontSize: 36, fontWeight: 700, letterSpacing: ".02em", color: "#f2e6c9" }}>
              O ELO como produto
            </h1>
            <div className="text-[11px] tracking-[0.24em] ink-dim font-semibold mt-1">
              QUATRO MÓDULOS LICENCIÁVEIS ÀS CLÍNICAS FUTURAS
            </div>
          </div>
        </div>
        <div className="faixa-gold mt-4" />
        <p className="text-[12px] ink-dim mt-3 leading-relaxed max-w-4xl">
          Cada módulo é uma chave dentro de <b className="gold">empresas.modulos_ativos</b> e passa pelo
          <b className="gold"> moduleGuard</b> que já está no ar. A clínica que não contratar simplesmente não vê a tela —
          nenhuma linha de cobrança nova precisa ser inventada.
        </p>
      </div>

      {/* OS QUATRO MÓDULOS */}
      <div className="grid grid-cols-4 gap-4 items-stretch">
        {MODULOS.map((m) => <Cartao key={m.chave} m={m} />)}
      </div>

      {/* A TESE COMERCIAL */}
      <div className="panel-3d px-6 py-5 mt-5">
        <div className="text-[10px] tracking-[0.2em] gold-dim font-bold mb-3">POR QUE ISTO SE VENDE SOZINHO</div>
        <div className="grid grid-cols-3 gap-4">
          {[
            {
              n: "01",
              t: "O paciente vê a própria biologia responder",
              d: "Quem enxerga o marcador melhorar por causa da própria constância não abandona o tratamento. A aderência sobe porque foi medida.",
            },
            {
              n: "02",
              t: "O médico tem prova, não promessa",
              d: "Na consulta de retorno o médico abre um número, não um discurso. Isso muda a conversa de preço para a conversa de resultado.",
            },
            {
              n: "03",
              t: "O dado fica mais valioso a cada mês",
              d: "Cada janela nova refina o motor. A clínica que sair perde o histórico causal — é a barreira de saída mais honesta que existe.",
            },
          ].map((x) => (
            <div key={x.n} className="concave-3d p-3.5">
              <div className="elo-serif gold-dim leading-none" style={{ fontSize: 30, fontWeight: 700 }}>{x.n}</div>
              <div className="elo-serif mt-1.5" style={{ fontSize: 16, fontWeight: 600, color: "#eef4fc" }}>{x.t}</div>
              <p className="text-[11px] ink-dim mt-1.5 leading-relaxed">{x.d}</p>
            </div>
          ))}
        </div>
      </div>

      {/* A ÚNICA PEÇA A CONSTRUIR */}
      <div className="panel-3d-hero px-6 py-4 mt-5">
        <div className="flex items-center gap-3">
          <span className="paxter-led paxter-led-amber paxter-led-on" />
          <span className="text-[10px] tracking-[0.2em] gold font-bold">A ÚNICA PEÇA QUE NÃO EXISTE HOJE</span>
        </div>
        <div className="grid grid-cols-[1.2fr_1fr] gap-5 mt-3 items-start">
          <p className="elo-serif leading-snug" style={{ fontSize: 17, color: "#eef4fc" }}>
            Duas tabelas novas. <b className="gold">formula_vigencia</b>, que guarda o que estava prescrito em cada data —
            hoje o passado se perde porque <span className="tabnum">lembretes_prescricao.periodos</span> é sobrescrito.
            E <b className="gold">aderencia_reporte</b>, que grava o que o paciente respondeu, dose a dose.
            Só isso. Todo o resto do ELO se sustenta em motor que já roda.
          </p>
          <div className="concave-3d p-3">
            <div className="text-[9px] tracking-[0.14em] ink-faint font-semibold mb-2">REGRA DE OURO OBEDECIDA</div>
            {[
              "Somente CREATE TABLE e ADD COLUMN",
              "Nenhum DROP, nenhum TRUNCATE",
              "Índice parcial WHERE fim_em IS NULL",
              "Toda data vem de lib/brt.ts",
            ].map((r) => (
              <div key={r} className="flex gap-2 items-start mt-1">
                <span className="paxter-led paxter-led-green mt-0.5 shrink-0" />
                <span className="text-[10px] ink-dim leading-snug">{r}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
