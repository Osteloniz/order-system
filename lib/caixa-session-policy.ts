export const CAIXA_COOKIE = 'brookie-caixa'
export const CAIXA_IDLE_MS = 15 * 60_000
export const CAIXA_SHIFT_MS = 8 * 60 * 60_000

export function caixaSessionWindow(now: Date, session: { expiraEm: Date; atividadeEm: Date }) {
  return now < session.expiraEm && now.getTime() - session.atividadeEm.getTime() < CAIXA_IDLE_MS
}
