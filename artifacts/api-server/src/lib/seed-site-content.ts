import { db, siteContentTable } from "@workspace/db";
import { eq } from "drizzle-orm";

type SeedLog = (msg: string) => void;
const noopLog: SeedLog = () => {};

interface SeedItem {
  contentKey: string;
  category: string;
  title: string;
  body: string | null;
  sortOrder: number;
}

// Conteudo padrao da Central de Cadastro (Onda 8.A). Fraseologia dos botoes,
// textos de pagamento (concierge, sinal 25%, estetico) e videos. Editavel
// depois pelo colaborador; aqui ficam apenas os valores iniciais.
const SEED_ITEMS: SeedItem[] = [
  {
    contentKey: "pay_text_concierge",
    category: "payment_text",
    title: "Concierge — Encaixe Antecipado (Dr. Caio)",
    body: "O Concierge é um serviço de cortesia premium para quem deseja ser atendido pelo Dr. Caio antes da próxima janela natural da agenda. Reservamos um encaixe exclusivo, com prioridade e acompanhamento dedicado. Caso, por qualquer motivo, não consigamos confirmar o seu encaixe dentro das condições combinadas, o valor é integralmente devolvido — você não corre nenhum risco.",
    sortOrder: 10,
  },
  {
    contentKey: "pay_text_assistente",
    category: "payment_text",
    title: "Sinal de Reserva — Médicos Assistentes (25%)",
    body: "Para reservar o seu horário com um de nossos médicos assistentes, pedimos um sinal de 25% do valor da consulta. Esse sinal garante o seu lugar na agenda e é integralmente abatido do total no dia do atendimento — não é um custo extra, é parte do pagamento. Ele existe apenas para honrarmos, de parte a parte, o tempo reservado especialmente para você.",
    sortOrder: 20,
  },
  {
    contentKey: "pay_text_estetico",
    category: "payment_text",
    title: "Pagamento do Estético (durante o protocolo)",
    body: "Os procedimentos estéticos agendados durante o seu protocolo são pagos depois, de forma combinada, e não no momento do agendamento. Assim você organiza tudo com tranquilidade, sem pressa no dia da marcação.",
    sortOrder: 30,
  },
  {
    contentKey: "btn_entrada_injetavel",
    category: "button_phrase",
    title: "Botão — Entrada Protocolos Injetáveis",
    body: "Agendar Protocolo Injetável",
    sortOrder: 10,
  },
  {
    contentKey: "btn_entrada_estetico",
    category: "button_phrase",
    title: "Botão — Entrada Protocolos Estéticos",
    body: "Agendar Procedimento Estético",
    sortOrder: 20,
  },
  {
    contentKey: "btn_entrada_drcaio",
    category: "button_phrase",
    title: "Botão — Entrada Dr. Caio (exclusiva)",
    body: "Consulta com Dr. Caio Henrique Fernandes Pádua",
    sortOrder: 30,
  },
  {
    contentKey: "btn_entrada_assistentes",
    category: "button_phrase",
    title: "Botão — Entrada Médicos Assistentes",
    body: "Consulta com nossos Médicos Assistentes",
    sortOrder: 40,
  },
  {
    contentKey: "video_apresentacao_geral",
    category: "video",
    title: "Vídeo de Apresentação (geral)",
    body: null,
    sortOrder: 10,
  },
];

// Idempotente: só insere se não existir item com a mesma contentKey.
// NÃO sobrescreve textos já editados pelo colaborador.
export async function runSeedSiteContent(
  log: SeedLog = noopLog,
): Promise<{ inserted: number; skipped: number }> {
  let inserted = 0;
  let skipped = 0;
  for (const it of SEED_ITEMS) {
    const existing = await db
      .select({ id: siteContentTable.id })
      .from(siteContentTable)
      .where(eq(siteContentTable.contentKey, it.contentKey))
      .limit(1);
    if (existing.length > 0) {
      skipped++;
      continue;
    }
    await db.insert(siteContentTable).values({
      contentKey: it.contentKey,
      category: it.category,
      title: it.title,
      body: it.body,
      sortOrder: it.sortOrder,
    });
    inserted++;
    log(`inserido: ${it.contentKey}`);
  }
  log(`seed conteúdo: ${inserted} inserido(s), ${skipped} já existente(s).`);
  return { inserted, skipped };
}
