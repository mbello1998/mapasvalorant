# Navegação de tela única — trocar de página sem trocar o endereço

**Data:** 1º de novembro de 2026
**Estado:** especificação para revisão

## O que é

Hoje o site tem cinco páginas públicas, e cada clique no trilho é uma carga
nova do navegador: a tela pisca branca, o trilho se redesenha e o endereço
muda. A proposta é que Estande, Arsenal, Linha de Tiro, Sala de Mapas e
Ranking passem a trocar dentro da mesma página, com uma transição curta e uma
barra de carga no topo, e que o endereço fique sempre em
`estandebr.netlify.app` — em qualquer tela, inclusive para quem chegar por um
link antigo.

O Painel (`admin.html`) fica de fora. É o maior módulo do projeto, tem
formulários de edição e ninguém navega entre ele e o resto no uso normal.

### Decisões já tomadas

| Pergunta | Resposta |
|---|---|
| O que acontece na barra de endereço | Nunca muda: fica sempre na raiz |
| Quais telas entram | As cinco públicas; Painel fora |
| Botão Voltar do navegador | Volta para a tela anterior do site |
| Como é a transição | Escurece e volta, com barra de carga no topo |

## Por que não é só trocar o `<main>`

Três coisas tornam isso mais do que um `innerHTML`:

1. **Os módulos de tela rodam sozinhos.** Cada um termina chamando
   `iniciar()` na última linha. Módulo ES só executa uma vez por URL, então
   voltar para uma tela já visitada não reexecutaria nada.
2. **Duas telas deixam coisas ligadas.** A inicial tem três `setInterval`
   (ranking de 60 em 60 segundos, presença de 8 e de 45) e a Linha de Tiro tem
   laço de animação, áudio e ouvintes de `resize`, `visibilitychange` e
   `fullscreenchange` em `linha.js` e `range.js`. Sem desligar, a segunda
   visita roda dois laços ao mesmo tempo.
3. **Os `id` se repetem entre páginas.** `gaveta`, `gavetaCaixa`,
   `rodapeLinks` existem em várias. A troca precisa tirar os da tela que sai
   antes de pôr os da que entra, senão `getElementById` passa a devolver o
   elemento errado.

## A casca e o que é de cada tela

O `index.html` passa a ser a casca. A regra de corte é simples e vale para
todas as páginas:

| Fica na casca, nunca é trocado | Pertence à tela, é trocado |
|---|---|
| `nav.trilho` (com o pé da conta) | `main` |
| `footer.rodape` (com a assinatura) | `a.pulo`, telas de carga, `dialog` da gaveta |
| as tags `script` | |

Em código: ao trocar, saem todos os filhos de `body` que não são
`nav.trilho`, `footer.rodape` ou `script`, e entram no lugar os equivalentes
da tela nova.

O trilho ficar parado tem um efeito que vale mais que o desempenho: o botão da
conta não pisca a cada troca.

## Peça nova: `assets/js/roteiro.js`

Um módulo só, com cinco responsabilidades e nenhuma regra de negócio:

| Função | O que faz |
|---|---|
| `telaDoHref(href)` | Diz qual tela um link representa, ou `null` se não for uma delas |
| `deveInterceptar(ev, a)` | Decide se o clique é nosso ou do navegador |
| `abrir(tela, { doHistorico })` | O ciclo da troca, de ponta a ponta |
| `comecar()` | Liga os ouvintes de clique e de `popstate` e abre a tela inicial |
| — | A tabela das cinco telas: arquivo, módulo e rótulo |

A tabela de telas:

| Tela | Arquivo | Módulo |
|---|---|---|
| estande | `index.html` | `./app.js` |
| arsenal | `arsenal.html` | `./arsenal.js` |
| linha | `linha.html` | `./linha.js` |
| mapas | `mapas.html` | `./mapas.js` |
| ranking | `ranking.html` | `./ranking.js` |

## O ciclo de uma troca

1. Clique num link do trilho que aponte para uma das cinco telas.
   `deveInterceptar` diz não — e o navegador segue o seu caminho normal —
   quando o clique tem Ctrl, Cmd, Shift ou botão do meio, quando o link tem
   `target` ou `download`, quando é externo, e quando é âncora da tela atual.
2. `ev.preventDefault()`. A barra de carga começa a correr no topo e o
   conteúdo atual apaga (~160 ms).
3. `fetch('arsenal.html')`, resposta lida com `DOMParser`.
4. `desmontar()` da tela que sai.
5. Troca dos elementos pela regra da casca, de uma vez só.
6. `import('./arsenal.js')` e `iniciar()` do módulo. O `iniciar()` já chama
   `vestirPagina()`, então título, link marcado no trilho e rodapé se ajustam
   sem o roteador saber nada disso.
7. A barra completa e some, a tela entra subindo de leve, o foco vai para o
   `h1` e a rolagem volta ao topo.
8. `history.pushState({ tela: 'arsenal' }, '', location.href)` — o terceiro
   argumento repetindo o endereço atual é o que registra a visita **sem**
   mexer na barra.

No `popstate`, o mesmo ciclo com `doHistorico: false`, para não empilhar de
novo o que o navegador já desempilhou.

### Quando dá errado

| Falha | O que acontece |
|---|---|
| `fetch` não responde ou devolve erro | A barra fica vermelha e o site cai para a navegação antiga: `location.href = href`. O visitante chega na tela do mesmo jeito, só que com uma carga de página |
| `import()` do módulo falha | Mesma saída |
| Clique durante uma troca em andamento | O pedido anterior é abandonado; vale o último clique |

A regra é que nenhuma falha do roteador pode deixar o site parado numa tela em
branco.

