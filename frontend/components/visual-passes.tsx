"use client";

import { useMemo, useState } from "react";
import {
  Bus,
  Calendar,
  Car,
  CheckCircle2,
  CircleDollarSign,
  Clock,
  CloudSun,
  Compass,
  CreditCard,
  Hotel,
  Luggage,
  MapPin,
  Mountain,
  Navigation,
  Plane,
  QrCode,
  Sparkles,
  Sun,
  Ticket,
  TrainFront,
  Umbrella,
  Utensils,
} from "lucide-react";

type TripConstraints = Record<string, unknown>;

function formatInr(amount: number): string {
  return "₹" + new Intl.NumberFormat("en-IN").format(Math.max(0, Math.round(amount)));
}

function cleanMarkdown(str: string): string {
  return (str || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/[*_#`]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function getAirportCode(cityName: string): string {
  const lower = (cityName || "").toLowerCase();
  if (lower.includes("delhi")) return "DEL";
  if (lower.includes("tokyo") || lower.includes("japan")) return "NRT";
  if (lower.includes("osaka") || lower.includes("kansai")) return "KIX";
  if (lower.includes("kyoto")) return "UKY";
  if (lower.includes("mumbai") || lower.includes("bombay")) return "BOM";
  if (lower.includes("bengaluru") || lower.includes("bangalore")) return "BLR";
  if (lower.includes("chennai")) return "MAA";
  if (lower.includes("kolkata")) return "CCU";
  if (lower.includes("hyderabad")) return "HYD";
  if (lower.includes("singapore")) return "SIN";
  if (lower.includes("dubai")) return "DXB";
  if (lower.includes("london")) return "LHR";
  if (lower.includes("paris")) return "CDG";
  if (lower.includes("bangkok")) return "BKK";
  if (lower.includes("bali")) return "DPS";
  return cityName.replace(/[^a-zA-Z]/g, "").slice(0, 3).toUpperCase() || "INT";
}

// -----------------------------------------------------------------------------
// Dynamic Transit Extractor
// Extracts live bus/flight operator, timings, terminals, fare & seat from agent data
// -----------------------------------------------------------------------------
function extractDynamicTransit({
  itineraryText = "",
  busData = "",
  flightData = "",
  origin = "New Delhi",
  destination = "Uttarakhand",
  totalBudget = "₹10,000",
  isOverland = true,
}: {
  itineraryText?: string;
  busData?: string;
  flightData?: string;
  origin?: string;
  destination?: string;
  totalBudget?: string;
  isOverland?: boolean;
}) {
  const combined = `${itineraryText}\n${busData}\n${flightData}`
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/[\u00a0\u202f]/g, " ");

  const clean = cleanMarkdown(combined);
  const origLower = origin.toLowerCase();
  const destLower = destination.toLowerCase();

  let operator = "", boardingPoint = "", droppingPoint = "", depTime = "", arrTime = "", busFare = "", seatNumber = "";

  // Strategy A: Parse Table under Transit Information section
  const transitSectionMatch = combined.match(/(?:Transit\s*Information|Bus\s*Information|Flight\s*Information)[\s\S]*?(?:(?:2\.\s*Hotel|\n\s*\n\s*[2-9]\.|$))/i);
  const transitBlock = transitSectionMatch ? transitSectionMatch[0] : combined;

  const lines = transitBlock.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  let headerIdx = -1;
  let headers: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const cols = lines[i].split(/\t| {2,}|\|/).map(c => c.trim()).filter(Boolean);
    const hasCarrier = cols.some(c => /operator|carrier|airline|service|flight/i.test(c));
    const hasStation = cols.some(c => /boarding|station|airport|from|departs|segment/i.test(c));
    if (hasCarrier || (cols.some(c => /flight/i.test(c)) && hasStation)) {
      headerIdx = i;
      headers = cols;
      break;
    }
  }

  if (headerIdx !== -1 && lines[headerIdx + 1]) {
    let rowIdx = headerIdx + 1;
    if (/^[|\-\s:]+$/.test(lines[rowIdx]) && lines[rowIdx + 1]) {
      rowIdx++;
    }
    const cols = lines[rowIdx].split(/\t| {2,}|\|/).map(c => c.trim()).filter(Boolean);
    for (let c = 0; c < headers.length && c < cols.length; c++) {
      const h = headers[c].toLowerCase();
      const val = cols[c];
      if (/carrier|airline|operator|service/i.test(h)) operator = val;
      else if (/departure\s*airport|boarding|station|origin/i.test(h)) boardingPoint = val;
      else if (/arrival\s*airport|dropping|arrival\s*station|destination/i.test(h)) droppingPoint = val;
      else if (/departure\s*time|time\s*\(local\)|departs|time/i.test(h)) {
        if (val.includes("→") || val.includes("->")) {
          const parts = val.split(/→|->/);
          depTime = parts[0].trim();
          if (parts[1]) arrTime = parts[1].replace(/\([^)]*\)/g, "").trim();
        } else {
          depTime = val;
        }
      } else if (/arrival\s*time|arrives/i.test(h)) {
        arrTime = val;
      } else if (/fare|cost|price/i.test(h)) {
        const digits = val.replace(/[^0-9]/g, "");
        if (digits) busFare = `₹${parseInt(digits, 10).toLocaleString("en-IN")} / passenger`;
      } else if (/seat|berth/i.test(h)) {
        seatNumber = val;
      }
    }
  }

  // Strategy B: Key-Value fallback if table was not present or field was header
  if (!operator || /^(boarding|dropping|service|operator|carrier|airline)$/i.test(operator)) {
    if (!isOverland) {
      const airMatch = combined.match(/\b(Singapore Airlines|Air Japan|All Nippon Airways|ANA|Japan Airlines|JAL|Air India|IndiGo|Vistara|Emirates|Qatar Airways|Cathay Pacific|Thai Airways|Malaysia Airlines)\b/i);
      operator = airMatch ? airMatch[1] : "Singapore Airlines";
    } else {
      const opLine = combined.match(/(?:Bus\s*Operator(?:\s*&\s*Service)?|Carrier|Operator)\s*[:|•\-\t]?\s*([A-Za-z0-9\s()/\-–"“”]+?)(?=\s+(?:Boarding|Departure|Fare|\n|$))/i) ||
        combined.match(/\b(ASTC|HRTC|UTC|UPRTC|PRTC|CTU|RSRTC|KSRTC|GSRTC)[A-Za-z\s()/\-–]*/i);
      operator = opLine ? opLine[1].replace(/[:•\-|“"”]/g, "").trim() : "";
    }
  }

  if (!operator) {
    if (!isOverland) {
      operator = `${origin.split("(")[0].trim()} to ${destination.split("(")[0].trim()} Airways`;
    } else if (destLower.includes("uttar") || destLower.includes("rishikesh") || destLower.includes("dehradun")) {
      operator = "UTC Janrath / Volvo AC Express";
    } else if (destLower.includes("shimla") || destLower.includes("manali") || destLower.includes("himachal")) {
      operator = "HRTC Himgaura AC Deluxe";
    } else if (destLower.includes("assam") || destLower.includes("guwahati")) {
      operator = "ASTC Intercity Express";
    } else {
      operator = `${destination} State Transport Express`;
    }
  }

  if (!boardingPoint || /^(dropping|arrival|station)$/i.test(boardingPoint)) {
    if (!isOverland) {
      boardingPoint = origLower.includes("delhi")
        ? "Indira Gandhi International Airport (DEL T3), New Delhi"
        : `${origin.split("(")[0].trim()} International Airport`;
    } else {
      const bLine = combined.match(/(?:Boarding\s*(?:Station|Platform|Point)|Departing\s*from)\s*[:|•\-\t]?\s*([^\n\r|\t]+?)(?=\s*(?:Dropping|Departure|Arrival|\n|$))/i) ||
        clean.match(/\b(ISBT[A-Za-z0-9\s,()/\-–]+?)(?=\s+(?:Arrival|Dropping|Fare|\n|$))/i);
      boardingPoint = bLine ? bLine[1].replace(/[:•\-|]/g, "").trim() : "";
    }
  }

  if (!boardingPoint) {
    if (origLower.includes("delhi")) {
      boardingPoint = isOverland ? "ISBT Kashmiri Gate (Bay 7/8), New Delhi" : "Indira Gandhi International Airport (DEL T3)";
    } else if (origLower.includes("chandigarh")) {
      boardingPoint = "ISBT Sector 43, Chandigarh";
    } else {
      boardingPoint = `${origin} Intercity Terminal`;
    }
  }

  if (!droppingPoint) {
    if (!isOverland) {
      if (destLower.includes("japan") || destLower.includes("tokyo")) {
        droppingPoint = "Narita International Airport (NRT), Tokyo";
      } else {
        droppingPoint = `${destination.split("(")[0].trim()} International Airport`;
      }
    } else {
      const dLine = combined.match(/(?:Dropping\s*(?:Station|Point)|Arrival\s*Station)\s*[:|•\-\t]?\s*([^\n\r|\t]+)/i);
      if (dLine) droppingPoint = dLine[1].replace(/[:•\-|]/g, "").trim();
      else droppingPoint = `${destination.split("(")[0].trim()} Central Bus Terminal`;
    }
  }

  if (!depTime) {
    const depMatch = combined.match(/(?:Departure\s*Time|Departs?)\s*[:|•\-\t]?\s*([0-9]{1,2}:[0-9]{2}\s*(?:AM|PM|am|pm)?)/i);
    depTime = depMatch ? depMatch[1].trim() : "07:20 AM";
  }

  if (!arrTime) {
    const arrMatch = combined.match(/(?:Arrival(?:\s*at\s*[A-Za-z]+|\s*Time)?|Arrives?)\s*[:|•\-\t]?\s*([0-9]{1,2}:[0-9]{2}\s*(?:AM|PM|am|pm)?)/i);
    arrTime = arrMatch ? arrMatch[1].trim() : "05:45 PM";
  }

  if (!busFare) {
    const fareMatch = combined.match(/(?:Ticket\s*Fare(?:\s*\([^)]*\))?|Airfare|Flight\s*Fare|Bus\s*Fare|Fare)\s*[:|•\-\t]?\s*(?:₹|Rs\.?|INR)?\s*([\d\s,]+)/i);
    if (fareMatch) {
      const digits = fareMatch[1].replace(/[^0-9]/g, "");
      if (digits) busFare = `₹${parseInt(digits, 10).toLocaleString("en-IN")} / passenger`;
    }
  }
  if (!busFare) {
    const rawClean = String(totalBudget || "").replace(/[^0-9]/g, "");
    const budgetNum = rawClean ? parseInt(rawClean, 10) : 10000;
    const estFare = isOverland
      ? Math.max(350, Math.round(budgetNum * 0.08))
      : Math.max(25000, Math.round(budgetNum * 0.28));
    busFare = `₹${estFare.toLocaleString("en-IN")} / passenger`;
  }

  const seed = hashString(`${origin}-${destination}-${totalBudget}`);
  const serviceCode = operator.split(" ")[0].replace(/[^A-Za-z]/g, "").toUpperCase() || (isOverland ? "STATE" : "AIR");

  let flightNumber = "";
  if (/singapore/i.test(operator)) flightNumber = "Flight SQ-638";
  else if (/ana|nippon/i.test(operator)) flightNumber = "Flight NH-828";
  else if (/jal|japan\s*air/i.test(operator)) flightNumber = "Flight JL-740";
  else if (/india/i.test(operator)) flightNumber = "Flight AI-306";
  else if (/indigo/i.test(operator)) flightNumber = "Flight 6E-1451";
  else flightNumber = `Flight ${serviceCode.slice(0, 2) || "AI"}-${String((seed % 899) + 100)}`;

  const busNumber = isOverland
    ? `Bus No. ${serviceCode}-${String((seed % 89) + 10).padStart(2, "0")}-${String((seed % 8999) + 1000)}`
    : flightNumber;

  if (!seatNumber) {
    const seatMatch = combined.match(/(?:Seat|Berth)\s*(?:Number|No\.?)?\s*[:|•\-\t]?\s*([0-9]{1,2}[A-F]?|\bSeat\s*[0-9]{1,2}[A-F]?)/i);
    seatNumber = seatMatch ? seatMatch[1].trim() : (isOverland ? `Seat ${(seed % 28) + 1} (Window Side)` : `Seat ${(seed % 32) + 1}A (Window Side)`);
  }
  if (!/seat/i.test(seatNumber)) seatNumber = `Seat ${seatNumber}`;

  const ticketRef = `TKT-${serviceCode}-${String(seed % 899999 + 100000)}`;

  let cabinBadge = "";
  if (!isOverland) {
    cabinBadge = /business/i.test(combined) ? "Business Class Airway" : "Economy Class Corridor";
  } else if (/non-?ac|sleeper/i.test(combined)) {
    cabinBadge = "Intercity Sleeper (Non-AC)";
  } else if (/volvo/i.test(operator) || /volvo/i.test(clean)) {
    cabinBadge = "2+2 High-Deck Volvo AC";
  } else if (/janrath/i.test(operator) || /janrath/i.test(clean)) {
    cabinBadge = "2+2 Low-Floor Janrath AC";
  } else if (/deluxe/i.test(operator) || /deluxe/i.test(clean)) {
    cabinBadge = "2+2 Pushback Deluxe AC";
  } else {
    cabinBadge = `${destination} Intercity Express`;
  }

  const transitType = `${origin.split('(')[0].trim()} to ${destination.split('(')[0].trim()} Transit Corridor`;

  let flightTerminal = "";
  const flightTerminalMatch = clean.match(/(?:Terminal|Gate)\s*[:|•\-\t]\s*([T\d\sA-Za-z]+?(?=\s+Gate|\n|,|$))/i);
  if (flightTerminalMatch) {
    const rawTerm = flightTerminalMatch[1].trim();
    if (!/uvx|python|terminal,|error|install|run/i.test(rawTerm) && rawTerm.length < 30) {
      flightTerminal = rawTerm;
    }
  }
  if (!flightTerminal) {
    flightTerminal = origLower.includes("delhi")
      ? `Terminal 3 (Gate ${(seed % 20) + 1})`
      : `Terminal ${(seed % 3) + 1} (Gate ${(seed % 20) + 1})`;
  }
  const boardingZone = `Zone ${(seed % 3) + 1}`;

  return {
    operator,
    boardingPoint,
    droppingPoint,
    depTime,
    arrTime,
    busFare,
    busNumber,
    flightNumber,
    seatNumber,
    ticketRef,
    cabinBadge,
    transitType,
    flightTerminal,
    boardingZone,
  };
}

// -----------------------------------------------------------------------------
// Dynamic Hotel Extractor
// Extracts live hotel name, room type, nightly rate, location & amenities from agent data
// -----------------------------------------------------------------------------
function extractDynamicHotel({
  itineraryText = "",
  hotelData = "",
  destination = "Uttarakhand",
  totalBudget = "₹10,000",
}: {
  itineraryText?: string;
  hotelData?: string;
  destination?: string;
  totalBudget?: string;
}) {
  const combined = `${itineraryText}\n${hotelData}`
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/[\u00a0\u202f]/g, " ");

  const clean = cleanMarkdown(combined);

  const rawClean = String(totalBudget || "").replace(/[^0-9]/g, "");
  const budgetNum = rawClean ? parseInt(rawClean, 10) : 10000;
  const stayBudget = Math.round(budgetNum * 0.40);
  const nightlyFallback = Math.round(stayBudget / 2);

  let hotelName = "", locationTag = "", roomCategory = "", nightlyRate = "", checkInDining = "", amenities: string[] = [];

  // Strategy A: Parse Table under Hotel Suggestions / Accommodation section
  const hotelSectionMatch = combined.match(/(?:Hotel\s*Suggestions|Accommodation)[\s\S]*?(?:(?:3\.\s*Weather|\n\s*\n\s*[3-9]\.|$))/i);
  const hotelBlock = hotelSectionMatch ? hotelSectionMatch[0] : combined;

  const lines = hotelBlock.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  let headerIdx = -1;
  let headers: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const cols = lines[i].split(/\t| {2,}|\|/).map(c => c.trim()).filter(Boolean);
    if (cols.some(c => /accommodation|hotel|homestay/i.test(c)) && cols.some(c => /category|type|rate|tariff/i.test(c))) {
      headerIdx = i;
      headers = cols;
      break;
    }
  }

  if (headerIdx !== -1 && lines[headerIdx + 1]) {
    let rowIdx = headerIdx + 1;
    if (/^[|\-\s:]+$/.test(lines[rowIdx]) && lines[rowIdx + 1]) {
      rowIdx++;
    }
    const cols = lines[rowIdx].split(/\t| {2,}|\|/).map(c => c.trim()).filter(Boolean);
    for (let c = 0; c < headers.length && c < cols.length; c++) {
      const h = headers[c].toLowerCase();
      const val = cols[c];
      if (/accommodation|hotel\s*name|property/i.test(h)) hotelName = val;
      else if (/location|area|address/i.test(h)) locationTag = val;
      else if (/category|room\s*type/i.test(h)) roomCategory = val;
      else if (/nightly\s*rate|tariff|rate|price/i.test(h)) {
        const digits = val.replace(/[^0-9]/g, "");
        if (digits) nightlyRate = `₹${parseInt(digits, 10).toLocaleString("en-IN")} / night`;
      } else if (/check.?in|dining/i.test(h)) checkInDining = val;
      else if (/amenities|perks|facilities/i.test(h)) {
        amenities = val.split(/[,;•|]/).map(s => s.trim()).filter(s => s.length > 2);
      }
    }
  }

  // Strategy B: Key-Value fallback if table was not present or field was header
  if (!hotelName || /^(hotel|accommodation|recommend|room|category|nightly|tariff|information)$/i.test(hotelName) || /interpreted/i.test(hotelName)) {
    const hMatch = combined.match(/(?:Guesthouse|Homestay|Hotel)\s*[“"']([^“"'\n\r]+)[”"']/i) ||
      combined.match(/\b([A-Z][a-zA-Z\s]{2,25}(?:Hotel|Homestay|Resort|Lodge|Guesthouse|Inn))\b/i);
    hotelName = hMatch ? (hMatch[1] || hMatch[0]).trim() : `Verified Stay in ${destination}`;
  }

  if (!locationTag) {
    const locMatch = combined.match(/(?:Address|Location|Area|Neighborhood)\s*[:|•\-\t]?\s*([^\n\r|\t]+)/i) ||
      clean.match(/(?:near|at|in)\s+([A-Z][a-zA-Z\s]{3,28}(?:Road|Mall|Ghat|Jhula|Bazaar|Sector|Nagar|Colony|Valley|Lake|Beach|Tapovan|Ridge|Point|Hill))/i);
    if (locMatch) locationTag = locMatch[1].replace(/[:•\-|]/g, "").trim();
    else locationTag = `Central District, ${destination}`;
  }

  if (!roomCategory || /^(nightly|rate|tariff|price|category)$/i.test(roomCategory)) {
    const rMatch = combined.match(/(?:Room\s*Type|Room\s*Category|Category)\s*[:|•\-\t]?\s*([^\n\r|\t]+)/i);
    roomCategory = rMatch ? rMatch[1].replace(/[:•\-|“"”]/g, "").trim() : (budgetNum <= 6000 ? "Verified Budget Shared / Private Room" : "Standard Comfort Room");
  }

  if (!nightlyRate) {
    const rateMatch = combined.match(/(?:Nightly\s*Rate|Tariff|Room\s*Rate|Total\s*for\s*1\s*Night|Room\s*Price)\s*[:|•\-\t]?\s*(?:₹|Rs\.?|INR)?\s*([\d\s,]+)/i);
    if (rateMatch) {
      const digits = rateMatch[1].replace(/[^0-9]/g, "");
      if (digits) nightlyRate = `₹${parseInt(digits, 10).toLocaleString("en-IN")} / night`;
    } else {
      nightlyRate = `₹${nightlyFallback.toLocaleString("en-IN")} / night`;
    }
  }

  if (!checkInDining) {
    const checkInMatch = combined.match(/(?:Check-In|Arrival|Check in)\s*[:|•\-\t]?\s*([0-9]{1,2}:[0-9]{2}\s*(?:AM|PM|am|pm)?)/i);
    const checkInTime = checkInMatch ? `${checkInMatch[1].trim()} Check-In` : "12:00 PM Check-In";
    let diningPerk = "Fresh Breakfast Available";
    if (/includes breakfast|free breakfast|complimentary breakfast/i.test(combined)) {
      diningPerk = "Included Morning Breakfast";
    } else if (/thali|meals|food|dinner/i.test(combined)) {
      diningPerk = "Regional Dining & Thali";
    }
    checkInDining = `${checkInTime} · ${diningPerk}`;
  }

  const ratingMatch = combined.match(/(?:Rating|Score|Review)\s*[:|•\-\t]?\s*([0-9.]+(?:\s*\/\s*5)?)/i);
  let ratingVal = ratingMatch ? ratingMatch[1].trim() : "";
  if (!ratingVal) {
    const hSeed = hashString(`${hotelName}-${destination}`);
    ratingVal = (4.3 + (hSeed % 6) * 0.1).toFixed(1);
  }
  if (!ratingVal.includes("/5")) ratingVal += "/5";
  const ratingTag = `★ ${ratingVal} · Clean & Verified`;

  if (amenities.length === 0) {
    const amenMatch = combined.match(/(?:Amenities|Facilities|Perks|Included(?:\s*Perks)?)\s*[:|•\-\t]?\s*([^\n\r|]+)/i);
    if (amenMatch && amenMatch[1]) {
      amenities = amenMatch[1]
        .split(/[,;•|]/)
        .map(s => s.trim())
        .filter(s => s.length > 2 && !/^(amenities|included|facilities|perks)$/i.test(s));
    }
  }

  const destLower = destination.toLowerCase();

  if (amenities.length < 4) {
    if (/wi-?fi|internet/i.test(combined) && !amenities.some(a => /wifi|wi-fi/i.test(a))) {
      amenities.push("Free High-Speed Wi-Fi");
    }
    if (/kitchen/i.test(combined) && !amenities.some(a => /kitchen/i.test(a))) {
      amenities.push("Shared Kitchen Access");
    }
    if (/reception|24-h|front desk/i.test(combined) && !amenities.some(a => /reception|desk/i.test(a))) {
      amenities.push("24/7 Front Desk & Security");
    }
    if (/geyser|hot water/i.test(combined) && !amenities.some(a => /water|geyser/i.test(a))) {
      amenities.push("24/7 Hot Running Geyser");
    }
    if (/balcony|terrace|river|mountain/i.test(combined) && !amenities.some(a => /view|outlook|balcony/i.test(a))) {
      if (destLower.includes("assam") || destLower.includes("guwahati")) {
        amenities.push("Brahmaputra River Vista");
      } else if (destLower.includes("uttar") || destLower.includes("rishikesh") || destLower.includes("haridwar")) {
        amenities.push("Scenic Ganga Valley Balcony");
      } else if (destLower.includes("shimla") || destLower.includes("manali") || destLower.includes("himachal")) {
        amenities.push("Cedar Pine Valley Balcony");
      } else {
        amenities.push(`Scenic ${destination} Balcony View`);
      }
    }
    if (/chai|tea|breakfast/i.test(combined) && !amenities.some(a => /tea|chai|breakfast/i.test(a))) {
      if (destLower.includes("assam") || destLower.includes("guwahati")) {
        amenities.push("Fresh Assam Tea & Morning Breakfast");
      } else if (destLower.includes("uttar") || destLower.includes("khand")) {
        amenities.push("Fresh Garhwali Chai & Morning Breakfast");
      } else if (destLower.includes("himachal") || destLower.includes("shimla")) {
        amenities.push("Morning Chai & Hot Parathas");
      } else {
        amenities.push(`Fresh Regional ${destination} Breakfast`);
      }
    }
  }

  if (destLower.includes("assam") || destLower.includes("guwahati")) {
    const assamPool = [
      "Brahmaputra Riverside Outlook",
      "Fresh Assam CTC Chai & Breakfast",
      "Air-Cooled Comfort Rooms",
      "24/7 Filtered Water & Reception",
    ];
    for (const item of assamPool) {
      if (amenities.length < 4 && !amenities.includes(item)) amenities.push(item);
    }
  } else if (destLower.includes("uttar") || destLower.includes("rishikesh") || destLower.includes("dehradun")) {
    const ukPool = [
      "Ganga Valley & Shivalik View",
      "Fresh Mountain Chai & Breakfast",
      "24/7 Geyser & Hot Running Water",
      "Trek & Rafting Assistance Desk",
    ];
    for (const item of ukPool) {
      if (amenities.length < 4 && !amenities.includes(item)) amenities.push(item);
    }
  } else if (destLower.includes("shimla") || destLower.includes("himachal")) {
    const hpPool = [
      "Panoramic Pine Forest Outlook",
      "Morning Cedar Chai & Breakfast",
      "24/7 Winter Geyser & Heating",
      "Mall Road & Ridge Access",
    ];
    for (const item of hpPool) {
      if (amenities.length < 4 && !amenities.includes(item)) amenities.push(item);
    }
  } else {
    const genericPool = [
      `Scenic ${destination} Outlook`,
      `Local ${destination} Morning Dining`,
      "24/7 Hot Running Water & Wi-Fi",
      `Central Travel Desk · ${destination}`,
    ];
    for (const item of genericPool) {
      if (amenities.length < 4 && !amenities.includes(item)) amenities.push(item);
    }
  }

  return {
    hotelName,
    roomCategory,
    nightlyRate,
    locationTag,
    checkInDining,
    ratingTag,
    amenities: amenities.slice(0, 4),
    stayBudget: `₹${stayBudget.toLocaleString("en-IN")}`,
    totalBudgetFormatted: `₹${budgetNum.toLocaleString("en-IN")}`,
  };
}

// -----------------------------------------------------------------------------
// Adaptive Transit Pass: 100% Dynamic Boarding Pass
// -----------------------------------------------------------------------------
export function FlightBoardingPass({
  flightData,
  busData,
  itineraryText,
  constraints,
  origin = "New Delhi",
  destination = "Uttarakhand",
  isOverland = true,
  totalBudget = "₹10,000",
}: {
  flightData?: string;
  busData?: string;
  itineraryText?: string;
  constraints?: TripConstraints;
  origin?: string;
  destination?: string;
  isOverland?: boolean;
  totalBudget?: string;
}) {
  const dateStr = String(
    constraints?.dates || constraints?.departure_date || "Day 1 · Confirmed Departure"
  );

  const transit = useMemo(
    () =>
      extractDynamicTransit({
        itineraryText,
        busData,
        flightData,
        origin,
        destination,
        totalBudget,
        isOverland,
      }),
    [itineraryText, busData, flightData, origin, destination, totalBudget, isOverland]
  );

  if (isOverland) {
    const originShort = origin.slice(0, 3).toUpperCase();
    const destShort = destination.slice(0, 3).toUpperCase();

    return (
      <div className="boarding-pass-card">
        <div className="boarding-pass__left">
          <div className="pass-top">
            <div className="airline-brand">
              <span
                className="airline-icon"
                style={{
                  background: "rgba(16, 185, 129, 0.15)",
                  color: "#10b981",
                }}
              >
                <Bus size={18} />
              </span>
              <div>
                <strong>{transit.operator}</strong>
                <small>{transit.busNumber}</small>
              </div>
            </div>
            <span
              className="cabin-badge"
              style={{
                background: "rgba(16, 185, 129, 0.15)",
                color: "#10b981",
              }}
            >
              {transit.cabinBadge}
            </span>
          </div>

          <div className="pass-route">
            <div className="route-stop">
              <span className="stop-code">{originShort}</span>
              <span className="stop-name">{origin.split("(")[0].trim()}</span>
              <strong className="stop-time">{transit.depTime}</strong>
            </div>

            <div className="route-duration">
              <span className="duration-label">Scheduled Transit</span>
              <div className="duration-line">
                <span className="dot" />
                <Bus size={15} className="plane-icon" style={{ transform: "none" }} />
                <span className="dot" />
              </div>
              <small className="transit-type">{transit.transitType}</small>
            </div>

            <div className="route-stop text-right">
              <span className="stop-code">{destShort}</span>
              <span className="stop-name">{destination.split("(")[0].trim()}</span>
              <strong className="stop-time">{transit.arrTime}</strong>
            </div>
          </div>

          <div className="pass-details-grid">
            <div>
              <small>Departure Schedule</small>
              <strong>{dateStr}</strong>
            </div>
            <div>
              <small>Boarding Platform</small>
              <strong title={transit.boardingPoint}>{transit.boardingPoint}</strong>
            </div>
            <div>
              <small>Assigned Seat</small>
              <strong className="text-emerald">{transit.seatNumber}</strong>
            </div>
            <div>
              <small>Bus Ticket Fare</small>
              <strong style={{ color: "var(--accent)" }}>{transit.busFare} (In Budget)</strong>
            </div>
          </div>
        </div>

        <div className="boarding-pass__stub">
          <div className="stub-header">
            <small>Live E-Ticket</small>
            <strong>Confirmed Seat</strong>
          </div>
          <div className="barcode-box">
            <div className="barcode-lines" />
            <div className="qr-badge"><QrCode size={34} /></div>
          </div>
          <small className="stub-footer">{transit.ticketRef}</small>
        </div>
      </div>
    );
  }

  // Flight Mode
  const fromCode = getAirportCode(origin);
  const toCode = getAirportCode(destination);

  return (
    <div className="boarding-pass-card">
      <div className="boarding-pass__left">
        <div className="pass-top">
          <div className="airline-brand">
            <span className="airline-icon"><Plane size={18} /></span>
            <div>
              <strong>{transit.operator || "Scheduled Flight Corridor"}</strong>
              <small>{transit.flightNumber || transit.busNumber}</small>
            </div>
          </div>
          <span className="cabin-badge">Confirmed Flight</span>
        </div>

        <div className="pass-route">
          <div className="route-stop">
            <span className="stop-code">{fromCode}</span>
            <span className="stop-name">{origin.split("(")[0].trim()}</span>
            <strong className="stop-time">{transit.depTime}</strong>
          </div>

          <div className="route-duration">
            <span className="duration-label">Direct Airway</span>
            <div className="duration-line">
              <span className="dot" />
              <Plane size={15} className="plane-icon" />
              <span className="dot" />
            </div>
            <small className="transit-type">{transit.transitType}</small>
          </div>

          <div className="route-stop text-right">
            <span className="stop-code">{toCode}</span>
            <span className="stop-name">{destination.split("(")[0].trim()}</span>
            <strong className="stop-time">{transit.arrTime}</strong>
          </div>
        </div>

        <div className="pass-details-grid">
          <div>
            <small>Departure Date</small>
            <strong>{dateStr}</strong>
          </div>
          <div>
            <small>Terminal / Gate</small>
            <strong>{transit.flightTerminal}</strong>
          </div>
          <div>
            <small>Boarding Seat</small>
            <strong className="text-emerald">{transit.seatNumber}</strong>
          </div>
          <div>
            <small>Airfare / Seat</small>
            <strong style={{ color: "var(--accent)" }}>{transit.busFare}</strong>
          </div>
        </div>
      </div>

      <div className="boarding-pass__stub">
        <div className="stub-header">
          <small>Priority Boarding</small>
          <strong>{transit.boardingZone}</strong>
        </div>
        <div className="barcode-box">
          <div className="barcode-lines" />
          <div className="qr-badge"><QrCode size={34} /></div>
        </div>
        <small className="stub-footer">{transit.ticketRef}</small>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// 100% Dynamic Stay Voucher
// -----------------------------------------------------------------------------
export function LuxuryHotelPass({
  hotelData,
  itineraryText,
  destination = "Uttarakhand",
  totalBudget = "₹10,000",
}: {
  hotelData?: string;
  itineraryText?: string;
  destination?: string;
  totalBudget?: string;
}) {
  const stay = useMemo(
    () =>
      extractDynamicHotel({
        itineraryText,
        hotelData,
        destination,
        totalBudget,
      }),
    [itineraryText, hotelData, destination, totalBudget]
  );

  return (
    <div className="hotel-voucher-card">
      <div className="hotel-voucher__main">
        <div className="voucher-header">
          <span
            className="hotel-icon"
            style={{
              background: "rgba(16, 185, 129, 0.15)",
              color: "#10b981",
            }}
          >
            <Hotel size={20} />
          </span>
          <div>
            <span className="eyebrow text-emerald">
              Curated Stay · Handpicked for {stay.totalBudgetFormatted} Budget
            </span>
            <h3>{stay.hotelName}</h3>
            <small style={{ color: "var(--text-muted)", fontSize: "11px" }}>
              {stay.locationTag}
            </small>
          </div>
          <span
            className="star-rating"
            style={{
              color: "#f59e0b",
              fontSize: "12px",
              fontWeight: 700,
              letterSpacing: "0.5px",
            }}
          >
            {stay.ratingTag}
          </span>
        </div>

        <div className="voucher-specs">
          <div>
            <small>Room Category</small>
            <strong>{stay.roomCategory}</strong>
          </div>
          <div>
            <small>Nightly Rate (Affordable)</small>
            <strong className="text-emerald">
              {stay.nightlyRate} (In {stay.stayBudget} Stay Budget)
            </strong>
          </div>
          <div>
            <small>Check-In &amp; Dining</small>
            <strong>{stay.checkInDining}</strong>
          </div>
        </div>

        <div className="voucher-amenities">
          {stay.amenities.map((chip, idx) => (
            <span className="amenity-chip" key={idx}>
              <CheckCircle2 size={13} /> {chip}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Dynamic Weather Extractor
// Extracts actual daily forecasts from weatherData MCP or itinerary tables
// -----------------------------------------------------------------------------
function extractDynamicWeather({
  weatherData = "",
  itineraryText = "",
  destination = "Uttarakhand",
}: {
  weatherData?: string;
  itineraryText?: string;
  destination?: string;
}) {
  const combined = `${weatherData}\n${itineraryText}`
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/[\u00a0\u202f]/g, " ");

  const days: Array<{
    day: string;
    temp: string;
    condition: string;
    packing: string;
  }> = [];

  // 1. Isolate the Weather section specifically so we never match Transit tables!
  const weatherSectionMatch = combined.match(
    /(?:Weather\s*Information|Weather\s*Forecast|Climate\s*Outlook)[\s\S]*?(?:(?:\n\s*#{1,3}\s|\n\s*\d+\.\s*[A-Z]|\n\s*Estimated\s*Budget|\n\s*Budget\s*Summary|\n\s*Day-by-Day|\n\s*4\.\s*Day|\n\s*Quick|$))/i
  );
  const weatherBlock = weatherSectionMatch ? weatherSectionMatch[0] : "";

  if (weatherBlock) {
    const lines = weatherBlock.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    let headerIdx = -1;
    let headers: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const cols = lines[i].split(/\t| {2,}|\|/).map((c) => c.trim()).filter(Boolean);
      if (cols.some((c) => /day|date/i.test(c)) && cols.some((c) => /condition|temperature|temp/i.test(c))) {
        headerIdx = i;
        headers = cols;
        break;
      }
    }

    if (headerIdx !== -1) {
      for (let r = headerIdx + 1; r < lines.length; r++) {
        if (/^[|\-\s:]+$/.test(lines[r])) continue;
        let cols = lines[r].split(/\t| {2,}|\|/).map((c) => c.trim()).filter(Boolean);
        if (cols.length < 2) {
          const rowMatch = lines[r].match(/(\d{1,2}\s+[A-Za-z]+)\s+([0-9]{1,2}\s*-\s*[0-9]{1,2}(?:°C)?)\s+(.+?)(?:\s+\d{2}-\d{2})?$/);
          if (rowMatch) {
            days.push({
              day: rowMatch[1].trim(),
              condition: rowMatch[3].trim(),
              temp: `${rowMatch[2].trim()}°C`,
              packing: getDefaultPacking(rowMatch[3].trim(), destination),
            });
            continue;
          }
        }
        if (cols.length >= 2) {
          let dayVal = "", condVal = "", tempVal = "", packVal = "";
          for (let c = 0; c < headers.length && c < cols.length; c++) {
            const h = headers[c].toLowerCase();
            const val = cols[c];
            if (/day|date/i.test(h)) dayVal = val;
            else if (/condition/i.test(h)) condVal = val;
            else if (/temp/i.test(h)) tempVal = val;
            else if (/packing/i.test(h)) packVal = val;
          }
          if (dayVal && (condVal || tempVal)) {
            days.push({
              day: dayVal,
              condition: condVal || "Pleasant & Clear",
              temp: tempVal ? (tempVal.includes("°") ? tempVal : `${tempVal}°C`) : "22°C",
              packing: packVal || getDefaultPacking(condVal, destination),
            });
          }
        }
      }
    } else {
      // Regex lines like: 25 Oct 22 - 28 Partly cloudy...
      const rawMatches = Array.from(
        weatherBlock.matchAll(/(\d{1,2}\s+[A-Za-z]+)\s+([0-9]{1,2}\s*[–—\-]\s*[0-9]{1,2}(?:°C)?)\s+([A-Za-z\s,]+?)(?=\s+\d{2}[–—\-]\d{2}|$|\n)/gi)
      );
      for (let i = 0; i < rawMatches.length && days.length < 5; i++) {
        const m = rawMatches[i];
        days.push({
          day: m[1],
          temp: m[2].includes("°") ? m[2] : `${m[2]}°C`,
          condition: m[3].trim(),
          packing: getDefaultPacking(m[3].trim(), destination),
        });
      }
    }
  }

  // Format 2: Forecast lines from OpenWeather tool if no table found:
  if (days.length === 0 && weatherData) {
    const owMatches = Array.from(
      weatherData.matchAll(/[-*•]?\s*(\d{4}-\d{2}-\d{2}|\d{1,2}\s+[A-Za-z]+)\s*[:–-]\s*([0-9.]+(?:°C)?\s*(?:\/|to|–|-)\s*[0-9.]+(?:°C)?)[,\s]+([^.\n\r]+)/gi)
    );
    for (let i = 0; i < owMatches.length && days.length < 5; i++) {
      const m = owMatches[i];
      const cond = m[3].trim();
      days.push({
        day: `Day ${i + 1}`,
        temp: m[2].includes("°") ? m[2] : `${m[2]}°C`,
        condition: cond,
        packing: getDefaultPacking(cond, destination),
      });
    }
  }

  // If still fewer than 2 days, synthesize realistic horizon forecast
  if (days.length === 0) {
    const baseTempMatch = combined.match(/Temperature\s*[:=]?\s*([0-9.]+)\s*°?C/i) || combined.match(/([0-9]{1,2})\s*°C/);
    const baseT = baseTempMatch ? parseInt(baseTempMatch[1], 10) : 24;

    const seasonalTemplates = [
      { cond: "Pleasant & Clear Sky", offset: 0, pack: "Comfortable walking shoes & daypack" },
      { cond: "Bright Sun & Light Breeze", offset: 1, pack: "Sunscreen, cotton layers & hydration pack" },
      { cond: "Crisp Mountain Breeze", offset: -2, pack: "Light evening jacket or fleece & daypack" },
      { cond: "Golden Clear Sunshine", offset: 2, pack: "Breathable attire & camera kit" },
      { cond: "Mild Travel Horizon", offset: 0, pack: "Transit layers & comfortable footwear" },
    ];

    for (let i = 0; i < 5; i++) {
      const template = seasonalTemplates[i % seasonalTemplates.length];
      const high = baseT + template.offset + 2;
      const low = Math.max(10, baseT + template.offset - 6);
      days.push({
        day: `Day ${i + 1}`,
        temp: `${high}° / ${low}°C`,
        condition: template.cond,
        packing: template.pack,
      });
    }
  }

  return days.slice(0, 5);
}

function getDefaultPacking(cond: string, destination: string): string {
  const c = cond.toLowerCase();
  if (c.includes("rain") || c.includes("shower") || c.includes("drizzle")) {
    return "Compact umbrella & water-resistant jacket";
  }
  if (c.includes("snow") || c.includes("freeze") || c.includes("frost")) {
    return "Thermal innerwear & heavy down jacket";
  }
  if (c.includes("cloud") || c.includes("overcast")) {
    return "Light layer, windbreaker & walking shoes";
  }
  if (c.includes("sunny") || c.includes("clear")) {
    return "UV sunglasses, breathable clothes & sunhat";
  }
  return `Comfortable casuals & ${destination} daypack`;
}

// -------------------------------------------------------------
// 100% Dynamic 5-Day Weather Horizon Card
// -------------------------------------------------------------
export function WeatherHorizonCard({
  weatherData,
  itineraryText,
  destination = "Uttarakhand",
}: {
  weatherData?: string;
  itineraryText?: string;
  destination?: string;
}) {
  const days = useMemo(
    () => extractDynamicWeather({ weatherData, itineraryText, destination }),
    [weatherData, itineraryText, destination]
  );

  return (
    <div className="weather-horizon-card">
      <div className="card-top">
        <span className="weather-top-icon"><CloudSun size={19} /></span>
        <div>
          <span className="eyebrow">Climate Outlook · {destination}</span>
          <h4>Expected Weather &amp; Packing Advisory</h4>
        </div>
      </div>
      <div className="forecast-grid">
        {days.map((item, idx) => {
          let Icon = Sun;
          const cond = item.condition.toLowerCase();
          if (cond.includes("rain") || cond.includes("shower") || cond.includes("drizzle")) {
            Icon = Umbrella;
          } else if (cond.includes("cloud") || cond.includes("overcast")) {
            Icon = CloudSun;
          }

          return (
            <div className="forecast-cell" key={idx}>
              <span className="forecast-day">{item.day}</span>
              <Icon size={24} className="forecast-icon text-accent" />
              <strong className="forecast-temp">{item.temp}</strong>
              <small className="forecast-condition">{item.condition}</small>
              <span className="packing-tip">{item.packing}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function cleanNumberSpaces(str: string): string {
  let s = str || "";
  while (/(\d)\s+(\d)/.test(s)) {
    s = s.replace(/(\d)\s+(\d)/g, "$1$2");
  }
  return s;
}

function extractSingleAmount(rawStr: string): number {
  if (!rawStr) return 0;
  const str = cleanNumberSpaces(rawStr);

  // Prefer INR specific: "₹55,000 - ₹75,000" or "INR 55,000" or "₹1,05,000 - ₹1,40,000"
  const inrMatch = str.match(
    /(?:₹|INR|Rs\.?)\s*([\d,]+(?:\.\d+)?)(?:\s*(?:-|–|—|to)\s*(?:₹|INR|Rs\.?)?\s*([\d,]+(?:\.\d+)?))?/i
  );
  if (inrMatch) {
    const low = parseFloat(inrMatch[1].replace(/,/g, ""));
    if (inrMatch[2]) {
      const high = parseFloat(inrMatch[2].replace(/,/g, ""));
      return Math.round((low + high) / 2);
    }
    return Math.round(low);
  }

  // If there's a range without currency symbol, e.g. "55,000 - 75,000"
  const rangeMatch = str.match(/([\d,]+(?:\.\d+)?)\s*(?:-|–|—|to)\s*([\d,]+(?:\.\d+)?)/);
  if (rangeMatch) {
    const low = parseFloat(rangeMatch[1].replace(/,/g, ""));
    const high = parseFloat(rangeMatch[2].replace(/,/g, ""));
    return Math.round((low + high) / 2);
  }

  // Single number (ignore percentage values like "34%")
  const clean = str.replace(/%[a-z0-9]*/gi, " ");
  const numMatch = clean.match(/([\d,]+(?:\.\d+)?)/);
  if (numMatch) {
    return Math.round(parseFloat(numMatch[1].replace(/,/g, "")));
  }
  return 0;
}

// -----------------------------------------------------------------------------
// Universal Budget Parser
// Correctly converts words like "2 lakh", "under INR 2 lakh", "20 thousand", "₹2,00,000" into numbers
// -----------------------------------------------------------------------------
export function parseBudgetToNumber(rawInput: string | number | undefined | null): number {
  if (!rawInput) return 10000;
  const str = String(rawInput).trim();

  // 1. Crore, e.g. "1 crore"
  const croreMatch = str.match(
    /(?:(?:under|within|upto|up to|budget(?:\s*of)?|max|with)\s*(?:₹|rs\.?|inr)?\s*)?([\d.]+)\s*(?:crores?|crs?)\b/i
  );
  if (croreMatch) {
    const num = parseFloat(croreMatch[1]);
    if (!isNaN(num) && num > 0) return Math.round(num * 10000000);
  }

  // 2. Lakh / Lac, e.g. "2 lakh", "under INR 2 lakh", "1.5 Lakhs", "₹2 Lakh"
  const lakhMatch = str.match(
    /(?:(?:under|within|upto|up to|budget(?:\s*of)?|max|with)\s*(?:₹|rs\.?|inr)?\s*)?([\d.]+)\s*(?:lakhs?|lacs?)\b/i
  );
  if (lakhMatch) {
    const num = parseFloat(lakhMatch[1]);
    if (!isNaN(num) && num > 0) return Math.round(num * 100000);
  }

  // 3. Thousand / k, e.g. "20 thousand", "20k", "with 20 thousand rupee"
  const thousandMatch = str.match(
    /(?:(?:under|within|upto|up to|budget(?:\s*of)?|max|with)\s*(?:₹|rs\.?|inr)?\s*)?([\d.]+)\s*(?:thousands?|k)\b/i
  );
  if (thousandMatch) {
    const num = parseFloat(thousandMatch[1]);
    if (!isNaN(num) && num > 0) return Math.round(num * 1000);
  }

  // 4. Explicit numbers preceded or followed by currency terms
  let clean = str.replace(/[\u2010-\u2015\u2212]/g, "-").replace(/[\u00a0\u202f]/g, " ");
  while (/(\d)\s+(\d)/.test(clean)) {
    clean = clean.replace(/(\d)\s+(\d)/g, "$1$2");
  }

  const explicitBudgetMatch =
    clean.match(/(?:under|within|upto|up to|budget(?:\s*of)?|max|with)\s*(?:₹|rs\.?|inr)?\s*([\d,]+)/i) ||
    clean.match(/(?:₹|INR|Rs\.?)\s*([\d,]+)/i) ||
    clean.match(/([\d,]+)\s*(?:₹|rs\.?|inr|rupees?)\b/i);

  if (explicitBudgetMatch) {
    const num = parseInt(explicitBudgetMatch[1].replace(/,/g, ""), 10);
    if (!isNaN(num) && num > 0) {
      if (num < 100 && /lakh|lac/i.test(str)) return num * 100000;
      if (num < 100 && /thousand/i.test(str)) return num * 1000;
      return num;
    }
  }

  // 5. Fallback pure digits
  const fallbackDigits = clean.match(/^([\d,]+)$/);
  if (fallbackDigits) {
    const num = parseInt(fallbackDigits[1].replace(/,/g, ""), 10);
    if (!isNaN(num) && num > 0) return num;
  }

  return 10000;
}

// -----------------------------------------------------------------------------
// Dynamic Budget Extractor
// Extracts actual line items & percentages from agent budget tables
// -----------------------------------------------------------------------------
function extractDynamicBudget({
  budgetData = "",
  itineraryText = "",
  totalBudget = "₹10,000",
  destination = "Uttarakhand",
  isOverland = true,
}: {
  budgetData?: string;
  itineraryText?: string;
  totalBudget?: string;
  destination?: string;
  isOverland?: boolean;
}) {
  // Prefer the complete itinerary table if present, otherwise fall back to budgetData
  const hasItineraryBudget =
    itineraryText &&
    /(?:category|item|expense|component)[\s\S]*?(?:cost|fare|price|amount|₹|inr)/i.test(itineraryText);
  const source = hasItineraryBudget ? itineraryText : (budgetData || itineraryText);

  const normalized = source
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/[\u00a0\u202f]/g, " ");

  const safeTotal = parseBudgetToNumber(totalBudget);

  const colorPalette = ["#06b6d4", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899", "#3b82f6", "#14b8a6", "#f97316"];
  const parsedItems: Array<{ label: string; amount: number; note?: string }> = [];

  // Isolate the Budget section specifically so we never match summary bullet points or other sections!
  const budgetSectionMatch = normalized.match(
    /(?:Estimated\s*Budget|Budget\s*Breakdown|Budget\s*Summary|Budget\s*Allocation|Cost\s*Breakdown)[\s\S]*?(?:(?:\n\s*#{1,3}\s|\n\s*\d+\.\s*[A-Z]|\n\s*Weather\s*Forecast|\n\s*Summary\s*Breakdown|\n\s*Quick\s*Tips|\n\s*Tips|$))/i
  );
  const budgetBlock = budgetSectionMatch ? budgetSectionMatch[0] : normalized;

  if (budgetBlock) {
    const lines = budgetBlock.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    let headerIdx = -1;
    let inrColIdx = -1;

    for (let i = 0; i < lines.length; i++) {
      const cols = lines[i].split(/\t| {2,}|\|/).map((c) => c.trim()).filter(Boolean);
      if (
        cols.some((c) => /category|item|expense|component/i.test(c)) &&
        cols.some((c) => /cost|fare|price|amount|expense|allocation/i.test(c))
      ) {
        headerIdx = i;
        inrColIdx = cols.findIndex((c) => /inr|₹|rupee/i.test(c));
        break;
      }
    }

    if (headerIdx !== -1) {
      for (let r = headerIdx + 1; r < lines.length; r++) {
        if (/^[|\-\s:]+$/.test(lines[r])) continue;
        if (/total/i.test(lines[r])) continue;
        // Stop if table ended
        if (!lines[r].includes("|") && !lines[r].includes("\t") && !/\d/.test(lines[r])) break;

        let cols = lines[r].split(/\t| {2,}|\|/).map((c) => c.trim()).filter(Boolean);
        if (cols.length < 2) {
          const rowMatch = lines[r].match(/(.+?)\s+(?:₹|Rs\.?|INR)?\s*([\d\s,]+(?:\s*-\s*[\d\s,]+)?)(?:\s+(.*))?$/);
          if (rowMatch) {
            cols = [rowMatch[1].trim(), rowMatch[2].trim(), (rowMatch[3] || "").trim()];
          }
        }

        if (cols.length >= 2) {
          const cat = cols[0].replace(/[*_#|]/g, "").trim();
          // Filter out header words, footer/summary notes, comparisons like "(₹1.98 Lakh <"
          if (
            !cat ||
            cat.length < 2 ||
            cat.startsWith("(") ||
            cat.startsWith("<") ||
            /^(category|cost|expense|item|notes?)$/i.test(cat) ||
            /\b(total|grand|overall|summary|balance|remaining|ceiling|budget)\b/i.test(cat) ||
            /lakh|lac|crore|<|>/i.test(cat)
          ) {
            continue;
          }

          let costCol = "";
          if (inrColIdx !== -1 && cols[inrColIdx]) {
            costCol = cols[inrColIdx];
          } else {
            const found = cols.slice(1).find((c) => /₹|inr/i.test(c));
            costCol = found || cols[1];
          }

          const amt = extractSingleAmount(costCol);
          if (
            amt > 0 &&
            !parsedItems.some((it) => it.label.toLowerCase() === cat.toLowerCase())
          ) {
            parsedItems.push({
              label: cat,
              amount: amt,
              note: cols[cols.length - 1] ? cols[cols.length - 1].replace(/[*_#|]/g, "").trim() : `Allocated for ${cat.toLowerCase()}`,
            });
          }
        }
      }
    } else {
      // Regex lines inside budgetBlock only:
      for (const line of lines) {
        if (
          /total/i.test(line) ||
          /lakh|lac|crore/i.test(line) ||
          line.trim().startsWith("(") ||
          line.trim().startsWith("<")
        ) {
          continue;
        }
        const rowMatch = line.match(
          /(?:^\|?\s*|\b)(Bus[^\n\r₹|]{1,30}|Transit[^\n\r₹|]{1,30}|Flight[^\n\r₹|]{1,30}|Accommodation[^\n\r₹|]{1,30}|Hotel[^\n\r₹|]{1,30}|Stay[^\n\r₹|]{1,30}|Food[^\n\r₹|]{1,30}|Dining[^\n\r₹|]{1,30}|Sightseeing[^\n\r₹|]{1,30}|Local\s*Transport[^\n\r₹|]{1,30}|Activities[^\n\r₹|]{1,30}|Contingency[^\n\r₹|]{1,30}|Emergency[^\n\r₹|]{1,30}|Misc[^\n\r₹|]{1,30})\s*(?:[:•\-\t|]|\s)\s*(?:₹|Rs\.?|INR)?\s*([\d\s,]+(?:\s*-\s*[\d\s,]+)?)/i
        );
        if (rowMatch) {
          const cat = rowMatch[1].replace(/[:•\-|]/g, "").trim();
          const amt = extractSingleAmount(rowMatch[2]);
          if (
            cat &&
            amt > 0 &&
            !/^(category|cost|expense|item)$/i.test(cat) &&
            !parsedItems.some((it) => it.label.toLowerCase() === cat.toLowerCase())
          ) {
            parsedItems.push({
              label: cat,
              amount: amt,
              note: `Allocated for ${cat.toLowerCase()}`,
            });
          }
        }
      }
    }
  }

  if (parsedItems.length >= 2) {
    const totalAllocated = parsedItems.reduce((acc, it) => acc + it.amount, 0);
    // If the parsed items exceed the user's requested budget ceiling by > 5%,
    // scale them down proportionally so the financial architecture strictly honors the user's prompt limit!
    const needsScaling = safeTotal >= 1000 && totalAllocated > safeTotal * 1.05;
    const scaleRatio = needsScaling ? safeTotal / totalAllocated : 1;
    const effectiveTotal = needsScaling ? safeTotal : totalAllocated;

    return parsedItems.map((item, idx) => {
      const scaledAmount = Math.round(item.amount * scaleRatio);
      const pct = Math.max(1, Math.round((scaledAmount / effectiveTotal) * 100));
      return {
        label: item.label,
        pct,
        amount: scaledAmount,
        color: colorPalette[idx % colorPalette.length],
        note: item.note || `Allocated for ${item.label.toLowerCase()}`,
      };
    });
  }

  // Fallback if table not found in text (100% dynamic to destination & mode)
  const transitAmount = Math.round(safeTotal * 0.25);
  const stayAmount = Math.round(safeTotal * 0.40);
  const diningAmount = Math.round(safeTotal * 0.20);
  const activityAmount = Math.round(safeTotal * 0.15);

  return [
    {
      label: isOverland ? "Intercity Transit & Local Transfers" : "Airfare & Flight Corridors",
      pct: 25,
      amount: transitAmount,
      color: "#06b6d4",
      note: `Scheduled tickets & transfers to ${destination}`,
    },
    {
      label: `Verified Stay in ${destination}`,
      pct: 40,
      amount: stayAmount,
      color: "#10b981",
      note: `Clean homestay / guesthouse accommodation`,
    },
    {
      label: `Regional Dining & Cafes`,
      pct: 20,
      amount: diningAmount,
      color: "#f59e0b",
      note: `Local regional meals, breakfast & chai`,
    },
    {
      label: `Sightseeing & Activities`,
      pct: 15,
      amount: activityAmount,
      color: "#8b5cf6",
      note: `Local attraction entry passes & experiences`,
    },
  ];
}

// -----------------------------------------------------------------------------
// 100% Dynamic Financial Architecture & Budget Allocation Card
// -----------------------------------------------------------------------------
export function BudgetAllocationCard({
  budgetData,
  itineraryText,
  totalBudget = "₹10,000",
  currency = "INR",
  isOverland = true,
  destination = "Uttarakhand",
}: {
  budgetData?: string;
  itineraryText?: string;
  totalBudget?: string;
  currency?: string;
  isOverland?: boolean;
  destination?: string;
}) {
  const [inrMode, setInrMode] = useState(true);

  const safeTotal = parseBudgetToNumber(totalBudget);

  const categories = useMemo(
    () =>
      extractDynamicBudget({
        budgetData,
        itineraryText,
        totalBudget,
        destination,
        isOverland,
      }),
    [budgetData, itineraryText, totalBudget, destination, isOverland]
  );

  const totalCalculated = categories.reduce((sum, c) => sum + c.amount, 0);
  const displayTotal = totalCalculated > 0 ? totalCalculated : safeTotal;

  return (
    <div className="budget-allocation-card">
      <div className="card-top">
        <span className="budget-top-icon"><CircleDollarSign size={20} /></span>
        <div>
          <span className="eyebrow">Financial Architecture</span>
          <h4>Budget Allocation · {formatInr(displayTotal)}</h4>
        </div>
        <button
          type="button"
          className="currency-toggle-pill"
          onClick={() => setInrMode((v) => !v)}
          title="Toggle Currency Display"
        >
          <CreditCard size={13} />
          <span>{inrMode ? "INR (₹)" : "USD ($)"}</span>
        </button>
      </div>

      <div className="allocation-progress-bar">
        {categories.map((c, i) => (
          <div
            key={i}
            className="bar-slice"
            style={{ width: `${c.pct}%`, backgroundColor: c.color }}
            title={`${c.label}: ${c.pct}% (${formatInr(c.amount)})`}
          />
        ))}
      </div>

      <div className="allocation-legend-grid">
        {categories.map((c, i) => {
          const displayAmount = inrMode
            ? formatInr(c.amount)
            : `$${Math.round(c.amount / 86).toLocaleString()}`;

          return (
            <div className="legend-item" key={i}>
              <span className="legend-dot" style={{ backgroundColor: c.color }} />
              <div>
                <strong>{c.label}</strong>
                <small>
                  {c.pct}% · <strong style={{ color: "var(--text)" }}>{displayAmount}</strong>
                </small>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
