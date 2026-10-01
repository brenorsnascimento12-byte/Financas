import { describe, expect, it } from 'vitest'
import type { MovimentoExtrato, Regra } from '../../types'
import { classificar } from './classificar'

const mov = (p: Partial<MovimentoExtrato>): MovimentoExtrato => ({
  id: p.id ?? 'x',
  data: p.data ?? '2026-08-06',
  dataValor: p.dataValor ?? '2026-08-06',
  descritivo: p.descritivo ?? 'QUALQUER COISA',
  chave: p.chave ?? (p.descritivo ?? 'QUALQUER COISA').toUpperCase(),
  valor: p.valor ?? 10,
  sinal: p.sinal ?? 'debito',
  saldo: p.saldo ?? 0,
})

describe('classificar', () => {
  it('trata um débito desconhecido como despesa', () => {
    const [r] = classificar([mov({ chave: 'MCDONALDS MT5 BRAGA' })], [])
    expect(r.tipo).toBe('despesa')
  })

  it('trata um crédito desconhecido como rendimento', () => {
    const [r] = classificar([mov({ chave: 'ALGUMA COISA', sinal: 'credito' })], [])
    expect(r.tipo).toBe('rendimento')
  })

  it('reconhece transferências', () => {
    const [r] = classificar([mov({ chave: 'TRF MB WAY P/ ALGUEM' })], [])
    expect(r.tipo).toBe('transferencia')
  })

  it('anexa a comissão à compra do mesmo dia', () => {
    const compra = mov({ id: 'c', chave: 'ANTHROPIC CLAUDE SUB', valor: 22.14 })
    const selo = mov({ id: 's', chave: 'IMPOSTO DO SELO', valor: 0.03 })
    const r = classificar([compra, selo], [])
    expect(r).toHaveLength(1)
    expect(r[0].comissoes.map((c) => c.id)).toEqual(['s'])
    expect(r[0].comissoes[0].paiId).toBe('c')
  })

  it('deixa a comissão autónoma quando não há compra-mãe nesse dia', () => {
    // Primeira linha do extrato, ou mãe no mês anterior: não pode desaparecer.
    const selo = mov({ id: 's', chave: 'IMPOSTO DO SELO', valor: 0.03 })
    const r = classificar([selo], [])
    expect(r).toHaveLength(1)
    expect(r[0].tipo).toBe('comissao')
    expect(r[0].movimento.paiId).toBeUndefined()
  })

  it('não anexa a comissão a uma compra de outro dia', () => {
    const compra = mov({ id: 'c', data: '2026-08-05', chave: 'ALGO', valor: 5 })
    const selo = mov({ id: 's', data: '2026-08-06', chave: 'IMPOSTO DO SELO', valor: 0.03 })
    const r = classificar([compra, selo], [])
    expect(r).toHaveLength(2)
    expect(r[1].tipo).toBe('comissao')
  })

  it('aplica a regra e sugere a categoria', () => {
    const regras: Regra[] = [
      { id: 'r', padrao: 'PINGO DOCE', tipo: 'despesa', categoriaId: 'cat-alim' },
    ]
    const [r] = classificar([mov({ chave: 'PINGO DOCE TAIPAS GUIMARAES' })], regras)
    expect(r.tipo).toBe('despesa')
    expect(r.categoriaSugerida).toBe('cat-alim')
  })

  it('a regra ganha à deteção de transferência', () => {
    const regras: Regra[] = [{ id: 'r', padrao: 'TRF MB WAY P/ ALGUEM', tipo: 'aporte' }]
    const [r] = classificar([mov({ chave: 'TRF MB WAY P/ ALGUEM' })], regras)
    expect(r.tipo).toBe('aporte')
  })

  it('a comissão ganha à regra', () => {
    // Uma regra demasiado larga não deve transformar uma comissão em despesa solta.
    const regras: Regra[] = [{ id: 'r', padrao: 'IMPOSTO', tipo: 'despesa', categoriaId: 'c' }]
    const compra = mov({ id: 'c', chave: 'ALGO', valor: 5 })
    const selo = mov({ id: 's', chave: 'IMPOSTO DO SELO', valor: 0.03 })
    const r = classificar([compra, selo], regras)
    expect(r).toHaveLength(1)
    expect(r[0].comissoes).toHaveLength(1)
  })
})
