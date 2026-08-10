import { useEffect, useMemo, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { Despesa, Orcamento } from './types'
import { carregar, guardar, exportar, novoId, type Estado } from './lib/armazenamento'
import { alvoPoupanca, faltaFotografiaEsteMes, mesAtual, precisaRevisao, resumirMeses } from './lib/orcamento'
import { Mes } from './componentes/Mes'
import { Excedentes } from './componentes/Excedentes'
import { Patrimonio } from './componentes/Patrimonio'
import { Historico } from './componentes/Historico'
import { Definicoes } from './componentes/Definicoes'

type Tema = 'auto' | 'light' | 'dark'
type Aba = 'mes' | 'excedentes' | 'patrimonio' | 'historico' | 'definicoes'

const CHAVE_TEMA = 'financas:tema'
const NOME_TEMA: Record<Tema, string> = { auto: 'Automático', light: 'Claro', dark: 'Escuro' }
const temaSeguinte = (t: Tema): Tema => (t === 'auto' ? 'light' : t === 'light' ? 'dark' : 'auto')

const ABAS: { id: Aba; nome: string }[] = [
  { id: 'mes', nome: 'Mês' },
  { id: 'excedentes', nome: 'Excedentes' },
  { id: 'patrimonio', nome: 'Património' },
  { id: 'historico', nome: 'Histórico' },
  { id: 'definicoes', nome: 'Definições' },
]

function usarTema(): [Tema, Dispatch<SetStateAction<Tema>>] {
  const [tema, setTema] = useState<Tema>(
    () => (localStorage.getItem(CHAVE_TEMA) as Tema) || 'auto',
  )
  useEffect(() => {
    const raiz = document.documentElement
    if (tema === 'auto') raiz.removeAttribute('data-theme')
    else raiz.setAttribute('data-theme', tema)
    localStorage.setItem(CHAVE_TEMA, tema)
  }, [tema])
  return [tema, setTema]
}

export default function App() {
  const [estado, setEstado] = useState<Estado>(carregar)
  const [aba, setAba] = useState<Aba>('mes')
  const [mes, setMes] = useState(mesAtual)
  const [tema, setTema] = usarTema()

  useEffect(() => guardar(estado), [estado])

  const definirOrcamento = (patch: Partial<Orcamento>) =>
    setEstado((e) => ({ ...e, orcamento: { ...e.orcamento, ...patch } }))

  const resumos = useMemo(() => resumirMeses(estado.orcamento), [estado.orcamento])

  const adicionarDespesa = (d: Omit<Despesa, 'id'>) =>
    definirOrcamento({ despesas: [...estado.orcamento.despesas, { ...d, id: novoId() }] })

  const atualizarDespesa = (despesa: Despesa) =>
    definirOrcamento({
      despesas: estado.orcamento.despesas.map((d) => (d.id === despesa.id ? despesa : d)),
    })

  const removerDespesa = (id: string) =>
    definirOrcamento({ despesas: estado.orcamento.despesas.filter((d) => d.id !== id) })

  const revisaoPendente = precisaRevisao(estado.orcamento)
  const faltaFoto = faltaFotografiaEsteMes(estado.orcamento)

  return (
    <div className="app">
      <header className="cabecalho">
        <div>
          <h1>Finanças</h1>
          <p>Os teus dados ficam neste dispositivo</p>
        </div>
        <div className="acoes">
          <button type="button" className="botao" onClick={() => exportar(estado)}>
            Exportar
          </button>
          <button
            type="button"
            className="botao"
            onClick={() => setTema(temaSeguinte)}
            aria-label={`Tema: ${NOME_TEMA[tema]}. Mudar para ${NOME_TEMA[temaSeguinte(tema)]}`}
          >
            {NOME_TEMA[tema]}
          </button>
        </div>
      </header>

      <nav className="abas" aria-label="Secções">
        {ABAS.map((a) => (
          <button
            key={a.id}
            type="button"
            className="aba"
            aria-current={aba === a.id ? 'page' : undefined}
            onClick={() => setAba(a.id)}
          >
            {a.nome}
            {a.id === 'definicoes' && revisaoPendente && (
              <span className="pastilha" aria-label="revisão pendente">
                1
              </span>
            )}
            {a.id === 'patrimonio' && faltaFoto && (
              <span className="pastilha" aria-label="falta a fotografia deste mês">
                1
              </span>
            )}
          </button>
        ))}
      </nav>

      {aba === 'mes' && (
        <Mes
          orcamento={estado.orcamento}
          resumos={resumos}
          mes={mes}
          aoMudarMes={setMes}
          aoAdicionar={adicionarDespesa}
          aoAtualizar={atualizarDespesa}
          aoRemover={removerDespesa}
        />
      )}

      {aba === 'excedentes' && (
        <Excedentes orcamento={estado.orcamento} resumos={resumos} aoMudar={definirOrcamento} />
      )}

      {aba === 'patrimonio' && (
        <Patrimonio orcamento={estado.orcamento} aoMudar={definirOrcamento} />
      )}

      {aba === 'historico' && (
        <Historico resumos={resumos} alvoPoupanca={alvoPoupanca(estado.orcamento)} />
      )}

      {aba === 'definicoes' && (
        <Definicoes
          orcamento={estado.orcamento}
          aoMudar={definirOrcamento}
          aoExportar={() => exportar(estado)}
        />
      )}

    </div>
  )
}
