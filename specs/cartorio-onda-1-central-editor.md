# Spec — Cartório Onda 1: Central de Documentos + Editor + Envio

Data: 26/06/2026. Método: Paxter Loop. Pai: `specs/cartorio-master.md`.

## Objetivo (uma frase)
Criar a tela central do Cartório no menu, com editor de texto para redigir/escolher um documento,
selecionar um paciente e enviá-lo para assinatura ZapSign, mais a linha do tempo de todas as solicitações.

## Requisitos exatos
1. Nova rota frontend `/cartorio` registrada em `App.tsx` (wouter) e item no menu "O Ato Médico" do
   `Layout.tsx` (rótulo: "Cartório"; só liga se a rota existir).
2. Página com 2 zonas no padrão 3D Paxter (navy + ouro, skill `skill-layout-paxter`):
   - Zona ESQUERDA "Linha do tempo": lista de `assinatura_solicitacoes` (consome `GET /api/assinaturas/timeline`)
     com paciente, título, tipo, status (badge ao lado do ID, nunca do nome — Grade Imaginária) e data.
   - Zona DIREITA "Novo documento": (a) seletor de paciente (busca por nome/CPF), (b) seletor de
     template OU editor rich-text para corpo livre, (c) campo título + tipo de doc, (d) botão
     "Enviar para assinatura".
3. Integrar editor rich-text **Tiptap** (instalar no `artifacts/padcom`). Saída em HTML, entregue ao
   backend como `conteudoHtml`. Suporta negrito, itálico, títulos, listas e parágrafos (básico).
4. Botão "Enviar para assinatura" chama `POST /api/assinaturas/enviar` com `pacienteId`, `conteudoHtml`
   ou `templateCodigo`, `tipoDoc`, `titulo`. Em sucesso: toast, limpa o formulário e recarrega a timeline.
5. Permitir salvar o corpo redigido como TEMPLATE reutilizável em `assinatura_templates` (novo endpoint
   `POST /api/assinaturas/templates` + `GET /api/assinaturas/templates`), com `codigo`, `titulo`,
   `tipoDoc`, `corpoHtml`. Os templates aparecem no seletor do item 2c.
6. Estado vazio elegante (nenhuma solicitação ainda) e estado MOCK visível quando sem token ZapSign
   (faixa "MODO TESTE" para o CEO saber que não é assinatura real).
7. Backend: validar que o paciente existe e tem ao menos e-mail OU telefone antes de criar a solicitação
   (regra anti-órfã da spec-mãe); senão 400 com mensagem clara.

## Casos extremos
1. Paciente sem e-mail e sem telefone → bloquear envio (400), não criar solicitação.
2. Corpo vazio e nenhum template escolhido → bloquear (validação no front e no back).
3. Sem token ZapSign → segue em MODO MOCK (não quebra), com aviso visual.
4. Código de template repetido → upsert por `codigo` (não duplicar), ou 409 com aviso.
5. Lista grande de solicitações → paginar ou limitar a N mais recentes na timeline.

## Linhas vermelhas
Herda todas da spec-mãe. Especial: NÃO alterar o contrato do `POST /api/assinaturas/enviar` da Onda F;
apenas consumi-lo. Endpoints novos (templates) seguem o padrão OpenAPI/codegen do repo.

## Definição de PRONTO
| Critério | Como conferir |
|---|---|
| Menu mostra "Cartório" e a rota abre | screenshot |
| Editor digita e formata texto | screenshot do editor com texto |
| Enviar cria solicitação | curl/UI → grava em `assinatura_solicitacoes` (SELECT prova) |
| Timeline lista as solicitações | screenshot com a nova linha |
| Salvar template persiste e reaparece no seletor | SELECT em `assinatura_templates` + screenshot |
| Anti-órfã funciona | curl com paciente sem contato → 400 |
| architect PASS, zero pendência | revisão requisito por requisito |

RESUMO EM 1 LINHA: tela central do Cartório com editor Tiptap para redigir/escolher documento, escolher
paciente e enviar ao ZapSign, com timeline e templates reutilizáveis, reusando o motor da Onda F.
