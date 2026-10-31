# Sala de Mapas — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Uma página `mapas.html` que mostra cada mapa do VALORANT com callouts oficiais e, em cima do minimapa, pixels e posições de ataque e defesa cadastrados pelo painel.

**Architecture:** Três camadas, cada uma testável sozinha. A matemática que converte coordenada de mundo em ponto do minimapa vira um módulo puro usado pela página e pelo painel. A validação dos pontos mora no servidor, num lib próprio com testes. A rota `/api/tatica` guarda tudo num array no Netlify Blobs, no mesmo molde de `content.mts`.

**Tech Stack:** HTML/CSS/JS sem framework (ESM nativo), Netlify Functions em `.mts`, Netlify Blobs, `node --test` com type stripping nativo do Node 24.

**Spec:** `docs/superpowers/specs/2026-10-30-sala-de-mapas-design.md`

## Global Constraints

- **Git existe desde 30/10/2026.** O repositório foi inicializado antes da execução, com o estado anterior do site no commit `5f33ee6` e o trabalho na branch `sala-de-mapas`. Cada *checkpoint* deste plano é um commit de verdade. `.env`, `node_modules/` e `.netlify/` estão no `.gitignore` e ficaram fora.
- **O projeto não tinha testes.** A Tarefa 1 cria `testes/` e o script `npm test`. Nada de dependência nova: `node --test` e type stripping são do Node 24, que é o que está instalado.
- **CSS num arquivo só.** Todo estilo vai em `public/assets/css/site.css`. O projeto já teve três quebras por CSS separado por página; o comentário no próprio arquivo registra isso.
- **Texto da interface em português do Brasil**, no tom do resto do site: frase direta, sem exclamação, sem "incrível".
- **Nada de conteúdo de terceiros.** Nenhum print, vídeo ou texto copiado de site de lineup. O campo `video` aceita só link do YouTube; `imagem` só caminho servido por `/api/media/`.
- **Escrita exige `x-admin-key`**, conferida por `autorizar()` de `netlify/lib/auth.mts`. Leitura é pública.
- **Fração, não pixel.** Toda coordenada guardada é fração de 0 a 1 da largura e da altura do minimapa, nunca pixel de tela.

## Review Focus

Entradas que a especificação implica, que nenhuma tarefa exercitaria por conta própria, e onde cada teste foi encaixado:

1. **`valorant-api` fora do ar** — a página precisa dizer que não carregou, não ficar em branco para sempre. (Tarefa 4, passo de verificação com a rede bloqueada.)
2. **Depósito corrompido** — `pontos` gravado como objeto, `null` ou JSON quebrado: o GET devolve lista vazia, não 500. (Tarefa 3, teste de `lerPontos`.)
3. **Ponto de um mapa que saiu do catálogo** — a página ignora o ponto órfão em vez de quebrar ao procurar o minimapa dele. (Tarefa 4, teste de `pontosDoMapa`.)
4. **Texto com marcação** — `<script>` no título ou no texto é recusado na escrita e, se já estiver gravado, aparece como texto na tela. (Tarefa 2, teste de validação; Tarefa 4 usa `textContent`.)
5. **Mapa sem callouts** — a API traz mapas com `callouts: null`; a camada de callouts fica vazia e o resto da página funciona. (Tarefa 1, teste de `callutsDoMapa` com `null`.)

---

### Tarefa 1: Base de testes e a matemática do minimapa

**Files:**
- Create: `public/assets/js/minimapa.js`
- Create: `testes/minimapa.test.mts`
- Modify: `package.json` (campo `scripts`)

**Interfaces:**
- Consumes: nada.
- Produces:
  - `paraMinimapa(local: {x: number, y: number}, mapa: {xMultiplier, yMultiplier, xScalarToAdd, yScalarToAdd}) => {x: number, y: number}` — fração de 0 a 1.
  - `calloutsDoMapa(mapa) => Array<{nome: string, regiao: string, x: number, y: number}>` — lista vazia quando `mapa.callouts` é nulo ou quando o ponto cai fora de 0–1.

- [ ] **Passo 1: Escrever os testes que falham**

Em `testes/minimapa.test.mts`, com os números reais de Ascent
(`xMultiplier: 0.00007`, `yMultiplier: -0.00007`, `xScalarToAdd: 0.813895`,
`yScalarToAdd: 0.573242`):

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { paraMinimapa, calloutsDoMapa } from "../public/assets/js/minimapa.js";

