import { useMemo, useState } from 'react'
import type { Aporte, Destino, Orcamento, Saldo } from '../types'
import { evolucaoPatrimonio, faltaFotografiaEsteMes, hojeISO, mesAtual, nomeMes } from '../lib/orcamento'
import { novoId } from '../lib/armazenamento'
import { dataCurta, eur, pct } from '../lib/formato'
import { GraficoPatrimonio } from './GraficoPatrimonio'

interface Props {
  orcamento: Orcamento
  aoMudar: (patch: Partial<Orcamento>) => void
}

const NOME_DESTINO: Record<Destino, string> = {
  investimento: 'Investimento',
  liquidez: 'Liquidez',
}

export function Patrimonio({ orcamento, aoMudar }: Props) {
  const pontos = useMemo(() => evolucaoPatrimonio(orcamento), [orcamento])
  const atual = pontos[pontos.length - 1]

  const [investido, setInvestido] = useState('')
  const [liquidez, setLiquidez] = useState('')
  const [dataSaldo, setDataSaldo] = useState(hojeISO())

  const [valorAporte, setValorAporte] = useState('')
  const [destino, setDestino] = useState<Destino>('investimento')
  const [dataAporte, setDataAporte] = useState(hojeISO())

  const planeados = orcamento.aportes.filter((a) => a.fonte === 'planeado')
  const totalAportado = orcamento.aportes.reduce((s, a) => s + a.valor, 0)
  const mercado = atual ? atual.total - atual.aportadoAte : 0

  const registarSaldo = (e: React.FormEvent) => {
    e.preventDefault()
    const i = Number(investido.replace(',', '.')) || 0
    const l = Number(liquidez.replace(',', '.')) || 0
    if (investido === '' && liquidez === '') return
    const novo: Saldo = { id: novoId(), data: dataSaldo, investido: i, liquidez: l }
    // Uma data só tem uma fotografia: registar de novo substitui.
    const semRepetida = orcamento.saldos.filter((s) => s.data !== dataSaldo)
    aoMudar({ saldos: [...semRepetida, novo] })
    setInvestido('')
    setLiquidez('')
  }

  const registarAporte = (e: React.FormEvent) => {
    e.preventDefault()
    const n = Number(valorAporte.replace(',', '.'))
    if (!Number.isFinite(n) || n <= 0) return
    const novo: Aporte = { id: novoId(), data: dataAporte, valor: n, fonte: 'planeado', destino }
    aoMudar({ aportes: [...orcamento.aportes, novo] })
    setValorAporte('')
  }

  const faltaFoto = faltaFotografiaEsteMes(orcamento)

  return (
    <>
      {faltaFoto && (
        <section className="cartao aviso-cartao">
          <h2>Falta a fotografia deste mês</h2>
          <p>
            Ainda não registaste o valor de {nomeMes(mesAtual())}. Vai à XTB e ao banco, e mete os
            valores no formulário abaixo.
          </p>
        </section>
      )}

      <section className="cartao">
        <h2>Património</h2>
        {!atual ? (
          <p className="vazio">
            Ainda não registaste nenhuma fotografia. Vai à tua corretora, vê o valor, e mete-o
            abaixo — uma vez por mês chega.
          </p>
        ) : (
          <>
            <div className="destaque">
              <span className="valor">{eur(atual.total)}</span>
              <span className="nota">
                Em {dataCurta(atual.data)} · {eur(atual.investido)} investido,{' '}
                {eur(atual.liquidez)} em liquidez
              </span>
            </div>

            <div className="mosaicos">
              <div className="mosaico">
                <span className="rotulo">Aportado por ti</span>
                <span className="valor">{eur(atual.aportadoAte)}</span>
                <span className="sub">soma de tudo o que transferiste</span>
              </div>
              <div className="mosaico">
                <span className="rotulo">Dado pelo mercado</span>
                <span className={`valor ${mercado < 0 ? 'valor--negativo' : ''}`}>
                  {eur(mercado)}
                </span>
                <span className="sub">
                  {atual.aportadoAte > 0 ? `${pct(mercado / atual.aportadoAte)} do aportado` : '—'}
                </span>
              </div>
            </div>
          </>
        )}
      </section>

      {pontos.length > 1 && (
        <section className="cartao">
          <h2>Evolução</h2>
          <GraficoPatrimonio pontos={pontos} />
        </section>
      )}

      <section className="cartao">
        <h2>Registar fotografia</h2>
        <form className="registo" onSubmit={registarSaldo}>
          <div className="grelha-campos">
            <div className="campo">
              <label htmlFor="saldo-investido">Investido</label>
              <div className="campo-entrada">
                <input
                  id="saldo-investido"
                  type="text"
                  inputMode="decimal"
                  placeholder="0"
                  value={investido}
                  onChange={(e) => setInvestido(e.target.value)}
                />
                <span className="sufixo">€</span>
              </div>
              <span className="dica">ETFs, na XTB</span>
            </div>
            <div className="campo">
              <label htmlFor="saldo-liquidez">Liquidez</label>
              <div className="campo-entrada">
                <input
                  id="saldo-liquidez"
                  type="text"
                  inputMode="decimal"
                  placeholder="0"
                  value={liquidez}
                  onChange={(e) => setLiquidez(e.target.value)}
                />
                <span className="sufixo">€</span>
              </div>
              <span className="dica">Conta à ordem e depósitos</span>
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
        <p className="rodape" style={{ marginTop: 12 }}>
          Duas fotografias na mesma data: fica a última.
        </p>
      </section>

      <section className="cartao">
        <h2>Transferência mensal · {eur(planeados.reduce((s, a) => s + a.valor, 0))}</h2>
        <p className="rodape" style={{ marginBottom: 12 }}>
          O que sai de propósito para poupar. Os potes registam-se em Excedentes.
        </p>
        <form className="registo" onSubmit={registarAporte}>
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
            <div className="campo-entrada">
              <input
                type="date"
                aria-label="Data da transferência"
                value={dataAporte}
                onChange={(e) => setDataAporte(e.target.value)}
              />
            </div>
            <button type="submit" className="botao botao--primario" disabled={!valorAporte}>
              Registar
            </button>
          </div>
          <div className="linha-escolhas">
            <div>
              <span className="etiqueta-escolha">Para</span>
              <div className="grupo-alternar">
                {(['investimento', 'liquidez'] as Destino[]).map((d) => (
                  <button key={d} type="button" aria-pressed={destino === d} onClick={() => setDestino(d)}>
                    {NOME_DESTINO[d]}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </form>
      </section>

      {orcamento.aportes.length > 0 && (
        <section className="cartao">
          <h2>Todos os aportes · {eur(totalAportado)}</h2>
          <ul className="lista-despesas">
            {[...orcamento.aportes]
              .sort((a, b) => b.data.localeCompare(a.data))
              .map((a) => (
                <li key={a.id}>
                  <span
                    className={`ponto ponto--${a.fonte === 'planeado' ? 'essencial' : 'naoEssencial'}`}
                    aria-hidden="true"
                  />
                  <span className="lista-principal">
                    <span className="lista-nome">
                      {a.fonte === 'planeado' ? 'Transferência mensal' : 'Excedente'} →{' '}
                      {NOME_DESTINO[a.destino]}
                    </span>
                    {a.nota && <span className="lista-nota">{a.nota}</span>}
                  </span>
                  <span className="lista-data">
                    {a.data.slice(8)}/{a.data.slice(5, 7)}
                  </span>
                  <span className="lista-valor">{eur(a.valor)}</span>
                  <button
                    type="button"
                    className="botao botao--discreto botao--perigo"
                    onClick={() => aoMudar({ aportes: orcamento.aportes.filter((x) => x.id !== a.id) })}
                    aria-label={`Remover aporte de ${eur(a.valor)}`}
                  >
                    ×
                  </button>
                </li>
              ))}
          </ul>
        </section>
      )}

      {orcamento.saldos.length > 0 && (
        <section className="cartao">
          <h2>Fotografias</h2>
          <div className="tabela-envolvente">
            <table>
              <thead>
                <tr>
                  <th scope="col">Data</th>
                  <th scope="col">Investido</th>
                  <th scope="col">Liquidez</th>
                  <th scope="col">Total</th>
                  <th scope="col">Mercado</th>
                  <th scope="col"></th>
                </tr>
              </thead>
              <tbody>
                {[...pontos].reverse().map((p) => (
                  <tr key={p.id}>
                    <th scope="row">{dataCurta(p.data)}</th>
                    <td>{eur(p.investido)}</td>
                    <td>{eur(p.liquidez)}</td>
                    <td>{eur(p.total)}</td>
                    <td className={p.total - p.aportadoAte < 0 ? 'celula--negativa' : ''}>
                      {eur(p.total - p.aportadoAte)}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="botao botao--discreto botao--perigo"
                        onClick={() => aoMudar({ saldos: orcamento.saldos.filter((s) => s.id !== p.id) })}
                        aria-label={`Remover fotografia de ${p.data}`}
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
    </>
  )
}
