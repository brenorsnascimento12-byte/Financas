import { useEffect, useId, useState } from 'react'

interface Props {
  etiqueta: string
  valor: number
  aoMudar: (v: number) => void
  sufixo?: string
  min?: number
  max?: number
  passo?: number
  dica?: string
}

const limitar = (v: number, min?: number, max?: number) => {
  let r = v
  if (min !== undefined) r = Math.max(min, r)
  if (max !== undefined) r = Math.min(max, r)
  return r
}

export function Campo({ etiqueta, valor, aoMudar, sufixo, min, max, passo = 1, dica }: Props) {
  const id = useId()
  const [texto, setTexto] = useState(() => String(valor))
  const [focado, setFocado] = useState(false)

  // Enquanto o campo está focado, o utilizador manda no texto (pode estar vazio a
  // meio de uma edição). Fora de foco, o valor real volta a comandar.
  useEffect(() => {
    if (!focado) setTexto(String(valor))
  }, [valor, focado])

  return (
    <div className="campo">
      <label htmlFor={id}>{etiqueta}</label>
      <div className="campo-entrada">
        <input
          id={id}
          type="number"
          inputMode="decimal"
          step={passo}
          value={texto}
          onFocus={() => setFocado(true)}
          onChange={(e) => {
            setTexto(e.target.value)
            const n = Number(e.target.value)
            if (e.target.value !== '' && Number.isFinite(n)) aoMudar(n)
          }}
          // Num input[type=number] focado, a roda do rato altera o valor em silêncio.
          // Numa app de dinheiro isso é inaceitável: perde-se o foco em vez disso.
          onWheel={(e) => e.currentTarget.blur()}
          onBlur={() => {
            setFocado(false)
            const n = Number(texto)
            if (texto === '' || !Number.isFinite(n)) {
              setTexto(String(valor))
              return
            }
            const final = limitar(n, min, max)
            // Só escreve se mudou mesmo: evita gravar por cima de um valor que
            // entretanto foi alterado noutro sítio.
            if (final !== valor) aoMudar(final)
            setTexto(String(final))
          }}
        />
        {sufixo && <span className="sufixo">{sufixo}</span>}
      </div>
      {dica && <span className="dica">{dica}</span>}
    </div>
  )
}

