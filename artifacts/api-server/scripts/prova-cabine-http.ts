/** Prova HTTP da Cabine do CEO (dev). Arquivos sintéticos; nada é enviado a clientes. */
import { db, professionalsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { createCollaboratorToken } from "../src/lib/collaborator-auth.js";
const BASE = `https://${process.env.REPLIT_DEV_DOMAIN}/api`;
const CEO = Number(process.env.CEO_ID ?? 1);
const NAO_CEO = 8;
async function tk(id: number) {
  const [p] = await db.select().from(professionalsTable).where(eq(professionalsTable.id, id));
  return createCollaboratorToken({ professionalId: id, role: p.role, credentialVersion: p.credentialVersion ?? 0 });
}
const out: string[] = []; let falhas = 0;
const t = (nome: string, ok: boolean, det: string) => { if (!ok) falhas++; out.push(`${ok ? "PASSOU" : "FALHOU"} | ${nome} | ${det}`); };
(async () => {
  const ceo = await tk(CEO), med = await tk(NAO_CEO);
  const H = (x?: string) => (x ? { authorization: `Bearer ${x}` } : {});
  for (const [nome, tok, esp] of [["sem login", undefined, 401], ["não CEO", med, 403]] as const) {
    for (const p of ["/ceo/documentos", "/ceo/permissoes/mapa", "/ceo/docs-referencia"]) {
      const r = await fetch(BASE + p, { headers: H(tok) });
      t(`${nome} GET ${p}`, r.status === esp, `esperado ${esp} obtido ${r.status}`);
    }
  }
  const fdMk = (conteudo: BlobPart, nome: string, extra: Record<string, string> = {}) => {
    const fd = new FormData(); fd.append("arquivo", new Blob([conteudo]), nome);
    for (const [k, v] of Object.entries(extra)) fd.append(k, v); return fd;
  };
  const rNao = await fetch(BASE + "/ceo/documentos", { method: "POST", headers: H(med), body: fdMk("x", "a.txt") });
  t("não CEO envia", rNao.status === 403, `obtido ${rNao.status}`);
  const marca = `PROVA-${Date.now()}`;
  const up = await fetch(BASE + "/ceo/documentos", { method: "POST", headers: H(ceo), body: fdMk(`conteudo sintetico ${marca}`, "prova.txt", { titulo: marca, empresaId: "5" }) });
  const upj = await up.json() as { documento?: { id: number } };
  t("CEO envia txt", up.status === 201 && !!upj.documento, `obtido ${up.status}`);
  const id = upj.documento?.id;
  const fake = await fetch(BASE + "/ceo/documentos", { method: "POST", headers: H(ceo), body: fdMk("nao e pdf", "falso.pdf") });
  t("PDF falso recusado", fake.status === 415, `obtido ${fake.status}`);
  const exe = await fetch(BASE + "/ceo/documentos", { method: "POST", headers: H(ceo), body: fdMk("MZ", "x.exe") });
  t("tipo não aceito", exe.status === 415, `obtido ${exe.status}`);
  const vazio = await fetch(BASE + "/ceo/documentos", { method: "POST", headers: H(ceo), body: fdMk("", "v.txt") });
  t("arquivo vazio recusado", vazio.status === 400, `obtido ${vazio.status}`);
  const busca = await (await fetch(BASE + `/ceo/documentos?q=${marca}`, { headers: H(ceo) })).json() as { documentos: { id: number }[] };
  t("busca acha", busca.documentos.some((d) => d.id === id), `${busca.documentos.length} resultado(s)`);
  const outra = await (await fetch(BASE + `/ceo/documentos?q=${marca}&empresaId=2`, { headers: H(ceo) })).json() as { documentos: unknown[] };
  t("filtro de outra clínica não mostra", outra.documentos.length === 0, `${outra.documentos.length}`);
  const arq = await fetch(BASE + `/ceo/documentos/${id}/arquivo`, { headers: H(ceo) });
  t("abrir devolve conteúdo", arq.status === 200 && (await arq.text()).includes(marca), `status ${arq.status} csp=${arq.headers.get("content-security-policy") ? "sim" : "não"}`);
  const sem = await fetch(BASE + `/ceo/documentos/${id}/arquivo`);
  t("abrir sem login", sem.status === 401, `obtido ${sem.status}`);
  const mapa = await (await fetch(BASE + "/ceo/permissoes/mapa", { headers: H(ceo) })).json() as { perfis: { id: string; dominios: { dominio: string; ler: boolean; escrever: boolean }[] }[] };
  const g = (p: string, d: string) => mapa.perfis.find((x) => x.id === p)!.dominios.find((x) => x.dominio === d)!;
  t("mapa: 6 perfis", mapa.perfis.length === 6, `${mapa.perfis.length}`);
  t("mapa: admin sem prescrição", !g("admin-nao-medico", "prescricao").escrever, "");
  t("mapa: recepção financeiro só leitura", g("recepcao", "financeiro").ler && !g("recepcao", "financeiro").escrever, "");
  t("mapa: financeiro sem prontuário", !g("financeiro", "prontuario").ler, "");
  t("mapa: associado sem financeiro", !g("medico-associado", "financeiro").ler, "");
  const docs = await (await fetch(BASE + "/ceo/docs-referencia", { headers: H(ceo) })).json() as { arquivos: string[] };
  t("docs: índice lista referência", docs.arquivos.includes("PERMISSOES-REFERENCIA.md"), docs.arquivos.join(","));
  const doc = await (await fetch(BASE + "/ceo/docs-referencia/PERMISSOES-REFERENCIA.md", { headers: H(ceo) })).json() as { conteudo: string };
  t("docs: conteúdo", doc.conteudo.includes("Confirmado x planejado"), `${doc.conteudo.length} caracteres`);
  const trav = await fetch(BASE + "/ceo/docs-referencia/..%2F..%2Fpackage.json", { headers: H(ceo) });
  t("docs: path traversal recusado", trav.status === 400 || trav.status === 404, `obtido ${trav.status}`);
  if (id) { const ar = await fetch(BASE + `/ceo/documentos/${id}/arquivar`, { method: "POST", headers: H(ceo) }); t("arquivar (não apaga)", ar.status === 200, `obtido ${ar.status}`); }
  console.log(out.join("\n")); console.log(`TOTAL ${out.length} | FALHAS ${falhas}`); process.exit(falhas ? 1 : 0);
})();
