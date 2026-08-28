/* =========================================================================
   FONTE ÚNICA DOS DADOS DA EMPRESA

   Todo dado de identificação que aparece no site vive aqui. As páginas
   carregam este arquivo e se preenchem sozinhas — trocar por dado real é
   editar SÓ este arquivo, não caçar em quatro.

   ⚠️ NADA AQUI É REAL. Cada campo abaixo está com valor de exemplo e precisa
   ser preenchido antes de qualquer tráfego chegar à página. Rode
   `npm run conteudo` para ver a lista do que ainda falta.

   Depoimento inventado é propaganda enganosa (Código de Defesa do
   Consumidor, art. 37) e sujeita a multa — os três abaixo são modelos de
   FORMATO, não de conteúdo.
   ========================================================================= */

export const EMPRESA = {

  /* ---- Identificação legal -------------------------------------------- */
  // TODO: razão social exata do contrato social
  razaoSocial: 'SUA EMPRESA LTDA',
  // TODO: CNPJ com pontuação
  cnpj: '00.000.000/0001-00',
  // TODO: cidade e UF da sede — usado no foro dos Termos de Uso
  cidadeUF: '[cidade/UF]',

  /* ---- Endereços de contato ------------------------------------------- */
  // TODO: e-mail que recebe dúvidas de compra e suporte
  emailSuporte: 'suporte@seudominio.com.br',
  // TODO: e-mail do canal de privacidade (LGPD, art. 41 — pode ser o mesmo)
  emailPrivacidade: 'privacidade@seudominio.com.br',
  // TODO: nome de quem responde por dados pessoais (encarregado/DPO)
  encarregadoDados: '[nome do responsável]',

  /* ---- Telegram -------------------------------------------------------- */
  // TODO: usuário do Telegram do suporte, SEM o @
  telegramUsuario: 'seuusuario',

  /* ---- Domínio --------------------------------------------------------- */
  // TODO: endereço público do site, sem barra no fim.
  // Também usado em og:url e canonical — errado aqui, o preview do link no
  // WhatsApp e no Telegram aponta para o lugar errado.
  site: 'https://seudominio.com.br',

  /* ---- Depoimentos ------------------------------------------------------
     Substitua pelos depoimentos REAIS dos seus clientes. Print de conversa
     converte mais que texto digitado — e é verificável.                    */
  depoimentos: [
    {
      // TODO: depoimento real do cliente 1
      iniciais: 'MR',
      texto: 'Eu perdia umas duas horas por dia respondendo a mesma coisa. Hoje o bot resolve tudo e só me chama quando a pessoa realmente quer fechar. Recuperei minha manhã inteira.',
      autor: 'Marina R.',
      contexto: 'Loja de semijoias · Curitiba'
    },
    {
      // TODO: depoimento real do cliente 2
      iniciais: 'JS',
      texto: 'Confesso que achei que não ia funcionar pro meu caso. Na primeira semana fechei três vendas que entraram depois das 22h — horário que eu simplesmente não atendia antes.',
      autor: 'Jonas S.',
      contexto: 'Mentoria de vendas · Belo Horizonte'
    },
    {
      // TODO: depoimento real do cliente 3
      iniciais: 'AC',
      texto: 'Não entendo nada de tecnologia e instalei sozinha assistindo o vídeo. Levei uns 15 minutos porque parei pra tomar café no meio.',
      autor: 'Ana C.',
      contexto: 'Estúdio de pilates · Recife'
    }
  ]
};

/* Campos derivados: montados a partir dos de cima, para não haver duas
   verdades sobre a mesma coisa. */
export const DERIVADOS = {
  telegramUrl: `https://t.me/${EMPRESA.telegramUsuario}`,
  telegramArroba: `@${EMPRESA.telegramUsuario}`,
  siteBarra: `${EMPRESA.site}/`,
  mailtoSuporte: `mailto:${EMPRESA.emailSuporte}`,
  mailtoPrivacidade: `mailto:${EMPRESA.emailPrivacidade}`,
  rodapeLegal: `${EMPRESA.razaoSocial} — CNPJ ${EMPRESA.cnpj}`
};

/* Cada valor que ainda está como exemplo. É o que alimenta o aviso do
   `npm run conteudo` e o teste que impede a página de ir ao ar assim. */
export const VALORES_DE_EXEMPLO = {
  razaoSocial: 'SUA EMPRESA LTDA',
  cnpj: '00.000.000/0001-00',
  cidadeUF: '[cidade/UF]',
  emailSuporte: 'suporte@seudominio.com.br',
  emailPrivacidade: 'privacidade@seudominio.com.br',
  encarregadoDados: '[nome do responsável]',
  telegramUsuario: 'seuusuario',
  site: 'https://seudominio.com.br'
};

export function pendencias() {
  const faltando = Object.entries(VALORES_DE_EXEMPLO)
    .filter(([campo, exemplo]) => EMPRESA[campo] === exemplo)
    .map(([campo]) => campo);

  const depoimentosFicticios = EMPRESA.depoimentos
    .filter(d => ['Marina R.', 'Jonas S.', 'Ana C.'].includes(d.autor))
    .map(d => d.autor);

  return { campos: faltando, depoimentos: depoimentosFicticios };
}

