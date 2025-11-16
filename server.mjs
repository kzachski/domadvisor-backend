// ==========================================================
// DomAdvisor Premium Backend v5.1 (Anti-Confab, Stable)
// Model: gpt-5.1
// PUBLIC DATA ONLY • ZERO GUESSING • STRICT REPORT MODE
// ==========================================================

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

// ==========================================================
// 🌐 SERPER.DEV — POBIERANIE PRAWDZIWYCH DANYCH
// (zero wymyślania — model otrzymuje to 1:1)
// ==========================================================
async function getLiveMarketData(location) {
  try {
    const response = await axios.get("https://google.serper.dev/search", {
      headers: { "X-API-KEY": process.env.SERPER_API_KEY },
      params: {
        q: `ceny mieszkań ${location} 2024 2025 SonarHome Adresowo Nieruchomosci-online`,
        num: 10,
      }
    });

    if (!response.data.organic) return "Brak danych rynkowych.";

    return response.data.organic
      .map((r, i) => {
        return `${i + 1}. ${r.title || ""}
${r.snippet || ""}
Źródło: ${r.link || ""}
`;
      })
      .join("\n");
  } catch (err) {
    console.error("Serper error:", err);
    return "Brak danych rynkowych.";
  }
}

// ==========================================================
// ⚙️ OPENAI — GPT-5.1
// ==========================================================
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ==========================================================
// 🚀 EXPRESS
// ==========================================================
const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: "5mb" }));

