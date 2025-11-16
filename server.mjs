// ============================================================================
// 🏠 DOMADVISOR PREMIUM BACKEND v3.7.0 (GPT-4o • Ekstra Premium 15–20 stron)
// ============================================================================
// • 5 realnych ofert porównawczych (SonarHome / Adresowo / TabelaOfert / NOL)
// • Pełna struktura premium 1–7 (streszczenie → Jakub → Magdalena → ryzyka…)
// • PDF Premium: polskie znaki (NotoSans), nagłówki bold (styl minimalistyczny)
// • OpenAI GPT-4o (chat.completions.create — pełna jakość)
// ============================================================================

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

// ============================================================================
// 🌐 SERPER — pobieranie realnych ogłoszeń online
// ============================================================================

async function fetchOnlineListings(location) {
  try {
    const response = await axios.get("https://google.serper.dev/search", {
      headers: { "X-API-KEY": process.env.SERPER_API_KEY },
      params: {
        q: `
          mieszkanie na sprzedaż ${location} cena m2 
          site:sonarhome.pl OR site:adresowo.pl OR site:tabelaofert.pl OR site:nieruchomosci-online.pl
        `,
        num: 10
      }
    });

    const organic = response.data.organic || [];

    return organic.map(r => ({
      title: r.title || "",
      snippet: r.snippet || "",
      link: r.link || ""
    }));
  } catch (err) {
    console.error("Serper error:", err);
    return [];
  }
}

// ============================================================================
// 🔍 FILTROWANIE ofert — wybór TOP 5 najbardziej porównywalnych
// ============================================================================

function extractNumeric(value) {
  const n = parseFloat(String(value).replace(",", "."));
  return isNaN(n) ? null : n;
}

function guessStandard(txt) {
  txt = txt.toLowerCase();
  if (txt.includes("luksus") || txt.includes("premium") || txt.includes("wysoki"))
    return "wysoki";
  if (txt.includes("remont") || txt.includes("niski") || txt.includes("stary"))
    return "niski";
  return "średni";
}

function guessRooms(txt) {
  const m = txt.match(/(\d+)\s*poko/);
  return m ? parseInt(m[1]) : null;
}

function filterComparableListings(listings, subject) {
  const subjectArea = extractNumeric(subject.area);
  const subjectRooms = extractNumeric(subject.rooms);

  const result = [];

  listings.forEach(l => {
    const t = l.snippet.toLowerCase();

    const mArea = t.match(/(\d+)\s?m2/);
    const area = mArea ? parseFloat(mArea[1]) : null;

    const rooms = guessRooms(t);
    const std = guessStandard(t);

    // ±15% metrażu
    if (area && subjectArea) {
      const diff = Math.abs(area - subjectArea) / subjectArea;
      if (diff > 0.15) return;
    }

    // liczba pokoi
    if (rooms && subjectRooms && rooms !== subjectRooms) return;

    result.push({
      title: l.title,
      area,
      rooms,
      standard: std,
      link: l.link,
      snippet: l.snippet
    });
  });

  return result.slice(0, 5);
}

// ============================================================================
// 🧠 OpenAI konfig
// ============================================================================

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// ============================================================================
// ⚙️ EXPRESS — musi być TUTAJ zanim użyjemy app.post()
// ============================================================================

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: "4mb" }));

// ============================================================================
// 🧠 SYSTEM PROMPT PREMIUM 3.7.0 (15–20 stron)
// ============================================================================

const systemPromptPremium = String.raw`
DOMADVISOR — SYSTEM PROMPT v3.7.0 (Ekstra Premium • 15–20 stron)

TWOJA TOŻSAMOŚĆ:
- JAKUB — analityk finansowy
- MAGDALENA — architekt i home-stager

STYL:
- ekspercki, analityczny, precyzyjny
- zero marketingu
- zero ozdobników
- długie akapity, język doradczy (EY/PwC/JLL)

ŹRÓDŁA:
- SonarHome.pl
- Adresowo.pl
- TabelaOfert.pl
- Nieruchomosci-online.pl
- NBP — Biuletyny Cen
- AMRON-SARFiN

STRUKTURA (OBOWIĄZKOWA):
1. STRESZCZENIE
2. ANALIZA FINANSOWA (Jakub)
3. ANALIZA FUNKCJONALNA (Magdalena)
4. ANALIZA RYNKU LOKALNEGO
5. RYZYKA
6. REKOMENDACJA KOŃCOWA
7. PLAN 30/60/90
8. ŹRÓDŁA + METODOLOGIA

WYMOGI:
- 15–20 stron
- nie pomijaj żadnej sekcji
- użyj 5 ofert porównawczych dostarczonych w danych online
- wylicz: mediany, różnice cen, fair value, scenariusze roczne
`;

// ============================================================================
// 💬 /api/chat — skrócona wersja raportu (4–5 stron)
// ============================================================================

