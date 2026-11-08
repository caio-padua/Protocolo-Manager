import {test,expect,type BrowserContext} from "@playwright/test";

// Somente interface: todos os serviços são interceptados e todos os dados sintéticos.
// Não cria sessão real, não acessa Google, clientes, cobranças ou documentos.
async function fixture(context: BrowserContext, manager: boolean) {
  const now=()=>new Date().toISOString();
  const resource={id:19001,name:"Agenda sintética",kind:"medico",modality:"local",
    locationId:35001,professionalId:91001,slotMinutes:30,active:true,color:"#2c5480",sortOrder:0};
  const calendar={id:35001,name:"Agenda sintética",color:"#2c5480",role:"pessoal",enabled:true,
    lastSuccess:now(),lastAttempt:now(),error:null,personalOwnerId:91001,canManage:manager};
  const pending:any[] = manager ? [{id:77001,resourceId:19001,resource:"Agenda sintética",
    reason:"Expediente sintético para conferência",state:"pendente",
    windows:[{weekday:1,startTime:"09:00",endTime:"10:00"}],createdAt:now(),
    locationId:35001,requestedBy:91002,canDecide:true}] : [];
  const state={refreshes:0,legacyWrites:0,proposal:null as any,decision:null as any};
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
    else if(path==="/api/agenda/requests/77001/decision") {
      state.decision=request.postDataJSON();pending[0].state=state.decision.decision==="aprovar"?"aprovado":"recusado";
      body={status:200,state:pending[0].state};
    } else if(path==="/api/agenda/google-compromissos") body={desde:"2026-09-01",eventos:[
      {id:"synthetic:1",titulo:"Ocupado — compromisso pessoal",inicio:"2026-11-07T13:00:00Z",
        fim:"2026-11-07T14:00:00Z",data:"2026-11-07",horario:"10:00",diaInteiro:false,
        agenda:"Agenda sintética",cor:"#2c5480",recorrente:false},
    ]};
    else if(path==="/api/agenda/resources") body=[resource];
    else if(path==="/api/agenda/settings") body={id:1,blockMinutes:120,triggerPercent:60,minLeadHours:24};
    else if(path==="/api/agenda/slots") body={resourceId:19001,date:"2026-11-07",slots:[],subBlocks:[],reason:"sem-expediente"};
    else if(path.startsWith("/api/google-calendar/")) {state.legacyWrites++;body={};}
    await route.fulfill({status:200,json:body});
  });
  return state;
}
test("agenda atualiza por leitura e exibe compromisso sem envio legado",async({page,context})=>{
  const state=await fixture(context,true);
  await page.goto("/agenda");
  await expect(page.getByText("Ocupado — compromisso pessoal",{exact:true})).toBeVisible();
  await page.getByTestId("button-refresh-google").click();
  await expect.poll(()=>state.refreshes).toBe(1);
  expect(state.legacyWrites).toBe(0);
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
  await expect(page.getByTestId("row-request-77002")).toBeVisible();
  await expect(page.getByTestId("button-approve-77002")).toHaveCount(0);
  expect(state.legacyWrites).toBe(0);
});
test("administrador confere proposta e a decisão aparece sem recarregar a página",async({page,context})=>{
  const state=await fixture(context,true);
  await page.goto("/agenda/motor");
  const row=page.getByTestId("row-request-77001");
  await expect(row.getByText("09:00", {exact:false})).toBeVisible();
  await row.getByTestId("button-approve-77001").click();
  await expect.poll(()=>state.decision?.decision).toBe("aprovar");
  await expect(row.getByText("Aprovada",{exact:true})).toBeVisible();
  await expect(row.getByTestId("button-approve-77001")).toHaveCount(0);
});
