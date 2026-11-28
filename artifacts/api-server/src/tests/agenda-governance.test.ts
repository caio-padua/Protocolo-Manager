import express from "express";
import request from "supertest";
import {beforeEach,describe,it,expect,vi} from "vitest";
const mocks=vi.hoisted(()=>({execute:vi.fn(),permission:vi.fn(),responsible:vi.fn(),
  ctx:{authenticated:true,empresaId:5,professionalId:101,isPlatformOwner:false}}));
vi.mock("@workspace/db",()=>({db:{execute:mocks.execute}}));
vi.mock("../lib/clinical-access",()=>({
  clinicManagementPermission:mocks.permission,currentResponsibleDoctor:mocks.responsible,
}));
import {agendaWriteGuard} from "../lib/agenda-governance";
const app=express();app.use(express.json());app.use((req,_res,next)=>{
  req.tenantContext=mocks.ctx as any;next();
});app.use(agendaWriteGuard);app.use((_req,res)=>res.json({ok:true}));
describe("autorização de alterações de disponibilidade",()=>{
  beforeEach(()=>{
    mocks.ctx={authenticated:true,empresaId:5,professionalId:101,isPlatformOwner:false};
    mocks.execute.mockReset().mockResolvedValue({rows:[{location_id:35,empresa_id:5}]});
    mocks.permission.mockReset().mockResolvedValue({allowed:false});
    mocks.responsible.mockReset().mockResolvedValue(null);
  });
  it("recusa escrita sem sessão",async()=>{
    mocks.ctx.authenticated=false;
    expect((await request(app).put("/agenda/resources/19/windows").send({windows:[]})).status).toBe(401);
  });
  it("secretaria não altera expediente diretamente",async()=>{
    expect((await request(app).put("/agenda/resources/19/windows").send({windows:[]})).status).toBe(403);
  });
  it("concessão administrativa explícita permite alteração",async()=>{
    mocks.permission.mockResolvedValue({allowed:true});
    expect((await request(app).put("/agenda/resources/19/windows").send({windows:[]})).status).toBe(200);
  });
  it("responsável técnico atual pode autorizar expediente",async()=>{
    mocks.responsible.mockResolvedValue({id:101});
    expect((await request(app).put("/agenda/resources/19/windows").send({windows:[]})).status).toBe(200);
  });
  it("mesmo administrador não altera recurso de outra empresa",async()=>{
    mocks.permission.mockResolvedValue({allowed:true});
    mocks.execute.mockResolvedValue({rows:[{location_id:35,empresa_id:999}]});
    expect((await request(app).put("/agenda/resources/19/windows").send({windows:[]})).status).toBe(403);
  });
  it("regra global não é autorizada por cargo local",async()=>{
    mocks.permission.mockResolvedValue({allowed:true});
    expect((await request(app).put("/agenda/settings").send({triggerPercent:0})).status).toBe(403);
  });
  it("proprietário autenticado pode alterar regra global",async()=>{
    mocks.ctx.isPlatformOwner=true;
    expect((await request(app).put("/agenda/settings").send({triggerPercent:60})).status).toBe(200);
  });
  it("proposta de alteração continua acessível sem ser confundida com aprovação",async()=>{
    expect((await request(app).post("/agenda/requests").send({})).status).toBe(200);
    expect(mocks.permission).not.toHaveBeenCalled();
  });
});
