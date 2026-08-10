import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { dataCurta, eur } from '../lib/formato'

export interface PontoPatrimonio {
  data: string
  total: number
  investido: number
  liquidez: number
  aportadoAte: number
}

interface Props {
  pontos: PontoPatrimonio[]
}

const FONTE_EIXO = '11px system-ui, -apple-system, "Segoe UI", sans-serif'

const medirTexto = (() => {
  let ctx: CanvasRenderingContext2D | null | undefined
  return (texto: string) => {
    if (ctx === undefined) ctx = document.createElement('canvas').getContext('2d')
    if (!ctx) return texto.length * 6.3
    ctx.font = FONTE_EIXO
    return ctx.measureText(texto).width
  }
})()

function escalaAgradavel(min: number, max: number, alvo = 4) {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
    const topo = Number.isFinite(max) && max > 0 ? max : 1
    return { min: 0, max: topo, ticks: [0, topo] }
  }
  const bruto = (max - min) / alvo
  const magnitude = Math.pow(10, Math.floor(Math.log10(bruto)))
  const norm = bruto / magnitude
  const passo = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * magnitude
  const inicio = Math.floor(min / passo) * passo
  const fim = Math.ceil(max / passo) * passo
  const ticks: number[] = []
  for (let v = inicio; v <= fim + passo * 1e-9; v += passo) ticks.push(v)
  return { min: inicio, max: fim, ticks }
}

const curto = (iso: string) => `${iso.slice(8)}/${iso.slice(5, 7)}`

