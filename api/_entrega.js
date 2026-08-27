/* =========================================================================
   Entrega do produto depois do pagamento confirmado.

   Hoje: registra no log e é o gancho onde você pluga o envio real.
   Onde encaixar o seu caso:
     - e-mail com o acesso  → Resend, Brevo, SendGrid, Amazon SES;
     - liberar no Telegram  → chamar a API do seu bot e adicionar a pessoa
                              ao canal/grupo, ou enviar o link de convite;
     - cadastrar no painel  → criar o usuário no seu sistema.

   Esta função precisa ser segura para rodar mais de uma vez: o webhook.js
   já evita repetição, mas um reprocessamento manual não pode gerar duas
   cobranças de e-mail ou dois convites.
   ========================================================================= */

import { enviar, escapar, botConfigurado } from './_telegram.js';
import { lerConfig, preencher, buscarProduto } from './_configuracao.js';
import { atualizarLead, buscarLead } from './_leads.js';
import { mascararEmail } from './_privacidade.js';

export async function entregarAcesso(pedido) {
  const { cliente, id, produtoId } = pedido;

  /* O id do pedido é a chave para achar tudo no painel; e-mail e nome não
     precisam estar aqui. Este log roda em TODA venda, com ou sem
     diagnóstico — era o vazamento de maior alcance do sistema. */
  console.log('[entrega] liberar acesso', {
    pedido: id,
    produto: produtoId,
    destinatario: mascararEmail(cliente.email),
    origem: pedido.origem || 'site'
  });

  /* Compra nascida no bot: o cliente está esperando resposta no chat, e é
     ali que a entrega tem que aparecer — não só num e-mail. */
  if (pedido.origem === 'telegram' && pedido.chatId && botConfigurado()) {
    try {
      const cfg = await lerConfig();
      const produto = await buscarProduto(produtoId);
      await enviar(pedido.chatId, preencher(cfg.bot.textoPosPagamento, {
        produto: escapar(produto?.nome || 'seu produto'),
        email: escapar(cliente.email),
        loja: escapar(cfg.loja.nome)
      }));
      const lead = await buscarLead(pedido.chatId);
      if (lead) await atualizarLead(pedido.chatId, { compras: (lead.compras || 0) + 1 });
    } catch (e) {
      /* A venda aconteceu: falha no aviso não pode derrubar a entrega. */
      console.error('[entrega] não consegui avisar no Telegram:', e.message);
    }
  }

  /* Exemplo com Resend — descomente e configure RESEND_API_KEY:

  if (process.env.RESEND_API_KEY) {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'Bot 24h <acesso@seudominio.com.br>',
        to: cliente.email,
        subject: 'Seu acesso ao Bot 24h chegou',
        html: `<p>Olá, ${cliente.nome}!</p>
               <p>Seu pagamento foi confirmado. Comece por aqui:
               <a href="https://seudominio.com.br/obrigado">próximos passos</a>.</p>`
      })
    });
    if (!r.ok) throw new Error('Falha ao enviar o e-mail de acesso: ' + await r.text());
  }
  */

  return true;
}
