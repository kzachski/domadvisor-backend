// =============================================================
// 🏠 DomAdvisor Premium Backend v3.6.6 (GPT-4o • NEW OpenAI API)
// Single-file backend — fully compatible with Render + Node 22
// =============================================================

import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import OpenAI from "openai";
import dotenv from "dotenv";
import nodemailer from "nodemailer";
import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";
import axios from "axios";

dotenv.config();

// =============================================================
// 🌐 Serper.dev — pobieranie danych rynkowych
// =============================================================
async function getLiveMarketData(location) {
  try {
    const response = await axios.get("https://google.serper.dev/search", {
      headers: { "X-API-KEY": process.env.SERPER_API_KEY },
      params: {
        q: `średnie ceny mieszkań ${location} analiza ceny m2 site:sonarhome.pl OR site:adresowo.pl OR site:tabelaofert.pl OR site:nieruchomosci-online.pl`,
        num: 5
      }
    });

    const organic = response.data.organic || [];
    let formatted = "";

    organic.forEach((r, i) => {
      formatted += `\n${i + 1}. ${r.title || "Brak tytułu"}\n${r.snippet || ""}\nŹródło: ${r.link || "brak"}\n`;
    });

    return formatted || "Brak danych";
  } catch {
    return "Nie udało się pobrać danych rynkowych.";
  }
}

// =============================================================
// 🧠 SYSTEM PROMPT (DomAdvisor Premium)
// =============================================================
const systemPrompt = String.raw`
DOMADVISOR – SYSTEM PROMPT v3.6.6 (GPT-4o)

MENU_START:
1. Analiza nieruchomości na sprzedaż
2. Analiza nieruchomości na wynajem
3. Ocena mieszkania pod flipa
4. Rekomendacja rynkowa dla inwestora
5. Optymalizacja ogłoszenia
6. Wycena + trend
7. Analiza lokalnego rynku
8. Pomoc w sprzedaży / wynajmie

Styl:
- ekspercki
- analityczny
- precyzyjny
- zero marketingu

Źródła:
- SonarHome, Adresowo, TabelaOfert, Nieruchomosci-online
- NBP, AMRON-SARFiN

Struktura raportu:
1. Streszczenie
2. Analiza finansowa
3. Analiza funkcjonalna
4. Ryzyka
5. Rekomendacja
6. Plan 30/60/90
7. Źródła + metodologia
`;

// =============================================================
// ⚙️ Express + OpenAI NEW API
// =============================================================
const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: "3mb" }));

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// =============================================================
// 💬 /api/chat — Skrócony raport (chat mode)
// =============================================================
app.post("/api/chat", async (req, res) => {
  try {
    const { message, history } = req.body;

    const messages = [
      { role: "system", content: systemPrompt + "\nTryb: Skrócona analiza (1000–1500 słów)." },
      ...(Array.isArray(history) ? history : []),
      { role: "user", content: message }
    ];

    const response = await openai.responses.create({
      model: "gpt-4o",
      input: messages,
      temperature: 0.6,
      max_output_tokens: 1500
    });

    res.json({ success: true, response: response.output_text });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// =============================================================
// 📧 /api/send-report — Pełny PDF Premium
// =============================================================
app.post("/api/send-report", async (req, res) => {
  try {
    const { userEmail, propertyData } = req.body;

    if (!userEmail || !propertyData)
      return res.status(400).json({ error: "Brak danych wejściowych." });

    const liveData = await getLiveMarketData(propertyData.location || "nieznana lokalizacja");

    const now = new Date();
    const month = now.toLocaleString("pl-PL", { month: "long" });
    const year = now.getFullYear();

    const messages = [
      {
        role: "system",
        content: `${systemPrompt}

📡 DANE RYNKOWE ONLINE:
${liveData}

Tryb: Pełny raport PDF (9000–12000 znaków).`
      },
      { role: "user", content: JSON.stringify(propertyData) }
    ];

    const response = await openai.responses.create({
      model: "gpt-4o",
      input: messages,
      temperature: 0.55,
      max_output_tokens: 8000
    });

    let report = response.output_text || "Brak treści raportu.";

    // =============================================================
    // PDF GENERATION
    // =============================================================
    const pdfPath = path.join("/tmp", `DomAdvisor-Raport-${Date.now()}.pdf`);
    const doc = new PDFDocument({ margin: 50, size: "A4" });
    const stream = fs.createWriteStream(pdfPath);
    doc.pipe(stream);

    // Header
    doc.fontSize(22).text("DomAdvisor – Raport Ekspercki", { align: "center" });
    doc.moveDown(0.5);
    doc.fontSize(11).fillColor("#555")
      .text(`Wersja Premium • ${month} ${year}`, { align: "center" });
    doc.moveDown(1);

    // Cleanup markdown
    report = report
      .replace(/\n###? (.*)/g, (_, t) => `\n\n${t.toUpperCase()}\n`)
      .replace(/[#*_`]/g, "");

    doc.fillColor("#000").fontSize(12).text(report, {
      align: "justify",
      lineGap: 6
    });

    doc.end();

    await new Promise((resolve) => stream.on("finish", resolve));

    // =============================================================
    // SEND EMAIL
    // =============================================================
    const transporter = nodemailer.createTransport({
      host: process.env.MAIL_HOST,
      port: 465,
      secure: true,
      auth: { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS }
    });

    await transporter.sendMail({
      from: `DomAdvisor <${process.env.MAIL_USER}>`,
      to: userEmail,
      subject: `Raport Ekspercki DomAdvisor – ${month} ${year}`,
      text: "Dziękujemy za skorzystanie z DomAdvisor Premium. Raport PDF znajduje się w załączniku.",
      attachments: [{ filename: "DomAdvisor-Raport.pdf", path: pdfPath }]
    });

    fs.unlinkSync(pdfPath);

    res.json({ success: true, message: "Raport wysłany na mail." });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// =============================================================
// 🧪 Test Serper
// =============================================================
app.get("/api/test-serper", async (req, res) => {
  res.send(await getLiveMarketData("Gdańsk Żabianka"));
});

// =============================================================
// 🌍 Root Endpoint
// =============================================================
app.get("/", (req, res) => {
  res.send("DomAdvisor backend działa poprawnie.");
});

// =============================================================
// 🚀 Start Server
// =============================================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`DomAdvisor działa na porcie ${PORT}`));
