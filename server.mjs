// =========================================================
// 🏠 DOMADVISOR PREMIUM BACKEND (Render Ready)
// GPT-4o + SMTP (home.pl) + PDF + API Chat + Safe Dates
// =========================================================

import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import OpenAI from "openai";
import { estimatePriceRange } from "./utils/domAdvisorModel.js";
import dotenv from "dotenv";
import nodemailer from "nodemailer";
import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";
// 📚 Import danych referencyjnych (wszystkie miasta i dzielnice Polski)

const baseRegions = JSON.parse(
  fs.readFileSync(path.resolve("./data/baseRegions.json"), "utf-8")
);

// 🔍 Funkcja automatycznego rozpoznania lokalizacji
function detectLocation(propertyText = "") {
  propertyText = propertyText.toLowerCase();
  let detectedCity = "Polska";
  let detectedDistrict = null;

  // Szukamy miasta
  for (const city of Object.keys(baseRegions)) {
    if (propertyText.includes(city.toLowerCase())) {
      detectedCity = city;
      break;
    }
  }

  // Szukamy dzielnicy (jeśli w danym mieście są dzielnice)
  if (baseRegions[detectedCity]) {
    for (const district of Object.keys(baseRegions[detectedCity])) {
      if (propertyText.includes(district.toLowerCase())) {
        detectedDistrict = district;
        break;
      }
    }
  }

  return { detectedCity, detectedDistrict };
}

// 📈 Funkcja pobierająca dane z pliku baseRegions.json
function getRegionalRange(city, district) {
  const fallback = baseRegions["Polska"];
  if (baseRegions[city]) {
    if (district && baseRegions[city][district]) {
      return baseRegions[city][district];
    } else {
      // jeśli brak dzielnicy → średnia dla miasta
      const avgCity = Object.values(baseRegions[city]).reduce(
        (acc, v) => {
          acc.min += v.min;
          acc.max += v.max;
          return acc;
        },
        { min: 0, max: 0 }
      );
      const count = Object.keys(baseRegions[city]).length;
      return {
        min: Math.round(avgCity.min / count),
        max: Math.round(avgCity.max / count),
      };
    }
  }
  return fallback; // jeśli miasto nieznane → średnia krajowa
}


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
    // 📍 Wykrywanie miasta, dzielnicy i standardu (analogicznie jak w czacie)
// 🧭 Automatyczne rozpoznanie miasta i dzielnicy
const { detectedCity, detectedDistrict } = detectLocation(propertyData);

// 🏗️ Automatyczne pobranie widełek z pliku baseRegions.json
const range = getRegionalRange(detectedCity, detectedDistrict);

// 🧠 Uruchomienie modelu DomAdvisor Model
const estimated = {
  min: range.min,
  max: range.max,
  avg: Math.round((range.min + range.max) / 2),
};

let standard = "średni";

if (propertyData.includes("Warszawa")) detectedCity = "Warszawa";
else if (propertyData.includes("Kraków")) detectedCity = "Kraków";
else if (propertyData.includes("Gdańsk")) detectedCity = "Gdańsk";
else if (propertyData.includes("Wrocław")) detectedCity = "Wrocław";
else if (propertyData.includes("Poznań")) detectedCity = "Poznań";

if (propertyData.includes("Żabianka")) detectedDistrict = "Żabianka";
else if (propertyData.includes("Oliwa")) detectedDistrict = "Oliwa";
else if (propertyData.includes("Wrzeszcz")) detectedDistrict = "Wrzeszcz";
else if (propertyData.includes("Przymorze")) detectedDistrict = "Przymorze";
else if (propertyData.includes("Śródmieście")) detectedDistrict = "Śródmieście";

if (propertyData.includes("po remoncie") || propertyData.includes("wysoki standard")) standard = "wysoki";
else if (propertyData.includes("do remontu") || propertyData.includes("niski standard")) standard = "niski";

// 📈 Uruchomienie algorytmu DomAdvisor Model (import z utils/domAdvisorModel.js)
const estimated = estimatePriceRange(detectedCity, detectedDistrict, standard);

// 📊 Generowanie krótkiego podsumowania i interpretacji (do promptu PDF)
const avgValue = estimated.avg;
let interpretation = "";
const diffFromMin = ((propertyData.includes("cena") ? parseFloat(propertyData.match(/\d{5,7}/)?.[0]) : avgValue) - estimated.min) / estimated.min * 100;

