import { useMemo, useState } from 'react'
import type { Aporte, Destino, Orcamento, ResumoMes } from '../types'
import { calcularPote, hojeISO, nomeMes } from '../lib/orcamento'
import { novoId } from '../lib/armazenamento'
import { eur } from '../lib/formato'

interface Props {
  orcamento: Orcamento
  resumos: ResumoMes[]
  aoMudar: (patch: Partial<Orcamento>) => void
}

const NOME_DESTINO: Record<Destino, string> = {
  investimento: 'Investimento',
  liquidez: 'Liquidez',
  certificados: 'Certificados',
}

/** "agosto", sem o ano: cabe em linhas de texto corrido. */
const nomeMesCurto = (mes: string) => nomeMes(mes).split(' de ')[0].toLowerCase()

const rotuloCurto = (mes: string) => {
  const [ano, m] = mes.split('-')
  return `${['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'][Number(m) - 1]} ${ano.slice(2)}`
}

export function Excedentes({ orcamento, resumos, aoMudar }: Props) {
  const pote = useMemo(
    () => calcularPote(resumos, orcamento.aportes),
    [resumos, orcamento.aportes],
  )

  const [valor, setValor] = useState('')
  const [destino, setDestino] = useState<Destino>('investimento')
  const [data, setData] = useState(hojeISO())
  const [nota, setNota] = useState('')

  // A transferência mensal planeada não sai dos potes: não pertence a esta lista.
  const saidasDoPote = orcamento.aportes.filter((a) => a.fonte !== 'planeado')
  const totalPorDecidir = pote.porDecidir
  const emCurso = resumos.find((r) => !r.fechado)
  const fechados = resumos.filter((r) => r.fechado)

  const disponivel = pote.porDecidir
  const pedido = Number(valor.replace(',', '.'))
  const pedidoValido = Number.isFinite(pedido) && pedido > 0
  // Um cêntimo de tolerância: os potes são somas de floats, não vale a pena
  // bloquear por arredondamento.
  const excedePote = pedidoValido && pedido > disponivel + 0.01
  const poteVazio = disponivel <= 0

  const registar = (e: React.FormEvent) => {
    e.preventDefault()
    const n = Number(valor.replace(',', '.'))
    // Não se pode tirar de um pote o que ele não tem: isso não é uma afetação,
    // é inventar dinheiro.
    if (!Number.isFinite(n) || n <= 0 || n > disponivel + 0.01) return
    const nova: Aporte = {
      id: novoId(),
      data,
      valor: n,
      fonte: 'excedente',
      destino,
      nota: nota.trim() || undefined,
    }
    aoMudar({ aportes: [...orcamento.aportes, nova] })
    setValor('')
    setNota('')
  }

  return (
    <>
      <section className="cartao">
        <h2>Por decidir</h2>
        <div className="destaque">
          <span className={`valor ${totalPorDecidir < 0 ? 'valor--negativo' : ''}`}>
            {eur(totalPorDecidir)}
          </span>
          <span className="nota">
            Sobrou dos tetos em {fechados.length} {fechados.length === 1 ? 'mês fechado' : 'meses fechados'} e
            ainda não tem destino. Dinheiro sem destino atribuído tende a ser gasto por omissão —
            decide-o abaixo.
          </span>
        </div>

        {emCurso && (
          <p className="rodape">
            {eur(pote.projetado)} se {nomeMesCurto(emCurso.mes)} fechasse agora.
          </p>
        )}
      </section>

      <section className="cartao">
        <h2>Afetar excedente</h2>
        <form className="registo" onSubmit={registar}>
          <div className="registo-linha">
            <div className="campo-entrada registo-valor">
              <input
                type="text"
                inputMode="decimal"
                placeholder="0"
                aria-label="Valor a afetar"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
              />
              <span className="sufixo">€</span>
            </div>
            <div className="campo-entrada">
              <input type="date" aria-label="Data" value={data} onChange={(e) => setData(e.target.value)} />
            </div>
            <button
              type="submit"
              className="botao botao--primario"
              disabled={!valor || poteVazio || excedePote}
            >
              Registar
            </button>
          </div>

          <div className="linha-escolhas">
            <div>
              <span className="etiqueta-escolha">Para</span>
              <div className="grupo-alternar">
                {(['investimento', 'certificados', 'liquidez'] as Destino[]).map((d) => (
                  <button key={d} type="button" aria-pressed={destino === d} onClick={() => setDestino(d)}>
                    {NOME_DESTINO[d]}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="campo-entrada">
            <input
              type="text"
              placeholder="Nota (opcional)"
              aria-label="Nota"
              value={nota}
              onChange={(e) => setNota(e.target.value)}
            />
          </div>
        </form>

        {poteVazio ? (
          <p className="rodape" style={{ marginTop: 12 }}>
            <strong>O pote está a {eur(disponivel)}.</strong> Não há nada a afetar
            — e não é preciso transferir nada para o corrigir. Um pote negativo quer dizer que
            gastaste acima do teto: esse dinheiro já saiu da conta e não chegou a ser poupança.
            Recupera-se sozinho nos meses em que ficares abaixo do teto.
          </p>
        ) : (
          excedePote && (
            <p className="deriva deriva--sobe" style={{ marginTop: 12 }}>
              <span aria-hidden="true">▲ </span>
              O pote só tem {eur(disponivel)} por decidir.
            </p>
          )
        )}

      </section>

      {saidasDoPote.length > 0 && (
        <section className="cartao">
          <h2>Decisões · {eur(saidasDoPote.reduce((s, d) => s + d.valor, 0))}</h2>
          <ul className="lista-despesas">
            {[...saidasDoPote]
              .sort((a, b) => b.data.localeCompare(a.data))
              .map((d) => (
                <li key={d.id}>
                  <span className="ponto ponto--naoEssencial" aria-hidden="true" />
                  <span className="lista-principal">
                    <span className="lista-nome">Excedente → {NOME_DESTINO[d.destino]}</span>
                    {d.nota && <span className="lista-nota">{d.nota}</span>}
                  </span>
                  <span className="lista-data">
                    {d.data.slice(8)}/{d.data.slice(5, 7)}
                  </span>
                  <span className="lista-valor">{eur(d.valor)}</span>
                  <button
                    type="button"
                    className="botao botao--discreto botao--perigo"
                    onClick={() => aoMudar({ aportes: orcamento.aportes.filter((x) => x.id !== d.id) })}
                    aria-label={`Remover decisão de ${eur(d.valor)}`}
                  >
                    ×
                  </button>
                </li>
              ))}
          </ul>
        </section>
      )}

      <section className="cartao">
        <h2>De onde vem</h2>
        {fechados.length === 0 ? (
          <p className="vazio">Ainda não há meses fechados. O primeiro pote aparece no próximo mês.</p>
        ) : (
          <div className="tabela-envolvente">
            <table>
              <thead>
                <tr>
                  <th scope="col">Mês</th>
                  <th scope="col">Teto essenciais</th>
                  <th scope="col">Sobrou</th>
                  <th scope="col">Teto não essenciais</th>
                  <th scope="col">Sobrou</th>
                </tr>
              </thead>
              <tbody>
                {[...fechados].reverse().map((r) => (
                  <tr key={r.mes}>
                    <th scope="row">{rotuloCurto(r.mes)}</th>
                    <td>{eur(r.limiteEssencial)}</td>
                    <td className={r.excedenteEssencial < 0 ? 'celula--negativa' : ''}>
                      {eur(r.excedenteEssencial)}
                    </td>
                    <td>{eur(r.limiteNaoEssencial)}</td>
                    <td className={r.excedenteNaoEssencial < 0 ? 'celula--negativa' : ''}>
                      {eur(r.excedenteNaoEssencial)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  )
}
