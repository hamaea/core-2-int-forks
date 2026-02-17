// Your file names (must be in the same folder as this HTML)
const NODES_FILE = "./NODES.json";
const CHOICES_FILE = "./CHOICES.json";

// Data stores
let nodesById = {};
let choicesByParent = {};
let currentNodeId = "A01"; // start here (canon)

// Path recording for end summary
let path = []; // [{ nodeId, text, chosenLabel }]
let lastChoiceLabel = null;

// DOM refs (reader)
const nodeIdEl = document.getElementById("nodeId");
const nodeTypeEl = document.getElementById("nodeType");
const nodeTextEl = document.getElementById("nodeText");
const choicesEl = document.getElementById("choices");
const statusEl = document.getElementById("status");
const errorEl = document.getElementById("error");

// DOM refs (views + summary)
const readerViewEl = document.getElementById("readerView");
const summaryViewEl = document.getElementById("summaryView");
const summaryScrollEl = document.getElementById("summaryScroll");
const restartBtn = document.getElementById("restartBtn");

if (restartBtn) {
  restartBtn.addEventListener("click", () => {
    // Reset path + restart
    path = [];
    lastChoiceLabel = null;
    summaryViewEl.style.display = "none";
    readerViewEl.style.display = "block";
    renderNode("A01");
  });
}

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

  // Keep choice order stable (AC01, AC02…)
  for (const parent in choicesByParent) {
    choicesByParent[parent].sort((a, b) =>
      (a.CHOICE_ID || "").localeCompare(b.CHOICE_ID || "")
    );
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

  // Record this node in the path, storing the choice label that led here
  path.push({
    nodeId: node.NODE_ID,
    text: node.TEXT || "",
    chosenLabel: lastChoiceLabel
  });
  lastChoiceLabel = null;

  // Render node content
  // nodeIdEl.textContent = node.NODE_ID;
  // nodeTypeEl.textContent = node.NODE_TYPE ? `(${node.NODE_TYPE})` : "";
  nodeTextEl.textContent = node.TEXT || "";

  // Render choices for this parent node
  const options = choicesByParent[nodeId] || [];
  choicesEl.innerHTML = "";
  statusEl.textContent = "";

  // End: no choices => show summary view
  if (options.length === 0) {
    showSummary();
    return;
  }

  for (const opt of options) {
    const btn = document.createElement("button");
    btn.className = "choice";

    const labelLine = document.createElement("span");
    labelLine.textContent = `>> ${(opt.OPTION_LABEL || "").toUpperCase()}`;
    btn.appendChild(labelLine);

    btn.addEventListener("click", () => {
      const next = opt.LEADS_TO;
      if (!next) {
        showError(`Choice has no LEADS_TO value.`);
        return;
      }

      // Remember what the user clicked so we can render it in red in the summary
      lastChoiceLabel = opt.OPTION_LABEL || "";

      renderNode(next);
    });

    choicesEl.appendChild(btn);
  }
}

function showSummary() {
  // Hide reader, show summary
  readerViewEl.style.display = "none";
  summaryViewEl.style.display = "block";

  // Build scroll content
  summaryScrollEl.innerHTML = "";

  path.forEach((step, idx) => {
    const block = document.createElement("div");
    block.className = "summary-block";

    // If a choice led to this node, show it in red (user-chosen option) BEFORE the node text
    if (step.chosenLabel) {
      const choiceDiv = document.createElement("div");
      choiceDiv.className = "summary-choice";
      choiceDiv.textContent = step.chosenLabel;
      block.appendChild(choiceDiv);
    }

    const textDiv = document.createElement("div");
    textDiv.className = "summary-text";
    textDiv.textContent = step.text || "";
    block.appendChild(textDiv);

    // If there was a choice, place the divider immediately after the choice
    // if (step.chosenLabel && idx < path.length - 1) {
    //   const divider = document.createElement("div");
    //   divider.className = "summary-divider";
    //   block.appendChild(divider);
    // }

    summaryScrollEl.appendChild(block);
  });

  summaryScrollEl.scrollTop = 0;
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