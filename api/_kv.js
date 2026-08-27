/* =========================================================================
   Camada de armazenamento.

   Funções serverless não guardam estado entre chamadas: cada requisição pode
   cair numa instância diferente. Tudo que precisa sobreviver a isso — pedidos,
   leads do bot, configuração, métricas — vive aqui.

   Dois drivers, escolhidos automaticamente:
     upstash  → Redis via HTTP (Vercel KV / Upstash). Ativado quando
                KV_REST_API_URL e KV_REST_API_TOKEN existem.
     memoria  → Map em memória, para desenvolvimento e testes. Em produção
                perde tudo a cada reinício da função.

   A superfície é pequena de propósito: cinco operações cobrem o sistema
   inteiro e mantêm o driver de memória fiel ao de produção.
   ========================================================================= */

const URL_KV = process.env.KV_REST_API_URL || '';
const TOKEN_KV = process.env.KV_REST_API_TOKEN || '';
export const DRIVER = URL_KV && TOKEN_KV ? 'upstash' : 'memoria';

const memoria = new Map();
const listas = new Map();
const contadores = new Map();

const VALIDADE_PADRAO = 60 * 60 * 24 * 180;   // 180 dias

async function comando(...args) {
  const r = await fetch(URL_KV, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN_KV}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args)
  });
  if (!r.ok) throw new Error(`Falha no armazenamento (KV ${r.status})`);
  const { result } = await r.json();
  return result;
}

/* --------------------------------------------------------------- valores */

export async function guardar(chave, valor, validadeSegundos = VALIDADE_PADRAO) {
  if (DRIVER === 'memoria') { memoria.set(chave, valor); return valor; }
  await comando('SET', chave, JSON.stringify(valor), 'EX', validadeSegundos);
  return valor;
}

export async function ler(chave) {
  if (DRIVER === 'memoria') return memoria.get(chave) ?? null;
  const bruto = await comando('GET', chave);
  return bruto ? JSON.parse(bruto) : null;
}

export async function apagar(chave) {
  if (DRIVER === 'memoria') { memoria.delete(chave); return; }
  await comando('DEL', chave);
}

/* ---------------------------------------------------------------- listas
   Usadas como índices: o item mais recente fica no começo. O limite evita
   que uma lista cresça sem fim e estoure o custo do Redis. */

export async function empilhar(chave, valor, limite = 5000) {
  if (DRIVER === 'memoria') {
    const atual = listas.get(chave) || [];
    atual.unshift(valor);
    listas.set(chave, atual.slice(0, limite));
    return;
  }
  await comando('LPUSH', chave, JSON.stringify(valor));
  await comando('LTRIM', chave, 0, limite - 1);
}

export async function lerLista(chave, inicio = 0, fim = 99) {
  if (DRIVER === 'memoria') return (listas.get(chave) || []).slice(inicio, fim + 1);
  const bruto = await comando('LRANGE', chave, inicio, fim);
  return (bruto || []).map(item => { try { return JSON.parse(item); } catch { return item; } });
}

export async function tamanhoLista(chave) {
  if (DRIVER === 'memoria') return (listas.get(chave) || []).length;
  return Number(await comando('LLEN', chave)) || 0;
}

/* ------------------------------------------------------------ contadores
   Usados nas métricas diárias. INCR é atômico, então duas vendas simultâneas
   não se sobrescrevem — o que aconteceria se fosse ler-somar-gravar. */

export async function incrementar(chave, quanto = 1, validadeSegundos = VALIDADE_PADRAO) {
  if (DRIVER === 'memoria') {
    const novo = (contadores.get(chave) || 0) + quanto;
    contadores.set(chave, novo);
    return novo;
  }
  const novo = Number(await comando('INCRBY', chave, quanto));
  await comando('EXPIRE', chave, validadeSegundos);
  return novo;
}

export async function lerContador(chave) {
  if (DRIVER === 'memoria') return contadores.get(chave) || 0;
  return Number(await comando('GET', chave)) || 0;
}

export async function lerContadores(chaves) {
  if (!chaves.length) return [];
  if (DRIVER === 'memoria') return chaves.map(c => contadores.get(c) || 0);
  const valores = await comando('MGET', ...chaves);
  return (valores || []).map(v => Number(v) || 0);
}

/* Só para os testes. */
export function limparTudo() { memoria.clear(); listas.clear(); contadores.clear(); }
