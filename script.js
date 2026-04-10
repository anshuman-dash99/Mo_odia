document.addEventListener("DOMContentLoaded", () => {

const output = document.getElementById("output");
const suggestionsBox = document.getElementById("suggestions");
const clearBtn = document.getElementById("clearBtn");
const copyBtn = document.getElementById("copyBtn");
const pasteBtn = document.getElementById("pasteBtn");
const themeToggle = document.getElementById("themeToggle");
// const pdfBtn = document.getElementById("downloadPdf");
const txtBtn = document.getElementById("downloadTxt");

if (!output) return;

output.contentEditable = true;

/* =========================
   THEME (🌗)
========================= */
// if (localStorage.getItem("theme") === "light") {
//   document.body.classList.add("light");
// }
const updateThemeIcon = () => {
  themeToggle.textContent = document.body.classList.contains("light")
    ? "☀️ Light"
    : "🌙 Dark";
};
themeToggle?.addEventListener("click", () => {
  document.body.classList.toggle("light");

  localStorage.setItem(
    "theme",
    document.body.classList.contains("light") ? "light" : "dark"
  );
});

/* =========================
   AUTO SAVE 💾
========================= */
const saveContent = () => {
  localStorage.setItem("odia_text", output.innerHTML);
};

output.addEventListener("input", saveContent);

window.addEventListener("load", () => {
  const saved = localStorage.getItem("odia_text");
  if (saved) {
    output.innerHTML = saved;
  }
});

/* =========================
//    PDF EXPORT 📄
// ========================= */
// pdfBtn?.addEventListener("click", () => {
//   const opt = {
//     margin: 10,
//     filename: "odia-typing.pdf",
//     image: { type: "jpeg", quality: 1 },
//     html2canvas: { scale: 2 },
//     jsPDF: { unit: "mm", format: "a4", orientation: "portrait" }
//   };

//   html2pdf().set(opt).from(output).save();
// });

// TEXT EXPORT
txtBtn?.addEventListener("click", () => {
  const text = output.innerText;

  const blob = new Blob([text], { type: "text/plain" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "odia-text.txt";
  a.click();

  URL.revokeObjectURL(url);
});
/* =========================
   STATE
========================= */
let englishBuffer = "";
let wordStartOffset = null;
let activeNode = null;

/* =========================
   LANGUAGE MODELS
========================= */
let trie = {}, bigram = {}, trigram = {};

async function loadModels() {
  trie = await fetch("https://huggingface.co/datasets/ad1998/odia_dictionary/resolve/main/unigram.json").then(r => r.json());
  bigram = await fetch("https://huggingface.co/datasets/ad1998/odia_dictionary/resolve/main/bigram.json").then(r => r.json());
  trigram = await fetch("https://huggingface.co/datasets/ad1998/odia_dictionary/resolve/main/trigram.json").then(r => r.json());
}
loadModels();

/* =========================
   HELPERS
========================= */
function ensureTextNode() {
  if (!output.firstChild) {
    output.appendChild(document.createTextNode(""));
  }
}

function getSafeNode() {
  const sel = window.getSelection();
  if (!sel.rangeCount) return null;

  let node = sel.getRangeAt(0).startContainer;

  // If not text node → create one
  if (node.nodeType !== 3) {
    const textNode = document.createTextNode("");
    node.appendChild(textNode);

    const range = document.createRange();
    range.setStart(textNode, 0);
    range.collapse(true);

    sel.removeAllRanges();
    sel.addRange(range);

    return textNode;
  }

  return node;
}

/* =========================
   WORD REPLACEMENT
========================= */
function replaceWord(newWord) {
  const sel = window.getSelection();
  if (!sel.rangeCount) return;

  ensureTextNode();

  const range = sel.getRangeAt(0);
  let node = getSafeNode();

  if (wordStartOffset === null || activeNode !== node) {
    wordStartOffset = range.startOffset;
    activeNode = node;
  }

  const text = node.textContent;

  const before = text.slice(0, wordStartOffset);
  const after = text.slice(range.startOffset);

  node.textContent = before + newWord + after;

  const newPos = before.length + newWord.length;

  const newRange = document.createRange();
  newRange.setStart(node, newPos);
  newRange.collapse(true);

  sel.removeAllRanges();
  sel.addRange(newRange);
}

/* =========================
   RESET
========================= */
function resetState() {
  englishBuffer = "";
  wordStartOffset = null;
  activeNode = null;
}
/* =========================
   SUGGESTIONS
========================= */
function getTrieSuggestions(prefix, limit = 5) {
  if (!prefix) return [];

  return Object.entries(trie)
    .filter(([w]) => w.startsWith(prefix))
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(e => e[0]);
}

function predictNextWord(limit = 5) {
  const text = output.innerText.trim();
  if (!text) return [];

  const words = text.split(/\s+/);
  const n = words.length;

  if (n >= 2) {
    const key = words[n - 2] + " " + words[n - 1];
    if (trigram[key]) {
      return Object.entries(trigram[key])
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(e => e[0]);
    }
  }

  if (n >= 1 && bigram[words[n - 1]]) {
    return Object.entries(bigram[words[n - 1]])
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(e => e[0]);
  }

  return [];
}

/* =========================
   UI
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

    el.onmousedown = (e) => {
      e.preventDefault();
      insertSuggestion(word);
    };

    suggestionsBox.appendChild(el);
  });
}

function insertSuggestion(word) {
  replaceWord(word);
  document.execCommand("insertText", false, " ");
  resetState();
  showSuggestions([]);
}

/* =========================
   INPUT HANDLER
========================= */
output.addEventListener("beforeinput", (e) => {

  if (e.inputType === "insertText" && /^[a-zA-Z]$/.test(e.data)) {
    e.preventDefault();

    englishBuffer += e.data;

    const odia = transliterateWord(englishBuffer);
    replaceWord(odia);

    showSuggestions(getTrieSuggestions(odia));
    return;
  }

  if (e.inputType === "insertText" && e.data === " ") {
    e.preventDefault();

    const odia = transliterateWord(englishBuffer);
    replaceWord(odia);

    document.execCommand("insertText", false, " ");
    resetState();

    showSuggestions(predictNextWord());
    return;
  }

// ENTER
// ENTER
  if (e.inputType === "insertParagraph") {
    e.preventDefault();

    const odia = transliterateWord(englishBuffer);
    replaceWord(odia);

    const sel = window.getSelection();
    if (!sel.rangeCount) return;

    const range = sel.getRangeAt(0);

    // Insert <br> + NEW TEXT NODE (critical)
    const br = document.createElement("br");
    const newTextNode = document.createTextNode("");

    range.insertNode(br);
    range.setStartAfter(br);
    range.insertNode(newTextNode);

    // Move cursor into NEW LINE properly
    const newRange = document.createRange();
    newRange.setStart(newTextNode, 0);
    newRange.collapse(true);

    sel.removeAllRanges();
    sel.addRange(newRange);

    // 🔥 HARD RESET (important)
    englishBuffer = "";
    wordStartOffset = 0;
    activeNode = newTextNode;

    showSuggestions([]);
    return;
  }
  if (e.inputType === "insertText" && /[0-9]/.test(e.data)) {
    e.preventDefault();

    const map = ["୦","୧","୨","୩","୪","୫","୬","୭","୮","୯"];
    document.execCommand("insertText", false, map[e.data]);
    resetState();
    return;
  }

  if (e.inputType === "insertText" && e.data === "$") {
    e.preventDefault();
    document.execCommand("insertText", false, "₹");
    return;
  }

  if (e.inputType === "insertText" && e.data === ".") {
    e.preventDefault();
    document.execCommand("insertText", false, "।");
    return;
  }

  if (e.inputType === "insertText" && e.data === ",") {
    e.preventDefault();
    document.execCommand("insertText", false, ",");
    return;
  }

  if (e.inputType === "deleteContentBackward") {
    if (englishBuffer.length > 0) {
      e.preventDefault();
      englishBuffer = englishBuffer.slice(0, -1);
      replaceWord(transliterateWord(englishBuffer));
    } else {
      resetState();
    }
  }
});

/* =========================
   CURSOR RESET
========================= */
output.addEventListener("keydown", (e) => {
    if (["ArrowLeft","ArrowRight","ArrowUp","ArrowDown","Enter"].includes(e.key)) {
        resetState();
        showSuggestions([]);
    }
});

output.addEventListener("mouseup", () => {
  resetState();
  showSuggestions([]);
});

output.addEventListener("keyup", (e) => {
  if (["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(e.key)) {
    resetState();
    showSuggestions([]);
  }
});

/* =========================
   BUTTONS
========================= */
clearBtn.onclick = () => {
  output.innerHTML = "";
  localStorage.removeItem("odia_text");
};

copyBtn.onclick = () => {
  navigator.clipboard.writeText(output.innerText);
};

pasteBtn.onclick = async () => {
  const text = await navigator.clipboard.readText();
  document.execCommand("insertText", false, text);
};

/* =========================

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
  nRu: "ନୃ",
  hRu: "ହୃ",   // ADD THIS
  rRu: "ରୃ"    // optional but useful
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
  shrii: "ଶ୍ରୀ",
  shri: "ଶ୍ରି",
  shr: "ଶ୍ର",

  strii: "ସ୍ତ୍ରୀ",
  stri: "ସ୍ତ୍ରି",
  str: "ସ୍ତ୍ର",
  
  ktrii: "କ୍ତ୍ରୀ",
  ktri: "କ୍ତ୍ରି",
  ktr: "କ୍ତ୍ର",

  kShma: "କ୍ଷ୍ମ",
  kShmi: "କ୍ଷ୍ମି",
  kShmii: "କ୍ଷ୍ମୀ",

  
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
  "shrii",
  "shri",
  "shr",

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
  "hRu",
  "rRu",

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

  //"shr",
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

    // Visarga (ah at end)
    // Visarga rule inside word (Vowel + h + Consonant)
    if (word[i] === "h") {
      let prev = word[i - 1] || "";
      let next = word[i + 1] || "";

      let vowels = ["a","i","u","e","o","R"];

      if (vowels.includes(prev) && next && /[a-zA-Z]/.test(next)) {
        const nextToken = getMatchedToken(word, i + 1);
        if (nextToken && isConsonantLikeToken(nextToken)) {
          result += "ଃ";
          i += 1;
          continue;
        }
      }
    }

    // Visarga at end of word (vowel + h)
    if (word[i] === "h" && i === word.length - 1) {
      let prev = word[i - 1] || "";
      let vowels = ["a","i","u","e","o","R"];

      if (vowels.includes(prev)) {
        result += "ଃ";
        i += 1;
        continue;
      }
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

    // Special syllables like kRu, gRu
    if (specialSyllables[token]) {
      result += specialSyllables[token];
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
    //.replace(/ଶ୍ରି/g, "ଶ୍ରୀ")
    // .replace(/ସ୍ତ୍ରି/g, "ସ୍ତ୍ରୀ")
    .replace(/କ୍ତ୍ରି/g, "କ୍ତ୍ରୀ")
    // .replace(/ନମହ/g, "ନମଃ")
    // .replace(/କ୍ରମଶହ/g, "କ୍ରମଶଃ")
    .replace(/ହଇ/g, "ହି")
    .replace(/ହଉ/g, "ହୁ")
    .replace(/ହଏ/g, "ହେ")
    .replace(/ହଓ/g, "ହୋ");

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
