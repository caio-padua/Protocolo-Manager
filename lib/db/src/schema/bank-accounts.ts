import { pgTable, text, serial, boolean, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Contas bancarias autorizadas a RECEBER transferencias (whitelist). So e
// possivel transferir saldo da conta Asaas da clinica para uma conta que esta
// aqui e com active=true. Deduplicacao por `document` (chave natural; nao vem
// do IHE, entao nao usa id de origem). Onda 3.
export const bankAccountsTable = pgTable(
  "bank_accounts",
  {
    id: serial("id").primaryKey(),
    holderName: text("holder_name").notNull(),
    personType: text("person_type").notNull(), // "PF" | "PJ"
    document: text("document").notNull(), // CPF/CNPJ so digitos
    bankName: text("bank_name").notNull(),
    bankCode: text("bank_code"), // COMPE 3 digitos (opcional)
    agency: text("agency").notNull(),
    account: text("account").notNull(),
    accountType: text("account_type").notNull().default("CONTA_CORRENTE"), // CONTA_CORRENTE | CONTA_POUPANCA
    pixKey: text("pix_key"), // chave Pix (default = documento)
    pixKeyType: text("pix_key_type"), // CPF | CNPJ | EMAIL | PHONE | EVP
    active: boolean("active").notNull().default(true),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Documento e chave natural: impede a mesma conta cadastrada duas vezes.
    uniqueIndex("bank_accounts_document_uq").on(table.document),
  ],
);

export const insertBankAccountSchema = createInsertSchema(bankAccountsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertBankAccount = z.infer<typeof insertBankAccountSchema>;
export type BankAccount = typeof bankAccountsTable.$inferSelect;
