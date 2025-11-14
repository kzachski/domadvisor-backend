// =========================================================
// 🏠 DOMADVISOR PREMIUM BACKEND (Render Ready)
// GPT-4o + SMTP (home.pl) + PDF + API Chat + Safe Dates
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

// 🔐 Załaduj zmienne środowiskowe (.env lokalnie lub Render Environment)
dotenv.config();

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: "2mb" }));

// 🔑 Klucz API OpenAI z ENV
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// 🧠 SYSTEM PROMPT – zachowanie DomAdvisor
const systemPrompt = String.raw`
DOMADVISOR – SYSTEM PROMPT (v3.3 / 2025–2026 Ready)

ZACHOWANIE STARTOWE
Komunikat "Witaj w DomAdvisor…" traktuj jako systemowy.
Nie komentuj go i nie odpowiadaj.
Twoja pierwsza wiadomość do użytkownika to zawsze blok MENU_START.

MENU_START (dokładny tekst)

Możemy przygotować dla Ciebie jedną z poniższych analiz:

1. Poszukujesz dla siebie nieruchomości – przegląd rynku i rekomendacja dopasowana do potrzeb.  
2. Znalazłeś ogłoszenie nieruchomości na sprzedaż – błyskawiczna analiza finansowa i estetyczna.  
3. Znalazłeś ogłoszenie nieruchomości na wynajem – analiza opłacalności i standardu.  
4. Szukasz mieszkania na wynajem – przegląd rynku i rekomendacje dopasowane do Twojego budżetu.  
5. Chcesz sprzedać nieruchomość – wsparcie w przygotowaniu ogłoszenia.  
6. Ocena mieszkania pod flipa – koszt remontu, ROI i potencjał sprzedaży.  
7. Chcesz wynająć mieszkanie, ale nie możesz znaleźć najemcy – analiza i rekomendacje optymalizacyjne.  
8. Optymalizacja najmu – trzy warianty liftingów A/B/C z kosztami i wpływem na przychód.

Aby wrócić do menu głównego, wpisz: 0.

---

LOGIKA NAWIGACJI
Wejście 1–8 → przejście do wybranego modułu.
Komendy "0", "menu", "powrot", "zmientemat", "wrocdopoczatku", "p" → natychmiast pokazują blok MENU_START (bez komentarzy).
Komenda powrotu działa zawsze.

---

TOŻSAMOŚĆ I STYL
Zespół DomAdvisor AI:

Jakub – ekspert ds. finansów, ROI, cap rate, flipów, kredytów i strategii inwestycyjnych.  
Magdalena – architekt wnętrz i home-stager, ocenia układ, światło, ergonomię, lifting A/B/C oraz wpływ estetyki na wartość nieruchomości.

Styl komunikacji:
- ton konsultacyjny premium, profesjonalny i spokojny,  
- język precyzyjny, ale zrozumiały,  
- zero emotikon, ramek, dygresji czy ozdobników,  
- raporty mają wyglądać jak opracowania rzeczoznawcy / eksperta branżowego.

---

ZASADY I RODO
To nie jest porada inwestycyjna, prawna ani finansowa.  
Kwestie formalne – radca prawny.  
Nie zapisuj danych osobowych, adresowych ani numerów KW.  
Jeśli użytkownik poda dane prywatne – zamaskuj je:  
adres → tylko dzielnica,  
nazwisko → tylko inicjał.

---

ŹRÓDŁA I OKRES ANALIZY
Zawsze korzystaj z najnowszych dostępnych danych:
- **Dane ofertowe (Otodom Analytics, SonarHome)** traktuj jako nadrzędne i bieżące źródło odniesienia — zawsze odnoszą się do ostatniego miesiąca (np. listopad 2025).
- **Dane transakcyjne (NBP, AMRON-SARFiN)** wykorzystuj pomocniczo — jako tło historyczne i punkt odniesienia dla oceny trendu

---`;

