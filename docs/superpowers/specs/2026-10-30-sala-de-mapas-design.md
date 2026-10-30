# Sala de Mapas — pixels e uso de agente por mapa

**Data:** 30 de outubro de 2026
**Estado:** especificação para revisão

## O que é

Uma área nova do site, `mapas.html`, onde cada mapa do VALORANT aparece com o
minimapa oficial e, em cima dele, os pontos que importam para jogar: de onde se
solta uma util, onde ela cai, e as posições que valem no ataque e na defesa.
Filtra por agente, por habilidade e por lado.

O conteúdo tem duas origens, e elas não se misturam:

- **O que vem da Riot** (mapas, callouts, agentes, habilidades) é lido de
  `valorant-api.com` a cada carregamento, como o resto do site já faz. Ninguém
  cadastra, ninguém mantém.
- **Os pontos** (pixels e posições) são dados do site, escritos pelo painel e
  guardados no Netlify Blobs.

## Por que não existe atalho

Não há API nem dataset público de lineups — a busca encontrou APIs de dados do
jogo, APIs de esports e datasets de VCT, nada de lineup. O que existe na web é
vídeo e print em site de comunidade: material de terceiros, sem licença de
reuso, em formato que não é dado. Copiar esse material para cá seria violação
de direito autoral, então o acervo inicial é escrito com palavras próprias e o
resto é cadastrado pelo dono do site.

## Dado oficial

### Mapas

`GET https://valorant-api.com/v1/maps?language=pt-BR` devolve 13 mapas com
`tacticalDescription` (os jogáveis). De cada um interessam:

| campo | uso |
|---|---|
| `uuid` | chave do mapa nos pontos cadastrados |
| `displayName` | nome na tela |
| `displayIcon` | o minimapa, que é o fundo da página |
| `listViewIcon` | miniatura na lista de mapas |
| `splash` | arte de cabeçalho |
| `callouts[]` | nome da região, super-região e coordenada de mundo |
| `xMultiplier`, `yMultiplier`, `xScalarToAdd`, `yScalarToAdd` | conversão |

### Converter coordenada de mundo em ponto do minimapa

A Riot guarda a posição da callout em coordenada de mundo, e o minimapa é uma
imagem. A conversão troca os eixos:

```
esquerda = callout.location.y * mapa.xMultiplier + mapa.xScalarToAdd
topo     = callout.location.x * mapa.yMultiplier + mapa.yScalarToAdd
```

O resultado é uma fração de 0 a 1 da largura e da altura da imagem, então vira
`left`/`top` em porcentagem direto, sem depender do tamanho em que o minimapa
for mostrado.

**Isto precisa ser conferido antes de virar verdade**: a primeira tarefa da
implementação é desenhar as 22 callouts de Ascent e olhar se "Janela" cai na
janela e "Meio" no meio. Se a fórmula estiver trocada, nada do resto funciona —
os pontos cadastrados usam o mesmo sistema de coordenadas.

### Agentes

`GET /v1/agents?language=pt-BR&isPlayableCharacter=true`, que o site já busca
para a seção de agentes da inicial. De cada agente interessam `uuid`,
`displayName`, `displayIcon`, `role` e `abilities[]` (com `slot`,
`displayName`, `displayIcon`). O `slot` (`Ability1`, `Ability2`, `Grenade`,
`Ultimate`) é a chave da habilidade dentro de um ponto.

## O dado do site

### Formato de um ponto

```jsonc
{
  "id": "p_9f3a21",            // gerado no servidor
  "mapa": "<uuid do mapa>",
  "agente": "<uuid do agente>", // null numa posição que não é de agente
  "habilidade": "Grenade",      // slot; null quando não é util
  "lado": "ataque",             // "ataque" | "defesa"
  "tipo": "pixel",              // "pixel" (tem destino) | "posicao" (não tem)
  "de":   { "x": 0.42, "y": 0.63 },   // fração do minimapa
  "para": { "x": 0.31, "y": 0.22 },   // null quando tipo = "posicao"
  "titulo": "Smoke do Heaven do meio",
  "texto": "Encoste no canto da caixa, mire o topo do poste e solte.",
  "imagens": ["/api/media/clove-heaven-1.webp"],  // até 3, em ordem
  "video": "https://www.youtube.com/watch?v=...", // opcional
  "conferido": false,
  "criadoEm": "2026-10-30T23:00:00.000Z"
}
```

