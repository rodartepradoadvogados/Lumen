import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, symlinkSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { teste, igual, verdade, resumo } from "./executar";

// ============================================================================================
// O SCRIPT QUE `servidor.py` EXECUTAVA SEM ELE EXISTIR.
//
// `GET /perfis`, `POST /provisionar` e `POST /desprovisionar` respondiam 501 porque
// `servidor-hermes/provision_tenant.py` não existia. Sem ele, um escritório novo nasce com a
// caixa de conversa MUDA: o `/chat` responde 404 e não há nada que a tela possa fazer.
//
// ESTE ARQUIVO RODA O SCRIPT DE VERDADE — não só lê o texto dele. `HERMES_PROFILES_DIR` aponta
// para um diretório temporário por teste, e `python3 servidor-hermes/provision_tenant.py <args>`
// roda de verdade, via `spawnSync`, do mesmo jeito que `servidor.py` o executa em produção
// (`executar_provisionamento`, em servidor.py). É a mesma disciplina de
// `lib/testes/peticionamentoGeracaoAssincrona.teste.ts`: varredura prova que o código EXISTE,
// só executar prova que ele FUNCIONA.
// ============================================================================================

const RAIZ = process.cwd();
const SCRIPT = join(RAIZ, "servidor-hermes", "provision_tenant.py");
const FONTE_SCRIPT = readFileSync(SCRIPT, "utf8");
const FONTE_PONTE = readFileSync(join(RAIZ, "servidor-hermes", "servidor.py"), "utf8");

verdade(existsSync(SCRIPT), `o script precisa existir em ${SCRIPT} para este arquivo inteiro fazer sentido`);

// ── O CORREDOR: uma pasta de perfis nova por chamada, com o perfil-modelo já dentro ───────────

type Resultado = { status: number; stdout: string; stderr: string; ultimaLinhaStdout: string; ultimaLinhaStderr: string };

function rodar(args: string[], pastaPerfis: string, envExtra: Record<string, string> = {}): Resultado {
  const r = spawnSync("python3", [SCRIPT, ...args], {
    cwd: RAIZ,
    env: { ...process.env, HERMES_PROFILES_DIR: pastaPerfis, ...envExtra },
    encoding: "utf8",
    timeout: 30_000,
  });
  const stdout = r.stdout ?? "";
  const stderr = r.stderr ?? "";
  const linhasOut = stdout.trim().split("\n");
  const linhasErr = stderr.trim().split("\n");
  return {
    status: r.status ?? -1,
    stdout,
    stderr,
    ultimaLinhaStdout: linhasOut[linhasOut.length - 1] ?? "",
    ultimaLinhaStderr: linhasErr[linhasErr.length - 1] ?? "",
  };
}

/** Uma pasta de perfis nova, com `lumen-master` já dentro (com ou sem `auth.json`, à escolha). */
function novaPastaDePerfis(opts: { comAuth?: boolean } = { comAuth: true }): string {
  const pasta = mkdtempSync(join(tmpdir(), "hermes-perfis-"));
  const master = join(pasta, "lumen-master");
  mkdirSync(master, { recursive: true });
  if (opts.comAuth !== false) {
    writeFileSync(join(master, "auth.json"), JSON.stringify({ tipo: "credencial-de-mentira", conteudo: "original" }));
  }
  writeFileSync(join(master, "profile.yaml"), "description: \"\"\ndescription_auto: true\nui_meta: {}\n_ui_meta_revisions: []\n");
  return pasta;
}

// ── 1. `provision` CRIA O PERFIL E DEVOLVE JSON NA ÚLTIMA LINHA DO STDOUT ─────────────────────

