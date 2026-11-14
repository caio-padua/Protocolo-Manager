/**
 * Prévia fiel de uma orientação como o paciente vê no Telegram: mesmas quebras, linhas em branco e emojis.
 * O React já escapa o texto; no envio o servidor escapa <, > e & pelo mesmo motivo.
 */
export const LIMITE_RESPOSTA = 4000;

/** Espelha o catálogo do servidor (o servidor é quem valida). */
export const CATEGORIAS: Record<string, { rotulo: string; sub: Record<string, string> }> = {
  apresentacao: { rotulo: "Apresentação e acolhimento", sub: { clinica: "Apresentação da clínica", assistente: "Apresentação da assistente virtual", primeiro_contato: "Primeiro contato", retorno: "Retorno", medico_curta: "Médico — apresentação curta", medico_detalhada: "Médico — apresentação detalhada", consulta: "Consulta e primeira avaliação" } },
  agendamento: { rotulo: "Agendamento", sub: { modalidade: "Modalidade", preferencia: "Preferência", horarios: "Horários", confirmacao: "Confirmação", remarcacao: "Remarcação", retorno: "Retorno" } },
  cadastro: { rotulo: "Cadastro", sub: { dados: "Dados de cadastro", orientacoes: "Orientações de cadastro", pendente: "Cadastro pendente" } },
  documentos: { rotulo: "Exames e documentos", sub: { exames: "Exames", receitas: "Receitas e prescrições", atestados: "Atestados e declarações", envio: "Envio de documentos" } },
  orcamento: { rotulo: "Orçamento", sub: { apresentacao: "Apresentação do orçamento", pagamento: "Formas de pagamento", validade: "Validade e aceite" } },
  duvidas: { rotulo: "Dúvidas frequentes", sub: { consulta: "Sobre a consulta", aplicativo: "Sobre o aplicativo", prazos: "Prazos e retornos" } },
  prescricao: { rotulo: "Prescrição e fórmulas", sub: { acabando: "Fórmula acabando", renovacao: "Solicitação de renovação", perdida: "Receita perdida", vigente: "Prescrição vigente" } },
  emagrecimento: { rotulo: "Tratamento para emagrecimento", sub: { tratamento: "Como é o tratamento", expectativas: "Expectativas individualizadas", acompanhamento: "Acompanhamento" } },
  medicacoes: { rotulo: "Medicações — reações e sintomas", sub: { tirzepatida_geral: "Tirzepatida — dúvida geral", tirzepatida_sintomas: "Tirzepatida — sintomas", sibutramina_geral: "Sibutramina — dúvida geral", sibutramina_sintomas: "Sibutramina — sintomas", bupropiona_naltrexona_geral: "Bupropiona com naltrexona — dúvida geral", bupropiona_naltrexona_sintomas: "Bupropiona com naltrexona — sintomas" } },
  efeitos: { rotulo: "Efeitos relatados — orientação prática", sub: { sibutramina: "Sibutramina isolada", sibutramina_bupropiona: "Sibutramina + bupropiona", bupropiona_naltrexona: "Bupropiona + naltrexona", tirzepatida: "Tirzepatida" } },
  clinicas: { rotulo: "Dúvidas clínicas e medicações", sub: { acolhimento: "Acolhimento", encaminhamento: "Encaminhamento" } },
  gerais: { rotulo: "Informações gerais", sub: { valores: "Valores", locais: "Locais", atendimento: "Atendimento", exames: "Exames", aplicativo: "Aplicativo" } },
  outros: { rotulo: "Outros assuntos", sub: { a_classificar: "A classificar" } },
};

export function rotuloCategoria(cat: string | null, sub: string | null): string {
  if (!cat || !CATEGORIAS[cat]) return "Sem categoria";
  const s = sub ? CATEGORIAS[cat].sub[sub] : null;
  return s ? `${CATEGORIAS[cat].rotulo} · ${s}` : CATEGORIAS[cat].rotulo;
}

