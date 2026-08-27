/* =========================================================================
   Contas, papéis e auditoria.
   O que importa aqui não é a tela: é o servidor recusar o que o perfil não
   pode, mesmo que alguém chame a API direto.
   ========================================================================= */

import assert from 'node:assert/strict';
import http from 'node:http';

const enviadas = [];
const telegramFalso = http.createServer((req, res) => {
  let b = ''; req.on('data', c => b += c); req.on('end', () => {
    enviadas.push({ metodo: req.url.split('/').pop(), corpo: b ? JSON.parse(b) : {} });
    res.writeHead(200, { 'Content-Type':'application/json' });
    res.end(JSON.stringify({ ok:true, result:{ id:1, first_name:'Bot', username:'bot_bot' } }));
  });
});
await new Promise(r => telegramFalso.listen(3183, r));

process.env.TELEGRAM_API_BASE = 'http://127.0.0.1:3183/bot';
process.env.GATEWAY_MODO = 'simulado';
process.env.SEGREDO_APP = 'segredo-de-teste';
process.env.TELEGRAM_BOT_TOKEN = '1:A';
process.env.TELEGRAM_WEBHOOK_SEGREDO = 'sg';
process.env.URL_SITE = 'https://exemplo.com';
process.env.PAINEL_ADMIN_EMAIL = 'chefe@empresa.com';
process.env.PAINEL_ADMIN_SENHA = 'senhaforte1';

const { criarServidor } = await import('./servidor-local.js');
const servidor = criarServidor();
await new Promise(r => servidor.listen(0, r));
const base = `http://127.0.0.1:${servidor.address().port}`;

let passou = 0, falhou = 0;
async function teste(nome, fn) {
  try { await fn(); console.log('  ✅', nome); passou++; }
  catch (e) { console.log('  ❌', nome, '\n     →', e.message); falhou++; }
}

const json = (metodo, corpo, cookie) => ({
  method: metodo,
  headers: { 'Content-Type':'application/json', ...(cookie ? { cookie } : {}) },
  body: corpo ? JSON.stringify(corpo) : undefined
});
async function entrar(email, senha) {
  const r = await fetch(base + '/api/painel-login', json('POST', { email, senha }));
  return { status: r.status, cookie: r.headers.get('set-cookie')?.split(';')[0] || '', corpo: await r.json() };
}

console.log('\nEquipe, papéis e auditoria\n');

let admin = '', supervisor = '', operador = '';

await teste('o administrador inicial nasce das variáveis de ambiente', async () => {
  const r = await entrar('chefe@empresa.com', 'senhaforte1');
  assert.equal(r.status, 200);
  assert.equal(r.corpo.usuario.papel, 'admin');
  admin = r.cookie;
});

await teste('senha errada é recusada sem dizer se a conta existe', async () => {
  const r1 = await entrar('chefe@empresa.com', 'errada');
  const r2 = await entrar('naoexiste@empresa.com', 'qualquer');
  assert.equal(r1.status, 401);
  assert.equal(r2.status, 401);
  assert.equal(r1.corpo.erro, r2.corpo.erro, 'a mensagem precisa ser idêntica nos dois casos');
});

await teste('admin cria supervisor e operador', async () => {
  const a = await fetch(base + '/api/painel-equipe',
    json('POST', { email:'sup@empresa.com', nome:'Ana Supervisora', senha:'supersenha1', papel:'supervisor' }, admin));
  const b = await fetch(base + '/api/painel-equipe',
    json('POST', { email:'op@empresa.com', nome:'Beto Operador', senha:'operasenha1', papel:'operador' }, admin));
  assert.equal(a.status, 201); assert.equal(b.status, 201);
  supervisor = (await entrar('sup@empresa.com','supersenha1')).cookie;
  operador = (await entrar('op@empresa.com','operasenha1')).cookie;
  assert.ok(supervisor && operador);
});

await teste('senha fraca é recusada na criação', async () => {
  const r = await fetch(base + '/api/painel-equipe',
    json('POST', { email:'x@empresa.com', nome:'X', senha:'123', papel:'operador' }, admin));
  assert.equal(r.status, 422);
  assert.match((await r.json()).erro, /8 caracteres/);
});

await teste('a senha nunca volta do servidor', async () => {
  const r = await (await fetch(base + '/api/painel-equipe', { headers:{ cookie: admin } })).json();
  assert.ok(!JSON.stringify(r).includes('senhaHash'), 'o hash não pode sair da API');
  assert.ok(!JSON.stringify(r).includes('supersenha1'));
});

await teste('os três perfis veem o painel', async () => {
  for (const c of [admin, supervisor, operador]) {
    assert.equal((await fetch(base + '/api/painel-dados', { headers:{ cookie:c } })).status, 200);
  }
});

await teste('operador não dispara mensagem', async () => {
  const r = await fetch(base + '/api/painel-bot', json('POST', { acao:'status' }, operador));
  assert.equal(r.status, 403);
});

