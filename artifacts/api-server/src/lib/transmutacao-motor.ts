import {
  db,
  catalogoExamesTable,
  catalogoAnalitosTable,
  catalogoBlocosTable,
  catalogoBlocoExamesTable,
  direcaoFavoravelExameTable,
  catalogoEndovenososTable,
  anamneseQuestionarioTable,
  catalogoDoencasTable,
  catalogoSintomasTable,
  catalogoCid10Table,
  motorRegrasTable,
  motorDecisaoClinicaTable,
  mapaAnamneseMotorTable,
} from "@workspace/db";

const RAW_BASE =
  "https://raw.githubusercontent.com/caio-padua/Integrative-Health-Engine/ver-l2-dr-claude/docs/dr-replit/PARA_MANAGER";

export const DEFAULT_EXAMES_URL = `${RAW_BASE}/exames_export_26.06.15.json`;
export const DEFAULT_MOTOR_URL = `${RAW_BASE}/motor_anamnese_sinapses_export_26.06.15.json`;
export const DEFAULT_ENDOVENOSOS_URL = `${RAW_BASE}/endovenosos_export_26.06.15.json`;

type Raw = Record<string, any>;

type Logger = {
  info: (...args: any[]) => void;
  warn: (...args: any[]) => void;
  error: (...args: any[]) => void;
};

const noopLog: Logger = { info: () => {}, warn: () => {}, error: () => {} };

export type CollReport = { criados: number; atualizados: number; pulados: number };

