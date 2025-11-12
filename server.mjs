// =========================================================
// 🏠 DOMADVISOR PREMIUM BACKEND (Render Ready)
// GPT-4o + SMTP (home.pl) + PDF + API Chat
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

- NBP – Biuletyny cen transakcyjnych (ostatni pełny kwartał)  
- Otodom Analytics – dane ofertowe i transakcyjne (ostatni miesiąc lub kwartał)  
- AMRON-SARFiN – raporty kwartalne  
- Dane lokalne – Poznań, Warszawa, Kraków, Wrocław, Trójmiasto, Łódź, Katowice, Szczecin  

Jeśli dane nie są dostępne — interpoluj z rynków sąsiednich lub średnich wojewódzkich.  
W każdym raporcie podaj okres odniesienia (np. Q4 2025 lub Q1 2026 – najnowszy dostępny).

---

STRUKTURA RAPORTU

1. Streszczenie oferty / Dane ogólne  
Tabela z kluczowymi parametrami: lokalizacja, metraż, pokoje, piętro, rok budowy, cena, czynsz, ogrzewanie, własność, dodatki.

2. Analiza finansowa (Jakub)  
Cena ofertowa vs średnia rynkowa, benchmark, koszty transakcyjne, czynsz, rentowność.  
Tabela wskaźników: cena/m², cap rate, ROI flip, DSCR, okres zwrotu.

3. Analiza funkcjonalno-estetyczna (Magdalena)  
Opis układu, światła, ergonomii, estetyki, warianty liftingów A/B/C z kosztami i efektem.

4. Ryzyka  
Trzy kategorie: techniczne, rynkowe, prawne.

