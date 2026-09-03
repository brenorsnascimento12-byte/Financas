import { useMemo, useState } from 'react'
import type { Aporte, Destino, Fonte, Orcamento, Pote, ResumoMes } from '../types'
import { calcularPotes, hojeISO, nomeMes } from '../lib/orcamento'
import { novoId } from '../lib/armazenamento'
import { eur } from '../lib/formato'

interface Props {
  orcamento: Orcamento
  resumos: ResumoMes[]
  aoMudar: (patch: Partial<Orcamento>) => void
}

const NOME_FONTE: Record<Fonte, string> = {
  essencial: 'Essenciais',
  naoEssencial: 'Não essenciais',
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

function CartaoPote({
  fonte,
  pote,
  cor,
  mesEmCurso,
}: {
  fonte: Fonte
  pote: Pote
  cor: string
  mesEmCurso?: string
}) {
  return (
    <div className="pote" style={{ borderTopColor: cor }}>
      <span className="rotulo">{NOME_FONTE[fonte]}</span>
      <span className={`valor ${pote.porDecidir < 0 ? 'valor--negativo' : ''}`}>
        {eur(pote.porDecidir)}
      </span>
      <span className="sub">
        {eur(pote.acumulado)} acumulados
        {pote.decidido !== 0 && `, ${eur(pote.decidido)} já afetados`}
      </span>
      {mesEmCurso && (
        <span className={`projetado ${pote.projetado < 0 ? 'valor--negativo' : ''}`}>
          {eur(pote.projetado)} se {mesEmCurso} fechasse agora
        </span>
      )}
    </div>
  )
}

export function Excedentes({ orcamento, resumos, aoMudar }: Props) {
  const potes = useMemo(
    () => calcularPotes(resumos, orcamento.aportes),
    [resumos, orcamento.aportes],
  )

  const [valor, setValor] = useState('')
  const [fonte, setFonte] = useState<Fonte>('naoEssencial')
  const [destino, setDestino] = useState<Destino>('investimento')
  const [data, setData] = useState(hojeISO())
  const [nota, setNota] = useState('')

  // A transferência mensal planeada não sai dos potes: não pertence a esta lista.
  const saidasDosPotes = orcamento.aportes.filter((a) => a.fonte !== 'planeado')
  const totalPorDecidir = potes.essencial.porDecidir + potes.naoEssencial.porDecidir
  const emCurso = resumos.find((r) => !r.fechado)
  const fechados = resumos.filter((r) => r.fechado)

  const registar = (e: React.FormEvent) => {
    e.preventDefault()
    const n = Number(valor.replace(',', '.'))
    if (!Number.isFinite(n) || n <= 0) return
    const nova: Aporte = { id: novoId(), data, valor: n, fonte, destino, nota: nota.trim() || undefined }
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

        <div className="potes">
          <CartaoPote
            fonte="essencial"
            pote={potes.essencial}
            cor="var(--serie-1)"
            mesEmCurso={emCurso && nomeMesCurto(emCurso.mes)}
          />
          <CartaoPote
            fonte="naoEssencial"
            pote={potes.naoEssencial}
            cor="var(--serie-2)"
            mesEmCurso={emCurso && nomeMesCurto(emCurso.mes)}
          />
        </div>

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
            <button type="submit" className="botao botao--primario" disabled={!valor}>
              Registar
            </button>
          </div>

          <div className="linha-escolhas">
            <div>
              <span className="etiqueta-escolha">De</span>
              <div className="grupo-alternar">
                {(['essencial', 'naoEssencial'] as Fonte[]).map((f) => (
                  <button key={f} type="button" aria-pressed={fonte === f} onClick={() => setFonte(f)}>
                    {NOME_FONTE[f]}
                  </button>
                ))}
              </div>
            </div>
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

      </section>

      {saidasDosPotes.length > 0 && (
        <section className="cartao">
          <h2>Decisões · {eur(saidasDosPotes.reduce((s, d) => s + d.valor, 0))}</h2>
          <ul className="lista-despesas">
            {[...saidasDosPotes]
              .sort((a, b) => b.data.localeCompare(a.data))
              .map((d) => (
                <li key={d.id}>
                  <span className={`ponto ponto--${d.fonte}`} aria-hidden="true" />
                  <span className="lista-principal">
                    <span className="lista-nome">
                      {NOME_FONTE[d.fonte as Fonte]} → {NOME_DESTINO[d.destino]}
                    </span>
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
