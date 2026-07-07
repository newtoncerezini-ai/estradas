export function currency(value) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0
  }).format(value || 0);
}

export function percent(value, digits = 1) {
  return `${new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  }).format(value || 0)}%`;
}

export function short(text, max = 96) {
  const value = (text || "").toString().trim();
  if (!value) return "-";
  return value.length > max ? `${value.slice(0, max - 3)}...` : value;
}

export function countBy(rows, field) {
  return rows.reduce((acc, row) => {
    const key = (row[field] || "Não informado").toString().trim() || "Não informado";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

export function chartData(counts) {
  return Object.entries(counts)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
}
