// ---------- Orçamento corrente ----------

export type Fatia = 'essencial' | 'naoEssencial'

export interface Categoria {
  id: string
  nome: string
  fatia: Fatia
  /** Categorias arquivadas somem do registo rápido mas mantêm o histórico. */
  arquivada?: boolean
}

export interface Despesa {
  id: string
  /** YYYY-MM-DD */
  data: string
  valor: number
  categoriaId: string
  nota?: string
}

export interface Objetivo {
  id: string
  nome: string
  /** Opcional: nem todo o objetivo tem número. */
  valorAlvo?: number
  notas?: string
}

export type Fonte = 'essencial' | 'naoEssencial'
export type Destino = 'investimento' | 'liquidez'

/** 'planeado' é a transferência mensal recorrente; as outras vêm dos potes. */
export type FonteAporte = 'planeado' | Fonte

/**
 * Dinheiro efetivamente transferido para investimento ou liquidez. É isto que
 * conta como poupança — não o que sobra na conta ao fim do mês.
 *
 * Os aportes com fonte 'essencial' ou 'naoEssencial' são saídas dos potes. As
 * despesas nunca se registam aqui: consomem o pote pela via do mês acima do teto.
 */
export interface Aporte {
  id: string
  /** YYYY-MM-DD */
  data: string
  valor: number
  fonte: FonteAporte
  destino: Destino
  nota?: string
}

/** Fotografia do património numa data. Introduzida à mão a partir da corretora. */
export interface Saldo {
  id: string
  /** YYYY-MM-DD */
  data: string
  investido: number
  liquidez: number
}

export interface Orcamento {
  rendimentoMensal: number
  vencimentosPorAno: number
  /** % do rendimento reservada a cada fatia. A poupança é o que sobra. */
  alvoEssencial: number
  alvoNaoEssencial: number
  categorias: Categoria[]
  despesas: Despesa[]
  objetivos: Objetivo[]
  aportes: Aporte[]
  saldos: Saldo[]
  /** YYYY-MM da última revisão de rácios e objetivos. */
  ultimaRevisao: string
  /** Rendimento em vigor na última revisão: se divergir, pede-se nova revisão. */
  rendimentoNaRevisao: number
}

// ---------- Agregações ----------

export interface ResumoMes {
  /** YYYY-MM */
  mes: string
  rendimento: number
  gastoEssencial: number
  gastoNaoEssencial: number
  gastoTotal: number
  /** Aportes do mês: o que foi mesmo transferido. Zero se nada foi registado. */
  poupanca: number
  /** Parcela dos aportes vinda da transferência mensal planeada. */
  poupancaPlaneada: number
  /** Parcela dos aportes vinda dos potes de excedente. */
  poupancaDeExcedente: number
  taxaPoupanca: number
  /** Rendimento menos gastos: dinheiro que ficou na conta, afetado ou não. */
  naoGasto: number
  pctEssencial: number
  pctNaoEssencial: number
  /** Tetos do mês em euros. Não são verbas a consumir: são limites a não atingir. */
  limiteEssencial: number
  limiteNaoEssencial: number
  /** Teto menos gasto. Negativo quando o teto foi ultrapassado. */
  excedenteEssencial: number
  excedenteNaoEssencial: number
  /** Um mês só entra nos potes depois de fechar. */
  fechado: boolean
}

/** Excedente acumulado de uma fatia, e quanto dele ainda espera decisão. */
export interface Pote {
  acumulado: number
  decidido: number
  porDecidir: number
  /** Como ficaria se o mês em curso fechasse agora. Responde a "posso gastar isto já?". */
  projetado: number
}

