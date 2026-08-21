# Plano — Remover Histórico + Transferir Responsável da Sala

Status: ✅ concluído

## Resumo

Duas funcionalidades:
1. **Remover a página de histórico** (motivo: não é adequado outras pessoas visualizarem o histórico de outras salas). Remoção completa de UI + rotas do backend.
2. **Transferir o responsável (owner) da sala** em tempo real. O backend já dá suporte (`host:transfer` + `transferHost`); falta expor na UI.

---

## Feature 1 — Remover histórico

**Escopo (UI + rotas do backend):**

- `client/src/screens/History.tsx` → **remover arquivo**
- `client/src/App.tsx` → remover `import History`, remove `'history'` do union `view`, remove `handleHistory()`, remove o `if (view === 'history')` branch
- `client/src/screens/Home.tsx` → remover botão "Histórico de sessões" e a prop `onHistory`
- `client/src/screens/Room.tsx` → remover botão "Ver histórico" (SummaryView), remover prop `onExit`
- `client/src/api.ts` → remover `fetchRooms`, `fetchRoomDetail` (manter `downloadCsv`)
- `client/src/types.ts` → remover `SavedRoom`, `SavedRoomDetail`, `SavedStory`, `SavedRound`, `SavedEstimate`
- `server/src/routes.js` → remover `GET /api/rooms` e `GET /api/rooms/:id` (manter `export.csv`)

**O que NÃO muda:** `/api/rooms/:id/export.csv` permanece (export por ID direto).

---

## Feature 2 — Transferir responsável (owner)

**Backend:** sem alterações necessárias — `host:transfer` (socket.js:107) + `transferHost` (rooms.js:265) já existem.

**UI (`client/src/screens/Room.tsx`):**
- Controle visível **só para o host** e **som quando não há rodada em andamento** (`room.round === null`).
- Um `<select>` com os nomes dos participantes + botão "Transferir responsabilidade".
- Botão **desabilitado** quando o nome selecionado é igual ao `hostName` atual.
- Emite `host:transfer` com `{ targetName }`; exibe notice em caso de erro.
- O host anterior continua como participante regular (não sai da sala).

---

## Verificação

- [x] `node --check` nos arquivos do server (rooms.js, socket.js, routes.js) — todos OK
- [x] `tsc --noEmit -p client/tsconfig.json` (via `npx -p typescript tsc`) — sem erros
- [x] Sem referências soltas: grep por `history`, `onHistory`, `SavedRoom`, `onExit`, `fetchRooms`, `fetchRoomDetail` — limpo
- [x] Sem `GET /api/rooms` nem `GET /api/rooms/:id` nas rotas; `export.csv` ainda funciona
- [x] UX: host vê "Transferir responsabilidade" só sem rodada; transferencia altera `hostName`/coroa
- [x] Botão de histórico removido do Home e do resumo da sessão
- [x] `npm run build` (vite build) — sucesso