const ASCENT = { xMultiplier: 0.00007, yMultiplier: -0.00007, xScalarToAdd: 0.813895, yScalarToAdd: 0.573242 };

test("converte coordenada de mundo em fração do minimapa", () => {
  // Callout "Árvore" de Ascent: location {x: 3980.9062, y: -5938.758}
  const p = paraMinimapa({ x: 3980.9062, y: -5938.758 }, ASCENT);
  assert.ok(Math.abs(p.x - 0.398182) < 1e-4, `x veio ${p.x}`);
  assert.ok(Math.abs(p.y - 0.294579) < 1e-4, `y veio ${p.y}`);
});

test("os eixos trocam: y do mundo vira a horizontal", () => {
  const a = paraMinimapa({ x: 0, y: 10000 }, ASCENT);
  const b = paraMinimapa({ x: 10000, y: 0 }, ASCENT);
  assert.ok(a.x > b.x, "y do mundo tem que mexer no eixo horizontal");
  assert.ok(b.y < a.y, "x do mundo tem que mexer no eixo vertical");
});

test("mapa sem callouts devolve lista vazia", () => {
  assert.deepEqual(calloutsDoMapa({ ...ASCENT, callouts: null }), []);
});

test("callout fora do quadro do minimapa é descartada", () => {
  const mapa = { ...ASCENT, callouts: [{ regionName: "Fora", superRegionName: "A", location: { x: 9e6, y: 9e6 } }] };
  assert.deepEqual(calloutsDoMapa(mapa), []);
});
```

- [ ] **Passo 2: Rodar e ver falhar**

Run: `npm test`
Expected: FAIL — `Cannot find module '../public/assets/js/minimapa.js'`

- [ ] **Passo 3: Acrescentar o script de teste ao `package.json`**

Em `scripts`: `"test": "node --test \"testes/**/*.test.mts\""`. Sem
dependência nova.

- [ ] **Passo 4: Implementar `paraMinimapa` e `calloutsDoMapa` em `public/assets/js/minimapa.js`**

Fórmula da especificação: `x = local.y * xMultiplier + xScalarToAdd`,
`y = local.x * yMultiplier + yScalarToAdd`. `calloutsDoMapa` mapeia
`mapa.callouts ?? []`, usa `regionName` como nome e `superRegionName` como
região, e descarta o que cair fora de 0–1 nos dois eixos. O módulo não pode
tocar no DOM no topo: ele é importado pelo Node nos testes.

- [ ] **Passo 5: Rodar e ver passar**

Run: `npm test`
Expected: PASS, 4 testes.

- [ ] **Passo 6: Checkpoint** — `npm test` verde.

---

### Tarefa 2: Formato e validação dos pontos

**Files:**
- Create: `netlify/lib/tatica.mts`
- Create: `testes/tatica.test.mts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `type Ponto` com os campos da especificação (`id, mapa, agente, habilidade, lado, tipo, de, para, titulo, texto, imagens, video, conferido, criadoEm`).
  - `normalizarPonto(bruto: unknown, mapasValidos: Set<string>) => { ok: true; ponto: Omit<Ponto,"id"|"criadoEm"> } | { ok: false; erro: string }`
  - `LIMITE_PONTOS = 2000`
  - `novoId() => string`

- [ ] **Passo 1: Escrever os testes que falham**

Em `testes/tatica.test.mts`, um teste por regra, cada um conferindo a
mensagem de erro que o painel vai mostrar:

```ts
const MAPAS = new Set(["uuid-ascent"]);
const base = { mapa: "uuid-ascent", agente: "uuid-clove", habilidade: "Grenade",
  lado: "defesa", tipo: "pixel", de: { x: 0.4, y: 0.6 }, para: { x: 0.3, y: 0.2 },
  titulo: "Smoke do meio", texto: "Encoste na caixa e solte." };
```

- aceita um ponto completo e devolve `conferido: false` por padrão
- recusa `mapa` que não está em `mapasValidos` → "Mapa desconhecido."
- recusa `lado: "meio"` e `tipo: "linha"`
- recusa `de.x = 1.4` e `de.y = -0.1` → "Coordenada fora do mapa."
- recusa `tipo: "pixel"` sem `para` → "Um pixel precisa de onde a util cai."
- aceita `tipo: "posicao"` sem `para`, e grava `para: null`
- recusa título com 81 caracteres e texto com 601
- recusa `titulo: "<script>alert(1)</script>"` → "Nada de marcação no texto."
- recusa `video: "https://exemplo.com/v"` e aceita `https://www.youtube.com/watch?v=abc`
- recusa `imagens: ["https://outrosite.com/a.png"]` e aceita `["/api/media/x.webp"]`
- recusa uma lista de 4 imagens → "No máximo três imagens por ponto."
- aceita `imagens` ausente e grava `[]`

