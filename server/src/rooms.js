import bcryptjs from 'bcryptjs'
import { randomBytes } from 'node:crypto'
import { prisma } from './db.js'

// -1 representa o cartão "infinito"
export const CARD_VALUES = [0, 1, 2, 3, 5, 8, 13, 21, 34, 40, -1]

export const INFINITY = -1

const rooms = new Map() // roomId -> state

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000 // 24h

function randomToken() {
  return randomBytes(24).toString('hex')
}

async function issueToken(roomId, name, socketId, role) {
  const token = randomToken()
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS)
  await prisma.session.create({
    data: { token, room: { connect: { id: roomId } }, name, socketId, role, expiresAt },
  })
  return token
}

export async function validateToken(token, roomId, role) {
  if (typeof token !== 'string' || token.length < 16) return null
  const session = await prisma.session.findUnique({ where: { token } })
  if (!session || session.role !== role || session.roomName !== roomId) return null
  if (session.expiresAt.getTime() < Date.now()) {
    await prisma.session.delete({ where: { token } })
    return null
  }
  return { name: session.name, token }
}

function randomCode() {
  for (;;) {
    const code = Array.from(
      { length: 5 },
      () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)],
    ).join('')
    if (![...rooms.values()].some((r) => r.code === code)) return code
  }
}

class RoomError extends Error {
  constructor(message) {
    super(message)
    this.message = message
  }
}

export { RoomError }

export function getRoom(id) {
  return rooms.get(id)
}

export function findParticipant(room, name) {
  return room.participants.find((p) => p.name.toLowerCase() === String(name).toLowerCase())
}

export function listActiveRoomIds() {
  return [...rooms.keys()]
}

function requireRoom(id) {
  const room = rooms.get(id)
  if (!room) throw new RoomError('Sala não encontrada')
  return room
}

export async function createRoom(hostName, password, socketId) {
  if (typeof hostName !== 'string' || hostName.trim().length === 0) {
    throw new RoomError('Informe seu nome')
  }
  if (typeof password !== 'string' || password.length < 6) {
    throw new RoomError('Senha muito curta (mín. 6 caracteres)')
  }
  if (password.length > 72) {
    throw new RoomError('Senha muito longa (máx. 72 caracteres)')
  }
  const name = hostName.trim()
  const id = crypto.randomUUID()
  const code = randomCode()
  const passwordHash = await bcryptjs.hash(password, 10)
  const room = {
    id,
    code,
    hostName: name,
    creatorName: name,
    passwordHash,
    finished: false,
    participants: [
      { name, socketId, joinedAt: Date.now() },
    ],
    stories: [],
    round: null,
  }
  await prisma.room.create({
    data: { id, code, hostName: name, creatorName: name, passwordHash },
  })
  const hostToken = await issueToken(id, name, socketId, 'host')
  rooms.set(id, room)
  return { room, hostToken }
}

export async function loadRoomFromDb(code) {
  const dbRoom = await prisma.room.findUnique({
    where: { code },
    include: { stories: { orderBy: [{ order: 'asc' }] } },
  })
  if (!dbRoom) throw new RoomError('Sala não encontrada')
  const id = dbRoom.id
  if (rooms.has(id)) return rooms.get(id)
  const room = {
    id,
    code: dbRoom.code,
    hostName: dbRoom.hostName,
    finished: !!dbRoom.finishedAt,
    participants: [{ name: dbRoom.hostName, socketId: null, joinedAt: Date.now() }],
    stories: dbRoom.stories.map((s) => ({
      id: s.id,
      title: s.title,
      description: s.description,
      acceptanceCriteria: s.acceptanceCriteria,
      status: s.status,
      estimate: s.estimate,
    })),
    round: null,
  }
  rooms.set(id, room)
  return room
}

