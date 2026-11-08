import {test,expect,type BrowserContext} from "@playwright/test";

// Somente interface: todos os serviços são interceptados e todos os dados sintéticos.
// Não cria sessão real, não acessa Google, clientes, cobranças ou documentos.
async function fixture(context: BrowserContext, manager: boolean, realOccupied = false, syntheticSessions: any[] = [], ranked = false) {
  const now=()=>new Date().toISOString();
  const resource={id:19001,name:"Agenda sintética",kind:"medico",modality:"local",
    locationId:35001,professionalId:91001,slotMinutes:30,active:true,color:"#2c5480",sortOrder:0};
  const calendar={id:35001,name:"Agenda sintética",color:"#2c5480",role:"pessoal",enabled:true,
    lastSuccess:now(),lastAttempt:now(),error:null,personalOwnerId:91001,canManage:manager};
  const pending:any[] = manager ? [{id:77001,resourceId:19001,resource:"Agenda sintética",
    reason:"Expediente sintético para conferência",state:"pendente",
    windows:[{weekday:6,startTime:"09:00",endTime:"10:00",repeatWeeks:2,anchorDate:"2026-11-21"}],createdAt:now(),
    locationId:35001,requestedBy:91002,canDecide:true}] : [];
  const state={refreshes:0,legacyWrites:0,proposal:null as any,decision:null as any,savedWindows:null as any,
    denyClients:false, simulatedQueries:0, confirmations:[] as any[],
    windows:[{id:60001,resourceId:19001,weekday:6,startTime:"09:00",endTime:"13:00",repeatWeeks:2,anchorDate:"2026-11-21"}] as any[]};
  await context.addInitScript(()=>{
    localStorage.setItem("padcom_collab_token","synthetic-ui-only-not-a-valid-token");
    localStorage.setItem("padcom_collab_prof",JSON.stringify({id:91001,name:"Profissional sintético",role:"medico"}));
  });
  await context.route("**/api/**",async route=>{
    const request=route.request();const path=new URL(request.url()).pathname;
    let body:any=[];
    if(path==="/api/agenda/integration") body={
      agendas:[calendar],professionals:[{id:91001,name:"Titular sintético"}],resources:[resource],
      globalSettingsOwnerOnly:true,canManageGlobalSettings:manager,companyId:90001,
    };
    else if(path==="/api/agenda/integration/refresh") {
      state.refreshes++;calendar.lastAttempt=new Date(Date.now()+1000).toISOString();
      return route.fulfill({status:202,contentType:"application/json",body:""});
    } else if(path==="/api/agenda/integration/read-settings") {
      calendar.enabled=request.postDataJSON().enabled;body={ok:true};
    } else if(path==="/api/agenda/integration/personal-owner") {
      calendar.personalOwnerId=request.postDataJSON().professionalId;body={ok:true};
    } else if(path==="/api/agenda/requests" && request.method()==="POST") {
      state.proposal=request.postDataJSON();
      pending.push({id:77002,...state.proposal,resource:"Agenda sintética",state:"pendente",
        createdAt:now(),locationId:35001,requestedBy:91001,canDecide:manager});
      return route.fulfill({status:201,json:{id:77002,state:"pendente"}});
    } else if(path==="/api/agenda/requests") body={requests:pending};
    else if(path==="/api/agenda/resources/19001/windows" && request.method()==="PUT") {
      state.savedWindows=request.postDataJSON();
      state.windows=state.savedWindows.windows.map((w:any,i:number)=>({...w,id:60010+i,resourceId:19001}));
      body=state.windows;
    } else if(path==="/api/agenda/resources/19001/windows") body=state.windows;
    else if(path==="/api/agenda/requests/77001/decision") {
      state.decision=request.postDataJSON();pending[0].state=state.decision.decision==="aprovar"?"aprovado":"recusado";
      body={status:200,state:pending[0].state};
    } else if(path==="/api/agenda/google-compromissos") body={desde:"2026-09-01",
      agendas:[{id:35001,nome:"Agenda sintética",cor:"#2c5480"}],eventos:[
      {id:"synthetic:1",titulo:"Ocupado — compromisso pessoal",inicio:"2026-11-07T13:00:00Z",
        fim:"2026-11-07T14:00:00Z",data:"2026-11-07",horario:"10:00",diaInteiro:false,
        agenda:"Agenda sintética",agendaId:35001,cor:"#2c5480",recorrente:false},
    ]};
    else if(path==="/api/sessions") body=syntheticSessions;
    else if(/^\/api\/sessions\/\d+\/confirm-substance$/.test(path)) {
      const input=request.postDataJSON(); state.confirmations.push(input);
      const app=syntheticSessions.flatMap((s:any)=>s.substanceApplications).find((a:any)=>a.id===input.applicationId);
      if(app) {app.status=input.confirmed?"applied":"missed";app.appliedAt=input.confirmed?now():null;
        app.displayState=input.confirmed?"applied":"notPerformed";}
      body=syntheticSessions[0];
    }
    else if(path==="/api/agenda/resources") body=[resource];
    else if(path==="/api/agenda/settings") body={id:1,blockMinutes:120,triggerPercent:60,minLeadHours:24};
    else if(path==="/api/agenda/slots") {
      const simulated=new URL(request.url()).searchParams.has("occupied");
      if(simulated) state.simulatedQueries++;
      body={resourceId:19001,date:new URL(request.url()).searchParams.get("date"),slots:[
        {time:"09:00",state:realOccupied&&!simulated?"ocupado":"aberto",reason:null,subBlockIndex:0},
        {time:"10:00",state:simulated?"ocupado":"aberto",reason:null,subBlockIndex:0},
        {time:"11:00",state:"ocupado",reason:null,subBlockIndex:0},
      ],subBlocks:[{startTime:"09:00",endTime:"12:00",released:true,total:3,occupied:1,occupancy:33}],reason:null};
    }
    else if(path==="/api/clients") {
      if(state.denyClients) return route.fulfill({status:503,json:{error:"Indisponível"}});
      body=[{id:42001,name:"Cliente sintético",cpf:"12345678901",phone:"11999999999",status:"active"}];
    }
    else if(path==="/api/clients/42001") body={
      id:42001,name:"Cliente sintético",visitPreferences:{
        medical:{weekdays:[0,1,2,3,4,5,6],times:[0,1,2,3,4,5,6].flatMap(weekday=>[
          {weekday,time:"09:00"},{weekday,time:"11:00"},
        ]), ...(ranked ? {priority:[{weekday:1,time:"09:00"},{weekday:1,time:"11:00"}]} : {})},nursing:{weekdays:[],times:[]},
      },
    };
    else if(path.startsWith("/api/google-calendar/")) {state.legacyWrites++;body={};}
    await route.fulfill({status:200,json:body});
  });
  return state;
}
test("agenda distingue aplicação não realizada e exige confirmação explícita",async({page,context})=>{
  const date=await page.evaluate(()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-");});
  const session={id:70001,clientId:42001,clientName:"Cliente sintético",clientCpf:null,
    professionalName:"Profissional sintético",protocolId:81001,protocolTitle:"Protocolo sintético",
    scheduledDate:date,scheduledTime:"09:00",status:"scheduled",unit:"Local sintético",serviceType:"clinic",
    weekNumber:1,substanceApplications:[
      {id:111,substanceId:201,substanceName:"Substância aplicada",substanceColor:"#123456",dose:"Dose sintética",sessionNumber:1,totalSessions:1,status:"applied",availability:"disp",appliedAt:"2030-01-01T12:00:00Z",displayState:"applied"},
      {id:112,substanceId:202,substanceName:"Substância não realizada",substanceColor:"#123456",dose:"Dose sintética",sessionNumber:1,totalSessions:1,status:"missed",availability:"disp",appliedAt:null,displayState:"notPerformed"},
      {id:113,substanceId:203,substanceName:"Substância pendente",substanceColor:"#123456",dose:"Dose sintética",sessionNumber:1,totalSessions:1,status:"pending",availability:"disp",appliedAt:null,displayState:"disp"},
    ]};
  const state=await fixture(context,true,false,[session]);
  await page.goto("/agenda");
  await expect(page.getByText("Substância não realizada")).toBeVisible();
  await expect(page.getByLabel("Confirmar Substância não realizada")).toHaveCount(0);
  await page.getByRole("button",{name:"Registrar Substância pendente não aplicada"}).click();
  await expect(page.getByText("Isso não registra falta do cliente.",{exact:false})).toBeVisible();
  expect(state.confirmations).toHaveLength(0);
  await page.getByRole("button",{name:"Registrar não aplicada",exact:true}).click();
  await expect.poll(()=>state.confirmations.length).toBe(1);
  expect(state.confirmations[0]).toMatchObject({substanceId:203,applicationId:113,confirmed:false});
});
test("agenda atualiza por leitura e exibe compromisso sem envio legado",async({page,context})=>{
  const state=await fixture(context,true);
  await page.goto("/agenda");
  await expect(page.getByText("Ocupado — compromisso pessoal",{exact:true})).toBeVisible();
  await page.getByTestId("button-refresh-google").click();
  await expect.poll(()=>state.refreshes).toBe(1);
  expect(state.legacyWrites).toBe(0);
});
test("marca apenas horários abertos como preferidos, sem transformar preferência em vaga",async({page,context})=>{
  await fixture(context,true);
  await page.goto("/agenda/motor");
  const clientPanel=page.getByText("Cliente",{exact:true}).locator("..");
  await clientPanel.getByRole("combobox").click();
  await page.getByRole("option",{name:"Cliente sintético"}).click();
  const booking=page.getByTestId("agenda-marcacao-real");
  await expect(booking.getByText("Dia preferido pelo cliente. Preferência não garante disponibilidade.")).toBeVisible();
  await expect(booking.getByRole("button",{name:"09:00, horário preferido"})).toBeVisible();
  await expect(booking.getByRole("button",{name:"10:00",exact:true})).toBeVisible();
  await expect(booking.getByRole("button",{name:"11:00, horário preferido"})).toHaveCount(0);
});
test("mostra a ordem apenas para a preferência que está realmente aberta",async({page,context})=>{
  await fixture(context,true,false,[],true);
  await page.goto("/agenda/motor");
  const booking=page.getByTestId("agenda-marcacao-real");
  await booking.getByText("Cliente",{exact:true}).locator("..").getByRole("combobox").click();
  await page.getByRole("option",{name:"Cliente sintético"}).click();
  await expect(booking.getByRole("button",{name:"09:00, horário preferido, preferência 1"})).toBeVisible();
  await expect(booking.getByRole("button",{name:"11:00, horário preferido, preferência 2"})).toHaveCount(0);
});
test("ocupação simulada nunca transforma horário realmente ocupado em vaga",async({page,context})=>{
  const state=await fixture(context,true,true);
  await page.goto("/agenda/motor");
  const booking=page.getByTestId("agenda-marcacao-real");
  await booking.getByText("Cliente",{exact:true}).locator("..").getByRole("combobox").click();
  await page.getByRole("option",{name:"Cliente sintético"}).click();
  await expect(booking.getByRole("button",{name:"09:00, horário preferido"})).toHaveCount(0);
  await page.getByTestId("agenda-simulacao").getByRole("button",{name:"10:00",exact:true}).click();
  await expect.poll(()=>state.simulatedQueries).toBeGreaterThan(0);
  await expect(page.getByTestId("agenda-simulacao").getByRole("button",{name:"09:00",exact:true})).toHaveAttribute("title","aberto");
  await expect(booking.getByRole("button",{name:"09:00, horário preferido"})).toHaveCount(0);
  await expect(booking.getByRole("button",{name:"10:00",exact:true})).toBeVisible();
});
test("troca de acesso com falha não mostra lista nem seleção da sessão anterior",async({page,context})=>{
  const state=await fixture(context,true);
  await page.goto("/agenda/motor");
  const booking=page.getByTestId("agenda-marcacao-real");
  const picker=booking.getByText("Cliente",{exact:true}).locator("..").getByRole("combobox");
  await picker.click();
  await page.getByRole("option",{name:"Cliente sintético"}).click();
  await expect(booking.getByText("Dia preferido pelo cliente. Preferência não garante disponibilidade.")).toBeVisible();
  state.denyClients=true;
  await page.evaluate(()=>{
    localStorage.setItem("padcom_collab_prof",JSON.stringify({id:91002,name:"Outro profissional",role:"medico"}));
    window.dispatchEvent(new Event("collab-auth-changed"));
  });
  await expect(booking.getByText("Não foi possível carregar os clientes para este acesso. Confira a sessão e tente novamente.")).toBeVisible();
  await expect(picker).toBeDisabled();
  await expect(booking.getByText("Cliente sintético")).toHaveCount(0);
  await expect(booking.getByText("Dia preferido pelo cliente. Preferência não garante disponibilidade.")).toHaveCount(0);
});
test("secretaria solicita expediente sem conseguir alterar leitura diretamente",async({page,context})=>{
  await page.setViewportSize({width:390,height:844});
  const state=await fixture(context,false);
  await page.goto("/agenda/motor");
  await expect(page.getByTestId("toggle-read-35001")).toBeDisabled();
  await page.getByTestId("select-request-resource").click();
  await page.getByRole("option",{name:"Agenda sintética",exact:true}).click();
  await page.getByTestId("input-request-reason").fill("Fechar todo o expediente sintético para conferência.");
  await page.getByTestId("button-submit-request").click();
  await expect.poll(()=>state.proposal).not.toBeNull();
  expect(state.proposal.windows).toEqual([]);
  expect(state.proposal.expectedWindows[0].repeatWeeks).toBe(2);
  await expect(page.getByTestId("row-request-77002")).toBeVisible();
  await expect(page.getByTestId("button-approve-77002")).toHaveCount(0);
  expect(state.legacyWrites).toBe(0);
});
test("administrador confere proposta e a decisão aparece sem recarregar a página",async({page,context})=>{
  const state=await fixture(context,true);
  await page.goto("/agenda/motor");
  const row=page.getByTestId("row-request-77001");
  await expect(row.getByText("09:00", {exact:false})).toBeVisible();
  await expect(row.getByText("A cada duas semanas, desde 21/11/2026")).toBeVisible();
  await row.getByTestId("button-approve-77001").click();
  await expect.poll(()=>state.decision?.decision).toBe("aprovar");
  await expect(row.getByText("Aprovada",{exact:true})).toBeVisible();
  await expect(row.getByTestId("button-approve-77001")).toHaveCount(0);
});
test("janelas quinzenais mantêm data e versão ao salvar",async({page,context})=>{
  const state=await fixture(context,true);
  await page.goto("/agenda/motor");
  const repeat=page.getByRole("combobox",{name:"Repetição",exact:true}).first();
  await expect(repeat).toHaveValue("2");
  const firstDay=page.getByLabel("Primeiro dia de atendimento",{exact:true}).first();
  await expect(firstDay).toHaveValue("2026-11-21");
  await firstDay.fill("2026-11-20");
  await page.getByRole("button",{name:"Salvar Janelas"}).click();
  await expect(page.getByText("Confira a data inicial",{exact:true})).toBeVisible();
  expect(state.savedWindows).toBeNull();
  await firstDay.fill("2026-11-21");
  await page.getByRole("button",{name:"Salvar Janelas"}).click();
  await expect.poll(()=>state.savedWindows).not.toBeNull();
  expect(state.savedWindows.windows[0]).toMatchObject({weekday:6,repeatWeeks:2,anchorDate:"2026-11-21"});
  expect(state.savedWindows.expectedWindows[0]).toMatchObject({weekday:6,repeatWeeks:2,anchorDate:"2026-11-21"});
});
