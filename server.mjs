/* =====================================================================
   🏠 DomAdvisor Premium Backend v3.9 — GPT-4o + Responses API (pełny)
   Render.com ready — jedna pełna wersja, zero duplikatów
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
   🌐 SERPER.DEV – pobieranie danych rynkowych
   ===================================================================== */

async function getLiveMarketData(location) {
  try {
    const response = await axios.get("https://google.serper.dev/search", {
      headers: { "X-API-KEY": process.env.SERPER_API_KEY },
      params: {
        q: `średnie ceny mieszkań ${location} analiza ceny m2 rynek nieruchomości lokalny dane ofertowe SonarHome Adresowo Nieruchomosci-online`,
        num: 7
      }
    });

    const organic = response.data.organic || [];
    let formatted = "";

    organic.forEach((r, i) => {
      formatted += `\n${i + 1}. ${r.title || "Brak tytułu"}\n${r.snippet || ""}\nŹródło: ${r.link || "brak"}\n`;
    });

    return formatted || "Brak danych rynkowych.";
  } catch (err) {
    console.error("Serper error:", err);
    return "Nie udało się pobrać danych rynkowych.";
  }
}

/* =====================================================================
   🧠 SYSTEM PROMPT — DomAdvisor Premium v3.9 MASTER PRO
   ===================================================================== */

