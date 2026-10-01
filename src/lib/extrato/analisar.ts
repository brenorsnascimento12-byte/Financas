import type { MovimentoExtrato } from '../../types'
import { impressaoDigital, normalizarChave, normalizarNumero, resolverAno } from './normalizar'

export interface ResultadoAnalise {
  periodo: { inicio: string; fim: string }
  saldoInicial: number
  saldoFinal: number
  movimentos: MovimentoExtrato[]
}

/** Metade do cêntimo: abaixo disto é arredondamento, não erro de leitura. */
const TOLERANCIA = 0.005

const PERIODO = /EXTRATO DE\s+(\d{4})\/(\d{2})\/(\d{2})\s+A\s+(\d{4})\/(\d{2})\/(\d{2})/i
const SALDO_INICIAL = /SALDO INICIAL\s+([\d\s ]+\.\d{2})\s*$/i
const MOVIMENTO =
  /^(\d{1,2})\.(\d{2})\s+(\d{1,2})\.(\d{2})\s+(.+?)\s+([\d\s ]+\.\d{2})\s+([\d\s ]+\.\d{2})\s*$/

const doisDigitos = (n: number) => String(n).padStart(2, '0')

/**
 * Lê as linhas de texto de um extrato do ActivoBank.
 *
 * O sinal de cada movimento vem do encadeamento dos saldos, não da coluna: em
 * texto extraído de PDF a coluna de origem perde-se, mas a aritmética do saldo
 * resolve-a sem ambiguidade. Isso dá de graça uma verificação de integridade —
 * se uma linha não encadear, foi mal lida, e a importação é recusada inteira em
 * vez de aceite meia errada.
 */
export function analisarExtrato(linhas: string[]): ResultadoAnalise {
  const cabecalho = linhas.map((l) => l.match(PERIODO)).find(Boolean)
  if (!cabecalho) {
    throw new Error('Não encontrei o período do extrato. O ficheiro não parece um extrato.')
  }
  const periodo = {
    inicio: `${cabecalho[1]}-${cabecalho[2]}-${cabecalho[3]}`,
    fim: `${cabecalho[4]}-${cabecalho[5]}-${cabecalho[6]}`,
  }

  const linhaInicial = linhas.find((l) => SALDO_INICIAL.test(l))
  if (!linhaInicial) {
    throw new Error('Não encontrei o SALDO INICIAL. Isto não parece um extrato do ActivoBank.')
  }
  const saldoInicial = normalizarNumero(linhaInicial.match(SALDO_INICIAL)![1])

  const movimentos: MovimentoExtrato[] = []
  const vistos = new Map<string, number>()
  let saldo = saldoInicial

  for (const linha of linhas) {
    const m = linha.match(MOVIMENTO)
    if (!m) continue

    const [, mesLanc, diaLanc, mesValor, diaValor, descritivo, valorBruto, saldoBruto] = m
    const valor = normalizarNumero(valorBruto)
    const saldoLinha = normalizarNumero(saldoBruto)

    let sinal: 'debito' | 'credito'
    if (Math.abs(saldo - valor - saldoLinha) < TOLERANCIA) sinal = 'debito'
    else if (Math.abs(saldo + valor - saldoLinha) < TOLERANCIA) sinal = 'credito'
    else {
      throw new Error(
        `A leitura perdeu-se nesta linha: "${linha.trim()}". ` +
          `O saldo não encadeia (esperava ${(saldo - valor).toFixed(2)} ou ` +
          `${(saldo + valor).toFixed(2)}, o extrato diz ${saldoLinha.toFixed(2)}).`,
      )
    }

    const ano = resolverAno(Number(mesLanc), periodo)
    const data = `${ano}-${doisDigitos(Number(mesLanc))}-${diaLanc}`
    const dataValor = `${resolverAno(Number(mesValor), periodo)}-${doisDigitos(Number(mesValor))}-${diaValor}`
    const chave = normalizarChave(descritivo)

    const base = `${data}|${valor.toFixed(2)}|${chave}`
    const ocorrencia = vistos.get(base) ?? 0
    vistos.set(base, ocorrencia + 1)

    movimentos.push({
      id: impressaoDigital(data, valor, chave, ocorrencia),
      data,
      dataValor,
      descritivo: descritivo.trim(),
      chave,
      valor,
      sinal,
      saldo: saldoLinha,
    })
    saldo = saldoLinha
  }

  const saldoFinal = movimentos.length > 0 ? movimentos[movimentos.length - 1].saldo : saldoInicial
  const esperado = movimentos.reduce(
    (acc, mv) => (mv.sinal === 'debito' ? acc - mv.valor : acc + mv.valor),
    saldoInicial,
  )
  if (Math.abs(esperado - saldoFinal) >= TOLERANCIA) {
    throw new Error(
      `A soma dos movimentos não bate com o saldo final: ` +
        `esperava ${esperado.toFixed(2)}, o extrato diz ${saldoFinal.toFixed(2)}.`,
    )
  }

  return { periodo, saldoInicial, saldoFinal, movimentos }
}
