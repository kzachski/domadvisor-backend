// =========================================================
// 🏠 DOMADVISOR BACKEND (Render Ready, v3.6.4 Final Hybrid)
// GPT-5 (Responses API) + Serper.dev + SMTP (home.pl) + PDF
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
// 🌐 FUNKCJA: Pobieranie danych rynkowych z Serper.dev
// =========================================================
async function getLiveMarketData(location) {
  try {
    const response = await axios.get("https://google.serper.dev/search", {
      headers: { "X-API-KEY": process.env.SERPER_API_KEY },
      params: {
        q: `średnie ceny mieszkań ${location} listopad 2025 site:sonarhome.pl OR site:adresowo.pl OR site:tabelaofert.pl OR site:nieruchomosci-online.pl`,
        num: 8,
      },
    });

    const organic = response.data.organic || [];
    let formattedResults = "";
    organic.forEach((r, i) => {
      formattedResults += `\n${i + 1}. ${r.title || "Brak tytułu"}\n${r.snippet || ""}\nŹródło: ${r.link || "brak linku"}\n`;
    });

    console.log("🔗 [Źródła danych online]:", organic.map(r => r.link));
    return formattedResults || "Brak danych z sieci.";
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
// 🧠 SYSTEM PROMPT DOMADVISOR (v3.6.4 Hybrid Public Sources)
// =========================================================
const systemPrompt = String.raw`
DOMADVISOR – SYSTEM PROMPT (v3.6.4 Hybrid Logic)

🧭 CEL SYSTEMU:
DomAdvisor to analityczny asystent nieruchomościowy, który łączy dane z wielu publicznych źródeł.  
Nie udziela rekomendacji inwestycyjnych — przedstawia interpretację danych rynkowych.

Źródła nadrzędne (bieżące):
- SonarHome.pl
- Adresowo.pl
- TabelaOfert.pl
- Nieruchomosci-online.pl

Źródła pomocnicze (historyczne):
- NBP
- AMRON-SARFiN
- Dane publiczne

Algorytm (wagowy model hybrydowy):
Cena_domadvisor = (SonarHome × 0.35) + (Adresowo × 0.25) + (TabelaOfert × 0.15) + (NieruchomosciOnline × 0.10) + (NBP/AMRON × 0.15)

Wyniki zaokrąglaj do pełnych 50 zł/m² i uwzględniaj korektę inflacyjną 6–8%.

⚖️ Klauzula:
Analiza DomAdvisor ma charakter informacyjny i interpretacyjny.
Nie stanowi rekomendacji inwestycyjnej ani porady finansowej.
`;

// =========================================================
// 💬 ENDPOINT: CHAT (wersja skrócona)
// =========================================================
app.post("/api/chat", async (req, res) => {
  try {
    const { message, history } = req.body;
    const messages = [
      { role: "system", content: systemPrompt },
      ...(history || []),
      { role: "user", content: message },
    ];

    const completion = await openai.chat.completions.create({
      model: "gpt-5",
      messages,
      max_completion_tokens: 13000, // ✅ poprawne pole
    });

    res.json({ success: true, response: completion.choices[0].message.content });
  } catch (error) {
    console.error("❌ Błąd API czatu:", error);
    res.json({ success: false, error: error.message });
  }
});

// =========================================================
// 📧 ENDPOINT: RAPORT PDF + wysyłka e-mail
// =========================================================
app.post("/api/send-report", async (req, res) => {
  try {
    const { userEmail, propertyData } = req.body;
    if (!userEmail || !propertyData)
      return res.status(400).json({ error: "Brak e-maila lub danych ogłoszenia." });

    const liveData = await getLiveMarketData(propertyData);
    const now = new Date();
    const month = now.toLocaleString("pl-PL", { month: "long" });
    const year = now.getFullYear();
    const quarter = Math.ceil((now.getMonth() + 1) / 3);
    const currentQuarter = `Q${quarter} ${year}`;

    console.log(`📊 Generowanie raportu (${currentQuarter}) dla ${userEmail}`);

    const messages = [
      {
        role: "system",
        content: `${systemPrompt}

📡 DANE RYNKOWE ONLINE:
${liveData}

Tryb: Raport Ekspercki PDF – generuj szczegółową analizę (9000–12000 znaków).`,
      },
      { role: "user", content: propertyData },
    ];

    const completion = await openai.chat.completions.create({
      model: "gpt-5",
      messages,
      max_completion_tokens: 15000, // ✅ poprawne pole
    });

    const reportText = completion.choices[0].message.content || "";
    const pdfPath = path.join("/tmp", `DomAdvisor-Raport-${Date.now()}.pdf`);

    const doc = new PDFDocument({ margin: 50, size: "A4" });
    const fontPath = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf";
    if (fs.existsSync(fontPath)) doc.font(fontPath);

    doc.pipe(fs.createWriteStream(pdfPath));
    doc.fontSize(22).text("DomAdvisor – Raport Ekspercki", { align: "center" });
    doc.moveDown(0.5);
    doc.fontSize(10).fillColor("#555").text(`DomAdvisor Premium • ${month} ${year}`, { align: "center" });
    doc.moveDown(1);
    doc.fontSize(12).fillColor("#000").text(reportText.replace(/[#*_`]/g, ""), { align: "justify", lineGap: 6 });
    doc.end();

    await new Promise(r => setTimeout(r, 2000));

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
// 🌍 ROOT ENDPOINT
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
  console.log(`✅ DomAdvisor v3.6.4 działa na porcie ${PORT}`);
});
