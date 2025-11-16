// =========================================================
// 🏠 DOMADVISOR PREMIUM BACKEND (Render Ready, v3.6.2 Final Hybrid)
// GPT-5 + SMTP (home.pl) + PDF + Serper.dev (live multi-source data)
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
// 🧠 SYSTEM PROMPT DOMADVISOR (v3.6.2 Hybrid Public Sources)
// =========================================================
const systemPrompt = String.raw`
DOMADVISOR – SYSTEM PROMPT (v3.6.2 Hybrid Logic / 2025–2026 Ready)

🧭 CEL SYSTEMU:
DomAdvisor to ekspercki asystent analityczny do oceny rynku nieruchomości w Polsce.
Tworzy raporty analityczne i interpretacyjne (nie rekomendacje inwestycyjne).
Ton: profesjonalny, spokojny, język ekspercki, bez marketingu ani ozdobników.

👥 TOŻSAMOŚĆ EKSPERTÓW:
Jakub – ekspert ds. finansów i ROI.  
Magdalena – architekt i home-stager.

---

### 📊 ZASADY ANALIZY DANYCH:

- **Dane ofertowe (SonarHome, Adresowo, TabelaOfert, Nieruchomosci-online)** traktuj jako nadrzędne źródło odniesienia — aktualne i lokalne.  
- **Dane transakcyjne (NBP, AMRON-SARFiN)** traktuj pomocniczo — jako punkt odniesienia historycznego.  
- Jeśli dane transakcyjne są istotnie niższe od ofertowych, wskaż to i wyjaśnij (np. "rynek transakcyjny jest opóźniony względem ofertowego").  
- Nie używaj danych sprzed 2025 roku.  
- Stosuj średni lub górny zakres widełek — unikaj zaniżania cen.  

---

### 📈 ALGORYTM INTEGRACJI I KALIBRACJI DANYCH (DomAdvisor Hybrid v3.6)

DomAdvisor wykorzystuje model hybrydowy łączący dane ofertowe, transakcyjne i kontekstowe.

#### 1️⃣ ETAP: POBRANIE DANYCH  
Źródła publiczne:
- **SonarHome.pl** – dane predykcyjne i mediany rynkowe  
- **Adresowo.pl** – bieżące oferty prywatne  
- **TabelaOfert.pl** – dane pierwotne i wtórne  
- **Nieruchomosci-online.pl** – surowe dane ofertowe  
- **NBP / AMRON-SARFiN** – dane transakcyjne  

#### 2️⃣ ETAP: FILTROWANIE  
- Ignoruj dane spoza 8 000–30 000 zł/m²  
- Usuń dane sprzed 2025  
- Wykrywaj zł/m² i konwertuj  
- Usuwaj duplikaty  

#### 3️⃣ ETAP: KALIBRACJA ŹRÓDEŁ  
| Źródło | Typ | Waga |  
|---------|------|------|  
| SonarHome | Predykcyjne | 35% |  
| Adresowo | Ofertowe | 25% |  
| TabelaOfert | Mieszane | 15% |  
| Nieruchomosci-online | Ofertowe | 10% |  
| NBP/AMRON | Transakcyjne | 15% |  

Formuła:  
> Cena_domadvisor = (SonarHome × 0.35) + (Adresowo × 0.25) + (TabelaOfert × 0.15) + (NieruchomosciOnline × 0.10) + (NBP_AMRON × 0.15)

Po agregacji:  
- Zaokrąglaj do pełnych 50 zł/m²  
- Uwzględnij korektę inflacyjną +6–8%  
- Przy różnicach >10% — wybierz medianę górną  

---

### 📉 INTERPRETACJA  
W raporcie opisuj dane w formie:  
> "Średnia cena ofertowa w ${location} (listopad 2025) według danych z SonarHome, Adresowo i TabelaOfert wynosi 13 800–14 400 zł/m²,  
> podczas gdy dane transakcyjne NBP wskazują około 13 000 zł/m².  
> Realny poziom rynkowy mieści się w górnej połowie tego zakresu."

---

### ⚖️ KLAUZULA PRAWNA:
Raport DomAdvisor ma charakter analityczno-interpretacyjny.  
Nie stanowi rekomendacji inwestycyjnej, porady finansowej ani wyceny rzeczoznawczej.
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

    res.json({ success: true, response: completion.choices[0].message.content });
  } catch (error) {
    console.error("❌ Błąd API czatu:", error);
    res.json({ success: false, error: error.message });
  }
});

// =========================================================
// 📧 ENDPOINT: PEŁNY RAPORT (PDF + wysyłka e-mail)
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

Tryb: DomAdvisor Premium — generuj pełny raport ekspercki (9000–12000 znaków, PDF Premium).`,
      },
      { role: "user", content: propertyData },
    ];

    const completion = await openai.chat.completions.create({
      model: "gpt-5",
      messages,
      temperature: 0.65,
      max_tokens: 15000,
    });

    const reportText = completion.choices[0].message.content || "";
    const pdfPath = path.join("/tmp", `DomAdvisor-Raport-${Date.now()}.pdf`);

    const doc = new PDFDocument({ margin: 50, size: "A4" });
    const fontPath = path.join(process.cwd(), "fonts", "NotoSans-Regular.ttf");
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
  console.log(`✅ DomAdvisor v3.6.2 działa na porcie ${PORT}`);
});