function emptyColl(): CollReport {
  return { criados: 0, atualizados: 0, pulados: 0 };
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

function boolOf(v: unknown): boolean | null {
  return typeof v === "boolean" ? v : null;
}

function intOf(v: unknown): number | null {
  return typeof v === "number" && Number.isInteger(v) ? v : null;
}

async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Falha ao buscar ${url}: HTTP ${res.status}`);
  return res.json();
}

export type TransmutacaoMotorReport = {
  _meta: {
    iniciadoEm: string;
    finalizadoEm: string;
    examesUrl: string;
    motorUrl: string;
    endovenososUrl: string;
    duracaoMs: number;
  };
  catalogo_exames: CollReport;
  catalogo_analitos: CollReport;
  catalogo_blocos: CollReport;
  catalogo_bloco_exames: CollReport;
  direcao_favoravel_exame: CollReport;
  catalogo_endovenosos: CollReport;
  anamnese_questionario: CollReport;
  catalogo_doencas: CollReport;
  catalogo_sintomas: CollReport;
  catalogo_cid10: CollReport;
  motor_regras: CollReport;
  motor_decisao_clinica: CollReport;
  mapa_anamnese_motor: CollReport;
};

export async function runTransmutacaoMotor(opts: {
  examesUrl?: string;
  motorUrl?: string;
  endovenososUrl?: string;
  log?: Logger;
}): Promise<TransmutacaoMotorReport> {
  const log = opts.log ?? noopLog;
  const examesUrl = opts.examesUrl ?? DEFAULT_EXAMES_URL;
  const motorUrl = opts.motorUrl ?? DEFAULT_MOTOR_URL;
  const endovenososUrl = opts.endovenososUrl ?? DEFAULT_ENDOVENOSOS_URL;
  const startedAt = Date.now();

  log.info("Transmutacao motor: buscando 3 exports");
  const [exames, motor, endovenosos] = await Promise.all([
    fetchJson(examesUrl),
    fetchJson(motorUrl),
    fetchJson(endovenososUrl),
  ]);

  const report: TransmutacaoMotorReport = {
    _meta: {
      iniciadoEm: new Date(startedAt).toISOString(),
      finalizadoEm: "",
      examesUrl,
      motorUrl,
      endovenososUrl,
      duracaoMs: 0,
    },
    catalogo_exames: emptyColl(),
    catalogo_analitos: emptyColl(),
    catalogo_blocos: emptyColl(),
    catalogo_bloco_exames: emptyColl(),
    direcao_favoravel_exame: emptyColl(),
    catalogo_endovenosos: emptyColl(),
    anamnese_questionario: emptyColl(),
    catalogo_doencas: emptyColl(),
    catalogo_sintomas: emptyColl(),
    catalogo_cid10: emptyColl(),
    motor_regras: emptyColl(),
    motor_decisao_clinica: emptyColl(),
    mapa_anamnese_motor: emptyColl(),
  };

  // ---- (1) catalogo_exames (chave: codigo_exame) ----
  log.info("Transmutacao motor: catalogo_exames");
  await db.transaction(async (tx) => {
    const existing = new Set(
      (await tx.select({ k: catalogoExamesTable.codigoExame }).from(catalogoExamesTable)).map((r) => r.k),
    );
    for (const r of (exames.exames_base ?? []) as Raw[]) {
      const codigoExame = s(r.codigo_exame);
      if (!codigoExame) {
        report.catalogo_exames.pulados++;
        continue;
      }
      const values = {
        codigoExame,
        codigoSemantico: s(r.codigo_semantico),
        nomeExame: s(r.nome_exame),
        ativo: boolOf(r.ativo),
        grupoPrincipal: s(r.grupo_principal),
        subgrupo: s(r.subgrupo),
        modalidade: s(r.modalidade),
        materialOuSetor: s(r.material_ou_setor),
        blocoOficial: s(r.bloco_oficial),
        grauDoBloco: s(r.grau_do_bloco),
        usaGrade: s(r.usa_grade),
        ordemNoBloco: intOf(r.ordem_no_bloco),
        prioridade: s(r.prioridade),
        exigeValidacaoHumana: s(r.exige_validacao_humana),
        sexoAplicavel: s(r.sexo_aplicavel),
        exameDeRastreio: s(r.exame_de_rastreio),
        exameDeSeguimento: s(r.exame_de_seguimento),
        finalidadePrincipal: s(r.finalidade_principal),
        finalidadeSecundaria: s(r.finalidade_secundaria),
        objetivoPratico: s(r.objetivo_pratico),
        corpoPedido: s(r.corpo_pedido),
        preparo: s(r.preparo),
        b1: s(r.b1),
        b2: s(r.b2),
        b3: s(r.b3),
        b4: s(r.b4),
        seq: s(r.seq),
        dados: r,
      };
      const isUpdate = existing.has(codigoExame);
      await tx
        .insert(catalogoExamesTable)
        .values(values)
        .onConflictDoUpdate({ target: catalogoExamesTable.codigoExame, set: { ...values, updatedAt: new Date() } });
      if (isUpdate) report.catalogo_exames.atualizados++;
      else report.catalogo_exames.criados++;
    }
  });

  // ---- (2) catalogo_analitos (chave: codigo) ----
  log.info("Transmutacao motor: catalogo_analitos");
  await db.transaction(async (tx) => {
    const existing = new Set(
      (await tx.select({ k: catalogoAnalitosTable.codigo }).from(catalogoAnalitosTable)).map((r) => r.k),
    );
    for (const r of (exames.analitos_catalogo ?? []) as Raw[]) {
      const codigo = s(r.codigo);
      if (!codigo) {
        report.catalogo_analitos.pulados++;
        continue;
      }
      const values = {
        codigo,
        nome: s(r.nome),
        sinonimos: r.sinonimos ?? null,
        grupo: s(r.grupo),
        unidadePadraoIntegrativa: s(r.unidade_padrao_integrativa),
        tercoExcelente: s(r.terco_excelente),
        observacaoClinica: s(r.observacao_clinica),
        origemReferencia: s(r.origem_referencia),
        ativo: boolOf(r.ativo),
        zonas: {
          excelente: s(r.nome_zona_excelente),
          aceitavel: s(r.nome_zona_aceitavel),
          atencao: s(r.nome_zona_atencao),
          alerta: s(r.nome_zona_alerta),
          ruim: s(r.nome_zona_ruim),
        },
        codigoSemanticoV4: s(r.codigo_semantico_v4),
      };
      const isUpdate = existing.has(codigo);
      await tx
        .insert(catalogoAnalitosTable)
        .values(values)
        .onConflictDoUpdate({ target: catalogoAnalitosTable.codigo, set: { ...values, updatedAt: new Date() } });
      if (isUpdate) report.catalogo_analitos.atualizados++;
      else report.catalogo_analitos.criados++;
    }
  });

  // ---- (3) catalogo_blocos (chave: codigo_bloco) ----
  log.info("Transmutacao motor: catalogo_blocos");
  await db.transaction(async (tx) => {
    const existing = new Set(
      (await tx.select({ k: catalogoBlocosTable.codigoBloco }).from(catalogoBlocosTable)).map((r) => r.k),
    );
    for (const r of (motor.blocos ?? []) as Raw[]) {
      const codigoBloco = s(r.codigo_bloco);
      if (!codigoBloco) {
        report.catalogo_blocos.pulados++;
        continue;
      }
      const values = {
        codigoBloco,
        nomeBloco: s(r.nome_bloco),
        usaGrade: boolOf(r.usa_grade),
        grausDisponiveis: r.graus_disponiveis ?? null,
        tipoMacro: s(r.tipo_macro),
        totalItensMapeados: intOf(r.total_itens_mapeados),
        observacao: s(r.observacao),
        ativo: boolOf(r.ativo),
        codigoSemantico: s(r.codigo_semantico),
        b1: s(r.b1),
        b2: s(r.b2),
        b3: s(r.b3),
        b4: s(r.b4),
        seq: s(r.seq),
      };
      const isUpdate = existing.has(codigoBloco);
      await tx
        .insert(catalogoBlocosTable)
        .values(values)
        .onConflictDoUpdate({ target: catalogoBlocosTable.codigoBloco, set: { ...values, updatedAt: new Date() } });
      if (isUpdate) report.catalogo_blocos.atualizados++;
      else report.catalogo_blocos.criados++;
    }
  });

  // ---- (4) catalogo_bloco_exames = GRADE (chave: bloco_id+nome_exame+grau) ----
  log.info("Transmutacao motor: catalogo_bloco_exames (grade)");
  await db.transaction(async (tx) => {
    const existing = new Set(
      (
        await tx
          .select({
            b: catalogoBlocoExamesTable.blocoId,
            n: catalogoBlocoExamesTable.nomeExame,
            g: catalogoBlocoExamesTable.grau,
          })
          .from(catalogoBlocoExamesTable)
      ).map((r) => `${r.b}|${r.n}|${r.g}`),
    );
    for (const r of (exames.mapa_bloco_exame ?? []) as Raw[]) {
      const blocoId = s(r.bloco_id);
      const nomeExame = s(r.nome_exame);
      const grau = s(r.grau);
      if (!blocoId || !nomeExame || !grau) {
        report.catalogo_bloco_exames.pulados++;
        continue;
      }
      const values = {
        blocoId,
        nomeBloco: s(r.nome_bloco),
        usaGrade: boolOf(r.usa_grade),
        grau,
        ordemNoBloco: intOf(r.ordem_no_bloco),
        nomeExame,
        codigoPadcom: s(r.codigo_padcom),
        codigoLegado: s(r.codigo_legado),
        ativo: boolOf(r.ativo),
      };
      const isUpdate = existing.has(`${blocoId}|${nomeExame}|${grau}`);
      await tx
        .insert(catalogoBlocoExamesTable)
        .values(values)
        .onConflictDoUpdate({
          target: [catalogoBlocoExamesTable.blocoId, catalogoBlocoExamesTable.nomeExame, catalogoBlocoExamesTable.grau],
          set: { ...values, updatedAt: new Date() },
        });
      if (isUpdate) report.catalogo_bloco_exames.atualizados++;
      else report.catalogo_bloco_exames.criados++;
    }
  });

  // ---- (5) direcao_favoravel_exame (chave: nome_exame) ----
  log.info("Transmutacao motor: direcao_favoravel_exame");
  await db.transaction(async (tx) => {
    const existing = new Set(
      (await tx.select({ k: direcaoFavoravelExameTable.nomeExame }).from(direcaoFavoravelExameTable)).map((r) => r.k),
    );
    for (const r of (exames.direcao_favoravel_exame ?? []) as Raw[]) {
      const nomeExame = s(r.nome_exame);
      if (!nomeExame) {
        report.direcao_favoravel_exame.pulados++;
        continue;
      }
      const values = {
        nomeExame,
        direcaoFavoravel: s(r.direcao_favoravel),
        grupoExame: s(r.grupo_exame),
        descricao: s(r.descricao),
      };
      const isUpdate = existing.has(nomeExame);
      await tx
        .insert(direcaoFavoravelExameTable)
        .values(values)
        .onConflictDoUpdate({ target: direcaoFavoravelExameTable.nomeExame, set: { ...values, updatedAt: new Date() } });
      if (isUpdate) report.direcao_favoravel_exame.atualizados++;
      else report.direcao_favoravel_exame.criados++;
    }
  });

  // ---- (6) catalogo_endovenosos (chave: id de origem) ----
  log.info("Transmutacao motor: catalogo_endovenosos");
  await db.transaction(async (tx) => {
    const existing = new Set(
      (await tx.select({ k: catalogoEndovenososTable.idIhe }).from(catalogoEndovenososTable)).map((r) => r.k),
    );
    for (const r of (endovenosos.endovenosos ?? []) as Raw[]) {
      const idIhe = numId(r.id);
      if (idIhe == null) {
        report.catalogo_endovenosos.pulados++;
        continue;
      }
      const values = {
        idIhe,
        codigoPadcom: s(r.codigo_padcom),
        tipoLinha: s(r.tipo_linha),
        nomeSoro: s(r.nome_soro),
        nomeExibicao: s(r.nome_exibicao),
        ativo: boolOf(r.ativo),
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
        frequenciaPadrao: s(r.frequencia_padrao),
        complementar: s(r.complementar),
        codigoSemantico: s(r.codigo_semantico),
        b1: s(r.b1),
        b2: s(r.b2),
        b3: s(r.b3),
        b4: s(r.b4),
        seq: s(r.seq),
      };
      const isUpdate = existing.has(idIhe);
      await tx
        .insert(catalogoEndovenososTable)
        .values(values)
        .onConflictDoUpdate({ target: catalogoEndovenososTable.idIhe, set: { ...values, updatedAt: new Date() } });
      if (isUpdate) report.catalogo_endovenosos.atualizados++;
      else report.catalogo_endovenosos.criados++;
    }
  });

  // ---- (7) anamnese_questionario (chave: id de origem) ----
  log.info("Transmutacao motor: anamnese_questionario");
  await db.transaction(async (tx) => {
    const existing = new Set(
      (await tx.select({ k: anamneseQuestionarioTable.idIhe }).from(anamneseQuestionarioTable)).map((r) => r.k),
    );
    for (const r of (motor.questionario_master ?? []) as Raw[]) {
      const idIhe = numId(r.id);
      if (idIhe == null) {
        report.anamnese_questionario.pulados++;
        continue;
      }
      const values = {
        idIhe,
        bloco: s(r.bloco),
        perguntaId: s(r.pergunta_id),
        pergunta: s(r.pergunta),
        tipoResposta: s(r.tipo_resposta),
        obrigatorio: s(r.obrigatorio),
        exemplo: s(r.exemplo),
        observacao: s(r.observacao),
        aplicavelEm: r.aplicavel_em ?? null,
      };
      const isUpdate = existing.has(idIhe);
      await tx
        .insert(anamneseQuestionarioTable)
        .values(values)
        .onConflictDoUpdate({ target: anamneseQuestionarioTable.idIhe, set: { ...values, updatedAt: new Date() } });
      if (isUpdate) report.anamnese_questionario.atualizados++;
      else report.anamnese_questionario.criados++;
    }
  });

  // ---- (8) catalogo_doencas (chave: id de origem) ----
  log.info("Transmutacao motor: catalogo_doencas");
  await db.transaction(async (tx) => {
    const existing = new Set(
      (await tx.select({ k: catalogoDoencasTable.idIhe }).from(catalogoDoencasTable)).map((r) => r.k),
    );
    for (const r of (motor.doencas ?? []) as Raw[]) {
      const idIhe = numId(r.id);
      if (idIhe == null) {
        report.catalogo_doencas.pulados++;
        continue;
      }
      const values = {
        idIhe,
        codigoDoenca: s(r.codigo_doenca),
        grupo: s(r.grupo),
        nomeDoenca: s(r.nome_doenca),
        codigoLegado: s(r.codigo_legado),
        eixo: s(r.eixo),
        blocoMotor: s(r.bloco_motor),
        blocosMotor: s(r.blocos_motor),
        observacao: s(r.observacao),
        ativo: boolOf(r.ativo),
        codigoSemantico: s(r.codigo_semantico),
        codigoV14: s(r.codigo_v14),
        b1: s(r.b1),
        b2: s(r.b2),
        b3: s(r.b3),
        b4: s(r.b4),
        seq: s(r.seq),
      };
      const isUpdate = existing.has(idIhe);
      await tx
        .insert(catalogoDoencasTable)
        .values(values)
        .onConflictDoUpdate({ target: catalogoDoencasTable.idIhe, set: { ...values, updatedAt: new Date() } });
      if (isUpdate) report.catalogo_doencas.atualizados++;
      else report.catalogo_doencas.criados++;
    }
  });

  // ---- (9) catalogo_sintomas (chave: codigo_semantico) ----
  log.info("Transmutacao motor: catalogo_sintomas");
  await db.transaction(async (tx) => {
    const existing = new Set(
      (await tx.select({ k: catalogoSintomasTable.codigoSemantico }).from(catalogoSintomasTable)).map((r) => r.k),
    );
    for (const r of (motor.sintomas ?? []) as Raw[]) {
      const codigoSemantico = s(r.codigo_semantico);
      if (!codigoSemantico) {
        report.catalogo_sintomas.pulados++;
        continue;
      }
      const values = {
        codigoSemantico,
        nomeSintoma: s(r.nome_sintoma),
        ativo: boolOf(r.ativo),
        b1: s(r.b1),
        b2: s(r.b2),
        b3: s(r.b3),
        b4: s(r.b4),
        seq: s(r.seq),
      };
      const isUpdate = existing.has(codigoSemantico);
      await tx
        .insert(catalogoSintomasTable)
        .values(values)
        .onConflictDoUpdate({ target: catalogoSintomasTable.codigoSemantico, set: { ...values, updatedAt: new Date() } });
      if (isUpdate) report.catalogo_sintomas.atualizados++;
      else report.catalogo_sintomas.criados++;
    }
  });

  // ---- (10) catalogo_cid10 (chave: codigo) ----
  log.info("Transmutacao motor: catalogo_cid10");
  await db.transaction(async (tx) => {
    const existing = new Set(
      (await tx.select({ k: catalogoCid10Table.codigo }).from(catalogoCid10Table)).map((r) => r.k),
    );
    for (const r of (motor.cid10 ?? []) as Raw[]) {
      const codigo = s(r.codigo);
      if (!codigo) {
        report.catalogo_cid10.pulados++;
        continue;
      }
      const values = {
        codigo,
        capitulo: s(r.capitulo),
        hdAssociadoPrincipal: s(r.hd_associado_principal),
        descricaoOficial: s(r.descricao_oficial),
        origem: s(r.origem),
      };
      const isUpdate = existing.has(codigo);
      await tx
        .insert(catalogoCid10Table)
        .values(values)
        .onConflictDoUpdate({ target: catalogoCid10Table.codigo, set: { ...values, updatedAt: new Date() } });
      if (isUpdate) report.catalogo_cid10.atualizados++;
      else report.catalogo_cid10.criados++;
    }
  });

  // ---- (11) motor_regras (chave: id de origem) ----
  log.info("Transmutacao motor: motor_regras");
  await db.transaction(async (tx) => {
    const existing = new Set(
      (await tx.select({ k: motorRegrasTable.idIhe }).from(motorRegrasTable)).map((r) => r.k),
    );
    for (const r of (motor.regras_motor ?? []) as Raw[]) {
      const idIhe = numId(r.id);
      if (idIhe == null) {
        report.motor_regras.pulados++;
        continue;
      }
      const values = {
        idIhe,
        regraId: s(r.regra_id),
        perguntaId: s(r.pergunta_id),
        palavraChave: s(r.palavra_chave),
        segmento: s(r.segmento),
        codigoReferencia: s(r.codigo_referencia),
        blocoReferencia: s(r.bloco_referencia),
        prioridade: s(r.prioridade),
        observacao: s(r.observacao),
        ativo: s(r.ativo),
        codigoReferenciaV4: s(r.codigo_referencia_v4),
      };
      const isUpdate = existing.has(idIhe);
      await tx
        .insert(motorRegrasTable)
        .values(values)
        .onConflictDoUpdate({ target: motorRegrasTable.idIhe, set: { ...values, updatedAt: new Date() } });
      if (isUpdate) report.motor_regras.atualizados++;
      else report.motor_regras.criados++;
    }
  });

  // ---- (12) motor_decisao_clinica (chave: caso_id) ----
  log.info("Transmutacao motor: motor_decisao_clinica");
  await db.transaction(async (tx) => {
    const existing = new Set(
      (await tx.select({ k: motorDecisaoClinicaTable.casoId }).from(motorDecisaoClinicaTable)).map((r) => r.k),
    );
    for (const r of (motor.motor_decisao_clinica ?? []) as Raw[]) {
      const casoId = s(r.caso_id);
      if (!casoId) {
        report.motor_decisao_clinica.pulados++;
        continue;
      }
      const values = {
        casoId,
        palavraChave: s(r.palavra_chave),
        codigoDoenca: s(r.codigo_doenca),
        eixo: s(r.eixo),
        codigoExame: s(r.codigo_exame),
        nomeExame: s(r.nome_exame),
        codigoFormula: s(r.codigo_formula),
        nomeFormula: s(r.nome_formula),
        codigoInjetavel: s(r.codigo_injetavel),
        nomeInjetavel: s(r.nome_injetavel),
        codigoImplante: s(r.codigo_implante),
        nomeImplante: s(r.nome_implante),
        codigoProtocolo: s(r.codigo_protocolo),
        nomeProtocolo: s(r.nome_protocolo),
        valorExame: s(r.valor_exame),
        valorFormula: s(r.valor_formula),
        valorInjetavel: s(r.valor_injetavel),
        valorImplante: s(r.valor_implante),
        valorTotal: s(r.valor_total),
      };
      const isUpdate = existing.has(casoId);
      await tx
        .insert(motorDecisaoClinicaTable)
        .values(values)
        .onConflictDoUpdate({ target: motorDecisaoClinicaTable.casoId, set: { ...values, updatedAt: new Date() } });
      if (isUpdate) report.motor_decisao_clinica.atualizados++;
      else report.motor_decisao_clinica.criados++;
    }
  });

  // ---- (13) mapa_anamnese_motor (chave: id de origem) ----
  log.info("Transmutacao motor: mapa_anamnese_motor");
  await db.transaction(async (tx) => {
    const existing = new Set(
      (await tx.select({ k: mapaAnamneseMotorTable.idIhe }).from(mapaAnamneseMotorTable)).map((r) => r.k),
    );
    for (const r of (motor.mapa_anamnese_motor ?? []) as Raw[]) {
      const idIhe = numId(r.id);
      if (idIhe == null) {
        report.mapa_anamnese_motor.pulados++;
        continue;
      }
      const values = {
        idIhe,
        perguntaId: s(r.pergunta_id),
        palavraChave: s(r.palavra_chave),
        codigoDoenca: s(r.codigo_doenca),
        eixo: s(r.eixo),
        codigoExame: s(r.codigo_exame),
        nomeExame: s(r.nome_exame),
        codigoFormula: s(r.codigo_formula),
        nomeFormula: s(r.nome_formula),
        codigoInjetavel: s(r.codigo_injetavel),
        nomeInjetavel: s(r.nome_injetavel),
        codigoImplante: s(r.codigo_implante),
        nomeImplante: s(r.nome_implante),
        codigoProtocolo: s(r.codigo_protocolo),
        nomeProtocolo: s(r.nome_protocolo),
        validacaoHumana: s(r.validacao_humana),
      };
      const isUpdate = existing.has(idIhe);
      await tx
        .insert(mapaAnamneseMotorTable)
        .values(values)
        .onConflictDoUpdate({ target: mapaAnamneseMotorTable.idIhe, set: { ...values, updatedAt: new Date() } });
      if (isUpdate) report.mapa_anamnese_motor.atualizados++;
      else report.mapa_anamnese_motor.criados++;
    }
  });

  const finishedAt = Date.now();
  report._meta.finalizadoEm = new Date(finishedAt).toISOString();
  report._meta.duracaoMs = finishedAt - startedAt;
  log.info({ report }, "Transmutacao motor concluida");
  return report;
}
