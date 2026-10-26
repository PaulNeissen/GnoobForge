"use strict";

/* ---------- Constantes ---------- */

const STARTING_LEVEL = 4;
const MAX_LEVEL = 15;
const MAX_ATTEMPTS = 10;
const BREAK_THRESHOLD = 0.65;

const HASH_SEED = 5381;
const HASH_MULTIPLIER = 1566083941;
const LCG_A = 1812433253;
const SEED_MODULO = 99999999;

const pseudos = ["Daemon", "CrOmAgNoN", "Zeeyy", "HAALAND"];

/* ---------- Logique (pure, sans DOM) ---------- */

function valheimHash(str) {
    let n = HASH_SEED;
    let n2 = HASH_SEED;

    for (let i = 0; i < str.length; i += 2) {
        n = (Math.imul(n, 33) ^ str.charCodeAt(i)) >>> 0;
        if (i + 1 >= str.length) break;
        n2 = (Math.imul(n2, 33) ^ str.charCodeAt(i + 1)) >>> 0;
    }

    return (n + Math.imul(n2, HASH_MULTIPLIER)) >>> 0;
}

function rollNext(seed) {
    let s0 = seed >>> 0;
    let s1 = (Math.imul(s0, LCG_A) + 1) >>> 0;
    let s2 = (Math.imul(s1, LCG_A) + 1) >>> 0;
    let s3 = (Math.imul(s2, LCG_A) + 1) >>> 0;

    function step() {
        const t = (s0 ^ (s0 << 11)) >>> 0;
        s0 = s1;
        s1 = s2;
        s2 = s3;
        s3 = ((s3 ^ (s3 >>> 19)) ^ (t ^ (t >>> 8))) >>> 0;
        return s3;
    }

    const roll = (step() & 0x7FFFFF) / 8388607;
    const nextSeed = step() % SEED_MODULO;

    return { roll, nextSeed };
}

/** true = l'objet casse. Index = nombre de tentatives précédentes. */
function predictRow(characterName, itemId, level, maxAttempts = MAX_ATTEMPTS) {
    let seed = (
        valheimHash(characterName) +
        valheimHash(itemId) +
        (level + 1)
    ) >>> 0;

    const row = [];
    for (let attempt = 0; attempt <= maxAttempts; attempt++) {
        const { roll, nextSeed } = rollNext(seed);
        row.push(roll > BREAK_THRESHOLD);
        seed = nextSeed;
    }
    return row;
}

function predictAll(characterName, itemId) {
    const rows = [];
    for (let level = STARTING_LEVEL; level < MAX_LEVEL; level++) {
        rows.push({ level, breaks: predictRow(characterName, itemId, level) });
    }
    return rows;
}

/**
 * Première colonne (0 tentative) : nombre de succès consécutifs
 * en partant du premier niveau (4 → 5), jusqu'au premier échec.
 */
function firstColumnStreak(characterName, itemId) {
    let streak = 0;
    for (let level = STARTING_LEVEL; level < MAX_LEVEL; level++) {
        const breaks = predictRow(characterName, itemId, level, 0)[0];
        if (breaks) break;
        streak++;
    }
    return streak;
}

/** Classe les personnages par série de succès décroissante (ex æquo conservés). */
function rankCharacters(characterNames, itemId) {
    return characterNames
        .map((name) => ({ name, streak: firstColumnStreak(name, itemId) }))
        .sort((a, b) => b.streak - a.streak);
}

/* ---------- Données ---------- */
/* ITEMDATA est défini dans items.js (chargé avant ce script). */

const ITEMS = new Map(
    Object.values(ITEMDATA)
        .flat()
        .map(([name, id]) => [name.toLowerCase(), { name, id }])
);

function findItem(input) {
    return ITEMS.get(input.trim().toLowerCase()) ?? null;
}

/* ---------- Rendu ---------- */

const pseudoSelect = document.getElementById("pseudo");
const itemInput = document.getElementById("item");
const itemList = document.getElementById("itemList");
const results = document.getElementById("resultat");
const simulateButton = document.getElementById("simulate");
const bestButton = document.getElementById("best");
const bestMultiButton = document.getElementById("bestMulti");
const commonFailButton = document.getElementById("commonFail");

