// =========================================================
// 🏠 DOMADVISOR PREMIUM BACKEND (Final 2025 Clean Edition)
// GPT-4.1 + SMTP (home.pl) + PDF + API Chat
// =========================================================

import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import OpenAI from "openai";
import dotenv from "dotenv";
import nodemailer from "nodemailer";
import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";

// 🔐 Załaduj zmienne środowiskowe (.env)
dotenv.config();

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: "2mb" }));

// 🔑 Klucz API OpenAI z ENV
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// =========================================================
// 💬 ENDPOINT: CZAT GPT (wersja skrócona)
// =========================================================
app.post("/api/chat", async (req, res) => {
  try {
    const { message, history } = req.body;
    const messages = [
      {
        role: "system",
        content: `
DOMADVISOR — tryb premium czatowy.
Generuj skrócone raporty eksperckie (1000–1500 słów), zachowując strukturę:
1. Streszczenie / Dane ogólne
2. Analiza finansowa
3. Analiza funkcjonalno-estetyczna
4. Ryzyka
5. Rekomendacja końcowa
Ton: ekspercki, konsultacyjny, bez ozdobników, bez emotikon.`,
      },
      ...(history || []),
      { role: "user", content: message },
    ];

    const completion = await openai.chat.completions.create({
      model: "gpt-4.1",
      messages,
      max_tokens: 13000,
      temperature: 0.6,
    });

    const response = completion.choices[0].message.content;
    console.log("✅ Raport czatowy wygenerowany — długość:", response.length, "znaków");
    res.json({ success: true, response });
  } catch (error) {
    console.error("❌ Błąd API czatu:", error);
    res.json({ success: false, error: error.message });
  }
});

