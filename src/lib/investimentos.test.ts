import { describe, expect, it } from 'vitest'
import type { Etf, Orcamento, Saldo } from '../types'
import { pesosCarteira, sugerirAportes } from './investimentos'

const etf = (id: string, pesoAlvo: number, aporteBase: number, papel: Etf['papel']): Etf => ({
  id,
  nome: id.toUpperCase(),
  pesoAlvo,
  aporteBase,
  papel,
})

const ETFS = [
  etf('iwda', 79, 110, 'global'),
  etf('eimi', 11, 50, 'emergentes'),
  etf('defense', 5, 20, 'tematico'),
  etf('digital', 5, 20, 'tematico'),
]

const saldo = (carteira: Record<string, number> | undefined, resto: Partial<Saldo> = {}): Saldo => ({
  id: 's1',
  data: '2026-10-01',
  investido: carteira ? Object.values(carteira).reduce((s, v) => s + v, 0) : (resto.investido ?? 0),
  liquidez: resto.liquidez ?? 0,
  certificados: resto.certificados ?? 0,
  carteira,
})

const orcamento = (saldos: Saldo[], etfs: Etf[] = ETFS): Orcamento =>
  ({
    saldos,
    investimentos: { etfs, tetoTematicos: 10, emergentesMin: 9, emergentesMax: 15 },
  }) as unknown as Orcamento

describe('pesosCarteira', () => {
  it('sem fotografias não há pesos a mostrar', () => {
    expect(pesosCarteira(orcamento([]))).toBeNull()
  })

  it('uma fotografia antiga, sem detalhe por ETF, não serve', () => {
    // Antes dos indicadores só se guardava o total investido. Inventar a
    // distribuição a partir dos pesos-alvo mostraria sempre "tudo no alvo".
    expect(pesosCarteira(orcamento([saldo(undefined, { investido: 2000 })]))).toBeNull()
  })

  it('calcula o peso de cada ETF sobre o total de ETFs', () => {
    const p = pesosCarteira(
      orcamento([saldo({ iwda: 1700, eimi: 100, defense: 100, digital: 100 })]),
    )
    expect(p?.totalEtf).toBe(2000)
    expect(p?.linhas.map((l) => l.peso)).toEqual([0.85, 0.05, 0.05, 0.05])
    expect(p?.linhas.map((l) => l.alvo)).toEqual([0.79, 0.11, 0.05, 0.05])
  })

  it('os certificados e a liquidez ficam fora do total de ETFs', () => {
    const p = pesosCarteira(
      orcamento([saldo({ iwda: 1000 }, { certificados: 5000, liquidez: 900 })]),
    )
    expect(p?.totalEtf).toBe(1000)
  })

  it('usa a fotografia mais recente', () => {
    const antiga = { ...saldo({ iwda: 100 }), id: 'a', data: '2026-08-01' }
    const nova = { ...saldo({ iwda: 500 }), id: 'b', data: '2026-10-01' }
    expect(pesosCarteira(orcamento([nova, antiga]))?.totalEtf).toBe(500)
  })

  describe('teto dos temáticos', () => {
    it('sinaliza acima do teto', () => {
      const p = pesosCarteira(orcamento([saldo({ iwda: 800, eimi: 50, defense: 150 })]))
      expect(p?.tematicos).toBeCloseTo(0.15)
      expect(p?.acimaDoTeto).toBe(true)
    })

    it('exatamente no teto ainda está dentro', () => {
      const p = pesosCarteira(orcamento([saldo({ iwda: 850, eimi: 50, defense: 100 })]))
      expect(p?.tematicos).toBeCloseTo(0.1)
      expect(p?.acimaDoTeto).toBe(false)
    })
  })

  describe('intervalo dos emergentes no núcleo', () => {
    const banda = (iwda: number, eimi: number) =>
      pesosCarteira(orcamento([saldo({ iwda, eimi })]))

    it('abaixo do mínimo', () => {
      const p = banda(1848, 152)
      expect(p?.emergentesNucleo).toBeCloseTo(0.076)
      expect(p?.bandaEmergentes).toBe('abaixo')
    })

    it('acima do máximo', () => {
      const p = banda(1600, 400)
      expect(p?.emergentesNucleo).toBeCloseTo(0.2)
      expect(p?.bandaEmergentes).toBe('acima')
    })

    it('dentro do intervalo', () => {
      expect(banda(1756, 244)?.bandaEmergentes).toBe('dentro')
    })

    it('exatamente no mínimo está dentro', () => {
      const p = banda(1820, 180)
      expect(p?.emergentesNucleo).toBeCloseTo(0.09)
      expect(p?.bandaEmergentes).toBe('dentro')
    })

    it('exatamente no máximo está dentro', () => {
      const p = banda(1700, 300)
      expect(p?.emergentesNucleo).toBeCloseTo(0.15)
      expect(p?.bandaEmergentes).toBe('dentro')
    })

    it('o alvo dos emergentes é a sua fatia do núcleo, não do total', () => {
      // 11 de 90, não 11 de 100: os temáticos não entram no núcleo.
      expect(banda(1000, 100)?.alvoEmergentes).toBeCloseTo(11 / 90)
    })

    it('sem núcleo não há intervalo a verificar', () => {
      const p = pesosCarteira(orcamento([saldo({ defense: 100 })]))
      expect(p?.emergentesNucleo).toBeNull()
      expect(p?.bandaEmergentes).toBeNull()
    })
  })

  it('um ETF sem valor na fotografia conta como zero', () => {
    const p = pesosCarteira(orcamento([saldo({ iwda: 1000 })]))
    expect(p?.linhas.find((l) => l.etf.id === 'eimi')?.valor).toBe(0)
    expect(p?.linhas.find((l) => l.etf.id === 'eimi')?.peso).toBe(0)
  })

  it('uma carteira vazia não divide por zero', () => {
    const p = pesosCarteira(orcamento([saldo({ iwda: 0, eimi: 0 })]))
    expect(p).toBeNull()
  })
})

