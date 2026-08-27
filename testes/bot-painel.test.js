/* =========================================================================
   Bot do Telegram + painel, de ponta a ponta.
   A API do Telegram é substituída por um servidor falso que registra o que
   foi enviado — assim dá para afirmar o que o cliente recebeu, e não apenas
   que a função não quebrou.
   ========================================================================= */

import assert from 'node:assert/strict';
import http from 'node:http';

/* --- Telegram falso ---------------------------------------------------- */
const enviadas = [];
const telegramFalso = http.createServer((req, res) => {
  let b = ''; req.on('data', c => b += c); req.on('end', () => {
    const metodo = req.url.split('/').pop();
    const corpo = b ? JSON.parse(b) : {};
    enviadas.push({ metodo, corpo });
    const resultado =
      metodo === 'getMe' ? { id: 1, first_name: 'Bot 24h', username: 'bot24h_bot' } :
      metodo === 'getWebhookInfo' ? { url: 'https://exemplo.com/api/telegram', pending_update_count: 0 } : true;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, result: resultado }));
  });
});
await new Promise(r => telegramFalso.listen(3181, r));

/* Aponta o cliente do Telegram para o servidor falso acima. Sem isto o teste
   tentaria falar com a API real e dependeria de rede. */
process.env.TELEGRAM_API_BASE = 'http://127.0.0.1:3181/bot';
process.env.GATEWAY_MODO = 'simulado';
process.env.TELEGRAM_BOT_TOKEN = '123:ABC';
process.env.TELEGRAM_WEBHOOK_SEGREDO = 'segredo-telegram';
process.env.PAINEL_SENHA = 'senha-de-teste';
process.env.SEGREDO_APP = 'segredo-app-teste';
process.env.URL_SITE = 'https://exemplo.com';

const { criarServidor } = await import('./servidor-local.js');
const servidor = criarServidor();
await new Promise(r => servidor.listen(0, r));
const base = `http://127.0.0.1:${servidor.address().port}`;

let passou = 0, falhou = 0;
async function teste(nome, fn) {
  try { await fn(); console.log('  ✅', nome); passou++; }
  catch (e) { console.log('  ❌', nome, '\n     →', e.message); falhou++; }
}

const CHAT = 55501;
const cabecalhos = { 'Content-Type': 'application/json', 'x-telegram-bot-api-secret-token': 'segredo-telegram' };
const usuario = { id: CHAT, first_name: 'Maria', last_name: 'Silva', username: 'mariasilva' };

const enviarAoBot = (texto, extra = {}) => fetch(base + '/api/telegram', {
  method: 'POST', headers: cabecalhos,
  body: JSON.stringify({ message: { chat: { id: CHAT }, from: usuario, text: texto, ...extra } })
});
const clicar = (data) => fetch(base + '/api/telegram', {
  method: 'POST', headers: cabecalhos,
  body: JSON.stringify({ callback_query: { id: 'cb1', data, from: usuario, message: { chat: { id: CHAT } } } })
});
const ultima = () => enviadas.filter(e => e.metodo === 'sendMessage').at(-1)?.corpo.text || '';

console.log('\nBot do Telegram + painel\n');

await teste('webhook sem o segredo é recusado', async () => {
  const r = await fetch(base + '/api/telegram', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: { chat: { id: CHAT }, from: usuario, text: '/start' } })
  });
  assert.equal(r.status, 401);
});

await teste('/start responde com o menu', async () => {
  await enviarAoBot('/start');
  const msg = enviadas.filter(e => e.metodo === 'sendMessage').at(-1);
  assert.match(msg.corpo.text, /Maria/);
  assert.ok(msg.corpo.reply_markup.inline_keyboard.length >= 2, 'esperava botões no menu');
});

await teste('catálogo lista o produto com preço', async () => {
  await clicar('catalogo');
  const msg = enviadas.filter(e => e.metodo === 'sendMessage').at(-1);
  const botoes = JSON.stringify(msg.corpo.reply_markup.inline_keyboard);
  assert.match(botoes, /197,00/);
  assert.match(botoes, /comprar:bot-24h/);
});

await teste('compra pede e-mail', async () => {
  await clicar('comprar:bot-24h');
  assert.match(ultima(), /e-mail/i);
});

await teste('e-mail inválido é recusado sem avançar', async () => {
  await enviarAoBot('não é email');
  assert.match(ultima(), /não parece válido/i);
});

await teste('e-mail válido leva ao CPF', async () => {
  await enviarAoBot('maria@exemplo.com');
  assert.match(ultima(), /CPF/i);
});

await teste('CPF inválido é recusado', async () => {
  await enviarAoBot('111.111.111-11');
  assert.match(ultima(), /não confere/i);
});

await teste('CPF válido pede o telefone com botão de contato', async () => {
  await enviarAoBot('529.982.247-25');
  const msg = enviadas.filter(e => e.metodo === 'sendMessage').at(-1);
  assert.ok(msg.corpo.reply_markup.keyboard[0][0].request_contact, 'esperava botão de compartilhar contato');
});

