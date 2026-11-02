import { Router, type IRouter } from "express";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import {
  CreateLocationSemanticCodeParams,
  CreateLocationSemanticCodeResponse,
  UpdateCompanySemanticCodeClassificationBody,
  UpdateCompanySemanticCodeClassificationParams,
  UpdateCompanySemanticCodeClassificationResponse,
} from "@workspace/api-zod";
import { db, empresasTable, locationsTable } from "@workspace/db";
import { requireCollaborator } from "./collaborator";
import { requirePlatformOwner } from "../middleware/tenantContext";
import {
  deriveSemanticBase,
  formatSemanticCode,
  isSemanticRelation,
  isValidCnpj,
  normalizeCnpj,
  SEMANTIC_RELATIONS,
} from "../lib/semantic-codes";

const router: IRouter = Router();

router.get("/semantic-codes/companies", requireCollaborator, async (req, res): Promise<void> => {
  const allCompanies = await db.select().from(empresasTable);
  const clinicalCompanies = allCompanies.filter((company) =>
    company.tipo === "clinic" &&
    company.ativa &&
    company.status !== "ARQUIVADA" &&
    !company.isPlatformOwner
  );
  const visibleCompanies = req.tenantContext.isPlatformOwner
    ? clinicalCompanies
    : req.tenantContext.empresaId
      ? clinicalCompanies.filter((company) => company.id === req.tenantContext.empresaId)
      : [];
  const namesByCnpj = new Map<string, string[]>();
  for (const company of clinicalCompanies) {
    const digits = company.cnpj ? normalizeCnpj(company.cnpj) : "";
    if (digits.length !== 14) continue;
    namesByCnpj.set(digits, [...(namesByCnpj.get(digits) ?? []), company.nome]);
  }

  res.json(visibleCompanies.map((company) => {
    const digits = company.cnpj ? normalizeCnpj(company.cnpj) : "";
    const sameCnpjNames = namesByCnpj.get(digits) ?? [];
    return {
      id: company.id,
      nome: company.nome,
      // CNPJ completo só é necessário e visível para o CEO nesta ferramenta.
      cnpj: req.tenantContext.isPlatformOwner ? company.cnpj : null,
      codigoVinculoSemantico: company.codigoVinculoSemantico,
      codigoBaseSemantico: company.codigoBaseSemantico,
      ativa: company.ativa,
      cnpjValido: Boolean(company.cnpj && isValidCnpj(company.cnpj)),
      cnpjDuplicado: req.tenantContext.isPlatformOwner && sameCnpjNames.length > 1,
      empresasComMesmoCnpj: req.tenantContext.isPlatformOwner ? sameCnpjNames : [],
    };
  }));
});

router.get("/semantic-codes/locations", requireCollaborator, async (req, res): Promise<void> => {
  if (!req.tenantContext.isPlatformOwner && !req.tenantContext.empresaId) {
    res.json([]);
    return;
  }
  const companies = await db.select().from(empresasTable);
  const visibleCompanyIds = new Set(companies
    .filter((company) =>
      company.tipo === "clinic" &&
      company.status !== "ARQUIVADA" &&
      company.ativa &&
      !company.isPlatformOwner &&
      (req.tenantContext.isPlatformOwner || company.id === req.tenantContext.empresaId)
    )
    .map((company) => company.id));
  const locations = await db.select().from(locationsTable);
  res.json(locations.filter((location) =>
    location.empresaId !== null && visibleCompanyIds.has(location.empresaId)
  ).map((location) => ({
    locationId: location.id,
    name: location.name,
    empresaId: location.empresaId,
    codigoSemantico: location.codigoSemantico,
    codigoSequencial: location.codigoSequencial,
    active: location.active === "true",
  })));
});

