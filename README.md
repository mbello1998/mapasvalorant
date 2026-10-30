# Estande

Treino de mira e dados ao vivo do VALORANT, em português do Brasil.

Três exercícios de mira, um minigame no estilo campo de treino com todas as
armas e skins, o catálogo completo de agentes e mapas, as notícias oficiais
chegando sozinhas, e um painel administrativo onde todo o conteúdo — textos,
cores, ícones, imagens e preços — é editado sem tocar em código.

---

## Publicar na Netlify

Você precisa fazer isto uma vez. Depois, tudo é pelo painel.

### 1. Subir o projeto

Com a pasta aberta no terminal:

```bash
npm install
npx netlify login
npx netlify deploy --prod
```

Na primeira vez, o CLI pergunta se é um site novo — responda que sim e escolha
um nome. Ele detecta o `netlify.toml` sozinho.

Se preferir pelo Git, mande a pasta para um repositório e conecte na Netlify.
A configuração de build já está no `netlify.toml`.

### 2. Definir a chave do painel

Sem esta chave o painel não salva nada — é de propósito.

Na Netlify, em **Site configuration → Environment variables**, crie:

| Variável | Valor | Escopo |
|---|---|---|
| `ADMIN_KEY` | uma senha longa só sua (mínimo 8 caracteres) | precisa incluir **Functions** |

Depois de criar a variável, **publique de novo** (`npx netlify deploy --prod`).
Variáveis de ambiente ficam congeladas por publicação.

### 3. Entrar no painel

Abra `https://seu-site.netlify.app/admin.html` e informe a chave.

---

## As três páginas

### Início (`/`)

A calibração de cinco alvos, os três exercícios de mira (Gridshot, Tracking e
Flick), os dados ao vivo do jogo, o feed de notícias e o catálogo de agentes e
mapas em português.

### A Linha de Tiro (`/linha.html`)

O minigame no estilo campo de treino. Você escolhe um dos 30 agentes, uma das
21 armas e uma das 1.412 skins, e atira em bonecos que aparecem entre 8 e 45
metros de distância.

O que torna isso diferente de um aim trainer comum é que **a arma importa de
verdade**. Tudo abaixo vem das estatísticas que a Riot publica:

| Mecânica | De onde vem | O que acontece na prática |
|---|---|---|
| Cadência | `fireRate` | Clicar mais rápido que a arma permite não dispara |
| Carregador | `magazineSize` | Acabou a munição, recarrega sozinha |
| Recarga | `reloadTimeSeconds` | Nenhum tiro sai durante a recarga |
| Saque | `equipTimeSeconds` | A arma demora a ficar pronta no início da rodada |
| Dano | `damageRanges` | Cabeça, corpo e perna doem diferente, e a distância muda o número |
| Chumbinhos | `shotgunPelletCount` | O tiro de escopeta é a soma dos chumbinhos, não um só |
| Spray | `firstBulletAccuracy` | A mira abre a cada tiro seguido e fecha quando você para |

Os bonecos têm 100 de vida, como no campo de treino do jogo. Com a Vandal, um
tiro na cabeça a qualquer distância são 160 e mata. Com a Phantom, passados 20
metros cai para 140 e não mata mais. A Judge a 10 metros tira 204 no corpo; a
30 metros, 84.

O agente escolhido dá uma vantagem conforme a função — alvos mais perto,
contorno marcado, recarga mais rápida, tempo extra por abate. **Isso é regra
deste minigame, não do VALORANT**, e a página avisa isso na tela.

A skin é só a arte: ela aparece no HUD durante a rodada. Se você montou um
loadout no Arsenal, ela já vem equipada aqui.

Os recordes são guardados por arma.

#### Entrada no mapa, som e primeira pessoa

Ao começar a rodada o site mostra uma **tela de entrada no mapa**, com a arte
oficial do campo de treino, o retrato do agente escolhido, a arma com a skin e
uma barra de progresso. Depois dela vem a contagem, e só então a rodada começa.

Durante a rodada você vê a **arma em primeira pessoa** no canto de baixo: é a
arte oficial da skin equipada, com recuo a cada tiro, clarão no cano, balanço
de respiração e um mergulho durante a recarga. Do lado dela há um antebraço e
uma luva nas cores do próprio agente, tiradas do `backgroundGradientColors`
dele — Neon fica roxa, Fade fica azul-escura, e assim por diante.

