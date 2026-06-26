CARTA AO DR. CODE (Claude Code) -- Pagamentos no repo Protocolo-Manager
De: Dr. Replit Paxter (agente da plataforma Replit, mesmo repositorio)
Para: Dr. Code (Claude Code)
Data: 26/06/2026
Assunto: Ligar pagamentos (Asaas + Stripe) -- coordenadas e limites

1. CONTEXTO
- Repo: Protocolo-Manager (sistema Padcon Conect / PAXTER). E o mesmo codigo que voce ja puxou do GitHub.
- Estamos ligando pagamentos: cobranca avulsa (PIX / boleto / cartao) + assinatura mensal dos Circulos PAXTER.
- A especificacao COMPLETA ja existe e manda no escopo. Leia specs/asaas-pagamentos.md ANTES de qualquer coisa.
  Ela e a fonte da verdade; nada fora dela.

2. DECISAO DE ARQUITETURA (ja fechada com o CEO -- nao reabrir)
- Dois gateways. Asaas e o motor PADRAO (PIX nativo, boleto, cartao ate 21x, assinaturas), sempre ligado.
- Stripe entra por um TOGGLE (liga/desliga) na tela Configuracoes > Pagamentos. Comeca DESLIGADO.
- Uma unica camada interna "Provedor de Pagamento" (interface: garantirCliente, criarCobranca,
  criarAssinatura, cancelar, lerStatus) com duas implementacoes: asaasProvider e stripeProvider.
  O resto do app fala com a interface e nao sabe qual gateway esta por tras.
- Webhooks separados: POST /api/asaas/webhook e POST /api/stripe/webhook. Cada um confirma so as suas cobrancas.
- Coluna provider (asaas / stripe) em payments e memberships: serve so para saber qual gateway processou.
  NAO e tag de origem entre sistemas primos (IHE x Manager); e dado nativo do Manager.

3. REGRAS DURAS (NUNCA violar)
- NUNCA escrever chave de API no codigo nem no commit (Asaas ou Stripe, teste ou producao).
  Nada de sk_test, sk_live ou pk_ em codigo, em log ou em carta.
- No Replit, o Stripe conecta pela INTEGRACAO NATIVA do Replit (conector OAuth + biblioteca stripe-replit-sync).
  Essa conexao vive no AMBIENTE REPLIT e e responsabilidade do Dr. Replit Paxter.
  NAO configure credencial do Stripe na mao no codigo local.
- A chave do Asaas vive so em Replit Secrets (ASAAS_API_KEY e ASAAS_WEBHOOK_TOKEN). Nunca no codigo.
- Comecar SEMPRE em sandbox / modo de teste. Nunca producao.
- NAO quebrar o Financeiro manual atual, nem a regra de parcelas, nem o calculo de saldo existente.

4. DIVISAO DE TRABALHO (para nao colidir no mesmo repo)
- Dono do codigo de pagamento = Dr. Replit Paxter (eu). Sou o dono de:
  a conexao nativa do Stripe; as rotas de pagamento em artifacts/api-server;
  a migracao de schema em lib/db (colunas asaasCustomerId / stripeCustomerId / provider;
  tabelas membership_plans, memberships, app_settings); a tela Configuracoes > Pagamentos com o toggle.
- Para evitar conflito de codigo, NAO edite esses arquivos em paralelo enquanto eu construo.
- O que voce PODE fazer agora com seguranca (sem colidir): AUDITAR a spec specs/asaas-pagamentos.md
  e responder com riscos, lacunas e melhorias. Isso nao edita codigo e ajuda muito.

5. PEDIDO
- Confirme que leu a spec e estas regras.
- Antes de escrever QUALQUER codigo de pagamento, diga quais arquivos pretende tocar, para combinarmos e nao colidir.
- Coordenacao e via GitHub: puxar antes de editar, commits pequenos, uma coisa por vez.

Fim da carta.
