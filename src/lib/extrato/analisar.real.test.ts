import { describe, expect, it } from 'vitest'
import { analisarExtrato } from './analisar'

/**
 * Estrutura real de um extrato do ActivoBank, com nomes de pessoas inventados e
 * saldos recalculados. O que importa aqui é a forma, e ela tem três armadilhas
 * que o extrato sintético não tinha:
 *
 *  - não há linha "EXTRATO DE ... A ...": o período vem de "EXT. N. AAAA/MMM";
 *  - o valor do SALDO INICIAL está na linha ANTERIOR à etiqueta;
 *  - movimentos com descritivo comprido saem partidos em duas linhas, com o
 *    descritivo em cima e as datas e valores em baixo.
 */
const EXTRATO_REAL = [
  'PAG:',
  '26/09/30 EXT. N. 2026/009 DEPOSITO A ORDEM: 00000000000 00002',
  'DATA DATA',
  'LANC. VALOR DESCRITIVO DEBITO CREDITO SALDO',
  '1 904.50',
  'SALDO INICIAL',
  '9.01 9.01 COMPRA 1998 WORTEN-EQUIPAMENTOS MATOSINHOS 9.99 1 894.51',
  'COMPRA 1998 BK22471 BRAGA ARCADABRA CONTACTLESS',
  '9.02 9.02 8.75 1 885.76',
  '9.07 9.05 TRF. P/O ALGUEM QUALQUER 41.00 1 926.76',
  'TRANSFERENCIA - VENCIMENTO',
  '9.18 9.18 556.04 2 482.80',
  '9.29 9.29 ELE 230199 MBWAY WOO 1600-404 10.00 2 472.80',
  'SALDO FINAL 2 472.80',
  'SALDO DISPONIVEL 2 472.80',
  'ULTRAPASSAGEM DE CREDITO TAXA ANUAL NOMINAL: 15.00000%',
  'Banco ActivoBank, S.A. - Sede: Rua Augusta, 84, 1100-053 Lisboa',
]

describe('analisarExtrato com a estrutura real', () => {
  it('tira o período do "EXT. N." quando não há linha "EXTRATO DE"', () => {
    const r = analisarExtrato(EXTRATO_REAL)
    expect(r.periodo.fim).toBe('2026-09-30')
  })

  it('lê o saldo inicial quando o valor está na linha anterior à etiqueta', () => {
    const r = analisarExtrato(EXTRATO_REAL)
    expect(r.saldoInicial).toBe(1904.5)
  })

  it('lê os movimentos partidos em duas linhas', () => {
    const r = analisarExtrato(EXTRATO_REAL)
    expect(r.movimentos).toHaveLength(5)
  })

  it('junta o descritivo da linha de cima ao movimento de baixo', () => {
    const r = analisarExtrato(EXTRATO_REAL)
    const partido = r.movimentos[1]
    expect(partido.chave).toBe('BK22471 BRAGA ARCADABRA CONTACTLESS')
    expect(partido.valor).toBe(8.75)
    expect(partido.data).toBe('2026-09-02')
  })

  it('encadeia o saldo através das duas formas misturadas', () => {
    const r = analisarExtrato(EXTRATO_REAL)
    expect(r.saldoFinal).toBe(2472.8)
    expect(r.movimentos.map((m) => m.sinal)).toEqual([
      'debito',
      'debito',
      'credito',
      'credito',
      'debito',
    ])
  })

  it('reconhece o vencimento partido como crédito', () => {
    const r = analisarExtrato(EXTRATO_REAL)
    const vencimento = r.movimentos.find((m) => m.chave.includes('VENCIMENTO'))
    expect(vencimento?.valor).toBe(556.04)
    expect(vencimento?.sinal).toBe('credito')
  })

  it('continua a recusar um documento que não é extrato', () => {
    expect(() => analisarExtrato(['ACTIVOBANK', 'QUALQUER COISA'])).toThrow()
  })
})
