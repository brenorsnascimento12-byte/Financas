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
  /** YYYY-MM em que tem de estar cumprido. Sem isto não há ritmo a calcular. */
  dataAlvo?: string
  notas?: string
}

export type Fonte = 'essencial' | 'naoEssencial'

/**
 * 'certificados' são Certificados de Aforro: valor previsível a prazo curto, é
 * para lá que a cascata encaminha o dinheiro dos objetivos com data.
 */
export type Destino = 'investimento' | 'liquidez' | 'certificados'

/**
 * 'planeado' é a transferência mensal recorrente; 'excedente' é uma saída do pote.
 *
 * O pote é um só: separar excedente de essenciais e de não essenciais não mudava
 * nenhuma decisão (a cascata não distingue a origem) e deixava um pote positivo ao
 * lado de outro negativo sem os deixar compensarem-se. O detalhe por fatia continua
 * a existir mês a mês, na tabela de origem.
 */
export type FonteAporte = 'planeado' | 'excedente'

/**
 * Dinheiro efetivamente transferido para investimento, liquidez ou certificados.
 * É isto que conta como poupança — não o que sobra na conta ao fim do mês.
 *
 * Os aportes com fonte 'excedente' são saídas do pote. As despesas nunca se
 * registam aqui: consomem o pote pela via do mês acima do teto.
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
  /** Certificados de Aforro (IGCP). Crescem por juros, que aparecem como mercado. */
  certificados: number
}

/** Parte da liquidez que já tem dono e não deve contar como disponível. */
export interface Compromisso {
  id: string
  nome: string
  valor: number
}

/** Marcador de data para reabrir a estratégia. Sem lógica associada, só memória. */
export interface Revisao {
  id: string
  /** YYYY-MM */
  data: string
  titulo: string
  nota?: string
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
  compromissos: Compromisso[]
  revisoes: Revisao[]
  /** Piso de liquidez livre. Enche primeiro e não é afetável a objetivos. */
  almofadaAlvo: number
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

/** Excedente acumulado de todas as fatias, e quanto dele ainda espera decisão. */
export interface Pote {
  acumulado: number
  decidido: number
  porDecidir: number
  /** Como ficaria se o mês em curso fechasse agora. Responde a "posso gastar isto já?". */
  projetado: number
}

export interface ProgressoObjetivo {
  objetivo: Objetivo
  alvo: number
  /** Saldo em certificados: é para lá que a cascata encaminha este dinheiro. */
  atual: number
  falta: number
  pct: number
  mesesRestantes: number
  /** Quanto é preciso pôr de lado por mês, a partir de agora, para chegar a horas. */
  necessarioMensal: number
  /** Ritmo médio observado nos aportes a certificados. Null se ainda não há dados. */
  ritmoAtual: number | null
  /** Só sinaliza quando há ritmo medido com que comparar. */
  emDesvio: boolean
}

export interface PassoCascata {
  destino: Destino
  valor: number
  razao: string
}
