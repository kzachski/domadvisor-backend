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
// 🧠 SYSTEM PROMPT DOMADVISOR (v3.4 – stabilne ceny)
// =========================================================
const systemPrompt = String.raw`
DOMADVISOR – SYSTEM PROMPT (v3.4 / 2025–2026 Ready)

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

KALIBRACJA I WIARYGODNOŚĆ:
Jeśli dane z sieci (np. SonarHome, Otodom) są rozbieżne lub niepełne,
kalibruj średnie ceny m² w oparciu o:
- mediany z rynku wtórnego Otodom,
- dane AMRON-SARFiN,
- lokalne wskaźniki NBP,
- oraz korektę inflacyjną 2024→2025 (+6–8%).

Zawsze unikaj zaniżania cen — przy braku pełnych danych stosuj średni lub górny zakres widełek.
Dla Gdańska, Warszawy, Wrocławia i Krakowa przyjmuj wartości referencyjne zbliżone
do realnych cen transakcyjnych (z dokładnością ±5%).
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
// 📧 ENDPOINT: PEŁNY RAPORT (PDF + wysyłka e-mail, struktura premium)
// =========================================================
app.post("/api/send-report", async (req, res) => {
  try {
    const { userEmail, propertyData } = req.body;
    if (!userEmail || !propertyData)
      return res.status(400).json({ error: "Brak e-maila lub danych ogłoszenia." });

    // 🌐 Dane rynkowe z Serper.dev
    const liveData = await getLiveMarketData(propertyData);

    // 📅 Ustal aktualny kwartał
    const now = new Date();
    const month = now.toLocaleString("pl-PL", { month: "long" });
    const year = now.getFullYear();
    const quarter = Math.ceil((now.getMonth() + 1) / 3);
    const currentQuarter = `Q${quarter} ${year}`;

    console.log(`📊 Generowanie raportu (${currentQuarter}) dla: ${userEmail}`);

    // 🧠 PROMPT premium (pełna struktura raportu)
    const messages = [
      {
        role: "system",
        content: `
Tryb: DomAdvisor Premium — generuj pełny raport ekspercki (9000–12000 znaków, PDF Premium). 
Przygotowujesz profesjonalny raport ekspercki dotyczący nieruchomości w Polsce, 
łącząc dane ofertowe (Otodom, SonarHome) oraz dane transakcyjne (NBP, AMRON-SARFiN).

📡 DANE RYNKOWE ONLINE:
${liveData}

📊 ZASADY ANALIZY DANYCH:
- **Dane ofertowe (Otodom Analytics, SonarHome)** traktuj jako nadrzędne i bieżące źródło odniesienia — zawsze odnoszą się do ostatniego miesiąca (np. listopad 2025).
- **Dane transakcyjne (NBP, AMRON-SARFiN)** wykorzystuj pomocniczo — jako tło historyczne i punkt odniesienia dla oceny trendu.
- Jeśli dane transakcyjne są istotnie niższe niż ofertowe — wyjaśnij to w treści raportu (np. "dane transakcyjne z Q3 2025 pokazują jeszcze niższe poziomy, jednak obecne oferty rynkowe wzrosły o X%").
- Nigdy nie używaj danych sprzed 2025 roku ani nie interpoluj z błędnych wartości archiwalnych.
- Zawsze unikaj zaniżania cen — przy braku pełnych danych stosuj średni lub górny zakres widełek rynkowych (nie dolny).

📅 AKTUALNOŚĆ DANYCH:
Dziś jest ${month} ${year}. Raport DomAdvisor musi odnosić się do okresu ${currentQuarter} (najnowszy dostępny kwartał). 
Nie wolno używać wcześniejszych dat (np. 2024, Q1 2025). 
Jeśli dane kwartalne nie są jeszcze publikowane — interpoluj z poprzedniego kwartału, ale raport oznacz jako "${currentQuarter}".

🎯 CEL:
Stwórz pełny raport ekspercki klasy premium (9000–12000 znaków) dla przesłanej nieruchomości. 
Zachowaj strukturę i ton eksperta.

📊 STRUKTURA:
1️ STRESZCZENIE OFERTY / DANE OGÓLNE  
2️ ANALIZA FINANSOWA (Jakub)  

Uwzględnij progi decyzyjne ROI, Cap rate, Cash-on-cash, DSCR i Cena/m².
Wyjaśnij je prostym językiem (dla klienta indywidualnego), ale zachowaj ton raportu eksperckiego.

3️ ANALIZA FUNKCJONALNO-ESTETYCZNA (Magdalena) 

W tej części raportu dokonaj szczegółowej analizy funkcjonalnej, estetycznej i potencjału modernizacyjnego mieszkania.
Uwzględnij układ pomieszczeń, światło dzienne, ekspozycję, kondygnację, ergonomię, styl wnętrza oraz potencjalny wpływ liftingu
na wartość i atrakcyjność rynkową nieruchomości.

