/** Interface real com respostas sintéticas: nenhuma chamada chega ao servidor da clínica. */
import {test,expect} from "@playwright/test";
for(const largura of [1280,390]){
  test(`Central mostra intenção, provedor e encaminhamento (${largura})`,async({page})=>{
    await page.setViewportSize({width:largura,height:900});
    await page.addInitScript(()=>{
      localStorage.setItem("padcom_collab_token","token-sintetico-sem-validade");
      localStorage.setItem("padcom_collab_prof",JSON.stringify({id:1,name:"Operador sintético",role:"medico",isPlatformOwner:true}));
    });
    const vazio={total:0,enviadas:0,recebidas:0,falhas:0};
    await page.route("**/api/**",async route=>{
      const p=new URL(route.request().url()).pathname;
      let j:unknown={};
      if(p.endsWith("/collaborator/me"))j={authenticated:true,professional:{id:1,name:"Operador sintético",role:"medico",isPlatformOwner:true}};
      else if(p.endsWith("/comunicacao/permissoes"))j={backup:false};
      else if(p.endsWith("/comunicacao/categorias"))j={categorias:[]};
      else if(p.endsWith("/comunicacao/resumo"))j={porCanal:{wwp:{...vazio,total:1,enviadas:1},tg:vazio},porCobranca:{nao_tarifado:1},valorPagoCentavos:0};
      else if(p.endsWith("/comunicacao/conversas"))j={proximo:null,linhas:[{
        ref:"e101",canal:"wwp",clienteId:111,clienteNome:"Cliente sintético",empresaNome:"Clínica sintética",
        destino:"Contato protegido",direcao:"saida",contexto:"motor_evolution",origem:"automatico",entrega:"Lido",
        erro:null,cobranca:"nao_tarifado",valorCentavos:null,previa:"Mensagem sintética de atendimento",corpo:"Mensagem sintética de atendimento",
        criadoEm:"2026-11-23T01:00:00Z",categoriaId:null,categoriaNome:null,natureza:"sem_categoria",regraVersao:null,
        provedor:"evolution",intencao:"humano",processamento:"concluido",encaminhamento:"alerta_aceito",etapas:[],
      }]};
      else if(p.endsWith("/whatsapp/stats"))j={total:0,enviados:0,entregues:0,falhas:0,semTwilio:0,porStatus:{}};
      else if(p.endsWith("/whatsapp/messages"))j={messages:[]};
      else if(p.includes("/governanca/")||p.endsWith("/clients"))j=[];
      else if(p.endsWith("/telegram-inbox/painel-operacional"))j={token:null,segredoWebhook:null,canalAtivo:false,webhook:null,vinculados:0,mensagens:[],atendimento:[],humano:0,orientacoes:[],pedidos:{novos:0,total:0},modos:{atendimentoIa:"desligado",lembretes:"desligado",atendimentoLista:0,lembretesLista:0}};
      else if(p.endsWith("/telegram-inbox/painel-ia")||p.endsWith("/telegram-inbox/exam-followups/config"))j={clinicas:[]};
      else if(p.endsWith("/comunicacao/backups"))j={arquivos:[]};
      else if(p.endsWith("/comunicacao/backups/downloads"))j={downloads:[]};
      await route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(j)});
    });
    await page.goto("/comunicacao/central-auditoria",{waitUntil:"domcontentloaded"});
    const item=largura<640?page.getByRole("button").filter({hasText:"Cliente sintético"}):page.getByRole("row").filter({hasText:"Cliente sintético"});
    await expect(item).toBeVisible({timeout:30000});await item.click();
    await expect(page.getByText("Intenção reconhecida",{exact:true})).toBeVisible();
    await expect(page.getByText("evolution",{exact:true})).toBeVisible();
    await expect(page.getByText("alerta aceito",{exact:true})).toBeVisible();
    await expect(page.getByText("Processamento",{exact:true})).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
    await page.screenshot({path:`generated-artifacts/whatsapp-central-${largura}.png`,fullPage:false});
  });
}
