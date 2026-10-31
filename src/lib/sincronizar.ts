import type { Orcamento, Sincronizacao } from '../types'
import { ErroSync, escreverRemoto, lerRemoto, type Credenciais } from './github'

/**
 * As listas de registos, que se fundem registo a registo pelo id. Tudo o que
 * não está aqui (nem é a própria sincronização) é campo solto e funde-se campo
 * a campo: mexer no rendimento no telemóvel e nos indicadores no PC não pode
 * fazer uma das alterações desaparecer.
 */
const COLECOES = [
  'categorias',
  'despesas',
  'objetivos',
  'aportes',
  'saldos',
  'compromissos',
  'revisoes',
  'regras',
] as const

type Colecao = (typeof COLECOES)[number]

interface ComId {
  id: string
}

const eColecao = (chave: string): chave is Colecao => (COLECOES as readonly string[]).includes(chave)

const camposSoltos = (o: Orcamento) =>
  (Object.keys(o) as (keyof Orcamento)[]).filter(
    (k) => k !== 'sincronizacao' && !eColecao(k as string),
  )

const registos = (o: Orcamento, c: Colecao): ComId[] => (o[c] as unknown as ComId[]) ?? []

/** Mapa com as chaves por ordem, para dois aparelhos gerarem o mesmo ficheiro. */
const ordenado = (m: Record<string, string>): Record<string, string> =>
  Object.fromEntries(Object.keys(m).sort().map((k) => [k, m[k]]))

/**
 * Compara o estado antes e depois de uma alteração e marca só o que mudou.
 *
 * Marcar tudo a cada gravação faria o aparelho que abriu a app mais tarde ganhar
 * sempre a fusão, mesmo sem ter mexido em nada.
 */
export function marcarAlteracoes(anterior: Orcamento, novo: Orcamento, agora: string): Orcamento {
  const alteradoEm = { ...novo.sincronizacao.alteradoEm }
  const apagados = { ...novo.sincronizacao.apagados }

  for (const c of COLECOES) {
    const antes = new Map(registos(anterior, c).map((r) => [r.id, JSON.stringify(r)]))
    const depois = new Map(registos(novo, c).map((r) => [r.id, JSON.stringify(r)]))

    for (const [id, json] of depois) {
      if (antes.get(id) !== json) alteradoEm[id] = agora
      // Voltou a existir: a lápide deixa de valer.
      delete apagados[id]
    }
    for (const id of antes.keys()) {
      if (!depois.has(id)) {
        apagados[id] = agora
        delete alteradoEm[id]
      }
    }
  }

  for (const campo of camposSoltos(novo)) {
    if (JSON.stringify(anterior[campo]) !== JSON.stringify(novo[campo])) {
      alteradoEm[campo] = agora
    }
  }

  const mexeu =
    JSON.stringify(alteradoEm) !== JSON.stringify(novo.sincronizacao.alteradoEm) ||
    JSON.stringify(apagados) !== JSON.stringify(novo.sincronizacao.apagados)

  return {
    ...novo,
    sincronizacao: {
      ...novo.sincronizacao,
      alteradoEm: ordenado(alteradoEm),
      apagados: ordenado(apagados),
      alteradoLocalmenteEm: mexeu
        ? agora
        : novo.sincronizacao.alteradoLocalmenteEm,
    },
  }
}

const maisRecente = (a: string | undefined, b: string | undefined) =>
  a === undefined ? b : b === undefined ? a : a >= b ? a : b

function juntarMarcas(
  a: Record<string, string>,
  b: Record<string, string>,
): Record<string, string> {
  const r: Record<string, string> = {}
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    r[k] = maisRecente(a[k], b[k]) as string
  }
  return ordenado(r)
}

/**
 * Junta dois estados sem perder alterações de nenhum dos lados.
 *
 * Registo a registo, ganha a versão marcada mais tarde; uma lápide posterior à
 * última alteração apaga o registo, e uma alteração posterior à lápide traz-o de
 * volta. Os campos soltos escolhem-se um a um pelo mesmo critério.
 *
 * O resultado é o mesmo seja qual for a ordem dos argumentos — se dependesse de
 * quem funde, os dois aparelhos ficavam a reescrever o ficheiro um ao outro sem
 * fim. É por isso que as listas saem ordenadas pela marca e, em empate, pelo id.
 */
