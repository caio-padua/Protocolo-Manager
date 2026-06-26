# Spec — Vitrine Pública + Instalação do Aplicativo (PWA)

Data: 26/06/2026. Autor: Dr. Replit Paxter. Decisão do CEO: opção A (graduar a vitrine
aprovada no Canvas para uma rota pública real e ligar a instalação de verdade).

## Objetivo (uma frase)

Publicar a vitrine/demonstração aprovada como uma rota pública real `/vitrine` no app
padcom (sem barra lateral, sem login, sem dado pessoal real) e ligar a instalação do
aplicativo (PWA = Progressive Web App, aplicativo da web instalável no celular) de
forma honesta: um toque no Android quando o navegador permitir, passo a passo no iPhone.

## Requisitos exatos

1. Rota pública `/vitrine` registrada FORA do `<Layout>` (igual a `/area`, `/portal`,
   `/agendar`), usando o roteador `wouter`. Sem barra lateral, sem `CollaboratorGate`.
2. A página é a graduação fiel do mockup aprovado `vitrine-demo/VitrineDemo`:
   fundo de tecido de terno NAVY em tudo; demonstração CLICÁVEL do app dentro de uma
   moldura de celular (abas Protocolo / Agenda / Exames / Documentos com troca de
   conteúdo); pilares ("O que você recebe"); Círculos PAXTER (Bronze/Ouro/Platina/Noir,
   SEM preço); fita "Demonstração — exemplo"; CTA fixo no rodapé.
3. Marca: usar a FONTE ÚNICA do app `PaxterLockup` (símbolo + nome + frase), nunca os
   componentes do sandbox. Banda principal sobre o navy = `tone="dark"`; mini-cabeçalho
   dentro da tela do celular (fundo claro) = `tone="light"`.
4. SÓ LEITURA: todos os dados são de EXEMPLO (protocolo, sessões, exames, documentos).
   Nenhuma chamada a `/api`, nenhum dado pessoal real, nenhum login na vitrine.
5. Instalação do aplicativo (PWA), honesta:
   5.1 Android (Chrome/Edge): capturar o evento do navegador `beforeinstallprompt`. Se
       disponível, o botão "Instalar" chama o prompt REAL do sistema. Se ainda não
       disponível, mostrar texto honesto explicando que o navegador instala quando ele
       oferecer (sem prometer toque que não funciona).
   5.2 iPhone (Safari): a Apple não permite instalação por script; mostrar o passo a
       passo manual (Compartilhar → "Adicionar à Tela de Início").
   5.3 Já instalado (modo standalone): detectar e mostrar "Aplicativo já instalado".
6. CTAs do rodapé fixo, com navegação REAL (wouter):
   6.1 "Instalar o aplicativo" → abre a folha de instalação (item 5).
   6.2 "Quero ser cliente" → vai para `/agendar` (porta de agendamento/conversão).
   6.3 "Já sou cliente — entrar" → vai para `/area` (porta autenticada do cliente).
7. REGRA DE OURO (toda ferramenta tem entrada no menu): adicionar uma entrada de menu
   na barra lateral do administrador ("Vitrine (Pública)") apontando para `/vitrine`,
   para a equipe achar e compartilhar o link.
8. PWA tecnicamente válido para a instalação funcionar quando publicado: manifest e
   service worker já existem; NÃO quebrar `start_url`/fallback (memória pwa-starturl-sw).
   A vitrine NÃO precisa virar `start_url`; ela só dispara a instalação do mesmo app.

## Casos extremos a tratar

1. Navegador sem `beforeinstallprompt` (iOS, Firefox, desktop sem suporte): nunca
   prometer instalação por toque; cair no passo a passo (iOS) ou texto honesto.
2. App já instalado (display-mode: standalone) ou `navigator.standalone`: mostrar estado
   "já instalado", não oferecer instalar de novo.
3. Reduzir movimento (prefers-reduced-motion): desligar o brilho do CTA (já no CSS).
4. Largura: página mobile-first travada em `max-w-[430px]` centralizada (igual mockup).
5. Sem mistura de sessão: a vitrine é pública e isolada; nunca lê token/PII nem o estado
   da área autenticada.

## Definição de PRONTO (qualquer um confere)

1. Abrir `/vitrine` no preview: renderiza igual ao mockup aprovado (navy, celular
   clicável, pilares, círculos, CTA), validado por screenshot.
2. Tocar nas abas do celular troca o conteúdo (Protocolo/Agenda/Exames/Documentos).
3. "Quero ser cliente" leva a `/agendar`; "Já sou cliente — entrar" leva a `/area`.
4. Botão "Instalar o aplicativo" abre a folha; Android com suporte instala de verdade;
   iPhone mostra o passo a passo; já instalado mostra o estado certo.
5. Entrada "Vitrine (Pública)" aparece no menu lateral e abre `/vitrine`.
6. `pnpm --filter @workspace/padcom run typecheck` passa.
7. Revisão do architect: PASS, zero pendência (inclui honestidade da instalação).

## Linhas vermelhas

1. NÃO alterar `start_url` do manifest nem o `OFFLINE_FALLBACK`/versão do `sw.js` sem
   necessidade (memória pwa-starturl-sw-fallback).
2. NÃO inventar autenticação nem expor dado real na vitrine (página pública).
3. NÃO usar componentes de marca do sandbox; só `PaxterLockup` (fonte única).
4. NÃO prometer instalação por toque onde ela não funciona (honestidade — Art. 47).
5. NÃO mexer no motor de orçamento, agenda ou em rotas administrativas.
