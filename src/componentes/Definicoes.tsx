import { useRef, useState } from 'react'
import type { Categoria, Compromisso, Objetivo, Orcamento } from '../types'
import { alvoPoupanca, mesAtual, precisaRevisao } from '../lib/orcamento'
import { novoId, lerFicheiro } from '../lib/armazenamento'
import { eur } from '../lib/formato'
import { Campo } from './Campo'

interface Props {
  orcamento: Orcamento
  aoMudar: (patch: Partial<Orcamento>) => void
  aoExportar: () => void
}

export function Definicoes({ orcamento, aoMudar, aoExportar }: Props) {
  const [novaCategoria, setNovaCategoria] = useState('')
  const [novoObjetivo, setNovoObjetivo] = useState('')
  const [novoCompromisso, setNovoCompromisso] = useState('')
  const [erroImport, setErroImport] = useState<string | null>(null)
  const ficheiroRef = useRef<HTMLInputElement>(null)

  const importar = async (ficheiro: File) => {
    setErroImport(null)
    try {
      const estado = await lerFicheiro(ficheiro)
      const n = estado.orcamento.despesas.length
      // Substituir apaga o que está lá: nunca sem confirmação explícita.
      if (!confirm(`Isto substitui tudo o que tens nesta app por ${n} despesas do ficheiro. Continuar?`))
        return
      aoMudar(estado.orcamento)
    } catch (e) {
      setErroImport(e instanceof Error ? e.message : 'Não foi possível ler o ficheiro.')
    }
  }

  const poupanca = alvoPoupanca(orcamento)
  const somaExcede = orcamento.alvoEssencial + orcamento.alvoNaoEssencial > 100

  const atualizarCategoria = (id: string, patch: Partial<Categoria>) =>
    aoMudar({ categorias: orcamento.categorias.map((c) => (c.id === id ? { ...c, ...patch } : c)) })

  const atualizarCompromisso = (id: string, patch: Partial<Compromisso>) =>
    aoMudar({
      compromissos: orcamento.compromissos.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    })

  const atualizarObjetivo = (id: string, patch: Partial<Objetivo>) =>
    aoMudar({ objetivos: orcamento.objetivos.map((o) => (o.id === id ? { ...o, ...patch } : o)) })

  const concluirRevisao = () =>
    aoMudar({ ultimaRevisao: mesAtual(), rendimentoNaRevisao: orcamento.rendimentoMensal })

  return (
    <>
      {precisaRevisao(orcamento) && (
        <section className="cartao aviso-cartao">
          <h2>O teu rendimento mudou</h2>
          <p>
            Passou de {eur(orcamento.rendimentoNaRevisao)} para {eur(orcamento.rendimentoMensal)}.
            Com os rácios atuais, os não essenciais passam a{' '}
            <strong>{eur((orcamento.rendimentoMensal * orcamento.alvoNaoEssencial) / 100)} por mês</strong>{' '}
            e a poupança a <strong>{eur((orcamento.rendimentoMensal * poupanca) / 100)}</strong>.
          </p>
          <p>
            É o momento de rever os rácios e os objetivos a dois anos — manter a proporção é uma
            escolha legítima, mas convém ser escolha e não inércia.
          </p>
          <button type="button" className="botao botao--primario" onClick={concluirRevisao}>
            Revi, está decidido
          </button>
        </section>
      )}

      <section className="cartao">
        <h2>Cópia dos dados</h2>
        <p className="rodape" style={{ marginBottom: 12 }}>
          Os dados vivem no armazenamento deste browser, preso a este endereço. Mudar de URL —
          da rede local para o endereço definitivo — não os leva contigo, e limpar os dados de
          navegação apaga-os. Exporta antes de qualquer mudança.
        </p>
        <div className="registo-linha">
          <button type="button" className="botao" onClick={aoExportar}>
            Exportar
          </button>
          <button type="button" className="botao" onClick={() => ficheiroRef.current?.click()}>
            Importar
          </button>
          <input
            ref={ficheiroRef}
            type="file"
            accept="application/json,.json"
            className="visualmente-oculto"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void importar(f)
              e.target.value = ''
            }}
          />
        </div>
        {erroImport && (
          <p className="deriva deriva--sobe" style={{ marginTop: 10 }}>
            <span aria-hidden="true">▲ </span>
            {erroImport}
          </p>
        )}
        <p className="rodape" style={{ marginTop: 14 }}>
          Nada é enviado para lado nenhum, não há servidor. Isto mede e organiza — as decisões de
          alocação são tuas.
        </p>
      </section>

      <section className="cartao">
        <h2>Rendimento</h2>
        <div className="grelha-campos">
          <Campo
            etiqueta="Líquido mensal"
            valor={orcamento.rendimentoMensal}
            min={0}
            passo={50}
            sufixo="€"
            aoMudar={(v) => aoMudar({ rendimentoMensal: v })}
          />
          <Campo
            etiqueta="Almofada de liquidez"
            valor={orcamento.almofadaAlvo}
            min={0}
            passo={100}
            sufixo="€"
            dica="Piso que enche primeiro, não afetável a objetivos"
            aoMudar={(v) => aoMudar({ almofadaAlvo: v })}
          />
          <Campo
            etiqueta="Vencimentos por ano"
            valor={orcamento.vencimentosPorAno}
            min={12}
            max={16}
            sufixo="×"
            dica="14 em Portugal"
            aoMudar={(v) => aoMudar({ vencimentosPorAno: v })}
          />
        </div>
      </section>

      <section className="cartao">
        <h2>Repartição</h2>
        <div className="grelha-campos">
          <Campo
            etiqueta="Essenciais"
            valor={orcamento.alvoEssencial}
            min={0}
            max={100}
            passo={5}
            sufixo="%"
            dica={eur((orcamento.rendimentoMensal * orcamento.alvoEssencial) / 100)}
            aoMudar={(v) => aoMudar({ alvoEssencial: v })}
          />
          <Campo
            etiqueta="Não essenciais"
            valor={orcamento.alvoNaoEssencial}
            min={0}
            max={100}
            passo={5}
            sufixo="%"
            dica={eur((orcamento.rendimentoMensal * orcamento.alvoNaoEssencial) / 100)}
            aoMudar={(v) => aoMudar({ alvoNaoEssencial: v })}
          />
          <div className="campo">
            <label>Poupança</label>
            <div className="campo-entrada campo-entrada--calculado">
              <span>{poupanca}</span>
              <span className="sufixo">%</span>
            </div>
            <span className="dica">{eur((orcamento.rendimentoMensal * poupanca) / 100)}</span>
          </div>
        </div>
        {somaExcede && (
          <p className="deriva deriva--sobe">
            <span aria-hidden="true">▲ </span>
            As duas fatias somam mais de 100%: não sobra nada para poupança.
          </p>
        )}
      </section>

      <section className="cartao">
        <h2>Categorias</h2>
        <ul className="lista-categorias">
          {orcamento.categorias.map((c) => (
            <li key={c.id}>
              <input
                className="entrada-inline"
                value={c.nome}
                aria-label={`Nome da categoria ${c.nome}`}
                onChange={(e) => atualizarCategoria(c.id, { nome: e.target.value })}
              />
              <div className="grupo-alternar">
                <button
                  type="button"
                  aria-pressed={c.fatia === 'essencial'}
                  onClick={() => atualizarCategoria(c.id, { fatia: 'essencial' })}
                >
                  Essencial
                </button>
                <button
                  type="button"
                  aria-pressed={c.fatia === 'naoEssencial'}
                  onClick={() => atualizarCategoria(c.id, { fatia: 'naoEssencial' })}
                >
                  Não essencial
                </button>
              </div>
              <button
                type="button"
                className="botao botao--discreto"
                onClick={() => atualizarCategoria(c.id, { arquivada: !c.arquivada })}
              >
                {c.arquivada ? 'Repor' : 'Arquivar'}
              </button>
            </li>
          ))}
        </ul>
        <form
          className="registo-linha"
          style={{ marginTop: 12 }}
          onSubmit={(e) => {
            e.preventDefault()
            if (!novaCategoria.trim()) return
            aoMudar({
              categorias: [
                ...orcamento.categorias,
                { id: novoId(), nome: novaCategoria.trim(), fatia: 'naoEssencial' },
              ],
            })
            setNovaCategoria('')
          }}
        >
          <div className="campo-entrada">
            <input
              type="text"
              placeholder="Nova categoria"
              aria-label="Nova categoria"
              value={novaCategoria}
              onChange={(e) => setNovaCategoria(e.target.value)}
            />
          </div>
          <button type="submit" className="botao">
            Acrescentar
          </button>
        </form>
        <p className="rodape" style={{ marginTop: 10 }}>
          Arquivar mantém o histórico e só tira a categoria do registo rápido.
        </p>
      </section>

      <section className="cartao">
        <h2>Objetivos</h2>
        {orcamento.objetivos.length === 0 && (
          <p className="vazio">
            Sem objetivos. Um objetivo com valor e data faz a cascata encaminhar dinheiro para
            certificados até estar coberto.
          </p>
        )}
        <ul className="lista-categorias">
          {orcamento.objetivos.map((o) => (
            <li key={o.id}>
              <input
                className="entrada-inline"
                value={o.nome}
                aria-label={`Nome do objetivo ${o.nome}`}
                onChange={(e) => atualizarObjetivo(o.id, { nome: e.target.value })}
              />
              <div className="campo-entrada" style={{ maxWidth: 140 }}>
                <input
                  type="number"
                  inputMode="decimal"
                  placeholder="Alvo"
                  aria-label={`Valor alvo de ${o.nome}`}
                  value={o.valorAlvo ?? ''}
                  onWheel={(e) => e.currentTarget.blur()}
                  onChange={(e) =>
                    atualizarObjetivo(o.id, {
                      valorAlvo: e.target.value === '' ? undefined : Number(e.target.value),
                    })
                  }
                />
                <span className="sufixo">€</span>
              </div>
              <div className="campo-entrada" style={{ maxWidth: 130 }}>
                <input
                  type="month"
                  aria-label={`Data alvo de ${o.nome}`}
                  value={o.dataAlvo ?? ''}
                  onChange={(e) =>
                    atualizarObjetivo(o.id, { dataAlvo: e.target.value || undefined })
                  }
                />
              </div>
              <button
                type="button"
                className="botao botao--discreto botao--perigo"
                onClick={() => aoMudar({ objetivos: orcamento.objetivos.filter((x) => x.id !== o.id) })}
              >
                Remover
              </button>
            </li>
          ))}
        </ul>
        <form
          className="registo-linha"
          style={{ marginTop: 12 }}
          onSubmit={(e) => {
            e.preventDefault()
            if (!novoObjetivo.trim()) return
            aoMudar({ objetivos: [...orcamento.objetivos, { id: novoId(), nome: novoObjetivo.trim() }] })
            setNovoObjetivo('')
          }}
        >
          <div className="campo-entrada">
            <input
              type="text"
              placeholder="Novo objetivo"
              aria-label="Novo objetivo"
              value={novoObjetivo}
              onChange={(e) => setNovoObjetivo(e.target.value)}
            />
          </div>
          <button type="submit" className="botao">
            Acrescentar
          </button>
        </form>
      </section>

      <section className="cartao">
        <h2>Liquidez comprometida</h2>
        <p className="rodape" style={{ marginBottom: 12 }}>
          Dinheiro que está na conta mas já tem dono. Sai da liquidez livre e da almofada.
        </p>
        {orcamento.compromissos.length === 0 && (
          <p className="vazio">Nada comprometido: toda a liquidez conta como livre.</p>
        )}
        <ul className="lista-categorias">
          {orcamento.compromissos.map((c) => (
            <li key={c.id}>
              <input
                className="entrada-inline"
                value={c.nome}
                aria-label={`Nome do compromisso ${c.nome}`}
                onChange={(e) => atualizarCompromisso(c.id, { nome: e.target.value })}
              />
              <div className="campo-entrada" style={{ maxWidth: 140 }}>
                <input
                  type="number"
                  inputMode="decimal"
                  aria-label={`Valor de ${c.nome}`}
                  value={c.valor}
                  onWheel={(e) => e.currentTarget.blur()}
                  onChange={(e) => atualizarCompromisso(c.id, { valor: Number(e.target.value) || 0 })}
                />
                <span className="sufixo">€</span>
              </div>
              <button
                type="button"
                className="botao botao--discreto botao--perigo"
                onClick={() =>
                  aoMudar({ compromissos: orcamento.compromissos.filter((x) => x.id !== c.id) })
                }
              >
                Remover
              </button>
            </li>
          ))}
        </ul>
        <form
          className="registo-linha"
          style={{ marginTop: 12 }}
          onSubmit={(e) => {
            e.preventDefault()
            if (!novoCompromisso.trim()) return
            aoMudar({
              compromissos: [
                ...orcamento.compromissos,
                { id: novoId(), nome: novoCompromisso.trim(), valor: 0 },
              ],
            })
            setNovoCompromisso('')
          }}
        >
          <div className="campo-entrada">
            <input
              type="text"
              placeholder="Novo compromisso"
              aria-label="Novo compromisso"
              value={novoCompromisso}
              onChange={(e) => setNovoCompromisso(e.target.value)}
            />
          </div>
          <button type="submit" className="botao">
            Acrescentar
          </button>
        </form>
      </section>

      <section className="cartao">
        <h2>Marcos de revisão</h2>
        <p className="rodape" style={{ marginBottom: 12 }}>
          Datas em que a estratégia deve ser reaberta. São memória, não automatismo — nada
          acontece sozinho nestas datas.
        </p>
        {orcamento.revisoes.length === 0 ? (
          <p className="vazio">Sem marcos definidos.</p>
        ) : (
          <ul className="lista-revisoes">
            {[...orcamento.revisoes]
              .sort((a, b) => a.data.localeCompare(b.data))
              .map((r) => {
                const passou = r.data <= mesAtual()
                return (
                  <li key={r.id} className={passou ? 'revisao--devida' : undefined}>
                    <span className="revisao-data">{r.data}</span>
                    <span className="revisao-corpo">
                      <span className="revisao-titulo">
                        {r.titulo}
                        {passou && <span className="revisao-etiqueta">a rever</span>}
                      </span>
                      {r.nota && <span className="revisao-nota">{r.nota}</span>}
                    </span>
                    <button
                      type="button"
                      className="botao botao--discreto botao--perigo"
                      onClick={() =>
                        aoMudar({ revisoes: orcamento.revisoes.filter((x) => x.id !== r.id) })
                      }
                      aria-label={`Remover marco ${r.titulo}`}
                    >
                      ×
                    </button>
                  </li>
                )
              })}
          </ul>
        )}
      </section>

    </>
  )
}
