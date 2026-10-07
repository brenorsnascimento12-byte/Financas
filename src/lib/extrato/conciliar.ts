import type { MovimentoClassificado } from './classificar'
import type { Cruzamento } from './cruzar'

export interface Conciliacao {
  /** Tudo o que saiu da conta no extrato, comissões incluídas. */
  saidasExtrato: number
  entradasExtrato: number
  /** Saídas que bateram certo com um registo da app. */
  conferido: number
  /** Saídas sem registo na app, à espera de decisão. */
  emFalta: number
  /** Saídas que mandaste silenciar em importações anteriores. */
  ignorado: number
  /** Despesas da app no período sem linha correspondente no extrato. */
  soNaApp: number
  /** O que sobra depois de repartir as saídas. Zero é o que se quer. */
  diferenca: number
  bate: boolean
}

/** Metade do cêntimo: abaixo disto é arredondamento. */
const TOLERANCIA = 0.005

/** O movimento mais as comissões que lhe ficaram anexadas. */
const valorTotal = (c: MovimentoClassificado) =>
  c.movimento.valor + c.comissoes.reduce((s, x) => s + x.valor, 0)

const somar = (itens: MovimentoClassificado[]) => itens.reduce((s, c) => s + valorTotal(c), 0)

/**
 * Conta de controlo ao euro: toda a saída do extrato tem de estar num dos três
 * sítios — conferida, à espera de decisão, ou silenciada. Se sobrar alguma coisa,
 * o cruzamento perdeu uma linha, e isso é precisamente o que não se quer
 * descobrir só daqui a três meses.
 */
export function conciliar(
  todos: MovimentoClassificado[],
  silenciadosIds: string[],
  cruzamento: Cruzamento,
): Conciliacao {
  const saidas = todos.filter((c) => c.movimento.sinal === 'debito')
  const entradas = todos.filter((c) => c.movimento.sinal === 'credito')

  const saidasExtrato = somar(saidas)
  const entradasExtrato = entradas.reduce((s, c) => s + c.movimento.valor, 0)

  const silenciados = new Set(silenciadosIds)
  const conferido = somar(
    cruzamento.conferidos
      .map((x) => x.movimento)
      .filter((c) => c.movimento.sinal === 'debito'),
  )
  const emFalta = somar(cruzamento.emFalta.filter((c) => c.movimento.sinal === 'debito'))
  const ignorado = somar(saidas.filter((c) => silenciados.has(c.movimento.id)))
  const ambiguo = somar(cruzamento.ambiguos.map((a) => a.movimento))

  const diferenca = saidasExtrato - conferido - emFalta - ignorado - ambiguo

  return {
    saidasExtrato,
    entradasExtrato,
    conferido,
    emFalta,
    ignorado,
    soNaApp: cruzamento.soNaApp.reduce((s, r) => s + r.valor, 0),
    diferenca: Math.abs(diferenca) < TOLERANCIA ? 0 : diferenca,
    bate: Math.abs(diferenca) < TOLERANCIA,
  }
}
