# Leitor de extratos do ActivoBank — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cruzar o PDF do extrato do ActivoBank com o que já está registado na app, apresentando ao utilizador apenas o que falta ou é ambíguo.

**Architecture:** Quatro funções puras encadeadas (ler → analisar → classificar → cruzar) e um componente de triagem. A leitura do PDF acontece inteiramente no dispositivo. O encadeamento dos saldos determina o sinal de cada movimento e valida a leitura inteira: se a soma não fechar, a importação é recusada.

**Tech Stack:** TypeScript, React 19, Vite 8, `pdfjs-dist` (importada dinamicamente), Vitest (a introduzir — o projeto não tem testes hoje).

**Spec:** `docs/superpowers/specs/2026-10-01-leitor-extratos-design.md`

## Global Constraints

- Português de Portugal em todo o código, comentários, interface e mensagens de erro.
- Nada sai do dispositivo. Sem CDN, sem servidor, sem telemetria. `pdfjs-dist` é empacotada com a app.
- Nenhuma escrita sem aprovação explícita do utilizador na triagem.
- Tolerância de comparação de valores monetários: `0.005` (metade do cêntimo).
- Janela de emparelhamento de datas: ±3 dias.
- `pdfjs-dist` é importada com `await import()` dentro da função que a usa, nunca no topo do módulo, para não entrar no pacote inicial.
- Toda a persistência passa por `Orcamento`; campos novos entram na migração com `[]` por omissão, como os anteriores.

## Review Focus

Classes de entrada que a spec implica e que mordem o utilizador se não forem cobertas:

1. **Extrato que atravessa a passagem de ano** (dezembro → janeiro): as linhas só têm `M.DD`, e resolver o ano pelo início do período poria janeiro no ano errado. → Teste na Task 2.
2. **Espaço inseparável (U+00A0) nos milhares**: PDFs usam-no em vez do espaço normal, e `Number()` devolve `NaN`. → Teste na Task 2.
3. **Duas compras idênticas no mesmo dia e no mesmo sítio**: colidem na impressão digital e no emparelhamento. → Testes nas Tasks 2 e 5.
4. **Extrato sem movimentos** (só `SALDO INICIAL`, mês sem atividade): a verificação final tem de passar com zero linhas em vez de rebentar. → Teste na Task 3.
5. **Linha de comissão sem compra-mãe no mesmo dia** (primeira linha do extrato, ou mãe no extrato do mês anterior): não pode ficar órfã sem destino. → Teste na Task 4.

## Desvio consciente face à spec

A spec descreve a triagem como "uma decisão de cada vez", em cartões. O plano
implementa-a como **uma lista única com todas as linhas em falta**, cada uma com
o seu seletor de categoria, e um só botão a escrever no fim.

Porquê: numa lista vês o mês inteiro antes de decidires, comparas linhas
parecidas umas com as outras, e a questão de "sair a meio e perder o que já
decidi" deixa praticamente de existir — não há meio, há um ecrã. Em cartões,
cada decisão é tomada às cegas em relação às seguintes.

Consequência: a spec prometia que sair a meio preservava as decisões tomadas.
Com a lista, sair a meio perde-as, e é aceitável porque não há progresso
acumulado a perder — voltas a importar o mesmo PDF e tens o mesmo ecrã. Se o uso
real mostrar que a lista fica longa de mais, volta-se aos cartões e aí sim a
persistência passa a valer o seu custo.

---

### Task 1: Infraestrutura de testes, tipos e migração

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Modify: `src/types.ts`
- Modify: `src/lib/armazenamento.ts`
- Test: `src/lib/armazenamento.test.ts`

**Interfaces:**
- Consumes: `Orcamento`, `migrar` (privada), `orcamentoInicial` de `src/lib/armazenamento.ts`
- Produces: tipos `Regra`, `MovimentoExtrato`, `TipoMovimento`; campos `regras: Regra[]` e `linhasIgnoradas: string[]` em `Orcamento`

- [ ] **Step 1: Instalar o Vitest**

```bash
npm install -D vitest@^3
```

- [ ] **Step 2: Criar a configuração de testes**

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Ambiente de nó: as funções puras do extrato não tocam no DOM.
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
```

- [ ] **Step 3: Acrescentar o script de testes**

Modify `package.json`, no bloco `scripts`, acrescentar depois de `"lint"`:

```json
    "test": "vitest run",
```

- [ ] **Step 4: Escrever o teste da migração**

Create `src/lib/armazenamento.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { orcamentoInicial } from './armazenamento'

describe('orcamentoInicial', () => {
  it('traz as listas novas vazias', () => {
    const o = orcamentoInicial()
    expect(o.regras).toEqual([])
    expect(o.linhasIgnoradas).toEqual([])
  })
})
```

- [ ] **Step 5: Correr o teste e confirmar que falha**

Run: `npm test`
Expected: FAIL — `o.regras` é `undefined`.

- [ ] **Step 6: Acrescentar os tipos**

Modify `src/types.ts`. Acrescentar antes de `export interface Orcamento`:

```ts
/** O que uma linha do extrato é, depois de classificada. */
export type TipoMovimento = 'despesa' | 'rendimento' | 'aporte' | 'comissao' | 'transferencia'

/**
 * Regra aprendida na triagem: aplica-se a todos os movimentos cujo descritivo
 * normalizado contenha `padrao`. É sempre sugestão — nunca escreve sozinha.
 */
export interface Regra {
  id: string
  /** Substring do descritivo normalizado, ex. "PINGO DOCE". */
  padrao: string
  tipo: TipoMovimento | 'ignorar'
  /** Obrigatório quando tipo === 'despesa'. */
  categoriaId?: string
}

/**
 * Uma linha do extrato. Nunca é persistida: vive só durante a triagem.
 */
export interface MovimentoExtrato {
  /**
   * Impressão digital estável, para a linha ser reconhecível entre importações:
   * `data|valor|chave|ocorrência`. A ocorrência distingue duas compras iguais no
   * mesmo dia e no mesmo sítio, que de outro modo colidiriam.
   */
  id: string
  /** YYYY-MM-DD, com o ano já resolvido a partir do período do extrato. */
  data: string
  dataValor: string
  /** Descritivo bruto, tal como sai do PDF. */
  descritivo: string
  /** Descritivo normalizado, para regras e comparações. */
  chave: string
  /** Sempre positivo; o sinal vive em `sinal`. */
  valor: number
  sinal: 'debito' | 'credito'
  saldo: number
  /** Id do movimento-mãe, quando esta linha é uma comissão. */
  paiId?: string
}
```

Acrescentar dentro de `export interface Orcamento`, depois de `revisoes: Revisao[]`:

```ts
  regras: Regra[]
  /**
   * Impressões digitais de linhas concretas mandadas ignorar. Distingue-se de
   * uma `Regra` com tipo 'ignorar': a regra silencia todos os movimentos com
   * aquele descritivo, esta lista silencia apenas aquela linha daquele dia.
   */
  linhasIgnoradas: string[]
