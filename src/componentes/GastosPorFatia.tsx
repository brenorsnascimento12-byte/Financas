import { useState } from 'react'
import type { Categoria, Despesa, Fatia } from '../types'
import { eur, pct } from '../lib/formato'

interface Props {
  categorias: Categoria[]
  despesas: Despesa[]
  aoAtualizar: (despesa: Despesa) => void
  aoRemover: (id: string) => void
}

interface Grupo {
  categoria: Categoria | null
  itens: Despesa[]
  total: number
}

const NOME_FATIA: Record<Fatia, string> = {
  essencial: 'Essenciais',
  naoEssencial: 'Não essenciais',
}

/** Uma despesa órfã (categoria apagada) conta como não essencial, a hipótese conservadora. */
const fatiaDe = (c: Categoria | null): Fatia => c?.fatia ?? 'naoEssencial'

function agrupar(categorias: Categoria[], despesas: Despesa[], fatia: Fatia): Grupo[] {
  const mapa = new Map<string, Grupo>()
  for (const d of despesas) {
    const categoria = categorias.find((c) => c.id === d.categoriaId) ?? null
    if (fatiaDe(categoria) !== fatia) continue
    const chave = categoria?.id ?? '__sem_categoria__'
    if (!mapa.has(chave)) mapa.set(chave, { categoria, itens: [], total: 0 })
    const grupo = mapa.get(chave)!
    grupo.itens.push(d)
    grupo.total += d.valor
  }
  for (const g of mapa.values()) g.itens.sort((a, b) => b.data.localeCompare(a.data))
  return [...mapa.values()].sort((a, b) => b.total - a.total)
}

function Editor({
  despesa,
  categorias,
  aoGuardar,
  aoCancelar,
}: {
  despesa: Despesa
  categorias: Categoria[]
  aoGuardar: (d: Despesa) => void
  aoCancelar: () => void
}) {
  const [valor, setValor] = useState(String(despesa.valor))
  const [data, setData] = useState(despesa.data)
  const [categoriaId, setCategoriaId] = useState(despesa.categoriaId)
  const [nota, setNota] = useState(despesa.nota ?? '')

  const submeter = (e: React.FormEvent) => {
    e.preventDefault()
    const n = Number(valor.replace(',', '.'))
    if (!Number.isFinite(n) || n <= 0) return
    aoGuardar({ ...despesa, valor: n, data, categoriaId, nota: nota.trim() || undefined })
  }

  const ativas = categorias.filter((c) => !c.arquivada || c.id === categoriaId)

  return (
    <form className="editor-despesa" onSubmit={submeter}>
      <div className="registo-linha">
        <div className="campo-entrada registo-valor">
          <input
            type="text"
            inputMode="decimal"
            aria-label="Valor"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            autoFocus
          />
          <span className="sufixo">€</span>
        </div>
        <div className="campo-entrada">
          <input type="date" aria-label="Data" value={data} onChange={(e) => setData(e.target.value)} />
        </div>
      </div>

      <div className="fichas">
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

      <div className="registo-linha">
        <button type="submit" className="botao botao--primario">
          Guardar
        </button>
        <button type="button" className="botao botao--discreto" onClick={aoCancelar}>
          Cancelar
        </button>
      </div>
    </form>
  )
}

function Seccao({
  fatia,
  grupos,
  categorias,
  aEditar,
  setAEditar,
  aoAtualizar,
  aoRemover,
}: {
  fatia: Fatia
  grupos: Grupo[]
  categorias: Categoria[]
  aEditar: string | null
  setAEditar: (id: string | null) => void
  aoAtualizar: (d: Despesa) => void
  aoRemover: (id: string) => void
}) {
  const total = grupos.reduce((s, g) => s + g.total, 0)

  return (
    <section className="cartao">
      <div className="seccao-topo">
        <h2>{NOME_FATIA[fatia]}</h2>
        <span className="seccao-total">{eur(total)}</span>
      </div>

      {grupos.length === 0 ? (
        <p className="vazio">Nada registado nesta secção este mês.</p>
      ) : (
        grupos.map((g) => (
          <div className="grupo" key={g.categoria?.id ?? 'sem'}>
            <div className="grupo-topo">
              <span className={`ponto ponto--${fatia}`} aria-hidden="true" />
              <span className="grupo-nome">{g.categoria?.nome ?? 'Sem categoria'}</span>
              <span className="grupo-parte">{total > 0 ? pct(g.total / total) : ''}</span>
              <span className="grupo-total">{eur(g.total)}</span>
            </div>

            <ul className="lista-itens">
              {g.itens.map((d) =>
                aEditar === d.id ? (
                  <li key={d.id} className="item--edicao">
                    <Editor
                      despesa={d}
                      categorias={categorias}
                      aoGuardar={(nova) => {
                        aoAtualizar(nova)
                        setAEditar(null)
                      }}
                      aoCancelar={() => setAEditar(null)}
                    />
                  </li>
                ) : (
                  <li key={d.id}>
                    <button
                      type="button"
                      className="item-abrir"
                      onClick={() => setAEditar(d.id)}
                      aria-label={`Editar despesa de ${eur(d.valor)} em ${d.data}`}
                    >
                      <span className="item-data">
                        {d.data.slice(8)}/{d.data.slice(5, 7)}
                      </span>
                      {d.nota && <span className="item-nota">{d.nota}</span>}
                      <span className="item-valor">{eur(d.valor)}</span>
                    </button>
                    <button
                      type="button"
                      className="botao botao--discreto botao--perigo"
                      onClick={() => aoRemover(d.id)}
                      aria-label={`Remover despesa de ${eur(d.valor)}`}
                    >
                      ×
                    </button>
                  </li>
                ),
              )}
            </ul>
          </div>
        ))
      )}
    </section>
  )
}

export function GastosPorFatia({ categorias, despesas, aoAtualizar, aoRemover }: Props) {
  const [aEditar, setAEditar] = useState<string | null>(null)

  return (
    <>
      {(['essencial', 'naoEssencial'] as Fatia[]).map((fatia) => (
        <Seccao
          key={fatia}
          fatia={fatia}
          grupos={agrupar(categorias, despesas, fatia)}
          categorias={categorias}
          aEditar={aEditar}
          setAEditar={setAEditar}
          aoAtualizar={aoAtualizar}
          aoRemover={aoRemover}
        />
      ))}
    </>
  )
}