router.put(
  "/empresas/:id/codigo-semantico",
  requireCollaborator,
  requirePlatformOwner,
  async (req, res): Promise<void> => {
    const params = UpdateCompanySemanticCodeClassificationParams.safeParse(req.params);
    const body = UpdateCompanySemanticCodeClassificationBody.safeParse(req.body);
    if (!params.success || !body.success || !isSemanticRelation(body.data.vinculo)) {
      res.status(400).json({ error: "Informe uma classificação semântica válida." });
      return;
    }

    const result = await db.transaction(async (tx) => {
      const [company] = await tx.select().from(empresasTable)
        .where(eq(empresasTable.id, params.data.id))
        .for("update")
        .limit(1);
      if (!company) {
        return { status: 404, body: { error: "Empresa não encontrada." } };
      }
      if (
        company.tipo !== "clinic" ||
        company.isPlatformOwner ||
        !company.ativa ||
        company.status === "ARQUIVADA"
      ) {
        return { status: 409, body: { error: "Somente empresas clínicas ativas podem receber classificação semântica." } };
      }

      const [issuedLocation] = await tx.select({ id: locationsTable.id })
        .from(locationsTable)
        .where(and(
          eq(locationsTable.empresaId, company.id),
          isNotNull(locationsTable.codigoSemantico),
        ))
        .limit(1);
      if (issuedLocation && company.codigoVinculoSemantico !== body.data.vinculo) {
        return {
          status: 409,
          body: { error: "A classificação não pode mudar depois que uma unidade recebeu código. O código emitido é imutável." },
        };
      }

      const base = company.codigoBaseSemantico ?? deriveSemanticBase(company.nome);
      if (!base) {
        return {
          status: 422,
          body: { error: "O nome da empresa não gera quatro letras. Corrija o nome principal antes de classificar." },
        };
      }

      const [updated] = await tx.update(empresasTable)
        .set({
          codigoVinculoSemantico: body.data.vinculo,
          atualizadoEm: new Date(),
        })
        .where(eq(empresasTable.id, company.id))
        .returning();

      return {
        status: 200,
        body: UpdateCompanySemanticCodeClassificationResponse.parse({
          empresaId: updated.id,
          vinculo: updated.codigoVinculoSemantico,
          codigoVinculo: SEMANTIC_RELATIONS[body.data.vinculo].code,
          codigoBase: updated.codigoBaseSemantico,
        }),
      };
    });
    res.status(result.status).json(result.body);
  },
);

