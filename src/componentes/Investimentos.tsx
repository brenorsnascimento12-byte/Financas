import { useMemo } from 'react'
import type { Indicador, Orcamento, ResumoMes } from '../types'
import {
  mediaTaxaPoupanca,
  nomeMes,
  objetivoComData,
  progressoObjetivo,
} from '../lib/orcamento'
import { pesosCarteira, sugerirAportes } from '../lib/investimentos'
import { eur, eurExato, pct } from '../lib/formato'

interface Props {
  orcamento: Orcamento
  resumos: ResumoMes[]
  aoMudar: (patch: Partial<Orcamento>) => void
}

const TITULO: Record<Indicador, string> = {
  pesos: 'Carteira',
  poupanca: 'Taxa de poupança',
  casamento: 'Casamento',
}

/** Doze meses é a janela da média: um ano inteiro inclui os meses atípicos. */
const JANELA = 12

interface PropsBarra {
  nome: string
  valor: number
  peso: number
  alvo: number
}

/**
 * Barra de um ETF: o peso atual preenchido, o alvo marcado na pista.
 *
 * Duas barras lado a lado obrigavam a comparar comprimentos. A marca no alvo
 * responde logo à pergunta que interessa, que é de que lado do alvo se está.
 */
function BarraPeso({ nome, valor, peso, alvo }: PropsBarra) {
  const distancia = Math.abs(peso - alvo)
  return (
    <div className="medidor">
      <div className="medidor-topo">
        <span className="medidor-rotulo">{nome}</span>
        <span className="medidor-valores">
          <strong>{pct(peso)}</strong>
          <span className="medidor-alvo"> alvo {pct(alvo)}</span>
        </span>
      </div>
      <div className="medidor-pista">
        <div className="medidor-barra" style={{ width: `${Math.min(1, peso) * 100}%` }} />
        <span
          className="marca-alvo"
          style={{ left: `${Math.min(100, alvo * 100)}%` }}
          aria-hidden="true"
        />
      </div>
      <div className="medidor-baixo">
        <span>{eur(valor)}</span>
        <span className="medidor-restante">
          {distancia < 0.005
            ? 'no alvo'
            : `${pct(distancia)} ${peso > alvo ? 'acima' : 'abaixo'}`}
        </span>
      </div>
    </div>
  )
}

function Regra({ ok, texto }: { ok: boolean; texto: string }) {
  return (
    <li className={ok ? 'regra regra--ok' : 'regra regra--aviso'}>
      <span className="regra-marca" aria-hidden="true">
        {ok ? '✓' : '!'}
      </span>
      <span>{texto}</span>
    </li>
  )
}

function IndicadorPesos({ orcamento }: { orcamento: Orcamento }) {
  const pesos = useMemo(() => pesosCarteira(orcamento), [orcamento])
  const sugestoes = useMemo(() => sugerirAportes(orcamento, pesos), [orcamento, pesos])
  const { tetoTematicos, emergentesMin, emergentesMax } = orcamento.investimentos
  const foraDoIntervalo =
    pesos?.bandaEmergentes === 'abaixo' || pesos?.bandaEmergentes === 'acima'

  if (!pesos) {
    return (
      <p className="vazio">
        Ainda não há uma fotografia com o valor de cada ETF. Regista-a no Rumo, no fecho do
        mês, e os pesos aparecem aqui.
      </p>
    )
  }

  return (
    <>
      {/* Primeiro a pergunta que interessa: está tudo dentro das regras? */}
      <ul className="regras">
        <Regra
          ok={!pesos.acimaDoTeto}
          texto={`Temáticos em ${pct(pesos.tematicos)} — teto de ${tetoTematicos}%`}
        />
        {pesos.emergentesNucleo !== null && (
          <Regra
            ok={pesos.bandaEmergentes === 'dentro'}
            texto={`Emergentes em ${pct(pesos.emergentesNucleo)} do núcleo — intervalo ${emergentesMin}–${emergentesMax}%`}
          />
        )}
      </ul>

      <p className="numero-secundario">{eur(pesos.totalEtf)}</p>
      <p className="sub-secundario">em ETFs, somando as duas carteiras</p>

      <div className="medidores">
        {pesos.linhas.map((l) => (
          <BarraPeso key={l.etf.id} nome={l.etf.nome} valor={l.valor} peso={l.peso} alvo={l.alvo} />
        ))}
      </div>

      <div className="bloco-aportes">
        <p className="etiqueta-bloco">Aportes deste mês</p>
        <ul className="lista-aportes">
          {sugestoes.map((s) => (
            <li key={s.etf.id}>
              <span>{s.etf.nome}</span>
              <span className="num">
                {eurExato(s.valor)}
                {s.valor !== s.base && (
                  <span className="aporte-base"> em vez de {eur(s.base)}</span>
                )}
              </span>
            </li>
          ))}
        </ul>
        {/* Cada regra explica-se por si: juntá-las numa frase só dizia "o lado em
            falta" mesmo quando era só o teto a disparar, e aí não há lado em falta. */}
        {pesos.acimaDoTeto && (
          <p className="rodape">
            Os temáticos estão acima do teto, por isso o que lhes ia vai para o núcleo.
            Não se vende o que está acima: corrige-se com o dinheiro novo.
          </p>
        )}
        {foraDoIntervalo && (
          <p className="rodape">
            Os emergentes estão {pesos.bandaEmergentes === 'abaixo' ? 'abaixo' : 'acima'} do
            intervalo. Do dinheiro que vai para o núcleo, recebem exatamente o que os põe no
            peso-alvo depois do aporte — se um mês não chegar, recebem tudo.
          </p>
        )}
        {!pesos.acimaDoTeto && !foraDoIntervalo && (
          <p className="rodape">Tudo dentro das regras: mantêm-se os aportes base.</p>
        )}
      </div>
    </>
  )
}