await teste('telefone fecha o fluxo e entrega o código Pix', async () => {
  await enviarAoBot('', { contact: { phone_number: '+5511999998888' } });
  const textos = enviadas.filter(e => e.metodo === 'sendMessage').map(e => e.corpo.text);
  assert.ok(textos.some(t => /Pix gerado/i.test(t)), 'esperava aviso de Pix gerado');
  assert.ok(textos.some(t => t.startsWith('`SIMULADO')), 'esperava o código copia e cola numa mensagem própria');
});

/* --- painel ------------------------------------------------------------ */
let cookie = '';

await teste('painel recusa acesso sem sessão', async () => {
  assert.equal((await fetch(base + '/api/painel-dados')).status, 401);
});

await teste('senha errada é recusada', async () => {
  const r = await fetch(base + '/api/painel-login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ senha: 'chute' })
  });
  assert.equal(r.status, 401);
});

await teste('senha correta abre sessão', async () => {
  const r = await fetch(base + '/api/painel-login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ senha: 'senha-de-teste' })
  });
  assert.equal(r.status, 200);
  cookie = r.headers.get('set-cookie').split(';')[0];
  assert.match(cookie, /^painel=/);
});

await teste('cookie forjado não vale', async () => {
  const r = await fetch(base + '/api/painel-dados', { headers: { cookie: 'painel=99999999999999.assinaturafalsa' } });
  assert.equal(r.status, 401);
});

await teste('painel mostra o pedido criado pelo bot', async () => {
  const d = await (await fetch(base + '/api/painel-dados', { headers: { cookie } })).json();
  assert.equal(d.ok, true);
  const doBot = d.pedidos.find(p => p.origem === 'telegram');
  assert.ok(doBot, 'esperava o pedido do bot na lista');
  assert.equal(doBot.cliente.email, 'maria@exemplo.com');
  assert.equal(d.resumo.totalLeads, 1);
});

await teste('pagamento confirmado avisa o cliente no Telegram', async () => {
  const dados = await (await fetch(base + '/api/painel-dados', { headers: { cookie } })).json();
  const pedido = dados.pedidos.find(p => p.origem === 'telegram');
  await fetch(base + '/api/webhook', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reference_id: pedido.id, status: 'paid' })
  });
  const textos = enviadas.filter(e => e.metodo === 'sendMessage').map(e => e.corpo.text);
  assert.ok(textos.some(t => /Pagamento confirmado/i.test(t)), 'o comprador precisa ser avisado no chat');
});

await teste('venda entra nas métricas do painel', async () => {
  const d = await (await fetch(base + '/api/painel-dados', { headers: { cookie } })).json();
  assert.equal(d.resumo.hoje.vendas, 1);
  assert.equal(d.resumo.hoje.receita, '197,00');
});

await teste('configuração salva muda o preço do site e do bot', async () => {
  const r = await fetch(base + '/api/painel-config', {
    method: 'POST', headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({ produtos: { 'bot-24h': { id:'bot-24h', nome:'Bot 24h', valorCentavos: 24700, maxParcelas: 12, ativo: true } } })
  });
  assert.equal(r.status, 200);
  const produto = await (await fetch(base + '/api/produto?id=bot-24h')).json();
  assert.equal(produto.produto.valorCentavos, 24700, 'o checkout do site tem que refletir o novo preço');
});

await teste('preço fora da faixa é recusado', async () => {
  const r = await fetch(base + '/api/painel-config', {
    method: 'POST', headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({ produtos: { 'bot-24h': { id:'bot-24h', nome:'X', valorCentavos: 0, ativo: true } } })
  });
  assert.equal(r.status, 422);
});

await teste('bot pausado no painel para de responder', async () => {
  await fetch(base + '/api/painel-config', {
    method: 'POST', headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({ bot: { ativo: false } })
  });
  const antes = enviadas.length;
  await enviarAoBot('/start');
  assert.equal(enviadas.length, antes, 'bot pausado não deveria enviar nada');
  await fetch(base + '/api/painel-config', {
    method: 'POST', headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({ bot: { ativo: true } })
  });
});

await teste('disparo em massa envia para os contatos', async () => {
  const r = await (await fetch(base + '/api/painel-bot', {
    method: 'POST', headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({ acao: 'disparo', mensagem: 'Promoção de teste' })
  })).json();
  assert.equal(r.enviados, 1);
});

await teste('conectar registra o webhook no Telegram', async () => {
  const r = await (await fetch(base + '/api/painel-bot', {
    method: 'POST', headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({ acao: 'conectar' })
  })).json();
  assert.equal(r.ok, true);
  const chamada = enviadas.filter(e => e.metodo === 'setWebhook').at(-1);
  assert.equal(chamada.corpo.url, 'https://exemplo.com/api/telegram');
  assert.equal(chamada.corpo.secret_token, 'segredo-telegram');
});

servidor.close(); telegramFalso.close();
console.log(`\n  ${passou} passaram, ${falhou} falharam\n`);
process.exit(falhou ? 1 : 0);
