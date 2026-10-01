# Leitor de extratos do ActivoBank

Data: 2026-10-01

## Objetivo

Dar ao utilizador certeza sobre os dados que já introduziu, cruzando o extrato
bancário com o que está registado na app. O extrato é a fonte da verdade sobre
**o que aconteceu**; a app continua a ser dona do **significado** (a categoria).

A app nunca escreve nada sem aprovação explícita. O trabalho que automatiza é
encontrar as diferenças, não decidir o que elas são.

## Âmbito

**Dentro:**

- Leitura do PDF de extrato do ActivoBank, inteiramente no dispositivo.
- Validação da leitura pelo encadeamento dos saldos.
- Classificação de cada movimento (despesa, comissão, transferência, rendimento).
- Cruzamento com as despesas e os aportes já registados.
- Fila de triagem para o que falta ou é ambíguo.
- Regras aprendidas (descritivo → categoria), como sugestão.
- Oferta do saldo final como liquidez da fotografia do mês.

**Fora:**

- Extratos de cartão de crédito (o utilizador não tem cartão de crédito).
- Outros bancos. O leitor é específico do formato do ActivoBank.
- OCR. Um PDF digitalizado é recusado, não interpretado.
- Escrita automática sem passar pela triagem.
- Ligação a Open Banking ou a qualquer serviço externo.

## Formato de origem

Estrutura confirmada a partir de um extrato real (agosto de 2026):

```
EXTRATO DE 2026/08/03 A 2026/08/31

DATA  DATA
LANC. VALOR  DESCRITIVO                      DEBITO   CREDITO    SALDO
                   SALDO INICIAL                              1 958.67
8.03  8.03   COMPRA 1998 MCDONALDS MT5 BRAGA   9.90            1 948.77
8.04  8.04   TRF. P/O LUANA RODRIGUES SANTOS            60.00  1 933.66
8.06  8.06   CUSTO DE SERVICO INTERNACIONAL    0.85            1 900.67
```

Propriedades que o leitor tem de respeitar:

| Propriedade | Valor |
|---|---|
| Datas nas linhas | `M.DD` — `8.03` é 3 de agosto, **não** 8 de março |
| Ano | Ausente nas linhas; vem do cabeçalho `EXTRATO DE ... A ...` |
| Separador de milhares | Espaço (incluindo espaço inseparável, U+00A0) |
| Separador decimal | Ponto |
| Sinal | Dado pela coluna (DEBITO/CREDITO), que se perde em texto corrido |
| Primeira linha | `SALDO INICIAL` — não é movimento, mas é o ponto de partida |
| Prefixo de compras | `COMPRA <4 dígitos>` — número do cartão, ruído a remover |

### O encadeamento do saldo resolve o sinal

Em texto extraído, uma linha de débito e uma de crédito são indistinguíveis:
ambas ficam com dois números no fim. A coluna de origem perde-se.

O saldo resolve isso sem precisar de coordenadas:

- se `saldoAnterior − valor ≈ saldoLinha` → **débito**
- se `saldoAnterior + valor ≈ saldoLinha` → **crédito**
- se nenhuma bater → a linha foi mal lida; abortar

Tolerância de comparação: 0,005 € (metade do cêntimo).

Esta é a decisão central do desenho. Permite ler o extrato por texto e expressão
regular em vez de por posições horizontais, o que o torna imune a deslocamentos
de coluna, e dá uma verificação de integridade completa de graça.

## Arquitetura

Quatro funções puras e um componente de interface. As funções puras não conhecem
React nem armazenamento, e são testáveis isoladamente.

```
src/lib/extrato/ler.ts           PDF → linhas de texto
src/lib/extrato/analisar.ts      linhas → movimentos + validação
src/lib/extrato/classificar.ts   movimento → tipo + regra aplicável
src/lib/extrato/cruzar.ts        movimentos × registos da app → grupos
src/componentes/Conferencia.tsx  fluxo de triagem
```

`pdf.js` é importada dinamicamente, só quando o utilizador importa, e empacotada
com a app — nunca servida de um CDN, para a app continuar a funcionar offline e
sem depender de terceiros.

## Modelo de dados

```ts
/** Um movimento lido do extrato. Nunca é persistido; vive só durante a triagem. */
interface MovimentoExtrato {
  /**
   * Impressão digital estável, para a linha ser reconhecível entre importações:
   * `data | valor | chave | ocorrência`. A ocorrência é o índice da linha entre
   * as que partilham os outros três campos — sem ela, duas compras iguais no
   * mesmo dia e no mesmo sítio colidiriam e seriam tratadas como uma só.
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

/** Regra aprendida: aplica-se a todos os movimentos com este padrão. */
interface Regra {
  id: string
  /** Substring do descritivo normalizado, ex. "PINGO DOCE". */
  padrao: string
  tipo: 'despesa' | 'rendimento' | 'aporte' | 'ignorar'
  /** Obrigatório quando tipo === 'despesa'. */
  categoriaId?: string
}
```

Acrescenta-se ao `Orcamento`:

```ts
regras: Regra[]
/**
 * Impressões digitais de linhas concretas mandadas ignorar. Distingue-se de uma
 * `Regra` com tipo 'ignorar': a regra silencia todos os movimentos com aquele
 * descritivo, esta lista silencia apenas aquela linha daquele dia.
 */
linhasIgnoradas: string[]
```

Ambos entram na migração com `[]` por omissão, como os campos anteriores.

## Leitura e validação

1. Extrair os itens de texto de cada página com `pdf.js`.
2. Agrupar por posição vertical, com tolerância, para reconstruir linhas.
3. Encontrar `EXTRATO DE <data> A <data>` → período e ano de referência.
4. Encontrar `SALDO INICIAL` → saldo de partida.
5. Para cada linha seguinte, aplicar a expressão regular:
   `^(\d{1,2}\.\d{2})\s+(\d{1,2}\.\d{2})\s+(.+?)\s+([\d\s ]+\.\d{2})\s+([\d\s ]+\.\d{2})$`
