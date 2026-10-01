import { describe, expect, it } from 'vitest'
import { impressaoDigital, normalizarChave, normalizarNumero, resolverAno } from './normalizar'

describe('normalizarNumero', () => {
  it('lê o ponto como decimal', () => {
    expect(normalizarNumero('9.90')).toBe(9.9)
  })

  it('remove o espaço dos milhares', () => {
    expect(normalizarNumero('1 958.67')).toBe(1958.67)
  })

  it('remove o espaço inseparável dos milhares', () => {
    // Os PDFs usam U+00A0; sem o remover, Number() devolve NaN.
    expect(normalizarNumero('12 345.67')).toBe(12345.67)
  })

  it('rejeita texto que não seja número', () => {
    expect(() => normalizarNumero('SALDO')).toThrow()
  })
})

describe('resolverAno', () => {
  const agosto = { inicio: '2026-08-03', fim: '2026-08-31' }

  it('usa o ano do período quando o mês cabe nele', () => {
    expect(resolverAno(8, agosto)).toBe(2026)
  })

  it('resolve a passagem de ano', () => {
    // Extrato de 15 de dezembro a 14 de janeiro: dezembro é 2026, janeiro é 2027.
    const virada = { inicio: '2026-12-15', fim: '2027-01-14' }
    expect(resolverAno(12, virada)).toBe(2026)
    expect(resolverAno(1, virada)).toBe(2027)
  })
})

describe('normalizarChave', () => {
  it('remove o prefixo do cartão', () => {
    expect(normalizarChave('COMPRA 1998 PINGO DOCE TAIPAS')).toBe('PINGO DOCE TAIPAS')
  })

  it('passa a maiúsculas e colapsa espaços', () => {
    expect(normalizarChave('COMPRA 1998 Flix  SE   Berlin DE')).toBe('FLIX SE BERLIN DE')
  })

  it('deixa intacto um descritivo sem prefixo', () => {
    expect(normalizarChave('IMPOSTO DO SELO')).toBe('IMPOSTO DO SELO')
  })
})

describe('impressaoDigital', () => {
  it('distingue duas compras iguais no mesmo dia', () => {
    const a = impressaoDigital('2026-08-04', 10, 'EST SERVICO RE BRAGA', 0)
    const b = impressaoDigital('2026-08-04', 10, 'EST SERVICO RE BRAGA', 1)
    expect(a).not.toBe(b)
  })
})
