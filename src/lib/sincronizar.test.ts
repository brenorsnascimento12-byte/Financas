import { describe, expect, it } from 'vitest'
import type { Despesa, Orcamento } from '../types'
import { deBase64, paraBase64 } from './github'
import { fundir, marcarAlteracoes, podarLapides, sincronizar } from './sincronizar'

const d = (id: string, valor: number): Despesa => ({
  id,
  data: '2026-10-01',
  valor,
  categoriaId: 'c',
})

const orc = (p: Partial<Orcamento> = {}): Orcamento =>
  ({
    rendimentoMensal: 600,
    alvoEssencial: 46,
    despesas: [],
    categorias: [],
    objetivos: [],
    aportes: [],
    saldos: [],
    compromissos: [],
    revisoes: [],
    regras: [],
    linhasIgnoradas: [],
    sincronizacao: { alteradoEm: {}, apagados: {} },
    ...p,
  }) as unknown as Orcamento

const com = (o: Orcamento, alteradoEm: Record<string, string>, apagados: Record<string, string> = {}) =>
  ({ ...o, sincronizacao: { ...o.sincronizacao, alteradoEm, apagados } }) as Orcamento

describe('marcarAlteracoes', () => {
  it('marca um registo novo', () => {
    const antes = orc()
    const depois = orc({ despesas: [d('d1', 10)] })
    const r = marcarAlteracoes(antes, depois, '2026-10-31T10:00:00Z')
    expect(r.sincronizacao.alteradoEm.d1).toBe('2026-10-31T10:00:00Z')
  })

  it('marca um registo alterado', () => {
    const antes = com(orc({ despesas: [d('d1', 10)] }), { d1: '2026-10-01T00:00:00Z' })
    const depois = { ...antes, despesas: [d('d1', 99)] }
    const r = marcarAlteracoes(antes, depois, '2026-10-31T10:00:00Z')
    expect(r.sincronizacao.alteradoEm.d1).toBe('2026-10-31T10:00:00Z')
  })

  it('não remarca um registo que não mudou', () => {
    // Remarcar tudo a cada gravação fazia qualquer aparelho ganhar sempre a
    // fusão, só por ter aberto a app mais tarde.
    const antes = com(orc({ despesas: [d('d1', 10)] }), { d1: '2026-10-01T00:00:00Z' })
    const depois = { ...antes, despesas: [d('d1', 10)], rendimentoMensal: 700 }
    const r = marcarAlteracoes(antes, depois, '2026-10-31T10:00:00Z')
    expect(r.sincronizacao.alteradoEm.d1).toBe('2026-10-01T00:00:00Z')
  })

  it('dá lápide a um registo removido', () => {
    const antes = orc({ despesas: [d('d1', 10)] })
    const depois = orc({ despesas: [] })
    const r = marcarAlteracoes(antes, depois, '2026-10-31T10:00:00Z')
    expect(r.sincronizacao.apagados.d1).toBe('2026-10-31T10:00:00Z')
    expect(r.sincronizacao.alteradoEm.d1).toBeUndefined()
  })

  it('marca um campo escalar alterado e deixa os outros em paz', () => {
    const antes = com(orc(), { alvoEssencial: '2026-01-01T00:00:00Z' })
    const depois = { ...antes, rendimentoMensal: 700 }
    const r = marcarAlteracoes(antes, depois, '2026-10-31T10:00:00Z')
    expect(r.sincronizacao.alteradoEm.rendimentoMensal).toBe('2026-10-31T10:00:00Z')
    expect(r.sincronizacao.alteradoEm.alvoEssencial).toBe('2026-01-01T00:00:00Z')
  })

  it('um registo que volta a existir perde a lápide', () => {
    const antes = com(orc(), {}, { d1: '2026-10-01T00:00:00Z' })
    const depois = { ...antes, despesas: [d('d1', 10)] }
    const r = marcarAlteracoes(antes, depois, '2026-10-31T10:00:00Z')
    expect(r.sincronizacao.apagados.d1).toBeUndefined()
  })
})

