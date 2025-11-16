/* =====================================================================
   DomAdvisor Premium Backend v4.2 – Production Build
   SIMPLE SYSTEM PROMPT • STRICT REPORT TEMPLATE • PDF • MAIL • Serper.dev
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
   SYSTEM PROMPT — KRÓTKI, STABILNY, PRODUKCYJNY
   ===================================================================== */

const systemPrompt = String.raw`
Jesteś DomAdvisor AI – zespołem dwóch ekspertów:

Jakub – analityk finansowy:
• analizy cenowe
• mediany rynkowe
• cap rate, ROI, cashflow
• ryzyka finansowe
• interpretacja danych NBP/AMRON

Magdalena – architekt i home-stager:
• układ, ergonomia, komunikacja
• światło i ekspozycja
• standard techniczny i estetyczny
• liftingi A/B/C w realnych widełkach kosztów
• wpływ estetyki na wartość

Ton:
• ekspercki, konsultingowy (EY/JLL)
• chłodny, precyzyjny, bez emocji
• brak marketingu, brak kolokwializmów
• wyłącznie pełne akapity, brak jakiejkolwiek formy list
• zero konfabulacji – interpretujesz wyłącznie dane użytkownika i dane rynkowe

Zasady:
• nie wymyślasz danych
• stosujesz interpolację tylko gdy brak danych (miasto ±5–8%, NBP/AMRON)
• nie podajesz adresów, nazwisk, KW ani danych wrażliwych
• piszesz jako „my”
`;

/* =====================================================================
   STRICT REPORT TEMPLATE – 7 SEKCJI PREMIUM
   ===================================================================== */

const TEMPLATE_STRICT_REPORT = String.raw`
TRYB: STRICT_REPORT_MODE.
Wygeneruj pełny raport długości 9000–15000 znaków.
Wyłącznie pełne akapity. Zero punktorów. Zero markdown.

Raport musi mieć dokładnie 7 sekcji:

1. STRESZCZENIE / DANE OGÓLNE  
Pełny opis nieruchomości, lokalizacja zamaskowana do poziomu dzielnicy, metraż, układ, piętro, budynek, ekspozycja, stan, standard.  
Opisowo przedstaw parametry techniczne mieszkania (tabela – opisowo).

2. ANALIZA FINANSOWA (Jakub)  
Porównanie ceny ofertowej z medianami (NBP, AMRON, dane ofertowe).  
Analiza ceny m², analiza opłacalności, cap rate, cashflow, ROI flip, scenariusze inwestycyjne.  
Gdy brak danych lokalnych → jawna interpolacja.

3. ANALIZA FUNKCJONALNO-ESTETYCZNA (Magdalena)  
Układ, ergonomia, komunikacja, światło, ekspozycja, kuchnia, łazienki, standard techniczny.  
LIFTING A/B/C: realne widełki kosztowe i wpływ na wartość.

4. RYZYKA  
Minimum dwa akapity.  
Ryzyka techniczne, rynkowe, prawne, finansowe – adekwatne do oferty.

5. REKOMENDACJA KOŃCOWA  
Kup / Negocjuj / Odpuść – z pełnym uzasadnieniem.  
Rekomendowana cena docelowa, argumentacja.

6. PLAN 30 / 60 / 90 DNI  
Trzy akapity opisowe (bez list).  
30 dni: dokumenty, analizy, due diligence.  
60 dni: zakup / remont / przygotowania.  
90 dni: finalizacja, wejście na rynek, stabilizacja.

7. ŹRÓDŁA DANYCH I METODOLOGIA  
Zakończ dokładnie tym blokiem:

Źródła danych i metodologia:
SonarHome
NBP
AMRON-SARFiN
Adresowo.pl
Nieruchomosci-online.pl
Dane pobrane przez backend DomAdvisor z wyszukiwarki Google (Serper.dev).
Analiza ma charakter interpretacyjny i nie stanowi porady inwestycyjnej.

Zakazy:
– brak wypunktowań
– brak markdown
– brak myślników
– tylko akapity
– zero skracania
– zero ogólników
`;

