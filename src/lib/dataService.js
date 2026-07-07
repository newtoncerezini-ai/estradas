const DEFAULT_DATA_URL = "/data/estradas-dashboard.json";
const AUTO_REFRESH_MS = 60 * 60 * 1000;

export { AUTO_REFRESH_MS };

export async function loadDashboardData() {
  const url = import.meta.env.VITE_ESTRADAS_DATA_URL || DEFAULT_DATA_URL;
  const dataUrl = new URL(url, window.location.origin);
  dataUrl.searchParams.set("_", Date.now().toString());
  const response = await fetch(dataUrl.toString(), { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`Falha ao carregar dados (${response.status})`);
  }

  return response.json();
}

export async function refreshDashboardData() {
  if ((import.meta.env.VITE_ESTRADAS_STATIC_DEPLOY || "true") === "true") {
    throw new Error("Atualização online desativada neste ambiente. Atualize as bases antes de publicar.");
  }

  const refreshUrl = import.meta.env.VITE_ESTRADAS_REFRESH_URL || "/api/estradas/refresh";

  const response = await fetch(refreshUrl, {
    method: "POST",
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Falha ao atualizar bases (${response.status})`);
  }

  return response.json().catch(() => ({}));
}
