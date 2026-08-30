# Plano — Exportação CSV com header Authorization via download por fetch

Status: ✅ concluído

## Resumo

A exportação CSV falhava com `401 "Acesso negado à sala"` porque o frontend disparava
a requisição como **navegação de navegador** (`window.location.href`), que **não pode**
attachar o header `Authorization`. Assim, `req.headers.authorization` sempre vinva `undefined`
e o handler de `server/src/routes.js` retornava `401` antes mesmo de validar o token.

**Correção:** trocar a navegação por um `fetch()` que envia `Authorization: Bearer <token>`
(token armazenado no estado do React) e gera o download a partir do `blob` respondido.
Isso preserva o modelo de autenticação (só host com token válida exporta) e funciona no browser.

---

## Mudança 1 — `client/src/api.ts` — download via fetch + blob

```typescript
export async function downloadCsv(id: string, code: string, token: string | null): Promise<void> {
  const res = await fetch(`/api/rooms/${id}/export.csv`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error((body && body.error) || 'Erro ao exportar CSV')
  }
  const blob = await res.blob()
  const url = window.URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `planning-poker-${code}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.URL.revokeObjectURL(url)
}
```

- `token` é o token de host (ou participant) armazenado em `App.tsx`; sem token → header ausente → `401`.
- **Caso extremo:** resposta com status != 200 lança erro com a mensagem do envelope (`body.error`), que o client exibe.
- O nome do arquivo usa `room.code` (disponível no client), igual ao `content-disposition` do backend.

---

## Mudança 2 — `client/src/screens/Room.tsx` — chamar downloadCsv com token e tratar erro

- Importar `downloadCsv` de `../api`.
- `SummaryView` passa a aceitar `token: string | null` e `onError: (msg: string) => void`.
- Botão "⬇ Exportar CSV" passa a chamar `await downloadCsv(room.roomId, room.code, token)` dentro de `try/catch`, invocando `onError` em falha.
- Passar `token` e `onError={showNotice}` em **ambos** os `<SummaryView>` (ambas as renderizações: resumo final e view 'summary').

---

## Arquivos afetados

| Arquivo | Alteração |
|---|---|
| `client/src/api.ts` | `downloadCsv(id, code, token)` via `fetch` + blob download |
| `client/src/screens/Room.tsx` | Passar `token`/`onError` ao `SummaryView`;按钮 exporta via `downloadCsv` |

---

## Verificação

- [x] `cd client && npm run build` compila sem errors TS (vite build ok)
- [ ] Host: Resumo → Exportar CSV gera download `.csv` válido (200 + `text/csv`) — teste manual em runtime
- [ ] Sem/inválido token → notice "Acesso negado à sala"
- [ ] `GET /api/rooms/:id/export.csv` sem header → `401`; com `Authorization: Bearer <hostToken>` → `text/csv`
