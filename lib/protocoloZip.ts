// Escritor de arquivo .zip mínimo, sem dependência externa (CRC32 + container ZIP puros,
// escritos à mão) — usado só para o "Baixar tudo" de um lote de protocolo (ver
// app/api/protocolos/[loteId]/zip/route.ts).
//
// Por que não uma lib pronta (archiver/jszip/adm-zip): este arquivo pertence ao domínio de
// Protocolos (lib/protocolos.ts, lib/actions/protocolos.ts) e adicionar uma dependência nova
// mexeria em package.json/package-lock.json — arquivos compartilhados com o resto do time que
// está trabalhando em paralelo nesta mesma sessão, fora do escopo desta funcionalidade. Um lote
// de protocolo tem poucos documentos (é uma lista pra enviar ao tribunal, não um acervo inteiro),
// então o custo de não comprimir (método STORED, sem deflate) é irrelevante — o ganho aqui é zero
// superfície de conflito.

// CRC-32 (IEEE 802.3, o mesmo do formato ZIP) — tabela calculada uma vez no carregamento do módulo.
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// Data/hora DOS fixa (ZIP não tem campo "sem data"): não há data real de cada documento aqui
// dentro (só o momento do download), então usar "agora" mesmo é o mais honesto — é quando o zip
// foi gerado, não finge ser a data do documento original.
function dosDateTime(d: Date): { time: number; date: number } {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (Math.floor(d.getSeconds() / 2) & 0x1f);
  const date = (((d.getFullYear() - 1980) & 0x7f) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, date };
}

export type ZipEntry = { name: string; data: Buffer };

// Monta um .zip válido (método STORED, sem compressão) a partir de uma lista de entradas
// nome+conteúdo. Nomes duplicados são desambiguados automaticamente (acrescenta " (2)", " (3)"…)
// para nunca sobrescrever uma entrada dentro do zip.
export function buildZipBuffer(entries: ZipEntry[]): Buffer {
  const now = new Date();
  const { time, date } = dosDateTime(now);

  const usedNames = new Set<string>();
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = uniqueName(entry.name, usedNames);
    const nameBuf = Buffer.from(name, "utf8");
    const data = entry.data;
    const crc = crc32(data);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4); // version needed
    localHeader.writeUInt16LE(0x0800, 6); // flags: bit 11 = nomes em UTF-8
    localHeader.writeUInt16LE(0, 8); // método: 0 = STORED (sem compressão)
    localHeader.writeUInt16LE(time, 10);
    localHeader.writeUInt16LE(date, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(data.length, 18); // tamanho comprimido = tamanho real (STORED)
    localHeader.writeUInt32LE(data.length, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28); // extra field length

    localParts.push(localHeader, nameBuf, data);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4); // version made by
    centralHeader.writeUInt16LE(20, 6); // version needed
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(time, 12);
    centralHeader.writeUInt16LE(date, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(data.length, 20);
    centralHeader.writeUInt32LE(data.length, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30); // extra length
    centralHeader.writeUInt16LE(0, 32); // comment length
    centralHeader.writeUInt16LE(0, 34); // disk number start
    centralHeader.writeUInt16LE(0, 36); // internal attrs
    centralHeader.writeUInt32LE(0, 38); // external attrs
    centralHeader.writeUInt32LE(offset, 42); // offset do local header desta entrada

    centralParts.push(centralHeader, nameBuf);

    offset += localHeader.length + nameBuf.length + data.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const centralStart = offset;

  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4); // disk number
  end.writeUInt16LE(0, 6); // disk with central directory
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(centralStart, 16);
  end.writeUInt16LE(0, 20); // comment length

  return Buffer.concat([...localParts, centralDirectory, end]);
}

function uniqueName(rawName: string, used: Set<string>): string {
  // "/" dentro de um nome de entrada de zip cria uma subpasta — não é o que queremos aqui
  // (a ordem de envio já está no prefixo numérico do nome, ver formatShortcutName).
  const base = rawName.replace(/[/\\]/g, "-").trim() || "documento";
  if (!used.has(base)) {
    used.add(base);
    return base;
  }
  const dot = base.lastIndexOf(".");
  const stem = dot > 0 ? base.slice(0, dot) : base;
  const ext = dot > 0 ? base.slice(dot) : "";
  let n = 2;
  let candidate = `${stem} (${n})${ext}`;
  while (used.has(candidate)) {
    n++;
    candidate = `${stem} (${n})${ext}`;
  }
  used.add(candidate);
  return candidate;
}
