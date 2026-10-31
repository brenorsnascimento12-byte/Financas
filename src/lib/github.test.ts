import { describe, expect, it } from 'vitest'
import { ErroSync, deBase64, escreverRemoto, lerRemoto, paraBase64 } from './github'

const FICHEIRO = 'financas.json'

const cred = { repo: 'breno/financas-dados', token: 'tok' }

const resposta = (estado: number, corpo?: unknown) =>
  new Response(corpo === undefined ? null : JSON.stringify(corpo), { status: estado })

const falso = (f: (url: string, init?: RequestInit) => Response) =>
  ((url: string | URL | Request, init?: RequestInit) =>
    Promise.resolve(f(String(url), init))) as unknown as typeof fetch

describe('base64', () => {
  it('aguenta acentos e cedilhas', () => {
    const texto = JSON.stringify({ nota: 'Alimentação suplementar · 3,48 €' })
    expect(deBase64(paraBase64(texto))).toBe(texto)
  })

  it('lê conteúdo partido em linhas, como o GitHub o devolve', () => {
    const texto = 'a'.repeat(200)
    const partido = paraBase64(texto).replace(/(.{60})/g, '$1\n')
    expect(deBase64(partido)).toBe(texto)
  })
})

describe('lerRemoto', () => {
  it('recusa um repositório mal escrito antes de ir à rede', async () => {
    await expect(lerRemoto({ repo: 'financas', token: 'tok' }, falso(() => resposta(200)))).rejects
      .toThrow(ErroSync)
  })

  it('devolve o orçamento e o sha', async () => {
    const conteudo = paraBase64(JSON.stringify({ rendimentoMensal: 600 }))
    const r = await lerRemoto(
      cred,
      falso(() => resposta(200, { content: conteudo, sha: 'abc123' })),
    )
    expect(r.sha).toBe('abc123')
    expect(r.orcamento).toEqual({ rendimentoMensal: 600 })
  })

  it('um ficheiro que ainda não existe não é um erro', async () => {
    // A primeira sincronização encontra o repositório vazio — mas à vista.
    const r = await lerRemoto(
      cred,
      falso((url) => resposta(url.endsWith(FICHEIRO) ? 404 : 200)),
    )
    expect(r.orcamento).toBeNull()
    expect(r.sha).toBeNull()
  })

  it('manda o token no cabeçalho', async () => {
    let visto: string | null = null
    await lerRemoto(
      cred,
      falso((url, init) => {
        visto = new Headers(init?.headers).get('Authorization')
        return resposta(url.endsWith(FICHEIRO) ? 404 : 200)
      }),
    )
    expect(visto).toBe('Bearer tok')
  })

  it('token inválido ou expirado dá um erro de acesso', async () => {
    await expect(lerRemoto(cred, falso(() => resposta(401)))).rejects.toMatchObject({
      tipo: 'acesso',
    })
  })

  it('sem permissão no repositório também é acesso', async () => {
    await expect(lerRemoto(cred, falso(() => resposta(403)))).rejects.toMatchObject({
      tipo: 'acesso',
    })
  })

  it('conteúdo que não é JSON dá mensagem em português, não erro cru', async () => {
    const erro = await lerRemoto(
      cred,
      falso(() => resposta(200, { content: paraBase64('isto não é json'), sha: 's' })),
    ).catch((e) => e)
    expect(erro).toBeInstanceOf(ErroSync)
    expect(erro.tipo).toBe('formato')
    expect(erro.message).not.toMatch(/JSON\.parse|Unexpected token/)
  })

  it('a rede em baixo dá um erro de rede', async () => {
    const buscar = (() => Promise.reject(new TypeError('failed to fetch'))) as unknown as typeof fetch
    await expect(lerRemoto(cred, buscar)).rejects.toMatchObject({ tipo: 'rede' })
  })
})

describe('escreverRemoto', () => {
  const orcamento = { rendimentoMensal: 600 } as never

  it('envia o conteúdo e o sha anterior, e devolve o novo', async () => {
    let corpo: Record<string, unknown> = {}
    const novo = await escreverRemoto(
      cred,
      orcamento,
      'antigo',
      falso((_url, init) => {
        corpo = JSON.parse(String(init?.body))
        return resposta(200, { content: { sha: 'novo' } })
      }),
    )
    expect(corpo.sha).toBe('antigo')
    expect(deBase64(String(corpo.content))).toContain('600')
    expect(novo).toBe('novo')
  })

  it('não envia sha nenhum quando o ficheiro ainda não existe', async () => {
    let corpo: Record<string, unknown> = {}
    await escreverRemoto(
      cred,
      orcamento,
      null,
      falso((_url, init) => {
        corpo = JSON.parse(String(init?.body))
        return resposta(201, { content: { sha: 'primeiro' } })
      }),
    )
    expect('sha' in corpo).toBe(false)
  })

  it('o outro aparelho ter escrito entretanto é um conflito, não uma falha', async () => {
    // Quem chama volta a ler, funde e tenta outra vez — nada se perde.
    await expect(
      escreverRemoto(cred, orcamento, 'velho', falso(() => resposta(409))),
    ).rejects.toMatchObject({ tipo: 'conflito' })
  })

  it('o sha desatualizado também aparece como 422', async () => {
    await expect(
      escreverRemoto(cred, orcamento, 'velho', falso(() => resposta(422))),
    ).rejects.toMatchObject({ tipo: 'conflito' })
  })
})

describe('404, que o GitHub usa para duas coisas diferentes', () => {
  // Num repositório privado que o token não vê, a API responde 404 em vez de
  // 403, para não revelar que ele existe. Confundir isso com "o ficheiro ainda
  // não existe" levava a app a tentar escrever e a falhar com uma mensagem que
  // não dizia nada.
  const respostas = (ficheiro: number, repositorio: number) =>
    falso((url) => resposta(url.endsWith('/contents/financas.json') ? ficheiro : repositorio))

  it('repositório à vista e ficheiro em falta: é a primeira sincronização', async () => {
    const r = await lerRemoto(cred, respostas(404, 200))
    expect(r.orcamento).toBeNull()
    expect(r.sha).toBeNull()
  })

  it('repositório que o token não vê: é problema de acesso, não ficheiro em falta', async () => {
    const erro = await lerRemoto(cred, respostas(404, 404)).catch((e) => e)
    expect(erro).toBeInstanceOf(ErroSync)
    expect(erro.tipo).toBe('acesso')
    expect(erro.message).toMatch(/nome|acesso|permiss/i)
  })

  it('escrever num repositório invisível também é acesso', async () => {
    await expect(
      escreverRemoto(cred, {} as never, null, falso(() => resposta(404))),
    ).rejects.toMatchObject({ tipo: 'acesso' })
  })
})
