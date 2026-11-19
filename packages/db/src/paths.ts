// @effect-diagnostics nodeBuiltinImport:off
import { fileURLToPath } from 'node:url'

export const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url))
