import { beforeAll,afterAll,describe,it,expect,vi } from "vitest";
import { execFileSync } from "node:child_process";
import { bancoAtendimentoIsolado } from "./helpers/pg-atendimento-isolado";
import { migrarRecuperacaoAtendimento,registrarAtendimentoDuravel,tentarAtendimentoDuravel,
  processarAtendimentosDuraveis,type DepsAtendimentoDuravel } from "../lib/atendimento-telegram-recuperacao";
let b:Awaited<ReturnType<typeof bancoAtendimentoIsolado>>;
beforeAll(async()=>{
  b=await bancoAtendimentoIsolado();
  await b.pool.query(`CREATE TABLE clients(id integer primary key,empresa_id integer,telegram_chat_id text);
    INSERT INTO clients VALUES(1,5,'111');
    CREATE TABLE telegram_inbox_messages(id serial primary key,empresa_id integer,cliente_id integer,chat_id text,
      texto text,direcao text default 'entrada',lida_em timestamptz);
    CREATE TABLE telegram_atendimento_respostas(inbox_message_id bigint primary key,desfecho text,orientacao_id bigint,
      criado_em timestamptz default now(),fechado_em timestamptz);
    CREATE TABLE efeitos_sinteticos(origem integer,chat text,texto text);`);
  await migrarRecuperacaoAtendimento(b.db);
},30_000);
afterAll(async()=>b?.fechar());
async function novo(permitido=true){
  const r=await b.pool.query("INSERT INTO telegram_inbox_messages(empresa_id,cliente_id,chat_id,texto) VALUES(5,1,'111','ENTRADA SINTÉTICA') RETURNING id");
  const id=Number(r.rows[0].id);await registrarAtendimentoDuravel(b.db,id,permitido);return id;
}
const estado=async(id:number)=>(await b.pool.query("SELECT * FROM telegram_atendimento_respostas WHERE inbox_message_id=$1",[id])).rows[0];
const vencer=(id:number)=>b.pool.query("UPDATE telegram_atendimento_respostas SET proxima_tentativa_em=now()-interval '1 minute',atualizado_em=now()-interval '6 minutes' WHERE inbox_message_id=$1",[id]);
function deps(over:Partial<DepsAtendimentoDuravel>={}):DepsAtendimentoDuravel{
  return {permitido:async()=>true,pausar:vi.fn(async()=>{}),chatAlerta:async()=>"222",autorizarResposta:async()=>true,
    planejar:vi.fn(async()=>({pausa:"sem_orientacao_aprovada",alerta:"ALERTA SINTÉTICO",resposta:"RESPOSTA SINTÉTICA",
      orientacaoId:null,desfecho:"encaminhado_humano" as const})),
    enviar:vi.fn(async()=>({sent:true,mock:false})),...over};
}
const cair=(id:number,ponto:string)=>expect(()=>execFileSync(process.execPath,["--import","tsx","src/tests/helpers/atendimento-crash-child.ts",b.dir,String(id),ponto],{stdio:"pipe",timeout:15000})).toThrow();

