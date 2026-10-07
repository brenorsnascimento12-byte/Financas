import type { Despesa, Regra } from '../../types'
import type { MovimentoClassificado } from './classificar'

export type Decisao =
  | { tipo: 'despesa'; categoriaId: string }
  /** Um crédito que é o ordenado: atualiza o rendimento mensal, não cria registo. */
  | { tipo: 'rendimento' }
  | { tipo: 'ignorar' }

export interface Aplicacao {
  /** Despesas a acrescentar às existentes. */
  despesas: Despesa[]
  /** Regras novas, já sem as que existiam. */
  regras: Regra[]
  /** Impressões digitais a silenciar em importações futuras. */
  linhasIgnoradas: string[]
  /** Definido quando alguma linha foi marcada como o ordenado. */
  rendimentoMensal?: number
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

    if (decisao.tipo === 'rendimento') {
      rendimentoMensal = c.movimento.valor
      linhasIgnoradas.push(c.movimento.id)
      continue
    }

    // Um crédito nunca pode virar despesa, mesmo que a decisão o diga: seria
    // registar o ordenado como gasto por causa de um toque errado.
    if (decisao.tipo === 'ignorar' || c.movimento.sinal === 'credito') {
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

    const jaExiste =
      regrasExistentes.some((r) => r.padrao === c.movimento.chave) ||
      regras.some((r) => r.padrao === c.movimento.chave)
    if (!jaExiste) {
      regras.push({
        id: gerarId(),
        padrao: c.movimento.chave,
        tipo: 'despesa',
        categoriaId: decisao.categoriaId,
      })
    }
  }

  return { despesas, regras, linhasIgnoradas, rendimentoMensal }
}
