# Navegação de tela única — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar entre Estande, Arsenal, Linha de Tiro, Sala de Mapas e Ranking dentro da mesma página, com transição e barra de carga, mantendo o endereço sempre na raiz.

**Architecture:** O `index.html` vira a casca. Um módulo novo, `roteiro.js`, intercepta os cliques do trilho, busca o HTML da tela pedida, troca os filhos de `body` que pertencem à tela e chama `iniciar()` do módulo dela por `import()` dinâmico. Cada um dos cinco módulos passa a exportar `iniciar()` e `desmontar()` e só se autoinicia quando a página é aberta solta.

**Tech Stack:** JavaScript ES modules sem build, `fetch` + `DOMParser`, `history.pushState`, CSS com os tokens de `tokens.css`. Testes em `node:test` com arquivos `.test.mts`.

**Spec:** `docs/superpowers/specs/2026-11-01-navegacao-tela-unica-design.md`

## Global Constraints

- O terceiro argumento de `pushState`/`replaceState` é sempre `location.href`: a barra de endereço nunca muda.
- Nenhum módulo pode tocar em `document` no topo do arquivo — só dentro de funções. `roteiro.js` precisa ser importável no Node pelos testes.
- Os cinco `.html` continuam funcionando abertos sozinhos, sem JavaScript novo obrigatório.
- Nenhuma cor nova: só os tokens que já existem em `tokens.css`.
- `prefers-reduced-motion: reduce` deixa só a troca de opacidade, sem deslocamento.
- Mensagens de commit em português, no imperativo, como o resto do histórico, terminando com:
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`

## Review Focus

- **Dois cliques durante uma troca:** vale o último; o pedido anterior é abandonado sem pintar a tela errada. (Task 4)
- **Âncora da tela em que já se está** (`index.html#estande` estando no Estande): o navegador rola, o roteador não troca nada. (Task 1)
- **`popstate` com estado nulo**, de uma entrada anterior à casca: abre a tela inicial em vez de quebrar. (Task 5)
- **`sessionStorage` bloqueado** (navegação restrita): a marca da tela é ignorada sem lançar erro. (Task 5)
- **`fetch` que falha ou devolve 404:** cai para a navegação antiga, `location.href`, em vez de ficar na tela apagada. (Task 4)

---

### Task 1: Núcleo puro do roteiro

Decisões de rota que não tocam no DOM, e os testes que as provam.

**Files:**
- Create: `public/assets/js/roteiro.js`
- Test: `testes/roteiro.test.mts`

**Interfaces:**
- Consumes: nada
- Produces:
  - `TELAS` — objeto com as cinco telas: `{ estande: { arquivo: "index.html", modulo: "./app.js", rotulo: "Estande" }, arsenal: { arquivo: "arsenal.html", modulo: "./arsenal.js", rotulo: "Arsenal" }, linha: { arquivo: "linha.html", modulo: "./linha.js", rotulo: "Linha de Tiro" }, mapas: { arquivo: "mapas.html", modulo: "./mapas.js", rotulo: "Sala de Mapas" }, ranking: { arquivo: "ranking.html", modulo: "./ranking.js", rotulo: "Ranking" } }`
  - `telaDoHref(href: string, origem: string) -> string | null`
  - `podeTrocar({ botao, meta, ctrl, shift, alt, jaTratado, alvo, baixar, href, origem, telaAtual }) -> boolean`
  - `telaInicial(caminho: string, marca: string | null) -> string`
  - `precisaDesviar(caminho: string) -> boolean`
  - `telaDoEstado(estado: unknown) -> string | null`

- [ ] **Step 1: Write the failing test**

```ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  TELAS, telaDoHref, podeTrocar, telaInicial, precisaDesviar, telaDoEstado,
} from "../public/assets/js/roteiro.js";

const ORIGEM = "https://estandebr.netlify.app";
const clique = (extra = {}) => ({
  botao: 0, meta: false, ctrl: false, shift: false, alt: false,
  jaTratado: false, alvo: "", baixar: false,
  href: `${ORIGEM}/arsenal.html`, origem: ORIGEM, telaAtual: "estande",
  ...extra,
});

test("as cinco telas estão na tabela, e só elas", () => {
  assert.deepEqual(Object.keys(TELAS).sort(), ["arsenal", "estande", "linha", "mapas", "ranking"]);
});

test("reconhece a tela pelo arquivo, com ou sem âncora", () => {
  assert.equal(telaDoHref(`${ORIGEM}/arsenal.html`, ORIGEM), "arsenal");
  assert.equal(telaDoHref(`${ORIGEM}/index.html#estande`, ORIGEM), "estande");
  assert.equal(telaDoHref(`${ORIGEM}/`, ORIGEM), "estande");
});

test("não reconhece o que não é tela", () => {
  assert.equal(telaDoHref(`${ORIGEM}/admin.html`, ORIGEM), null);
  assert.equal(telaDoHref("https://www.instagram.com/matheus.b.p", ORIGEM), null);
  assert.equal(telaDoHref("mailto:oi@exemplo.com", ORIGEM), null);
});

test("assume o clique simples num link de tela", () => {
  assert.equal(podeTrocar(clique()), true);
});

test("não assume clique com tecla, botão do meio ou já tratado", () => {
  for (const extra of [{ meta: true }, { ctrl: true }, { shift: true }, { alt: true },
                       { botao: 1 }, { jaTratado: true }]) {
    assert.equal(podeTrocar(clique(extra)), false, JSON.stringify(extra));
  }
});

test("não assume link de baixar, de outra aba ou de fora", () => {
  assert.equal(podeTrocar(clique({ baixar: true })), false);
  assert.equal(podeTrocar(clique({ alvo: "_blank" })), false);
  assert.equal(podeTrocar(clique({ href: "https://www.instagram.com/matheus.b.p" })), false);
});

test("âncora da tela em que já se está fica com o navegador", () => {
  // Quem clica em "Estande" estando no Estande quer rolar até a seção.
  assert.equal(podeTrocar(clique({ href: `${ORIGEM}/index.html#estande`, telaAtual: "estande" })), false);
  assert.equal(podeTrocar(clique({ href: `${ORIGEM}/index.html#estande`, telaAtual: "arsenal" })), true);
});

test("a tela de abertura vem da marca, e sem marca vem do caminho", () => {
  assert.equal(telaInicial("/", "arsenal"), "arsenal");
  assert.equal(telaInicial("/", null), "estande");
  assert.equal(telaInicial("/mapas.html", null), "mapas");
  assert.equal(telaInicial("/", "painel"), "estande");
});

test("só desvia para a raiz quem não está nela", () => {
  assert.equal(precisaDesviar("/"), false);
  assert.equal(precisaDesviar("/index.html"), false);
  assert.equal(precisaDesviar("/arsenal.html"), true);
});

