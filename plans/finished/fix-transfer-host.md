# Plano — Fix transferHost validando nome como token

Status: ✅ concluído

## Resumo

Ao clicar em "Transferir responsabilidade", a sala retornava sempre o erro "Acesso restrito ao responsável pela sala". Causa: `transferHost` em `server/src/rooms.js` validava seu segundo argumento com `validateToken(actorName, roomId, 'host')`, mas a camada de socket (`requireHost` em `socket.js`) passa o **nome** do participante — e `validateToken` exige string com ≥ 16 chars (token aleatório), então qualquer nome real falhava. Todas as demais ações host (`addStory`, `startRound`, `consensus` etc.) usam `assertHost(room, actorName)`; a validação do token já é feita no socket via `requireHostToken(data.authorization, roomId)`.

---

## Mudança 1 — server/src/rooms.js:330 — transferHost usa assertHost

```js
export async function transferHost(roomId, actorName, targetName) {
  const room = requireRoom(roomId)
  assertHost(room, actorName)
  const target = findParticipant(room, targetName)
  ...
  await prisma.audit.create({
    data: { roomName: roomId, actor: actorName, action: 'host:transfer' },
  })
```

Antes:

```js
  const seat = await validateToken(actorName, roomId, 'host')
  if (!seat) throw new RoomError('Acesso restrito ao responsável pela sala')
  assertHost(room, seat.name)
  ...
  data: { roomName: roomId, actor: seat.name, action: 'host:transfer' },
```

### Caso extremo

- Token de host válido mas `hostName` já transferido (token antigo): `assertHost` falha com "Apenas o responsável pela sala pode fazer isso" — mesmo comportamento das demais ações.
- Participante autenticado com a senha correta (token de host emitido por `room:authenticate`): o nome no token é o `hostName` atual, então `assertHost` passa normalmente.

---

## Mudança 2 — server/test/rooms.test.js:251 — testes do transferHost passam nome

- `transferHost(room.id, 'Host', 'Ana')` → sucesso (antes: `hostToken`)
- `transferHost(room.id, 'Host', 'Zoe')` → "Partipante não encontrado" (antes: `hostToken`)
- Novo caso: `transferHost(room.id, 'Ana', 'Host')` → /Apenas o responsável/ (antes testava token de participant via role errada)

---

## Arquivos

- `server/src/rooms.js`
- `server/test/rooms.test.js`

---

## Verificação

- [x] `npm test` → 43 testes passam, 0 falhas
- [ ] Manual: dono da sala seleciona outro participante e clica em "Transferir responsabilidade" → sem erro; badge "👑 <novo responsável>" atualizado para todos