const datalistFragment = document.createDocumentFragment();
for (const { name } of ITEMS.values()) {
    const option = document.createElement("option");
    option.value = name;
    datalistFragment.appendChild(option);
}
itemList.appendChild(datalistFragment);

function makeCell(tag, text, className) {
    const cell = document.createElement(tag);
    cell.textContent = text;
    if (className) cell.className = className;
    return cell;
}

function buildTable(rows, itemName, characterName, withCaption = true) {
    const table = document.createElement("table");

    if (withCaption) {
        const caption = document.createElement("caption");
        caption.textContent = `${itemName} — ${characterName}`;
        table.appendChild(caption);
    }

    const headRow = table.createTHead().insertRow();
    const corner = makeCell("th", "Upgrade");
    corner.scope = "col";
    headRow.appendChild(corner);

    for (let a = 0; a <= MAX_ATTEMPTS; a++) {
        const th = makeCell("th", `${a} Attempt${a <= 1 ? "" : "s"}`);
        th.scope = "col";
        headRow.appendChild(th);
    }

    const body = table.createTBody();
    for (const { level, breaks } of rows) {
        const tr = body.insertRow();
        const rowHeader = makeCell("th", `${level} → ${level + 1}`);
        rowHeader.scope = "row";
        tr.appendChild(rowHeader);

        for (const broken of breaks) {
            tr.appendChild(
                broken
                    ? makeCell("td", "💥 Breaks", "failure")
                    : makeCell("td", "✅ Success", "success")
            );
        }
    }

    return table;
}

function showMessage(text, className = "empty") {
    const div = document.createElement("div");
    div.className = className;
    div.textContent = text;
    results.replaceChildren(div);
}

function renderResults(characterName, item, summary = null) {
    const rows = predictAll(characterName, item.id);
    // Avec un résumé (bouton Best), la légende fait doublon : on la masque.
    const table = buildTable(rows, item.name, characterName, !summary);
    results.replaceChildren(...(summary ? [summary, table] : [table]));
}

function simulate() {
    const characterName = pseudoSelect.value.trim();
    if (!characterName) {
        showMessage("Please enter a character name.", "error");
        return;
    }

    const item = findItem(itemInput.value);
    if (!item) {
        showMessage("Please select a valid item from the list.", "error");
        return;
    }

    renderResults(characterName, item);
}

/** Liste des personnages : <select> ou <input list="..."> + <datalist>. */
function getCharacterNames() {
    const options = pseudoSelect.tagName === "SELECT"
        ? pseudoSelect.options
        : pseudoSelect.list?.options;

    return options ? [...options].map((o) => o.value) : [];
}

function findBestCharacter(allowSecondAttempt = false) {
    const item = findItem(itemInput.value);

    if (!item) {
        showMessage("Please select a valid item from the list.", "error");
        return;
    }

    const names = [...new Set(getCharacterNames())].sort((a, b) => {
        const indexA = pseudos.indexOf(a);
        const indexB = pseudos.indexOf(b);

        return (indexA === -1 ? Infinity : indexA)
            - (indexB === -1 ? Infinity : indexB);
    });

    if (!names.length) {
        showMessage("No character available in the list.", "error");
        return;
    }

    const steps = [];
    let lastCharacter = null; // dernier pseudo utilisé avec succès

    for (let level = STARTING_LEVEL; level < MAX_LEVEL; level++) {
        // Le dernier pseudo utilisé passe en premier, les autres gardent l'ordre de priorité
        const ordered = lastCharacter
            ? [lastCharacter, ...names.filter(name => name !== lastCharacter)]
            : names;

        // 1er attempt : un pseudo dont la colonne "0 Attempt" réussit
        let character = ordered.find(name =>
            !predictRow(name, item.id, level, 0)[0]
        );
        let attempt = 1;
        let firstAttemptFailed = false;

        // Aucun pseudo ne passe au 1er attempt : on regarde le 2e
        if (!character && allowSecondAttempt) {
            firstAttemptFailed = true;
            character = ordered.find(name =>
                !predictRow(name, item.id, level, 1)[1]
            );
            attempt = 2;
        }

        // On retient le pseudo pour le niveau suivant (sinon on garde le précédent)
        if (character) {
            lastCharacter = character;
        }

        // character = undefined si le niveau est impossible
        steps.push({ level, character, attempt, firstAttemptFailed });
    }

    const summary = document.createElement("div");
    summary.className = "summary";

    const title = document.createElement("strong");
    title.textContent = `Upgrade path — ${item.name}`;
    summary.appendChild(title);

    const list = document.createElement("ol");

    const addLine = (text) => {
        const li = document.createElement("li");
        li.textContent = text;
        list.appendChild(li);
    };

    for (const { level, character, attempt, firstAttemptFailed } of steps) {
        const label = `${level} → ${level + 1}`;

        // Le fail du 1er attempt apparaît à l'endroit où il se produit
        if (firstAttemptFailed) {
            addLine(`${label} : 💥 Fail (1st attempt)`);
        }

        if (character) {
            addLine(
                `${label} : ${character}` +
                (attempt === 2 ? " (2nd attempt)" : "")
            );
        } else {
            addLine(`${label} : 💥 Impossible`);
        }
    }

    summary.appendChild(list);
    results.replaceChildren(summary);
}