Os **bonecos são o modelo real do campo de treino**, em
`public/assets/img/alvo.png`. A imagem veio com fundo cinza e com as linhas do
gizmo de eixo do visualizador 3D; o recorte foi feito por alagamento a partir
das bordas, passando só por pixel cinza neutro — assim as sombras pretas de
dentro do boneco sobreviveram, que é o que um corte por cor simples teria
estragado. As linhas de eixo saíram depois, por matiz e por posição. As caixas
de acerto foram medidas no próprio sprite (capacete até 15% da altura, tronco
e braços até 58%, pernas daí para baixo), para a cabeça que se vê ser a cabeça
que conta.

O **fundo do campo** é uma captura do campo de treino visto de dentro, em
`public/assets/img/the-range.webp`, esmaecida o suficiente para o alvo
vermelho continuar legível por cima. O balcão de sacos de areia é recortado
dos 66% de baixo da imagem e **redesenhado por cima dos bonecos**: quem está
perto fica com as pernas atrás da barricada, como no jogo. Dá para trocar a
imagem pela aba **Linha de Tiro** do painel — se trocar, ajuste o corte do
balcão na constante `BALCAO` em `linha.js`.

Essa imagem é uma captura de tela do jogo, obtida de um wiki de fãs. Não veio
do CDN da Riot como o resto da arte do site: se um dia ela precisar sair, o
código volta sozinho para o estande desenhado à mão, que continua no arquivo.

Há **som em tudo**: tiro, recarga, carregador vazio, saque da arma, acerto no
corpo, acerto na cabeça, abate, ricochete, entrada no mapa, contagem e fim de
rodada. O botão no campo liga, desliga e ajusta o volume, e a escolha fica
guardada.

A tela de entrada toca uma **faixa de verdade**, em
`public/assets/audio/carregamento.mp3`. Ela é decodificada uma vez, assim que a
página abre, para não atrasar o primeiro clique, e passa pelo mesmo barramento
do resto do som — o botão de ligar/desligar e o volume valem para ela também.
Ao sair da tela, ela some com desvanecimento em vez de ser cortada seca, e não
invade a rodada.

Com faixa, a tela de entrada fica 3 segundos no ar; em 2 a música mal começava.
Sem faixa, volta para 2 segundos — não há motivo para segurar ninguém. Dá para
trocar o arquivo pela aba **Linha de Tiro** do painel. **Se o arquivo faltar ou
não decodificar, o som sintetizado assume sozinho** e a tela nunca fica muda —
testado apontando para um caminho inexistente.

#### Três coisas que não são o jogo original, e por quê

Seria desonesto deixar isso implícito:

1. **Os efeitos são sintetizados, exceto onde há gravação.** Acerto, abate,
   contagem e ricochete são montados na hora por um motor de síntese em
   `audio.js`, a partir das estatísticas da arma. Arma que tenha um pacote de
   gravação em `assets/audio/armas/` usa a gravação no lugar — hoje só a
   Vandal. As outras vinte continuam sintetizadas, e a ficha de cada arma diz
   qual é o caso. A Judge dispara doze estalos
   sobrepostos porque o `shotgunPelletCount` dela é doze; a Operator é grave e
   longa porque tira 150 no corpo; a Stinger é fina e seca porque atira 18
   vezes por segundo. Cada arma soa diferente de cada outra, e a família se
   reconhece — mas nenhuma soa igual à do jogo.

2. **As mãos não são as do jogo.** Os braços em primeira pessoa do VALORANT são
   modelos 3D que não existem em nenhuma fonte pública. Tentei recortar o braço
   de uma captura em primeira pessoa e **não dá**: a manga é escura e de baixo
   contraste contra uma arma igualmente escura, e ainda tem o HUD do jogo (a
   munição, os ícones de habilidade, a barra de vida) desenhado por cima dela.
   Qualquer máscara automática sai esfarrapada e com pedaço de HUD junto. O que
   existe é antebraço, luva e punho desenhados no canvas, com a geometria
   copiada dessa captura — manga na diagonal, faixa clara no punho, luva de
   couro fechada no cabo — e a cor da manga vindo do agente escolhido.

3. **A arma em primeira pessoa é a arte de loja, não o modelo 3D.** É a mesma
   imagem que aparece no Arsenal, posicionada e animada como viewmodel.

O que é oficial: a arte do mapa, o retrato do agente, o ícone do agente, a arte
de cada skin, o modelo do boneco de treino, a faixa da tela de entrada, e todos
os números.