// ==========================================================
// 🛑 ANTI-CONFAB MIDDLEWARE
// Chroni przed zmyślaniem i błędami logicznymi
// ==========================================================
function sanitizeAIOutput(text) {
  if (!text) return "";

  // usuwa markdown, emoji i formatowanie nieciągłe
  return text
    .replace(/[#*_`~]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
const systemPrompt = String.raw`
DOMADVISOR PREMIUM — SYSTEM PROMPT v5.1 ANTI-CONFAB (2025)

============================================================
IDENTYFIKACJA I TONY
============================================================
Jesteśmy zespołem dwóch ekspertów:

Jakub — analityk finansowy (ROI, cap rate, cashflow, negocjacje, koszty).
Magdalena — architekt i home-stager (układ, ergonomia, estetyka, liftingi).

Pisz w pierwszej osobie liczby mnogiej. 
Styl: EY/JLL. Zero marketingu, zero emocji, zero lania wody.

============================================================
ZASADA GŁÓWNA — ZERO ZGADYWANIA
============================================================
Model NIE MOŻE:
- wymyślać cen m²,
- wymyślać danych o rynku,
- wymyślać dodatkowych ogłoszeń,
- tworzyć własnych przedziałów cenowych,
- używać liczb, jeśli nie pochodzą z:
  • użytkownika,
  • Serper.dev,
  • SonarHome (publiczne),
  • NBP (dane transakcyjne),
  • AMRON-SARFiN,
  • Adresowo / Nieruchomosci-online / TabelaOfert.

Jeśli jakiejś liczby NIE MA w danych → NIE WOLNO jej tworzyć.

Jeśli w Serper snippets nie ma cen → ZAWSZE stosujesz interpolację.

============================================================
ZASADA INTERPOLACJI PREMIUM
============================================================
Jeśli brakuje ceny/m2 dla dzielnicy:
- używamy mediany MIASTA (NBP i AMRON),
- korekta ±5–8% jeśli to uzasadnione,
- musisz wpisać zdanie:

"Brak lokalnych danych → zastosowano interpolację w oparciu o mediany miasta oraz najnowsze dane NBP/AMRON."

============================================================
DANE Z SERPER.DEV — TYLKO OPISUJESZ TO, CO DOSTAŁEŚ
============================================================
Model dostaje „DANE RYNKOWE ONLINE:” — w formie surowej.
Model może:
- opisać te dane,
- porównać,
- użyć liczb z tekstów, jeśli występują,
- wskazać brak cen.

Model NIE MOŻE:
- rozszerzać,
- dopowiadać,
- wymyślać linków/kwot,
- generować dodatkowych ofert.

============================================================
STRUKTURA PEŁNEGO RAPORTU (MUSI BYĆ ZACHOWANA)
============================================================
Każdy pełny raport PDF (endpoint /send-report) musi mieć:

1. STRESZCZENIE / DANE OGÓLNE  
2. ANALIZA FINANSOWA (Jakub)  
3. ANALIZA FUNKCJONALNO-ESTETYCZNA (Magdalena)  
4. RYZYKA  
5. REKOMENDACJA KOŃCOWA  
6. PLAN 30/60/90 DNI  
7. ŹRÓDŁA DANYCH I METODOLOGIA  

Wszystkie sekcje min. 2 akapity.  
Zero list punktowanych, zero markdown.

============================================================
WERSJA CHAT — SKRÓCONA
============================================================
Dla endpointu /api/chat:
- 1000–1500 słów,
- nadal ekspercki styl,
- można skracać, ale nie wolno zgadywać.

============================================================
ANALIZA FINANSOWA — ZASADY
============================================================
Jakub musi:
- wyliczyć cenę/m² tylko jeśli cena i metraż są podane,
- porównać do danych NBP/AMRON/Sonar,
- wskazać różnice trendów,
- liczyć cap rate wyłącznie na podstawie KWOT podanych w ogłoszeniu lub realnych stawek najmu (jeśli są w Serper),
- NIE MOŻE użyć żadnej stawki czynszu, jeżeli nie ma jej w danych,
- używa interpolacji przy braku danych.

============================================================
ANALIZA FUNKCJONALNO-ESTETYCZNA
============================================================
Magdalena:
- ocenia układ, komunikację, światło,
- opisuje warianty liftingów A/B/C,
- kosztorysy muszą być realne, ale nie wymyślone liczby — bazują na widełkach rynkowych (600–1800 zł/m²), bez skrajności,
- zero opisów marketingowych.

============================================================
RYZYKA
============================================================
Zawsze min. 2 akapity:
- ryzyka techniczne,
- ryzyka finansowe,
- ryzyka prawne (ale bez zgadywania KW).

============================================================
REKOMENDACJA KOŃCOWA
============================================================
Opcje:
- Kup,
- Kup po negocjacji,
- Odradzamy.

Rekomendacja musi być oparta na realnych danych, nie domysłach.

============================================================
PLAN 30/60/90 DNI
============================================================
W oparciu o cel użytkownika (zakup, najem, flip).

============================================================
ŹRÓDŁA — BLOK KOŃCOWY (STAŁY, NIE ZMIENIAĆ)
============================================================
Źródła danych i metodologia:
SonarHome  
NBP  
AMRON-SARFiN  
Adresowo.pl  
Nieruchomosci-online.pl  
Dane pobrane przez backend DomAdvisor z wyszukiwarki Google (Serper.dev).  
Analiza ma charakter interpretacyjny i nie stanowi porady inwestycyjnej.
`
/* =========================================================
   DOMADVISOR PREMIUM BACKEND v5.1 (2025)
   GPT-5.1-instant • Serper.dev • PDF • E-mail (SMTP)
   Anti-Confab Mode — Stable Release
   ========================================================= */

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

/* =========================================================
   🌐 FUNKCJA: Pobieranie danych rynkowych z Serper.dev
   ========================================================= */
async function getLiveMarketData(location) {
  try {
    const response = await axios.get("https://google.serper.dev/search", {
      headers: { "X-API-KEY": process.env.SERPER_API_KEY },
      params: {
        q: `ceny mieszkań ${location} analiza rynku SonarHome Adresowo Nieruchomosci-online`,
        num: 7,
      },
    });

    const organic = response.data.organic || [];

    let txt = "";
    organic.forEach((r, i) => {
      txt += `\n${i + 1}. ${r.title || ""}\n${r.snippet || ""}\nŹródło: ${
        r.link || ""
      }\n`;
    });

    return txt || "Brak danych rynkowych.";
  } catch (err) {
    console.error("❌ Serper error:", err.message);
    return "Brak danych rynkowych.";
  }
}

/* =========================================================
   🧠 OpenAI Client (GPT-5.1-instant)
   ========================================================= */
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/* =========================================================
   🚀 Express
   ========================================================= */
const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: "5mb" }));

/* =========================================================
   💬 /api/chat — wersja skrócona (1000–1500 słów)
   ========================================================= */
