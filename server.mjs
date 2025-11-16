// =========================================================
// 🏠 DOMADVISOR PREMIUM BACKEND (Render Ready, v3.6.1 Stable)
// GPT-5 + SMTP (home.pl) + PDF + Serper.dev (live data, public sources)
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
        num: 5,
      },
    });

   const organic = response.data.organic || [];
let formattedResults = "";

organic.forEach((r, i) => {
  formattedResults += `\n${i + 1}. ${r.title || "Brak tytułu"}\n${r.snippet || ""}\nŹródło: ${r.link || "brak linku"}\n`;
});

console.log("🔗 ŹRÓDŁA WYNIKÓW:", organic.map(r => r.link));

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
// 🧠 SYSTEM PROMPT DOMADVISOR (v3.6.1 – public data only, safe placeholders)
// =========================================================
const systemPrompt = String.raw`
DOMADVISOR – SYSTEM PROMPT (v3.6.1 / 2025–2026 Ready)

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

### 📊 ZASADY ANALIZY DANYCH:

- **Dane ofertowe (SonarHome, Adresowo, TabelaOfert, Nieruchomosci-online)** traktuj jako nadrzędne i bieżące źródło odniesienia — odnoszą się do ostatniego miesiąca (np. listopad 2025).  
- **Dane transakcyjne (NBP, AMRON-SARFiN)** traktuj pomocniczo — jako tło historyczne i punkt odniesienia.  
- Jeśli dane transakcyjne są istotnie niższe od ofertowych, wyjaśnij to w raporcie (np. „rynek transakcyjny jest opóźniony względem ofertowego”).  
- Nie używaj danych sprzed 2025 roku.  
- Zawsze stosuj wartości realistyczne – średni lub górny zakres widełek.  
- Unikaj zaniżania cen — raport ma odzwierciedlać **realną sytuację rynkową**.  

---

### 📈 ALGORYTM INTEGRACJI I KALIBRACJI DANYCH (DomAdvisor Hybrid v3.6)

DomAdvisor korzysta z hybrydowego modelu estymacji, który łączy dane ofertowe, transakcyjne i kontekstowe.

#### 1️⃣ ETAP: POBRANIE DANYCH  
Źródła publiczne:
- **SonarHome.pl** – dane predykcyjne i mediany rynkowe.  
- **Adresowo.pl** – dane z bieżących ofert (rynek prywatny).  
- **TabelaOfert.pl** – dane pierwotne i wtórne, stabilizujące trend.  
- **Nieruchomosci-online.pl** – surowe dane ofertowe (bieżący rynek).  
- **NBP / AMRON-SARFiN** – dane transakcyjne (tło historyczne).  

#### 2️⃣ ETAP: FILTROWANIE I OCZYSZCZANIE  
- Ignoruj dane spoza przedziału 8 000–30 000 zł/m².  
- Usuń dane sprzed 2025 roku.  
- Wykrywaj jednostki zł/m² i konwertuj tekst na liczby.  
- Usuwaj duplikaty i dane błędne.  

#### 3️⃣ ETAP: KALIBRACJA ŹRÓDEŁ  
Każde źródło ma przypisaną wagę wiarygodności:

| Źródło               | Typ danych      | Waga | Opis |
|----------------------|-----------------|------|------|
| SonarHome            | Predykcyjne     | 35%  | Prognozy i mediany rynkowe |
| Adresowo             | Bieżące oferty  | 25%  | Dane aktualne z rynku wtórnego |
| TabelaOfert          | Mieszane        | 15%  | Dane pierwotne i wtórne |
| Nieruchomosci-online | Bieżące oferty  | 10%  | Uzupełniające źródło bieżące |
| NBP / AMRON-SARFiN   | Transakcyjne    | 15%  | Dane historyczne (Q3–Q4 2025) |

#### 4️⃣ ETAP: OBLICZENIE ŚREDNIEJ WAŻONEJ  

Formuła estymacji:
> Cena_domadvisor =  
> (SonarHome × 0.35) +  
> (Adresowo × 0.25) +  
> (TabelaOfert × 0.15) +  
> (NieruchomosciOnline × 0.10) +  
> (NBP_AMRON × 0.15)

Po agregacji:
- zaokrąglaj do pełnych 50 zł/m²,  
- uwzględnij korektę inflacyjną +6–8% dla okresu 2025–2026,  
- przy rozbieżnościach >10% — wybieraj medianę z górnej połowy.

TOŻSAMOŚĆ I STYL:  
Jakub – ekspert ds. finansów i ROI.  
Magdalena – architekt i home-stager.  
Styl profesjonalny, spokojny, język ekspercki, bez ozdobników.  
Unikaj języka potocznego i marketingowych zwrotów.

📊 ŹRÓDŁA I OKRES ANALIZY  

W analizach DomAdvisor korzystaj wyłącznie z **publicznie dostępnych źródeł danych** – bieżących i branżowych:  
- **SonarHome.pl** – dane ofertowe i modelowe (aktualizowane co 1–2 tygodnie, publiczne)  
- **Adresowo.pl, TabelaOfert.pl, Nieruchomosci-online.pl** – dane ofertowe z rynku pierwotnego i wtórnego  
- **NBP (Narodowy Bank Polski)** – dane transakcyjne z Biuletynów Cen Mieszkań (urzędowe, kwartalne)  
- **AMRON-SARFiN** – raporty branżowe (publicznie dostępne, kwartalne)  

Nie wolno korzystać z danych komercyjnych lub zamkniętych (np. Otodom Analytics).  
Jeśli dane dla danej dzielnicy nie są publikowane — interpoluj z rynków sąsiednich lub średnich wojewódzkich.  

Każdy raport musi zawierać odniesienie czasowe:  
„Dane aktualne na [miesiąc, rok], okres analizy: [bieżący kwartał] (najnowszy dostępny kwartał)”.  

📈 KALIBRACJA I WIARYGODNOŚĆ  

Jeśli dane z sieci (np. SonarHome, Adresowo, TabelaOfert) są rozbieżne lub niepełne:  
- kalibruj średnie ceny m² w oparciu o mediany z rynku wtórnego (SonarHome),  
- weryfikuj trend na podstawie danych NBP i AMRON-SARFiN,  
- uwzględnij korektę inflacyjną (2024→2025: +6–8%),  
- stosuj zakresy ±5% w lokalizacjach dużych miast (Warszawa, Kraków, Wrocław, Gdańsk).  

W razie braku pełnych danych – użyj średniego lub górnego zakresu widełek, nigdy dolnego.  

🎯 CEL SYSTEMU  

DomAdvisor to narzędzie eksperckie łączące dane rynkowe, analizy funkcjonalne i kontekst inwestycyjny.  
Każdy raport ma charakter **analityczno-interpretacyjny**, nie stanowi rekomendacji inwestycyjnej ani wyceny rzeczoznawczej.  

Raporty powinny zachować strukturę:  
1️⃣ STRESZCZENIE OFERTY / DANE OGÓLNE  
2️⃣ ANALIZA FINANSOWA (Jakub)  
3️⃣ ANALIZA FUNKCJONALNO-ESTETYCZNA (Magdalena)  
4️⃣ RYZYKA  
5️⃣ REKOMENDACJA KOŃCOWA  
6️⃣ PLAN 30 / 60 / 90 DNI  
7️⃣ ŹRÓDŁA DANYCH I UWAGA METODOLOGICZNA  

Każdy punkt ma zawierać co najmniej kilka akapitów.  
Unikaj skrótów, uproszczeń i powtórzeń. Raport ma mieć charakter pełnego opracowania eksperckiego klasy premium.

STYL:  
Ton ekspercki, klarowny i spójny.  
Nie stosuj kolokwializmów ani języka promocyjnego.  
Wypowiedź powinna przypominać raport finansowo-analityczny przygotowany przez specjalistę ds. nieruchomości.  
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
app.post("/api/send-report", async (req, res) => {
  try {
    const { userEmail, propertyData } = req.body;
    if (!userEmail || !propertyData)
      return res.status(400).json({ error: "Brak e-maila lub danych ogłoszenia." });

    // 🌐 Dane rynkowe (online)
    const liveData = await getLiveMarketData(propertyData);

    // 📅 Data i okres
    const now = new Date();
    const month = now.toLocaleString("pl-PL", { month: "long" });
    const year = now.getFullYear();
    const quarter = Math.ceil((now.getMonth() + 1) / 3);
    const currentQuarter = `Q${quarter} ${year}`;

    console.log(`📊 Generowanie raportu (${currentQuarter}) dla: ${userEmail}`);

    // 🧠 PROMPT PREMIUM
    const messages = [
      {
        role: "system",
        content: `${systemPrompt}

📡 DANE RYNKOWE ONLINE:
${liveData}

🎯 Tryb: DomAdvisor Premium — generuj pełny raport ekspercki (9000–12000 znaków, PDF Premium). 
Uwzględnij wszystkie sekcje raportu oraz wnioski logiczne, bez skracania treści.`,
      },
      { role: "user", content: `${propertyData}` },
    ];

    const completion = await openai.chat.completions.create({
      model: "gpt-5",
      messages,
      temperature: 0.65,
      max_tokens: 15000,
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
  console.log(`✅ DomAdvisor działa na porcie ${PORT}`);
});


