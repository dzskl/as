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
import { validarCliente, limpar } from './_validacao.js';
import { criarPagamentoPix, criarPagamentoCartao, STATUS } from './_gateway.js';
import { salvarPedido } from './_pedidos.js';
import { json, erro, lerJson, ipDoCliente, limiteExcedido } from './_http.js';

/* Endereço de cobrança. Cartão precisa; Pix não. É o que alimenta a análise
   antifraude do adquirente — e sem ele muitos gateways recusam ou quebram. */
function validarEndereco(dados) {
  if (!dados) return null;
  const cep = String(dados.cep ?? '').replace(/\D/g, '');
  const rua = limpar(dados.rua, 120);
  const numero = limpar(dados.numero, 20);
  const bairro = limpar(dados.bairro, 80);
  const cidade = limpar(dados.cidade, 80);
  const uf = limpar(dados.uf, 2).toUpperCase();

  if (cep.length !== 8) return null;
  if (rua.length < 3 || !numero || cidade.length < 2 || uf.length !== 2) return null;

  return { cep, rua, numero, complemento: limpar(dados.complemento, 60), bairro, cidade, uf };
}

/* Valida e normaliza os dados do cartão. Nada aqui é gravado: o objeto
   devolvido vive apenas durante a requisição, a caminho do gateway. */
function validarCartao(dados) {
  if (!dados) return null;
  const numero = String(dados.numero ?? '').replace(/\D/g, '');
  const titular = String(dados.titular ?? '').trim().slice(0, 60);
  const cvv = String(dados.cvv ?? '').replace(/\D/g, '');
  const validade = String(dados.validade ?? '').replace(/\D/g, '');   // MMAA

  if (numero.length < 13 || numero.length > 19 || !luhn(numero)) return null;
  if (titular.length < 3) return null;
  if (cvv.length < 3 || cvv.length > 4) return null;
  if (validade.length !== 4) return null;

  const mes = validade.slice(0, 2);
  const ano = validade.slice(2);
  if (Number(mes) < 1 || Number(mes) > 12) return null;
  /* Vence no último instante do mês informado. */
  if (new Date(2000 + Number(ano), Number(mes), 0, 23, 59, 59) < new Date()) return null;

  return { numero, titular, cvv, mes, ano: '20' + ano };
}

/* Luhn: pega erro de digitação antes de gastar tentativa no gateway e antes
   de o antifraude marcar o comprador. */
function luhn(numero) {
  let soma = 0, alternar = false;
  for (let i = numero.length - 1; i >= 0; i--) {
    let d = Number(numero[i]);
    if (alternar) { d *= 2; if (d > 9) d -= 9; }
    soma += d; alternar = !alternar;
  }
  return soma % 10 === 0;
}

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
  let cartao = null;
  let endereco = null;
  if (metodo === 'cartao') {
    parcelas = Number(corpo.parcelas) || 1;
    const permitidas = opcoesParcelamento(produto).map(o => o.parcelas);
    if (!permitidas.includes(parcelas)) return erro(res, 422, 'Número de parcelas inválido');

    if (!corpo.tokenCartao) {
      /* Sem token, só aceitamos os dados do cartão se o modo direto estiver
         explicitamente ligado — ver o aviso sobre PCI-DSS em _config.js. */
      if (!CONFIG.cartaoDireto) {
        return erro(res, 422, 'Dados do cartão não foram enviados corretamente');
      }
      cartao = validarCartao(corpo.cartao);
      if (!cartao) return erro(res, 422, 'Confira os dados do cartão');
    }

    endereco = validarEndereco(corpo.endereco);
    if (!endereco) {
      /* Se o navegador nem enviou o objeto, a página é anterior aos campos de
         endereço — cache do navegador depois de um deploy. Vale distinguir:
         mandar o cliente "conferir o endereço" quando não existe campo de
         endereço na tela é um beco sem saída. */
      const paginaAntiga = !corpo.endereco;
      return erro(res, 422,
        paginaAntiga
          ? 'Sua página está desatualizada. Recarregue com Ctrl+Shift+R (ou Cmd+Shift+R no Mac) e tente de novo.'
          : 'Confira o endereço de cobrança',
        paginaAntiga ? {} : { campos: { cep: 'Endereço de cobrança incompleto' } });
    }
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

      /* Sem o código copia e cola não há como pagar: melhor recusar aqui do
         que mostrar uma tela de Pix vazia para o cliente. */
      if (!cobranca.pixTexto) {
        console.error('[criar-pagamento] gateway não devolveu o código Pix', pedido.id);
        return erro(res, 502, 'O Pix foi criado mas o código não veio. Tente novamente ou use outra forma de pagamento.',
          CONFIG.diagnostico ? { diagnostico: 'resposta do gateway: ' + JSON.stringify(cobranca.bruto).slice(0, 1200) } : {});
      }

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
      pedido, produto, cliente, endereco, tokenCartao: corpo.tokenCartao, cartao, parcelas,
      ip: ipDoCliente(req)
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
    /* Registramos o id do pedido junto: se a cobrança tiver sido criada no
       gateway antes da falha, é por ele que se acha a transação no painel. */
    console.error('[criar-pagamento] falha no pedido', pedido.id, '-', e);

    const mensagem = e.falhaDoGateway
      ? 'O processador de pagamentos está instável no momento. Antes de tentar de novo, confira se a cobrança já não foi gerada.'
      : 'Não conseguimos iniciar o pagamento agora. Tente novamente em instantes.';

    return erro(res, 502, mensagem,
      CONFIG.diagnostico ? { diagnostico: detalharErro(e), pedidoId: pedido.id } : {});
  }
}
