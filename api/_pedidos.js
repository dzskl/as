/* =========================================================================
   Pedidos: gravação, índice para o painel e métricas diárias.

   O índice existe porque Redis não tem "listar tudo": sem ele, o painel não
   teria como mostrar os pedidos recentes sem varrer o banco inteiro.
   ========================================================================= */

import { guardar, ler, empilhar, lerLista, tamanhoLista, incrementar, lerContadores, limparTudo, DRIVER } from './_kv.js';

export { DRIVER };

const INDICE = 'pedidos:indice';

/* Data no fuso de Brasília: métrica de "vendas de hoje" tem que bater com o
   dia do lojista, não com UTC. */
export function diaBR(data = new Date()) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(data); // YYYY-MM-DD
}

export async function salvarPedido(pedido) {
  const novo = await ler('pedido:' + pedido.id) === null;
  await guardar('pedido:' + pedido.id, pedido);
  if (pedido.idGateway) await guardar('gw:' + pedido.idGateway, pedido.id);

  if (novo) {
    await empilhar(INDICE, pedido.id);
    await incrementar(`m:${diaBR()}:pedidos`);
  }
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
  await guardar('pedido:' + novo.id, novo);
  if (novo.idGateway) await guardar('gw:' + novo.idGateway, novo.id);
  return novo;
}

/* Registrado uma única vez por pedido, no momento em que ele vira pago —
   quem chama é o webhook, que já garante idempotência. */
export async function registrarVenda(pedido) {
  const dia = diaBR();
  await incrementar(`m:${dia}:vendas`);
  await incrementar(`m:${dia}:receita`, pedido.valorCentavos);
  if (pedido.origem === 'telegram') await incrementar(`m:${dia}:vendas_bot`);
}

export async function listarPedidos({ limite = 50, pagina = 0 } = {}) {
  const inicio = pagina * limite;
  const ids = await lerLista(INDICE, inicio, inicio + limite - 1);
  const pedidos = await Promise.all(ids.map(id => buscarPedido(id)));
  return pedidos.filter(Boolean);
}

export async function totalPedidos() {
  return tamanhoLista(INDICE);
}

/* Série diária dos últimos N dias, para os cartões e o gráfico do painel. */
export async function metricasPorDia(dias = 14) {
  const hoje = new Date();
  const datas = [];
  for (let i = dias - 1; i >= 0; i--) {
    const d = new Date(hoje);
    d.setUTCDate(d.getUTCDate() - i);
    datas.push(diaBR(d));
  }

  const [pedidos, vendas, receita, vendasBot] = await Promise.all([
    lerContadores(datas.map(d => `m:${d}:pedidos`)),
    lerContadores(datas.map(d => `m:${d}:vendas`)),
    lerContadores(datas.map(d => `m:${d}:receita`)),
    lerContadores(datas.map(d => `m:${d}:vendas_bot`))
  ]);

  return datas.map((dia, i) => ({
    dia,
    pedidos: pedidos[i] || 0,
    vendas: vendas[i] || 0,
    receitaCentavos: receita[i] || 0,
    vendasBot: vendasBot[i] || 0
  }));
}

export function limparMemoria() { limparTudo(); }