function IndicadorPoupanca({ resumos }: { resumos: ResumoMes[] }) {
  const media = mediaTaxaPoupanca(resumos, JANELA)
  const atual = resumos.at(-1)
  const ultimos = resumos.slice(-JANELA)
  const fechados = ultimos.filter((r) => r.fechado).length
  // Pista com altura própria: sem um máximo mínimo, um único mês a zero dava
  // divisão por zero e barras de altura infinita.
  const maximo = Math.max(0.01, ...ultimos.map((r) => r.taxaPoupanca))

  if (!atual) return <p className="vazio">Sem meses registados ainda.</p>

  return (
    <>
      <p className="numero-secundario">{pct(atual.taxaPoupanca)}</p>
      <p className="sub-secundario">
        {nomeMes(atual.mes).toLowerCase()} · {eur(atual.poupanca)} transferidos
        {media !== null && ` · média de ${fechados} ${fechados === 1 ? 'mês' : 'meses'}: ${pct(media)}`}
      </p>

      <div className="barras-mes" role="img" aria-label="Taxa de poupança dos últimos meses">
        {ultimos.map((r) => (
          <div className="barra-mes" key={r.mes}>
            <div className="barra-mes-pista">
              <div
                className={`barra-mes-cheia${r.fechado ? '' : ' barra-mes-cheia--aberta'}`}
                style={{ height: `${Math.max(2, (r.taxaPoupanca / maximo) * 100)}%` }}
              />
            </div>
            <span className="barra-mes-rotulo">{r.mes.slice(5)}</span>
          </div>
        ))}
      </div>

      {!atual.fechado && (
        <p className="rodape">
          O mês em curso aparece mais claro: ainda não teve a transferência toda, por isso
          fica de fora da média.
        </p>
      )}
    </>
  )
}

function IndicadorCasamento({ orcamento }: { orcamento: Orcamento }) {
  const objetivo = objetivoComData(orcamento)
  const progresso = useMemo(
    () => (objetivo ? progressoObjetivo(orcamento, objetivo) : null),
    [orcamento, objetivo],
  )
  if (!progresso) return <p className="vazio">Sem objetivo com alvo e data definidos.</p>

  return (
    <>
      <p className="numero-secundario">{eur(progresso.atual)}</p>
      <p className="sub-secundario">
        de {eur(progresso.alvo)} · faltam {eur(progresso.falta)}
      </p>
      <div className="barra-alvo">
        <div className="barra-alvo-cheia" style={{ width: `${progresso.pct * 100}%` }} />
      </div>
    </>
  )
}

export function Investimentos({ orcamento, resumos, aoMudar }: Props) {
  const ordem = orcamento.ordemIndicadores

  // A ordem é do utilizador porque o que interessa muda com o momento: perto de
  // uma transferência conta a carteira, perto do casamento conta a meta.
  const mover = (i: number, delta: number) => {
    const j = i + delta
    if (j < 0 || j >= ordem.length) return
    const nova = [...ordem]
    nova[i] = ordem[j]
    nova[j] = ordem[i]
    aoMudar({ ordemIndicadores: nova })
  }

  return (
    <div className="grelha-indicadores">
      {ordem.map((id, i) => (
        <section className="cartao" key={id}>
          <div className="seccao-topo">
            <h2>{TITULO[id]}</h2>
            <span className="ordenar">
              <button
                type="button"
                className="botao botao--discreto"
                onClick={() => mover(i, -1)}
                disabled={i === 0}
                aria-label={`Mover ${TITULO[id]} para cima`}
              >
                {'↑'}
              </button>
              <button
                type="button"
                className="botao botao--discreto"
                onClick={() => mover(i, 1)}
                disabled={i === ordem.length - 1}
                aria-label={`Mover ${TITULO[id]} para baixo`}
              >
                {'↓'}
              </button>
            </span>
          </div>

          {id === 'pesos' && <IndicadorPesos orcamento={orcamento} />}
          {id === 'poupanca' && <IndicadorPoupanca resumos={resumos} />}
          {id === 'casamento' && <IndicadorCasamento orcamento={orcamento} />}
        </section>
      ))}
    </div>
  )
}
