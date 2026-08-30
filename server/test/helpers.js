import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const serverDir = path.resolve(__dirname, '..')

export async function setupDb(name) {
  process.env.DATABASE_URL = `file:./test-${name}.db`
  execFileSync(
    'npx',
    ['prisma', 'db', 'push', '--schema', 'prisma/schema.prisma', '--skip-generate'],
    { cwd: serverDir, stdio: 'pipe' },
  )
  const { prisma } = await import('../src/db.js')
  return prisma
}

export async function clearTables(prisma) {
  for (const table of ['estimate', 'round', 'story', 'audit', 'session', 'room']) {
    await prisma.$executeRawUnsafe(`DELETE FROM ${table}`)
  }
}
