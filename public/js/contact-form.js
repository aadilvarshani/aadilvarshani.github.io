// Contact form: submits to Formspree without leaving the page, and moves the message along
// the Write > Send > Inbox > Reply strip as it goes. Without JS the form posts normally.
(function initContactForm() {
  const form = document.getElementById("contact-form");
  const note = document.getElementById("contact-form-note");
  if (!form || !note) return;

  const path = document.querySelector("[data-message-path]");
  const step = (name) => path?.querySelector(`[data-step="${name}"]`);
  const requiredFields = Array.from(form.querySelectorAll("[required]"));
  const submitButton = form.querySelector("button[type=submit]");

  // States: idle (unlit), active (pulsing), done (lit), failed (red).
  function setStep(name, state) {
    const element = step(name);
    if (element) element.dataset.state = state;
  }

  function isWritten() {
    return requiredFields.every((field) => field.value.trim() !== "");
  }

  function showWritingProgress() {
    setStep("write", isWritten() ? "done" : "idle");
    setStep("send", "idle");
    setStep("inbox", "idle");
  }

  function showSending() {
    setStep("write", "done");
    setStep("send", "active");
    setStep("inbox", "idle");
    note.textContent = "Sending...";
  }

  function showDelivered() {
    setStep("send", "done");
    setStep("inbox", "done");
    note.textContent = "250 OK. Message delivered.";
  }

  function showFailed(detail) {
    setStep("send", "failed");
    setStep("inbox", "idle");
    note.textContent = detail ? `Not delivered: ${detail}. Try again.` : "Not delivered. Check your connection and try again.";
  }

  async function errorDetail(response) {
    const data = await response.json().catch(() => null);
    return data?.errors?.[0]?.message ?? data?.error ?? null;
  }

  form.addEventListener("input", () => {
    showWritingProgress();
    if (note.textContent) note.textContent = "";
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    submitButton.disabled = true;
    showSending();
    try {
      const response = await fetch(form.action, {
        method: "POST",
        body: new FormData(form),
        headers: { Accept: "application/json" },
      });
      if (!response.ok) {
        showFailed(await errorDetail(response));
        return;
      }
      form.reset();
      showDelivered();
    } catch {
      showFailed(null);
    } finally {
      submitButton.disabled = false;
    }
  });

  showWritingProgress();
})();