describe('fundir', () => {
  const t1 = '2026-10-01T00:00:00Z'
  const t2 = '2026-10-20T00:00:00Z'

  it('junta registos que só existem de um lado', () => {
    const local = com(orc({ despesas: [d('a', 1)] }), { a: t1 })
    const remoto = com(orc({ despesas: [d('b', 2)] }), { b: t1 })
    expect(
      fundir(local, remoto)
        .despesas.map((x) => x.id)
        .sort(),
    ).toEqual(['a', 'b'])
  })

  it('com o mesmo id, ganha a versão mais recente', () => {
    const local = com(orc({ despesas: [d('a', 1)] }), { a: t1 })
    const remoto = com(orc({ despesas: [d('a', 2)] }), { a: t2 })
    expect(fundir(local, remoto).despesas[0].valor).toBe(2)
    expect(fundir(remoto, local).despesas[0].valor).toBe(2)
  })

  it('não ressuscita um registo apagado no outro aparelho', () => {
    // O caso que o "mais recente ganha" sobre o ficheiro todo fazia mal: apagar
    // no telemóvel e o PC devolvia tudo na sincronização seguinte.
    const local = com(orc({ despesas: [d('a', 1)] }), { a: t1 })
    const remoto = com(orc(), {}, { a: t2 })
    expect(fundir(local, remoto).despesas).toEqual([])
    expect(fundir(remoto, local).despesas).toEqual([])
  })

  it('uma edição posterior ganha a uma lápide antiga', () => {
    const local = com(orc({ despesas: [d('a', 1)] }), { a: t2 })
    const remoto = com(orc(), {}, { a: t1 })
    expect(fundir(local, remoto).despesas).toHaveLength(1)
  })

  it('escolhe cada campo escalar pelo lado que o mudou mais tarde', () => {
    // Mexer no rendimento no telemóvel e nos indicadores no PC não pode fazer
    // uma das duas alterações desaparecer.
    const local = com(orc({ rendimentoMensal: 700 }), { rendimentoMensal: t2 })
    const remoto = com(orc({ alvoEssencial: 50 }), { alvoEssencial: t2 })
    const r = fundir(local, remoto)
    expect(r.rendimentoMensal).toBe(700)
    expect(r.alvoEssencial).toBe(50)
  })

  it('é simétrico: a ordem dos aparelhos não muda o resultado', () => {
    const local = com(orc({ despesas: [d('a', 1), d('b', 5)], rendimentoMensal: 700 }), {
      a: t1,
      b: t2,
      rendimentoMensal: t2,
    })
    const remoto = com(orc({ despesas: [d('a', 9)], alvoEssencial: 50 }), {
      a: t2,
      alvoEssencial: t1,
    })
    expect(JSON.stringify(fundir(local, remoto))).toBe(JSON.stringify(fundir(remoto, local)))
  })

  it('com marcas iguais escolhe sempre o mesmo lado', () => {
    const local = com(orc({ despesas: [d('a', 1)] }), { a: t1 })
    const remoto = com(orc({ despesas: [d('a', 2)] }), { a: t1 })
    expect(fundir(local, remoto).despesas[0].valor).toBe(fundir(remoto, local).despesas[0].valor)
  })

  it('fica com a marca mais recente de cada registo', () => {
    const local = com(orc({ despesas: [d('a', 1)] }), { a: t1 })
    const remoto = com(orc({ despesas: [d('a', 2)] }), { a: t2 })
    expect(fundir(local, remoto).sincronizacao.alteradoEm.a).toBe(t2)
  })

  it('guarda as lápides dos dois lados', () => {
    const local = com(orc(), {}, { a: t1 })
    const remoto = com(orc(), {}, { b: t2 })
    const r = fundir(local, remoto)
    expect(Object.keys(r.sincronizacao.apagados).sort()).toEqual(['a', 'b'])
  })

  it('um lado sem marcas nenhumas não apaga o que o outro tem', () => {
    // Primeira sincronização: o ficheiro remoto ainda não conhece este aparelho.
    const local = com(orc({ despesas: [d('a', 1)] }), { a: t2 })
    const remoto = orc()
    expect(fundir(local, remoto).despesas).toHaveLength(1)
  })
})

describe('podarLapides', () => {
  it('esquece as lápides velhas, que já ninguém pode ressuscitar', () => {
    const o = com(orc(), {}, { velha: '2026-01-01T00:00:00Z', nova: '2026-10-20T00:00:00Z' })
    const r = podarLapides(o, '2026-10-31T00:00:00Z', 90)
    expect(Object.keys(r.sincronizacao.apagados)).toEqual(['nova'])
  })

  it('não mexe nas marcas de alteração', () => {
    const o = com(orc(), { a: '2026-01-01T00:00:00Z' }, {})
    expect(podarLapides(o, '2026-10-31T00:00:00Z', 90).sincronizacao.alteradoEm.a).toBe(
      '2026-01-01T00:00:00Z',
    )
  })
})

