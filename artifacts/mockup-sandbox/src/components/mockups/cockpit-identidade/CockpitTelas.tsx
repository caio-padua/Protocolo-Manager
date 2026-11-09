import { type KeyboardEvent as ReactKeyboardEvent, useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowDownToLine,
  ArrowUpToLine,
  ArrowUpRight,
  Camera,
  CalendarDays,
  FolderOpen,
  PencilLine,
  ChevronDown,
  ClipboardList,
  Dumbbell,
  Gauge,
  HeartPulse,
  Image as ImageIcon,
  Info,
  MessageCircle,
  MessageSquare,
  Moon,
  Ruler,
  Rows3,
  ShieldCheck,
  Stethoscope,
  Sun,
  UserRound,
} from "lucide-react";
import "./_group.css";
import "./CockpitTelas.css";
import { ABAS, type AbaId } from "./_source/CockpitTabs";
import { PaxterClientSelector } from "./_source/PaxterClientSelector";
import { clientesDeExemplo } from "./_source/preview-deps";
import { CockpitProposalRail } from "./CockpitProposalRail";
import { NomeClienteResponsivo } from "./_NomeClienteResponsivo";
import { PainelFicha } from "./CockpitIhe";

type Modo = "abas" | "telas" | "ficha";
type CockpitTheme = "dark" | "light";
type VisaoCliente = "resumo" | "mensagens" | "imagens" | "bioimpedancia" | "antropometria" | "dinamometria" | "calorimetria" | "ultrassom" | "outras-avaliacoes";
type AnguloFoto = "frente" | "direito" | "esquerdo" | "costas";

const ENDERECOS_DE_DEMONSTRACAO: Record<number, string> = {
  1001: "Rua Exemplo, 100 · Centro · Cidade Exemplo",
  1002: "Avenida Modelo, 250 · Jardim Modelo · Cidade Exemplo",
};

const COCKPIT_THEME_STORAGE_KEY = "paxter.cockpit.theme";

