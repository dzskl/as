/* =========================================================================
   Entrega do produto depois do pagamento confirmado.

   Uma regra de negócio, dois canais. A mensagem de "pagamento confirmado" é
   montada UMA vez, a partir do texto que o painel edita, e então sai pelo
   chat do Telegram (quando a compra nasceu no bot) e por e-mail (sempre que
   houver endereço). Mudar o texto no painel muda os dois — não existe cópia
   da regra em lugar nenhum.

   Antes daqui, compra pelo site não avisava ninguém: só o bot falava com o
   comprador. E o texto padrão do bot já prometia "enviamos os detalhes para
   o seu e-mail", promessa que ninguém cumpria.

   Nada aqui pode derrubar a entrega: o pagamento já aconteceu. Cada canal
   falha por conta própria e o resultado é devolvido para o webhook registrar.
   ========================================================================= */

import { enviar, escapar, botConfigurado } from './_telegram.js';
import { enviarEmail, modoEmail } from './_email.js';
import { lerConfig, preencher, buscarProduto } from './_configuracao.js';
import { atualizarLead, buscarLead } from './_leads.js';
import { mascararEmail } from './_privacidade.js';

/* Converte a marcação do Telegram (*negrito*, _itálico_) para HTML, para o
   mesmo texto servir aos dois canais sem ser escrito duas vezes. */
function marcacaoParaHtml(texto) {
  return escaparHtml(texto)
    .replace(/\*([^*\n]+)\*/g, '<strong>$1</strong>')
    .replace(/_([^_\n]+)_/g, '<em>$1</em>')
    .replace(/\n/g, '<br>');
}

function escaparHtml(texto) {
  return String(texto ?? '').replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
}

function montarHtml({ corpo, loja, urlSite }) {
  /* E-mail não é página: estilo vai embutido, largura fixa e nada de fonte
     externa — cliente de e-mail ignora quase tudo isso. */
  return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:24px;background:#f3f5f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#101820">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto">
    <tr><td style="background:#ffffff;border:1px solid #dbe2ea;border-radius:10px;padding:32px">
      <div style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#0b6fa4;font-weight:700;margin-bottom:18px">
        ${escaparHtml(loja)}
      </div>
      <div style="font-size:16px;line-height:1.6">${corpo}</div>
      ${urlSite ? `<div style="margin-top:28px">
        <a href="${escaparHtml(urlSite)}/obrigado.html"
           style="display:inline-block;background:#0b6fa4;color:#ffffff;text-decoration:none;
                  padding:12px 22px;border-radius:8px;font-weight:600;font-size:15px">
          Ver os próximos passos
        </a></div>` : ''}
    </td></tr>
    <tr><td style="padding:18px 6px;color:#7a8798;font-size:12px;line-height:1.5">
      Você recebeu este e-mail porque concluiu uma compra em ${escaparHtml(loja)}.
    </td></tr>
  </table>
</body></html>`;
}

export async function entregarAcesso(pedido) {
  const { cliente, id, produtoId } = pedido;

  console.log('[entrega] liberar acesso', {
    pedido: id,
    produto: produtoId,
    destinatario: mascararEmail(cliente?.email),
    origem: pedido.origem || 'site'
  });

  const cfg = await lerConfig();
  const produto = await buscarProduto(produtoId);

  /* A ÚNICA construção da mensagem. Os dois canais partem daqui. */
  const mensagem = preencher(cfg.bot.textoPosPagamento, {
    produto: produto?.nome || 'seu produto',
    email: cliente?.email || '',
    loja: cfg.loja.nome,
    nome: (cliente?.nome || '').split(' ')[0]
  });

  const resultado = { telegram: null, email: null };

  /* ---- Canal 1: chat do Telegram, quando a compra nasceu no bot -------- */
  if (pedido.origem === 'telegram' && pedido.chatId && botConfigurado()) {
    try {
      /* O escape do Telegram é aplicado só aqui: é exigência da marcação
         dele, não da mensagem. */
      await enviar(pedido.chatId, preencher(cfg.bot.textoPosPagamento, {
        produto: escapar(produto?.nome || 'seu produto'),
        email: escapar(cliente?.email || ''),
        loja: escapar(cfg.loja.nome),
        nome: escapar((cliente?.nome || '').split(' ')[0])
      }));
      const lead = await buscarLead(pedido.chatId);
      if (lead) await atualizarLead(pedido.chatId, { compras: (lead.compras || 0) + 1 });
      resultado.telegram = 'enviado';
    } catch (e) {
      console.error('[entrega] não consegui avisar no Telegram:', e.message);
      resultado.telegram = 'falhou';
    }
  }

  /* ---- Canal 2: e-mail, sempre que houver endereço --------------------- */
  if (cliente?.email) {
    try {
      const r = await enviarEmail({
        para: cliente.email,
        assunto: `Pagamento confirmado — ${produto?.nome || cfg.loja.nome}`,
        html: montarHtml({
          corpo: marcacaoParaHtml(mensagem),
          loja: cfg.loja.nome,
          urlSite: (process.env.URL_SITE || '').replace(/\/$/, '')
        }),
        /* Versão em texto puro: o mesmo conteúdo, sem a marcação. */
        texto: mensagem.replace(/[*_]/g, '')
      });
      resultado.email = r.simulado ? 'simulado' : 'enviado';
    } catch (e) {
      /* A venda aconteceu. Registrar e seguir — quem reprocessa manualmente
         acha o pedido pelo id. */
      console.error('[entrega] e-mail não saiu para o pedido', id, '-', e.message);
      resultado.email = 'falhou';
    }
  } else {
    resultado.email = 'sem endereço';
  }

  console.log('[entrega] resultado', { pedido: id, ...resultado, modoEmail: modoEmail() });
  return resultado;
}
