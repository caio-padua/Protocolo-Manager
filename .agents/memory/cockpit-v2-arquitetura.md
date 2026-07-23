---
name: Cockpit v2 — arquitetura de componentes
description: Padrão de decomposição do Cockpit Unificado (CockpitShell + lazy panels + rotas wouter)
---

## Regra central
URL é a ÚNICA fonte de verdade para clientId e aba. Nada em localStorage para esses dois valores.

## Estrutura de arquivos
```
cockpit-cliente/
  CockpitShell.tsx         ← raiz; lê props initialClientId+initialAba da URL
  CockpitHeader.tsx        ← sticky; 2 estados (vazio/preenchido)
  CockpitTabs.tsx          ← régua com grupos CLÍNICO/GESTÃO, fade lateral, badges
  CockpitContent.tsx       ← switch lazy (React.lazy + Suspense) por aba
  CockpitSearch.tsx        ← busca debounce 300ms, mínimo 2 chars
  ClientIdentity.tsx       ← avatar + nome Cormorant Garamond + badge alarme
  ActionButtons.tsx        ← EDITAR/DRIVE/PROTOCOLO (fantasma sem cliente)
  hooks/
    useCockpitSearch.ts    ← debounce, GET /api/clients?search=&limit=20
    usePlano.ts            ← MVP sempre "premium"; hook para monetização futura
    useFinanceiro.ts       ← estado+mutations do painel financeiro
  panels/
    PrescricaoPanel        ← usa PrescricaoFormulasPanel (cockpit/panels)
    InjetaveisPanel        ← usa Injetaveis (cockpit/panels, filtroProcedimento="injetavel")
    ImplantesPanel         ← usa Injetaveis (cockpit/panels, filtroProcedimento="implante")
    ExamesPanel            ← usa PedidosExamesPanel + ExamesEnviadosPanel + AvisoSemAnamnese
    EvolucaoPanel          ← usa EvolucaoExamesPanel (cockpit/panels)
    AnamnesePanel          ← usa AnamnesePreviaPanel (panel existente)
    DocumentosCockpitPanel ← DocumentosPanel + ContratosTimelineInline
    ProtocolosPanel        ← accordion próprio com protocolo+sessões
    FinanceiroPanel        ← usa useFinanceiro hook (self-contained)
    CadastroPanel          ← useGetClient + ClientServiceAddresses + driveSetup
```

## Rotas no App.tsx
```
/cockpit                 → CockpitShell (vazio)
/cockpit/:id/:aba        → CockpitShell com key={id} + initialClientId + initialAba
/cockpit/:id             → Redirect /cockpit/:id/prescricao
/cockpit-cliente         → Redirect /cockpit (legado)
/cockpit-cliente/:rest*  → Redirect /cockpit (legado)
/clients/:id             → Redirect /cockpit/:id (legado)
```

## Armadilhas evitadas
- **window.location.replace** → proibido; usar `const [,navigate] = useLocation()` do wouter
- **key={clientId}** no Route → OBRIGATÓRIO para forçar remontagem ao trocar de cliente
- **useListClients()** → removido do cockpit; substituído por useCockpitSearch (busca sob demanda)
- **import com prop inexistente** → Prescricao/Exames não têm prop `embedded`; usar panels de cockpit/panels/ que aceitam clientId
- **index.tsx monolito** → preservado (Regra de Ouro); App.tsx importa CockpitShell diretamente

**Why:** Arquitetura de painel escalável para multi-tenant; cada aba carrega lazy; URL como fonte de verdade garante deep-link e browser back/forward sem bug de sync de estado.

**How to apply:** Ao adicionar nova aba, criar panel em panels/, adicionar ao CockpitContent (lazy import + case no switch), registrar em CockpitTabs (ABAS array).
