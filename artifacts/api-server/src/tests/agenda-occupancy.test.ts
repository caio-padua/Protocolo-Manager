import {describe,it,expect,vi} from "vitest";
import {PgDialect} from "drizzle-orm/pg-core";
vi.mock("@workspace/db",()=>({db:{}}));
import {loadAgendaOccupancy} from "../lib/agenda-occupancy";
describe("consulta de bloqueios compartilhada",()=>{
  it("serializa identificadores como um parâmetro de array PostgreSQL, não tupla",async()=>{
    const execute=vi.fn()
      .mockResolvedValueOnce({rows:[{id:32,google_calendar_id:"synthetic"}]})
      .mockResolvedValueOnce({rows:[{expected:1,fresh:1}]})
      .mockResolvedValueOnce({rows:[]})
      .mockResolvedValueOnce({rows:[]});
    const result=await loadAgendaOccupancy({id:19001,locationId:32,professionalId:null},"2026-11-09",{execute} as any);
    expect(result.fresh).toBe(true);
    const query=new PgDialect().sqlToQuery(execute.mock.calls[1][0]);
    expect(query.params).toContain("{32}");
    expect(query.sql).toContain("::int[]");
  });
  it("dado vencido não é considerado fresco",async()=>{
    const execute=vi.fn()
      .mockResolvedValueOnce({rows:[{id:32,google_calendar_id:"synthetic"}]})
      .mockResolvedValueOnce({rows:[{expected:1,fresh:0}]})
      .mockResolvedValueOnce({rows:[]}).mockResolvedValueOnce({rows:[]});
    expect((await loadAgendaOccupancy({id:19001,locationId:32,professionalId:null},"2026-11-09",{execute} as any)).fresh).toBe(false);
  });
  it("intervalo atravessando meia-noite é recortado sem expor título no resultado do motor",async()=>{
    const execute=vi.fn()
      .mockResolvedValueOnce({rows:[{id:32,google_calendar_id:"synthetic"}]})
      .mockResolvedValueOnce({rows:[{expected:1,fresh:1}]})
      .mockResolvedValueOnce({rows:[{
        id:1,titulo:"Título sintético privado",inicio:"2026-11-08T23:30:00-03:00",
        fim:"2026-11-09T00:30:00-03:00",diaInteiro:false,recorrencia:null,origem:"google",
        agenda:"Sintética",cor:"#123",papel:"pessoal",
      }]}).mockResolvedValueOnce({rows:[]});
    const result=await loadAgendaOccupancy({id:19001,locationId:32,professionalId:null},"2026-11-09",{execute} as any);
    expect(result.blockedRanges).toEqual([{start:0,end:30}]);
    expect(JSON.stringify(result)).not.toContain("privado");
  });
});