describe('sincronizar', () => {
  const hoje = '2026-10-31T12:00:00Z'
  const cred = { repo: 'breno/dados', token: 't' }

  const respostaLer = (orcamento: unknown, sha = 's1') =>
    new Response(JSON.stringify({ content: paraBase64(JSON.stringify(orcamento)), sha }), {
      status: 200,
    })

  it('com o repositório vazio, escreve o que está no aparelho', async () => {
    const local = com(orc({ despesas: [d('a', 1)] }), { a: '2026-10-01T00:00:00Z' })
    let enviado: Orcamento | null = null
    const buscar = ((u: string, init?: RequestInit) => {
      // 404 só no ficheiro: o repositório vê-se, senão era falta de acesso.
      if (init?.method !== 'PUT')
        return Promise.resolve(new Response(null, { status: u.endsWith('.json') ? 404 : 200 }))
      const corpo = JSON.parse(String(init.body)) as { content: string }
      enviado = JSON.parse(deBase64(corpo.content)) as Orcamento
      return Promise.resolve(new Response(JSON.stringify({ content: { sha: 'novo' } }), { status: 201 }))
    }) as unknown as typeof fetch

    const r = await sincronizar(local, cred, buscar, hoje)
    expect(enviado!.despesas).toHaveLength(1)
    expect(r.orcamento.sincronizacao.ultimaSync).toBe(hoje)
  })

  it('junta o que está no repositório com o que está no aparelho', async () => {
    const local = com(orc({ despesas: [d('a', 1)] }), { a: '2026-10-01T00:00:00Z' })
    const remoto = com(orc({ despesas: [d('b', 2)] }), { b: '2026-10-02T00:00:00Z' })
    const buscar = ((_u: string, init?: RequestInit) =>
      Promise.resolve(
        init?.method === 'PUT'
          ? new Response(JSON.stringify({ content: { sha: 'novo' } }), { status: 200 })
          : respostaLer(remoto),
      )) as unknown as typeof fetch

    const r = await sincronizar(local, cred, buscar, hoje)
    expect(r.orcamento.despesas.map((x) => x.id).sort()).toEqual(['a', 'b'])
  })

  it('se o outro aparelho escrever a meio, volta a ler e funde em vez de passar por cima', async () => {
    const local = com(orc({ despesas: [d('a', 1)] }), { a: '2026-10-01T00:00:00Z' })
    const remotoTardio = com(orc({ despesas: [d('c', 3)] }), { c: '2026-10-30T00:00:00Z' })
    let puts = 0
    const buscar = ((_u: string, init?: RequestInit) => {
      if (init?.method === 'PUT') {
        puts += 1
        return Promise.resolve(
          puts === 1
            ? new Response(null, { status: 409 })
            : new Response(JSON.stringify({ content: { sha: 'novo' } }), { status: 200 }),
        )
      }
      return Promise.resolve(respostaLer(puts === 0 ? orc() : remotoTardio))
    }) as unknown as typeof fetch

    const r = await sincronizar(local, cred, buscar, hoje)
    expect(puts).toBe(2)
    expect(r.orcamento.despesas.map((x) => x.id).sort()).toEqual(['a', 'c'])
  })

  it('conflito atrás de conflito desiste, sem apagar nada do aparelho', async () => {
    const local = com(orc({ despesas: [d('a', 1)] }), { a: '2026-10-01T00:00:00Z' })
    const buscar = ((_u: string, init?: RequestInit) =>
      Promise.resolve(
        init?.method === 'PUT' ? new Response(null, { status: 409 }) : respostaLer(orc()),
      )) as unknown as typeof fetch

    await expect(sincronizar(local, cred, buscar, hoje)).rejects.toMatchObject({
      tipo: 'conflito',
    })
  })

  it('aproveita para esquecer as lápides velhas', async () => {
    const local = com(orc(), {}, { velha: '2020-01-01T00:00:00Z' })
    const buscar = ((u: string, init?: RequestInit) =>
      Promise.resolve(
        init?.method === 'PUT'
          ? new Response(JSON.stringify({ content: { sha: 'n' } }), { status: 200 })
          : new Response(null, { status: u.endsWith('.json') ? 404 : 200 }),
      )) as unknown as typeof fetch

    const r = await sincronizar(local, cred, buscar, hoje)
    expect(r.orcamento.sincronizacao.apagados).toEqual({})
  })
})

describe('alterações locais por enviar', () => {
  it('uma alteração neste aparelho fica datada', () => {
    const antes = orc()
    const depois = { ...antes, rendimentoMensal: 700 }
    const r = marcarAlteracoes(antes, depois, '2026-10-31T10:00:00Z')
    expect(r.sincronizacao.alteradoLocalmenteEm).toBe('2026-10-31T10:00:00Z')
  })

  it('gravar sem mudar nada não conta como alteração por enviar', () => {
    const antes = com(orc({ despesas: [d('a', 1)] }), { a: '2026-10-01T00:00:00Z' })
    const r = marcarAlteracoes(antes, { ...antes }, '2026-10-31T10:00:00Z')
    expect(r.sincronizacao.alteradoLocalmenteEm).toBeUndefined()
  })

  it('o que vem do outro aparelho não fica por enviar', () => {
    // A fusão traz marcas recentes feitas noutro sítio: se contassem como locais,
    // a app dizia "por sincronizar" logo a seguir a ter sincronizado.
    const local = com(orc(), { x: '2026-10-01T00:00:00Z' })
    const remoto = com(orc({ despesas: [d('z', 1)] }), { z: '2027-01-01T00:00:00Z' })
    expect(fundir(local, remoto).sincronizacao.alteradoLocalmenteEm).toBeUndefined()
  })
})
