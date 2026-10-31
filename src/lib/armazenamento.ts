import type { Aporte, Indicador, Investimentos, Orcamento, Saldo, Sincronizacao } from '../types'
import { mesAtual } from './orcamento'

const CHAVE = 'financas:estado:v2'
/** Cópia do estado tal como estava antes dos indicadores. Escrita uma só vez. */
const CHAVE_COPIA = 'financas:copia-antes-dos-indicadores'

export const novoId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2)

export interface Estado {
  orcamento: Orcamento
}

/**
 * Os ids são fixos, e não gerados: dois aparelhos que instalem a app de novo têm
 * de criar exatamente as mesmas categorias de arranque, senão a sincronização
 * junta as duas listas e fica tudo a dobrar.
 *
 * Categorias e valores de arranque a partir da realidade medida: transporte
 * Braga–Sintra duas viagens por semana, alimentação suplementar, barbeiro e
 * telemóvel dão ~276 €/mês de essenciais.
 *
 * Claude e Google One entram como não essenciais de propósito — o erro comum é
 * classificar como essencial tudo aquilo de que não nos queremos privar.
 */
const categoriasIniciais = () => [
  { id: 'transporte', nome: 'Transporte Braga ↔ Sintra', fatia: 'essencial' as const },
  { id: 'alimentacao', nome: 'Alimentação suplementar', fatia: 'essencial' as const },
  { id: 'barbeiro', nome: 'Barbeiro', fatia: 'essencial' as const },
  { id: 'telemovel', nome: 'Telemóvel', fatia: 'essencial' as const },
  { id: 'restaurantes', nome: 'Restaurantes', fatia: 'naoEssencial' as const },
  { id: 'saidas', nome: 'Viagens e saídas', fatia: 'naoEssencial' as const },
  { id: 'compras', nome: 'Compras', fatia: 'naoEssencial' as const },
  { id: 'claude', nome: 'Claude', fatia: 'naoEssencial' as const },
  { id: 'google-one', nome: 'Google One', fatia: 'naoEssencial' as const },
]

/**
 * Carteira de arranque: os ETFs, pesos e aportes do próprio utilizador.
 *
 * Os ids são fixos e legíveis de propósito. As fotografias guardam valores por id
 * de ETF e a app vai sincronizar entre dois aparelhos: ids aleatórios seriam
 * diferentes em cada um e os valores deixavam de bater.
 */
const investimentosIniciais = (): Investimentos => ({
  etfs: [
    { id: 'iwda', nome: 'IWDA', pesoAlvo: 79, aporteBase: 110, papel: 'global' },
    { id: 'eimi', nome: 'EIMI', pesoAlvo: 11, aporteBase: 50, papel: 'emergentes' },
    { id: 'defense', nome: 'VanEck Defense', pesoAlvo: 5, aporteBase: 20, papel: 'tematico' },
    { id: 'digital', nome: 'iShares Digital Security', pesoAlvo: 5, aporteBase: 20, papel: 'tematico' },
  ],
  tetoTematicos: 10,
  emergentesMin: 9,
  emergentesMax: 15,
})

const ORDEM_INDICADORES: Indicador[] = ['pesos', 'poupanca', 'casamento']

/** As listas cujos registos a sincronização funde um a um. */
const LISTAS = [
  'categorias',
  'despesas',
  'objetivos',
  'aportes',
  'saldos',
  'compromissos',
  'revisoes',
  'regras',
] as const

/**
 * Marcas de partida para os dados que já existiam antes da sincronização.
 *
 * A data é fixa, e não a de agora, de propósito: os dois aparelhos têm de gerar
 * exatamente as mesmas marcas para os mesmos registos, senão o que migrasse mais
 * tarde ganhava a fusão inteira sem ter mexido em nada. O índice dentro de cada
 * lista preserva a ordem atual, que é por onde a fusão depois ordena.
 */
function marcasIniciais(o: Orcamento): Sincronizacao {
  const alteradoEm: Record<string, string> = {}
  for (const lista of LISTAS) {
    const registos = (o[lista] ?? []) as { id: string }[]
    registos.forEach((r, i) => {
      alteradoEm[r.id] = new Date(i * 1000).toISOString()
    })
  }
  return { alteradoEm, apagados: {} }
}

