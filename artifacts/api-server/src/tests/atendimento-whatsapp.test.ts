import { beforeEach, describe, expect, it, vi } from "vitest";
import { classificarIntencaoWhatsapp, planejarAtendimentoWhatsapp, type DepsOperacionaisWhatsapp } from "../lib/atendimento-whatsapp";
import type { DepsAtendimento, EntradaAtendimento, PlanoAtendimento } from "../lib/atendimento-telegram";

const APRESENTACAO = "Olá!\n\nMe chamo Helena,\nAssistente virtual do Instituto Pádua.\n\nTudo bem?\n\nComo eu poderia te ajudar?";
let d: DepsAtendimento;
let ops: DepsOperacionaisWhatsapp;
const entrada = (texto:string):EntradaAtendimento => ({
  inboxMessageId:1_000_000_000_010,empresaId:5,clienteId:111,clienteNome:"Cliente sintético",
  chatId:"5511000000001",texto,canal:"whatsapp",
});
const agenda:PlanoAtendimento = {resposta:"Qual modalidade deseja?",pausa:null,alerta:null,desfecho:"agendamento_conduzido",orientacaoId:null,caminhoResolucao:"regra"};
beforeEach(() => {
  d = {
    lerConfig:vi.fn(async()=>({modo:"lista" as const,permitidos:new Set([111]),queixaRevisada:false})),
    modoDoCliente:vi.fn(async()=>"ia" as const),reivindicar:vi.fn(async()=>true),
    carregarOrientacoes:vi.fn(async()=>[]),textoApresentacao:vi.fn(async()=>APRESENTACAO),
    responderDocumento:vi.fn(async()=>null),buscarFaq:vi.fn(async()=>null),
    escolherComIA:vi.fn(async()=>{throw Error("IA proibida neste teste");}),
    conferirComIA:vi.fn(async()=>{throw Error("IA proibida neste teste");}),
    enviarAoPaciente:vi.fn(async()=>true),registrarSaida:vi.fn(async()=>{}),
    passarParaHumano:vi.fn(async()=>{}),alertarEquipe:vi.fn(async()=>true),
    textoEncaminhado:vi.fn(async()=>"Texto aprovado de encaminhamento"),registrarDesfecho:vi.fn(async()=>{}),
  };
  ops = {menuAtivo:vi.fn(async()=>false),frase:vi.fn(async(k,vars)=>`${k}${vars?.compromissos ? `\n${vars.compromissos}`:""}`),
    consultarRetorno:vi.fn(async()=>null),agendar:vi.fn(async()=>null)};
});
describe("intenções por regras",()=>{
  it.each([
    ["Olá com quem estou falando?","apresentacao"],["BOA TARDE!!!","apresentacao"],
    ["qual é o seu nome?","apresentacao"],["opções","menu"],["preciso marcar consulta","agendar"],
    ["Olá com quem estou conversando?","apresentacao"],["Como você se chama?","apresentacao"],["Quem está me respondendo?","apresentacao"],
    ["quero reagendar","agendar"],["quando será minha consulta?","retorno"],["meu retorno","retorno"],
    ["qual o valor da consulta?","orcamento"],["preciso de orçamento","orcamento"],
    ["segunda via da receita","documentos"],["meu protocolo","documentos"],
    ["meu pedido de exames","exames"],["quero falar com a recepção","humano"],
    ["pessoa de verdade","humano"],["oi, estou com falta de ar","clinica"],
    ["preciso renovar a receita","clinica"],["aumentar minha dose","clinica"],
    ["quero orçamento e receita","ambigua"],["assunto não reconhecido","desconhecida"],
  ])("%s → %s",(texto,intencao)=>expect(classificarIntencaoWhatsapp(texto)).toBe(intencao));
});
describe("cérebro real sem inteligência artificial",()=>{
  it("apresenta Helena exatamente e não chama orientação clínica nem operação",async()=>{
    const p=await planejarAtendimentoWhatsapp(d,entrada("Olá com quem estou falando?"),ops);
    expect(p.resposta).toBe(APRESENTACAO); expect(p.desfecho).toBe("apresentacao_enviada");
    expect(d.carregarOrientacoes).not.toHaveBeenCalled(); expect(ops.agendar).not.toHaveBeenCalled();
    expect(d.enviarAoPaciente).not.toHaveBeenCalled(); expect(d.passarParaHumano).not.toHaveBeenCalled();
  });
  it.each(["menu","não entendi","quero orçamento e receita"])("oferece menu claro sem falsa passagem à equipe: %s",async texto=>{
    const p=await planejarAtendimentoWhatsapp(d,entrada(texto),ops);
    expect(p.desfecho).toBe("menu_enviado"); expect(p.resposta).toBe("atendimento_menu");
    expect(p.alerta).toBeNull(); expect(p.pausa).toBeNull();
    expect(d.escolherComIA).not.toHaveBeenCalled(); expect(d.conferirComIA).not.toHaveBeenCalled();
  });
  it("usa pergunta aprendida aprovada sem recorrer à equipe",async()=>{
    d.buscarFaq=vi.fn(async()=>({id:50,resposta:"Valor cadastrado e aprovado"}));
    const p=await planejarAtendimentoWhatsapp(d,entrada("qual o valor da consulta?"),ops);
    expect(p.resposta).toBe("Valor cadastrado e aprovado");expect(p.faqId).toBe(50);
    expect(p.pausa).toBeNull();expect(ops.agendar).not.toHaveBeenCalled();
  });
  it("usa orientação aprovada literalmente e não chama modelos de inteligência artificial",async()=>{
    d.carregarOrientacoes=vi.fn(async()=>[{id:90,tema:"consulta valor",perguntasExemplo:"valor consulta",resposta:"Resposta vigente"}]);
    const p=await planejarAtendimentoWhatsapp(d,entrada("valor consulta"),ops);
    expect(p.resposta).toBe("Resposta vigente");expect(p.orientacaoId).toBe(90);
    expect(d.escolherComIA).not.toHaveBeenCalled();
  });
  it("orçamento sem resposta exige equipe e não inventa preço",async()=>{
    const p=await planejarAtendimentoWhatsapp(d,entrada("quero orçamento"),ops);
    expect(p.pausa).toBe("orcamento_sem_resposta_aprovada");expect(p.alerta).toContain("cliente #111");
    expect(p.resposta).toBe("atendimento_pedido_equipe");
    expect(d.passarParaHumano).not.toHaveBeenCalled(); // plano não executa encaminhamento
  });
  it("pedido explícito de humano não envia documento nem pergunta aprendida",async()=>{
    const p=await planejarAtendimentoWhatsapp(d,entrada("Quero falar com a equipe sobre minha receita"),ops);
    expect(p.pausa).toBe("solicitou_equipe");expect(d.responderDocumento).not.toHaveBeenCalled();
    expect(d.buscarFaq).not.toHaveBeenCalled();
  });
  it("preserva orientação de emergência, sintomas e decisão médica",async()=>{
    const p=await planejarAtendimentoWhatsapp(d,entrada("Olá, estou com falta de ar"),ops);
    expect(p.pausa).toBeTruthy(); expect(p.resposta).toBeNull();
    expect(ops.agendar).not.toHaveBeenCalled();expect(ops.frase).not.toHaveBeenCalled();
  });
  it.each(["desligado","fora_da_lista","pausado_humano"] as const)("preserva controle %s",async controle=>{
    if(controle==="desligado")d.lerConfig=async()=>({modo:"desligado",permitidos:new Set(),queixaRevisada:false});
    if(controle==="fora_da_lista")d.lerConfig=async()=>({modo:"lista",permitidos:new Set(),queixaRevisada:false});
    if(controle==="pausado_humano")d.modoDoCliente=async()=>"humano";
    const p=await planejarAtendimentoWhatsapp(d,entrada("menu"),ops);
    expect(p.desfecho).toBe(controle);expect(ops.frase).not.toHaveBeenCalled();
  });
  it.each([["1","agendar"],["2","retorno"],["3","orcamento"],["4","documentos"],["5","exames"],["6","humano"]])("opção %s só com contexto entregue",async(numero,intencao)=>{
    ops.menuAtivo=async()=>true;
    if(numero==="1")ops.agendar=vi.fn(async()=>agenda);
    const p=await planejarAtendimentoWhatsapp(d,entrada(numero),ops);
    expect(p.intencao).toBe(intencao);
  });
  it("número sem menu não é opção global e preserva possível diálogo da agenda",async()=>{
    ops.agendar=vi.fn(async()=>agenda);
    const p=await planejarAtendimentoWhatsapp(d,entrada("2"),ops);
    expect(ops.agendar).toHaveBeenCalledWith("2");expect(p.intencao).toBe("agendar");
  });
  it.each(["Opção 2","número 2"])("entende variação numérica %s somente após menu",async texto=>{
    ops.menuAtivo=async()=>true;
    const p=await planejarAtendimentoWhatsapp(d,entrada(texto),ops);
    expect(p.intencao).toBe("retorno");
  });
  it("consulta somente retorno real e não afirma gratuidade",async()=>{
    ops.consultarRetorno=async()=>"24/11/2026 às 10:00";
    const p=await planejarAtendimentoWhatsapp(d,entrada("quando é meu retorno?"),ops);
    expect(p.resposta).toContain("24/11/2026 às 10:00");expect(p.fonteOperacional?.variaveis?.compromissos).toBe("24/11/2026 às 10:00");
    expect(p.pausa).toBeNull();
  });
  it("não fabrica retorno quando agenda não tem registro",async()=>{
    const p=await planejarAtendimentoWhatsapp(d,entrada("meu retorno"),ops);
    expect(p.pausa).toBe("retorno_sem_registro");
  });
  it("preserva documento e confirmação do motor oficial",async()=>{
    d.responderDocumento=vi.fn(async()=>({tipo:"resposta",texto:"Confirme o documento seguro",desfecho:"reenvio_documento_ofertado",documento:{acao:"ofertar_reenvio",documentId:999,documentType:"prescricao"}} as const));
    const p=await planejarAtendimentoWhatsapp(d,entrada("minha receita"),ops);
    expect(p.documento?.documentId).toBe(999);expect(p.resposta).toBe("Confirme o documento seguro");
    expect(ops.frase).not.toHaveBeenCalled();
  });
});
