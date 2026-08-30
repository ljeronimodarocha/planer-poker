# Plano — Segurança do transfer de host (revogação + emissão de token)

Status: ✅ concluído

## Resumo

Hoje a checagem de host no servidor é dupla: token de role `'host'` (socket.js via `requireHostToken`) + nome (`assertHost`). O nome não é secreto (qualquer participante vê a lista), então o risco real está nos tokens:

- `transferHost` **não emite novo token** — o token do host antigo continua válido no banco por até 24h (TTL da sessão).
- Todo participante que autenticou com a senha (`room:authenticate`) carrega um **token de host válido** vinculado ao `hostName` do momento; só a checagem por nome os limita após o transfer.
- Após o transfer, o **novo host não tem token de host** no cliente: ele só tem token `'participant'`. Com a mudança de `ui-responsavel-e-permissoes` (esconder o controle "Entrar como responsável" quando `isHost`), o novo host fica sem forma de obter o token via UI — ações de host retornam "Acesso restrito ao responsável pela sala".

Objetivo: tornar o **token a fonte única de verdade** — no transfer, revogar todas as sessões com role `'host'` da sala e emitir um novo para o alvo, entregue diretamente ao socket do alvo.

---

## Mudança 1 — server/src/rooms.js:330 — `transferHost` revoga tokens e emite novo

```js
export async function transferHost(roomId, actorName, targetName) {
  const room = requireRoom(roomId)
  assertHost(room, actorName)
  const target = findParticipant(room, targetName)
  if (!target) throw new RoomError('Partipante não encontrado')
  room.hostName = target.name
  await prisma.room.update({
    where: { id: roomId },
    data: { hostName: target.name },
  })
  await prisma.session.deleteMany({ where: { roomName: roomId, role: 'host' } })
  const hostToken = await issueToken(roomId, target.name, target.socketId, 'host')
  await prisma.audit.create({
    data: { roomName: roomId, actor: actorName, action: 'host:transfer' },
  })
  return { room, hostToken }
}
```

- `deleteMany` revoga o token do ator e de qualquer participante que tivesse autenticado com a senha.
- Atenção ao schema: o campo `Session.roomName` referencia `Room.id` (server/prisma/schema.prisma:23–33) — não é o code.
- O retorno muda de `room` para `{ room, hostToken }`.

### Caso extremo

- `target.socketId === null` (fantasma, race raro): o token é emitido no banco mas ninguém recebe via socket; o alvo se autentica com a senha quando conectar.
- Token do ator revogado **durante** o handler: ok, pois `requireHostToken` já validou antes de chamar a ação.

---

## Mudança 2 — server/src/socket.js:176 — entregar o novo token ao socket do alvo

```js
socket.on('host:transfer', requireHost(async (roomId, name, data) => {
  const { room, hostToken } = await rooms.transferHost(roomId, name, data.targetName)
  const target = rooms.findParticipant(room, data.targetName)
  if (target?.socketId) io.to(target.socketId).emit('host:token', { hostToken })
  return room
}))
```

- `io.to(socketId).emit(...)` funciona porque cada socket é membro de um "room" com o próprio id (socket.io).
- O wrapper `requireHost` continua fazendo `broadcast` + ack normalmente.

---

## Mudança 3 — client/src/App.tsx:21–51 — ouvir `host:token` e atualizar o estado do token

```ts
const onHostToken = ({ hostToken }: { hostToken: string }) => setToken(hostToken)
socket.on('host:token', onHostToken)
// no cleanup: socket.off('host:token', onHostToken)
```

- O `Room.tsx` não precisa mudar: `isHost = room.hostName === me` já atualiza via broadcast de `room:state`, e o token novo chega pelo estado do App.

---

## Mudança 4 — server/test/rooms.test.js:251 — atualizar testes do `transferHost`

- Sucesso: `const result = await rooms.transferHost(room.id, 'Host', 'Ana')` → `result.room.hostName === 'Ana'`; assertar que existe exatamente 1 sessão `role: 'host'` para a sala e que pertence a Ana (`prisma.session.findMany({ where: { roomName: room.id, role: 'host' } })`).
- Revogação: o `hostToken` original do seed não existe mais no banco após o transfer (`prisma.session.findUnique({ where: { token: hostToken } })` → null).
- (Opcional) Teste de socket em server/test/socket.test.js: fluxo create → join → transfer → alvo recebe evento `host:token` com novo token e consegue `story:add`.

---

## Arquivos

- `server/src/rooms.js`
- `server/src/socket.js`
- `client/src/App.tsx`
- `server/test/rooms.test.js` (e opcionalmente `server/test/socket.test.js`)

---

## Verificação

- [x] `npm test` → todos os testes passam (44/44, incluindo novo teste de socket: transfer → `host:token` → 2ª transferência ok)
- [ ] Manual: dono transfere para participante → participante consegue iniciar rodada/consenso sem reautenticar; ex-dono com token antigo recebe "Apenas o responsável..." nas ações de host
- [ ] Manual: participante que tinha autenticado com a senha perde poderes de host após o transfer (precisa reautenticar)
- [ ] Manual: CSV export continua funcionando para o novo host
