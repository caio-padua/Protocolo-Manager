# Pádua Lottery Engine — prova de conceito técnica (isolada)

Protótipo **não produtivo** de automação de navegador. Prova apenas que o ambiente consegue:
abrir uma página local, navegar, capturar imagem e baixar um arquivo inofensivo.

## O que NÃO faz (por regra)
- Não acessa a Caixa nem qualquer site externo (pedidos fora de `127.0.0.1` são bloqueados e reprovam o teste).
- Não usa nem pede credenciais, não faz login, não aposta, não paga, não tenta CAPTCHA.
- Não toca em nenhum fluxo clínico, de cliente, pagamento ou mensagem do Manager. Não usa banco de dados.

## Pré-requisitos
1. Dependências do projeto instaladas com `pnpm install` (o `@playwright/test` já é dependência de desenvolvimento da raiz).
2. Um Chromium disponível. No Replit o caminho padrão (Nix) já está configurado; em outro ambiente defina `CHROMIUM_PATH`.
3. Porta local livre `19099` (ou defina `POC_PORT`).

## Como executar (na raiz do projeto)
```bash
pnpm run poc:lottery
```

## O que acontece
1. Sobe um servidor local (`fixture-server.mjs`) só em `127.0.0.1`.
2. O teste (`tests/poc.spec.ts`) abre a página inicial, clica no link e confere a segunda página.
3. Salva `segunda-pagina.png` e baixa `arquivo-teste.pdf` (PDF mínimo gerado localmente, texto "TESTE INOFENSIVO").
4. Confere que o arquivo é um PDF válido e que nenhum pedido externo foi tentado.

## Onde ficam as saídas
`tools/lottery-engine-poc/.tmp-output/` (ignorada pelo git, recriada a cada execução).

## Estrutura
| Arquivo | Função |
|---|---|
| `playwright.config.ts` | Configuração própria, separada do e2e do Manager |
| `fixture-server.mjs` | Servidor local das páginas e do PDF de teste |
| `fixtures/*.html` | Páginas de teste |
| `tests/poc.spec.ts` | O teste da prova de conceito |
