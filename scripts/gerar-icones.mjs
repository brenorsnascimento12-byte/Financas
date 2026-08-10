// Gera os PNG do manifesto a partir dos SVG em public/.
// Correr com: node scripts/gerar-icones.mjs
import sharp from 'sharp'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')
const publico = join(raiz, 'public')

const trabalhos = [
  { origem: 'icone.svg', destino: 'icone-192.png', tamanho: 192 },
  { origem: 'icone.svg', destino: 'icone-512.png', tamanho: 512 },
  { origem: 'icone-maskable.svg', destino: 'icone-maskable-512.png', tamanho: 512 },
]

for (const { origem, destino, tamanho } of trabalhos) {
  const svg = await readFile(join(publico, origem))
  await sharp(svg, { density: 384 }).resize(tamanho, tamanho).png().toFile(join(publico, destino))
  console.log(`${destino} (${tamanho}px)`)
}
