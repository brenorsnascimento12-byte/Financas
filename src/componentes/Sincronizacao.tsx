import { useState } from 'react'
import type { Orcamento } from '../types'

export type FaseSync = 'inativo' | 'aSincronizar' | 'ok' | 'erro'

export interface EstadoSync {
  fase: FaseSync
  mensagem?: string
  /** 'primeiraVez' faz aparecer a escolha, em vez de só a mensagem. */
  tipo?: string
}

interface Props {
  orcamento: Orcamento
  token: string
  estado: EstadoSync
  porSincronizar: boolean
  aoMudarRepo: (repo: string) => void
  aoMudarToken: (token: string) => void
  aoSincronizar: () => void
  aoTrazer: () => void
  aoJuntar: () => void
}

const quandoFoi = (iso: string | undefined) => {
  if (!iso) return 'ainda não sincronizou'
  const minutos = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (minutos < 1) return 'sincronizado agora mesmo'
  if (minutos < 60) return `sincronizado há ${minutos} min`
  const horas = Math.round(minutos / 60)
  if (horas < 24) return `sincronizado há ${horas} h`
  return `sincronizado a ${iso.slice(8, 10)}/${iso.slice(5, 7)}`
}

/** Uma linha discreta com o estado. Nunca um alarme: falhar é adiar, não perder. */
export function LinhaEstadoSync({
  orcamento,
  estado,
  porSincronizar,
}: Pick<Props, 'orcamento' | 'estado' | 'porSincronizar'>) {
  const { repo, ultimaSync } = orcamento.sincronizacao
  if (!repo) return null

  const texto =
    estado.fase === 'aSincronizar'
      ? 'a sincronizar…'
      : estado.fase === 'erro'
        ? (estado.mensagem ?? 'sem ligação — guardado no aparelho')
        : porSincronizar
          ? 'por sincronizar'
          : quandoFoi(ultimaSync)

  return (
    <p className={`estado-sync${estado.fase === 'erro' ? ' estado-sync--erro' : ''}`}>{texto}</p>
  )
}

export function Sincronizacao({
  orcamento,
  token,
  estado,
  porSincronizar,
  aoMudarRepo,
  aoMudarToken,
  aoSincronizar,
  aoTrazer,
  aoJuntar,
}: Props) {
  const [aEditarToken, setAEditarToken] = useState(token === '')
  const repo = orcamento.sincronizacao.repo ?? ''
  const pronto = repo !== '' && token !== ''

  return (
    <section className="cartao">
      <h2>Sincronização</h2>
      <p className="rodape" style={{ marginTop: 0 }}>
        Os dados ficam num repositório <strong>privado</strong> teu, num só ficheiro. Cada
        sincronização é um commit, por isso nada do que escreveres se perde sem recuperação.
        O telemóvel continua a funcionar sem rede e junta tudo quando voltar.
      </p>

      <div className="campo">
        <label htmlFor="sync-repo">Repositório privado</label>
        <div className="campo-entrada">
          <input
            id="sync-repo"
            type="text"
            autoComplete="off"
            spellCheck={false}
            placeholder="utilizador/financas-dados"
            value={repo}
            onChange={(e) => aoMudarRepo(e.target.value.trim())}
          />
        </div>
      </div>

      <div className="campo" style={{ marginTop: 12 }}>
        <label htmlFor="sync-token">Token de acesso</label>
        {aEditarToken ? (
          <div className="campo-entrada">
            <input
              id="sync-token"
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder="github_pat_…"
              value={token}
              onChange={(e) => aoMudarToken(e.target.value.trim())}
            />
          </div>
        ) : (
          <div className="registo-linha">
            <span className="rodape" style={{ margin: 0 }}>
              Guardado neste aparelho.
            </span>
            <button type="button" className="botao" onClick={() => setAEditarToken(true)}>
              Substituir
            </button>
          </div>
        )}
        <span className="dica">
          Token de acesso pessoal <em>fine-grained</em>, só com permissão de Conteúdo
          (leitura e escrita) e só sobre este repositório.
        </span>
      </div>

      <div className="registo-linha" style={{ marginTop: 16 }}>
        <button
          type="button"
          className="botao botao--primario"
          disabled={!pronto || estado.fase === 'aSincronizar'}
          onClick={aoSincronizar}
        >
          {estado.fase === 'aSincronizar' ? 'A sincronizar…' : 'Sincronizar agora'}
        </button>
        <LinhaEstadoSync
          orcamento={orcamento}
          estado={estado}
          porSincronizar={porSincronizar}
        />
      </div>

      {estado.fase === 'erro' && estado.mensagem && <p className="aviso">{estado.mensagem}</p>}

      {/* Juntar às cegas no primeiro contacto é o que duplica as categorias de
          arranque: aqui a escolha é explícita, com a opção segura em primeiro. */}
      {estado.tipo === 'primeiraVez' && (
        <div className="registo-linha" style={{ marginTop: 10 }}>
          <button type="button" className="botao botao--primario" onClick={aoTrazer}>
            Trazer do repositório
          </button>
          <button type="button" className="botao" onClick={aoJuntar}>
            Juntar as duas versões
          </button>
        </div>
      )}

      <details className="dobravel" style={{ marginTop: 14 }}>
        <summary>Montar este aparelho de raiz</summary>
        <div className="dobravel-corpo">
          <p className="rodape" style={{ marginTop: 0 }}>
            Num aparelho novo, carrega aqui em vez de sincronizar. Uma instalação de raiz traz
            as suas próprias categorias de arranque, e a primeira fusão ficaria com as duas
            listas. Isto descarta o que está aqui e adota o que está no repositório.
          </p>
          <button
            type="button"
            className="botao botao--perigo"
            disabled={!pronto || estado.fase === 'aSincronizar'}
            onClick={aoTrazer}
          >
            Trazer do repositório e substituir
          </button>
        </div>
      </details>

      <p className="rodape">
        O token fica só neste aparelho e nunca entra na cópia nem na exportação. Num
        aparelho que deixes de usar, substitui-o por vazio.
      </p>
    </section>
  )
}
