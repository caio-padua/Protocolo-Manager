import { sql } from "drizzle-orm";
import {
  db,
  clientsTable,
  periodosDiaTable,
  catalogoItensTable,
  catalogoFormulasTable,
  catalogoInjetaveisTable,
  catalogoImplantesTable,
  catalogoBlendsTable,
  catalogoBlendAtivosTable,
} from "@workspace/db";

export const DEFAULT_CATALOGO_URL =
  "https://raw.githubusercontent.com/caio-padua/Integrative-Health-Engine/ver-l2-dr-claude/docs/dr-replit/PARA_MANAGER/catalogo_terapeutico_export_26.06.13.json";
export const DEFAULT_PACIENTES_URL =
  "https://raw.githubusercontent.com/caio-padua/Integrative-Health-Engine/ver-l2-dr-claude/docs/dr-replit/PARA_MANAGER/pacientes_export_26.06.13.json";

type Raw = Record<string, any>;

type Logger = {
  info: (...args: any[]) => void;
  warn: (...args: any[]) => void;
  error: (...args: any[]) => void;
};

const noopLog: Logger = { info: () => {}, warn: () => {}, error: () => {} };

export type CollReport = {
  criados: number;
  atualizados: number;
  pulados: number;
  emRevisao: number;
};

export type TransmutacaoReport = {
  _meta: {
    iniciadoEm: string;
    finalizadoEm: string;
    catalogoUrl: string;
    pacientesUrl: string;
    duracaoMs: number;
  };
  periodos_dia: CollReport;
  catalogo_itens: CollReport;
  catalogo_formulas: CollReport;
  catalogo_injetaveis: CollReport;
  catalogo_implantes: CollReport;
  catalogo_blends: CollReport;
  catalogo_blend_ativos: CollReport;
  pacientes: CollReport;
};

function emptyColl(): CollReport {
  return { criados: 0, atualizados: 0, pulados: 0, emRevisao: 0 };
}

function s(v: unknown): string | null {
  if (v == null) return null;
  const t = String(v).trim();
  return t === "" ? null : t;
}

function numId(v: unknown): number | null {
  if (typeof v === "number") return Number.isInteger(v) && v > 0 ? v : null;
  if (typeof v === "string") {
    const t = v.trim();
    if (!/^\d+$/.test(t)) return null;
    const n = Number(t);
    return Number.isInteger(n) && n > 0 ? n : null;
  }
  return null;
}

function digits(v: unknown): string {
  return String(v ?? "").replace(/\D/g, "");
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0].toLowerCase();
}