#### A arma apontada, não deitada

A arte que a Riot publica de cada skin é um **perfil lateral**: a arma inteira
de lado, do mesmo tamanho da coronha até a boca. Desenhada assim na tela, ela
fica deitada em vez de apontada — parecia uma arma flutuando de través.

A correção está em `cena.js`: a imagem é fatiada em tiras verticais finas, e
cada tira é desenhada um pouco menor que a anterior conforme se afasta da
coronha, convergindo para onde se mira. O olho lê isso como profundidade — a
coronha perto e grande, a boca longe e pequena, o cano apontado para os alvos.

A primeira tentativa usou trinta tiras e virou uma escada: com tiras grossas o
degrau entre uma e outra aparece. Agora é uma tira a cada ~3 px de destino.

#### Tela cheia

Ao começar a rodada, a moldura do campo vai para tela cheia e volta sozinha
quando a rodada acaba — ou quando a pessoa aperta Esc, que o site escuta para
remedir o canvas.

Duas coisas que só aparecem depois de testar:

- **Em tela cheia o navegador desenha só o elemento escolhido e o que está
  dentro dele.** A tela de entrada no mapa morava no `<body>`, então sumiria.
  Ela é mudada de lugar enquanto dura a tela cheia e volta depois.
- **O painel lateral fica de fora.** Sem ele, o jogador perderia de vista
  abates e tempo no meio da rodada, então os dois passam a ser desenhados no
  próprio canvas enquanto a tela cheia estiver ativa.

O canvas se ajusta ao menor dos dois lados da janela, para caber sem cortar
nem distorcer. Numa janela de 1536×639 ele fica 1065×639.

A API de tela cheia exige um clique de gente de verdade: o navegador recusa
com `not granted` se o clique vier de automação. Por isso essa parte foi
verificada na lógica (a migração da tela de carga, o redimensionamento, a
volta ao sair), não com o navegador realmente em tela cheia.

### Envio automático para o ranking

Ao fim de qualquer treino — os três exercícios de mira e a Linha de Tiro — o
resultado vai para a tabela pública sozinho, com duas condições: **estar
logado** e **ter o envio automático ligado**. Sem conta nada sai; não há de
quem seria a pontuação.

O interruptor fica à vista em cada treino, a escolha é guardada no navegador, e
o padrão é ligado. Isso importa porque a tabela é pública: o resultado de uma
pessoa fica visível para qualquer um que abra a página, e publicar sem ela
poder recusar seria decidir por ela.

Falha de envio é silenciosa de propósito. O treino é a coisa principal; se o
ranking recusar — sessão sem acerto, número fora do possível, ranking fora do
ar — ninguém leva um erro na cara no fim da rodada. O botão manual na página
do ranking continua lá.

As travas do ranking continuam valendo, e o envio automático bate nelas de
verdade: uma rodada sem nenhum abate é recusada com 422, e um Gridshot acima
de 9 alvos por segundo também.

### Um CSS só

`site.css` e `paginas.css` viraram um arquivo. A separação deu problema três
vezes seguidas: uma classe usada também na inicial ficava no arquivo que a
inicial não carregava, e o estilo simplesmente não aplicava — selo de patente
a 280 px em vez de 72, campos do formulário de login embolados, faixa de
boas-vindas por baixo do trilho. Em cada caso a página funcionava, o CSS
existia, e o navegador nunca o via.

São 58 KB sem compressão, uns 10 KB comprimidos. A duplicação de alguns bytes
em páginas que não usam tudo é barata perto de um bug que voltou três vezes.

### Entradas de exemplo e contador de presença

Duas coisas para o site não parecer morto antes de ter gente, e as duas são
decisão sua pelo painel:

**Entradas de exemplo no ranking.** Dois botões na aba **Ranking** criam e
apagam treze entradas de demonstração. Elas aparecem com a etiqueta
**"exemplo"** na tabela pública e em itálico na inicial. A marca não é
enfeite: sem ela seriam pontuações inventadas passando por pontuações de
gente, e a tabela estaria mentindo para quem a lê.

**Contador de presença.** Na aba **Catálogo**, dois modos:

- **Contagem real** (padrão): quem está com a aba aberta agora, e quantas
  pessoas distintas passaram nas últimas 24 horas. Os dois números são medidos
  de verdade.