function lerTemaCockpit(): CockpitTheme {
  if (typeof window === "undefined") return "dark";
  try {
    return window.localStorage.getItem(COCKPIT_THEME_STORAGE_KEY) === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

const VISOES_CLIENTE: Array<{ id: VisaoCliente; titulo: string; descricao: string; Icon: typeof Activity }> = [
  { id: "resumo", titulo: "RESUMO", descricao: "dados principais", Icon: Activity },
  { id: "mensagens", titulo: "MENSAGENS", descricao: "canal do cliente", Icon: MessageCircle },
  { id: "imagens", titulo: "IMAGENS", descricao: "linha do tempo", Icon: ImageIcon },
];

const MEDIDAS_PRINCIPAIS: Array<{ id: VisaoCliente; titulo: string; descricao: string; Icon: typeof Activity }> = [
  { id: "bioimpedancia", titulo: "BIOIMPEDÂNCIA", descricao: "estimativas do aparelho", Icon: Activity },
  { id: "antropometria", titulo: "ANTROPOMETRIA", descricao: "peso, altura e medidas", Icon: Ruler },
  { id: "dinamometria", titulo: "DINAMOMETRIA", descricao: "força conforme protocolo", Icon: Dumbbell },
];

const AVALIACOES_COMPLEMENTARES_DIRETAS: Array<{ id: VisaoCliente; titulo: string; descricao: string; Icon: typeof Activity }> = [
  { id: "calorimetria", titulo: "CALORIMETRIA INDIRETA", descricao: "gasto energético medido", Icon: Gauge },
  { id: "ultrassom", titulo: "ULTRASSOM CORPORAL", descricao: "espessura por local", Icon: Activity },
  { id: "outras-avaliacoes", titulo: "OUTRAS AVALIAÇÕES", descricao: "métodos complementares", Icon: ChevronDown },
];

const AVALIACOES_COMPLEMENTARES = [
  {
    grupo: "COMPOSIÇÃO CORPORAL",
    itens: [
      { id: "dobras", titulo: "Dobras cutâneas", resumo: "Espessura de dobras subcutâneas por local, lado, protocolo e adipômetro; percentual de gordura é uma estimativa derivada, não uma leitura direta." },
      { id: "scanner3d", titulo: "Escaneamento corporal 3D", resumo: "Forma corporal e circunferências estimadas pelo sistema; registrar equipamento, protocolo e relatório de origem." },
      { id: "dexa", titulo: "Densitometria corporal (DEXA)", resumo: "Exame de imagem realizado em serviço habilitado; importar os valores e o laudo exatamente como emitidos pelo serviço." },
      { id: "pletismografia", titulo: "Pletismografia / pesagem hidrostática", resumo: "Métodos externos que estimam volume ou densidade corporal; resultados dependem do equipamento e do protocolo." },
    ],
  },
  {
    grupo: "FORÇA E MOBILIDADE",
    itens: [
      { id: "forca-maxima", titulo: "Força máxima e resistência", resumo: "Teste específico, exercício, carga, repetições ou tempo, protocolo e profissional responsável; não equivale à dinamometria de preensão." },
      { id: "flexibilidade", titulo: "Flexibilidade e mobilidade", resumo: "Resultado por teste e articulação, unidade, lado, protocolo e profissional; métodos distintos não devem ser comparados como se fossem iguais." },
    ],
  },
  {
    grupo: "POSTURA",
    itens: [
      { id: "postura", titulo: "Avaliação postural", resumo: "Registro descritivo do método, posições, observações e profissional. A prévia não interpreta nem produz diagnóstico postural." },
    ],
  },
] as const;

const ANGULOS_FOTO: Array<{ id: AnguloFoto; titulo: string }> = [
  { id: "frente", titulo: "Frente" },
  { id: "direito", titulo: "Lado direito" },
  { id: "esquerdo", titulo: "Lado esquerdo" },
  { id: "costas", titulo: "Costas" },
];

const descricoes: Record<AbaId, string> = {
  prescricao: "Área de prescrição do cliente selecionado.",
  injetaveis: "Área de protocolos injetáveis e aplicações.",
  implantes: "Área de acompanhamento de implantes.",
  exames: "Área de pedidos e exames do cliente.",
  evolucao: "Área de registros de evolução clínica.",
  anamnese: "Área de anamnese associada ao cadastro.",
  documentos: "Área de documentos relacionados ao cliente.",
  protocolos: "Área dos protocolos do cliente.",
  "dieta-treino": "Área de dieta e treino do cliente.",
  financeiro: "Área financeira vinculada ao cadastro.",
  cadastro: "Dados cadastrais do cliente.",
  telegram: "Área de comunicação do Cockpit.",
};

type DataCivil = { ano: number; mes: number; dia: number };

function ordinalCivil(data: DataCivil) {
  const utc = new Date(0);
  utc.setUTCHours(0, 0, 0, 0);
  utc.setUTCFullYear(data.ano, data.mes - 1, data.dia);
  return utc.getTime();
}

function compararDataCivil(a: DataCivil, b: DataCivil) {
  return ordinalCivil(a) - ordinalCivil(b);
}

function diasNoMes(ano: number, mes: number) {
  const ultimoDia = new Date(0);
  ultimoDia.setUTCHours(0, 0, 0, 0);
  ultimoDia.setUTCFullYear(ano, mes, 0);
  return ultimoDia.getUTCDate();
}

function somarMeses(data: DataCivil, quantidade: number): DataCivil {
  const total = data.ano * 12 + data.mes - 1 + quantidade;
  const ano = Math.floor(total / 12);
  const mes = ((total % 12) + 12) % 12 + 1;
  return { ano, mes, dia: Math.min(data.dia, diasNoMes(ano, mes)) };
}

function dataHojeSaoPaulo(instante: Date): DataCivil {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instante);
  const parte = (tipo: Intl.DateTimeFormatPartTypes) =>
    Number(partes.find((item) => item.type === tipo)?.value);
  return { ano: parte("year"), mes: parte("month"), dia: parte("day") };
}

function idadeCompleta(data: string | null | undefined, instanteAtual = new Date()) {
  if (!data || !/^\d{4}-\d{2}-\d{2}$/.test(data)) return null;
  const [ano, mes, dia] = data.split("-").map(Number);
  const nascimento = { ano, mes, dia };
  if (ano < 1 || mes < 1 || mes > 12 || dia < 1 || dia > diasNoMes(ano, mes)) return null;

  const hoje = dataHojeSaoPaulo(instanteAtual);
  if (compararDataCivil(nascimento, hoje) > 0) return null;

  let anos = hoje.ano - nascimento.ano;
  let aniversario = somarMeses(nascimento, anos * 12);
  if (compararDataCivil(aniversario, hoje) > 0) {
    anos -= 1;
    aniversario = somarMeses(nascimento, anos * 12);
  }

  let meses = (hoje.ano - aniversario.ano) * 12 + hoje.mes - aniversario.mes;
  let marcoMensal = somarMeses(aniversario, meses);
  if (compararDataCivil(marcoMensal, hoje) > 0) {
    meses -= 1;
    marcoMensal = somarMeses(aniversario, meses);
  }

  const dias = Math.round((ordinalCivil(hoje) - ordinalCivil(marcoMensal)) / 86_400_000);
  return anos < 0 || meses < 0 || dias < 0
    ? null
    : `${anos} ${anos === 1 ? "ano" : "anos"} ${meses} ${meses === 1 ? "mês" : "meses"} ${dias} ${dias === 1 ? "dia" : "dias"}`;
}

function formatarCpf(cpf: string | null | undefined) {
  if (!cpf) return "—";
  const digits = cpf.replace(/\D/g, "");
  return digits.length === 11
    ? digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4")
    : cpf;
}

function formatarNascimento(data: string | null | undefined) {
  if (!data) return "—";
  const [ano, mes, dia] = data.split("-");
  return `${dia}/${mes}/${ano}`;
}

type MeasurementPanelProps = {
  title: string;
  eyebrow: string;
  explanation: string;
  fields: Array<[string, string, string]>;
  caution: string;
};

function MeasurementPanel({ title, eyebrow, explanation, fields, caution }: MeasurementPanelProps) {
  return (
    <section className="ct-measurement-panel" aria-label={title}>
      <div className="ct-measurement-panel-head">
        <div><span>{eyebrow}</span><h3>{title}</h3></div>
        <span className="ct-measurement-status"><i aria-hidden="true" />SEM DADOS CONSULTADOS</span>
      </div>
      <p className="ct-measurement-explanation">{explanation}</p>
      <div className="ct-measurement-fields">
        {fields.map(([label, value, unit]) => (
          <div className="ct-measurement-field" key={label}>
            <span>{label}</span>
            <strong>{value}<small>{unit}</small></strong>
          </div>
        ))}
      </div>
      <p className="ct-measurement-note"><Info size={13} aria-hidden="true" />{caution}</p>
      <div className="ct-measurement-footer">
        <span>Cadastro, consulta de histórico e gravação não conectados nesta prévia.</span>
        <button type="button" disabled aria-disabled="true">REGISTRO INDISPONÍVEL</button>
      </div>
    </section>
  );
}

export function CockpitTelas() {
  const [tema, setTema] = useState<CockpitTheme>(() => lerTemaCockpit());
  const [clientId, setClientId] = useState<number | null>(1001);
  const [aba, setAba] = useState<AbaId>("prescricao");
  const [modo, setModo] = useState<Modo>("telas");
  const [paineisAbertos, setPaineisAbertos] = useState<Set<AbaId>>(
    () => new Set(ABAS.map((item) => item.id)),
  );
  const [aviso, setAviso] = useState("");
  const [visaoCliente, setVisaoCliente] = useState<VisaoCliente | null>(null);
  const [avaliacoesAbertas, setAvaliacoesAbertas] = useState(false);
  const [avaliacaoComplementar, setAvaliacaoComplementar] = useState<string | null>(null);
  const [anguloFoto, setAnguloFoto] = useState<AnguloFoto>("frente");
  const [retornoFotos, setRetornoFotos] = useState("");
  const [retornoImagem, setRetornoImagem] = useState("");

  useEffect(() => {
    // O trilho compartilhado centraliza a ferramenta ativa ao montar; em telas
    // estreitas isso pode rolar a página e esconder a identidade do cliente.
    const frame = window.requestAnimationFrame(() => window.scrollTo(0, 0));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(COCKPIT_THEME_STORAGE_KEY, tema);
    } catch {
      // A alternância visual segue funcionando mesmo quando o navegador bloqueia o armazenamento.
    }
  }, [tema]);

  useEffect(() => {
    if (modo !== "ficha") return;
    let quadro = 0;
    const acompanharPainel = () => {
      if (quadro) return;
      quadro = window.requestAnimationFrame(() => {
        quadro = 0;
        let maisVisivel: { id: AbaId; altura: number } | null = null;
        for (const ferramenta of ABAS) {
          const elemento = document.getElementById(`ct3-panel-${ferramenta.id}`);
          if (!elemento) continue;
          const limites = elemento.getBoundingClientRect();
          const altura = Math.max(0, Math.min(limites.bottom, window.innerHeight) - Math.max(limites.top, 0));
          if (altura > (maisVisivel?.altura ?? 0)) maisVisivel = { id: ferramenta.id, altura };
        }
        if (maisVisivel) setAba(maisVisivel.id);
      });
    };
    window.addEventListener("scroll", acompanharPainel, { passive: true });
    window.addEventListener("resize", acompanharPainel);
    acompanharPainel();
    return () => {
      window.removeEventListener("scroll", acompanharPainel);
      window.removeEventListener("resize", acompanharPainel);
      if (quadro) window.cancelAnimationFrame(quadro);
    };
  }, [modo, paineisAbertos]);

  const cliente = clientesDeExemplo.find((item) => item.id === clientId) ?? null;
  const opcoes = useMemo(
    () => clientesDeExemplo.map(({ id, name, cpf, phone, photoUrl }) => ({ id, name, cpf, phone, photoUrl })),
    [],
  );
  const ferramentaAtual = ABAS.find((item) => item.id === aba) ?? ABAS[0];
  const indiceAtivo = ABAS.findIndex((item) => item.id === aba);
  const iniciais = (() => {
    if (!cliente) return "";
    const nomes = cliente.name.trim().split(/\s+/).filter(Boolean);
    return `${nomes[0]?.[0] ?? ""}${nomes.at(-1)?.[0] ?? ""}`.toUpperCase();
  })();

  const focarFerramenta = (id: AbaId) => {
    setAba(id);
    setModo("abas");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const selecionarFerramenta = (id: AbaId) => {
    setAba(id);
    if (modo === "ficha") {
      setPaineisAbertos((atuais) => new Set(atuais).add(id));
    }
    const destino = modo === "telas" ? `ct-tool-card-${id}` : modo === "ficha" ? `ct3-panel-${id}` : null;
    if (destino) {
      window.requestAnimationFrame(() => document.getElementById(destino)?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      }));
    }
  };

  const navegarVisaoCliente = (event: ReactKeyboardEvent<HTMLButtonElement>, indiceAtual: number) => {
    let proximoIndice = indiceAtual;
    if (event.key === "ArrowRight") proximoIndice = (indiceAtual + 1) % VISOES_CLIENTE.length;
    else if (event.key === "ArrowLeft") proximoIndice = (indiceAtual - 1 + VISOES_CLIENTE.length) % VISOES_CLIENTE.length;
    else if (event.key === "Home") proximoIndice = 0;
    else if (event.key === "End") proximoIndice = VISOES_CLIENTE.length - 1;
    else return;
    event.preventDefault();
    const proximaVisao = VISOES_CLIENTE[proximoIndice].id;
    setVisaoCliente(proximaVisao);
    window.requestAnimationFrame(() => document.getElementById(`ct-client-tab-${proximaVisao}`)?.focus());
  };

  const solicitarFotosPeloPortal = () => {
    setRetornoFotos("Prévia: nenhuma solicitação foi enviada. Esta ação ainda não está conectada ao Portal do Cliente.");
  };

  const adicionarImagemNaPrevia = () => {
    setRetornoImagem("Prévia: nenhuma imagem foi adicionada ou enviada. O upload real não foi executado.");
  };

  const handlePreviewAction = (action: "edit" | "drive" | "appointment") => {
    setAviso(action === "edit"
      ? "Prévia: a edição do cadastro não foi aberta nem alterada. Nenhuma ação foi executada."
      : action === "drive"
        ? "Prévia: nenhuma pasta ou planilha foi criada, compartilhada ou acessada no Drive."
        : "Prévia: a tela de marcação não foi aberta e nenhum agendamento foi criado.");
  };

  const contextoDoCliente = (
    <section className="ct-client-board" aria-label={`Resumo e contexto de ${cliente?.name ?? "cliente"}`}>
      <div className="ct-client-board-top">
        <div className="ct-client-tabs" role="group" aria-label="Abrir ou recolher informações do cliente">
          {VISOES_CLIENTE.map((visao, index) => {
            const selecionada = visaoCliente === visao.id;
            return (
              <button
                key={visao.id}
                id={`ct-client-tab-${visao.id}`}
                type="button"
                aria-expanded={selecionada}
                aria-controls="ct-client-board-panel"
                className={`ct-client-tab${selecionada ? " is-active" : ""}`}
                onClick={() => setVisaoCliente((atual) => atual === visao.id ? null : visao.id)}
                onKeyDown={(event) => navegarVisaoCliente(event, index)}
              >
                <visao.Icon size={15} aria-hidden="true" />
                <span>
                  <strong>{visao.titulo}</strong>
                  <small>{visao.descricao}</small>
                </span>
                <span className="ct-accordion-indicator" aria-hidden="true">{selecionada ? "−" : "+"}</span>
              </button>
            );
          })}
        </div>
        <div className="ct-measurement-tabs" role="group" aria-label="Avaliações e medidas corporais">
          {MEDIDAS_PRINCIPAIS.map((medida) => {
            const selecionada = visaoCliente === medida.id;
            return (
              <button
                key={medida.id}
                id={`ct-client-tab-${medida.id}`}
                type="button"
                aria-expanded={selecionada}
                aria-controls="ct-client-board-panel"
                className={`ct-client-tab ct-measurement-tab${selecionada ? " is-active" : ""}`}
                onClick={() => {
                  setVisaoCliente((atual) => atual === medida.id ? null : medida.id);
                  setAvaliacaoComplementar(null);
                }}
              >
                <medida.Icon size={15} aria-hidden="true" />
                <span>
                  <strong>{medida.titulo}</strong>
                  <small>{medida.descricao}</small>
                </span>
                <span className="ct-accordion-indicator" aria-hidden="true">{selecionada ? "−" : "+"}</span>
              </button>
            );
          })}
        </div>
        <div className="ct-measurement-tabs" role="group" aria-label="Calorimetria, ultrassom e outras avaliações">
          {AVALIACOES_COMPLEMENTARES_DIRETAS.map((avaliacao) => {
            const isOther = avaliacao.id === "outras-avaliacoes";
            const ativa = isOther ? avaliacoesAbertas : visaoCliente === avaliacao.id;
            return (
              <button
                key={avaliacao.id}
                id={isOther ? "ct-extra-assessments-trigger" : `ct-client-tab-${avaliacao.id}`}
                type="button"
                className={`ct-client-tab ct-measurement-tab${ativa ? " is-active" : ""}`}
                aria-expanded={isOther ? avaliacoesAbertas : ativa}
                aria-controls={isOther ? "ct-extra-assessments-menu" : "ct-client-board-panel"}
                onClick={() => {
                  if (isOther) setAvaliacoesAbertas((atual) => !atual);
                  else {
                    setVisaoCliente((atual) => atual === avaliacao.id ? null : avaliacao.id);
                    setAvaliacoesAbertas(false);
                    setAvaliacaoComplementar(null);
                  }
                }}
              >
                <avaliacao.Icon size={15} aria-hidden="true" />
                <span><strong>{avaliacao.titulo}</strong><small>{avaliacao.descricao}</small></span>
                <span className="ct-accordion-indicator" aria-hidden="true">{ativa ? "−" : "+"}</span>
              </button>
            );
          })}
        </div>
        <div
          className="ct-extra-assessments-menu"
          id="ct-extra-assessments-menu"
          role="region"
          aria-label="Seleção de avaliações complementares"
          hidden={!avaliacoesAbertas}
        >
          {AVALIACOES_COMPLEMENTARES.map((grupo) => (
            <section className="ct-extra-assessment-group" key={grupo.grupo} aria-label={grupo.grupo}>
              <h3>{grupo.grupo}</h3>
              <div className="ct-extra-assessment-options">
                {grupo.itens.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`ct-extra-assessment-option${avaliacaoComplementar === item.id ? " is-active" : ""}`}
                    aria-pressed={avaliacaoComplementar === item.id}
                    onClick={() => {
                      setAvaliacaoComplementar(item.id);
                      setVisaoCliente("outras-avaliacoes");
                    }}
                  >
                    {item.titulo}
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>

      <div
        className="ct-client-board-main"
        id="ct-client-board-panel"
        role="region"
        aria-labelledby={visaoCliente === "outras-avaliacoes"
          ? "ct-extra-assessments-trigger"
          : visaoCliente ? `ct-client-tab-${visaoCliente}` : undefined}
        hidden={!visaoCliente}
        tabIndex={-1}
      >
        {!cliente && (
          <div className="ct-board-empty" role="status">
            <UserRound size={20} aria-hidden="true" />
            <div><strong>Selecione um cliente para consultar este contexto.</strong><p>Nenhum dado do cliente anterior permanece visível.</p></div>
          </div>
        )}

        {visaoCliente === "resumo" && cliente && (
          <>
            <div className="ct-glance-grid" aria-label="Campos do resumo clínico">
              <article className="ct-glance-card">
                <div className="ct-glance-heading"><Stethoscope size={13} />COMORBIDADES</div>
                <strong className="ct-glance-value">Não consultado</strong>
              </article>
              <article className="ct-glance-card">
                <div className="ct-glance-heading"><ClipboardList size={13} />DIAGNÓSTICOS CONFIRMADOS</div>
                <strong className="ct-glance-value">Não consultado</strong>
              </article>
              <article className="ct-glance-card">
                <div className="ct-glance-heading"><ClipboardList size={13} />MENÇÕES EM ANAMNESE</div>
                <strong className="ct-glance-value">Não consultado</strong>
              </article>
              <article className="ct-glance-card">
                <div className="ct-glance-heading"><ClipboardList size={13} />PROTOCOLO ATIVO</div>
                <strong className="ct-glance-value">Não consultado</strong>
              </article>
              <article className="ct-glance-card ct-vitals-card">
                <div className="ct-glance-heading"><HeartPulse size={13} />SINAIS VITAIS</div>
                <div className="ct-vitals-pair">
                  <div className="ct-vital-reading">
                    <span><Gauge size={12} aria-hidden="true" />MÉDIA DA PRESSÃO</span>
                    <strong>Não consultado</strong>
                    <small>Fórmula e período não consultados.</small>
                  </div>
                  <div className="ct-vital-reading ct-vital-reading--heart">
                    <span><HeartPulse size={12} aria-hidden="true" />FREQUÊNCIA CARDÍACA</span>
                    <strong>Não consultado</strong>
                    <small>Leituras e período não consultados.</small>
                  </div>
                </div>
              </article>
              <article className="ct-glance-card">
                <div className="ct-glance-heading"><ShieldCheck size={13} />ADERÊNCIA POR FÓRMULA</div>
                <strong className="ct-glance-value">Não consultado</strong>
                <small>Sem classificação nesta prévia.</small>
              </article>
            </div>
            <p className="ct-glance-source">
              <ShieldCheck size={13} aria-hidden="true" />
              <span>Os dados clínicos não foram carregados. “Não consultado” não significa ausência no prontuário; menções em anamnese não são diagnósticos confirmados.</span>
            </p>
            <section className="ct-body-history" aria-labelledby="ct-body-history-title">
              <div className="ct-body-history-head">
                <div>
                  <span>ACOMPANHAMENTO CORPORAL</span>
                  <h3 id="ct-body-history-title">Altura e evolução do peso</h3>
                </div>
                <span className="ct-measurement-status"><i aria-hidden="true" />HISTÓRICO NÃO CONSULTADO</span>
              </div>
              <div className="ct-body-history-grid">
                <article className="ct-body-metric">
                  <span>ALTURA</span>
                  <strong>— <small>cm</small></strong>
                  <small>Sem registro consultado</small>
                </article>
                <div className="ct-weight-history" role="img" aria-label="Evolução do peso indisponível: nenhum dado foi consultado">
                  <div className="ct-weight-history-head"><span>EVOLUÇÃO DO PESO</span><strong>kg · por data</strong></div>
                  <div className="ct-weight-empty">
                    <Activity size={17} aria-hidden="true" />
                    <span>Sem medições datadas consultadas</span>
                  </div>
                </div>
              </div>
              <p className="ct-measurement-note"><Info size={13} aria-hidden="true" />A altura e cada peso devem vir de registros reais; a prévia não cria pontos nem datas. O índice de massa corporal só pode ser calculado quando houver medições válidas e datadas.</p>
            </section>
          </>
        )}

        {visaoCliente === "mensagens" && cliente && (
          <>
            <div className="ct-messages-toolbar">
              <div className="ct-messages-title">
                <span>HISTÓRICO POR CLIENTE</span>
                <h3>Mensagens recebidas e enviadas</h3>
              </div>
              <span className="ct-channel-chip"><MessageCircle size={13} />TELEGRAM · NÃO CONSULTADO</span>
            </div>
            <div className="ct-message-preview-grid">
              <div className="ct-message-preview">
                <MessageSquare size={16} aria-hidden="true" />
                <div><strong>Recebidas</strong><span>Histórico não carregado nesta prévia</span></div>
              </div>
              <div className="ct-message-preview">
                <ArrowUpRight size={16} aria-hidden="true" />
                <div><strong>Enviadas</strong><span>Histórico não carregado nesta prévia</span></div>
              </div>
            </div>
            <p className="ct-glance-source">
              <ShieldCheck size={13} aria-hidden="true" />
              <span>Visualização demonstrativa. Não abrimos o Telegram nem alteramos o estado de leitura das mensagens.</span>
            </p>
          </>
        )}

        {visaoCliente === "imagens" && cliente && (
          <div className="ct-images-layout">
            <nav className="ct-angle-list" aria-label="Ângulo da fotografia">
              <span className="ct-angle-list-label">ÂNGULOS · REGISTROS POR DATA</span>
              {ANGULOS_FOTO.map((angulo) => (
                <button
                  key={angulo.id}
                  type="button"
                  className={`ct-patient-angle${anguloFoto === angulo.id ? " is-active" : ""}`}
                  aria-pressed={anguloFoto === angulo.id}
                  onClick={() => setAnguloFoto(angulo.id)}
                >
                  <Camera size={14} aria-hidden="true" />
                  {angulo.titulo}
                </button>
              ))}
            </nav>

            <div className="ct-image-stage">
              <div className="ct-image-stage-head">
                <div>
                  <span>ACOMPANHAMENTO VISUAL · {ANGULOS_FOTO.find((angulo) => angulo.id === anguloFoto)?.titulo.toUpperCase()}</span>
                  <h3>Organização cronológica</h3>
                </div>
              </div>
              <div className="ct-date-controls" role="group" aria-label="Seleção de intervalo de datas, não consultada" aria-disabled="true">
                <label className="ct-date-field">
                  <span>DATA INICIAL</span>
                  <input type="date" value="" disabled aria-label="Data inicial desabilitada, origem não consultada" />
                </label>
                <label className="ct-date-field">
                  <span>DATA FINAL</span>
                  <input type="date" value="" disabled aria-label="Data final desabilitada, origem não consultada" />
                </label>
                <span className="ct-date-status"><CalendarDays size={13} aria-hidden="true" />Período indisponível</span>
              </div>
              <div className="ct-image-comparison" aria-label={`Registros datados: ${ANGULOS_FOTO.find((angulo) => angulo.id === anguloFoto)?.titulo}`}>
                <div className="ct-image-slot">
                  <ImageIcon aria-hidden="true" />
                  <strong>IMAGEM · DATA INICIAL · {ANGULOS_FOTO.find((angulo) => angulo.id === anguloFoto)?.titulo.toUpperCase()}</strong>
                  <span>Nenhuma imagem consultada</span>
                </div>
                <div className="ct-image-slot">
                  <ImageIcon aria-hidden="true" />
                  <strong>IMAGEM · DATA FINAL · {ANGULOS_FOTO.find((angulo) => angulo.id === anguloFoto)?.titulo.toUpperCase()}</strong>
                  <span>Nenhuma imagem consultada</span>
                </div>
              </div>
              <div className="ct-image-history" role="region" aria-label="Histórico de imagens por data, não consultado" aria-disabled="true">
                <div className="ct-image-history-heading">
                  <span><CalendarDays size={14} aria-hidden="true" />HISTÓRICO DE IMAGENS</span>
                  <strong>Não consultado</strong>
                </div>
                <p>Datas e registros não foram carregados nesta prévia. O histórico permanece indisponível até existir uma fonte de imagens consultável.</p>
              </div>
              <label className="ct-image-compare-control">
                <span>INICIAL</span>
                <input type="range" min="0" max="100" value="50" disabled aria-label="Comparação desativada até haver imagens reais nas duas datas" />
                <span>MAIS RECENTE</span>
              </label>
              <p className="ct-image-note"><ShieldCheck size={13} aria-hidden="true" />Sem fotos carregadas ou exibidas nesta prévia.</p>
              <div className="ct-image-actions">
                <div className="ct-image-action">
                  <button type="button" className="ct-photo-add" onClick={adicionarImagemNaPrevia}>
                    ADICIONAR IMAGEM <ImageIcon size={14} aria-hidden="true" />
                  </button>
                  <small>Nenhum arquivo será enviado nesta prévia.</small>
                </div>
                <div className="ct-image-action">
                  <button type="button" className="ct-photo-request" onClick={solicitarFotosPeloPortal}>
                    SOLICITAR PELO PORTAL <ArrowUpRight size={14} aria-hidden="true" />
                  </button>
                  <small>Nenhum pedido será enviado nesta prévia.</small>
                </div>
              </div>
              {(retornoImagem || retornoFotos) && (
                <p className="ct-photo-feedback" role="status">{[retornoImagem, retornoFotos].filter(Boolean).join(" ")}</p>
              )}
            </div>
          </div>
        )}

        {visaoCliente === "calorimetria" && cliente && (
          <MeasurementPanel
            title="Calorimetria indireta"
            eyebrow="GASTO ENERGÉTICO · DADOS DO EQUIPAMENTO"
            explanation="Registrar as medições e os resultados como apresentados pelo aparelho ou laudo; esta tela não classifica o metabolismo."
            fields={[
              ["Consumo de oxigênio (VO₂)", "—", "unidade do equipamento"],
              ["Produção de dióxido de carbono (VCO₂)", "—", "unidade do equipamento"],
              ["Gasto energético em repouso", "—", "kcal/dia · conforme laudo"],
              ["Quociente respiratório", "—", "se reportado"],
              ["Substratos / oxidação estimada", "—", "se reportado"],
              ["Duração e estabilidade do teste", "—", "conforme equipamento"],
              ["Equipamento, máscara ou bocal", "—", "modelo · identificação"],
              ["Data, horário e condições", "—", "registro da avaliação"],
              ["Protocolo e profissional", "—", "origem do exame"],
            ]}
            caution="Medições, cálculos e interpretações do equipamento são categorias distintas. Esta prévia não calcula gasto energético nem fornece classificação clínica."
          />
        )}

        {visaoCliente === "ultrassom" && cliente && (
          <MeasurementPanel
            title="Ultrassom corporal"
            eyebrow="MEDIDAS POR PONTO ANATÔMICO"
            explanation="Registrar a espessura informada pelo equipamento em cada ponto avaliado; não generalizar uma região para o corpo inteiro."
            fields={[
              ["Região / ponto anatômico", "—", "local do exame"],
              ["Tecido avaliado", "—", "adiposo · muscular · conforme laudo"],
              ["Espessura reportada", "—", "mm · valor do equipamento"],
              ["Lado / posição", "—", "quando aplicável"],
              ["Imagem ou relatório", "—", "origem do dado"],
              ["Equipamento e transdutor", "—", "modelo · identificação"],
              ["Protocolo / configuração", "—", "origem do exame"],
              ["Data, horário e profissional", "—", "registro da avaliação"],
            ]}
            caution="O resultado é específico do local, equipamento e protocolo. Nenhum valor, percentual corporal ou diagnóstico foi criado nesta prévia."
          />
        )}

        {visaoCliente === "bioimpedancia" && cliente && (
          <MeasurementPanel
            title="Bioimpedância"
            eyebrow="COMPOSIÇÃO CORPORAL · ESTIMATIVAS DO EQUIPAMENTO"
            explanation="A análise de impedância mede a resposta elétrica do corpo; percentuais e massas são estimativas calculadas pelo equipamento e sua equação, não medições diretas de gordura ou músculo."
            fields={[
              ["Gordura corporal", "—", "%"],
              ["Massa de gordura", "—", "kg"],
              ["Massa livre de gordura", "—", "kg"],
              ["Massa muscular esquelética", "—", "kg · se fornecida"],
              ["Água corporal total", "—", "L ou % · conforme aparelho"],
              ["Água extra/intracelular", "—", "se reportada pelo aparelho"],
              ["Análise segmentar", "—", "somente se disponível"],
              ["Ângulo de fase / índice", "—", "se reportado pelo aparelho"],
              ["Impedância / frequência", "—", "dados do equipamento"],
              ["Equipamento e protocolo", "—", "modelo · modo · origem"],
            ]}
            caution="Hidratação, horário, alimentação e exercício recente podem alterar a comparação. Registrar o aparelho, o protocolo e as condições de cada avaliação; não misturar resultados de métodos diferentes."
          />
        )}

        {visaoCliente === "antropometria" && cliente && (
          <MeasurementPanel
            title="Antropometria"
            eyebrow="MEDIDAS DIRETAS E ÍNDICES DERIVADOS"
            explanation="Cada medida precisa de data, unidade, local anatômico e método. Índices calculados dependem das medidas de origem e não constituem diagnóstico isolado."
            fields={[
              ["Peso", "—", "kg"],
              ["Altura", "—", "cm"],
              ["Circunferência da cintura", "—", "cm"],
              ["Circunferência do quadril", "—", "cm"],
              ["Tórax · braço · coxa · panturrilha", "—", "cm · local e lado"],
              ["Dobras cutâneas", "—", "mm · pontos do protocolo"],
              ["Índice de massa corporal", "—", "derivado · se dados válidos"],
              ["Relação cintura / estatura", "—", "derivada · se aplicável"],
              ["Relação cintura / quadril", "—", "derivada · se aplicável"],
            ]}
            caution="Circunferências e dobras são medidas do local escolhido; índices e composição estimada devem guardar o método, a data e as medidas originais utilizadas."
          />
        )}

        {visaoCliente === "dinamometria" && cliente && (
          <MeasurementPanel
            title="Dinamometria"
            eyebrow="FORÇA · RESULTADO ASSOCIADO AO TESTE"
            explanation="A dinamometria registra força no teste e equipamento escolhidos. Preensão manual não equivale à força de todos os grupos musculares nem à massa muscular."
            fields={[
              ["Teste / grupo muscular", "—", "protocolo identificado"],
              ["Mão ou lado avaliado", "—", "direito · esquerdo · aplicável"],
              ["Lado dominante", "—", "se coletado"],
              ["Tentativas por lado", "—", "conforme protocolo"],
              ["Valores de cada tentativa", "—", "resultados originais"],
              ["Resultado reportado", "—", "kgf · unidade do aparelho"],
              ["Equipamento / número de série", "—", "modelo · identificação"],
              ["Calibração / verificação", "—", "estado e data"],
              ["Protocolo / posição", "—", "método · posição do teste"],
              ["Data e horário", "—", "da avaliação"],
              ["Profissional responsável", "—", "origem do registro"],
            ]}
            caution="A comparabilidade exige o mesmo equipamento, posição, protocolo e regra de cálculo. Esta prévia não calcula médias, valores de referência ou diagnóstico."
          />
        )}

        {visaoCliente === "outras-avaliacoes" && cliente && (
          <div className="ct-complementary-panel">
            {(() => {
              const avaliacao = AVALIACOES_COMPLEMENTARES
                .flatMap((grupo) => grupo.itens.map((item) => ({ ...item, grupo: grupo.grupo })))
                .find((item) => item.id === avaliacaoComplementar);
              return avaliacao ? (
                <>
                  <div className="ct-measurement-panel-head">
                    <div><span>AVALIAÇÃO COMPLEMENTAR · {avaliacao.grupo}</span><h3>{avaliacao.titulo}</h3></div>
                    <span className="ct-measurement-status"><i aria-hidden="true" />SEM DADOS CONSULTADOS</span>
                  </div>
                  <p className="ct-complementary-description">{avaliacao.resumo}</p>
                  <div className="ct-complementary-fields">
                    <div><span>DATA DO EXAME</span><strong>—</strong></div>
                    <div><span>INSTITUIÇÃO / EQUIPAMENTO</span><strong>—</strong></div>
                    <div><span>RELATÓRIO E RESULTADOS</span><strong>Não consultados</strong></div>
                    <div><span>PROFISSIONAL / MÉTODO</span><strong>—</strong></div>
                  </div>
                  <p className="ct-measurement-note"><Info size={13} aria-hidden="true" />Somente os valores e documentos emitidos pela avaliação real devem ser vinculados. Nenhum exame, laudo ou dado foi criado nesta prévia.</p>
                </>
              ) : (
                <div className="ct-measurement-empty"><Info size={17} aria-hidden="true" /><span>Escolha uma avaliação complementar no menu acima.</span></div>
              );
            })()}
          </div>
        )}
      </div>
    </section>
  );

  return (
    <div className={`cockpit-telas ${tema === "light" ? "ct-theme-light" : "ct-theme-dark"}`} data-theme={tema}>
      <div className="ct-preview-banner">
        <span className="ct-preview-led" aria-hidden="true" />
        <strong>PRÉVIA INTERATIVA</strong>
        <span className="ct-preview-separator" aria-hidden="true" />
        <span>Dados fictícios · nenhuma conexão com o sistema</span>
      </div>

      <header className="ct-header">
        <div className="ct-brand-line">
          <div className="ct-brand-copy">
            <span className="ct-brand-product">COCKPIT DA CONSULTA</span>
          </div>
          <div className="ct-version-tag">COCKPIT 02</div>
          <button
            type="button"
            className="ct-theme-toggle"
            onClick={() => setTema((atual) => atual === "dark" ? "light" : "dark")}
            aria-label={tema === "dark" ? "Mudar para tema claro" : "Mudar para tema escuro"}
            title={tema === "dark" ? "Tema claro" : "Tema escuro"}
            aria-pressed={tema === "light"}
          >
            {tema === "dark" ? <Sun size={15} aria-hidden="true" /> : <Moon size={15} aria-hidden="true" />}
          </button>
        </div>

        <section className="ct-identity panel-3d-sub" aria-label="Identificação e resumo clínico do cliente">
          <div className="ct-profile-content">
          <div className="ct-portrait">
              <div className="ct-avatar-frame" aria-hidden="true">
                {cliente?.photoUrl
                  ? <img src={cliente.photoUrl} alt="" className="ct-avatar-image" />
                  : <span className="ct-avatar-initials">{cliente ? iniciais : <UserRound size={25} />}</span>}
              </div>
              <div
                className="ct-client-classification"
                role="group"
                aria-label={cliente
                  ? "Campos demonstrativos e independentes: classificação fictícia E e plano ilustrativo Bronze. Não representam nota, contrato, desconto ou privilégio real."
                  : "Classificação e plano não consultados."}
              >
                <div
                  className="ct-plan-slot"
                  role="img"
                  aria-label={cliente
                    ? "Círculo PAXTER ilustrativo: Bronze; não confirma adesão real"
                    : "Plano não consultado"}
                >
                  <strong aria-hidden="true">{cliente ? "BRONZE" : "—"}</strong>
                </div>
                <div
                  className="ct-grade-slot"
                  role="img"
                  aria-label={cliente ? "Classificação demonstrativa: E" : "Classificação não consultada"}
                >
                  <strong aria-hidden="true">{cliente ? "E" : "—"}</strong>
                </div>
              </div>
            </div>

            <div className="ct-identity-name">
              <div className="ct-identity-meta">
                <span className="ct-identity-code">CÓDIGO CLIENTE: {cliente?.id ?? "—"}</span>
              </div>
              {cliente
                ? <NomeClienteResponsivo nome={cliente.name} />
                : <h1>Nenhum cliente selecionado</h1>}
              <p className="ct-age-line">
                {cliente ? idadeCompleta(cliente.birthDate) ?? "—" : "—"}
              </p>
              <div className="ct-client-details" aria-label="Dados básicos do cliente">
                <div className="ct-detail">
                  <span className="ct-detail-label">CPF</span>
                  <strong>{cliente ? formatarCpf(cliente.cpf) : "—"}</strong>
                </div>
                <div className="ct-detail">
                  <span className="ct-detail-label">Nascimento</span>
                  <strong>{cliente ? formatarNascimento(cliente.birthDate) : "—"}</strong>
                </div>
                <div className="ct-detail">
                  <span className="ct-detail-label">Whats</span>
                  <strong>{cliente?.phone ?? "—"}</strong>
                </div>
                <div className="ct-detail ct-detail--email">
                  <span className="ct-detail-label">E-MAIL</span>
                  <strong title={cliente?.email ?? "—"}>
                    {cliente?.email?.includes("@")
                      ? <>
                          {cliente.email.slice(0, cliente.email.indexOf("@") + 1)}
                          <wbr />
                          {cliente.email.slice(cliente.email.indexOf("@") + 1)}
                        </>
                      : cliente?.email ?? "—"}
                  </strong>
                </div>
                <div className="ct-detail ct-detail--address">
                  <span className="ct-detail-label">End.:</span>
                  <strong>
                    {cliente ? ENDERECOS_DE_DEMONSTRACAO[cliente.id] ?? "Endereço não informado" : "—"}
                  </strong>
                </div>
              </div>
            </div>
          </div>
          {contextoDoCliente}
        </section>

      </header>

      <section className="ct-fabric-deck" aria-label="Seleção e navegação do cliente">
        <div className="ct-controls" role="group" aria-label="Seleção e ações do cliente">
          <div className="ct-client-picker">
            <PaxterClientSelector
              clientes={opcoes}
              value={clientId}
              onChange={(id) => {
                setClientId(id);
                setAviso("");
                setRetornoFotos("");
                setRetornoImagem("");
                setAnguloFoto("frente");
                setVisaoCliente(null);
                setAvaliacoesAbertas(false);
                setAvaliacaoComplementar(null);
              }}
              placeholder="Selecionar cliente…"
              className="ct-selector"
            />
          </div>
          <div className="ct-action-group">
            <button
              type="button"
              className="identity-action ct-quick-action"
              disabled={clientId === null}
              onClick={() => handlePreviewAction("appointment")}
              aria-label="Novo agendamento: abrir a marcação do cliente"
            >
              <CalendarDays size={16} aria-hidden="true" />
              <span className="identity-action-copy">
                <strong>NOVO AGENDAMENTO</strong>
                <small>Abrir marcação</small>
              </span>
            </button>
            <button
              type="button"
              className="identity-action ct-quick-action"
              disabled={clientId === null}
              onClick={() => focarFerramenta("evolucao")}
              aria-label="Abrir a ferramenta Evolução para este cliente"
            >
              <Activity size={16} aria-hidden="true" />
              <span className="identity-action-copy">
                <strong>EVOLUÇÃO</strong>
                <small>Histórico clínico</small>
              </span>
            </button>
            <button
              type="button"
              className="identity-action ct-quick-action"
              disabled={clientId === null}
              onClick={() => handlePreviewAction("drive")}
              aria-label="Pastas do Drive: preparar a pasta do cliente"
            >
              <FolderOpen size={16} aria-hidden="true" />
              <span className="identity-action-copy">
                <strong>PASTAS DO DRIVE</strong>
                <small>Arquivos do cliente</small>
              </span>
            </button>
            <button
              type="button"
              className="identity-action ct-quick-action"
              disabled={clientId === null}
              onClick={() => handlePreviewAction("edit")}
              aria-label="Editar cadastro do cliente"
            >
              <PencilLine size={16} aria-hidden="true" />
              <span className="identity-action-copy">
                <strong>EDITAR CADASTRO</strong>
                <small>Dados do cliente</small>
              </span>
            </button>
          </div>
        </div>
        {aviso && <div className="ct-notice ct-notice-outside" role="status">{aviso}</div>}

        <CockpitProposalRail
          active={aba}
          mode={modo === "abas" ? "tabs" : "anchors"}
          onChange={selecionarFerramenta}
          className="ct-fabric-rail"
        />
      </section>

      <main className="ct-main">
        <div className="ct-workspace-bar">
          <div className="ct-workspace-copy">
            <span className="ct-eyebrow ct-workspace-eyebrow">ESPAÇO DE TRABALHO</span>
            <h2>Um cliente. Doze ferramentas.</h2>
            <p>Alternar o modo não troca nem perde o cliente selecionado.</p>
          </div>

          <div className="ct-mode-control concave-3d" role="group" aria-label="Modo de visualização do Cockpit">
            <button
              type="button"
              className={`ct-mode-button${modo === "abas" ? " is-active" : ""}`}
              aria-pressed={modo === "abas"}
              onClick={() => setModo("abas")}
            >
              <CalendarDays size={15} aria-hidden="true" />
              ABAS
            </button>
            <button
              type="button"
              className={`ct-mode-button${modo === "telas" ? " is-active" : ""}`}
              aria-pressed={modo === "telas"}
              onClick={() => setModo("telas")}
            >
              <span className="ct-mode-grid" aria-hidden="true"><i /><i /><i /><i /></span>
              TELAS · TODAS ABERTAS
            </button>
            <button
              type="button"
              className={`ct-mode-button${modo === "ficha" ? " is-active" : ""}`}
              aria-pressed={modo === "ficha"}
              onClick={() => setModo("ficha")}
            >
              <Rows3 size={15} aria-hidden="true" />
              FICHA CONTÍNUA
            </button>
          </div>
        </div>

          {modo === "abas" ? (
          <div className="ct-tab-mode">
            <div className="ct-tab-helper" aria-live="polite">
              <span>FERRAMENTA {indiceAtivo + 1} DE {ABAS.length}</span>
              <span>Use as setas laterais ou o teclado para percorrer as ferramentas.</span>
            </div>
            <section className="ct-focused-tool panel-3d-sub" aria-live="polite" role="tabpanel" id="cockpit-proposal-tool-content">
              <div className="ct-focused-heading">
                <span className="ct-tool-index">{String(indiceAtivo + 1).padStart(2, "0")} / {String(ABAS.length).padStart(2, "0")}</span>
                <div className="ct-tool-icon"><ferramentaAtual.Icon size={19} strokeWidth={1.8} /></div>
                <div className="ct-focused-title">
                  <span className="ct-eyebrow">FERRAMENTA ATIVA</span>
                  <h3>{ferramentaAtual.rotulo}</h3>
                </div>
              </div>
              <div className="ct-tool-preview">
                <p>{cliente ? descricoes[aba] : "Selecione um cliente para visualizar esta ferramenta."}</p>
                <span>Conteúdo do sistema indisponível nesta prévia de design.</span>
                {aba === "protocolos" && (
                  <div className="ct-protocol-action">
                    <button type="button" disabled aria-disabled="true">NOVO PROTOCOLO</button>
                    <small>Indisponível nesta prévia · nenhum dado será criado.</small>
                  </div>
                )}
              </div>
              <div className="ct-panel-foot">
                <span className="ct-panel-state"><span className="ct-preview-led" aria-hidden="true" />MODO POR ABAS</span>
                <span>O cliente permanece selecionado ao alternar entre ferramentas.</span>
              </div>
            </section>
          </div>
        ) : modo === "telas" ? (
          <div className="ct-open-mode">
            <div className="ct-open-mode-heading">
              <div>
                <span className="ct-eyebrow">MODO TELAS</span>
                <h3>Ferramentas abertas</h3>
              </div>
              <span className="ct-open-count screen-3d">12 ÁREAS</span>
            </div>
            <div className="ct-tool-grid">
              {ABAS.map((ferramenta, index) => (
                <section className="ct-tool-card panel-3d-sub" key={ferramenta.id} id={`ct-tool-card-${ferramenta.id}`} aria-labelledby={`ct-title-${ferramenta.id}`}>
                  <div className="ct-tool-card-head">
                    <span className="ct-tool-number">{String(index + 1).padStart(2, "0")}</span>
                    <span className="ct-tool-icon"><ferramenta.Icon size={18} strokeWidth={1.75} aria-hidden="true" /></span>
                    <h4 id={`ct-title-${ferramenta.id}`}>{ferramenta.rotulo}</h4>
                    <span className="ct-area-indicator" aria-label="Área aberta"><i /></span>
                  </div>
                  <div className="ct-tool-card-body">
                    <p>{cliente ? descricoes[ferramenta.id] : "Selecione um cliente para retomar o contexto."}</p>
                    <span>Conteúdo demonstrativo · sem operação clínica</span>
                  </div>
                  <div className="ct-tool-card-foot">
                    <span className="ct-panel-state"><span className="ct-preview-led" aria-hidden="true" />ABERTA</span>
                    {ferramenta.id === "protocolos" && (
                      <button type="button" className="ct-protocol-grid-action" disabled aria-disabled="true">NOVO PROTOCOLO · INDISPONÍVEL</button>
                    )}
                    <button type="button" onClick={() => focarFerramenta(ferramenta.id)}>
                      ABRIR EM ABAS
                      <span aria-hidden="true">→</span>
                    </button>
                  </div>
                </section>
              ))}
            </div>
          </div>
        ) : (
          <div className="ct-ficha-mode">
            <div className="ct-open-mode-heading ct-ficha-heading">
              <div>
                <span className="ct-eyebrow">MODO FICHA CONTÍNUA</span>
                <h3>Ferramentas em sequência</h3>
              </div>
              <div className="ct-ficha-controls" role="group" aria-label="Controles da ficha contínua">
                <span className="ct-open-count screen-3d">{paineisAbertos.size} / {ABAS.length} ABERTAS</span>
                <button
                  type="button"
                  className="ct-ficha-control"
                  disabled={paineisAbertos.size === ABAS.length}
                  onClick={() => setPaineisAbertos(new Set(ABAS.map((item) => item.id)))}
                >
                  <ArrowDownToLine size={14} aria-hidden="true" /> EXPANDIR TUDO
                </button>
                <button
                  type="button"
                  className="ct-ficha-control"
                  disabled={paineisAbertos.size === 0}
                  onClick={() => setPaineisAbertos(new Set())}
                >
                  <ArrowUpToLine size={14} aria-hidden="true" /> RECOLHER TUDO
                </button>
              </div>
            </div>
            <div className="cockpit-ihe ct-ficha-embedded">
              <div className="ct3-panels">
                {ABAS.map((ferramenta, index) => (
                  <PainelFicha
                    key={ferramenta.id}
                    id={ferramenta.id}
                    index={index}
                    open={paineisAbertos.has(ferramenta.id)}
                    client={cliente}
                    onToggle={(id) => setPaineisAbertos((atuais) => {
                      const proximos = new Set(atuais);
                      if (proximos.has(id)) proximos.delete(id);
                      else proximos.add(id);
                      return proximos;
                    })}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
