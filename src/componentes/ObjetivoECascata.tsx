import { useMemo, useState } from 'react'
import type { Destino, Orcamento } from '../types'
import {
  alvoPoupanca,
  calcularCascata,
  objetivoComData,
  progressoObjetivo,
  totalComprometido,
  ultimoSaldo,
} from '../lib/orcamento'
import { eur, pct } from '../lib/formato'

interface Props {
  orcamento: Orcamento
}

const NOME_DESTINO: Record<Destino, string> = {
  investimento: 'ETFs',
  liquidez: 'Almofada',
  certificados: 'Certificados',
}

const COR_DESTINO: Record<Destino, string> = {
  investimento: 'var(--serie-1)',
  liquidez: 'var(--serie-3)',
  certificados: 'var(--serie-2)',
}

export function ObjetivoECascata({ orcamento }: Props) {
  const objetivo = objetivoComData(orcamento)
  const progresso = useMemo(
    () => (objetivo ? progressoObjetivo(orcamento, objetivo) : null),
    [orcamento, objetivo],
  )

  // Por omissão reparte a poupança planeada do mês; editável para simular um mês
  // melhor ou pior sem ter de mexer nos rácios.
  const poupancaPlaneada = Math.round(
    (orcamento.rendimentoMensal * alvoPoupanca(orcamento)) / 100,
  )
  const [montante, setMontante] = useState(String(poupancaPlaneada))
  const valorMontante = Number(montante.replace(',', '.')) || 0
  const passos = useMemo(
    () => calcularCascata(orcamento, valorMontante),
    [orcamento, valorMontante],
  )

  const saldo = ultimoSaldo(orcamento)
  const liquidezLivre = saldo ? saldo.liquidez - totalComprometido(orcamento) : null

  return (
    <>
      {progresso && (
        <section className="cartao">
          <div className="seccao-topo">
            <h2>{progresso.objetivo.nome}</h2>
            <span className="seccao-total">
              {eur(progresso.atual)} <span className="medidor-alvo">de {eur(progresso.alvo)}</span>
            </span>
          </div>

          <div
            className="medidor-pista"
            style={{ background: 'color-mix(in srgb, var(--serie-2) 20%, var(--surface-1))' }}
          >
            <div
              className="medidor-barra"
              style={{ width: `${progresso.pct * 100}%`, background: 'var(--serie-2)' }}
            />
          </div>

          <div className="medidor-baixo" style={{ marginTop: 6 }}>
            <span>{pct(progresso.pct)} do alvo</span>
            <span className="medidor-restante">
              {progresso.mesesRestantes} meses até {progresso.objetivo.dataAlvo}
            </span>
          </div>

          <div className="mosaicos" style={{ marginTop: 14 }}>
            <div className="mosaico">
              <span className="rotulo">Falta juntar</span>
              <span className="valor">{eur(progresso.falta)}</span>
              <span className="sub">em {progresso.mesesRestantes} meses</span>
            </div>
            <div className="mosaico">
              <span className="rotulo">Ritmo necessário</span>
              <span className="valor">{eur(progresso.necessarioMensal)}</span>
              <span className="sub">por mês, a partir de agora</span>
            </div>
            <div className="mosaico">
              <span className="rotulo">Ritmo atual</span>
              <span className="valor">
                {progresso.ritmoAtual === null ? '—' : eur(progresso.ritmoAtual)}
              </span>
              <span className="sub">
                {progresso.ritmoAtual === null ? 'sem aportes registados' : 'média por mês'}
              </span>
            </div>
          </div>

          {progresso.emDesvio && (
            <p className="deriva deriva--sobe" style={{ marginTop: 12 }}>
              <span aria-hidden="true">▲ </span>
              Ao ritmo atual não chegas ao alvo na data: precisas de{' '}
              {eur(progresso.necessarioMensal)} por mês, e estás a fazer{' '}
              {eur(progresso.ritmoAtual ?? 0)}.
            </p>
          )}
        </section>
      )}

      <section className="cartao">
        <h2>Para onde vai a poupança</h2>

        <div className="registo-linha" style={{ marginBottom: 14 }}>
          <div className="campo-entrada registo-valor">
            <input
              type="text"
              inputMode="decimal"
              aria-label="Montante a repartir"
              value={montante}
              onChange={(e) => setMontante(e.target.value)}
            />
            <span className="sufixo">€</span>
          </div>
        </div>

        {passos.length === 0 ? (
          <p className="vazio">Sem montante para repartir.</p>
        ) : (
          <ol className="cascata">
            {passos.map((p, i) => (
              <li key={p.destino + i}>
                <span className="cascata-ordem">{i + 1}</span>
                <span
                  className="chave-linha"
                  style={{ background: COR_DESTINO[p.destino] }}
                  aria-hidden="true"
                />
                <span className="cascata-principal">
                  <span className="cascata-nome">{NOME_DESTINO[p.destino]}</span>
                  <span className="cascata-razao">{p.razao}</span>
                </span>
                <span className="cascata-valor">{eur(p.valor)}</span>
              </li>
            ))}
          </ol>
        )}

        <p className="rodape" style={{ marginTop: 12 }}>
          {liquidezLivre === null ? (
            <>
              Sem fotografia registada não dá para saber onde está a almofada, por isso esse passo
              fica de fora. Regista uma abaixo para a cascata ficar completa.
            </>
          ) : (
            <>
              Almofada livre em {eur(liquidezLivre)} de {eur(orcamento.almofadaAlvo)}. Os ETFs já
              detidos não entram nesta conta — só condiciona o aporte novo.
            </>
          )}
        </p>
      </section>
    </>
  )
}