teste("EXERCITADO: provision cria o perfil e a última linha do stdout é JSON", () => {
  const pasta = novaPastaDePerfis();
  try {
    const r = rodar(["provision", "--slug", "escritorio-um", "--id", "off_1", "--name", "Escritório Um"], pasta);
    igual(r.status, 0, `provision devia sair com 0; stderr: ${r.stderr}`);
    const json = JSON.parse(r.ultimaLinhaStdout);
    igual(json.slug, "escritorio-um");
    igual(json.officeId, "off_1");
    igual(json.criado, true);
    igual(json.jaExistia, false);
    verdade(existsSync(join(pasta, "escritorio-um", "auth.json")), "o auth.json do modelo precisa ter sido copiado para o perfil novo");
    verdade(existsSync(join(pasta, "escritorio-um", "profile.yaml")), "o profile.yaml do modelo precisa ter sido copiado para o perfil novo");
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
});

// ── 2. `provision` DUAS VEZES: A SEGUNDA NÃO FALHA NEM ALTERA O auth.json JÁ EXISTENTE ────────

teste("EXERCITADO: provision é IDEMPOTENTE — a segunda chamada não toca no auth.json do perfil já criado", () => {
  const pasta = novaPastaDePerfis();
  try {
    const primeira = rodar(["provision", "--slug", "escritorio-dois", "--id", "off_2", "--name", "Escritório Dois"], pasta);
    igual(primeira.status, 0, `a primeira chamada devia ter sucesso; stderr: ${primeira.stderr}`);

    // MUDA O CONTEÚDO DO auth.json DO PERFIL JÁ CRIADO, entre as duas chamadas — é a prova de que
    // a segunda chamada não reescreve nada: se ela tocasse no arquivo, este marcador sumiria.
    const caminhoAuth = join(pasta, "escritorio-dois", "auth.json");
    const marcador = JSON.stringify({ marcador: "NAO_PODE_SER_SOBRESCRITO", sessao: "sessao-em-andamento" });
    writeFileSync(caminhoAuth, marcador);

    const segunda = rodar(["provision", "--slug", "escritorio-dois", "--id", "off_2", "--name", "Escritório Dois"], pasta);
    igual(segunda.status, 0, `a segunda chamada (mesmo perfil) não pode falhar — o disparo do webhook e o cron de segurança podem colidir; stderr: ${segunda.stderr}`);
    const json = JSON.parse(segunda.ultimaLinhaStdout);
    igual(json.jaExistia, true, "a segunda chamada precisa dizer que o perfil já existia");
    igual(json.criado, false);

    const conteudoDepois = readFileSync(caminhoAuth, "utf8");
    igual(conteudoDepois, marcador, "o auth.json do perfil já existente foi TOCADO pela segunda chamada — é exatamente o que a idempotência proíbe");
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
});

// ── 3. `provision` SEM auth.json NO MODELO: FALHA, E FALA O QUE FAZER ─────────────────────────

teste("EXERCITADO: provision SEM auth.json no perfil-modelo falha e diz o que fazer", () => {
  const pasta = novaPastaDePerfis({ comAuth: false });
  try {
    const r = rodar(["provision", "--slug", "escritorio-tres", "--id", "off_3", "--name", "Escritório Três"], pasta);
    verdade(r.status !== 0, "sem auth.json no modelo, o provisionamento precisa FALHAR");
    verdade(!existsSync(join(pasta, "escritorio-tres")), "nenhum perfil pode ter sido criado quando o modelo não tem auth.json");
    verdade(/auth\.json/.test(r.ultimaLinhaStderr), `a mensagem de erro precisa citar auth.json: "${r.ultimaLinhaStderr}"`);
    verdade(/copie/i.test(r.stderr), `a mensagem precisa dizer O QUE FAZER (copiar o auth.json de um perfil que funciona): "${r.stderr}"`);
    verdade(/VPS/.test(r.stderr), `a mensagem precisa deixar claro que o passo é NA VPS, nunca no repositório: "${r.stderr}"`);
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
});

// ── 4. `deprovision` DE PERFIL INEXISTENTE: CÓDIGO != 0, E A MESMA FRASE QUE A PONTE TRADUZ EM 404

/**
 * A CONDIÇÃO, LIDA DE servidor.py — não reescrita à mão aqui. `_provisionamento` traduz uma falha
 * de provisionamento em 404 quando a última linha do stderr do script contém uma destas frases
 * (em minúsculas); qualquer outra coisa vira 500. Ler a condição do PRÓPRIO arquivo, em vez de
 * copiar as três strings à mão neste teste, é o que garante que o teste continua válido se algum
 * dia a lista de frases mudar de um lado só.
 */
function frasesQuePonteTraduzEm404(): string[] {
  const inicio = FONTE_PONTE.indexOf("def _provisionamento(self):");
  verdade(inicio > 0, "não achei _provisionamento em servidor.py — varredura cega");
  const trecho = FONTE_PONTE.slice(inicio, inicio + 4_000);
  const condicao = trecho.match(/if\s+((?:"[^"]+"\s*in\s*texto\s*(?:or\s*)?)+):/);
  verdade(Boolean(condicao), "não achei a condição que decide 404 vs. 500 em _provisionamento — varredura cega");
  const frases = [...condicao![1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  verdade(frases.length >= 3, `esperava pelo menos 3 frases na condição, achei ${frases.length}`);
  return frases;
}

teste("a varredura da condição de 404 não está cega — achou as frases reais de servidor.py", () => {
  const frases = frasesQuePonteTraduzEm404();
  verdade(frases.includes("não encontrado"), `as frases achadas foram: ${JSON.stringify(frases)}`);
});

teste("EXERCITADO: deprovision de perfil inexistente sai com código != 0 e a MESMA frase que vira 404 na ponte", () => {
  const pasta = novaPastaDePerfis();
  try {
    const r = rodar(["deprovision", "--slug", "nunca-existiu"], pasta);
    verdade(r.status !== 0, "deprovision de perfil inexistente precisa sair com código != 0");
    const frases = frasesQuePonteTraduzEm404();
    const minusculo = r.ultimaLinhaStderr.toLowerCase();
    verdade(
      frases.some((f) => minusculo.includes(f.toLowerCase())),
      `a última linha do stderr ("${r.ultimaLinhaStderr}") precisa conter uma das frases que servidor.py traduz em 404: ${JSON.stringify(frases)}`,
    );
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
});

// ── 5. `deprovision` DO `lumen-master`: RECUSADO ──────────────────────────────────────────────

teste("EXERCITADO: deprovision recusa remover o próprio lumen-master", () => {
  const pasta = novaPastaDePerfis();
  try {
    const r = rodar(["deprovision", "--slug", "lumen-master"], pasta);
    verdade(r.status !== 0, "remover o perfil-modelo precisa ser recusado");
    verdade(existsSync(join(pasta, "lumen-master")), "o perfil-modelo precisa continuar no disco depois da recusa");
    verdade(/lumen-master/.test(r.ultimaLinhaStderr), `a recusa precisa nomear o perfil-modelo: "${r.ultimaLinhaStderr}"`);
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
});

// ── 6. SLUG INVÁLIDO (`..`, barra, maiúscula) É RECUSADO — provision e deprovision ────────────
//
// `list` NÃO tem `--slug`: os três comandos que servidor.py chama são `list` (sem argumento
// nenhum), `provision --slug ...` e `deprovision --slug ...` (ver o contrato no topo do arquivo e
// em servidor-hermes/LEIA-ME.md). Testar "slug inválido em list" não tem como ser honesto — não
// existe um slug para list recusar. Os dois comandos que RECEBEM slug são cobertos abaixo.

const SLUGS_INVALIDOS = ["../fora-da-pasta", "com/barra", "ComMaiuscula", "-comeca-com-hifen", ""];

for (const slug of SLUGS_INVALIDOS) {
  teste(`EXERCITADO: provision recusa slug inválido ${JSON.stringify(slug)}`, () => {
    const pasta = novaPastaDePerfis();
    try {
      const r = rodar(["provision", "--slug", slug, "--id", "off_x", "--name", "X"], pasta);
      verdade(r.status !== 0, `provision --slug ${JSON.stringify(slug)} precisava ser recusado`);
      // NENHUM perfil pode ter sido criado, e nada fora da pasta de perfis pode ter sido tocado.
      verdade(
        readdirSync(pasta).every((n) => n === "lumen-master"),
        `a pasta de perfis não pode ganhar nada além de lumen-master com um slug inválido; achei: ${readdirSync(pasta).join(", ")}`,
      );
    } finally {
      rmSync(pasta, { recursive: true, force: true });
    }
  });

  teste(`EXERCITADO: deprovision recusa slug inválido ${JSON.stringify(slug)}`, () => {
    const pasta = novaPastaDePerfis();
    try {
      const r = rodar(["deprovision", "--slug", slug], pasta);
      verdade(r.status !== 0, `deprovision --slug ${JSON.stringify(slug)} precisava ser recusado`);
      verdade(existsSync(join(pasta, "lumen-master")), "lumen-master não pode ter sido afetado por um slug inválido em deprovision");
    } finally {
      rmSync(pasta, { recursive: true, force: true });
    }
  });
}

// ── 7. `list` DEVOLVE JSON E ENXERGA O PERFIL CRIADO ──────────────────────────────────────────

teste("EXERCITADO: list devolve JSON, enxerga lumen-master e o perfil criado depois", () => {
  const pasta = novaPastaDePerfis();
  try {
    const antes = rodar(["list"], pasta);
    igual(antes.status, 0, `list devia sair com 0; stderr: ${antes.stderr}`);
    const jsonAntes = JSON.parse(antes.ultimaLinhaStdout);
    verdade(Array.isArray(jsonAntes.perfis), "list precisa devolver {perfis: [...]}");
    verdade(jsonAntes.perfis.some((p: { slug: string }) => p.slug === "lumen-master"), "list precisa enxergar o lumen-master");

    const prov = rodar(["provision", "--slug", "escritorio-sete", "--id", "off_7", "--name", "Escritório Sete"], pasta);
    igual(prov.status, 0, `provision devia ter sucesso; stderr: ${prov.stderr}`);

    const depois = rodar(["list"], pasta);
    const jsonDepois = JSON.parse(depois.ultimaLinhaStdout);
    const achado = jsonDepois.perfis.find((p: { slug: string }) => p.slug === "escritorio-sete");
    verdade(Boolean(achado), `list precisa enxergar o perfil recém-criado; achei: ${JSON.stringify(jsonDepois.perfis)}`);
    igual(achado.temAuth, true, "o perfil criado tem auth.json (copiado do modelo) — list precisa reportar isso");
    igual(achado.officeId, "off_7");
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
});

// ── 8. ESPELHO DAS REGRAS: as expressões de validação do script são as MESMAS de servidor.py ──
//
// Esta casa já pegou divergência entre dois lados que deviam dizer a mesma coisa
// (PERGUNTA_MAXIMA/CORPO_MAXIMO — ver lib/testes/peticionamentoLimiteDaPonte.teste.ts). A regra
// desde então: quando um valor existe SÓ PORQUE outro arquivo já o define, o teste lê os DOIS e
// falha se divergirem — nunca testa um contra ele mesmo.

function valorDe(fonte: string, nome: string, arquivo: string): string {
  const m = fonte.match(new RegExp(`^${nome}\\s*=\\s*(.+?)\\s*$`, "m"));
  verdade(Boolean(m), `${nome} sumiu de ${arquivo}`);
  return m![1];
}

teste("ESPELHO: SLUG_VALIDO do script é EXATAMENTE o de servidor.py", () => {
  igual(
    valorDe(FONTE_SCRIPT, "SLUG_VALIDO", "provision_tenant.py"),
    valorDe(FONTE_PONTE, "SLUG_VALIDO", "servidor.py"),
    "SLUG_VALIDO divergiu entre os dois arquivos — o script pode ser chamado direto, sem passar pela ponte, e as duas regras precisam aceitar e recusar exatamente o mesmo",
  );
});

teste("ESPELHO: ID_VALIDO do script é EXATAMENTE o de servidor.py", () => {
  igual(
    valorDe(FONTE_SCRIPT, "ID_VALIDO", "provision_tenant.py"),
    valorDe(FONTE_PONTE, "ID_VALIDO", "servidor.py"),
    "ID_VALIDO divergiu entre os dois arquivos",
  );
});

teste("ESPELHO: NOME_MAXIMO do script é EXATAMENTE o de servidor.py", () => {
  igual(
    valorDe(FONTE_SCRIPT, "NOME_MAXIMO", "provision_tenant.py"),
    valorDe(FONTE_PONTE, "NOME_MAXIMO", "servidor.py"),
    "NOME_MAXIMO divergiu entre os dois arquivos",
  );
});

teste("ESPELHO: a pasta de perfis padrão (HERMES_PROFILES_DIR) é a MESMA nos dois arquivos", () => {
  // Se este valor divergir, o script escreveria perfis num lugar e a ponte procuraria noutro —
  // provisionar pareceria funcionar (saída 0, JSON certo) e o /chat continuaria 404 mesmo assim.
  const doScript = FONTE_SCRIPT.match(/HERMES_PROFILES_DIR",\s*"([^"]+)"/);
  const daPonte = FONTE_PONTE.match(/HERMES_PROFILES_DIR",\s*"([^"]+)"/);
  verdade(Boolean(doScript), "HERMES_PROFILES_DIR (com o padrão) sumiu de provision_tenant.py");
  verdade(Boolean(daPonte), "HERMES_PROFILES_DIR (com o padrão) sumiu de servidor.py");
  igual(doScript![1], daPonte![1], "o padrão de HERMES_PROFILES_DIR divergiu entre o script e a ponte");
});

teste("ESPELHO: o caminho instalado do script (servidor.py) aponta para dentro do perfil-modelo (provision_tenant.py)", () => {
  // servidor.py: SCRIPT_PROVISIONAMENTO default = ".../profiles/lumen-master/scripts/provision_tenant.py"
  // provision_tenant.py: PERFIL_MODELO default = "lumen-master"
  // Os dois números (o nome do perfil-modelo) precisam ser o MESMO, ou o caminho fixo da ponte
  // apontaria para um perfil que o script não reconhece como modelo.
  const caminhoInstalado = FONTE_PONTE.match(/HERMES_PROVISION_SCRIPT",\s*\n?\s*"([^"]+)"/);
  verdade(Boolean(caminhoInstalado), "SCRIPT_PROVISIONAMENTO (com o padrão) sumiu de servidor.py");
  const nomeDoModelo = FONTE_SCRIPT.match(/HERMES_MASTER_PROFILE",\s*"([^"]+)"/);
  verdade(Boolean(nomeDoModelo), "HERMES_MASTER_PROFILE (com o padrão) sumiu de provision_tenant.py");
  verdade(
    caminhoInstalado![1].includes(`/${nomeDoModelo![1]}/`),
    `o caminho instalado (${caminhoInstalado![1]}) precisa passar pela pasta do perfil-modelo (${nomeDoModelo![1]})`,
  );
});

// ── 9. FALHA ATÔMICA: uma cópia interrompida não pode deixar perfil pela metade ───────────────
//
// COMO SIMULAR ISTO DE FORMA HONESTA. `chmod 000` num arquivo do modelo NÃO funciona aqui: os
// testes rodam como root, e root ignora permissão de leitura — a simulação passaria mesmo que a
// trava de atomicidade tivesse sumido, o que seria um teste que finge testar. Em vez disso, o
// modelo ganha um LINK SIMBÓLICO QUEBRADO (para um caminho que não existe): `shutil.copytree`
// tenta copiar o alvo do link e falha com "No such file or directory" — uma falha genuína, que
// não depende de privilégio nenhum, no MEIO de uma cópia que já tinha copiado outros arquivos.
teste("EXERCITADO: uma cópia interrompida no meio não deixa perfil pela metade", () => {
  const pasta = novaPastaDePerfis();
  try {
    const master = join(pasta, "lumen-master");
    writeFileSync(join(master, "normal.txt"), "arquivo que copia sem problema");
    symlinkSync("/caminho/que/definitivamente/nao/existe", join(master, "quebrado.lnk"));

    const r = rodar(["provision", "--slug", "meio-pronto", "--id", "off_9", "--name", "Nove"], pasta);
    verdade(r.status !== 0, "a cópia com um link quebrado precisa FALHAR — essa é a premissa do teste");

    const conteudo = readdirSync(pasta);
    igual(conteudo, ["lumen-master"], `depois da falha, a pasta de perfis só pode conter lumen-master; achei: ${conteudo.join(", ")}`);
    verdade(!existsSync(join(pasta, "meio-pronto")), "não pode existir um perfil 'meio-pronto', nem completo nem pela metade");
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
});

resumo("hermesProvisionamento");
