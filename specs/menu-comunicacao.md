# SPEC — Menu raiz "Comunicação" + braços prontos + Hierarquia/Governança à mostra

DATA: 27/06/2026
LOOP: Paxter Loop (Especificar → Construir → Revisar). Esta é a Fase 1 (Especificar).
SOLICITANTE: CEO Dr. Caio.

---

## 1. Objetivo (uma frase)

Criar no menu lateral do Paxter um menu-raiz "Comunicação" com 4 braços (Mensageria; Comunicação
Digital = WhatsApp + Telegram; E-mails; Plataformas Digitais = Google Drive + OneDrive), cada braço
abrindo um painel-console pronto (ligado ao que já existe, com aviso honesto onde ainda não existe),
e deixar também os menus "Hierarquia" e "Governança" visíveis como braços-esqueleto para
reorganização futura.

---

## 2. Verdade do estado atual (verificada na fonte em 27/06/2026)

| Item | Estado hoje |
|---|---|
| Menu-raiz "Comunicação" | NÃO existe |
| Canal Telegram (motor) | EXISTE e está ligado (envio real + modo simulação sem token; webhook de vínculo; tela de configurações de API) |
| WhatsApp | EXISTE via Twilio (usado em fluxos); sem painel-console próprio no menu |
| E-mails | EXISTE via Gmail (lembretes, PDFs); sem painel-console próprio no menu |
| Google Drive | EXISTE (pastas do cliente, upload de PDF); sem painel-console próprio no menu |
| OneDrive | NÃO existe em lugar nenhum do código |
| Mensageria | Tem tabela no banco e uso no Cockpit; sem painel-console próprio no menu |
| "Hierarquia" / "Governança" | NUNCA estiveram no menu real (só em spec parada e maquete do Canvas) |

---

## 3. Requisitos exatos (sem ambiguidade)

R1. Criar um menu-raiz "Comunicação" (grupo recolhível) na barra lateral (`Layout.tsx`),
    posicionado entre "Financeiro" e "Configurações & Administração".

R2. Sob "Comunicação", exatamente 4 itens, nesta ordem:
    1. Mensageria → rota `/comunicacao/mensageria`
    2. Comunicação Digital → rota `/comunicacao/digital`
    3. E-mails → rota `/comunicacao/emails`
    4. Plataformas Digitais → rota `/comunicacao/plataformas`

R3. Cada item abre um painel-console (tela) no padrão visual Paxter (skill `skill-layout-paxter`):
    - Mensageria: console que apresenta o motor de mensageria (catálogo de mensagens/templates e
      lembretes recorrentes), com atalhos para o que já existe. Sem reescrever o motor.
    - Comunicação Digital: UMA tela com DOIS blocos lado a lado — WhatsApp (status da conexão
      Twilio) e Telegram (status do token: configurado/não configurado; liga/desliga; webhook).
      O Telegram reaproveita `/settings/telegram` (já existe). NÃO expor valor de token.
    - E-mails: console de status do Gmail (conta conectada) + atalho para "enviar lembretes
      semanais" (rota já existente) + onde ficam os templates de e-mail.
    - Plataformas Digitais: UMA tela com DOIS blocos — Google Drive (status: conectado, pasta-raiz)
      e OneDrive (bloco "Em breve", placeholder honesto, sem fingir integração).

R4. WhatsApp e Telegram OBRIGATORIAMENTE no MESMO painel ("Comunicação Digital"), conforme decisão
    do CEO.

R5. Deixar "Hierarquia" e "Governança" VISÍVEIS no menu, como braços-esqueleto:
    - "Hierarquia" → rota `/hierarquia` (painel-esqueleto com aviso "em estruturação")
    - "Governança" → rota `/governanca` (painel-esqueleto com aviso "em estruturação", citando que o
      escopo está guardado em `specs/governanca-multiclinica-PENDENTE.md`)
    - Posição: como dois braços próprios no menu (topo da área administrativa), à mostra.
    - Conteúdo definitivo fica para uma onda futura ("depois saberemos como reorganizá-los").

R6. Registrar as novas rotas em `App.tsx` (com o mesmo padrão de `Layout` + `CollaboratorGate`
    usado pelas telas administrativas existentes).

