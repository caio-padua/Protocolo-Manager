import { createRequire } from "node:module";
const req = createRequire("/home/runner/workspace/artifacts/api-server/package.json");
export const pg = req("pg");
export const novoPool = () => new pg.Pool({ connectionString: process.env.DATABASE_URL });
