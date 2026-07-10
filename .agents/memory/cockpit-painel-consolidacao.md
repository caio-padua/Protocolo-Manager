---
name: Consolidar ferramentas num cockpit por painéis autossuficientes
description: Padrão para juntar telas existentes numa página-cockpit sem quebrar os motores nem duplicar lógica.
---

Ao consolidar várias telas numa página única (ex.: Cockpit da Consulta), NÃO reescreva a página nem os motores. Adicione os blocos como PAINÉIS autossuficientes dentro de um Accordion da página que já existe.

Contrato de painel que funciona:
- `export default function X({ clientId }: { clientId: number })` — recebe só o id do contexto (o cliente escolhido uma vez no topo).
- Faz o PRÓPRIO fetch e reusa os MESMOS endpoints/hooks da tela original (nunca copia a lógica de negócio; se precisar de funções puras, importa do `data.ts` da tela original).
- Estados honestos carregando/vazio/erro, com "Tentar novamente" nos pontos de rede.
- Renderiza SÓ o conteúdo interno (sem shell/picker/wrapper), para cair dentro de um `AccordionContent`.
- `useEffect([clientId])` que LIMPA estado local (carrinho, prévia, resultado) ao trocar de cliente — senão vaza estado entre clientes.

**Why:** o CEO quer "mais abrangente, já tudo interligado" sem perder recursos existentes; reescrever a página perde features e arrisca regressão. Painéis burros amarrados ao motor real mantêm uma fonte de verdade só.

**How to apply:** paralelize a construção dando a CADA subagente um ARQUIVO NOVO DISTINTO (os subagentes locais compartilham o MESMO filesystem — editar o mesmo arquivo em paralelo colide). O agente principal fica dono do arquivo-shell da página (imports + Accordion) e dos arquivos de rota/menu; só integra depois de coletar os painéis.
