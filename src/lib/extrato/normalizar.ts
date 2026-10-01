/**
 * Converte um número do extrato. Os PDFs usam espaço (normal ou inseparável)
 * nos milhares e ponto decimal — ao contrário da vírgula habitual em Portugal.
 */
export function normalizarNumero(texto: string): number {
  const limpo = texto.replace(/[\s ]/g, '')
  const n = Number(limpo)
  if (limpo === '' || !Number.isFinite(n)) throw new Error(`Não é um número: "${texto}"`)
  return n
}

/**
 * As linhas do extrato só trazem `M.DD`. O ano vem do período do cabeçalho.
 * Num extrato que atravesse a passagem de ano, os meses que não cabem no ano
 * final pertencem ao inicial.
 */
export function resolverAno(mes: number, periodo: { inicio: string; fim: string }): number {
  const anoInicio = Number(periodo.inicio.slice(0, 4))
  const anoFim = Number(periodo.fim.slice(0, 4))
  if (anoInicio === anoFim) return anoInicio
  const mesFim = Number(periodo.fim.slice(5, 7))
  return mes > mesFim ? anoInicio : anoFim
}

/** Remove o número do cartão, que se repete em todas as compras e é ruído. */
export function normalizarChave(descritivo: string): string {
  return descritivo
    .replace(/^COMPRA\s+\d{4}\s+/i, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/** Identidade estável de uma linha, para a reconhecer entre importações. */
export function impressaoDigital(
  data: string,
  valor: number,
  chave: string,
  ocorrencia: number,
): string {
  return `${data}|${valor.toFixed(2)}|${chave}|${ocorrencia}`
}
