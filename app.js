const questions = window.QUESTION_BANK || [];
const shortBank = window.SHORT_ANSWER_BANK || { chapters: [], items: [] };
const state = {
  view: "bank",
  score: { answered: 0, correct: 0 },
  current: null,
  selected: new Set(),
  autoNextTimer: null,
  wrong: new Set(JSON.parse(localStorage.getItem("xztk_wrong") || "[]")),
};

const els = {
  summary: document.querySelector("#summary"),
  tabs: document.querySelectorAll(".tab"),
  views: {
    bank: document.querySelector("#bankView"),
    quiz: document.querySelector("#quizView"),
    short: document.querySelector("#shortView"),
    wrong: document.querySelector("#wrongView"),
  },
  search: document.querySelector("#search"),
  typeFilter: document.querySelector("#typeFilter"),
  sourceFilter: document.querySelector("#sourceFilter"),
  clearSearch: document.querySelector("#clearSearch"),
  bankCount: document.querySelector("#bankCount"),
  bankList: document.querySelector("#bankList"),
  score: document.querySelector("#score"),
  quizCard: document.querySelector("#quizCard"),
  nextQuestion: document.querySelector("#nextQuestion"),
  wrongCount: document.querySelector("#wrongCount"),
  wrongList: document.querySelector("#wrongList"),
  clearWrong: document.querySelector("#clearWrong"),
  shortSearch: document.querySelector("#shortSearch"),
  chapterFilter: document.querySelector("#chapterFilter"),
  clearShortSearch: document.querySelector("#clearShortSearch"),
  randomShort: document.querySelector("#randomShort"),
  shortCount: document.querySelector("#shortCount"),
  shortList: document.querySelector("#shortList"),
};

const typeName = { single: "单选", multiple: "多选", judgment: "判断" };

function answerSet(q) {
  if (q.type === "judgment") return new Set([q.answer]);
  return new Set(String(q.answer).split(""));
}

function answerText(q) {
  const labels = answerSet(q);
  return q.options
    .filter((opt) => labels.has(opt.label))
    .map((opt) => `${opt.label}. ${opt.text}`)
    .join("；");
}

function sourceText(q) {
  return q.sources.join("、");
}

function saveWrong() {
  localStorage.setItem("xztk_wrong", JSON.stringify([...state.wrong]));
}

function renderSummary() {
  const singles = questions.filter((q) => q.type === "single").length;
  const multiples = questions.filter((q) => q.type === "multiple").length;
  const judgments = questions.filter((q) => q.type === "judgment").length;
  els.summary.textContent = `选择题 ${questions.length} 题：单选 ${singles}，多选 ${multiples}，判断/回忆 ${judgments}；简答题 ${shortBank.items.length} 题`;
}

function initSourceFilter() {
  const sources = [...new Set(questions.flatMap((q) => q.sources))].sort((a, b) => a.localeCompare(b, "zh-CN"));
  for (const source of sources) {
    const option = document.createElement("option");
    option.value = source;
    option.textContent = source;
    els.sourceFilter.appendChild(option);
  }
}

function initChapterFilter() {
  for (const chapter of shortBank.chapters) {
    const option = document.createElement("option");
    option.value = chapter.id;
    option.textContent = `${chapter.title}（${chapter.items.length}）`;
    els.chapterFilter.appendChild(option);
  }
}

function switchView(view) {
  state.view = view;
  for (const tab of els.tabs) tab.classList.toggle("active", tab.dataset.view === view);
  for (const [name, el] of Object.entries(els.views)) el.classList.toggle("hidden", name !== view);
  if (view === "quiz" && !state.current) nextQuestion();
  if (view === "short") renderShorts();
  if (view === "wrong") renderWrong();
}

function filteredQuestions() {
  const keyword = els.search.value.trim().toLowerCase();
  const type = els.typeFilter.value;
  const source = els.sourceFilter.value;
  return questions.filter((q) => {
    if (type && q.type !== type) return false;
    if (source && !q.sources.includes(source)) return false;
    if (!keyword) return true;
    const haystack = [
      q.stem,
      q.answer,
      answerText(q),
      sourceText(q),
      ...q.options.map((opt) => opt.text),
    ].join(" ").toLowerCase();
    return haystack.includes(keyword);
  });
}

function renderBank() {
  const list = filteredQuestions();
  els.bankCount.textContent = `显示 ${list.length} / ${questions.length} 题`;
  els.bankList.innerHTML = "";
  for (const q of list) {
    els.bankList.appendChild(renderCard(q, { mode: "bank" }));
  }
}

function renderCard(q, { mode }) {
  const card = document.createElement("article");
  card.className = "card";
  const revealed = mode === "bank" || mode === "wrong";
  card.innerHTML = `
    <p class="meta">
      <span class="badge">${typeName[q.type]}</span>
      <span>${q.id}</span>
      <span>来源：${sourceText(q)}</span>
    </p>
    <p class="stem">${q.stem}</p>
    <div class="options"></div>
    <div class="answer ${revealed ? "" : "hidden"}">答案：${q.answer} ${answerText(q) ? `｜${answerText(q)}` : ""}</div>
  `;
  const labels = answerSet(q);
  const options = card.querySelector(".options");
  for (const opt of q.options) {
    const row = document.createElement(mode === "quiz" ? "button" : "div");
    row.className = "option";
    row.type = "button";
    row.dataset.label = opt.label;
    row.innerHTML = `<span class="label">${opt.label}</span><span>${opt.text}</span>`;
    if (revealed && labels.has(opt.label)) row.classList.add("correct");
    options.appendChild(row);
  }
  if (mode === "quiz") {
    const actions = document.createElement("div");
    actions.className = "card-actions";
    actions.innerHTML = `<button type="button" id="submitAnswer">提交</button><button class="secondary" type="button" id="showAnswer">看答案</button>`;
    card.appendChild(actions);
    for (const row of card.querySelectorAll(".option")) {
      row.addEventListener("click", () => toggleOption(q, row));
    }
    actions.querySelector("#submitAnswer").addEventListener("click", () => submitAnswer(q, card));
    actions.querySelector("#showAnswer").addEventListener("click", () => reveal(card, q, false));
  }
  return card;
}

