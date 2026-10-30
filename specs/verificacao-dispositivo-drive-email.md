# Verificação de dispositivo e isolamento de envio

## Objetivo
Restabelecer os testes das três suítes indicadas sem enfraquecer os contratos de segurança.

## Requisitos
1. Entrada inválida na verificação de dispositivo retorna 400; verificação válida retorna 200.
2. A rota delega a confirmação ao motor transacional existente, preservando sua proteção contra corridas.
3. A oferta Concierge lê e normaliza o CPF da consulta.
4. Pré-visualização do protocolo não envia e-mail nem faz upload; emissão permanece autenticada.
5. Reparos indispensáveis de rotas não podem remover filtros por empresa nem substituir dados clínicos por exemplos.
6. Executar as três suítes e a suíte completa; registrar separadamente falhas externas ao escopo.
7. Reenvio e histórico do RAS recusam qualquer parâmetro `empresaId`, inclusive repetido, enquanto o token do colaborador não tiver vínculo de empresa autorizado pelo servidor.
8. Testar essa recusa com autenticação e middleware de empresa reais, comprovando que não há leitura clínica, geração de documento nem envio.

## Casos extremos
Código ausente, CPF inválido, desafio inválido, desafio recusado, falha do motor e falta de autorização.

## Pronto
As três suítes passam sem remover suas asserções; servidor compila; resultados e limitações são comunicados honestamente.

## Limites
Não alterar o motor de orçamento; não apagar dados; não apresentar esta correção como certificação comercial multiempresa.