// =========================================================
// 📧 ENDPOINT: PEŁNY RAPORT (PDF + wysyłka e-mail, Final Clean Edition)
// =========================================================
app.post("/api/send-report", async (req, res) => {
  try {
    const { userEmail, propertyData } = req.body;
    if (!userEmail || !propertyData)
      return res.status(400).json({ error: "Brak e-maila lub danych ogłoszenia." });

    // 📅 Dynamiczne ustalenie okresu raportu
    const now = new Date();
    const month = now.toLocaleString("pl-PL", { month: "long" });
    const year = now.getFullYear();
    const quarter = Math.ceil((now.getMonth() + 1) / 3);
    const currentQuarter = `Q${quarter} ${year}`;

    console.log(`📊 Generowanie raportu (${currentQuarter}) dla: ${userEmail}`);

    // 🧠 PROMPT SYSTEMOWY
    const messages = [
      {
        role: "system",
        content: `
Jesteś zespołem ekspertów DomAdvisor (Jakub – analityk finansowy i Magdalena – architekt wnętrz).
Tworzysz raport ekspercki premium o nieruchomości na rynku polskim, bazując na danych:
NBP, Otodom Analytics, AMRON-SARFiN i GUS.

📅 AKTUALNOŚĆ:
Dzisiejsza data: ${month} ${year}. Okres odniesienia: ${currentQuarter}.
Nie powtarzaj tej frazy w każdej sekcji – może wystąpić tylko raz (na początku lub końcu raportu).

🎯 CEL:
Przygotuj pełny raport (9000–12000 znaków) z podziałem na sekcje:
1. Streszczenie oferty / Dane ogólne
2. Analiza finansowa (Jakub)
3. Analiza funkcjonalno-estetyczna (Magdalena)
4. Ryzyka
5. Rekomendacja końcowa
6. Plan 30/60/90 dni
7. Źródła danych i uwaga metodologiczna

Ton: ekspercki, rzeczowy, bez ozdobników, bez markdown, bez emotikon.`,
      },
      {
        role: "user",
        content: `${propertyData}

Wstaw informację „Okres odniesienia: ${currentQuarter} (najnowsze dane NBP i Otodom Analytics)” tylko raz — najlepiej na końcu raportu (lub wyjątkowo w pierwszym akapicie).
Usuń znaki specjalne przy cyfrach (np. 3️⃣ → 3., 1️7 → 17).`,
      },
    ];

    const completion = await openai.chat.completions.create({
      model: "gpt-4.1",
      messages,
      temperature: 0.6,
      max_tokens: 13000,
    });

    let reportText = completion.choices[0].message.content || "";

    // =========================================================
    // 🧩 CZYSZCZENIE I AUTOKOREKTA (Final Unicode & Formatting Fix)
    // =========================================================
    reportText = reportText
      .replace(/([0-9])[️⃣⃣]/g, "$1.") // usuń emoji-cyfry
      .replace(/[\uFE0F\u20E3\uFEFF\u200B-\u200D]/g, "") // usuń niewidoczne Unicode
      .replace(/20(1[0-9]|2[0-4])/g, `${year}`) // popraw stare lata
      .replace(/Q[1-4]\s20(1[0-9]|2[0-4])/g, `${currentQuarter}`)
      .replace(/na dzień raportu.*?[0-9]{4}/gi, `na dzień raportu (${month} ${year})`)
      .replace(/\s{2,}/g, " ") // usuń podwójne spacje
      .replace(/[#*_`]/g, "") // usuń markdown
      .replace(/([0-9])I\s/gi, "$1. ") // 3I → 3.
      .replace(/(Okres odniesienia:.*?)(Okres odniesienia:)/gi, "$1"); // usuń powtórzenia

    // jeśli fraza nie istnieje – dodaj na końcu
    if (!/Okres odniesienia:/i.test(reportText)) {
      reportText += `\n\nOkres odniesienia: ${currentQuarter} (najnowsze dane NBP i Otodom Analytics)`;
    }

    // =========================================================
    // 📄 Tworzenie PDF
    // =========================================================
    const pdfPath = path.join("/tmp", `DomAdvisor-Raport-${Date.now()}.pdf`);
    const doc = new PDFDocument({ margin: 50, size: "A4" });

    const fontPath = path.join(process.cwd(), "fonts", "NotoSans-Regular.ttf");
    if (fs.existsSync(fontPath)) doc.font(fontPath);

    doc.pipe(fs.createWriteStream(pdfPath));
    doc
      .fontSize(22)
      .fillColor("#222")
      .text("DomAdvisor – Raport Ekspercki", { align: "center" });
    doc.moveDown(0.6);
    doc
      .fontSize(10)
      .fillColor("#555")
      .text(`DomAdvisor Premium • ${month} ${year}`, { align: "center" });
    doc.moveDown(1);

    doc.fontSize(12).fillColor("#000").text(reportText, {
      align: "justify",
      lineGap: 6,
    });
    doc.end();

    await new Promise((r) => setTimeout(r, 2000));

    // ✉️ MAIL
    const transporter = nodemailer.createTransport({
      host: process.env.MAIL_HOST,
      port: 465,
      secure: true,
      auth: { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS },
    });

    await transporter.sendMail({
      from: `"DomAdvisor" <${process.env.MAIL_USER}>`,
      to: userEmail,
      subject: `Twój Raport Ekspercki DomAdvisor – ${month} ${year}`,
      text: `Dziękujemy za skorzystanie z DomAdvisor Premium. W załączniku znajdziesz szczegółowy raport (${currentQuarter}).`,
      attachments: [{ filename: "DomAdvisor-Raport.pdf", path: pdfPath }],
    });

    if (fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath);
    console.log(`📧 Raport wysłany do: ${userEmail}`);
    res.json({ message: "✅ Raport ekspercki został wysłany na Twój e-mail." });
  } catch (error) {
    console.error("❌ Błąd wysyłki raportu:", error);
    res.status(500).json({ error: "Nie udało się wygenerować lub wysłać raportu." });
  }
});

// ============================================================
// 🚀 START SERWERA
// ============================================================
app.get("/", (req, res) => {
  res.send("✅ DomAdvisor backend działa poprawnie. Użyj POST /api/send-report");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () =>
  console.log(`✅ DomAdvisor działa na porcie ${PORT}`)
);
