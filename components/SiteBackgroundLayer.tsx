// A textura de fundo (grid dourado / foto do escritório atrás do conteúdo) saiu do produto
// (DESIGN-SYSTEM.md §13: "`.brand-texture` ... é removida, junto com `SiteBackgroundLayer` se
// ele só existir para isso" — era exatamente o caso). O componente continua existindo, como
// no-op, só porque app/(app)/layout.tsx — arquivo de outro agente, fora da posse desta tarefa —
// ainda importa e instancia `<SiteBackgroundLayer />` via a prop `backgroundLayer` de
// components/AppShell.tsx; apagar o arquivo quebraria a build deles. Quando esse import sair de
// lá, este arquivo pode ser apagado de vez.
export default function SiteBackgroundLayer() {
  return null;
}
