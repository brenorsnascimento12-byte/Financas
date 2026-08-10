import type { Aporte, Orcamento } from '../types'
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
 * Categorias de arranque a partir da realidade descrita: viagens casa/AFA duas
 * vezes por semana, suplemento alimentar, subscrições, e o gasto de fim de semana.
 * Claude e Google One entram como não essenciais de propósito — o erro comum é
 * classificar como essencial tudo aquilo de que não nos queremos privar. Muda se
 * discordares, é um clique.
 */
const categoriasIniciais = () => [
  { id: novoId(), nome: 'Viagens casa ↔ AFA', fatia: 'essencial' as const },
  { id: novoId(), nome: 'Suplemento alimentar', fatia: 'essencial' as const },
  { id: novoId(), nome: 'Telemóvel', fatia: 'essencial' as const },
  { id: novoId(), nome: 'Gasolina (fim de semana)', fatia: 'naoEssencial' as const },
  { id: novoId(), nome: 'Restaurantes', fatia: 'naoEssencial' as const },
  { id: novoId(), nome: 'Viagens e saídas', fatia: 'naoEssencial' as const },
  { id: novoId(), nome: 'Compras', fatia: 'naoEssencial' as const },
  { id: novoId(), nome: 'Claude', fatia: 'naoEssencial' as const },
  { id: novoId(), nome: 'Google One', fatia: 'naoEssencial' as const },
]

export const orcamentoInicial = (): Orcamento => ({
  rendimentoMensal: 1000,
  vencimentosPorAno: 14,
  // O 50/30/20 que já usavas, como ponto de partida. Ajustamos depois de medir
  // os primeiros meses reais em vez de fixar um alvo tirado de um livro.
  alvoEssencial: 50,
  alvoNaoEssencial: 30,
  categorias: categoriasIniciais(),
  despesas: [],
  objetivos: [],
  aportes: [],
  saldos: [],
  ultimaRevisao: mesAtual(),
  rendimentoNaRevisao: 1000,
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
