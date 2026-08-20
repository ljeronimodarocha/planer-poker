# Plano de Correção de Bugs

Status: `🔴 pendente` | `🟡 em andamento` | `✅ resolvido`

## Resumo

Análise do código (server/src/rooms.js, socket.js, routes.js + client/src) identificou 9 bugs.
O mais crítico é o BUG 1: stories nunca são persistidos no SQLite, o que faz o consenso
sempre falhar e o histórico/CSV saírem vazios.

---

## BUG 1 🔴 — Stories nunca persistidos (consenso sempre falha)

**Status: ✅ resolvido**

- `addStory` (rooms.js:124) só empurrava o story em memória — nunca `prisma.story.create`.
- `consensus` (rooms.js:209) roda `prisma.round.create({ storyId })` → foreign key inexistente (P2003);
  e o `prisma.story.update` (rooms.js:222) falharia com P2025.
- `finishSession` só gravava `finishedAt` → sessão encerrada aparecia `0/0 stories` no histórico e CSV vazio.
- `removeStory` não persistia a remoção → story excluído reapareceria no histórico.

**Correção:**
- `addStory`: `prisma.story.create` com `roomId` antes de empurrar em memória.
- `removeStory`: `prisma.story.delete` (rodadas/estimativas caem por `onDelete: Cascade`).
- `consensus`/`finishSession` passam a funcionar porque o registro existe.

**Arquivos:** `server/src/rooms.js`

---

## BUG 2 🔴 — Host nunca sai de `participants`

**Status: ✅ resolvido**

- `createRoom` cria o participante host com `socketId: null` e o handler `room:create` nunca
  atualiza o `socketId` do host para `socket.id`.
- `leaveRoom` localiza por `p.socketId === socketId` → o host nunca é removido:
  - "fantasma" do host aparece online após o disconnect;
  - a sala nunca chega a `participants.length === 0` → nunca é descartada do `Map` (vazamento);
  - distorce "N online" e o `allSelected` do client.

**Correção:** `createRoom(hostName, socketId)` recebe o `socketId` do socket que criou a sala.

**Arquivos:** `server/src/rooms.js`, `server/src/socket.js`

---

## BUG 3 🔴 — `room:leave` emitido pelo client sem handler no server

**Status: ✅ resolvido**

- `App.tsx:75` emite `room:leave`; socket.js não registra o evento.
- Clicar em "Sair" só limpa o estado local: o socket continua na sala Socket.IO, o participante
  mantém `socketId` ativo e **bloqueia o auto-reveal** (rooms.js:176 exige todos os conectados).

**Correção:** handler `room:leave` → `leaveRoom` + `socket.leave(roomId)` + limpar `currentRoomId` +
ack de confirmação. Além disso, `leaveRoom` re-avalia a condição de auto-reveal quando o
participante sai no meio de uma rodada (senão a rodada ficaria travada sem revelar).

**Arquivos:** `server/src/socket.js`, `server/src/rooms.js`

---

## BUG 4 🟠 — Case-sensitivity inconsistente nos nomes

**Status: ✅ resolvido**

- AGENTS.md: nomes são case-insensitive; `joinRoom` usa `toLowerCase()`.
- Mas `selectCard` (rooms.js:169) e `assertHost` (rooms.js:244) comparam exatos.
- Host "Lucas" agindo como "lucas" perde poderes de host e não consegue eleger carta.
- Client: `round.selections[me]` (Room.tsx:335) e `isHost` (Room.tsx:14) também quebram com case diferente.

**Correção:**
- Helper `findParticipant(room, name)` case-insensitive; usado em `selectCard`, `transferHost`, `joinRoom`.
- `assertHost` compara com `toLowerCase()`.
- Seleções keyadas pelo nome canônico do participante.
- `joinRoom` normaliza o nome do host que reconecta com case diferente (preserva o `hostName` original).
- Acks de `room:join`/`room:create` retornam o nome canônico; client atualiza `me` com ele.

**Arquivos:** `server/src/rooms.js`, `server/src/socket.js`, `client/src/App.tsx`

---

## BUG 5 🟠 — Socket não sai da sala anterior ao entrar em outra

