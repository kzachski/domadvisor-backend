/* =====================================================================
   DomAdvisor Premium Backend v4.1 – Production Ready
   STRICT_REPORT_MODE • OpenAI Responses API • Serper.dev • PDF • Mail
   ===================================================================== */

import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import axios from "axios";
import nodemailer from "nodemailer";
import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";
import OpenAI from "openai";

dotenv.config();

/* =====================================================================
   🧠 SYSTEM PROMPT – WERSJA SKOMPRESOWANA v4.1
   (BEZPIECZNY STRING RAW – 100% bez błędów składni)
   ===================================================================== */

let systemPrompt = String.raw`
DOMADVISOR PREMIUM – SYSTEM PROMPT v4.1 STRICT MODE

Zadanie: generujesz analizy i raporty 7-sekcyjne. Styl premium consulting (EY/JLL).
Dwa głosy eksperckie: JAKUB (finanse) + MAGDALENA (architektura).
Zero emocji, zero marketingu, wyłącznie pełne akapity.

MENU_START (dokładny tekst):
Możemy przygotować dla Ciebie jedną z poniższych analiz:
1️⃣ Poszukujesz dla siebie nieruchomości – przegląd rynku i rekomendacja dopasowana do potrzeb.
2️⃣ Znalazłeś ogłoszenie nieruchomości na sprzedaż – błyskawiczna analiza finansowa i estetyczna.
3️⃣ Znalazłeś ogłoszenie nieruchomości na wynajem – analiza opłacalności i standardu.
4️⃣ Szukasz mieszkania na wynajem – przegląd rynku i rekomendacje dopasowane do Twojego budżetu.
5️⃣ Chcesz sprzedać nieruchomość – wsparcie w przygotowaniu ogłoszenia.
6️⃣ Ocena mieszkania pod flipa – koszt remontu, ROI i potencjał sprzedaży.
7️⃣ Chcesz wynająć mieszkanie, ale nie możesz znaleźć najemcy – analiza i rekomendacje optymalizacyjne.
8️⃣ Optymalizacja najmu – trzy warianty liftingów A/B/C z kosztami i wpływem na przychód.
→ Aby wrócić do menu wpisz: 0

RODO:
Maskujesz adresy do poziomu dzielnicy. Zero danych osobowych.

Źródła:
SonarHome, NBP, AMRON, Adresowo, Nieruchomosci-online,
+ dane z Google pobrane przez backend Serper.dev.

Zasada: Nie wolno wymyślać danych. Jeśli brak → stosujesz interpolację:
„Brak danych dla lokalizacji → interpolacja na podstawie median miasta i danych NBP/AMRON.”

Struktura pełnego raportu PDF (zawsze 1–7):
1. Streszczenie / Dane ogólne
2. Analiza finansowa (Jakub)
3. Analiza funkcjonalno-estetyczna (Magdalena)
4. Ryzyka
5. Rekomendacja końcowa
6. Plan 30/60/90 dni
7. Źródła danych i metodologia

Tryb STRICT_REPORT_MODE:
– 9000–15000 znaków
– wyłącznie akapity
– zero list, zero markdown, zero punktorów

Zakończenie raportu (stały blok):
„Źródła danych i metodologia:
SonarHome
NBP
AMRON-SARFiN
Adresowo.pl
Nieruchomosci-online.pl
Dane pobrane przez backend DomAdvisor z wyszukiwarki Google (Serper.dev).
Analiza ma charakter interpretacyjny i nie stanowi porady inwestycyjnej.”
`;

/* =====================================================================
   🌐 SERPER.DEV — pobieranie danych rynkowych
   ===================================================================== */

async function getLiveMarketData(location) {
  try {
    const res = await axios.get("https://google.serper.dev/search", {
      headers: { "X-API-KEY": process.env.SERPER_API_KEY },
      params: {
        q: `ceny mieszkań ${location} cena m2 SonarHome Adresowo analiza`,
        num: 7
      }
    });

    const organic = res.data.organic || [];
    let formatted = "";

    organic.forEach((r, i) => {
      formatted += `\n${i + 1}. ${r.title || ""}\n${r.snippet || ""}\nŹródło: ${
        r.link || ""
      }\n`;
    });

    return formatted || "Brak danych rynkowych.";
  } catch (e) {
    console.error("Serper error:", e);
    return "Brak danych rynkowych.";
  }
}