/* =========================================================================
   CONTEÚDO DO PRODUTO

   Separado de EMPRESA de propósito: EMPRESA é identidade (razão social,
   CNPJ, e-mails) e cada campo lá é uma pendência do lojista. Aqui é a
   descrição do que está sendo vendido — já preenchida, e editável quando a
   oferta mudar.

   A landing lê tudo isto por data-empresa="caminho.com.ponto". O texto
   escrito no HTML é a versão que aparece sem JavaScript, e o teste de
   divergência (testes/conteudo.test.js) reprova se os dois se separarem.
   ========================================================================= */
export const PRODUTO = {

  /* ---- Preço ------------------------------------------------------------
     ⚠️ Precisa bater com valorCentavos em api/_config.js (19700 = R$ 197,00).
     Ali é a fonte que o servidor cobra; aqui é só o que a página mostra. */
  preco: 'R$ 197',
  precoParcelado: '12x de R$ 19,90',
  precoNota: 'Pagamento único. Sem mensalidade, sem taxa por mensagem, sem renovação automática.',

  /* ---- Hero ------------------------------------------------------------ */
  heroTitulo: 'O bot que vende no Telegram — com painel e checkout próprios.',
  heroLead: 'Você não recebe um bot solto. Recebe o sistema inteiro: o bot que atende e fecha a venda no chat, o painel que mostra cada pedido em tempo real e o checkout com Pix e cartão rodando no seu domínio.',
  heroNota: 'É o mesmo sistema que processa o pedido desta página.',

  /* ---- O que o cliente recebe ------------------------------------------ */
  entregaveis: [
    {
      titulo: 'O template completo',
      detalhe: 'Bot do Telegram, painel de controle e checkout com Pix e cartão. Três partes que já vêm conversando entre si — não é um kit de peças para você montar.',
      meta: 'código-fonte'
    },
    {
      titulo: 'Vídeo de instalação',
      detalhe: 'A gravação inteira de uma implantação real, do repositório vazio até a primeira venda entrando no painel. Sem corte nas partes chatas.',
      meta: 'passo a passo'
    },
    {
      titulo: '30 respostas prontas',
      detalhe: 'As perguntas que aparecem antes de toda venda, já escritas e ligadas aos botões do bot. Você edita cada uma pelo painel, sem tocar em arquivo.',
      meta: 'editáveis no painel'
    }
  ],

  /* ---- Como funciona --------------------------------------------------- */
  passos: [
    {
      titulo: 'Implantar',
      detalhe: 'Você duplica o projeto e sobe na Vercel. Não há servidor para configurar nem banco para criar: o plano gratuito dá conta de começar.'
    },
    {
      titulo: 'Conectar as contas',
      detalhe: 'Três chaves, coladas uma vez: o token do bot no Telegram, a credencial do seu gateway de pagamento e o endereço do seu site.'
    },
    {
      titulo: 'Editar os dados',
      detalhe: 'Nome, preço, textos do bot e respostas prontas — tudo pelo painel, em campos de texto. O que você salva vale na hora, sem publicar de novo.'
    },
    {
      titulo: 'No ar',
      detalhe: 'O bot passa a responder, o checkout passa a cobrar e cada pedido aparece no painel com status, valor e origem.'
    }
  ],

  /* ---- Garantia ---------------------------------------------------------
     Mantém o texto legal dos Termos de Uso (art. 49 do CDC). Se mudar aqui,
     mude também a seção 3 de termos.html. */
  garantiaTitulo: '7 dias para desistir',
  garantiaTexto: 'Você tem 7 (sete) dias corridos, contados da confirmação do pagamento, para pedir o reembolso integral, sem precisar justificar — conforme o direito de arrependimento do art. 49 do Código de Defesa do Consumidor. Basta enviar o pedido para o nosso suporte. O estorno é feito pelo mesmo meio de pagamento, no prazo da operadora ou do banco.',

  /* ---- Perguntas frequentes -------------------------------------------- */
  faq: [
    {
      pergunta: 'Preciso saber programar?',
      resposta: 'Não. A implantação é feita por botões na Vercel e a configuração é preenchimento de campo no painel. O vídeo mostra cada clique. O que você precisa saber é o que quer que o bot responda.'
    },
    {
      pergunta: 'Preciso ter minha própria conta de gateway?',
      resposta: 'Sim, e isso é de propósito: o dinheiro cai direto na sua conta, sem passar por nós. Você cria a conta no gateway, cola as duas chaves no painel e o checkout começa a cobrar em seu nome.'
    },
    {
      pergunta: 'Quanto custa manter no ar?',
      resposta: 'O plano gratuito da Vercel atende o começo, e criar bot no Telegram não tem custo. O gateway cobra a taxa dele por venda aprovada. De nossa parte não há mensalidade.'
    },
    {
      pergunta: 'O código é meu?',
      resposta: 'O projeto roda na sua conta, com suas chaves, e você pode editar o que quiser. A licença cobre a operação de um bot, para o seu próprio negócio — revender ou redistribuir o template não está incluído.'
    },
    {
      pergunta: 'Funciona com Pix e cartão?',
      resposta: 'O checkout já vem com os dois. Pix depende só de ativar no seu gateway; cartão depende de o gateway ter uma adquirente de crédito habilitada na sua conta — isso é liberado por eles, não por nós.'
    },
    {
      pergunta: 'Em quanto tempo fica no ar?',
      resposta: 'A implantação leva minutos. O que costuma demorar é do lado das contas: a aprovação do seu cadastro no gateway pode levar de horas a alguns dias, e isso não depende do template.'
    }
  ]
};

export default EMPRESA;
