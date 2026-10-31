import { describe, expect, it } from 'vitest'
import type { Orcamento } from '../types'
import { lerFicheiro, migrar, orcamentoInicial } from './armazenamento'

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

describe('marcas de sincronização na migração', () => {
  const guardado = {
    despesas: [
      { id: 'd1', data: '2026-09-01', valor: 10, categoriaId: 'c' },
      { id: 'd2', data: '2026-09-02', valor: 20, categoriaId: 'c' },
    ],
  } as unknown as Partial<Orcamento>

  it('dá marca de partida aos registos que já existiam', () => {
    // Sem marcas, a fusão não sabe ordenar nem decidir nada sobre eles.
    const o = migrar(guardado)
    expect(o.sincronizacao.alteradoEm.d1).toBeDefined()
    expect(o.sincronizacao.alteradoEm.d2).toBeDefined()
  })

  it('as marcas de partida preservam a ordem atual', () => {
    const o = migrar(guardado)
    expect(o.sincronizacao.alteradoEm.d1 < o.sincronizacao.alteradoEm.d2).toBe(true)
  })

  it('são iguais nos dois aparelhos, para nenhum ganhar só por ter migrado depois', () => {
    expect(migrar(guardado).sincronizacao.alteradoEm).toEqual(
      migrar(guardado).sincronizacao.alteradoEm,
    )
  })

  it('não mexe nas marcas de quem já sincroniza', () => {
    const comMarcas = {
      ...guardado,
      sincronizacao: { alteradoEm: { d1: '2026-10-10T00:00:00Z' }, apagados: {} },
    } as unknown as Partial<Orcamento>
    expect(migrar(comMarcas).sincronizacao.alteradoEm).toEqual({ d1: '2026-10-10T00:00:00Z' })
  })
})

describe('lerFicheiro', () => {
  const ficheiro = (conteudo: unknown) =>
    new File([JSON.stringify(conteudo)], 'copia.json', { type: 'application/json' })

  const orcamentoMinimo = { despesas: [], categorias: [{ id: 'c', nome: 'X', fatia: 'essencial' }] }

  it('lê uma exportação da app', async () => {
    const e = await lerFicheiro(ficheiro({ orcamento: orcamentoMinimo }))
    expect(e.orcamento.categorias[0].nome).toBe('X')
  })

  it('lê também o ficheiro do repositório, que guarda o orçamento à raiz', async () => {
    // É o que permite recuperar a partir do histórico de commits da
    // sincronização. Sem isto, a cópia que lá está não se conseguia importar.
    const e = await lerFicheiro(ficheiro(orcamentoMinimo))
    expect(e.orcamento.categorias[0].nome).toBe('X')
  })

  it('recusa um ficheiro que não é nenhum dos dois', async () => {
    await expect(lerFicheiro(ficheiro({ outra: 'coisa' }))).rejects.toThrow(/exportação da app/)
  })

  it('recusa um ficheiro danificado sem mostrar o erro do motor', async () => {
    const mau = new File(['{{{'], 'copia.json')
    await expect(lerFicheiro(mau)).rejects.toThrow(/danificado|JSON válido/)
  })
})
