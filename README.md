# aadilvarshani.github.io

Personal portfolio site for Aadil Varshani, Threat Detection Engineer. Plain HTML/CSS/JS,
no build step, deployed via GitHub Pages.

## Running locally

Just open `index.html` in a browser, or serve it with any static server, e.g.:

```
npx serve .
```

## TODO before the contact form works

The contact form posts to a Formspree placeholder endpoint. To make it actually deliver
messages:

1. Sign up at [formspree.io](https://formspree.io) and create a new form.
2. Copy the form endpoint it gives you (looks like `https://formspree.io/f/xxxxxxxx`).
3. In `index.html`, replace `https://formspree.io/f/YOUR_FORM_ID` (in the `<form action="...">`
   attribute) with your real endpoint.

Until then, submitting the form will always show a "message transmitted" success note
to the visitor, even though nothing is actually sent — messages will not reach you
until a real endpoint is configured.

## Structure

```
index.html      Page markup
css/style.css   Styling
js/script.js    Live clock, mobile nav, contact form handling
assets/         Resume PDF
```
