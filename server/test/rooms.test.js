import { beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { setupDb, clearTables } from './helpers.js'

const prisma = await setupDb('rooms')
const rooms = await import('../src/rooms.js')

async function seedRoom() {
  const { room, hostToken } = await rooms.createRoom('Host', 'senha123', 's-host')
  return { room, hostToken }
}

beforeEach(async () => {
  await clearTables(prisma)
})

describe('createRoom', () => {
  it('cria sala com código de 5 chars e persiste no banco', async () => {
    const { room, hostToken } = await rooms.createRoom('Lucas', 'senha123', 's1')
    assert.equal(room.code.length, 5)
    assert.match(room.code, /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]+$/)
    assert.ok(hostToken)
    const db = await prisma.room.findUnique({ where: { id: room.id } })
    assert.ok(db)
    assert.notEqual(db.passwordHash, 'senha123')
    assert.equal(db.hostName, 'Lucas')
  })

  it('exige nome', async () => {
    await assert.rejects(rooms.createRoom('   ', 'senha123', 's1'), /Informe seu nome/)
  })

  it('exige senha com no mínimo 6 caracteres', async () => {
    await assert.rejects(rooms.createRoom('Lucas', '12345', 's1'), /Senha muito curta/)
  })

  it('exige senha com no máximo 72 caracteres', async () => {
    await assert.rejects(rooms.createRoom('Lucas', 'x'.repeat(73), 's1'), /Senha muito longa/)
  })
})

describe('joinRoom', () => {
  it('junta novo participante e emite token', async () => {
    const { room } = await seedRoom()
    const { room: joined, participantToken } = await rooms.joinRoom(room.code, 'Ana', 's2')
    assert.ok(participantToken)
    assert.equal(joined.participants.length, 2)
    assert.equal(rooms.findParticipant(room, 'ana').name, 'Ana')
  })

  it('rejoin com o mesmo nome atualiza o socketId', async () => {
    const { room } = await seedRoom()
    rooms.leaveRoom(room.id, 's-host') // host sai → estado descartado; rebuild no próximo join
    const { room: rejoined } = await rooms.joinRoom(room.code, 'Host', 's-new')
    assert.equal(rooms.findParticipant(rejoined, 'Host').socketId, 's-new')
  })

  it('nome já em uso por outro socket → erro', async () => {
    const { room } = await seedRoom()
    await rooms.joinRoom(room.code, 'Ana', 's2')
    await assert.rejects(rooms.joinRoom(room.code, 'ana', 's3'), /Nome já em uso/)
  })

  it('sessão encerrada → erro', async () => {
    const { room } = await seedRoom()
    await rooms.finishSession(room.id, 'Host')
    await assert.rejects(rooms.joinRoom(room.code, 'Ana', 's2'), /já foi encerrada/)
  })

  it('código inexistente → erro', async () => {
    await assert.rejects(rooms.joinRoom('AAAAA', 'Ana', 's2'), /Sala não encontrada/)
  })
})

describe('stories', () => {
  it('host adiciona story (persistido no banco)', async () => {
    const { room } = await seedRoom()
    await rooms.addStory(room.id, 'Host', { title: 'Login', description: 'desc', acceptanceCriteria: 'ac' })
    assert.equal(room.stories.length, 1)
    const db = await prisma.story.findUnique({ where: { id: room.stories[0].id } })
    assert.equal(db.title, 'Login')
    assert.equal(db.status, 'todo')
  })

  it('participante não pode adicionar story', async () => {
    const { room } = await seedRoom()
    await assert.rejects(
      rooms.addStory(room.id, 'Ana', { title: 'X' }),
      /Apenas o responsável pela sala/,
    )
  })

  it('exige título', async () => {
    const { room } = await seedRoom()
    await assert.rejects(rooms.addStory(room.id, 'Host', { title: '  ' }), /título do story/)
  })

  it('remove story e cancela rodada ativa', async () => {
    const { room } = await seedRoom()
    await rooms.addStory(room.id, 'Host', { title: 'A' })
    await rooms.addStory(room.id, 'Host', { title: 'B' })
    const story = room.stories[0]
    await rooms.startRound(room.id, 'Host', story.id)
    assert.ok(room.round)
    await rooms.removeStory(room.id, 'Host', story.id)
    assert.equal(room.round, null)
    assert.equal(room.stories.length, 1)
    const db = await prisma.story.findUnique({ where: { id: story.id } })
    assert.equal(db, null)
  })
})

