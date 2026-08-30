import { after, before, beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import Fastify from 'fastify'
import { io as Client } from 'socket.io-client'
import { setupDb, clearTables } from './helpers.js'
import { registerApiRoutes } from '../src/routes.js'
import { createSocketServer } from '../src/socket.js'

const prisma = await setupDb('socket')

let app
let url
const sockets = []

before(async () => {
  app = Fastify()
  registerApiRoutes(app)
  await app.listen({ port: 0, host: '127.0.0.1' })
  createSocketServer(app.server)
  const address = app.server.address()
  url = `http://127.0.0.1:${address.port}`
})

after(async () => {
  for (const s of sockets) s.disconnect()
  await app.close()
  await prisma.$disconnect()
})

beforeEach(async () => {
  await clearTables(prisma)
})

function connect() {
  return new Promise((resolve) => {
    const socket = Client(url, { path: '/realtime', transports: ['websocket'], forceNew: true })
    socket.once('connect', () => { sockets.push(socket); resolve(socket) })
  })
}

function emitAck(socket, event, payload = {}) {
  return new Promise((resolve) => socket.emit(event, payload, (res) => resolve(res)))
}

function waitForEvent(socket, event, predicate = () => true, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler)
      reject(new Error(`timeout esperando ${event}`))
    }, timeoutMs)
    const handler = (data) => {
      if (predicate(data)) {
        clearTimeout(timer)
        socket.off(event, handler)
        resolve(data)
      }
    }
    socket.on(event, handler)
  })
}

describe('sockets', () => {
  it('room:create retorna ack e emite room:created', async () => {
    const host = await connect()
    const createdPromise = waitForEvent(host, 'room:created')
    const res = await emitAck(host, 'room:create', { name: 'Host', password: 'senha123' })
    assert.equal(res.ok, true)
    assert.ok(res.roomId)
    assert.ok(res.code)
    assert.ok(res.hostToken)
    const created = await createdPromise
    assert.equal(created.roomId, res.roomId)
    assert.equal(created.name, 'Host')
    host.disconnect()
  })

  it('room:join entra na sala e o snapshot reflete os participantes', async () => {
    const host = await connect()
    const created = await emitAck(host, 'room:create', { name: 'Host', password: 'senha123' })
    const statePromise = waitForEvent(host, 'room:state', (s) => s.participants?.length === 2)
    const ana = await connect()
    const res = await emitAck(ana, 'room:join', { code: created.code, name: 'Ana' })
    assert.equal(res.ok, true)
    assert.ok(res.participantToken)
    const state = await statePromise
    assert.deepEqual(state.participants.map((p) => p.name).sort(), ['Ana', 'Host'])
    host.disconnect()
    ana.disconnect()
  })

  it('story:add com token de participant → ack erro PT-BR', async () => {
    const host = await connect()
    const created = await emitAck(host, 'room:create', { name: 'Host', password: 'senha123' })
    const ana = await connect()
    const joined = await emitAck(ana, 'room:join', { code: created.code, name: 'Ana' })
    const res = await emitAck(ana, 'story:add', { authorization: joined.participantToken, title: 'X' })
    assert.equal(res.ok, false)
    assert.match(res.error, /Acesso restrito ao responsável pela sala/)
    host.disconnect()
    ana.disconnect()
  })

  it('fluxo completo: story → rodada → selects (delta lean) → consensus', async () => {
    const host = await connect()
    const created = await emitAck(host, 'room:create', { name: 'Host', password: 'senha123' })
    const ana = await connect()
    const joined = await emitAck(ana, 'room:join', { code: created.code, name: 'Ana' })

    const storyState = waitForEvent(host, 'room:state', (s) => s.stories?.length === 1)
    const addStory = await emitAck(host, 'story:add', { authorization: created.hostToken, title: 'Story A' })
    assert.equal(addStory.ok, true)
    const storySnap = await storyState
    const storyId = storySnap.stories[0].id

    const roundStart = waitForEvent(host, 'room:state', (s) => s.round?.phase === 'estimating')
    await emitAck(host, 'round:start', { authorization: created.hostToken, storyId })
    await roundStart

    const deltaAna = waitForEvent(host, 'room:delta', (d) => d.round?.selections?.['Ana'] !== undefined)
    await emitAck(ana, 'round:select', { authorization: joined.participantToken, value: 8 })
    const delta = await deltaAna
    assert.equal(delta.stories, undefined)
    assert.equal(delta.round.selections['Ana'], 8)

    const revealed = waitForEvent(host, 'room:delta', (d) => d.round?.phase === 'revealed')
    await emitAck(host, 'round:select', { authorization: created.hostToken, value: 5 })
    await revealed

    const doneState = waitForEvent(host, 'room:state', (s) => s.stories[0]?.status === 'done' && s.round === null)
    const consensus = await emitAck(host, 'round:consensus', { authorization: created.hostToken, value: 8 })
    assert.equal(consensus.ok, true)
    await doneState

    const story = await prisma.story.findFirst({
      where: { roomId: created.roomId },
      include: { rounds: { include: { estimates: true } } },
    })
    assert.equal(story.status, 'done')
    assert.equal(story.estimate, 8)
    assert.equal(story.rounds.length, 1)
    assert.equal(story.rounds[0].estimates.length, 2)

    host.disconnect()
    ana.disconnect()
  })

  it('host:transfer → alvo recebe host:token e consegue ação de host', async () => {
    const host = await connect()
    const created = await emitAck(host, 'room:create', { name: 'Host', password: 'senha123' })
    const ana = await connect()
    const joined = await emitAck(ana, 'room:join', { code: created.code, name: 'Ana' })

    const tokenPromise = waitForEvent(ana, 'host:token')
    const transfer = await emitAck(host, 'host:transfer', { authorization: created.hostToken, targetName: 'Ana' })
    assert.equal(transfer.ok, true)
    const { hostToken } = await tokenPromise

    const addStory = await emitAck(ana, 'story:add', { authorization: hostToken, title: 'Story A' })
    assert.equal(addStory.ok, true)

    const secondTransfer = await emitAck(ana, 'host:transfer', { authorization: hostToken, targetName: 'Host' })
    assert.equal(secondTransfer.ok, true)

    host.disconnect()
    ana.disconnect()
  })

  it('disconnect do host → reeleição refletida no broadcast', async () => {
    const host = await connect()
    const created = await emitAck(host, 'room:create', { name: 'Host', password: 'senha123' })
    const ana = await connect()
    await emitAck(ana, 'room:join', { code: created.code, name: 'Ana' })
    const reelect = waitForEvent(ana, 'room:state', (s) => s.hostName === 'Ana')
    host.disconnect()
    const state = await reelect
    assert.equal(state.participants.length, 1)
    ana.disconnect()
  })
})