function toggleOption(q, row) {
  const label = row.dataset.label;
  if (q.type === "multiple") {
    if (state.selected.has(label)) state.selected.delete(label);
    else state.selected.add(label);
  } else {
    state.selected = new Set([label]);
  }
  for (const opt of row.parentElement.querySelectorAll(".option")) {
    opt.classList.toggle("selected", state.selected.has(opt.dataset.label));
  }
}

function submitAnswer(q, card) {
  if (!state.selected.size) return;
  const submitButton = card.querySelector("#submitAnswer");
  if (submitButton.disabled) return;
  submitButton.disabled = true;
  const correct = sameSet(state.selected, answerSet(q));
  state.score.answered += 1;
  if (correct) {
    state.score.correct += 1;
    state.wrong.delete(q.id);
  } else {
    state.wrong.add(q.id);
  }
  saveWrong();
  reveal(card, q, true);
  renderScore();
  card.querySelector(".answer").insertAdjacentHTML("beforeend", "｜正在切换下一题...");
  clearTimeout(state.autoNextTimer);
  state.autoNextTimer = setTimeout(nextQuestion, 900);
}

function sameSet(a, b) {
  return a.size === b.size && [...a].every((x) => b.has(x));
}

function reveal(card, q, markWrong) {
  const labels = answerSet(q);
  for (const row of card.querySelectorAll(".option")) {
    const chosen = state.selected.has(row.dataset.label);
    const isRight = labels.has(row.dataset.label);
    row.classList.toggle("correct", isRight);
    row.classList.toggle("wrong", markWrong && chosen && !isRight);
  }
  card.querySelector(".answer").classList.remove("hidden");
}

function nextQuestion() {
  clearTimeout(state.autoNextTimer);
  state.selected = new Set();
  const pool = filteredQuestions();
  state.current = pool[Math.floor(Math.random() * pool.length)] || questions[0];
  els.quizCard.innerHTML = "";
  els.quizCard.appendChild(renderCard(state.current, { mode: "quiz" }));
}

function renderScore() {
  els.score.textContent = `已答 ${state.score.answered} 题，正确 ${state.score.correct} 题`;
}

function renderWrong() {
  const wrong = questions.filter((q) => state.wrong.has(q.id));
  els.wrongCount.textContent = wrong.length ? `当前 ${wrong.length} 道错题` : "暂无错题";
  els.wrongList.innerHTML = "";
  for (const q of wrong) els.wrongList.appendChild(renderCard(q, { mode: "wrong" }));
}

function filteredShorts() {
  const keyword = els.shortSearch.value.trim().toLowerCase();
  const chapter = els.chapterFilter.value;
  return shortBank.items.filter((item) => {
    if (chapter && item.chapter_id !== chapter) return false;
    if (!keyword) return true;
    const haystack = [item.chapter, item.stem, item.answer].join(" ").toLowerCase();
    return haystack.includes(keyword);
  });
}

function renderShorts(list = filteredShorts()) {
  els.shortCount.textContent = `显示 ${list.length} / ${shortBank.items.length} 题`;
  els.shortList.innerHTML = "";
  for (const item of list) {
    els.shortList.appendChild(renderShortCard(item));
  }
}

function renderShortCard(item) {
  const card = document.createElement("article");
  card.className = "card short-card";
  card.innerHTML = `
    <p class="meta">
      <span class="badge">简答</span>
      <span>${item.id}</span>
      <span>${item.chapter}</span>
    </p>
    <p class="stem">${item.stem}</p>
    <div class="card-actions">
      <button type="button" class="toggle-answer">显示答案</button>
    </div>
    <div class="answer short-answer hidden">${item.answer}</div>
  `;
  const button = card.querySelector(".toggle-answer");
  const answer = card.querySelector(".short-answer");
  button.addEventListener("click", () => {
    const isHidden = answer.classList.toggle("hidden");
    button.textContent = isHidden ? "显示答案" : "隐藏答案";
  });
  return card;
}

function randomShort() {
  const list = filteredShorts();
  if (!list.length) return;
  const item = list[Math.floor(Math.random() * list.length)];
  renderShorts([item]);
}

els.tabs.forEach((tab) => tab.addEventListener("click", () => switchView(tab.dataset.view)));
[els.search, els.typeFilter, els.sourceFilter].forEach((el) => el.addEventListener("input", renderBank));
els.clearSearch.addEventListener("click", () => {
  els.search.value = "";
  els.typeFilter.value = "";
  els.sourceFilter.value = "";
  renderBank();
});
els.nextQuestion.addEventListener("click", nextQuestion);
els.clearWrong.addEventListener("click", () => {
  state.wrong.clear();
  saveWrong();
  renderWrong();
});
els.shortSearch.addEventListener("input", () => renderShorts());
els.chapterFilter.addEventListener("input", () => renderShorts());
els.clearShortSearch.addEventListener("click", () => {
  els.shortSearch.value = "";
  els.chapterFilter.value = "";
  renderShorts();
});
els.randomShort.addEventListener("click", randomShort);

renderSummary();
initSourceFilter();
initChapterFilter();
renderBank();
renderShorts();
renderScore();
