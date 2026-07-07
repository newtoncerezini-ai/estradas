const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");

const root = path.resolve(__dirname, "..");
const dataDir = path.join(root, "data");
const licitacoesPath = path.join(dataDir, "controle-licitacoes.xlsx");
const monitoramentoPath = path.join(dataDir, "monitoramento-gov.xlsx");
const outputPath = path.join(root, "public", "data", "estradas-dashboard.json");

function text(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function key(value) {
  return text(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toUpperCase();
}

function number(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const raw = text(value);
  if (!raw || ["-", "#N/A", "#VALUE!", "#REF!"].includes(raw)) return 0;
  const numeric = raw.replace(/[^\d,.-]/g, "");
  if (!numeric) return 0;
  const lastComma = numeric.lastIndexOf(",");
  const lastDot = numeric.lastIndexOf(".");
  const decimal = lastComma > lastDot ? "," : ".";
  const normalized = decimal === "," ? numeric.replace(/\./g, "").replace(",", ".") : numeric.replace(/,/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value) {
  return number(value);
}

function percent(value) {
  const parsed = number(value);
  return parsed > 1 ? parsed : parsed * 100;
}

function sheetRows(workbook, sheetName) {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false, blankrows: false });
}

function columnIndex(header, ...names) {
  const wanted = names.map((name) => key(name));
  return header.findIndex((cell) => wanted.includes(key(cell)));
}

function columnIndexIncludes(header, ...names) {
  const wanted = names.map((name) => key(name));
  return header.findIndex((cell) => wanted.some((name) => key(cell).includes(name)));
}

function get(row, index) {
  return index >= 0 ? text(row[index]) : "";
}

function getNumber(row, index) {
  return index >= 0 ? number(row[index]) : 0;
}

function normalizeStatus(value) {
  return text(value) || "Não informado";
}

function validRoadName(value) {
  const raw = text(value);
  return raw && !["-", "#N/A", "#REF!", "#VALUE!", "TOTAL GERAL:"].includes(raw);
}

function parseLicitacoes(workbook) {
  const rows = sheetRows(workbook, "Controle Licitações CPL DER");
  const header = rows[0] || [];
  const idx = {
    id: columnIndex(header, "ID"),
    pactuacao: columnIndex(header, "PACTUAÇÃO"),
    tipo: columnIndex(header, "TIPO"),
    status: columnIndex(header, "STATUS"),
    rodovia: columnIndex(header, "RODOVIA"),
    inicio: columnIndex(header, "INÍCIO"),
    fim: columnIndex(header, "FIM"),
    extensao: columnIndexIncludes(header, "EXT"),
    etapaObra: columnIndex(header, "ETAPA LICITAÇÃO - OBRA"),
    prazoObra: columnIndex(header, "PRAZO DA ETAPA - OBRAS"),
    etapaOs: columnIndex(header, "ETAPA - LICITAÇÃO CONCLUÍDA ATÉ EMISSÃO DE OS"),
    prazoOs: columnIndex(header, "PRAZO DA ETAPA LICITAÇÃO CONCLUÍDA ATÉ EMISSÃO DE OS"),
    consideracoes: columnIndex(header, "CONSIDERAÇÕES RELEVANTES"),
    etapaProjeto: columnIndex(header, "ETAPA LICITAÇÃO - SUPERVISÃO/PROJETO"),
    prazoProjeto: columnIndex(header, "PRAZO DA ETAPA LICITAÇÃO - SUPERVISÃO/PROJETO"),
    responsavel: columnIndexIncludes(header, "UNIDADE ATUAL RESPONSAVEL", "UNIDADE ATUAL"),
    pendenteDdo: columnIndexIncludes(header, "PENDENTE DE DDO"),
    valorProjeto: columnIndexIncludes(header, "VALOR REFERENCIAL DE PROJETO"),
    valorProjetoLicitado: columnIndexIncludes(header, "VALOR LICITADO PROJETO"),
    valorReferencia: columnIndexIncludes(header, "VALOR REFERENCIAL OBRA OU SUPERVISAO"),
    valorLicitado: columnIndexIncludes(header, "VALOR LICITADO OBRA OU SUPERVISAO"),
    rd: columnIndex(header, "RD", "REGIÃO DE DESENVOLVIMENTO"),
    municipios: columnIndex(header, "MUNICÍPIOS"),
    populacao: columnIndexIncludes(header, "POPULACAO"),
    intervencao: columnIndex(header, "TIPO DE INTERVENÇÃO"),
    pavimentacao: columnIndex(header, "TIPO DE PAVIMENTAÇÃO")
  };

  return rows.slice(1)
    .map((row, index) => {
      const rodovia = get(row, idx.rodovia);
      if (!validRoadName(rodovia)) return null;
      const valorReferencia = getNumber(row, idx.valorReferencia) || getNumber(row, idx.valorProjeto);
      const valorLicitado = getNumber(row, idx.valorLicitado) || getNumber(row, idx.valorProjetoLicitado);
      return {
        source: "Controle Licitações CPL DER",
        id: get(row, idx.id) || `licitacao-${index + 1}`,
        pactuacao: get(row, idx.pactuacao),
        tipo: get(row, idx.tipo) || "Não informado",
        status: normalizeStatus(get(row, idx.status)),
        rodovia,
        inicio: get(row, idx.inicio),
        fim: get(row, idx.fim),
        extensaoKm: getNumber(row, idx.extensao),
        regiaoDesenvolvimento: get(row, idx.rd),
        municipios: get(row, idx.municipios),
        populacao: get(row, idx.populacao),
        etapaObra: get(row, idx.etapaObra) || get(row, idx.etapaOs),
        etapaProjeto: get(row, idx.etapaProjeto),
        prazoEtapa: get(row, idx.prazoObra) || get(row, idx.prazoOs) || get(row, idx.prazoProjeto),
        responsavel: get(row, idx.responsavel),
        pendenteDdo: get(row, idx.pendenteDdo),
        valorReferencia,
        valorLicitado,
        tipoIntervencao: get(row, idx.intervencao),
        tipoPavimentacao: get(row, idx.pavimentacao),
        consideracoes: get(row, idx.consideracoes)
      };
    })
    .filter(Boolean);
}

function parseLicitacoesDiversos(workbook) {
  const rows = sheetRows(workbook, "Licitações Diversos");
  const header = rows[0] || [];
  const idx = {
    idGov: columnIndex(header, "ID - GOV"),
    id: columnIndex(header, "id", "ID"),
    pactuacao: columnIndex(header, "PACTUAÇÃO"),
    tipo: columnIndex(header, "TIPO"),
    status: columnIndex(header, "STATUS"),
    rodovia: columnIndex(header, "RODOVIA / DESCRIÇÃO"),
    inicio: columnIndex(header, "INÍCIO"),
    fim: columnIndex(header, "FIM"),
    extensao: columnIndexIncludes(header, "EXT"),
    rd: columnIndex(header, "RD"),
    etapaObra: columnIndex(header, "ETAPA LICITAÇÃO - OBRA"),
    prazoObra: columnIndexIncludes(header, "PRAZO DA ETAPA LICITACAO OBRAS"),
    valorReferencia: columnIndexIncludes(header, "VALOR REFERENCIAL")
  };

  return rows.slice(1)
    .map((row, index) => {
      const rodovia = get(row, idx.rodovia);
      if (!validRoadName(rodovia)) return null;
      return {
        source: "Licitações Diversos",
        id: get(row, idx.id) || get(row, idx.idGov) || `diverso-${index + 1}`,
        pactuacao: get(row, idx.pactuacao),
        tipo: get(row, idx.tipo) || "OBRA",
        status: normalizeStatus(get(row, idx.status)),
        rodovia,
        inicio: get(row, idx.inicio),
        fim: get(row, idx.fim),
        extensaoKm: getNumber(row, idx.extensao),
        regiaoDesenvolvimento: get(row, idx.rd),
        etapaObra: get(row, idx.etapaObra),
        prazoEtapa: get(row, idx.prazoObra),
        valorReferencia: getNumber(row, idx.valorReferencia),
        valorLicitado: 0,
        consideracoes: ""
      };
    })
    .filter(Boolean);
}

function parseObras(workbook) {
  const rows = sheetRows(workbook, "RD GOV");
  const header = rows[0] || [];
  const idx = {
    id: columnIndex(header, "ID"),
    status: columnIndex(header, "STATUS"),
    contrato: columnIndex(header, "CONTRATO"),
    rodovia: columnIndex(header, "RODOVIA"),
    inicio: columnIndex(header, "INÍCIO"),
    fim: columnIndex(header, "FIM"),
    extensao: columnIndex(header, "EXTENSÃO (KM)"),
    investimentoTotal: columnIndexIncludes(header, "INVESTIMENTO TOTAL EM OBRAS SUPER R MI"),
    investimentoTotalBruto: columnIndexIncludes(header, "INVESTIMENTO TOTAL EM OBRAS SUPER PI R ADITIVO"),
    valorLicitado: columnIndex(header, "VALOR LICITADO"),
    valorMedido: columnIndexIncludes(header, "VALOR MEDIDO TOTAL EM OBRAS SUPER R MI"),
    valorMedidoBruto: columnIndexIncludes(header, "VALOR MEDIDO TOTAL EM OBRAS SUPER"),
    rd: columnIndex(header, "REGIÃO DE DESENVOLVIMENTO")
  };

  const kmById = parseKm(workbook);
  const advancesById = parseAdvances(workbook);
  const contractByNumber = parseContracts(workbook);

  return rows.slice(1)
    .map((row, index) => {
      const rodovia = get(row, idx.rodovia);
      if (!validRoadName(rodovia)) return null;
      const id = get(row, idx.id) || `obra-${index + 1}`;
      const contrato = get(row, idx.contrato);
      const kmInfo = kmById.get(id) || {};
      const advance = advancesById.get(id) || {};
      const contract = contractByNumber.get(contrato) || {};
      const investimentoMi = getNumber(row, idx.investimentoTotal);
      const medidoMi = getNumber(row, idx.valorMedido);
      return {
        source: "RD GOV",
        id,
        status: normalizeStatus(get(row, idx.status)),
        contrato,
        rodovia,
        inicio: get(row, idx.inicio),
        fim: get(row, idx.fim),
        extensaoKm: getNumber(row, idx.extensao) || kmInfo.extensaoKm || contract.extensaoKm,
        investimentoTotal: investimentoMi ? investimentoMi * 1000000 : getNumber(row, idx.investimentoTotalBruto),
        valorLicitado: getNumber(row, idx.valorLicitado),
        valorMedido: medidoMi ? medidoMi * 1000000 : getNumber(row, idx.valorMedidoBruto),
        regiaoDesenvolvimento: get(row, idx.rd) || kmInfo.regiaoDesenvolvimento,
        avancoFisico: advance.avancoFisico ?? kmInfo.avancoFisico ?? 0,
        avancoFinanceiro: advance.avancoFinanceiro ?? 0,
        kmRecuperados: kmInfo.kmRecuperados || 0,
        finalizacao: advance.finalizacao || "",
        numeroContrato: contract.numeroContrato || contrato,
        contratada: contract.contratada || "",
        gestor: contract.gestor || "",
        fiscal: contract.fiscal || "",
        observacao: advance.observacao || ""
      };
    })
    .filter(Boolean);
}

function parseKm(workbook) {
  const rows = sheetRows(workbook, "Km restaurados");
  const header = rows[0] || [];
  const idx = {
    id: columnIndex(header, "id", "ID"),
    extensao: columnIndex(header, "EXTENSÃO"),
    avanco: columnIndex(header, "AVANÇO FÍSICO"),
    kmRecuperados: columnIndex(header, "KM JÁ RECUPERADOS"),
    rd: columnIndex(header, "RD")
  };
  const map = new Map();
  rows.slice(1).forEach((row) => {
    const id = get(row, idx.id);
    if (!id) return;
    map.set(id, {
      extensaoKm: getNumber(row, idx.extensao),
      avancoFisico: percent(row[idx.avanco]),
      kmRecuperados: getNumber(row, idx.kmRecuperados),
      regiaoDesenvolvimento: get(row, idx.rd)
    });
  });
  return map;
}

function parseAdvances(workbook) {
  const rows = sheetRows(workbook, "Análise-avanços");
  const headerIndex = rows.findIndex((row) => row.some((cell) => key(cell) === "ID") && row.some((cell) => key(cell).includes("FISICO")));
  const header = rows[headerIndex] || [];
  const idx = {
    id: columnIndex(header, "ID"),
    fisico: columnIndexIncludes(header, "FISICO PLUG ATUAL"),
    financeiro: columnIndexIncludes(header, "FINANCEIRO PLUG ATUAL"),
    status: columnIndex(header, "STATUS"),
    finalizacao: columnIndex(header, "finalização", "FINALIZACAO")
  };
  const map = new Map();
  rows.slice(headerIndex + 1).forEach((row) => {
    const id = get(row, idx.id);
    if (!id) return;
    map.set(id, {
      avancoFisico: percent(row[idx.fisico]),
      avancoFinanceiro: percent(row[idx.financeiro]),
      status: get(row, idx.status),
      finalizacao: get(row, idx.finalizacao)
    });
  });
  return map;
}

function parseContracts(workbook) {
  const rows = sheetRows(workbook, "Contrato");
  const header = rows[0] || [];
  const idx = {
    numero: columnIndex(header, "Nº do Contrato"),
    contratada: columnIndex(header, "Contratada"),
    extensao: columnIndex(header, "Extensão Km"),
    fiscal: columnIndex(header, "Fiscal do Contrato"),
    gestor: columnIndex(header, "Gestor do Contrato")
  };
  const map = new Map();
  rows.slice(1).forEach((row) => {
    const numeroContrato = get(row, idx.numero);
    if (!numeroContrato) return;
    map.set(numeroContrato, {
      numeroContrato,
      contratada: get(row, idx.contratada),
      extensaoKm: getNumber(row, idx.extensao),
      fiscal: get(row, idx.fiscal),
      gestor: get(row, idx.gestor)
    });
  });
  return map;
}

function parseReabilita(workbook) {
  const rows = sheetRows(workbook, "REABILITA");
  const headerIndex = rows.findIndex((row) => row.some((cell) => key(cell) === "RODOVIA") && row.some((cell) => key(cell).includes("LOTE")));
  const header = rows[headerIndex] || [];
  const idx = {
    id: columnIndex(header, "#", "ID"),
    rodovia: columnIndex(header, "RODOVIA"),
    inicio: columnIndex(header, "INÍCIO"),
    fim: columnIndex(header, "FIM"),
    extensao: columnIndexIncludes(header, "EXTENSAO"),
    investimento: columnIndexIncludes(header, "INVESTIMENTO ESTIMADO"),
    custoKm: columnIndex(header, "CUSTO POR KM"),
    lote: columnIndex(header, "LOTE")
  };

  return rows.slice(headerIndex + 1)
    .map((row, index) => {
      const rodovia = get(row, idx.rodovia);
      if (!validRoadName(rodovia)) return null;
      return {
        id: get(row, idx.id) || `reabilita-${index + 1}`,
        rodovia,
        inicio: get(row, idx.inicio),
        fim: get(row, idx.fim),
        extensaoKm: getNumber(row, idx.extensao),
        investimentoEstimado: getNumber(row, idx.investimento) * 1000000,
        custoKm: getNumber(row, idx.custoKm) * 1000000,
        lote: get(row, idx.lote) || "Sem lote",
        status: "A detalhar"
      };
    })
    .filter(Boolean);
}

function parseQuadroResumo(workbook) {
  const rows = sheetRows(workbook, "QUADRO RESUMO");
  const items = [];
  rows.slice(1).forEach((row) => {
    if (text(row[0])) {
      items.push({
        grupo: "pactuadas",
        descricao: text(row[0]),
        quantidade: number(row[1]),
        investimentoMi: money(row[2]),
        valorLicitadoMi: money(row[3])
      });
    }
    if (text(row[7])) {
      items.push({
        grupo: "naoPactuadas",
        descricao: text(row[7]),
        quantidade: number(row[8]),
        extensaoKm: number(row[9]),
        investimentoMi: money(row[10]),
        valorLicitadoMi: money(row[11])
      });
    }
  });
  return items.filter((item) => item.descricao && !key(item.descricao).includes("TOTAL"));
}

function main() {
  if (!fs.existsSync(licitacoesPath) || !fs.existsSync(monitoramentoPath)) {
    throw new Error("Baixe as planilhas para data/ antes de gerar o painel.");
  }

  const licWb = XLSX.readFile(licitacoesPath, { cellDates: true });
  const govWb = XLSX.readFile(monitoramentoPath, { cellDates: true });
  const licitacoes = [...parseLicitacoes(licWb), ...parseLicitacoesDiversos(licWb)];
  const obras = parseObras(govWb);
  const reabilita = parseReabilita(govWb);
  const resumoLicitacoes = parseQuadroResumo(licWb);

  const payload = {
    generatedAt: new Date().toISOString(),
    sourceFiles: {
      licitacoes: path.relative(root, licitacoesPath),
      monitoramento: path.relative(root, monitoramentoPath)
    },
    obras,
    licitacoes,
    reabilita,
    resumoLicitacoes
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(`Generated ${outputPath}`);
  console.log(`Obras: ${obras.length}; Licitações: ${licitacoes.length}; Reabilita: ${reabilita.length}`);
}

main();
