import type { MovimentoExtrato } from '../../types'
import type { ResultadoAnalise } from './analisar'
import type { Celula } from './lerExcel'
import { impressaoDigital, normalizarChave } from './normalizar'

/** Metade do cêntimo: abaixo disto é arredondamento, não erro de leitura. */
const TOLERANCIA = 0.005

/** Minúsculas, sem acentos nem pontuação: "Data Lanc." e "data lanc" são o mesmo. */
const simplificar = (c: Celula) =>
  String(c ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

const doisDigitos = (n: number) => String(n).padStart(2, '0')

/**
 * Data de uma célula em ISO. O Excel guarda datas como número de dias desde
 * 30/12/1899; se vier como texto, aceita-se DD-MM-AAAA ou DD/MM/AAAA.
 */
function dataDe(c: Celula): string | null {
  if (typeof c === 'number' && Number.isFinite(c)) {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(c) * 86_400_000)
    return `${d.getUTCFullYear()}-${doisDigitos(d.getUTCMonth() + 1)}-${doisDigitos(d.getUTCDate())}`
  }
  const m = String(c ?? '').match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/)
  if (m) return `${m[3]}-${doisDigitos(Number(m[2]))}-${doisDigitos(Number(m[1]))}`
  const iso = String(c ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/)
  return iso ? `${iso[1]}-${iso[2]}-${iso[3]}` : null
}

/** Valor com sinal. Aceita número ou texto à portuguesa ("-1 234,56"). */
function numeroDe(c: Celula): number | null {
  if (typeof c === 'number') return Number.isFinite(c) ? c : null
  const t = String(c ?? '').replace(/[\s €]/g, '')
  if (t === '') return null
  const normal = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t
  const n = Number(normal.replace('−', '-'))
  return Number.isFinite(n) ? n : null
}

interface Colunas {
  data: number
  dataValor: number
  descricao: number
  valor: number
  saldo: number
}

function encontrarCabecalho(linhas: Celula[][]): { linha: number; colunas: Colunas } | null {
  for (let i = 0; i < linhas.length; i++) {
    const nomes = linhas[i].map(simplificar)
    const col = (...alternativas: string[]) => nomes.findIndex((n) => alternativas.includes(n))
    const colunas = {
      data: col('data lanc', 'data lancamento', 'data mov', 'data movimento'),
      dataValor: col('data valor'),
      descricao: col('descricao', 'descritivo'),
      valor: col('valor', 'montante'),
      saldo: col('saldo', 'saldo contabilistico'),
    }
    if (colunas.data >= 0 && colunas.descricao >= 0 && colunas.valor >= 0 && colunas.saldo >= 0) {
      return { linha: i, colunas }
    }
  }
  return null
}

/** "Data de:" / "Data até:" do cabeçalho, quando lá estão. */
function periodoDeclarado(linhas: Celula[][], ate: number): { inicio?: string; fim?: string } {
  const r: { inicio?: string; fim?: string } = {}
  for (const l of linhas.slice(0, ate)) {
    const etiqueta = simplificar(l[0])
    if (etiqueta === 'data de') r.inicio = dataDe(l[1]) ?? undefined
    if (etiqueta === 'data ate') r.fim = dataDe(l[1]) ?? undefined
  }
  return r
}

interface Bruto {
  data: string
  dataValor: string
  descritivo: string
  valor: number
  saldo: number
  linha: number
}

/** Verdadeiro se cada saldo for o anterior mais o valor da própria linha. */
function encadeia(itens: Bruto[]): boolean {
  for (let i = 1; i < itens.length; i++) {
    if (Math.abs(itens[i - 1].saldo + itens[i].valor - itens[i].saldo) >= TOLERANCIA) return false
  }
  return true
}

/**
 * Analisa a grelha da exportação de movimentos do ActivoBank.
 *
 * Ao contrário do PDF, o Excel traz o sinal no próprio valor. O encadeamento dos
 * saldos mantém-se como verificação: se alguma linha não encadear, a importação
 * é recusada inteira em vez de aceite meia errada.
 */
export function analisarFolha(linhas: Celula[][]): ResultadoAnalise {
  const cab = encontrarCabecalho(linhas)
  if (!cab) {
    throw new Error(
      'Não encontrei a linha de títulos (Data Lanc., Descrição, Valor, Saldo). ' +
        'Isto não parece uma exportação de movimentos do ActivoBank.',
    )
  }
  const { colunas } = cab

  const brutos: Bruto[] = []
  for (let i = cab.linha + 1; i < linhas.length; i++) {
    const l = linhas[i]
    if (l.every((c) => c === null || String(c).trim() === '')) continue
    const data = dataDe(l[colunas.data])
    const valor = numeroDe(l[colunas.valor])
    const saldo = numeroDe(l[colunas.saldo])
    const descritivo = String(l[colunas.descricao] ?? '').trim()
    if (!data || valor === null || saldo === null || descritivo === '') {
      throw new Error(
        `Não consegui ler a linha ${i + 1} do Excel: ${l.map((c) => c ?? '').join(' | ')}`,
      )
    }
    const dataValor = (colunas.dataValor >= 0 && dataDe(l[colunas.dataValor])) || data
    brutos.push({ data, dataValor, descritivo, valor, saldo, linha: i + 1 })
  }

  // O ActivoBank exporta do mais antigo para o mais recente, mas não custa
  // aceitar a ordem inversa: a que encadear é a certa.
  let itens = brutos
  if (!encadeia(itens)) {
    const invertidos = [...brutos].reverse()
    if (!encadeia(invertidos)) {
      const falha = brutos.findIndex(
        (b, i) => i > 0 && Math.abs(brutos[i - 1].saldo + b.valor - b.saldo) >= TOLERANCIA,
      )
      const b = brutos[falha]
      throw new Error(
        `Os saldos não encadeiam na linha ${b.linha} ("${b.descritivo}"): ` +
          `esperava ${(brutos[falha - 1].saldo + b.valor).toFixed(2)}, o Excel diz ${b.saldo.toFixed(2)}.`,
      )
    }
    itens = invertidos
  }

  const saldoInicial = itens.length > 0 ? itens[0].saldo - itens[0].valor : 0
  const saldoFinal = itens.length > 0 ? itens[itens.length - 1].saldo : 0

  const declarado = periodoDeclarado(linhas, cab.linha)
  const datas = itens.map((b) => b.data).sort()
  const periodo = {
    inicio: declarado.inicio ?? datas[0] ?? '',
    fim: declarado.fim ?? datas[datas.length - 1] ?? '',
  }
  if (!periodo.inicio || !periodo.fim) {
    throw new Error('O Excel não tem movimentos nem período indicado.')
  }

  const vistos = new Map<string, number>()
  const movimentos: MovimentoExtrato[] = itens.map((b) => {
    const valor = Math.round(Math.abs(b.valor) * 100) / 100
    const chave = normalizarChave(b.descritivo)
    const base = `${b.data}|${valor.toFixed(2)}|${chave}`
    const ocorrencia = vistos.get(base) ?? 0
    vistos.set(base, ocorrencia + 1)
    return {
      id: impressaoDigital(b.data, valor, chave, ocorrencia),
      data: b.data,
      dataValor: b.dataValor,
      descritivo: b.descritivo,
      chave,
      valor,
      sinal: b.valor < 0 ? 'debito' : 'credito',
      saldo: b.saldo,
    }
  })

  return { periodo, saldoInicial, saldoFinal, movimentos }
}
