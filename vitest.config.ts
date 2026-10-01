import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Ambiente de nó: as funções puras do extrato não tocam no DOM.
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