/* =====================================================================
   🌐 Serper.dev – pobieranie danych
   ===================================================================== */

async function getLiveMarketData(location) {
  try {
    const response = await axios.get("https://google.serper.dev/search", {
      headers: { "X-API-KEY": process.env.SERPER_API_KEY },
      params: { q: `ceny mieszkań ${location} analiza 2024 2025 SonarHome`, num: 7 }
    });

    const organic = response.data.organic || [];
    let formatted = "";

    organic.forEach((r, i) => {
      formatted += `\n${i + 1}. ${r.title || ""}\n${r.snippet || ""}\nŹródło: ${r.link || ""}\n`;
    });

    return formatted || "Brak danych rynkowych.";
  } catch (err) {
    console.error("Serper error:", err);
    return "Brak danych rynkowych.";
  }
}

/* =====================================================================
   ⚙️ OpenAI – Responses API
   ===================================================================== */

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/* =====================================================================
   🚀 Express
   ===================================================================== */

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: "5mb" }));

/* =====================================================================
   💬 /api/chat – analiza skrócona
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
      max_output_tokens: 3500,
      temperature: 0.55
    });

    const out = ai.output_text ||
                ai.output?.[0]?.content?.[0]?.text ||
                "Brak treści od modelu.";

    res.json({ success: true, response: out });
  } catch (err) {
    console.error("Chat error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/* =====================================================================
   📧 /api/send-report – pełny raport PDF
   ===================================================================== */

app.post("/api/send-report", async (req, res) => {
  try {
    const { userEmail, propertyData } = req.body;

    if (!userEmail || !propertyData) {
      return res.status(400).json({ error: "Brak danych wejściowych." });
    }

    const liveData = await getLiveMarketData(propertyData.location || "");

    const input = [
      {
        role: "system",
        content:
          systemPrompt +
          "\n\n" +
          TEMPLATE_STRICT_REPORT +
          "\n\nDANE RYNKOWE ONLINE:\n" +
          liveData
      },
      { role: "user", content: JSON.stringify(propertyData) }
    ];

    const ai = await openai.responses.create({
      model: "gpt-4o",
      input,
      temperature: 0.5,
      max_output_tokens: 15000
    });

    let report = ai.output_text ||
                 ai.output?.[0]?.content?.[0]?.text ||
                 "Brak treści od modelu.";

    report = report.replace(/[\\#*_`~]/g, "").replace(/\n{3,}/g, "\n\n");

    /* PDF GENERATION */
    const pdfPath = path.join("/tmp", `DomAdvisor-${Date.now()}.pdf`);
    const doc = new PDFDocument({ margin: 50, size: "A4" });

    const fontPath = path.join(process.cwd(), "fonts", "NotoSans-Regular.ttf");
    if (fs.existsSync(fontPath)) doc.font(fontPath);

    const stream = fs.createWriteStream(pdfPath);
    doc.pipe(stream);

    doc.fontSize(22).text("DomAdvisor – Raport Ekspercki", { align: "center" });
    doc.moveDown(1);

    doc.fontSize(12).text(report, { align: "justify", lineGap: 5 });

    doc.end();
    await new Promise((res) => stream.on("finish", res));

    /* EMAIL */
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
      text: "W załączniku znajduje się Twój raport.",
      attachments: [{ filename: "Raport.pdf", path: pdfPath }]
    });

    fs.unlinkSync(pdfPath);

    res.json({ success: true, message: "Raport wysłany." });
  } catch (err) {
    console.error("Raport PDF error:", err);
    res.status(500).json({ error: err.message });
  }
});

/* =====================================================================
   ROOT
   ===================================================================== */

app.get("/", (req, res) => {
  res.send("DomAdvisor backend v4.2 działa poprawnie.");
});

/* =====================================================================
   START SERVERA
   ===================================================================== */

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`DomAdvisor backend działa na porcie ${PORT}`);
});
