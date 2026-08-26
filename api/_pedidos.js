/* =========================================================================
   Armazenamento de pedidos.

   Funções serverless não guardam estado entre chamadas: cada requisição pode
   cair numa instância diferente. Por isso o pedido precisa viver fora do
   processo — senão o webhook não encontra o pedido criado pelo checkout.

   Dois drivers:
     upstash  → Redis via HTTP (funciona na Vercel). Ativado automaticamente
                quando KV_REST_API_URL e KV_REST_API_TOKEN existem.
     memoria  → Map em memória. Serve para desenvolvimento e testes locais.
                Em produção, perde os pedidos a cada reinício.
   ========================================================================= */

const URL_KV = process.env.KV_REST_API_URL || '';
const TOKEN_KV = process.env.KV_REST_API_TOKEN || '';
export const DRIVER = URL_KV && TOKEN_KV ? 'upstash' : 'memoria';

const memoria = new Map();
const VALIDADE = 60 * 60 * 24 * 90; // 90 dias

async function comandoKV(...args) {
  const r = await fetch(URL_KV, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN_KV}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args)
  });
  if (!r.ok) throw new Error(`Falha no armazenamento (KV ${r.status})`);
  const { result } = await r.json();
  return result;
}

async function guardar(chave, valor) {
  if (DRIVER === 'memoria') { memoria.set(chave, valor); return; }
  await comandoKV('SET', chave, JSON.stringify(valor), 'EX', VALIDADE);
}

async function ler(chave) {
  if (DRIVER === 'memoria') return memoria.get(chave) ?? null;
  const bruto = await comandoKV('GET', chave);
  return bruto ? JSON.parse(bruto) : null;
}

/* ------------------------------------------------------------------ público */

export async function salvarPedido(pedido) {
  await guardar('pedido:' + pedido.id, pedido);
  if (pedido.idGateway) await guardar('gw:' + pedido.idGateway, pedido.id);
  return pedido;
}

export async function buscarPedido(id) {
  return ler('pedido:' + id);
}

export async function buscarPorIdGateway(idGateway) {
  const id = await ler('gw:' + idGateway);
  return id ? buscarPedido(id) : null;
}

export async function atualizarPedido(id, campos) {
  const pedido = await buscarPedido(id);
  if (!pedido) return null;
  const novo = { ...pedido, ...campos, atualizadoEm: new Date().toISOString() };
  await salvarPedido(novo);
  return novo;
}

/* Só para os testes automatizados. */
export function limparMemoria() { memoria.clear(); }
