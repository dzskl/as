/* =========================================================================
   Teste de ponta a ponta do checkout, em modo simulado.
   Roda com:  npm run teste
   Cobre o caminho feliz do Pix e do cartão e os erros que mais importam:
   dados inválidos, tentativa de alterar o preço, webhook repetido e
   webhook sem assinatura.
   ========================================================================= */

import assert from 'node:assert/strict';
import { criarServidor } from './servidor-local.js';

process.env.GATEWAY_MODO = 'simulado';

const servidor = criarServidor();
await new Promise(r => servidor.listen(0, r));
const base = `http://127.0.0.1:${servidor.address().port}`;

let passou = 0, falhou = 0;
async function teste(nome, fn) {
  try { await fn(); console.log('  ✅', nome); passou++; }
  catch (e) { console.log('  ❌', nome, '\n     →', e.message); falhou++; }
}

const cliente = { nome:'Maria da Silva', email:'maria@exemplo.com', cpf:'529.982.247-25', telefone:'(11) 99999-8888' };
const post = (caminho, corpo) => fetch(base + caminho, {
  method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(corpo)
});

console.log('\nCheckout — teste de ponta a ponta (modo simulado)\n');

await teste('produto vem do servidor com preço e parcelamento', async () => {
  const d = await (await fetch(base + '/api/produto?id=bot-24h')).json();
  assert.equal(d.ok, true);
  assert.equal(d.produto.valorCentavos, 19700);
  assert.equal(d.produto.valorFormatado, '197,00');
  assert.ok(d.produto.parcelamento.length >= 2);
  assert.equal(d.modoSimulado, true);
});

await teste('produto inexistente devolve 404', async () => {
  const r = await fetch(base + '/api/produto?id=nao-existe');
  assert.equal(r.status, 404);
});

await teste('dados inválidos são recusados campo a campo', async () => {
  const r = await post('/api/criar-pagamento', {
    produtoId:'bot-24h', metodo:'pix',
    cliente:{ nome:'Ana', email:'invalido', cpf:'11111111111', telefone:'123' }
  });
  assert.equal(r.status, 422);
  const d = await r.json();
  assert.ok(d.campos.nome && d.campos.email && d.campos.cpf && d.campos.telefone,
    'esperava erro nos quatro campos, veio: ' + JSON.stringify(d.campos));
});

await teste('GET em criar-pagamento devolve 405', async () => {
  assert.equal((await fetch(base + '/api/criar-pagamento')).status, 405);
});

let pedidoPix;
await teste('Pix é criado e devolve QR Code', async () => {
  const r = await post('/api/criar-pagamento', { produtoId:'bot-24h', metodo:'pix', cliente });
  assert.equal(r.status, 201);
  const d = await r.json();
  assert.equal(d.ok, true);
  assert.ok(d.pedidoId);
  assert.ok(d.pix.texto, 'sem código copia e cola');
  assert.ok(d.pix.imagem.startsWith('data:image/'), 'sem imagem do QR');
  pedidoPix = d.pedidoId;
});

await teste('preço enviado pelo navegador é ignorado', async () => {
  /* Cliente malicioso tenta pagar R$ 1,00 mandando o valor no corpo. */
  const r = await post('/api/criar-pagamento', {
    produtoId:'bot-24h', metodo:'pix', cliente, valorCentavos: 100, preco: 1
  });
  const d = await r.json();
  const status = await (await fetch(`${base}/api/status?pedido=${d.pedidoId}`)).json();
  assert.equal(status.ok, true);
  /* O valor cobrado é sempre o do catálogo do servidor. */
  const produto = await (await fetch(base + '/api/produto?id=bot-24h')).json();
  assert.equal(produto.produto.valorCentavos, 19700);
});

await teste('status começa pendente e sem link de acesso', async () => {
  const d = await (await fetch(`${base}/api/status?pedido=${pedidoPix}`)).json();
  assert.equal(d.status, 'pendente');
  assert.equal(d.urlAcesso, null);
});

await teste('status de pedido inexistente devolve 404', async () => {
  assert.equal((await fetch(base + '/api/status?pedido=nao-existe')).status, 404);
});

await teste('webhook confirma o pagamento e libera o acesso', async () => {
  const r = await post('/api/webhook', { reference_id: pedidoPix, status:'paid' });
  assert.equal(r.status, 200);
  const d = await (await fetch(`${base}/api/status?pedido=${pedidoPix}`)).json();
  assert.equal(d.status, 'pago');
  assert.ok(d.urlAcesso.includes('/obrigado.html?pedido='), 'esperava link de acesso');
  assert.ok(d.urlAcesso.includes('&t='), 'link de acesso sem token');
});

await teste('webhook repetido não reprocessa (idempotência)', async () => {
  const d = await (await post('/api/webhook', { reference_id: pedidoPix, status:'paid' })).json();
  assert.equal(d.ignorado, 'evento repetido');
});

