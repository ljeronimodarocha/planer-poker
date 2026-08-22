import Fastify from 'fastify'
import cors from '@fastify/cors'
import fastifyStatic from '@fastify/static'
import path from 'node:path'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createSocketServer } from './socket.js'
import { registerApiRoutes } from './routes.js'
import { prisma } from './db.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const port = Number(process.env.PORT || 3000)
const host = process.env.HOST || '0.0.0.0'
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

const app = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info',
  },
})

await app.register(cors, {
  origin: (origin, cb) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) cb(null, true)
    else cb(new Error('Origem não permitida'))
  },
  credentials: true,
})
registerApiRoutes(app)

const distDir = path.resolve(__dirname, '../../client/dist')
if (existsSync(distDir)) {
  await app.register(fastifyStatic, {
    root: distDir,
    index: ['index.html'],
  })
}
app.setNotFoundHandler((req, reply) => {
  if (req.raw.url?.startsWith('/api') || req.raw.url?.startsWith('/realtime')) {
    return reply.status(404).send({ error: 'Não encontrado' })
  }
  return reply.sendFile('index.html')
})

createSocketServer(app.server)

try {
  await app.listen({ port, host })
  app.log.info(`Planning Poker rodando em http://${host}:${port}`)
} catch (err) {
  app.log.error(err)
  process.exit(1)
}

async function shutdown() {
  await app.close()
  await prisma.$disconnect()
  process.exit(0)
}
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
