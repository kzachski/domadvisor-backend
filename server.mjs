/* =========================================================
   DomAdvisor Backend v5.1 — PREMIUM / ZERO CONFABULATION
   OpenAI Responses API • Serper.dev • PDF • SMTP
   ========================================================= */

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

/* =========================================================
   🌐 SERPER — pobieranie danych (TYLKO TO, NIC WIĘCEJ!)
   ========================================================= */
async function getLiveMarketData(location) {
  try {
    const r = await axios.get("https://google.serper.dev/search", {
      headers: { "X-API-KEY": process.env.SERPER_API_KEY },
      params: {
        q: `średnie ceny mieszkań ${location} 2025 analiza SonarHome Adresowo Nieruchomosci-online`,
        num: 7
      }
    });

    if (!r.data.organic || r.data.organic.length === 0) {
      return "BRAK DANYCH. Backend nie zwrócił wyników.";
    }

    return r.data.organic
      .map((x, i) => {
        return `
Wynik ${i + 1}
Tytuł: ${x.title || "brak"}
Opis: ${x.snippet || "brak"}
Źródło: ${x.link || "brak"}
`;
      })
      .join("\n");
  } catch (err) {
    console.error("Serper error:", err.message);
    return "BRAK DANYCH. Wystąpił błąd sieciowy.";
  }
}

/* =========================================================
   🧠 OpenAI 5.1 – Responses API
   ========================================================= */
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/* =========================================================
   🏛️ SYSTEM PROMPT — ZERO KONFABULACJI
   ========================================================= */
const systemPrompt = `
Jesteś DomAdvisor Premium 2025 — ekspercki duet:
Jakub (finanse, ROI, cap rate)
Magdalena (architektura, układ, ergonomia).

ZASADY ABSOLUTNE:
1) ZERO zmyślania (0%).  
2) Jeśli nie masz danych → PISZESZ WPROST: "backend nie dostarczył danych".  
3) ŻADNYCH interpolacji, żadnych zgadywań.  
4) Cytujesz WYŁĄCZNIE dane, które backend dostarczył (Serper.dev + treść ogłoszenia).  
5) Nie generujesz liczb z powietrza.  
6) Nie podajesz cen za m², jeśli nie są podane.  
7) Nie tworzysz „porównywarek”, jeśli backend nie wysłał linków.

STRUKTURA RAPORTU (OBOWIĄZKOWA):
1. Streszczenie i dane ogólne (na podstawie ogłoszenia)
2. Analiza finansowa (tylko dane z ogłoszenia + dane z backendu – bez zgadywania)
3. Analiza funkcjonalno-estetyczna
4. Ryzyka
5. Rekomendacja końcowa
6. Plan 30/60/90 dni
7. Źródła danych (stały blok)

STYL:
– długie akapity
– język ekspercki
– żadnych list, punktorów ani markdown
– żadnych liczb bez źródła
– jeśli brakuje danych → to podkreślasz

ŹRÓDŁA (jedynie dostępne):
– dane z ogłoszenia użytkownika
– wyniki z Serper.dev (opisowe)
– SonarHome / Adresowo / Nieruchomosci-online (Tylko jeśli backend je poda!)

NIE MASZ INNYCH DANYCH.
`;

/* =========================================================
   🚀 EXPRESS
   ========================================================= */
const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: "3mb" }));

/* =========================================================
   🟦 /api/chat — wersja skrócona (czat)
   ========================================================= */
app.post("/api/chat", async (req, res) => {
  try {
    const { message, history } = req.body;

    const input = [
      { role: "system", content: systemPrompt + "\nTryb skrócony (1000–1500 słów)." },
      ...(history || []),
      { role: "user", content: message }
    ];

    const ai = await openai.responses.create({
      model: "gpt-5.1",
      input,
      max_output_tokens: 3500,
      temperature: 0.35
    });

    const out =
      ai.output_text ||
      ai.output?.[0]?.content?.[0]?.text ||
      "Brak treści od AI.";

    res.json({ success: true, response: out });
  } catch (err) {
    console.error("Chat error:", err);
    res.status(500).json({ error: err.message });
  }
});

/* =========================================================
   🟥 /api/send-report — pełny PDF
   ========================================================= */
app.post("/api/send-report", async (req, res) => {
  try {
    const { userEmail, propertyData } = req.body;

    if (!userEmail || !propertyData) {
      return res.status(400).json({ error: "Brak danych wejściowych." });
    }

    const live = await getLiveMarketData(propertyData.location || "");

    const input = [
      {
        role: "system",
        content:
          systemPrompt +
          "\nTryb: RAPORT PDF – 9000–15000 znaków. Zero zmyślania.\nDANE RYNKOWE:\n" +
          live
      },
      { role: "user", content: JSON.stringify(propertyData) }
    ];

    const ai = await openai.responses.create({
      model: "gpt-5.1",
      input,
      temperature: 0.35,
      max_output_tokens: 15000
    });

    let report =
      ai.output_text ||
      ai.output?.[0]?.content?.[0]?.text ||
      "Brak treści.";

    report = report.replace(/[\\#*_`~]/g, "").replace(/\n{3,}/g, "\n\n");

    /* PDF */
    const pdfPath = path.join("/tmp", `DomAdvisor-${Date.now()}.pdf`);
    const doc = new PDFDocument({ margin: 50, size: "A4" });

    const font = path.join(process.cwd(), "fonts", "NotoSans-Regular.ttf");
    if (fs.existsSync(font)) doc.font(font);

    const stream = fs.createWriteStream(pdfPath);
    doc.pipe(stream);

    doc.fontSize(22).text("DomAdvisor – Raport Ekspercki", { align: "center" });
    doc.moveDown(1);

    doc.fontSize(12).text(report, { align: "justify", lineGap: 5 });

    doc.end();
    await new Promise((resolve) => stream.on("finish", resolve));

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
      subject: "Raport Ekspercki",
      text: "W załączniku Twój raport DomAdvisor.",
      attachments: [{ filename: "Raport.pdf", path: pdfPath }]
    });

    fs.unlinkSync(pdfPath);

    res.json({ success: true, message: "Raport wysłany." });
  } catch (err) {
    console.error("PDF error:", err);
    res.status(500).json({ error: err.message });
  }
});

/* ========================================================= */
app.get("/", (req, res) => {
  res.send("DomAdvisor backend 5.1 działa.");
});

/* START SERVERA */
const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () =>
  console.log(`DomAdvisor start: port ${PORT}`)
);
