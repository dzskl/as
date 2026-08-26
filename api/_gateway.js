/* =========================================================================
   ADAPTADOR DE GATEWAY DE PAGAMENTO
   -------------------------------------------------------------------------
   Este é o ÚNICO arquivo que muda quando você troca de gateway ou recebe a
   documentação oficial da FreePay. Todo o resto do checkout conversa apenas
   com as funções exportadas aqui.

   Dois modos, escolhidos pela variável de ambiente GATEWAY_MODO:

     simulado  → não chama ninguém, devolve respostas falsas. Serve para
                 testar o fluxo inteiro (Pix, webhook, liberação de acesso)
                 sem ter credencial. É o padrão.
     freepay   → chama a API real da FreePay.

   CONFIRMADO pela documentação oficial (freepaybrasil.readme.io):
     • URL base:  https://api.freepaybrasil.com/v1
     • Criar transação:  POST /payment-transaction/create
     • Autenticação: Basic base64("PUBLIC_KEY:SECRET_KEY")
       (as DUAS chaves, separadas por dois-pontos — não é só a secreta)

   ⚠️ AINDA NÃO CONFIRMADO — não ligue GATEWAY_MODO=freepay antes de checar:
     1. os nomes dos campos do corpo do POST (montarCorpoPix / montarCorpoCartao)
     2. o formato da resposta (de onde sai o QR Code e o id da transação)
     3. o endpoint de consulta de transação (FREEPAY_CAMINHO_CONSULTA)
     4. o header e o algoritmo da assinatura do webhook (FREEPAY_WEBHOOK_HEADER)
     5. se existe SDK JS para tokenizar cartão no navegador

   Tudo isso é ajustável por variável de ambiente ou nas duas funções de
   montagem logo abaixo, sem reescrever o resto do sistema.
   ========================================================================= */

import crypto from 'node:crypto';
import { CONFIG } from './_config.js';

/* Status normalizados usados por todo o sistema. Cada gateway tem os seus
   nomes; traduzimos tudo para estes cinco. */
export const STATUS = {
  PENDENTE: 'pendente',
  PAGO: 'pago',
  RECUSADO: 'recusado',
  ESTORNADO: 'estornado',
  EXPIRADO: 'expirado'
};

const env = (nome, padrao = '') => process.env[nome] || padrao;

/* ---------------------------------------------------------------- helpers */

export function cabecalhoAutenticacao() {
  const secreta = env('FREEPAY_CHAVE_SECRETA');
  if (!secreta) throw new Error('FREEPAY_CHAVE_SECRETA não configurada');

  if (env('FREEPAY_AUTH', 'basic') === 'bearer') return `Bearer ${secreta}`;

  /* A FreePay usa as duas chaves no Basic: base64("PUBLIC_KEY:SECRET_KEY"). */
  const publica = env('FREEPAY_CHAVE_PUBLICA');
  if (!publica) throw new Error('FREEPAY_CHAVE_PUBLICA não configurada (vai antes dos dois-pontos no Basic)');
  return 'Basic ' + Buffer.from(`${publica}:${secreta}`).toString('base64');
}

async function chamarApi(caminho, corpo, metodo = 'POST') {
  const base = env('FREEPAY_URL_BASE', 'https://api.freepaybrasil.com/v1').replace(/\/$/, '');

  const controle = new AbortController();
  const limite = setTimeout(() => controle.abort(), 20000);
  try {
    const resposta = await fetch(base + caminho, {
      method: metodo,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': cabecalhoAutenticacao()
      },
      body: corpo ? JSON.stringify(corpo) : undefined,
      signal: controle.signal
    });
    const texto = await resposta.text();
    let dados;
    try { dados = texto ? JSON.parse(texto) : {}; }
    catch { throw new Error(`Resposta não-JSON do gateway (${resposta.status}): ${texto.slice(0, 200)}`); }

    if (!resposta.ok) {
      const msg = dados.message || dados.erro || dados.error || `HTTP ${resposta.status}`;
      throw new Error(`Gateway recusou a requisição: ${msg}`);
    }
    return dados;
  } finally {
    clearTimeout(limite);
  }
}