/** Variáveis previstas, com a fonte de dado real. Nenhuma está ligada ao envio ainda: texto com variável fica em rascunho. */
export const VARIAVEIS: { nome: string; fonte: string }[] = [
  { nome: "{{nome}}", fonte: "primeiro nome do cadastro do cliente" },
  { nome: "{{horarios}}", fonte: "horários livres da agenda do médico principal" },
  { nome: "{{cadastro}}", fonte: "situação real do cadastro do cliente" },
];

/** Dicas de estilo (apenas orientam; não bloqueiam salvar nem aprovar). */
export function dicasDeEstilo(texto: string): string[] {
  const d: string[] = [];
  const t = texto.replace(/\r\n?/g, "\n");
  if (!t.trim()) return d;
  const emojis = (t.match(/\p{Extended_Pictographic}/gu) ?? []).filter((e) => e !== "📅" && e !== "⏰");
  if (emojis.length > 1) d.push("Mais de um emoji. O padrão é no máximo um, discreto (calendário e relógio da lista de horários são exceção).");
  if (t.split(/\n\s*\n/).some((p) => p.length > 280)) d.push("Há parágrafo longo. Prefira frases curtas, uma ideia por parágrafo, com linha em branco entre eles.");
  if ((t.match(/\?/g) ?? []).length > 2) d.push("Muitas perguntas. Faça uma pergunta por vez.");
  if (/\b(vou encaminhar|encaminhei|foi encaminhad|enviei|foi enviad|enviarei|em até \d+|responderemos em)/i.test(t)) d.push("O texto afirma encaminhamento, envio ou prazo. Só afirme se o sistema confirmar de fato; caso contrário, reescreva sem promessa.");
  if (/<[^>]+>/.test(t)) d.push("Contém sinais < >. Eles aparecem como texto, não como formatação.");
  return d;
}

/** Marcadores não preenchidos, como [nome] ou {{horarios}}: bloqueiam a aprovação. */
export function marcadoresPendentes(t: string): string[] {
  return [...new Set([...(t.match(/\[[^\]\n]{1,60}\]/g) ?? []), ...(t.match(/\{\{[^}\n]{1,60}\}\}/g) ?? [])])];
}

/** Exemplo genérico e editável. Datas e horários são ILUSTRATIVOS: numa conversa real vêm da agenda. */
export const EXEMPLO_ILUSTRATIVO = [
  "Olá, [nome]!",
  "",
  "Tudo bem?",
  "",
  "Sou a assistente virtual da clínica.",
  "",
  "Recebi o seu pedido de consulta.",
  "",
  "Estes são os horários disponíveis na agenda do doutor:",
  "",
  "📅 13.11.2026 - sexta-feira",
  "Manhã",
  "⏰ 09:30",
  "⏰ 10:30",
  "Tarde",
  "⏰ 15:00",
  "",
  "📅 16.11.2026 - segunda-feira",
  "Manhã",
  "⏰ 09:00",
  "",
  "Me diga qual horário fica melhor para você.",
].join("\n");

/** Hora só de ilustração da prévia (horário de Brasília). */
function horaAgora(): string {
  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }).format(new Date());
}

const RE_VAR = /(\[[^\]\n]{1,60}\]|\{\{[^}\n]{1,60}\}\})/g;

