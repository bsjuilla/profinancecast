  (function () {
    if (!window.matchMedia) return;
    if (!matchMedia('(prefers-reduced-motion: no-preference)').matches) return;
    var gsap = document.createElement('script');
    gsap.src = 'https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js';
    gsap.integrity = 'sha384-g4NTh/Iv5PPU4xPyhEWqPcwtNXOvdaDI8LLnyYfyNZOjKJeYQyjzQ9X5275eBjpt';
    gsap.crossOrigin = 'anonymous';
    gsap.defer = true;
    document.head.appendChild(gsap);
    var st = document.createElement('script');
    st.src = 'https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/ScrollTrigger.min.js';
    st.integrity = 'sha384-Z3REaz79l2IaAZqJsSABtTbhjgOUYyV3p90XNnAPCSHg3EMTz1fouunq9WZRtj3d';
    st.crossOrigin = 'anonymous';
    st.defer = true;
    document.head.appendChild(st);
  })();