- **Número fixo**: mostra o número e o rótulo que você escrever. É a mesma
  lógica do bloco de jogadores do VALORANT — o site publica o que o painel diz,
  e a escolha do que dizer é sua.

### Atualização sem recarregar

O ranking da inicial e a tabela de `/ranking.html` se refazem de minuto em
minuto enquanto a aba está à vista, e o contador de presença a cada 50
segundos. Quem publicou um resultado em outra aba vê a mudança aqui sem
recarregar nada; quem deixou a página aberta não fica olhando um número velho.

Em aba escondida nada disso roda — o navegador segura o relógio de qualquer
forma, e quem não está olhando não precisa ser contado como presente.

### Cache: por que uma publicação demorava a aparecer

O `netlify.toml` mandava cachear tudo em `/assets/*` por uma hora **sem
revalidar**. O efeito não era óbvio: a publicação ia para o ar na hora, o
servidor tinha o arquivo novo, mas o navegador de quem já tinha visitado
seguia rodando o JavaScript antigo por até uma hora. A página carregava, o
resto funcionava, e só a parte nova ficava parada — foi assim que o ranking da
inicial apareceu travado em "Carregando o ranking…".

A política agora é separada por tipo:

| Caminho | Cache | Por quê |
|---|---|---|
| `/assets/js/*` e `/assets/css/*` | `max-age=0, must-revalidate` | Com ETag, revalidar custa um 304 por carregamento. Em troca, a publicação chega na hora. |
| `/assets/img/*` e `/assets/audio/*` | `max-age=86400, must-revalidate` | Pesados e mudam pouco. Trocar um sem renomear demora até um dia para chegar. |
| HTML | `max-age=0, must-revalidate` | Padrão da Netlify, e é o certo. |

Se um dia o site ganhar um empacotador que põe hash no nome dos arquivos, o
JavaScript e o CSS podem voltar para cache longo — com hash no nome, arquivo
novo é endereço novo, e o problema deixa de existir.

### Ranking na página inicial

A seção **Ranking** do index mostra, sem precisar abrir outra página:

- **o elo médio de todo mundo**, com a patente correspondente;
- as três primeiras posições de cada exercício.

A média é **por pessoa, não por envio**: primeiro tira-se a média de cada
apelido, depois a média dessas médias. Sem isso, quem treinou os quatro
exercícios pesaria quatro vezes mais que quem treinou um.

O cálculo vem pronto do servidor, no campo `resumo` de `/api/ranking` — a
página não soma nada por conta própria.

### Mudar o elo de alguém pelo painel

Na aba **Ranking** do painel, cada entrada tem um seletor com as 25 patentes.
Trocar ali chama `PATCH /api/ranking` e muda o que a tabela pública mostra.

A entrada fica marcada como **"ajustado"** na tabela pública, e isso é de
propósito: sem a marca, o rótulo "elo estimado" passaria a mentir para quem lê
— aquele número deixou de vir do desempenho. A consolidação periódica respeita
o ajuste e não o desfaz.

### Pacotes de som por arma

Os arquivos originais da Vandal vieram como quatro WAV de 24 bits a 96 kHz,
somando 38 MB, e nenhum deles era um tiro só: o "Fire Tap" tinha dez disparos
avulsos espaçados de três segundos, o "Fire Spray" quatro rajadas de 3,3 s e o
"Reload" seis recargas em sequência.

`scripts/extrai-armas.py` resolve isso: acha cada evento pela energia do sinal,
corta, normaliza, converte para 48 kHz mono, emenda tudo num arquivo só com
60 ms de silêncio entre os pedaços e grava um mapa de offsets. Resultado:

| | |
|---|---|
| Antes | 38 MB em quatro WAV |
| Depois | **210 KB** num MP3 + 1,3 KB de JSON |
| Conteúdo | 10 tiros avulsos, 14 fatias de rajada, 1 equipar, 1 recarregar |

A folga de 60 ms não é decoração: o decodificador de MP3 acrescenta alguns
milissegundos no começo, e sem ela um pedaço invadiria o vizinho.

**Tiro solto soa diferente de rajada**, e o pacote tem os dois. A régua é o
intervalo entre disparos: abaixo de 260 ms o jogo usa a gravação de rajada,
acima usa a de tiro avulso — e o volume cai um pouco na rajada, porque vinte e
cinco tiros no talo cansam. Cada disparo sorteia uma das variações, então a
arma não fica mecânica.

