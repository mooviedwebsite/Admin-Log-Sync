import { useRef } from "react";

const STUDIOS = [
  { name: "PARAMOUNT",  logo: "https://upload.wikimedia.org/wikipedia/commons/5/5e/Paramount_Pictures_logo.svg" },
  { name: "DISNEY",     logo: "https://upload.wikimedia.org/wikipedia/commons/3/3e/Disney%2B_logo.svg" },
  { name: "DREAMWORKS", logo: "https://upload.wikimedia.org/wikipedia/commons/4/4d/DreamWorks_Animation_logo.svg" },
  { name: "HBO",        logo: "https://upload.wikimedia.org/wikipedia/commons/d/de/HBO_logo.svg" },
  { name: "PIXAR",      logo: "https://upload.wikimedia.org/wikipedia/commons/7/7a/Pixar_logo.svg" },
  { name: "NETFLIX",    logo: "https://upload.wikimedia.org/wikipedia/commons/0/08/Netflix_2015_logo.svg" },
  { name: "UNIVERSAL",  logo: "https://upload.wikimedia.org/wikipedia/commons/7/7e/Universal_Pictures_logo.svg" },
  { name: "MARVEL",     logo: "https://upload.wikimedia.org/wikipedia/commons/0/04/MarvelLogo.svg" },
];

export default function StudioSlider() {
  const trackRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const activate = (index: number) => {
    if (trackRef.current) trackRef.current.style.animationPlayState = "paused";
    if (wrapperRef.current) wrapperRef.current.dataset.active = "true";
    document.querySelectorAll(".studio-pill").forEach((p, i) => {
      p.classList.toggle("active", i === index || i === index + STUDIOS.length);
    });
  };

  const deactivate = () => {
    if (trackRef.current) trackRef.current.style.animationPlayState = "running";
    if (wrapperRef.current) delete wrapperRef.current.dataset.active;
    document.querySelectorAll(".studio-pill").forEach((p) => p.classList.remove("active"));
  };

  const allStudios = [...STUDIOS, ...STUDIOS]; // duplicate for infinite scroll

  return (
    <>
      <style>{`
        .studio-slider-wrap { position:relative; overflow:hidden; }
        .studio-track {
          display:flex; gap:clamp(10px,2vw,22px); width:max-content;
          animation:studioScroll 30s linear infinite;
          padding:clamp(8px,2vw,16px);
        }
        .studio-pill {
          display:flex; align-items:center; gap:clamp(6px,1.5vw,12px);
          padding:clamp(6px,1.5vw,10px) clamp(12px,2vw,18px);
          border-radius:999px;
          background:rgba(255,255,255,0.05);
          border:1px solid rgba(255,255,255,0.08);
          backdrop-filter:blur(14px); color:#fff;
          font-size:clamp(10px,1.2vw,13px); font-weight:600;
          transition:all .35s ease; white-space:nowrap; cursor:pointer;
          opacity:1; transform:scale(1);
        }
        .studio-logo-box {
          width:clamp(22px,3vw,32px); height:clamp(22px,3vw,32px);
          border-radius:50%; background:rgba(255,255,255,0.08);
          display:flex; align-items:center; justify-content:center;
          overflow:hidden; position:relative;
        }
        .studio-logo-box img { width:75%; height:75%; object-fit:contain; filter:brightness(0) invert(1); }
        .studio-logo-box::after {
          content:""; position:absolute; top:0; left:-100%; width:60%; height:100%;
          background:linear-gradient(120deg,transparent,rgba(255,255,255,0.6),transparent);
          transform:skewX(-20deg);
        }
        .studio-pill.active .studio-logo-box::after { animation:studioShine 1s ease; }
        .studio-slider-wrap[data-active] .studio-pill { opacity:0.25; transform:scale(0.95); }
        .studio-pill.active {
          opacity:1 !important; transform:scale(1.08) !important;
          background:rgba(255,255,255,0.18);
          box-shadow:0 0 20px rgba(255,255,255,0.15),0 10px 25px rgba(255,255,255,0.08);
        }
        @keyframes studioScroll { from{transform:translateX(0)} to{transform:translateX(-50%)} }
        @keyframes studioShine { 0%{left:-100%} 100%{left:140%} }
        .studio-slider-wrap::before,.studio-slider-wrap::after {
          content:""; position:absolute; top:0; width:clamp(30px,8vw,80px);
          height:100%; z-index:2; pointer-events:none;
        }
        .studio-slider-wrap::before { left:0; background:linear-gradient(to right,#000,transparent); }
        .studio-slider-wrap::after  { right:0; background:linear-gradient(to left,#000,transparent); }
        @media(max-width:480px){ .studio-track{animation-duration:40s} }
        @media(min-width:768px){ .studio-track{animation-duration:28s} }
        @media(min-width:1200px){ .studio-track{animation-duration:22s} }
      `}</style>

      <div className="studio-slider-wrap" ref={wrapperRef}>
        <div className="studio-track" ref={trackRef}>
          {allStudios.map((studio, i) => (
            <div
              key={i}
              className="studio-pill"
              onMouseEnter={() => activate(i < STUDIOS.length ? i : i - STUDIOS.length)}
              onMouseLeave={deactivate}
              onClick={() => {
                const el = document.querySelectorAll(".studio-pill")[i];
                if (el?.classList.contains("active")) deactivate();
                else activate(i < STUDIOS.length ? i : i - STUDIOS.length);
              }}
            >
              <div className="studio-logo-box">
                <img src={studio.logo} alt={studio.name} />
              </div>
              {studio.name}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
