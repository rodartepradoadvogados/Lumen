// "Cliente compatível": acha, no texto de uma publicação, o cliente cadastrado cujo nome aparece
// nele. PURO.
//
// O defeito que isto corrige (12/10/2026): `findClientIdByName` aceitava qualquer cliente cujo nome
// (5+ letras) fosse substring do texto. O aviso do Projudi começa com "Sr(a). <NOME DO ADVOGADO>,": um
// único cadastro de cliente com o nome do advogado destinatário ficou ligado a 144 publicações (133
// do Projudi), e o título do cartão virou "Cliente compatível: <o próprio advogado>". Regras novas:
//   - o nome precisa aparecer como PALAVRAS inteiras (sem acento, sem caixa);
//   - precisa ter ao menos duas palavras (um primeiro nome sozinho casa com qualquer um);
//   - cliente cujo nome contém o nome de alguém da EQUIPE é ignorado: quem aparece no texto como
//     destinatário ("Sr(a). ...") é o advogado, não a parte;
//   - quando mais de um cliente casa, vence o de nome mais longo e, no empate, nenhum (ambíguo).

function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function palavras(texto: string): string[] {
  return normalizar(texto).split(" ").filter(Boolean);
}

export function casarClientePorNome(
  conteudo: string,
  clientes: { id: string; name: string }[],
  nomesDaEquipe: string[]
): string | null {
  const texto = ` ${normalizar(conteudo)} `;
  const equipe = nomesDaEquipe.map(palavras).filter((p) => p.length >= 2);
  const achados: { id: string; tamanho: number }[] = [];
  for (const c of clientes) {
    const p = palavras(c.name);
    if (p.length < 2) continue;
    if (equipe.some((e) => e.every((w) => p.includes(w)))) continue;
    if (texto.includes(` ${p.join(" ")} `)) achados.push({ id: c.id, tamanho: p.join(" ").length });
  }
  if (achados.length === 0) return null;
  achados.sort((a, b) => b.tamanho - a.tamanho);
  if (achados.length > 1 && achados[0].tamanho === achados[1].tamanho) return null;
  return achados[0].id;
}