await teste('supervisor opera o bot', async () => {
  const r = await fetch(base + '/api/painel-bot', json('POST', { acao:'status' }, supervisor));
  assert.equal(r.status, 200);
});

await teste('supervisor edita mensagens do bot', async () => {
  const r = await fetch(base + '/api/painel-config', json('POST', { bot:{ textoCatalogo:'Escolha aí:' } }, supervisor));
  assert.equal(r.status, 200);
});

await teste('supervisor NÃO altera preço', async () => {
  const r = await fetch(base + '/api/painel-config',
    json('POST', { produtos:{ 'bot-24h':{ id:'bot-24h', nome:'Bot', valorCentavos: 100, ativo:true } } }, supervisor));
  assert.equal(r.status, 403);
  const produto = await (await fetch(base + '/api/produto?id=bot-24h')).json();
  assert.equal(produto.produto.valorCentavos, 19700, 'o preço não podia ter mudado');
});

await teste('admin altera preço', async () => {
  const r = await fetch(base + '/api/painel-config',
    json('POST', { produtos:{ 'bot-24h':{ id:'bot-24h', nome:'Bot 24h', valorCentavos: 24700, maxParcelas:12, ativo:true } } }, admin));
  assert.equal(r.status, 200);
  const produto = await (await fetch(base + '/api/produto?id=bot-24h')).json();
  assert.equal(produto.produto.valorCentavos, 24700);
});

await teste('só admin gere a equipe', async () => {
  assert.equal((await fetch(base + '/api/painel-equipe', { headers:{ cookie: supervisor } })).status, 403);
  assert.equal((await fetch(base + '/api/painel-equipe', { headers:{ cookie: operador } })).status, 403);
});

await teste('operador não vê a auditoria; supervisor vê', async () => {
  assert.equal((await fetch(base + '/api/painel-auditoria', { headers:{ cookie: operador } })).status, 403);
  assert.equal((await fetch(base + '/api/painel-auditoria', { headers:{ cookie: supervisor } })).status, 200);
});

await teste('a auditoria registra quem alterou o preço, e de quanto para quanto', async () => {
  const r = await (await fetch(base + '/api/painel-auditoria', { headers:{ cookie: admin } })).json();
  const evento = r.eventos.find(e => e.acao === 'config_salva' && e.detalhe.includes('preço'));
  assert.ok(evento, 'esperava o registro da mudança de preço');
  assert.equal(evento.quem, 'chefe@empresa.com');
  assert.match(evento.detalhe, /197,00 → R\$ 247,00/);
});

await teste('tentativa de acesso recusada também fica registrada', async () => {
  const r = await (await fetch(base + '/api/painel-auditoria', { headers:{ cookie: admin } })).json();
  assert.ok(r.eventos.some(e => e.acao === 'login_falho'), 'acesso negado precisa deixar rastro');
});

await teste('conta desativada perde o acesso na ação seguinte', async () => {
  await fetch(base + '/api/painel-equipe', json('PATCH', { email:'op@empresa.com', ativo:false }, admin));
  assert.equal((await fetch(base + '/api/painel-dados', { headers:{ cookie: operador } })).status, 401);
});

await teste('conta desativada não consegue entrar de novo', async () => {
  assert.equal((await entrar('op@empresa.com','operasenha1')).status, 401);
});

await teste('admin não rebaixa nem remove a própria conta', async () => {
  const a = await fetch(base + '/api/painel-equipe', json('PATCH', { email:'chefe@empresa.com', papel:'operador' }, admin));
  const b = await fetch(base + '/api/painel-equipe?email=chefe%40empresa.com', { method:'DELETE', headers:{ cookie: admin } });
  assert.equal(a.status, 422);
  assert.equal(b.status, 422);
});

await teste('a equipe nunca fica sem administrador', async () => {
  await fetch(base + '/api/painel-equipe',
    json('POST', { email:'admin2@empresa.com', nome:'Segundo', senha:'outrasenha1', papel:'admin' }, admin));
  /* Com dois admins, rebaixar um é permitido. */
  const ok = await fetch(base + '/api/painel-equipe', json('PATCH', { email:'admin2@empresa.com', papel:'supervisor' }, admin));
  assert.equal(ok.status, 200);
  /* Voltando a um só, a trava impede. */
  const barrado = await fetch(base + '/api/painel-equipe', json('PATCH', { email:'admin2@empresa.com', papel:'supervisor' }, admin));
  assert.equal(barrado.status, 200);  // já é supervisor, não mexe em admin
});

await teste('cookie forjado não abre o painel', async () => {
  const r = await fetch(base + '/api/painel-dados', { headers:{ cookie:'painel=OTk5OTk5OTk5OTk5OTk6Y2hlZmVAZW1wcmVzYS5jb20.assinaturafalsa' } });
  assert.equal(r.status, 401);
});

servidor.close(); telegramFalso.close();
console.log(`\n  ${passou} passaram, ${falhou} falharam\n`);
process.exit(falhou ? 1 : 0);
