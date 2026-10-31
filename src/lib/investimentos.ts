import type { Etf, Investimentos, Orcamento } from '../types'
import { ultimoSaldo } from './orcamento'

export interface LinhaPeso {
  etf: Etf
  valor: number
  /** Fração do total de ETFs, de 0 a 1. */
  peso: number
  /** Fração-alvo, de 0 a 1. */
  alvo: number
}

export interface Pesos {
  totalEtf: number
  linhas: LinhaPeso[]
  /** Fração dos temáticos no total de ETFs. */
  tematicos: number
  acimaDoTeto: boolean
  /** Valor do núcleo: global mais emergentes. */
  nucleo: number
  /** Fração dos emergentes dentro do núcleo. Null quando não há núcleo. */
  emergentesNucleo: number | null
  /** A mesma fração, como devia ser pelos pesos-alvo. */
  alvoEmergentes: number | null
  bandaEmergentes: 'abaixo' | 'dentro' | 'acima' | null
}

const somaAlvos = (etfs: Etf[], papeis: Etf['papel'][]) =>
  etfs.filter((e) => papeis.includes(e.papel)).reduce((s, e) => s + e.pesoAlvo, 0)

/** Fração-alvo dos emergentes dentro do núcleo: 11 de 90, não 11 de 100. */
export function alvoEmergentesNoNucleo({ etfs }: Investimentos): number | null {
  const nucleo = somaAlvos(etfs, ['global', 'emergentes'])
  if (nucleo <= 0) return null
  return somaAlvos(etfs, ['emergentes']) / nucleo
}

/**
 * Pesos da carteira na última fotografia, com as duas regras verificadas.
 *
 * Devolve null quando não há por onde os calcular: sem fotografias, ou com uma
 * fotografia anterior aos indicadores, que só guardava o total investido.
 * Distribuir esse total pelos pesos-alvo mostraria sempre tudo em cima do alvo.
 */
export function pesosCarteira(o: Orcamento): Pesos | null {
  const { etfs, tetoTematicos, emergentesMin, emergentesMax } = o.investimentos
  const saldo = ultimoSaldo(o)
  if (!saldo?.carteira) return null

  const carteira = saldo.carteira
  const valorDe = (e: Etf) => carteira[e.id] ?? 0
  const totalEtf = etfs.reduce((s, e) => s + valorDe(e), 0)
  if (totalEtf <= 0) return null

  const somaPapeis = (papeis: Etf['papel'][]) =>
    etfs.filter((e) => papeis.includes(e.papel)).reduce((s, e) => s + valorDe(e), 0)

  const tematicos = somaPapeis(['tematico']) / totalEtf
  const nucleo = somaPapeis(['global', 'emergentes'])
  const emergentesNucleo = nucleo > 0 ? somaPapeis(['emergentes']) / nucleo : null

  return {
    totalEtf,
    linhas: etfs.map((etf) => ({
      etf,
      valor: valorDe(etf),
      peso: valorDe(etf) / totalEtf,
      alvo: etf.pesoAlvo / 100,
    })),
    tematicos,
    acimaDoTeto: tematicos > tetoTematicos / 100,
    nucleo,
    emergentesNucleo,
    alvoEmergentes: alvoEmergentesNoNucleo(o.investimentos),
    bandaEmergentes:
      emergentesNucleo === null
        ? null
        : emergentesNucleo < emergentesMin / 100
          ? 'abaixo'
          : emergentesNucleo > emergentesMax / 100
            ? 'acima'
            : 'dentro',
  }
}

export interface SugestaoAporte {
  etf: Etf
  /** O aporte mensal configurado, para se ver do que é que a sugestão se afasta. */
  base: number
  valor: number
  /** Porque é que difere da base. Ausente quando é a base. */
  razao?: string
}

const pct = (f: number) => `${(f * 100).toFixed(1).replace('.', ',')}%`

/**
 * Para onde mandar o aporte deste mês. Nunca sugere vender: o único instrumento
 * é o destino do dinheiro novo.
 *
 * Com tudo dentro das regras, sugere os aportes base. Fora delas, em duas etapas:
 *
 *   1. Temáticos acima do teto → o que lhes ia é desviado para o núcleo.
 *   2. Emergentes fora do intervalo → do dinheiro que vai para o núcleo, manda-se
 *      aos emergentes **exatamente o que falta** para ficarem no peso-alvo depois
 *      do aporte, no máximo tudo o que há.
 *
 * O "exatamente o que falta" é a correção mais rápida possível sem passar para o
 * outro lado: quando um mês não chega para fechar o desvio, o teto não se aplica e
 * vai tudo para o lado em falta; quando chega e sobra, mandar mais do que o
 * necessário afastaria do alvo em vez de aproximar.
 */
export function sugerirAportes(o: Orcamento, pesos: Pesos | null): SugestaoAporte[] {
  const { etfs, tetoTematicos } = o.investimentos
  const valores = new Map(etfs.map((e) => [e.id, e.aporteBase]))
  const razoes = new Map<string, string>()

  const doPapel = (papeis: Etf['papel'][]) => etfs.filter((e) => papeis.includes(e.papel))
  const nucleoEtfs = doPapel(['global', 'emergentes'])
  const globais = doPapel(['global'])
  const emergentes = doPapel(['emergentes'])
  const tematicos = doPapel(['tematico'])

  let poolNucleo = nucleoEtfs.reduce((s, e) => s + e.aporteBase, 0)

  if (pesos?.acimaDoTeto) {
    for (const e of tematicos) {
      valores.set(e.id, 0)
      razoes.set(e.id, `temáticos em ${pct(pesos.tematicos)}, acima do teto de ${tetoTematicos}%`)
    }
    poolNucleo += tematicos.reduce((s, e) => s + e.aporteBase, 0)
  }

  const repartir = (lista: Etf[], montante: number) => {
    const soma = lista.reduce((s, e) => s + e.aporteBase, 0)
    for (const e of lista) {
      valores.set(e.id, soma > 0 ? (montante * e.aporteBase) / soma : montante / lista.length)
    }
  }

  const foraDoIntervalo =
    pesos?.bandaEmergentes === 'abaixo' || pesos?.bandaEmergentes === 'acima'

  if (
    pesos &&
    foraDoIntervalo &&
    pesos.alvoEmergentes !== null &&
    emergentes.length > 0 &&
    globais.length > 0
  ) {
    const valorAtual = emergentes.reduce(
      (s, e) => s + (pesos.linhas.find((l) => l.etf.id === e.id)?.valor ?? 0),
      0,
    )
    const falta = pesos.alvoEmergentes * (pesos.nucleo + poolNucleo) - valorAtual
    const paraEmergentes = Math.min(poolNucleo, Math.max(0, falta))

    repartir(emergentes, paraEmergentes)
    repartir(globais, poolNucleo - paraEmergentes)

    const razao = `emergentes em ${pct(pesos.emergentesNucleo ?? 0)} do núcleo, ${
      pesos.bandaEmergentes === 'abaixo' ? 'abaixo' : 'acima'
    } do intervalo ${o.investimentos.emergentesMin}–${o.investimentos.emergentesMax}%`
    for (const e of [...emergentes, ...globais]) razoes.set(e.id, razao)
  } else {
    repartir(nucleoEtfs, poolNucleo)
  }

  return etfs.map((etf) => ({
    etf,
    base: etf.aporteBase,
    valor: valores.get(etf.id) ?? 0,
    razao: razoes.get(etf.id),
  }))
}