describe('rounds', () => {
  it('inicia rodada 1 em estimating', async () => {
    const { room } = await seedRoom()
    await rooms.addStory(room.id, 'Host', { title: 'A' })
    const story = room.stories[0]
    const result = await rooms.startRound(room.id, 'Host', story.id)
    assert.equal(result.round.number, 1)
    assert.equal(result.round.phase, 'estimating')
  })

  it('impede segunda rodada sem cancelar a atual', async () => {
    const { room } = await seedRoom()
    await rooms.addStory(room.id, 'Host', { title: 'A' })
    await rooms.startRound(room.id, 'Host', room.stories[0].id)
    assert.throws(() => rooms.startRound(room.id, 'Host', room.stories[0].id), /Já existe uma rodada/)
  })

  it('story inexistente → erro', async () => {
    const { room } = await seedRoom()
    assert.throws(() => rooms.startRound(room.id, 'Host', 'nope'), /Story não encontrado/)
  })

  it('selectCard: carta inválida → erro', async () => {
    const { room } = await seedRoom()
    await rooms.addStory(room.id, 'Host', { title: 'A' })
    await rooms.startRound(room.id, 'Host', room.stories[0].id)
    assert.throws(() => rooms.selectCard(room.id, 'Host', 4), /Carta inválida/)
  })

  it('selectCard fora de rodada → erro', async () => {
    const { room } = await seedRoom()
    assert.throws(() => rooms.selectCard(room.id, 'Host', 5), /Não há rodada em andamento para estimar/)
  })

  it('auto-reveal quando todos os conectados escolheram', async () => {
    const { room } = await seedRoom()
    await rooms.joinRoom(room.code, 'Ana', 's2')
    await rooms.addStory(room.id, 'Host', { title: 'A' })
    await rooms.startRound(room.id, 'Host', room.stories[0].id)
    let result = await rooms.selectCard(room.id, 'Host', 5)
    assert.equal(result.round.phase, 'estimating')
    result = await rooms.selectCard(room.id, 'Ana', 8)
    assert.equal(result.round.phase, 'revealed')
  })

  it('não revela enquanto falta alguém', async () => {
    const { room } = await seedRoom()
    await rooms.joinRoom(room.code, 'Ana', 's2')
    await rooms.joinRoom(room.code, 'Bruno', 's3')
    await rooms.addStory(room.id, 'Host', { title: 'A' })
    await rooms.startRound(room.id, 'Host', room.stories[0].id)
    const result = await rooms.selectCard(room.id, 'Host', 5)
    assert.equal(result.round.phase, 'estimating')
  })

  it('revealRound força reveal; cancelRound zera a rodada', async () => {
    const { room } = await seedRoom()
    await rooms.joinRoom(room.code, 'Ana', 's2')
    await rooms.addStory(room.id, 'Host', { title: 'A' })
    await rooms.startRound(room.id, 'Host', room.stories[0].id)
    let result = await rooms.revealRound(room.id, 'Host')
    assert.equal(result.round.phase, 'revealed')
    result = await rooms.cancelRound(room.id, 'Host')
    assert.equal(result.round, null)
  })

  it('consensus persiste rodada + estimates e marca story como done', async () => {
    const { room } = await seedRoom()
    await rooms.joinRoom(room.code, 'Ana', 's2')
    await rooms.addStory(room.id, 'Host', { title: 'A' })
    const story = room.stories[0]
    await rooms.startRound(room.id, 'Host', story.id)
    await rooms.selectCard(room.id, 'Host', 5)
    await rooms.selectCard(room.id, 'Ana', 8)
    const result = await rooms.consensus(room.id, 'Host', 8)
    assert.equal(result.round, null)
    assert.equal(story.status, 'done')
    assert.equal(story.estimate, 8)
    const dbStory = await prisma.story.findUnique({ where: { id: story.id } })
    assert.equal(dbStory.estimate, 8)
    const dbRound = await prisma.round.findFirst({ where: { storyId: story.id }, include: { estimates: true } })
    assert.equal(dbRound.consensus, 8)
    assert.deepEqual(
      dbRound.estimates.map((e) => e.value).sort((a, b) => a - b),
      [5, 8],
    )
  })

  it('consensus exige rodada revelada', async () => {
    const { room } = await seedRoom()
    await rooms.addStory(room.id, 'Host', { title: 'A' })
    await rooms.startRound(room.id, 'Host', room.stories[0].id)
    await assert.rejects(rooms.consensus(room.id, 'Host', 5), /precisa estar revelada/)
  })

  it('consensus com INFINITY (-1)', async () => {
    const { room } = await seedRoom()
    await rooms.addStory(room.id, 'Host', { title: 'A' })
    await rooms.startRound(room.id, 'Host', room.stories[0].id)
    const result = await rooms.revealRound(room.id, 'Host')
    await rooms.consensus(room.id, 'Host', rooms.INFINITY)
    assert.equal(result.stories[0].estimate, rooms.INFINITY)
  })
})

