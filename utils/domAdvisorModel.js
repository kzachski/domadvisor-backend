// =========================================================
// 🧠 DOMADVISOR MODEL (Algorytm Estymacji Cen)
// =========================================================
// Ładuje dane z /data/baseRegions.json i generuje szacunkowy
// zakres cen rynkowych dla wskazanej lokalizacji i standardu.
// =========================================================

import fs from "fs";
import path from "path";

/**
 * Funkcja główna — zwraca zakres cenowy dla danej lokalizacji
 * @param {string} city - nazwa miasta, np. "Gdańsk"
 * @param {string} district - dzielnica, np. "Wrzeszcz"
 * @param {string} standard - "niski", "średni" lub "wysoki"
 * @returns {object} { min, max, avg }
 */
export function estimatePriceRange(city, district, standard = "średni") {
  try {
    const dataPath = path.join(process.cwd(), "data", "baseRegions.json");
    const jsonData = JSON.parse(fs.readFileSync(dataPath, "utf-8"));

    let base;
    if (jsonData[city] && jsonData[city][district]) {
      base = jsonData[city][district];
    } else if (jsonData[city]) {
      // Jeśli nie znaleziono dzielnicy, użyj średniej miejskiej
      const values = Object.values(jsonData[city]);
      const avgMin = values.reduce((sum, v) => sum + v.min, 0) / values.length;
      const avgMax = values.reduce((sum, v) => sum + v.max, 0) / values.length;
      base = { min: avgMin, max: avgMax };
    } else {
      // W ostateczności użyj średniej krajowej
      base = jsonData["Polska"];
    }

    // Korekty standardu mieszkania
    const multiplier =
      standard === "wysoki" ? 1.08 :
      standard === "niski" ? 0.93 : 1.0;

    const min = Math.round(base.min * multiplier);
    const max = Math.round(base.max * multiplier);
    const avg = Math.round((min + max) / 2);

    return { min, max, avg };
  } catch (error) {
    console.error("Błąd wczytywania danych:", error);
    return { min: 0, max: 0, avg: 0 };
  }
}