export function PreviaTelegram({ texto, clinica }: { texto: string; clinica?: string | null }) {
  const normal = texto.replace(/\r\n?/g, "\n");
  const vazio = normal.trim().length === 0;
  const pend = marcadoresPendentes(normal);
  const dicas = dicasDeEstilo(normal);
  return (
    <div data-testid="orientation-preview" aria-label="Prévia da mensagem no celular">
      <p className="lbl mb-1">Prévia no celular <span className="normal-case tracking-normal text-muted-foreground">(simulação no estilo WhatsApp, do lado de quem envia)</span></p>
      <div className="mx-auto w-full max-w-[360px] overflow-hidden rounded-[22px] border-2 border-[#0b1f3a] shadow-lg">
        <div className="flex items-center gap-2 bg-[#075e54] px-3 py-2 text-white">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#d9b97a] text-[12px] font-bold text-[#0b1f3a]">A</span>
          <span className="leading-tight">
            <span className="block text-[13px] font-semibold">Assistente virtual{clinica ? ` · ${clinica}` : ""}</span>
            <span className="block text-[10px] opacity-80">online</span>
          </span>
        </div>
        <div className="flex min-h-[140px] flex-col items-end bg-[#efeae2] p-3" style={{ backgroundImage: "radial-gradient(rgba(0,0,0,0.035) 1px, transparent 1px)", backgroundSize: "14px 14px" }}>
          <div
            data-testid="orientation-preview-body"
            className="relative max-w-[88%] rounded-[8px] rounded-tr-[2px] bg-[#d9fdd3] px-2.5 pb-1.5 pt-1.5 text-[14px] leading-[1.4] text-[#111b21] shadow-[0_1px_0.5px_rgba(11,20,26,0.13)]"
            style={{ fontFamily: "Inter, system-ui, sans-serif" }}
          >
            <div style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
              {vazio ? <span className="text-slate-500">A prévia aparece aqui enquanto você escreve.</span>
                : normal.split(RE_VAR).map((parte, i) => (i % 2 === 1
                  ? <mark key={i} data-testid="preview-variable" className="rounded-sm bg-[#f3e3b8] px-0.5 text-[#0b1f3a]" title="Variável: será trocada por dado real">{parte}</mark>
                  : <span key={i}>{parte}</span>))}
            </div>
            <div className="mt-0.5 flex items-center justify-end gap-1 text-[11px] text-[#667781]" data-testid="preview-ticks">
              <span>{horaAgora()}</span>
              <svg width="16" height="11" viewBox="0 0 16 11" aria-label="Lida (dois tracinhos azuis)" role="img">
                <path d="M11.07.65 5.9 7.4 3.4 4.9a.7.7 0 0 0-1 1l3.1 3.1a.7.7 0 0 0 1.05-.07l5.7-7.3a.7.7 0 0 0-1.18-.98Z" fill="#53bdeb" />
                <path d="M14.9.65 9.7 7.4l-.45-.45-.9 1.15 1.1 1.1a.7.7 0 0 0 1.05-.07l5.7-7.3A.7.7 0 0 0 14.9.65Z" fill="#53bdeb" />
              </svg>
            </div>
          </div>
        </div>
      </div>
      <p className="mt-2 flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground">
        <span><b className="text-foreground">Texto fixo</b>: escrito por você</span>
        <span><mark className="rounded-sm bg-[#f3e3b8] px-1 text-[#0b1f3a]">variável</mark>: dado real (cadastro ou agenda)</span>
        <span>Os dois tracinhos e a hora são só ilustração; a leitura real não é mostrada aqui</span>
        <span><b className="text-foreground">Perguntas de exemplo</b>: só ajudam a achar o tema; nunca são enviadas</span>
      </p>
      {pend.length > 0 && (
        <p data-testid="orientation-preview-pending" className="mt-1 text-[11px] text-amber-800 dark:text-amber-300">
          Atenção: marcadores a preencher ({pend.slice(0, 5).join(", ")}). Enquanto existirem, a orientação fica como rascunho e não pode ser aprovada. A troca por dado real ainda não está ligada ao envio.
        </p>
      )}
      {dicas.length > 0 && (
        <ul data-testid="orientation-style-hints" className="mt-1 list-disc space-y-0.5 pl-4 text-[11px] text-amber-800 dark:text-amber-300">
          {dicas.map((d) => <li key={d}>{d}</li>)}
        </ul>
      )}
    </div>
  );
}