export const orcamentoInicial = (): Orcamento => ({
  rendimentoMensal: 600,
  vencimentosPorAno: 14,
  // Rácios da fase atual, calculados sobre os essenciais reais (~276 €) e não
  // tirados de um livro. São temporários: os essenciais não sobem com o vencimento,
  // por isso a poupança deve subir muito na mudança de escalão — ver as revisões.
  alvoEssencial: 46,
  alvoNaoEssencial: 16,
  categorias: categoriasIniciais(),
  despesas: [],
  objetivos: [{ id: 'casamento', nome: 'Casamento', valorAlvo: 6500, dataAlvo: '2029-01' }],
  aportes: [],
  saldos: [],
  compromissos: [{ id: 'voo-brasil', nome: 'Voo para o Brasil', valor: 1000 }],
  revisoes: [
    {
      id: 'rev-aspirante',
      data: '2027-01',
      titulo: 'Mudança de escalão — Aspirante',
      nota: 'Líquido sobe para ~1800 €/mês e os essenciais mantêm-se em ~276 €: caem para ~15% do rendimento. Recalcular os rácios — a poupança pode subir para 60-70% sem sacrifício. (6.º ano, Alferes: ~2200 €/mês.)',
    },
    {
      id: 'rev-tirocinio',
      data: '2027-01',
      titulo: 'Reunião do tirocínio no Brasil',
      nota: 'Decisão do comando. Se avançar, reabrir a alocação com o capital novo.',
    },
    {
      id: 'rev-casamento',
      data: '2028-06',
      titulo: 'Casamento e decisão de casa',
      nota: 'Reavaliar o alvo e o destino do dinheiro à medida que a data se aproxima.',
    },
  ],
  almofadaAlvo: 800,
  regras: [],
  linhasIgnoradas: [],
  investimentos: investimentosIniciais(),
  ordemIndicadores: [...ORDEM_INDICADORES],
  sincronizacao: { alteradoEm: {}, apagados: {} },
  ultimaRevisao: mesAtual(),
  rendimentoNaRevisao: 600,
})

export const estadoInicial = (): Estado => ({ orcamento: orcamentoInicial() })

/**
 * Preenche campos em falta e traz dados de versões anteriores. As `decisoes`
 * passaram a ser `aportes` quando a poupança deixou de ser um resíduo e passou a
 * ser dinheiro efetivamente transferido.
 */
export function migrar(guardado: Partial<Orcamento> | undefined): Orcamento {
  const base = orcamentoInicial()
  const antigo = guardado as (Partial<Orcamento> & { decisoes?: Aporte[] }) | undefined
  const orcamento: Orcamento = { ...base, ...(guardado ?? {}) }
  if (!Array.isArray(guardado?.aportes) && Array.isArray(antigo?.decisoes)) {
    orcamento.aportes = antigo.decisoes
  }
  if (!Array.isArray(orcamento.aportes)) orcamento.aportes = []
  if (!Array.isArray(orcamento.saldos)) orcamento.saldos = []
  if (!Array.isArray(orcamento.compromissos)) orcamento.compromissos = []
  if (!Array.isArray(orcamento.revisoes)) orcamento.revisoes = []
  if (!Array.isArray(orcamento.regras)) orcamento.regras = []
  if (!Array.isArray(orcamento.linhasIgnoradas)) orcamento.linhasIgnoradas = []
  if (typeof orcamento.almofadaAlvo !== 'number') orcamento.almofadaAlvo = base.almofadaAlvo
  // A carteira configurada é do utilizador: só se cria quando não existe nenhuma.
  if (!Array.isArray(orcamento.investimentos?.etfs)) {
    orcamento.investimentos = base.investimentos
  }
  if (
    !Array.isArray(orcamento.ordemIndicadores) ||
    orcamento.ordemIndicadores.length !== ORDEM_INDICADORES.length
  ) {
    orcamento.ordemIndicadores = [...ORDEM_INDICADORES]
  }
  // Olha-se ao que estava guardado, não ao resultado: os valores de arranque já
  // trazem a tabela de marcas vazia, e com ela os dados antigos nunca a ganhavam.
  if (!guardado?.sincronizacao?.alteradoEm) {
    orcamento.sincronizacao = { ...orcamento.sincronizacao, ...marcasIniciais(orcamento) }
  }
  // Fotografias antigas não tinham certificados; a reserva em reais foi removida.
  orcamento.saldos = orcamento.saldos.map((s) => {
    const { brl: _brl, ...resto } = s as Saldo & { brl?: number }
    return { ...resto, certificados: typeof s.certificados === 'number' ? s.certificados : 0 }
  })
  // Os potes por fatia fundiram-se num só: a fonte da saída deixou de distinguir
  // de que fatia veio o excedente.
  orcamento.aportes = orcamento.aportes.map((ap) =>
    ap.fonte === 'planeado' ? ap : { ...ap, fonte: 'excedente' as const },
  )
  // A chave antiga não fica a viver para sempre nas exportações.
  delete (orcamento as Partial<Orcamento> & { decisoes?: unknown }).decisoes
  return orcamento
}

