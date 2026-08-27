/* =========================================================================
   Redação de dados pessoais.

   Defesa em profundidade: nada aqui depende da flag DIAGNOSTICO. Log é
   armazenado, replicado, exportado e lido por gente que não precisava ver o
   CPF de ninguém — e, na Vercel, fica retido além do nosso alcance.

   A regra é uma só: dado do comprador (nome, e-mail, CPF, telefone,
   endereço, cartão) não sai daqui em claro, nem para log nem para resposta
   HTTP. O que resta é o suficiente para investigar um problema — sufixo do
   e-mail, últimos dígitos, id do pedido — e insuficiente para identificar
   alguém.
   ========================================================================= */

/* Chaves cujo VALOR é dado pessoal, em português e inglês, camelCase e
   snake_case, porque o corpo enviado ao gateway mistura convenções. */
const CHAVES_PESSOAIS = new Set([
  'nome','name','first_name','last_name','firstname','lastname','holder','holder_name',
  'holdername','cardholdername','card_holder_name','titular','fullname','full_name',
  'email','e_mail','mail',
  'telefone','phone','phone_number','celular','mobile','whatsapp',
  'cpf','cnpj','document','documento','document_number','tax_id','ssn',
  'endereco','address','billing_address','street','logradouro','rua','complement',
  'complemento','neighborhood','bairro','zip_code','zipcode','postal_code','cep',
  'number','numero','cvv','cvc','security_code','card_number','pan',
  'ip','ip_address','birthdate','data_nascimento'
]);

/* Chaves que NÃO são dado pessoal apesar do nome parecido. Sem esta lista,
   "number" dentro de "card" e "number" de parcela virariam a mesma coisa, e
   o log perderia informação útil sem ganhar privacidade. */
const CHAVES_SEGURAS = new Set([
  'installments','parcelas','amount','valor','valorcentavos','quantity','quantidade',
  'status','id','reference_id','transaction_id','pedido_id','produto','product'
]);

export function mascararEmail(valor) {
  const texto = String(valor ?? '');
  const arroba = texto.indexOf('@');
  if (arroba < 1) return '***';
  /* Mantém a primeira letra e o domínio: dá para reconhecer o próprio
     e-mail num suporte sem expor a lista de clientes. */
  return texto[0] + '***@' + texto.slice(arroba + 1);
}

export function mascararDigitos(valor) {
  const digitos = String(valor ?? '').replace(/\D/g, '');
  if (digitos.length < 4) return '***';
  return '***' + digitos.slice(-4);
}

/* Identificadores de plataforma (chat do Telegram, id de gateway) não são
   nome nem documento, mas ligam a ação a uma pessoa. Guardamos o suficiente
   para correlacionar dois registros, não para achar alguém. */
export function mascararId(valor) {
  const texto = String(valor ?? '');
  if (texto.length <= 4) return '***';
  return texto.slice(0, 2) + '***' + texto.slice(-2);
}

function mascararPorChave(chave, valor) {
  const k = String(chave).toLowerCase();
  if (typeof valor === 'object' && valor !== null) return undefined;  // trata recursivo
  if (k.includes('mail')) return mascararEmail(valor);
  if (k === 'ip' || k === 'ip_address') {
    /* Primeiro octeto só: mantém noção de origem sem identificar a linha. */
    const partes = String(valor ?? '').split('.');
    return partes.length === 4 ? `${partes[0]}.x.x.x` : '***';
  }
  if (typeof valor === 'number') return mascararDigitos(valor);
  return typeof valor === 'string' && valor.includes('@') ? mascararEmail(valor) : mascararDigitos(valor);
}

/* Percorre a estrutura e devolve uma cópia sem dado pessoal. Não altera o
   original — o objeto continua íntegro a caminho do gateway. */
export function semDadosPessoais(valor, profundidade = 0) {
  if (profundidade > 8 || valor === null || valor === undefined) return valor;
  if (Array.isArray(valor)) return valor.map(v => semDadosPessoais(v, profundidade + 1));
  if (typeof valor !== 'object') return valor;

  const saida = {};
  for (const [chave, item] of Object.entries(valor)) {
    const k = chave.toLowerCase();
    if (CHAVES_SEGURAS.has(k)) { saida[chave] = item; continue; }

    if (CHAVES_PESSOAIS.has(k)) {
      saida[chave] = (item && typeof item === 'object')
        ? semDadosPessoais(item, profundidade + 1)   // ex.: document { number, type }
        : mascararPorChave(chave, item);
      continue;
    }
    saida[chave] = (item && typeof item === 'object')
      ? semDadosPessoais(item, profundidade + 1)
      : item;
  }
  return saida;
}

/* Para texto cru — a resposta do gateway chega como string e pode devolver o
   que enviamos. Aqui a busca é por padrão, não por nome de campo. */
export function textoSemDadosPessoais(texto) {
  let saida = String(texto ?? '');

  /* E-mails */
  saida = saida.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, (e) => mascararEmail(e));
  /* Cartão: 13 a 19 dígitos, com ou sem separador */
  saida = saida.replace(/\b(?:\d[ -]?){13,19}\b/g, (n) => mascararDigitos(n));
  /* CPF formatado e telefone brasileiro com DDD */
  saida = saida.replace(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g, (n) => mascararDigitos(n));
  saida = saida.replace(/\(?\d{2}\)?[\s-]?9?\d{4}[\s-]?\d{4}\b/g, (n) => mascararDigitos(n));
  /* Sequências longas de dígitos que sobraram (CPF sem pontuação, CEP+número) */
  saida = saida.replace(/\b\d{8,}\b/g, (n) => mascararDigitos(n));

  return saida;
}

/* Erro do gateway costuma trazer a resposta crua embutida na mensagem. */
export function erroSemDadosPessoais(e) {
  const causa = e?.cause?.message || e?.cause?.code;
  const base = String(e?.message ?? e ?? '');
  return textoSemDadosPessoais(causa ? `${base} | causa: ${causa}` : base);
}