- [ ] **Passo 2: Rodar e ver falhar**

Run: `npm test`
Expected: FAIL — módulo `netlify/lib/tatica.mts` não existe.

- [ ] **Passo 3: Implementar `netlify/lib/tatica.mts`**

Validação em servidor, como `normalizarConfig` de `progresso.mts` já faz para
a curva de níveis: a função decide o que é aceitável, o painel é só a
interface. Marcação é recusada testando `/[<>]/` no título e no texto. `video`
casa `^https:\/\/(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)[\w-]{6,}` e
`imagens` aceita até 3 itens, cada um casando `^\/api\/media\/[\w.-]+$`. `novoId()` usa
`crypto.randomUUID().slice(0, 8)` com prefixo `p_`.

- [ ] **Passo 4: Rodar e ver passar**

Run: `npm test`
Expected: PASS, todos os testes das duas tarefas.

- [ ] **Passo 5: Checkpoint** — `npm test` verde.

---

### Tarefa 3: A rota `/api/tatica`

**Files:**
- Create: `netlify/functions/tatica.mts`
- Modify: `testes/tatica.test.mts` (acrescenta os testes de `lerPontos`)
- Modify: `netlify/lib/tatica.mts` (acrescenta `lerPontos`)

**Interfaces:**
- Consumes: `normalizarPonto`, `LIMITE_PONTOS`, `novoId` da Tarefa 2; `autorizar` de `netlify/lib/auth.mts`.
- Produces: rota `/api/tatica` com GET (público), POST, PATCH e DELETE (com chave). GET devolve `{ pontos: Ponto[] }`.

- [ ] **Passo 1: Escrever o teste de leitura defensiva**

`lerPontos(bruto: unknown) => Ponto[]` em `netlify/lib/tatica.mts`:
devolve `[]` para `null`, para `{}`, para `"texto"` e para um array cujos
itens não são objetos; devolve os pontos quando o array é válido. É o item 2
do Review Focus: depósito corrompido não pode virar 500 na página pública.

- [ ] **Passo 2: Rodar e ver falhar**

Run: `npm test`
Expected: FAIL — `lerPontos is not a function`

- [ ] **Passo 3: Implementar `lerPontos` e a função `tatica.mts`**

A função segue `netlify/functions/content.mts`: `getStore({ name: "estande-tatica", consistency: "strong" })`, chave `pontos`.

- GET: lê, passa por `lerPontos`, aceita `?mapa=` para filtrar, devolve com `cache-control: public, max-age=0, must-revalidate`.
- POST: `autorizar`, `normalizarPonto` contra `mapasValidos()`, recusa se já houver `LIMITE_PONTOS`, acrescenta com `novoId()` e `criadoEm`, devolve o ponto.
- PATCH: `autorizar`, acha por `id`, revalida o ponto inteiro já mesclado, grava.
- DELETE: `autorizar`, `?id=`, remove.
- `mapasValidos()` busca `https://valorant-api.com/v1/maps` uma vez por hora, guarda em memória do módulo, e numa falha devolve o conjunto anterior — ou, não tendo nenhum, aceita o uuid (um catálogo fora do ar não pode travar o cadastro).
- `export const config` com `path: "/api/tatica"`, os quatro métodos e o mesmo `rateLimit` das outras rotas de escrita.

- [ ] **Passo 4: Rodar os testes**

Run: `npm test`
Expected: PASS.

- [ ] **Passo 5: Exercitar a rota de verdade**

Run: `npx netlify dev` noutro terminal, e então:

```bash
curl -s localhost:8888/api/tatica                        # {"pontos":[]}
curl -s -X POST localhost:8888/api/tatica -H "x-admin-key: $ADMIN_KEY" \
  -H 'content-type: application/json' -d '{...ponto válido...}'   # devolve com id
curl -s -X POST localhost:8888/api/tatica -H 'content-type: application/json' -d '{}'  # 401
curl -s -X DELETE "localhost:8888/api/tatica?id=<id>" -H "x-admin-key: $ADMIN_KEY"
```

Expected: 200, 200, 401 "Informe a chave do painel.", 200 — e o GET final sem o ponto.

- [ ] **Passo 6: Checkpoint** — testes verdes e os quatro `curl` com a resposta esperada.

---

### Tarefa 4: A página pública

