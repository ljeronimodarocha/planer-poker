import { Server } from 'socket.io'
import * as rooms from './rooms.js'
import { requireHostToken, validateToken, getRoom } from './rooms.js'

export function createSocketServer(fastifyServer) {
  const io = new Server({ path: '/realtime', pingInterval: 5000, pingTimeout: 10000 })
  io.attach(fastifyServer)

  const rateLimitWindows = new Map() // ip -> timestamps
  const RATE_LIMIT_MAX = 30
  const RATE_LIMIT_WINDOW_MS = 60000
  function rateLimitExceeded(ip) {
    if (!ip) return false
    const now = Date.now()
    const times = (rateLimitWindows.get(ip) || []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS)
    times.push(now)
    rateLimitWindows.set(ip, times)
    return times.length > RATE_LIMIT_MAX
  }

  function broadcast(roomId) {
    const room = getRoom(roomId)
    if (!room) return
    io.to(roomId).emit('room:state', rooms.snapshot(room))
  }

  function broadcastLean(roomId) {
    const room = getRoom(roomId)
    if (!room) return
    io.to(roomId).emit('room:delta', rooms.leanRound(room))
  }

  io.on('connection', (socket) => {
    if (rateLimitExceeded(socket.request?.connection?.remoteAddress ?? null)) {
      socket.emit('rate:limited', { error: 'Muitas conexções por minuto. Tente novamente mais tarde.' })
      socket.disconnect(true)
      return
    }

    let currentRoomId = null
    let currentName = null

    function enterRoom(roomId, name) {
      if (currentRoomId && currentRoomId !== roomId) {
        rooms.leaveRoom(currentRoomId, socket.id)
        socket.leave(currentRoomId)
        broadcast(currentRoomId)
      }
      currentRoomId = roomId
      currentName = name
      socket.join(roomId)
      broadcast(roomId)
    }

    function requireHost(action, lean = false) {
      return async (data, ack) => {
        if (!currentRoomId || !currentName) {
          ack?.({ ok: false, error: 'Você não está em uma sala' })
          return
        }
        try {
          const seat = await requireHostToken(data?.authorization, currentRoomId)
          const room = await action(currentRoomId, seat.name, data)
          lean ? broadcastLean(currentRoomId) : broadcast(currentRoomId)
          ack?.({ ok: true })
        } catch (err) {
          ack?.({ ok: false, error: err.message })
        }
      }
    }

    function participant(action, lean = false) {
      return async (data, ack) => {
        if (!currentRoomId || !currentName) {
          ack?.({ ok: false, error: 'Você não está em uma sala' })
          return
        }
        try {
          const seat = await validateToken(data?.authorization, currentRoomId, 'participant')
          const name = seat?.name || currentName
          const room = await action(currentRoomId, name, data)
          lean ? broadcastLean(currentRoomId) : broadcast(currentRoomId)
          ack?.({ ok: true })
        } catch (err) {
          ack?.({ ok: false, error: err.message })
        }
      }
    }

    socket.on('room:create', (payload, ack) => {
      const name = String(payload?.name || '').trim()
      const password = String(payload?.password || '')
      if (!name) {
        ack?.({ ok: false, error: 'Informe seu nome' })
        return
      }
      rooms
        .createRoom(name, password, socket.id)
        .then((room) => {
          const { room: r, hostToken } = room
          enterRoom(r.id, name)
          socket.emit('room:created', {
            roomId: r.id,
            code: r.code,
            hostName: name,
            name,
            hostToken,
          })
          ack?.({ ok: true, roomId: r.id, code: r.code, hostName: name, name, hostToken })
        })
        .catch((err) => ack?.({ ok: false, error: err.message }))
    })

    socket.on('room:join', (payload, ack) => {
      const code = String(payload?.code || '').trim().toUpperCase()
      const name = String(payload?.name || '').trim()
      if (!code || !name) {
        ack?.({ ok: false, error: 'Informe o código e seu nome' })
        return
      }
      rooms
        .joinRoom(code, name, socket.id)
        .then(({ room, participantToken }) => {
          const participant = rooms.findParticipant(room, name)
          const canonicalName = participant ? participant.name : name
          enterRoom(room.id, canonicalName)
          ack?.({
            ok: true,
            roomId: room.id,
            hostName: room.hostName,
            name: canonicalName,
            participantToken,
          })
        })
        .catch((err) => ack?.({ ok: false, error: err.message }))
    })

    socket.on('room:authenticate', (payload, ack) => {
      const name = String(payload?.name || '')
      const password = String(payload?.password || '')
      if (!name.trim()) {
        ack?.({ ok: false, error: 'Informe seu nome' })
        return
      }
      rooms
        .authenticate(currentRoomId, name, password)
        .then((res) => {
          ack?.({ ok: true, roomId: res.roomId, hostToken: res.hostToken })
        })
        .catch((err) => ack?.({ ok: false, error: err.message }))
    })

    socket.on('room:leave', (_payload, ack) => {
      if (currentRoomId) {
        rooms.leaveRoom(currentRoomId, socket.id)
        socket.leave(currentRoomId)
        broadcast(currentRoomId)
      }
      currentRoomId = null
      currentName = null
      ack?.({ ok: true })
    })

    socket.on('story:add', requireHost((roomId, name, data) => rooms.addStory(roomId, name, data)))
    socket.on('story:remove', requireHost((roomId, name, data) =>
      rooms.removeStory(roomId, name, data.storyId),
    ))
    socket.on('round:start', requireHost((roomId, name, data) =>
      rooms.startRound(roomId, name, data.storyId),
    ))
    socket.on('round:cancel', requireHost((roomId, name) => rooms.cancelRound(roomId, name)))
    socket.on('round:consensus', requireHost((roomId, name, data) =>
      rooms.consensus(roomId, name, data.value),
    ))
    socket.on('session:finish', requireHost((roomId, name) => rooms.finishSession(roomId, name)))
    socket.on('host:transfer', requireHost((roomId, name, data) =>
      rooms.transferHost(roomId, name, data.targetName),
    ))
    socket.on('round:select', participant((roomId, name, data) =>
      rooms.selectCard(roomId, name, data.value),
      true,
    ))

    socket.on('round:reveal', requireHost((roomId, name) => rooms.revealRound(roomId, name), true))

    socket.on('disconnect', () => {
      if (currentRoomId) {
        rooms.leaveRoom(currentRoomId, socket.id)
        broadcast(currentRoomId)
      }
      currentRoomId = null
      currentName = null
    })
  })

  return io
}
