# -*- coding: utf-8 -*-
"""Extrai as amostras da Vandal e monta um pacote unico.

Os arquivos originais sao compilacoes: o "Fire Tap" tem dez tiros avulsos
espacados de tres segundos, o "Fire Spray" tem quatro rajadas de 3,3 s, e o
"Reload" tem seis recargas seguidas. Nada disso serve cru num jogo onde cada
clique e um tiro.

O que este script faz: acha cada evento, corta, normaliza, emenda tudo num
arquivo so com folga de silencio entre os pedacos, e grava um mapa de offsets.
O navegador baixa um arquivo, decodifica uma vez e toca pedaco por pedaco.

A folga entre os pedacos existe por causa do MP3: o decodificador acrescenta
um atraso de alguns milissegundos no inicio, e sem a folga esse deslocamento
faria um pedaco invadir o vizinho.
"""
import json
import wave
import numpy as np
import lameenc

# Os .wav originais da Riot ficam fora de `public`: sao a materia-prima do
# pacote, nao arquivo servido. Trinta e oito megabytes nao sobem num site.
FONTES = "../fontes/audio/"

TAXA_SAIDA = 48000
FOLGA = 0.06          # silencio entre pedacos, em segundos
PICO_ALVO = 0.89

def ler(p):
    with wave.open(p, "rb") as w:
        n, canais, larg, taxa = w.getnframes(), w.getnchannels(), w.getsampwidth(), w.getframerate()
        bruto = w.readframes(n)
    if larg == 3:
        a = np.frombuffer(bruto, dtype=np.uint8).reshape(-1, 3).astype(np.int32)
        v = (a[:, 0] | (a[:, 1] << 8) | (a[:, 2] << 16))
        v = np.where(v & 0x800000, v - 0x1000000, v).astype(np.float32) / 8388608.0
    elif larg == 2:
        v = np.frombuffer(bruto, dtype="<i2").astype(np.float32) / 32768.0
    else:
        v = np.frombuffer(bruto, dtype=np.uint8).astype(np.float32) / 128.0 - 1
    mono = v.reshape(-1, canais).mean(axis=1)
    return mono, taxa

def reamostrar(x, de, para):
    if de == para:
        return x
    n = int(round(len(x) * para / de))
    return np.interp(np.linspace(0, len(x) - 1, n), np.arange(len(x)), x).astype(np.float32)

def arruma(x, fade_ini=0.003, fade_fim=0.05):
    """Normaliza e aplica fades, para nao estalar no comeco nem cortar seco."""
    pico = np.abs(x).max()
    if pico > 1e-6:
        x = x * (PICO_ALVO / pico)
    ni = max(1, int(fade_ini * TAXA_SAIDA))
    nf = max(1, int(fade_fim * TAXA_SAIDA))
    if len(x) > ni + nf:
        x[:ni] *= np.linspace(0, 1, ni)
        x[-nf:] *= np.linspace(1, 0, nf)
    return x

def inicios(x, taxa, limiar_rel=0.22, minimo_ms=60):
    """Onde cada disparo comeca, pela subida brusca de energia."""
    jan = int(taxa * 0.002)
    env = np.abs(x[:len(x)//jan*jan]).reshape(-1, jan).max(axis=1)
    d = np.diff(env, prepend=env[0])
    lim = d.max() * limiar_rel
    passo = max(1, int(minimo_ms / 2))
    achados, ultimo = [], -10**9
    for i, val in enumerate(d):
        if val > lim and i - ultimo > passo:
            achados.append(i * jan)
            ultimo = i
    return achados

pecas = []     # (nome_do_grupo, amostras)

# --- tiros avulsos: dez variacoes ---
tap, taxa = ler(FONTES + "Prime Vandal Fire Tap.wav")
tap = reamostrar(tap, taxa, TAXA_SAIDA)
for k in range(10):
    ini = int(k * 3.0 * TAXA_SAIDA)
    fim = ini + int(0.55 * TAXA_SAIDA)
    if fim <= len(tap):
        pecas.append(("tiro", arruma(tap[ini:fim].copy())))

# --- rajada: fatia a primeira rajada em disparos ---
spray, taxa = ler(FONTES + "Prime Vandal Fire Spray.wav")
spray = reamostrar(spray, taxa, TAXA_SAIDA)
burst = spray[:int(3.3 * TAXA_SAIDA)]
pos = inicios(burst, TAXA_SAIDA, limiar_rel=0.18, minimo_ms=70)
for p in pos[:14]:
    fim = p + int(0.2 * TAXA_SAIDA)
    if fim <= len(burst):
        pecas.append(("spray", arruma(burst[p:fim].copy(), fade_fim=0.07)))

# --- equipar: o arquivo inteiro e uma tomada so ---
eq, taxa = ler(FONTES + "Prime Vandal Equip.wav")
eq = reamostrar(eq, taxa, TAXA_SAIDA)
pecas.append(("equipar", arruma(eq[:int(1.25 * TAXA_SAIDA)].copy(), fade_fim=0.08)))

# --- recarregar: uma volta completa (as seis sao iguais) ---
rl, taxa = ler(FONTES + "Prime Vandal Reload.wav")
rl = reamostrar(rl, taxa, TAXA_SAIDA)
pecas.append(("recarregar", arruma(rl[:int(2.3 * TAXA_SAIDA)].copy(), fade_fim=0.1)))

# --- emenda tudo com folga ---
folga = np.zeros(int(FOLGA * TAXA_SAIDA), dtype=np.float32)
trilha, mapa, cursor = [], {}, 0
for nome, x in pecas:
    mapa.setdefault(nome, []).append({"de": round(cursor / TAXA_SAIDA, 4),
                                      "dur": round(len(x) / TAXA_SAIDA, 4)})
    trilha.append(x); trilha.append(folga)
    cursor += len(x) + len(folga)

todo = np.concatenate(trilha)
pcm = np.clip(todo, -1, 1)
pcm16 = (pcm * 32767).astype("<i2").tobytes()

enc = lameenc.Encoder()
enc.set_bit_rate(128)
enc.set_in_sample_rate(TAXA_SAIDA)
enc.set_channels(1)
enc.set_quality(2)
mp3 = enc.encode(pcm16) + enc.flush()

with open("public/assets/audio/vandal.mp3", "wb") as f:
    f.write(mp3)
with open("public/assets/audio/vandal.json", "w", encoding="utf-8") as f:
    json.dump({"taxa": TAXA_SAIDA, "arma": "Vandal", "mapa": mapa}, f, ensure_ascii=False, indent=1)

print(f"duracao do pacote: {len(todo)/TAXA_SAIDA:.2f}s")
for k, v in mapa.items():
    print(f"  {k:11s} {len(v):2d} pedacos")
print(f"mp3: {len(mp3)/1024:.0f} KB  (original somado: 38 MB)")
