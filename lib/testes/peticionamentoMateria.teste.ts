import { teste, igual, resumo } from "./executar";
import { MATERIAS_DO_LUMEN, ehMateriaDoLumen, validarNovaMateria } from "@/lib/peticionamentoMateria";

// Decisão do dono (decisions.md §9 item 4): matéria nova vale SÓ para aquele escritório, nunca
// vira opção global. Este módulo só valida o NOME — a trava de "só este escritório" mora no
// schema (PeticionamentoMateria.officeId), verificada pela Server Action, não aqui.

teste("matérias do Lúmen incluem Direito Médico e Saúde Suplementar (exemplo dos mockups)", () => {
  igual(ehMateriaDoLumen("Direito Médico e Saúde Suplementar"), true);
  igual(ehMateriaDoLumen("Direito Agrário"), false);
});

teste("nome vazio é recusado", () => {
  igual(validarNovaMateria("   ", []).ok, false);
});

teste("nome longo demais é recusado", () => {
  igual(validarNovaMateria("x".repeat(61), []).ok, false);
});

teste("HARD GATE-adjacente: não permite cadastrar de novo uma matéria que já é do Lúmen", () => {
  const r = validarNovaMateria("Cível", []);
  igual(r.ok, false);
});

teste("não permite duplicar matéria já cadastrada pelo MESMO escritório (case-insensitive)", () => {
  const r = validarNovaMateria("direito agrário", ["Direito Agrário"]);
  igual(r.ok, false);
});

teste("nome novo, válido, dentro do escritório: aceito e normalizado (trim)", () => {
  const r = validarNovaMateria("  Direito Desportivo  ", ["Direito Agrário"]);
  igual(r.ok, true);
  if (r.ok) igual(r.nomeNormalizado, "Direito Desportivo");
});

teste("lista global tem 8 itens fixos (contrato visual dos mockups)", () => {
  igual(MATERIAS_DO_LUMEN.length, 8);
});

resumo("Peticionamento — matéria do Lúmen x matéria do escritório");
