import { db, clientsTable, pulsoDiarioTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";

// ============================================================================
// SEED DEMO — "Rogério Juarez" (cliente de TESTE, is_teste=true).
//
// Cria (ou reutiliza) um cliente de demonstração rico e coerente e semeia ~14
// dias de Pulso Diário (manhã/tarde/noite) para a faixa de Acompanhamento
// Diário do Cockpit da Consulta aparecer cheia.
//
// SEGURANÇA CLÍNICA (spec E4 / Art. 47): dados fictícios só entram neste cliente
// de teste, NUNCA em prontuário de paciente real. Idempotente: não duplica o
// cliente (casa por nome + is_teste) nem as leituras (unique cliente+data+período).
// ============================================================================

type SeedLog = (msg: string) => void;
const noopLog: SeedLog = () => {};

const NOME_DEMO = "Rogério Juarez";

const FICHA_DEMO = {
  isTeste: true,
  is_teste: true,
  sexo: "masculino",
  tipoSanguineo: "O+",
  patologias: ["Hipertensão arterial sistêmica", "Pré-diabetes", "Dislipidemia"],
  suspeitas: ["Apneia obstrutiva do sono"],
  alergias: ["Dipirona", "Frutos do mar"],
  medicacoes: ["Losartana 50mg (manhã)", "Rosuvastatina 10mg (noite)", "AAS 100mg (manhã)"],
  habitos: ["Ex-tabagista (parou há 3 anos)", "Etilismo social", "Sedentário"],
} as const;

// Perfil de pulso coerente com hipertenso/pré-diabético: pressão às vezes
// elevada, glicemia limítrofe, energia/sono medianos. Sem aleatoriedade real
// (determinístico por índice) para manter a demo estável entre reinícios.
function leituraDoDia(diaIdx: number, periodo: "manha" | "tarde" | "noite") {
  const jitter = (diaIdx * 7) % 5; // 0..4 estável por dia
  if (periodo === "manha") {
    return {
      energia: 6 - (jitter % 2),
      disposicao: 7 - (jitter % 2),
      sono: 6 - (jitter % 3),
      pressaoSistolica: 138 + jitter, // 138..142 (limítrofe/alta)
      pressaoDiastolica: 88 + (jitter % 3), // 88..90
      glicemia: 98 + jitter, // 98..102 (pré-diabético)
      humor: jitter > 2 ? "Cansado" : "Tranquilo",
      observacao: jitter > 2 ? "Acordou com leve dor de cabeça." : null,
    };
  }
  if (periodo === "tarde") {
    return {
      energia: 6 - (jitter % 2),
      disposicao: 7 - (jitter % 3),
      sono: 6 - (jitter % 3),
      pressaoSistolica: 134 + jitter,
      pressaoDiastolica: 86 + (jitter % 4),
      glicemia: 150 + jitter * 2, // pós-prandial mais alta
      humor: "Disposto",
      observacao: null,
    };
  }
  return {
    energia: 7 - (jitter % 2),
    disposicao: 8 - (jitter % 2),
    sono: 7 - (jitter % 2),
    pressaoSistolica: 122 + (jitter % 4),
    pressaoDiastolica: 80 + (jitter % 3),
    glicemia: 95 + (jitter % 5),
    humor: "Ótimo",
    observacao: null,
  };
}

function ymd(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

const PERIODOS = ["manha", "tarde", "noite"] as const;

export async function runSeedDemoRogerio(
  log: SeedLog = noopLog,
): Promise<{ clienteId: number; leiturasInseridas: number }> {
  // 1) Cliente de teste: reutiliza se já existir (casa por nome + is_teste).
  const existentes = await db
    .select({ id: clientsTable.id, ficha: clientsTable.fichaClinica })
    .from(clientsTable)
    .where(eq(clientsTable.name, NOME_DEMO));

  const jaTeste = existentes.find(
    (c) => Boolean((c.ficha as Record<string, unknown> | null)?.["is_teste"]),
  );

  let clienteId: number;
  if (jaTeste) {
    clienteId = jaTeste.id;
    log(`cliente já existe (id ${clienteId}); reutilizando`);
  } else {
    const [novo] = await db
      .insert(clientsTable)
      .values({
        name: NOME_DEMO,
        cpf: "11144477735",
        email: "rogerio.juarez.demo@paxter.test",
        phone: "5511990001234",
        birthDate: "1972-03-14",
        instagram: "@rogerio.juarez",
        comoConheceu: "Indicação de cliente",
        address: "Rua das Palmeiras, 320, Apto 45, Tatuapé, São Paulo - SP",
        fichaClinica: FICHA_DEMO,
        status: "active",
        empresaId: 5,
        locationId: 8,
      })
      .returning({ id: clientsTable.id });
    clienteId = novo!.id;
    log(`cliente criado (id ${clienteId})`);
  }

  // 2) Pulso Diário: últimos 14 dias × 3 períodos, idempotente (unique cliente+data+período).
  const hoje = new Date();
  let leiturasInseridas = 0;
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate() - i));
    const data = ymd(d);
    for (const periodo of PERIODOS) {
      const l = leituraDoDia(i, periodo);
      const jaExiste = await db
        .select({ id: pulsoDiarioTable.id })
        .from(pulsoDiarioTable)
        .where(
          and(
            eq(pulsoDiarioTable.clienteId, clienteId),
            eq(pulsoDiarioTable.data, data),
            eq(pulsoDiarioTable.periodo, periodo),
          ),
        )
        .limit(1);
      if (jaExiste.length > 0) continue;
      await db.insert(pulsoDiarioTable).values({
        clienteId,
        data,
        periodo,
        energia: l.energia,
        disposicao: l.disposicao,
        sono: l.sono,
        pressaoSistolica: l.pressaoSistolica,
        pressaoDiastolica: l.pressaoDiastolica,
        glicemia: l.glicemia,
        humor: l.humor,
        observacao: l.observacao,
        origem: "demo",
      });
      leiturasInseridas++;
    }
  }
  log(`pulso semeado: ${leiturasInseridas} leituras novas`);
  return { clienteId, leiturasInseridas };
}
