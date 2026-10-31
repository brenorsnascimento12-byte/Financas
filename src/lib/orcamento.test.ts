import { describe, expect, it } from 'vitest'
import type { Aporte, Destino, Orcamento, ResumoMes, Saldo } from '../types'
import { evolucaoPatrimonio, mediaTaxaPoupanca } from './orcamento'

const saldo = (data: string, p: Partial<Saldo>): Saldo => ({
  id: data,
  data,
  investido: p.investido ?? 0,
  liquidez: p.liquidez ?? 0,
  certificados: p.certificados ?? 0,
  carteira: p.carteira,
})

const aporte = (data: string, valor: number, destino: Destino): Aporte => ({
  id: `${data}-${destino}`,
  data,
  valor,
  fonte: 'planeado',
  destino,
})

const orcamento = (saldos: Saldo[], aportes: Aporte[] = []): Orcamento =>
  ({ saldos, aportes }) as unknown as Orcamento

describe('evolucaoPatrimonio', () => {
  it('a primeira fotografia é o ponto de partida, não um ganho', () => {
    const [p] = evolucaoPatrimonio(orcamento([saldo('2026-01-01', { investido: 5000 })]))
    expect(p.mercado).toBe(0)
    expect(p.capital).toBe(5000)
  })

  it('o vencimento que cai na conta não é retorno do mercado', () => {
    // O erro que isto apanha: com a liquidez dentro da conta do retorno, um
    // ordenado de 556 € aparecia como 556 € "dados pelo mercado".
    const pontos = evolucaoPatrimonio(
      orcamento([
        saldo('2026-01-01', { investido: 1000, liquidez: 200 }),
        saldo('2026-02-01', { investido: 1000, liquidez: 756.04 }),
      ]),
    )
    expect(pontos[1].mercado).toBe(0)
  })

  it('o dinheiro gasto da conta não é perda do mercado', () => {
    const pontos = evolucaoPatrimonio(
      orcamento([
        saldo('2026-01-01', { investido: 1000, liquidez: 800 }),
        saldo('2026-02-01', { investido: 1000, liquidez: 500 }),
      ]),
    )
    expect(pontos[1].mercado).toBe(0)
  })

  it('a valorização da carteira aparece como mercado', () => {
    const pontos = evolucaoPatrimonio(
      orcamento([
        saldo('2026-01-01', { investido: 1000 }),
        saldo('2026-02-01', { investido: 1120 }),
      ]),
    )
    expect(pontos[1].mercado).toBe(120)
  })

  it('o aporte para ETFs é capital, não mercado', () => {
    const pontos = evolucaoPatrimonio(
      orcamento(
        [saldo('2026-01-01', { investido: 1000 }), saldo('2026-02-01', { investido: 1200 })],
        [aporte('2026-01-15', 200, 'investimento')],
      ),
    )
    expect(pontos[1].capital).toBe(1200)
    expect(pontos[1].mercado).toBe(0)
  })

  it('os juros dos certificados aparecem como mercado', () => {
    const pontos = evolucaoPatrimonio(
      orcamento([
        saldo('2026-01-01', { certificados: 2000 }),
        saldo('2026-02-01', { certificados: 2015 }),
      ]),
    )
    expect(pontos[1].mercado).toBe(15)
  })

  it('um aporte para liquidez não entra no capital da carteira', () => {
    // Transferir dinheiro para a conta não é investir: se contasse como capital,
    // a carteira ficava a dever 300 € ao mercado.
    const pontos = evolucaoPatrimonio(
      orcamento(
        [saldo('2026-01-01', { investido: 1000 }), saldo('2026-02-01', { investido: 1000, liquidez: 300 })],
        [aporte('2026-01-15', 300, 'liquidez')],
      ),
    )
    expect(pontos[1].capital).toBe(1000)
    expect(pontos[1].mercado).toBe(0)
  })

  it('o património total continua a incluir a liquidez', () => {
    const [p] = evolucaoPatrimonio(
      orcamento([saldo('2026-01-01', { investido: 1000, liquidez: 500, certificados: 200 })]),
    )
    expect(p.total).toBe(1700)
    expect(p.carteira).toBe(1200)
  })

  it('um aporte anterior à primeira fotografia já está lá dentro', () => {
    const pontos = evolucaoPatrimonio(
      orcamento(
        [saldo('2026-02-01', { investido: 1000 }), saldo('2026-03-01', { investido: 1000 })],
        [aporte('2026-01-10', 500, 'investimento')],
      ),
    )
    expect(pontos[1].capital).toBe(1000)
    expect(pontos[1].mercado).toBe(0)
  })

  it('ordena as fotografias por data', () => {
    const pontos = evolucaoPatrimonio(
      orcamento([
        saldo('2026-03-01', { investido: 1200 }),
        saldo('2026-01-01', { investido: 1000 }),
      ]),
    )
    expect(pontos.map((p) => p.data)).toEqual(['2026-01-01', '2026-03-01'])
  })

  it('sem fotografias devolve uma lista vazia', () => {
    expect(evolucaoPatrimonio(orcamento([]))).toEqual([])
  })
})

const resumo = (mes: string, taxaPoupanca: number, fechado: boolean): ResumoMes =>
  ({ mes, taxaPoupanca, fechado }) as unknown as ResumoMes

describe('mediaTaxaPoupanca', () => {
  it('faz a média dos meses fechados', () => {
    const r = [resumo('2026-08', 0.2, true), resumo('2026-09', 0.4, true)]
    expect(mediaTaxaPoupanca(r, 12)).toBeCloseTo(0.3)
  })

  it('ignora o mês em curso, que ainda não tem a poupança toda', () => {
    const r = [resumo('2026-09', 0.4, true), resumo('2026-10', 0, false)]
    expect(mediaTaxaPoupanca(r, 12)).toBeCloseTo(0.4)
  })

  it('usa só os últimos n meses', () => {
    const r = [resumo('2026-07', 1, true), resumo('2026-08', 0.2, true), resumo('2026-09', 0.4, true)]
    expect(mediaTaxaPoupanca(r, 2)).toBeCloseTo(0.3)
  })

  it('sem meses fechados não há média', () => {
    expect(mediaTaxaPoupanca([resumo('2026-10', 0, false)], 12)).toBeNull()
  })

  it('aceita menos meses do que a janela pedida', () => {
    expect(mediaTaxaPoupanca([resumo('2026-09', 0.4, true)], 12)).toBeCloseTo(0.4)
  })
})
