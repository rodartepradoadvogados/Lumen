// `catch (e)` entrega `unknown`, e não `any` — é o TypeScript sendo honesto: o que foi lançado
// pode não ser um Error. `mensagemDeErro` faz a extração segura num lugar só, em vez de espalhar
// `(e as Error).message`, que é a mesma aposta com outra roupa.
export function mensagemDeErro(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
