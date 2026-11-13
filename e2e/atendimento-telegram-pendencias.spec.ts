import {test,expect,type Page} from "@playwright/test";

async function preparar(page:Page){
  await page.addInitScript(()=>{
    localStorage.setItem("padcom_collab_token","token-sintetico-sem-validade-real");
    localStorage.setItem("padcom_collab_prof",JSON.stringify({id:1,name:"Profissional Sintético",role:"medico"}));
  });
  let falhar=false;
  let escritas=0;
  await page.route("**/api/**",async route=>{
    const p=new URL(route.request().url()).pathname;
    if(route.request().method()!=="GET"){escritas++;await route.fulfill({status:405,json:{error:"Teste somente leitura"}});return;}
    let json:unknown=[];
    if(p.endsWith("/collaborator/me")) json={professional:{id:1,name:"Profissional Sintético",role:"medico"}};
    else if(p.endsWith("/duvidas-orientacoes")) json={orientacoes:[],podeAprovar:true};
    else if(p.endsWith("/atendimento/estado")){
      if(falhar){await route.fulfill({status:503,json:{error:"Indisponibilidade sintética"}});return;}
      json={modoIA:"desligado",queixaRevisada:false,emAtendimentoHumano:[],pendencias:[
        {mensagemId:101,clienteId:42,estado:"incerto",erro:"resultado_desconhecido",etapas:{alerta:{estado:"enviando"}},atualizadoEm:"2026-11-13T17:00:00Z"},
        {mensagemId:102,clienteId:43,estado:"falhou",erro:"destino_ausente",etapas:{},atualizadoEm:"2026-11-13T17:00:00Z"},
        {mensagemId:103,clienteId:44,estado:"esgotado",erro:"telegram_http_403",etapas:{alerta:{estado:"esgotado"}},atualizadoEm:"2026-11-13T17:00:00Z"},
      ]};
    }
    await route.fulfill({status:200,json});
  });
  return {falhar:()=>{falhar=true;},escritas:()=>escritas};
}

test("pendências honestas no computador e celular, sem envio, e erro de atualização não vira fila vazia",async({page})=>{
  await page.clock.install();
  const h=await preparar(page);
  await page.goto("/comunicacao/duvidas-orientacoes");
  const painel=page.getByRole("region",{name:"Pendências de entrega do atendimento"});
  await expect(painel.getByTestId("delivery-101")).toContainText("Resultado incerto; sem reenvio automático");
  await expect(painel.getByTestId("delivery-102")).toContainText("destino_ausente");
  await expect(painel.getByTestId("delivery-103")).toContainText("telegram_http_403");
  await painel.scrollIntoViewIfNeeded();
  await page.screenshot({path:"generated-artifacts/atendimento-pendencias-desktop.png"});
  await page.setViewportSize({width:390,height:844});
  await painel.scrollIntoViewIfNeeded();
  await expect(painel.getByTestId("delivery-101")).toBeVisible();
  await page.screenshot({path:"generated-artifacts/atendimento-pendencias-mobile.png"});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  h.falhar();
  await page.clock.fastForward(31_000);
  await expect(painel.getByRole("alert")).toContainText("Entregas indisponíveis");
  await expect(painel.getByText("Nenhuma pendência de entrega registrada.")).toHaveCount(0);
  expect(h.escritas()).toBe(0);
});
