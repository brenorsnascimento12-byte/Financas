import { eur, pct } from '../lib/formato'

interface Props {
  rotulo: string
  cor: string
  gasto: number
  /** O teto (ou o piso, se `tipo` for 'piso') daquele mês, em euros. */
  alvo: number
  proporcao: number
  alvoProporcao: number
  tipo: 'teto' | 'piso'
}

/**
 * Barra do mês contra o limite do mês. Sem cálculos entre meses e sem cor de
 * alarme: passar o teto é um facto a registar, e o julgamento pertence à página
 * dos excedentes, onde se vê o acumulado.
 */
export function Medidor({ rotulo, cor, gasto, alvo, proporcao, alvoProporcao, tipo }: Props) {
  const razao = alvo > 0 ? gasto / alvo : 0
  const forouLimite = tipo === 'teto' ? razao > 1 : razao < 1
  const restante = alvo - gasto

  return (
    <div className="medidor">
      <div className="medidor-topo">
        <span className="medidor-rotulo">{rotulo}</span>
        <span className="medidor-valores">
          <strong>{eur(gasto)}</strong>
          <span className="medidor-alvo">
            {tipo === 'teto' ? ` de ${eur(alvo)}` : ` · piso ${eur(alvo)}`}
          </span>
        </span>
      </div>
      <div
        className="medidor-pista"
        style={{ background: `color-mix(in srgb, ${cor} 20%, var(--surface-1))` }}
      >
        <div
          className="medidor-barra"
          style={{ width: `${Math.min(1, razao) * 100}%`, background: cor }}
        />
      </div>
      <div className="medidor-baixo">
        <span>
          {pct(proporcao)} do rendimento{' '}
          <span className="medidor-alvo">
            ({tipo === 'teto' ? 'teto' : 'piso'} {pct(alvoProporcao)})
          </span>
        </span>
        <span className="medidor-restante">
          {forouLimite
            ? tipo === 'teto'
              ? `passou o teto em ${eur(-restante)}`
              : `abaixo do piso em ${eur(restante)}`
            : tipo === 'teto'
              ? `${eur(restante)} por gastar`
              : `${eur(-restante)} acima do piso`}
        </span>
      </div>
    </div>
  )
}
