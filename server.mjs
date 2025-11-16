// =========================================================
// 🏠 DOMADVISOR PREMIUM BACKEND (v3.6 REBUILD, 2025 READY)
// Stabilny • OpenAI Responses API • Serper.dev • PDF • SMTP
// =========================================================

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

// =========================================================
// 🌐 SERPER.DEV – pobieranie danych rynkowych
// =========================================================
async function getLiveMarketData(location) {
  try {
    const response = await axios.get("https://google.serper.dev/search", {
      headers: { "X-API-KEY": process.env.SERPER_API_KEY },
      params: {
        q: `ceny mieszkań ${location} średnia cena m2 SonarHome Adresowo Nieruchomosci-online listopad 2025`,
        num: 7
      }
    });

    const organic = response.data.organic || [];
    let formatted = "";

    organic.forEach((r, i) => {
      formatted += `\n${i + 1}. ${r.title || ""}\n${r.snippet || ""}\nŹródło: ${r.link || ""}\n`;
    });

    return formatted || "Brak danych rynkowych.";
  } catch (error) {
    console.error("Serper error:", error);
    return "Brak danych rynkowych.";
  }
}

// =========================================================
// 🧠 SYSTEM PROMPT – DomAdvisor v3.6 (stabilny, lekki)
// =========================================================
const baseSystemPrompt = String.raw`
Jesteś DomAdvisor AI — duetem ekspertów:

Jakub — analityk finansowy nieruchomości (ROI, cap rate, cashflow, ceny m2, rynek wtórny i pierwotny, trendy NBP i AMRON).

Magdalena — architekt i home-stager (układ, światło, ergonomia, funkcjonalność, lifting A/B/C z kosztem).

Styl: profesjonalny, konsultingowy, bez emocji, bez marketingu, pełne akapity, logika eksperta.

Używasz wyłącznie PUBLICZNYCH danych:
– SonarHome  
– Adresowo.pl  
– Nieruchomosci-online.pl  
– TabelaOfert.pl  
– NBP (ostatni pełny kwartał)  
– AMRON-SARFiN  
– Dane z wyszukiwarki Google pobierane przez backend (Serper.dev)

Jeśli brakuje danych → stosujesz interpolację i piszesz o tym otwarcie.
Nie wolno tworzyć danych z głowy.

MENU_START:
1. Analiza mieszkania na sprzedaż
2. Analiza mieszkania na wynajem
3. Flip – opłacalność i ROI
4. Rekomendacja inwestycyjna
5. Wycena nieruchomości
6. Analiza lokalnego rynku
7. Optymalizacja ogłoszenia
8. Problemy z wynajmem

Komendy: 0, menu → przywracają MENU_START.
`;

// =========================================================
// 🧩 STRICT TEMPLATE – stosowany TYLKO dla PDF
// =========================================================
const strictReportTemplate = String.raw`
GENERUJ PEŁNY RAPORT 9000–12000 ZNAKÓW.
WYŁĄCZNIE AKAPITY — ZERO LIST, ZERO MARKDOWN.

STRUKTURA (OBOWIĄZKOWA):

1. Streszczenie / Dane ogólne  
– opis mieszkania, metraż, piętro, budynek  
– lokalizacja (maskowana do dzielnicy)  
– stan, rok budowy, ekspozycja  
– opis parametrów słownie (bez list)

2. Analiza finansowa (Jakub)  
– cena, cena/m2  
– porównanie z danymi ofertowymi Sonar/Adresowo  
– odniesienie do median NBP i AMRON  
– analiza najmu, ROI, cap rate  
– negocjacje i ryzyka finansowe  
– jeśli brak danych → interpolacja

3. Analiza funkcjonalno-estetyczna (Magdalena)  
– układ, komunikacja, ergonomia  
– ocena kuchni, łazienek, stanu  
– światło i ekspozycja  
– lifting A/B/C (koszt + wpływ na wartość)

4. Ryzyka  
– techniczne  
– finansowe  
– rynkowe  
– prawne  
(minimum 2 akapity)

5. Rekomendacja końcowa  
– Kup / Negocjuj / Wynajem / Flip  
– pełne uzasadnienie  

6. Plan 30 / 60 / 90 dni  
– plan fazowy, pełne akapity  

7. Źródła  
Stały blok:
Źródła danych i metodologia:  
SonarHome  
NBP  
AMRON-SARFiN  
Adresowo.pl  
Nieruchomosci-online.pl  
Dane pobrane przez backend DomAdvisor z wyszukiwarki Google (Serper.dev).  
Analiza ma charakter interpretacyjny i nie stanowi porady inwestycyjnej.
`;

// =========================================================
// ⚙️ OPENAI CONFIG (Responses API – stabilne)
// =========================================================
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// =========================================================
// 🚀 EXPRESS CONFIG
// =========================================================
const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: "5mb" }));

// =========================================================
// 💬 ENDPOINT: /api/chat – analiza skrócona
// =========================================================
app.post("/api/chat", async (req, res) => {
  try {
    const { message, history } = req.body;

    const messages = [
      { role: "system", content: baseSystemPrompt + "\nTryb: analiza skrócona (1000–1500 słów)." },
      ...(history || []),
      { role: "user", content: message }
    ];

    const r = await openai.responses.create({
      model: "gpt-4o",
      input: messages,
      max_output_tokens: 3500,
      temperature: 0.55
    });

    const output =
      r.output_text ||
      r.output?.[0]?.content?.[0]?.text ||
      "Brak odpowiedzi.";

    res.json({ success: true, response: output });
  } catch (err) {
    console.error("Chat error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// =========================================================
// 📧 ENDPOINT: /api/send-report – pełny raport PDF
// =========================================================
app.post("/api/send-report", async (req, res) => {
  try {
    const { userEmail, propertyData } =
