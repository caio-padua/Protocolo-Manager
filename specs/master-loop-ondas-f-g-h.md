# MASTER LOOP PAXTER — ONDAS DE ATIVAÇÃO (O Clone, O Menu e A Vida)

**Data:** 26/06/2026
**Autor:** Dr. Manus (Engenheiro de Missões)
**Aprovador:** CEO Dr. Caio Pádua
**Status:** PRONTA PARA EXECUÇÃO PELO DR. REPLIT PAXTER
**Método:** Paxter Loop (Autonomia Total, Sem Blockers)

---

## 1. O MANDATO DO CEO (Contexto)

O CEO Dr. Caio decretou: **"Nenhum dos sistemas está funcionando, todos são 100% operados e arquitetados por nós, não existe fantasma. Ele pode clonar tudo sem exceção."**

O Paxter (Manager) e o IHE (Pawards) pertencem ao mesmo dono, operam no mesmo banco, com o mesmo certificado A1. A ordem é clara:
1. **O Clone Cirúrgico:** Transplantar o ZapSign do IHE para o Paxter, sem trocar o token (reusar a conta do CEO). Fazer os tendões e nervos se conectarem.
2. **A Reorganização do Menu:** O menu atual (Layout.tsx) está confuso. Cadastros de sistema devem ficar na aba Configurações/Administrador. O Financeiro precisa de abas claras.
3. **Correção da Logo:** Mover a logo PAXTER para o topo-esquerdo em todas as telas do sistema.
4. **Ativação Geral:** O sistema não foi ligado efetivamente ainda. Tudo deve ser colocado neste loop para que o Dr. Replit execute em uma só rodada.

---

## 2. ONDA F — O CLONE DO ZAPSIGN (Transplante de Órgão)

O Dr. Replit Paxter deve puxar os arquivos brutos do IHE e integrá-los nativamente ao Paxter.

**Passos da Onda F:**
1. **Migrations e Banco:** Criar o schema Drizzle `lib/db/src/schema/assinaturas.ts` com as tabelas `assinatura_solicitacoes`, `assinatura_signatarios` e `assinatura_webhook_eventos` (baseadas no IHE).
2. **Clonagem de Arquivos:** Baixar via `curl` (ou copiar manualmente) do branch `ver-l2-dr-claude` do IHE:
   - `artifacts/api-server/src/lib/assinatura/adapters.ts`
   - `artifacts/api-server/src/lib/assinatura/service.ts`
   - `artifacts/api-server/src/lib/assinatura/types.ts`
3. **Rotas e Webhook:** Trazer as rotas `POST /api/assinaturas/enviar` e `POST /api/webhooks/assinatura/zapsign`.
4. **Segredos (Tendões):** Injetar `ZAPSIGN_API_TOKEN` e `ZAPSIGN_WEBHOOK_SECRET` no ambiente do Replit. (O CEO fará isso manualmente copiando do IHE).
5. **Harmonização:** O Cockpit (Onda E) passará a usar o serviço de assinatura para disparar o link do ZapSign via WhatsApp para o paciente (Assinatura Avançada), enquanto o médico assina com o A1 (ICP-Brasil).

---

## 3. ONDA G — REORGANIZAÇÃO DO MENU (Navegação Clínica Ideal)

O arquivo `artifacts/padcom/src/components/layout/Layout.tsx` será reescrito. A nova estrutura deve refletir o fluxo lógico de uma clínica: a Operação (Dia a Dia), a Retaguarda (Cadastros) e o Cofre (Financeiro e Configurações).

**Nova Estrutura do Menu (`navigation` array):**

1. **Dashboard** (Visão Geral)
2. **Agenda & Recepção**
   - Agenda Diária
   - Motor de Agenda
   - Clientes
3. **O Ato Médico (Cockpit)**
   - Cockpit da Consulta
   - Craniotomia
   - Mega Anamnese
   - Revisão de Anamneses
4. **Órgãos de Prescrição**
   - Prescritor de Exames
   - Fórmulas & Substâncias
   - Dieta
   - Treino
   - Orçamentos
5. **Cadastros Clínicos (O que o médico usa)**
   - Protocolos
   - Catálogos
   - Estoque
6. **Financeiro (O Cofre)**
   - Painel Financeiro
   - Pagamentos
   - Conciliação
   - Metas & Crescimento
7. **Configurações & Administração (Acesso Restrito)**
   - Empresa & Clínicas
   - Equipe (Profissionais)
   - Agendas Google
   - Certificados Digitais
   - Assinatura Eletrônica (ZapSign)
   - Portas de Pagamento

*Regra de Ouro da Onda G:* Tudo que é configuração de sistema (Certificados, Agendas Google, Equipe) sai do meio do caminho e vai para a gaveta "Configurações".

---

## 4. ONDA H — CORREÇÃO VISUAL E ATIVAÇÃO (A Vida)

1. **Correção da Logo:** Em `Craniotomia.tsx` e `Cockpit.tsx`, a logo PAXTER que estava no canto superior direito deve ser movida para o canto superior **ESQUERDO** (ou removida, já que a barra lateral já a possui). O canto direito é exclusivo de PDFs.
2. **Ativação Twilio:** O CEO colocará os secrets `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` e `TWILIO_WHATSAPP_FROM`. O código em `lib/whatsapp.ts` já está pronto para disparar.
3. **Ativação Geral:** Garantir que o `Promise.all` no botão "Emitir Tudo" do Cockpit não quebre se um dos serviços (ZapSign ou Twilio) falhar. Usar `Promise.allSettled`.

---

## 5. CARTA-MISSÃO PARA O DR. REPLIT PAXTER

**DE:** CEO Dr. Caio (via Dr. Manus)
**PARA:** Dr. Replit Paxter (O Executor)
**ASSUNTO:** EXECUÇÃO DO MASTER LOOP — ONDAS F, G e H

Você está autorizado a executar as Ondas F, G e H descritas nesta spec com AUTONOMIA TOTAL. Não me pergunte se pode clonar o ZapSign — APENAS CLONE. O sistema é meu, os tokens são meus, não há fantasmas.

**Seu Checklist de Entrega (O que você vai commitar):**
- [ ] Schema Drizzle do ZapSign criado.
- [ ] Arquivos da pasta `lib/assinatura` copiados do IHE e adaptados ao Paxter.
- [ ] `Layout.tsx` reescrito com o novo menu (Operação, Cofre, Configurações).
- [ ] Logo movida para o canto esquerdo no Cockpit e Craniotomia.
- [ ] `Promise.allSettled` implementado no Cockpit para não travar a emissão.

**RESUMO EM 1 LINHA:** Clonar o ZapSign do IHE como órgão nativo do Paxter, reorganizar o menu separando a operação das configurações, corrigir a posição da logo e preparar a ativação total do sistema. Módulo Cockpit.
