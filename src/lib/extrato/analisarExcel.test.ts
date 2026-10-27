import { describe, expect, it } from 'vitest'
import { analisarFolha } from './analisarExcel'
import { grelhaDaFolha, type Celula } from './lerExcel'

// Estrutura da exportação real do ActivoBank (outubro de 2026), valores inventados.
// 46296 é 01/10/2026 em série Excel.
const cabecalho: Celula[][] = [
  ['HISTÓRICO DE CONTA NÚMERO 00000000000'],
  ['Moeda:', 'EUR'],
  ['', ''],
  ['Tipo:', 'Todos'],
  ['Data de:', 46296],
  ['Data até:', 46302],
  [],
  ['Data Lanc.', 'Data Valor', 'Descrição', 'Valor', 'Saldo'],
]

const folha = (...movimentos: Celula[][]) => [...cabecalho, ...movimentos]

describe('analisarFolha', () => {
  it('lê movimentos, datas em série e o sinal do próprio valor', () => {
    const r = analisarFolha(
      folha(
        [46296, 46296, 'COMPRA 1234 PINGO DOCE BRAGA', -9.9, 90.1],
        [46297, 46296, 'TRF. P/O ALGUEM', 20, 110.1],
      ),
    )
    expect(r.periodo).toEqual({ inicio: '2026-10-01', fim: '2026-10-07' })
    expect(r.saldoInicial).toBeCloseTo(100)
    expect(r.saldoFinal).toBeCloseTo(110.1)
    expect(r.movimentos).toHaveLength(2)
    expect(r.movimentos[0]).toMatchObject({
      data: '2026-10-01',
      chave: 'PINGO DOCE BRAGA',
      valor: 9.9,
      sinal: 'debito',
    })
    expect(r.movimentos[1]).toMatchObject({
      data: '2026-10-02',
      dataValor: '2026-10-01',
      valor: 20,
      sinal: 'credito',
    })
  })

  it('distingue duas compras iguais no mesmo dia pela ocorrência', () => {
    const r = analisarFolha(
      folha(
        [46296, 46296, 'COMPRA 1234 RNE LISBOA', -3.15, 96.85],
        [46296, 46296, 'COMPRA 1234 RNE LISBOA', -3.15, 93.7],
      ),
    )
    expect(r.movimentos[0].id).not.toBe(r.movimentos[1].id)
  })

  it('aceita a ordem inversa (mais recente primeiro)', () => {
    const r = analisarFolha(
      folha(
        [46297, 46297, 'B', -5, 85],
        [46296, 46296, 'A', -10, 90],
      ),
    )
    expect(r.movimentos.map((m) => m.chave)).toEqual(['A', 'B'])
    expect(r.saldoInicial).toBeCloseTo(100)
  })

  it('recusa quando os saldos não encadeiam', () => {
    expect(() =>
      analisarFolha(
        folha(
          [46296, 46296, 'A', -10, 90],
          [46297, 46297, 'B', -5, 80],
        ),
      ),
    ).toThrow(/não encadeiam/)
  })

  it('recusa um ficheiro sem a linha de títulos', () => {
    expect(() => analisarFolha([['qualquer coisa']])).toThrow(/linha de títulos/)
  })

  it('aceita datas e valores em texto à portuguesa', () => {
    const r = analisarFolha(folha(['01-10-2026', '01-10-2026', 'A', '-1 234,50', '765,50']))
    expect(r.movimentos[0]).toMatchObject({ data: '2026-10-01', valor: 1234.5, sinal: 'debito' })
  })
})

describe('grelhaDaFolha', () => {
  it('lê texto partilhado, números e células em falta, com ou sem prefixo', () => {
    const partilhadas =
      '<x:sst><x:si><x:t>Data Lanc.</x:t></x:si><x:si><x:t>A &amp; B</x:t></x:si></x:sst>'
    const xml =
      '<x:sheetData>' +
      '<x:row r="1"><x:c r="A1" t="s"><x:v>0</x:v></x:c><x:c r="C1" t="s"><x:v>1</x:v></x:c></x:row>' +
      '<x:row r="2"><x:c r="B2"><x:v>-9.9</x:v></x:c><x:c r="C2" s="1" /></x:row>' +
      '</x:sheetData>'
    expect(grelhaDaFolha(xml, partilhadas)).toEqual([
      ['Data Lanc.', null, 'A & B'],
      [null, -9.9, null],
    ])
  })
})
