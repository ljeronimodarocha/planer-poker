import { Server } from 'socket.io'
import * as rooms from './rooms.js'

export function createSocketServer(fastifyServer) {
  const io = new Server({ path: '/realtime', pingInterval: 5000, pingTimeout: 10000 })
  io.attach(fastifyServer)

  function broadcast(roomId) {
    const room = rooms.getRoom(roomId)
    if (!room) return
    io.to(roomId).emit('room:state', rooms.snapshot(room))
  }

  io.on('connection', (socket) => {
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

    function handle(name) {
      return async (payload, ack) => {
        if (!currentRoomId || !currentName) {
          ack?.({ ok: false, error: 'Você não está em uma sala' })
          return
        }
        try {
          const room = await name(currentRoomId, currentName, payload)
          broadcast(currentRoomId)
          ack?.({ ok: true })
        } catch (err) {
          ack?.({ ok: false, error: err.message })
        }
      }
    }

    socket.on('room:create', (payload, ack) => {
      const name = String(payload?.name || '').trim()
      if (!name) {
        ack?.({ ok: false, error: 'Informe seu nome' })
        return
      }
      rooms
        .createRoom(name, socket.id)
        .then((room) => {
          enterRoom(room.id, name)
          socket.emit('room:created', { roomId: room.id, code: room.code, hostName: name, name })
          ack?.({ ok: true, roomId: room.id, code: room.code, hostName: name, name })
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
        .then((room) => {
          const participant = rooms.findParticipant(room, name)
          const canonicalName = participant ? participant.name : name
          enterRoom(room.id, canonicalName)
          ack?.({ ok: true, roomId: room.id, hostName: room.hostName, name: canonicalName })
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

    socket.on('story:add', handle((roomId, name, payload) => rooms.addStory(roomId, name, payload)))
    socket.on('story:remove', handle((roomId, name, payload) =>
      rooms.removeStory(roomId, name, payload.storyId),
    ))
    socket.on('round:start', handle((roomId, name, payload) =>
      rooms.startRound(roomId, name, payload.storyId),
    ))
    socket.on('round:select', handle((roomId, name, payload) =>
      rooms.selectCard(roomId, name, payload.value),
    ))
    socket.on('round:reveal', handle((roomId, name) => rooms.revealRound(roomId, name)))
    socket.on('round:cancel', handle((roomId, name) => rooms.cancelRound(roomId, name)))
    socket.on('round:consensus', handle((roomId, name, payload) =>
      rooms.consensus(roomId, name, payload.value),
    ))
    socket.on('session:finish', handle((roomId, name) => rooms.finishSession(roomId, name)))
    socket.on('host:transfer', handle((roomId, name, payload) =>
      rooms.transferHost(roomId, name, payload.targetName),
    ))

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