Para dar som a outra arma: ponha os WAV na raiz, ajuste os nomes no script,
rode, e o jogo acha sozinho pelo nome da arma (`Vandal` → `vandal.mp3`). Sem
pacote, cai no sintetizador — nenhuma arma fica muda.

### Sobre os arquivos que você trouxe

Três coisas no site não vieram do CDN da Riot como o resto: a captura do campo
de treino (`the-range.webp`), o boneco de treino (`alvo.png`) e a faixa de
carregamento (`carregamento.mp3`). São material do jogo, obtido por você, e
estão aqui porque você pediu. Vale saber disso na hora de publicar: um site de
fã costuma conviver bem com isso, mas a decisão é sua, não minha. Os três são
trocáveis pelo painel, e o site continua funcionando sem nenhum deles — volta
para o estande desenhado, a silhueta de reserva e o som sintetizado.

### Arsenal (`/arsenal.html`)

As 1.412 skins com raridade, níveis, cromas e vídeo, filtráveis por arma,
raridade e coleção, com busca por nome de skin ou de coleção.

O montador de loadout tem um espaço por arma, na ordem da loja do jogo, e soma
o preço conforme você escolhe — em VP e em reais, com a quebra por raridade.

---

### Ranking (`/ranking.html`)

Três coisas numa página:

1. **Seu elo estimado** — calculado dos seus recordes guardados neste
   navegador, com a patente de cada exercício e a média geral.
2. **A tabela publica** — até cem posições por exercício, uma por apelido (a
   melhor de cada um), com a patente estimada ao lado.
3. **A escala inteira** — as 25 patentes do VALORANT e o desempenho que o site
   associa a cada uma.

Nada vai para o ranking sem você mandar: há um botão "Publicar no ranking" em
cada exercício, e ele pede um apelido.

#### Como o elo é calculado

Duas etapas. O desempenho vira um índice de 0 a 100, interpolado entre marcos
definidos por exercício; o índice vira uma das 25 patentes, de Ferro 1 a
Radiante.

| Exercício | Métrica | Ferro 1 | Ouro 1 | Diamante 1 | Radiante |
|---|---|---|---|---|---|
| Gridshot | alvos/s | 0,6 | ~2,1 | ~3,3 | 5,2 |
| Tracking | tempo em alvo | 12% | ~42% | ~66% | 88% |
| Flick | reação média | 620 ms | ~400 ms | ~295 ms | 200 ms |
| Linha de Tiro | abates/min | 4 | ~16 | ~28 | 46 |

Os marcos estao em `public/assets/js/elo.js` e repetidos em
`netlify/lib/elo.mts`. **Se mexer, mexa nos dois** — o servidor recalcula o
índice por conta própria, porque não pode confiar no que o navegador manda.

#### O que o ranking não é

Publicar **exige conta**, então o apelido na tabela tem dono: ninguém publica
no nome de outro. Mas conta resolve identidade, não honestidade — **não é à
prova de trapaça**, porque dá para forjar o corpo do envio do mesmo jeito. O
que existe:

- teto de sanidade por exercício (reação abaixo de 110 ms, mais de 9 alvos/s e
  afins são recusados na hora);
- coerência entre os campos — acertos nunca passa de tiros, sessão tem que ter
  durado pelo menos 10 segundos, cadência de cliques tem limite;
- uma entrada por apelido por exercício, sempre a melhor;
- vinte envios por minuto por IP, aplicado pela própria Netlify;
- apelidos reservados bloqueados (admin, riot, valorant e afins);
- o apelido vem da conta logada, nunca do corpo da requisição;
- botão de apagar na aba **Ranking** do painel.

**E a patente é uma estimativa deste site, não uma medição da Riot.** Mira é
uma parte do jogo e nem é a maior — posicionamento, utilidade e cabeça fria
contam tanto quanto. A página diz isso em cima e embaixo.

#### Como o ranking é guardado

Cada envio vira um blob próprio, com chave única. Ninguém nunca lê-e-reescreve
a mesma chave, então dois envios ao mesmo tempo não se atropelam — o que
aconteceria com uma lista única sendo reescrita, e é justamente o que o Blobs
não garante. A função agendada `consolidar-ranking` roda de dez em dez minutos
e junta tudo numa tabela só; ela é escritor único, então a reescrita é segura.
Os envios só são apagados depois de a tabela estar gravada, nessa ordem: uma
falha no meio repete trabalho, nunca perde dado.

