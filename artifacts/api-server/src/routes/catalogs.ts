import { Router, type IRouter } from "express";
import {
  db,
  catalogoInjetaveisTable,
  catalogoImplantesTable,
  catalogoEndovenososTable,
  catalogoExamesTable,
  catalogoAnalitosTable,
  catalogoFormulasTable,
} from "@workspace/db";
import { asc } from "drizzle-orm";

const router: IRouter = Router();

// ---- Catalogos read-only para a Central de Catalogos ----
// Cada endpoint devolve um array simples de linhas. O filtro/busca fica no
// frontend (poucas centenas de linhas por catalogo). O catalogo de exames
// omite a coluna jsonb "dados" (linha crua de 68 colunas) para nao inflar o
// payload de 280 linhas.

router.get("/catalogos/injetaveis", async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      id: catalogoInjetaveisTable.id,
      codigoPadcom: catalogoInjetaveisTable.codigoPadcom,
      nomeExibicao: catalogoInjetaveisTable.nomeExibicao,
      nomeAmpola: catalogoInjetaveisTable.nomeAmpola,
      dosagem: catalogoInjetaveisTable.dosagem,
      volume: catalogoInjetaveisTable.volume,
      via: catalogoInjetaveisTable.via,
      classificacao: catalogoInjetaveisTable.classificacao,
      eixoIntegrativo: catalogoInjetaveisTable.eixoIntegrativo,
      observacao: catalogoInjetaveisTable.observacao,
      ativo: catalogoInjetaveisTable.ativo,
    })
    .from(catalogoInjetaveisTable)
    .orderBy(asc(catalogoInjetaveisTable.nomeExibicao));
  res.json(rows);
});

router.get("/catalogos/implantes", async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      id: catalogoImplantesTable.id,
      codigoPadcom: catalogoImplantesTable.codigoPadcom,
      nomeImplante: catalogoImplantesTable.nomeImplante,
      substanciaAtiva: catalogoImplantesTable.substanciaAtiva,
      dosagem: catalogoImplantesTable.dosagem,
      unidade: catalogoImplantesTable.unidade,
      doseRecomendada: catalogoImplantesTable.doseRecomendada,
      liberacaoDiaria: catalogoImplantesTable.liberacaoDiaria,
      tempoAcao: catalogoImplantesTable.tempoAcao,
      indicacao: catalogoImplantesTable.indicacao,
      via: catalogoImplantesTable.via,
      ativo: catalogoImplantesTable.ativo,
    })
    .from(catalogoImplantesTable)
    .orderBy(asc(catalogoImplantesTable.nomeImplante));
  res.json(rows);
});

router.get("/catalogos/endovenosos", async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      id: catalogoEndovenososTable.id,
      codigoPadcom: catalogoEndovenososTable.codigoPadcom,
      nomeSoro: catalogoEndovenososTable.nomeSoro,
      nomeExibicao: catalogoEndovenososTable.nomeExibicao,
      dosagem: catalogoEndovenososTable.dosagem,
      volume: catalogoEndovenososTable.volume,
      via: catalogoEndovenososTable.via,
      classificacao: catalogoEndovenososTable.classificacao,
      eixoIntegrativo: catalogoEndovenososTable.eixoIntegrativo,
      frequenciaPadrao: catalogoEndovenososTable.frequenciaPadrao,
      ativo: catalogoEndovenososTable.ativo,
    })
    .from(catalogoEndovenososTable)
    .orderBy(asc(catalogoEndovenososTable.nomeExibicao));
  res.json(rows);
});

router.get("/catalogos/exames", async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      id: catalogoExamesTable.id,
      codigoExame: catalogoExamesTable.codigoExame,
      nomeExame: catalogoExamesTable.nomeExame,
      grupoPrincipal: catalogoExamesTable.grupoPrincipal,
      subgrupo: catalogoExamesTable.subgrupo,
      modalidade: catalogoExamesTable.modalidade,
      materialOuSetor: catalogoExamesTable.materialOuSetor,
      finalidadePrincipal: catalogoExamesTable.finalidadePrincipal,
      preparo: catalogoExamesTable.preparo,
      sexoAplicavel: catalogoExamesTable.sexoAplicavel,
      exameDeRastreio: catalogoExamesTable.exameDeRastreio,
      ativo: catalogoExamesTable.ativo,
    })
    .from(catalogoExamesTable)
    .orderBy(asc(catalogoExamesTable.grupoPrincipal), asc(catalogoExamesTable.nomeExame));
  res.json(rows);
});

router.get("/catalogos/analitos", async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      id: catalogoAnalitosTable.id,
      codigo: catalogoAnalitosTable.codigo,
      nome: catalogoAnalitosTable.nome,
      grupo: catalogoAnalitosTable.grupo,
      unidadePadraoIntegrativa: catalogoAnalitosTable.unidadePadraoIntegrativa,
      tercoExcelente: catalogoAnalitosTable.tercoExcelente,
      observacaoClinica: catalogoAnalitosTable.observacaoClinica,
      ativo: catalogoAnalitosTable.ativo,
    })
    .from(catalogoAnalitosTable)
    .orderBy(asc(catalogoAnalitosTable.grupo), asc(catalogoAnalitosTable.nome));
  res.json(rows);
});

router.get("/catalogos/formulas", async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      id: catalogoFormulasTable.id,
      codigoPadcom: catalogoFormulasTable.codigoPadcom,
      identificador: catalogoFormulasTable.identificador,
      conteudo: catalogoFormulasTable.conteudo,
      area: catalogoFormulasTable.area,
      funcao: catalogoFormulasTable.funcao,
      viaAdministracao: catalogoFormulasTable.viaAdministracao,
      formaFarmaceutica: catalogoFormulasTable.formaFarmaceutica,
      status: catalogoFormulasTable.status,
    })
    .from(catalogoFormulasTable)
    .orderBy(asc(catalogoFormulasTable.area), asc(catalogoFormulasTable.identificador));
  res.json(rows);
});

export default router;
