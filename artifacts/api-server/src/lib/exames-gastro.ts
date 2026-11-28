/**
 * Cadastro reutilizável de exames gastroenterológicos e modelos de justificativa.
 * Não cria pedido, não toca paciente, não envia nada. Idempotente e não destrutivo.
 */
import { sql, type SQL } from "drizzle-orm";
import { GRUPOS_GASTRO, MODELO_CONTEXTUAL, AVISO_CID_SINTOMA } from "./exames-gastro-dados";

export interface ExecGastro { execute(q: SQL): Promise<{ rows: unknown[] }> }

const semAcento = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export async function garantirEsquemaGastro(exec: ExecGastro): Promise<void> {
  await exec.execute(sql`CREATE TABLE IF NOT EXISTS exames_gastro_agrupamento (
    id SERIAL PRIMARY KEY, codigo TEXT NOT NULL UNIQUE, ordem INTEGER NOT NULL, nome TEXT NOT NULL,
    descricao TEXT NOT NULL DEFAULT '', ativo BOOLEAN NOT NULL DEFAULT TRUE)`);
  await exec.execute(sql`CREATE TABLE IF NOT EXISTS exames_gastro_item (
    id SERIAL PRIMARY KEY, codigo TEXT NOT NULL UNIQUE,
    agrupamento_id INTEGER NOT NULL REFERENCES exames_gastro_agrupamento(id),
    ordem INTEGER NOT NULL, nome TEXT NOT NULL, descricao_padronizada TEXT NOT NULL,
    sinonimos TEXT[] NOT NULL DEFAULT '{}', modulo TEXT NOT NULL, cid_sugerido TEXT NOT NULL,
    indicacao TEXT NOT NULL, justificativa_padrao TEXT NOT NULL,
    prioridade TEXT NOT NULL CHECK (prioridade IN ('alta','media','condicional')),
    condicoes_realizacao TEXT NOT NULL DEFAULT '', dependencias TEXT NOT NULL DEFAULT '',
    preparo TEXT NOT NULL DEFAULT '', aviso_cid TEXT NOT NULL DEFAULT '',
    tuss_codigo TEXT, tuss_conferido BOOLEAN NOT NULL DEFAULT FALSE,
    catalogo_codigos TEXT[] NOT NULL DEFAULT '{}', ativo BOOLEAN NOT NULL DEFAULT TRUE,
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await exec.execute(sql`CREATE TABLE IF NOT EXISTS exames_gastro_modelo_contextual (
    codigo TEXT PRIMARY KEY, titulo TEXT NOT NULL, texto TEXT NOT NULL, aviso TEXT NOT NULL,
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
}

export interface RelatorioSemente { reaproveitados: string[]; criados: string[]; jaExistiam: string[]; itens: number; grupos: number; dryRun: boolean }

/** dryRun=true só calcula o relatório, sem gravar no catálogo nem nas tabelas novas. */
export async function semearExamesGastro(exec: ExecGastro, dryRun = false): Promise<RelatorioSemente> {
  if (!dryRun) await garantirEsquemaGastro(exec);
  const cat = (await exec.execute(sql`SELECT codigo_exame, nome_exame FROM catalogo_exames`)).rows as { codigo_exame: string; nome_exame: string | null }[];
  const porCodigo = new Set(cat.map((c) => c.codigo_exame));
  const porNome = new Map(cat.filter((c) => c.nome_exame).map((c) => [semAcento(c.nome_exame!), c.codigo_exame]));
  const rel: RelatorioSemente = { reaproveitados: [], criados: [], jaExistiam: [], itens: 0, grupos: 0, dryRun };

  for (const g of GRUPOS_GASTRO) {
    let gid = 0;
    if (!dryRun) {
      const r = await exec.execute(sql`INSERT INTO exames_gastro_agrupamento (codigo,ordem,nome,descricao)
        VALUES (${g.codigo},${g.ordem},${g.nome},${g.descricao})
        ON CONFLICT (codigo) DO UPDATE SET ordem=EXCLUDED.ordem, nome=EXCLUDED.nome, descricao=EXCLUDED.descricao
        RETURNING id`);
      gid = Number((r.rows[0] as { id: number }).id);
    }
    rel.grupos++;
    let ordem = 0;
    for (const it of g.itens) {
      ordem++; rel.itens++;
      const ligados: string[] = [];
      for (const c of it.reaproveita) {
        if (!porCodigo.has(c)) throw new Error(`catalogo_exame_reaproveitado_ausente:${c}`);
        ligados.push(c); rel.reaproveitados.push(`${it.nome} -> ${c}`);
      }
      if (!it.reaproveita.length && it.codigoCatalogo) {
        const existente = porCodigo.has(it.codigoCatalogo) ? it.codigoCatalogo : porNome.get(semAcento(it.nome));
        if (existente) {
          ligados.push(existente);
          (porCodigo.has(it.codigoCatalogo) ? rel.jaExistiam : rel.reaproveitados).push(`${it.nome} -> ${existente}`);
        } else {
          rel.criados.push(`${it.nome} -> ${it.codigoCatalogo}`);
          ligados.push(it.codigoCatalogo);
          if (!dryRun) {
            const dados = JSON.stringify({ cid_1: it.cid, justificativa_objetiva: it.justificativa, preparo: it.preparo, origem: "exames_gastro" });
            await exec.execute(sql`INSERT INTO catalogo_exames
              (codigo_exame,nome_exame,ativo,grupo_principal,subgrupo,prioridade,finalidade_principal,corpo_pedido,preparo,exige_validacao_humana,dados)
              VALUES (${it.codigoCatalogo},${it.nome},TRUE,'GASTROENTEROLOGIA',${g.nome},${it.prioridade},${it.indicacao},${it.justificativa},${it.preparo},'SIM',${dados}::jsonb)
              ON CONFLICT (codigo_exame) DO NOTHING`);
            porCodigo.add(it.codigoCatalogo);
          }
        }
      }
      if (!dryRun) {
        // Reexecutar atualiza apenas o texto-base; TUSS e a conferência dele nunca são sobrescritos.
        await exec.execute(sql`INSERT INTO exames_gastro_item
          (codigo,agrupamento_id,ordem,nome,descricao_padronizada,sinonimos,modulo,cid_sugerido,indicacao,justificativa_padrao,
           prioridade,condicoes_realizacao,dependencias,preparo,aviso_cid,catalogo_codigos)
          VALUES (${it.codigo},${gid},${ordem},${it.nome},${it.descricao},${it.sinonimos}::text[],${it.modulo},${it.cid},${it.indicacao},
           ${it.justificativa},${it.prioridade},${it.condicoes},${it.dependencias},${it.preparo},
           ${/^(R14|K30)/.test(it.cid) ? AVISO_CID_SINTOMA : ""},${ligados}::text[])
          ON CONFLICT (codigo) DO NOTHING`);
      }
    }
  }
  if (!dryRun) {
    await exec.execute(sql`INSERT INTO exames_gastro_modelo_contextual (codigo,titulo,texto,aviso)
      VALUES (${MODELO_CONTEXTUAL.codigo},${MODELO_CONTEXTUAL.titulo},${MODELO_CONTEXTUAL.texto},${MODELO_CONTEXTUAL.aviso})
      ON CONFLICT (codigo) DO NOTHING`);
  }
  return rel;
}

export async function listarExamesGastro(exec: ExecGastro) {
  await garantirEsquemaGastro(exec);
  const g = (await exec.execute(sql`SELECT id,codigo,ordem,nome,descricao FROM exames_gastro_agrupamento WHERE ativo ORDER BY ordem`)).rows as any[];
  const i = (await exec.execute(sql`SELECT id,codigo,agrupamento_id AS "agrupamentoId",ordem,nome,descricao_padronizada AS descricao,sinonimos,modulo,
    cid_sugerido AS cid,indicacao,justificativa_padrao AS justificativa,prioridade,condicoes_realizacao AS condicoes,dependencias,preparo,
    aviso_cid AS "avisoCid",tuss_codigo AS tuss,tuss_conferido AS "tussConferido",catalogo_codigos AS "catalogoCodigos"
    FROM exames_gastro_item WHERE ativo ORDER BY agrupamento_id,ordem`)).rows as any[];
  const m = (await exec.execute(sql`SELECT codigo,titulo,texto,aviso FROM exames_gastro_modelo_contextual ORDER BY codigo`)).rows;
  return { agrupamentos: g.map((x) => ({ ...x, itens: i.filter((y) => y.agrupamentoId === x.id) })), modelosContextuais: m };
}
