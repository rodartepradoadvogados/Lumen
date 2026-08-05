import { Prisma } from "@prisma/client";
import { STRING_MASKERS, maskFreeText, type MaskKind, type StringMaskKind } from "@/lib/supportMasking";
import { SUPPORT_MASK_MAP } from "@/lib/supportMaskingMap";

// Aplicador recursivo do "Vidro Fosco".
//
// O problema que este arquivo resolve: uma leitura como
//   prisma.case.findMany({ include: { client: true, tasks: { include: { responsible: true } } } })
// devolve UM objeto, mas com dados de três models diferentes aninhados. O resultado sozinho não
// diz qual model é cada nó — `{ client: {...} }` é só uma chave. Sem saber o model, ou se
// mascara por nome de campo (e aí `name` de FinancialCategory some junto, quebrando telas), ou
// não se mascara nada aninhado (e aí o "Vidro Fosco" vaza no primeiro `include`).
//
// A resposta é o DMMF: o Prisma expõe o datamodel em runtime (Prisma.dmmf), inclusive o model
// de destino de cada campo de relação. Com ele dá para descer a árvore sabendo exatamente em
// que model se está a cada nível, em qualquer profundidade.

type ScalarMeta = { type: string; isRequired: boolean };

type ModelMeta = {
  // campo de relação -> nome do model de destino
  relations: Map<string, string>;
  // campo escalar -> tipo e obrigatoriedade no schema
  scalars: Map<string, ScalarMeta>;
};

// Tipos numéricos do Prisma. Um campo destes NUNCA pode virar string (quebraria .toFixed(),
// somas e gráficos em runtime) — vira null se for anulável no schema, 0 se for obrigatório.
const NUMERIC_TYPES = new Set(["Int", "Float", "Decimal", "BigInt"]);

// Chaves de agregação do Prisma. `_count` fica de fora de propósito: contador não identifica
// ninguém e é justamente o que o suporte usa para diagnosticar ("o cliente tem 0 processos?").
const AGGREGATE_KEYS = new Set(["_sum", "_avg", "_min", "_max"]);

let metaByModel: Map<string, ModelMeta> | null = null;

function getMeta(): Map<string, ModelMeta> {
  if (metaByModel) return metaByModel;
  const built = new Map<string, ModelMeta>();
  for (const model of Prisma.dmmf.datamodel.models) {
    const relations = new Map<string, string>();
    const scalars = new Map<string, ScalarMeta>();
    for (const field of model.fields) {
      if (field.kind === "object") relations.set(field.name, field.type);
      else scalars.set(field.name, { type: field.type, isRequired: field.isRequired });
    }
    built.set(model.name, { relations, scalars });
  }
  metaByModel = built;
  return built;
}

// Redige UM campo, respeitando o tipo declarado no schema.
//
// Esta função é o ponto onde a "REGRA DE TIPO" deixa de depender de alguém ter conferido o
// schema campo a campo e passa a ser garantida por construção: quem decide se o resultado é
// string, número ou null é o DMMF, não o mapa declarativo.
function maskField(kind: MaskKind, value: unknown, meta: ScalarMeta | undefined): unknown {
  if (value === null || value === undefined) return value;

  const type = meta?.type;

  // Numérico: nunca vira string, aconteça o que acontecer com o mapa.
  if (type && NUMERIC_TYPES.has(type)) {
    return meta!.isRequired ? 0 : null;
  }
  // Se o mapa pediu "money" mas o schema diz que é número, já saímos acima. Se não temos
  // metadados (campo de agregação sintético, por exemplo) e o valor É número, aplica a mesma
  // regra pelo valor observado — nunca devolve string no lugar de número.
  if (!type && typeof value === "number") return null;

  // Data e booleano não são mascarados: data é o principal eixo de diagnóstico e booleano não
  // carrega identidade.
  if (type === "DateTime" || type === "Boolean" || value instanceof Date || typeof value === "boolean") {
    return value;
  }

  if (typeof value !== "string") {
    // Json ou tipo inesperado: sem formato garantido, não dá para redigir preservando forma.
    // Devolve null quando pode, e o valor original quando o campo é obrigatório (não há
    // substituto seguro que mantenha o tipo).
    return meta && !meta.isRequired ? null : value;
  }

  if (kind === "money") {
    // Mapa marcou como valor, mas o schema guarda em texto — trata como texto livre para não
    // trocar o tipo.
    return maskFreeText(value);
  }
  const masker = STRING_MASKERS[kind as StringMaskKind] as (v: string) => string;
  return masker(value);
}

