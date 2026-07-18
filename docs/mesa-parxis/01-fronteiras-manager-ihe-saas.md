# Fronteiras propostas — Parxis Manager, IHE e governança SaaS

**Status:** HIPÓTESE PARA MESA ARQUITETURAL — NÃO AUTORIZA CÓDIGO
**Data:** 18/07/2026
**Autor:** Manus AI
**Decisor final:** Dr. Caio Henrique Fernandes Pádua

## 1. Conclusão primeiro

O **Parxis Manager** deve continuar sendo o produto operacional utilizado e licenciado pelas clínicas: cadastro, agenda, protocolos injetáveis, estoque, documentos, financeiro clínico e experiência cotidiana da equipe. O **IHE** deve continuar como sistema primo independente, dono de seus motores, inteligência clínica, prescrição, catálogos e demais domínios já consolidados. Eles colaboram por interfaces versionadas, nunca por leitura direta do banco um do outro.[1] [2]

A governança SaaS do Parxis — módulos, preços, assinaturas, faturas, concessões, entitlements e Console do CEO — deve nascer como um **bounded context claramente isolado dentro do monorepo Manager**, porque é o próprio Manager que precisa aplicar os bloqueios e oferecer a experiência licenciada. Esta é uma recomendação econômica e incremental, não uma decisão definitiva. A extração futura para um serviço `Parxis Control Plane` independente será avaliada somente quando receita, escala ou risco operacional justificarem o custo.

> **Regra de segurança:** o IHE poderá fornecer padrões, conhecimento e evidências, mas não deve virar uma dependência online obrigatória para abrir o prontuário ou executar um protocolo no Manager.

## 2. Por que a mesa conjunta é necessária

Os dois sistemas já possuem conceitos parcialmente sobrepostos. O Manager possui `empresas`, licenciamento, módulos em JSON, contratos e hierarquia; o IHE possui `unidades`, `modulos_sistema`, `contrato_clinica`, `modulos_contratados` e `faturamento_mensal`.[3] [4] Copiar qualquer uma dessas estruturas para o outro lado sem confronto conjunto criaria duas fontes de verdade, IDs concorrentes e regras financeiras divergentes.

| Pergunta | Manager deve provar | IHE deve provar | Resultado esperado da mesa |
|---|---|---|---|
| Quem é a clínica? | Anatomia real de `empresas`, unidades locais e dados já associados | Anatomia real de `unidades` e seus vínculos | Um conceito em cada sistema, com correlação explícita e sem PK compartilhada |
| Quem autentica? | Colaboradores, profissionais, sessões e contexto atual | `usuarios`, JWT, perfis, escopos e unidade | Estratégia progressiva de identidade sem compartilhar senha ou token |
| Quem vende o Parxis? | Como o Manager aplica módulos e monta menus | O que o domínio comercial do IHE já aprendeu | Fonte canônica única para catálogo, contrato, fatura e entitlement do Parxis |
| Quem possui o conteúdo clínico? | Fórmulas, injetáveis, protocolos e snapshots já usados | Motores, catálogos e curadoria consolidada | Contrato versionado de publicação sem PII e sem sobrescrita automática |
| Quem guarda dados assistenciais? | Prontuário e execução local do Manager | Dados clínicos nativos do IHE | Cada sistema permanece dono dos próprios registros; zero banco compartilhado |

## 3. Fronteira recomendada por domínio

| Domínio | Fonte de verdade recomendada | Responsabilidade do outro sistema | Regra de integração |
|---|---|---|---|
| Operação da clínica licenciada | **Manager** | IHE não consulta prontuário do Manager por banco | API/evento explícito, mínimo necessário e com autorização |
| Tenant operacional do Parxis | **Manager `empresas`**, após saneamento | IHE mantém sua própria `unidades` | Tabela de correlação, nunca igualdade presumida entre IDs |
| Módulos, planos e preços do Parxis | **Control Plane no Manager**, inicialmente | IHE fornece análise crítica e padrões reutilizáveis | Contrato versionado; nenhuma duplicação automática das tabelas IHE |
| Assinaturas e faturas SaaS do Parxis | **Control Plane no Manager** | IHE pode compartilhar adaptadores e lições | Gateway e ledger separados do financeiro de pacientes |
| Financeiro clínico | Sistema onde a cobrança do paciente ocorreu | Nenhuma consolidação por leitura direta | Evento financeiro agregado, sem prontuário, se houver necessidade futura |
| Catálogo clínico autoral | Sistema que criou e mantém o conteúdo | O outro pode importar uma versão publicada | Pacote imutável, versionado, idempotente e sem origem acoplada ao runtime |
| Biblioteca Parxis comercial | **Plataforma Parxis** | IHE pode propor versões e evidências | Curadoria antes da publicação; overlay da clínica e snapshot assistencial |
| Identidade pessoal | Separada por sistema no primeiro estágio | Correlação futura por identificador externo verificado | Nunca compartilhar hash de senha, sessão ou token interno |
| Auditoria | Cada sistema audita suas ações | Correlação por `correlation_id` | Trilhas independentes e reconciliáveis |
| Analytics da plataforma | Control Plane, com dados agregados | Sistemas emitem métricas permitidas | Sem PII clínica no painel comercial |

## 4. O que permanece proibido

