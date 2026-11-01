(() => {
  const STORAGE_PREFIX = "moq-quiz:";

  const load = (key) => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_PREFIX + key));
    } catch {
      return null;
    }
  };

  const save = (key, value) => {
    try {
      if (value === null) localStorage.removeItem(STORAGE_PREFIX + key);
      else localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
    } catch {
      /* storage unavailable: progress simply isn't persisted */
    }
  };

  const setupQuiz = (quiz) => {
    const key = quiz.dataset.quizKey;
    const items = [...quiz.querySelectorAll(".quiz-item")];
    const result = quiz.querySelector(".quiz-result");
    const score = quiz.querySelector(".quiz-score");
    let answers = new Array(items.length).fill(null);

    const renderResult = () => {
      if (answers.some((a) => a === null)) {
        result.hidden = true;
        return;
      }
      const correct = answers.filter((a, i) => a === Number(items[i].dataset.answer)).length;
      const total = items.length;
      const message =
        correct === total ? "🎉 全問正解！完璧です！"
        : correct >= total / 2 ? "👍 いい調子！解説を読み返して全問正解を目指そう"
        : "📖 本文をもう一度読んでから再挑戦してみよう";
      score.textContent = `${correct} / ${total} 問正解 — ${message}`;
      result.hidden = false;
      save(key, { correct, total });
    };

    const choose = (itemIndex, choiceIndex) => {
      const item = items[itemIndex];
      const answer = Number(item.dataset.answer);
      const ok = choiceIndex === answer;
      answers[itemIndex] = choiceIndex;
      item.classList.add(ok ? "is-correct" : "is-wrong");
      item.querySelectorAll(".quiz-choice").forEach((btn) => {
        const idx = Number(btn.dataset.index);
        btn.disabled = true;
        if (idx === answer) btn.classList.add("is-answer");
        if (idx === choiceIndex && !ok) btn.classList.add("is-picked-wrong");
      });
      item.querySelector(".quiz-verdict").textContent = ok ? "⭕ 正解！" : "❌ 残念…";
      item.querySelector(".quiz-explain").hidden = false;
      renderResult();
    };

    const reset = () => {
      answers = new Array(items.length).fill(null);
      items.forEach((item) => {
        item.classList.remove("is-correct", "is-wrong");
        item.querySelector(".quiz-explain").hidden = true;
        item.querySelectorAll(".quiz-choice").forEach((btn) => {
          btn.disabled = false;
          btn.classList.remove("is-answer", "is-picked-wrong");
        });
      });
      result.hidden = true;
      save(key, null);
      items[0]?.scrollIntoView({ behavior: "smooth", block: "center" });
    };

    items.forEach((item, i) => {
      item.querySelectorAll(".quiz-choice").forEach((btn) => {
        btn.addEventListener("click", () => choose(i, Number(btn.dataset.index)));
      });
    });
    quiz.querySelector(".quiz-reset").addEventListener("click", reset);

    const previous = load(key);
    if (previous) {
      const note = document.createElement("p");
      note.className = "quiz-previous";
      note.textContent = `前回の結果: ${previous.correct} / ${previous.total} 問正解`;
      quiz.prepend(note);
    }
  };

  const setupProgress = (row) => {
    const status = row.querySelector(".quiz-progress-status");
    const record = load(row.dataset.progressKey);
    if (!record) return;
    const perfect = record.correct === record.total;
    status.textContent = `${perfect ? "🏆" : "✏️"} ${record.correct} / ${record.total}`;
    row.classList.add(perfect ? "is-perfect" : "is-tried");
  };

  document.querySelectorAll(".quiz").forEach(setupQuiz);
  document.querySelectorAll("[data-progress-key]").forEach(setupProgress);
})();