// Percorre o resultado in-place. In-place e não cópia porque o objeto acabou de ser criado pelo
// driver do Prisma para esta leitura — ninguém mais tem referência para ele — e clonar árvores
// grandes a cada query seria caro à toa.
//
// O WeakSet protege contra visitar o mesmo nó duas vezes (referência repetida no mesmo
// resultado) e contra ciclo, que travaria a requisição.
function walk(modelName: string | undefined, node: unknown, seen: WeakSet<object>): unknown {
  if (node === null || node === undefined) return node;
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) node[i] = walk(modelName, node[i], seen);
    return node;
  }
  if (typeof node !== "object") return node;
  if (node instanceof Date || node instanceof Uint8Array) return node;
  if (seen.has(node as object)) return node;
  seen.add(node as object);

  // Model desconhecido pelo DMMF (resultado de $queryRaw, objeto sintético, etc.): passa
  // intacto. Não há como decidir o que é sigiloso sem saber de que model o objeto é.
  const meta = modelName ? getMeta().get(modelName) : undefined;
  if (!meta) return node;

  const fieldMap = SUPPORT_MASK_MAP[modelName!] ?? {};
  const obj = node as Record<string, unknown>;

  for (const key of Object.keys(obj)) {
    const value = obj[key];

    // 1) Relação: desce para o model de destino. Isso acontece mesmo quando o model atual não
    // tem nenhum campo sigiloso próprio — CaseClient não tem, mas leva a Client, que tem.
    const relatedModel = meta.relations.get(key);
    if (relatedModel) {
      obj[key] = walk(relatedModel, value, seen);
      continue;
    }

    // 2) Agregações (_sum/_avg/_min/_max): os campos lá dentro são os mesmos do model, então
    // reaproveita o mapa. _count não entra aqui de propósito (ver AGGREGATE_KEYS).
    if (AGGREGATE_KEYS.has(key) && value && typeof value === "object") {
      const inner = value as Record<string, unknown>;
      for (const innerKey of Object.keys(inner)) {
        const kind = fieldMap[innerKey];
        if (!kind) continue;
        inner[innerKey] = maskField(kind, inner[innerKey], meta.scalars.get(innerKey));
      }
      continue;
    }

    // 3) Campo escalar sigiloso.
    const kind = fieldMap[key];
    if (kind) {
      obj[key] = maskField(kind, value, meta.scalars.get(key));
    }
    // 4) Qualquer outra coisa (id, FK, status, contador, data) passa intacta — é o que o
    // suporte precisa para diagnosticar.
  }

  return obj;
}

// Ponto de entrada usado pela extensão do Prisma (lib/prisma.ts).
export function maskReadResult(modelName: string | undefined, result: unknown): unknown {
  if (!modelName) return result;
  return walk(modelName, result, new WeakSet<object>());
}

// Exportado para o teste: confere que todo campo declarado em SUPPORT_MASK_MAP existe mesmo no
// schema. Um nome de campo errado no mapa é uma falha SILENCIOSA — o campo simplesmente não
// seria mascarado e nada quebraria — então isso precisa ser verificável.
export function findUnknownMappedFields(): string[] {
  const problems: string[] = [];
  const meta = getMeta();
  for (const [modelName, fields] of Object.entries(SUPPORT_MASK_MAP)) {
    const modelMeta = meta.get(modelName);
    if (!modelMeta) {
      problems.push(`model desconhecido: ${modelName}`);
      continue;
    }
    for (const field of Object.keys(fields)) {
      if (!modelMeta.scalars.has(field)) problems.push(`campo inexistente: ${modelName}.${field}`);
    }
  }
  return problems;
}
