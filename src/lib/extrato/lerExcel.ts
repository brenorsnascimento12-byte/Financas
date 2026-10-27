/**
 * Lê a exportação de movimentos do ActivoBank em Excel (.xlsx), no dispositivo.
 *
 * Um .xlsx é um ZIP com XML lá dentro. Em vez de trazer uma biblioteca de folhas
 * de cálculo inteira, lê-se o ZIP à mão e descomprime-se com a
 * `DecompressionStream` do próprio navegador: zero dependências novas e nada
 * sai do telemóvel.
 */

/** O conteúdo de uma célula: texto, número (datas incluídas, em série Excel) ou vazio. */
export type Celula = string | number | null

const SIG_FIM_DIRETORIO = 0x06054b50
const SIG_DIRETORIO = 0x02014b50
const SIG_LOCAL = 0x04034b50

async function inflar(dados: Uint8Array): Promise<Uint8Array> {
  const fluxo = new Blob([dados as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(fluxo).arrayBuffer())
}

/** Devolve os ficheiros do ZIP cujo nome satisfaz `querer`, já descomprimidos. */
async function lerZip(
  buffer: ArrayBuffer,
  querer: (nome: string) => boolean,
): Promise<Map<string, string>> {
  const v = new DataView(buffer)
  const bytes = new Uint8Array(buffer)

  // O fim do diretório central está nos últimos 22 bytes, mais um comentário
  // opcional de até 64 KB. Procura-se a assinatura de trás para a frente.
  let fim = -1
  for (let i = buffer.byteLength - 22; i >= Math.max(0, buffer.byteLength - 65_557); i--) {
    if (v.getUint32(i, true) === SIG_FIM_DIRETORIO) {
      fim = i
      break
    }
  }
  if (fim < 0) throw new Error('Este ficheiro não é um Excel (.xlsx) válido.')

  const total = v.getUint16(fim + 10, true)
  let p = v.getUint32(fim + 16, true)
  const descodificador = new TextDecoder()
  const ficheiros = new Map<string, string>()

  for (let n = 0; n < total; n++) {
    if (v.getUint32(p, true) !== SIG_DIRETORIO) break
    const metodo = v.getUint16(p + 10, true)
    const tamanho = v.getUint32(p + 20, true)
    const lenNome = v.getUint16(p + 28, true)
    const lenExtra = v.getUint16(p + 30, true)
    const lenComentario = v.getUint16(p + 32, true)
    const local = v.getUint32(p + 42, true)
    const nome = descodificador.decode(bytes.subarray(p + 46, p + 46 + lenNome))
    p += 46 + lenNome + lenExtra + lenComentario

    if (!querer(nome)) continue
    if (v.getUint32(local, true) !== SIG_LOCAL) continue
    const inicio = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true)
    const bruto = bytes.subarray(inicio, inicio + tamanho)
    const conteudo = metodo === 0 ? bruto : metodo === 8 ? await inflar(bruto) : null
    if (conteudo) ficheiros.set(nome, descodificador.decode(conteudo))
  }
  return ficheiros
}

const ENTIDADES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
}

function desescapar(texto: string): string {
  return texto.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (todo, e: string) => {
    if (e[0] === '#') {
      const codigo = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1))
      return String.fromCodePoint(codigo)
    }
    return ENTIDADES[e] ?? todo
  })
}

// O ActivoBank escreve as etiquetas com prefixo (`<x:row>`); outros não. Aceita ambos.
const T = /<(?:\w+:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?t>/g
const SI = /<(?:\w+:)?si>([\s\S]*?)<\/(?:\w+:)?si>/g
const ROW = /<(?:\w+:)?row\b[^>]*?(?:\/>|>([\s\S]*?)<\/(?:\w+:)?row>)/g
const C = /<(?:\w+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g
const V = /<(?:\w+:)?v>([\s\S]*?)<\/(?:\w+:)?v>/

const textoDe = (xml: string) => [...xml.matchAll(T)].map((m) => desescapar(m[1])).join('')

const atributo = (atributos: string, nome: string) =>
  atributos.match(new RegExp(`\\b${nome}="([^"]*)"`))?.[1]

/** "C12" → 2. Só as letras contam. */
function indiceColuna(ref: string): number {
  let n = 0
  for (const ch of ref.replace(/\d/g, '')) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

/** Converte o XML de uma folha numa grelha de células. Pura, testável sem ficheiro. */
export function grelhaDaFolha(folhaXml: string, partilhadasXml = ''): Celula[][] {
  const partilhadas = [...partilhadasXml.matchAll(SI)].map((m) => textoDe(m[1]))
  const linhas: Celula[][] = []

  for (const linha of folhaXml.matchAll(ROW)) {
    const celulas: Celula[] = []
    for (const c of (linha[1] ?? '').matchAll(C)) {
      const atrs = c[1]
      const corpo = c[2] ?? ''
      const ref = atributo(atrs, 'r')
      const col = ref ? indiceColuna(ref) : celulas.length
      const tipo = atributo(atrs, 't')
      const v = corpo.match(V)?.[1]

      let valor: Celula = null
      if (tipo === 's' && v !== undefined) valor = partilhadas[Number(v)] ?? null
      else if (tipo === 'inlineStr') valor = textoDe(corpo)
      else if (tipo === 'str' || tipo === 'e') valor = v !== undefined ? desescapar(v) : null
      else if (tipo === 'b') valor = v ?? null
      else if (v !== undefined && v !== '') valor = Number(v)

      while (celulas.length < col) celulas.push(null)
      celulas[col] = valor
    }
    linhas.push(celulas)
  }
  return linhas
}

/** Lê a primeira folha de um .xlsx. */
export async function lerExcel(ficheiro: File): Promise<Celula[][]> {
  const ficheiros = await lerZip(
    await ficheiro.arrayBuffer(),
    (nome) => nome === 'xl/sharedStrings.xml' || /^xl\/worksheets\/sheet\d+\.xml$/.test(nome),
  )
  const folhas = [...ficheiros.keys()].filter((n) => n.startsWith('xl/worksheets/')).sort()
  if (folhas.length === 0) throw new Error('Não encontrei nenhuma folha dentro deste Excel.')
  return grelhaDaFolha(ficheiros.get(folhas[0])!, ficheiros.get('xl/sharedStrings.xml') ?? '')
}