export async function joinRoom(code, name, socketId) {
  const room = await loadRoomFromDb(code)
  if (room.finished) throw new RoomError('Esta sessão já foi encerrada')
  const trimmedName = String(name ?? '').trim()
  if (trimmedName.length === 0) throw new RoomError('Informe seu nome')
  const existing = findParticipant(room, trimmedName)
  if (existing) {
    if (existing.socketId !== null && existing.socketId !== socketId) {
      throw new RoomError('Nome já em uso nesta sala')
    }
    existing.socketId = socketId
    existing.joinedAt = Date.now()
    const participantToken = await issueToken(room.id, existing.name, socketId, 'participant')
    return { room, participantToken }
  }
  const canonicalName =
    room.hostName.toLowerCase() === trimmedName.toLowerCase() ? room.hostName : trimmedName
  room.participants.push({ name: canonicalName, socketId, joinedAt: Date.now() })
  const participantToken = await issueToken(room.id, canonicalName, socketId, 'participant')
  return { room, participantToken }
}

export function leaveRoom(roomId, socketId) {
  const room = rooms.get(roomId)
  if (!room) return
  const idx = room.participants.findIndex((p) => p.socketId === socketId)
  if (idx === -1) return
  const [removed] = room.participants.splice(idx, 1)
  if (room.round) {
    delete room.round.selections[removed.name]
    if (room.round.phase === 'estimating') {
      const connected = room.participants.filter((p) => p.socketId !== null)
      if (connected.length > 0 && connected.every((p) => room.round.selections[p.name] !== undefined)) {
        room.round.phase = 'revealed'
      }
    }
  }
  if (removed.name.toLowerCase() === room.hostName.toLowerCase()) {
    room.hostName = resolveHostRoomParticipants(room.participants)
  }

  if (room.participants.length === 0) {
    // sala vazia: descarta o estado; o próximo join reconstrói do banco
    rooms.delete(roomId)
  }
}

function resolveHostRoomParticipants(participants) {
  const active = participants
    .filter((p) => p.socketId !== null)
    .sort((a, b) => a.joinedAt - b.joinedAt)
  return active.length ? active[0].name : null
}

export async function addStory(roomId, actorName, story) {
  const room = requireRoom(roomId)
  assertHost(room, actorName)
  if (!story.title || !story.title.trim()) throw new RoomError('Informe o título do story')
  const data = {
    id: crypto.randomUUID(),
    roomId,
    title: story.title.trim(),
    description: (story.description || '').trim(),
    acceptanceCriteria: (story.acceptanceCriteria || '').trim(),
    status: 'todo',
    estimate: null,
    order: room.stories.length,
  }
  await prisma.story.create({ data })
  room.stories.push(data)
  return room
}

export async function removeStory(roomId, actorName, storyId) {
  const room = requireRoom(roomId)
  assertHost(room, actorName)
  const idx = room.stories.findIndex((s) => s.id === storyId)
  if (idx === -1) throw new RoomError('Story não encontrado')
  room.stories.splice(idx, 1)
  await prisma.story.delete({ where: { id: storyId } })
  if (room.round && room.round.storyId === storyId) {
    room.round = null
  }
  return room
}

export function startRound(roomId, actorName, storyId) {
  const room = requireRoom(roomId)
  assertHost(room, actorName)
  const story = room.stories.find((s) => s.id === storyId)
  if (!story) throw new RoomError('Story não encontrado')
  if (room.round) throw new RoomError('Já existe uma rodada em andamento')
  room.round = {
    storyId,
    number: 1,
    phase: 'estimating',
    selections: {},
  }
  return room
}

export function selectCard(roomId, actorName, value) {
  const room = requireRoom(roomId)
  const participant = findParticipant(room, actorName)
  if (!participant) throw new RoomError('Você não está na sala')
  if (!room.round || room.round.phase !== 'estimating') {
    throw new RoomError('Não há rodada em andamento para estimar')
  }
  if (!CARD_VALUES.includes(value)) throw new RoomError('Carta inválida')
  room.round.selections[participant.name] = value
  const connected = room.participants.filter((p) => p.socketId !== null)
  if (connected.length > 0 && connected.every((p) => room.round.selections[p.name] !== undefined)) {
    room.round.phase = 'revealed'
  }
  return room
}

