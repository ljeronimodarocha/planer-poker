export function downloadCsv(id: string) {
  window.location.href = `/api/rooms/${id}/export.csv`
}
