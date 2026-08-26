/* =========================================================================
   POST /api/criar-pagamento
   Cria o pedido e inicia a cobrança no gateway.

   Entrada:  { produtoId, metodo: "pix" | "cartao", cliente: {...},
               tokenCartao?, parcelas? }
   Saída:    Pix    → { pedidoId, pix: { texto, imagem, expiraEm } }
             Cartão → { pedidoId, status, urlAcesso? }

   Regras de segurança aplicadas aqui:
   - o valor NUNCA vem do navegador, sai de api/_config.js;
   - dados do cliente são revalidados no servidor;
   - número de cartão não passa por este servidor: o front envia apenas o
     token gerado pelo SDK do gateway (ver comentário em checkout.html).
   ========================================================================= */

import crypto from 'node:crypto';
import { buscarProduto, opcoesParcelamento, CONFIG } from './_config.js';
import { validarCliente } from './_validacao.js';
import { criarPagamentoPix, criarPagamentoCartao, STATUS } from './_gateway.js';
import { salvarPedido } from './_pedidos.js';
import { json, erro, lerJson, ipDoCliente, limiteExcedido } from './_http.js';

/* Erros de rede do fetch chegam como "fetch failed", com o motivo real
   escondido em e.cause (DNS, TLS, porta, timeout). Durante a integração,
   é justamente a causa que interessa. */
function detalharErro(e) {
  const causa = e?.cause?.message || e?.cause?.code;
  return causa ? `${e.message} | causa: ${causa}` : String(e?.message || e);
}

export function tokenAcesso(pedidoId) {
  return crypto.createHmac('sha256', CONFIG.segredoApp).update(pedidoId).digest('hex').slice(0, 32);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return erro(res, 405, 'Método não permitido');

  if (limiteExcedido('criar:' + ipDoCliente(req), 10, 60_000)) {
    return erro(res, 429, 'Muitas tentativas seguidas. Espere um minuto e tente de novo.');
  }

  let corpo;
  try { corpo = await lerJson(req); }
  catch { return erro(res, 400, 'Requisição inválida'); }

  const produto = buscarProduto(corpo.produtoId);
  if (!produto) return erro(res, 400, 'Produto não encontrado');

  const metodo = corpo.metodo === 'cartao' ? 'cartao' : 'pix';

  const validacao = validarCliente(corpo.cliente);
  if (!validacao.ok) return erro(res, 422, 'Confira os dados informados', { campos: validacao.erros });
  const cliente = validacao.cliente;

  let parcelas = 1;
  if (metodo === 'cartao') {
    if (!corpo.tokenCartao) return erro(res, 422, 'Dados do cartão não foram enviados corretamente');
    parcelas = Number(corpo.parcelas) || 1;
    const permitidas = opcoesParcelamento(produto).map(o => o.parcelas);
    if (!permitidas.includes(parcelas)) return erro(res, 422, 'Número de parcelas inválido');
  }

  const pedido = {
    id: crypto.randomUUID(),
    produtoId: produto.id,
    valorCentavos: produto.valorCentavos,
    metodo,
    parcelas,
    cliente,
    status: STATUS.PENDENTE,
    criadoEm: new Date().toISOString(),
    atualizadoEm: new Date().toISOString()
  };

  try {
    if (metodo === 'pix') {
      const cobranca = await criarPagamentoPix({ pedido, produto, cliente });
      pedido.idGateway = cobranca.idGateway;
      pedido.status = cobranca.status;
      await salvarPedido(pedido);

      return json(res, 201, {
        ok: true,
        pedidoId: pedido.id,
        metodo: 'pix',
        status: pedido.status,
        pix: { texto: cobranca.pixTexto, imagem: cobranca.pixImagem, expiraEm: cobranca.expiraEm },
        modoSimulado: CONFIG.modoGateway === 'simulado'
      });
    }

    const cobranca = await criarPagamentoCartao({
      pedido, produto, cliente, tokenCartao: corpo.tokenCartao, parcelas
    });
    pedido.idGateway = cobranca.idGateway;
    pedido.status = cobranca.status;
    await salvarPedido(pedido);

    if (cobranca.status === STATUS.RECUSADO) {
      return json(res, 200, {
        ok: false,
        pedidoId: pedido.id,
        status: cobranca.status,
        erro: cobranca.motivoRecusa || 'Pagamento recusado pelo emissor do cartão.'
      });
    }

    return json(res, 201, {
      ok: true,
      pedidoId: pedido.id,
      metodo: 'cartao',
      status: cobranca.status,
      urlAcesso: cobranca.status === STATUS.PAGO
        ? `/obrigado.html?pedido=${pedido.id}&t=${tokenAcesso(pedido.id)}`
        : null
    });

  } catch (e) {
    /* O detalhe técnico vai para o log da Vercel; o cliente recebe uma
       mensagem genérica, sem expor a estrutura interna nem a mensagem crua
       do gateway. */
    console.error('[criar-pagamento] falha:', e);
    return erro(res, 502, 'Não conseguimos iniciar o pagamento agora. Tente novamente em instantes.',
      CONFIG.diagnostico ? { diagnostico: detalharErro(e) } : {});
  }
}
