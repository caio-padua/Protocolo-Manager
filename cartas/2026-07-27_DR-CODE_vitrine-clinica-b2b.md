# CARTA AO DR. CODE — VITRINE B2B PARA CLINICAS LICENCIADAS

Data: 27/07/2026
De: Dr. Replit Paxter (agente do repositorio Padcon Conect)
Para: Dr. Code (Claude Code)
Assunto: Segunda tela de apresentacao — vitrine para o medico dono de clinica

## 1. CONTEXTO

O sistema agora tem DUAS vitrines publicas de apresentacao, no artefato
`artifacts/vitrine-demo` (aplicativo React + Vite, rota base `/vitrine-demo/`):

| Tela | Rota | Publico | Objetivo |
|------|------|---------|----------|
| Vitrine do Paciente | `/vitrine-demo/` | Futuro cliente da clinica | Gerar desejo: mostrar o app na palma da mao |
| Vitrine da Clinica | `/vitrine-demo/clinica` | Medico dono de clinica (prospect B2B) | Vender a licenca: mostrar que o sistema vale a pena |

Decisao do CEO (27/07/2026): o modulo de apresentacao ao paciente (gerador de
desejo) tambem e PRODUTO — pode ser revendido para clinicas licenciadas. A
vitrine B2B usa isso como argumento central: "este aplicativo vira o aplicativo
da SUA clinica, com a sua marca".

## 2. O QUE FOI CONSTRUIDO

Arquivo novo: `artifacts/vitrine-demo/src/pages/VitrineClinica.tsx`
Rota registrada em `artifacts/vitrine-demo/src/App.tsx` (wouter): `/clinica`.

Estrutura da tela (de cima para baixo):

1. Fita dourada "APRESENTACAO PARA CLINICAS — DEMONSTRACAO".
2. Faixa com simbolo + wordmark PAXTER (arte oficial, nunca texto digitado).
3. Hero: "A sua clinica com o proprio aplicativo".
4. Bloco DORES ("A rotina que voce conhece"): 4 dores do dono de clinica.
5. Bloco MOTORES ("O que o sistema entrega"): 6 cartoes 3D
   (protocolos, agenda, exames por IA, documentos/receituario,
   orcamentos/financeiro, mensageria).
6. Bloco MODULO DE DESEJO: reusa o componente `AppPreview` (moldura de celular
   com 4 abas clicaveis) importado de `VitrineDemo.tsx` — prova ao vivo do que
   o paciente dele vai receber.
7. Bloco CIRCULOS (Bronze/Ouro/Platina/Noir) como argumento de recorrencia.
8. Bloco COMO FUNCIONA: 3 passos (conversa -> implantacao -> clinica no ar).
9. CTA fixo no rodape: "QUERO PARA A MINHA CLINICA" (abre folha de contato
   demonstrativa) + link "Ver o aplicativo do paciente" para `/vitrine-demo/`.

## 3. DECISOES TECNICAS (para voce nao refazer)

| Decisao | Motivo |
|---------|--------|
| `VITRINE_STYLE` e `AppPreview` agora sao EXPORTADOS de `VitrineDemo.tsx` | Reuso sem fork; um unico motor de preview do app |
| Sem precos na tela B2B | Regra do CEO: valores sao placeholders/tratados no contato comercial |
| Folha de contato e demonstrativa e diz isso em texto | Proibido fantasia: canal comercial real (WhatsApp) sera ligado na publicacao |
| Links entre telas usam `/vitrine-demo/...` absoluto com prefixo do artefato | Proxy por caminho do monorepo; link raiz quebraria |
| Marca segue PAXTER (nao PADAXOR) | Rebrand global ainda pendente de ordem explicita do CEO |

## 4. PENDENCIAS ABERTAS

1. Ligar o canal comercial real (WhatsApp) no botao "QUERO PARA A MINHA CLINICA"
   quando o CEO definir o numero.
2. Decidir se a vitrine do paciente ganha um link discreto "Para clinicas"
   (hoje as duas telas so se cruzam a partir da tela B2B, de proposito,
   para nao poluir a tela do paciente).

RESUMO EM 1 LINHA: nasceu a vitrine B2B em /vitrine-demo/clinica, que vende a
licenca ao dono de clinica usando o proprio app do paciente como prova viva.
