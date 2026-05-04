// Background generativo — chuva de notas musicais a cair
// Reforço visual da metáfora "rede musical viva".

const SYMBOLS = ['♪', '♫', '♬', '♩', '♭', '♯', '𝆹𝅥', '𝆺𝅥', '𝆹𝅥𝅮', '𝅗𝅥', '𝅘𝅥', '𝅘𝅥𝅮', '𝅘𝅥𝅯', '◌', '✦', '◎'];
const FONT_SIZE = 18;
const FPS = 14;          // velocidade subtil
const COLUMN_SPACING = 1.6;
const TRAIL_FADE = 0.06; // quanto mais alto, mais curto o trail

class NotesRain {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.lastTime = 0;
    this.drops = [];

    this.resize();
    window.addEventListener('resize', () => this.resize());
    requestAnimationFrame((t) => this.tick(t));
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = window.innerWidth * dpr;
    this.canvas.height = window.innerHeight * dpr;
    this.canvas.style.width = window.innerWidth + 'px';
    this.canvas.style.height = window.innerHeight + 'px';
    this.ctx.scale(dpr, dpr);

    const cols = Math.floor(window.innerWidth / (FONT_SIZE * COLUMN_SPACING));
    this.drops = Array(cols).fill(0).map(() => this.makeDrop(true));
  }

  makeDrop(initial = false) {
    return {
      y: initial ? Math.random() * -window.innerHeight : -FONT_SIZE * 2,
      speed: 0.18 + Math.random() * 0.32,
      symbol: SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)],
      opacity: 0.06 + Math.random() * 0.18,
      gold: Math.random() > 0.7,
      changeAt: Math.random() * 80,
      counter: 0,
    };
  }

  tick(time) {
    if (time - this.lastTime > 1000 / FPS) {
      this.draw();
      this.lastTime = time;
    }
    requestAnimationFrame((t) => this.tick(t));
  }

  draw() {
    const w = window.innerWidth;
    const h = window.innerHeight;

    this.ctx.fillStyle = `rgba(6, 11, 23, ${TRAIL_FADE})`;
    this.ctx.fillRect(0, 0, w, h);

    this.ctx.font = `${FONT_SIZE}px "Fraunces", serif`;
    this.ctx.textBaseline = 'top';

    this.drops.forEach((drop, i) => {
      const x = i * FONT_SIZE * COLUMN_SPACING + (FONT_SIZE * COLUMN_SPACING * 0.5);

      this.ctx.fillStyle = drop.gold
        ? `rgba(244, 200, 66, ${drop.opacity})`
        : `rgba(232, 235, 242, ${drop.opacity * 0.55})`;
      this.ctx.fillText(drop.symbol, x, drop.y);

      drop.y += drop.speed * FONT_SIZE;
      drop.counter++;
      if (drop.counter > drop.changeAt) {
        drop.symbol = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
        drop.counter = 0;
        drop.changeAt = 30 + Math.random() * 80;
      }

      if (drop.y > h + 20) {
        Object.assign(drop, this.makeDrop());
      }
    });
  }
}

(function init() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const canvas = document.createElement('canvas');
  canvas.id = 'notes-rain';
  canvas.style.cssText = 'position:fixed;inset:0;z-index:0;pointer-events:none;opacity:0.85;';
  document.body.appendChild(canvas);
  new NotesRain(canvas);
})();
