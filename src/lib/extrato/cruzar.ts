import type { MovimentoClassificado } from './classificar'

/** Um registo já existente na app, reduzido ao que o cruzamento precisa. */
export interface RegistoApp {
  id: string
  data: string
  valor: number
  origem: 'despesa' | 'aporte'
}

export interface Cruzamento {
  conferidos: { movimento: MovimentoClassificado; registoId: string }[]
  emFalta: MovimentoClassificado[]
  soNaApp: RegistoApp[]
  ambiguos: { movimento: MovimentoClassificado; candidatos: RegistoApp[] }[]
}

const TOLERANCIA = 0.005
/** A data de lançamento pode vir depois da compra, por isso não se exige igualdade. */
const JANELA_DIAS = 3

const diasEntre = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000

/**
 * Cruza o extrato com o que já está registado. Cada registo da app só pode
 * corresponder a um movimento e vice-versa. Em caso de empate de distância, o
 * movimento vai para "ambíguo" em vez de se escolher um candidato à sorte.
 */
export function cruzar(
  classificados: MovimentoClassificado[],
  registos: RegistoApp[],
): Cruzamento {
  const porUsar = new Set(registos.map((r) => r.id))
  const cruzamento: Cruzamento = { conferidos: [], emFalta: [], soNaApp: [], ambiguos: [] }

  for (const c of classificados) {
    const candidatos = registos
      .filter((r) => porUsar.has(r.id))
      .filter((r) => Math.abs(r.valor - c.movimento.valor) < TOLERANCIA)
      .filter((r) => diasEntre(r.data, c.movimento.data) <= JANELA_DIAS)
      .sort((a, b) => diasEntre(a.data, c.movimento.data) - diasEntre(b.data, c.movimento.data))

    if (candidatos.length === 0) {
      cruzamento.emFalta.push(c)
      continue
    }

    const maisPerto = diasEntre(candidatos[0].data, c.movimento.data)
    const empatados = candidatos.filter((r) => diasEntre(r.data, c.movimento.data) === maisPerto)

    if (empatados.length > 1) {
      // Escolher um à sorte seria pior do que perguntar: ambos ficam retidos até
      // o utilizador decidir qual corresponde.
      cruzamento.ambiguos.push({ movimento: c, candidatos: empatados })
      for (const e of empatados) porUsar.delete(e.id)
      continue
    }

    cruzamento.conferidos.push({ movimento: c, registoId: candidatos[0].id })
    porUsar.delete(candidatos[0].id)
  }

  cruzamento.soNaApp = registos.filter((r) => porUsar.has(r.id))
  return cruzamento
}