if (avgValue && diffFromMin < -5) {
  interpretation = `Z analizy modelu DomAdvisor wynika, że cena tej nieruchomości znajduje się poniżej rynkowych widełek ofertowych dla ${detectedDistrict}. Może to oznaczać okazję inwestycyjną lub potrzebę modernizacji.`;
} else if (diffFromMin >= -5 && diffFromMin <= 5) {
  interpretation = `Cena ofertowa mieści się w zakresie średnich wartości rynkowych dla ${detectedDistrict}, co potwierdza, że wycena jest adekwatna do aktualnych warunków rynkowych.`;
} else {
  interpretation = `Cena ofertowa przewyższa średnie widełki dla ${detectedDistrict} o ok. ${diffFromMin.toFixed(1)}%, co może być uzasadnione standardem wykończenia lub lokalizacją.`;
}

const valuationInsight = `
Dla lokalizacji ${detectedCity} / ${detectedDistrict} (standard: ${standard}),
wewnętrzny model DomAdvisor oszacował aktualne ceny ofertowe w przedziale
${estimated.min.toLocaleString("pl-PL")} – ${estimated.max.toLocaleString("pl-PL")} zł/m² (średnia: ${estimated.avg.toLocaleString("pl-PL")} zł/m²).

${interpretation}
`;
    // 📊 Automatyczna estymacja cen lokalnych (DomAdvisor Model)
let detectedCity = "Gdańsk";
let detectedDistrict = "Żabianka";
let standard = "średni";

// Prosta analiza tekstu wejściowego, aby wykryć miasto i dzielnicę
if (propertyData.includes("Warszawa")) detectedCity = "Warszawa";
if (propertyData.includes("Kraków")) detectedCity = "Kraków";
if (propertyData.includes("Wrocław")) detectedCity = "Wrocław";
if (propertyData.includes("Poznań")) detectedCity = "Poznań";
if (propertyData.includes("Gdańsk")) detectedCity = "Gdańsk";

if (propertyData.includes("Przymorze")) detectedDistrict = "Przymorze";
if (propertyData.includes("Wrzeszcz")) detectedDistrict = "Wrzeszcz";
if (propertyData.includes("Oliwa")) detectedDistrict = "Oliwa";
if (propertyData.includes("Żabianka")) detectedDistrict = "Żabianka";
if (propertyData.includes("Śródmieście")) detectedDistrict = "Śródmieście";

if (propertyData.includes("wysoki standard") || propertyData.includes("po remoncie"))
  standard = "wysoki";
else if (propertyData.includes("do remontu") || propertyData.includes("niski standard"))
  standard = "niski";

const estimated = estimatePriceRange(detectedCity, detectedDistrict, standard);
console.log(`📈 Estymacja DomAdvisor Model (${detectedCity}/${detectedDistrict}, ${standard}):`, estimated);

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
    // 📊 Integracja modelu DomAdvisor z promptem raportu
const priceSummary = `Dla lokalizacji ${detectedCity} / ${detectedDistrict} (standard: ${standard}), 
wewnętrzny model DomAdvisor oszacował bieżący zakres cen ofertowych w przedziale 
${estimated.min.toLocaleString("pl-PL")} – ${estimated.max.toLocaleString("pl-PL")} zł/m² 
(średnia: ${estimated.avg.toLocaleString("pl-PL")} zł/m²). 
Dane stanowią tło analityczne dla sekcji „Analiza finansowa”.`;
    // 📈 Automatyczna interpretacja wyników DomAdvisor Model
let interpretation = "";

const avgValue = estimated.avg;
const diffFromMin = ((propertyData.includes("cena") ? parseFloat(propertyData.match(/\d{5,7}/)?.[0]) : avgValue) - estimated.min) / estimated.min * 100;
const diffFromAvg = diffFromMin > 0 ? "powyżej" : "poniżej";

if (avgValue && diffFromMin < -5) {
  interpretation = `Z analizy modelu DomAdvisor wynika, że cena tej nieruchomości znajduje się wyraźnie poniżej rynkowych widełek ofertowych dla ${detectedDistrict}. Może to wskazywać na atrakcyjność inwestycyjną lub konieczność modernizacji.`;
} else if (diffFromMin >= -5 && diffFromMin <= 5) {
  interpretation = `Cena ofertowa analizowanej nieruchomości mieści się w zakresie średnich wartości rynkowych dla lokalizacji ${detectedDistrict}. Oznacza to, że wycena jest zbliżona do przeciętnego poziomu rynkowego.`;
} else {
  interpretation = `Cena nieruchomości plasuje się powyżej średnich widełek ofertowych (${diffFromMin.toFixed(1)}% ${diffFromAvg} średniej), co może wynikać z podwyższonego standardu wykończenia, atrakcyjnego piętra lub widoku.`;
}

