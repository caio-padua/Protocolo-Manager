# Autorização administrativa dos envios de guia e Telegram

## Limites
Esta proteção cobre somente o envio do guia e o envio direto do inbox Telegram.
Não é uma implantação geral de licenciamento ou de autenticação multi-clínica.
Não altera cobranças nem atribui privilégios de proprietário.

## Regra
O token assinado identifica o profissional.
O servidor consulta, em cada envio, a associação explícita `professionals.empresa_id`.
Sem associação ativa, profissional ativo e clínica ativa, o envio é negado.
A clínica enviada pelo navegador não participa desta decisão.
O cliente precisa pertencer à clínica autorizada.
Nem o médico principal recebe exceção.

## Atenção antes da implantação
Não existe associação automática: colaboradores sem vínculo ficam bloqueados nestes dois envios.
O administrador deve verificar a identidade e a clínica de cada colaborador antes de conceder acesso.
O comando abaixo deve ser executado no servidor/banco correto por um administrador com acesso ao terminal.
Nenhum endpoint do navegador concede ou altera esta associação.
Uma alteração de associação vale na próxima requisição, inclusive com token já emitido.
O guia, sua lista de clientes e o envio direto Telegram reutilizam esta mesma fonte de autorização.
Revogar não cancela mensagens que já tenham sido aceitas pelo provedor.

## Cadastrar ou trocar a clínica de envio
Substitua `PROFESSIONAL_ID` e `EMPRESA_ID` pelos identificadores verificados no cadastro.
Não são nomes, cargos, identificadores de colaboradores de recursos humanos nem locais de agenda.

```sh
pnpm --filter @workspace/api-server exec tsx src/scripts/autorizar-envio-clinica.ts PROFESSIONAL_ID EMPRESA_ID
```

## Remover o vínculo de clínica sem apagar o profissional

```sh
pnpm --filter @workspace/api-server exec tsx src/scripts/autorizar-envio-clinica.ts PROFESSIONAL_ID --revogar
```

Os comandos não enviam mensagens.
Nenhuma autorização real foi cadastrada automaticamente durante os testes.
O comando de revogação limpa somente `empresa_id`; a partir daí as rotas que exigem esse vínculo ficam bloqueadas.
Não reativa nem desativa o cadastro do profissional.
