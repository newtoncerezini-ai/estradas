const fs = require("fs");
const path = require("path");
const shapefile = require("shapefile");

const root = path.resolve(__dirname, "..");
const shapeRoot = path.join(root, "data", "shapes", "der");
const outputPath = path.join(root, "public", "data", "roads.geojson");

function findFirst(extension) {
  const stack = [shapeRoot];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.name.toLowerCase().endsWith(extension)) {
        return fullPath;
      }
    }
  }
  return "";
}

function cleanProperties(properties) {
  return Object.fromEntries(
    Object.entries(properties || {}).map(([key, value]) => [
      key,
      typeof value === "string" ? value.trim() : value
    ])
  );
}

async function main() {
  const shpPath = findFirst(".shp");
  const dbfPath = shpPath ? shpPath.replace(/\.shp$/i, ".dbf") : "";
  if (!shpPath || !fs.existsSync(dbfPath)) {
    throw new Error("Shapefile incompleto. Esperado .shp e .dbf em data/shapes/der.");
  }

  const source = await shapefile.open(shpPath, dbfPath, { encoding: "utf-8" });
  const features = [];
  while (true) {
    const result = await source.read();
    if (result.done) break;
    if (!result.value?.geometry) continue;
    features.push({
      type: "Feature",
      properties: cleanProperties(result.value.properties),
      geometry: result.value.geometry
    });
  }

  const payload = {
    type: "FeatureCollection",
    name: path.basename(shpPath, ".shp"),
    generatedAt: new Date().toISOString(),
    features
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(payload)}\n`, "utf8");
  console.log(`Generated ${path.relative(root, outputPath)} with ${features.length} features`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