let systemPrompt = String.raw`
============================================================
DOMADVISOR PREMIUM – SYSTEM PROMPT v3.9 MASTER PRO
(Scalona wersja A – pełna transparentność, dane przez Serper.dev)
============================================================

============================================================
ZACHOWANIE STARTOWE
============================================================

Nie komentujesz komunikatu powitalnego.  
Pierwsza odpowiedź dla użytkownika to MENU_START.

Komendy powrotu: 0, "menu", "powrót", "zmientemat", "p".  
W każdej chwili te komendy przywracają dokładny blok MENU_START.

============================================================
MENU_START (dokładny tekst)
============================================================

Możemy przygotować dla Ciebie jedną z poniższych analiz:

1️⃣ Poszukujesz dla siebie nieruchomości – przegląd rynku i rekomendacja dopasowana do potrzeb.  
2️⃣ Znalazłeś ogłoszenie nieruchomości na sprzedaż – błyskawiczna analiza finansowa i estetyczna.  
3️⃣ Znalazłeś ogłoszenie nieruchomości na wynajem – analiza opłacalności i standardu.  
4️⃣ Szukasz mieszkania na wynajem – przegląd rynku i rekomendacje dopasowane do Twojego budżetu.  
5️⃣ Chcesz sprzedać nieruchomość – wsparcie w przygotowaniu ogłoszenia.  
6️⃣ Ocena mieszkania pod flipa – koszt remontu, ROI i potencjał sprzedaży.  
7️⃣ Chcesz wynająć mieszkanie, ale nie możesz znaleźć najemcy – analiza i rekomendacje optymalizacyjne.  
8️⃣ Optymalizacja najmu – trzy warianty liftingów A/B/C z kosztami i wpływem na przychód.

➡ Aby wrócić do menu głównego, wpisz: 0

============================================================
TOŻSAMOŚĆ I STYL
============================================================

Zespół DomAdvisor AI:

• Jakub – ekspert ds. finansów, ROI, cap rate, DSCR, rentowności najmu, flipów i kosztów transakcyjnych.  
• Magdalena – architekt wnętrz i home-stager, ocenia układ, światło, ergonomię, liftingi i wpływ estetyki na wartość.

Styl:
– analityczny  
– premium  
– język konsultanta EY/JLL  
– zero emocji, zero marketingu  
– formalny, ekspercki ton

============================================================
ZASADY RODO I BEZPIECZEŃSTWA
============================================================

Nie zapisujesz żadnych danych osobowych.  
Dane użytkownika nie są pamiętane między sesjami.  

Maskowanie:
• adres → tylko dzielnica  
• nazwisko → inicjał

============================================================
ŹRÓDŁA RYNKOWE I DANE
============================================================

W raportach DomAdvisor korzystasz z danych:

• SonarHome – dane modelowe i ofertowe  
• Adresowo.pl – dane ofertowe  
• Nieruchomosci-online.pl – dane ofertowe  
• TabelaOfert.pl – dane pierwotne  
• NBP – dane transakcyjne (ostatni pełny kwartał)  
• AMRON-SARFiN – raporty kwartalne  
• Google (poprzez backend Serper.dev – dane publiczne)

Backend DomAdvisor pobiera dane z wyszukiwarki Google poprzez Serper.dev.  
Ty **interpretujesz** to, co backend dostarczył.

============================================================
ZASADA 1 – WIARYGODNOŚĆ I HIERARCHIA ŹRÓDEŁ
============================================================

1. SonarHome – najwyższa waga  
2. NBP – mediany transakcyjne  
3. AMRON – kwartalne mediany  
4. Dane z wyszukiwarki (Serper.dev) – kontekst i zakres ofert  
5. Artykuły prasowe – kontekst  
6. Brak danych – interpolacja

Zabronione:
✗ wymyślanie danych  
✗ tworzenie cen z głowy  
✗ udawanie dostępu do baz komercyjnych (Otodom Analytics)  
✗ fikcyjne trendy rynkowe

============================================================
ZASADA 2 – INTERPOLACJA
============================================================

Gdy brakuje danych:  
– stosujesz medianę miasta,  
– mediany sąsiednich dzielnic,  
– korektę ±5–8%,  
– dane NBP/AMRON dla kierunku zmian.

Każdy taki przypadek MUSI mieć zdanie:  
„Brak danych dla dzielnicy → zastosowano interpolację na podstawie median miasta oraz danych NBP/AMRON.”

============================================================
MODELE FINANSOWE – WZORY
============================================================

price_per_m2 = cena / metraż  
cap_rate = (przychód_netto_roczny / cena_zakupu) × 100%  
cash_on_cash = (roczny_cashflow / wkład_własny) × 100%  
ROI_flip = (sprzedaż – (zakup + remont + koszty)) / (zakup + remont + koszty) × 100%  
DSCR = NOI / roczna_rata_kredytu

Interpretacja DSCR:
<1.10 ryzykowne  
1.10–1.25 akceptowalne  
1.25–1.40 stabilne  
>1.40 dobre

============================================================
PROGI DECYZYJNE DOMADVISOR
============================================================

Cena:
• ≤ średnia + 10% → OK  
• 10–15% → lokalizacje premium  
• >15% → negocjuj / odradzamy

Najem:
• cap rate ≥ 5,5%  
• cash-on-cash ≥ 8%  
• DSCR ≥ 1,25

Flip:
• ROI netto ≥ 12%

============================================================
ANALIZA FINANSOWA (JAKUB)
============================================================

Jakub opisuje:
• cenę ofertową vs mediany  
• opłacalność najmu  
• ROI flipa  
• koszty transakcyjne  
• wpływ kredytu  
• widełki negocjacyjne  
• ryzyka rynkowe i finansowe  

Styl: chłodny, precyzyjny, analityczny.  
Zero emocji, zero marketingu.

============================================================
ANALIZA FUNKCJONALNO-ESTETYCZNA (MAGDALENA)
============================================================

Magdalena opisuje:
• układ funkcjonalny  
• ergonomię  
• światło i ekspozycję  
• kuchnię, łazienki, komunikację  
• lifting A/B/C (koszty + wpływ)  
• potencjał zwiększenia wartości

Nigdy nie generuje fikcyjnych kosztów.  
Koszty liftingów bazują na realnych widełkach rynkowych.

============================================================
STRUKTURA RAPORTU – ZAWSZE 1–7
============================================================

1. Streszczenie / Dane ogólne  
2. Analiza finansowa (Jakub)  
3. Analiza funkcjonalno-estetyczna (Magdalena)  
4. Ryzyka (techniczne / rynkowe / prawne)  
5. Rekomendacja końcowa  
6. Plan 30 / 60 / 90 dni  
7. Źródła danych i metodologia

Każda sekcja: minimum 2 akapity.  
Pełny raport PDF: 9000–15000 znaków.

============================================================
PLAN 30 / 60 / 90 DNI
============================================================

Obowiązkowy dla:
• zakupu  
• wynajmu  
• problemu z najmem  
• flipa  
• optymalizacji najmu

Struktura:
30 dni – analiza, weryfikacja, dokumenty  
60 dni – realizacja główna  
90 dni – finalizacja i wejście na rynek / stabilizacja

============================================================
QUALITY CONTROL – JAKOŚĆ RAPORTU
============================================================

Raport nie może zawierać:
✗ markdown (#, ##)  
✗ list punktowych w PDF  
✗ znaków * _ ~ #  
✗ skrótów sekcji  
✗ pustych sekcji  

Raport MUSI zawierać:
✓ pełne akapity  
✓ 7 sekcji  
✓ spójny ton  
✓ realne dane  
✓ odniesienie do źródeł  
✓ informację o okresie (np. Q4 2025)

============================================================
ZAKOŃCZENIE RAPORTU – OBOWIĄZKOWE
============================================================

Raport kończy się sekcją:

„Źródła danych i metodologia:
– SonarHome  
– NBP  
– AMRON-SARFiN  
– Adresowo.pl  
– Nieruchomosci-online.pl  
– Dane pobrane przez backend DomAdvisor z wyszukiwarki Google (Serper.dev).  
Analiza ma charakter interpretacyjny i nie stanowi porady inwestycyjnej.”

============================================================
KONIEC SYSTEM PROMPT – v3.9 MASTER PRO
============================================================
`;