/* =====================================================================
   🤖 OpenAI Responses API
   ===================================================================== */

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/* =====================================================================
   🚀 Express
   ===================================================================== */

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: "5mb" }));

/* =====================================================================
   💬 /api/chat — analiza skrócona (1000–1500 słów)
   ===================================================================== */

app.post("/api/chat", async (req, res) => {
  try {
    const { message, history } = req.body;

    const input = [
      { role: "system", content: systemPrompt + "\nTRYB: ANALIZA SKRÓCONA." },
      ...(Array.isArray(history) ? history : []),
      { role: "user", content: message }
    ];

    const ai = await openai.responses.create({
      model: "gpt-4o",
      input,
      temperature: 0.55,
      max_output_tokens: 3500
    });

    const out =
      ai.output_text ||
      ai.output?.[0]?.content?.[0]?.text ||
      "Brak treści od modelu.";

    res.json({ success: true, response: out });
  } catch (err) {
    console.error("Chat error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/* =====================================================================
   📧 /api/send-report — pełny raport PDF (STRICT_REPORT_MODE)
   ===================================================================== */

app.post("/api/send-report", async (req, res) => {
  try {
    const { userEmail, propertyData } = req.body;

    if (!userEmail || !propertyData)
      return res.status(400).json({ error: "Brak danych wejściowych." });

    const liveData = await getLiveMarketData(propertyData.location || "");

    const input = [
      {
        role: "system",
        content:
          systemPrompt +
          `\nTRYB: STRICT_REPORT_MODE — pełny raport 9000–15000 znaków.
NIE WOLNO generować MENU_START.
DANE RYNKOWE:\n${liveData}`
      },
      { role: "user", content: JSON.stringify(propertyData) }
    ];

    const ai = await openai.responses.create({
      model: "gpt-4o",
      input,
      temperature: 0.5,
      max_output_tokens: 15000
    });

    let report =
      ai.output_text ||
      ai.output?.[0]?.content?.[0]?.text ||
      "Brak treści od modelu.";

    report = report.replace(/[\\#*_`~]/g, "").replace(/\n{3,}/g, "\n\n");

    const pdfPath = path.join("/tmp", `DomAdvisor-${Date.now()}.pdf`);
    const doc = new PDFDocument({ margin: 50, size: "A4" });
    const stream = fs.createWriteStream(pdfPath);

    const fontPath = path.join(process.cwd(), "fonts", "NotoSans-Regular.ttf");
    if (fs.existsSync(fontPath)) doc.font(fontPath);

    doc.pipe(stream);
    doc.fontSize(22).text("DomAdvisor – Raport Ekspercki", { align: "center" });
    doc.moveDown(1);

    doc.fontSize(12).text(report, { align: "justify", lineGap: 5 });
    doc.end();

    await new Promise((resolve) => stream.on("finish", resolve));

    const transporter = nodemailer.createTransport({
      host: process.env.MAIL_HOST,
      port: 465,
      secure: true,
      auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASS
      }
    });

    await transporter.sendMail({
      from: `DomAdvisor <${process.env.MAIL_USER}>`,
      to: userEmail,
      subject: "Raport Ekspercki DomAdvisor",
      text: "W załączniku znajduje się Twój raport.",
      attachments: [{ filename: "Raport.pdf", path: pdfPath }]
    });

    fs.unlinkSync(pdfPath);

    res.json({ success: true, message: "Raport wysłany." });
  } catch (err) {
    console.error("Raport error:", err);
    res.status(500).json({ error: err.message });
  }
});

/* =====================================================================
   Test Serper
   ===================================================================== */

app.get("/api/test-serper", async (req, res) => {
  const data = await getLiveMarketData("Poznań Jeżyce");
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.send(data);
});

/* =====================================================================
   ROOT
   ===================================================================== */

app.get("/", (req, res) => {
  res.send("DomAdvisor backend v4.1 działa poprawnie.");
});

/* =====================================================================
   START
   ===================================================================== */

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () =>
  console.log(`DomAdvisor backend running on port ${PORT}`)
);
