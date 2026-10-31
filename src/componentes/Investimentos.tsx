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
  pesos: 'Pesos vs. alvo',
  poupanca: 'Taxa de poupança',
  casamento: 'Casamento',
}

/** Debaixo do título: de onde vem o número, para não se ler ao contrário. */
const SUBTITULO: Record<Indicador, string> = {
  pesos: 'Os 4 ETFs, na última fotografia',
  poupanca: 'Aportes ÷ rendimento do mês',
  casamento: 'Certificados e liquidez livre',
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

function Regra({
  ok,
  nome,
  medida,
  accao,
}: {
  ok: boolean
  nome: string
  medida: string
  accao?: string
}) {
  return (
    <li className={ok ? 'regra regra--ok' : 'regra regra--aviso'}>
      <span className="regra-marca" aria-hidden="true">
        {ok ? '✓' : '!'}
      </span>
      <span>
        <span className="regra-nome">{nome}</span>
        <span className="regra-medida">{medida}</span>
        {!ok && accao && <span className="regra-accao">{accao}</span>}
      </span>
    </li>
  )
}

/**
 * As regras vivem acima dos indicadores, e não dentro do cartão da carteira.
 *
 * São a pergunta que se faz primeiro — "está tudo dentro das regras?" — e a
 * resposta não pode andar a mudar de sítio sempre que os cartões se reordenam.
 */
function PainelRegras({ orcamento }: { orcamento: Orcamento }) {
  const pesos = useMemo(() => pesosCarteira(orcamento), [orcamento])
  const { tetoTematicos, emergentesMin, emergentesMax, etfs } = orcamento.investimentos
  if (!pesos) return null

  const temBanda = pesos.emergentesNucleo !== null
  const total = 1 + (temBanda ? 1 : 0)
  const falhadas = (pesos.acimaDoTeto ? 1 : 0) + (temBanda && pesos.bandaEmergentes !== 'dentro' ? 1 : 0)
  const nomesEmergentes = etfs.filter((e) => e.papel === 'emergentes').map((e) => e.nome)
  const nomesGlobais = etfs.filter((e) => e.papel === 'global').map((e) => e.nome)
  const reforcar = (pesos.bandaEmergentes === 'abaixo' ? nomesEmergentes : nomesGlobais).join(' e ')

  const titulo =
    falhadas === 0
      ? 'Tudo dentro das regras'
      : `${falhadas} regra${falhadas > 1 ? 's' : ''} pede${falhadas > 1 ? 'm' : ''} atenção`
  // Com todas fora, o título já o disse: repetir era ruído.
  const sub =
    falhadas === 0
      ? `${total} regras cumpridas.`
      : falhadas < total
        ? 'A outra está dentro dos limites.'
        : null

  return (
    <section className={`cartao painel-regras${falhadas > 0 ? ' painel-regras--aviso' : ''}`}>
      <p className="regras-veredito">{titulo}</p>
      {sub && <p className="regras-sub">{sub}</p>}

      <ul className="regras">
        <Regra
          ok={!pesos.acimaDoTeto}
          nome="Temáticos"
          medida={`${pct(pesos.tematicos)} da carteira · teto ${tetoTematicos}%`}
          accao="Acima do teto — redireciona os aportes para o núcleo."
        />
        {temBanda && (
          <Regra
            ok={pesos.bandaEmergentes === 'dentro'}
            nome="Emergentes no núcleo"
            medida={`${pct(pesos.emergentesNucleo ?? 0)} do núcleo · intervalo ${emergentesMin}–${emergentesMax}%`}
            accao={`${pesos.bandaEmergentes === 'abaixo' ? 'Abaixo' : 'Acima'} do intervalo — reforça o ${reforcar} nos próximos aportes.`}
          />
        )}
      </ul>
    </section>
  )
}

function IndicadorPesos({ orcamento }: { orcamento: Orcamento }) {
  const pesos = useMemo(() => pesosCarteira(orcamento), [orcamento])
  const sugestoes = useMemo(() => sugerirAportes(orcamento, pesos), [orcamento, pesos])
  const foraDoIntervalo =
    pesos?.bandaEmergentes === 'abaixo' || pesos?.bandaEmergentes === 'acima'
  const totalAportes = sugestoes.reduce((t, x) => t + x.valor, 0)

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
      <p className="numero-secundario">{eur(pesos.totalEtf)}</p>
      <p className="sub-secundario">em ETFs, somando as duas carteiras</p>

      <div className="medidores">
        {pesos.linhas.map((l) => (
          <BarraPeso key={l.etf.id} nome={l.etf.nome} valor={l.valor} peso={l.peso} alvo={l.alvo} />
        ))}
      </div>

      <div className="bloco-aportes">
        <div className="seccao-topo">
          <p className="etiqueta-bloco">Aportes deste mês</p>
          <span className="seccao-total">total {eurExato(totalAportes)}</span>
        </div>
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
        {/* O painel lá em cima já diz que regra falhou e o que fazer. Aqui fica
            só o que ele não diz: quanto, e que isto nunca passa por vender. */}
        {(pesos.acimaDoTeto || foraDoIntervalo) && (
          <p className="rodape">
            Vai para o lado em falta exatamente o que o põe no alvo — e se um mês não
            chegar, vai tudo. Nunca se vende para corrigir.
          </p>
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
    <>
      <PainelRegras orcamento={orcamento} />

      <div className="grelha-indicadores">
        {ordem.map((id, i) => (
        <section className="cartao" key={id}>
          <div className="seccao-topo">
            <div>
              <h2>{TITULO[id]}</h2>
              <p className="sub-titulo-cartao">{SUBTITULO[id]}</p>
            </div>
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
    </>
  )
}