describe('sugerirAportes', () => {
  const sugerir = (carteira?: Record<string, number>) => {
    const o = orcamento(carteira ? [saldo(carteira)] : [])
    const por = Object.fromEntries(
      sugerirAportes(o, pesosCarteira(o)).map((s) => [s.etf.id, s]),
    )
    return por
  }

  it('sem fotografia sugere os aportes base', () => {
    const s = sugerir()
    expect(s.iwda.valor).toBe(110)
    expect(s.eimi.valor).toBe(50)
    expect(s.defense.valor).toBe(20)
    expect(s.iwda.razao).toBeUndefined()
  })

  it('com tudo dentro das regras sugere os aportes base', () => {
    const s = sugerir({ iwda: 1756, eimi: 244, defense: 100, digital: 100 })
    expect(s.iwda.valor).toBe(110)
    expect(s.eimi.valor).toBe(50)
    expect(s.defense.valor).toBe(20)
    expect(s.digital.valor).toBe(20)
  })

  describe('temáticos acima do teto', () => {
    // 300 de 2100 = 14,3%, acima dos 10%.
    const s = () => sugerir({ iwda: 1556, eimi: 244, defense: 150, digital: 150 })

    it('deixa de aportar aos temáticos', () => {
      expect(s().defense.valor).toBe(0)
      expect(s().digital.valor).toBe(0)
      expect(s().defense.razao).toBeDefined()
    })

    it('manda esses 40 € para o núcleo na proporção dos aportes base', () => {
      // 110:50 de 40 € = 27,50 € e 12,50 €.
      expect(s().iwda.valor).toBeCloseTo(137.5)
      expect(s().eimi.valor).toBeCloseTo(62.5)
    })

    it('nunca sugere vender o que está acima do teto', () => {
      expect(Object.values(s()).every((x) => x.valor >= 0)).toBe(true)
    })
  })

  describe('emergentes fora do intervalo', () => {
    it('abaixo do mínimo, manda exatamente o que falta para chegar ao alvo', () => {
      // Núcleo 2000 com 152 em EIMI (7,6%). Com 160 € a entrar, o núcleo passa a
      // 2160 e o alvo de 12,22% são 264 €: faltam 112 €.
      const s = sugerir({ iwda: 1848, eimi: 152 })
      expect(s.eimi.valor).toBeCloseTo(112)
      expect(s.iwda.valor).toBeCloseTo(48)
      expect(s.eimi.razao).toBeDefined()
    })

    it('fica em cima do alvo, não passa por cima dele', () => {
      const s = sugerir({ iwda: 1848, eimi: 152 })
      const nucleoDepois = 2000 + 160
      expect((152 + s.eimi.valor) / nucleoDepois).toBeCloseTo(11 / 90)
    })

    it('quando um mês não chega, vai tudo para os emergentes', () => {
      // Faltam 224 € e só há 160 €: manda os 160 e aproxima-se o mais possível.
      const s = sugerir({ iwda: 1960, eimi: 40 })
      expect(s.eimi.valor).toBeCloseTo(160)
      expect(s.iwda.valor).toBeCloseTo(0)
    })

    it('acima do máximo, para de aportar aos emergentes em vez de vender', () => {
      const s = sugerir({ iwda: 1600, eimi: 400 })
      expect(s.eimi.valor).toBe(0)
      expect(s.iwda.valor).toBeCloseTo(160)
    })
  })

  it('as duas regras compõem-se', () => {
    // Temáticos a 12,2% (acima do teto) e emergentes a 5,6% do núcleo (abaixo).
    // Os 40 € dos temáticos juntam-se ao núcleo antes de se dividir o núcleo.
    const s = sugerir({ iwda: 1700, eimi: 100, defense: 250 })
    expect(s.defense.valor).toBe(0)
    expect(s.eimi.valor).toBeCloseTo(144.44, 1)
    expect(s.iwda.valor).toBeCloseTo(55.56, 1)
  })

  it('o total sugerido é sempre o mesmo que o total base', () => {
    const casos: (Record<string, number> | undefined)[] = [
      undefined,
      { iwda: 1756, eimi: 244, defense: 100, digital: 100 },
      { iwda: 1556, eimi: 244, defense: 150, digital: 150 },
      { iwda: 1848, eimi: 152 },
      { iwda: 1600, eimi: 400 },
      { iwda: 1700, eimi: 100, defense: 250 },
    ]
    for (const caso of casos) {
      const total = Object.values(sugerir(caso)).reduce((acc, x) => acc + x.valor, 0)
      expect(total).toBeCloseTo(200)
    }
  })

  it('nunca sugere um valor negativo', () => {
    const s = sugerir({ iwda: 10, eimi: 1990 })
    expect(Object.values(s).every((x) => x.valor >= 0)).toBe(true)
  })
})
