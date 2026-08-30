# Plano — UI do responsável e permissões de exportação

Status: ✅ concluído

## Resumo

Três alterações apenas no front (`client/src/screens/Room.tsx`):
1. Mostrar quem é o responsável da sala no cabeçalho (hoje só há o avatar destacado em verde, sem rótulo).
2. Desabilitar o botão "Exportar CSV" quando o usuário não tem permissão (nem dono da sala, nem autenticado com a senha).
3. Esconder o controle "Entrar como responsável" quando o usuário for o dono da sala ou já tiver entrado com a senha correta.

Nota: a sala tem um único responsável por vez (`room.hostName`), então será exibido esse nome.

---

## Mudança 1 — Room.tsx:96 — Exibir responsável no cabeçalho

```tsx
<span className="text-sm text-slate-400">{room.participants.length} online</span>
```

Adicionar logo após, um badge com o nome do responsável:

```tsx
<span
  className="rounded-full border border-emerald-800 bg-emerald-950/60 px-2 py-0.5 text-xs text-emerald-300"
  title="Responsável pela sala"
>
  👑 {room.hostName}
</span>
```

---

## Mudança 2 — Room.tsx:126 — Esconder "Entrar como responsável" para dono/autenticado

```tsx
{!authedAsHost && (
```

→

```tsx
{!isHost && !authedAsHost && (
```

Assim o controle de senha some quando `me === room.hostName` (dono) ou após autenticar com a senha correta (`authedAsHost`).

---

## Mudança 3 — Room.tsx:542–568 — Desabilitar "Exportar CSV" sem permissão

Os dois pontos de uso do `SummaryView` (L161 e L197) passam a receber `canExport`:

```tsx
<SummaryView room={room} token={token} canExport={isHost || authedAsHost} onError={showNotice} />
```

E no componente:

```tsx
function SummaryView({
  room,
  token,
  canExport,
  onError,
}: {
  room: RoomState
  token: string | null
  canExport: boolean
  onError: (msg: string) => void
}) {
```

No botão (L557–568):

```tsx
<button
  disabled={!canExport}
  title={canExport ? undefined : 'Somente o responsável pode exportar'}
  onClick={async () => { ... }}
  className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-40"
>
  ⬇ Exportar CSV
</button>
```

`canExport = isHost || authedAsHost` reflete a regra do servidor (token de host — o dono tem por padrão; participante autenticado com a senha recebe token de host via `room:authenticate`).

### Caso extremo

- Participante que autenticou com a senha correta e depois o host transfere a responsabilidade: `authedAsHost` permanece `true` na sessão do cliente (o token segue válido no servidor) — comportamento consistente.
- Sessão finalizada (`room.finished`, L160): o mesmo `canExport` se aplica, pois os estados `isHost`/`authedAsHost` continuam disponíveis no escopo do `Room`.

---

## Arquivos

- `client/src/screens/Room.tsx` (único arquivo alterado)

---

## Verificação

- [x] `npm run build` passa sem erros de TypeScript
- [ ] Manual: participante comum → badge "👑 <nome>" visível no cabeçalho; "Exportar CSV" desabilitado; "Entrar como responsável" visível
- [ ] Manual: dono da sala (`hostName`) → controle "Entrar como responsável" não aparece; "Exportar CSV" habilitado
- [ ] Manual: participante com senha correta → após autenticar, o controle some e "Exportar CSV" fica habilitado
