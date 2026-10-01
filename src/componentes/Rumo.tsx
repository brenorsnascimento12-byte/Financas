import { useMemo, useState } from 'react'
import type { Aporte, Destino, Orcamento, ResumoMes, Saldo } from '../types'
import {
  calcularPote,
  evolucaoPatrimonio,
  faltaFotografiaEsteMes,
  hojeISO,
  mesAtual,
  nomeMes,
  objetivoComData,
  progressoObjetivo,
  totalComprometido,
  ultimoSaldo,
} from '../lib/orcamento'
import { novoId } from '../lib/armazenamento'
import { dataCurta, eur } from '../lib/formato'
import { Conferencia } from './Conferencia'
import { GraficoPatrimonio } from './GraficoPatrimonio'
import { Historico } from './Historico'

interface Props {
  orcamento: Orcamento
  resumos: ResumoMes[]
  alvoPoupanca: number
  aoMudar: (patch: Partial<Orcamento>) => void
}

const NOME_DESTINO: Record<Destino, string> = {
  certificados: 'Certificados',
  investimento: 'ETFs',
  liquidez: 'Liquidez',
}

const DESTINOS: Destino[] = ['certificados', 'investimento', 'liquidez']

export function Rumo({ orcamento, resumos, alvoPoupanca, aoMudar }: Props) {
  const pontos = useMemo(() => evolucaoPatrimonio(orcamento), [orcamento])
  const atual = pontos.at(-1)
  const pote = useMemo(() => calcularPote(resumos, orcamento.aportes), [resumos, orcamento.aportes])
  const objetivo = objetivoComData(orcamento)
  const progresso = useMemo(
    () => (objetivo ? progressoObjetivo(orcamento, objetivo) : null),
    [orcamento, objetivo],
  )

  const [investido, setInvestido] = useState('')
  const [liquidez, setLiquidez] = useState('')
  const [certificados, setCertificados] = useState('')
  const [dataSaldo, setDataSaldo] = useState(hojeISO())
  const [aConferir, setAConferir] = useState(false)

  const [valorAporte, setValorAporte] = useState('')
  const [destinoAporte, setDestinoAporte] = useState<Destino>('certificados')

  const [valorExcedente, setValorExcedente] = useState('')
  const [destinoExcedente, setDestinoExcedente] = useState<Destino>('certificados')

  const comprometido = totalComprometido(orcamento)
  const saldo = ultimoSaldo(orcamento)
  const liquidezLivre = saldo ? saldo.liquidez - comprometido : null

  const registarSaldo = (e: React.FormEvent) => {
    e.preventDefault()
    const num = (v: string) => Number(v.replace(',', '.')) || 0
    if (investido === '' && liquidez === '' && certificados === '') return
    const novo: Saldo = {
      id: novoId(),
      data: dataSaldo,
      investido: num(investido),
      liquidez: num(liquidez),
      certificados: num(certificados),
    }
    // Uma data só tem uma fotografia: registar de novo substitui.
    aoMudar({ saldos: [...orcamento.saldos.filter((s) => s.data !== dataSaldo), novo] })
    setInvestido('')
    setLiquidez('')
    setCertificados('')
  }

  const pedidoExcedente = Number(valorExcedente.replace(',', '.'))
  const excedeOPote = Number.isFinite(pedidoExcedente) && pedidoExcedente > pote.porDecidir + 0.01
  const poteVazio = pote.porDecidir <= 0

  const registarAporte =
    (fonte: 'planeado' | 'excedente') => (e: React.FormEvent) => {
      e.preventDefault()
      const bruto = fonte === 'planeado' ? valorAporte : valorExcedente
      const n = Number(bruto.replace(',', '.'))
      if (!Number.isFinite(n) || n <= 0) return
      // Não se tira do pote o que ele não tem.
      if (fonte === 'excedente' && n > pote.porDecidir + 0.01) return
      const novo: Aporte = {
        id: novoId(),
        data: hojeISO(),
        valor: n,
        fonte,
        destino: fonte === 'planeado' ? destinoAporte : destinoExcedente,
      }
      aoMudar({ aportes: [...orcamento.aportes, novo] })
      if (fonte === 'planeado') setValorAporte('')
      else setValorExcedente('')
    }

  return (
    <>
      {faltaFotografiaEsteMes(orcamento) && (
        <section className="cartao aviso-cartao">
          <p style={{ margin: 0 }}>
            Falta a fotografia de {nomeMes(mesAtual()).toLowerCase()}. Vê os saldos na XTB, no
            banco e no IGCP, e regista-os no fecho do mês.
          </p>
        </section>
      )}

      {/* O objetivo com data é o que está em jogo: é o número principal do ecrã. */}
      {progresso && (
        <section className="cartao cartao--principal">
          <p className="etiqueta">
            {progresso.objetivo.nome} · {progresso.objetivo.dataAlvo}
          </p>
          <p className="numero-heroi">{eur(progresso.atual)}</p>
          <p className="sub-heroi">
            de {eur(progresso.alvo)} · faltam {eur(progresso.falta)} em {progresso.mesesRestantes}{' '}
            meses
          </p>

          <div className="barra-alvo">
            <div className="barra-alvo-cheia" style={{ width: `${progresso.pct * 100}%` }} />
          </div>

          <p className="accao-mes">
            Este mês: <strong>{eur(progresso.necessarioMensal)}</strong> para certificados.
          </p>

          {progresso.emDesvio && (
            <p className="deriva deriva--sobe">
              <span aria-hidden="true">▲ </span>
              Estás a fazer {eur(progresso.ritmoAtual ?? 0)} por mês, abaixo do necessário.
            </p>
          )}
        </section>
      )}

      <section className="cartao">
        <h2>Património</h2>
        {!atual ? (
          <p className="vazio">Sem fotografias ainda. Regista a primeira no fecho do mês.</p>
        ) : (
          <>
            <p className="numero-secundario">{eur(atual.total)}</p>
            <p className="sub-secundario">
              {eur(atual.investido)} em ETFs · {eur(atual.certificados)} em certificados ·{' '}
              {eur(atual.liquidez)} em liquidez
              {liquidezLivre !== null && comprometido > 0 && ` (livre: ${eur(liquidezLivre)})`}
            </p>

            <dl className="factos">
              <div>
                <dt>Capital que puseste</dt>
                <dd>{eur(atual.capital)}</dd>
              </div>
              <div>
                <dt>Dado pelo mercado</dt>
                <dd className={atual.mercado < 0 ? 'valor--negativo' : undefined}>
                  {eur(atual.mercado)}
                </dd>
              </div>
            </dl>

            {pontos.length === 1 ? (
              <p className="rodape">
                A primeira fotografia é o ponto de partida, por isso o mercado está a zero. O
                retorno começa a contar a partir daqui.
              </p>
            ) : (
              <GraficoPatrimonio pontos={pontos} />
            )}
          </>
        )}
      </section>

      <section className="cartao">
        <h2>Fecho do mês</h2>

        {aConferir ? (
          <Conferencia
            orcamento={orcamento}
            aoMudar={aoMudar}
            aoFechar={() => setAConferir(false)}
          />
        ) : (
          <button
            type="button"
            className="botao"
            style={{ marginBottom: 18 }}
            onClick={() => setAConferir(true)}
          >
            Conferir extrato
          </button>
        )}

        <form className="registo" onSubmit={registarSaldo}>
          <p className="etiqueta-bloco">Fotografia dos saldos</p>
          <div className="grelha-campos">
            <div className="campo">
              <label htmlFor="s-investido">ETFs</label>
              <div className="campo-entrada">
                <input
                  id="s-investido"
                  type="text"
                  inputMode="decimal"
                  placeholder="0"
                  value={investido}
                  onChange={(e) => setInvestido(e.target.value)}
                />
                <span className="sufixo">€</span>
              </div>
            </div>
            <div className="campo">
              <label htmlFor="s-certificados">Certificados</label>
              <div className="campo-entrada">
                <input
                  id="s-certificados"
                  type="text"
                  inputMode="decimal"
                  placeholder="0"
                  value={certificados}
                  onChange={(e) => setCertificados(e.target.value)}
                />
                <span className="sufixo">€</span>
              </div>
            </div>
            <div className="campo">
              <label htmlFor="s-liquidez">Liquidez</label>
              <div className="campo-entrada">
                <input
                  id="s-liquidez"
                  type="text"
                  inputMode="decimal"
                  placeholder="0"
                  value={liquidez}
                  onChange={(e) => setLiquidez(e.target.value)}
                />
                <span className="sufixo">€</span>
              </div>
            </div>
          </div>
          <div className="registo-linha">
            <div className="campo-entrada">
              <input
                type="date"
                aria-label="Data da fotografia"
                value={dataSaldo}
                onChange={(e) => setDataSaldo(e.target.value)}
              />
            </div>
            <button type="submit" className="botao botao--primario">
              Guardar
            </button>
          </div>
        </form>

        <form className="registo" style={{ marginTop: 22 }} onSubmit={registarAporte('planeado')}>
          <p className="etiqueta-bloco">Transferência do mês</p>
          <div className="registo-linha">
            <div className="campo-entrada registo-valor">
              <input
                type="text"
                inputMode="decimal"
                placeholder="0"
                aria-label="Valor transferido"
                value={valorAporte}
                onChange={(e) => setValorAporte(e.target.value)}
              />
              <span className="sufixo">€</span>
            </div>
            <button type="submit" className="botao botao--primario" disabled={!valorAporte}>
              Registar
            </button>
          </div>
          <div className="grupo-alternar">
            {DESTINOS.map((d) => (
              <button
                key={d}
                type="button"
                aria-pressed={destinoAporte === d}
                onClick={() => setDestinoAporte(d)}
              >
                {NOME_DESTINO[d]}
              </button>
            ))}
          </div>
        </form>
      </section>

      <section className="cartao">
        <div className="seccao-topo">
          <h2>Excedente por decidir</h2>
          <span className={`seccao-total ${pote.porDecidir < 0 ? 'valor--negativo' : ''}`}>
            {eur(pote.porDecidir)}
          </span>
        </div>

        {poteVazio ? (
          <p className="rodape">
            Nada a afetar. Um pote negativo quer dizer que gastaste acima dos tetos: esse dinheiro
            já saiu da conta e recupera-se nos meses em que ficares abaixo.
          </p>
        ) : (
          <form className="registo" onSubmit={registarAporte('excedente')}>
            <div className="registo-linha">
              <div className="campo-entrada registo-valor">
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="0"
                  aria-label="Valor a afetar"
                  value={valorExcedente}
                  onChange={(e) => setValorExcedente(e.target.value)}
                />
                <span className="sufixo">€</span>
              </div>
              <button
                type="submit"
                className="botao botao--primario"
                disabled={!valorExcedente || excedeOPote}
              >
                Afetar
              </button>
            </div>
            <div className="grupo-alternar">
              {DESTINOS.map((d) => (
                <button
                  key={d}
                  type="button"
                  aria-pressed={destinoExcedente === d}
                  onClick={() => setDestinoExcedente(d)}
                >
                  {NOME_DESTINO[d]}
                </button>
              ))}
            </div>
            {excedeOPote && (
              <p className="deriva deriva--sobe">
                <span aria-hidden="true">▲ </span>O pote só tem {eur(pote.porDecidir)} por decidir.
              </p>
            )}
          </form>
        )}
      </section>

      <details className="dobravel">
        <summary>Histórico e registos</summary>
        <div className="dobravel-corpo">
          <Historico resumos={resumos} alvoPoupanca={alvoPoupanca} />

          {orcamento.aportes.length > 0 && (
            <section className="cartao">
              <h2>Aportes · {eur(orcamento.aportes.reduce((s, a) => s + a.valor, 0))}</h2>
              <ul className="lista-despesas">
                {[...orcamento.aportes]
                  .sort((a, b) => b.data.localeCompare(a.data))
                  .map((a) => (
                    <li key={a.id}>
                      <span className="lista-principal">
                        <span className="lista-nome">
                          {a.fonte === 'planeado' ? 'Transferência' : 'Excedente'} →{' '}
                          {NOME_DESTINO[a.destino]}
                        </span>
                      </span>
                      <span className="lista-data">{dataCurta(a.data)}</span>
                      <span className="lista-valor">{eur(a.valor)}</span>
                      <button
                        type="button"
                        className="botao botao--discreto botao--perigo"
                        onClick={() =>
                          aoMudar({ aportes: orcamento.aportes.filter((x) => x.id !== a.id) })
                        }
                        aria-label={`Remover aporte de ${eur(a.valor)}`}
                      >
                        ×
                      </button>
                    </li>
                  ))}
              </ul>
            </section>
          )}

          {pontos.length > 0 && (
            <section className="cartao">
              <h2>Fotografias</h2>
              <div className="tabela-envolvente">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Data</th>
                      <th scope="col">ETFs</th>
                      <th scope="col">Certificados</th>
                      <th scope="col">Liquidez</th>
                      <th scope="col">Total</th>
                      <th scope="col">Mercado</th>
                      <th scope="col" />
                    </tr>
                  </thead>
                  <tbody>
                    {[...pontos].reverse().map((p) => (
                      <tr key={p.id}>
                        <th scope="row">{dataCurta(p.data)}</th>
                        <td>{eur(p.investido)}</td>
                        <td>{eur(p.certificados)}</td>
                        <td>{eur(p.liquidez)}</td>
                        <td>{eur(p.total)}</td>
                        <td className={p.mercado < 0 ? 'celula--negativa' : ''}>
                          {eur(p.mercado)}
                        </td>
                        <td>
                          <button
                            type="button"
                            className="botao botao--discreto botao--perigo"
                            onClick={() =>
                              aoMudar({ saldos: orcamento.saldos.filter((s) => s.id !== p.id) })
                            }
                            aria-label={`Remover fotografia de ${dataCurta(p.data)}`}
                          >
                            ×
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      </details>
    </>
  )
}
