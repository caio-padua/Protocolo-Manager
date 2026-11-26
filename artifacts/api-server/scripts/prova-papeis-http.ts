/**
 * Prova HTTP real da Fatia 2 (somente leitura de dados; escritas usam corpo vazio/id inexistente,
 * que a validação recusa antes de gravar). Uso: pnpm --filter @workspace/api-server exec tsx scripts/prova-papeis-http.ts
 */
import { db, professionalsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { createCollaboratorToken } from "../src/lib/collaborator-auth.js";

const BASE = `https://${process.env.REPLIT_DEV_DOMAIN}/api`;

async function token(id: number): Promise<string> {
  const [p] = await db.select().from(professionalsTable).where(eq(professionalsTable.id, id));
  return createCollaboratorToken({ professionalId: id, role: p.role, credentialVersion: p.credentialVersion ?? 0 });
}

type Caso = { perfil: string; prof: number | null; empresa?: number; metodo: string; path: string; espera: "ok" | 403 | 401; nota: string };
const C = (perfil: string, prof: number | null, metodo: string, path: string, espera: Caso["espera"], nota: string, empresa?: number): Caso =>
  ({ perfil, prof, metodo, path, espera, nota, empresa });

const casos: Caso[] = [
  // Administrador não médico (id 27)
  C("Admin não médico", 27, "GET", "/payments", "ok", "valores"),
  C("Admin não médico", 27, "POST", "/asaas/invoice/launch", "ok", "nota fiscal"),
  C("Admin não médico", 27, "GET", "/fornecedores", "ok", "custos fornecedor"),
  C("Admin não médico", 27, "POST", "/prescriptions", 403, "prescrição"),
  C("Admin não médico", 27, "GET", "/receituario/historico", 403, "receituário"),
  C("Admin não médico", 27, "GET", "/prontuario/5300", 403, "prontuário"),
  // Médico + administrador (Kleber, id 7): na clínica 2 é médico+admin; na 5 só médico
  C("Médico+Admin (Kleber, Lemos)", 7, "GET", "/payments", "ok", "valores da própria clínica", 2),
  C("Médico+Admin (Kleber, Lemos)", 7, "POST", "/prescriptions", "ok", "prescrição", 2),
  C("Médico+Admin (Kleber, Lemos)", 7, "GET", "/cockpit/5300", "ok", "cockpit", 2),
  C("Médico+Admin (Kleber, Lemos)", 7, "GET", "/fornecedores", "ok", "custos fornecedor", 2),
  C("Combinação entre clínicas (Kleber em Pádua)", 7, "GET", "/payments", 403, "só médico em Pádua: sem financeiro", 5),
  C("Combinação entre clínicas (Kleber em Pádua)", 7, "POST", "/prescriptions", "ok", "médico em Pádua: prescreve", 5),
  // Médico associado (id 8)
  C("Médico associado", 8, "POST", "/prescriptions", "ok", "prescrição"),
  C("Médico associado", 8, "GET", "/prontuario/5300", "ok", "prontuário"),
  C("Médico associado", 8, "GET", "/exames-lab/clientes/5300", "ok", "exames"),
  C("Médico associado", 8, "GET", "/payments", 403, "valores"),
  C("Médico associado", 8, "GET", "/fornecedores", 403, "custos fornecedor"),
  C("Médico associado", 8, "GET", "/padteam/tarefas", 403, "gestão de equipe"),
  C("Médico associado", 8, "PUT", "/professionals/999999", 403, "editar equipe"),
  // Enfermagem (id 23, sintético)
  C("Enfermagem", 23, "GET", "/cockpit/5300", "ok", "triagem/cockpit"),
  C("Enfermagem", 23, "GET", "/sessions", "ok", "agenda de aplicações"),
  C("Enfermagem", 23, "POST", "/prescriptions", 403, "prescrição"),
  C("Enfermagem", 23, "GET", "/prescriptions", 403, "ler prescrição"),
  C("Enfermagem", 23, "GET", "/payments", 403, "financeiro"),
  // Recepção (id 15)
  C("Recepção somente leitura", 15, "GET", "/payments", "ok", "financeiro leitura"),
  C("Recepção somente leitura", 15, "GET", "/budgets", "ok", "resumo orçamentos leitura"),
  C("Recepção somente leitura", 15, "GET", "/clients", "ok", "cadastro básico"),
  C("Recepção somente leitura", 15, "POST", "/payments", 403, "editar financeiro"),
  C("Recepção somente leitura", 15, "PUT", "/payments/999999", 403, "editar financeiro"),
  C("Recepção somente leitura", 15, "GET", "/prontuario/5300", 403, "prontuário"),
  C("Recepção somente leitura", 15, "GET", "/exames-lab/clientes/5300", 403, "exames"),
  C("Recepção somente leitura", 15, "POST", "/prescriptions", 403, "prescrição"),
  // Gerente financeiro (id 17)
  C("Gerente financeiro", 17, "GET", "/payments", "ok", "valores"),
  C("Gerente financeiro", 17, "POST", "/asaas/invoice/launch", "ok", "nota fiscal"),
  C("Gerente financeiro", 17, "GET", "/pax-finance/ledger", "ok", "livro caixa"),
  C("Gerente financeiro", 17, "GET", "/prontuario/5300", 403, "prontuário"),
  C("Gerente financeiro", 17, "GET", "/exames-lab/clientes/5300", 403, "exames/laudos"),
  C("Gerente financeiro", 17, "GET", "/cockpit/5300", 403, "evolução/cockpit"),
  C("Gerente financeiro", 17, "POST", "/prescriptions", 403, "prescrição"),
  // Entre clínicas (financeiro de Pádua tentando Lemos)
  C("Entre clínicas", 17, "GET", "/payments", 403, "financeiro Pádua pedindo clínica Lemos", 2),
  C("Entre clínicas", 8, "GET", "/prontuario/5300", 403, "médico Pádua pedindo clínica Lemos", 2),
  // Sem papel cadastrado (Otávio, id 16)
  C("Sem papel cadastrado", 16, "GET", "/payments", 403, "fail-closed"),
  // Não autenticado
  C("Não autenticado", null, "GET", "/payments", 401, "valores"),
  C("Não autenticado", null, "POST", "/prescriptions", 401, "prescrição"),
  C("Não autenticado", null, "GET", "/prontuario/5300", 401, "prontuário"),
];

(async () => {
  const cache = new Map<number, string>();
  const linhas: string[] = [];
  let falhas = 0;
  for (const c of casos) {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (c.prof !== null) {
      if (!cache.has(c.prof)) cache.set(c.prof, await token(c.prof));
      headers.authorization = `Bearer ${cache.get(c.prof)}`;
    }
    if (c.empresa) headers["x-empresa-id"] = String(c.empresa);
    const init: RequestInit = { method: c.metodo, headers };
    if (c.metodo !== "GET") init.body = "{}";
    const r = await fetch(BASE + c.path, init);
    const corpo = await r.text();
    let doGuarda = false;
    try { doGuarda = typeof JSON.parse(corpo).dominio === "string"; } catch { /* corpo não JSON */ }
    // "ok" = o guarda de papéis deixou passar; 403 sem campo "dominio" vem de trava própria da rota (mais estrita).
    const passou = c.espera === "ok" ? r.status !== 401 && !(r.status === 403 && doGuarda) : r.status === c.espera;
    const extra = c.espera === "ok" && r.status === 403 ? " [trava própria da rota]" : "";
    if (!passou) falhas++;
    linhas.push(`${passou ? "PASSOU" : "FALHOU"} | ${c.perfil} | ${c.metodo} ${c.path}${c.empresa ? ` (clínica ${c.empresa})` : ""} | esperado ${c.espera === "ok" ? "não-403" : c.espera} | obtido ${r.status} | ${c.nota}${extra}`);
  }
  console.log(linhas.join("\n"));
  console.log(`TOTAL ${casos.length} | FALHAS ${falhas}`);
  process.exit(falhas ? 1 : 0);
})();