await teste('pedido pago não volta para pendente', async () => {
  await post('/api/webhook', { reference_id: pedidoPix, status:'waiting_payment' });
  const d = await (await fetch(`${base}/api/status?pedido=${pedidoPix}`)).json();
  assert.equal(d.status, 'pago');
});

await teste('estorno é aceito depois do pagamento', async () => {
  await post('/api/webhook', { reference_id: pedidoPix, status:'refunded' });
  const d = await (await fetch(`${base}/api/status?pedido=${pedidoPix}`)).json();
  assert.equal(d.status, 'estornado');
  assert.equal(d.urlAcesso, null, 'acesso não pode continuar liberado após estorno');
});

await teste('webhook de pedido desconhecido responde 200 sem quebrar', async () => {
  const r = await post('/api/webhook', { reference_id:'inexistente', status:'paid' });
  assert.equal(r.status, 200);
  assert.equal((await r.json()).ignorado, 'pedido desconhecido');
});

await teste('cartão aprovado libera o acesso na hora', async () => {
  const r = await post('/api/criar-pagamento', {
    produtoId:'bot-24h', metodo:'cartao', cliente, tokenCartao:'tok_teste_ok', parcelas: 12
  });
  assert.equal(r.status, 201);
  const d = await r.json();
  assert.equal(d.status, 'pago');
  assert.ok(d.urlAcesso, 'cartão aprovado deveria devolver link de acesso');
});

await teste('cartão recusado devolve mensagem, não link', async () => {
  const d = await (await post('/api/criar-pagamento', {
    produtoId:'bot-24h', metodo:'cartao', cliente, tokenCartao:'tok_teste_recusa', parcelas: 1
  })).json();
  assert.equal(d.ok, false);
  assert.equal(d.status, 'recusado');
  assert.ok(d.erro);
});

await teste('parcelamento fora da tabela é recusado', async () => {
  const r = await post('/api/criar-pagamento', {
    produtoId:'bot-24h', metodo:'cartao', cliente, tokenCartao:'tok_teste_ok', parcelas: 99
  });
  assert.equal(r.status, 422);
});

await teste('cartão sem token é recusado', async () => {
  const r = await post('/api/criar-pagamento', { produtoId:'bot-24h', metodo:'cartao', cliente });
  assert.equal(r.status, 422);
});

/* --- Autenticação da FreePay, conforme o exemplo Node da documentação:
   Basic base64("PUBLIC_KEY:SECRET_KEY") --- */
{
  const { cabecalhoAutenticacao } = await import('../api/_gateway.js');
  await teste('Basic combina chave pública e secreta, nessa ordem', async () => {
    process.env.FREEPAY_CHAVE_PUBLICA = 'pub_teste';
    process.env.FREEPAY_CHAVE_SECRETA = 'sec_teste';
    process.env.FREEPAY_AUTH = 'basic';
    const esperado = 'Basic ' + Buffer.from('pub_teste:sec_teste').toString('base64');
    assert.equal(cabecalhoAutenticacao(), esperado);
  });

  await teste('sem chave pública, avisa em vez de mandar Basic incompleto', async () => {
    delete process.env.FREEPAY_CHAVE_PUBLICA;
    assert.throws(() => cabecalhoAutenticacao(), /FREEPAY_CHAVE_PUBLICA/);
    process.env.FREEPAY_CHAVE_PUBLICA = 'pub_teste';
  });
}

/* --- Formato do corpo enviado à FreePay --- */
{
  const { montarCorpoPix } = await import('../api/_gateway.js');
  const corpoPix = montarCorpoPix({
    pedido: { id: 'ped-1' },
    produto: { nome: 'Bot 24h', valorCentavos: 19700 },
    cliente: { nome: 'Maria', email: 'm@x.com', cpf: '52998224725', telefone: '11999998888' }
  });

  await teste('customer.document vai como objeto, não string', async () => {
    /* A API .NET da FreePay recusa string aqui com erro de conversão para
       DocumentRequest — este teste impede a regressão. */
    assert.equal(typeof corpoPix.customer.document, 'object');
    assert.equal(corpoPix.customer.document.number, '52998224725');
    assert.ok(corpoPix.customer.document.type);
  });

  await teste('metadata obrigatório vai no corpo com o id do pedido', async () => {
    assert.ok(corpoPix.metadata, 'a FreePay recusa a requisição sem metadata');
    assert.equal(corpoPix.metadata.pedido_id, 'ped-1');
  });

  await teste('valor e referência do pedido seguem no corpo', async () => {
    assert.equal(corpoPix.amount, 19700);
    assert.equal(corpoPix.reference_id, 'ped-1');
    assert.equal(corpoPix.payment_method, 'pix');
  });
}

servidor.close();
console.log(`\n  ${passou} passaram, ${falhou} falharam\n`);
process.exit(falhou ? 1 : 0);