```

- [ ] **Step 7: Acrescentar os campos ao arranque e à migração**

Modify `src/lib/armazenamento.ts`, em `orcamentoInicial()`, depois de `almofadaAlvo: 800,`:

```ts
  regras: [],
  linhasIgnoradas: [],
```

Em `migrar()`, depois da linha `if (!Array.isArray(orcamento.revisoes)) orcamento.revisoes = []`:

```ts
  if (!Array.isArray(orcamento.regras)) orcamento.regras = []
  if (!Array.isArray(orcamento.linhasIgnoradas)) orcamento.linhasIgnoradas = []
```

- [ ] **Step 8: Correr os testes e confirmar que passam**

Run: `npm test`
Expected: PASS

- [ ] **Step 9: Confirmar que o build continua limpo**

Run: `npm run build`
Expected: compila sem erros.

- [ ] **Step 10: Commit**

```bash
git add package.json package-lock.json vitest.config.ts src/types.ts src/lib/armazenamento.ts src/lib/armazenamento.test.ts
git commit -m "Infraestrutura de testes e tipos do leitor de extratos"
```

---

### Task 2: Normalização de números, datas e descritivos

**Files:**
- Create: `src/lib/extrato/normalizar.ts`
- Test: `src/lib/extrato/normalizar.test.ts`

**Interfaces:**
- Consumes: nada
- Produces:
  - `normalizarNumero(texto: string): number`
  - `resolverAno(mes: number, periodo: { inicio: string; fim: string }): number`
  - `normalizarChave(descritivo: string): string`
  - `impressaoDigital(data: string, valor: number, chave: string, ocorrencia: number): string`

- [ ] **Step 1: Escrever os testes a falhar**

Create `src/lib/extrato/normalizar.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { impressaoDigital, normalizarChave, normalizarNumero, resolverAno } from './normalizar'

describe('normalizarNumero', () => {
  it('lê o ponto como decimal', () => {
    expect(normalizarNumero('9.90')).toBe(9.9)
  })

  it('remove o espaço dos milhares', () => {
    expect(normalizarNumero('1 958.67')).toBe(1958.67)
  })

  it('remove o espaço inseparável dos milhares', () => {
    // Os PDFs usam U+00A0; sem o remover, Number() devolve NaN.
    expect(normalizarNumero('12 345.67')).toBe(12345.67)
  })

  it('rejeita texto que não seja número', () => {
    expect(() => normalizarNumero('SALDO')).toThrow()
  })
})

describe('resolverAno', () => {
  const agosto = { inicio: '2026-08-03', fim: '2026-08-31' }

  it('usa o ano do período quando o mês cabe nele', () => {
    expect(resolverAno(8, agosto)).toBe(2026)
  })

  it('resolve a passagem de ano', () => {
    // Extrato de 15 de dezembro a 14 de janeiro: dezembro é 2026, janeiro é 2027.
    const virada = { inicio: '2026-12-15', fim: '2027-01-14' }
    expect(resolverAno(12, virada)).toBe(2026)
    expect(resolverAno(1, virada)).toBe(2027)
  })
})

describe('normalizarChave', () => {
  it('remove o prefixo do cartão', () => {
    expect(normalizarChave('COMPRA 1998 PINGO DOCE TAIPAS')).toBe('PINGO DOCE TAIPAS')
  })

  it('passa a maiúsculas e colapsa espaços', () => {
    expect(normalizarChave('COMPRA 1998 Flix  SE   Berlin DE')).toBe('FLIX SE BERLIN DE')
  })

  it('deixa intacto um descritivo sem prefixo', () => {
    expect(normalizarChave('IMPOSTO DO SELO')).toBe('IMPOSTO DO SELO')
  })
})

describe('impressaoDigital', () => {
  it('distingue duas compras iguais no mesmo dia', () => {
    const a = impressaoDigital('2026-08-04', 10, 'EST SERVICO RE BRAGA', 0)
    const b = impressaoDigital('2026-08-04', 10, 'EST SERVICO RE BRAGA', 1)
    expect(a).not.toBe(b)
  })
})
```

- [ ] **Step 2: Correr e confirmar que falha**

Run: `npm test -- normalizar`
Expected: FAIL — módulo não encontrado.

- [ ] **Step 3: Implementar**

Create `src/lib/extrato/normalizar.ts`:

```ts
/**
 * Converte um número do extrato. Os PDFs usam espaço (normal ou inseparável)
 * nos milhares e ponto decimal — ao contrário da vírgula habitual em Portugal.
 */
export function normalizarNumero(texto: string): number {
  const limpo = texto.replace(/[\s ]/g, '')
  const n = Number(limpo)
  if (!Number.isFinite(n)) throw new Error(`Não é um número: "${texto}"`)
  return n
}

/**
 * As linhas do extrato só trazem `M.DD`. O ano vem do período do cabeçalho.
 * Num extrato que atravesse a passagem de ano, os meses que não cabem no ano
 * final pertencem ao inicial.
 */
export function resolverAno(mes: number, periodo: { inicio: string; fim: string }): number {
  const anoInicio = Number(periodo.inicio.slice(0, 4))
  const anoFim = Number(periodo.fim.slice(0, 4))
  if (anoInicio === anoFim) return anoInicio
  const mesFim = Number(periodo.fim.slice(5, 7))
  return mes > mesFim ? anoInicio : anoFim
}

