import { describe, expect, it } from 'vitest'
import type { MovimentoExtrato, Regra } from '../../types'
import type { MovimentoClassificado } from './classificar'
import { aplicarDecisoes, type Decisao } from './decidir'

let contador = 0
const idFixo = () => `id-${++contador}`

const mov = (p: Partial<MovimentoExtrato>): MovimentoExtrato => ({
  id: p.id ?? 'm1',
  data: p.data ?? '2026-09-08',
  dataValor: p.dataValor ?? '2026-09-08',
  descritivo: p.descritivo ?? 'ALGO',
  chave: p.chave ?? 'ALGO',
  valor: p.valor ?? 10,
  sinal: p.sinal ?? 'debito',
  saldo: p.saldo ?? 0,
})

const item = (
  m: Partial<MovimentoExtrato>,
  comissoes: MovimentoExtrato[] = [],
): MovimentoClassificado => ({ movimento: mov(m), tipo: 'despesa', comissoes })

describe('aplicarDecisoes', () => {
  it('ignorar não escreve nada e guarda a impressão digital', () => {
    const r = aplicarDecisoes([item({ id: 'm1' })], { m1: { tipo: 'ignorar' } }, [], idFixo)
    expect(r.despesas).toEqual([])
    expect(r.linhasIgnoradas).toEqual(['m1'])
  })

  it('trata a ausência de decisão como ignorar', () => {
    const r = aplicarDecisoes([item({ id: 'm1' })], {}, [], idFixo)
    expect(r.despesas).toEqual([])
    expect(r.linhasIgnoradas).toEqual(['m1'])
  })

  it('cria a despesa com o valor e a data do movimento', () => {
    const d: Record<string, Decisao> = { m1: { tipo: 'despesa', categoriaId: 'cat' } }
    const r = aplicarDecisoes([item({ id: 'm1', valor: 22.14, data: '2026-09-08' })], d, [], idFixo)
    expect(r.despesas).toHaveLength(1)
    expect(r.despesas[0]).toMatchObject({ valor: 22.14, data: '2026-09-08', categoriaId: 'cat' })
  })

  it('cria registos separados para as comissões, na mesma categoria', () => {
    const comissoes = [mov({ id: 'c1', chave: 'IMPOSTO DO SELO', valor: 0.03 })]
    const d: Record<string, Decisao> = { m1: { tipo: 'despesa', categoriaId: 'cat' } }
    const r = aplicarDecisoes([item({ id: 'm1', valor: 22.14 }, comissoes)], d, [], idFixo)
    expect(r.despesas).toHaveLength(2)
    expect(r.despesas.map((x) => x.valor)).toEqual([22.14, 0.03])
    expect(r.despesas.every((x) => x.categoriaId === 'cat')).toBe(true)
  })

  it('NUNCA transforma um crédito em despesa', () => {
    // O vencimento aparece na fila como qualquer outra linha. Um toque errado
    // no seletor não pode criar uma despesa de 556 €.
    const d: Record<string, Decisao> = { m1: { tipo: 'despesa', categoriaId: 'cat' } }
    const r = aplicarDecisoes(
      [item({ id: 'm1', valor: 556.04, sinal: 'credito' })],
      d,
      [],
      idFixo,
    )
    expect(r.despesas).toEqual([])
    expect(r.linhasIgnoradas).toEqual(['m1'])
  })

  it('aprende a regra ao categorizar', () => {
    const d: Record<string, Decisao> = { m1: { tipo: 'despesa', categoriaId: 'cat' } }
    const r = aplicarDecisoes([item({ id: 'm1', chave: 'PINGO DOCE' })], d, [], idFixo)
    expect(r.regras).toHaveLength(1)
    expect(r.regras[0]).toMatchObject({ padrao: 'PINGO DOCE', categoriaId: 'cat' })
  })

  it('não duplica uma regra que já existe', () => {
    const existentes: Regra[] = [{ id: 'r', padrao: 'PINGO DOCE', tipo: 'despesa', categoriaId: 'x' }]
    const d: Record<string, Decisao> = { m1: { tipo: 'despesa', categoriaId: 'cat' } }
    const r = aplicarDecisoes([item({ id: 'm1', chave: 'PINGO DOCE' })], d, existentes, idFixo)
    expect(r.regras).toEqual([])
  })

  it('usar como rendimento devolve o valor e não cria despesa', () => {
    const d: Record<string, Decisao> = { m1: { tipo: 'rendimento' } }
    const r = aplicarDecisoes(
      [item({ id: 'm1', valor: 556.04, sinal: 'credito' })],
      d,
      [],
      idFixo,
    )
    expect(r.despesas).toEqual([])
    expect(r.rendimentoMensal).toBe(556.04)
    expect(r.linhasIgnoradas).toEqual(['m1'])
  })
})
