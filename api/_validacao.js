/* Validação dos dados do comprador. Tudo é revalidado no servidor: o que o
   navegador valida serve para a experiência, não para a segurança. */

export function limpar(texto, max = 120) {
  return String(texto ?? '').trim().replace(/\s+/g, ' ').slice(0, max);
}

export function soDigitos(texto) {
  return String(texto ?? '').replace(/\D/g, '');
}

export function emailValido(email) {
  const e = String(email ?? '').trim();
  return e.length <= 160 && /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(e);
}

/* CPF: valida os dois dígitos verificadores, não só o tamanho. */
export function cpfValido(entrada) {
  const cpf = soDigitos(entrada);
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;   // 111.111.111-11 etc.

  const digito = (fatiaAte) => {
    let soma = 0;
    let peso = fatiaAte + 1;
    for (let i = 0; i < fatiaAte; i++) soma += Number(cpf[i]) * peso--;
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return digito(9) === Number(cpf[9]) && digito(10) === Number(cpf[10]);
}

/* Telefone brasileiro com DDD: 10 dígitos (fixo) ou 11 (celular). */
export function telefoneValido(entrada) {
  const t = soDigitos(entrada);
  return t.length === 10 || t.length === 11;
}

/* Devolve { ok, erros, cliente } — erros por campo, para o front destacar. */
export function validarCliente(corpo) {
  const erros = {};
  const nome = limpar(corpo?.nome, 80);
  const email = limpar(corpo?.email, 160).toLowerCase();
  const cpf = soDigitos(corpo?.cpf);
  const telefone = soDigitos(corpo?.telefone);

  if (nome.length < 3 || !nome.includes(' ')) erros.nome = 'Informe seu nome completo';
  if (!emailValido(email)) erros.email = 'E-mail inválido';
  if (!cpfValido(cpf)) erros.cpf = 'CPF inválido';
  if (!telefoneValido(telefone)) erros.telefone = 'Telefone com DDD inválido';

  return { ok: Object.keys(erros).length === 0, erros, cliente: { nome, email, cpf, telefone } };
}