/** Remove o número do cartão, que se repete em todas as compras e é ruído. */
export function normalizarChave(descritivo: string): string {
  return descritivo
    .replace(/^COMPRA\s+\d{4}\s+/i, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/** Identidade estável de uma linha, para a reconhecer entre importações. */
export function impressaoDigital(
  data: string,
  valor: number,
  chave: string,
  ocorrencia: number,
): string {
  return `${data}|${valor.toFixed(2)}|${chave}|${ocorrencia}`
}
```

- [ ] **Step 4: Correr e confirmar que passa**

Run: `npm test -- normalizar`
Expected: PASS (11 testes)

- [ ] **Step 5: Commit**

```bash
git add src/lib/extrato/normalizar.ts src/lib/extrato/normalizar.test.ts
git commit -m "Normalização de números, datas e descritivos do extrato"
```

---

### Task 3: Análise das linhas e validação pelo encadeamento dos saldos

**Files:**
- Create: `src/lib/extrato/analisar.ts`
- Test: `src/lib/extrato/analisar.test.ts`

**Interfaces:**
- Consumes: `normalizarNumero`, `resolverAno`, `normalizarChave`, `impressaoDigital` de `./normalizar`; `MovimentoExtrato` de `../../types`
- Produces: `analisarExtrato(linhas: string[]): ResultadoAnalise`, onde

```ts
export interface ResultadoAnalise {
  periodo: { inicio: string; fim: string }
  saldoInicial: number
  saldoFinal: number
  movimentos: MovimentoExtrato[]
}
```

  Erros são lançados como `Error` com mensagem em português pronta a mostrar.

- [ ] **Step 1: Escrever os testes a falhar**

Create `src/lib/extrato/analisar.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { analisarExtrato } from './analisar'

/** Extrato sintético com a estrutura real e valores inventados. */
const EXTRATO = [
  'EXTRATO DE 2026/08/03 A 2026/08/31',
  'DATA DATA',
  'LANC. VALOR DESCRITIVO DEBITO CREDITO SALDO',
  'SALDO INICIAL 1 000.00',
  '8.03 8.03 COMPRA 1998 PINGO DOCE TAIPAS 32.18 967.82',
  '8.04 8.04 TRF. P/O ALGUEM 60.00 1 027.82',
  '8.06 8.06 COMPRA 1998 ANTHROPIC CLAUDE SUB 22.14 1 005.68',
  '8.06 8.06 IMPOSTO DO SELO 0.03 1 005.65',
]

describe('analisarExtrato', () => {
  it('lê o período e os saldos', () => {
    const r = analisarExtrato(EXTRATO)
    expect(r.periodo).toEqual({ inicio: '2026-08-03', fim: '2026-08-31' })
    expect(r.saldoInicial).toBe(1000)
    expect(r.saldoFinal).toBe(1005.65)
  })

  it('resolve as datas de M.DD para YYYY-MM-DD', () => {
    const r = analisarExtrato(EXTRATO)
    // 8.03 é 3 de agosto, não 8 de março.
    expect(r.movimentos[0].data).toBe('2026-08-03')
  })

  it('deduz o sinal pelo encadeamento do saldo', () => {
    const r = analisarExtrato(EXTRATO)
    expect(r.movimentos[0].sinal).toBe('debito')
    expect(r.movimentos[1].sinal).toBe('credito')
  })

  it('guarda o valor sempre positivo', () => {
    const r = analisarExtrato(EXTRATO)
    expect(r.movimentos[0].valor).toBe(32.18)
  })

  it('salta o SALDO INICIAL e os cabeçalhos', () => {
    const r = analisarExtrato(EXTRATO)
    expect(r.movimentos).toHaveLength(4)
  })

  it('aceita um extrato sem movimentos', () => {
    // Mês sem atividade: só o saldo inicial. Não pode rebentar.
    const vazio = ['EXTRATO DE 2026/09/01 A 2026/09/30', 'SALDO INICIAL 500.00']
    const r = analisarExtrato(vazio)
    expect(r.movimentos).toEqual([])
    expect(r.saldoFinal).toBe(500)
  })

  it('distingue duas compras iguais no mesmo dia', () => {
    const repetido = [
      'EXTRATO DE 2026/08/01 A 2026/08/31',
      'SALDO INICIAL 100.00',
      '8.04 8.04 COMPRA 1998 EST SERVICO RE BRAGA 10.00 90.00',
      '8.04 8.04 COMPRA 1998 EST SERVICO RE BRAGA 10.00 80.00',
    ]
    const r = analisarExtrato(repetido)
    expect(r.movimentos[0].id).not.toBe(r.movimentos[1].id)
  })

  it('recusa quando o encadeamento não fecha', () => {
    const partido = [
      'EXTRATO DE 2026/08/01 A 2026/08/31',
      'SALDO INICIAL 100.00',
      '8.04 8.04 COMPRA 1998 QUALQUER COISA 10.00 75.00',
    ]
    expect(() => analisarExtrato(partido)).toThrow(/linha/i)
  })

  it('recusa quando não encontra o SALDO INICIAL', () => {
    expect(() => analisarExtrato(['EXTRATO DE 2026/08/01 A 2026/08/31'])).toThrow(/ActivoBank/i)
  })

  it('recusa quando não encontra o período', () => {
    expect(() => analisarExtrato(['SALDO INICIAL 100.00'])).toThrow(/período/i)
  })
})
```

- [ ] **Step 2: Correr e confirmar que falha**

Run: `npm test -- analisar`
Expected: FAIL — módulo não encontrado.

- [ ] **Step 3: Implementar**

Create `src/lib/extrato/analisar.ts`:

```ts
import type { MovimentoExtrato } from '../../types'
import { impressaoDigital, normalizarChave, normalizarNumero, resolverAno } from './normalizar'

export interface ResultadoAnalise {
  periodo: { inicio: string; fim: string }
  saldoInicial: number
  saldoFinal: number
  movimentos: MovimentoExtrato[]
}

/** Metade do cêntimo: abaixo disto é arredondamento, não erro de leitura. */
const TOLERANCIA = 0.005

const PERIODO = /EXTRATO DE\s+(\d{4})\/(\d{2})\/(\d{2})\s+A\s+(\d{4})\/(\d{2})\/(\d{2})/i
const SALDO_INICIAL = /SALDO INICIAL\s+([\d\s ]+\.\d{2})\s*$/i
const MOVIMENTO =
  /^(\d{1,2})\.(\d{2})\s+(\d{1,2})\.(\d{2})\s+(.+?)\s+([\d\s ]+\.\d{2})\s+([\d\s ]+\.\d{2})\s*$/

const doisDigitos = (n: number) => String(n).padStart(2, '0')

/**
 * Lê as linhas de texto de um extrato do ActivoBank.
 *
 * O sinal de cada movimento vem do encadeamento dos saldos, não da coluna: em
 * texto extraído de PDF a coluna de origem perde-se, mas a aritmética do saldo
 * resolve-a sem ambiguidade. Isso dá de graça uma verificação de integridade —
 * se uma linha não encadear, foi mal lida, e a importação é recusada inteira em
 * vez de aceite meia errada.
 */
export function analisarExtrato(linhas: string[]): ResultadoAnalise {
  const cabecalho = linhas.map((l) => l.match(PERIODO)).find(Boolean)
  if (!cabecalho) {
    throw new Error('Não encontrei o período do extrato. O ficheiro não parece um extrato.')
  }
  const periodo = {
    inicio: `${cabecalho[1]}-${cabecalho[2]}-${cabecalho[3]}`,
    fim: `${cabecalho[4]}-${cabecalho[5]}-${cabecalho[6]}`,
  }

  const linhaInicial = linhas.find((l) => SALDO_INICIAL.test(l))
  if (!linhaInicial) {
    throw new Error('Não encontrei o SALDO INICIAL. Isto não parece um extrato do ActivoBank.')
  }
  const saldoInicial = normalizarNumero(linhaInicial.match(SALDO_INICIAL)![1])

  const movimentos: MovimentoExtrato[] = []
  const vistos = new Map<string, number>()
  let saldo = saldoInicial

  for (const linha of linhas) {
    const m = linha.match(MOVIMENTO)
    if (!m) continue

    const [, mesLanc, diaLanc, mesValor, diaValor, descritivo, valorBruto, saldoBruto] = m
    const valor = normalizarNumero(valorBruto)
    const saldoLinha = normalizarNumero(saldoBruto)

    let sinal: 'debito' | 'credito'
    if (Math.abs(saldo - valor - saldoLinha) < TOLERANCIA) sinal = 'debito'
    else if (Math.abs(saldo + valor - saldoLinha) < TOLERANCIA) sinal = 'credito'
    else {
      throw new Error(
        `A leitura perdeu-se nesta linha: "${linha.trim()}". ` +
          `O saldo não encadeia (esperava ${(saldo - valor).toFixed(2)} ou ` +
          `${(saldo + valor).toFixed(2)}, o extrato diz ${saldoLinha.toFixed(2)}).`,
      )
    }

    const ano = resolverAno(Number(mesLanc), periodo)
    const data = `${ano}-${doisDigitos(Number(mesLanc))}-${diaLanc}`
    const dataValor = `${resolverAno(Number(mesValor), periodo)}-${doisDigitos(Number(mesValor))}-${diaValor}`
    const chave = normalizarChave(descritivo)

    const base = `${data}|${valor.toFixed(2)}|${chave}`
    const ocorrencia = vistos.get(base) ?? 0
    vistos.set(base, ocorrencia + 1)

    movimentos.push({
      id: impressaoDigital(data, valor, chave, ocorrencia),
      data,
      dataValor,
      descritivo: descritivo.trim(),
      chave,
      valor,
      sinal,
      saldo: saldoLinha,
    })
    saldo = saldoLinha
  }

  const saldoFinal = movimentos.length > 0 ? movimentos[movimentos.length - 1].saldo : saldoInicial
  const esperado = movimentos.reduce(
    (acc, mv) => (mv.sinal === 'debito' ? acc - mv.valor : acc + mv.valor),
    saldoInicial,
  )
  if (Math.abs(esperado - saldoFinal) >= TOLERANCIA) {
    throw new Error(
      `A soma dos movimentos não bate com o saldo final: ` +
        `esperava ${esperado.toFixed(2)}, o extrato diz ${saldoFinal.toFixed(2)}.`,
    )
  }

  return { periodo, saldoInicial, saldoFinal, movimentos }
}
```

- [ ] **Step 4: Correr e confirmar que passa**

Run: `npm test -- analisar`
Expected: PASS (10 testes)

- [ ] **Step 5: Commit**

```bash
git add src/lib/extrato/analisar.ts src/lib/extrato/analisar.test.ts
git commit -m "Análise das linhas do extrato com validação pelo saldo"
```

---

### Task 4: Classificação dos movimentos

**Files:**
- Create: `src/lib/extrato/classificar.ts`
- Test: `src/lib/extrato/classificar.test.ts`

**Interfaces:**
- Consumes: `MovimentoExtrato`, `Regra`, `TipoMovimento` de `../../types`
- Produces: `classificar(movimentos: MovimentoExtrato[], regras: Regra[]): MovimentoClassificado[]`, onde

```ts
export interface MovimentoClassificado {
  movimento: MovimentoExtrato
  tipo: TipoMovimento | 'ignorar'
  /** Preenchido quando uma regra sugeriu categoria. */
  categoriaSugerida?: string
  /** Comissões anexadas a este movimento. */
  comissoes: MovimentoExtrato[]
}
```

- [ ] **Step 1: Escrever os testes a falhar**

Create `src/lib/extrato/classificar.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { MovimentoExtrato, Regra } from '../../types'
import { classificar } from './classificar'

const mov = (p: Partial<MovimentoExtrato>): MovimentoExtrato => ({
  id: p.id ?? 'x',
  data: p.data ?? '2026-08-06',
  dataValor: p.dataValor ?? '2026-08-06',
  descritivo: p.descritivo ?? 'QUALQUER COISA',
  chave: p.chave ?? (p.descritivo ?? 'QUALQUER COISA').toUpperCase(),
  valor: p.valor ?? 10,
  sinal: p.sinal ?? 'debito',
  saldo: p.saldo ?? 0,
})

describe('classificar', () => {
  it('trata um débito desconhecido como despesa', () => {
    const [r] = classificar([mov({ chave: 'MCDONALDS MT5 BRAGA' })], [])
    expect(r.tipo).toBe('despesa')
  })

  it('trata um crédito desconhecido como rendimento', () => {
    const [r] = classificar([mov({ chave: 'ALGUMA COISA', sinal: 'credito' })], [])
    expect(r.tipo).toBe('rendimento')
  })

  it('reconhece transferências', () => {
    const [r] = classificar([mov({ chave: 'TRF MB WAY P/ ALGUEM' })], [])
    expect(r.tipo).toBe('transferencia')
  })

  it('anexa a comissão à compra do mesmo dia', () => {
    const compra = mov({ id: 'c', chave: 'ANTHROPIC CLAUDE SUB', valor: 22.14 })
    const selo = mov({ id: 's', chave: 'IMPOSTO DO SELO', valor: 0.03 })
    const r = classificar([compra, selo], [])
    expect(r).toHaveLength(1)
    expect(r[0].comissoes.map((c) => c.id)).toEqual(['s'])
    expect(r[0].comissoes[0].paiId).toBe('c')
  })

  it('deixa a comissão autónoma quando não há compra-mãe nesse dia', () => {
    // Primeira linha do extrato, ou mãe no mês anterior: não pode desaparecer.
    const selo = mov({ id: 's', chave: 'IMPOSTO DO SELO', valor: 0.03 })
    const r = classificar([selo], [])
    expect(r).toHaveLength(1)
    expect(r[0].tipo).toBe('comissao')
    expect(r[0].movimento.paiId).toBeUndefined()
  })

  it('aplica a regra e sugere a categoria', () => {
    const regras: Regra[] = [
      { id: 'r', padrao: 'PINGO DOCE', tipo: 'despesa', categoriaId: 'cat-alim' },
    ]
    const [r] = classificar([mov({ chave: 'PINGO DOCE TAIPAS GUIMARAES' })], regras)
    expect(r.tipo).toBe('despesa')
    expect(r.categoriaSugerida).toBe('cat-alim')
  })

  it('a regra ganha à deteção de transferência', () => {
    const regras: Regra[] = [{ id: 'r', padrao: 'TRF MB WAY P/ ALGUEM', tipo: 'aporte' }]
    const [r] = classificar([mov({ chave: 'TRF MB WAY P/ ALGUEM' })], regras)
    expect(r.tipo).toBe('aporte')
  })

  it('a comissão ganha à regra', () => {
    // Uma regra demasiado larga não deve transformar uma comissão em despesa solta.
    const regras: Regra[] = [{ id: 'r', padrao: 'IMPOSTO', tipo: 'despesa', categoriaId: 'c' }]
    const compra = mov({ id: 'c', chave: 'ALGO', valor: 5 })
    const selo = mov({ id: 's', chave: 'IMPOSTO DO SELO', valor: 0.03 })
    const r = classificar([compra, selo], regras)
    expect(r).toHaveLength(1)
    expect(r[0].comissoes).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Correr e confirmar que falha**

Run: `npm test -- classificar`
Expected: FAIL — módulo não encontrado.

- [ ] **Step 3: Implementar**

Create `src/lib/extrato/classificar.ts`:

```ts
import type { MovimentoExtrato, Regra, TipoMovimento } from '../../types'

export interface MovimentoClassificado {
  movimento: MovimentoExtrato
  tipo: TipoMovimento | 'ignorar'
  /** Preenchido quando uma regra sugeriu categoria. */
  categoriaSugerida?: string
  /** Comissões anexadas a este movimento. */
  comissoes: MovimentoExtrato[]
}

const COMISSOES = ['IMPOSTO DO SELO', 'CUSTO DE SERVICO INTERNACIONAL', 'COMISSAO']
const ehComissao = (m: MovimentoExtrato) => COMISSOES.some((c) => m.chave.includes(c))
const ehTransferencia = (m: MovimentoExtrato) =>
  m.chave.startsWith('TRF') || m.chave.includes('MB WAY')

/**
 * Classifica cada movimento e anexa as comissões à compra que as gerou.
 *
 * Precedência: comissão primeiro (uma regra larga de mais não pode transformar
 * um imposto do selo numa despesa solta), depois a regra aprendida, depois a
 * deteção de transferência, e por fim o sinal decide entre despesa e rendimento.
 */
export function classificar(
  movimentos: MovimentoExtrato[],
  regras: Regra[],
): MovimentoClassificado[] {
  const resultado: MovimentoClassificado[] = []

  for (const m of movimentos) {
    if (ehComissao(m)) {
      // Procura a compra-mãe: o último movimento não-comissão do mesmo dia.
      const mae = [...resultado].reverse().find((r) => r.movimento.data === m.data)
      if (mae) {
        mae.comissoes.push({ ...m, paiId: mae.movimento.id })
        continue
      }
      resultado.push({ movimento: m, tipo: 'comissao', comissoes: [] })
      continue
    }

    const regra = regras.find((r) => r.padrao !== '' && m.chave.includes(r.padrao))
    if (regra) {
      resultado.push({
        movimento: m,
        tipo: regra.tipo,
        categoriaSugerida: regra.categoriaId,
        comissoes: [],
      })
      continue
    }

    const tipo: TipoMovimento = ehTransferencia(m)
      ? 'transferencia'
      : m.sinal === 'debito'
        ? 'despesa'
        : 'rendimento'
    resultado.push({ movimento: m, tipo, comissoes: [] })
  }

  return resultado
}
```

- [ ] **Step 4: Correr e confirmar que passa**

Run: `npm test -- classificar`
Expected: PASS (8 testes)

- [ ] **Step 5: Commit**

```bash
git add src/lib/extrato/classificar.ts src/lib/extrato/classificar.test.ts
git commit -m "Classificação dos movimentos do extrato"
```

---

### Task 5: Cruzamento com os registos da app

**Files:**
- Create: `src/lib/extrato/cruzar.ts`
- Test: `src/lib/extrato/cruzar.test.ts`

**Interfaces:**
- Consumes: `MovimentoClassificado` de `./classificar`; `Despesa`, `Aporte` de `../../types`
- Produces: `cruzar(classificados: MovimentoClassificado[], registos: RegistoApp[]): Cruzamento`, onde

```ts
/** Um registo já existente na app, despesa ou aporte, reduzido ao que o cruzamento precisa. */
export interface RegistoApp {
  id: string
  data: string
  valor: number
  origem: 'despesa' | 'aporte'
}

export interface Cruzamento {
  conferidos: { movimento: MovimentoClassificado; registoId: string }[]
  emFalta: MovimentoClassificado[]
  soNaApp: RegistoApp[]
  ambiguos: { movimento: MovimentoClassificado; candidatos: RegistoApp[] }[]
}
```

- [ ] **Step 1: Escrever os testes a falhar**

Create `src/lib/extrato/cruzar.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { MovimentoExtrato } from '../../types'
import type { MovimentoClassificado } from './classificar'
import { cruzar, type RegistoApp } from './cruzar'

const classificado = (data: string, valor: number, id = `${data}-${valor}`): MovimentoClassificado => ({
  movimento: {
    id,
    data,
    dataValor: data,
    descritivo: 'ALGO',
    chave: 'ALGO',
    valor,
    sinal: 'debito',
    saldo: 0,
  } as MovimentoExtrato,
  tipo: 'despesa',
  comissoes: [],
})

const registo = (id: string, data: string, valor: number): RegistoApp => ({
  id,
  data,
  valor,
  origem: 'despesa',
})

describe('cruzar', () => {
  it('confere quando valor e data batem certo', () => {
    const r = cruzar([classificado('2026-08-03', 32.18)], [registo('d1', '2026-08-03', 32.18)])
    expect(r.conferidos).toHaveLength(1)
    expect(r.conferidos[0].registoId).toBe('d1')
    expect(r.emFalta).toEqual([])
    expect(r.soNaApp).toEqual([])
  })

  it('confere dentro da janela de três dias', () => {
    const r = cruzar([classificado('2026-08-06', 10)], [registo('d1', '2026-08-03', 10)])
    expect(r.conferidos).toHaveLength(1)
  })

  it('não confere fora da janela', () => {
    const r = cruzar([classificado('2026-08-08', 10)], [registo('d1', '2026-08-03', 10)])
    expect(r.emFalta).toHaveLength(1)
    expect(r.soNaApp).toHaveLength(1)
  })

  it('não confere valores diferentes', () => {
    const r = cruzar([classificado('2026-08-03', 10)], [registo('d1', '2026-08-03', 10.5)])
    expect(r.emFalta).toHaveLength(1)
  })

  it('põe em falta o que está no extrato e não na app', () => {
    const r = cruzar([classificado('2026-08-03', 32.18)], [])
    expect(r.emFalta).toHaveLength(1)
  })

  it('assinala o que está na app e não no extrato', () => {
    const r = cruzar([], [registo('d1', '2026-08-03', 5)])
    expect(r.soNaApp).toHaveLength(1)
  })

  it('não usa o mesmo registo duas vezes', () => {
    const r = cruzar(
      [classificado('2026-08-03', 10, 'a'), classificado('2026-08-03', 10, 'b')],
      [registo('d1', '2026-08-03', 10)],
    )
    expect(r.conferidos).toHaveLength(1)
    expect(r.emFalta).toHaveLength(1)
  })

  it('manda para ambíguo quando há empate de distância', () => {
    // Dois candidatos a um dia de distância, um para cada lado.
    const r = cruzar(
      [classificado('2026-08-04', 10)],
      [registo('d1', '2026-08-03', 10), registo('d2', '2026-08-05', 10)],
    )
    expect(r.ambiguos).toHaveLength(1)
    expect(r.ambiguos[0].candidatos.map((c) => c.id).sort()).toEqual(['d1', 'd2'])
    expect(r.conferidos).toEqual([])
  })

  it('prefere o candidato mais próximo quando não há empate', () => {
    const r = cruzar(
      [classificado('2026-08-04', 10)],
      [registo('d1', '2026-08-03', 10), registo('d2', '2026-08-07', 10)],
    )
    expect(r.conferidos).toHaveLength(1)
    expect(r.conferidos[0].registoId).toBe('d1')
  })

  it('é idempotente: reimportar não duplica', () => {
    // Depois de escrever, o registo existe; o mesmo extrato volta a conferir.
    const movimentos = [classificado('2026-08-03', 32.18)]
    const r = cruzar(movimentos, [registo('d1', '2026-08-03', 32.18)])
    expect(r.emFalta).toEqual([])
    expect(r.conferidos).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Correr e confirmar que falha**

Run: `npm test -- cruzar`
Expected: FAIL — módulo não encontrado.

- [ ] **Step 3: Implementar**

Create `src/lib/extrato/cruzar.ts`:

```ts
import type { MovimentoClassificado } from './classificar'

/** Um registo já existente na app, reduzido ao que o cruzamento precisa. */
export interface RegistoApp {
  id: string
  data: string
  valor: number
  origem: 'despesa' | 'aporte'
}

export interface Cruzamento {
  conferidos: { movimento: MovimentoClassificado; registoId: string }[]
  emFalta: MovimentoClassificado[]
  soNaApp: RegistoApp[]
  ambiguos: { movimento: MovimentoClassificado; candidatos: RegistoApp[] }[]
}

const TOLERANCIA = 0.005
/** A data de lançamento pode vir depois da compra, por isso não se exige igualdade. */
const JANELA_DIAS = 3

const diasEntre = (a: string, b: string) =>
  Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000

/**
 * Cruza o extrato com o que já está registado. Cada registo da app só pode
 * corresponder a um movimento e vice-versa. Em caso de empate de distância, o
 * movimento vai para "ambíguo" em vez de se escolher um candidato à sorte.
 */
export function cruzar(
  classificados: MovimentoClassificado[],
  registos: RegistoApp[],
): Cruzamento {
  const porUsar = new Set(registos.map((r) => r.id));
  const cruzamento: Cruzamento = { conferidos: [], emFalta: [], soNaApp: [], ambiguos: [] }

  for (const c of classificados) {
    const candidatos = registos
      .filter((r) => porUsar.has(r.id))
      .filter((r) => Math.abs(r.valor - c.movimento.valor) < TOLERANCIA)
      .filter((r) => diasEntre(r.data, c.movimento.data) <= JANELA_DIAS)
      .sort((a, b) => diasEntre(a.data, c.movimento.data) - diasEntre(b.data, c.movimento.data))

    if (candidatos.length === 0) {
      cruzamento.emFalta.push(c)
      continue
    }

    const maisPerto = diasEntre(candidatos[0].data, c.movimento.data)
    const empatados = candidatos.filter(
      (r) => diasEntre(r.data, c.movimento.data) === maisPerto,
    )

    if (empatados.length > 1) {
      cruzamento.ambiguos.push({ movimento: c, candidatos: empatados })
      for (const e of empatados) porUsar.delete(e.id)
      continue
    }

    cruzamento.conferidos.push({ movimento: c, registoId: candidatos[0].id })
    porUsar.delete(candidatos[0].id)
  }

  cruzamento.soNaApp = registos.filter((r) => porUsar.has(r.id))
  return cruzamento
}
```

- [ ] **Step 4: Correr e confirmar que passa**

Run: `npm test -- cruzar`
Expected: PASS (10 testes)

- [ ] **Step 5: Correr a bateria toda**

Run: `npm test`
Expected: PASS em todos os ficheiros.

- [ ] **Step 6: Commit**

```bash
git add src/lib/extrato/cruzar.ts src/lib/extrato/cruzar.test.ts
git commit -m "Cruzamento do extrato com os registos da app"
```

---

### Task 6: Leitura do PDF

**Files:**
- Create: `src/lib/extrato/ler.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `pdfjs-dist` (importada dinamicamente)
- Produces: `lerPdf(ficheiro: File): Promise<string[]>` — linhas de texto, pela ordem em que aparecem

Esta tarefa não tem teste automatizado: depende de um binário e da `pdfjs-dist`. É verificada à mão no passo 5, com um extrato real.

- [ ] **Step 1: Instalar a pdfjs-dist**

```bash
npm install pdfjs-dist@^5
```

- [ ] **Step 2: Implementar**

Create `src/lib/extrato/ler.ts`:

```ts
/**
 * Extrai as linhas de texto de um PDF, no dispositivo.
 *
 * A `pdfjs-dist` pesa cerca de 1 MB contra os 74 KB da app, por isso é
 * importada só aqui dentro, quando o utilizador importa de facto. Fica
 * empacotada connosco e nunca é servida de um CDN: a app tem de continuar a
 * funcionar offline e sem depender de terceiros.
 */
export async function lerPdf(ficheiro: File): Promise<string[]> {
  const pdfjs = await import('pdfjs-dist')
  const worker = await import('pdfjs-dist/build/pdf.worker.mjs?url')
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default

  const dados = await ficheiro.arrayBuffer()
  const documento = await pdfjs.getDocument({ data: dados }).promise

  const linhas: string[] = []
  for (let n = 1; n <= documento.numPages; n++) {
    const pagina = await documento.getPage(n)
    const conteudo = await pagina.getTextContent()

    // Os itens vêm soltos, com posição. Agrupam-se por linha pela coordenada
    // vertical: itens cuja diferença de altura é inferior a 2 pontos pertencem
    // à mesma linha, e ordenam-se da esquerda para a direita.
    const porAltura = new Map<number, { x: number; texto: string }[]>()
    for (const item of conteudo.items) {
      if (!('str' in item) || item.str.trim() === '') continue
      const y = Math.round(item.transform[5] / 2) * 2
      const grupo = porAltura.get(y) ?? []
      grupo.push({ x: item.transform[4], texto: item.str })
      porAltura.set(y, grupo)
    }

    const alturas = [...porAltura.keys()].sort((a, b) => b - a)
    for (const y of alturas) {
      const grupo = porAltura.get(y)!.sort((a, b) => a.x - b.x)
      linhas.push(grupo.map((g) => g.texto).join(' ').replace(/\s+/g, ' ').trim())
    }
  }

  if (linhas.length === 0) {
    throw new Error(
      'Não consegui extrair texto deste PDF. Se for uma imagem digitalizada, não há nada a ler.',
    )
  }

  return linhas
}
```

- [ ] **Step 3: Confirmar que compila**

Run: `npm run build`
Expected: compila sem erros.

- [ ] **Step 4: Confirmar que a pdfjs não entrou no pacote inicial**

Run: `npm run build`
Expected: a saída do Vite mostra um pedaço separado para a `pdfjs`, e o `index-*.js` principal mantém-se na ordem dos 75 KB comprimidos. Se o principal tiver crescido centenas de KB, a importação dinâmica não funcionou — verificar que não há nenhum `import` estático de `pdfjs-dist` no topo do ficheiro.

- [ ] **Step 5: Verificar à mão com um extrato real**

Arrancar a app (`npm run dev`), abrir a consola do browser e correr, com um PDF real escolhido num `<input type="file">`:

```js
const { lerPdf } = await import('/src/lib/extrato/ler.ts')
const linhas = await lerPdf(ficheiro)
console.log(linhas.slice(0, 10))
```

Expected: as primeiras linhas incluem `EXTRATO DE ...`, `SALDO INICIAL ...` e linhas de movimento com a forma `8.03 8.03 COMPRA 1998 ... 9.90 1 948.77`.

Se a ordem das colunas sair trocada, ajustar o agrupamento por altura (o valor `2` na tolerância) antes de seguir.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/lib/extrato/ler.ts
git commit -m "Leitura do PDF do extrato no dispositivo"
```

---

### Task 7: Fila de triagem

**Files:**
- Create: `src/componentes/Conferencia.tsx`
- Modify: `src/componentes/Rumo.tsx`

**Interfaces:**
- Consumes: `lerPdf`, `analisarExtrato`, `classificar`, `cruzar`, `RegistoApp`
- Produces: componente `<Conferencia orcamento aoMudar aoFechar />`

- [ ] **Step 1: Criar o componente com o passo do resumo**

Create `src/componentes/Conferencia.tsx`:

```tsx
import { useState } from 'react'
import type { Orcamento } from '../types'
import { lerPdf } from '../lib/extrato/ler'
import { analisarExtrato, type ResultadoAnalise } from '../lib/extrato/analisar'
import { classificar } from '../lib/extrato/classificar'
import { cruzar, type Cruzamento, type RegistoApp } from '../lib/extrato/cruzar'
import { eur } from '../lib/formato'

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

export function Conferencia({ orcamento, aoFechar }: Props) {
  const [erro, setErro] = useState<string | null>(null)
  const [analise, setAnalise] = useState<ResultadoAnalise | null>(null)
  const [cruzamento, setCruzamento] = useState<Cruzamento | null>(null)

  const importar = async (ficheiro: File) => {
    setErro(null)
    try {
      const linhas = await lerPdf(ficheiro)
      const r = analisarExtrato(linhas)
      const classificados = classificar(r.movimentos, orcamento.regras)
      setAnalise(r)
      setCruzamento(cruzar(classificados, registosDa(orcamento)))
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não consegui ler o extrato.')
      setAnalise(null)
      setCruzamento(null)
    }
  }

  return (
    <section className="cartao">
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
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void importar(f)
              e.target.value = ''
            }}
          />
          <p className="rodape" style={{ marginTop: 12 }}>
            O PDF é lido no teu telemóvel e não é guardado nem enviado.
          </p>
        </>
      )}

      {erro && (
        <p className="deriva deriva--sobe" style={{ marginTop: 12 }}>
          <span aria-hidden="true">▲ </span>
          {erro}
        </p>
      )}

      {cruzamento && analise && (
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
          <div>
            <dt>Ambíguos</dt>
            <dd>{cruzamento.ambiguos.length}</dd>
          </div>
          <div>
            <dt>Saldo final</dt>
            <dd>{eur(analise.saldoFinal)}</dd>
          </div>
        </dl>
      )}
    </section>
  )
}
```

- [ ] **Step 2: Ligar o botão no Rumo**

Modify `src/componentes/Rumo.tsx`. Acrescentar ao topo dos imports:

```tsx
import { Conferencia } from './Conferencia'
```

Acrescentar ao bloco de estado, depois de `const [dataSaldo, setDataSaldo] = useState(hojeISO())`:

```tsx
  const [aConferir, setAConferir] = useState(false)
```

Dentro da secção `Fecho do mês`, imediatamente a seguir a `<h2>Fecho do mês</h2>`:

```tsx
        {aConferir ? (
          <Conferencia
            orcamento={orcamento}
            aoMudar={aoMudar}
            aoFechar={() => setAConferir(false)}
          />
        ) : (
          <button
            type="button"
            className="botao"
            style={{ marginBottom: 16 }}
            onClick={() => setAConferir(true)}
          >
            Conferir extrato
          </button>
        )}
```

- [ ] **Step 3: Confirmar que compila e que o botão aparece**

Run: `npm run build`
Expected: compila sem erros.

Depois, com `npm run dev`, abrir o Rumo e confirmar que o botão **Conferir extrato** aparece dentro do Fecho do mês, e que ao carregar mostra o seletor de ficheiro.

- [ ] **Step 4: Verificar com um extrato real**

Importar um PDF real e confirmar que o resumo aparece com números plausíveis: a soma de conferidos, em falta e ambíguos tem de ser igual ao número de movimentos do extrato.

Importar o mesmo PDF uma segunda vez e confirmar que os números não mudam — é a verificação de idempotência no uso real.

- [ ] **Step 5: Commit**

```bash
git add src/componentes/Conferencia.tsx src/componentes/Rumo.tsx
git commit -m "Fila de triagem: importação, resumo e cruzamento"
```

---

### Task 8: Decisões, escrita e saldo da fotografia

**Files:**
- Modify: `src/componentes/Conferencia.tsx`

**Interfaces:**
- Consumes: tudo o que a Task 7 produziu
- Produces: escrita das decisões em `despesas`, `aportes`, `regras`, `linhasIgnoradas`, `saldos`

- [ ] **Step 1: Acrescentar o estado das decisões**

Modify `src/componentes/Conferencia.tsx`. Primeiro, passar a desestruturar
`aoMudar`, que a Task 7 deixou de fora por ainda não o usar:

```tsx
export function Conferencia({ orcamento, aoMudar, aoFechar }: Props) {
```

Depois acrescentar o tipo e o estado:

```tsx
/** O que o utilizador decidiu para cada movimento em falta. */
type Decisao =
  | { tipo: 'despesa'; categoriaId: string; guardarRegra: boolean }
  | { tipo: 'aporte' }
  | { tipo: 'rendimento' }
  | { tipo: 'ignorar' }

const [decisoes, setDecisoes] = useState<Record<string, Decisao>>({})
```

- [ ] **Step 2: Acrescentar a fila, uma decisão de cada vez**

Acrescentar, a seguir ao bloco do resumo:

```tsx
      {cruzamento && cruzamento.emFalta.length > 0 && (
        <ul className="lista-despesas" style={{ marginTop: 16 }}>
          {cruzamento.emFalta.map((c) => {
            const d = decisoes[c.movimento.id]
            const totalComComissoes =
              c.movimento.valor + c.comissoes.reduce((s, x) => s + x.valor, 0)
            return (
              <li key={c.movimento.id}>
                <span className="lista-principal">
                  <span className="lista-nome">{c.movimento.chave}</span>
                  {c.comissoes.length > 0 && (
                    <span className="lista-nota">
                      mais {eur(totalComComissoes - c.movimento.valor)} de comissões
                    </span>
                  )}
                </span>
                <span className="lista-data">{c.movimento.data.slice(8)}/{c.movimento.data.slice(5, 7)}</span>
                <span className="lista-valor">{eur(c.movimento.valor)}</span>
                <select
                  aria-label={`Categoria de ${c.movimento.chave}`}
                  value={d?.tipo === 'despesa' ? d.categoriaId : ''}
                  onChange={(e) =>
                    setDecisoes((anterior) => ({
                      ...anterior,
                      [c.movimento.id]: e.target.value
                        ? { tipo: 'despesa', categoriaId: e.target.value, guardarRegra: true }
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
              </li>
            )
          })}
        </ul>
      )}
```

- [ ] **Step 3: Acrescentar a confirmação que escreve**

Acrescentar, a seguir à fila:

```tsx
      {cruzamento && cruzamento.emFalta.length > 0 && (
        <button
          type="button"
          className="botao botao--primario"
          style={{ marginTop: 16 }}
          onClick={() => {
            const despesasNovas: Despesa[] = []
            const regrasNovas = [...orcamento.regras]
            const ignoradas = [...orcamento.linhasIgnoradas]

            for (const c of cruzamento.emFalta) {
              const d = decisoes[c.movimento.id] ?? { tipo: 'ignorar' as const }
              if (d.tipo === 'ignorar') {
                ignoradas.push(c.movimento.id)
                continue
              }
              if (d.tipo === 'despesa') {
                // A compra e as suas comissões ficam registos separados, na
                // mesma categoria, para os totais não mentirem.
                for (const parte of [c.movimento, ...c.comissoes]) {
                  despesasNovas.push({
                    id: novoId(),
                    data: parte.data,
                    valor: parte.valor,
                    categoriaId: d.categoriaId,
                    nota: parte.chave,
                  })
                }
                if (d.guardarRegra && !regrasNovas.some((r) => r.padrao === c.movimento.chave)) {
                  regrasNovas.push({
                    id: novoId(),
                    padrao: c.movimento.chave,
                    tipo: 'despesa',
                    categoriaId: d.categoriaId,
                  })
                }
              }
            }

            aoMudar({
              despesas: [...orcamento.despesas, ...despesasNovas],
              regras: regrasNovas,
              linhasIgnoradas: ignoradas,
            })
            aoFechar()
          }}
        >
          Escrever {Object.values(decisoes).filter((d) => d.tipo === 'despesa').length} despesas
        </button>
      )}
```

Acrescentar `novoId` aos imports:

```tsx
import { novoId } from '../lib/armazenamento'
```

E o tipo `Despesa` ao import de tipos já existente no ficheiro:

```tsx
import type { Despesa, Orcamento } from '../types'
```

- [ ] **Step 4: Oferecer o saldo final como liquidez**

Acrescentar, a seguir ao botão de escrita:

```tsx
      {analise && (
        <p className="rodape" style={{ marginTop: 12 }}>
          O saldo final do extrato é {eur(analise.saldoFinal)}. Usa-o como liquidez na
          fotografia deste mês, no formulário acima.
        </p>
      )}
```

- [ ] **Step 5: Confirmar que compila**

Run: `npm run build`
Expected: compila sem erros.

- [ ] **Step 6: Verificar o ciclo completo com um extrato real**

Com `npm run dev`:
1. Importar o extrato, categorizar duas ou três linhas, deixar as outras em Ignorar.
2. Carregar em Escrever e confirmar que as despesas aparecem no ecrã Mês, com os valores e as datas certas.
3. Confirmar que uma compra com comissões gerou registos separados na mesma categoria.
4. **Reimportar o mesmo extrato** e confirmar que as linhas escritas aparecem agora em "conferidos" e as ignoradas não voltam a aparecer.
5. Confirmar que um descritivo já categorizado vem com a categoria pré-selecionada.

- [ ] **Step 7: Correr a bateria toda e o build**

Run: `npm test && npm run build`
Expected: PASS e compilação limpa.

- [ ] **Step 8: Commit**

```bash
git add src/componentes/Conferencia.tsx
git commit -m "Decisões da triagem, escrita e regras aprendidas"
```