export function GraficoPatrimonio({ pontos }: Props) {
  const envolventeRef = useRef<HTMLDivElement>(null)
  const [largura, setLargura] = useState(680)
  const [ativo, setAtivo] = useState<number | null>(null)

  useLayoutEffect(() => {
    const el = envolventeRef.current
    if (!el) return
    const medir = () => setLargura(Math.max(260, el.getBoundingClientRect().width))
    medir()
    const obs = new ResizeObserver(medir)
    obs.observe(el)
    window.addEventListener('resize', medir)
    return () => {
      obs.disconnect()
      window.removeEventListener('resize', medir)
    }
  }, [])

  const altura = largura < 440 ? 220 : 280
  const escala = useMemo(() => {
    const valores = pontos.flatMap((p) => [p.total, p.aportadoAte])
    return escalaAgradavel(Math.min(0, ...valores), Math.max(...valores, 1))
  }, [pontos])

  const rotulosY = useMemo(() => escala.ticks.map((t) => eur(t)), [escala])
  const margemEsq = Math.ceil(Math.max(...rotulosY.map(medirTexto))) + 14
  const margem = { topo: 14, dir: 14, baixo: 26, esq: margemEsq }
  const larguraPlot = Math.max(1, largura - margem.esq - margem.dir)
  const alturaPlot = Math.max(1, altura - margem.topo - margem.baixo)

  // Escala temporal a sério: espaçar por índice mentiria sobre intervalos desiguais.
  const tempos = pontos.map((p) => new Date(p.data).getTime())
  const tMin = Math.min(...tempos)
  const tMax = Math.max(...tempos)
  const x = (i: number) =>
    margem.esq + (tMax === tMin ? larguraPlot / 2 : ((tempos[i] - tMin) / (tMax - tMin)) * larguraPlot)
  const y = (v: number) =>
    margem.topo + alturaPlot - ((v - escala.min) / Math.max(1e-9, escala.max - escala.min)) * alturaPlot

  const caminho = (sel: (p: PontoPatrimonio) => number) =>
    pontos.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(sel(p)).toFixed(1)}`).join(' ')

  const aoMover = (e: React.PointerEvent<SVGSVGElement>) => {
    const caixa = e.currentTarget.getBoundingClientRect()
    const px = e.clientX - caixa.left
    let melhor = 0
    for (let i = 1; i < pontos.length; i++) {
      if (Math.abs(x(i) - px) < Math.abs(x(melhor) - px)) melhor = i
    }
    setAtivo(melhor)
  }

  const p = ativo === null ? null : pontos[ativo]

  return (
    <div>
      <div className="grafico-topo">
        <div className="legenda">
          <span className="legenda-item">
            <span className="chave-linha" style={{ background: 'var(--serie-1)' }} />
            Património
          </span>
          <span className="legenda-item">
            <span className="chave-linha" style={{ background: 'var(--serie-2)' }} />
            Aportado
          </span>
        </div>
      </div>

      <div className="grafico-envolvente" ref={envolventeRef}>
        <svg
          width={largura}
          height={altura}
          viewBox={`0 0 ${largura} ${altura}`}
          role="img"
          aria-label="Evolução do património face ao total aportado. Valores exatos na tabela abaixo."
          onPointerMove={aoMover}
          onPointerLeave={() => setAtivo(null)}
        >
          {escala.ticks.map((t, i) => (
            <g key={t}>
              <line
                x1={margem.esq}
                x2={margem.esq + larguraPlot}
                y1={y(t)}
                y2={y(t)}
                stroke="var(--gridline)"
                strokeWidth={1}
              />
              <text
                x={margem.esq - 8}
                y={y(t)}
                textAnchor="end"
                dominantBaseline="middle"
                fontSize={11}
                fill="var(--text-muted)"
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {rotulosY[i]}
              </text>
            </g>
          ))}

          <line
            x1={margem.esq}
            x2={margem.esq + larguraPlot}
            y1={y(Math.max(0, escala.min))}
            y2={y(Math.max(0, escala.min))}
            stroke="var(--baseline)"
            strokeWidth={1}
          />

          {/* A diferença entre as duas linhas é o que o mercado deu ou tirou. */}
          <path
            d={`${caminho((q) => q.total)} ${pontos
              .map((q, i) => ({ q, i }))
              .reverse()
              .map(({ q, i }) => `L${x(i).toFixed(1)},${y(q.aportadoAte).toFixed(1)}`)
              .join(' ')} Z`}
            fill="var(--serie-1)"
            fillOpacity={0.1}
          />

          <path
            d={caminho((q) => q.aportadoAte)}
            fill="none"
            stroke="var(--serie-2)"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          <path
            d={caminho((q) => q.total)}
            fill="none"
            stroke="var(--serie-1)"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {pontos.map((q, i) => (
            <circle
              key={q.data + i}
              cx={x(i)}
              cy={y(q.total)}
              r={4.5}
              fill="var(--serie-1)"
              stroke="var(--surface-1)"
              strokeWidth={2}
            />
          ))}

          {p && ativo !== null && (
            <line
              x1={x(ativo)}
              x2={x(ativo)}
              y1={margem.topo}
              y2={margem.topo + alturaPlot}
              stroke="var(--baseline)"
              strokeWidth={1}
              pointerEvents="none"
            />
          )}

          {pontos.length > 1 && (
            <>
              <text x={margem.esq} y={altura - 8} textAnchor="start" fontSize={11} fill="var(--text-muted)">
                {curto(pontos[0].data)}
              </text>
              <text
                x={margem.esq + larguraPlot}
                y={altura - 8}
                textAnchor="end"
                fontSize={11}
                fill="var(--text-muted)"
              >
                {curto(pontos[pontos.length - 1].data)}
              </text>
            </>
          )}
        </svg>

        {p && ativo !== null && (
          <div
            className="dica-grafico"
            style={{
              left: x(ativo) > margem.esq + larguraPlot / 2 ? undefined : x(ativo) + 14,
              right: x(ativo) > margem.esq + larguraPlot / 2 ? largura - x(ativo) + 14 : undefined,
              top: 8,
            }}
          >
            <div className="titulo">{dataCurta(p.data)}</div>
            <div className="dica-linha">
              <span className="nome">
                <span className="chave-linha" style={{ background: 'var(--serie-1)' }} />
                Património
              </span>
              <span className="num">{eur(p.total)}</span>
            </div>
            <div className="dica-linha">
              <span className="nome">
                <span className="chave-linha" style={{ background: 'var(--serie-2)' }} />
                Aportado
              </span>
              <span className="num">{eur(p.aportadoAte)}</span>
            </div>
            <div className="separador" />
            <div className="dica-linha">
              <span className="nome">Mercado</span>
              <span className="num">{eur(p.total - p.aportadoAte)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
