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

export async function entregarAcesso(pedido) {
  const { cliente, id, produtoId } = pedido;

  console.log('[entrega] liberar acesso', {
    pedido: id,
    produto: produtoId,
    email: cliente.email,
    nome: cliente.nome
  });

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