**Files:**
- Create: `public/mapas.html`
- Create: `public/assets/js/mapas.js`
- Modify: `public/assets/js/minimapa.js` (acrescenta o desenho)
- Modify: `public/assets/css/site.css`
- Modify: `netlify/lib/defaults.mts` (nav e atalhos), `public/assets/js/api.js` (mesma lista de reserva)
- Modify: `public/index.html` (atalho no bloco de portais)
- Modify: `testes/minimapa.test.mts`

**Interfaces:**
- Consumes: `paraMinimapa`, `calloutsDoMapa` (Tarefa 1); `GET /api/tatica` (Tarefa 3); `vestirPagina` e `elemento` de `chrome.js`.
- Produces:
  - `pontosDoMapa(pontos, mapaUuid) => Ponto[]` em `minimapa.js` — descarta ponto de mapa que não existe mais.
  - `montarMinimapa(alvo, { mapa, pontos, agentes, aoEscolher })` em `minimapa.js` — usada também pelo painel na Tarefa 5.

- [ ] **Passo 1: Escrever o teste do ponto órfão**

Em `testes/minimapa.test.mts`: `pontosDoMapa` devolve só os pontos cujo
`mapa` bate com o uuid pedido, e devolve `[]` quando nenhum bate. É o item 3
do Review Focus.

- [ ] **Passo 2: Rodar e ver falhar**

Run: `npm test` → FAIL (`pontosDoMapa is not a function`)

- [ ] **Passo 3: Implementar `pontosDoMapa` e `montarMinimapa`**

`montarMinimapa` desenha, dentro de um contêiner com `position: relative` e a
imagem `displayIcon` como conteúdo:

- a camada de callouts (`calloutsDoMapa`), em `<span>` posicionados por
  `left`/`top` em porcentagem, com um botão que liga e desliga a camada;
- um `<svg>` por cima, com uma linha de `de` até `para` em cada ponto do tipo
  pixel, na cor do lado;
- um `<button>` por ponto, com o ícone da habilidade quando houver,
  `aria-label` dizendo agente, habilidade e lado, e `aoEscolher(ponto)` no
  clique.

O texto de qualquer ponto entra por `textContent`, nunca `innerHTML` — item 4
do Review Focus.

- [ ] **Passo 4: Montar `mapas.html` e `mapas.js`**

A página segue `linha.html`: mesmo `<head>`, mesmo trilho, mesma chamada a
`vestirPagina`. O corpo tem a barra de mapas (miniaturas `listViewIcon`), o
minimapa, os filtros (agente, habilidade, lado) e o painel do ponto. O mapa
escolhido fica em `localStorage`. Sem agente escolhido, só posições. Quando
`conferido` é falso, o painel do ponto abre com o aviso de que a entrada não
foi testada em jogo. Abaixo do mapa, a mesma lista em texto, para quem não
alcança um alvo de 24 px.

- [ ] **Passo 5: Ligar a página ao site**

Entrada na navegação em `defaults.mts` e na lista de reserva de `api.js`, e um
cartão em `public/index.html` junto dos portais da Linha de Tiro e do Arsenal.

- [ ] **Passo 6: Conferir as callouts com os próprios olhos**

Abrir a página em Ascent e olhar: "Janela" cai na janela, "Meio" no meio, "A
Principal" na entrada A. É o passo que valida a fórmula da especificação; se
estiver trocada, nada do resto serve. Repetir num mapa de duas rotas (Split) e
num de três (Haven).

- [ ] **Passo 7: Filtrar clicando no mapa**

`filtrarPorLugar(pontos, {x, y}, raio = 0.06) => Ponto[]` em `minimapa.js`:
devolve os pontos cujo `de` **ou** `para` cai dentro do raio do clique.
Teste em `testes/minimapa.test.mts` com três pontos — um que sai do lugar,
um que cai no lugar e um longe dos dois. Na tela, clicar no minimapa fora de
um marcador liga esse filtro e mostra um botão para limpá-lo.

- [ ] **Passo 8: Conferir os filtros**

Com pontos de dois agentes e dos dois lados cadastrados no mesmo mapa:
escolher um agente deixa só os dele; escolher uma habilidade recorta dentro
do agente; "ataque" esconde os de defesa; sem agente, nenhuma util aparece e
as posições ficam; clicar num canto deixa só o que sai dali ou cai ali. É o
item 4 da verificação da especificação.

- [ ] **Passo 9: Conferir os casos ruins**

