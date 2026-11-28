import {beforeEach,describe,it,expect,vi} from "vitest";
import type {Request} from "express";
const m=vi.hoisted(()=>({permission:vi.fn(),responsible:vi.fn()}));
vi.mock("../lib/clinical-access",()=>({
  clinicManagementPermission:m.permission,currentResponsibleDoctor:m.responsible,
}));
import {mayWriteLocation} from "../lib/location-write-access";
describe("empresa proprietária na escrita de local",()=>{
  const local={id:11001,empresaId:21001};
  let req:Request;
  beforeEach(()=>{
    req={tenantContext:{authenticated:true,professionalId:91001,empresaId:21001,isPlatformOwner:false}} as Request;
    m.permission.mockReset().mockResolvedValue({allowed:false});m.responsible.mockReset().mockResolvedValue(null);
  });
  it("exige sessão autenticada",async()=>{
    req.tenantContext.authenticated=false;
    expect(await mayWriteLocation(req,local)).toBe(false);expect(m.permission).not.toHaveBeenCalled();
  });
  it("proprietário selecionando outra empresa não salva o registro",async()=>{
    req.tenantContext.isPlatformOwner=true;req.tenantContext.empresaId=22001;
    expect(await mayWriteLocation(req,local)).toBe(false);
  });
  it("corpo da requisição não muda a empresa proprietária",async()=>{
    req.body={empresaId:22001,approved:true};req.tenantContext.empresaId=22001;
    expect(await mayWriteLocation(req,local)).toBe(false);
  });
  it("secretaria sem concessão não escreve nem exclui",async()=>{
    expect(await mayWriteLocation(req,local)).toBe(false);
  });
  it("administrador autorizado escreve na empresa correta",async()=>{
    m.permission.mockResolvedValue({allowed:true});
    expect(await mayWriteLocation(req,local)).toBe(true);
    expect(m.permission).toHaveBeenCalledWith(91001,11001);
  });
  it("responsável técnico atual escreve na empresa correta",async()=>{
    m.responsible.mockResolvedValue({id:91001});
    expect(await mayWriteLocation(req,local)).toBe(true);
  });
  it("outro médico não recebe a autoridade do responsável",async()=>{
    m.responsible.mockResolvedValue({id:91002});
    expect(await mayWriteLocation(req,local)).toBe(false);
  });
  it("proprietário autenticado escreve inclusive no local inativo da empresa selecionada",async()=>{
    req.tenantContext.isPlatformOwner=true;
    expect(await mayWriteLocation(req,local)).toBe(true);
  });
  it("registro sem empresa não pode ser transferido pelo formulário",async()=>{
    req.tenantContext.isPlatformOwner=true;
    expect(await mayWriteLocation(req,{...local,empresaId:null})).toBe(false);
  });
});