## Contrato de tela

Cada um dos cinco módulos passa a exportar duas funções:

```js
export async function iniciar() { /* o que hoje já está lá */ }
export function desmontar() { /* desliga o que iniciar() ligou */ }

// Autoarranque só quando a página é aberta solta, fora da casca.
if (!document.body.dataset.casca) iniciar();
```

A casca marca `document.body.dataset.casca = "sim"` antes de qualquer
`import()`, e nunca copia as tags `script` do HTML buscado — por isso o módulo
da tela nova só roda pela mão do roteador.

### O que cada tela precisa desligar

| Tela | `desmontar()` desliga |
|---|---|
| Estande | Os três `setInterval` (ranking, leitura e ponto de presença), o `visibilitychange` do ranking e o `aoMudarConta` do repinte da home |
| Linha de Tiro | O laço de animação (`cancelAnimationFrame`), o áudio, e os ouvintes de `resize`, `visibilitychange` e `fullscreenchange` de `linha.js` e `range.js` |
| Arsenal | Nada de cronômetro; só zerar o estado do módulo |
| Sala de Mapas | Nada ligado em janela; só zerar o estado do módulo |
| Ranking | Os dois `addEventListener` que hoje estão soltos no topo do arquivo e vão passar para dentro do `iniciar()` |

Zerar o estado é obrigatório mesmo onde não há cronômetro: o módulo continua
na memória entre visitas, e um filtro ou uma arma escolhida que sobrevive à
saída reaparece na volta sem que a tela tenha pedido.

Dois pontos fora dos cinco módulos:

- `montarBotaoDeConta()` passa a ser chamado uma vez pela casca e vira
  idempotente (sai na hora se já estiver montado). Hoje cada página chama, e
  ele assina `aoMudarConta` por dentro sem guardar o cancelamento — chamar a
  cada troca empilharia assinantes.
- `aoMudarConta` já devolve a função de cancelar; quem assinar dentro de uma
  tela guarda esse retorno e chama no `desmontar()`.

## Endereço e links antigos

Os cinco `.html` continuam existindo e funcionando sozinhos. São a rede de
segurança de quem está sem JavaScript e o que os buscadores leem.

Quem abrir `/arsenal.html` direto cai numa página que funciona, e um trecho
curto em `chrome.js` guarda a tela pedida em `sessionStorage` e troca o
endereço para a raiz com `location.replace('/')`. A casca lê essa marca ao
abrir e começa já no Arsenal.

Esse desvio só dispara quando o caminho da página não é a raiz — `/` ou
`/index.html` passam direto. Sem essa guarda, a casca se mandaria para si
mesma em laço. Custa uma carga a mais para quem chega por link
antigo, e em troca o endereço fica na raiz em toda situação — que é o pedido.

## A transição

| Peça | Comportamento |
|---|---|
| Barra de carga | 3 px no topo, cor `--sinal`. Corre até 70% enquanto o conteúdo chega e completa na troca |
| Saída | `opacity` a 0 em 160 ms |
| Entrada | Sobe 12 px e aparece em 200 ms |
| Piso de tempo | 180 ms mínimo, para a barra não dar um flash quando a resposta vem do cache |
| `prefers-reduced-motion` | Só a troca de opacidade, sem deslocamento |

O CSS novo fica junto do bloco da casca em `site.css`, com os tokens que já
existem. Nenhuma cor nova.

## Acessibilidade

- O foco vai para o `h1` da tela nova (`tabindex="-1"`), senão quem navega por
  teclado continua no fim do documento anterior.
- Uma região `aria-live="polite"` na casca anuncia o nome da tela que entrou.
- O link "Pular para…" é da tela, então troca junto e continua apontando para
  o lugar certo.
- O estado `aria-current` do trilho já é cuidado por `vestirPagina()`.

## Como fica provado

**Testes automáticos** (`testes/roteiro.test.mts`), na parte sem DOM:

- `telaDoHref` para os cinco arquivos, para âncora, para link externo e para
  endereço desconhecido.
- `deveInterceptar` dizendo não em: Ctrl/Cmd/Shift, botão do meio, `target`,
  `download`, domínio de fora e âncora da própria tela.
- Leitura e escrita do estado do histórico.

**Conferência no navegador**, com o servidor local:

- As cinco telas nos dois sentidos, endereço sempre na raiz.
- Voltar e Avançar percorrendo o caminho feito.
- Entrar e sair da Linha de Tiro duas vezes, conferindo no console que existe
  um laço só e que o áudio parou.
- `/arsenal.html` aberto direto: o endereço vira a raiz e abre o Arsenal.
- Uma tela com a rede desligada: o site cai para a navegação antiga em vez de
  travar.

`npm test` tem que seguir verde nos 104 testes que já existem.

## Fora de escopo

- O Painel.
- Pré-carregar a tela ao passar o mouse no link.
- Guardar em cache o HTML das telas já visitadas.
- Animação de entrada diferente por tela.

Os três últimos são somas fáceis depois, se a troca parecer lenta no uso real.

## Riscos

| Risco | Tratamento |
|---|---|
| Estado de módulo sobrevivendo entre visitas | Cada `iniciar()` zera o seu próprio estado; a conferência de entrar e sair duas vezes existe para pegar isso |
| Algo ficar ligado sem ninguém notar | A conferência da Linha de Tiro olha o número de laços no console, não a impressão de que está tudo bem |
| Memória crescendo a cada troca | Os cinco módulos ficam carregados depois da primeira visita — é o preço do desenho, e são arquivos que o visitante já baixaria de qualquer jeito ao visitar a tela |
