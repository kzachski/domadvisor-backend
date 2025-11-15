// =========================================================
// 🏠 DOMADVISOR PREMIUM BACKEND (Render Ready)
// GPT-4.1 + SMTP (home.pl) + PDF + Serper.dev (live data)
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
import axios from "axios";

dotenv.config();

// =========================================================
// 🌐 FUNKCJA: Pobieranie danych rynkowych (Serper.dev)
// =========================================================
async function getLiveMarketData(location) {
  try {
    const response = await axios.get("https://google.serper.dev/search", {
      headers: { "X-API-KEY": process.env.SERPER_API_KEY },
      params: {
        q: `średnie ceny mieszkań ${location} listopad 2025 site:sonarhome.pl OR site:otodom.pl`,
        num: 5,
      },
    });

    const results = response.data.organic?.map(r => r.snippet).join("\n") || "";
    return results || "Brak danych z sieci.";
  } catch (error) {
    console.error("❌ Błąd pobierania danych rynkowych:", error.message);
    return "Nie udało się pobrać danych rynkowych.";
  }
}

// =========================================================
// ⚙️ KONFIGURACJA EXPRESS + OPENAI
// =========================================================
const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: "2mb" }));

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// =========================================================
// 🧠 SYSTEM PROMPT DOMADVISOR
// =========================================================
const systemPrompt = String.raw`
DOMADVISOR – SYSTEM PROMPT (v3.3 / 2025–2026 Ready)

ZACHOWANIE STARTOWE
Nie komentuj komunikatu powitalnego – zacznij od MENU_START.

MENU_START:
1. Analiza nieruchomości na sprzedaż
2. Analiza nieruchomości na wynajem
3. Ocena mieszkania pod flipa
4. Rekomendacja rynkowa dla inwestora
5. Optymalizacja ogłoszenia sprzedaży
6. Wycena nieruchomości i analiza trendu
7. Analiza lokalnego rynku
8. Pomoc w sprzedaży / wynajmie

Komendy „0” lub „menu” — powrót do MENU_START.

TOŻSAMOŚĆ I STYL:
Jakub – ekspert ds. finansów i ROI.
Magdalena – architekt i home-stager.
Styl profesjonalny, spokojny, język ekspercki bez ozdobników.

ŹRÓDŁA:
NBP, Otodom Analytics, SonarHome, AMRON-SARFiN.
Używaj najnowszych danych (Q4 2025 lub Q1 2026).
Nie interpoluj danych sprzed 2025 roku.
`;

// =========================================================
// 💬 ENDPOINT: CHAT (wersja skrócona)
// =========================================================
app.post("/api/chat", async (req, res) => {
  try {
    const { message, history } = req.body;

    const messages = [
      {
        role: "system",
        content: `${systemPrompt}
Tryb: DomAdvisor Premium – generuj raport ekspercki (ok. 1000–1500 słów, skrócona wersja czatowa).`,
      },
      ...(history || []),
      { role: "user", content: message },
    ];

    const completion = await openai.chat.completions.create({
  model: "gpt-5",
  messages,
  temperature: 0.7,
  max_tokens: 13000,
});


    const response = completion.choices[0].message.content;
    console.log("✅ Raport czatowy wygenerowany — długość:", response.length);
    res.json({ success: true, response });
  } catch (error) {
    console.error("❌ Błąd API czatu:", error);
    res.json({ success: false, error: error.message });
  }
});

// =========================================================
// 📧 ENDPOINT: PEŁNY RAPORT (PDF + wysyłka e-mail)
// =========================================================

    // 🌐 Dane rynkowe
    const liveData = await getLiveMarketData(propertyData);

    // 📅 Okres bieżący
    const now = new Date();
    const month = now.toLocaleString("pl-PL", { month: "long" });
    const year = now.getFullYear();
    const quarter = Math.ceil((now.getMonth() + 1) / 3);
    const currentQuarter = `Q${quarter} ${year}`;

    // 🧠 GPT prompt
    const messages = [
      {
        role: "system",
        content: `
📡 Aktualne dane rynkowe znalezione online:\n${liveData}

${systemPrompt}

Tryb: DomAdvisor Premium — generuj pełny raport ekspercki (9000–12000 znaków, PDF Premium).
Uwzględnij dane z SonarHome, Otodom, NBP i AMRON-SARFiN.
Każdy raport ma odnosić się do okresu ${currentQuarter}.`,
      },
      { role: "user", content: `${propertyData}` },
    ];

    // 🧠 GPT generowanie raportu
    const completion = await openai.chat.completions.create({
      model: "gpt-4.1",
      messages,
      temperature: 0.6,
      max_tokens: 13000,
    });

    let reportText = completion.choices[0].message.content || "";

    // 📄 PDF
    const pdfPath = path.join("/tmp", `DomAdvisor-Raport-${Date.now()}.pdf`);
    const doc = new PDFDocument({ margin: 50, size: "A4" });
    const fontPath = path.join(process.cwd(), "fonts", "NotoSans-Regular.ttf");
    if (fs.existsSync(fontPath)) doc.font(fontPath);

    doc.pipe(fs.createWriteStream(pdfPath));
    doc.fontSize(22).text("DomAdvisor – Raport Ekspercki", { align: "center" });
    doc.moveDown(0.6);
    doc.fontSize(10).fillColor("#555").text(`DomAdvisor Premium • ${month} ${year}`, { align: "center" });
    doc.moveDown(1);

    const cleanText = reportText.replace(/[#*_`]/g, "").replace(/\n{3,}/g, "\n\n");
    doc.fontSize(12).fillColor("#000").text(cleanText, { align: "justify", lineGap: 6 });
    doc.end();

    await new Promise((r) => setTimeout(r, 2000));

    // ✉️ E-mail
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
      text: `Dziękujemy za skorzystanie z DomAdvisor Premium. W załączniku znajdziesz raport (${currentQuarter}).`,
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

// =========================================================
// 🧪 TEST ENDPOINT — sprawdzenie połączenia z Serper.dev
// =========================================================
// ============================================================
// 🧪 TEST ENDPOINT — sprawdzenie połączenia z Serper.dev
// ============================================================
app.get("/api/test-serper", async (req, res) => {
  try {
    const location = "Gdańsk Żabianka";
    const data = await getLiveMarketData(location);
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.send(`📡 Wyniki wyszukiwania online dla: ${location}\n\n${data}`);
  } catch (error) {
    res.status(500).send("❌ Błąd podczas pobierania danych rynkowych: " + error.message);
  }
});

// ============================================================
// 🌍 ROOT ENDPOINT (test backendu)
// ============================================================
app.get("/", (req, res) => {
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.send("✅ DomAdvisor backend działa poprawnie. Użyj POST /api/send-report");
});

// ============================================================
// 🚀 START SERWERA
// ============================================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ DomAdvisor działa na porcie ${PORT}`);
});