/* ---------- Événements ---------- */

simulateButton.addEventListener("click", simulate);
bestButton.addEventListener("click", findBestCharacter);
bestMultiButton.addEventListener("click", findBestSequence);
commonFailButton.addEventListener("click", findCommonFailure);

for (const field of [pseudoSelect, itemInput]) {
    field.addEventListener("keydown", (e) => {
        if (e.key === "Enter") simulate();
    });
}

/* ---------- Liste complète au focus (datalist) ---------- */

// La datalist filtre selon le texte présent : on vide le champ au focus
// pour afficher toutes les suggestions, et on restaure la valeur si rien n'est choisi.
function showFullListOnFocus(input) {
    let previous = "";

    input.addEventListener("focus", () => {
        previous = input.value;
        input.value = "";
    });

    input.addEventListener("blur", () => {
        if (!input.value.trim()) input.value = previous;
    });
}

showFullListOnFocus(pseudoSelect);
showFullListOnFocus(itemInput);

/* ---------- Champs : bouton « × » et liste complète au focus ---------- */

/**
 * - ajoute un bouton « × » qui vide le champ ;
 * - au focus, vide temporairement le champ pour que la datalist affiche
 *   toute la liste ; si rien n'est choisi, l'ancienne valeur est restaurée.
 * Le champ est enveloppé dans un .input-wrap (aucun changement HTML requis).
 */
function setupField(input) {
    const wrap = document.createElement("div");
    wrap.className = "input-wrap";
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);

    const clear = document.createElement("button");
    clear.type = "button";
    clear.className = "clear-btn";
    clear.textContent = "×";
    clear.title = "Clear";
    clear.setAttribute("aria-label", `Clear ${input.id}`);
    wrap.appendChild(clear);

    let previous = "";
    const refresh = () => {
        clear.hidden = !(input.value || previous);
    };

    input.addEventListener("focus", () => {
        previous = input.value;
        input.value = "";
        refresh();
    });
    input.addEventListener("blur", () => {
        if (!input.value.trim()) input.value = previous;
        previous = "";
        refresh();
    });
    input.addEventListener("input", refresh);

    // mousedown : garde le focus du champ s'il l'a déjà
    clear.addEventListener("mousedown", (e) => e.preventDefault());
    clear.addEventListener("click", () => {
        previous = "";
        input.value = "";
        refresh();
        input.focus();
    });

    refresh();
}

setupField(pseudoSelect);
setupField(itemInput);

