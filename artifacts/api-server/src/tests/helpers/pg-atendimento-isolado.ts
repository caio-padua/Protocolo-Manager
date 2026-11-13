import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";

export async function bancoAtendimentoIsolado() {
  const bin=process.env.PG_BIN_DIR??"/nix/store/bgwr5i8jf8jpg75rr53rz3fqv5k8yrwp-postgresql-16.10/bin";
  const dir=mkdtempSync(join(tmpdir(),"atendimento-isolado-"));
  execFileSync(join(bin,"initdb"),["-D",join(dir,"db"),"-A","trust","-U","teste"],{stdio:"ignore"});
  const proc=spawn(join(bin,"postgres"),["-D",join(dir,"db"),"-c","listen_addresses=","-k",dir,"-c","max_connections=40"],{stdio:"ignore"});
  for(let i=0;i<80&&!existsSync(join(dir,".s.PGSQL.5432"));i++) await new Promise(r=>setTimeout(r,100));
  const pool=new pg.Pool({host:dir,user:"teste",database:"postgres",max:25});
  await pool.query("SELECT 1");
  return {pool,db:drizzle(pool),dir,fechar:async()=>{
    // Parada inteligente aguarda o PostgreSQL observar o fechamento dos sockets.
    // SIGINT pode devolver FATAL ao socket que o pool acabou de encerrar.
    await pool.end();proc.kill("SIGTERM");
    await new Promise<void>(resolve=>proc.once("exit",()=>resolve()));
    rmSync(dir,{recursive:true,force:true});
  }};
}
