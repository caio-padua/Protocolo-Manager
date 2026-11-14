# Meus Bolões — seção da Área do Cliente (/area)

Fonte: ordem do Dr. Caio de 14/11/2026. Estado de engenharia: EM CONSTRUÇÃO (não homologado; sem publicação).

## Objetivo

O cliente autenticado na Área do Cliente consulta, somente leitura, as participações em bolão que a clínica
registrou para ele: campanha, cotas, status de registro e comprovante oficial da CAIXA já recebido e validado.

## O que NÃO faz (exige revisão e liberação separadas)

Venda ou adesão, convites, cobrança, Asaas, integração de apostas, aquisição na CAIXA, geração de números da
sorte, bilhete desenhado ou simulado. Nenhum comprovante é gerado pelo sistema: só se baixa arquivo real
recebido e armazenado. O plano comercial Prata/Ouro/Platinum/Diamond não tem relação com cotas e não é tocado.

## Requisitos

1. Tela dentro de `/area` (aba interna `boloes`), acesso discreto no Início; navegação e login atuais intactos.
2. Cliente vem sempre do token do portal (HMAC). Nunca de query, corpo ou caminho.
3. Isolamento por clínica: participação só aparece se `client_id` = token E `empresa_id` = empresa atual do cliente.
4. Download: 404 uniforme para comprovante inexistente ou de outro cliente/clínica (anti-enumeração); só Bearer
   (nunca token na URL); arquivo em armazenamento privado sem endereço público; integridade conferida por SHA-256.
5. Trilha de auditoria em `boloes_auditoria`: download concluído, download negado, cadastro de campanha,
   participação e comprovante (quem, quando, resultado). Falha ao gravar a trilha bloqueia o download.
6. Status exibido nunca afirma registro sem comprovante: `registrada` só aparece se há comprovante validado ativo;
   caso contrário "Comprovante oficial ainda não disponível".
7. Estado vazio honesto: "Nenhum bolão confirmado". Zero dado inventado; tabelas nascem vazias.
8. Cadastro mínimo (somente titular da plataforma, sem tela): campanha, participação, anexo de comprovante com
   confirmação explícita de que é recibo real da CAIXA. Tipos aceitos: PDF, PNG, JPEG (conferidos pelos bytes),
   até 10 MB. A validade perante a CAIXA é atestada pelo titular e registrada; o sistema não consulta a CAIXA.
9. Banco: criação aditiva e idempotente (`CREATE TABLE IF NOT EXISTS`); nenhum dado existente é alterado.

## Impacto e dependências

- Produtores: titular da plataforma (cadastro mínimo). Consumidores: cliente na Área do Cliente.
- Persistência: `boloes_campanhas`, `boloes_participacoes`, `boloes_comprovantes`, `boloes_auditoria`.
- Armazenamento: prefixo privado `boloes-comprovantes/` (a rota pública só serve `uploads/`).
- Efeitos externos: nenhum (sem envio de mensagem, sem cobrança, sem CAIXA).
- Tocados: `routes/index.ts` (montagem), `index.ts` (criação das tabelas), `pages/area.tsx` (aba e atalho).

## Falhas previstas e barreiras

| Gravidade | Falha | Barreira | Evidência exigida |
|---|---|---|---|
| Crítica | Cliente baixa comprovante de outro (IDOR) | posse conferida no SQL (cliente + empresa); 404 uniforme; auditoria | teste com dois clientes e duas clínicas |
| Crítica | Clínica A lê dados da clínica B | filtro por `empresa_id` do cliente do token | teste com mesmo cliente em empresa divergente |
| Crítica | Aparente registro sem comprovante | status derivado do comprovante ativo | teste: participação sem arquivo mostra pendente |
| Alta | Arquivo trocado/corrompido no armazenamento | SHA-256 na leitura; 409 e auditoria | teste com bytes adulterados |
| Alta | Arquivo executável/HTML enviado como comprovante | conferência por bytes; `nosniff`; `attachment` | teste de tipo falso |
| Alta | Token na URL vaza em log | só cabeçalho Authorization | teste: `?token=` recusado |
| Média | Cadastro mínimo usado por quem não é titular | titular da plataforma obrigatório | teste 401/403 |
| Média | Segundo comprovante ativo duplica | índice único parcial; 409 | teste |

## Critérios de homologação

1. Testes em PostgreSQL descartável cobrem autenticação, isolamento, anti-IDOR, estado vazio, integridade e auditoria.
2. Captura em celular: aba vazia, aba com participação sem comprovante e com comprovante (dados sintéticos só no
   banco descartável ou em visualização de layout rotulada).
3. Nenhuma publicação nem ativação em produção sem comando explícito do titular.

## Estado e pendências

Em construção. Pendências conhecidas: tela do titular para cadastrar (hoje só API); revogação/substituição de
comprovante; limite de tentativas negadas por cliente; revisão independente.
