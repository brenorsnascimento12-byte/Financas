# Finanças

PWA offline-first para gerir finanças pessoais e investimentos. Os dados ficam no
dispositivo (localStorage) — nada é enviado para servidor nenhum.

**Fase 1 (atual): controlo de gasto mensal.** Registo rápido de despesas, repartição por
percentagens com envelope de não essenciais a transitar de mês para mês, taxa de poupança
como métrica de topo, e revisão obrigatória dos rácios sempre que o rendimento muda.

O simulador de carreira foi removido: projetava décadas em cima de pressupostos que não são
fixáveis e não respondia a nenhuma decisão real.

## Correr

```bash
npm install
npm run dev
```

## Comandos

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | Build de produção + service worker |
| `npm run preview` | Serve o build localmente |
| `node scripts/gerar-icones.mjs` | Regenera os PNG do manifesto a partir dos SVG em `public/` |

## Estrutura

```
src/
  types.ts                      modelo de dados
  lib/orcamento.ts              agregação mensal e potes de excedente
  lib/formato.ts                formatação pt-PT
  lib/armazenamento.ts          persistência local + exportação JSON
  componentes/
    Mes.tsx                     registo rápido e medidores do mês
    GastosPorFatia.tsx          gastos agrupados por secção e categoria, editáveis
    Excedentes.tsx              potes por fatia, decisões de saída e origem
    Patrimonio.tsx              fotografias, transferência mensal e lista de aportes
    GraficoPatrimonio.tsx       património vs aportado, em escala temporal
    Historico.tsx               taxa de poupança por mês, deriva e tabela
    Definicoes.tsx              rendimento, rácios, categorias, objetivos
    Medidor.tsx                 barra contra o limite do mês, em texto factual
    Campo.tsx                   entrada numérica protegida contra a roda do rato
  estilos/tokens.css            paleta (validada para daltonismo em claro e escuro)
  estilos/app.css               layout
```

## Tetos, piso e potes

O 50/30/20 não é uma partição. **50 e 30 são tetos** que se quer não atingir, **20 é um
piso**. Tudo o que fica entre o piso e os tetos é excedente.

**A página do mês é puramente mensal.** Os tetos são daquele mês e não transitam; não há
qualquer cálculo cruzado entre meses, para as percentagens serem comparáveis. Passar um
teto aparece em texto factual e tinta neutra — "passou o teto em 200 €" — sem cor de
alarme, porque o julgamento pertence à página dos excedentes.

**Os potes** acumulam o excedente de cada fatia, só de meses já fechados. Um mês acima do
teto entra negativo e faz o pote descer sozinho — é isso que dispensa registar despesas
como decisões e evita dupla contagem.

**As decisões são só saídas** (para investimento ou liquidez). Uma viagem não se regista
como decisão: entra como despesa normal e consome o pote pela via do mês em excesso.

O número principal da página é o **por decidir**, deliberadamente grande: dinheiro sem
destino atribuído tende a ser gasto por omissão.

## Poupança é o que sai, não o que sobra

A poupança do mês são os **aportes registados** — dinheiro efetivamente transferido para
investimento ou liquidez. Não é `rendimento − gastos`: isso é apenas dinheiro que ainda
está na conta, e com essa fórmula o início de cada mês mostrava o salário quase todo como
"poupado".

Há duas origens, ambas guardadas como `Aporte`: a transferência mensal (`fonte: 'planeado'`,
registada em Património) e as saídas dos potes (`fonte: 'essencial' | 'naoEssencial'`,
registadas em Excedentes).

## Património

Fotografias manuais do total investido e em liquidez, tiradas da corretora e do banco. **Não
se atualiza sozinho** — vencimento a entrar, despesas, transferências: nada disso mexe no
valor mostrado, só uma fotografia nova. A diferença entre o património e o acumulado
aportado é o que o mercado deu ou tirou — é isso que o gráfico mostra, com as duas linhas e
a banda entre elas.

Desde o dia 1 do mês até à primeira fotografia desse mês, aparece um aviso e uma pastilha na
aba — mesmo mecanismo do aviso de revisão de rácios.

## Como se usa o acumulado

Não há transferência a fazer: o teto é uma regra, não uma carteira, e está tudo na mesma
conta. Para usar o que sobrou, passa-se o teto desse mês — a página do mês regista o facto
e o pote desce sozinho quando o mês fecha.

Como o pote só atualiza no fecho do mês, cada cartão mostra também o valor projetado com o
mês em curso incluído, para responder a "posso gastar isto já?" antes de gastar.

## Cópias e a armadilha das origens

O armazenamento local está preso à origem do endereço. Passar da rede local para o endereço
definitivo **não leva os dados**, e limpar os dados de navegação apaga-os. Exportar e
Importar, em Definições, existem para isso.

## Não é aconselhamento de investimento

A app mede e organiza. As decisões de alocação são do utilizador.

## Publicar

Automático via `.github/workflows/deploy.yml`: cada push para `main` builda e publica em
GitHub Pages. `VITE_BASE` é descoberto sozinho pelo `actions/configure-pages` — não é fixo
no código, por isso funciona seja qual for o nome dado ao repositório.

**Configuração única, do lado do GitHub** (não precisa de repetir a cada push):
1. Criar o repositório no GitHub e enviar este código para ele.
2. Em Settings → Pages, em "Build and deployment" → Source, escolher **GitHub Actions**
   (não "Deploy from a branch").
3. O primeiro push para `main` já dispara o deploy. A URL fica visível em Settings → Pages
   e também no separador Actions, na run que publicou.

Para builds manuais locais (ex.: testar o resultado antes de publicar):

```bash
VITE_BASE=/nome-do-repositorio/ npm run build
npm run preview
```

Depois de estar em HTTPS, o APK gera-se com Bubblewrap a apontar para essa URL — a app
continua a guardar tudo localmente, e o endereço fica fixo: atualizações de código
seguintes nunca mais mexem nos dados já guardados no dispositivo.

## Próximas fases

2. Carteira de ETFs: contribuições, cotações automáticas, XIRR e alocação
3. Empacotamento em APK

Importador de extratos bancários: **descartado** — o registo é manual por opção.
