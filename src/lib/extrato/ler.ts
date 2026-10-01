/**
 * Extrai as linhas de texto de um PDF, no dispositivo.
 *
 * A `pdfjs-dist` pesa cerca de 1 MB contra os 74 KB da app, por isso é
 * importada só aqui dentro, quando o utilizador importa de facto. Fica
 * empacotada connosco e nunca é servida de um CDN: a app tem de continuar a
 * funcionar offline e sem depender de terceiros.
 */
export async function lerPdf(ficheiro: File): Promise<string[]> {
  const pdfjs = await import('pdfjs-dist')
  const worker = await import('pdfjs-dist/build/pdf.worker.mjs?url')
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default

  const dados = await ficheiro.arrayBuffer()
  let documento
  try {
    documento = await pdfjs.getDocument({ data: dados }).promise
  } catch {
    // Sem mensagens cruas da pdf.js, em inglês, à frente do utilizador.
    throw new Error('Este ficheiro não é um PDF válido, ou está danificado.')
  }

  const linhas: string[] = []
  for (let n = 1; n <= documento.numPages; n++) {
    const pagina = await documento.getPage(n)
    const conteudo = await pagina.getTextContent()

    // Os itens vêm soltos, com posição. Agrupam-se por linha pela coordenada
    // vertical: itens cuja diferença de altura é inferior a 2 pontos pertencem
    // à mesma linha, e ordenam-se da esquerda para a direita.
    const porAltura = new Map<number, { x: number; texto: string }[]>()
    for (const item of conteudo.items) {
      if (!('str' in item) || item.str.trim() === '') continue
      const y = Math.round(item.transform[5] / 2) * 2
      const grupo = porAltura.get(y) ?? []
      grupo.push({ x: item.transform[4], texto: item.str })
      porAltura.set(y, grupo)
    }

    // De cima para baixo: no PDF a origem vertical é em baixo.
    const alturas = [...porAltura.keys()].sort((a, b) => b - a)
    for (const y of alturas) {
      const grupo = porAltura.get(y)!.sort((a, b) => a.x - b.x)
      linhas.push(
        grupo
          .map((g) => g.texto)
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim(),
      )
    }
  }

  if (linhas.length === 0) {
    throw new Error(
      'Não consegui extrair texto deste PDF. Se for uma imagem digitalizada, não há nada a ler.',
    )
  }

  return linhas
}
