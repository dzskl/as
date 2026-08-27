/* =========================================================================
   Registro de auditoria.

   Com várias pessoas no painel, "o preço mudou" não é informação suficiente:
   é preciso saber quem mudou, quando, de quanto para quanto. Esse registro é
   o que transforma discussão em conferência.

   Só grava ação de gente: leitura de tela não entra, senão o histórico vira
   ruído e ninguém lê.
   ========================================================================= */

import { empilhar, lerLista, tamanhoLista } from './_kv.js';

const INDICE = 'auditoria';
const LIMITE = 2000;

/* Rótulos legíveis: o histórico é lido por pessoas, não por máquinas. */
export const ACOES = {
  login:              'Entrou no painel',
  login_falho:        'Tentativa de acesso recusada',
  logout:             'Saiu do painel',
  config_salva:       'Alterou a configuração',
  preco_alterado:     'Alterou preço de produto',
  produto_criado:     'Criou produto',
  produto_desativado: 'Desativou produto',
  disparo:            'Disparou mensagem em massa',
  bot_conectado:      'Conectou o bot',
  bot_desconectado:   'Desconectou o bot',
  usuario_criado:     'Criou usuário',
  usuario_alterado:   'Alterou usuário',
  usuario_removido:   'Removeu usuário'
};

export async function registrar(acao, { quem, detalhe = '', ip = '' } = {}) {
  const evento = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    acao,
    rotulo: ACOES[acao] || acao,
    quem: quem || 'desconhecido',
    detalhe: String(detalhe).slice(0, 300),
    ip,
    quando: new Date().toISOString()
  };
  try {
    await empilhar(INDICE, evento, LIMITE);
  } catch (e) {
    /* Auditoria não pode derrubar a operação que ela observa. */
    console.error('[auditoria] falha ao registrar', acao, e.message);
  }
  return evento;
}

export async function listar({ limite = 60, pagina = 0 } = {}) {
  const inicio = pagina * limite;
  return lerLista(INDICE, inicio, inicio + limite - 1);
}

export async function total() {
  return tamanhoLista(INDICE);
}

/* Descreve a diferença entre duas configurações em texto curto. É o que dá
   valor ao histórico: "alterou a configuração" não ajuda ninguém; "preço do
   Bot 24h: R$ 197,00 → R$ 247,00" resolve a dúvida na hora. */
const emReais = (centavos) => (centavos / 100).toLocaleString('pt-BR',
  { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function descreverMudancas(antes, depois) {
  const partes = [];

  const pAntes = antes.produtos || {};
  const pDepois = depois.produtos || {};
  for (const [id, novo] of Object.entries(pDepois)) {
    const velho = pAntes[id];
    if (!velho) { partes.push(`produto criado: ${novo.nome}`); continue; }
    if (velho.valorCentavos !== novo.valorCentavos) {
      partes.push(`preço de ${novo.nome}: R$ ${emReais(velho.valorCentavos)} → R$ ${emReais(novo.valorCentavos)}`);
    }
    /* Produto sem o campo "ativo" (catálogo do arquivo) conta como ativo:
       comparar cru diria "reativado" em toda primeira gravação. */
    const ativoAntes = velho.ativo !== false, ativoDepois = novo.ativo !== false;
    if (ativoAntes !== ativoDepois) {
      partes.push(`${novo.nome} ${ativoDepois ? 'reativado' : 'desativado'}`);
    }
    if (velho.nome !== novo.nome) partes.push(`nome: ${velho.nome} → ${novo.nome}`);
  }

  if (antes.bot?.ativo !== depois.bot?.ativo) {
    partes.push(`bot ${depois.bot?.ativo ? 'ativado' : 'pausado'}`);
  }
  const textos = ['boasVindas','textoCatalogo','textoDuvidas','pedirEmail','pedirCpf','pixGerado','textoPosPagamento'];
  const alterados = textos.filter(c => antes.bot?.[c] !== depois.bot?.[c]);
  if (alterados.length) partes.push(`mensagens alteradas: ${alterados.length}`);

  if (JSON.stringify(antes.loja) !== JSON.stringify(depois.loja)) partes.push('dados da loja');

  return partes.join(' · ') || 'sem mudanças efetivas';
}
