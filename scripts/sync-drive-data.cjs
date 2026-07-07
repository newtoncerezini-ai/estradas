const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const dataDir = path.join(root, "data");

const sheets = [
  {
    id: process.env.GOOGLE_SHEET_LICITACOES_ID || "1KoTS7a2oaBXbSeRX0MsR_sga2Nz0qLq4h7sMm_7KIp4",
    output: "controle-licitacoes.xlsx"
  },
  {
    id: process.env.GOOGLE_SHEET_MONITORAMENTO_ID || "15fSkmuo9qUmXf7Nx2DceM92Xa89KJ1zz21gkSxDoNjk",
    output: "monitoramento-gov.xlsx"
  }
];

async function downloadSheet(sheet) {
  const url = `https://docs.google.com/spreadsheets/d/${sheet.id}/export?format=xlsx`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Falha ao baixar ${sheet.output}: ${response.status}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  const outputPath = path.join(dataDir, sheet.output);
  fs.writeFileSync(outputPath, buffer);
  console.log(`Atualizado ${path.relative(root, outputPath)}`);
}

async function main() {
  fs.mkdirSync(dataDir, { recursive: true });
  for (const sheet of sheets) {
    await downloadSheet(sheet);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
