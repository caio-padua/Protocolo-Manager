# Matriz de decisões — Mesa Arquitetural Parxis

**Mesa:** `PAC-20260718-001`
**Status:** PROPOSTA PARA PARECER DOS DOIS REPLITS
**Regra:** nenhuma linha desta matriz autoriza implementação.

## 1. Matriz principal

| ID | Tema | Hipótese proposta por Manus | Replit Manager deve validar | Replit IHE deve validar | Decisor final |
|---|---|---|---|---|---|
| D01 | Sistemas primos | Manager e IHE permanecem independentes e colaboram por contratos versionados | Se a proposta preserva as decisões vigentes e o runtime atual | Se a proposta preserva o principal e não cria dependência operacional | CEO |
| D02 | Produto licenciado | Manager é o workspace operacional entregue às clínicas | Quais módulos e fluxos já podem compor o primeiro produto | Quais capacidades não devem ser duplicadas fora do IHE | CEO |
| D03 | Controle SaaS inicial | Bounded context isolado dentro do Manager | Custo de adaptação e aplicação local de entitlements | Riscos de não reutilizar diretamente o comercial existente | CEO após pareceres |
| D04 | Clínica/tenant | `empresas` é canônica no Manager; `unidades` permanece canônica no IHE | Saneamento de `empresas`, IDs fixos e `empresa_id` | Vínculos, escopo e limitações de `unidades` | Arquitetura, ratificada pelo CEO |
| D05 | Correlação | IDs locais relacionados por chave externa, nunca pela mesma PK | Melhor ponto de persistência e migração | Melhor ponto de persistência e migração | Arquitetura |
| D06 | Identidade | Primeiro estágio mantém auth separada; SSO futuro por identidade externa | Como migrar colaboradores/profissionais sem quebrar operação | Como preservar JWT/perfis e evitar compartilhamento de credenciais | CEO para estratégia; agentes para desenho |
| D07 | Catálogo clínico | IHE/Parxis publicam pacote versionado; Manager adota e cria overlay | Anatomia dos catálogos e snapshots no Manager | Fonte, curadoria e versionamento no IHE | CEO para governança clínica |
| D08 | Módulos comerciais | Fonte canônica nova, normalizada, substitui gradualmente JSON legado | Cobertura real de menu/API pelo guard | Lições úteis e dívidas das tabelas comerciais IHE | Arquitetura |
| D09 | Instituto Pádua | Contrato normal, preço de lista e fatura `WAIVED` | Viabilidade do dogfooding sem bypass | Riscos contábeis, de permissão ou métricas | CEO |
| D10 | Clínica Laboratório | Dados sintéticos e gateway sandbox para falhas | Infraestrutura mínima e isolamento | Padrões de teste já usados no IHE | CEO para prioridade |
| D11 | Primeiro produto | `CLIENT_REGISTRY + INJECTABLE_PROTOCOLS` | Prontidão, dependências e lacunas | Interfaces necessárias com conhecimento IHE | CEO |
| D12 | Gate 0 | Segurança, auth, tenant, backup e inventário antes de módulos pagos | Matriz de rotas, segredos e tenant fixo | Evidências e alertas de padrões inseguros semelhantes | CEO autoriza investigação; agentes definem detalhe |
| D13 | Extração futura | Control Plane só vira serviço separado quando escala/receita justificar | Limites do monorepo e custo futuro | Dependências e contratos necessários | CEO após marco comercial |
| D14 | Construção | Missões separadas por repo, cada qual com spec e revisão | Compatibilidade com Paxter Loop | Compatibilidade com manifesto/waves do IHE | CEO autoriza cada missão |

## 2. Critérios para cada parecer

Cada agente classificará cada decisão como `APROVAR`, `APROVAR_COM_RESSALVA`, `REJEITAR` ou `NAO_SE_APLICA`. Toda ressalva ou rejeição deverá informar a evidência, o risco e a menor alternativa segura.

| Campo obrigatório | Exemplo de conteúdo aceitável |
|---|---|
| Evidência | `lib/db/src/schema/...ts:42-78`, saída de `\d`, rota montada, teste ou commit |
| Risco | Duplicidade de fonte, vazamento cross-tenant, quebra de compatibilidade ou custo operacional |
| Alternativa mínima | Reusar tabela existente, adicionar vínculo, criar adaptador ou adiar extração |
| Impacto no usuário | Menu, onboarding, pagamento, suporte ou continuidade assistencial |
| Impacto no negócio | Prazo, custo, vendabilidade, suporte ou margem |

## 3. Divergências que não devem ser decididas pelos agentes

Preço final, condições comerciais, royalties, nomenclatura de marca, prioridade entre módulos, compartilhamento clínico e tolerância a risco pertencem ao CEO. Os Replits devem explicar as consequências técnicas de cada opção, não escolher o negócio.

## 4. Regra de arbitragem

Quando os dois agentes concordarem e Manus confirmar as evidências, o ponto entra na proposta consolidada. Quando divergirem, Manus verificará as fontes, tentará formular um experimento somente leitura e, se a divergência persistir, apresentará uma única decisão A/B/C ao CEO.

**RESUMO EM 1 LINHA:** os dois Replits julgam a mesma matriz; evidência resolve o técnico e o CEO resolve negócio, clínica e prioridade.
