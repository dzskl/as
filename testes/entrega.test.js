/* =========================================================================
   Entrega por e-mail — compra pelo site e pelo bot.

   O que se verifica não é "a função foi chamada", e sim que o comprador
   recebe o MESMO conteúdo pelos dois canais, vindo de uma fonte só. O Resend
   e o Telegram são substituídos por servidores falsos que guardam o que
   receberam, então dá para comparar palavra por palavra.
   ========================================================================= */

import assert from 'node:assert/strict';
import http from 'node:http';

/* --- Resend falso ------------------------------------------------------- */
const emails = [];
let respostaResend = { status: 200, corpo: { id: 'email_1' } };
const resendFalso = http.createServer((req, res) => {
  let b = ''; req.on('data', c => b += c); req.on('end', () => {
    emails.push({ ...JSON.parse(b || '{}'), authorization: req.headers.authorization });
    res.writeHead(respostaResend.status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(respostaResend.corpo));
  });
});
await new Promise(r => resendFalso.listen(3186, r));

/* --- Telegram falso ----------------------------------------------------- */
const mensagensBot = [];
const telegramFalso = http.createServer((req, res) => {
  let b = ''; req.on('data', c => b += c); req.on('end', () => {
    const metodo = req.url.split('/').pop();
    const corpo = b ? JSON.parse(b) : {};
    if (metodo === 'sendMessage') mensagensBot.push(corpo);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, result: true }));
  });
});
await new Promise(r => telegramFalso.listen(3187, r));

process.env.GATEWAY_MODO = 'simulado';
process.env.SEGREDO_APP = 'segredo-entrega';
process.env.TELEGRAM_API_BASE = 'http://127.0.0.1:3187/bot';
process.env.TELEGRAM_BOT_TOKEN = '1:A';
process.env.RESEND_API_BASE = 'http://127.0.0.1:3186';
process.env.RESEND_API_KEY = 're_chave_de_teste';
process.env.EMAIL_REMETENTE = 'Bot 24h <acesso@exemplo.com.br>';
process.env.URL_SITE = 'https://exemplo.com.br';

const { entregarAcesso } = await import('../api/_entrega.js');
const { salvarConfig, lerConfig } = await import('../api/_configuracao.js');
const { registrarContato } = await import('../api/_leads.js');

let passou = 0, falhou = 0;
async function teste(nome, fn) {
  try { await fn(); console.log('  ✅', nome); passou++; }
  catch (e) { console.log('  ❌', nome, '\n     →', e.message); falhou++; }
}

const COMPRADOR = { nome: 'Rita Guimarães Alves', email: 'rita.alves@provedor.com.br',
                    cpf: '52998224725', telefone: '11988887777' };
const pedidoSite = (extra = {}) => ({
  id: 'pedido-site-1', produtoId: 'bot-24h', origem: 'site', cliente: COMPRADOR, ...extra
});

console.log('\nEntrega — e-mail e chat a partir da mesma mensagem\n');

await teste('compra pelo site dispara e-mail para o comprador', async () => {
  emails.length = 0;
  const r = await entregarAcesso(pedidoSite());
  assert.equal(r.email, 'enviado');
  assert.equal(emails.length, 1, 'esperava exatamente um e-mail');
  assert.deepEqual(emails[0].to, [COMPRADOR.email]);
  assert.equal(emails[0].from, 'Bot 24h <acesso@exemplo.com.br>');
  assert.match(emails[0].authorization, /^Bearer re_chave_de_teste$/);
});

await teste('o assunto nomeia o produto comprado', async () => {
  assert.match(emails[0].subject, /Pagamento confirmado/);
  assert.match(emails[0].subject, /Bot 24h/);
});

await teste('e-mail vai em HTML e em texto puro', async () => {
  assert.match(emails[0].html, /^<!DOCTYPE html>/);
  assert.ok(emails[0].text && !emails[0].text.includes('<'), 'a versão texto não pode conter HTML');
});

await teste('compra pelo site NÃO manda mensagem no Telegram', async () => {
  mensagensBot.length = 0;
  await entregarAcesso(pedidoSite({ id: 'pedido-site-2' }));
  assert.equal(mensagensBot.length, 0, 'quem comprou no site não tem chat para receber');
});

await teste('compra pelo bot recebe chat E e-mail', async () => {
  emails.length = 0; mensagensBot.length = 0;
  await registrarContato({ id: 90001, first_name: 'Rita', username: 'rita' });
  const r = await entregarAcesso({
    id: 'pedido-bot-1', produtoId: 'bot-24h', origem: 'telegram', chatId: '90001', cliente: COMPRADOR
  });
  assert.equal(r.telegram, 'enviado');
  assert.equal(r.email, 'enviado');
  assert.equal(mensagensBot.length, 1);
  assert.equal(emails.length, 1);
});