// Dodanie interpretacji do promptu
const valuationInsight = `
${priceSummary}

${interpretation}
`;
   const messages = [
 {
  role: "system",
  content: `
Tryb: DomAdvisor Premium — generuj pełny raport ekspercki (9000–12000 znaków, PDF Premium). 
Przygotowujesz profesjonalny raport ekspercki dotyczący nieruchomości w Polsce, 
oparty o dane ofertowe i transakcyjne, z zachowaniem priorytetów i aktualności rynkowej.

📊 ZASADY ANALIZY DANYCH:
📈 ALGORYTM DOMADVISOR MODEL (wersja krajowa, działa w tle – bez ujawniania obliczeń)

Model DomAdvisor Model łączy dane z głównych źródeł rynkowych i automatycznie oblicza średnie ceny ofertowe 
dla każdej lokalizacji w Polsce. Działa w tle — raport pokazuje jedynie gotowe wyniki i interpretacje, 
bez ujawniania formuł ani obliczeń pośrednich.

1️⃣ ŹRÓDŁA I WAGI WEWNĘTRZNE (model krajowy)
- Otodom / Morizon – dane ofertowe bieżące: waga 0.45  
- SonarHome – dane modelowe, uśrednione: waga 0.35  
- Adresowo / portale lokalne – dane uzupełniające: waga 0.15  
- NBP / AMRON-SARFiN – dane transakcyjne kwartalne (tło): waga 0.05  

2️⃣ DZIAŁANIE (W TLE)
- Model automatycznie pobiera dane z pliku referencyjnego (baseRegions.json), który zawiera 
aktualne zakresy cen ofertowych dla wszystkich głównych miast i dzielnic w Polsce.  
- W przypadku braku danych szczegółowych dla danej lokalizacji, stosowany jest zakres wojewódzki lub krajowy.  
- Obliczenia wykonuje się wewnętrznie, a raport przedstawia wyłącznie logiczne wnioski, np.:  
  „Ceny ofertowe w tej części Warszawy kształtują się w przedziale 16 000–18 500 zł/m²,
   co oznacza wzrost o około 2% względem poprzedniego kwartału.”

3️⃣ KOREKTY KONTEKSTOWE (działają automatycznie)
- Trend miesięczny: +0.8–1.2% / miesiąc  
- Standard techniczny: ±3–10%  
- Ekspozycja, piętro, widok, układ: ±2–5%

4️⃣ BEZPIECZEŃSTWO INTERPRETACJI
- W raporcie nigdy nie ujawniaj obliczeń matematycznych ani wag źródeł.  
- Jeśli dane transakcyjne (NBP/AMRON) są niższe — przedstaw różnicę jako efekt opóźnienia publikacji kwartalnych.  
  Przykład: „Dane transakcyjne z Q3 2025 pozostają o około 6–9% niższe od aktualnych ofert rynkowych.”  

5️⃣ REFERENCJE LOKALNE
Dla każdej lokalizacji raport korzysta automatycznie z pliku `/data/baseRegions.json`,
który zawiera zakresy cen aktualnych na listopad 2025.  
Jeśli miasto lub dzielnica nie ma przypisanego zakresu, stosowany jest poziom krajowy:
„Polska: 9 500–12 500 zł/m²”.

6️⃣ METODOLOGIA (sekcja końcowa raportu)
Na końcu raportu umieść krótki opis:
„Raport opracowano w oparciu o autorski **DomAdvisor Model**, 
łączący dane ofertowe i transakcyjne (Otodom, SonarHome, Morizon, NBP, AMRON-SARFiN) 
z wagami i korektami kontekstowymi. Model działa w tle i prezentuje wyłącznie wyniki końcowe analizy,
bez obliczeń matematycznych.”



📅 AKTUALNOŚĆ DANYCH:
Dziś jest ${month} ${year}. Raport DomAdvisor musi odnosić się do okresu ${currentQuarter} (najnowszy dostępny kwartał). 
Nie wolno używać wcześniejszych dat (np. 2024, Q1 2025). 
Jeśli dane kwartalne nie są jeszcze publikowane — interpoluj z poprzedniego kwartału, ale raport oznacz jako "${currentQuarter}".

🎯 CEL:
Stwórz pełny raport ekspercki klasy premium (9000–12000 znaków) dla przesłanej nieruchomości. 
Zachowaj strukturę, ton i narrację eksperta DomAdvisor.

📊 STRUKTURA:
1️. STRESZCZENIE OFERTY / DANE OGÓLNE  
2️. ANALIZA FINANSOWA (Jakub)  
3️. ANALIZA FUNKCJONALNO-ESTETYCZNA (Magdalena)  
4️. RYZYKA  
5️. REKOMENDACJA KOŃCOWA  
6️. PLAN 30 / 60 / 90 DNI  
7️. ŹRÓDŁA DANYCH i UWAGA METODOLOGICZNA

6. PLAN 30 / 60 / 90 DNI  
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
// 🏗️ MODUŁ LIFTINGU / ADAPTACJI (sekcja 3️⃣ ANALIZA FUNKCJONALNO-ESTETYCZNA)
Uwzględnij trzy warianty liftingu lub adaptacji mieszkania z realistycznymi kosztami (materiały + robocizna) oraz zróżnicowanym potencjałem wpływu na wartość nieruchomości. 
Nie pokazuj wyliczeń kosztów jednostkowych — prezentuj tylko przedziały i interpretację efektu ekonomicznego. 
Uwzględnij, że wzrost wartości nie jest gwarantowany i zależy od ceny zakupu, lokalizacji oraz jakości wykonania.

// 🧱 SEKCJA: LIFTINGI A/B/C – MODEL DOMADVISOR (v2.0)
📐 LIFTINGI I MODERNIZACJE (A/B/C)

DomAdvisor generuje trzy warianty liftingów wykończeniowych w zależności od celu (flip, najem, zamieszkanie).  
Warianty obliczane są w tle na podstawie średnich kosztów rynkowych w Polsce (Q4 ${year}) z uwzględnieniem materiałów i robocizny, bez wyposażenia AGD i mebli ruchomych.  
W raporcie pokazuj **tylko wnioski opisowe i wartości końcowe**, bez ujawniania wzorów czy obliczeń.

---

**Wariant A – Home staging / lifting wizualny**  
Cel: szybka poprawa atrakcyjności oferty sprzedażowej lub wynajmu.  
Zakres: odświeżenie koloru ścian, oświetlenia, tekstyliów, mebli; zmiana aranżacji bez prac budowlanych.  
Koszt orientacyjny: **200–350 zł/m²**.  
Efekt: zwiększenie postrzeganej wartości o 5–10%, skrócenie czasu sprzedaży/najmu o 20–40%.  

---

**Wariant B – Odświeżenie przed zamieszkaniem / najmem**  
Cel: dostosowanie mieszkania do użytkowania własnego lub komercyjnego (najem).  
Zakres: malowanie, wymiana podłóg i drzwi, modernizacja łazienki lub kuchni bez wymiany instalacji, korekta układu pomieszczeń.  
Koszt orientacyjny: **900–1 800 zł/m²**.  
Efekt: podniesienie wartości rynkowej o 8–15%, możliwy wzrost czynszu o 10–20%.  

---

**Wariant C – Kompleksowy remont / generalna modernizacja**  
Cel: pełne odnowienie mieszkania (flip, inwestycja premium, zakup z rynku wtórnego).  
Zakres: wymiana instalacji, stolarki okiennej, tynków, podłóg, pełne wykończenie kuchni i łazienek, przebudowa układu funkcjonalnego.  
Koszt orientacyjny: **1 800–4 500 zł/m²** (w lokalizacjach premium nawet powyżej 5 000 zł/m²).  
Efekt: wzrost wartości rynkowej o 15–25%, skrócenie cyklu zwrotu z inwestycji o 1–2 lata.  

---

📊 ZASADY INTERPRETACJI  
- Nie prezentuj pełnych kalkulacji w raporcie — tylko opis efektów i rekomendacji dla wariantu.  
- Jeśli użytkownik nie określi celu (flip, zakup, najem), zaprezentuj wszystkie trzy warianty z krótkim porównaniem efektów i kosztów.  
- W wariancie C zawsze uwzględnij odniesienie do stanu technicznego i realnego potencjału ROI (bez danych wrażliwych).  

---

W raporcie należy wskazać:  
- który wariant liftingu jest najbardziej racjonalny w kontekście stanu i lokalizacji mieszkania,  
- szacunkowy koszt całkowity remontu (np. łączny koszt × powierzchnia mieszkania),  
- oraz realistyczny (nie maksymalny) potencjał wzrostu wartości lub ROI.  

Dane mają być prezentowane w formie opisowej (interpretacyjnej), bez tabeli kosztów i bez surowych kalkulacji.  
Wszystkie kwoty mają charakter orientacyjny i zależą od lokalnych stawek rynkowych (Warszawa, Trójmiasto, reszta Polski).

STYL:
Ton ekspercki, rzeczowy, bez ozdobników.
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
















