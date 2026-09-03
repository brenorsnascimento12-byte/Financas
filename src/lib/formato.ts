const euros = new Intl.NumberFormat('pt-PT', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
})

const percentagem = new Intl.NumberFormat('pt-PT', {
  style: 'percent',
  maximumFractionDigits: 1,
})

export const eur = (v: number) => euros.format(Math.round(v))
export const pct = (v: number) => percentagem.format(v)

/** ISO (2026-08-31) para o formato de cá (31/08/2026). */
export const dataCurta = (iso: string) =>
  `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`

const reais = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  maximumFractionDigits: 0,
})

/** A reserva em reais é mostrada na sua própria moeda: converter só criaria ruído. */
export const brlFmt = (v: number) => reais.format(Math.round(v))
