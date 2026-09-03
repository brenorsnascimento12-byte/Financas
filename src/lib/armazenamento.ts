import type { Aporte, Orcamento, Saldo } from '../types'
import { mesAtual } from './orcamento'

const CHAVE = 'financas:estado:v2'

export const novoId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2)

export interface Estado {
  orcamento: Orcamento
}

/**
 * Categorias e valores de arranque a partir da realidade medida: transporte
 * Braga–Sintra duas viagens por semana, alimentação suplementar, barbeiro e
 * telemóvel dão ~276 €/mês de essenciais.
 *
 * Claude e Google One entram como não essenciais de propósito — o erro comum é
 * classificar como essencial tudo aquilo de que não nos queremos privar.
 */
const categoriasIniciais = () => [
  { id: novoId(), nome: 'Transporte Braga ↔ Sintra', fatia: 'essencial' as const },
  { id: novoId(), nome: 'Alimentação suplementar', fatia: 'essencial' as const },
  { id: novoId(), nome: 'Barbeiro', fatia: 'essencial' as const },
  { id: novoId(), nome: 'Telemóvel', fatia: 'essencial' as const },
  { id: novoId(), nome: 'Restaurantes', fatia: 'naoEssencial' as const },
  { id: novoId(), nome: 'Viagens e saídas', fatia: 'naoEssencial' as const },
  { id: novoId(), nome: 'Compras', fatia: 'naoEssencial' as const },
  { id: novoId(), nome: 'Claude', fatia: 'naoEssencial' as const },
  { id: novoId(), nome: 'Google One', fatia: 'naoEssencial' as const },
]

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
  objetivos: [{ id: novoId(), nome: 'Casamento', valorAlvo: 6500, dataAlvo: '2029-01' }],
  aportes: [],
  saldos: [],
  compromissos: [{ id: novoId(), nome: 'Voo para o Brasil', valor: 1000 }],
  revisoes: [
    {
      id: novoId(),
      data: '2027-01',
      titulo: 'Mudança de escalão — Aspirante',
      nota: 'Líquido sobe para ~1800 €/mês e os essenciais mantêm-se em ~276 €: caem para ~15% do rendimento. Recalcular os rácios — a poupança pode subir para 60-70% sem sacrifício. (6.º ano, Alferes: ~2200 €/mês.)',
    },
    {
      id: novoId(),
      data: '2027-01',
      titulo: 'Reunião do tirocínio no Brasil',
      nota: 'Decisão do comando. Se avançar, reabrir a alocação com o capital novo.',
    },
    {
      id: novoId(),
      data: '2028-06',
      titulo: 'Casamento e decisão de casa',
      nota: 'Reavaliar o alvo e o destino do dinheiro à medida que a data se aproxima.',
    },
  ],
  almofadaAlvo: 800,
  ultimaRevisao: mesAtual(),
  rendimentoNaRevisao: 600,
})

export const estadoInicial = (): Estado => ({ orcamento: orcamentoInicial() })

/**
 * Preenche campos em falta e traz dados de versões anteriores. As `decisoes`
 * passaram a ser `aportes` quando a poupança deixou de ser um resíduo e passou a
 * ser dinheiro efetivamente transferido.
 */
function migrar(guardado: Partial<Orcamento> | undefined): Orcamento {
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
  if (typeof orcamento.almofadaAlvo !== 'number') orcamento.almofadaAlvo = base.almofadaAlvo
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

export function carregar(): Estado {
  try {
    const bruto = localStorage.getItem(CHAVE)
    if (!bruto) return estadoInicial()
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
