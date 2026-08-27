/* =========================================================================
   Dado pessoal não vaza — nem em log, nem na resposta HTTP.

   O teste não confere se a redação "parece certa": ele captura TUDO que o
   sistema escreveu no console e TUDO que devolveu por HTTP durante um fluxo
   real de compra, e procura os dados do comprador ali dentro. Se aparecerem,
   falha — não importa por qual caminho tenham saído.

   Roda o mesmo fluxo com DIAGNOSTICO desligado e ligado, porque a exigência
   é defesa em profundidade: a flag não pode ser a única coisa entre o CPF do
   cliente e o log da hospedagem.
   ========================================================================= */

import assert from 'node:assert/strict';
import http from 'node:http';

/* --- Dados do comprador que NÃO podem aparecer em lugar nenhum ---------- */
const COMPRADOR = {
  nome: 'Joaquina Pereira Nascimento',
  email: 'joaquina.nascimento@provedor.com.br',
  cpf: '529.982.247-25',
  telefone: '(11) 98765-4321'
};
const CARTAO = { numero: '4111111111111111', titular: 'JOAQUINA P NASCIMENTO', validade: '12/30', cvv: '317' };
const ENDERECO = { cep:'01310-100', rua:'Avenida Paulista', numero:'1578', bairro:'Bela Vista', cidade:'São Paulo', uf:'SP' };

/* Cada agulha é procurada em várias formas — com e sem pontuação, porque o
   sistema normaliza os dados antes de mandar ao gateway. */
const AGULHAS = [
  ['nome completo',      COMPRADOR.nome],
  ['e-mail',             COMPRADOR.email],
  ['CPF pontuado',       COMPRADOR.cpf],
  ['CPF só dígitos',     '52998224725'],
  ['telefone formatado', COMPRADOR.telefone],
  ['telefone dígitos',   '11987654321'],
  ['número do cartão',   CARTAO.numero],
  ['CVV',                CARTAO.cvv],
  ['titular do cartão',  CARTAO.titular],
  ['rua',                ENDERECO.rua],
  ['CEP',                '01310100']
];

/* --- Gateway falso que ECOA o corpo recebido -----------------------------
   Isso é essencial: gateways reais devolvem o que receberam, então a
   resposta é um caminho de vazamento tão real quanto a requisição. */
const gatewayFalso = http.createServer((req, res) => {
  let b = ''; req.on('data', c => b += c); req.on('end', () => {
    const corpo = JSON.parse(b || '{}');
    /* Recusa de propósito: o caminho de ERRO é onde a resposta crua vira
       mensagem, log e campo "diagnostico" — o mais perigoso dos três. */
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ errors: [{ message: 'Dados recusados para teste' }], recebido: corpo }));
  });
});
await new Promise(r => gatewayFalso.listen(3188, r));

let passou = 0, falhou = 0;
function teste(nome, fn) {
  try { fn(); console.log('  ✅', nome); passou++; }
  catch (e) { console.log('  ❌', nome, '\n     →', e.message); falhou++; }
}

/* --- Captura de console --------------------------------------------------
   Substituímos os quatro métodos e guardamos tudo que o sistema escreveria. */
function capturarConsole() {
  const original = { log: console.log, warn: console.warn, error: console.error, info: console.info };
  const linhas = [];
  const registrar = (...args) => linhas.push(args.map(a =>
    typeof a === 'string' ? a : (a instanceof Error ? a.stack || a.message : JSON.stringify(a))).join(' '));
  console.log = console.warn = console.error = console.info = registrar;
  return {
    texto: () => linhas.join('\n'),
    parar: () => Object.assign(console, original)
  };
}

