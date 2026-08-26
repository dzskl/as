/* =========================================================================
   Autenticação do webhook — testado em modo REAL (não simulado), que é onde
   a proteção precisa valer.
   Roda com: node testes/webhook-seguranca.test.js
   ========================================================================= */

import assert from 'node:assert/strict';
import crypto from 'node:crypto';

process.env.GATEWAY_MODO = 'freepay';
const { verificarAssinaturaWebhook } = await import('../api/_gateway.js');

let passou = 0, falhou = 0;
function teste(nome, fn) {
  try { fn(); console.log('  ✅', nome); passou++; }
  catch (e) { console.log('  ❌', nome, '\n     →', e.message); falhou++; }
}
function limparEnv() {
  delete process.env.FREEPAY_WEBHOOK_SEGREDO;
  delete process.env.FREEPAY_WEBHOOK_TOKEN;
  delete process.env.FREEPAY_WEBHOOK_HEADER;
}

const corpo = JSON.stringify({ reference_id: 'abc', status: 'paid' });

console.log('\nWebhook — autenticação (modo freepay)\n');

teste('sem nada configurado, recusa (falha fechada)', () => {
  limparEnv();
  assert.equal(verificarAssinaturaWebhook({}, corpo, '/api/webhook'), false);
});

teste('assinatura HMAC correta é aceita', () => {
  limparEnv();
  process.env.FREEPAY_WEBHOOK_SEGREDO = 'segredo-forte';
  const assinatura = crypto.createHmac('sha256','segredo-forte').update(corpo).digest('hex');
  assert.equal(verificarAssinaturaWebhook({ 'x-signature': assinatura }, corpo, '/api/webhook'), true);
});

teste('prefixo sha256= é aceito', () => {
  const assinatura = crypto.createHmac('sha256','segredo-forte').update(corpo).digest('hex');
  assert.equal(verificarAssinaturaWebhook({ 'x-signature': 'sha256=' + assinatura }, corpo, '/api/webhook'), true);
});

teste('corpo adulterado invalida a assinatura', () => {
  const assinatura = crypto.createHmac('sha256','segredo-forte').update(corpo).digest('hex');
  const adulterado = JSON.stringify({ reference_id: 'abc', status: 'paid', valor: 1 });
  assert.equal(verificarAssinaturaWebhook({ 'x-signature': assinatura }, adulterado, '/api/webhook'), false);
});

teste('assinatura ausente é recusada', () => {
  assert.equal(verificarAssinaturaWebhook({}, corpo, '/api/webhook'), false);
});

teste('header da assinatura é configurável', () => {
  limparEnv();
  process.env.FREEPAY_WEBHOOK_SEGREDO = 'segredo-forte';
  process.env.FREEPAY_WEBHOOK_HEADER = 'x-freepay-signature';
  const assinatura = crypto.createHmac('sha256','segredo-forte').update(corpo).digest('hex');
  assert.equal(verificarAssinaturaWebhook({ 'x-freepay-signature': assinatura }, corpo, '/api/webhook'), true);
});

teste('token na URL: valor correto é aceito', () => {
  limparEnv();
  process.env.FREEPAY_WEBHOOK_TOKEN = 'token-secreto-longo';
  assert.equal(verificarAssinaturaWebhook({}, corpo, '/api/webhook?token=token-secreto-longo'), true);
});

teste('token na URL: valor errado é recusado', () => {
  assert.equal(verificarAssinaturaWebhook({}, corpo, '/api/webhook?token=chute'), false);
});

teste('token na URL: sem token na query é recusado', () => {
  assert.equal(verificarAssinaturaWebhook({}, corpo, '/api/webhook'), false);
});

teste('HMAC tem prioridade sobre token na URL', () => {
  limparEnv();
  process.env.FREEPAY_WEBHOOK_SEGREDO = 'segredo-forte';
  process.env.FREEPAY_WEBHOOK_TOKEN = 'token-secreto-longo';
  /* Token certo na URL, mas sem assinatura válida: tem que recusar. */
  assert.equal(verificarAssinaturaWebhook({}, corpo, '/api/webhook?token=token-secreto-longo'), false);
});

console.log(`\n  ${passou} passaram, ${falhou} falharam\n`);
process.exit(falhou ? 1 : 0);
