import { useState } from 'react'
import type { Orcamento } from '../types'
import { lerPdf } from '../lib/extrato/ler'
import { analisarExtrato, type ResultadoAnalise } from '../lib/extrato/analisar'
import { classificar } from '../lib/extrato/classificar'
import { cruzar, type Cruzamento, type RegistoApp } from '../lib/extrato/cruzar'
import { aplicarDecisoes, type Decisao } from '../lib/extrato/decidir'
import { novoId } from '../lib/armazenamento'
import { dataCurta, eur } from '../lib/formato'

interface Props {
  orcamento: Orcamento
  aoMudar: (patch: Partial<Orcamento>) => void
  aoFechar: () => void
}

/** Os registos da app que o cruzamento compara com o extrato. */
function registosDa(orcamento: Orcamento): RegistoApp[] {
  return [
    ...orcamento.despesas.map((d) => ({
      id: d.id,
      data: d.data,
      valor: d.valor,
      origem: 'despesa' as const,
    })),
    ...orcamento.aportes.map((a) => ({
      id: a.id,
      data: a.data,
      valor: a.valor,
      origem: 'aporte' as const,
    })),
  ]
}

export function Conferencia({ orcamento, aoMudar, aoFechar }: Props) {
  const [erro, setErro] = useState<string | null>(null)
  const [aLer, setALer] = useState(false)
  const [analise, setAnalise] = useState<ResultadoAnalise | null>(null)
  const [cruzamento, setCruzamento] = useState<Cruzamento | null>(null)
  const [decisoes, setDecisoes] = useState<Record<string, Decisao>>({})
  /**
   * O que a pdf.js extraiu, guardado mesmo quando a análise falha. Sem isto, uma
   * recusa não diz nada: não se sabe se o texto saiu mal do PDF ou se saiu bem e
   * foram os padrões que não bateram.
   */
  const [linhasLidas, setLinhasLidas] = useState<string[]>([])

  const importar = async (ficheiro: File) => {
    setErro(null)
    setALer(true)
    setLinhasLidas([])
    try {
      const linhas = await lerPdf(ficheiro)
      setLinhasLidas(linhas)
      const r = analisarExtrato(linhas)
      const classificados = classificar(r.movimentos, orcamento.regras)
      // As linhas já mandadas ignorar não voltam a aparecer.
      const porConferir = classificados.filter(
        (c) => !orcamento.linhasIgnoradas.includes(c.movimento.id),
      )
      setAnalise(r)
      setCruzamento(cruzar(porConferir, registosDa(orcamento)))
      setDecisoes({})
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não consegui ler o extrato.')
      setAnalise(null)
      setCruzamento(null)
    } finally {
      setALer(false)
    }
  }

  const escrever = () => {
    if (!cruzamento) return
    const r = aplicarDecisoes(cruzamento.emFalta, decisoes, orcamento.regras, novoId)
    aoMudar({
      despesas: [...orcamento.despesas, ...r.despesas],
      regras: [...orcamento.regras, ...r.regras],
      linhasIgnoradas: [...orcamento.linhasIgnoradas, ...r.linhasIgnoradas],
      ...(r.rendimentoMensal !== undefined ? { rendimentoMensal: r.rendimentoMensal } : {}),
    })
    aoFechar()
  }


  const aEscrever = Object.values(decisoes).filter((d) => d.tipo === 'despesa').length

  return (
    <section className="cartao cartao--conferencia">
      <div className="seccao-topo">
        <h2>Conferir extrato</h2>
        <button type="button" className="botao botao--discreto" onClick={aoFechar}>
          Fechar
        </button>
      </div>

      {!cruzamento && (
        <>
          <input
            type="file"
            accept="application/pdf,.pdf"
            aria-label="Extrato em PDF"
            disabled={aLer}
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void importar(f)
              e.target.value = ''
            }}
          />
          <p className="rodape" style={{ marginTop: 12 }}>
            {aLer
              ? 'A ler o extrato…'
              : 'O PDF é lido no teu telemóvel e não é guardado nem enviado.'}
          </p>
        </>
      )}

      {erro && (
        <>
          <p className="deriva deriva--sobe" style={{ marginTop: 12 }}>
            <span aria-hidden="true">▲ </span>
            {erro}
          </p>

          {linhasLidas.length > 0 && (
            <details className="dobravel" style={{ marginTop: 12 }}>
              <summary>Ver o que foi lido ({linhasLidas.length} linhas)</summary>
              <div className="dobravel-corpo">
                <p className="rodape">
                  O leitor procura uma linha com <code>EXTRATO DE AAAA/MM/DD A AAAA/MM/DD</code> e
                  outra com <code>SALDO INICIAL</code> seguido de um valor. Vê abaixo como o texto
                  saiu do PDF — se essas linhas lá estiverem com outra forma, é o padrão que
                  precisa de mudar.
                </p>
                <button
                  type="button"
                  className="botao"
                  onClick={() => void navigator.clipboard?.writeText(linhasLidas.join('\n'))}
                >
                  Copiar as linhas
                </button>
                <pre className="diagnostico">
                  {linhasLidas
                    .slice(0, 40)
                    .map((l, i) => `${String(i + 1).padStart(3, ' ')}  ${l}`)
                    .join('\n')}
                </pre>
              </div>
            </details>
          )}
        </>
      )}

      {cruzamento && analise && (
        <>
          <dl className="factos">
            <div>
              <dt>Conferidos</dt>
              <dd>{cruzamento.conferidos.length}</dd>
            </div>
            <div>
              <dt>Em falta</dt>
              <dd>{cruzamento.emFalta.length}</dd>
            </div>
            <div>
              <dt>Só na app</dt>
              <dd>{cruzamento.soNaApp.length}</dd>
            </div>
            {cruzamento.ambiguos.length > 0 && (
              <div>
                <dt>Ambíguos</dt>
                <dd>{cruzamento.ambiguos.length}</dd>
              </div>
            )}
          </dl>

          {cruzamento.emFalta.length === 0 ? (
            <p className="rodape">
              Está tudo conferido. Nada a acrescentar.
            </p>
          ) : (
            <ul className="lista-despesas">
              {cruzamento.emFalta.map((c) => {
                const d = decisoes[c.movimento.id]
                const credito = c.movimento.sinal === 'credito'
                const comissoes = c.comissoes.reduce((s, x) => s + x.valor, 0)
                return (
                  <li key={c.movimento.id}>
                    <span className="lista-principal">
                      <span className="lista-nome">{c.movimento.chave}</span>
                      {comissoes > 0 && (
                        <span className="lista-nota">mais {eur(comissoes)} de comissões</span>
                      )}
                    </span>
                    <span className="lista-data">{dataCurta(c.movimento.data).slice(0, 5)}</span>
                    <span className={`lista-valor ${credito ? 'valor--credito' : ''}`}>
                      {credito ? '+' : ''}
                      {eur(c.movimento.valor)}
                    </span>

                    {credito ? (
                      // Um crédito não é despesa nenhuma. Oferecer-lhe categorias
                      // de gasto era um toque errado à espera de acontecer.
                      <select
                        className="escolha-categoria"
                        aria-label={`O que fazer com ${c.movimento.chave}`}
                        value={d?.tipo === 'rendimento' ? 'rendimento' : ''}
                        onChange={(e) =>
                          setDecisoes((anterior) => ({
                            ...anterior,
                            [c.movimento.id]:
                              e.target.value === 'rendimento'
                                ? { tipo: 'rendimento' }
                                : { tipo: 'ignorar' },
                          }))
                        }
                      >
                        <option value="">Ignorar</option>
                        <option value="rendimento">É o meu rendimento</option>
                      </select>
                    ) : (
                      <select
                        className="escolha-categoria"
                        aria-label={`Categoria de ${c.movimento.chave}`}
                        value={d?.tipo === 'despesa' ? d.categoriaId : ''}
                        onChange={(e) =>
                          setDecisoes((anterior) => ({
                            ...anterior,
                            [c.movimento.id]: e.target.value
                              ? { tipo: 'despesa', categoriaId: e.target.value }
                              : { tipo: 'ignorar' },
                          }))
                        }
                      >
                        <option value="">Ignorar</option>
                        {orcamento.categorias
                          .filter((cat) => !cat.arquivada)
                          .map((cat) => (
                            <option key={cat.id} value={cat.id}>
                              {cat.nome}
                            </option>
                          ))}
                      </select>
                    )}
                  </li>
                )
              })}
            </ul>
          )}

          {cruzamento.emFalta.length > 0 && (
            <button
              type="button"
              className="botao botao--primario"
              style={{ marginTop: 16 }}
              onClick={escrever}
            >
              Escrever {aEscrever} {aEscrever === 1 ? 'despesa' : 'despesas'}
            </button>
          )}

          <p className="rodape" style={{ marginTop: 14 }}>
            O saldo final do extrato é <strong>{eur(analise.saldoFinal)}</strong>. Usa-o como
            liquidez na fotografia deste mês.
          </p>
        </>
      )}
    </section>
  )
}