Netlify DB (Postgres) seria o lugar natural para isso, mas exige plano pago. O
desenho acima resolve o mesmo problema dentro do Blobs, sem custo adicional.

## Quem está online

Duas contagens lado a lado na seção **O que está no ar**, e elas são bem
diferentes uma da outra:

**Agora no site** — número real, contado no servidor. Cada aba gera um id
aleatório, guardado só naquela aba, e marca presença a cada 50 segundos. A
contagem é quantos ids distintos apareceram nos últimos dois minutos. O id não
é ligado a conta, a IP nem a nada: serve para a mesma aba não contar duas
vezes, e nada nele identifica ninguém.

Guardado em `estande-presenca`, uma chave por aba por minuto (`p/<minuto>/<id>`).
Contar é um `list` dos dois últimos minutos, sem ler valor nenhum — o id já
está na chave. Nenhum contador é incrementado, que é o que não se deve fazer no
Blobs. `limpar-presenca` apaga as marcas com mais de cinco minutos.

**Jogadores de VALORANT** — este **não é ao vivo**, e não dá para ser. A Riot
não publica quantas pessoas estão jogando: não existe API para isso, nem
oficial nem de terceiros que mereça confiança. O site não inventa esse número.
O que aparece é o que você escrever na aba **Catálogo** do painel, com rótulo,
o que o número mede e a fonte com data. Vazio, o bloco simplesmente não
aparece.

## Contas

O site inteiro é aberto: treinar, ver skins, notícias, agentes, mapas e o
próprio ranking não pedem nada. A conta só entra na hora de **publicar** uma
pontuação, que é onde importa saber de quem é o número. Uma faixa no topo
explica isso na primeira visita e some quando a pessoa dispensa.

### Como a senha é guardada

- **scrypt** (N=16384, r=8, p=1) com sal próprio de 16 bytes por conta. É lento
  de propósito: quem roubar o depósito não testa bilhões de palpites por
  segundo, e duas pessoas com a mesma senha têm hashes diferentes.
- Comparação em **tempo constante**, para a resposta não vazar o quanto o
  palpite chegou perto.
- A chave no depósito é o **SHA-256 do e-mail**, não o e-mail — quem listar o
  depósito não extrai uma lista de endereços.
- A sessão é um token aleatório de 32 bytes, guardado também em hash, num
  cookie **HttpOnly, Secure, SameSite=Lax**. Nenhum script da página lê o token.
- Erro de login nunca diz se o e-mail existe: `E-mail ou senha incorretos` vale
  para os dois casos. E o scrypt roda mesmo sem conta, para o tempo de resposta
  não denunciar quais e-mails estão cadastrados.
- Oito erros seguidos travam a conta por 15 minutos; a plataforma limita a 12
  requisições por minuto por IP.
- Senhas abaixo de 8 caracteres e as que aparecem em toda lista de vazamento
  são recusadas.

### O que as contas NÃO fazem

Isto precisa estar escrito, porque muda o que você pode prometer aos usuários:

- **Não há verificação de e-mail.** Não existe serviço de envio ligado ao site,
  então qualquer pessoa se cadastra com qualquer endereço. O e-mail aqui é
  identificador, não prova de nada.
- **Não há recuperação de senha.** Pelo mesmo motivo: sem envio de e-mail, não
  há como provar que alguém é dono da caixa. Quem esquecer perde a conta — o
  painel pode apagá-la para liberar o e-mail.
- **Não há segundo fator.**

Para um placar de treino isso é proporcional. Se o site um dia guardar algo que
importe de verdade, troque por um provedor de identidade (Discord OAuth cairia
bem para este público) em vez de ampliar o que está aqui.

## O painel

O endereço é `/admin.html`. O link também fica no rodapé do trilho lateral.

| Aba | O que controla |
|---|---|
| **Identidade** | Nome, tagline, descrição, logo e favicon |
| **Tema** | As seis cores que sustentam o site inteiro |
| **Abertura** | Título, texto, imagem de fundo e os dois botões da primeira tela |
| **Navegação** | Os itens do trilho lateral, com ordem |
| **Estande** | Os exercícios: nome, descrição, ícone, duração e qual fica em destaque |
| **Lançamentos** | As publicações que você escreve, que entram no mesmo feed das oficiais |
| **Catálogo** | Títulos das seções de agentes e mapas, e quem aparece primeiro |
| **Rodapé** | Textos e links |
| **Notícias** | Quantas oficiais mostrar, quais categorias esconder, e o diagnóstico da coleta |
| **Arsenal** | Preço por raridade, multiplicador de faca e a conversão para reais |
| **Linha de Tiro** | Duração da rodada, agente e arma iniciais |
| **Ranking** | Textos da página e o botão de apagar entrada por entrada |
| **Mídia** | Biblioteca de imagens: arraste para enviar, e use em qualquer campo |

