import type { MovimentoExtrato, Regra, TipoMovimento } from '../../types'

export interface MovimentoClassificado {
  movimento: MovimentoExtrato
  tipo: TipoMovimento | 'ignorar'
  /** Preenchido quando uma regra sugeriu categoria. */
  categoriaSugerida?: string
  /** Comissões anexadas a este movimento. */
  comissoes: MovimentoExtrato[]
}

const COMISSOES = ['IMPOSTO DO SELO', 'CUSTO DE SERVICO INTERNACIONAL', 'COMISSAO']
const ehComissao = (m: MovimentoExtrato) => COMISSOES.some((c) => m.chave.includes(c))
const ehTransferencia = (m: MovimentoExtrato) =>
  m.chave.startsWith('TRF') || m.chave.includes('MB WAY')

/**
 * Classifica cada movimento e anexa as comissões à compra que as gerou.
 *
 * Precedência: comissão primeiro (uma regra larga de mais não pode transformar
 * um imposto do selo numa despesa solta), depois a regra aprendida, depois a
 * deteção de transferência, e por fim o sinal decide entre despesa e rendimento.
 */
export function classificar(
  movimentos: MovimentoExtrato[],
  regras: Regra[],
): MovimentoClassificado[] {
  const resultado: MovimentoClassificado[] = []

  for (const m of movimentos) {
    if (ehComissao(m)) {
      // Procura a compra-mãe: o último movimento não-comissão do mesmo dia.
      const mae = [...resultado]
        .reverse()
        .find((r) => r.movimento.data === m.data && r.tipo !== 'comissao')
      if (mae) {
        mae.comissoes.push({ ...m, paiId: mae.movimento.id })
        continue
      }
      resultado.push({ movimento: m, tipo: 'comissao', comissoes: [] })
      continue
    }

    const regra = regras.find((r) => r.padrao !== '' && m.chave.includes(r.padrao))
    if (regra) {
      resultado.push({
        movimento: m,
        tipo: regra.tipo,
        categoriaSugerida: regra.categoriaId,
        comissoes: [],
      })
      continue
    }

    const tipo: TipoMovimento = ehTransferencia(m)
      ? 'transferencia'
      : m.sinal === 'debito'
        ? 'despesa'
        : 'rendimento'
    resultado.push({ movimento: m, tipo, comissoes: [] })
  }

  return resultado
}