await teste('os dois canais carregam o mesmo conteúdo', async () => {
  /* O chat usa a marcação do Telegram e o e-mail usa HTML; comparamos o
     texto por baixo das duas marcações. */
  const semMarcacao = t => String(t).replace(/[*_\\]/g, '').replace(/\s+/g, ' ').trim();
  const doChat = semMarcacao(mensagensBot[0].text);
  const doEmail = semMarcacao(emails[0].text);
  assert.equal(doEmail, doChat, 'e-mail e chat divergiram — sinal de regra duplicada');
});

await teste('mudar o texto no painel muda os dois canais', async () => {
  const original = (await lerConfig()).bot.textoPosPagamento;
  await salvarConfig({ bot: { textoPosPagamento: 'Tudo certo com *{produto}*! Bem-vinda.' } });

  emails.length = 0; mensagensBot.length = 0;
  await entregarAcesso({ id: 'pedido-bot-2', produtoId: 'bot-24h', origem: 'telegram',
                         chatId: '90001', cliente: COMPRADOR });

  assert.match(mensagensBot[0].text, /Tudo certo com/, 'o chat não seguiu o texto novo');
  assert.match(emails[0].text, /Tudo certo com/, 'o e-mail não seguiu o texto novo');
  assert.match(emails[0].html, /<strong>Bot 24h[^<]*<\/strong>/,
    'a marcação *negrito* do painel deveria virar <strong> no e-mail');

  await salvarConfig({ bot: { textoPosPagamento: original } });
});

await teste('falha no e-mail não derruba a entrega', async () => {
  respostaResend = { status: 422, corpo: { message: 'domínio não verificado' } };
  const r = await entregarAcesso(pedidoSite({ id: 'pedido-site-3' }));
  assert.equal(r.email, 'falhou');
  respostaResend = { status: 200, corpo: { id: 'email_ok' } };
});

await teste('falha no Telegram não impede o e-mail', async () => {
  emails.length = 0;
  const tokenOriginal = process.env.TELEGRAM_BOT_TOKEN;
  delete process.env.TELEGRAM_BOT_TOKEN;   // bot indisponível
  const r = await entregarAcesso({ id: 'pedido-bot-3', produtoId: 'bot-24h', origem: 'telegram',
                                   chatId: '90001', cliente: COMPRADOR });
  assert.equal(r.telegram, null, 'sem token, o canal do bot nem é tentado');
  assert.equal(r.email, 'enviado', 'o e-mail precisa sair mesmo assim');
  process.env.TELEGRAM_BOT_TOKEN = tokenOriginal;
});

await teste('sem chave configurada, entrega roda em modo simulado sem quebrar', async () => {
  const chave = process.env.RESEND_API_KEY;
  delete process.env.RESEND_API_KEY;
  emails.length = 0;
  const r = await entregarAcesso(pedidoSite({ id: 'pedido-site-4' }));
  assert.equal(r.email, 'simulado');
  assert.equal(emails.length, 0, 'não pode chamar o provedor sem chave');
  process.env.RESEND_API_KEY = chave;
});

await teste('pedido sem e-mail não quebra a entrega', async () => {
  const r = await entregarAcesso({ id: 'pedido-sem-email', produtoId: 'bot-24h', origem: 'site',
                                   cliente: { nome: 'Sem Email' } });
  assert.equal(r.email, 'sem endereço');
});

await teste('o endereço do comprador não aparece em log', async () => {
  const original = { log: console.log, error: console.error, warn: console.warn };
  const linhas = [];
  const serializar = a => typeof a === 'string' ? a : JSON.stringify(a);
  console.log = console.error = console.warn = (...a) => linhas.push(a.map(serializar).join(' '));
  await entregarAcesso(pedidoSite({ id: 'pedido-site-5' }));
  Object.assign(console, original);
  const texto = linhas.join('\n');
  assert.ok(!texto.includes(COMPRADOR.email), 'e-mail em claro no log');
  assert.ok(!texto.includes(COMPRADOR.nome), 'nome em claro no log');
  assert.match(texto, /r\*\*\*@provedor\.com\.br/, 'esperava o endereço mascarado');
});

resendFalso.close(); telegramFalso.close();
console.log(`\n  ${passou} passaram, ${falhou} falharam\n`);
process.exit(falhou ? 1 : 0);