async function rodarFluxo({ diagnostico, cartaoDireto }) {
  process.env.DIAGNOSTICO = diagnostico ? '1' : '';
  process.env.CARTAO_DIRETO = cartaoDireto ? '1' : '';
  process.env.GATEWAY_MODO = 'freepay';
  process.env.FREEPAY_URL_BASE = 'http://127.0.0.1:3188';
  process.env.FREEPAY_CHAVE_PUBLICA = 'pub';
  process.env.FREEPAY_CHAVE_SECRETA = 'sec';
  process.env.SEGREDO_APP = 'segredo';

  /* Import com sufixo de cache-busting: os módulos leem CONFIG na carga, e
     precisamos de leituras novas a cada combinação de flags. */
  const marca = Date.now() + Math.random();
  const { criarServidor } = await import(`./servidor-local.js?v=${marca}`);
  const servidor = criarServidor();
  await new Promise(r => servidor.listen(0, r));
  const base = `http://127.0.0.1:${servidor.address().port}`;

  const captura = capturarConsole();
  const respostas = [];

  const pedir = async (corpo) => {
    const r = await fetch(base + '/api/criar-pagamento', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo)
    });
    respostas.push(await r.text());
  };

  await pedir({ produtoId: 'bot-24h', metodo: 'pix', cliente: COMPRADOR });
  await pedir({ produtoId: 'bot-24h', metodo: 'cartao', cliente: COMPRADOR, parcelas: 1,
                endereco: ENDERECO, cartao: CARTAO });
  /* Entrega: o log que rodava em toda venda, com a flag desligada. */
  const { entregarAcesso } = await import(`../api/_entrega.js?v=${marca}`);
  await entregarAcesso({ id: 'pedido-teste', produtoId: 'bot-24h', origem: 'site',
                         cliente: { nome: COMPRADOR.nome, email: COMPRADOR.email } });

  captura.parar();
  servidor.close();
  return { log: captura.texto(), http: respostas.join('\n') };
}

console.log('\nPrivacidade — dado pessoal em log e em resposta HTTP\n');

for (const cenario of [
  { rotulo: 'DIAGNOSTICO desligado', diagnostico: false, cartaoDireto: true },
  { rotulo: 'DIAGNOSTICO ligado',    diagnostico: true,  cartaoDireto: true }
]) {
  const { log, http: corpoHttp } = await rodarFluxo(cenario);

  for (const [nome, agulha] of AGULHAS) {
    teste(`${cenario.rotulo}: ${nome} não aparece no log`, () => {
      assert.ok(!log.includes(agulha),
        `"${agulha}" apareceu no log:\n     ${log.split('\n').find(l => l.includes(agulha))?.slice(0, 160)}`);
    });
  }
  for (const [nome, agulha] of AGULHAS) {
    teste(`${cenario.rotulo}: ${nome} não volta na resposta HTTP`, () => {
      assert.ok(!corpoHttp.includes(agulha),
        `"${agulha}" apareceu na resposta:\n     ${corpoHttp.split('\n').find(l => l.includes(agulha))?.slice(0, 160)}`);
    });
  }

  teste(`${cenario.rotulo}: o log continua útil (id do pedido presente)`, () => {
    assert.match(log, /\[entrega\] liberar acesso/, 'o log de entrega precisa continuar existindo');
    assert.match(log, /pedido-teste/, 'o id do pedido é o que permite investigar — não pode sumir');
  });
}

/* --- Unidades da redação, para falha apontar a causa ------------------- */
const { mascararEmail, mascararDigitos, semDadosPessoais, textoSemDadosPessoais } =
  await import('../api/_privacidade.js');

teste('e-mail mantém domínio e esconde a pessoa', () => {
  assert.equal(mascararEmail('joaquina.nascimento@provedor.com.br'), 'j***@provedor.com.br');
});

teste('documento guarda só os quatro últimos dígitos', () => {
  assert.equal(mascararDigitos('529.982.247-25'), '***4725');
});

teste('redação alcança objeto aninhado, não só o primeiro nível', () => {
  const limpo = semDadosPessoais({ customer: { document: { number: '52998224725', type: 'cpf' } } });
  assert.equal(limpo.customer.document.number, '***4725');
  assert.equal(limpo.customer.document.type, 'cpf', 'o tipo não é dado pessoal e deve permanecer');
});

teste('valor e parcelas sobrevivem à redação', () => {
  const limpo = semDadosPessoais({ amount: 19700, installments: 12, status: 'paid' });
  assert.equal(limpo.amount, 19700);
  assert.equal(limpo.installments, 12);
  assert.equal(limpo.status, 'paid');
});

teste('texto cru: e-mail e cartão soltos também são redigidos', () => {
  const sujo = 'erro no pedido de joaquina.nascimento@provedor.com.br com cartão 4111 1111 1111 1111';
  const limpo = textoSemDadosPessoais(sujo);
  assert.ok(!limpo.includes('joaquina.nascimento@provedor.com.br'));
  assert.ok(!limpo.includes('4111111111111111') && !limpo.includes('4111 1111 1111 1111'));
});

gatewayFalso.close();
console.log(`\n  ${passou} passaram, ${falhou} falharam\n`);
process.exit(falhou ? 1 : 0);
