/* =========================================================================
   Envio de e-mail.

   Mesmo desenho do adaptador de gateway: o resto do sistema chama
   enviarEmail() e não sabe quem entrega. Trocar de provedor mexe só aqui.

   Dois modos, escolhidos pela presença da chave:
     resend    → RESEND_API_KEY e EMAIL_REMETENTE configurados
     simulado  → sem chave: registra o envio e devolve sucesso, para o fluxo
                 rodar inteiro em desenvolvimento e nos testes

   Falha de e-mail nunca derruba a entrega: o pagamento já aconteceu, e o
   comprador tem outros caminhos (a página de obrigado, o chat do bot, o
   suporte). Quem chama decide o que fazer com o resultado.
   ========================================================================= */

import { mascararEmail, textoSemDadosPessoais } from './_privacidade.js';

const API_RESEND = process.env.RESEND_API_BASE || 'https://api.resend.com/emails';

export function modoEmail() {
  return (process.env.RESEND_API_KEY && process.env.EMAIL_REMETENTE) ? 'resend' : 'simulado';
}

export function emailConfigurado() {
  return modoEmail() === 'resend';
}

/* Motivo pelo qual o envio não está ativo, para o painel avisar antes de a
   primeira venda acontecer sem ninguém receber nada. */
export function pendenciaEmail() {
  if (process.env.RESEND_API_KEY && !process.env.EMAIL_REMETENTE) {
    return 'EMAIL_REMETENTE não configurado: o Resend exige um remetente em domínio verificado.';
  }
  if (!process.env.RESEND_API_KEY) {
    return 'E-mail de entrega desligado: sem RESEND_API_KEY, quem compra pelo site não recebe aviso.';
  }
  return null;
}

export async function enviarEmail({ para, assunto, html, texto }) {
  if (!para || !assunto) throw new Error('Envio de e-mail sem destinatário ou assunto');

  if (modoEmail() === 'simulado') {
    console.log('[email] simulado —', mascararEmail(para), '|', assunto);
    return { ok: true, simulado: true, id: 'simulado' };
  }

  const controle = new AbortController();
  const limite = setTimeout(() => controle.abort(), 15000);
  try {
    const r = await fetch(API_RESEND, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: process.env.EMAIL_REMETENTE,
        to: [para],
        subject: assunto,
        html,
        text: texto
      }),
      signal: controle.signal
    });

    const corpo = await r.text();
    if (!r.ok) {
      /* A resposta pode ecoar o destinatário: passa pela redação como
         qualquer outra mensagem de terceiro. */
      throw new Error(`Resend recusou o envio (HTTP ${r.status}): ${textoSemDadosPessoais(corpo).slice(0, 300)}`);
    }

    let dados = {};
    try { dados = JSON.parse(corpo); } catch { /* sucesso sem JSON é aceitável */ }
    return { ok: true, simulado: false, id: dados.id || '' };
  } finally {
    clearTimeout(limite);
  }
}
