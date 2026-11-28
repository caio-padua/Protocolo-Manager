/** Processo exclusivo do banco sintético do teste. Nenhuma integração real importada. */
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { PgDialect } from "drizzle-orm/pg-core";
import { tentarAtendimentoDuravel } from "../../lib/atendimento-telegram-recuperacao";
const [socket,idRaw,ponto]=process.argv.slice(2);
if(!socket?.includes("/atendimento-isolado-")) throw new Error("Socket de teste obrigatório");
const pool=new pg.Pool({host:socket,user:"teste",database:"postgres"});
const db=drizzle(pool);
const exec={execute:async(q:Parameters<typeof db.execute>[0])=>{
  const compiled=new PgDialect().sqlToQuery(q as import("drizzle-orm").SQL);
  if(ponto==="fechar" && compiled.params[0]==="concluido") process.exit(23);
  return db.execute(q);
}};
await tentarAtendimentoDuravel(exec,Number(idRaw),{
  permitido:async()=>true,pausar:async()=>{},chatAlerta:async()=>"222",autorizarResposta:async()=>true,
  planejar:async()=>{if(ponto==="planejar")process.exit(23);
    return {pausa:null,alerta:"ALERTA SINTÉTICO",resposta:"RESPOSTA SINTÉTICA",orientacaoId:null,desfecho:"encaminhado_humano"};},
  enviar:async(chat,texto)=>{
    if(ponto==="antes_transporte")process.exit(23);
    await pool.query("INSERT INTO efeitos_sinteticos (origem,chat,texto) VALUES ($1,$2,$3)",[Number(idRaw),chat,texto]);
    if(ponto==="apos_transporte")process.exit(23);
    return {sent:true,mock:false};
  },
});
await pool.end();
