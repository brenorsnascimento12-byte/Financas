import { describe, expect, it } from 'vitest'
import type { MovimentoExtrato } from '../../types'
import type { MovimentoClassificado } from './classificar'
import { conciliar } from './conciliar'
import type { Cruzamento, RegistoApp } from './cruzar'

const mov = (p: Partial<MovimentoExtrato>): MovimentoExtrato => ({
  id: p.id ?? 'm',
  data: p.data ?? '2026-09-10',
  dataValor: p.dataValor ?? '2026-09-10',
  descritivo: p.descritivo ?? 'ALGO',
  chave: p.chave ?? 'ALGO',
  valor: p.valor ?? 10,
  sinal: p.sinal ?? 'debito',
  saldo: p.saldo ?? 0,
})

const item = (
  p: Partial<MovimentoExtrato>,
  comissoes: MovimentoExtrato[] = [],
): MovimentoClassificado => ({ movimento: mov(p), tipo: 'despesa', comissoes })

const vazio = (): Cruzamento => ({
  conferidos: [],
  emFalta: [],
  soNaApp: [],
  ambiguos: [],
})

describe('conciliar', () => {
  it('soma as saídas e as entradas do extrato', () => {
    const todos = [
      item({ id: 'a', valor: 30 }),
      item({ id: 'b', valor: 20 }),
      item({ id: 'c', valor: 556.04, sinal: 'credito' }),
    ]
    const r = conciliar(todos, [], { ...vazio(), emFalta: todos })
    expect(r.saidasExtrato).toBe(50)
    expect(r.entradasExtrato).toBe(556.04)
  })

  it('inclui as comissões nas saídas', () => {
    const comissoes = [mov({ id: 'c1', valor: 0.85 }), mov({ id: 'c2', valor: 0.03 })]
    const todos = [item({ id: 'a', valor: 22.14 }, comissoes)]
    const r = conciliar(todos, [], { ...vazio(), emFalta: todos })
    expect(r.saidasExtrato).toBeCloseTo(23.02, 2)
  })

  it('reparte as saídas entre conferido, em falta e ignorado', () => {
    const conferido = item({ id: 'a', valor: 30 })
    const falta = item({ id: 'b', valor: 20 })
    const silenciado = item({ id: 'c', valor: 5 })
    const cruzamento: Cruzamento = {
      ...vazio(),
      conferidos: [{ movimento: conferido, registoId: 'd1' }],
      emFalta: [falta],
    }
    const r = conciliar([conferido, falta, silenciado], ['c'], cruzamento)
    expect(r.conferido).toBe(30)
    expect(r.emFalta).toBe(20)
    expect(r.ignorado).toBe(5)
  })

  it('fecha a conta quando tudo está contabilizado', () => {
    const conferido = item({ id: 'a', valor: 30 })
    const falta = item({ id: 'b', valor: 20 })
    const cruzamento: Cruzamento = {
      ...vazio(),
      conferidos: [{ movimento: conferido, registoId: 'd1' }],
      emFalta: [falta],
    }
    const r = conciliar([conferido, falta], [], cruzamento)
    expect(r.bate).toBe(true)
    expect(r.diferenca).toBe(0)
  })

  it('não fecha a conta quando falta explicar uma saída', () => {
    // Um movimento que não aparece em nenhum grupo: sinal de que o cruzamento
    // perdeu uma linha pelo caminho.
    const conferido = item({ id: 'a', valor: 30 })
    const orfao = item({ id: 'b', valor: 20 })
    const cruzamento: Cruzamento = {
      ...vazio(),
      conferidos: [{ movimento: conferido, registoId: 'd1' }],
    }
    const r = conciliar([conferido, orfao], [], cruzamento)
    expect(r.bate).toBe(false)
    expect(r.diferenca).toBe(20)
  })

  it('soma o que está na app sem linha no extrato', () => {
    const soNaApp: RegistoApp[] = [
      { id: 'd1', data: '2026-09-12', valor: 7, origem: 'despesa' },
      { id: 'd2', data: '2026-09-13', valor: 3, origem: 'despesa' },
    ]
    const r = conciliar([], [], { ...vazio(), soNaApp })
    expect(r.soNaApp).toBe(10)
  })
})