/* Traduz o status do gateway para os nossos. Ajuste conforme as docs. */
function traduzirStatus(bruto) {
  const s = String(bruto || '').toLowerCase();
  if (['paid', 'approved', 'pago', 'aprovado', 'succeeded', 'confirmed'].includes(s)) return STATUS.PAGO;
  if (['refused', 'declined', 'recusado', 'failed', 'error'].includes(s)) return STATUS.RECUSADO;
  if (['refunded', 'estornado', 'chargeback', 'canceled', 'cancelled'].includes(s)) return STATUS.ESTORNADO;
  if (['expired', 'expirado'].includes(s)) return STATUS.EXPIRADO;
  return STATUS.PENDENTE;
}

/* Corpo do POST — os nomes dos campos vêm da documentação do gateway. */
function montarCorpoPix({ pedido, produto, cliente }) {
  return {
    amount: produto.valorCentavos,
    payment_method: 'pix',
    reference_id: pedido.id,
    postback_url: `${CONFIG.urlSite}/api/webhook`,
    pix_expires_in: 3600,
    items: [{ title: produto.nome, unit_price: produto.valorCentavos, quantity: 1 }],
    customer: {
      name: cliente.nome,
      email: cliente.email,
      document: cliente.cpf,
      phone: cliente.telefone
    }
  };
}

function montarCorpoCartao({ pedido, produto, cliente, tokenCartao, parcelas }) {
  return {
    amount: produto.valorCentavos,
    payment_method: 'credit_card',
    installments: parcelas,
    card_token: tokenCartao,      // token gerado no navegador pelo SDK do gateway
    reference_id: pedido.id,
    postback_url: `${CONFIG.urlSite}/api/webhook`,
    items: [{ title: produto.nome, unit_price: produto.valorCentavos, quantity: 1 }],
    customer: {
      name: cliente.nome,
      email: cliente.email,
      document: cliente.cpf,
      phone: cliente.telefone
    }
  };
}

/* ------------------------------------------------------------- modo simulado */

