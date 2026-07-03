(function () {
  const root = document.querySelector("[data-code-slideshow]");
  if (!root) return;

  const slides = Array.from(root.querySelectorAll("[data-slide]"));
  const dotsRoot = document.querySelector("[data-slide-dots]");
  const prev = document.querySelector("[data-slide-prev]");
  const next = document.querySelector("[data-slide-next]");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let activeIndex = Math.max(0, slides.findIndex((slide) => slide.classList.contains("is-active")));
  let timer = null;

  function setActive(index) {
    activeIndex = (index + slides.length) % slides.length;
    slides.forEach((slide, slideIndex) => {
      const active = slideIndex === activeIndex;
      slide.classList.toggle("is-active", active);
      slide.setAttribute("aria-hidden", active ? "false" : "true");
    });
    dotsRoot?.querySelectorAll("button").forEach((dot, dotIndex) => {
      dot.setAttribute("aria-current", dotIndex === activeIndex ? "true" : "false");
    });
  }

  function stop() {
    if (!timer) return;
    window.clearInterval(timer);
    timer = null;
  }

  function start() {
    if (reduceMotion || timer || slides.length < 2) return;
    timer = window.setInterval(() => setActive(activeIndex + 1), 6200);
  }

  if (dotsRoot) {
    dotsRoot.innerHTML = slides.map((_, index) => `<button type="button" aria-label="Show code example ${index + 1}">${index + 1}</button>`).join("");
    dotsRoot.querySelectorAll("button").forEach((dot, index) => {
      dot.addEventListener("click", () => {
        stop();
        setActive(index);
        start();
      });
    });
  }

  prev?.addEventListener("click", () => {
    stop();
    setActive(activeIndex - 1);
    start();
  });

  next?.addEventListener("click", () => {
    stop();
    setActive(activeIndex + 1);
    start();
  });

  root.addEventListener("mouseenter", stop);
  root.addEventListener("mouseleave", start);
  root.addEventListener("focusin", stop);
  root.addEventListener("focusout", start);

  setActive(activeIndex);
  start();
})();