Cada campo de imagem aceita três caminhos: colar uma URL, enviar um arquivo na
hora, ou escolher da biblioteca.

**Publicar alterações** grava para todo mundo. **Baixar JSON** salva uma cópia
do conteúdo no seu computador. **Restaurar padrão** volta ao conteúdo original
— as imagens enviadas continuam na biblioteca.

### Sobre a segurança do painel

A chave é uma senha única, compartilhada por quem tiver acesso. Ela protege a
escrita, não é um sistema de contas: não há usuários, nem registro de quem
mudou o quê. Para um site de conteúdo editado por uma pessoa, é proporcional.
Se mais gente for editar, troque por autenticação de verdade (Netlify Identity
ou um provedor OAuth).

A chave fica guardada apenas na sessão do navegador e some quando a aba fecha.

---

## De onde vêm os dados

| Dado | Fonte | Atualização |
|---|---|---|
| Patch no ar, build, dias no ar | `valorant-api.com/v1/version` | automática, cache de 5 min |
| Ato e episódio, com progresso | `valorant-api.com/v1/seasons` | automática, cache de 5 min |
| Agentes, habilidades, funções | `valorant-api.com/v1/agents` em pt-BR | automática, no navegador |
| Mapas e arte oficial | `valorant-api.com/v1/maps` em pt-BR | automática, no navegador |
| Armas e estatísticas | `valorant-api.com/v1/weapons` em pt-BR | automática, cache de 6 h |
| Skins, raridades, cromas, vídeos | `valorant-api.com/v1/weapons/skins` em pt-BR | automática, cache de 6 h |
| **Notícias oficiais** | `playvalorant.com/pt-br/news` | **automática, de 2 em 2 horas** |
| Publicações suas | você, pelo painel | quando publicar |
| **Patentes (Ferro → Radiante)** | `valorant-api.com/v1/competitivetiers` em pt-BR | automática, no navegador |
| Ranking público | quem publicar, pelo site | na hora; consolidado a cada 10 min |

### Como as notícias chegam sozinhas

A Riot não publica RSS nem API aberta de notícias. A página de notícias dela é
um app Next.js que embute os 200 artigos num `<script id="__NEXT_DATA__">`. A
função agendada `coletar-noticias` lê essa página de duas em duas horas,
extrai título, resumo, categoria, data e imagem em português, e guarda no
Netlify Blobs. O site lê de lá.

Isso é raspagem de uma estrutura que não nos pertence, e **pode quebrar sem
aviso** se a Riot mudar o site. O coletor foi feito pensando nisso:

- nunca sobrescreve uma coleta boa com uma falha — o site continua mostrando a
  última lista que funcionou;
- se a estrutura mudar, a aba **Notícias** do painel mostra exatamente o que
  deu errado;
- se o depósito estiver vazio, a rota `/api/noticias` coleta na hora, para a
  página nunca abrir sem notícia nenhuma.

Funções agendadas só disparam em publicações de produção. Para rodar na mão:
`npx netlify functions:invoke coletar-noticias`.

### Sobre os preços das skins

A API da Riot **não expõe preço**. O que o site faz é aplicar o valor de tabela
por raridade, na mesma ordem de rank que a própria Riot usa internamente:

| Raridade | VP |
|---|---|
| Edição Selecionada | 875 |
| Edição Deluxe | 1.275 |
| Edição Premium | 1.775 |
| Edição Exclusiva | 2.175 |
| Edição Ultra | 2.475 |

Faca custa o dobro da arma da mesma raridade. Skin de passe de batalha, evento
ou recompensa não tem preço avulso — o site marca essas como "não vendida por
VP" e as deixa fora da conta do loadout.

Tudo isso é editável na aba **Arsenal** do painel, inclusive a conversão para
reais (padrão: 25 VP por real, que é o pacote de 1.000 VP a R$ 40). O valor em
reais é sempre mostrado como aproximado.

### O que não está aqui

