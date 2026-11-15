// themeable colours: values live in CSS variables (src/index.css) so light / dark mode switch at runtime
const v = (name) => `rgb(var(--wa-${name}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: "#00a884",
        secondary: "#008069",
        wa: {
          teal: v("teal"),
          green: "#00a884",
          greenDark: "#008f72",
          light: v("out"),
          panel: v("panel"),
          rail: v("rail"),
          "rail-active": v("rail-active"),
          chat: v("chat"),
          text: v("text"),
          muted: v("muted"),
          border: v("border"),
          hover: v("hover"),
          tick: "#53bdeb",
          badge: "#25d366",
          surface: v("surface"),
          icon: v("icon"),
          subtle: v("subtle"),
          strong: v("strong"),
          raised: v("raised"),
          line: v("line"),
          quoteOut: v("quote-out"),
          notice: v("notice"),
          chip: v("chip"),
          link: v("link"),
        },
      },
      fontFamily: {
        // "Twemoji Country Flags" only covers flag characters; it's loaded on systems that can't draw flags (Windows)
        sans: ['"Twemoji Country Flags"', '"Segoe UI"', "Helvetica Neue", "Helvetica", "Lucida Grande", "Arial", "Ubuntu", "Cantarell", "Fira Sans", "sans-serif"],
      },
      boxShadow: {
        bubble: "0 1px 0.5px rgba(11,20,26,.13)",
        card: "0 17px 50px 0 rgba(11,20,26,.19), 0 12px 15px 0 rgba(11,20,26,.24)",
        menu: "0 2px 5px 0 rgba(11,20,26,.26), 0 2px 10px 0 rgba(11,20,26,.16)",
      },
      keyframes: {
        slideIn: { from: { transform: "translateX(-100%)" }, to: { transform: "translateX(0)" } },
        pop: { from: { opacity: 0, transform: "scale(.92)" }, to: { opacity: 1, transform: "scale(1)" } },
      },
      animation: {
        slideIn: "slideIn .22s ease-out",
        pop: "pop .15s ease-out",
      },
    },
  },
  plugins: [],
};