app.post("/api/chat", async (req, res) => {
  try {
    const { message } = req.body;

    const completion = await client.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.55,
      max_tokens: 2000,
      messages: [
        { role: "system", content: systemPromptPremium + "\nTryb: analiza skrócona 4–5 stron." },
        { role: "user", content: message }
      ]
    });

    res.json({
      success: true,
      response: completion.choices[0].message.content
    });

  } catch (err) {
    console.error("CHAT ERROR:", err);
    res.json({ success: false, error: err.message });
  }
});

// ============================================================================
// 📧 /api/send-report — pełny raport 15–20 stron + PDF + email
// ============================================================================

app.post("/api/send-report", async (req, res) => {
  try {
    const { userEmail, propertyData } = req.body;

    if (!userEmail || !propertyData)
      return res.status(400).json({ error: "Brak emaila lub danych ogłoszenia." });

    // 1) Pobranie ofert online
    const rawListings = await fetchOnlineListings(propertyData.location || "");
    const comparable = filterComparableListings(rawListings, propertyData);

    let comparableText = "";
    comparable.forEach((l, i) => {
      comparableText += `
${i + 1}. ${l.title}
   - Metraż: ${l.area || "brak"} m2
   - Pokoje: ${l.rooms || "brak"}
   - Standard: ${l.standard}
   - Link: ${l.link}
   - Opis: ${l.snippet}
`;
    });

    if (comparable.length === 0)
      comparableText = "Brak danych online. Użyj median SonarHome + Adresowo.";

    const now = new Date();
    const month = now.toLocaleString("pl-PL", { month: "long" });
    const year = now.getFullYear();
    const quarter = Math.ceil((now.getMonth() + 1) / 3);

    // 2) GPT-4o — pełny raport
    const completion = await client.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.55,
      max_tokens: 15000,
      messages: [
        {
          role: "system",
          content: systemPromptPremium + `

OFERTY PORÓWNAWCZE ONLINE:
${comparableText}

Użyj WSZYSTKICH powyższych ofert do analiz.
Raport ma mieć 15–20 stron, pełna struktura premium.`
        },
        {
          role: "user",
          content: JSON.stringify(propertyData, null, 2)
        }
      ]
    });

    let report = completion.choices[0].message.content || "Brak treści.";

    // 3) PDF Premium
    const pdfPath = path.join("/tmp", `DomAdvisor-${Date.now()}.pdf`);
    const doc = new PDFDocument({ size: "A4", margin: 50 });

    const fontPath = path.join(process.cwd(), "fonts", "NotoSans-Regular.ttf");
    if (fs.existsSync(fontPath)) doc.font(fontPath);

    const ws = fs.createWriteStream(pdfPath);
    doc.pipe(ws);

    // Nagłówek główny
    doc.fontSize(22).text("DomAdvisor – Raport Ekspercki PREMIUM", { align: "center" });
    doc.moveDown();
    doc.fontSize(11).fillColor("#555")
      .text(`Wersja Premium • ${month} ${year} • Q${quarter}`, { align: "center" });
    doc.moveDown(1);
    doc.fillColor("#000").fontSize(12);

    // Nagłówki sekcji
    function section(title) {
      doc.moveDown();
      doc.fontSize(16).text(title);
      doc.moveDown(0.3);
      doc.fontSize(12);
    }

    // Podział na sekcje
    const parts = report.split(/\n(?=[0-9]+\.)/g);

    parts.forEach(sec => {
      const firstLine = sec.split("\n")[0].trim();
      if (/^[0-9]+\./.test(firstLine)) {
        section(firstLine);
        doc.text(sec.replace(firstLine, "").trim(), {
          align: "justify",
          lineGap: 5
        });
      } else {
        doc.text(sec.trim(), { align: "justify", lineGap: 5 });
      }
    });

    doc.end();
    await new Promise(r => ws.on("finish", r));

    // 4) Email
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
      subject: `Raport Ekspercki DomAdvisor • ${month} ${year}`,
      text: "Dziękujemy za skorzystanie z DomAdvisor Premium. Raport znajduje się w załączniku.",
      attachments: [{ filename: "DomAdvisor-Raport.pdf", path: pdfPath }]
    });

    if (fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath);

    res.json({ success: true, message: "Raport PREMIUM został wysłany." });

  } catch (err) {
    console.error("REPORT ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// TEST + ROOT
// ============================================================================

app.get("/api/test-serper", async (req, res) => {
  const r = await fetchOnlineListings("Gdańsk Żabianka");
  res.json(r);
});

app.get("/", (req, res) => {
  res.send("DomAdvisor Premium backend v3.7.0 działa poprawnie.");
});

// ============================================================================
// 🚀 START
// ============================================================================

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("DomAdvisor Premium v3.7.0 działa na porcie " + PORT);
});