R7. Nada de dado falso (mock visual disfarçado de real). Status mostrado deve refletir o estado
    verdadeiro (ex.: Telegram "configurado" só quando o token existe de fato no cofre/Secrets).

---

## 4. Casos extremos a tratar

- Telegram sem token: o painel mostra "Não configurado" (não quebra, não inventa sucesso).
- WhatsApp/Gmail/Drive sem conexão ativa: cada bloco mostra "Não conectado" com instrução curta.
- OneDrive: sempre "Em breve" — nunca botão que finja conectar.
- Menu recolhido (mini): os novos grupos/itens funcionam no modo ícone, como os demais.
- Rotas novas sem permissão: respeitam o mesmo portão (`CollaboratorGate`) das telas administrativas.

---

## 5. Definição de PRONTO (qualquer um confere)

P1. Barra lateral mostra "Comunicação" com os 4 itens na ordem exata de R2.
P2. Os 4 painéis abrem sem erro e seguem o padrão visual Paxter (screenshot de cada um).
P3. Comunicação Digital mostra WhatsApp e Telegram juntos; status do Telegram reflete o token real.
P4. Plataformas Digitais mostra Google Drive (status real) e OneDrive ("Em breve").
P5. "Hierarquia" e "Governança" aparecem no menu e abrem painel-esqueleto sem erro.
P6. Typecheck dos arquivos alterados sem erro novo (typecheck global é pré-quebrado por codegen; vale
    o dos arquivos tocados + runtime + screenshots).
P7. Revisão do architect aprovada sem pendência (Fase 3 do loop).

---

## 6. Linhas vermelhas

- NUNCA expor, logar ou escrever em arquivo o valor de qualquer token (Telegram/ZapSign/Twilio).
- NÃO reescrever motores existentes (mensageria, Telegram, Drive, Gmail) — apenas apresentá-los.
- NÃO construir a integração real do OneDrive agora (fica placeholder honesto).
- NÃO construir o RBAC/multi-clínica de verdade agora (Hierarquia/Governança são esqueleto).
- Seguir o sistema de design Paxter (skill `skill-layout-paxter`) — relevo 3D, tokens da marca.

---

## 7. Fora de escopo (deixar claro)

- Integração funcional do OneDrive.
- Construção do RBAC / Centro de Comando / multi-clínica.
- Mover telas clínicas existentes (ex.: Cartório) para dentro de "Comunicação".
- Testar o disparo real do Telegram (CEO escolheu testar depois — opção C anterior).

---

RESUMO EM 1 LINHA: esta spec cria o menu-raiz "Comunicação" com 4 braços-console (Mensageria;
WhatsApp+Telegram; E-mails; Drive+OneDrive) ligados ao que já existe e honestos onde não existe, e
deixa "Hierarquia" e "Governança" à mostra como esqueleto para reorganizar depois — sem tocar motores,
sem expor token, seguindo o design Paxter.

---

## 8. ATUALIZAÇÃO 27/06/2026 — "TUDO À MOSTRA" + decisões de construção

Durante a Fase 2 (Construir), o CEO acrescentou duas ordens que SUBSTITUEM partes da spec acima:

| Tema | Decisão antiga (spec) | Decisão nova (vale) |
|---|---|---|
| Comportamento do menu | Grupo recolhível (R1) | SEÇÕES sempre visíveis: rótulo + todos os itens à mostra, SEM toggle de abrir/fechar |
| Escopo da mudança | Só "Comunicação" | TODO o menu vira seções sempre visíveis (órgãos empilhados, funções semelhantes adjacentes) |
| Hierarquia/Governança | Dois braços soltos | Reunidos numa seção "Estrutura & Governança" (funções semelhantes, adjacentes) |
| Portão de acesso (R6) | `CollaboratorGate` | As 6 telas novas NÃO são guardadas — o CEO precisa enxergar os braços; o endpoint de status é leitura sem dado sensível |

Fonte de status real construída: `GET /api/comunicacao/status` → `{telegram, whatsapp, gmail, drive, onedrive}` (só booleanos; nunca expõe token). No modo recolhido, cada seção vira separador fino + ícones.

As pendências (OneDrive real, teste real do Telegram, credenciais Twilio, etc.) foram movidas para o
multi-spec `specs/roadmap-pendencias-comunicacao.md`.
