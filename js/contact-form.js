// Contact form: submits to Formspree without leaving the page.
(function initContactForm() {
  const form = document.getElementById("contact-form");
  const note = document.getElementById("contact-form-note");
  if (!form || !note) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitButton = form.querySelector("button[type=submit]");
    submitButton.disabled = true;
    note.textContent = "Sending...";

    try {
      const response = await fetch(form.action, {
        method: "POST",
        body: new FormData(form),
        headers: { Accept: "application/json" },
      });
      if (response.ok) {
        note.textContent = "Message sent. I'll get back to you soon.";
        form.reset();
      } else {
        const data = await response.json().catch(() => null);
        const detail = data?.errors?.[0]?.message ?? data?.error;
        note.textContent = detail ? `Could not send it: ${detail}` : "Could not send it. Try again or reach me another way.";
      }
    } catch {
      note.textContent = "Could not send it. Try again or reach me another way.";
    } finally {
      submitButton.disabled = false;
    }
  });
})();
