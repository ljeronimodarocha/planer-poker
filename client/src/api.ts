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