export function fundir(local: Orcamento, remoto: Orcamento): Orcamento {
  const alteradoEm = juntarMarcas(local.sincronizacao.alteradoEm, remoto.sincronizacao.alteradoEm)
  const apagados = juntarMarcas(local.sincronizacao.apagados, remoto.sincronizacao.apagados)

  const resultado = { ...local } as Orcamento

  for (const c of COLECOES) {
    const deA = new Map(registos(local, c).map((r) => [r.id, r]))
    const deB = new Map(registos(remoto, c).map((r) => [r.id, r]))
    const escolhidos: ComId[] = []

    for (const id of new Set([...deA.keys(), ...deB.keys()])) {
      const lapide = apagados[id]
      const marca = alteradoEm[id]
      // Apagado depois da última alteração conhecida: fica apagado.
      if (lapide !== undefined && (marca === undefined || lapide > marca)) continue

      const a = deA.get(id)
      const b = deB.get(id)
      if (a === undefined || b === undefined) {
        escolhidos.push((a ?? b) as ComId)
        continue
      }
      const ta = local.sincronizacao.alteradoEm[id]
      const tb = remoto.sincronizacao.alteradoEm[id]
      if (ta === tb) {
        // Empate: decide o conteúdo, para os dois aparelhos decidirem igual.
        escolhidos.push(JSON.stringify(a) <= JSON.stringify(b) ? a : b)
      } else {
        escolhidos.push(maisRecente(ta, tb) === ta ? a : b)
      }
    }

    escolhidos.sort((x, y) => {
      const mx = alteradoEm[x.id] ?? ''
      const my = alteradoEm[y.id] ?? ''
      return mx === my ? x.id.localeCompare(y.id) : mx.localeCompare(my)
    })
    ;(resultado as unknown as Record<string, unknown>)[c] = escolhidos
  }

  for (const campo of camposSoltos(local)) {
    const ta = local.sincronizacao.alteradoEm[campo as string]
    const tb = remoto.sincronizacao.alteradoEm[campo as string]
    const ganhador =
      ta === tb
        ? JSON.stringify(local[campo]) <= JSON.stringify(remoto[campo])
          ? local
          : remoto
        : maisRecente(ta, tb) === ta
          ? local
          : remoto
    ;(resultado as unknown as Record<string, unknown>)[campo as string] = ganhador[campo]
  }

  const sincronizacao: Sincronizacao = {
    ...local.sincronizacao,
    alteradoEm,
    apagados,
  }
  return { ...resultado, sincronizacao }
}

/**
 * Esquece lápides antigas. Depois de os dois aparelhos terem sincronizado, já
 * ninguém tem o registo para o ressuscitar, e a lista cresceria para sempre.
 */
export function podarLapides(o: Orcamento, agora: string, dias: number): Orcamento {
  const limite = new Date(new Date(agora).getTime() - dias * 86400000).toISOString()
  const apagados = Object.fromEntries(
    Object.entries(o.sincronizacao.apagados).filter(([, quando]) => quando >= limite),
  )
  return { ...o, sincronizacao: { ...o.sincronizacao, apagados: ordenado(apagados) } }
}

/** Quanto tempo se guardam as lápides antes de se poderem esquecer. */
const DIAS_LAPIDE = 90

/** Tentativas antes de desistir: cada conflito obriga a ler e fundir de novo. */
const TENTATIVAS = 3

export interface ResultadoSync {
  orcamento: Orcamento
  sha: string
}

/**
 * Uma sincronização completa: ler o que lá está, juntar com o que está cá,
 * escrever o resultado.
 *
 * O `sha` lido vai no pedido de escrita. Se o outro aparelho escreveu entretanto,
 * o GitHub recusa em vez de deixar passar por cima, e voltamos ao princípio com
 * a versão nova — por isso é que uma escrita perdida não existe aqui, só uma
 * fusão a mais.
 */
export async function sincronizar(
  local: Orcamento,
  credenciais: Credenciais,
  buscar: typeof fetch = fetch,
  agora: string = new Date().toISOString(),
): Promise<ResultadoSync> {
  let ultimoErro: unknown

  for (let tentativa = 0; tentativa < TENTATIVAS; tentativa++) {
    const remoto = await lerRemoto(credenciais, buscar)
    const juntado = remoto.orcamento === null ? local : fundir(local, remoto.orcamento)
    const podado = podarLapides(juntado, agora, DIAS_LAPIDE)
    const paraGravar: Orcamento = {
      ...podado,
      sincronizacao: { ...podado.sincronizacao, repo: credenciais.repo, ultimaSync: agora },
    }

    try {
      const sha = await escreverRemoto(credenciais, paraGravar, remoto.sha, buscar)
      return { orcamento: paraGravar, sha }
    } catch (e) {
      // Só o conflito se repete: tudo o resto (acesso, rede) é para mostrar já.
      if (!(e instanceof ErroSync) || e.tipo !== 'conflito') throw e
      ultimoErro = e
    }
  }

  throw ultimoErro
}
