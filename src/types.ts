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
  /**
   * Valor de cada ETF, por id, somando as duas carteiras da corretora. Quando
   * existe, `investido` é a soma destes valores. As fotografias anteriores aos
   * indicadores não a têm: ficam com o total e sem detalhe.
   */
  carteira?: Record<string, number>
}

/**
 * Papel de um ETF nas regras da carteira. O núcleo é 'global' + 'emergentes';
 * os 'tematico' são os que têm teto.
 */
export type PapelEtf = 'global' | 'emergentes' | 'tematico'

/** Um ETF da carteira. O nome, o peso-alvo e o papel são escolhas do utilizador. */
export interface Etf {
  id: string
  nome: string
  /** Peso-alvo em % do total de ETFs. */
  pesoAlvo: number
  /** Aporte mensal base, em euros. É o que se sugere quando está tudo no lugar. */
  aporteBase: number
  papel: PapelEtf
}

/** Configuração da carteira. Tudo editável nas definições, nada no código. */
export interface Investimentos {
  etfs: Etf[]
  /** Teto dos temáticos, em % do total de ETFs. */
  tetoTematicos: number
  /** Intervalo aceitável do peso dos emergentes dentro do núcleo, em %. */
  emergentesMin: number
  emergentesMax: number
}

/** Os indicadores da secção Investimentos. A ordem é escolhida pelo utilizador. */
export type Indicador = 'pesos' | 'poupanca' | 'casamento'

/**
 * O que permite juntar as alterações de dois aparelhos sem perder nenhuma.
 *
 * Não vive nos próprios registos: é uma tabela à parte, indexada pelo id, para
 * os tipos de dados não ganharem um campo técnico cada um.
 */
export interface Sincronizacao {
  /** id de registo, ou nome de campo solto, → quando mudou (ISO). */
  alteradoEm: Record<string, string>
  /**
   * Registos apagados e quando. Sem isto, apagar no telemóvel não chegava:
   * o PC ainda tinha o registo e devolvia-o na sincronização seguinte.
   */
  apagados: Record<string, string>
  /** "utilizador/repositório" privado onde fica a cópia. */
  repo?: string
  /** Quando correu bem pela última vez. */
  ultimaSync?: string
  /**
   * Última alteração feita **neste** aparelho. Distingue-se das marcas em
   * `alteradoEm`, que também trazem o que veio do outro: sem esta separação, a
   * app dizia "por sincronizar" logo a seguir a ter sincronizado.
   */
  alteradoLocalmenteEm?: string
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

/** O que uma linha do extrato é, depois de classificada. */
export type TipoMovimento = 'despesa' | 'rendimento' | 'aporte' | 'comissao' | 'transferencia'

/**
 * Regra aprendida na triagem: aplica-se a todos os movimentos cujo descritivo
 * normalizado contenha `padrao`. É sempre sugestão — nunca escreve sozinha.
 */
export interface Regra {
  id: string
  /** Substring do descritivo normalizado, ex. "PINGO DOCE". */
  padrao: string
  tipo: TipoMovimento | 'ignorar'
  /** Obrigatório quando tipo === 'despesa'. */
  categoriaId?: string
  /**
   * Pedida de propósito na triagem ("lembrar"). Nas transferências só estas
   * pré-preenchem a categoria: o mesmo destinatário pode receber dinheiro por
   * motivos diferentes, e uma regra aprendida em silêncio adivinharia mal.
   */
  explicita?: boolean
}

/** Uma linha do extrato. Nunca é persistida: vive só durante a triagem. */
export interface MovimentoExtrato {
  /**
   * Impressão digital estável, para a linha ser reconhecível entre importações:
   * `data|valor|chave|ocorrência`. A ocorrência distingue duas compras iguais no
   * mesmo dia e no mesmo sítio, que de outro modo colidiriam.
   */
  id: string
  /** YYYY-MM-DD, com o ano já resolvido a partir do período do extrato. */
  data: string
  dataValor: string
  /** Descritivo bruto, tal como sai do PDF. */
  descritivo: string
  /** Descritivo normalizado, para regras e comparações. */
  chave: string
  /** Sempre positivo; o sinal vive em `sinal`. */
  valor: number
  sinal: 'debito' | 'credito'
  saldo: number
  /** Id do movimento-mãe, quando esta linha é uma comissão. */
  paiId?: string
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
  regras: Regra[]
  investimentos: Investimentos
  /** Ordem dos indicadores da secção Investimentos, de cima para baixo. */
  ordemIndicadores: Indicador[]
  sincronizacao: Sincronizacao
  /**
   * Impressões digitais de linhas concretas mandadas ignorar. Distingue-se de
   * uma `Regra` com tipo 'ignorar': a regra silencia todos os movimentos com
   * aquele descritivo, esta lista silencia apenas aquela linha daquele dia.
   */
  linhasIgnoradas: string[]
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
