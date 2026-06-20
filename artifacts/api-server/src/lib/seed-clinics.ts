import { db, locationsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

type SeedLog = (msg: string) => void;
const noopLog: SeedLog = () => {};

interface SeedClinic {
  name: string;
  type: string;
  color: string;
  phone: string;
  cep: string;
  logradouro: string;
  numero: string;
  bairro: string;
  cidade: string;
  estado: string;
}

function buildAddress(c: SeedClinic): string {
  return [
    c.logradouro,
    c.numero,
    c.bairro,
    c.cidade ? `${c.cidade} - ${c.estado}` : c.estado,
    c.cep ? `CEP ${c.cep}` : "",
  ].filter(Boolean).join(", ");
}

// Instituto Padua: clínica principal (dados reais do CEO).
// Duas clínicas "[TESTE]" fictícias para validar o fluxo da onda.
const SEED_CLINICS: SeedClinic[] = [
  {
    name: "Instituto Padua", type: "clinic", color: "#3D7A7A",
    phone: "+5511977154000", cep: "03416-050", logradouro: "Rua Guaxupé",
    numero: "327", bairro: "", cidade: "São Paulo", estado: "SP",
  },
  {
    name: "[TESTE] Clínica Vila Aurora", type: "clinic", color: "#7C3AED",
    phone: "+5511933334444", cep: "01310-100", logradouro: "Avenida Paulista",
    numero: "1500", bairro: "Bela Vista", cidade: "São Paulo", estado: "SP",
  },
  {
    name: "[TESTE] Clínica Campinas Centro", type: "clinic", color: "#D97706",
    phone: "+5519955556666", cep: "13010-111", logradouro: "Rua Treze de Maio",
    numero: "200", bairro: "Centro", cidade: "Campinas", estado: "SP",
  },
];

// Idempotente: só insere se não existir location com o mesmo name.
export async function runSeedClinics(log: SeedLog = noopLog): Promise<{ inserted: number; skipped: number }> {
  let inserted = 0;
  let skipped = 0;
  for (const c of SEED_CLINICS) {
    const existing = await db.select({ id: locationsTable.id })
      .from(locationsTable).where(eq(locationsTable.name, c.name)).limit(1);
    if (existing.length > 0) {
      skipped++;
      log(`skip (já existe): ${c.name}`);
      continue;
    }
    await db.insert(locationsTable).values({
      name: c.name, type: c.type, color: c.color, active: "true",
      phone: c.phone, cep: c.cep, logradouro: c.logradouro, numero: c.numero,
      bairro: c.bairro, cidade: c.cidade, estado: c.estado, address: buildAddress(c),
    });
    inserted++;
    log(`inserido: ${c.name}`);
  }
  log(`seed clínicas: ${inserted} inserida(s), ${skipped} já existente(s).`);
  return { inserted, skipped };
}

// Runner direto: tsx src/lib/seed-clinics.ts
if (import.meta.url === `file://${process.argv[1]}`) {
  runSeedClinics((m) => console.log(m))
    .then((r) => { console.log("OK", r); process.exit(0); })
    .catch((e) => { console.error(e); process.exit(1); });
}
