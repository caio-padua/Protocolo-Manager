import { getTableConfig, PgDialect } from "drizzle-orm/pg-core";

/**
 * Gera o CREATE TABLE de uma tabela do esquema Drizzle para um banco
 * descartável, preservando NOT NULL, chave primária e valores padrão, para que
 * o código sob teste grave exatamente como grava em produção.
 */
export function createTableFromSchema(table: any): string {
  const dialect = new PgDialect();
  const config = getTableConfig(table);
  const columns = config.columns.map(column => {
    let defaultSql = "";
    if (column.default !== undefined) {
      const value: any = column.default;
      if (value?.queryChunks) {
        defaultSql = ` DEFAULT ${dialect.sqlToQuery(value).sql}`;
      } else {
        const encoded = column.mapToDriverValue(value);
        defaultSql = ` DEFAULT ${typeof encoded === "number" || typeof encoded === "boolean"
          ? String(encoded) : `'${String(encoded).replaceAll("'", "''")}'`}`;
      }
    }
    if (column.name === "id" && column.primary) return `"id" SERIAL PRIMARY KEY`;
    return `"${column.name}" ${column.getSQLType()}${defaultSql}${column.notNull ? " NOT NULL" : ""}${column.primary ? " PRIMARY KEY" : ""}`;
  });
  // Padrões com sequência própria (nextval) precisam que a sequência exista antes da tabela.
  const sequences = [...new Set(columns.flatMap(column =>
    [...column.matchAll(/nextval\('([^']+)'/g)].map(match => match[1])))];
  const sequenceSql = sequences.map(name => `CREATE SEQUENCE IF NOT EXISTS "${name}";`).join(" ");
  return `${sequenceSql} CREATE TABLE "${config.name}" (${columns.join(", ")});`.trim();
}