6. Normalizar os números: remover espaços (normais e inseparáveis), interpretar
   o ponto como decimal.
7. Resolver o ano: o mês da linha é comparado com os meses do período. Num
   extrato que atravesse a passagem de ano, meses maiores que o mês final
   pertencem ao ano inicial.
8. Determinar o sinal pelo encadeamento, como descrito acima.
9. Verificação final: `saldoInicial + Σ(créditos) − Σ(débitos)` tem de ser igual
   ao saldo da última linha, dentro da tolerância.

Linhas que não correspondam à expressão regular e não sejam cabeçalho, rodapé ou
`SALDO INICIAL` fazem abortar a leitura, nomeando a linha.

## Classificação

Por ordem de precedência:

1. **Comissão** — descritivo contém `IMPOSTO DO SELO`, `CUSTO DE SERVICO
   INTERNACIONAL` ou `COMISSAO`. Anexada, via `paiId`, ao movimento não-comissão
   imediatamente anterior na mesma data. Sem candidato, fica autónoma.
2. **Regra aprendida** — o `padrao` de alguma regra é substring da `chave`.
3. **Transferência** — descritivo começa por `TRF` ou contém `MB WAY`.
4. **Despesa** ou **Rendimento** — tudo o resto, decidido pelo sinal: débito é
   despesa, crédito é rendimento. Não são dois passos, são o caso por omissão.

Normalização da `chave`: remover o prefixo `COMPRA <4 dígitos>`, passar a
maiúsculas, colapsar espaços repetidos.

## Cruzamento

Cada movimento é comparado com as despesas e os aportes já registados:

- valor exatamente igual;
- data dentro de uma janela de ±3 dias, porque a data de lançamento pode ser
  posterior à da compra.

Quatro grupos:

| Grupo | Significado | O que o utilizador faz |
|---|---|---|
| Conferido | Um movimento ↔ um registo | Nada; não lhe é mostrado |
| Em falta | No extrato, não na app | Categoriza na fila |
| Só na app | Na app, não no extrato | Confirma que é dinheiro vivo, ou corrige |
| Ambíguo | Mais que um candidato na janela | Escolhe qual corresponde |

Um registo da app só pode corresponder a um movimento, e vice-versa. O
emparelhamento percorre os candidatos por diferença de datas crescente. **Em caso
de empate — dois candidatos à mesma distância — o movimento vai para "ambíguo"**
em vez de se escolher um arbitrariamente.

Reimportar o mesmo extrato não duplica nada: tudo volta a corresponder e cai em
"conferido".

## Interface

Entrada: botão **Conferir extrato** dentro do *Fecho do mês*, no ecrã Rumo. Não
é uma aba nova.

Fluxo de ecrã inteiro, em três passos:

1. **Resumo** — "38 movimentos: 24 conferidos, 11 em falta, 3 só na app".
2. **Fila** — uma decisão de cada vez. Cada cartão mostra data, descritivo
   limpo, valor, as comissões anexadas quando existem, e a categoria sugerida
   pela regra quando há. Ações: categorizar, marcar como aporte, marcar como
   rendimento, ignorar. Ao categorizar, a app oferece guardar a regra.
3. **Confirmação** — lista de tudo o que vai ser escrito, com um único botão.
   Antes disto, nada foi gravado.

Sair a meio preserva as decisões já tomadas.

No fim, o saldo final do extrato é oferecido como liquidez da fotografia do mês,
a aceitar ou recusar.

## Erros

Todos recusam a importação inteira e explicam porquê; nenhum grava nada parcial.

| Situação | Mensagem |
|---|---|
| Texto não extraível | O PDF é uma imagem digitalizada e não pode ser lido |
| Sem `SALDO INICIAL` | Não parece um extrato do ActivoBank |
| Encadeamento falha | Indica a linha onde a leitura se perdeu |
| Verificação final falha | Indica a diferença entre o esperado e o lido |

## Privacidade

O PDF é lido no dispositivo e nunca é guardado nem enviado. Do ficheiro não fica
nada: só o que o utilizador decidir na triagem — os registos criados, as regras
guardadas e as impressões digitais das linhas ignoradas.

## Testes

Primeiros testes automatizados do projeto. Cobrem as funções puras:

- **analisar**: datas `M.DD`, resolução do ano, passagem de ano, números com
  espaço inseparável, sinal por encadeamento, deteção de linha mal lida,
  verificação final.
- **classificar**: precedência das regras, anexação de comissões, normalização
  da chave.
- **cruzar**: os quatro grupos, janela de ±3 dias, emparelhamento um-para-um,
  idempotência na reimportação.

Fixture: extrato sintético com a estrutura real documentada acima e valores
inventados. Nenhum dado financeiro real entra no repositório.

A leitura do PDF em si (`ler.ts`) não é testada automaticamente — depende da
`pdf.js` e de um ficheiro binário — e é verificada à mão com um extrato real.

## Riscos conhecidos

**O ActivoBank pode mudar o desenho do PDF.** Mitigado, não eliminado: a
validação pelo saldo garante que uma mudança de estrutura provoca uma recusa
clara em vez de dados errados em silêncio.

**A janela de ±3 dias pode emparelhar mal** duas despesas do mesmo valor em dias
próximos. Mitigado pelo grupo "ambíguo", que pergunta em vez de adivinhar.

**O peso da `pdf.js`** (cerca de 1 MB, contra 74 KB da app) é carregado só na
importação, mas aumenta o tamanho total do que fica em cache offline.
