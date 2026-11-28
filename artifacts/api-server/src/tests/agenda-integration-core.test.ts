import { describe, expect, it, vi } from "vitest";
import { computeAgendaSlots } from "../lib/agenda-motor";
import { normalizeGoogleSource } from "../lib/agenda-google-source";
import { projectImportedCommitment } from "../lib/agenda-google-projection";
vi.mock("../lib/google-calendar", () => ({}));
vi.mock("@workspace/db", () => ({db:{}}));
vi.mock("../lib/logger", () => ({logger:{info:vi.fn(),warn:vi.fn()}}));
import { readGooglePages } from "../lib/agenda-google-sync";

const base = {
  windows:[{startTime:"08:00",endTime:"14:00"}],slotMinutes:30,
  settings:{blockMinutes:120,triggerPercent:60,minLeadHours:0},
  occupiedTimes:new Set<string>(),now:new Date("2026-09-01T00:00:00-03:00"),
  date:"2026-09-02",isException:false,
};
describe("capacidade vendável e bloqueios reais",()=>{
  it("bloqueio parcial impede sobreposição, sem contar como consulta",()=>{
    const result=computeAgendaSlots({...base,blockedRanges:[{start:8*60+15,end:9*60+10}]});
    expect(result.slots.slice(0,3).every(s=>s.state==="bloqueado"&&s.reason==="compromisso")).toBe(true);
    expect(result.subBlocks[0]).toMatchObject({total:1,occupied:0,occupancy:0});
    expect(result.subBlocks[1].released).toBe(false);
  });
  it("bloco totalmente bloqueado não prende o primeiro utilizável",()=>{
    const result=computeAgendaSlots({...base,blockedRanges:[{start:480,end:600}]});
    expect(result.subBlocks[0].total).toBe(0);
    expect(result.subBlocks[1].released).toBe(true);
    expect(result.slots.find(s=>s.time==="10:00")?.state).toBe("aberto");
  });
  it("dia inteiro bloqueia todo expediente sem criar ocupação clínica",()=>{
    const result=computeAgendaSlots({...base,blockedRanges:[{start:0,end:1440}]});
    expect(result.slots.every(s=>s.state==="bloqueado")).toBe(true);
    expect(result.subBlocks.every(s=>s.total===0&&s.occupied===0)).toBe(true);
  });
  it("mantém gatilho de sessenta por cento sobre capacidade restante",()=>{
    const result=computeAgendaSlots({...base,blockedRanges:[{start:480,end:510}],
      occupiedTimes:new Set(["08:30","09:00"])});
    expect(result.subBlocks[0]).toMatchObject({total:3,occupied:2,occupancy:67});
    expect(result.subBlocks[1].released).toBe(true);
    expect(result.subBlocks[2].released).toBe(false);
  });
  it("respeita fronteiras semiabertas e duração da sessão",()=>{
    const result=computeAgendaSlots({...base,occupiedRanges:[{start:495,end:525}]});
    expect(result.slots.filter(s=>s.state==="ocupado").map(s=>s.time)).toEqual(["08:00","08:30"]);
    expect(result.slots.find(s=>s.time==="09:00")?.state).toBe("aberto");
  });
});
describe("origem Google sem escrita nem inferência clínica",()=>{
  const recurring={id:"series",status:"confirmed",summary:"Pessoa sintética",
    start:{dateTime:"2026-08-26T23:00:00-03:00",timeZone:"America/Sao_Paulo"},
    end:{dateTime:"2026-08-26T23:30:00-03:00"},recurrence:["RRULE:FREQ=WEEKLY;BYDAY=WE;COUNT=5"]};
  it("série iniciada em agosto preserva noite de quarta-feira no fuso correto",()=>{
    const [event]=normalizeGoogleSource([recurring]);
    const projected=projectImportedCommitment({...event,id:1,agenda:"Sintética",agendaId:1,cor:"#123",papel:"local"},
      new Date("2026-09-01T00:00:00-03:00"),new Date("2026-10-01T00:00:00-03:00"));
    expect(projected.map(e=>e.data)).toEqual(["2026-09-02","2026-09-09","2026-09-16","2026-09-23"]);
    expect(projected.every(e=>e.horario==="23:00")).toBe(true);
  });
  it("ocorrência movida exclui o original e não duplica",()=>{
    const override={id:"override",recurringEventId:"series",
      originalStartTime:{dateTime:"2026-09-02T23:00:00-03:00"},
      start:{dateTime:"2026-09-03T10:00:00-03:00"},end:{dateTime:"2026-09-03T10:30:00-03:00"}};
    const events=normalizeGoogleSource([recurring,override]);
    const projected=events.flatMap((e,i)=>projectImportedCommitment({...e,id:i,agenda:"Sintética",agendaId:1,cor:"#123",papel:"local"},
      new Date("2026-09-01T00:00:00-03:00"),new Date("2026-09-05T00:00:00-03:00")));
    expect(projected.map(e=>e.data)).toEqual(["2026-09-03"]);
  });
  it("cancelamento da série não deixa overrides órfãos ativos",()=>{
    expect(normalizeGoogleSource([{...recurring,status:"cancelled"},
      {id:"override",recurringEventId:"series",start:{date:"2026-09-04"},end:{date:"2026-09-05"}}])).toEqual([]);
  });
  it("corte impede importar evento simples de agosto",()=>{
    expect(normalizeGoogleSource([{id:"old",start:{date:"2026-08-01"},end:{date:"2026-08-02"}}])).toEqual([]);
  });
  it("inconsistência de duração no histórico fora do escopo não bloqueia a atualização atual",()=>{
    expect(normalizeGoogleSource([{id:"old-zero",start:{date:"2020-08-01"},end:{date:"2020-08-01"}}])).toEqual([]);
  });
});
describe("paginação e marcador",()=>{
  it("lê todas as páginas com o mesmo marcador de entrada",async()=>{
    const read=vi.fn().mockResolvedValueOnce({items:[{id:"1"}],nextPageToken:"p2"})
      .mockResolvedValueOnce({items:[{id:"2"}],nextSyncToken:"novo"});
    expect(await readGooglePages(read,"anterior")).toEqual({events:[{id:"1"},{id:"2"}],nextCursor:"novo"});
    expect(read.mock.calls[1][0]).toEqual({pageToken:"p2",syncToken:"anterior"});
  });
  it("falha na segunda página não entrega lote parcial",async()=>{
    const read=vi.fn().mockResolvedValueOnce({items:[{id:"1"}],nextPageToken:"p2"})
      .mockRejectedValueOnce(new Error("rede"));
    await expect(readGooglePages(read)).rejects.toThrow("rede");
  });
  it("marcador ausente não é tratado como atualização bem-sucedida",async()=>{
    await expect(readGooglePages(async()=>({items:[]}))).rejects.toThrow("marcador");
  });
});
