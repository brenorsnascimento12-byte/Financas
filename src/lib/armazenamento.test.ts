import { describe, expect, it } from 'vitest'
import type { Orcamento } from '../types'
import { migrar, orcamentoInicial } from './armazenamento'

describe('orcamentoInicial', () => {
  it('traz as listas novas vazias', () => {
    const o = orcamentoInicial()
    expect(o.regras).toEqual([])
    expect(o.linhasIgnoradas).toEqual([])
  })

  it('os ids dos ETFs de arranque são estáveis', () => {
    // Têm de ser iguais nos dois aparelhos: as fotografias guardam valores por
    // id de ETF, e ids aleatórios deixariam de bater um com o outro.
    expect(orcamentoInicial().investimentos.etfs.map((e) => e.id)).toEqual(
      orcamentoInicial().investimentos.etfs.map((e) => e.id),
    )
  })

  it('os pesos-alvo somam 100', () => {
    const soma = orcamentoInicial().investimentos.etfs.reduce((s, e) => s + e.pesoAlvo, 0)
    expect(soma).toBe(100)
  })
})

describe('migrar', () => {
  it('uma cópia anterior aos indicadores recebe a configuração de arranque', () => {
    const o = migrar({ despesas: [], categorias: [] } as unknown as Partial<Orcamento>)
    expect(o.investimentos.etfs.length).toBeGreaterThan(0)
    expect(o.ordemIndicadores).toEqual(['pesos', 'poupanca', 'casamento'])
  })

  it('não substitui uma configuração que já existe', () => {
    const meus = {
      etfs: [{ id: 'meu', nome: 'MEU', pesoAlvo: 100, papel: 'global' as const }],
      tetoTematicos: 20,
      emergentesMin: 5,
      emergentesMax: 30,
    }
    expect(migrar({ investimentos: meus } as Partial<Orcamento>).investimentos).toEqual(meus)
  })

  it('não inventa o detalhe por ETF das fotografias antigas', () => {
    const o = migrar({
      saldos: [{ id: 's', data: '2026-09-01', investido: 2000, liquidez: 100, certificados: 0 }],
    } as Partial<Orcamento>)
    expect(o.saldos[0].carteira).toBeUndefined()
    expect(o.saldos[0].investido).toBe(2000)
  })

  it('repõe a ordem dos indicadores quando está corrompida', () => {
    const o = migrar({ ordemIndicadores: 'lixo' } as unknown as Partial<Orcamento>)
    expect(o.ordemIndicadores).toEqual(['pesos', 'poupanca', 'casamento'])
  })
})
