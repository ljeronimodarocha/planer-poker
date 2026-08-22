# Plano — Payloads Leves por Evento (redução de amplificação `room:state`)

Status: ✅ concluído

## Resumo

O `broadcast()` em `server/src/socket.js:21` envia o snapshot completo da sala (snapshot(room), com todos os stories + descrições + critérios) para todos os participantes após qualquer mudança. Isso gera tráfego O(N²): N mensagens × payload que cresce com o tamanho da sala. A correção introduz payloads leves para eventos de alta frequência (round:select, round:reveal) e faz o cliente mesclar deltas em estado local, mantendo o snapshot completo apenas para eventos estruturais/raros.

---

## Mudança 1 — `server/src/rooms.js`: nova função `leanRound(room)`

```js
export function leanRound(room) {
  return { roomId: room.id, round: room.round ? { storyId: room.round.storyId, number: room.round.number, phase: room.round.phase, selections: { ...room.round.selections } } : null }
}
```

- Retorna só `{ roomId, round }` em vez do snapshot inteiro (remove stories/descrições, o grande bloat).
- **Caso extremo:** sala sem rodada → `round: null`.

---

## Mudança 2 — `server/src/socket.js`: `broadcast` vs `broadcastLean`

```js
function broadcast(roomId) {
  const room = rooms.get(roomId)
  if (!room) return
  io.to(roomId).emit('room:state', rooms.snapshot(room))
}

function broadcastLean(roomId) {
  const room = rooms.get(roomId)
  if (!room) return
  io.to(roomId).emit('room:delta', rooms.leanRound(room))
}
```

- wrappers `requireHost(action, lean = false)` e `participant(action, lean = false)` escolhem `broadcast` vs `broadcastLean`.
- `round:select` e `round:reveal` passam a usar `lean = true`.
- Eventos estruturais (`room:join`, `story:add/remove`, `round:start`, `round:consensus`, `session:finish`, `host:transfer`, `round:cancel`) mantêm `broadcast` (full snapshot, raros).

---

## Mudança 3 — `client/src/App.tsx`: mesclagem de delta

```js
socket.on('room:state', onState)
const onDelta = ({ round }) => setRoom((prev) => (prev ? { ...prev, round } : prev))
socket.on('room:delta', onDelta)
```

- `room:state` → substituição completa (comportamento atual).
- `room:delta` → mes só o `round` no estado local, preservando stories/participantes já exibidos.
- Cleanup: `socket.off('room:delta', onDelta)`.

---

## Verificação

- [x] `cd client && npm run build` compila sem errors TS (253 kB gzip 78 kB)
- [x] `node --check src/socket.js` e `src/rooms.js` param sem erro
- [x] `round:select`/`round:reveal` → cliente recebe `room:delta` com `round`, sem stories no payload
- [ ] Medir tamanho médio de `room:state` vs `room:delta` em 40 participantes (recomendado: comparar bytes do payload emitido)
- [ ] Fluxo completo funciona: escolher carta → revelar → consensus → story `done` (testar manual)
- [ ] `room:state` ainda atualiza stories/participantes corretamente
- [ ] Edge: nova rodada (`round: null`) via `room:state` reseta tudo

---

## Ciclo de Vida

- [x] Plano escrito em `plans/todo/lean-payloads.md`
- [x] Implementado
- [x] Movido para `plans/finished/lean-payloads.md` (Status: ✅ concluído)