**Status dos servidores brasileiros.** A Riot não publica mais um feed aberto:
o endpoint antigo nem resolve em DNS, e `status.riotgames.com` não expõe JSON.
O rodapé manda para a página oficial, que é a resposta honesta. Se um dia você
quiser o status dentro do site, a API não-oficial da Henrik tem esse dado e
precisa de uma chave gratuita, pedida no Discord deles.

**Preço real da loja do jogador.** Isso exige autenticação na conta Riot, que
nenhum site de fã pode (nem deve) fazer.

---

## Rodar na sua máquina

```bash
npm install
npx netlify dev
```

Abre em `http://localhost:8888`. Crie um arquivo `.env` na raiz com:

```
ADMIN_KEY=alguma-chave-de-teste
```

O `netlify dev` usa um armazenamento local isolado — o que você editar aqui não
toca no site publicado.

---

## Como está organizado

```
public/                 o que vai para o ar
  index.html            a página inicial
  linha.html            o minigame
  arsenal.html          as skins e o montador de loadout
  admin.html            o painel
  404.html
  assets/css/
    tokens.css          cores, tipografia e espaçamento
    site.css            todo o site, numa folha só
    admin.css           o painel
  assets/js/
    api.js              acesso às fontes de dados
    chrome.js           tema, trilho e rodapé — o que toda página tem igual
    app.js              a página inicial
    range.js            os três exercícios de mira
    linha.js            o minigame
    ranking.js          elo estimado e tabela pública
    elo.js              marcos de desempenho e patentes (espelhado no servidor)
    conta.js            login, cadastro e a faixa de boas-vindas
    publicar.js         envio automático do treino e o interruptor
    cena.js             fundo, balcão em primeiro plano e a arma na mão
  assets/img/           boneco recortado e a foto do campo
  assets/audio/         a faixa da tela de entrada
  assets/audio/armas/   pacotes de som por arma (MP3 + mapa de offsets)
    audio.js            síntese do som, a partir das estatísticas das armas
    arsenal.js          as skins e o loadout
    admin.js            o painel

netlify/functions/
  content.mts           GET público, PUT e DELETE com chave
  media.mts             envio, listagem e entrega das imagens
  live.mts              agrega patch, ato e catálogo, com cache
  arsenal.mts           armas e skins, enxugadas de 3,5 MB para 1,2 MB
  noticias.mts          entrega as notícias já coletadas
  coletar-noticias.mts  a coleta agendada, de 2 em 2 horas
  conta.mts             cadastro, entrada e saída
  presenca.mts          marca e conta quem está no site
  limpar-presenca.mts   apaga as marcas velhas, de 15 em 15 min
  ranking.mts           ler, publicar e apagar no ranking
  consolidar-ranking.mts  junta os envios na tabela, de 10 em 10 min
netlify/lib/
  defaults.mts          o conteúdo original do site
  auth.mts              conferência da chave
  noticias.mts          a raspagem do site oficial
  elo.mts               a mesma conta de elo, recalculada no servidor
  contas.mts            scrypt, sessões e castigo por erro de senha
```

O conteúdo editado e as imagens ficam no Netlify Blobs, em cinco depósitos:
`estande` (conteúdo), `estande-midia` (imagens), `estande-cache` (dados ao vivo
e catálogo), `estande-noticias` (a coleta), `estande-ranking` (o placar) e
`estande-contas` (as contas e sessões) e `estande-presenca` (quem está online). São depósitos do site inteiro: uma
publicação de prévia enxerga e sobrescreve os mesmos dados da produção.

O progresso dos minigames — recordes, histórico de precisão e o loadout
montado — fica no `localStorage` do próprio jogador. Não vai para o servidor e
não é compartilhado entre dispositivos.

---

## Sobre o design

Fundo de aço frio, vermelho de sinal para o que está ao vivo e para os alvos,
latão para recorde e ato. Nenhum canto é arredondado: o chanfro diagonal é a
assinatura estrutural, e o tamanho do corte indica a hierarquia da superfície.
A cor da raridade das skins é a oficial da Riot, e nunca aparece sozinha — o
nome da raridade vem escrito ao lado.

O único momento de movimento forte do site é a entrada no exercício: as luzes
do campo de tiro sobem e a seção inteira inverte para o ambiente claro. É um
gesto só, e ele respeita `prefers-reduced-motion`.

---

Projeto de fã. Não é afiliado nem endossado pela Riot Games. VALORANT e seus
ativos são propriedade da Riot Games, Inc.
