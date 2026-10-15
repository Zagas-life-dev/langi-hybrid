import { defineConfig } from 'vitest/config'
import path from 'node:path'

// Unit tests for the pure, dependency-free modules (SRS, scoring, leagues…).
// Anything that touches Mongo/Supabase is covered by scripts/e2e-smoke.ts instead.
export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname) } },
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
})
