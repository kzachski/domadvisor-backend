/* =====================================================================
   DomAdvisor Premium Backend v4.0 – STRICT REPORT MODE
   Zero MENU_START w PDF • OpenAI Responses API • Serper.dev
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
   🌐 SERPER.DEV – Pobieranie danych rynkowych
   ===================================================================== */
async function getLiveMarketData(location) {
  try {
    const response = await axios.get("https://google.serper.dev/search", {
      headers: { "X-API-KEY": process.env.SERPER_API_KEY },
      params: {
        q: `ceny mieszkań ${location} średnia cena m2 SonarHome Adresowo Nieruchomosci-online dane 2024 2025`,
        num: 7
      }
    });

    const organic = response.data.organic || [];
    let formatted = "";

    organic.forEach((r, i) => {
      formatted += `\n${i + 1}. ${r.title || ""}\n${r.snippet || ""}\nŹródło: ${
        r.link || ""
      }\n`;
    });

    return formatted || "Brak danych rynkowych.";
  } catch (err) {
    console.error("Serper error:", err);
    return "Brak danych rynkowych.";
  }
}

/* =====================================================================
   🧠 SYSTEM PROMPT — v4.0 (pełen, naprawiony, bez duplikatów)
   STRICT_REPORT_MODE = ZAKAZ MENU_START
   ===================================================================== */
let systemPrompt = String.raw`
============================================================
DOMADVISOR PREMIUM – SYSTEM PROMPT v4.0 MASTER
============================================================

UWAGA – TRYB STRICT_REPORT_MODE:
W tym zadaniu absolutnie NIE WOLNO generować:
– MENU_START
– żadnych elementów menu
– instrukcji nawigacji
– komunikatów systemowych

Masz wygenerować PEŁNY RAPORT 9000–15000 znaków,
zgodnie ze strukturą 1–7. Nawet jeśli dane wejściowe są niepełne,
stosujesz interpolację + dane z Serper.dev.

============================================================
TOŻSAMOŚĆ
============================================================
Zespół DomAdvisor AI:
– Jakub – analiza finansowa, ROI, cap rate, DSCR, flipy, koszty
– Magdalena – architektura, estetyka, układ, liftingi A/B/C

Styl:
– premium konsultingowy
– poważny, zero emocji
– zero list punktowych w wersji PDF
– pełne akapity

============================================================
STRUKTURA RAPORTU (OBOWIĄZKOWA)
============================================================
1. Streszczenie / Dane ogólne
2. Analiza finansowa (Jakub)
3. Analiza funkcjonalno-estetyczna (Magdalena)
4. Ryzyka
5. Rekomendacja końcowa
6. Plan 30/60/90 dni
7. Źródła danych i metodologia

Każda sekcja minimum 2 akapity.

============================================================
MODELE FINANSOWE — WZORY
============================================================
price_per_m2 = cena / metraż
cap_rate = (przychód_netto_roczny / cena_zakupu) × 100%
cash_on_cash = (roczny_cashflow / wkład_własny) × 100%
ROI_flip = (sprzedaż - (zakup + remont + koszty)) / (zakup + remont + koszty)
DSCR = NOI / roczna_rata_kredytu

============================================================
PROGI DECYZYJNE
============================================================
– cena: ≤ średnia + 10% = OK
– cap rate ≥ 5,5%
– cash-on-cash ≥ 8%
– DSCR ≥ 1,25
– ROI flip ≥ 12%

============================================================
ZAKOŃCZENIE (OBOWIĄZKOWE)
============================================================
Raport musi kończyć się sekcją:
"Źródła danych i metodologia: SonarHome, NBP, AMRON-SARFiN,
Adresowo.pl, Nieruchomosci-online.pl, dane pobrane przez backend
DomAdvisor z wyszukiwarki Google (Serper.dev). Analiza ma charakter
interpretacyjny i nie stanowi porady inwestycyjnej."

============================================================
KONIEC SYSTEM PROMPT v4.0
============================================================
`;

