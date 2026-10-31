# Design — secção Investimentos

Tela original: https://claude.ai/artifact/JLW3XsKbkLTNGafN4BHMQH

Cada `.dc.html` é um ecrã. O CSS dentro de `<helmet>` tem os tokens (`.t` claro, `.t.escuro`) e as classes de apoio.

| Ficheiro | Ecrã |
|---|---|
| Main | Telemóvel, claro, 1 regra com aviso (reordenar interativo) |
| Telemovel-escuro | Telemóvel, escuro, tudo dentro, ordem mudada |
| Telemovel-sem-dados | Estado sem fotografias |
| Telemovel-reordenar | A meio de arrastar um cartão |
| Telemovel-fotografia | Introdução dos valores do mês |
| PC-claro / PC-escuro / PC-fotografia | Versões de PC (conteúdo até 1400 px) |
| Estados-e-variaveis | Estados de sincronização, chips de regra, variáveis CSS novas |

Os números são de exemplo.

## Pedido para o Claude Code

```
Implementa a secção "Investimentos" seguindo o design em docs/design/investimentos/.
- Estados-e-variaveis.dc.html lista as variáveis CSS novas: junta-as a src/estilos/tokens.css,
  não cries outras.
- Liga tudo aos dados reais da app (fotografias, aportes, objetivo do casamento).
- Taxa de poupança = aportes efetivamente transferidos ÷ rendimento do mês
  (nunca rendimento − gastos).
- A ordem dos 3 cartões é guardada e sincronizada. Arrastar, mais setas ↑↓ como alternativa
  acessível, e "Ordem guardada · Desfazer" depois de largar.
- Testes primeiro para o cálculo das regras (temáticos ≤ 10% da carteira;
  emergentes 9–15% do núcleo IWDA+EIMI).
- No fim, revisão por um agente independente.
```