test("estado de histórico de antes da casca não vira tela", () => {
  assert.equal(telaDoEstado({ tela: "mapas" }), "mapas");
  assert.equal(telaDoEstado(null), null);
  assert.equal(telaDoEstado({ tela: "painel" }), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test testes/roteiro.test.mts`
Expected: FAIL — `Cannot find module .../roteiro.js`

- [ ] **Step 3: Implement as seis exportações em `public/assets/js/roteiro.js`**

Só as funções puras nesta task; nada de `document` no arquivo ainda. Resolva
os endereços com `new URL(href, origem)` dentro de `try`, para `mailto:` e
afins devolverem `null` em vez de lançar.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test testes/roteiro.test.mts`
Expected: PASS, 10 testes

- [ ] **Step 5: Commit**

```bash
git add public/assets/js/roteiro.js testes/roteiro.test.mts
git commit -m "Acrescenta o núcleo de rotas da navegação de tela única"
```

---

### Task 2: Contrato de tela nos cinco módulos

Os módulos deixam de se autoiniciar dentro da casca e passam a oferecer
`iniciar()` e `desmontar()`. Esta task cuida das três telas que não deixam
nada ligado; as outras duas vêm na Task 3.

**Files:**
- Modify: `public/assets/js/arsenal.js` (a chamada `iniciar()` do fim do arquivo)
- Modify: `public/assets/js/mapas.js` (idem)
- Modify: `public/assets/js/ranking.js` (idem, mais os dois `addEventListener` soltos no topo)
- Modify: `public/assets/js/app.js`, `public/assets/js/linha.js` (só a exportação e o autoarranque; o `desmontar()` deles é a Task 3)
- Modify: `public/assets/js/conta.js` (`montarBotaoDeConta` idempotente)

**Interfaces:**
- Consumes: nada
- Produces: cada módulo de tela exporta `iniciar(): Promise<void>` e `desmontar(): void`; `conta.js` mantém a assinatura de `montarBotaoDeConta(): void`

- [ ] **Step 1: Trocar o autoarranque nos cinco módulos**

Em cada um, `async function iniciar()` vira `export async function iniciar()`,
e a última linha `iniciar();` vira:

```js
if (!document.body.dataset.casca) iniciar();
```

- [ ] **Step 2: Escrever `desmontar()` em `arsenal.js`, `mapas.js` e `ranking.js`**

`export function desmontar()`, zerando o objeto de estado do próprio módulo
(filtros, arma, mapa e ponto escolhidos) para a tela não voltar com a escolha
da visita anterior. Nenhum dos três tem cronômetro ou ouvinte de janela.

- [ ] **Step 3: Mover para dentro de `iniciar()` os ouvintes soltos de `ranking.js`**

São os dois de `ranking.js:179` e `ranking.js:181` (`envioCancelar` e
`formEnvio`), hoje no topo do arquivo: fora de `iniciar()` eles rodariam antes
de a tela existir no DOM.

- [ ] **Step 4: Tornar `montarBotaoDeConta()` idempotente em `conta.js:232`**

Sair na hora quando o pé do trilho já estiver montado. Ele assina
`aoMudarConta` por dentro sem guardar o cancelamento, e hoje cada tela o
chama — na casca isso empilharia um assinante por troca.

- [ ] **Step 5: Verificar as cinco páginas soltas**

Servir `public/` e abrir as cinco direto, uma a uma. Expected: cada página
carrega e funciona como antes, sem erro no console — o autoarranque continua
valendo fora da casca.

- [ ] **Step 6: Rodar a suíte**

Run: `npm test`
Expected: PASS, 114 testes (104 de antes + 10 da Task 1)

- [ ] **Step 7: Commit**

```bash
git add public/assets/js/
git commit -m "Dá às telas um iniciar e um desmontar, no lugar do autoarranque"
```

---

### Task 3: Desligar o que o Estande e a Linha de Tiro deixam ligado

As duas telas que, sem isto, acumulam cronômetro e laço de animação a cada
visita.

**Files:**
- Modify: `public/assets/js/app.js:957-1022` (os três `setInterval` e o `visibilitychange`)
- Modify: `public/assets/js/linha.js` (laço, áudio e os ouvintes de `linha.js:1203`, `1205` e `1335`)
- Modify: `public/assets/js/range.js` (laço e os ouvintes de `range.js:1283`, `1295`, `1299` e `1300`)

**Interfaces:**
- Consumes: o contrato da Task 2
- Produces: `desmontar()` de `app.js` e de `linha.js`; `range.js` exporta `pararCampo(): void`, que `linha.js` chama no `desmontar()`

- [ ] **Step 1: Guardar o que hoje é descartado**

`acompanharRanking()` e `acompanharPresenca()` passam a guardar os três
identificadores de `setInterval` e o cancelamento do `visibilitychange` numa
lista do módulo. Em `linha.js` e `range.js`, o identificador do
`requestAnimationFrame` já existe na variável `quadro`; o que falta é guardar
o cancelamento dos ouvintes de `resize`, `visibilitychange`,
`fullscreenchange` e `pointerup`.

- [ ] **Step 2: Escrever os dois `desmontar()`**

Cada um percorre a lista e desliga tudo: `clearInterval`,
`cancelAnimationFrame`, `removeEventListener` e a parada do áudio. Depois
esvazia a lista, para um segundo `desmontar()` não dar erro.

- [ ] **Step 3: Conferir no navegador que nada sobrou**

Entrar na Linha de Tiro, sair, entrar de novo. Expected: um laço só rodando
(contar os quadros no console), nenhum som depois de sair, e o número de
ouvintes de `resize` em `getEventListeners(window)` igual ao de antes da
primeira visita.

- [ ] **Step 4: Rodar a suíte**

Run: `npm test`
Expected: PASS, 114 testes

- [ ] **Step 5: Commit**

```bash
git add public/assets/js/
git commit -m "Desliga cronômetros, laço e áudio ao sair da tela"
```

---

### Task 4: A casca troca de tela

A parte do roteiro que mexe no DOM, mais a transição. Ainda sem histórico:
esta task termina com a troca funcionando no clique.

**Files:**
- Modify: `public/assets/js/roteiro.js`
- Modify: `public/index.html` (barra, aviso e o script da casca)
- Modify: `public/assets/css/site.css` (barra e transição)

**Interfaces:**
- Consumes: `TELAS`, `telaDoHref`, `podeTrocar`, `telaInicial` da Task 1; `iniciar()`/`desmontar()` das Tasks 2 e 3
- Produces: `abrir(tela: string, { doHistorico?: boolean }): Promise<void>` e `comecar(): void`

- [ ] **Step 1: Marcar a casca e montar os dois elementos no `index.html`**

Antes do `script`, uma barra e um aviso para leitor de tela:

```html
<div class="rota-barra" id="rotaBarra" hidden></div>
<p class="oculto" id="rotaAviso" role="status" aria-live="polite"></p>
```

O `script` do fim passa a apontar para `assets/js/roteiro.js`, que marca
`document.body.dataset.casca = "sim"` antes de qualquer `import()`.

- [ ] **Step 2: Implementar `abrir(tela, { doHistorico })`**

Na ordem da spec: acende a barra e apaga o conteúdo, `fetch` do arquivo da
tela, `DOMParser`, `desmontar()` da tela que sai, troca dos filhos de `body`
— saem todos menos `nav.trilho`, `footer.rodape` e `script`, entram os
equivalentes do documento buscado —, `import()` do módulo, `iniciar()`, e
então foco no `h1` com `tabindex="-1"`, rolagem ao topo e o rótulo da tela
escrito em `#rotaAviso`.

Duas regras que o resto não determina:

```js
// Vale o último clique: cada troca ganha um número, e uma troca que voltou
// do fetch com o número vencido é descartada sem pintar nada.
const meu = ++contador;
// ... await fetch ...
if (meu !== contador) return;
```

```js
// Piso de tempo, para a barra não dar um flash com a resposta em cache.
await Promise.all([busca, new Promise((ok) => setTimeout(ok, 180))]);
```

Qualquer erro no `fetch` ou no `import()` cai para `location.href = arquivo`.

- [ ] **Step 3: Implementar `comecar()`**

Um ouvinte de clique em `document` que monta o objeto simples a partir do
evento e do `<a>` mais próximo, pergunta a `podeTrocar`, e se for sim chama
`ev.preventDefault()` e `abrir(...)`. A tela de abertura sai de
`telaInicial(location.pathname, null)` — a marca do `sessionStorage` entra na
Task 5.

- [ ] **Step 4: Escrever o CSS da barra e da transição**

`.rota-barra` fixa no topo, 3 px, `--sinal`, com os estados de correr até 70%
e completar. `main.palco--saindo` com `opacity: 0` em 160 ms e
`main.palco--entrando` subindo 12 px em 200 ms. Dentro de
`@media (prefers-reduced-motion: reduce)`, só a opacidade.

- [ ] **Step 5: Conferir no navegador**

As cinco telas nos dois sentidos; endereço parado na raiz; dois cliques
seguidos em links diferentes terminando na tela do segundo; e uma troca com a
rede desligada caindo para a navegação antiga. Expected: todos os cinco
comportamentos como descritos.

- [ ] **Step 6: Rodar a suíte**

Run: `npm test`
Expected: PASS, 114 testes

- [ ] **Step 7: Commit**

```bash
git add public/
git commit -m "Troca de tela dentro da casca, com barra de carga e transição"
```

---

### Task 5: Histórico e links antigos

O Voltar do navegador passa a andar dentro do site, e quem chega por link
antigo acaba na raiz.

**Files:**
- Modify: `public/assets/js/roteiro.js`
- Modify: `public/assets/js/chrome.js` (o desvio)
- Test: `testes/roteiro.test.mts`

**Interfaces:**
- Consumes: `abrir`, `precisaDesviar`, `telaDoEstado`, `telaInicial`
- Produces: `chrome.js` exporta `desviarParaRaiz(): void`

- [ ] **Step 1: Write the failing test**

Acrescentar ao arquivo da Task 1, somando `lerMarca` à lista de importações
do topo:

```ts
test("a marca de tela é lida e apagada, e some sem sessionStorage", () => {
  const cofre = new Map<string, string>([["rota.tela", "mapas"]]);
  const fingido = {
    getItem: (k: string) => cofre.get(k) ?? null,
    removeItem: (k: string) => { cofre.delete(k); },
  };
  assert.equal(lerMarca(fingido), "mapas");
  assert.equal(lerMarca(fingido), null, "a marca é de uma viagem só");

  const quebrado = { getItem() { throw new Error("bloqueado"); }, removeItem() {} };
  assert.equal(lerMarca(quebrado), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test testes/roteiro.test.mts`
Expected: FAIL — `lerMarca is not a function`

- [ ] **Step 3: Implementar `lerMarca(cofre) -> string | null` em `roteiro.js`**

Lê `rota.tela`, apaga e devolve, dentro de `try`. Qualquer erro do cofre vira
`null`: navegação restrita bloqueia `sessionStorage` e isso não pode derrubar
a abertura do site.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test testes/roteiro.test.mts`
Expected: PASS, 11 testes

- [ ] **Step 5: Registrar e ouvir o histórico**

Ao fim de cada `abrir()` com `doHistorico` falso:
`history.pushState({ tela }, "", location.href)`. Um ouvinte de `popstate`
chama `abrir(telaDoEstado(ev.state) ?? telaInicial(location.pathname, null), { doHistorico: true })`
— estado nulo, de uma entrada anterior à casca, abre a tela inicial em vez de
quebrar. E `comecar()` passa a tomar a tela de abertura de
`telaInicial(location.pathname, lerMarca(sessionStorage))`.

- [ ] **Step 6: Escrever `desviarParaRaiz()` em `chrome.js`**

Guarda `rota.tela` no `sessionStorage` e chama `location.replace("/")`, só
quando `precisaDesviar(location.pathname)`. Chamada no topo de
`vestirPagina()`, que é o caminho por onde toda tela passa.

- [ ] **Step 7: Conferir no navegador**

Percorrer quatro telas e voltar com o Voltar até sair do site; abrir
`/arsenal.html` direto e ver o endereço virar a raiz com o Arsenal na tela.
Expected: os dois caminhos sem recarga visível e sem endereço fora da raiz.

- [ ] **Step 8: Rodar a suíte**

Run: `npm test`
Expected: PASS, 115 testes

- [ ] **Step 9: Commit**

```bash
git add public/ testes/
git commit -m "Registra a troca no histórico e traz os links antigos para a raiz"
```