export function revealRound(roomId, actorName) {
  const room = requireRoom(roomId)
  assertHost(room, actorName)
  if (!room.round) throw new RoomError('Não há rodada em andamento')
  room.round.phase = 'revealed'
  return room
}

export function cancelRound(roomId, actorName) {
  const room = requireRoom(roomId)
  assertHost(room, actorName)
  room.round = null
  return room
}

export async function consensus(roomId, actorName, value) {
  const room = requireRoom(roomId)
  assertHost(room, actorName)
  if (!CARD_VALUES.includes(value)) throw new RoomError('Carta inválida')
  if (!room.round || room.round.phase !== 'revealed') {
    throw new RoomError('A rodada precisa estar revelada para definir o consenso')
  }
  const story = room.stories.find((s) => s.id === room.round.storyId)
  const number = room.round.number
  const selections = room.round.selections
  room.round = null

  await prisma.round.create({
    data: {
      storyId: story.id,
      number,
      consensus: value,
      estimates: {
        create: Object.entries(selections).map(([name, v]) => ({
          name,
          value: v,
        })),
      },
    },
  })
  await prisma.story.update({
    where: { id: story.id },
    data: { estimate: value, status: 'done' },
  })
  story.estimate = value
  story.status = 'done'
  return room
}

export async function finishSession(roomId, actorName) {
  const room = requireRoom(roomId)
  assertHost(room, actorName)
  room.finished = true
  room.round = null
  await prisma.room.update({
    where: { id: roomId },
    data: { finishedAt: new Date() },
  })
  return room
}

export async function requireHostToken(token, roomId) {
  const seat = await validateToken(token, roomId, 'host')
  if (!seat) throw new RoomError('Acesso restrido ao responsável pela sala')
  return seat
}

function assertHost(room, actorName) {
  if (room.hostName.toLowerCase() !== String(actorName).toLowerCase()) {
    throw new RoomError('Apenas o responsável pela sala pode fazer isso')
  }
}

export async function transferHost(roomId, actorName, targetName) {
  const room = requireRoom(roomId)
  const seat = await validateToken(actorName, roomId, 'host')
  if (!seat) throw new RoomError('Acesso restrido ao responsável pela sala')
  assertHost(room, seat.name)
  const target = findParticipant(room, targetName)
  if (!target) throw new RoomError('Partipante não encontrado')
  room.hostName = target.name
  await prisma.room.update({
    where: { id: roomId },
    data: { hostName: target.name },
  })
  await prisma.audit.create({
    data: { roomName: roomId, actor: seat.name, action: 'host:transfer' },
  })
  return room
}

export async function authenticate(roomId, name, password) {
  const room = requireRoom(roomId)
  if (typeof password !== 'string' || password.length < 6) {
    throw new RoomError('Senha muito curta (mín. 6 caracteres)')
  }
  const ok = await bcryptjs.compare(password, room.passwordHash)
  if (!ok) throw new RoomError('Senha irreconhecida')
  const hostToken = await issueToken(roomId, room.hostName, null, 'host')
  await prisma.audit.create({
    data: { roomName: roomId, actor: String(name ?? '').trim(), action: 'host:auth' },
  })
  return { roomId, code: room.code, hostToken }
}

export function snapshot(room) {
  return {
    roomId: room.id,
    code: room.code,
    hostName: room.hostName,
    finished: room.finished,
    participants: room.participants.map((p) => ({ name: p.name })),
    stories: room.stories.map((s) => ({
      id: s.id,
      title: s.title,
      description: s.description,
      acceptanceCriteria: s.acceptanceCriteria,
      status: s.status,
      estimate: s.estimate,
    })),
    round: room.round
      ? {
          storyId: room.round.storyId,
          number: room.round.number,
          phase: room.round.phase,
          selections: { ...room.round.selections },
        }
      : null,
  }
}

export function leanRound(room) {
  return { roomId: room.id, round: room.round ? { storyId: room.round.storyId, number: room.round.number, phase: room.round.phase, selections: { ...room.round.selections } } : null }
}