describe('leaveRoom', () => {
  it('host sai → reeleição por joinedAt', async () => {
    const { room } = await seedRoom()
    await rooms.joinRoom(room.code, 'Ana', 's2')
    await rooms.joinRoom(room.code, 'Bruno', 's3')
    rooms.leaveRoom(room.id, 's-host')
    assert.equal(room.hostName, 'Ana')
  })

  it('sala vazia → estado descartado; rejoin reconstrói do banco', async () => {
    const { room } = await seedRoom()
    rooms.leaveRoom(room.id, 's-host')
    assert.equal(rooms.getRoom(room.id), undefined)
    const { room: rebuilt } = await rooms.joinRoom(room.code, 'Ana', 's9')
    assert.equal(rooms.getRoom(rebuilt.id), rebuilt)
    assert.ok(rooms.findParticipant(rebuilt, 'Ana'))
    assert.equal(rebuilt.hostName, 'Host')
  })

  it('remove seleção do participante que saiu', async () => {
    const { room } = await seedRoom()
    await rooms.joinRoom(room.code, 'Ana', 's2')
    await rooms.joinRoom(room.code, 'Bruno', 's3')
    await rooms.addStory(room.id, 'Host', { title: 'A' })
    await rooms.startRound(room.id, 'Host', room.stories[0].id)
    await rooms.selectCard(room.id, 'Host', 5)
    await rooms.selectCard(room.id, 'Ana', 8)
    rooms.leaveRoom(room.id, 's2')
    assert.equal(room.round.selections['Ana'], undefined)
    assert.equal(room.round.phase, 'estimating')
  })
})

describe('transferHost', () => {
  it('transfere o host, revoga tokens antigos e emite novo para o alvo', async () => {
    const { room, hostToken } = await seedRoom()
    await rooms.joinRoom(room.code, 'Ana', 's2')
    const result = await rooms.transferHost(room.id, 'Host', 'Ana')
    assert.equal(result.room.hostName, 'Ana')
    assert.ok(result.hostToken)
    const db = await prisma.room.findUnique({ where: { id: room.id } })
    assert.equal(db.hostName, 'Ana')
    const audit = await prisma.audit.findFirst({ where: { action: 'host:transfer' } })
    assert.ok(audit)
    const hostSessions = await prisma.session.findMany({ where: { roomName: room.id, role: 'host' } })
    assert.equal(hostSessions.length, 1)
    assert.equal(hostSessions[0].name, 'Ana')
    assert.equal(hostSessions[0].token, result.hostToken)
    const old = await prisma.session.findUnique({ where: { token: hostToken } })
    assert.equal(old, null)
  })

  it('alvo não participante → erro', async () => {
    const { room } = await seedRoom()
    await assert.rejects(rooms.transferHost(room.id, 'Host', 'Zoe'), /Partipante não encontrado/)
  })

  it('participante não é o responsável → erro', async () => {
    const { room } = await seedRoom()
    await rooms.joinRoom(room.code, 'Ana', 's2')
    await assert.rejects(rooms.transferHost(room.id, 'Ana', 'Host'), /Apenas o responsável/)
  })
})

describe('authenticate', () => {
  it('senha correta → token de host', async () => {
    const { room } = await seedRoom()
    const result = await rooms.authenticate(room.id, 'Host', 'senha123')
    assert.ok(result.hostToken)
    assert.equal(result.code, room.code)
  })

  it('senha errada → RoomError', async () => {
    const { room } = await seedRoom()
    await assert.rejects(rooms.authenticate(room.id, 'Host', 'errada123'), /Senha irreconhecida/)
  })
})

describe('snapshots', () => {
  it('snapshot tem estrutura completa; leanRound não tem stories', async () => {
    const { room } = await seedRoom()
    await rooms.addStory(room.id, 'Host', { title: 'A' })
    const snap = rooms.snapshot(room)
    assert.ok(snap.roomId && snap.code && snap.hostName)
    assert.ok(Array.isArray(snap.stories))
    assert.ok(Array.isArray(snap.participants))
    await rooms.startRound(room.id, 'Host', room.stories[0].id)
    const lean = rooms.leanRound(room)
    assert.equal(lean.stories, undefined)
    assert.ok(lean.round)
  })
})
