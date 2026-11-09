---
name: Linha do Tempo Viva — decisões e pedidos do CEO (09/11/2026)
description: Aprovação de K1 a K6, vocabulário aguda/crônica e pedidos de substâncias constantes, chave de 6 dígitos como rubrica e RAS FAP vivo.
---

O CEO aprovou K1 a K6 (uma por vez, revisão independente depois de cada). Spec: specs/agenda-google-linha-do-tempo-viva.md (seção 11 tem os pedidos novos).
Vocabulário do CEO: mudança AGUDA = imediata, disparada pela ação; mudança CRÔNICA = pelo relógio e só CONFIRMA se a aguda foi feita (corrige se não foi).
Pedidos do CEO (palavras dele resumidas): toda visita lista TODAS as substâncias do protocolo (as que a frequência não permite naquela semana ficam constantes, para a enfermeira responder ao cliente); a cada aplicação o cliente recebe senha de 6 dígitos por e-mail, WhatsApp, Telegram e SMS e a passa à enfermeira, valendo como assinatura; o RAS FAP da semana se atualiza (data bind) mostrando a rubrica; confirmação imediata de sucesso ao cliente nos mesmos canais; clonar o melhor do IHE.

**Why:** o CEO quer que a enfermagem responda "quais as substâncias do meu protocolo" olhando a agenda e que a presença do cliente fique provada digitalmente.

**How to apply:** código atual (validation_codes) é por SESSÃO, 6 letras/números em claro, não é exigido ao registrar aplicação; substâncias já concluídas somem das visitas seguintes; colunas de rubrica do RAS FAP saem vazias. Isso é o ponto de partida, não a meta. Entrega por WhatsApp fora da janela de 24 h exige modelo aprovado; SMS não existe no Manager.

Decisão do CEO (09/11/2026): ordem A, "quero tudo", e UMA chave por VISITA (uma linha do RAS FAP = uma semana), não por substância. Ordem: substâncias constantes (feita), chave+rubrica, RAS FAP vivo, mensagem imediata, depois K2, K3, K5, K6, K4. Detalhe técnico das constantes em protocolo-completo-constante.md.

Regras do CEO para a chave por visita (09/11/2026): a enfermeira realiza e registra SEMPRE (a falta da chave nunca bloqueia); coluna da enfermeira no RAS FAP completa na hora; botão para "cliente confirma depois" aciona e-mail com confirmação de UM clique ao cliente, e-mail ao gestor administrador e ao responsável técnico (podem ser a mesma pessoa) e 3 e-mails diários até validar; desafio presencial em 2 metades sorteadas com legenda "respirando" (dados do cadastro, autonomia dada a mim); palavra-chave semanal secreta. Spec na seção 13 de specs/agenda-google-linha-do-tempo-viva.md.

**Why:** o CEO quer prova digital da presença do cliente sem travar o trabalho clínico.

**How to apply:** a enfermeira vê CPF, endereço e nascimento, então dado de cadastro NÃO prova que respondeu o cliente; só segredo que ela nunca vê prova. Rotas antigas /validation-codes/* não exigem login de profissional, usam Math.random e devolvem o código em texto puro: nunca contam como rubrica; fechar é decisão do CEO. Gestor e responsável técnico = marcas is_clinic_admin e is_responsible_doctor em clinical_access_grants. Link de e-mail de confirmação: abrir não confirma (antivírus/pré-visualização); só o botão da página.

Decisão do CEO (09/11/2026): no desafio presencial as duas metades saem SÓ de dados do cadastro (opção B), mesmo avisado de que a enfermeira enxerga esses dados e a prova é fraca; manter a marcação "por dados do cadastro" e o e-mail de um clique como exigência para completar a parte do cliente. Não reabrir sem pedido dele.
Decisão do CEO (09/11/2026): a palavra-chave semanal secreta foi DESCARTADA (nem na K8 nem como unidade futura); a prova do cliente = chave de 6 dígitos, clique no e-mail e desafio por dados do cadastro.
Decisão do CEO (09/11/2026): cliente recebe 3 e-mails (no ato, +24 h, +48 h); gestor administrador e responsável técnico recebem 2 (no ato e aviso final 24 h após o 3º do cliente, se não confirmou); estado vira "não confirmada" e nunca é apagado; clique tardio ainda vale, marcado "com atraso".