function findCommonFailure() {
    const matches = [];

    for (const item of ITEMS.values()) {
        for (let level = STARTING_LEVEL; level < MAX_LEVEL; level++) {
            const allFail = pseudos.every(name =>
                predictRow(name, item.id, level, 0)[0]
            );

            if (allFail) {
                matches.push({
                    item: item.name,
                    level,
                    breaks: pseudos.map(name => ({
                        name,
                        broken: predictRow(name, item.id, level, 0)[0]
                    }))
                });
            }
        }
    }

    if (!matches.length) {
        showMessage("No common failures found.");
        return;
    }

    const table = document.createElement("table");

    const head = table.createTHead().insertRow();

    for (const text of ["Item", "Upgrade", ...pseudos]) {
        head.appendChild(makeCell("th", text));
    }

    const body = table.createTBody();

    for (const match of matches) {
        const row = body.insertRow();

        row.appendChild(makeCell("td", match.item));
        row.appendChild(
            makeCell("td", `${match.level} → ${match.level + 1}`)
        );

        for (const result of match.breaks) {
            row.appendChild(
                makeCell("td", result.broken ? "💥 Fail" : "✅ Success")
            );
        }
    }

    results.replaceChildren(table);
}

/**
 * Plus court enchaînement de tentatives menant au MAX_LEVEL.
 * Un fail détruit l'objet (retour au STARTING_LEVEL), mais les compteurs de
 * tentatives par (pseudo, niveau) persistent.
 * Retourne [{ level, name, broke }, ...] ou null si rien n'est trouvé.
 */
function planUpgrades(names, itemId, maxNodes = 5_000_000) {
    const nLevels = MAX_LEVEL - STARTING_LEVEL;

    const table = names.map(name =>
        Array.from({ length: nLevels }, (_, l) =>
            predictRow(name, itemId, STARTING_LEVEL + l)));

    const counters = new Array(names.length * nLevels).fill(0);
    const baseOrder = names.map((_, i) => i);
    const path = [];
    const maxBound = names.length * nLevels * (MAX_ATTEMPTS + 1);
    let nodes = 0;
    let bound = nLevels;

    // last = index du pseudo qui vient de réussir (-1 = ordre normal)
    function dfs(l, cost, last) {
        if (l === nLevels) return true;
        if (++nodes > maxNodes) return false;

        const order = last === -1
            ? baseOrder
            : [last, ...baseOrder.filter(p => p !== last)];

        for (const p of order) {
            const idx = p * nLevels + l;
            const k = counters[idx];
            if (k > MAX_ATTEMPTS) continue;

            const broke = table[p][l][k];
            const nextL = broke ? 0 : l + 1;

            if (cost + 1 + (nLevels - nextL) > bound) continue;

            counters[idx]++;
            path.push({ level: STARTING_LEVEL + l, name: names[p], broke });

            // Succès : ce pseudo est prioritaire ; échec : retour à l'ordre normal
            if (dfs(nextL, cost + 1, broke ? -1 : p)) return true;

            path.pop();
            counters[idx]--;
        }
        return false;
    }

    for (; bound <= maxBound; bound++) {
        counters.fill(0);
        path.length = 0;
        if (dfs(0, 0, -1)) return path.slice();
        if (nodes > maxNodes) return null;
    }
    return null;
}

function getSortedCharacterNames() {
    return [...new Set(getCharacterNames())].sort((a, b) => {
        const indexA = pseudos.indexOf(a);
        const indexB = pseudos.indexOf(b);

        return (indexA === -1 ? Infinity : indexA)
            - (indexB === -1 ? Infinity : indexB);
    });
}

function findBestSequence() {
    const item = findItem(itemInput.value);

    if (!item) {
        showMessage("Please select a valid item from the list.", "error");
        return;
    }

    const names = getSortedCharacterNames();

    if (!names.length) {
        showMessage("No character available in the list.", "error");
        return;
    }

    const path = planUpgrades(names, item.id);

    if (!path) {
        showMessage("No sequence found.", "error");
        return;
    }

    const summary = document.createElement("div");
    summary.className = "summary";

    const title = document.createElement("strong");
    title.textContent =
        `Upgrade path — ${item.name} (${path.length} attempts)`;
    summary.appendChild(title);

    const list = document.createElement("ol");

    for (const { level, name, broke } of path) {
        const li = document.createElement("li");
        li.textContent =
            `${level} → ${level + 1} : ${name} — ${broke ? "💥 Fail" : "✅ Success"}`;
        list.appendChild(li);
    }

    summary.appendChild(list);
    results.replaceChildren(summary);
}