describe("atendimento recuperável, somente banco descartável",()=>{
  it("migração repetida mantém legado não fechado incerto",async()=>{
    await b.pool.query("INSERT INTO telegram_atendimento_respostas(inbox_message_id,estado) VALUES(-1,NULL)");
    await migrarRecuperacaoAtendimento(b.db);
    await migrarRecuperacaoAtendimento(b.db);
    expect((await estado(-1)).estado).toBe("incerto");
  });
  it("registro idempotente; desligado no recebimento nunca acumula envio futuro",async()=>{
    const id=await novo(false);await registrarAtendimentoDuravel(b.db,id,true);
    const d=deps();await tentarAtendimentoDuravel(b.db,id,d);
    expect((await estado(id)).estado).toBe("concluido");expect(d.enviar).not.toHaveBeenCalled();
  });
  it("20 concorrentes produzem uma etapa de alerta, uma resposta e uma saída",async()=>{
    const id=await novo();const d=deps();
    await Promise.all(Array.from({length:20},()=>tentarAtendimentoDuravel(b.db,id,d)));
    expect(d.enviar).toHaveBeenCalledTimes(2);
    expect((await estado(id)).estado).toBe("concluido");
    expect(Number((await b.pool.query("SELECT count(*) n FROM telegram_inbox_messages WHERE direcao='saida'")).rows[0].n)).toBe(1);
  });
  it.each([["403","esgotado"],["503","falhou"]])("HTTP %s não vira encaminhado",async(code,esperado)=>{
    const id=await novo();await tentarAtendimentoDuravel(b.db,id,deps({enviar:async()=>({sent:false,mock:false,error:`telegram_http_${code} 123.456.789-00`})}));
    const r=await estado(id);expect(r.estado).toBe(esperado);expect(r.ultimo_erro).toBe(`telegram_http_${code}`);
    expect(r.desfecho).toBeNull();
  });
  it("chat ausente fica visível e pode recuperar sem trocar um destino capturado",async()=>{
    const id=await novo();const d=deps({chatAlerta:async()=>null});await tentarAtendimentoDuravel(b.db,id,d);
    expect((await estado(id)).ultimo_erro).toBe("destino_ausente");expect(d.enviar).not.toHaveBeenCalled();
    await vencer(id);await tentarAtendimentoDuravel(b.db,id,deps());
    expect((await estado(id)).estado).toBe("concluido");
  });
  it("token ausente é simulado e esgota após seis, nunca vira aceite",async()=>{
    const id=await novo();
    for(let i=0;i<6;i++){await vencer(id);await tentarAtendimentoDuravel(b.db,id,deps({enviar:async()=>({sent:true,mock:true})}));}
    const r=await estado(id);expect(r.estado).toBe("esgotado");expect(r.tentativas).toBe(6);
  });
  it("destino alterado após falha definida não redireciona",async()=>{
    const id=await novo();await tentarAtendimentoDuravel(b.db,id,deps({enviar:async()=>({sent:false,mock:false,error:"telegram_http_503"})}));
    await vencer(id);const d=deps({chatAlerta:async()=>"333"});await tentarAtendimentoDuravel(b.db,id,d);
    expect(d.enviar).not.toHaveBeenCalled();expect((await estado(id)).ultimo_erro).toBe("destino_configurado_alterado");
  });
  it("alerta aceito não repete quando só a resposta falhou",async()=>{
    const id=await novo();let n=0;
    await tentarAtendimentoDuravel(b.db,id,deps({enviar:async()=>++n===1?{sent:true,mock:false}:{sent:false,mock:false,error:"telegram_http_503"}}));
    await vencer(id);const d=deps();await tentarAtendimentoDuravel(b.db,id,d);
    expect(d.enviar).toHaveBeenCalledTimes(1);expect(d.enviar).toHaveBeenCalledWith("111","RESPOSTA SINTÉTICA");
  });
  it("exceção após barreira fica incerta, sem erro bruto nem repetição",async()=>{
    const id=await novo();const d=deps({enviar:async()=>{throw new Error("CPF 123.456.789-00 TOKEN");}});
    await tentarAtendimentoDuravel(b.db,id,d);await vencer(id);
    const novoD=deps();await processarAtendimentosDuraveis(b.db,novoD);
    expect((await estado(id)).estado).toBe("incerto");expect(JSON.stringify(await estado(id))).not.toContain("123.456");
    expect(novoD.enviar).not.toHaveBeenCalled();
  });
  it("clínica, chat revogado, chat duplicado e autorização recusada impedem transporte",async()=>{
    for(const sql of ["UPDATE clients SET empresa_id=7 WHERE id=1","UPDATE clients SET telegram_chat_id=NULL WHERE id=1",
      "INSERT INTO clients VALUES(2,7,'111')"]){
      const id=await novo();await b.pool.query(sql);const d=deps();await tentarAtendimentoDuravel(b.db,id,d);
      expect(d.enviar).not.toHaveBeenCalled();
      await b.pool.query("DELETE FROM clients WHERE id=2;UPDATE clients SET empresa_id=5,telegram_chat_id='111' WHERE id=1");
    }
    const id=await novo();const d=deps({autorizarResposta:async()=>false});
    await tentarAtendimentoDuravel(b.db,id,d);expect(d.enviar).toHaveBeenCalledTimes(1);
    expect((await estado(id)).ultimo_erro).toBe("resposta_nao_autorizada");
  });
  it.each(["antes_transporte","apos_transporte"])("queda %s em processo real nunca reenvia resultado desconhecido",async(ponto)=>{
    const id=await novo();cair(id,ponto);await vencer(id);
    const d=deps();await processarAtendimentosDuraveis(b.db,d);
    expect((await estado(id)).estado).toBe("incerto");expect(d.enviar).not.toHaveBeenCalled();
  });
  it("queda após reivindicar/antes do plano recupera com segurança",async()=>{
    const id=await novo();cair(id,"planejar");await vencer(id);
    const d=deps();await processarAtendimentosDuraveis(b.db,d);
    expect((await estado(id)).estado).toBe("concluido");expect(d.enviar).toHaveBeenCalledTimes(2);
  });
  it("queda após persistir aceites/antes de fechar não repete saída após reinício",async()=>{
    const id=await novo();cair(id,"fechar");await vencer(id);
    const d=deps();await processarAtendimentosDuraveis(b.db,d);
    expect((await estado(id)).estado).toBe("concluido");expect(d.enviar).not.toHaveBeenCalled();
    const r=await b.pool.query("SELECT count(*)::int n FROM efeitos_sinteticos WHERE origem=$1",[id]);expect(r.rows[0].n).toBe(2);
  });
});