async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Falha ao buscar ${url}: HTTP ${res.status}`);
  }
  return res.json();
}

export async function runTransmutacao(opts: {
  catalogoUrl?: string;
  pacientesUrl?: string;
  log?: Logger;
}): Promise<TransmutacaoReport> {
  const log = opts.log ?? noopLog;
  const catalogoUrl = opts.catalogoUrl ?? DEFAULT_CATALOGO_URL;
  const pacientesUrl = opts.pacientesUrl ?? DEFAULT_PACIENTES_URL;
  const startedAt = Date.now();

  log.info("Transmutacao: buscando bases (chupa-cabra)");
  const [catalogo, pacientesDoc] = await Promise.all([
    fetchJson(catalogoUrl),
    fetchJson(pacientesUrl),
  ]);

  const report: TransmutacaoReport = {
    _meta: {
      iniciadoEm: new Date(startedAt).toISOString(),
      finalizadoEm: "",
      catalogoUrl,
      pacientesUrl,
      duracaoMs: 0,
    },
    periodos_dia: emptyColl(),
    catalogo_itens: emptyColl(),
    catalogo_formulas: emptyColl(),
    catalogo_injetaveis: emptyColl(),
    catalogo_implantes: emptyColl(),
    catalogo_blends: emptyColl(),
    catalogo_blend_ativos: emptyColl(),
    pacientes: emptyColl(),
  };

  // ---- (1) periodos_dia ----
  log.info("Transmutacao: periodos_dia");
  await db.transaction(async (tx) => {
    const existing = new Set(
      (await tx.select({ k: periodosDiaTable.sigla }).from(periodosDiaTable)).map((r) => r.k),
    );
    for (const r of (catalogo.periodos_dia ?? []) as Raw[]) {
      const sigla = s(r.sigla);
      if (!sigla) {
        report.periodos_dia.pulados++;
        continue;
      }
      const values = {
        sigla,
        ordem: r.ordem ?? null,
        nome: s(r.nome),
        janelaInicio: s(r.janela_inicio),
        janelaFim: s(r.janela_fim),
        emoji: s(r.emoji),
        corHex: s(r.cor_hex),
        descricao: s(r.descricao),
      };
      const isUpdate = existing.has(sigla);
      await tx
        .insert(periodosDiaTable)
        .values(values)
        .onConflictDoUpdate({ target: periodosDiaTable.sigla, set: { ...values, updatedAt: new Date() } });
      if (isUpdate) report.periodos_dia.atualizados++;
      else report.periodos_dia.criados++;
    }
  });

  // ---- (2) catalogo_itens (chave: codigo_padcom) ----
  log.info("Transmutacao: catalogo_itens");
  await db.transaction(async (tx) => {
    const existing = new Set(
      (await tx.select({ k: catalogoItensTable.codigoPadcom }).from(catalogoItensTable)).map((r) => r.k),
    );
    for (const r of (catalogo.itens_terapeuticos ?? []) as Raw[]) {
      const codigoPadcom = s(r.codigo_padcom);
      if (!codigoPadcom) {
        report.catalogo_itens.pulados++;
        continue;
      }
      const values = {
        codigoPadcom,
        nome: s(r.nome),
        descricao: s(r.descricao),
        categoria: s(r.categoria),
        subCategoria: s(r.sub_categoria),
        disponivel: typeof r.disponivel === "boolean" ? r.disponivel : null,
        preco: typeof r.preco === "number" ? r.preco : null,
        tags: r.tags ?? null,
        blocoId: s(r.bloco_id),
        grau: s(r.grau),
        viaUso: s(r.via_uso),
        frequenciaBase: s(r.frequencia_base),
        composicao: s(r.composicao),
        posologia: s(r.posologia),
        areaSemantica: s(r.area_semantica),
        exigeValidacaoHumana: typeof r.exige_validacao_humana === "boolean" ? r.exige_validacao_humana : null,
        unidadeId: typeof r.unidade_id === "number" ? r.unidade_id : null,
        posologiaEstruturada: r.posologia_estruturada ?? null,
      };
      const isUpdate = existing.has(codigoPadcom);
      await tx
        .insert(catalogoItensTable)
        .values(values)
        .onConflictDoUpdate({ target: catalogoItensTable.codigoPadcom, set: { ...values, updatedAt: new Date() } });
      if (isUpdate) report.catalogo_itens.atualizados++;
      else report.catalogo_itens.criados++;
    }
  });

  // ---- (3) catalogo_formulas (chave: id de origem do IHE) ----
  log.info("Transmutacao: catalogo_formulas");
  await db.transaction(async (tx) => {
    const existing = new Set(
      (await tx.select({ k: catalogoFormulasTable.idIhe }).from(catalogoFormulasTable)).map((r) => r.k),
    );
    for (const r of (catalogo.formulas ?? []) as Raw[]) {
      const idIhe = numId(r.id);
      if (idIhe == null) {
        report.catalogo_formulas.pulados++;
        continue;
      }
      const values = {
        idIhe,
        codigoSemantico: s(r.codigo_semantico),
        codigoPadcom: s(r.codigo_padcom),
        identificador: s(r.identificador),
        conteudo: s(r.conteudo),
        area: s(r.area),
        funcao: s(r.funcao),
        status: s(r.status),
        tipoLinha: s(r.tipo_linha),
        valorUnidade: s(r.valor_unidade),
        origemValor: s(r.origem_valor),
        b1: s(r.b1),
        b2: s(r.b2),
        b3: s(r.b3),
        b4: s(r.b4),
        seq: s(r.seq),
        viaAdministracao: s(r.via_administracao),
        formaFarmaceutica: s(r.forma_farmaceutica),
        posologiaPadrao: r.posologia_padrao ?? null,
        periodosPadrao: r.periodos_padrao ?? null,
        efeitosColaterais: s(r.efeitos_colaterais),
      };
      const isUpdate = existing.has(idIhe);
      await tx
        .insert(catalogoFormulasTable)
        .values(values)
        .onConflictDoUpdate({ target: catalogoFormulasTable.idIhe, set: { ...values, updatedAt: new Date() } });
      if (isUpdate) report.catalogo_formulas.atualizados++;
      else {
        report.catalogo_formulas.criados++;
        existing.add(idIhe);
      }
    }
  });

  // ---- (4) catalogo_injetaveis (chave: id de origem do IHE) ----
  log.info("Transmutacao: catalogo_injetaveis");
  await db.transaction(async (tx) => {
    const existing = new Set(
      (await tx.select({ k: catalogoInjetaveisTable.idIhe }).from(catalogoInjetaveisTable)).map((r) => r.k),
    );
    for (const r of (catalogo.injetaveis ?? []) as Raw[]) {
      const idIhe = numId(r.id);
      if (idIhe == null) {
        report.catalogo_injetaveis.pulados++;
        continue;
      }
      const values = {
        idIhe,
        codigoSemantico: s(r.codigo_semantico),
        codigoPadcom: s(r.codigo_padcom),
        tipoLinha: s(r.tipo_linha),
        nomeAmpola: s(r.nome_ampola),
        nomeExibicao: s(r.nome_exibicao),
        ativo: typeof r.ativo === "boolean" ? r.ativo : null,
        dosagem: s(r.dosagem),
        volume: s(r.volume),
        via: s(r.via),
        valorUnidade: s(r.valor_unidade),
        origemValor: s(r.origem_valor),
        statusCadastro: s(r.status_cadastro),
        observacao: s(r.observacao),
        classificacao: s(r.classificacao),
        eixoIntegrativo: s(r.eixo_integrativo),
        palavraChaveMotor: s(r.palavra_chave_motor),
        b1: s(r.b1),
        b2: s(r.b2),
        b3: s(r.b3),
        b4: s(r.b4),
        seq: s(r.seq),
        substanciaBase: s(r.substancia_base),
      };
      const isUpdate = existing.has(idIhe);
      await tx
        .insert(catalogoInjetaveisTable)
        .values(values)
        .onConflictDoUpdate({ target: catalogoInjetaveisTable.idIhe, set: { ...values, updatedAt: new Date() } });
      if (isUpdate) report.catalogo_injetaveis.atualizados++;
      else {
        report.catalogo_injetaveis.criados++;
        existing.add(idIhe);
      }
    }
  });

  // ---- (5) catalogo_implantes (chave: id de origem do IHE) ----
  log.info("Transmutacao: catalogo_implantes");
  await db.transaction(async (tx) => {
    const existing = new Set(
      (await tx.select({ k: catalogoImplantesTable.idIhe }).from(catalogoImplantesTable)).map((r) => r.k),
    );
    for (const r of (catalogo.implantes ?? []) as Raw[]) {
      const idIhe = numId(r.id);
      if (idIhe == null) {
        report.catalogo_implantes.pulados++;
        continue;
      }
      const values = {
        idIhe,
        codigoPadcom: s(r.codigo_padcom),
        codigoSemantico: s(r.codigo_semantico),
        nomeImplante: s(r.nome_implante),
        substanciaAtiva: s(r.substancia_ativa),
        ativo: typeof r.ativo === "boolean" ? r.ativo : null,
        dosagem: s(r.dosagem),
        unidade: s(r.unidade),
        trocarte: s(r.trocarte),
        liberacaoDiaria: s(r.liberacao_diaria),
        doseRecomendada: s(r.dose_recomendada),
        tempoAcao: s(r.tempo_acao),
        indicacao: s(r.indicacao),
        via: s(r.via),
        valorUnidade: s(r.valor_unidade),
        origemValor: s(r.origem_valor),
        statusCadastro: s(r.status_cadastro),
        observacao: s(r.observacao),
        b1: s(r.b1),
        b2: s(r.b2),
        b3: s(r.b3),
        b4: s(r.b4),
        seq: s(r.seq),
      };
      const isUpdate = existing.has(idIhe);
      await tx
        .insert(catalogoImplantesTable)
        .values(values)
        .onConflictDoUpdate({ target: catalogoImplantesTable.idIhe, set: { ...values, updatedAt: new Date() } });
      if (isUpdate) report.catalogo_implantes.atualizados++;
      else {
        report.catalogo_implantes.criados++;
        existing.add(idIhe);
      }
    }
  });

  // ---- (6) catalogo_blends + ativos (chave: codigo_blend / blend+ordem) ----
  log.info("Transmutacao: catalogo_blends + ativos");
  await db.transaction(async (tx) => {
    const existing = new Set(
      (await tx.select({ k: catalogoBlendsTable.codigoBlend }).from(catalogoBlendsTable)).map((r) => r.k),
    );
    for (const r of (catalogo.blends ?? []) as Raw[]) {
      const codigoBlend = s(r.codigo_blend);
      if (!codigoBlend) {
        report.catalogo_blends.pulados++;
        continue;
      }
      const values = {
        codigoBlend,
        nomeBlend: s(r.nome_blend),
        funcao: s(r.funcao),
        via: s(r.via),
        forma: s(r.forma),
        posologia: s(r.posologia),
        duracao: s(r.duracao),
        objetivo: s(r.objetivo),
        ativo: typeof r.ativo === "boolean" ? r.ativo : null,
        formulaId: typeof r.formula_id === "number" ? r.formula_id : null,
        valorBrl: s(r.valor_brl),
        valorMin: s(r.valor_min),
        valorMax: s(r.valor_max),
      };
      const isUpdate = existing.has(codigoBlend);
      const [row] = await tx
        .insert(catalogoBlendsTable)
        .values(values)
        .onConflictDoUpdate({ target: catalogoBlendsTable.codigoBlend, set: { ...values, updatedAt: new Date() } })
        .returning({ id: catalogoBlendsTable.id });
      if (isUpdate) report.catalogo_blends.atualizados++;
      else report.catalogo_blends.criados++;

      // Children replaced for idempotency (delete + reinsert).
      const hadAtivos = isUpdate
        ? (await tx.select({ id: catalogoBlendAtivosTable.id }).from(catalogoBlendAtivosTable).where(sql`${catalogoBlendAtivosTable.blendId} = ${row.id}`)).length
        : 0;
      if (hadAtivos > 0) {
        await tx.delete(catalogoBlendAtivosTable).where(sql`${catalogoBlendAtivosTable.blendId} = ${row.id}`);
      }
      const ativos = (r.ativos ?? []) as Raw[];
      for (const a of ativos) {
        await tx.insert(catalogoBlendAtivosTable).values({
          blendId: row.id,
          ordem: typeof a.ordem === "number" ? a.ordem : null,
          componente: s(a.componente),
          dosagem: typeof a.dosagem === "number" ? a.dosagem : null,
          unidade: s(a.unidade),
          observacao: s(a.observacao),
          valorBrl: s(a.valor_brl),
          valorMin: s(a.valor_min),
          valorMax: s(a.valor_max),
        });
        if (hadAtivos > 0) report.catalogo_blend_ativos.atualizados++;
        else report.catalogo_blend_ativos.criados++;
      }
    }
  });

  // ---- (7) pacientes (de-dup regra 6.3, sem tag de origem) ----
  log.info("Transmutacao: pacientes");
  await db.transaction(async (tx) => {
    const existingClients = await tx
      .select({
        id: clientsTable.id,
        name: clientsTable.name,
        cpf: clientsTable.cpf,
        phone: clientsTable.phone,
        birthDate: clientsTable.birthDate,
        codigoSemantico: clientsTable.codigoSemantico,
        fichaClinica: clientsTable.fichaClinica,
      })
      .from(clientsTable);

    const bySemantico = new Map<string, number>();
    const byCodExterno = new Map<string, number>();
    const byCpfName = new Map<string, number>();
    const byNameBirthPhone = new Map<string, number>();
    const byIdIhe = new Map<number, number>();
    const cpfNames = new Map<string, Set<string>>();

    const indexClient = (c: {
      id: number;
      name: string | null;
      cpf: string | null;
      phone: string | null;
      birthDate: string | null;
      codigoSemantico: string | null;
      fichaClinica: any;
    }) => {
      const fn = c.name ? firstName(c.name) : "";
      if (c.codigoSemantico) bySemantico.set(c.codigoSemantico, c.id);
      const codExt = s(c.fichaClinica?.codigo_externo);
      if (codExt) byCodExterno.set(codExt, c.id);
      const cpfD = digits(c.cpf);
      if (cpfD && fn) {
        byCpfName.set(`${cpfD}|${fn}`, c.id);
        if (!cpfNames.has(cpfD)) cpfNames.set(cpfD, new Set());
        cpfNames.get(cpfD)!.add(fn);
      }
      const phoneD = digits(c.phone);
      const birth = s(c.birthDate);
      if (fn && birth && phoneD) byNameBirthPhone.set(`${fn}|${birth}|${phoneD}`, c.id);
      const idIheExisting = numId(c.fichaClinica?.id);
      if (idIheExisting != null) byIdIhe.set(idIheExisting, c.id);
    };

    for (const c of existingClients) indexClient(c);

    const updateClient = async (id: number, payload: Raw): Promise<void> => {
      await tx
        .update(clientsTable)
        .set({
          cpf: sql`coalesce(${clientsTable.cpf}, ${payload.cpf})`,
          email: sql`coalesce(${clientsTable.email}, ${payload.email})`,
          phone: sql`coalesce(${clientsTable.phone}, ${payload.phone})`,
          birthDate: sql`coalesce(${clientsTable.birthDate}, ${payload.birthDate})`,
          address: sql`coalesce(${clientsTable.address}, ${payload.address})`,
          pais: sql`coalesce(${clientsTable.pais}, ${payload.pais})`,
          instagram: sql`coalesce(${clientsTable.instagram}, ${payload.instagram})`,
          comoConheceu: sql`coalesce(${clientsTable.comoConheceu}, ${payload.comoConheceu})`,
          notes: sql`coalesce(${clientsTable.notes}, ${payload.notes})`,
          validationPassword: sql`coalesce(${clientsTable.validationPassword}, ${payload.validationPassword})`,
          driveFolderId: sql`coalesce(${clientsTable.driveFolderId}, ${payload.driveFolderId})`,
          codigoSemantico: sql`coalesce(${clientsTable.codigoSemantico}, ${payload.codigoSemantico})`,
          fichaClinica: payload.fichaClinica,
          updatedAt: new Date(),
        })
        .where(sql`${clientsTable.id} = ${id}`);
    };

    const insertClient = async (payload: Raw, needsReview: boolean): Promise<number> => {
      const [row] = await tx
        .insert(clientsTable)
        .values({
          name: payload.name,
          cpf: payload.cpf,
          email: payload.email,
          phone: payload.phone,
          birthDate: payload.birthDate,
          address: payload.address,
          pais: payload.pais ?? "BRASIL",
          instagram: payload.instagram,
          comoConheceu: payload.comoConheceu,
          status: payload.status,
          notes: payload.notes,
          validationPassword: payload.validationPassword,
          driveFolderId: payload.driveFolderId,
          codigoSemantico: payload.codigoSemantico,
          fichaClinica: payload.fichaClinica,
          needsReview,
        })
        .returning({ id: clientsTable.id });
      indexClient({
        id: row.id,
        name: payload.name,
        cpf: payload.cpf,
        phone: payload.phone,
        birthDate: payload.birthDate,
        codigoSemantico: payload.codigoSemantico,
        fichaClinica: payload.fichaClinica,
      });
      return row.id;
    };

    for (const r of (pacientesDoc.pacientes ?? []) as Raw[]) {
      if (r.is_teste === true) {
        report.pacientes.pulados++;
        continue;
      }
      const name = s(r.nome);
      if (!name) {
        report.pacientes.pulados++;
        continue;
      }
      const fn = firstName(name);
      const cpfD = digits(r.cpf);
      const phoneD = digits(r.telefone) || digits(r.whatsapp) || digits(r.telefone_fixo);
      const birth = s(r.data_nascimento);
      const codSem = s(r.codigo_semantico);
      const codExt = s(r.codigo_externo);

      const address =
        [r.endereco, r.numero_endereco, r.complemento, r.bairro, r.cidade, r.estado, r.cep]
          .map((x) => s(x))
          .filter((x): x is string => x != null)
          .join(", ") || null;

      const payload: Raw = {
        name,
        cpf: s(r.cpf),
        email: s(r.email),
        phone: s(r.telefone) ?? s(r.whatsapp) ?? s(r.telefone_fixo),
        birthDate: birth,
        address,
        pais: s(r.pais) ?? "BRASIL",
        instagram: s(r.instagram),
        comoConheceu: s(r.como_nos_conheceu),
        status: r.status_ativo === false ? "inactive" : "active",
        notes: s(r.observacoes),
        validationPassword: s(r.senha_validacao),
        driveFolderId: s(r.google_drive_folder_id),
        codigoSemantico: codSem,
        fichaClinica: r,
      };

      // 1. idempotencia por codigo_semantico
      if (codSem && bySemantico.has(codSem)) {
        await updateClient(bySemantico.get(codSem)!, payload);
        report.pacientes.atualizados++;
        continue;
      }
      // 2. idempotencia por codigo_externo
      if (codExt && byCodExterno.has(codExt)) {
        await updateClient(byCodExterno.get(codExt)!, payload);
        report.pacientes.atualizados++;
        continue;
      }
      // 3. CPF + 1o nome (CPF nunca casa sozinho)
      if (cpfD) {
        const key = `${cpfD}|${fn}`;
        if (byCpfName.has(key)) {
          await updateClient(byCpfName.get(key)!, payload);
          report.pacientes.atualizados++;
          continue;
        }
        const collision = (cpfNames.get(cpfD)?.size ?? 0) > 0; // mesmo CPF, nome diferente
        await insertClient(payload, collision);
        report.pacientes.criados++;
        if (collision) report.pacientes.emRevisao++;
        continue;
      }
      // 4. Sem CPF: 1o nome + data_nascimento + telefone
      if (birth && phoneD) {
        const key = `${fn}|${birth}|${phoneD}`;
        if (byNameBirthPhone.has(key)) {
          await updateClient(byNameBirthPhone.get(key)!, payload);
          report.pacientes.atualizados++;
          continue;
        }
      }
      // 5. Sem chave de negocio estavel: idempotencia por id de origem do IHE (ultimo recurso)
      //    NUNCA promover id_ihe para passos anteriores — quebraria a fusao das fichas
      //    duplicadas da mesma pessoa (que casam por codigo_semantico/codigo_externo/CPF+nome).
      const idIhePac = numId(r.id);
      if (idIhePac != null && byIdIhe.has(idIhePac)) {
        await updateClient(byIdIhe.get(idIhePac)!, payload);
        report.pacientes.atualizados++;
        continue;
      }
      await insertClient(payload, true);
      report.pacientes.criados++;
      report.pacientes.emRevisao++;
    }
  });

  const finishedAt = Date.now();
  report._meta.finalizadoEm = new Date(finishedAt).toISOString();
  report._meta.duracaoMs = finishedAt - startedAt;
  log.info({ report }, "Transmutacao concluida");
  return report;
}
