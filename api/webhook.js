/* =========================================================================
   POST /api/webhook
   É aqui que o pagamento vira acesso liberado. O gateway avisa que a
   transação mudou de estado e este endpoint atualiza o pedido.

   Cuidados que este arquivo implementa:
   - assinatura conferida antes de qualquer coisa (falha fechada: sem segredo
     configurado, nada é aceito) — senão qualquer um com a URL liberaria
     acesso de graça;
   - idempotência: o mesmo evento pode chegar várias vezes, e a entrega do
     produto só pode acontecer uma vez;
   - sempre responde 200 depois de processar, para o gateway não reenviar.
   ========================================================================= */

import { verificarAssinaturaWebhook, lerEventoWebhook, STATUS } from './_gateway.js';
import { buscarPedido, buscarPorIdGateway, atualizarPedido, registrarVenda } from './_pedidos.js';
import { json, erro, lerCorpoBruto } from './_http.js';
import { entregarAcesso } from './_entrega.js';

/* Impede a Vercel de consumir o corpo antes de nós: a assinatura é calculada
   sobre o texto exato que o gateway enviou. */
export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method !== 'POST') return erro(res, 405, 'Método não permitido');

  let bruto;
  try { bruto = await lerCorpoBruto(req); }
  catch { return erro(res, 400, 'Corpo inválido'); }

  if (!verificarAssinaturaWebhook(req.headers, bruto, req.url)) {
    console.warn('[webhook] assinatura inválida — evento descartado');
    return erro(res, 401, 'Assinatura inválida');
  }

  let corpo;
  try { corpo = JSON.parse(bruto || '{}'); }
  catch { return erro(res, 400, 'JSON inválido'); }

  const evento = lerEventoWebhook(corpo);

  const pedido = (evento.referencia && await buscarPedido(evento.referencia))
              || (evento.idGateway && await buscarPorIdGateway(evento.idGateway));

  if (!pedido) {
    /* 200 de propósito: um pedido desconhecido não vai passar a existir na
       próxima tentativa, e responder erro faria o gateway reenviar para
       sempre. Fica registrado no log para investigação. */
    console.warn('[webhook] pedido não encontrado para', evento);
    return json(res, 200, { ok: true, ignorado: 'pedido desconhecido' });
  }

  if (pedido.status === evento.status) {
    return json(res, 200, { ok: true, ignorado: 'evento repetido' });
  }

  /* Um pedido já pago não volta para pendente por causa de evento fora de
     ordem — só muda para estorno. */
  if (pedido.status === STATUS.PAGO && evento.status !== STATUS.ESTORNADO) {
    return json(res, 200, { ok: true, ignorado: 'pedido já estava pago' });
  }

  const atualizado = await atualizarPedido(pedido.id, {
    status: evento.status,
    idGateway: pedido.idGateway || evento.idGateway,
    origemStatus: 'webhook'
  });

  if (evento.status === STATUS.PAGO && !pedido.acessoEntregueEm) {
    try {
      await registrarVenda(atualizado);
      await entregarAcesso(atualizado);
      await atualizarPedido(pedido.id, { acessoEntregueEm: new Date().toISOString() });
    } catch (e) {
      /* Falha na entrega não pode virar erro para o gateway: o pagamento
         aconteceu. Registramos para reprocessar manualmente. */
      console.error('[webhook] pagamento confirmado mas a entrega falhou:', pedido.id, e);
    }
  }

  return json(res, 200, { ok: true, status: evento.status });
}