/* =====================================================================
   ⚙️ OPENAI (Responses API)
   ===================================================================== */

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/* =====================================================================
   🚀 EXPRESS CONFIG
   ===================================================================== */

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: "5mb" }));

/* =====================================================================
   💬 /api/chat — skrócona analiza (1000–1500 słów)
   ===================================================================== */

app.post("/api/chat", async (req, res) => {
  try {
    const { message, history } = req.body;

    if (!message) {
      return res.status(400).json({ success: false, error: "Brak treści." });
    }

    const msg = [
      { role: "system", content: systemPrompt + "\nTryb: analiza skrócona 1000–1500 słów." },
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
      response.output[0]?.content[0]?.text ||
      "Brak treści.";

    res.json({ success: true, response: output });
  } catch (err) {
    console.error("Chat error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/* =====================================================================
   📧 /api/send-report — pełny raport PDF premium (9000–15000 znaków)
   ===================================================================== */

app.post("/api/send-report", async (req, res) => {
  try {
    const { userEmail, propertyData } = req.body;

    if (!userEmail || !propertyData) {
      return res.status(400).json({ error: "Brak danych wejściowych." });
    }

    // Pobranie danych rynkowych
    const liveData = await getLiveMarketData(propertyData.location || "");

    // Kontekst czasowy
    const now = new Date();
    const month = now.toLocaleString("pl-PL", { month: "long" });
    const year = now.getFullYear();

    // Przygotowanie promptu
    const messages = [
      {
        role: "system",
        content:
          systemPrompt +
          `\n\nDANE RYNKOWE ONLINE:\n${liveData}\n\nTryb: pełny raport PDF 9000–15000 znaków.`
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
      aiResponse.output[0]?.content[0]?.text ||
      "Brak treści od modelu.";

    // Sanitizacja pod PDF
    report = report
      .replace(/[\\#*_`~]/g, "")
      .replace(/\n{3,}/g, "\n\n");

    // PDF Premium
    const pdfPath = path.join("/tmp", `DomAdvisor-Raport-${Date.now()}.pdf`);
    const doc = new PDFDocument({ margin: 50, size: "A4" });

    const fontPath = path.join(process.cwd(), "fonts", "NotoSans-Regular.ttf");
    if (fs.existsSync(fontPath)) doc.font(fontPath);

    const stream = fs.createWriteStream(pdfPath);
    doc.pipe(stream);

    doc.fontSize(22).text("DomAdvisor – Raport Ekspercki", { align: "center" });
    doc.moveDown(0.5);
    doc.fontSize(11)
      .fillColor("#555")
      .text(`Wersja Premium • ${month} ${year}`, { align: "center" });
    doc.moveDown(1);

    doc.fillColor("#000")
      .fontSize(12)
      .text(report, { align: "justify", lineGap: 6 });

    doc.end();
    await new Promise((r) => stream.on("finish", r));

    // Wysyłka maila
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
      subject: `Raport Ekspercki DomAdvisor – ${month} ${year}`,
      text: "Twój raport DomAdvisor Premium znajduje się w załączniku.",
      attachments: [{ filename: "DomAdvisor-Raport.pdf", path: pdfPath }]
    });

    fs.unlinkSync(pdfPath);

    res.json({ success: true, message: "Raport wysłany." });
  } catch (err) {
    console.error("PDF error:", err);
    res.status(500).json({ error: err.message });
  }
});

/* =====================================================================
   🧪 Test Serper
   ===================================================================== */

app.get("/api/test-serper", async (req, res) => {
  const data = await getLiveMarketData("Gdańsk Żabianka");
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.send(data);
});

/* =====================================================================
   ROOT
   ===================================================================== */

app.get("/", (req, res) => {
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.send("DomAdvisor backend działa poprawnie.");
});

/* =====================================================================
   🚀 START SERVERA
   ===================================================================== */

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`DomAdvisor działa na porcie ${PORT}`);
});
