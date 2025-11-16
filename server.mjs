// =============================================================
// 🏠 DomAdvisor Premium Backend v3.6.2 (GPT-4o Optimized)
// Single-file version (server.js) – Render-ready
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
        q: `średnie ceny mieszkań ${location} ceny m2 analiza site:sonarhome.pl OR site:adresowo.pl OR site:tabelaofert.pl OR site:nieruchomosci-online.pl`,
        num: 5,
      },
    });

    const organic = response.data.organic || [];
    let formatted = "";

    organic.forEach((r, i) => {
      formatted += `
${i + 1}. ${r.title || "Brak tytułu"}
${r.snippet || ""}
Źródło: ${r.link || "brak"}
`;
    });

    return formatted || "Brak danych";
  } catch (e) {
    return "Nie udało się pobrać danych rynkowych.";
  }
}

// =============================================================
// 🧠 SYSTEM PROMPT — DomAdvisor Premium
// =============================================================
const systemPrompt = String.raw`
DOMADVISOR – SYSTEM PROMPT v3.6.2 (GPT-4o)

ZACHOWANIE STARTOWE
Nie komentuj komunikatu powitalnego – zacznij od MENU_START.

MENU_START:
1. Analiza nieruchomości na sprzedaż
2. Analiza nieruchomości na wynajem
3. Ocena mieszkania pod flipa
4. Rekomendacja rynkowa dla inwestora
5. Optymalizacja ogłoszenia
6. Wycena + trend
7. Analiza lokalnego rynku
8. Pomoc w sprzedaży/wynajmie

Styl:
Profesjonalny, analityczny, precyzyjny. Zero marketingu, zero ozdobników.

ŹRÓDŁA:
- SonarHome.pl
- Adresowo.pl
- TabelaOfert.pl
- Nieruchomosci-online.pl
- NBP (Biuletyny Cen)
- AMRON-SARFiN

Raport musi zawierać sekcje:
1. Streszczenie
2. Analiza finansowa
3. Analiza funkcjonalna
4. Ryzyka
5. Rekomendacja
6. Plan 30/60/90 dni
7. Źródła i metodologia
`;

// =============================================================
// ⚙️ Express + OpenAI
// =============================================================
const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: "2mb" }));

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// =============================================================
// 💬 ENDPOINT: /api/chat – skrócona analiza
// =============================================================
app.post("/api/chat", async (req, res) => {
  try {
    const { message, history } = req.body;

    const messages = [
      { role: "system", content: systemPrompt + "
Tryb: Skrócona analiza (1000–1500 słów)." },
      ...(Array.isArray(history) ? history : []),
      { role: "user", content: message }
    ];

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages,
      temperature: 0.6,
      max_output_tokens: 1400
    });

    const out = completion.choices[0].message.content;

    res.json({ success: true, response: out });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

// =============================================================
// 📧 ENDPOINT: /api/send-report – pełny raport PDF
// =============================================================
app.post("/api/send-report", async (req, res) => {
  try {
    const { userEmail, propertyData } = req.body;
    if (!userEmail || !propertyData)
      return res.status(400).json({ error: "Brak danych" });

    const liveData = await getLiveMarketData(propertyData.location || "lokalizacja nieznana");

    const now = new Date();
    const month = now.toLocaleString("pl-PL", { month: "long" });
    const year = now.getFullYear();

    const messages = [
      {
        role: "system",
        content: `${systemPrompt}

DANE RYNKOWE ONLINE:
${liveData}

Tryb: Pełny raport PDF Premium (9000–12000 znaków).`
      },
      { role: "user", content: JSON.stringify(propertyData) }
    ];

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages,
      temperature: 0.55,
      max_output_tokens: 8000
    });

    let report = completion.choices[0].message.content || "Brak treści";

    // =============================================================
    // 📝 PDF (wersja PREMIUM)
    // =============================================================
    const pdfPath = path.join("/tmp", `DomAdvisor-Raport-${Date.now()}.pdf`);
    const doc = new PDFDocument({ margin: 50, size: "A4" });

    const fontPath = path.join(process.cwd(), "fonts", "NotoSans-Regular.ttf");
    if (fs.existsSync(fontPath)) doc.font(fontPath);

    const writeStream = fs.createWriteStream(pdfPath);
    doc.pipe(writeStream);

    // HEADER
    doc.fontSize(22).text("DomAdvisor – Raport Ekspercki", { align: "center" });
    doc.moveDown(0.3);
    doc.fontSize(11).fillColor("#444").text(`Wersja Premium • ${month} ${year}`, { align: "center" });
    doc.moveDown(1);

    // Formatowanie premium — nagłówki
    report = report
      .replace(/
###? (.*)/g, (m, title) => `

${title.toUpperCase()}
`) // konwersja markdown → sekcje
      .replace(/[#*_`]/g, "");

    doc.fillColor("#000").fontSize(12).text(report, {
      align: "justify",
      lineGap: 5
    });

    doc.end();
    await new Promise(r => writeStream.on("finish", r));

    // =============================================================
    // ✉️ Wysyłanie e-mail
    // =============================================================
    const transporter = nodemailer.createTransport({
      host: process.env.MAIL_HOST,
      port: 465,
      secure: true,
      auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASS
      },
    });

    await transporter.sendMail({
      from: `DomAdvisor <${process.env.MAIL_USER}>`,
      to: userEmail,
      subject: `Raport Ekspercki DomAdvisor – ${month} ${year}`,
      text: "Dziękujemy za skorzystanie z DomAdvisor Premium. Raport znajduje się w załączniku.",
      attachments: [{ filename: "DomAdvisor-Raport.pdf", path: pdfPath }]
    });

    fs.unlinkSync(pdfPath);

    res.json({ success: true, message: "Raport wysłany." });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// =============================================================
// 🧪 Test Serper
// =============================================================
app.get("/api/test-serper", async (req, res) => {
  const data = await getLiveMarketData("Gdańsk Żabianka");
  res.send(data);
});

// =============================================================
// 🟢 Root
// =============================================================
app.get("/", (req, res) => {
  res.send("DomAdvisor backend działa poprawnie.");
});

// =============================================================
// 🚀 Start
// =============================================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`DomAdvisor działa na porcie ${PORT}`));