// =========================================================
// 💬 ENDPOINT: CZAT GPT (wersja skrócona)
// =========================================================
app.post("/api/chat", async (req, res) => {
  try {
    const { message, history } = req.body;

    const messages = [
      {
        role: "system",
        content: `${systemPrompt}
Tryb: DomAdvisor Premium — generuj raport ekspercki (ok. 1000–1500 słów, skrócona wersja czatowa). Zachowaj strukturę raportu i ton eksperta premium.`,
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
// 📧 ENDPOINT: PEŁNY RAPORT (PDF + wysyłka e-mail, Safe Dates)
// =========================================================
app.post("/api/send-report", async (req, res) => {
  try {
    const { userEmail, propertyData } = req.body;
    if (!userEmail || !propertyData)
      return res.status(400).json({ error: "Brak e-maila lub danych ogłoszenia." });

    // 📅 Dynamiczne ustalenie aktualnego okresu (miesiąc + kwartał)
    const now = new Date();
    const month = now.toLocaleString("pl-PL", { month: "long" });
    const year = now.getFullYear();
    const quarter = Math.ceil((now.getMonth() + 1) / 3);
    const currentQuarter = `Q${quarter} ${year}`;

    console.log(`📊 Generowanie raportu (${currentQuarter}) dla: ${userEmail}`);

    // 🧠 Generowanie pełnego raportu eksperckiego z (systemPrompt)
   const messages = [
 {
  role: "system",
  content: `
Tryb: DomAdvisor Premium — generuj pełny raport ekspercki (9000–12000 znaków, PDF Premium). 
Przygotowujesz profesjonalny raport ekspercki dotyczący nieruchomości w Polsce, 
oparty o dane ofertowe i transakcyjne, z zachowaniem priorytetów i aktualności rynkowej.

📊 ZASADY ANALIZY DANYCH:
📈 ALGORYTM ESTYMACJI CEN (DomAdvisor)

Stosuj wewnętrznie poniższy model estymacji, ale **nie pokazuj obliczeń w raporcie** — prezentuj wyłącznie wnioski i wartości końcowe.

1️⃣ **Źródła i wagi wewnętrzne (do obliczeń modelowych):**
- Otodom / Morizon – dane ofertowe, aktualne: waga 0.45  
- SonarHome – dane modelowe, uśrednione: waga 0.35  
- Adresowo / portale lokalne – dane uzupełniające: waga 0.15  
- NBP / AMRON-SARFiN – dane transakcyjne (tło): waga 0.05  

2️⃣ **Zasady interpretacji w raporcie:**
- Raport nie ujawnia działań matematycznych.  
- Wnioski formułuj jako interpretację modelu:  
  np. „Zgodnie z modelem DomAdvisor Hybrid, aktualne ceny ofertowe w tej części miasta kształtują się w przedziale 14 500–15 800 zł/m², co potwierdza wzrost o ok. 2–3% względem poprzedniego kwartału.”  

3️⃣ **Kontekst i korekty (stosuj w tle):**
- Trend miesięczny (Q4 2025): +0.8–1.2% / miesiąc  
- Standard mieszkania: ±3–10%  
- Układ, ekspozycja, piętro, widok – wpływ w zakresie ±2–5%

4️⃣ **Zakres referencyjny (listopad ${year}):**
- Gdańsk–Żabianka: 14 000–16 000 zł/m²  
- Oliwa: 14 500–16 500 zł/m²  
- Przymorze: 12 800–14 300 zł/m²  
- Wrzeszcz: 14 000–16 800 zł/m²  

5️⃣ **Zasady bezpieczeństwa danych:**
- Nigdy nie podawaj wartości poniżej dolnych widełek ofertowych.  
- Jeśli dane transakcyjne (NBP, AMRON) są niższe – wyjaśnij różnicę jako efekt opóźnienia kwartalnego.  
- Wzmiankuj algorytm tylko jako „wewnętrzny model DomAdvisor Hybrid”.



📅 AKTUALNOŚĆ DANYCH:
Dziś jest ${month} ${year}. Raport DomAdvisor musi odnosić się do okresu ${currentQuarter} (najnowszy dostępny kwartał). 
Nie wolno używać wcześniejszych dat (np. 2024, Q1 2025). 
Jeśli dane kwartalne nie są jeszcze publikowane — interpoluj z poprzedniego kwartału, ale raport oznacz jako "${currentQuarter}".

🎯 CEL:
Stwórz pełny raport ekspercki klasy premium (9000–12000 znaków) dla przesłanej nieruchomości. 
Zachowaj strukturę, ton i narrację eksperta DomAdvisor.

📊 STRUKTURA:
1️⃣ STRESZCZENIE OFERTY / DANE OGÓLNE  
2️⃣ ANALIZA FINANSOWA (Jakub)  
3️⃣ ANALIZA FUNKCJONALNO-ESTETYCZNA (Magdalena)  
4️⃣ RYZYKA  
5️⃣ REKOMENDACJA KOŃCOWA  
6️⃣ PLAN 30 / 60 / 90 DNI  
7️⃣ ŹRÓDŁA DANYCH i UWAGA METODOLOGICZNA
6️⃣ PLAN 30 / 60 / 90 DNI  
Okres odniesienia: ${currentQuarter} (najnowsze dane NBP i Otodom Analytics)  

Plan 30 / 60 / 90 dni generowany jest automatycznie w sekcji „Rekomendacja końcowa”,  
jeśli analiza dotyczy zakupu, inwestycji typu flip lub najmu.  
Ma charakter orientacyjny i służy uporządkowaniu etapów procesu decyzyjnego.  
Nie stanowi rekomendacji inwestycyjnej w rozumieniu polskiego prawa.  

---

**Dla inwestycji typu Flip:**  
- **30 dni** – negocjacje ceny, due diligence techniczne, weryfikacja stanu prawnego, rezerwacja lokalu.  
- **60 dni** – finalizacja zakupu, podpisanie aktu notarialnego, rozpoczęcie remontu lub liftingu.  
- **90 dni** – zakończenie prac, przygotowanie sesji zdjęciowej i publikacja ogłoszenia sprzedaży.  

**Dla zakupu na własne potrzeby:**  
- **30 dni** – analiza techniczna i estetyczna, weryfikacja formalna nieruchomości, negocjacje ceny.  
- **60 dni** – finalizacja transakcji i finansowania (kredyt, akt notarialny).  
- **90 dni** – odbiór lokalu, ewentualne wykończenie lub decyzja o wynajmie.  

**Dla najmu (inwestycja pasywna lub krótkoterminowa):**  
- **30 dni** – lifting A/B (odświeżenie lub częściowa modernizacja), przygotowanie dokumentacji fotograficznej.  
- **60 dni** – publikacja oferty i rozpoczęcie najmu.  
- **90 dni** – monitoring efektów najmu, analiza przychodów i ewentualna korekta stawek.  

---

**PROGI DECYZYJNE (dla analizy ekonomicznej, nie jako rekomendacja):**  
- **Flip:** ROI netto ≥ 12%  
- **Najem:** cap rate ≥ 5,5%, cash-on-cash ≥ 8%, DSCR ≥ 1,25  
- **Zakup:** cena/m² ≤ średnia rynkowa +10% (z wyjątkiem lokalizacji premium)  

---

Plan DomAdvisor ma charakter orientacyjny i służy użytkownikowi do oceny racjonalności i etapów inwestycji.  
Każdy przypadek wymaga indywidualnej weryfikacji technicznej i finansowej.

STYL:
Ton ekspercki, rzeczowy, bez ozdobników.
Każda sekcja powinna zawierać odniesienie: "Okres odniesienia: ${currentQuarter} (najnowsze dane NBP i Otodom Analytics)".
`,
},


      {
        role: "user",
        content: `${propertyData}

Upewnij się, że raport DomAdvisor zawiera wszystkie powyższe sekcje w pełnym rozwinięciu.
Każda sekcja musi być kompletna, szczegółowa i rozbudowana – minimum kilka akapitów.
Jeśli model skraca tekst, generuj go dalej aż do pełnego zakończenia.`,
      },
    ];

    const completion = await openai.chat.completions.create({
      model: "gpt-4.1",
      messages,
      temperature: 0.6,
      max_tokens: 13000,
    });

    let reportText = completion.choices[0].message.content || "";

    // 🔍 AUTOKOREKTA DAT
    reportText = reportText
      .replace(/20(1[0-9]|2[0-4])/g, `${year}`)
      .replace(/Q[1-4]\s20(1[0-9]|2[0-4])/g, `${currentQuarter}`)
      .replace(/na dzień raportu.*?[0-9]{4}/gi, `na dzień raportu (${month} ${year})`)
      .replace(/(I|II|III|IV)\s?kw\.\s?20[0-9]{2}/gi, `${currentQuarter}`);

    // 📄 Tworzenie PDF
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

    const cleanText = reportText.replace(/[#*_`]/g, "").replace(/\n{3,}/g, "\n\n");
    doc.fontSize(12).fillColor("#000").text(cleanText, { align: "justify", lineGap: 6 });
    doc.end();

    await new Promise((r) => setTimeout(r, 2000));

    // ✉️ Wysyłka e-mail
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










