// Your file names (must be in the same folder as this HTML)
const NODES_FILE = "./NODES.json";
const CHOICES_FILE = "./CHOICES.json";

// Data stores
let nodesById = {};
let choicesByParent = {};
let currentNodeId = "A01"; // start here (canon)

// DOM refs
const nodeIdEl = document.getElementById("nodeId");
const nodeTypeEl = document.getElementById("nodeType");
const nodeTextEl = document.getElementById("nodeText");
const choicesEl = document.getElementById("choices");
const statusEl = document.getElementById("status");
const errorEl = document.getElementById("error");

function showError(message) {
    errorEl.style.display = "block";
    errorEl.textContent = message;
}

function clearError() {
    errorEl.style.display = "none";
    errorEl.textContent = "";
}

async function loadData() {
    clearError();

    // Load both JSON files (arrays of objects)
    const [nodesRes, choicesRes] = await Promise.all([
        fetch(NODES_FILE),
        fetch(CHOICES_FILE)
    ]);

    if (!nodesRes.ok) throw new Error(`Failed to load ${NODES_FILE} (${nodesRes.status})`);
    if (!choicesRes.ok) throw new Error(`Failed to load ${CHOICES_FILE} (${choicesRes.status})`);

    const nodesArr = await nodesRes.json();
    const choicesArr = await choicesRes.json();

    // Index nodes by NODE_ID
    nodesById = {};
    for (const n of nodesArr) {
        if (!n.NODE_ID) continue;
        nodesById[n.NODE_ID] = n;
    }

    // Group choices by PARENT_NODE
    choicesByParent = {};
    for (const c of choicesArr) {
        if (!c.PARENT_NODE) continue;
        if (!choicesByParent[c.PARENT_NODE]) choicesByParent[c.PARENT_NODE] = [];
        choicesByParent[c.PARENT_NODE].push(c);
    }

    // Optional: keep choice order stable (AC01, AC02…)
    for (const parent in choicesByParent) {
        choicesByParent[parent].sort((a, b) => (a.CHOICE_ID || "").localeCompare(b.CHOICE_ID || ""));
    }
}

function renderNode(nodeId) {
    clearError();
    currentNodeId = nodeId;

    const node = nodesById[nodeId];
    if (!node) {
        nodeIdEl.textContent = nodeId;
        nodeTypeEl.textContent = "";
        nodeTextEl.textContent = "";
        choicesEl.innerHTML = "";
        showError(`Missing node in NODES.json: ${nodeId}`);
        return;
    }

    nodeIdEl.textContent = node.NODE_ID;
    nodeTypeEl.textContent = node.NODE_TYPE ? `(${node.NODE_TYPE})` : "";
    nodeTextEl.textContent = node.TEXT || "";

    // Render choices for this parent node
    const options = choicesByParent[nodeId] || [];
    choicesEl.innerHTML = "";

    if (options.length === 0) {
        statusEl.textContent = "No choices found for this node (end).";
        return;
    }

    //GETS CHOICES: 1
    //   statusEl.textContent = `Choices: ${options.length}`;

    for (const opt of options) {
        const btn = document.createElement("button");
        btn.className = "choice";

        // Show both ID and label so you can debug + present structure
        // const idLine = document.createElement("span");
        // idLine.className = "choice-id";
        // idLine.textContent = opt.CHOICE_ID || "(no CHOICE_ID)";

        const labelLine = document.createElement("span");
        labelLine.textContent = opt.OPTION_LABEL || "(no label)";

        //SHOW CHOICE_ID DEBUG
        // btn.appendChild(idLine);
        btn.appendChild(labelLine);

        btn.addEventListener("click", () => {
            const next = opt.LEADS_TO;
            if (!next) {
                showError(`Choice ${opt.CHOICE_ID} has no LEADS_TO value.`);
                return;
            }
            renderNode(next);
        });

        choicesEl.appendChild(btn);
    }
}

// Boot
(async function init() {
    try {
        await loadData();
        renderNode("A01");
    } catch (err) {
        nodeTextEl.textContent = "";
        choicesEl.innerHTML = "";
        showError(
            `${err.message}\n\n` +
            `If you're opening index.html directly (file://), fetch() may be blocked.\n` +
            `Use VS Code "Live Server" or run: python -m http.server`
        );
    }
})();