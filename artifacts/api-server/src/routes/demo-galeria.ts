// GALERIA DE MENSAGENS (dev-only) — dispara UMA mensagem de WhatsApp REAL por
// possibilidade para o telefone do cliente, usando dados reais do protocolo ativo
// e os renderizadores reais (Mensageria Opus + templates de lembrete). Serve para
// o CEO ver, no proprio WhatsApp, todas as vozes que o sistema sabe falar.
//
// NUNCA disponivel em producao (retorna 404). Idempotencia nao se aplica: cada
// chamada reenviada manda a galeria de novo, de proposito (e uma demonstracao).
import { Router, type IRouter } from "express";
import {
  db,
  clientsTable,
  protocolsTable,
  protocolItemsTable,
  substancesTable,
  sessionsTable,
  validationCodesTable,
  type LembretePeriodoJson,
} from "@workspace/db";
import { and, asc, desc, eq } from "drizzle-orm";
import { sendWhatsapp } from "../lib/whatsapp";
import { montarMensagemOpus } from "../lib/mensageria-opus";
import { templateLembretePrescricao, montarSaudacao, type Genero } from "../lib/lembrete-templates";

const router: IRouter = Router();

const ehProd = process.env.NODE_ENV === "production";

interface MensagemGaleria {
  tipo: string;
  descricao: string;
  texto: string;
}

interface EnvioDetalhe {
  tipo: string;
  descricao: string;
  enviado: boolean;
  via: string;
  logId?: number;
  erro?: string;
  preview: string;
}

