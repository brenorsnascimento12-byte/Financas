import { describe, expect, it } from 'vitest'
import { analisarExtrato } from './analisar'

/** Extrato sintético com a estrutura real e valores inventados. */
const EXTRATO = [
  'EXTRATO DE 2026/08/03 A 2026/08/31',
  'DATA DATA',
  'LANC. VALOR DESCRITIVO DEBITO CREDITO SALDO',
  'SALDO INICIAL 1 000.00',
  '8.03 8.03 COMPRA 1998 PINGO DOCE TAIPAS 32.18 967.82',
  '8.04 8.04 TRF. P/O ALGUEM 60.00 1 027.82',
  '8.06 8.06 COMPRA 1998 ANTHROPIC CLAUDE SUB 22.14 1 005.68',
  '8.06 8.06 IMPOSTO DO SELO 0.03 1 005.65',
]

describe('analisarExtrato', () => {
  it('lê o período e os saldos', () => {
    const r = analisarExtrato(EXTRATO)
    expect(r.periodo).toEqual({ inicio: '2026-08-03', fim: '2026-08-31' })
    expect(r.saldoInicial).toBe(1000)
    expect(r.saldoFinal).toBe(1005.65)
  })

  it('resolve as datas de M.DD para YYYY-MM-DD', () => {
    const r = analisarExtrato(EXTRATO)
    // 8.03 é 3 de agosto, não 8 de março.
    expect(r.movimentos[0].data).toBe('2026-08-03')
  })

  it('deduz o sinal pelo encadeamento do saldo', () => {
    const r = analisarExtrato(EXTRATO)
    expect(r.movimentos[0].sinal).toBe('debito')
    expect(r.movimentos[1].sinal).toBe('credito')
  })

  it('guarda o valor sempre positivo', () => {
    const r = analisarExtrato(EXTRATO)
    expect(r.movimentos[0].valor).toBe(32.18)
  })

  it('salta o SALDO INICIAL e os cabeçalhos', () => {
    const r = analisarExtrato(EXTRATO)
    expect(r.movimentos).toHaveLength(4)
  })

  it('aceita um extrato sem movimentos', () => {
    // Mês sem atividade: só o saldo inicial. Não pode rebentar.
    const vazio = ['EXTRATO DE 2026/09/01 A 2026/09/30', 'SALDO INICIAL 500.00']
    const r = analisarExtrato(vazio)
    expect(r.movimentos).toEqual([])
    expect(r.saldoFinal).toBe(500)
  })

  it('distingue duas compras iguais no mesmo dia', () => {
    const repetido = [
      'EXTRATO DE 2026/08/01 A 2026/08/31',
      'SALDO INICIAL 100.00',
      '8.04 8.04 COMPRA 1998 EST SERVICO RE BRAGA 10.00 90.00',
      '8.04 8.04 COMPRA 1998 EST SERVICO RE BRAGA 10.00 80.00',
    ]
    const r = analisarExtrato(repetido)
    expect(r.movimentos[0].id).not.toBe(r.movimentos[1].id)
  })

  it('recusa quando o encadeamento não fecha', () => {
    const partido = [
      'EXTRATO DE 2026/08/01 A 2026/08/31',
      'SALDO INICIAL 100.00',
      '8.04 8.04 COMPRA 1998 QUALQUER COISA 10.00 75.00',
    ]
    expect(() => analisarExtrato(partido)).toThrow(/linha/i)
  })

  it('recusa quando não encontra o SALDO INICIAL', () => {
    expect(() => analisarExtrato(['EXTRATO DE 2026/08/01 A 2026/08/31'])).toThrow(/ActivoBank/i)
  })

  it('lê descritivos que contêm números', () => {
    // "4700-236" é um código postal no meio do descritivo: o leitor não o pode
    // confundir com o valor. Linhas reais do extrato, com saldos inventados.
    const comNumeros = [
      'EXTRATO DE 2026/08/01 A 2026/08/31',
      'SALDO INICIAL 100.00',
      '8.03 8.03 COMPRA 1998 EST SERVICO RE BRAGA 4700-236 MAXIM 40.00 60.00',
      '8.10 8.10 COMPRA 1998 MACAS CLUB 2705-300 COLARES 15.50 44.50',
    ]
    const r = analisarExtrato(comNumeros)
    expect(r.movimentos[0].valor).toBe(40)
    expect(r.movimentos[0].chave).toBe('EST SERVICO RE BRAGA 4700-236 MAXIM')
    expect(r.movimentos[1].valor).toBe(15.5)
  })

  it('recusa quando não encontra o período', () => {
    expect(() => analisarExtrato(['SALDO INICIAL 100.00'])).toThrow(/período/i)
  })
})
