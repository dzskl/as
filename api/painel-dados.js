/* =========================================================================
   GET /api/painel-dados — tudo que o painel mostra numa chamada só.

   Uma requisição em vez de cinco: o painel atualiza a cada poucos segundos e
   cada ida ao KV custa tempo e dinheiro. Agregar aqui também garante que os
   números na tela vieram todos do mesmo instante.
   ========================================================================= */

import { protegido } from './_painel.js';
import { json } from './_http.js';
import { listarPedidos, totalPedidos, metricasPorDia, diaBR, DRIVER } from './_pedidos.js';
import { listarLeads, totalLeads } from './_leads.js';
import { lerConfig } from './_configuracao.js';
import { CONFIG, formatarBRL } from './_config.js';
import { botConfigurado } from './_telegram.js';

async function handler(req, res) {
  const url = new URL(req.url, 'http://local');
  const dias = Math.min(90, Math.max(7, Number(url.searchParams.get('dias')) || 14));

  const [serie, pedidos, leads, totalP, totalL, cfg] = await Promise.all([
    metricasPorDia(dias),
    listarPedidos({ limite: 40 }),
    listarLeads({ limite: 40 }),
    totalPedidos(),
    totalLeads(),
    lerConfig()
  ]);

  const hoje = diaBR();
  const doDia = serie.find(d => d.dia === hoje) || { vendas: 0, receitaCentavos: 0, pedidos: 0 };
  const soma = (campo, quantos) => serie.slice(-quantos).reduce((t, d) => t + d[campo], 0);

  const pagos = pedidos.filter(p => p.status === 'pago').length;

  return json(res, 200, {
    ok: true,
    resumo: {
      hoje: { vendas: doDia.vendas, receita: formatarBRL(doDia.receitaCentavos), pedidos: doDia.pedidos },
      sete: { vendas: soma('vendas', 7), receita: formatarBRL(soma('receitaCentavos', 7)) },
      trinta: { vendas: soma('vendas', 30), receita: formatarBRL(soma('receitaCentavos', 30)) },
      totalPedidos: totalP,
      totalLeads: totalL,
      /* Conversão sobre a amostra recente, não sobre o histórico inteiro:
         é o número que responde "como estou indo agora". */
      conversao: pedidos.length ? Math.round((pagos / pedidos.length) * 100) : 0
    },
    serie,
    pedidos: pedidos.map(p => ({
      id: p.id,
      criadoEm: p.criadoEm,
      status: p.status,
      metodo: p.metodo,
      origem: p.origem || 'site',
      valor: formatarBRL(p.valorCentavos),
      produto: p.produtoId,
      cliente: { nome: p.cliente?.nome || '', email: p.cliente?.email || '' }
    })),
    leads: leads.map(l => ({
      chatId: l.chatId, nome: l.nome, usuario: l.usuario,
      email: l.email, compras: l.compras, mensagens: l.mensagens,
      ultimoContato: l.ultimoContato, bloqueado: l.bloqueado
    })),
    sistema: {
      armazenamento: DRIVER,
      gateway: CONFIG.modoGateway,
      diagnostico: CONFIG.diagnostico,
      cartaoDireto: CONFIG.cartaoDireto,
      bot: { token: botConfigurado(), ativo: cfg.bot.ativo },
      /* Avisos que o lojista precisa ver antes de descobrir vendendo. */
      alertas: [
        DRIVER === 'memoria' && 'Armazenamento em memória: os pedidos somem a cada reinício. Crie o KV na Vercel.',
        CONFIG.modoGateway === 'simulado' && 'Gateway em modo simulado: nenhum pagamento real acontece.',
        CONFIG.diagnostico && 'Diagnóstico ligado: mensagens internas aparecem para o cliente. Desligue em produção.',
        !botConfigurado() && 'Bot do Telegram sem token configurado.',
        !process.env.URL_SITE && 'URL_SITE não configurada: o webhook do gateway sai com endereço errado.'
      ].filter(Boolean)
    }
  });
}

export default protegido(handler);