router.post(
  "/locations/:id/codigo-semantico",
  requireCollaborator,
  requirePlatformOwner,
  async (req, res): Promise<void> => {
    const params = CreateLocationSemanticCodeParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Identificador de unidade inválido." });
      return;
    }

    const result = await db.transaction(async (tx) => {
      const [snapshot] = await tx.select().from(locationsTable)
        .where(eq(locationsTable.id, params.data.id))
        .limit(1);
      if (!snapshot) {
        return { status: 404, body: { error: "Unidade clínica não encontrada." } };
      }
      if (!snapshot.empresaId) {
        return {
          status: 409,
          body: { code: "UNIDADE_SEM_EMPRESA", error: "Vincule a unidade a uma empresa no servidor antes de emitir o código." },
        };
      }

      // Lock company first, then location. Classification and CNPJ edits use the same order.
      const [company] = await tx.select().from(empresasTable)
        .where(eq(empresasTable.id, snapshot.empresaId))
        .for("update")
        .limit(1);
      if (!company) {
        return { status: 409, body: { code: "EMPRESA_NAO_ENCONTRADA", error: "A empresa vinculada à unidade não existe." } };
      }
      const [location] = await tx.select().from(locationsTable)
        .where(eq(locationsTable.id, snapshot.id))
        .for("update")
        .limit(1);
      if (!location || location.empresaId !== company.id) {
        return {
          status: 409,
          body: { error: "O vínculo da unidade mudou durante a emissão. Atualize a tela e tente novamente." },
        };
      }

      if (location.codigoSemantico) {
        const parts = location.codigoSemantico.split(".");
        const saved = CreateLocationSemanticCodeResponse.safeParse({
          locationId: location.id,
          empresaId: location.empresaId,
          codigo: location.codigoSemantico,
          codigoBase: parts[0],
          codigoVinculo: parts[1],
          cnpjPrefixo: parts[2],
          sequencia: location.codigoSequencial,
        });
        if (!saved.success) {
          return { status: 500, body: { error: "O código já salvo está inconsistente; não foi alterado." } };
        }
        return { status: 200, body: saved.data };
      }

      if (
        company.tipo !== "clinic" ||
        company.isPlatformOwner ||
        !company.ativa ||
        company.status !== "ATIVO"
      ) {
        return { status: 409, body: { code: "EMPRESA_INATIVA", error: "A empresa está inativa; o código não foi emitido." } };
      }
      if (!company.cnpj || !isValidCnpj(company.cnpj)) {
        return { status: 409, body: { code: "CNPJ_INVALIDO", error: "O cadastro da empresa precisa de um CNPJ válido antes da emissão." } };
      }

      const normalizedCnpj = normalizeCnpj(company.cnpj);
      const companiesWithCnpj = await tx.select({
        id: empresasTable.id,
        cnpj: empresasTable.cnpj,
        tipo: empresasTable.tipo,
        status: empresasTable.status,
        ativa: empresasTable.ativa,
        isPlatformOwner: empresasTable.isPlatformOwner,
      }).from(empresasTable).where(isNotNull(empresasTable.cnpj));
      const duplicate = companiesWithCnpj.some((item) =>
        item.id !== company.id &&
        item.tipo === "clinic" &&
        item.ativa &&
        item.status !== "ARQUIVADA" &&
        !item.isPlatformOwner &&
        item.cnpj !== null &&
        normalizeCnpj(item.cnpj) === normalizedCnpj
      );
      if (duplicate) {
        return { status: 409, body: { code: "CNPJ_DUPLICADO", error: "O CNPJ completo aparece em mais de uma empresa; resolva a duplicidade antes de emitir." } };
      }
      if (!company.codigoVinculoSemantico || !isSemanticRelation(company.codigoVinculoSemantico)) {
        return { status: 409, body: { code: "VINCULO_NAO_SELECIONADO", error: "O CEO precisa escolher a classificação interna da empresa." } };
      }
      if (!location.codigoSequencial || location.codigoSequencial > 9999) {
        return { status: 409, body: { code: "SEQUENCIA_INVALIDA", error: "A unidade não tem uma sequência disponível de quatro dígitos." } };
      }

      const base = company.codigoBaseSemantico ?? deriveSemanticBase(company.nome);
      if (!base) {
        return { status: 409, body: { code: "NOME_SEM_BASE", error: "O nome principal da empresa não gera quatro letras para o código." } };
      }
      const code = formatSemanticCode({
        base,
        relation: company.codigoVinculoSemantico,
        cnpj: company.cnpj,
        sequence: location.codigoSequencial,
      });
      if (!code) {
        return { status: 409, body: { code: "CODIGO_NAO_GERADO", error: "Não foi possível montar um código válido com os dados conferidos." } };
      }

      if (!company.codigoBaseSemantico) {
        await tx.update(empresasTable)
          .set({ codigoBaseSemantico: base, atualizadoEm: new Date() })
          .where(eq(empresasTable.id, company.id));
      }

      const [updated] = await tx.update(locationsTable)
        .set({ codigoSemantico: code })
        .where(and(
          eq(locationsTable.id, location.id),
          isNull(locationsTable.codigoSemantico),
        ))
        .returning();
      if (!updated) {
        return { status: 409, body: { error: "A unidade mudou durante a emissão. Atualize a tela e tente novamente." } };
      }

      return {
        status: 200,
        body: CreateLocationSemanticCodeResponse.parse({
          locationId: updated.id,
          empresaId: updated.empresaId,
          codigo: updated.codigoSemantico,
          codigoBase: base,
          codigoVinculo: SEMANTIC_RELATIONS[company.codigoVinculoSemantico].code,
          cnpjPrefixo: normalizedCnpj.slice(0, 4),
          sequencia: updated.codigoSequencial,
        }),
      };
    });
    res.status(result.status).json(result.body);
  },
);

export default router;
