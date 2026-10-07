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

/**
 * Cabeçalho do extrato: `26/09/30 EXT. N. 2026/009 DEPOSITO A ORDEM: ...`.
 * A primeira data é AA/MM/DD e é a data do extrato — o fim do período.
 */
const CABECALHO = /(\d{2})\/(\d{2})\/(\d{2})\s+EXT\.\s*N\.\s*(\d{4})\/(\d{3})/i

/**
 * Forma alternativa do cabeçalho, com o período explícito. Nem todos os extratos
 * a trazem — o de setembro de 2026 só tinha o "EXT. N." — mas quando existe é
 * mais direta do que inferir o período da data do documento.
 */
const PERIODO_EXPLICITO =
  /EXTRATO DE\s+(\d{4})\/(\d{2})\/(\d{2})\s+A\s+(\d{4})\/(\d{2})\/(\d{2})/i

/** Só a etiqueta: o valor pode vir nesta linha ou na anterior. */
const ETIQUETA_SALDO_INICIAL = /SALDO INICIAL/i
const VALOR_SOLTO = /^([\d\s ]*\d\.\d{2})\s*$/
const SALDO_INICIAL_COM_VALOR = /SALDO INICIAL\s+([\d\s ]*\d\.\d{2})\s*$/i

/** Movimento inteiro numa linha: datas, descritivo, valor, saldo. */
const MOVIMENTO_COMPLETO =
  /^(\d{1,2})\.(\d{2})\s+(\d{1,2})\.(\d{2})\s+(.+?)\s+([\d\s ]*\d\.\d{2})\s+([\d\s ]*\d\.\d{2})\s*$/

/**
 * Movimento sem descritivo: acontece quando o descritivo é comprido e sai na
 * linha de cima. É mais específico do que o completo, por isso testa-se antes.
 */
const MOVIMENTO_SEM_DESCRITIVO =
  /^(\d{1,2})\.(\d{2})\s+(\d{1,2})\.(\d{2})\s+([\d\s ]*\d\.\d{2})\s+([\d\s ]*\d\.\d{2})\s*$/

const doisDigitos = (n: number) => String(n).padStart(2, '0')

/**
 * O período serve só para resolver o ano das linhas, que trazem apenas `M.DD`.
 * Quando o extrato não traz o período explícito, deduz-se da data do documento:
 * o fim é essa data e o início é um mês antes — chega para distinguir dezembro
 * de janeiro numa passagem de ano.
 */
function encontrarPeriodo(linhas: string[]): { inicio: string; fim: string } | null {
  const explicito = linhas.map((l) => l.match(PERIODO_EXPLICITO)).find(Boolean)
  if (explicito) {
    return {
      inicio: `${explicito[1]}-${explicito[2]}-${explicito[3]}`,
      fim: `${explicito[4]}-${explicito[5]}-${explicito[6]}`,
    }
  }

  const cabecalho = linhas.map((l) => l.match(CABECALHO)).find(Boolean)
  if (!cabecalho) return null

  const ano = Number(`20${cabecalho[1]}`)
  const mes = Number(cabecalho[2])
  const dia = cabecalho[3]
  return {
    inicio: mes === 1 ? `${ano - 1}-12-${dia}` : `${ano}-${doisDigitos(mes - 1)}-${dia}`,
    fim: `${ano}-${doisDigitos(mes)}-${dia}`,
  }
}

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
  const periodo = encontrarPeriodo(linhas)
  if (!periodo) {
    throw new Error(
      'Não encontrei o cabeçalho do extrato (a linha com "EXT. N." ou "EXTRATO DE"). ' +
        'O ficheiro não parece um extrato do ActivoBank.',
    )
  }

  // O valor do saldo inicial pode estar na mesma linha da etiqueta ou na anterior,
  // conforme o descritivo coube ou não na célula.
  let saldoInicial: number | null = null
  for (let i = 0; i < linhas.length; i++) {
    if (!ETIQUETA_SALDO_INICIAL.test(linhas[i])) continue
    const naMesmaLinha = linhas[i].match(SALDO_INICIAL_COM_VALOR)
    if (naMesmaLinha) {
      saldoInicial = normalizarNumero(naMesmaLinha[1])
      break
    }
    const anterior = i > 0 ? linhas[i - 1].match(VALOR_SOLTO) : null
    if (anterior) {
      saldoInicial = normalizarNumero(anterior[1])
      break
    }
  }
  if (saldoInicial === null) {
    throw new Error('Não encontrei o SALDO INICIAL. Isto não parece um extrato do ActivoBank.')
  }

  const movimentos: MovimentoExtrato[] = []
  const vistos = new Map<string, number>()
  let saldo = saldoInicial

  // Quando o descritivo é comprido, o PDF põe-no sozinho na linha de cima e
  // deixa em baixo só as datas e os valores. Guarda-se a última linha não
  // reconhecida para a poder usar como descritivo do movimento seguinte.
  let descritivoPendente = ''

  for (const linha of linhas) {
    const semDescritivo = linha.match(MOVIMENTO_SEM_DESCRITIVO)
    const completo = semDescritivo ? null : linha.match(MOVIMENTO_COMPLETO)

    if (!semDescritivo && !completo) {
      descritivoPendente = linha.trim()
      continue
    }

    let mesLanc: string, diaLanc: string, mesValor: string, diaValor: string
    let descritivo: string, valorBruto: string, saldoBruto: string

    if (semDescritivo) {
      ;[, mesLanc, diaLanc, mesValor, diaValor, valorBruto, saldoBruto] = semDescritivo
      descritivo = descritivoPendente
      if (descritivo === '') {
        throw new Error(
          `Esta linha tem valores mas não encontrei o descritivo dela: "${linha.trim()}".`,
        )
      }
    } else {
      ;[, mesLanc, diaLanc, mesValor, diaValor, descritivo, valorBruto, saldoBruto] = completo!
    }
    descritivoPendente = ''
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