5. Rekomendacja końcowa  
Decyzja: Warto rozważyć / Negocjuj / Odpuść, uzasadnienie, rekomendowana cena.  
Jeśli dotyczy — dołącz Plan 30/60/90 dni, dopasowany do typu inwestycji.

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
// 📧 ENDPOINT: PEŁNY RAPORT (PDF + wysyłka e-mail, wersja premium GPT-4.1)
// =========================================================
app.post("/api/send-report", async (req, res) => {
  try {
    const { userEmail, propertyData } = req.body;

    if (!userEmail || !propertyData)
      return res.status(400).json({ error: "Brak e-maila lub danych ogłoszenia." });

    console.log("📄 Generowanie raportu eksperckiego dla:", userEmail);

    // 🧠 Generowanie pełnego raportu eksperckiego (GPT-4.1)
    const completion = await openai.chat.completions.create({
      model: "gpt-4.1",
      messages: [
        {
          role: "system",
          content: `
Jesteś zespołem ekspertów DomAdvisor (Jakub i Magdalena). Przygotowujesz profesjonalne raporty eksperckie dotyczące nieruchomości w Polsce, bazując na danych z NBP, Otodom Analytics, AMRON-SARFiN i GUS.

🎯 CEL:
Stwórz pełny raport analityczny (9000–12000 znaków) dotyczący przesłanej nieruchomości. Raport ma być opracowaniem eksperckim, gotowym do sprzedaży jako dokument PDF klasy premium.

📊 STRUKTURA RAPORTU:

1️⃣ STRESZCZENIE RAPORTU  
Krótki opis oferty (lokalizacja, metraż, typ nieruchomości, stan, kluczowe wnioski).

2️⃣ ANALIZA FINANSOWA (Jakub – ekspert inwestycyjny)  
- Porównanie ceny ofertowej do średniej rynkowej w danej dzielnicy (dane Q4 2025 lub najnowsze).  
- Wyliczenia wskaźników: cena/m², cap rate, ROI, cash-on-cash, koszty transakcyjne, marża przy flipie.  
- Wnioski inwestycyjne: opłacalność, zwrot, potencjał wzrostu wartości.  
- Rekomendacje negocjacyjne i strategie zakupu.

3️⃣ ANALIZA FUNKCJONALNO–ESTETYCZNA (Magdalena – architekt wnętrz, home stager)  
- Układ funkcjonalny, światło, ergonomia, akustyka, estetyka wnętrza.  
- Potencjał liftingów A/B/C – opisz 3 warianty modernizacji (koszty i wpływ na wartość).  
- Rekomendacje wizualne i stagingowe dla sprzedaży lub najmu.

4️⃣ RYZYKA  
- Techniczne (instalacje, konstrukcja, budynek).  
- Rynkowe (lokalne trendy, popyt/podaż, sezonowość).  
- Prawne (własność, współwłasność, obciążenia).

5️⃣ REKOMENDACJA KOŃCOWA  
- Decyzja: WARTO / NEGOCJUJ / ODPUŚĆ  
- Uzasadnienie finansowe i estetyczne.  
- Plan działań 30/60/90 dni.

💬 STYL I TON:
Używaj języka eksperckiego – rzeczowego, precyzyjnego i pozbawionego ozdobników.  
Każdy z ekspertów (Jakub i Magdalena) podpisuje się w swoim akapicie.  
Nie używaj emotikon, ramek ani markdown.  
Raport ma przypominać profesjonalne opracowanie rzeczoznawcy majątkowego.

📈 JAKOŚĆ PREMIUM:
Raport ma być gotowy do sprzedaży (jako plik PDF) i odpowiadać poziomem merytorycznym analizom DomAdvisor GPT’S.  
W treści stosuj liczby, wskaźniki i odniesienia do źródeł danych.  
Uwzględnij realne widełki cenowe, wskaźniki i rynki porównawcze (Trójmiasto, Warszawa, Kraków, Wrocław itp.).
          `,
        },
       {
  role: "user",
  content: `
${propertyData}

Upewnij się, że raport DomAdvisor zawiera WSZYSTKIE następujące sekcje (w tej kolejności i pełnym rozwinięciu):

1️⃣ STRESZCZENIE OFERTY / DANE OGÓLNE  
2️⃣ ANALIZA FINANSOWA (Jakub)  
3️⃣ ANALIZA FUNKCJONALNO-ESTETYCZNA (Magdalena)  
4️⃣ RYZYKA  
5️⃣ REKOMENDACJA KOŃCOWA  
6️⃣ PLAN 30 / 60 / 90 DNI  
7️⃣ ŹRÓDŁA DANYCH i UWAGA METODOLOGICZNA  

Każda sekcja musi być kompletna, szczegółowa i rozbudowana – minimum kilka akapitów.  
Nie wolno pomijać ani łączyć sekcji.  
Jeśli model skraca tekst, generuj go dalej aż do pełnego zakończenia.
  `,
},

      temperature: 0.6,
      max_tokens: 13000,
    });

    const reportText = completion.choices[0].message.content || "";
    console.log(`✅ Raport wygenerowany (${reportText.length} znaków) — model: gpt-4.1`);

    // =========================================================
    // 📄 Tworzenie PDF z poprawnym fontem i formatowaniem
    // =========================================================
    const pdfPath = path.join("/tmp", `DomAdvisor-Raport-${Date.now()}.pdf`);
    const doc = new PDFDocument({
      margin: 50,
      size: "A4",
      info: {
        Title: "DomAdvisor – Raport Ekspercki",
        Author: "DomAdvisor AI",
      },
    });

    // ✅ Font z polskimi znakami (NotoSans)
    const fontPath = path.join(process.cwd(), "fonts", "NotoSans-Regular.ttf");
    if (fs.existsSync(fontPath)) {
      doc.font(fontPath);
      console.log("✅ Załadowano font NotoSans-Regular.ttf");
    } else {
      console.warn("⚠️ Brak fontu NotoSans-Regular.ttf – używam domyślnej czcionki.");
    }

    doc.pipe(fs.createWriteStream(pdfPath));

    // 🔹 Nagłówek PDF
    doc
      .fontSize(22)
      .fillColor("#222222")
      .text("DomAdvisor – Raport Ekspercki", { align: "center" });
    doc.moveDown(0.6);
    doc
      .fontSize(10)
      .fillColor("#555555")
      .text("DomAdvisor Premium • Raport ekspercki 2025", { align: "center" });
    doc.moveDown(1);

    // 🔹 Treść raportu (oczyszczona z Markdown)
    const cleanText = reportText
      .replace(/[#*_`]/g, "") // usuwa markdown
      .replace(/\n{3,}/g, "\n\n"); // poprawia odstępy

    doc.fontSize(12).fillColor("#000000").text(cleanText, {
      align: "justify",
      lineGap: 6,
    });

    doc.end();

    // ✨ Daj chwilę na zapis pliku przed wysyłką
    await new Promise((resolve) => setTimeout(resolve, 2500));

    // =========================================================
    // ✉️ Wysyłka e-mail (SMTP Home.pl)
    // =========================================================
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
      from: `"DomAdvisor" <${process.env.MAIL_USER}>`,
      to: userEmail,
      subject: "Twój Raport Ekspercki DomAdvisor (Premium Edition)",
      text: "Dziękujemy za skorzystanie z DomAdvisor Premium. W załączniku znajdziesz szczegółowy raport finansowo-estetyczny przygotowany przez Jakuba i Magdalenę.",
      attachments: [{ filename: "DomAdvisor-Raport.pdf", path: pdfPath }],
    });

    // Usuń plik po wysyłce
    if (fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath);

    console.log(`📧 Raport wysłany do: ${userEmail}`);
    res.json({ message: "✅ Raport ekspercki został wysłany na Twój e-mail." });
  } catch (error) {
    console.error("❌ Błąd wysyłki raportu:", error);
    res.status(500).json({ error: "Nie udało się wygenerować lub wysłać raportu." });
  }
});



// ============================================================
// 🚀 START SERWERA (Render fix)
// ============================================================

// Domyślny endpoint testowy
app.get("/", (req, res) => {
  res.send("✅ DomAdvisor backend działa poprawnie. Użyj POST /api/send-report");
});

// Render wymaga nasłuchiwania na process.env.PORT i adresie 0.0.0.0
const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => console.log(`✅ DomAdvisor działa na porcie ${PORT}`));










