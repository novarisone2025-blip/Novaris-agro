const API_URL = import.meta.env.VITE_API_URL || (window.location.port === "8000" ? "" : "http://127.0.0.1:8000");

export async function api(path, options = {}) {
  const token = localStorage.getItem("novaris_token");
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (response.status === 204) return null;
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && token) {
      localStorage.removeItem("novaris_token");
      window.dispatchEvent(new Event("novaris:logout"));
    }
    throw new Error(body.detail || "Não foi possível concluir a operação.");
  }
  return body;
}

export async function downloadReport(kind, format) {
  const token = localStorage.getItem("novaris_token");
  const response = await fetch(`${API_URL}/reports/${kind}.${format}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error("Não foi possível gerar o relatório.");
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${kind}.${format}`;
  link.click();
  URL.revokeObjectURL(url);
}

export async function authenticatedBlob(path) {
  const token = localStorage.getItem("novaris_token");
  const response = await fetch(`${API_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error("Não foi possível abrir o arquivo.");
  return URL.createObjectURL(await response.blob());
}