/* =====================================================================
   ⚙ OPENAI
   ===================================================================== */
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/* =====================================================================
   🚀 EXPRESS
   ===================================================================== */
const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: "5mb" }));

/* =====================================================================
   💬 /api/chat — skrócona wersja dialogowa
   ===================================================================== */
app.post("/api/chat", async (req, res) => {
  try {
    const { message, history } = req.body;

    const msg = [
      { role: "system", content: systemPrompt + "\nTryb: analiza skrócona." },
      ...(Array.isArray(history) ? history : []),
      { role: "user", content: message }
    ];

    const response = await openai.responses.create({
      model: "gpt-4o",
      input: msg,
      max_output_tokens: 3000,
      temperature: 0.55
    });

    const output =
      response.output_text ||
      response.output?.[0]?.content?.[0]?.text ||
      "Brak treści.";

    res.json({ success: true, response: output });
  } catch (e) {
    console.error("Chat error", e);
    res.status(500).json({ success: false, error: e.message });
  }
});

/* =====================================================================
   📧 /api/send-report — pełny raport PDF (STRICT_REPORT_MODE)
   ===================================================================== */
app.post("/api/send-report", async (req, res) => {
  try {
    const { userEmail, propertyData } = req.body;

    if (!userEmail || !propertyData) {
      return res.status(400).json({ error: "Brak danych." });
    }

    const liveData = await getLiveMarketData(propertyData.location || "");

    const messages = [
      {
        role: "system",
        content:
          systemPrompt +
          `\n\nTRYB: STRICT_REPORT_MODE — pełny raport PDF 9000–15000 znaków.\nNIE generuj menu.\nDANE RYNKOWE:\n${liveData}`
      },
      { role: "user", content: JSON.stringify(propertyData) }
    ];

    const aiResponse = await openai.responses.create({
      model: "gpt-4o",
      input: messages,
      max_output_tokens: 15000,
      temperature: 0.55
    });

    let report =
      aiResponse.output_text ||
      aiResponse.output?.[0]?.content?.[0]?.text ||
      "Brak treści.";

    report = report.replace(/[\\#*_`~]/g, "").replace(/\n{3,}/g, "\n\n");

    const pdfPath = path.join("/tmp", `DomAdvisor-${Date.now()}.pdf`);
    const doc = new PDFDocument({ margin: 50, size: "A4" });

    const fontPath = path.join(process.cwd(), "fonts", "NotoSans-Regular.ttf");
    if (fs.existsSync(fontPath)) doc.font(fontPath);

    const stream = fs.createWriteStream(pdfPath);
    doc.pipe(stream);

    doc.fontSize(22).text("DomAdvisor – Raport Ekspercki", { align: "center" });
    doc.moveDown(1);

    doc.fontSize(12).text(report, { align: "justify", lineGap: 6 });
    doc.end();

    await new Promise((r) => stream.on("finish", r));

    const transporter = nodemailer.createTransport({
      host: process.env.MAIL_HOST,
      port: 465,
      secure: true,
      auth: { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS }
    });

    await transporter.sendMail({
      from: `DomAdvisor <${process.env.MAIL_USER}>`,
      to: userEmail,
      subject: "Raport Ekspercki DomAdvisor",
      text: "Twój raport DomAdvisor Premium znajduje się w załączniku.",
      attachments: [{ filename: "Raport.pdf", path: pdfPath }]
    });

    fs.unlinkSync(pdfPath);

    res.json({ success: true, message: "Raport wysłany." });
  } catch (err) {
    console.error("PDF error", err);
    res.status(500).json({ error: err.message });
  }
});

/* =====================================================================
   TEST SERPER
   ===================================================================== */
app.get("/api/test-serper", async (req, res) => {
  const data = await getLiveMarketData("Gdańsk Przymorze");
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.send(data);
});

/* =====================================================================
   ROOT
   ===================================================================== */
app.get("/", (req, res) => {
  res.send("DomAdvisor backend v4.0 działa poprawnie.");
});

/* =====================================================================
   START
   ===================================================================== */
const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`DomAdvisor działa na porcie ${PORT}`);
});