Regras que o servidor aplica, não a tela:

- `mapa` precisa ser um uuid de mapa conhecido; o servidor busca a lista de
  mapas uma vez por hora e recusa o que não estiver nela.
- `lado` só aceita `ataque` ou `defesa`; `tipo` só `pixel` ou `posicao`.
- `de` e `para` com x e y entre 0 e 1. Em `tipo: "pixel"`, `para` é obrigatório.
- `titulo` até 80 caracteres, `texto` até 600. Sem HTML: a tela escreve como
  texto, nunca como marcação.
- `video` só aceita link `https`, e só de YouTube — um campo de URL livre num
  painel é um convite a colar qualquer coisa que depois é servida aos
  visitantes.
- `imagens` é uma lista de até 3 caminhos servidos por `/api/media/`, em
  ordem: onde ficar, onde mirar, o resultado. Um print só raramente ensina
  um pixel, e três é o que cabe sem virar álbum.
- Teto de 2000 pontos no total, para a lista caber numa leitura só.

### Onde fica

Loja `estande-tatica` no Netlify Blobs, chave `pontos`, um array. É o mesmo
padrão do conteúdo do painel: leitura forte, gravação do objeto inteiro.

Um array único em vez de um registro por ponto porque a tela carrega todos os
pontos de um mapa de uma vez, e 2000 registros pequenos cabem folgados num
JSON só — dividir por mapa economizaria pouco e dobraria o caminho de escrita.

### A rota

`netlify/functions/tatica.mts`, caminho `/api/tatica`, no molde de
`content.mts`:

- `GET` — público, devolve todos os pontos. Aceita `?mapa=<uuid>` para filtrar
  no servidor. `cache-control: max-age=0, must-revalidate`, porque o painel
  edita e a pessoa precisa ver na hora.
- `POST` — exige `x-admin-key`, acrescenta um ponto, devolve o ponto com id.
- `PATCH` — exige chave, altera um ponto por id.
- `DELETE` — exige chave, apaga um ponto por id.
- Limite de taxa igual ao das outras rotas de escrita.

## A tela

`public/mapas.html` + `public/assets/js/mapas.js`, usando `site.css` como as
outras páginas (o arquivo único existe justamente porque CSS separado por
página já quebrou três vezes neste projeto).

**Estrutura:**

1. **Barra de mapas** — os 13 mapas como miniaturas (`listViewIcon`). O mapa
   escolhido fica guardado no `localStorage`, para quem voltar à página cair no
   mapa que estava usando.
2. **O minimapa**, grande, ocupando a maior parte da largura. Em cima dele:
   - as callouts, em texto pequeno e recessivo, que podem ser desligadas num
     botão;
   - os pontos filtrados, cada um um botão redondo com o ícone da habilidade
     (ou um marcador de posição quando não é util);
   - uma linha de `de` até `para` nos pontos do tipo pixel, desenhada em SVG
     por cima da imagem, na cor do lado (ataque e defesa não se confundem).
3. **Filtros** — agente (lista com ícone), habilidade (as quatro do agente
   escolhido), lado (ataque / defesa / os dois). Sem agente escolhido, a tela
   mostra as posições do mapa e nenhuma util, que é a visão de quem está
   decidindo onde se colocar.
   Mais um, que é o filtro que faz a diferença na prática: **clicar num lugar
   do minimapa** deixa só o que sai dali ou cai ali. É como se procura de
   verdade — "estou nesse canto, o que dá para fazer daqui" —, e sai de graça
   porque cada ponto já guarda `de` e `para`.
4. **Painel do ponto** — clicar num marcador abre, ao lado do mapa, o título, o
   texto, o print se houver e o vídeo se houver. Quando `conferido` é falso, o
   painel abre com um aviso dizendo que aquela entrada não foi testada em jogo.

