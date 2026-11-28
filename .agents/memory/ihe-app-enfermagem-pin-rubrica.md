---
name: IHE já desenhou app da enfermagem, PIN e rubrica (12/06/2026)
description: Prior art do CEO no repositório IHE sobre validação do cliente pela enfermagem, formatos de rubrica já decididos e como ler o IHE daqui
---

O desenho de validação do cliente pela enfermagem (PIN derivado de dado do cadastro, rubrica no RAS FAP, RAS FAP por e-mail a cada aplicação, evento do Google com TODAS as substâncias) já foi decidido pelo CEO em 12/06/2026 e vive só no repositório IHE (ramo ver-l2-dr-claude): `docs/dr-replit/PROPOSTAS/2026-06-12_arquitetura-app-enfermagem-ras-fap-pastas-clientes.md` e `docs/dr-replit/ras-kaizen-v8/AppEnfermagemRasFap.gs`. Nada disso está documentado neste repositório.

Formatos já decididos pelo CEO (usar na K9, sem perguntar de novo): rubrica do cliente "Sobrenome, I.N.I." (iniciais de todos os nomes do meio; sobrenome longo encurta só o sobrenome, folga de 2 caracteres); enfermeira por extenso, truncada com folga de 2; marca de aplicada = sem mudar a cor da barra, terço direito sem pintura com o caractere de check; não mudar a estrutura de colunas do RAS. PIN = confirmação de presença, não assinatura com valor jurídico (para isso existe o ZapSign).

**Why:** a K8 foi construída sem ler esse material; o CEO reclamou (09/11/2026) que "já tinha montado" e que não achei nos arquivos. A K8 não está errada, mas a K9 não pode reinventar formato já decidido.

**How to apply:**
- Antes de qualquer unidade sobre rubrica, PIN, RAS FAP vivo, evento do Google ou mensagem ao cliente, ler primeiro o IHE (e o cofre padua-segundo-cerebro), não só este repositório.
- Ler o IHE daqui: o `GITHUB_PAT` lê os repositórios do CEO em modo leitura. A busca de código da API do GitHub devolve 0 ou 403 (limite); usar a API de árvore (`git/trees/<ramo>?recursive=1`) para listar caminhos e baixar o arquivo por URL raw. O IHE tem ~600 MB (não baixar o tarball); os demais repositórios são pequenos e o tarball serve.
- Toda mensagem ao cliente deve passar pelo motor Hermes (`lib/messaging`, Art. 66); a K8 montou o e-mail à mão e ainda precisa ser migrada.

## K8 migrada ao motor Hermes
Mensagens da K8 são PaxterDoc (conteúdo puro) e saem só por enviarMensagemPaxter; o ajudante único de endereço público (messaging/base-url.ts) precisa conhecer RAILWAY_PUBLIC_DOMAIN ou o link some em produção.
**Why:** a K8 nasceu com e-mail montado à mão e endereço próprio (violava o Art. 66); o revisor independente achou a perda do domínio Railway ao unificar.
**How to apply:** ao trocar um ajudante local pelo único, comparar a ordem de variáveis de ambiente das duas versões; link para o cliente recusa localhost, rede privada e IPv6 literal.

## K9 ligada ao RAS FAP (09/11/2026)
Data/hora efetivas, enfermeira, rubrica do cliente e check por substância saem de `substance_applications` + `visit_confirmations`, ligados à linha da grade pela chave `sessions.week_number` (= `numero` da linha). Só protocolo `exact`; o semanal antigo não tem registros (a linha dele não é uma visita).
**Why:** o CEO exige que nada seja "arquitetado e não conectado ao motor" (ectoplasma / walking dead): toda entrega precisa de chamador real e prova. Antes da K9, a saída da K8 só era lida pela própria K8.
**How to apply:** carregador recusa (erro explícito) visita de outra empresa, de outro cliente, numeração duplicada/nula/menor que 1 (0 é linha de preenchimento da folha); confirmação sem aplicação registrada não aparece. A rota `/emit` de protocols.ts engole erro do RAS e avisa no Slack (desenho antigo, mantido). Notas antigas citavam `protocol-visit-planner` e `protocol-visit-changes` como arquivos: não existem (só um teste com o segundo nome); a rota de planejamento existe e está ligada (`routes/protocol-scheduling.ts`).