Com a aba de rede do navegador bloqueando `valorant-api.com`, a página diz que
não carregou em vez de ficar em branco (item 1 do Review Focus). Num mapa com
`callouts` nulo, o resto da página funciona (item 5).

- [ ] **Passo 10: Checkpoint** — `npm test` verde, callouts no lugar nos três mapas, filtros recortando, página usável no celular.

---

### Tarefa 5: O editor no painel

**Files:**
- Modify: `public/assets/js/admin.js` (aba nova)
- Modify: `public/assets/css/site.css` ou `admin.css` (o editor é só do painel, então vai em `admin.css`)

**Interfaces:**
- Consumes: `montarMinimapa` (Tarefa 4), `POST/PATCH/DELETE /api/tatica` (Tarefa 3), o gerenciador de mídia que o painel já tem.
- Produces: nada que outra tarefa use.

- [ ] **Passo 1: Acrescentar a aba "Tática"**

No mesmo molde das abas existentes (`identidade`, `estande`, `catalogo`): um
`bloco` com o seletor de mapa, o minimapa em tamanho de edição e a lista dos
pontos daquele mapa.

- [ ] **Passo 2: Marcar os pontos no mapa**

Um botão alterna "pixel" (dois cliques: `de` e depois `para`) e "posição" (um
clique). O clique vira fração dividindo pela largura e pela altura do
contêiner — a mesma unidade que o servidor guarda.

- [ ] **Passo 3: O formulário e a lista**

Agente (lista da API), habilidade (as do agente escolhido), lado, título,
texto, até três imagens pelo gerenciador de mídia (em ordem: onde ficar, onde
mirar, resultado), vídeo, e a caixa "conferido". A lista
abaixo edita e apaga. Erro vindo da rota aparece com a mensagem do servidor,
como o resto do painel já faz.

- [ ] **Passo 4: Verificar de ponta a ponta**

Cadastrar um pixel pelo painel, abrir `mapas.html` e ver o ponto com linha,
ícone, texto e aviso de não conferido. Marcar "conferido" e ver o aviso sumir.
Apagar e ver sumir da página.

- [ ] **Passo 5: Checkpoint** — o ciclo cadastrar, editar, conferir e apagar funcionando nas duas telas.

---

### Tarefa 6: O acervo inicial

**Files:**
- Create: `netlify/lib/acervo-tatica.mts` (os pontos escritos, como dado)
- Modify: `netlify/functions/tatica.mts` (semear o depósito vazio)

**Interfaces:**
- Consumes: `type Ponto`, `normalizarPonto` (Tarefa 2).
- Produces: `ACERVO: Array<Omit<Ponto, "id" | "criadoEm">>`.

- [ ] **Passo 1: Escrever os pontos**

De 4 a 6 por mapa, nos 13 mapas jogáveis, para Clove, Brimstone, Viper, Omen e
Astra. Texto próprio, sem imagem e sem vídeo de terceiros. Todos com
`conferido: false`. Posição antes de pixel: onde se colocar e por onde a smoke
precisa cair envelhece devagar; alinhamento fino de mira erra mais, então entra
em menor quantidade.

- [ ] **Passo 2: Testar que o acervo inteiro passa na própria validação**

Em `testes/tatica.test.mts`: cada entrada de `ACERVO` passa por
`normalizarPonto` sem erro, e nenhuma tem `conferido: true`. Um acervo que a
rota recusaria é um acervo que nunca aparece.

- [ ] **Passo 3: Rodar e corrigir o que falhar**

Run: `npm test`
Expected: PASS.

- [ ] **Passo 4: Semear**

No GET de `tatica.mts`, quando o depósito está vazio *e nunca foi semeado*
(uma chave `semeado` na mesma loja), gravar o acervo uma vez. Assim o dono
pode apagar tudo pelo painel sem o acervo voltar sozinho na próxima visita.

- [ ] **Passo 5: Verificar no site**

Abrir a página num mapa coberto pelo acervo e ver os pontos com o aviso de não
conferido. Apagar um e recarregar: não volta.

- [ ] **Passo 6: Checkpoint** — `npm test` verde e a página abrindo com conteúdo.

---

## Publicação

Antes de publicar, o item 7 da verificação da especificação: abrir a inicial,
o estande (um exercício do começo ao fim), a Linha de Tiro e o Arsenal, e ver
que nada quebrou — a página nova mexe em `defaults.mts`, em `api.js` e no
`site.css`, que são compartilhados.

Depois: `npm run deploy`, e conferir no ar a página, um cadastro pelo painel e
a inicial com o atalho novo.