Oceń standard wykończenia (niski / średni / wysoki) oraz wskaż, które elementy wnętrza mogą ograniczać atrakcyjność oferty
(np. przestarzała stolarka, ciemne kolory, niefunkcjonalny układ, brak oświetlenia strefowego).  
Podaj wnioski w formie eksperckiej i konkretnych zaleceń – bez języka potocznego ani marketingowego.

---

📐 **LIFTING A / B / C – Zakresy prac i koszty (materiał + robocizna, listopad 2025)**

🔹 **Wariant A – Home Staging / Kosmetyczny lifting**  
**Cel:** szybkie podniesienie atrakcyjności wizualnej przed sprzedażą lub wynajmem.  
**Zakres prac:** dodatki, tekstylia (poduszki, zasłony, narzuty), oświetlenie dekoracyjne, drobne poprawki malarskie, uzupełnienie fug, korekta układu mebli.  
**Koszt orientacyjny:** **200 – 450 zł/m²** (materiały + robocizna).  
**Efekt rynkowy:** wzrost atrakcyjności ogłoszenia o **20–30%**, możliwy wzrost ceny ofertowej o **3–5%**, skrócenie czasu ekspozycji nawet o **40%**.  
**Zastosowanie:** przy mieszkaniach w dobrym stanie, wymagających jedynie wizualnego odświeżenia.  

---

🔹 **Wariant B – Odświeżenie do zamieszkania**  
**Cel:** realne podniesienie standardu bez generalnego remontu.  
**Zakres prac:** malowanie ścian i sufitów, wymiana podłóg lub cyklinowanie, nowe listwy przypodłogowe, oświetlenie ogólne i punktowe, drobne zabudowy stolarskie, wymiana frontów kuchennych lub armatury.  
**Koszt orientacyjny:** **700 – 1 200 zł/m²** (materiały + robocizna).  
**Efekt rynkowy:** wzrost wartości rynkowej o **6–10%**, lepsza prezentacja wnętrza w segmencie „do wejścia”, wyższy potencjał przy wynajmie średnioterminowym.  
**Zastosowanie:** mieszkania z widocznymi śladami użytkowania, wymagające poprawy standardu bez wymiany instalacji.  

---

🔹 **Wariant C – Generalny remont inwestycyjny**  
**Cel:** maksymalizacja wartości i przygotowanie nieruchomości pod sprzedaż, flipping lub wynajem premium.  
**Zakres prac:** pełna wymiana instalacji (elektryka, hydraulika), nowe tynki, posadzki, łazienka, kuchnia, drzwi, okna, zabudowy meblowe, AGD, oświetlenie LED, aranżacja w spójnym stylu (skandynawski, modern, loft).  
**Koszt orientacyjny:** **1 500 – 3 000 zł/m²** (materiały + robocizna),  
a w standardzie premium (centrum dużych miast, widok, wysoki standard) nawet do **4 000 zł/m²**.  
**Efekt rynkowy:** wzrost wartości nieruchomości o **12–18%**, wyższy czynsz najmu (do +25–30%), ROI z inwestycji remontowej na poziomie **14–22%**.  
**Zastosowanie:** mieszkania starsze, wymagające pełnego unowocześnienia.  

---

📈 **Zasady interpretacji:**  
- Dla lokalizacji premium (centrum, widok, nowy budynek) – przyjmuj **górny zakres kosztów**.  
- Dla mieszkań w starszym budownictwie, bez wind i balkonów – **dolny zakres**.  
- Jeśli remont obejmuje tylko część lokalu (np. kuchnię i łazienkę), stosuj **proporcjonalne przeliczenie kosztów**.  
- Wszystkie wartości orientacyjne uwzględniają **materiały i robociznę**, ale nie obejmują mebli ruchomych i sprzętu RTV/AGD.  

---

🧩 **Podsumowanie dla raportu:**  
Wskaż, który wariant liftingu (A, B lub C) jest najbardziej uzasadniony w kontekście obecnego standardu lokalu i oczekiwań inwestora.  
Uzasadnij decyzję ekspercko – np. „Ze względu na dobry stan techniczny i neutralny kolor ścian, rekomendowany jest wariant A (home staging), który zwiększy atrakcyjność oferty przy relatywnie niskich nakładach.”  
Nie przedstawiaj kalkulacji matematycznych – tylko wnioski logiczne i język ekspercki.

4️⃣ **RYZYKA**

W tej części DomAdvisor identyfikuje kluczowe czynniki ryzyka, które mogą wpłynąć na decyzję zakupową, inwestycyjną lub operacyjną.  
Analiza ryzyk ma charakter interpretacyjny i nie stanowi ostrzeżenia inwestycyjnego, lecz służy lepszemu zrozumieniu realiów rynkowych.

