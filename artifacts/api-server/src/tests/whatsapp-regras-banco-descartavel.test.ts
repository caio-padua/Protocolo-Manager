/** SQL real em banco isolado, sem conexão configurada da aplicação ou mensagens externas. */
import {beforeAll,afterAll,beforeEach,describe,it,expect,vi} from "vitest";
import {bancoAtendimentoIsolado} from "./helpers/pg-atendimento-isolado";
const h=vi.hoisted(()=>({pg:null as any,db:null as any}));
vi.mock("@workspace/db",()=>({pool:{query:(...a:any[])=>h.pg.query(...a)},db:{execute:(...a:any[])=>h.db.execute(...a)}}));
vi.mock("../routes/whatsapp-status",()=>({mascararTelefone:()=>"contato protegido"}));
vi.mock("../lib/logger",()=>({logger:{info:vi.fn(),warn:vi.fn(),error:vi.fn()}}));
import {garantirTabelasComunicacao} from "../lib/comunicacao-migracao";
import {listarConversas,resumirConversas} from "../lib/comunicacao-unificada";
import {depsOperacionaisWhatsapp} from "../lib/atendimento-whatsapp-store";
import {aplicarMigracaoAgendamentoTelegram,planejarAgendamentoCliente} from "../lib/telegram-agendamento-store";
import {gravarModeloClinica} from "../lib/comunicacao-padrao";
import {FRASES_PADRAO} from "../lib/telegram-frases";
import type {EntradaAtendimento} from "../lib/atendimento-telegram";
let banco:Awaited<ReturnType<typeof bancoAtendimentoIsolado>>;
const e:EntradaAtendimento={inboxMessageId:1_000_000_000_999,empresaId:5,clienteId:111,clienteNome:"Cliente sintético A",chatId:"5511000000001",texto:"menu",canal:"whatsapp"};
beforeAll(async()=>{
  banco=await bancoAtendimentoIsolado();h.pg=banco.pool;h.db=banco.db;
  await h.pg.query(`
    CREATE TABLE empresas(id INTEGER PRIMARY KEY,nome TEXT);
    INSERT INTO empresas VALUES(5,'Instituto Padua'),(6,'Outra clínica');
    CREATE TABLE clients(id INTEGER PRIMARY KEY,empresa_id INTEGER,name TEXT,cpf TEXT);
    INSERT INTO clients VALUES(111,5,'Cliente sintético A',NULL),(222,6,'Cliente sintético B',NULL);
    CREATE TABLE whatsapp_mensagens_log(id SERIAL PRIMARY KEY,empresa_id INTEGER,cliente_id INTEGER,telefone TEXT,via TEXT,contexto TEXT,status TEXT,error_code TEXT,corpo TEXT,criado_em TIMESTAMPTZ DEFAULT NOW());
    CREATE TABLE telegram_inbox_messages(id SERIAL PRIMARY KEY,empresa_id INTEGER,cliente_id INTEGER,chat_id TEXT,direcao TEXT,texto TEXT,recebida_em TIMESTAMPTZ DEFAULT NOW());
    CREATE TABLE msg_extrato(id SERIAL PRIMARY KEY,empresa_id INTEGER,natureza TEXT,chave TEXT,ambiente TEXT,isento BOOLEAN,sem_tarifa BOOLEAN,valor_centavos INTEGER);
    CREATE TABLE sessions(id SERIAL PRIMARY KEY,empresa_id INTEGER,client_id INTEGER,protocol_id INTEGER,status TEXT,agenda_archived BOOLEAN DEFAULT FALSE,scheduled_date TEXT,scheduled_time TEXT);
  `);
  await garantirTabelasComunicacao();
  await aplicarMigracaoAgendamentoTelegram(h.db);
},60000);
afterAll(async()=>{await banco?.fechar();});
beforeEach(async()=>{
  await h.pg.query("TRUNCATE evolution_mensagens, sessions,telegram_agendamento_estado RESTART IDENTITY");
  await h.pg.query("DELETE FROM comunicacao_modelo_texto WHERE empresa_id IS NOT NULL").catch(()=>{});
});
async function mensagem(p:{empresa?:number;cliente?:number;direcao?:string;status?:string;plano?:object;origem?:number;processamento?:string}={}){
  const r=await h.pg.query(`INSERT INTO evolution_mensagens(empresa_id,cliente_id,instancia,direcao,contato,corpo,status,contexto,plano_atendimento,mensagem_origem_id,processamento)
    VALUES($1,$2,'sintetica',$3,'5511000000001','Mensagem sintética',$4,'motor_evolution',$5::jsonb,$6,$7) RETURNING id`,
    [p.empresa??5,p.cliente??111,p.direcao??"entrada",p.status??"recebida",JSON.stringify(p.plano??{}),p.origem??null,p.processamento??"concluido"]);
  return r.rows[0].id as number;
}
describe("Evolution na central real",()=>{
  it("inclui entrada e saída uma única vez, com intenção, encaminhamento, provedor e recibo",async()=>{
    const id=await mensagem({plano:{intencao:"humano",encaminhamento:"alerta_aceito"}});
    await mensagem({direcao:"saida",status:"lido",origem:id});
    await mensagem({empresa:6,cliente:222,plano:{intencao:"menu"}});
    const pagina=await listarConversas({empresaId:5});
    expect(pagina.linhas).toHaveLength(2);
    expect(pagina.linhas.every(x=>x.provedor==="evolution"&&x.clienteNome==="Cliente sintético A")).toBe(true);
    const saida=pagina.linhas.find(x=>x.direcao==="saida")!;
    expect(saida.entrega).toBe("Lido");expect(saida.intencao).toBe("humano");
    expect(saida.encaminhamento).toBe("alerta_aceito");
    expect(saida.etapas.find(x=>x.chave==="leitura")?.estado).toBe("lido");
    expect((await resumirConversas({empresaId:5})).porCanal.wwp.total).toBe(2);
    expect((await listarConversas({empresaId:6})).linhas).toHaveLength(1);
  });
  it("estado incerto não vira enviado ou entregue e vínculo ausente não é inferido",async()=>{
    await mensagem({direcao:"saida",status:"incerto"});
    const id=await mensagem();await h.pg.query("UPDATE evolution_mensagens SET cliente_id=NULL WHERE id=$1",[id]);
    const linhas=(await listarConversas({empresaId:5})).linhas;
    expect(linhas.find(x=>x.direcao==="saida")?.entrega).toBe("Resultado incerto");
    expect(linhas.find(x=>x.direcao==="entrada")?.clienteNome).toBeNull();
  });
  it("não expõe nome de outro cliente por um identificador empresarial inconsistente",async()=>{
    await mensagem({empresa:5,cliente:222});
    expect((await listarConversas({empresaId:5})).linhas[0].clienteNome).toBeNull();
  });
});
describe("contexto do menu e dados próprios",()=>{
  it("menu só vale após entrega do último contexto, sem reaproveitar contexto anterior",async()=>{
    const op=depsOperacionaisWhatsapp(e);
    const menu=await mensagem({plano:{intencao:"menu"}});
    const saida=await mensagem({direcao:"saida",status:"aceito",origem:menu});
    expect(await op.menuAtivo()).toBe(false);
    await h.pg.query("UPDATE evolution_mensagens SET status='entregue' WHERE id=$1",[saida]);
    expect(await op.menuAtivo()).toBe(true);
    await mensagem({plano:{intencao:"documentos"},processamento:"processando"});
    expect(await op.menuAtivo()).toBe(false);
  });
  it("menu expirado ou de outra clínica não autoriza opção numérica",async()=>{
    const id=await mensagem({plano:{intencao:"menu"}});
    await mensagem({direcao:"saida",status:"lido",origem:id});
    await h.pg.query("UPDATE evolution_mensagens SET criado_em=NOW()-interval '31 minutes'");
    expect(await depsOperacionaisWhatsapp(e).menuAtivo()).toBe(false);
    const outro=await mensagem({empresa:6,cliente:222,plano:{intencao:"menu"}});
    await mensagem({empresa:6,cliente:222,direcao:"saida",status:"lido",origem:outro});
    expect(await depsOperacionaisWhatsapp(e).menuAtivo()).toBe(false);
  });
  it("retorno só contém sessão futura, não arquivada, do próprio cliente e clínica",async()=>{
    await h.pg.query(`INSERT INTO sessions(empresa_id,client_id,protocol_id,status,scheduled_date,scheduled_time) VALUES
      (5,111,NULL,'scheduled','2099-11-24','10:00'),(6,222,NULL,'scheduled','2099-11-25','11:00'),
      (5,111,NULL,'cancelled','2099-11-26','12:00'),(5,111,44,'scheduled','2099-11-27','13:00')`);
    expect(await depsOperacionaisWhatsapp(e).consultarRetorno()).toBe("24/11/2099 às 10:00");
    expect(await depsOperacionaisWhatsapp({...e,clienteId:222}).consultarRetorno()).toBeNull();
  });
  it("Frases é padrão vivo; modelo próprio da clínica prevalece sem afetar outra clínica",async()=>{
    const op=depsOperacionaisWhatsapp(e);
    expect(await op.frase("atendimento_menu")).toBe(FRASES_PADRAO.atendimento_menu.texto);
    await gravarModeloClinica(5,"atendimento_menu","Menu editado da própria clínica: escolha uma opção.",null);
    expect(await op.frase("atendimento_menu")).toBe("Menu editado da própria clínica: escolha uma opção.");
    expect(await depsOperacionaisWhatsapp({...e,empresaId:6}).frase("atendimento_menu")).toBe(FRASES_PADRAO.atendimento_menu.texto);
  });
  it("prévia da agenda não cria estado; execução usa chave própria da clínica e canal",async()=>{
    const p={empresaId:5,clienteId:111,texto:"quero agendar consulta",canal:"whatsapp" as const,semIA:true};
    const previa=await planejarAgendamentoCliente({...p,somenteLeitura:true});
    expect(previa.tratada).toBe(true);expect(previa.interpreteChamado).toBe(false);
    expect((await h.pg.query("SELECT * FROM telegram_agendamento_estado")).rows).toHaveLength(0);
    await planejarAgendamentoCliente(p);
    expect((await h.pg.query("SELECT chave FROM telegram_agendamento_estado")).rows).toEqual([{chave:"whatsapp:5:cliente:111"}]);
    expect((await h.pg.query("SELECT * FROM sessions")).rows).toHaveLength(0);
  });
});
