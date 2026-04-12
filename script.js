document.addEventListener("DOMContentLoaded", () => {

const output = document.getElementById("output");
const suggestionsBox = document.getElementById("suggestions");
const langToggle = document.getElementById("langToggle");
const themeToggle = document.getElementById("themeToggle");

if (!output) return;

output.contentEditable = true;

/* =========================
   STATE
========================= */
let englishBuffer = "";
let wordStartOffset = null;
let activeNode = null;
let isNewLine = false;

let trie = {}, bigram = {}, trigram = {};
let modelsReady = false;

let selectedIndex = -1;
let isOdiaMode = true;

/* =========================
   LANGUAGE TOGGLE
========================= */
function updateLangUI() {
  langToggle.textContent = isOdiaMode ? "🌐 Odia" : "🌐 English";
}

langToggle?.addEventListener("click", () => {
  isOdiaMode = !isOdiaMode;
  resetState();
  showSuggestions([]);
  updateLangUI();
});

updateLangUI();

/* =========================
   THEME TOGGLE
========================= */
function applySavedTheme() {
  const saved = localStorage.getItem("theme");

  if (saved === "light") {
    document.body.classList.add("light");
  } else {
    document.body.classList.remove("light");
  }

  updateThemeIcon();
}

function updateThemeIcon() {
  if (!themeToggle) return;

  themeToggle.textContent = document.body.classList.contains("light")
    ? "☀️ Light"
    : "🌙 Dark";
}

themeToggle?.addEventListener("click", () => {
  document.body.classList.toggle("light");

  const mode = document.body.classList.contains("light") ? "light" : "dark";
  localStorage.setItem("theme", mode);

  updateThemeIcon();
});

applySavedTheme();

/* =========================
   LOAD MODELS
========================= */
async function loadModels() {
  try {
    const [t, b, tr] = await Promise.all([
      fetch("https://huggingface.co/datasets/ad1998/odia_dictionary/resolve/main/unigram.json").then(r => r.json()),
      fetch("https://huggingface.co/datasets/ad1998/odia_dictionary/resolve/main/bigram.json").then(r => r.json()),
      fetch("https://huggingface.co/datasets/ad1998/odia_dictionary/resolve/main/trigram.json").then(r => r.json())
    ]);

    trie = t;
    bigram = b;
    trigram = tr;

    const custom = JSON.parse(localStorage.getItem("custom_dict") || "{}");
    Object.keys(custom).forEach(k => {
      trie[k] = (trie[k] || 0) + custom[k];
    });

    modelsReady = true;
  } catch (e) {
    console.error("Model load failed", e);
  }
}
loadModels();

/* =========================
   HELPERS
========================= */
function getSafeNode() {
  const sel = window.getSelection();
  if (!sel.rangeCount) return null;

  let node = sel.getRangeAt(0).startContainer;

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

function replaceWord(newWord) {
  const sel = window.getSelection();
  if (!sel.rangeCount) return;

  let node = getSafeNode();
  const range = sel.getRangeAt(0);

  if (wordStartOffset === null || activeNode !== node || isNewLine) {
    wordStartOffset = range.startOffset;
    activeNode = node;
    isNewLine = false;
  }

  if (wordStartOffset > node.textContent.length) {
    wordStartOffset = node.textContent.length;
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

function resetState() {
  englishBuffer = "";
  wordStartOffset = null;
  activeNode = null;
  selectedIndex = -1;
}

/* =========================
   AUTO LEARN
========================= */
function learnWord(word) {
  if (!word) return;

  let custom = JSON.parse(localStorage.getItem("custom_dict") || "{}");
  custom[word] = (custom[word] || 0) + 1;

  localStorage.setItem("custom_dict", JSON.stringify(custom));
}

/* =========================
   SUGGESTIONS
========================= */
function getTrieSuggestions(prefix, limit = 5) {
  if (!prefix) return [];

  if (!modelsReady) return [prefix];

  prefix = prefix.trim();

  return Object.keys(trie)
    .filter(w => w.startsWith(prefix))
    .slice(0, 50)
    .sort((a, b) => (trie[b] || 0) - (trie[a] || 0))
    .slice(0, limit);
}

function predictNextWord(limit = 5) {
  if (!modelsReady) return [];

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
  selectedIndex = -1;

  if (!list || list.length === 0) {
    suggestionsBox.style.display = "none";
    return;
  }

  suggestionsBox.style.display = "flex";

  list.forEach((word) => {
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
  learnWord(word);
  resetState();
  showSuggestions([]);
}

/* =========================
   INPUT HANDLER
========================= */
output.addEventListener("beforeinput", (e) => {

  // LETTER
  if (e.inputType === "insertText" && /^[a-zA-Z]$/.test(e.data)) {

    if (!isOdiaMode) return;

    e.preventDefault();

    englishBuffer += e.data;

    const odia = transliterateWord(englishBuffer);
    if (!odia) return;

    replaceWord(odia);

    showSuggestions(getTrieSuggestions(odia));

    return;
  }

  // SPACE
  if (e.inputType === "insertText" && e.data === " ") {

    if (!isOdiaMode) return;

    e.preventDefault();

    const odia = transliterateWord(englishBuffer);
    replaceWord(odia);
    learnWord(odia);

    document.execCommand("insertText", false, " ");
    resetState();

    setTimeout(() => {
      showSuggestions(predictNextWord());
    }, 0);

    return;
  }

  // ENTER
  if (e.inputType === "insertParagraph") {

    if (!isOdiaMode) return;

    e.preventDefault();

    const odia = transliterateWord(englishBuffer);
    replaceWord(odia);
    learnWord(odia);

    const sel = window.getSelection();
    if (!sel.rangeCount) return;

    let node = sel.getRangeAt(0).startContainer;

    // Find parent DIV line
    while (node && node !== output && node.nodeName !== "DIV") {
      node = node.parentNode;
    }

    // Wrap first line if needed
    if (node === output || !node) {
      const wrapper = document.createElement("div");
      wrapper.innerHTML = output.innerHTML || "";
      output.innerHTML = "";
      output.appendChild(wrapper);
      node = wrapper;
    }

    // ✅ Create new line with ZERO WIDTH SPACE
    const newLine = document.createElement("div");
    const textNode = document.createTextNode("\u200B"); // invisible char
    newLine.appendChild(textNode);

    node.after(newLine);

    // ✅ Move cursor AFTER invisible char
    const range = document.createRange();
    range.setStart(textNode, 1);
    range.collapse(true);

    sel.removeAllRanges();
    sel.addRange(range);

    resetState();
    isNewLine = true;

    showSuggestions([]);

    return;
  }
  // BACKSPACE
  if (e.inputType === "deleteContentBackward") {

    if (!isOdiaMode) return;

    if (englishBuffer.length > 0) {
      e.preventDefault();
      englishBuffer = englishBuffer.slice(0, -1);
      replaceWord(transliterateWord(englishBuffer));
    } else {
      resetState();
    }

    return;
  }

  // NUMBERS
  if (e.inputType === "insertText" && /[0-9]/.test(e.data)) {
    if (!isOdiaMode) return;

    e.preventDefault();
    const map = ["୦","୧","୨","୩","୪","୫","୬","୭","୮","୯"];
    document.execCommand("insertText", false, map[e.data]);
    return;
  }

  // FULL STOP
  if (e.inputType === "insertText" && e.data === ".") {
    if (!isOdiaMode) return;

    e.preventDefault();
    document.execCommand("insertText", false, "।");
    return;
  }
});

/* =========================
   RESET EVENTS
========================= */
output.addEventListener("mouseup", () => {
  resetState();
  showSuggestions([]);
});

output.addEventListener("keyup", (e) => {
  if (["ArrowLeft","ArrowRight"].includes(e.key)) {
    resetState();
    showSuggestions([]);
  }
});

// ⚠️ DO NOT TOUCH YOUR TRANSLITERATION ENGINE
// (paste your full engine here unchanged)

//transword  logic

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

  njh:"ଞ୍ଝ",
  nj :"ଞ୍ଜ",
  nchh :"ଞ୍ଛ",
  nch: "ଞ୍ଚ",
  NDha:"ଣ୍ଢ",
  NDa:"ଣ୍ଡ",
  NTh: "ଣ୍ଠ",
  NT: "ଣ୍ଟ",
  ngh: "ଙ୍ଘ",
  ng: "ଙ୍ଗ",
  ntha:"ନ୍ଥ",
  nt: "ନ୍ତ",
  ndh: "ନ୍ଧ",
  nd: "ନ୍ଦ",
  nkh: "ଙ୍ଖ",
  nk: "ଙ୍କ",
  mbh: "ମ୍ଭ",
  mb: "ମ୍ବ",
  mpha: "ମ୍ଫ",
  mp: "ମ୍ପ",
   
  kh: "ଖ",
  gh: "ଘ",
  chh: "ଛ",
  ch: "ଚ",
  jh: "ଝ",
  th: "ଥ",
  Th: "ଠ",
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

  rNA: "ର୍ଣ୍ଣ",
  ShN: "ଷ୍ଣ",
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


  "njh",
  "nj",
  "nchh",
  "nch",
  "NDha",
  "NDa",
  "NTh",
  "NT",
  "ngh",
  "ng",
  "ntha",
  "nt",
  "ndh",
  "nd",
  "nkh",
  "nk",
  "mbh",
  "mb",
  "mpha",
  "mp",

  "rNA",
  "ShN",
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
