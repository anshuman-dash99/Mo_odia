document.addEventListener("DOMContentLoaded", () => {

const output = document.getElementById("output");
const suggestionsBox = document.getElementById("suggestions");

const clearBtn = document.getElementById("clearBtn");
const copyBtn = document.getElementById("copyBtn");
const pasteBtn = document.getElementById("pasteBtn");

if (!output) {
    console.error("Output div not found");
    return;
}

let englishBuffer = "";
let committedText = "";

/* =========================
   LOAD LANGUAGE MODELS
========================= */
let trie = {};
let bigram = {};
let trigram = {};

async function loadModels() {
  trie = await fetch("https://huggingface.co/datasets/ad1998/odia_dictionary/resolve/main/unigram.json").then(r => r.json());
  bigram = await fetch("https://huggingface.co/datasets/ad1998/odia_dictionary/resolve/main/bigram.json").then(r => r.json());
  trigram = await fetch("https://huggingface.co/datasets/ad1998/odia_dictionary/resolve/main/trigram.json").then(r => r.json());
  console.log("All models loaded");
}
loadModels();
  // trie = "unigram.json";
  // bigram = "bigram.json";
  // trigram = "trigram.json";

/* =========================
   PREDICTION
========================= */

function getTrieSuggestions(prefix, limit = 5) {
    if (!prefix) return [];

    const results = [];

    for (let word in trie) {
        if (word.startsWith(prefix)) {
            results.push([word, trie[word]]);
        }
    }

    // Sort by frequency
    results.sort((a, b) => b[1] - a[1]);

    return results.slice(0, limit).map(r => r[0]);
}

function getBigramSuggestions(prevWord, limit = 5) {
    if (!bigram[prevWord]) return [];

    return Object.entries(bigram[prevWord])
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(e => e[0]);
}

function getTrigramSuggestions(w1, w2, limit = 5) {
    const key = w1 + " " + w2;
    if (!trigram[key]) return [];

    return Object.entries(trigram[key])
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(e => e[0]);
}

function placeCursorEnd(el) {
    el.focus();
    document.execCommand("selectAll", false, null);
    document.getSelection().collapseToEnd();
}

function predictNextWord() {
    const text = committedText.replace(/\u00A0/g, " ").trim();
    if (!text) return [];

    const words = text.split(/\s+/);
    const n = words.length;

    if (n >= 2) {
        const tri = getTrigramSuggestions(words[n-2], words[n-1]);
        if (tri.length) return tri;
    }

    if (n >= 1) {
        const bi = getBigramSuggestions(words[n-1]);
        if (bi.length) return bi;
    }

    return [];
}

function getSuggestions() {
    let trieSug = [];

    if (englishBuffer.length > 0) {
        const odiaWord = transliterateWord(englishBuffer);
        trieSug = getTrieSuggestions(odiaWord);
    }

    let nextSug = predictNextWord();

    let combined = [...new Set([...trieSug, ...nextSug])];

    return combined.slice(0, 5);
}

/* =========================
   SUGGESTIONS UI
========================= */
function showSuggestions(list) {
    suggestionsBox.innerHTML = "";

    if (!list || list.length === 0) {
        suggestionsBox.style.display = "none";
        return;
    }

    suggestionsBox.style.display = "flex";

    list.forEach(word => {
        const el = document.createElement("span");
        el.className = "suggestion";
        el.innerText = word;

        el.addEventListener("mousedown", (e) => {
            e.preventDefault();
            insertSuggestion(word);
        });

        suggestionsBox.appendChild(el);
    });
}


function insertSuggestion(word) {
    if (englishBuffer.length > 0) {
        committedText = committedText+ " " + word;
        englishBuffer = "";
    } else {
        committedText = committedText + " " + word;
    }

    committedText += " ";

    updateOutput();
    output.focus();

    placeCursorEnd(output);
}
/* =========================
   OUTPUT UPDATE
========================= */

function updateSuggestions() {
    let suggestions = [];

    if (englishBuffer.length > 0) {
        const odiaWord = transliterateWord(englishBuffer);
        suggestions = getTrieSuggestions(odiaWord);
    } else {
        suggestions = predictNextWord();
    }

    showSuggestions(suggestions);
}

/* =========================
   KEYBOARD INPUT
========================= */

function updateOutput() {
    const preview = transliterateWord(englishBuffer);

    let text = committedText + preview;

    text = text.replace(/ /g, "\u00A0");

    output.innerText = text;

    placeCursorEnd(output);

    updateSuggestions();
}


/* =========================
   MOBILE + DESKTOP INPUT
========================= */

let lastChar = "";

const odiaNumbers = {
  "0": "୦",
  "1": "୧",
  "2": "୨",
  "3": "୩",
  "4": "୪",
  "5": "୫",
  "6": "୬",
  "7": "୭",
  "8": "୮",
  "9": "୯"
};

output.addEventListener("beforeinput", (e) => {

    if (e.inputType === "insertText") {

        const ch = e.data;

        /* =========================
           LETTERS
        ========================= */

        if (/^[a-zA-Z]$/.test(ch)) {
            e.preventDefault();
            englishBuffer += ch;
            updateOutput();
            return;
        }

        /* =========================
           SPACE
        ========================= */

        if (ch === " ") {
            e.preventDefault();

            if (englishBuffer.length > 0) {
                committedText += transliterateWord(englishBuffer);
                englishBuffer = "";
            }

            committedText += " ";

            updateOutput();

            const nextSuggestions = predictNextWord();
            showSuggestions(nextSuggestions);

            lastChar = " ";
            return;
        }

        /* =========================
           ODIA NUMBERS
        ========================= */

        if (/[0-9]/.test(ch)) {
            e.preventDefault();

            if (englishBuffer.length > 0) {
                committedText += transliterateWord(englishBuffer);
                englishBuffer = "";
            }

            committedText += odiaNumbers[ch];

            updateOutput();
            lastChar = odiaNumbers[ch];
            return;
        }

        /* =========================
           RUPEE SYMBOL
        ========================= */

        if (ch === "$") {
            e.preventDefault();

            committedText += "₹";
            updateOutput();

            lastChar = "₹";
            return;
        }

        /* =========================
           PUNCTUATION
        ========================= */

        if ([".", ",", "?", "!"].includes(ch)) {

            e.preventDefault();

            if (englishBuffer.length > 0) {
                committedText += transliterateWord(englishBuffer);
                englishBuffer = "";
            }

            if (ch === ".") {

                // Double Purnacheda
                if (lastChar === "।") {
                    committedText = committedText.slice(0, -1);
                    committedText += "॥";
                    lastChar = "॥";
                } 
                else {
                    committedText += "।";
                    lastChar = "।";
                }

            } 
            else {
                committedText += ch;
                lastChar = ch;
            }

            updateOutput();
            return;
        }

    }

    /* =========================
       BACKSPACE
    ========================= */

    if (e.inputType === "deleteContentBackward") {
        e.preventDefault();

        if (englishBuffer.length > 0) {
            englishBuffer = englishBuffer.slice(0, -1);
        } 
        else {
            committedText = committedText.slice(0, -1);
        }

        updateOutput();
    }

    /* =========================
       DISABLE ENTER
    ========================= */

    if (e.inputType === "insertParagraph" || e.inputType === "insertLineBreak") {

        e.preventDefault();

        if (englishBuffer.length > 0) {
            committedText += transliterateWord(englishBuffer);
            englishBuffer = "";
        }

        committedText += "\n";

        updateOutput();

        lastChar = "\n";
        return;
    }

});


// output.addEventListener("keydown", (e) => {
//     if (e.key === " ") {
//         e.preventDefault();

//         if (englishBuffer.length > 0) {
//             committedText = committedText;
//             committedText += " " +transliterateWord(englishBuffer);
//             englishBuffer = "";
//         }
        
//         committedText += " ";
//         updateOutput();
//     }
// });

/* =========================
   BUTTONS
========================= */
clearBtn.addEventListener("click", () => {
  output.innerText = "";
  englishBuffer = "";
  suggestionsBox.innerHTML = "";
  output.focus();
});

copyBtn.addEventListener("click", async () => {
  await navigator.clipboard.writeText(output.textContent);
});

pasteBtn.addEventListener("click", async () => {
  const text = await navigator.clipboard.readText();
  englishBuffer += text;
  updateOutput();
});
/* =========================
   YOUR TRANSLITERATION RULE ENGINE
   (UNCHANGED FROM YOUR CODE)
========================= */

// Keep ALL your mappings exactly same here

const independentVowels = {
  RRu: "ୠ",
  Ru: "ଋ",
  a: "ଅ",
  aa: "ଆ",
  i: "ଇ",
  ii: "ଈ",
  u: "ଉ",
  uu: "ଊ",
  e: "ଏ",
  ai: "ଐ",
  o: "ଓ",
  au: "ଔ"
};

const vowelSigns = {
  a: "",
  aa: "ା",
  i: "ି",
  ii: "ୀ",
  u: "ୁ",
  uu: "ୂ",
  e: "େ",
  ai: "ୈ",
  o: "ୋ",
  au: "ୌ"
};

const specialSyllables = {
  kRu: "କୃ",
  gRu: "ଗୃ",
  pRu: "ପୃ",
  bRu: "ବୃ",
  dRu: "ଦୃ",
  tRu: "ତୃ",
  mRu: "ମୃ",
  nRu: "ନୃ"
};

const specialSigns = {
  MM: "ଁ",
  M: "ଂ"
};

const consonants = {
  kh: "ଖ",
  gh: "ଘ",
  chh: "ଛ",
  ch: "ଚ",
  jh: "ଝ",
  th: "ଥ",
  dh: "ଧ",
  Dh: "ଢ",
  ph: "ଫ",
  bh: "ଭ",
  sh: "ଶ",
  Sh: "ଷ",

  ny: "ନ୍ୟ",

  k: "କ",
  g: "ଗ",
  Ng: "ଙ",
  c: "ଚ",
  j: "ଜ",
  t: "ତ",
  T: "ଟ",
  d: "ଦ",
  D: "ଡ",
  n: "ନ",
  N: "ଣ",
  p: "ପ",
  b: "ବ",
  m: "ମ",
  y: "ୟ",
  Y: "ଯ",
  r: "ର",
  l: "ଲ",
  L: "ଳ",
  w: "ୱ",
  v: "ଭ",
  s: "ସ",
  h: "ହ"
};

const conjuncts = {

  strii: "ସ୍ତ୍ରୀ",
  stri: "ସ୍ତ୍ରି",
  str: "ସ୍ତ୍ର",
  
  ktrii: "କ୍ତ୍ରୀ",
  ktri: "କ୍ତ୍ରି",
  ktr: "କ୍ତ୍ର",

  kShma: "କ୍ଷ୍ମ",
  kShmi: "କ୍ଷ୍ମି",
  kShmii: "କ୍ଷ୍ମୀ",

  shri: "ଶ୍ରୀ",
  ksh: "କ୍ଷ",
  jna: "ଜ୍ଞ",

  rDh: "ଢ଼",
  rD: "ଡ଼",

  Nta: "ଣ୍ଟ",
  nta: "ନ୍ତ",
  ndh: "ନ୍ଧ",
  nda: "ନ୍ଦ",
  nkh: "ଙ୍ଖ",
  nka: "ଙ୍କ",
  nk: "ଙ୍କ",
  mbh: "ମ୍ଭ",
  mb: "ମ୍ବ",
  mp: "ମ୍ପ",
  nj: "ଞ୍ଜ",

  shr: "ଶ୍ର",
  shn: "ଷ୍ଣ",
  sch: "ଶ୍ଚ",
  ryya: "ର୍ଯ୍ୟ",
  rya: "ର୍ଯ",

  kra: "କ୍ର",
  kri: "କ୍ରି",
  kru: "କ୍ରୁ",
  kre: "କ୍ରେ",
  kro: "କ୍ରୋ",

  gra: "ଗ୍ର",
  gri: "ଗ୍ରି",
  gru: "ଗ୍ରୁ",

  pra: "ପ୍ର",
  pri: "ପ୍ରି",
  pru: "ପ୍ରୁ",

  bra: "ବ୍ର",
  bri: "ବ୍ରି",
  bru: "ବ୍ରୁ",

  dra: "ଦ୍ର",
  dri: "ଦ୍ରି",
  dru: "ଦ୍ରୁ",

  tra: "ତ୍ର",
  tri: "ତ୍ରି",
  tru: "ତ୍ରୁ",

  sx: "ସ୍"
};

const tokenOrder = [
  "strii",
  "stri",
  "str",

  "ktrii",
  "ktri",
  "ktr",

  "kShmii",
  "kShmi",
  "kShma",
  "kShm",

  "shri",
  "ksh",
  "jna",

  "RRu",
  "Ru",

  "kRu",
  "gRu",
  "pRu",
  "bRu",
  "dRu",
  "tRu",
  "mRu",
  "nRu",

  "rDh",
  "rD",

  "sx",
  "x",
  "MM",
  "M",

  "ryya",
  "sch",

  "Nta",
  "ndh",
  "nda",
  "nta",
  "nkh",
  "nka",
  "nk",
  "mbh",
  "mb",
  "mp",
  "nj",

  "shr",
  "shn",
  "rya",

  "kra",
  "kri",
  "kru",
  "kre",
  "kro",

  "gra",
  "gri",
  "gru",

  "pra",
  "pri",
  "pru",

  "bra",
  "bri",
  "bru",

  "dra",
  "dri",
  "dru",

  "tra",
  "tri",
  "tru",

  "chh",
  "kh",
  "gh",
  "ch",
  "jh",
  "th",
  "dh",
  "Dh",
  "Th",
  "ph",
  "bh",
  "sh",
  "Sh",
  "ny",

  "aa",
  "ii",
  "uu",
  "ai",
  "au",
  "a",
  "i",
  "u",
  "e",
  "o",

  "sx",
  "MM",
  "M",
  "Ny",
  "Ng",

  "k",
  "g",
  "c",
  "j",
  "t",
  "T",
  "d",
  "D",
  "n",
  "N",
  "p",
  "b",
  "m",
  "y",
  "Y",
  "r",
  "l",
  "L",
  "w",
  "v",
  "s",
  "h"
];

const vowelTokens = ["aa", "ii", "uu", "ai", "au", "a", "i", "u", "e", "o"];

function isRomanLetter(ch) {
  return /[A-Za-z]/.test(ch);
}

function getMatchedToken(text, index) {
  for (const token of tokenOrder) {
    if (text.startsWith(token, index)) {
      return token;
    }
  }
  return null;
}

function getNextVowelToken(text, index) {
  for (const v of vowelTokens) {
    if (text.startsWith(v, index)) {
      return v;
    }
  }
  return null;
}

function isConsonantLikeToken(token) {
  return !!(consonants[token] || conjuncts[token] || specialSyllables[token] || token === "Ny");
}

function transliterateWord(word) {
  let i = 0;
  let result = "";

  while (i < word.length) {

    // Visarga rule: ah only at end
      // Handle "ah" proper

      // Handle h (ହ or visarga)
      // Handle h (simple and correct)
if (word[i] === "h") {
    let prev = word[i - 1] || "";
    let next = word[i + 1] || "";

    let vowels = "aeiou";

    // If vowel before h AND consonant after → visarga
    if (vowels.includes(prev) && next && !vowels.includes(next)) {
        result += "ଃ";
    }
    // If h before vowel → ହ
    else if (vowels.includes(next)) {
        result += "ହ";
    }
    // If end of word after vowel → visarga
    else if (vowels.includes(prev) && !next) {
        result += "ଃ";
    }
    else {
        result += "ହ";
    }

    i += 1;
    continue;
}

    const token = getMatchedToken(word, i);

    if (!token) {
      i++;
      continue;
    }

    // Chandrabindu
    if (token === "MM") {
      result += "ଁ";
      i += 2;
      continue;
    }

    // Anuswara
    if (token === "M") {
      result += "ଂ";
      i += 1;
      continue;
    }

    // Halant
    if (token === "x") {
      result += "୍";
      i += 1;
      continue;
    }

    // nya -> ଞ
    if (token === "Ny") {
      result += "ଞ";
      i += 2;
      continue;
    }

    // Independent vowels
    if (independentVowels[token]) {
      result += independentVowels[token];
      i += token.length;
      continue;
    }

    // Conjuncts
    if (conjuncts[token]) {
      const base = conjuncts[token];
      const nextVowel = getNextVowelToken(word, i + token.length);

      if (nextVowel) {
        result += base + vowelSigns[nextVowel];
        i += token.length + nextVowel.length;
      } else {
        result += base;
        i += token.length;
      }
      continue;
    }

    // Consonants
    if (consonants[token]) {
      const base = consonants[token];
      const nextVowel = getNextVowelToken(word, i + token.length);

      if (nextVowel) {
        result += base + vowelSigns[nextVowel];
        i += token.length + nextVowel.length;
      } else {
        const nextToken = getMatchedToken(word, i + token.length);
        if (nextToken && isConsonantLikeToken(nextToken)) {
          result += base + "୍";
        } else {
          result += base;
        }
        i += token.length;
      }
      continue;
    }

    i++;
  }
    // Correct visarga handling (based on original input)
  // Fix combinations
  result = result
    .replace(/ଅା/g, "ଆ")
    .replace(/ଅି/g, "ଇ")
    .replace(/ଅୀ/g, "ଈ")
    .replace(/ଅୁ/g, "ଉ")
    .replace(/ଅୂ/g, "ଊ")
    .replace(/ଅେ/g, "ଏ")
    .replace(/ଅୈ/g, "ଐ")
    .replace(/ଅୋ/g, "ଓ")
    .replace(/ଅୌ/g, "ଔ")
    .replace(/ଶ୍ରି/g, "ଶ୍ରୀ")
    .replace(/ସ୍ତ୍ରି/g, "ସ୍ତ୍ରୀ")
    .replace(/କ୍ତ୍ରି/g, "କ୍ତ୍ରୀ")
    .replace(/ନମହ/g, "ନମଃ")
    .replace(/କ୍ରମଶହ/g, "କ୍ରମଶଃ");

  return result;
}
function transliterateText(text) {
  let result = "";
  let currentWord = "";

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (isRomanLetter(ch)) {
      currentWord += ch;
    } else {
      if (currentWord) {
        result += transliterateWord(currentWord);
        currentWord = "";
      }
      result += ch;
    }
  }

  if (currentWord) {
    result += transliterateWord(currentWord);
  }

  return result;
}

// independentVowels, vowelSigns, consonants,
// conjuncts, tokenOrder, transliterateWord,
// transliterateText etc.
// (Do NOT modify your rule logic)

});
