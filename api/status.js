/* =========================================================================
   GET /api/status?pedido=<id>
   A tela do Pix consulta este endpoint a cada poucos segundos para saber se
   o pagamento caiu. Devolve apenas o estado do pedido — nunca dados do
   comprador, porque o ID do pedido circula na URL do navegador.
   ========================================================================= */

import { buscarPedido } from './_pedidos.js';
import { consultarPagamento, STATUS } from './_gateway.js';
import { atualizarPedido } from './_pedidos.js';
import { json, erro, ipDoCliente, limiteExcedido } from './_http.js';
import { tokenAcesso } from './criar-pagamento.js';
import { CONFIG } from './_config.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return erro(res, 405, 'Método não permitido');

  if (limiteExcedido('status:' + ipDoCliente(req), 120, 60_000)) {
    return erro(res, 429, 'Muitas consultas seguidas.');
  }

  const url = new URL(req.url, 'http://local');
  const pedidoId = url.searchParams.get('pedido') || '';
  if (!pedidoId) return erro(res, 400, 'Pedido não informado');

  let pedido = await buscarPedido(pedidoId);
  if (!pedido) return erro(res, 404, 'Pedido não encontrado');

  /* Rede de segurança: se o webhook não chegou (queda, atraso, configuração
     errada), perguntamos o status direto ao gateway. O webhook continua sendo
     o caminho principal — este aqui evita cliente pagando e ficando preso na
     tela de espera. */
  if (pedido.status === STATUS.PENDENTE && pedido.idGateway && CONFIG.modoGateway !== 'simulado') {
    try {
      const atual = await consultarPagamento(pedido.idGateway);
      if (atual.status !== pedido.status) {
        pedido = await atualizarPedido(pedido.id, { status: atual.status, origemStatus: 'consulta' });
      }
    } catch (e) {
      console.error('[status] consulta ao gateway falhou:', e.message);
    }
  }

  return json(res, 200, {
    ok: true,
    status: pedido.status,
    urlAcesso: pedido.status === STATUS.PAGO
      ? `/obrigado.html?pedido=${pedido.id}&t=${tokenAcesso(pedido.id)}`
      : null
  });
}
