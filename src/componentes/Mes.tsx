import { useMemo, useState } from 'react'
import type { Despesa, Orcamento, ResumoMes } from '../types'
import { alvoPoupanca, hojeISO, mesAtual, mesDe, nomeMes } from '../lib/orcamento'
import { eur } from '../lib/formato'
import { Medidor } from './Medidor'
import { GastosPorFatia } from './GastosPorFatia'

interface Props {
  orcamento: Orcamento
  resumos: ResumoMes[]
  mes: string
  aoMudarMes: (mes: string) => void
  aoAdicionar: (despesa: Omit<Despesa, 'id'>) => void
  aoAtualizar: (despesa: Despesa) => void
  aoRemover: (id: string) => void
}

const deslocarMes = (mes: string, passo: number) => {
  const [ano, m] = mes.split('-').map(Number)
  const d = new Date(ano, m - 1 + passo, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function Mes({
  orcamento,
  resumos,
  mes,
  aoMudarMes,
  aoAdicionar,
  aoAtualizar,
  aoRemover,
}: Props) {
  const ativas = orcamento.categorias.filter((c) => !c.arquivada)
  const [valor, setValor] = useState('')
  const [categoriaId, setCategoriaId] = useState(ativas[0]?.id ?? '')
  const [data, setData] = useState(hojeISO())
  const [nota, setNota] = useState('')

  const resumo = resumos.find((r) => r.mes === mes)
  const doMes = useMemo(
    () =>
      orcamento.despesas
        .filter((d) => mesDe(d.data) === mes)
        .sort((a, b) => b.data.localeCompare(a.data)),
    [orcamento.despesas, mes],
  )

  const alvoP = alvoPoupanca(orcamento)
  const rendimento = orcamento.rendimentoMensal
  const submeter = (e: React.FormEvent) => {
    e.preventDefault()
    const n = Number(valor.replace(',', '.'))
    if (!Number.isFinite(n) || n <= 0 || !categoriaId) return
    aoAdicionar({ data, valor: n, categoriaId, nota: nota.trim() || undefined })
    setValor('')
    setNota('')
  }

  return (
    <>
      <section className="cartao">
        <div className="navegacao-mes">
          <button type="button" className="botao" onClick={() => aoMudarMes(deslocarMes(mes, -1))} aria-label="Mês anterior">
            ‹
          </button>
          <h2>{nomeMes(mes)}</h2>
          <button
            type="button"
            className="botao"
            onClick={() => aoMudarMes(deslocarMes(mes, 1))}
            disabled={mes >= mesAtual()}
            aria-label="Mês seguinte"
          >
            ›
          </button>
        </div>

        <form className="registo" onSubmit={submeter}>
          <div className="registo-linha">
            <div className="campo-entrada registo-valor">
              <input
                type="text"
                inputMode="decimal"
                placeholder="0"
                aria-label="Valor da despesa"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
              />
              <span className="sufixo">€</span>
            </div>
            <div className="campo-entrada">
              <input
                type="date"
                aria-label="Data"
                value={data}
                onChange={(e) => setData(e.target.value)}
              />
            </div>
            <button type="submit" className="botao botao--primario" disabled={!valor || !categoriaId}>
              Registar
            </button>
          </div>

          <div className="fichas" role="radiogroup" aria-label="Categoria">
            {ativas.map((c) => (
              <button
                key={c.id}
                type="button"
                role="radio"
                aria-checked={categoriaId === c.id}
                className={`ficha ficha--${c.fatia}`}
                onClick={() => setCategoriaId(c.id)}
              >
                {c.nome}
              </button>
            ))}
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

      {resumo && (
        <section className="cartao">
          <h2>Como está o mês</h2>

          <div className="medidores">
            <Medidor
              rotulo="Essenciais"
              cor="var(--serie-1)"
              gasto={resumo.gastoEssencial}
              alvo={resumo.limiteEssencial}
              proporcao={resumo.pctEssencial}
              alvoProporcao={orcamento.alvoEssencial / 100}
              tipo="teto"
            />
            <Medidor
              rotulo="Não essenciais"
              cor="var(--serie-2)"
              gasto={resumo.gastoNaoEssencial}
              alvo={resumo.limiteNaoEssencial}
              proporcao={resumo.pctNaoEssencial}
              alvoProporcao={orcamento.alvoNaoEssencial / 100}
              tipo="teto"
            />
            <Medidor
              rotulo="Poupança"
              cor="var(--serie-3)"
              gasto={resumo.poupanca}
              alvo={(rendimento * alvoP) / 100}
              proporcao={resumo.taxaPoupanca}
              alvoProporcao={alvoP / 100}
              tipo="piso"
            />
          </div>

          {resumo.poupanca === 0 && (
            <p className="rodape" style={{ marginTop: 14 }}>
              Poupança a zero: ainda não registaste nenhuma transferência este mês, na aba
              Património.
            </p>
          )}
          {resumo.poupancaDeExcedente > 0 && resumo.poupancaPlaneada > 0 && (
            <p className="rodape" style={{ marginTop: 14 }}>
              {eur(resumo.poupancaPlaneada)} de transferência mensal +{' '}
              {eur(resumo.poupancaDeExcedente)} vindos do pote de excedente.
            </p>
          )}
        </section>
      )}

      <GastosPorFatia
        categorias={orcamento.categorias}
        despesas={doMes}
        aoAtualizar={aoAtualizar}
        aoRemover={aoRemover}
      />
    </>
  )
}
