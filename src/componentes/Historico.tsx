import { useLayoutEffect, useRef, useState } from 'react'
import type { ResumoMes } from '../types'
import { eur, pct } from '../lib/formato'
import { mediaMovel, nomeMes } from '../lib/orcamento'

interface Props {
  resumos: ResumoMes[]
  alvoPoupanca: number
}

const rotuloCurto = (mes: string) => {
  const [ano, m] = mes.split('-')
  return `${['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'][Number(m) - 1]} ${ano.slice(2)}`
}

export function Historico({ resumos, alvoPoupanca }: Props) {
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

  // Deriva: os 3 meses fechados mais recentes contra os 3 anteriores.
  const fechados = resumos.slice(0, -1)
  const recente = mediaMovel(fechados, 3, fechados.length)
  const anterior = mediaMovel(fechados, 3, fechados.length - 3)
  const deriva = recente !== null && anterior !== null && anterior > 0
    ? (recente - anterior) / anterior
    : null

  const altura = 200
  const margem = { topo: 12, dir: 8, baixo: 26, esq: 40 }
  const larguraPlot = Math.max(1, largura - margem.esq - margem.dir)
  const alturaPlot = altura - margem.topo - margem.baixo

  const maxTaxa = Math.max(1, ...resumos.map((r) => r.taxaPoupanca))
  const minTaxa = Math.min(0, ...resumos.map((r) => r.taxaPoupanca))
  const y = (v: number) => margem.topo + alturaPlot - ((v - minTaxa) / (maxTaxa - minTaxa)) * alturaPlot

  const banda = larguraPlot / Math.max(1, resumos.length)
  const espessura = Math.min(24, Math.max(6, banda - 8))

  return (
    <>
      <section className="cartao">
        <h2>Taxa de poupança por mês</h2>
        {deriva !== null && (
          <p className={`deriva ${deriva > 0.1 ? 'deriva--sobe' : ''}`}>
            {deriva > 0.1 && <span aria-hidden="true">▲ </span>}
            O gasto médio dos últimos 3 meses ({eur(recente!)}) está {pct(Math.abs(deriva))}{' '}
            {deriva >= 0 ? 'acima' : 'abaixo'} dos 3 meses anteriores ({eur(anterior!)}).
          </p>
        )}

        <div className="grafico-envolvente" ref={envolventeRef}>
          <svg
            width={largura}
            height={altura}
            viewBox={`0 0 ${largura} ${altura}`}
            role="img"
            aria-label="Taxa de poupança de cada mês registado. Valores exatos na tabela abaixo."
            onPointerLeave={() => setAtivo(null)}
          >
            {[0, 0.25, 0.5, 0.75, 1].filter((t) => t >= minTaxa && t <= maxTaxa).map((t) => (
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
                  {pct(t)}
                </text>
              </g>
            ))}

            {/* Alvo: a linha que a barra deve ultrapassar */}
            {alvoPoupanca / 100 <= maxTaxa && (
              <line
                x1={margem.esq}
                x2={margem.esq + larguraPlot}
                y1={y(alvoPoupanca / 100)}
                y2={y(alvoPoupanca / 100)}
                stroke="var(--serie-3)"
                strokeWidth={2}
                strokeDasharray="4 3"
              />
            )}

            {resumos.map((r, i) => {
              const cx = margem.esq + banda * i + banda / 2
              const base = y(Math.max(0, minTaxa))
              const topo = y(r.taxaPoupanca)
              const negativa = r.taxaPoupanca < 0
              const alturaBarra = Math.abs(base - topo)
              return (
                <g key={r.mes} onPointerEnter={() => setAtivo(i)}>
                  <rect
                    x={cx - banda / 2}
                    y={margem.topo}
                    width={banda}
                    height={alturaPlot}
                    fill="transparent"
                  />
                  <rect
                    x={cx - espessura / 2}
                    y={negativa ? base : topo}
                    width={espessura}
                    height={Math.max(1, alturaBarra)}
                    rx={4}
                    fill={negativa ? 'var(--critical)' : 'var(--serie-3)'}
                  />
                  {/* Canto vivo do lado da linha de base: só o topo é arredondado. */}
                  <rect
                    x={cx - espessura / 2}
                    y={negativa ? base : base - Math.min(4, alturaBarra)}
                    width={espessura}
                    height={Math.min(4, alturaBarra)}
                    fill={negativa ? 'var(--critical)' : 'var(--serie-3)'}
                  />
                </g>
              )
            })}

            <line
              x1={margem.esq}
              x2={margem.esq + larguraPlot}
              y1={y(Math.max(0, minTaxa))}
              y2={y(Math.max(0, minTaxa))}
              stroke="var(--baseline)"
              strokeWidth={1}
            />

            {resumos.map((r, i) =>
              resumos.length <= 14 || i % 2 === 0 ? (
                <text
                  key={r.mes}
                  x={margem.esq + banda * i + banda / 2}
                  y={altura - 8}
                  textAnchor="middle"
                  fontSize={10}
                  fill="var(--text-muted)"
                >
                  {rotuloCurto(r.mes)}
                </text>
              ) : null,
            )}
          </svg>

          {ativo !== null && resumos[ativo] && (
            <div
              className="dica-grafico"
              style={{
                left: Math.min(largura - 180, margem.esq + banda * ativo + banda / 2 + 10),
                top: 8,
              }}
            >
              <div className="titulo">{nomeMes(resumos[ativo].mes)}</div>
              <div className="dica-linha">
                <span className="nome">Poupança</span>
                <span className="num">{pct(resumos[ativo].taxaPoupanca)}</span>
              </div>
              <div className="dica-linha">
                <span className="nome">Gasto</span>
                <span className="num">{eur(resumos[ativo].gastoTotal)}</span>
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="cartao">
        <h2>Mês a mês</h2>
        <div className="tabela-envolvente">
          <table>
            <thead>
              <tr>
                <th scope="col">Mês</th>
                <th scope="col">Essenciais</th>
                <th scope="col">Não essenciais</th>
                <th scope="col">Poupança</th>
                <th scope="col">Sobrou</th>
              </tr>
            </thead>
            <tbody>
              {[...resumos].reverse().map((r) => (
                <tr key={r.mes}>
                  <th scope="row">{rotuloCurto(r.mes)}</th>
                  <td>
                    {eur(r.gastoEssencial)} <span className="sub-celula">{pct(r.pctEssencial)}</span>
                  </td>
                  <td>
                    {eur(r.gastoNaoEssencial)}{' '}
                    <span className="sub-celula">{pct(r.pctNaoEssencial)}</span>
                  </td>
                  <td>
                    {eur(r.poupanca)} <span className="sub-celula">{pct(r.taxaPoupanca)}</span>
                  </td>
                  <td>{eur(r.excedenteEssencial + r.excedenteNaoEssencial)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}
