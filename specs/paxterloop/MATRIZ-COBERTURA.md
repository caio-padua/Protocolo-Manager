# Matriz de cobertura PAXTERLOOP (16/11/2026)
Colunas: demanda | SPEC | menu esquerdo | rota | tela admin | tela do cliente | backend | persistência | teste | evidência | status.
Estado real em 16/11/2026. "não" = inexistente. Nada está HOMOLOGADO.

| Demanda | SPEC | Menu | Rota | Tela admin | Tela cliente | Backend | Persistência | Teste | Evidência | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| DEEx botão na EVOLUÇÃO (equipe) | 7 f5 parcial | existente | cockpit EVOLUÇÃO | sim (deex-painel) | não | sim | n/a | só typecheck | nenhuma | PENDENTE (sem teste de navegador; botão do paciente não implementado) |
| Envios recentes (marcos) | 3 adendo | Área > ENVIAR | /area | n/a | sim | sim | exam_document_marcos | 11+6+11 | evidencias/envios | TESTADO (API simulada no navegador) |
| TEX gerador do PDF | 7 f1 | não | não | não | não | sim | n/a | 11 MOCK | PDFs sintéticos | PENDENTE (sem tela) |
| TEX emissão interna | 7 f2 | não | /tex/cliente/:id/pdf (API) | não | não | sim | n/a | 6 MOCK | tex-rota-interna | PENDENTE (sem tela) |
| TEX botão Cockpit e Área do Cliente, cobrança sandbox, config de preço | 7 f2b-f5 | não | não | não | não | não | não | não | nenhuma | NÃO IMPLEMENTADO |
| Identidade B2C e separação B2B/B2C | 8 | não | não | não | não | não | não | não | nenhuma | NÃO IMPLEMENTADO |
| Toggle "É Membro PAXMED?" no cadastro | 8 | n/a | não | não | não | não | não | não | nenhuma | NÃO IMPLEMENTADO |
| Minhas Prescrições / Prescrições externas | 9 | não | não | não | não | não | não | não | nenhuma | NÃO IMPLEMENTADO |
| Meus Medicamentos, Posologia, Alarmes | 10, 11 | não | não | não | não | não | não | não | nenhuma | NÃO IMPLEMENTADO |
| Minha Assinatura e planos Member | 12, 17 | não | não | não | não | não | não | não | nenhuma | NÃO IMPLEMENTADO |
| Empresas Parceiras | 14 | não | não | não | n/a | não | não | não | nenhuma | NÃO IMPLEMENTADO |
| Campanhas & Conteúdo, Parceiros & Conteúdos | 15 | não | não | não | não | não | não | não | nenhuma | NÃO IMPLEMENTADO |
| Conformidade do catálogo | 16 | não | não | não | n/a | não | não | não | nenhuma | NÃO IMPLEMENTADO |
| Monetização & Preços (matriz de preços editável) | 17 | não | não | não | n/a | não | não | não | nenhuma | NÃO IMPLEMENTADO |
| Convites de Médicos | 18 | não | não | não | não | não | não | não | nenhuma | NÃO IMPLEMENTADO |
| Participações & Repasses (simulador) | 19 | não | não | não | n/a | não | não | não | nenhuma | NÃO IMPLEMENTADO |
| PAXTERLOOP · Auditoria de módulos | 20 | não | não | não | n/a | não | não | não | nenhuma | NÃO IMPLEMENTADO |
| Exames: evolução, conferência, envio pela Área do Cliente | 2, 3 | existente (não reauditado neste ciclo) | existente | existente | existente | sim | sim | BANCO+MOCK | specs 2 e 3 | EXISTENTE (menu não reauditado) |
| Anexos no Telegram | 4 | n/a | existente | n/a | n/a | sim | sim | MOCK 381 | spec 4 | EXISTENTE (sem tela própria) |
| Cadastro de profissionais por forma de atendimento | 5 | a auditar | a auditar | a auditar | n/a | a auditar | a auditar | não | nenhuma | PENDENTE |
| Gerenciador comercial Prata/Ouro/Platinum/Diamond | 6 | a auditar | a auditar | a auditar | n/a | a auditar | a auditar | não | nenhuma | PENDENTE |
| App Member (landing, cadastro, login, painel, assinatura) | 8 | não | não | não | não | não | não | não | nenhuma | NÃO IMPLEMENTADO |
| Indique o PAXMED / Convites e Indicações | 21 | não | não | não | não | não | não | não | nenhuma | NÃO IMPLEMENTADO |