app.post("/api/chat", async (req, res) => {
  try {
    const { message, history } = req.body;

    const messages = [
      { role: "system", content: systemPrompt + "\nTRYB: ANALIZA SKRÓCONA 1000–1500 słów. Zero zgadywania." },
      ...(Array.isArray(history) ? history : []),
      { role: "user", content: message },
    ];

    const ai = await openai.responses.create({
      model: "gpt-4.1",
      input: messages,
      max_output_tokens: 3500,
      temperature: 0.5,
    });

    const out = ai.output_text || ai.output?.[0]?.content?.[0]?.text || "Brak odpowiedzi.";

    res.json({ success: true, response: out });
  } catch (err) {
    console.error("❌ Chat error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/* =========================================================
   📧 /api/send-report — pełny raport PDF (9000–15000 znaków)
   ========================================================= */
app.post("/api/send-report", async (req, res) => {
  try {
    const { userEmail, propertyData } = req.body;

    if (!userEmail || !propertyData)
      return res.status(400).json({ error: "Brak danych wejściowych." });

    /* 🌐 Dane z Serper.dev */
    const liveData = await getLiveMarketData(propertyData.location || "");

    /* 🧠 PROMPT dla modelu */
    const messages = [
      {
        role: "system",
        content:
          systemPrompt +
          "\nTRYB: STRICT_REPORT_MODE — wygeneruj pełny raport 9000–15000 znaków. Zero zgadywania. Wykorzystuj tylko dane od użytkownika i z Serper.dev. Nie twórz żadnych liczb samodzielnie.\nDANE RYNKOWE:\n" +
          liveData,
      },
      { role: "user", content: JSON.stringify(propertyData) },
    ];

    /* 🔥 Generowanie tekstu raportu */
    const ai = await openai.responses.create({
      model: "gpt-4.1",
      input: messages,
      max_output_tokens: 15000,
      temperature: 0.4,
    });

    let report =
      ai.output_text ||
      ai.output?.[0]?.content?.[0]?.text ||
      "Brak treści od modelu.";

    /* Czyszczenie */
    report = report
      .replace(/[\\#*_`~]/g, "")
      .replace(/\n{3,}/g, "\n\n");

    /* 📄 Tworzenie PDF */
    const pdfPath = path.join("/tmp", `DomAdvisor-${Date.now()}.pdf`);
    const doc = new PDFDocument({ margin: 50, size: "A4" });
    const stream = fs.createWriteStream(pdfPath);

    const fontPath = path.join(process.cwd(), "fonts", "NotoSans-Regular.ttf");
    if (fs.existsSync(fontPath)) doc.font(fontPath);

    doc.pipe(stream);

    doc.fontSize(22).text("DomAdvisor – Raport Ekspercki", { align: "center" });
    doc.moveDown(1);

    doc.fontSize(12).text(report, {
      align: "justify",
      lineGap: 5,
    });

    doc.end();
    await new Promise((r) => stream.on("finish", r));

    /* ✉️ Wysyłka e-mail */
    const transporter = nodemailer.createTransport({
      host: process.env.MAIL_HOST,
      port: 465,
      secure: true,
      auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASS,
      },
    });

    await transporter.sendMail({
      from: `DomAdvisor <${process.env.MAIL_USER}>`,
      to: userEmail,
      subject: "Twój Raport Ekspercki DomAdvisor",
      text: "W załączniku znajduje się raport PDF.",
      attachments: [{ filename: "Raport.pdf", path: pdfPath }],
    });

    fs.unlinkSync(pdfPath);

    res.json({ success: true, message: "Raport wysłany." });
  } catch (err) {
    console.error("❌ Raport PDF error:", err);
    res.status(500).json({ error: err.message });
  }
});

/* =========================================================
   🧪 Test Serper.dev
   ========================================================= */
app.get("/api/test-serper", async (req, res) => {
  const data = await getLiveMarketData("Poznań Jeżyce");
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.send(data);
});

/* =========================================================
   ROOT
   ========================================================= */
app.get("/", (req, res) => {
  res.send("DomAdvisor backend v5.1 działa poprawnie.");
});

/* =========================================================
   START
   ========================================================= */
const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`DomAdvisor v5.1 działa na porcie ${PORT}`);
});