/**
 * Guarda uma vez, intacto, o estado tal como estava antes dos indicadores.
 *
 * A migração é feita para não perder nada, mas é código novo a correr sobre os
 * únicos dados que existem. Esta cópia é a rede: fica no aparelho, não é tocada
 * depois da primeira vez, e permite voltar atrás sem depender de ter havido um
 * export manual.
 */
function guardarCopiaUnica(bruto: string): void {
  try {
    if (localStorage.getItem(CHAVE_COPIA) === null) localStorage.setItem(CHAVE_COPIA, bruto)
  } catch {
    // Sem espaço para a cópia, a app continua: é uma salvaguarda, não um requisito.
  }
}

export function carregar(): Estado {
  try {
    const bruto = localStorage.getItem(CHAVE)
    if (!bruto) return estadoInicial()
    guardarCopiaUnica(bruto)
    const guardado = JSON.parse(bruto) as Partial<Estado>
    return { orcamento: migrar(guardado.orcamento) }
  } catch {
    return estadoInicial()
  }
}

export function guardar(estado: Estado): void {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(estado))
  } catch {
    // Modo privado ou quota cheia: a app continua a funcionar em memória.
  }
}

/**
 * Lê uma exportação. O armazenamento local está preso à origem do endereço, por
 * isso mudar de URL (rede local → GitHub Pages) obriga a exportar e reimportar.
 */
export async function lerFicheiro(ficheiro: File): Promise<Estado> {
  let dados: unknown
  try {
    dados = JSON.parse(await ficheiro.text())
  } catch {
    // Sem mensagens cruas do motor de JavaScript à frente do utilizador.
    throw new Error('O ficheiro está danificado ou não é um JSON válido.')
  }
  const candidato = dados as Partial<Estado>
  if (
    !candidato ||
    typeof candidato !== 'object' ||
    !candidato.orcamento ||
    !Array.isArray(candidato.orcamento.despesas) ||
    !Array.isArray(candidato.orcamento.categorias)
  ) {
    throw new Error('Este ficheiro não parece uma exportação da app.')
  }
  // A mesma migração do arranque: uma cópia antiga tem de continuar a servir.
  return { orcamento: migrar(candidato.orcamento) }
}

export function exportar(estado: Estado): void {
  const blob = new Blob([JSON.stringify(estado, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `financas-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * O token vive à parte do estado, de propósito.
 *
 * Se estivesse dentro do orçamento, ia parar à exportação em JSON e, pior, ao
 * próprio ficheiro que se envia para o repositório — uma credencial a viajar
 * com os dados que ela protege.
 */
const CHAVE_TOKEN = 'financas:token-github'

export function lerToken(): string {
  try {
    return localStorage.getItem(CHAVE_TOKEN) ?? ''
  } catch {
    return ''
  }
}

export function guardarToken(token: string): void {
  try {
    if (token === '') localStorage.removeItem(CHAVE_TOKEN)
    else localStorage.setItem(CHAVE_TOKEN, token)
  } catch {
    // Modo privado: a sincronização fica por esta sessão.
  }
}
