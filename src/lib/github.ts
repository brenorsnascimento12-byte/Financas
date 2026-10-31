import type { Orcamento } from '../types'

/** Onde fica a cópia. O nome é fixo: um repositório, um ficheiro. */
const FICHEIRO = 'financas.json'
const API = 'https://api.github.com'
const REPO_VALIDO = /^[\w.-]+\/[\w.-]+$/

export interface Credenciais {
  /** "utilizador/repositório", privado. */
  repo: string
  token: string
}

export type TipoErro = 'repo' | 'acesso' | 'conflito' | 'rede' | 'formato'

/**
 * Erro com um tipo que quem chama consegue tratar, e uma mensagem já escrita
 * para se mostrar tal como está — nada de erros crus do motor à frente de quem
 * só quer saber se os dados estão guardados.
 */
export class ErroSync extends Error {
  readonly tipo: TipoErro

  constructor(tipo: TipoErro, mensagem: string) {
    super(mensagem)
    this.name = 'ErroSync'
    this.tipo = tipo
  }
}

/** Base64 por bytes UTF-8: com btoa direto, um "ã" rebentava. */
export function paraBase64(texto: string): string {
  const bytes = new TextEncoder().encode(texto)
  let binario = ''
  for (const b of bytes) binario += String.fromCharCode(b)
  return btoa(binario)
}

export function deBase64(b64: string): string {
  const binario = atob(b64.replace(/\s/g, ''))
  const bytes = Uint8Array.from(binario, (c) => c.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

const cabecalhos = (token: string) => ({
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'Content-Type': 'application/json',
})

const url = (repo: string) => `${API}/repos/${repo}/contents/${FICHEIRO}`

const SEM_ACESSO =
  'Não foi possível chegar ao repositório. Confirma o nome (utilizador/repositório, com as maiúsculas certas) e que o token dá acesso de Conteúdo a esse repositório.'

function validar(repo: string) {
  if (!REPO_VALIDO.test(repo)) {
    throw new ErroSync('repo', 'O repositório tem de ser no formato utilizador/repositório.')
  }
}

async function pedir(destino: string, init: RequestInit, buscar: typeof fetch): Promise<Response> {
  try {
    return await buscar(destino, init)
  } catch {
    // Sem rede, ou o telemóvel sem dados: não é perda de nada, é adiar.
    throw new ErroSync('rede', 'Sem ligação. Os dados ficam guardados no aparelho.')
  }
}

function verificarAcesso(r: Response) {
  if (r.status === 401 || r.status === 403) {
    throw new ErroSync(
      'acesso',
      'O acesso ao repositório expirou ou foi recusado. Renova o token nas definições.',
    )
  }
}

/**
 * Num repositório privado que o token não consegue ver, a API responde 404 em
 * vez de 403 — de propósito, para não revelar que ele existe. Isso faz com que
 * "ainda não há ficheiro", "o nome está errado" e "o token não chega lá" cheguem
 * todos iguais. Pergunta-se pelo repositório para os separar.
 */
async function repositorioVisivel(c: Credenciais, buscar: typeof fetch): Promise<boolean> {
  const r = await pedir(`${API}/repos/${c.repo}`, { headers: cabecalhos(c.token) }, buscar)
  return r.ok
}

export interface Remoto {
  orcamento: Orcamento | null
  /** Identifica a versão que está lá: é o que deteta escritas do outro aparelho. */
  sha: string | null
}

export async function lerRemoto(c: Credenciais, buscar: typeof fetch = fetch): Promise<Remoto> {
  validar(c.repo)
  const r = await pedir(url(c.repo), { headers: cabecalhos(c.token) }, buscar)

  if (r.status === 404) {
    // Ficheiro em falta num repositório que se vê é a primeira sincronização.
    if (await repositorioVisivel(c, buscar)) return { orcamento: null, sha: null }
    throw new ErroSync('acesso', SEM_ACESSO)
  }
  verificarAcesso(r)
  if (!r.ok) {
    throw new ErroSync('rede', `O GitHub respondeu ${r.status}. Tenta outra vez daqui a pouco.`)
  }

  let dados: { content?: string; sha?: string }
  try {
    dados = (await r.json()) as { content?: string; sha?: string }
  } catch {
    throw new ErroSync('formato', 'A resposta do GitHub veio ilegível.')
  }
  if (typeof dados.content !== 'string') {
    throw new ErroSync('formato', 'O ficheiro remoto veio sem conteúdo.')
  }

  try {
    return { orcamento: JSON.parse(deBase64(dados.content)) as Orcamento, sha: dados.sha ?? null }
  } catch {
    throw new ErroSync(
      'formato',
      'O ficheiro no repositório não é uma cópia válida da app. Não foi tocado.',
    )
  }
}

/**
 * Escreve a cópia. O `sha` é o da versão que se leu: se o outro aparelho
 * escreveu entretanto, o GitHub recusa e isto devolve um conflito — quem chama
 * volta a ler, funde e tenta de novo, em vez de passar por cima.
 */
export async function escreverRemoto(
  c: Credenciais,
  orcamento: Orcamento,
  sha: string | null,
  buscar: typeof fetch = fetch,
): Promise<string> {
  validar(c.repo)
  const corpo: Record<string, unknown> = {
    message: `Sincronização de ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`,
    // O orçamento vai à raiz, tal como `lerRemoto` o espera. Passa pela mesma
    // migração de uma exportação antiga quando for lido.
    content: paraBase64(JSON.stringify(orcamento, null, 2)),
  }
  if (sha !== null) corpo.sha = sha

  const r = await pedir(
    url(c.repo),
    { method: 'PUT', headers: cabecalhos(c.token), body: JSON.stringify(corpo) },
    buscar,
  )

  verificarAcesso(r)
  if (r.status === 404) throw new ErroSync('acesso', SEM_ACESSO)
  if (r.status === 409 || r.status === 422) {
    throw new ErroSync('conflito', 'O outro aparelho escreveu entretanto. A juntar as duas versões.')
  }
  if (!r.ok) {
    throw new ErroSync('rede', `O GitHub respondeu ${r.status}. Nada foi guardado lá.`)
  }

  const dados = (await r.json().catch(() => ({}))) as { content?: { sha?: string } }
  return dados.content?.sha ?? ''
}
