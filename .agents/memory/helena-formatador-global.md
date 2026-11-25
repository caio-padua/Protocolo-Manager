---
name: Formatador da Helena e cérebro global
description: onde o formato visual é aplicado e como a base global anonimizada funciona
---
Formatador (blocos ≤3 linhas, bolinhas, assinatura) é aplicado na ENVIADA (evolution enviarUma, telegram enviarAoPaciente/enviar), nunca em plano.resposta.
**Why:** a revalidação compara plano.resposta com o texto da orientação aprovada.
**How to apply:** testes que leem o texto enviado precisam esperar a assinatura no fim; testes com banco mockado devem mockar formatarSaidaHelenaDoBanco.
Base global: tabela global_knowledge_base (sem empresa_id, origem só em hash com sal), filtro bloqueia a pergunta inteira diante de termo clínico; consentimento em base_global_licencas (clínica 5 ligada em 25/11/2026 por autorização do Dr. Caio).
