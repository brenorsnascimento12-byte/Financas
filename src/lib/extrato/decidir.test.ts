import { describe, expect, it } from 'vitest'
import type { MovimentoExtrato, Regra } from '../../types'
import type { MovimentoClassificado } from './classificar'
import { aplicarDecisoes, decisoesSugeridas, type Decisao } from './decidir'

let contador = 0
const idFixo = () => `id-${++contador}`

const mov = (p: Partial<MovimentoExtrato>): MovimentoExtrato => ({
  id: p.id ?? 'm1',
  data: p.data ?? '2026-09-08',
  dataValor: p.dataValor ?? '2026-09-08',
  descritivo: p.descritivo ?? 'ALGO',
  chave: p.chave ?? 'ALGO',
  valor: p.valor ?? 10,
  sinal: p.sinal ?? 'debito',
  saldo: p.saldo ?? 0,
})

const item = (
  m: Partial<MovimentoExtrato>,
  comissoes: MovimentoExtrato[] = [],
): MovimentoClassificado => ({ movimento: mov(m), tipo: 'despesa', comissoes })

describe('aplicarDecisoes', () => {
  it('ignorar não escreve nada e guarda a impressão digital', () => {
    const r = aplicarDecisoes([item({ id: 'm1' })], { m1: { tipo: 'ignorar' } }, [], idFixo)
    expect(r.despesas).toEqual([])
    expect(r.linhasIgnoradas).toEqual(['m1'])
  })

  it('sem decisão, a linha fica por decidir: não grava nem silencia', () => {
    // Carregar em "Escrever" com linhas por tratar não as pode fazer desaparecer
    // para sempre — só um "Ignorar" escolhido de propósito silencia.
    const r = aplicarDecisoes([item({ id: 'm1' })], {}, [], idFixo)
    expect(r.despesas).toEqual([])
    expect(r.linhasIgnoradas).toEqual([])
  })

  it('cria a despesa com o valor e a data do movimento', () => {
    const d: Record<string, Decisao> = { m1: { tipo: 'despesa', categoriaId: 'cat' } }
    const r = aplicarDecisoes([item({ id: 'm1', valor: 22.14, data: '2026-09-08' })], d, [], idFixo)
    expect(r.despesas).toHaveLength(1)
    expect(r.despesas[0]).toMatchObject({ valor: 22.14, data: '2026-09-08', categoriaId: 'cat' })
  })

  it('cria registos separados para as comissões, na mesma categoria', () => {
    const comissoes = [mov({ id: 'c1', chave: 'IMPOSTO DO SELO', valor: 0.03 })]
    const d: Record<string, Decisao> = { m1: { tipo: 'despesa', categoriaId: 'cat' } }
    const r = aplicarDecisoes([item({ id: 'm1', valor: 22.14 }, comissoes)], d, [], idFixo)
    expect(r.despesas).toHaveLength(2)
    expect(r.despesas.map((x) => x.valor)).toEqual([22.14, 0.03])
    expect(r.despesas.every((x) => x.categoriaId === 'cat')).toBe(true)
  })

  it('NUNCA transforma um crédito em despesa', () => {
    // O vencimento aparece na fila como qualquer outra linha. Um toque errado
    // no seletor não pode criar uma despesa de 556 €.
    const d: Record<string, Decisao> = { m1: { tipo: 'despesa', categoriaId: 'cat' } }
    const r = aplicarDecisoes(
      [item({ id: 'm1', valor: 556.04, sinal: 'credito' })],
      d,
      [],
      idFixo,
    )
    expect(r.despesas).toEqual([])
    expect(r.linhasIgnoradas).toEqual(['m1'])
  })

  it('aprende a regra ao categorizar', () => {
    const d: Record<string, Decisao> = { m1: { tipo: 'despesa', categoriaId: 'cat' } }
    const r = aplicarDecisoes([item({ id: 'm1', chave: 'PINGO DOCE' })], d, [], idFixo)
    expect(r.regras).toHaveLength(1)
    expect(r.regras[0]).toMatchObject({ padrao: 'PINGO DOCE', categoriaId: 'cat' })
  })

  it('não duplica uma regra que já existe', () => {
    const existentes: Regra[] = [{ id: 'r', padrao: 'PINGO DOCE', tipo: 'despesa', categoriaId: 'x' }]
    const d: Record<string, Decisao> = { m1: { tipo: 'despesa', categoriaId: 'cat' } }
    const r = aplicarDecisoes([item({ id: 'm1', chave: 'PINGO DOCE' })], d, existentes, idFixo)
    expect(r.regras).toEqual([])
  })

  it('não aprende regra para MB WAY, a não ser que se peça', () => {
    const mbway = item({ id: 'm1', chave: 'TRF MB WAY P/ MARIA' })
    const semPedir = aplicarDecisoes(
      [mbway],
      { m1: { tipo: 'despesa', categoriaId: 'curso' } },
      [],
      idFixo,
    )
    expect(semPedir.despesas).toHaveLength(1)
    expect(semPedir.regras).toEqual([])

    const pedido = aplicarDecisoes(
      [mbway],
      { m1: { tipo: 'despesa', categoriaId: 'transporte', lembrar: true } },
      [],
      idFixo,
    )
    expect(pedido.regras[0]).toMatchObject({
      padrao: 'TRF MB WAY P/ MARIA',
      categoriaId: 'transporte',
      explicita: true,
    })
  })

  it('promove uma regra antiga de transferência quando se pede para lembrar', () => {
    const existentes: Regra[] = [
      { id: 'antiga', padrao: 'TRF MB WAY P/ MARIA', tipo: 'despesa', categoriaId: 'x' },
    ]
    const r = aplicarDecisoes(
      [item({ id: 'm1', chave: 'TRF MB WAY P/ MARIA' })],
      { m1: { tipo: 'despesa', categoriaId: 'transporte', lembrar: true } },
      existentes,
      idFixo,
    )
    expect(r.regras).toEqual([
      { id: 'antiga', padrao: 'TRF MB WAY P/ MARIA', tipo: 'despesa', categoriaId: 'transporte', explicita: true },
    ])
  })

  it('um reembolso abate na categoria e silencia a linha', () => {
    const r = aplicarDecisoes(
      [item({ id: 'm1', chave: 'TRF. P/O JOAO', valor: 20, sinal: 'credito' })],
      { m1: { tipo: 'reembolso', categoriaId: 'transporte' } },
      [],
      idFixo,
    )
    expect(r.despesas).toHaveLength(1)
    expect(r.despesas[0]).toMatchObject({ valor: -20, categoriaId: 'transporte' })
    expect(r.linhasIgnoradas).toEqual(['m1'])
    expect(r.regras).toEqual([])
  })

  it('um débito nunca é reembolso', () => {
    const r = aplicarDecisoes(
      [item({ id: 'm1', valor: 20 })],
      { m1: { tipo: 'reembolso', categoriaId: 'transporte' } },
      [],
      idFixo,
    )
    expect(r.despesas).toEqual([])
  })

  it('usar como rendimento devolve o valor e não cria despesa', () => {
    const d: Record<string, Decisao> = { m1: { tipo: 'rendimento' } }
    const r = aplicarDecisoes(
      [item({ id: 'm1', valor: 556.04, sinal: 'credito' })],
      d,
      [],
      idFixo,
    )
    expect(r.despesas).toEqual([])
    expect(r.rendimentoMensal).toBe(556.04)
    expect(r.linhasIgnoradas).toEqual(['m1'])
  })
})

describe('decisoesSugeridas', () => {
  const categorias = [
    { id: 'alim', nome: 'Alimentação', fatia: 'essencial' as const },
    { id: 'velha', nome: 'Velha', fatia: 'essencial' as const, arquivada: true },
  ]

  it('pré-escolhe a categoria sugerida pela regra', () => {
    const c: MovimentoClassificado = { ...item({ id: 'm1' }), categoriaSugerida: 'alim' }
    expect(decisoesSugeridas([c], categorias)).toEqual({
      m1: { tipo: 'despesa', categoriaId: 'alim' },
    })
  })

  it('não sugere categorias arquivadas nem créditos', () => {
    const arquivada: MovimentoClassificado = { ...item({ id: 'm1' }), categoriaSugerida: 'velha' }
    const credito: MovimentoClassificado = {
      ...item({ id: 'm2', sinal: 'credito' }),
      categoriaSugerida: 'alim',
    }
    expect(decisoesSugeridas([arquivada, credito], categorias)).toEqual({})
  })
})