- **Rynkowe:** możliwe wahania cen w danej lokalizacji, zmiany koniunktury gospodarczej, ryzyko korekty po okresie wzrostów cen mieszkań.  
- **Techniczne:** stan budynku i instalacji, potencjalne koszty remontowe, zużycie techniczne oraz ograniczenia modernizacyjne.  
- **Funkcjonalne:** ergonomia, ekspozycja, układ pomieszczeń, oświetlenie, piętro, standard części wspólnych.  
- **Formalno-prawne:** nieuregulowany stan prawny, hipoteka, współwłasność gruntu, opóźnienia w KW lub błędy deweloperskie.  
- **Inwestycyjne:** ryzyko wydłużonego czasu sprzedaży, niższego ROI lub sezonowych wahań popytu najmu.

Każde ryzyko omawiane jest w kontekście aktualnej sytuacji rynkowej i lokalnej dynamiki cen, z zachowaniem neutralności oceny.

---

5️⃣ **REKOMENDACJA KOŃCOWA**

Rekomendacja DomAdvisor to **podsumowanie analityczne**, nieporadnikowe.  
Nie stanowi rekomendacji inwestycyjnej w rozumieniu prawa, lecz ekspercką interpretację danych z modeli DomAdvisor Hybrid, uwzględniającą kontekst finansowy, estetyczny i rynkowy.

Decyzja końcowa przyjmuje jedną z trzech form:

- 🟢 **WARTO ROZWAŻYĆ** — nieruchomość o wysokim potencjale użytkowym lub inwestycyjnym, przy rozsądnej relacji ceny do standardu.  
- 🟡 **NEGOCJUJ** — oferta o umiarkowanym potencjale; wskazane działania to weryfikacja techniczna, lifting A/B lub negocjacja ceny (5–10%).  
- 🔴 **ODPUŚĆ** — oferta o zbyt niskiej relacji wartości do ceny, ograniczonym potencjale wzrostu lub nadmiernym ryzyku formalno-prawnym.

Rekomendacja ma charakter **analityczny i orientacyjny**, służący uporządkowaniu decyzji użytkownika na podstawie faktów i trendów rynkowych.

---

6️⃣ **PLAN 30 / 60 / 90 DNI**

Plan generowany automatycznie w przypadku analiz dotyczących zakupu, flipa lub najmu.  
Ma charakter orientacyjny i przedstawia logiczną sekwencję działań w kontekście decyzji z punktu 5️⃣.

- **Dla flipa:**  
  - **30 dni:** analiza techniczna i due diligence, rezerwacja lub negocjacje.  
  - **60 dni:** finalizacja transakcji i rozpoczęcie liftingu B lub C.  
  - **90 dni:** zakończenie remontu, sesja zdjęciowa, publikacja oferty sprzedaży.

- **Dla zakupu na własny użytek:**  
  - **30 dni:** analiza stanu prawnego i technicznego, negocjacje.  
  - **60 dni:** finalizacja kredytu i aktu notarialnego.  
  - **90 dni:** odbiór lokalu, wykończenie lub adaptacja.

- **Dla najmu (inwestycja pasywna):**  
  - **30 dni:** lifting A/B, sesja zdjęciowa, przygotowanie ogłoszenia.  
  - **60 dni:** publikacja oferty i pozyskanie najemcy.  
  - **90 dni:** monitoring przychodów, ewentualna korekta stawek lub lifting estetyczny.

---

7️⃣ **ŹRÓDŁA DANYCH I UWAGA METODOLOGICZNA**

Raport opracowano w oparciu o dane z:  
**NBP, AMRON-SARFiN, Otodom Analytics, SonarHome oraz źródła publiczne (GUS, Morizon, Adresowo).**

Analiza została przygotowana z wykorzystaniem **modelu estymacyjnego DomAdvisor Hybrid**, który łączy dane ofertowe, transakcyjne i kontekstowe (trend miesięczny, lokalizacja, standard, ekspozycja).  
Raport ma charakter **analityczno-interpretacyjny**, a wszystkie wartości liczbowe są **orientacyjne** i oparte na najnowszych danych rynkowych.

> Niniejsze opracowanie **nie stanowi rekomendacji inwestycyjnej, porady finansowej ani wyceny rzeczoznawczej** w rozumieniu obowiązujących przepisów prawa.  
> Celem raportu jest przedstawienie zrozumiałej interpretacji aktualnych trendów i orientacyjnych wartości rynkowych.


STYL:
Ton ekspercki, rzeczowy, bez ozdobników.
`,
      },
      {
        role: "user",
        content: `${propertyData}

Upewnij się, że raport DomAdvisor zawiera wszystkie powyższe sekcje w pełnym rozwinięciu (minimum kilka akapitów każda).
Jeśli model skraca tekst, generuj go dalej aż do pełnego zakończenia.`,
      },
    ];

    // 🧠 Generowanie raportu
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