**Acessibilidade:** cada marcador é um `<button>` com `aria-label` dizendo
agente, habilidade e lado; a lista de pontos do mapa também existe como lista
de texto abaixo do mapa, então quem não consegue clicar num ponto de 24px num
mapa ainda alcança o conteúdo.

**No celular:** o mapa ocupa a largura toda e o painel do ponto vira uma gaveta
que sobe por baixo, como a gaveta que o site já usa.

## O editor, no painel

Aba nova "Tática" em `admin.html`, no mesmo molde das outras:

1. Escolhe o mapa.
2. O minimapa aparece em tamanho de edição. O primeiro clique marca `de`, o
   segundo marca `para`. Um botão alterna entre "pixel" (dois cliques) e
   "posição" (um clique só).
3. Formulário ao lado: agente, habilidade (as do agente escolhido), lado,
   título, texto, imagem (pelo gerenciador de mídia que já existe) e vídeo.
4. Lista dos pontos daquele mapa, com editar, apagar e a caixa "conferido".

## O acervo inicial

Depois que a página estiver de pé, entra um conjunto de pontos escritos por
mim, para os agentes de controle (Clove, Brimstone, Viper, Omen, Astra).

**Em quais mapas:** nos 13 que a API marca como jogáveis. A rotação competitiva
não está em API nenhuma — a Riot anuncia em post — então amarrar o acervo à
"rotação atual" deixaria a especificação dependendo de um dado que o site não
tem. Cobrir os 13 com menos pontos cada é honesto e não envelhece sozinho; se
você quiser aprofundar os mapas que está jogando, isso é um pedido depois.

Três regras, e elas não são negociáveis:

1. **Texto meu, com minhas palavras.** Nada copiado de site, vídeo ou imagem de
   terceiros. Sem print: o campo fica vazio até alguém tirar o seu.
2. **Todos entram com `conferido: false`**, e a tela diz isso em cada um. Meu
   conhecimento de lineup tem data e muda de patch em patch; afirmar que um
   pixel funciona sem ter testado seria mentir para quem for usar.
3. **Posição antes de pixel.** Onde se posicionar e por onde a smoke tem que
   cair é informação que envelhece devagar e que eu acerto com confiança.
   Alinhamento fino de mira — "encoste no canto e mire o terceiro parafuso" — é
   o que mais erra, então entra em menor quantidade e com o aviso mais forte.

Quantidade pretendida: de 4 a 6 pontos por mapa, o que dá algo entre 50 e 80
entradas. Não é um acervo completo; é o bastante para a página não abrir vazia
e para o formato ficar claro quando você for cadastrar os seus.

## O que não entra

- Importar lineup de outro site, por raspagem ou cópia de banco.
- Hospedar print ou vídeo de terceiros.
- Lineup de habilidade que não seja de controle, nessa primeira leva.
- Conta de quem cadastrou: o painel tem uma chave só, e quem a tem é o dono.

## Verificação

Antes de dizer que está pronto:

1. As 22 callouts de Ascent caem nos lugares certos do minimapa — conferido
   olhando, não assumido.
2. Um ponto cadastrado pelo painel do começo ao fim aparece na página pública,
   com linha, ícone, texto e aviso de não conferido.
3. Editar e apagar esse ponto funcionam, e o apagado some da página.
4. Os filtros de agente, habilidade, lado e ponto no mapa recortam o que
   deviam.
5. A rota recusa, com a mensagem certa: sem chave, mapa inexistente,
   coordenada fora de 0–1, pixel sem destino, vídeo que não é do YouTube.
6. A página abre e é usável num celular.
7. Os outros caminhos do site continuam de pé — inicial, estande, linha e
   arsenal.

## Arquivos

| arquivo | o que muda |
|---|---|
| `public/mapas.html` | novo |
| `public/assets/js/mapas.js` | novo |
| `netlify/functions/tatica.mts` | novo |
| `netlify/lib/tatica.mts` | novo — formato, validação e os limites |
| `public/assets/css/site.css` | estilos da sala de mapas e do editor |
| `public/assets/js/admin.js` | aba Tática |
| `public/assets/js/api.js` | leitura de mapas com callouts |
| `netlify/lib/defaults.mts` | entrada na navegação e no bloco de atalhos |
| `public/index.html` | atalho para a página nova |
