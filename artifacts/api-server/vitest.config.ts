import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Apenas os testes do api-server — não contamina outros pacotes
    include: ["src/tests/**/*.test.ts"],
    environment: "node",
    // Sem cobertura de código por padrão (evita dependências extras)
    coverage: { enabled: false },
  },
});
