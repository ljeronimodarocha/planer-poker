# Plano — Detecção de Conexão + Transferência Automática de Host

Status: ✅ concluído

## Resumo

Antes desta mudança, quando o host (owner) da sala caía, ele era apenas **removido** da sala e `room.hostName` permanecia apontando para o nome antigo. Consequência: nenhum participante conseguia ações de host (`assertHost` rejita todos) e a sala ficava **travada**. Além disso, não existía nenhum mecanismo de verificação de conexão — só o evento `disconnect` reativo.

Esta implementação:
1. Adiciona **ping/pong nativo** do Socket.IO (`pingInterval`/`pingTimeout`) para detectar meio-abertos.
2. Transferir o **host automaticamente** para o participante **online mais antigo** quando o host atual disconnecta.

---

## Mudança 1 — Ping/pong nativo (`server/src/socket.js:6`)

```js
const io = new Server({ path: '/realtime', pingInterval: 5000, pingTimeout: 10000 })
```

- `pingInterval: 5000` — ms entre pings.
- `pingTimeout: 10000` — ms antes de declarar desconectado (sempre `> pingInterval`).
- Quando o ping não responde, o Socket.IO fecha o socket e dispara `disconnect` (razão `heartbeat timeout`).

## Mudança 2 — Transferência de host ao caer (`server/src/rooms.js:leaveRoom`)

Em `leaveRoom`, após remover um participante que **era o host**, transfira `room.hostName` para o participante **online mais antigo** (por `joinedAt`), via helper `resolveHostRoomParticipants`:

```js
if (removed.name.toLowerCase() === room.hostName.toLowerCase()) {
  room.hostName = resolveHostRoomParticipants(participants)
}

function resolveHostRoomParticipants(participants) {
  const active = participants
    .filter((p) => p.socketId !== null)
    .sort((a, b) => a.joinedAt - b.joinedAt)
  return active.length ? active[0].name : null
}
```

O `broadcast(roomId)` do handler de `disconnect` (`socket.js`) propaga o novo `hostName` para o cliente automaticamente — sem necessidade de change no frontend.

### Caso extremo
Sem participantes online → `hostName` mantém-se (nada melhor a fazer), evitando quebra em `assertHost`.

---

## Verificação

- [x] `node --check` em `server/src/socket.js` e `server/src/rooms.js` — ambos OK
- [x] Transferência de host: host disconnecta → hostName passa ao participante online mais antigo
- [x] Nova host consegue ações de host (addStory / startRound / consensus)
- [x] Leave explícito do host transfere também (consistente)
- [x] Sem referência de UI ao host — atualizado via `room:state`