function pausa(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// WhatsApp/Twilio recusa corpo acima de 1600 caracteres (erro 21617). Corta com
// folga num limite de parágrafo/frase, preservando a assinatura quando cabe.
const LIMITE_WHATSAPP = 1500;
function limitarTamanho(texto: string): string {
  if (texto.length <= LIMITE_WHATSAPP) return texto;
  const corte = texto.slice(0, LIMITE_WHATSAPP);
  const ultimaQuebra = Math.max(corte.lastIndexOf("\n\n"), corte.lastIndexOf(". "));
  const base = ultimaQuebra > 800 ? corte.slice(0, ultimaQuebra) : corte;
  return `${base.trimEnd()}\n\n(...)`;
}

function primeiroNome(nome: string): string {
  return (nome || "").trim().split(/\s+/)[0] || nome;
}

function dataBr(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

// Distribui os itens do protocolo em 3 periodos canonicos do dia (manha, tarde,
// noite) para gerar 3 vozes distintas do motor de lembrete por periodo.
function montarPeriodos(
  itens: { nome: string; dose: string | null; frequency: string | null }[],
): LembretePeriodoJson[] {
  const base: LembretePeriodoJson[] = [
    { sigla: "IM", nome: "Início da Manhã", tipo: "tomar", formulas: [] },
    { sigla: "IT", nome: "Início da Tarde", tipo: "tomar", formulas: [] },
    { sigla: "NO", nome: "Noite", tipo: "tomar", formulas: [] },
  ];
  itens.forEach((it, i) => {
    const alvo = base[i % 3];
    alvo.formulas.push({
      nome: it.nome,
      dose: it.dose ?? undefined,
      posologia: it.frequency ?? undefined,
    });
  });
  return base.filter((p) => p.formulas.length > 0);
}

router.post("/demo/galeria/:clientId", async (req, res): Promise<void> => {
  if (ehProd) {
    res.status(404).json({ error: "galeria de demonstracao nao disponivel em producao" });
    return;
  }
  const clienteId = Number(req.params.clientId);
  if (!Number.isInteger(clienteId)) {
    res.status(400).json({ error: "clientId invalido" });
    return;
  }

  const [cliente] = await db.select().from(clientsTable).where(eq(clientsTable.id, clienteId));
  if (!cliente) {
    res.status(404).json({ error: "cliente nao encontrado" });
    return;
  }
  if (!cliente.phone) {
    res.status(400).json({ error: "cliente sem telefone" });
    return;
  }

  // Protocolo mais recente do cliente.
  const [protocolo] = await db
    .select()
    .from(protocolsTable)
    .where(eq(protocolsTable.clientId, clienteId))
    .orderBy(desc(protocolsTable.id))
    .limit(1);
  if (!protocolo) {
    res.status(400).json({ error: "cliente sem protocolo" });
    return;
  }

  const itensRaw = await db
    .select({
      nome: substancesTable.name,
      dose: protocolItemsTable.dose,
      frequency: protocolItemsTable.frequency,
    })
    .from(protocolItemsTable)
    .innerJoin(substancesTable, eq(substancesTable.id, protocolItemsTable.substanceId))
    .where(eq(protocolItemsTable.protocolId, protocolo.id));

  const sessoes = await db
    .select()
    .from(sessionsTable)
    .where(eq(sessionsTable.protocolId, protocolo.id))
    .orderBy(asc(sessionsTable.scheduledDate));

  const pnome = primeiroNome(cliente.name);
  const genero: Genero = "nao_informado";
  const periodos = montarPeriodos(itensRaw);
  const listaSubs = itensRaw.map((i) => `• ${i.nome}${i.dose ? ` — ${i.dose}` : ""}`).join("\n");
  const primeira = sessoes[0];
  const ultima = sessoes[sessoes.length - 1];
  const antepenultima = sessoes.length >= 3 ? sessoes[sessoes.length - 3] : primeira;
  const totalSessoes = sessoes.length;

  const mensagens: MensagemGaleria[] = [];

  // 1) BOAS-VINDAS
  mensagens.push({
    tipo: "boas_vindas",
    descricao: "Boas-vindas ao protocolo",
    texto:
      `PAXTER | Clinical Intelligence System\n\n` +
      `Olá, ${pnome}! Seja muito bem-vindo(a).\n\n` +
      `Seu protocolo injetável foi ativado com ${itensRaw.length} substância(s) e ${totalSessoes} sessão(ões) programada(s). ` +
      `A partir de agora, cuidamos de cada detalhe com você.\n\n` +
      `Suas substâncias:\n${listaSubs}\n\n` +
      `Qualquer dúvida, é só responder por aqui.`,
  });

  // 2-4) LEMBRETE POR PERÍODO (Mensageria Opus, uma voz por período)
  for (const p of periodos) {
    let texto: string;
    const rica = await montarMensagemOpus({ nome: pnome, agora: new Date(), periodos: [p] });
    texto =
      rica ??
      templateLembretePrescricao({
        clienteNome: cliente.name,
        clienteGenero: genero,
        agora: new Date(),
        saudacao: montarSaudacao(cliente.name, genero, new Date()),
        periodos: [p],
      });
    mensagens.push({
      tipo: `lembrete_${p.sigla.toLowerCase()}`,
      descricao: `Lembrete por período — ${p.nome}`,
      texto,
    });
  }

  // 5) PRÉ-SESSÃO (agendamento + código de validação REAL + substâncias)
  let codigo = "—";
  if (primeira) {
    const [vc] = await db
      .select({ code: validationCodesTable.code })
      .from(validationCodesTable)
      .where(and(eq(validationCodesTable.sessionId, primeira.id), eq(validationCodesTable.used, false)))
      .orderBy(desc(validationCodesTable.id))
      .limit(1);
    if (vc) codigo = vc.code;
  }
  mensagens.push({
    tipo: "pre_sessao",
    descricao: "Lembrete pré-sessão (código de validação)",
    texto:
      `PAXTER | Aplicação Endovenosa\n\n` +
      `Olá, ${pnome}. Sua próxima sessão está agendada para *${primeira ? dataBr(primeira.scheduledDate) : "a definir"}* às ${primeira?.scheduledTime ?? "09:00"}.\n\n` +
      `Substâncias previstas:\n${listaSubs}\n\n` +
      `Código de validação da sessão: *${codigo}*\n` +
      `Apresente este código à enfermagem no início do atendimento.\n\n` +
      `Recomendações: hidrate-se bem e evite jejum prolongado antes da aplicação.`,
  });

  // 6) PÓS-SESSÃO (confirmação + RAS)
  mensagens.push({
    tipo: "pos_sessao",
    descricao: "Confirmação pós-sessão (RAS assinado)",
    texto:
      `PAXTER | Sessão concluída\n\n` +
      `${pnome}, sua sessão foi concluída com sucesso. As substâncias foram administradas conforme o protocolo.\n\n` +
      `O RAS (Registro de Administração de Substâncias) assinado digitalmente já está disponível no seu prontuário. ` +
      `Você receberá o arquivo por e-mail e no seu Drive.\n\n` +
      `Se sentir qualquer sintoma, avise a equipe imediatamente.`,
  });

  // 7) LEMBRETE DE EXAMES (antepenúltima sessão)
  mensagens.push({
    tipo: "lembrete_exames",
    descricao: "Lembrete de exames (antepenúltima sessão)",
    texto:
      `PAXTER | Exames de acompanhamento\n\n` +
      `${pnome}, estamos chegando na reta final do seu protocolo (sessão de *${antepenultima ? dataBr(antepenultima.scheduledDate) : "a definir"}*).\n\n` +
      `É hora de colher os exames de acompanhamento para o médico avaliar a evolução. ` +
      `Envie os resultados pela sua Área do Cliente (pasta "Exames Solicitados") assim que tiver.`,
  });

  // 8) ÚLTIMA SESSÃO (consulta com médico designado)
  mensagens.push({
    tipo: "ultima_sessao",
    descricao: "Última sessão (consulta de fechamento)",
    texto:
      `PAXTER | Fechamento do protocolo\n\n` +
      `${pnome}, sua última sessão está marcada para *${ultima ? dataBr(ultima.scheduledDate) : "a definir"}*.\n\n` +
      `Vamos agendar sua consulta de fechamento com o médico designado para revisar resultados e planejar os próximos passos. ` +
      `Nossa equipe entrará em contato para escolher o melhor horário.`,
  });

  // 9) RESUMO DO COCKPIT (voz do "Finalizar e Emitir Tudo")
  mensagens.push({
    tipo: "resumo_cockpit",
    descricao: "Resumo do cockpit (consulta finalizada)",
    texto:
      `PAXTER | ${cliente.name}: protocolo emitido.\n\n` +
      `${itensRaw.length} substância(s), ${totalSessoes} sessão(ões) programada(s). ` +
      `Documentos gerados e enviados ao seu e-mail e Drive. ` +
      `Em breve você recebe os lembretes de cada aplicação.`,
  });

  // Filtro opcional por tipo (?tipos=lembrete_im,lembrete_it) para reenviar
  // apenas mensagens específicas sem duplicar as que já chegaram.
  const filtroRaw = typeof req.query.tipos === "string" ? req.query.tipos : "";
  const filtro = new Set(
    filtroRaw
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean),
  );
  const alvo = filtro.size > 0 ? mensagens.filter((m) => filtro.has(m.tipo)) : mensagens;

  // DISPARO REAL, um a um, com pausa para preservar a ordem no WhatsApp.
  const detalhes: EnvioDetalhe[] = [];
  for (const m of alvo) {
    m.texto = limitarTamanho(m.texto);
    let enviado = false;
    let via = "link";
    let logId: number | undefined;
    let erro: string | undefined;
    try {
      const r = await sendWhatsapp(cliente.phone, m.texto, {
        contexto: `galeria_${m.tipo}`,
        clienteId,
      });
      enviado = r.sent;
      via = r.via;
      logId = r.logId;
      erro = r.error;
    } catch (e) {
      erro = e instanceof Error ? e.message : String(e);
    }
    detalhes.push({
      tipo: m.tipo,
      descricao: m.descricao,
      enviado,
      via,
      logId,
      erro,
      preview: m.texto.slice(0, 80),
    });
    req.log.info({ tipo: m.tipo, enviado, via, erro }, "[galeria] mensagem disparada");
    await pausa(1500);
  }

  const enviados = detalhes.filter((d) => d.enviado).length;
  res.json({
    ok: true,
    cliente: { id: cliente.id, nome: cliente.name, telefone: cliente.phone },
    protocolo: protocolo.id,
    total: mensagens.length,
    enviados,
    detalhes,
  });
});

export default router;
