import { Router, type IRouter, type Response } from "express";
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

function sendConflict(res: Response, code: string, error: string): void {
  res.status(409).json({ code, error });
}

router.get("/semantic-codes/companies", requireCollaborator, async (req, res): Promise<void> => {
  const allCompanies = await db.select().from(empresasTable);
  const visibleCompanies = req.tenantContext.isPlatformOwner
    ? allCompanies
    : allCompanies.filter((company) => company.id === req.tenantContext.empresaId);
  const namesByCnpj = new Map<string, string[]>();
  for (const company of allCompanies) {
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
      cnpjDuplicado: sameCnpjNames.length > 1,
      empresasComMesmoCnpj: sameCnpjNames,
    };
  }));
});

router.get("/semantic-codes/locations", requireCollaborator, async (req, res): Promise<void> => {
  const locations = req.tenantContext.isPlatformOwner
    ? await db.select().from(locationsTable)
    : await db.select().from(locationsTable)
      .where(eq(locationsTable.empresaId, req.tenantContext.empresaId));
  res.json(locations.map((location) => ({
    locationId: location.id,
    name: location.name,
    empresaId: location.empresaId,
    codigoSemantico: location.codigoSemantico,
    codigoSequencial: location.codigoSequencial,
    active: location.active,
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

    const [company] = await db.select().from(empresasTable)
      .where(eq(empresasTable.id, params.data.id))
      .limit(1);
    if (!company) {
      res.status(404).json({ error: "Empresa não encontrada." });
      return;
    }

    const base = company.codigoBaseSemantico ?? deriveSemanticBase(company.nome);
    if (!base) {
      res.status(422).json({
        error: "O nome da empresa não gera quatro letras. Corrija o nome principal antes de classificar.",
      });
      return;
    }

    const [updated] = await db.update(empresasTable)
      .set({
        codigoVinculoSemantico: body.data.vinculo,
        codigoBaseSemantico: base,
        atualizadoEm: new Date(),
      })
      .where(eq(empresasTable.id, company.id))
      .returning();

    res.json(UpdateCompanySemanticCodeClassificationResponse.parse({
      empresaId: updated.id,
      vinculo: updated.codigoVinculoSemantico,
      codigoVinculo: SEMANTIC_RELATIONS[body.data.vinculo].code,
      codigoBase: updated.codigoBaseSemantico,
    }));
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

    const [location] = await db.select().from(locationsTable)
      .where(eq(locationsTable.id, params.data.id))
      .limit(1);
    if (!location) {
      res.status(404).json({ error: "Unidade clínica não encontrada." });
      return;
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
        res.status(500).json({ error: "O código já salvo está inconsistente; não foi alterado." });
        return;
      }
      res.json(saved.data);
      return;
    }

    if (!location.empresaId) {
      sendConflict(res, "UNIDADE_SEM_EMPRESA", "Vincule a unidade a uma empresa no servidor antes de emitir o código.");
      return;
    }

    const [company] = await db.select().from(empresasTable)
      .where(eq(empresasTable.id, location.empresaId))
      .limit(1);
    if (!company) {
      sendConflict(res, "EMPRESA_NAO_ENCONTRADA", "A empresa vinculada à unidade não existe.");
      return;
    }
    if (!company.ativa || company.status !== "ATIVO") {
      sendConflict(res, "EMPRESA_INATIVA", "A empresa está inativa; o código não foi emitido.");
      return;
    }
    if (!company.cnpj || !isValidCnpj(company.cnpj)) {
      sendConflict(res, "CNPJ_INVALIDO", "O cadastro da empresa precisa de um CNPJ válido antes da emissão.");
      return;
    }

    const normalizedCnpj = normalizeCnpj(company.cnpj);
    const companiesWithCnpj = await db.select({
      id: empresasTable.id,
      cnpj: empresasTable.cnpj,
    }).from(empresasTable).where(isNotNull(empresasTable.cnpj));
    const duplicate = companiesWithCnpj.some((item) =>
      item.id !== company.id &&
      item.cnpj !== null &&
      normalizeCnpj(item.cnpj) === normalizedCnpj
    );
    if (duplicate) {
      sendConflict(res, "CNPJ_DUPLICADO", "O CNPJ completo aparece em mais de uma empresa; resolva a duplicidade antes de emitir.");
      return;
    }
    if (!company.codigoVinculoSemantico || !isSemanticRelation(company.codigoVinculoSemantico)) {
      sendConflict(res, "VINCULO_NAO_SELECIONADO", "O CEO precisa escolher a classificação interna da empresa.");
      return;
    }
    if (!location.codigoSequencial || location.codigoSequencial > 9999) {
      sendConflict(res, "SEQUENCIA_INVALIDA", "A unidade não tem uma sequência disponível de quatro dígitos.");
      return;
    }

    const base = company.codigoBaseSemantico ?? deriveSemanticBase(company.nome);
    if (!base) {
      sendConflict(res, "NOME_SEM_BASE", "O nome principal da empresa não gera quatro letras para o código.");
      return;
    }
    const code = formatSemanticCode({
      base,
      relation: company.codigoVinculoSemantico,
      cnpj: company.cnpj,
      sequence: location.codigoSequencial,
    });
    if (!code) {
      sendConflict(res, "CODIGO_NAO_GERADO", "Não foi possível montar um código válido com os dados conferidos.");
      return;
    }

    if (!company.codigoBaseSemantico) {
      await db.update(empresasTable)
        .set({ codigoBaseSemantico: base, atualizadoEm: new Date() })
        .where(eq(empresasTable.id, company.id));
    }

    const [updated] = await db.update(locationsTable)
      .set({ codigoSemantico: code })
      .where(and(
        eq(locationsTable.id, location.id),
        isNull(locationsTable.codigoSemantico),
      ))
      .returning();
    if (!updated) {
      const [current] = await db.select().from(locationsTable)
        .where(eq(locationsTable.id, location.id))
        .limit(1);
      if (current?.codigoSemantico) {
        const parts = current.codigoSemantico.split(".");
        res.json(CreateLocationSemanticCodeResponse.parse({
          locationId: current.id,
          empresaId: current.empresaId,
          codigo: current.codigoSemantico,
          codigoBase: parts[0],
          codigoVinculo: parts[1],
          cnpjPrefixo: parts[2],
          sequencia: current.codigoSequencial,
        }));
        return;
      }
      res.status(409).json({ error: "A unidade mudou durante a emissão. Atualize a tela e tente novamente." });
      return;
    }

    res.json(CreateLocationSemanticCodeResponse.parse({
      locationId: updated.id,
      empresaId: updated.empresaId,
      codigo: updated.codigoSemantico,
      codigoBase: base,
      codigoVinculo: SEMANTIC_RELATIONS[company.codigoVinculoSemantico].code,
      cnpjPrefixo: normalizedCnpj.slice(0, 4),
      sequencia: updated.codigoSequencial,
    }));
  },
);

export default router;
