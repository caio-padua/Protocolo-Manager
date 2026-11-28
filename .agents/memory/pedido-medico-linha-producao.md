---
name: Pedido médico — linha de produção e benefício Member
description: Fila do médico com prévia, assinar-e-enviar num clique e isenção por benefício; armadilhas.
---
Pedido de exames pago/isento chega pré-pronto: prévia pelo motor (sem certificado, faixa vermelha), médico edita itens (um por linha), "Assinar e enviar" assina com o certificado dele e envia o link pelo Telegram (categoria documento). Receita continua no Cockpit.
Benefício Member (client_member_beneficios + _hist) dispensa só a cobrança: pedido nasce valor 0, status "pago" com paid_at vazio e isento_beneficio_id; médico decide e assina.
**Why:** o CEO quer o mínimo de trabalho do médico, sem o sistema assinar sozinho nem marcar "emitido" sem documento.
**How to apply:** /emitido é recusado para pedido_exames (só receita); "emitido" sem doc_pdf_id aparece como atenção e tem Reabrir. Itens vêm do texto do cliente, nunca inferir exames. Em editar arquivo com python, achar âncoras DENTRO do componente certo (index() pegou função errada e apagou trecho).

## Liberação automática (opção B, decidida pelo Dr. Caio em 20/11/2026)
- Validação desligada: pedido de exames pago, com médico destino, é assinado com o certificado desse médico após 5 minutos (ciclo de 60 s no api-server) e vai para a esteira Pax Member/Não Member como concluído, para conferência. Uma IA só aponta ressalvas, nunca bloqueia nem assina. Sempre há humano conferindo.
**Why:** o médico assume a responsabilidade; a pessoa contratada só pontua erros, não clica.
**How to apply:** o cliente vê sempre as mesmas 5 etapas ("Solicitação recebida" a "encaminhada"), sem saber se houve avaliação manual. Receita não é automática. Padrão visual: Padrão 47 da skill-layout-paxter.