function qrFalso(pedidoId) {
  /* Texto deliberadamente inválido: ninguém consegue pagar um QR simulado
     por engano. Um Pix real começa com "00020126..." */
  const texto = `SIMULADO-NAO-PAGAVEL-${pedidoId}`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="0 0 24 24">
    <rect width="24" height="24" fill="#fff"/>
    <g fill="#111">
      <rect x="1" y="1" width="6" height="6"/><rect x="17" y="1" width="6" height="6"/>
      <rect x="1" y="17" width="6" height="6"/><rect x="10" y="10" width="4" height="4"/>
      <rect x="2.5" y="2.5" width="3" height="3" fill="#fff"/>
      <rect x="18.5" y="2.5" width="3" height="3" fill="#fff"/>
      <rect x="2.5" y="18.5" width="3" height="3" fill="#fff"/>
    </g>
    <text x="12" y="15.6" font-size="1.5" text-anchor="middle" fill="#c00" font-family="monospace">SIMULADO</text>
  </svg>`;
  return { texto, imagem: 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64') };
}

/* ------------------------------------------------------------------ público */

export async function criarPagamentoPix({ pedido, produto, cliente }) {
  if (CONFIG.modoGateway === 'simulado') {
    const qr = qrFalso(pedido.id);
    return {
      idGateway: 'sim_' + pedido.id,
      status: STATUS.PENDENTE,
      pixTexto: qr.texto,
      pixImagem: qr.imagem,
      expiraEm: new Date(Date.now() + 3600e3).toISOString()
    };
  }

  const caminho = env('FREEPAY_CAMINHO_TRANSACAO', '/payment-transaction/create');
  const r = await chamarApi(caminho, montarCorpoPix({ pedido, produto, cliente }));
  const pix = r.pix || r.qr_code || r.charge?.pix || {};
  return {
    idGateway: String(r.id ?? r.transaction_id ?? r.reference_id ?? ''),
    status: traduzirStatus(r.status),
    pixTexto: pix.qr_code ?? pix.copy_paste ?? pix.emv ?? r.qr_code_text ?? '',
    pixImagem: pix.qr_code_image ?? pix.qr_code_base64 ?? r.qr_code_image ?? '',
    expiraEm: pix.expires_at ?? r.expires_at ?? null
  };
}

export async function criarPagamentoCartao({ pedido, produto, cliente, tokenCartao, parcelas }) {
  if (CONFIG.modoGateway === 'simulado') {
    /* Token de teste que termina em "recusa" simula uma recusa do emissor,
       para você conseguir testar a tela de erro. */
    const recusado = String(tokenCartao).endsWith('recusa');
    return {
      idGateway: 'sim_' + pedido.id,
      status: recusado ? STATUS.RECUSADO : STATUS.PAGO,
      motivoRecusa: recusado ? 'Cartão recusado pelo emissor (simulação)' : null
    };
  }

  const caminho = env('FREEPAY_CAMINHO_TRANSACAO', '/payment-transaction/create');
  const r = await chamarApi(caminho, montarCorpoCartao({ pedido, produto, cliente, tokenCartao, parcelas }));
  return {
    idGateway: String(r.id ?? r.transaction_id ?? ''),
    status: traduzirStatus(r.status),
    motivoRecusa: r.refuse_reason ?? r.status_reason ?? null
  };
}

export async function consultarPagamento(idGateway) {
  if (CONFIG.modoGateway === 'simulado') return { status: STATUS.PENDENTE };

  /* Sem o endpoint de consulta confirmado na documentação, não chutamos uma
     URL: devolvemos "pendente" e seguimos confiando no webhook. Assim que
     souber o caminho certo, preencha FREEPAY_CAMINHO_CONSULTA (use :id no
     lugar do identificador) e esta rede de segurança passa a funcionar. */
  const modelo = env('FREEPAY_CAMINHO_CONSULTA');
  if (!modelo) {
    console.warn('[gateway] FREEPAY_CAMINHO_CONSULTA não configurado — status vem só pelo webhook');
    return { status: STATUS.PENDENTE };
  }

  const r = await chamarApi(modelo.replace(':id', encodeURIComponent(idGateway)), null, 'GET');
  return { status: traduzirStatus(r.status) };
}

/* ------------------------------------------------------------------ webhook */

/* Confere a assinatura do webhook. Falha fechada: sem segredo configurado,
   nenhum webhook é aceito em produção — senão qualquer pessoa que descobrisse
   a URL poderia liberar acesso de graça mandando um POST. */
export function verificarAssinaturaWebhook(headers, corpoBruto) {
  if (CONFIG.modoGateway === 'simulado') return true;

  const segredo = env('FREEPAY_WEBHOOK_SEGREDO');
  if (!segredo) return false;

  const nomeHeader = env('FREEPAY_WEBHOOK_HEADER', 'x-signature').toLowerCase();
  const recebida = String(headers[nomeHeader] || '').replace(/^sha256=/, '').trim();
  if (!recebida) return false;

  const esperada = crypto.createHmac('sha256', segredo).update(corpoBruto).digest('hex');
  const a = Buffer.from(recebida, 'utf8');
  const b = Buffer.from(esperada, 'utf8');
  /* timingSafeEqual exige o mesmo tamanho; comparar antes evita exceção e
     não vaza informação além do tamanho, que já é público. */
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/* Extrai o que interessa do corpo do webhook. Ajuste conforme as docs. */
export function lerEventoWebhook(corpo) {
  const t = corpo.transaction || corpo.data || corpo;
  return {
    idGateway: String(t.id ?? t.transaction_id ?? ''),
    referencia: String(t.reference_id ?? t.reference ?? corpo.reference_id ?? ''),
    status: traduzirStatus(t.status ?? corpo.status ?? corpo.event)
  };
}
