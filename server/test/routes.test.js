import { after, before, beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import Fastify from 'fastify'
import { setupDb, clearTables } from './helpers.js'
import { registerApiRoutes } from '../src/routes.js'
import { INFINITY } from '../src/routes.js'

const prisma = await setupDb('routes')

let app

before(async () => {
  app = Fastify()
  registerApiRoutes(app)
  await app.ready()
})

after(async () => {
  await app.close()
  await prisma.$disconnect()
})

beforeEach(async () => {
  await clearTables(prisma)
})

async function seedRoom() {
  const room = await prisma.room.create({
    data: { code: 'TEST1', hostName: 'Host', creatorName: 'Host', passwordHash: 'x' },
  })
  const story = await prisma.story.create({
    data: { roomId: room.id, title: 'Story "A"', description: 'desc', order: 0, status: 'done', estimate: INFINITY },
  })
  const round = await prisma.round.create({
    data: {
      storyId: story.id,
      number: 1,
      consensus: INFINITY,
      estimates: { create: [{ name: 'Host', value: 13 }, { name: 'Ana', value: INFINITY }] },
    },
  })
  const hostToken = await prisma.session.create({
    data: { token: 'host-token-abcdef123456789', roomName: room.id, name: 'Host', role: 'host', expiresAt: new Date(Date.now() + 60_000) },
  })
  const participantToken = await prisma.session.create({
    data: { token: 'part-token-abcdef123456789', roomName: room.id, name: 'Ana', role: 'participant', expiresAt: new Date(Date.now() + 60_000) },
  })
  return { room, story, round, hostToken, participantToken }
}

describe('GET /api/health', () => {
  it('responde ok', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' })
    assert.equal(res.statusCode, 200)
    assert.deepEqual(res.json(), { ok: true })
  })
})

describe('GET /api/rooms/:id/export.csv', () => {
  it('exporta CSV com estimates e ∞ para INFINITY', async () => {
    const { room, hostToken } = await seedRoom()
    const res = await app.inject({
      method: 'GET',
      url: `/api/rooms/${room.id}/export.csv`,
      headers: { authorization: `Bearer ${hostToken.token}` },
    })
    assert.equal(res.statusCode, 200)
    assert.match(res.headers['content-type'], /text\/csv/)
    assert.match(res.headers['content-disposition'], /planning-poker-TEST1\.csv/)
    const lines = res.body.trim().split('\n')
    assert.equal(lines[0], '"Story";"Descrição";"Estimativa final (pontos)"')
    assert.ok(lines.includes('"Story ""A""";"desc";"∞"'))
    assert.ok(lines.includes('"Story ""A""";"Rodada 1 – Host";"13"'))
    assert.ok(lines.includes('"Story ""A""";"Rodada 1 – Ana";"∞"'))
  })

  it('sem Authorization → 401', async () => {
    const { room } = await seedRoom()
    const res = await app.inject({ method: 'GET', url: `/api/rooms/${room.id}/export.csv` })
    assert.equal(res.statusCode, 401)
  })

  it('token de participant (role errada) → 401', async () => {
    const { room, participantToken } = await seedRoom()
    const res = await app.inject({
      method: 'GET',
      url: `/api/rooms/${room.id}/export.csv`,
      headers: { authorization: `Bearer ${participantToken.token}` },
    })
    assert.equal(res.statusCode, 401)
  })

  it('sala inexistente → 404', async () => {
    const { room, hostToken } = await seedRoom()
    // Remove a sala mantendo o token (FK pendurada) para atingir o branch de 404
    await prisma.$executeRawUnsafe('PRAGMA foreign_keys = OFF')
    await prisma.room.delete({ where: { id: room.id } })
    await prisma.$executeRawUnsafe('PRAGMA foreign_keys = ON')
    const res = await app.inject({
      method: 'GET',
      url: `/api/rooms/${room.id}/export.csv`,
      headers: { authorization: `Bearer ${hostToken.token}` },
    })
    assert.equal(res.statusCode, 404)
  })
})
