import express from "express";
import request from "supertest";
import {PgDialect} from "drizzle-orm/pg-core";
import {beforeEach,describe,it,expect,vi} from "vitest";
const m=vi.hoisted(()=>({execute:vi.fn(),allowed:true,changed:false,row:null as any,writes:0}));
vi.mock("@workspace/db",()=>({db:{
  execute:(...args:any[])=>m.execute(...args),
  transaction:(run:any)=>run({execute:(...args:any[])=>m.execute(...args)}),
}}));
vi.mock("../routes/collaborator",()=>({requireCollaborator:(req:any,res:any,next:any)=>{
  if (!req.headers["x-test-session"]) {res.status(401).json({error:"Não autenticado"});return;}
  req.tenantContext={authenticated:true,empresaId:90001,professionalId:91001,isPlatformOwner:false};next();
}}));
vi.mock("../lib/agenda-governance",()=>({mayManageAgenda:async()=>m.allowed}));
vi.mock("../lib/agenda-google-sync",()=>({syncGoogleAgenda:vi.fn()}));
import router from "../routes/agenda-integration";
const app=express();app.use(express.json());app.use(router);
describe("decisão vinculada à proposta persistida",()=>{
  beforeEach(()=>{
    m.allowed=true;m.changed=false;m.writes=0;
    m.row={id:77001,empresa_id:90001,resource_id:19001,location_id:35001,state:"pendente",
      created_at:new Date(),before_windows:[{endTime:"12:00",weekday:1,startTime:"08:00"}],
      proposed_windows:[{weekday:1,startTime:"09:00",endTime:"10:00"}]};
    m.execute.mockReset().mockImplementation((query)=>{
      const {sql,params}=new PgDialect().sqlToQuery(query);
      if(sql.includes("SELECT q.*")) return {rows:m.row?[m.row]:[]};
      if(sql.includes("SELECT weekday")) return {rows:[{weekday:1,startTime:"08:00",endTime:m.changed?"11:00":"12:00"}]};
      if(sql.includes("UPDATE agenda_change_requests")) m.row.state=params[0];
      if(/DELETE FROM agenda_windows|INSERT INTO agenda_windows/.test(sql)) m.writes++;
      return {rows:[]};
    });
  });
  const decide=(decision="aprovar")=>request(app).post("/agenda/requests/77001/decision")
    .set("x-test-session","synthetic").send({decision});
  it("aprovação aplica a proposta apesar da ordem das chaves JSON do banco",async()=>{
    expect((await decide()).status).toBe(200);
    expect(m.row.state).toBe("aprovado");expect(m.writes).toBe(2);
  });
  it("repetição não reaplica expediente",async()=>{
    await decide();expect((await decide()).status).toBe(409);expect(m.writes).toBe(2);
  });
  it("secretaria não aprova por enviar um booleano ou decisão",async()=>{
    m.allowed=false;expect((await decide()).status).toBe(403);expect(m.writes).toBe(0);
  });
  it("expediente alterado desde o pedido impede aprovação antiga",async()=>{
    m.changed=true;expect((await decide()).status).toBe(409);expect(m.writes).toBe(0);
  });
  it("recusa registra decisão sem mudar expediente",async()=>{
    expect((await decide("recusar")).status).toBe(200);
    expect(m.row.state).toBe("recusado");expect(m.writes).toBe(0);
  });
  it("pedido expirado não autoriza gravação",async()=>{
    m.row.created_at=new Date("2020-01-01");expect((await decide()).status).toBe(409);expect(m.writes).toBe(0);
  });
  it("ausência de sessão impede decisão",async()=>{
    expect((await request(app).post("/agenda/requests/77001/decision").send({decision:"aprovar"})).status).toBe(401);
  });
});