A colaboração não autoriza banco compartilhado, FK entre bancos, consulta direta às tabelas do sistema primo, cópia de credenciais, endpoint clínico condicionado à disponibilidade online do outro sistema ou duplicação silenciosa das entidades `empresas` e `unidades`. Também não autoriza transformar o `isPlatformOwner` do Manager ou o `validador_mestre` do IHE em passe livre entre clínicas.[3] [5]

O princípio vigente do Manager declara IHE e Manager como **sistemas primos independentes**, cada qual dono dos próprios dados, colaborando por interface.[1] O manifesto do IHE exige consultar schema e código real antes de desenhar reformas e determina que divergências sejam apresentadas ao CEO com evidências.[2]

## 5. Arquitetura incremental recomendada

| Estágio | Decisão arquitetural | Justificativa econômica e técnica |
|---:|---|---|
| 0 | Os dois Replits fazem inventário, sem código | Evita construir sobre estruturas já existentes ou inseguras |
| 1 | Control Plane nasce isolado no Manager | Menos infraestrutura e menor dependência distribuída no início |
| 2 | Manager aplica entitlements localmente e falha fechado | A experiência licenciada não depende de rede entre sistemas |
| 3 | IHE publica somente pacotes clínicos versionados aprovados | Reaproveita conhecimento sem acoplar bases nem compartilhar PII |
| 4 | Instituto Pádua usa contrato normal com fatura `WAIVED` | Permite dogfooding real sem pagamento fictício |
| 5 | Clínica Laboratório testa pagamento, atraso e suspensão | Protege o atendimento real de testes destrutivos |
| 6 | Primeiro piloto recebe `CLIENT_REGISTRY + INJECTABLE_PROTOCOLS` | Produto vendável pequeno, observável e certificável |
| 7 | Avalia-se extração do Control Plane | Só ocorre se clientes, receita e SLO justificarem novo serviço |

## 6. Contratos de integração que a mesa deverá desenhar

| Contrato | Produtor provável | Consumidor provável | Conteúdo permitido |
|---|---|---|---|
| `CatalogRelease.v1` | IHE ou curadoria Parxis | Manager | Código semântico, versão, conteúdo clínico aprovado, hash e vigência; sem PII |
| `CatalogAdoption.v1` | Manager | Plataforma Parxis | Adoção, clonagem ou rejeição por tenant; sem dados do paciente |
| `TenantCorrelation.v1` | Processo administrativo | Ambos | IDs locais, chave externa, status e data; sem compartilhar PK como autoridade |
| `PlatformMetric.v1` | Manager | Control Plane | Contagem agregada, saúde, uso e limite; sem conteúdo clínico |
| `AuditCorrelation.v1` | Ambos | Auditoria autorizada | `correlation_id`, ator local pseudonimizado, ação e resultado |

O contrato `EntitlementSnapshot` permanece interno ao Manager enquanto o Control Plane estiver no mesmo monorepo. Se futuramente for extraído, deverá ser assinado, versionado, armazenado em cache com validade curta e acompanhado de política explícita de indisponibilidade.

## 7. Perguntas obrigatórias aos dois Replits

Cada agente deverá responder com **evidências de arquivo, linha, consulta e teste**, não com opinião isolada.

| Código | Pergunta comum |
|---|---|
| Q1 | O que já existe no seu schema e código para clínica, identidade, módulo, contrato, cobrança e isolamento por tenant? |
| Q2 | Quais decisões prévias do CEO seriam violadas pela proposta? |
| Q3 | Quais tabelas ou rotas são consolidadas e não podem ser transplantadas? |
| Q4 | Em quais pontos a proposta cria duplicidade ou dependência indevida? |
| Q5 | Qual é o menor Gate 0 que reduz risco sem interromper a operação? |
| Q6 | Que parte do seu sistema pode ser reutilizada como padrão, e que parte deve permanecer apenas como aprendizado? |
| Q7 | Você aprova a fronteira recomendada, aprova com ressalvas ou rejeita? Quais evidências sustentam a posição? |

## 8. Decisões reservadas ao CEO

Os agentes não decidirão preços, divisão societária, promessa comercial, suspensão definitiva de clínica, compartilhamento de dados, fusão dos sistemas ou execução de migrações. Divergências serão condensadas em uma pergunta TDAH-friendly com opções **A/B/C**, recomendação de Manus e consequência de cada opção.

**RESUMO EM 1 LINHA:** Manager opera e licencia o Parxis; IHE permanece primo independente e fornece conhecimento/padrões por contratos versionados; a mesa conjunta valida essa fronteira antes de qualquer construção.

## Referências

[1]: https://github.com/caio-padua/Protocolo-Manager/blob/main/replit.md "Conceito-raiz de sistemas primos independentes no Manager"
[2]: https://github.com/caio-padua/Integrative-Health-Engine/blob/replit-agent/MANIFESTO_DR_REPLIT.md "Manifesto de hierarquia, evidência e arbitragem do IHE"
[3]: https://github.com/caio-padua/Protocolo-Manager/blob/main/lib/db/src/schema/empresas.ts "Schema atual de empresas e licenciamento do Manager"
[4]: https://github.com/caio-padua/Integrative-Health-Engine/blob/replit-agent/lib/db/src/schema/comercial.ts "Módulos, contratos e faturamento no IHE"
[5]: https://github.com/caio-padua/Integrative-Health-Engine/blob/replit-agent/lib/db/src/schema/usuarios.ts "Identidade, perfil e escopo atuais no IHE"
