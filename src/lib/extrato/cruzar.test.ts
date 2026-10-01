import { describe, expect, it } from 'vitest'
import type { MovimentoExtrato } from '../../types'
import type { MovimentoClassificado } from './classificar'
import { cruzar, type RegistoApp } from './cruzar'

const classificado = (
  data: string,
  valor: number,
  id = `${data}-${valor}`,
): MovimentoClassificado => ({
  movimento: {
    id,
    data,
    dataValor: data,
    descritivo: 'ALGO',
    chave: 'ALGO',
    valor,
    sinal: 'debito',
    saldo: 0,
  } as MovimentoExtrato,
  tipo: 'despesa',
  comissoes: [],
})

const registo = (id: string, data: string, valor: number): RegistoApp => ({
  id,
  data,
  valor,
  origem: 'despesa',
})

describe('cruzar', () => {
  it('confere quando valor e data batem certo', () => {
    const r = cruzar([classificado('2026-08-03', 32.18)], [registo('d1', '2026-08-03', 32.18)])
    expect(r.conferidos).toHaveLength(1)
    expect(r.conferidos[0].registoId).toBe('d1')
    expect(r.emFalta).toEqual([])
    expect(r.soNaApp).toEqual([])
  })

  it('confere dentro da janela de três dias', () => {
    const r = cruzar([classificado('2026-08-06', 10)], [registo('d1', '2026-08-03', 10)])
    expect(r.conferidos).toHaveLength(1)
  })

  it('não confere fora da janela', () => {
    const r = cruzar([classificado('2026-08-08', 10)], [registo('d1', '2026-08-03', 10)])
    expect(r.emFalta).toHaveLength(1)
    expect(r.soNaApp).toHaveLength(1)
  })

  it('não confere valores diferentes', () => {
    const r = cruzar([classificado('2026-08-03', 10)], [registo('d1', '2026-08-03', 10.5)])
    expect(r.emFalta).toHaveLength(1)
  })

  it('põe em falta o que está no extrato e não na app', () => {
    const r = cruzar([classificado('2026-08-03', 32.18)], [])
    expect(r.emFalta).toHaveLength(1)
  })

  it('assinala o que está na app e não no extrato', () => {
    const r = cruzar([], [registo('d1', '2026-08-03', 5)])
    expect(r.soNaApp).toHaveLength(1)
  })

  it('não usa o mesmo registo duas vezes', () => {
    const r = cruzar(
      [classificado('2026-08-03', 10, 'a'), classificado('2026-08-03', 10, 'b')],
      [registo('d1', '2026-08-03', 10)],
    )
    expect(r.conferidos).toHaveLength(1)
    expect(r.emFalta).toHaveLength(1)
  })

  it('manda para ambíguo quando há empate de distância', () => {
    // Dois candidatos a um dia de distância, um para cada lado.
    const r = cruzar(
      [classificado('2026-08-04', 10)],
      [registo('d1', '2026-08-03', 10), registo('d2', '2026-08-05', 10)],
    )
    expect(r.ambiguos).toHaveLength(1)
    expect(r.ambiguos[0].candidatos.map((c) => c.id).sort()).toEqual(['d1', 'd2'])
    expect(r.conferidos).toEqual([])
  })

  it('prefere o candidato mais próximo quando não há empate', () => {
    const r = cruzar(
      [classificado('2026-08-04', 10)],
      [registo('d1', '2026-08-03', 10), registo('d2', '2026-08-07', 10)],
    )
    expect(r.conferidos).toHaveLength(1)
    expect(r.conferidos[0].registoId).toBe('d1')
  })

  it('é idempotente: reimportar não duplica', () => {
    const movimentos = [classificado('2026-08-03', 32.18)]
    const r = cruzar(movimentos, [registo('d1', '2026-08-03', 32.18)])
    expect(r.emFalta).toEqual([])
    expect(r.conferidos).toHaveLength(1)
  })
})
