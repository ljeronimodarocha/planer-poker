# Plano — Corrigir `rooms.get is not a function` ao criar sala

Status: ✅ concluído

## Resumo

Após implementar o `lean-payloads.md`, ao criar uma sala o socket retorna `rooms.get is not a function`.

**Causa raiz:** `server/src/socket.js` importa `import * as rooms from './rooms.js'` (namespace). As funções `broadcast` e `broadcastLean` (linhas 22 e 28) chamam `rooms.get(roomId)`, porém `rooms.js` **não exporta** `get` — a função existe como `getRoom` (rooms.js:59). Logo `rooms.get` é `undefined`, e chamar `undefined(...)` levanta o erro.

A alteração do lean-payloads trocou `getRoom(...)` por `rooms.get(...)`, introduzindo o bug.

---

## Correção — `server/src/socket.js`

1. Adicionar `getRoom` ao import (linha 3) e usá-lo em vez de `rooms.get`.

```js
// Antes (quebrado)
import { requireHostToken, validateToken } from './rooms.js'
// ...
function broadcast(roomId) {
  const room = rooms.get(roomId)   // ❌ rooms.get não existe
  if (!room) return
  ...
}
```

```js
// Depois (corrigido)
import { requireHostToken, validateToken, getRoom } from './rooms.js'
// ...
function broadcast(roomId) {
  const room = getRoom(roomId)      // ✅ getRoom existe
  if (!room) return
  ...
}
```

- Trocar `rooms.get(roomId)` por `getRoom(roomId)` também em `broadcastLean` (linha 28).
- `rooms.snapshot` e `rooms.leanRound` permanecem válidos (existem como exports).

### Caso extremo

- Nenhuma outra função do rooms é chamada via namespace com nome incorreto; apenas `broadcast`/`broadcastLean` usam `get`.

---

## Verificação

- [x] `node --check src/socket.js` passa sem erro de sintaxe
- [ ] Criar sala via socket (`room:create`) retorna `roomId`/`code` sem lançar erro
- [ ] Membro entra na sala (`room:join`) e recebe `room:state`
- [ ] Fluxo completa funciona: escolher carta → revelar → consensus → story `done`
- [ ] `GET /api/rooms/:id/export.csv` retorna CSV

---

## Ciclo de Vida

- [x] Plano escrito em `plans/todo/fix-rooms-get.md`
- [x] Implementado
- [x] Movido para `plans/finished/fix-rooms-get.md` (Status: ✅ concluído)
