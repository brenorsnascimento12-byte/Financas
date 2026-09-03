import type { Aporte, Categoria, Fonte, Objetivo, Orcamento, PassoCascata, Pote, ProgressoObjetivo, ResumoMes, Saldo, Despesa } from '../types'

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
 * espera decisão — ver `calcularPote`.
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
 * Pote de excedente, um só. Acumula o que sobrou de todos os tetos nos meses já
 * fechados — um mês acima do teto entra negativo e faz o pote descer sozinho, e a
 * folga de uma fatia compensa o estouro da outra sem ser preciso mexer em nada.
 */
export function calcularPote(resumos: ResumoMes[], aportes: Aporte[]): Pote {
  const fechados = resumos.filter((r) => r.fechado)
  const emCurso = resumos.find((r) => !r.fechado)

  const acumulado = fechados.reduce(
    (s, r) => s + r.excedenteEssencial + r.excedenteNaoEssencial,
    0,
  )
  const decidido = aportes
    .filter((a) => a.fonte === 'excedente')
    .reduce((s, a) => s + a.valor, 0)
  const porDecidir = acumulado - decidido
  const doMesEmCurso = emCurso
    ? emCurso.excedenteEssencial + emCurso.excedenteNaoEssencial
    : 0

  return { acumulado, decidido, porDecidir, projetado: porDecidir + doMesEmCurso }
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

/** Liquidez que já tem dono: voo, reservas, o que estiver marcado. */
export const totalComprometido = (o: Orcamento) =>
  o.compromissos.reduce((s, c) => s + c.valor, 0)

/** Saldos por ordem cronológica, com o total e o acumulado aportado até essa data. */
export function evolucaoPatrimonio(o: Orcamento) {
  const saldos = [...o.saldos].sort((a, b) => a.data.localeCompare(b.data))
  return saldos.map((s) => ({
    ...s,
    // A reserva em reais fica deliberadamente fora: é para gastar no Brasil, sem
    // conversão, e somá-la em euros só acrescentaria ruído cambial.
    total: s.investido + s.liquidez + s.certificados,
    // Tudo o que foi transferido até esta data: a diferença para o total é o que
    // o mercado (ou os juros dos certificados) deu ou tirou.
    aportadoAte: o.aportes.filter((a) => a.data <= s.data).reduce((acc, a) => acc + a.valor, 0),
  }))
}

export const ultimoSaldo = (o: Orcamento): Saldo | undefined =>
  [...o.saldos].sort((a, b) => a.data.localeCompare(b.data)).at(-1)

/** Meses inteiros de 'de' até 'ate', ambos em YYYY-MM. */
export function mesesEntre(de: string, ate: string): number {
  const [a1, m1] = de.split('-').map(Number)
  const [a2, m2] = ate.split('-').map(Number)
  return (a2 - a1) * 12 + (m2 - m1)
}

/** O objetivo que a cascata financia: o primeiro com alvo e data definidos. */
export const objetivoComData = (o: Orcamento): Objetivo | undefined =>
  o.objetivos.find((ob) => ob.valorAlvo !== undefined && ob.dataAlvo !== undefined)

/**
 * Progresso de um objetivo com alvo e data.
 *
 * Conta os Certificados mais a liquidez que sobra depois de descontar o que já tem
 * dono: os compromissos e a almofada. Contar a liquidez toda inflacionaria o
 * progresso com dinheiro que não está disponível para o objetivo.
 *
 * Os ETFs ficam de fora de propósito: dinheiro com data marcada não pertence a um
 * ativo volátil.
 */
export function progressoObjetivo(o: Orcamento, objetivo: Objetivo): ProgressoObjetivo | null {
  if (objetivo.valorAlvo === undefined || objetivo.dataAlvo === undefined) return null

  const alvo = objetivo.valorAlvo
  const saldo = ultimoSaldo(o)
  const aportesCertificados = o.aportes.filter((a) => a.destino === 'certificados')
  // Sem fotografia não há saldos que valham: o progresso fica a zero em vez de ser
  // adivinhado a partir dos aportes, que não sabem de juros nem do estado da conta.
  const liquidezDisponivel = saldo
    ? Math.max(0, saldo.liquidez - totalComprometido(o) - o.almofadaAlvo)
    : 0
  const atual = saldo ? saldo.certificados + liquidezDisponivel : 0

  const falta = Math.max(0, alvo - atual)
  const mesesRestantes = Math.max(0, mesesEntre(mesAtual(), objetivo.dataAlvo))
  const necessarioMensal = falta === 0 ? 0 : falta / Math.max(1, mesesRestantes)

  // Ritmo medido: o que foi aportado a certificados, espalhado pelos meses desde
  // o primeiro aporte. Sem aportes ainda, não há ritmo a comparar.
  let ritmoAtual: number | null = null
  if (aportesCertificados.length > 0) {
    const primeiro = aportesCertificados
      .map((a) => mesDe(a.data))
      .sort()[0]
    const meses = Math.max(1, mesesEntre(primeiro, mesAtual()) + 1)
    ritmoAtual = aportesCertificados.reduce((s, a) => s + a.valor, 0) / meses
  }

  return {
    objetivo,
    alvo,
    atual,
    falta,
    pct: alvo > 0 ? Math.min(1, atual / alvo) : 0,
    mesesRestantes,
    necessarioMensal,
    ritmoAtual,
    // Tolerância de 5%: não vale a pena alarmar por cêntimos de arredondamento.
    emDesvio: ritmoAtual !== null && falta > 0 && necessarioMensal > ritmoAtual * 1.05,
  }
}

/**
 * Para onde deve ir a poupança deste mês, por ordem de prioridade:
 *
 *   1. Almofada de liquidez até ao piso — não é afetável a objetivos.
 *   2. O objetivo com data, em Certificados, até ao ritmo necessário.
 *   3. Tudo o resto em ETFs, sem teto.
 *
 * Os ETFs já detidos nunca entram nesta conta: só condiciona o aporte novo.
 */
export function calcularCascata(o: Orcamento, montante: number): PassoCascata[] {
  const passos: PassoCascata[] = []
  let resto = Math.max(0, montante)
  if (resto === 0) return passos

  // Sem fotografia não se sabe onde está a liquidez. Assumir zero e subtrair os
  // compromissos daria um buraco inventado — o passo fica de fora até haver dados.
  const saldo = ultimoSaldo(o)
  const liquidezLivre = saldo ? saldo.liquidez - totalComprometido(o) : null
  const faltaAlmofada = liquidezLivre === null ? 0 : Math.max(0, o.almofadaAlvo - liquidezLivre)

  if (faltaAlmofada > 0) {
    const valor = Math.min(resto, faltaAlmofada)
    passos.push({
      destino: 'liquidez',
      valor,
      razao: `almofada em ${eurSeco(liquidezLivre ?? 0)} de ${eurSeco(o.almofadaAlvo)}`,
    })
    resto -= valor
  }

  const objetivo = objetivoComData(o)
  const progresso = objetivo ? progressoObjetivo(o, objetivo) : null
  if (resto > 0 && progresso && progresso.falta > 0) {
    const valor = Math.min(resto, progresso.necessarioMensal)
    passos.push({
      destino: 'certificados',
      valor,
      razao: `${progresso.objetivo.nome}: faltam ${progresso.mesesRestantes} meses`,
    })
    resto -= valor
  }

  if (resto > 0) {
    passos.push({ destino: 'investimento', valor: resto, razao: 'excedente acima das prioridades' })
  }

  return passos
}

/** Formatação mínima para as razões da cascata, sem depender do módulo de formato. */
const eurSeco = (v: number) => `${Math.round(v)} €`
