// js/gemini-api.js
const API_BASE = "https://threem2502.pythonanywhere.com";

export async function askGemini(question) {
  try {
    const res = await fetch(`${API_BASE}/history-chat?isStream=false`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question }),
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      try {
        const j = JSON.parse(txt);
        return { ok: false, error: j.error || res.statusText };
      } catch {
        return { ok: false, error: txt || res.statusText };
      }
    }

    const data = await res.json().catch(() => ({}));
    if (data && data.ok && typeof data.answer === "string") {
      return { ok: true, answer: data.answer };
    }
    return { ok: false, error: data?.error || "Không có câu trả lời." };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
}

export async function analyzeImage(file) {
  try {
    const form = new FormData();
    form.append("file", file);

    const res = await fetch(`${API_BASE}/vision-detect?isStream=false`, {
      method: "POST",
      body: form,
    });
    const data = await res.json();
    return data;
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

export async function analyzePdf(file, question) {
  try {
    const form = new FormData();
    form.append("file", file);
    form.append("question", question);

    const res = await fetch(`${API_BASE}/pdf-qa?isStream=false`, {
      method: "POST",
      body: form,
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      try {
        const j = JSON.parse(txt);
        return { ok: false, error: j.error || res.statusText };
      } catch {
        return { ok: false, error: txt || res.statusText };
      }
    }

    const data = await res.json().catch(() => ({}));
    if (data && data.ok && typeof data.answer === "string") {
      return { ok: true, answer: data.answer };
    }
    return { ok: false, error: data?.error || "Không có câu trả lời." };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
}