import type { Aporte, Categoria, Fonte, Orcamento, Pote, ResumoMes, Despesa } from '../types'

export const mesDe = (data: string) => data.slice(0, 7)

export const mesAtual = () => new Date().toISOString().slice(0, 7)

export const hojeISO = () => {
  // Data local, não UTC: perto da meia-noite o toISOString saltava um dia.
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

const NOMES_MES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]

export function nomeMes(mes: string): string {
  const [ano, m] = mes.split('-')
  const nome = NOMES_MES[Number(m) - 1]
  // Maiúscula só na inicial: um text-transform: capitalize em CSS punha "De".
  return `${nome[0].toUpperCase()}${nome.slice(1)} de ${ano}`
}

export const alvoPoupanca = (o: Orcamento) =>
  Math.max(0, 100 - o.alvoEssencial - o.alvoNaoEssencial)

export function categoriaPorId(categorias: Categoria[], id: string): Categoria | undefined {
  return categorias.find((c) => c.id === id)
}

/** Todos os meses entre o primeiro registo e o mês corrente, sem buracos. */
export function mesesCobertos(despesas: Despesa[]): string[] {
  const agora = mesAtual()
  if (despesas.length === 0) return [agora]
  const ordenadas = despesas.map((d) => mesDe(d.data)).sort()
  const primeiro = ordenadas[0]
  const meses: string[] = []
  let [ano, mes] = primeiro.split('-').map(Number)
  for (let guarda = 0; guarda < 600; guarda++) {
    const atual = `${ano}-${String(mes).padStart(2, '0')}`
    meses.push(atual)
    if (atual >= agora) break
    mes += 1
    if (mes > 12) {
      mes = 1
      ano += 1
    }
  }
  return meses
}

/**
 * Resumo mês a mês. Cada mês é independente: os 50 e os 30 são tetos daquele mês,
 * não verbas que transitam. O que sobra vira excedente e vai para os potes, onde
 * espera decisão — ver `calcularPotes`.
 */
export function resumirMeses(o: Orcamento): ResumoMes[] {
  const porFatia = new Map<string, Fonte>()
  for (const c of o.categorias) porFatia.set(c.id, c.fatia)

  const agora = mesAtual()

  return mesesCobertos(o.despesas).map((mes) => {
    const doMes = o.despesas.filter((d) => mesDe(d.data) === mes)
    let gastoEssencial = 0
    let gastoNaoEssencial = 0
    for (const d of doMes) {
      // Uma despesa cuja categoria foi apagada conta como não essencial: é a
      // hipótese conservadora, não desaparece do total.
      if (porFatia.get(d.categoriaId) === 'essencial') gastoEssencial += d.valor
      else gastoNaoEssencial += d.valor
    }

    const rendimento = o.rendimentoMensal
    const gastoTotal = gastoEssencial + gastoNaoEssencial
    const limiteEssencial = (rendimento * o.alvoEssencial) / 100
    const limiteNaoEssencial = (rendimento * o.alvoNaoEssencial) / 100

    // Poupança é o que saiu mesmo para investimento ou liquidez, não o resíduo.
    const aportesDoMes = o.aportes.filter((a) => mesDe(a.data) === mes)
    const poupancaPlaneada = aportesDoMes
      .filter((a) => a.fonte === 'planeado')
      .reduce((s, a) => s + a.valor, 0)
    const poupancaDeExcedente = aportesDoMes
      .filter((a) => a.fonte !== 'planeado')
      .reduce((s, a) => s + a.valor, 0)
    const poupanca = poupancaPlaneada + poupancaDeExcedente

    return {
      mes,
      rendimento,
      gastoEssencial,
      gastoNaoEssencial,
      gastoTotal,
      poupanca,
      poupancaPlaneada,
      poupancaDeExcedente,
      taxaPoupanca: rendimento > 0 ? poupanca / rendimento : 0,
      naoGasto: rendimento - gastoTotal,
      pctEssencial: rendimento > 0 ? gastoEssencial / rendimento : 0,
      pctNaoEssencial: rendimento > 0 ? gastoNaoEssencial / rendimento : 0,
      limiteEssencial,
      limiteNaoEssencial,
      excedenteEssencial: limiteEssencial - gastoEssencial,
      excedenteNaoEssencial: limiteNaoEssencial - gastoNaoEssencial,
      fechado: mes < agora,
    }
  })
}

/**
 * Potes de excedente, um por fatia. Acumulam os excedentes dos meses já fechados
 * — um mês acima do teto entra negativo e faz o pote descer sozinho, que é o que
 * dispensa registar despesas como decisões. As decisões são só saídas.
 */
export function calcularPotes(resumos: ResumoMes[], aportes: Aporte[]): Record<Fonte, Pote> {
  const fechados = resumos.filter((r) => r.fechado)
  const emCurso = resumos.find((r) => !r.fechado)

  const construir = (acumulado: number, emCursoValor: number, fonte: Fonte): Pote => {
    const decidido = aportes.filter((a) => a.fonte === fonte).reduce((s, a) => s + a.valor, 0)
    const porDecidir = acumulado - decidido
    return { acumulado, decidido, porDecidir, projetado: porDecidir + emCursoValor }
  }

  return {
    essencial: construir(
      fechados.reduce((s, r) => s + r.excedenteEssencial, 0),
      emCurso?.excedenteEssencial ?? 0,
      'essencial',
    ),
    naoEssencial: construir(
      fechados.reduce((s, r) => s + r.excedenteNaoEssencial, 0),
      emCurso?.excedenteNaoEssencial ?? 0,
      'naoEssencial',
    ),
  }
}

/** Média móvel dos últimos n meses fechados, para detetar deriva do gasto. */
export function mediaMovel(resumos: ResumoMes[], n: number, ate: number): number | null {
  const inicio = ate - n
  if (inicio < 0) return null
  const janela = resumos.slice(inicio, ate)
  if (janela.length < n) return null
  return janela.reduce((s, r) => s + r.gastoTotal, 0) / n
}

export const precisaRevisao = (o: Orcamento) => o.rendimentoMensal !== o.rendimentoNaRevisao

/** Verdadeiro desde o dia 1 do mês até se registar a primeira fotografia dele. */
export const faltaFotografiaEsteMes = (o: Orcamento) =>
  !o.saldos.some((s) => mesDe(s.data) === mesAtual())

/** Saldos por ordem cronológica, com o total e o acumulado aportado até essa data. */
export function evolucaoPatrimonio(o: Orcamento) {
  const saldos = [...o.saldos].sort((a, b) => a.data.localeCompare(b.data))
  return saldos.map((s) => ({
    ...s,
    total: s.investido + s.liquidez,
    // Tudo o que foi transferido até esta data: a diferença para o total é o que
    // o mercado deu ou tirou.
    aportadoAte: o.aportes.filter((a) => a.data <= s.data).reduce((acc, a) => acc + a.valor, 0),
  }))
}
