import { z } from "zod";

export const prescriptionDraftSchema = z.object({
  duracao: z.string(), cid: z.string(),
  selected: z.array(z.object({
    id: z.string(), cat: z.string(), name: z.string(), ativos: z.string(), preco: z.number(),
    tomadas: z.array(z.object({
      doses: z.number(), via: z.string(), periodo: z.string(), hora: z.string(), raw: z.string().optional(),
    })),
  })),
  defaultPharmacyId: z.number().nullable(),
  routing: z.record(z.string(), z.object({
    pharmacyId: z.number().nullable(), isControlled: z.boolean(), anvisaType: z.string(), internalColor: z.string(),
  })),
});
export const emptyPrescriptionDraft: z.infer<typeof prescriptionDraftSchema> = {
  duracao: "30", cid: "", selected: [], defaultPharmacyId: null, routing: {},
};
export const examDraftSchema = z.object({
  cart: z.record(z.string(), z.object({
    id: z.number(), nomeExame: z.string(), codigoExame: z.string().nullable(),
    grupoPrincipal: z.string().nullable(), preparo: z.string().nullable(),
    tipo: z.enum(["SANGUE", "IMAGEM", "OUTROS"]),
  })),
  observacao: z.string(), individualDocuments: z.boolean(),
});
export const emptyExamDraft: z.infer<typeof examDraftSchema> = {
  cart: {}, observacao: "", individualDocuments: true,
};
