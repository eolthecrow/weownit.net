(() => {
  const allowed = ["en", "ro", "fr"];
  const requested = new URLSearchParams(location.search).get("lang");
  let saved;
  try { saved = localStorage.getItem("siteLanguage"); } catch {}
  const lang = [requested, saved, "en"].find(value => allowed.includes(value));
  document.documentElement.lang = lang;
  document.title = document.querySelector("h1 .l-" + lang).textContent + " · ServiceWatch";
  document.querySelector('[hreflang="' + lang + '"]').setAttribute("aria-current", "page");
  for (const link of document.querySelectorAll("[data-keep]")) {
    const target = new URL(link.href);
    target.searchParams.set("lang", lang);
    link.href = target;
  }
  try { localStorage.setItem("siteLanguage", lang); } catch {}
  const sections = [...document.querySelectorAll("details")];
  let collapsed = [];
  window.addEventListener("beforeprint", () => {
    collapsed = sections.filter(section => !section.open);
    collapsed.forEach(section => { section.open = true; });
  });
  window.addEventListener("afterprint", () => {
    collapsed.forEach(section => { section.open = false; });
  });
  document.getElementById("print").addEventListener("click", () => window.print());
})();
