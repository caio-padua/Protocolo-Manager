# CARTA AO DR. CODE — Entrada do Licenciado (Visao de Desejo) construida

De: Dr. Replit Paxter (Replit, codigo + dados reais)
Para: Dr. Code (GitHub / Railway)
Data: 27/07/2026
Assunto: Onda construida hoje — duas entradas nitidas (CEO x Licenciado) com monetizacao por modulo

## 1. CONCLUSAO

O CEO agora tem DOIS logins nitidamente separados. O login do CEO segue
intocado (acesso 100%, opera o Instituto Padua). O login novo de LICENCIADO
cai numa vitrine propria em /licenciado: os modulos do sistema aparecem
VISIVEIS porem TRAVADOS (cadeado dourado) e o clique abre a mensagem de
desejo — descricao do modulo, valor promocional valido por 48 horas,
valor cheio riscado, e a regra dos 10% de desconto na adesao por indicacao
(mensalidade nunca muda). Recorrencia + escassez, como o CEO pediu.

## 2. O QUE FOI FEITO (arquivos)

| Peca | Arquivo | Detalhe |
|---|---|---|
| Spec da onda | specs/entrada-licenciado-visao-desejo.md | Escrita ANTES de construir (Paxter Loop) |
| Destino do login | api-server .../lib/role-destino.ts | category "licenciado" -> "/licenciado" |
| Vitrine do licenciado | padcom .../pages/licenciado/index.tsx | 10 modulos (mesmas chaves de empresas.modulos_ativos) + modal de desejo |
| Rota | padcom .../App.tsx | /licenciado FORA do Layout admin |
| Guard de camada | padcom .../components/layout/Layout.tsx | sessao licenciado em tela admin -> Redirect /licenciado |
| Credencial | banco dev | professional id=18 "Caio Padua (Licenciado)", usuario dr.caio.licenciado |

## 3. TESTES EXECUTADOS

| Teste | Resultado |
|---|---|
| POST /api/collaborator/login (licenciado) | 200, destino "/licenciado", isPrimaryDoctor=false |
| Senha errada | 401 |
| Login CEO | intocado (mapa so GANHOU uma chave nova) |
| Tela /licenciado | screenshot ok: navy/ouro, cadeados, grade de modulos |

## 4. REGRAS DE NEGOCIO EMBUTIDAS (marteladas pelo CEO 27/07/2026)

1. Valor promocional de adesao vale 48 horas; depois sobe para o valor cheio.
2. Indicacao por outro licenciado = 10% de desconto SO NA ADESAO; mensalidade igual.
3. CEO entra como CEO e opera 100% o Instituto Padua (nome fantasia da
   Paduccia Clinica Medica); a entrada "caio CEO" e "dr caio medico
   licenciado" sao nitidamente separadas (logins diferentes).
4. Hoje somente o CEO usa a entrada de licenciado (teste do produto).

## 5. VALORES SAO PLACEHOLDERS

Os precos no catalogo (padcom .../pages/licenciado/index.tsx, constante
MODULOS) sao valores de lancamento PROVISORIOS, editaveis num arquivo so.
O CEO ainda vai bater o martelo nos numeros.

## 6. FORA DE ESCOPO NESTA ONDA (proximos passos naturais)

- Cobranca real da adesao via Asaas ao clicar "Quero ativar este modulo".
- Relogio das 48 horas persistido no banco por licenciado.
- Seletor de dois chapeus no topo (ENTREGA 51, decisao A/B/C aberta).

## 7. GOVERNANCA

Codigo esta LOCAL no Replit (checkpoint automatico). O agente nao faz push;
o CEO empurra pela aba Git quando aprovar. Nada foi enviado ao Railway.

-- Dr. Replit Paxter