**Status: ✅ resolvido**

- `enterRoom` (socket.js:18) faz `socket.join(roomId)` sem `socket.leave()` da sala anterior.
- Usuário que cria/entra em outra sala sem desconectar recebe `room:state` de ambas;
  o handler em App.tsx:21 sobrescreve o estado e força `setView('room')` → sala errada na tela.
  Também puxa o usuário de volta da view `history` para `room`.

**Correção:** `enterRoom` faz `socket.leave(previousRoomId)` antes de `join`.

**Arquivos:** `server/src/socket.js`

---

## BUG 6 🟡 — `consensus` não valida o valor

**Status: ✅ resolvido**

- rooms.js:198 aceita qualquer `value` (ex.: `7`); falta o check `CARD_VALUES.includes(value)`
  que existe em `selectCard` (rooms.js:174). O client bloqueia, mas a API aceita.

**Correção:** validar `CARD_VALUES.includes(value)` em `consensus`.

**Arquivos:** `server/src/rooms.js`

---

## BUG 7 🟡 — Colisão de nomes gera sockets órfãos

**Status: ✅ resolvido**

- `joinRoom` (rooms.js:96-99): se já existe participante com o mesmo nome (case-insensitive)
  e `socketId !== null` (conectado), o novo socket entra na sala mas nunca é mapeado;
  quando o socket original disconnectar, `leaveRoom` remove o participante e o segundo usuário fica órfão.

**Correção:** `joinRoom` recusa com `RoomError('Nome já em uso nesta sala')` quando
`existing.socketId !== null`.

**Arquivos:** `server/src/rooms.js`

---

## BUG 8 🔴 — `fetchRoomDetail` não importado no History (crash ao abrir sessão)

**Status: ✅ resolvido**

- `History.tsx:22` chama `fetchRoomDetail(id)` mas só importava `fetchRooms` de `../api`.
- Ao clicar em uma sessão no histórico, `ReferenceError: fetchRoomDetail is not defined`
  (crash de runtime); a função já existe em `api.ts` e está exportada.
- Corrigido: `import { fetchRooms, fetchRoomDetail } from '../api'`.
- Bônus: removida a função morta `reset()` em `Home.tsx` (flagrada pelo `noUnusedLocals` do tsc;
  o estado é descartado naturalmente quando o componente desmonta ao trocar de view).

**Arquivos:** `client/src/screens/History.tsx`, `client/src/screens/Home.tsx`

---

## BUG 9 🔴 — Export CSV quebrado (500 + resposta JSON em vez de CSV)

**Status: ✅ resolvido**

Descoberto durante o teste de integração:

- O handler `/api/rooms/:id/export.csv` (routes.js) não incluía `estimates` no `include` de
  `rounds` → `round.estimates` era `undefined` → `500 "round.estimates is not iterable"` em
  qualquer sala com rodada persistida.
- O handler retornava `{ status, headers, body }` como objeto — o Fastify envia isso como JSON
  (não interpreta esse formato, que é estilo Hapi) → o download virava um arquivo `.json` com
  o envelope em vez do CSV.

**Correção:** incluir `estimates: true` no include de rounds; usar `reply.status(404)`,
`reply.header(...)` e `reply.send(csv)`.

**Arquivos:** `server/src/routes.js`

---

## Verificação final

- [x] `node --check` em todos os arquivos do server
- [x] `tsc --noEmit` no client (via `npx -y -p typescript tsc --noEmit -p client/tsconfig.json`)
- [x] Fluxo completo em teste de integração (socket.io): criar sala → adicionar story → iniciar
      rodada → eleger → auto-reveal → consenso (válido + inválido) → finish
- [x] Histórico e CSV populados após finish (2 stories, rodada com 2 estimates, consenso 5)
- [x] Disconnect/reconnect do host (nome case-insensitive) e de membros (sem fantasma)
- [x] `room:leave` remove participante e libera o auto-reveal
- [x] Join com nome duplicado é recusado; trocar de sala remove da sala anterior

> Teste de integração executado contra servidor isolado (porta 3199, banco temporário);
> 45 asserções, todas passaram. Script descartado após a verificação.
