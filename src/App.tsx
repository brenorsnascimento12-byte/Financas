import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { Despesa, Orcamento } from './types'
import {
  carregar,
  guardar,
  exportar,
  guardarToken,
  lerToken,
  migrar,
  novoId,
  type Estado,
} from './lib/armazenamento'
import { marcarAlteracoes, sincronizar } from './lib/sincronizar'
import { ErroSync, lerRemoto } from './lib/github'
import { LinhaEstadoSync, type EstadoSync } from './componentes/Sincronizacao'
import { alvoPoupanca, faltaFotografiaEsteMes, mesAtual, precisaRevisao, resumirMeses } from './lib/orcamento'
import { Mes } from './componentes/Mes'
import { Rumo } from './componentes/Rumo'
import { Definicoes } from './componentes/Definicoes'
import { Investimentos } from './componentes/Investimentos'

type Tema = 'auto' | 'light' | 'dark'
type Aba = 'mes' | 'rumo' | 'investir' | 'definicoes'

const CHAVE_TEMA = 'financas:tema'
const NOME_TEMA: Record<Tema, string> = { auto: 'Automático', light: 'Claro', dark: 'Escuro' }
const temaSeguinte = (t: Tema): Tema => (t === 'auto' ? 'light' : t === 'light' ? 'dark' : 'auto')

const ABAS: { id: Aba; nome: string }[] = [
  { id: 'mes', nome: 'Mês' },
  { id: 'rumo', nome: 'Rumo' },
  { id: 'investir', nome: 'Investir' },
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
  const [token, setToken] = useState(lerToken)
  const [sync, setSync] = useState<EstadoSync>({ fase: 'inativo' })

  useEffect(() => guardar(estado), [estado])

  // A sincronização corre fora do ciclo de render e precisa do estado do momento
  // em que arranca, não do que existia quando foi criada.
  // Atualizada no próprio render, e não num efeito: num efeito ficava um render
  // atrás, e carregar em sincronizar logo depois de escrever o repositório ia
  // buscar o valor anterior.
  const orcamentoRef = useRef(estado.orcamento)
  orcamentoRef.current = estado.orcamento

  // Marcar só o que mudou é o que permite juntar dois aparelhos sem um deles
  // reclamar a autoria de tudo o que tocou.
  const definirOrcamento = (patch: Partial<Orcamento>) =>
    setEstado((e) => ({
      ...e,
      orcamento: marcarAlteracoes(e.orcamento, { ...e.orcamento, ...patch }, new Date().toISOString()),
    }))

  const sincronizarAgora = useCallback(async () => {
    const atual = orcamentoRef.current
    const repo = atual.sincronizacao.repo
    const guardado = lerToken()
    if (!repo || !guardado) return
    setSync({ fase: 'aSincronizar' })
    try {
      const r = await sincronizar(atual, { repo, token: guardado })
      // O resultado da fusão não volta a passar por `marcarAlteracoes`: o que
      // veio do outro aparelho não foi alterado aqui.
      setEstado((e) => ({ ...e, orcamento: r.orcamento }))
      setSync({ fase: 'ok' })
    } catch (e) {
      setSync({
        fase: 'erro',
        mensagem: e instanceof ErroSync ? e.message : 'Não foi possível sincronizar.',
      })
    }
  }, [])

  /**
   * Adotar o que está no repositório, descartando o que está neste aparelho.
   *
   * É para montar um aparelho novo. Sem isto, a instalação de raiz traz as suas
   * próprias categorias de arranque e a primeira fusão ficava com as duas listas.
   */
  const trazerDoRepositorio = useCallback(async () => {
    const repo = orcamentoRef.current.sincronizacao.repo
    const guardadoTok = lerToken()
    if (!repo || !guardadoTok) return
    if (
      !confirm(
        'Isto substitui tudo o que está neste aparelho pelo que está no repositório. Continuar?',
      )
    )
      return
    setSync({ fase: 'aSincronizar' })
    try {
      const r = await lerRemoto({ repo, token: guardadoTok })
      if (!r.orcamento) {
        setSync({ fase: 'erro', mensagem: 'Ainda não há nada no repositório para trazer.' })
        return
      }
      setEstado({ orcamento: migrar(r.orcamento) })
      setSync({ fase: 'ok' })
    } catch (e) {
      setSync({
        fase: 'erro',
        mensagem: e instanceof ErroSync ? e.message : 'Não foi possível ler o repositório.',
      })
    }
  }, [])

  // Ao abrir, e outra vez quando a rede voltar.
  useEffect(() => {
    void sincronizarAgora()
    const aoVoltarARede = () => void sincronizarAgora()
    window.addEventListener('online', aoVoltarARede)
    return () => window.removeEventListener('online', aoVoltarARede)
  }, [sincronizarAgora])

  // Só contam as alterações feitas aqui: as que vieram do outro aparelho já
  // estão no repositório por definição.
  const { alteradoLocalmenteEm, ultimaSync } = estado.orcamento.sincronizacao
  const porSincronizar =
    alteradoLocalmenteEm !== undefined &&
    (ultimaSync === undefined || alteradoLocalmenteEm > ultimaSync)

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
        <h1>Finanças</h1>
        <div className="acoes">
          <LinhaEstadoSync
            orcamento={estado.orcamento}
            estado={sync}
            porSincronizar={porSincronizar}
          />
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
            {a.id === 'rumo' && faltaFoto && (
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

      {aba === 'rumo' && (
        <Rumo
          orcamento={estado.orcamento}
          resumos={resumos}
          alvoPoupanca={alvoPoupanca(estado.orcamento)}
          aoMudar={definirOrcamento}
        />
      )}

      {aba === 'investir' && (
        <Investimentos
          orcamento={estado.orcamento}
          resumos={resumos}
          aoMudar={definirOrcamento}
        />
      )}

      {aba === 'definicoes' && (
        <Definicoes
          orcamento={estado.orcamento}
          aoMudar={definirOrcamento}
          aoExportar={() => exportar(estado)}
          token={token}
          estadoSync={sync}
          porSincronizar={porSincronizar}
          aoMudarToken={(t) => {
            guardarToken(t)
            setToken(t)
          }}
          aoSincronizar={() => void sincronizarAgora()}
          aoTrazer={() => void trazerDoRepositorio()}
        />
      )}

    </div>
  )
}
