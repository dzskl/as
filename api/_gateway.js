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
import { CONFIG, ligado } from './_config.js';

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

/* Número de cartão e CVV nunca podem aparecer em log — nem em diagnóstico.
   Log é armazenado, replicado e lido por gente; dado de cartão em log é uma
   das falhas mais comuns de PCI. */
function semDadosSensiveis(corpo) {
  if (!corpo || typeof corpo !== 'object') return corpo;
  const copia = JSON.parse(JSON.stringify(corpo));
  /* Cobre todos os arranjos possíveis do bloco de cartão. */
  for (const chave of ['card', 'credit_card', 'creditCard']) {
    if (!copia[chave]) continue;
    copia[chave] = {
      ...copia[chave],
      number: copia[chave].number ? '****' + String(copia[chave].number).slice(-4) : undefined,
      cvv: copia[chave].cvv ? '***' : undefined
    };
  }
  return copia;
}

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

    if (CONFIG.diagnostico) {
      /* Log completo dos dois lados da conversa, para acertar o mapeamento
         de campos durante a integração. Nunca deixe DIAGNOSTICO=1 ligado
         depois: o corpo carrega dados pessoais do comprador. */
      console.log('[gateway] POST', base + caminho, '\n  enviado:', JSON.stringify(semDadosSensiveis(corpo)),
                  '\n  status:', resposta.status, '\n  recebido:', texto.slice(0, 1500));
    }
    let dados;
    try { dados = texto ? JSON.parse(texto) : {}; }
    catch { throw new Error(`Resposta não-JSON do gateway (${resposta.status}): ${texto.slice(0, 200)}`); }

    if (!resposta.ok) {
      /* Cada gateway põe a mensagem de erro num campo diferente. Tentamos os
         mais comuns e, em diagnóstico, anexamos a resposta crua — é ela que
         revela quais campos a API esperava. */
      const msg = dados.message || dados.erro || dados.error || dados.msg || dados.detail
        || (dados.errors ? JSON.stringify(dados.errors) : '')
        || `HTTP ${resposta.status}`;
      const cru = CONFIG.diagnostico
        ? ` | HTTP ${resposta.status} | resposta: ${texto ? texto.slice(0, 900) : '(corpo vazio)'}`
        : '';
      /* 5xx é falha do lado do gateway, não do nosso corpo. A distinção
         importa: em erro de validação (4xx) a correção é nossa; em 5xx a
         cobrança PODE ter sido criada antes da falha, então repetir a
         requisição arrisca cobrar duas vezes. */
      const falhaDoGateway = resposta.status >= 500;
      const rotulo = falhaDoGateway
        ? `Erro interno do gateway (HTTP ${resposta.status}) — a requisição foi aceita mas a resposta falhou`
        : `Gateway recusou a requisição: ${msg}`;
      const erroFinal = new Error(`${rotulo}${cru}`);
      erroFinal.falhaDoGateway = falhaDoGateway;
      erroFinal.statusHttp = resposta.status;
      throw erroFinal;
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

/* A API da FreePay é .NET e espera customer.document como OBJETO
   (DocumentRequest), não como string — foi o que a validação devolveu:
   "The JSON value could not be converted to ... DocumentRequest".
   O nome do tipo ("cpf"/"CPF") é ajustável por variável de ambiente caso a
   API espere outro formato. */
function montarCliente(cliente) {
  return {
    name: cliente.nome,
    email: cliente.email,
    phone: cliente.telefone,
    document: {
      number: cliente.cpf,
      type: env('FREEPAY_DOC_TIPO', 'cpf')
    }
  };
}

/* A FreePay exige um campo "metadata" ("O json metadata é obrigatório").
   Mandamos o identificador do pedido, que é o que interessa recuperar depois
   no painel deles. Se a API esperar texto em vez de objeto, ligue
   FREEPAY_METADATA_TEXTO=1 e ele vai serializado como string JSON. */
function montarMetadata(pedido, produto) {
  const dados = { pedido_id: pedido.id, produto: produto.id ?? produto.nome };
  return ligado(env('FREEPAY_METADATA_TEXTO')) ? JSON.stringify(dados) : dados;
}

/* Corpo do POST — nomes dos campos ajustados conforme a validação da API. */
export function montarCorpoPix({ pedido, produto, cliente }) {
  return {
    amount: produto.valorCentavos,
    payment_method: 'pix',
    reference_id: pedido.id,
    postback_url: `${CONFIG.urlSite}/api/webhook`,
    pix_expires_in: 3600,
    items: [{ title: produto.nome, unit_price: produto.valorCentavos, quantity: 1 }],
    customer: montarCliente(cliente),
    metadata: montarMetadata(pedido, produto)
  };
}

/* Arranjos do bloco de cartão. Todos carregam a mesma informação — muda só
   o nome e o formato dos campos, que é o que precisamos descobrir. */
export function blocoCartao(cartao) {
  const { numero, titular, mes, ano, cvv } = cartao;
  const formato = env('FREEPAY_FORMATO_CARTAO', 'a').trim().toLowerCase();

  switch (formato) {
    /* b — snake_case por extenso, comum em gateways brasileiros */
    case 'b':
      return { card: {
        number: numero, holder_name: titular,
        expiration_month: mes, expiration_year: ano, cvv
      } };

    /* c — camelCase, padrão de serialização mais comum em APIs .NET */
    case 'c':
      return { card: {
        number: numero, holderName: titular,
        expirationMonth: mes, expirationYear: ano, cvv
      } };

    /* d — validade num campo único MM/AA, dentro de credit_card */
    case 'd':
      return { credit_card: {
        number: numero, holder_name: titular,
        expiration_date: `${mes}/${ano.slice(-2)}`, cvv
      } };

    /* a — abreviado (padrão atual) */
    default:
      return { card: {
        number: numero, holder_name: titular,
        exp_month: mes, exp_year: ano, cvv
      } };
  }
}

export function montarCorpoCartao({ pedido, produto, cliente, tokenCartao, cartao, parcelas }) {
  /* Dois caminhos: token (preferido) ou dados do cartão (só com
     CARTAO_DIRETO=1 — veja o aviso em _config.js).

     O formato do bloco de cartão não está documentado, e a API responde 500
     sem corpo quando não gosta dele — ou seja, não diz o que espera. Por isso
     os quatro arranjos mais comuns ficam selecionáveis por
     FREEPAY_FORMATO_CARTAO (a, b, c ou d), para testar um por deploy sem
     precisar mexer no código. Combine com PRECO_TESTE_CENTAVOS=100 para
     testar cobrando R$ 1,00. */
  const pagamento = tokenCartao
    ? { card_token: tokenCartao }
    : blocoCartao(cartao);

  return {
    amount: produto.valorCentavos,
    payment_method: env('FREEPAY_METODO_CARTAO', 'credit_card'),
    installments: parcelas,
    ...pagamento,
    reference_id: pedido.id,
    postback_url: `${CONFIG.urlSite}/api/webhook`,
    items: [{ title: produto.nome, unit_price: produto.valorCentavos, quantity: 1 }],
    customer: montarCliente(cliente),
    metadata: montarMetadata(pedido, produto)
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

/* -------------------------------------------------- leitura da resposta Pix

   Em vez de depender do nome exato dos campos (que variam de gateway para
   gateway e não estão documentados), procuramos pelo CONTEÚDO em qualquer
   lugar da resposta:

   - o código Pix copia e cola é um BR Code EMV e SEMPRE começa com "000201";
   - a imagem do QR vem como data URI, base64 de PNG ou URL de imagem.

   Assim a leitura funciona independentemente de a resposta ser {pix:{...}},
   {data:{qr_code:...}} ou qualquer outro aninhamento. */

function percorrer(valor, visitar, profundidade = 0) {
  if (profundidade > 6 || valor == null) return;
  if (typeof valor === 'string') return visitar(valor);
  if (Array.isArray(valor)) return valor.forEach(v => percorrer(v, visitar, profundidade + 1));
  if (typeof valor === 'object') Object.values(valor).forEach(v => percorrer(v, visitar, profundidade + 1));
}

export function acharPixTexto(resposta) {
  let achado = '';
  percorrer(resposta, (texto) => {
    /* BR Code começa com "000201" (Payload Format Indicator) e é longo. */
    if (!achado && texto.length > 50 && /^000201/.test(texto.trim())) achado = texto.trim();
  });
  return achado;
}

export function acharPixImagem(resposta) {
  let achado = '';
  percorrer(resposta, (texto) => {
    if (achado) return;
    const t = texto.trim();
    if (t.startsWith('data:image/')) achado = t;
    else if (/^iVBORw0KGgo/.test(t)) achado = 'data:image/png;base64,' + t;      // PNG em base64 puro
    else if (/^PHN2Zy/.test(t)) achado = 'data:image/svg+xml;base64,' + t;        // SVG em base64
    else if (/^https?:\/\/\S+\.(png|jpe?g|svg)(\?|$)/i.test(t)) achado = t;
  });
  return achado;
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
  const pix = r.pix || r.qr_code || r.charge?.pix || r.data?.pix || {};

  /* Primeiro os nomes conhecidos; se nada bater, procura pelo conteúdo. */
  const texto = pix.qr_code ?? pix.copy_paste ?? pix.emv ?? r.qr_code_text ?? acharPixTexto(r) ?? '';
  const imagem = pix.qr_code_image ?? pix.qr_code_base64 ?? r.qr_code_image ?? acharPixImagem(r) ?? '';

  if (!texto) {
    console.error('[gateway] Pix criado mas sem código copia e cola na resposta:',
                  JSON.stringify(r).slice(0, 1500));
  }

  return {
    idGateway: String(r.id ?? r.transaction_id ?? r.transactionId ?? r.reference_id ?? r.data?.id ?? ''),
    status: traduzirStatus(r.status ?? r.data?.status),
    pixTexto: texto,
    pixImagem: imagem,
    expiraEm: pix.expires_at ?? r.expires_at ?? r.expiresAt ?? null,
    bruto: CONFIG.diagnostico ? r : undefined
  };
}

export async function criarPagamentoCartao({ pedido, produto, cliente, tokenCartao, cartao, parcelas }) {
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
  const r = await chamarApi(caminho, montarCorpoCartao({ pedido, produto, cliente, tokenCartao, cartao, parcelas }));
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

/* Comparação em tempo constante, para não vazar o segredo pelo tempo de
   resposta. timingSafeEqual exige o mesmo tamanho: conferir antes evita a
   exceção e não revela nada além do comprimento, que já é público. */
function iguaisEmTempoConstante(a, b) {
  const bufA = Buffer.from(String(a), 'utf8');
  const bufB = Buffer.from(String(b), 'utf8');
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}

/* Autentica o webhook. Falha fechada: sem nenhum dos dois mecanismos abaixo
   configurado, nada é aceito — senão qualquer pessoa que descobrisse a URL
   liberaria acesso de graça mandando um POST.

   Dois caminhos, nessa ordem de preferência:

   1. ASSINATURA HMAC (FREEPAY_WEBHOOK_SEGREDO) — o jeito certo, quando o
      gateway assina o corpo da requisição. Configure também
      FREEPAY_WEBHOOK_HEADER com o nome do header que carrega a assinatura.

   2. TOKEN NA URL (FREEPAY_WEBHOOK_TOKEN) — para gateways que NÃO assinam
      nada. Você cadastra a URL do webhook com um token secreto na query:
         https://seusite.com/api/webhook?token=<valor aleatório longo>
      Quem não souber o token não consegue postar. É mais fraco que a
      assinatura (o token viaja na URL e aparece em logs de servidor), mas é
      muito melhor do que aceitar qualquer POST. Use HTTPS sempre. */
export function verificarAssinaturaWebhook(headers, corpoBruto, urlRequisicao = '') {
  if (CONFIG.modoGateway === 'simulado') return true;

  const segredo = env('FREEPAY_WEBHOOK_SEGREDO');
  if (segredo) {
    const nomeHeader = env('FREEPAY_WEBHOOK_HEADER', 'x-signature').toLowerCase();
    const recebida = String(headers[nomeHeader] || '').replace(/^sha256=/, '').trim();
    if (!recebida) return false;
    const esperada = crypto.createHmac('sha256', segredo).update(corpoBruto).digest('hex');
    return iguaisEmTempoConstante(recebida, esperada);
  }

  const token = env('FREEPAY_WEBHOOK_TOKEN');
  if (token) {
    const recebido = new URL(urlRequisicao || '/', 'http://local').searchParams.get('token') || '';
    return iguaisEmTempoConstante(recebido, token);
  }

  console.warn('[webhook] nem FREEPAY_WEBHOOK_SEGREDO nem FREEPAY_WEBHOOK_TOKEN configurados — evento recusado');
  return false;
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
