import { describe, expect, it } from 'vitest'
import { orcamentoInicial } from './armazenamento'

describe('orcamentoInicial', () => {
  it('traz as listas novas vazias', () => {
    const o = orcamentoInicial()
    expect(o.regras).toEqual([])
    expect(o.linhasIgnoradas).toEqual([])
  })
})
