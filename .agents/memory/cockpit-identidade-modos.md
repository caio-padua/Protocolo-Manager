---
name: Identidade e modos do Cockpit
description: Decisões para seleção única, visualizações e apresentação de nomes extensos.
---

# Identidade e modos do Cockpit

As visualizações por abas, telas e ficha contínua devem compartilhar o mesmo
cliente selecionado. Quando viável, a ficha também deve se adaptar ao celular.

Nomes devem ficar em uma linha. Quando faltarem espaços, abreviar os nomes do
penúltimo para a esquerda; se ainda não couber, mostrar reticências. O nome
completo permanece no cadastro e deve poder ser consultado por clique, toque e
teclado, além de ser acessível a leitores de tela.

**Why:** O responsável quer alinhamento consistente sem repetir a seleção do
cliente; ocultar a identidade completa poderia causar confusão entre pessoas.

**How to apply:** Ao evoluir a prévia ou integrá-la ao aplicativo, preservar
permissões e fonte de identidade, limpar o contexto ao trocar de cliente e
verificar os três modos e o acesso ao nome completo. A prévia isolada não
comprova que as ferramentas clínicas reais estejam conectadas ou homologadas.

## Leituras relacionadas

- [Arquitetura do Cockpit](cockpit-v2-arquitetura.md): seleção pela rota e painéis carregados conforme necessário.
- [Painéis autossuficientes](cockpit-painel-consolidacao.md): reutilizar os motores reais e limpar o estado ao trocar o cliente.
- [Telas originais embutidas](cockpit-tela-unica-embedded.md): preservar a tela original e evitar navegação indevida quando embutida.
- [Atalho de agendamento](cockpit-atalho-agendamento.md): preservar o cliente selecionado e reutilizar a marcação existente.
