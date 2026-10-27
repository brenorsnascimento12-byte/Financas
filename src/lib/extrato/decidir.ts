import type { Categoria, Despesa, Regra } from '../../types'
import { ehTransferencia, type MovimentoClassificado } from './classificar'

export type Decisao =
  | {
      tipo: 'despesa'
      categoriaId: string
      /**
       * Guardar a regra para este descritivo. Por omissão aprende-se tudo menos
       * as transferências, cujo motivo muda de vez para vez.
       */
      lembrar?: boolean
    }
  /**
   * Um crédito que devolve dinheiro gasto (a parte de um amigo numa viagem, um
   * jantar ressarcido). Abate na categoria do gasto; não é rendimento.
   */
  | { tipo: 'reembolso'; categoriaId: string }
  /** Um crédito que é o ordenado: atualiza o rendimento mensal, não cria registo. */
  | { tipo: 'rendimento' }
  | { tipo: 'ignorar' }

export interface Aplicacao {
  /** Despesas a acrescentar às existentes. Os reembolsos entram com valor negativo. */
  despesas: Despesa[]
  /**
   * Regras novas ou atualizadas. Uma atualizada mantém o id da existente e
   * deve substituí-la.
   */
  regras: Regra[]
  /** Impressões digitais a silenciar em importações futuras. */
  linhasIgnoradas: string[]
  /** Definido quando alguma linha foi marcada como o ordenado. */
  rendimentoMensal?: number
}

/**
 * Decisões com que a fila abre: a categoria que uma regra sugere, já escolhida.
 * Continua a ser só uma sugestão — o utilizador vê-a e pode mudá-la antes de
 * escrever.
 */
export function decisoesSugeridas(
  emFalta: MovimentoClassificado[],
  categorias: Categoria[],
): Record<string, Decisao> {
  const ativas = new Set(categorias.filter((c) => !c.arquivada).map((c) => c.id))
  const r: Record<string, Decisao> = {}
  for (const c of emFalta) {
    if (c.movimento.sinal !== 'debito') continue
    if (c.tipo !== 'despesa' || !c.categoriaSugerida) continue
    if (!ativas.has(c.categoriaSugerida)) continue
    r[c.movimento.id] = { tipo: 'despesa', categoriaId: c.categoriaSugerida }
  }
  return r
}

/**
 * Traduz as decisões da triagem no que vai ser escrito.
 *
 * Vive fora do componente de propósito: é a única parte do leitor que altera
 * dados do utilizador, e tem de ser testável sem montar interface nenhuma.
 */
export function aplicarDecisoes(
  emFalta: MovimentoClassificado[],
  decisoes: Record<string, Decisao>,
  regrasExistentes: Regra[],
  gerarId: () => string,
): Aplicacao {
  const despesas: Despesa[] = []
  const regras: Regra[] = []
  const linhasIgnoradas: string[] = []
  let rendimentoMensal: number | undefined

  for (const c of emFalta) {
    const decisao = decisoes[c.movimento.id] ?? { tipo: 'ignorar' as const }
    const credito = c.movimento.sinal === 'credito'

    if (decisao.tipo === 'rendimento') {
      rendimentoMensal = c.movimento.valor
      linhasIgnoradas.push(c.movimento.id)
      continue
    }

    if (decisao.tipo === 'reembolso' && credito) {
      // Negativo: abate no total da categoria. A linha fica silenciada porque um
      // registo negativo nunca emparelha com um crédito no cruzamento, e sem
      // isto voltava à fila em cada importação.
      despesas.push({
        id: gerarId(),
        data: c.movimento.data,
        valor: -c.movimento.valor,
        categoriaId: decisao.categoriaId,
        nota: `Reembolso: ${c.movimento.chave}`,
      })
      linhasIgnoradas.push(c.movimento.id)
      continue
    }

    // Um crédito nunca pode virar despesa, mesmo que a decisão o diga: seria
    // registar o ordenado como gasto por causa de um toque errado. E um débito
    // não pode ser reembolso.
    if (decisao.tipo !== 'despesa' || credito) {
      linhasIgnoradas.push(c.movimento.id)
      continue
    }

    // A compra e as suas comissões ficam registos separados, na mesma
    // categoria, para os totais não mentirem.
    for (const parte of [c.movimento, ...c.comissoes]) {
      despesas.push({
        id: gerarId(),
        data: parte.data,
        valor: parte.valor,
        categoriaId: decisao.categoriaId,
        nota: parte.chave,
      })
    }

    const transferencia = ehTransferencia(c.movimento)
    if (!(decisao.lembrar ?? !transferencia)) continue

    const padrao = c.movimento.chave
    if (regras.some((r) => r.padrao === padrao)) continue
    const existente = regrasExistentes.find((r) => r.padrao === padrao)

    if (!existente) {
      regras.push({
        id: gerarId(),
        padrao,
        tipo: 'despesa',
        categoriaId: decisao.categoriaId,
        ...(transferencia ? { explicita: true } : {}),
      })
    } else if (transferencia && !existente.explicita) {
      // Regra antiga, aprendida em silêncio: passa a valer porque foi pedida.
      regras.push({ ...existente, tipo: 'despesa', categoriaId: decisao.categoriaId, explicita: true })
    }
  }

  return { despesas, regras, linhasIgnoradas, rendimentoMensal }
}
