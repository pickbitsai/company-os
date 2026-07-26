// Stylesheets for the generated pages.
//
// Lifted verbatim from the original generator with one change: the three theme backdrops are
// templated. Supply your own images via config.backdrops, or fall back to the built-in CSS
// gradients so a fresh clone still ships three distinct visual worlds without any art.

// Base stylesheet — used by every page, including the per-project pages.
// (The extracted blocks already begin with a newline; do not add another.)
export const CSS = `
:root{--bg:#050517;--panel:#0c0c22;--panel2:#13132e;--text:#e6e6f0;--muted:#8a8aa0;--line:rgba(255,255,255,.08);
--cyan:#00f4ff;--green:#00ff88;--coral:#ff6b6b;--amber:#ffcc44}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font-family:Inter,system-ui,sans-serif;line-height:1.5;padding:26px 22px 80px}
.wrap{max-width:1280px;margin:0 auto}
.kicker{font-family:ui-monospace,Consolas,monospace;font-size:12px;letter-spacing:3px;text-transform:uppercase;color:var(--cyan);margin:0 0 6px}
h1{font-size:25px;margin:0 0 4px;color:#fff}h2{font-size:15px;letter-spacing:1px;text-transform:uppercase;color:var(--muted);margin:30px 0 10px}
.doc{color:var(--muted);font-size:13.5px;max-width:960px;margin:0 0 4px}.doc b{color:#cfcfe6}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:12px}
.card{background:var(--panel);border:1px solid var(--line);border-left:3px solid var(--acc,var(--cyan));border-radius:9px;padding:13px 14px;min-width:0}
.card h3{margin:0 0 3px;font-size:15px}.card h3 a{color:#fff;text-decoration:none}.card h3 a:hover{color:var(--cyan)}
.klass{font-family:ui-monospace,monospace;font-size:10.5px;letter-spacing:1.5px;text-transform:uppercase;color:var(--acc,var(--cyan))}
.role{color:var(--muted);font-size:12.5px;margin:6px 0}
.chips{display:flex;flex-wrap:wrap;gap:5px;margin:7px 0 0}
.chip{font-family:ui-monospace,monospace;font-size:10.5px;padding:2px 8px;border-radius:20px;border:1px solid var(--line);color:var(--muted);white-space:nowrap}
.chip.ok{color:var(--green);border-color:rgba(0,255,136,.35)}.chip.bad{color:var(--coral);border-color:rgba(255,107,107,.45)}
.chip.warn{color:var(--amber);border-color:rgba(255,204,68,.4)}.chip a{color:inherit;text-decoration:none}
table{width:100%;border-collapse:collapse;font-size:12.5px}
th{font-family:ui-monospace,monospace;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:var(--muted);text-align:left;padding:6px 10px;border-bottom:1px solid var(--line)}
td{padding:6px 10px;border-bottom:1px solid var(--line);vertical-align:top}
td.mono,.mono{font-family:ui-monospace,Consolas,monospace;font-size:11.5px;color:#b9b9d0}
.flow{display:flex;flex-wrap:wrap;gap:0;align-items:stretch;margin:8px 0}
.node{background:var(--panel2);border:1px solid var(--line);border-top:2px solid var(--acc,var(--cyan));border-radius:8px;padding:10px 12px;margin:6px 0;width:300px}
.node h4{margin:0 0 4px;font-size:13px;color:#fff}.node p{margin:0 0 7px;color:var(--muted);font-size:11.5px}
.arrow{align-self:center;color:var(--acc,var(--cyan));font-size:18px;padding:0 8px;user-select:none}
.cmd{display:flex;gap:6px;align-items:center}
.cmd code{flex:1;overflow-x:auto;white-space:nowrap;background:#08081c;border:1px solid var(--line);border-radius:6px;padding:5px 8px;font-size:11px;color:var(--cyan)}
.copy{font-family:ui-monospace,monospace;font-size:10px;letter-spacing:1px;text-transform:uppercase;background:transparent;border:1px solid var(--cyan);color:var(--cyan);border-radius:5px;padding:4px 8px;cursor:pointer}
.copy:hover{background:var(--cyan);color:#04111a}
ul{margin:4px 0;padding-left:20px;color:var(--muted);font-size:12.5px}
.foot{margin-top:34px;color:#55556e;font-size:11px;font-family:ui-monospace,monospace}
a{color:var(--cyan)}
.statline{display:flex;gap:14px;flex-wrap:wrap;margin:10px 0 0;font-family:ui-monospace,monospace;font-size:11.5px;color:var(--muted)}
.statline b{color:#fff;font-size:15px}
.scripts{display:grid;gap:8px}
.script-group{background:var(--panel);border:1px solid var(--line);border-radius:9px;overflow:hidden}
.script-group summary{display:flex;align-items:center;gap:10px;padding:10px 13px;cursor:pointer;list-style:none;font-family:ui-monospace,Consolas,monospace;font-size:11.5px;letter-spacing:1px;text-transform:uppercase;color:#cfcfe6}
.script-group summary::-webkit-details-marker{display:none}
.script-group summary::after{content:"+";margin-left:auto;color:var(--cyan);font-size:16px}
.script-group[open] summary::after{content:"−"}
.section-count{color:var(--muted);font-size:10px;letter-spacing:1px}
.script-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:9px;padding:4px 13px 13px;border-top:1px solid var(--line)}
.script{min-width:0}
.script-impl{margin:4px 0 0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#6f6f8c;font-size:10.5px}
.script .chips{margin-top:5px}
.gap-list{margin:0;padding-left:18px;color:#cfcfe6;font-size:12.5px}
.gap-list li{margin:0 0 8px}
.gap-list li b{color:var(--amber)}
.gap-list .mono{color:#8a8aa0;font-size:11px}`;

// Built-in gradient backdrops. Deliberately abstract: they must read as "a place" behind
// frosted panels without implying any particular company's art direction.
const GRADIENTS = {
  storybook: "linear-gradient(135deg,#0d2a2e 0%,#123c36 38%,#1d4f3f 62%,#0a1f24 100%)",
  pixel: "linear-gradient(135deg,#070a24 0%,#141a4d 40%,#2a1c5e 68%,#05061a 100%)",
  anime: "linear-gradient(135deg,#0a1030 0%,#1d2260 42%,#3a2470 70%,#070a26 100%)",
};

// Company floor stylesheet. `backdrops` maps theme name -> URL relative to the emitted page.
export function companyCss(backdrops = null) {
  const art = (theme) => {
    const url = backdrops?.[theme];
    return url ? `url('${url}')` : GRADIENTS[theme];
  };
  return `
body.company-page{--company-art:${art("storybook")};--company-ink:#f8f2e6;--company-glass:rgba(13,28,29,.82);--company-soft:rgba(255,245,222,.08);--company-edge:rgba(255,228,174,.24);--company-shadow:rgba(0,13,21,.55);padding:0;background:#07171b;color:var(--company-ink);transition:background-color .35s ease}
body.company-page[data-theme="pixel"]{--company-art:${art("pixel")};--company-ink:#f5f7ff;--company-glass:rgba(5,7,28,.88);--company-soft:rgba(69,92,210,.15);--company-edge:rgba(64,224,255,.34);--company-shadow:rgba(0,0,12,.78)}
body.company-page[data-theme="anime"]{--company-art:${art("anime")};--company-ink:#f4f5ff;--company-glass:rgba(9,13,41,.82);--company-soft:rgba(122,105,255,.13);--company-edge:rgba(101,215,255,.29);--company-shadow:rgba(2,5,24,.72)}
.company-page .wrap{max-width:none;margin:0}
.company-page a{color:inherit}
.company-hero{position:relative;min-height:330px;overflow:hidden;border-bottom:1px solid var(--company-edge);isolation:isolate}
.company-hero::before{content:"";position:absolute;inset:0;background-image:linear-gradient(90deg,rgba(3,15,18,.94) 0%,rgba(4,15,21,.68) 46%,rgba(4,15,21,.2) 100%),var(--company-art);background-position:center;background-size:cover;filter:saturate(.88);z-index:-2;transition:background-image .35s ease}
.company-hero::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,transparent 50%,#07171b 100%);z-index:-1}
.company-nav,.hero-inner,.company-main{width:min(1420px,calc(100% - 36px));margin-inline:auto}
.company-nav{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:18px 0;border-bottom:1px solid rgba(255,255,255,.1)}
.brand-lockup{display:flex;align-items:center;gap:10px;font:700 12px/1 ui-monospace,Consolas,monospace;letter-spacing:2px;text-transform:uppercase}
.brand-mark{display:grid;place-items:center;width:29px;height:29px;border:1px solid var(--cyan);border-radius:9px;color:var(--cyan);box-shadow:0 0 22px rgba(0,244,255,.18)}
.company-links{display:flex;gap:16px;font-size:12px;color:#c7d1d2}.company-links a{text-decoration:none}.company-links a:hover{color:#fff}
.hero-inner{padding:40px 0 62px}
.hero-eyebrow{display:flex;align-items:center;gap:9px;margin:0 0 9px;font:700 11px/1 ui-monospace,Consolas,monospace;letter-spacing:2.5px;text-transform:uppercase;color:#9cc8c5}
.live-dot{width:7px;height:7px;border-radius:50%;background:var(--green);box-shadow:0 0 12px var(--green);animation:companyPulse 2s infinite}
.company-hero h1{max-width:720px;margin:0;color:#fff;font-size:clamp(38px,6vw,74px);line-height:.94;letter-spacing:-.055em}
.company-hero .hero-copy{max-width:650px;margin:17px 0 0;color:#b8c9c8;font-size:14px}
.company-stats{display:flex;flex-wrap:wrap;gap:8px;margin-top:22px}.company-stat{min-width:100px;padding:10px 13px;border:1px solid rgba(255,255,255,.12);border-radius:12px;background:rgba(3,16,19,.55);backdrop-filter:blur(12px)}
.company-stat b{display:block;font-size:19px;color:#fff}.company-stat span{font:10px ui-monospace,Consolas,monospace;color:#9bb0b0;text-transform:uppercase;letter-spacing:1px}
.company-main{padding:0 0 84px}
.floor-heading{display:flex;justify-content:space-between;align-items:flex-end;gap:24px;margin:0 0 14px}.floor-heading h2{margin:0;color:#fff;font-size:22px;letter-spacing:-.02em;text-transform:none}.floor-heading p{margin:5px 0 0;color:#90a4a5;font-size:12px}
.theme-switcher{display:flex;gap:7px;padding:5px;border:1px solid var(--company-edge);border-radius:14px;background:rgba(3,13,20,.72);backdrop-filter:blur(12px)}
.theme-btn{border:0;border-radius:10px;background:transparent;color:#90a5aa;padding:8px 11px;cursor:pointer;font:700 10px ui-monospace,Consolas,monospace;letter-spacing:.7px;text-transform:uppercase;transition:.2s ease}
.theme-btn:hover{color:#fff;background:rgba(255,255,255,.07)}.theme-btn[aria-pressed="true"]{background:#f2ead8;color:#1e2928;box-shadow:0 5px 18px rgba(0,0,0,.28)}
body[data-theme="pixel"] .theme-btn[aria-pressed="true"]{border-radius:0;background:#31e5ff;color:#061023;box-shadow:4px 4px 0 #6927d9}
body[data-theme="anime"] .theme-btn[aria-pressed="true"]{background:linear-gradient(135deg,#6de2ff,#a886ff);color:#0a1030}
.company-floor{position:relative;isolation:isolate;overflow:hidden;min-height:760px;border:1px solid var(--company-edge);border-radius:26px;padding:22px;box-shadow:0 30px 90px var(--company-shadow)}
.company-floor::before{content:"";position:absolute;inset:0;background-image:linear-gradient(180deg,rgba(3,12,18,.18),rgba(3,12,18,.74)),var(--company-art);background-position:center;background-size:cover;filter:saturate(.88);z-index:-2;transition:background-image .35s ease}
.company-floor::after{content:"";position:absolute;inset:0;background:radial-gradient(circle at 50% 42%,transparent,rgba(3,7,14,.26) 58%,rgba(3,7,14,.76));z-index:-1;pointer-events:none}
.floor-status{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:18px;color:#d7e1df;font:10px ui-monospace,Consolas,monospace;letter-spacing:1.3px;text-transform:uppercase}
.floor-legend{display:flex;gap:12px}.legend-item{display:flex;align-items:center;gap:6px}.legend-swatch{width:7px;height:7px;border-radius:50%}.legend-swatch.good{background:var(--green);box-shadow:0 0 8px var(--green)}.legend-swatch.alert{background:var(--coral);box-shadow:0 0 8px var(--coral)}.legend-swatch.manual{background:#a8aec0}
.station-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:13px}
.station{position:relative;min-width:0;min-height:248px;overflow:hidden;border:1px solid var(--company-edge);border-top:3px solid var(--acc);border-radius:18px;padding:14px;background:linear-gradient(150deg,var(--company-glass),rgba(5,12,20,.62));backdrop-filter:blur(13px) saturate(1.1);box-shadow:0 12px 34px rgba(0,0,0,.28);transition:transform .18s ease,border-color .18s ease,background .25s ease}
.station:hover{transform:translateY(-3px);border-color:color-mix(in srgb,var(--acc) 58%,white 12%)}
.station-head{display:flex;justify-content:space-between;align-items:flex-start;gap:10px}.station-number{font:10px ui-monospace,Consolas,monospace;color:#91a3a4;letter-spacing:1.5px}.health-pill{display:flex;align-items:center;gap:6px;border:1px solid rgba(255,255,255,.12);border-radius:999px;padding:4px 8px;font:700 9px ui-monospace,Consolas,monospace;letter-spacing:.7px;text-transform:uppercase}.health-pill::before{content:"";width:6px;height:6px;border-radius:50%;background:#a8aec0}.station.is-healthy .health-pill{color:var(--green)}.station.is-healthy .health-pill::before{background:var(--green);box-shadow:0 0 8px var(--green)}.station.is-alert .health-pill{color:var(--coral)}.station.is-alert .health-pill::before{background:var(--coral);box-shadow:0 0 8px var(--coral);animation:companyPulse 1.2s infinite}.station.is-running .health-pill{color:var(--amber)}.station.is-running .health-pill::before{background:var(--amber);box-shadow:0 0 8px var(--amber)}
.station-body{display:grid;grid-template-columns:minmax(0,1fr) 145px;gap:8px;align-items:end;margin-top:4px}.station-copy{align-self:stretch;padding-top:8px}.station-copy h3{margin:0;font-size:16px;line-height:1.1}.station-copy h3 a{text-decoration:none}.station-copy h3 a::after{content:"";position:absolute;inset:0;z-index:4}.station-copy h3 a:hover{color:#fff}.station-label{margin:5px 0 0;color:var(--acc);font:700 9px ui-monospace,Consolas,monospace;letter-spacing:1.2px;text-transform:uppercase}.station-role{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;overflow:hidden;margin:9px 0 0;color:#aab9ba;font-size:11px;line-height:1.45}.station-pulse{margin-top:8px;padding-left:8px;border-left:2px solid var(--acc);color:#dce8e7;font-size:9px;line-height:1.35}.station-pulse b{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden}.station-pulse span{display:block;margin-top:3px;color:#7f9596;font:8px ui-monospace,Consolas,monospace;text-transform:uppercase}.station-controls{position:relative;z-index:5;display:flex;flex-wrap:wrap;gap:4px;margin-top:9px}.station-control{padding:3px 6px;border:1px solid color-mix(in srgb,var(--acc) 35%,transparent);border-radius:999px;color:#c5d5d6!important;text-decoration:none;font:8px ui-monospace,Consolas,monospace}.station-control:hover{border-color:var(--acc);color:#fff!important}.station-path{position:absolute;left:14px;bottom:12px;max-width:calc(100% - 174px);overflow:hidden;text-overflow:ellipsis;color:#718787;font:9px ui-monospace,Consolas,monospace;white-space:nowrap}
.workstation{position:relative;height:140px;align-self:end;filter:drop-shadow(0 12px 12px rgba(0,0,0,.28))}.avatar{--skin:#c8845b;--hair:#18151c;--shirt:#177f8b;position:absolute;z-index:2;left:15px;bottom:31px;width:66px;height:93px}.avatar-head{position:absolute;left:15px;top:9px;width:40px;height:45px;border-radius:46% 46% 44% 44%;background:var(--skin);box-shadow:inset -5px -4px 0 rgba(76,28,20,.12)}.avatar-hair{position:absolute;z-index:2;left:12px;top:3px;width:46px;height:26px;border-radius:50% 55% 22% 30%;background:var(--hair);transform:rotate(-3deg)}.avatar-hair::after{content:"";position:absolute;right:0;top:13px;width:10px;height:26px;border-radius:0 7px 12px 0;background:var(--hair)}.avatar-eye{position:absolute;z-index:3;top:31px;width:4px;height:5px;border-radius:50%;background:#18151b}.avatar-eye.left{left:25px}.avatar-eye.right{left:43px}.avatar-mouth{position:absolute;z-index:3;left:33px;top:44px;width:8px;height:3px;border-bottom:2px solid rgba(58,25,22,.66);border-radius:50%}.avatar-body{position:absolute;left:8px;bottom:0;width:56px;height:43px;border-radius:17px 17px 8px 8px;background:var(--shirt);box-shadow:inset -7px 0 rgba(0,0,0,.12)}.avatar-body::before{content:"";position:absolute;left:20px;top:7px;width:17px;height:10px;border-radius:2px;background:rgba(255,255,255,.13);border:1px solid rgba(255,255,255,.16)}
.hair-bun .avatar-hair::before{content:"";position:absolute;right:2px;top:-10px;width:18px;height:18px;border-radius:50%;background:var(--hair)}.hair-spike .avatar-hair{clip-path:polygon(0 50%,8% 8%,28% 33%,43% 0,56% 31%,76% 5%,74% 39%,100% 24%,91% 100%,8% 100%);border-radius:0}.hair-cap .avatar-hair{height:17px;border-radius:20px 20px 4px 4px}.hair-cap .avatar-hair::before{content:"";position:absolute;left:-7px;bottom:-3px;width:29px;height:7px;border-radius:8px;background:var(--hair)}.hair-long .avatar-hair::after,.hair-bob .avatar-hair::after{width:16px;height:40px}.hair-wave .avatar-hair{transform:rotate(-7deg);border-radius:60% 25% 45% 20%}.hair-dome .avatar-hair{border-radius:28px 28px 4px 4px}.hair-headset .avatar-hair::before{content:"";position:absolute;left:-5px;top:5px;width:50px;height:37px;border:4px solid #7583ff;border-bottom:0;border-radius:35px 35px 0 0}.hair-headset .avatar-hair::after{right:-6px;top:24px;width:9px;height:16px;background:#7583ff}
.desk{position:absolute;right:0;bottom:5px;width:132px;height:45px;border-radius:5px;background:linear-gradient(#8c684b 0 13px,#3c2c2b 13px 18px,transparent 18px);border-top:2px solid rgba(255,230,190,.38)}.desk::before,.desk::after{content:"";position:absolute;top:17px;width:8px;height:34px;background:#332526}.desk::before{left:10px}.desk::after{right:10px}.monitor{position:absolute;right:27px;bottom:37px;width:71px;height:54px;padding:7px;border:5px solid #252b32;border-bottom-width:8px;border-radius:6px;background:linear-gradient(145deg,color-mix(in srgb,var(--acc) 28%,#06101a),#071018);box-shadow:inset 0 0 14px color-mix(in srgb,var(--acc) 30%,transparent),0 0 12px color-mix(in srgb,var(--acc) 24%,transparent)}.monitor::after{content:"";position:absolute;left:27px;bottom:-15px;width:10px;height:10px;background:#252b32}.monitor b{display:block;overflow:hidden;color:var(--acc);font:700 7px ui-monospace,Consolas,monospace;letter-spacing:.5px;white-space:nowrap}.monitor-line{display:block;width:78%;height:2px;margin-top:6px;background:var(--acc);box-shadow:13px 7px 0 color-mix(in srgb,var(--acc) 45%,transparent),-3px 14px 0 color-mix(in srgb,var(--acc) 70%,transparent)}.station.is-running .monitor{animation:monitorGlow 1.6s infinite alternate}
.chip-link{position:relative;z-index:5}.chip-link a{color:inherit;text-decoration:none}.chip-link:hover{color:var(--acc);border-color:color-mix(in srgb,var(--acc) 50%,transparent)}
.workstation.has-art{display:grid;place-items:center;padding-bottom:6px;filter:none}
.avatar-art{width:126px;height:126px;border-radius:20px;overflow:hidden;border:1px solid color-mix(in srgb,var(--acc) 42%,transparent);background:#080a1c;box-shadow:0 10px 26px rgba(0,0,0,.42),inset 0 0 20px color-mix(in srgb,var(--acc) 13%,transparent);transition:border-color .18s ease,box-shadow .25s ease}
.avatar-art img{display:block;width:100%;height:100%;object-fit:cover}
.station:hover .avatar-art{border-color:color-mix(in srgb,var(--acc) 68%,white 10%)}
.station.is-running .avatar-art{animation:monitorGlow 1.6s infinite alternate}
.avatar-badge{position:absolute;right:12px;bottom:10px;z-index:3;padding:3px 8px;border-radius:999px;border:1px solid color-mix(in srgb,var(--acc) 45%,transparent);background:rgba(4,10,18,.84);color:var(--acc);font:700 8px ui-monospace,Consolas,monospace;letter-spacing:1.2px}
body[data-theme="pixel"] .avatar-art{border-radius:0;image-rendering:pixelated;box-shadow:5px 5px 0 rgba(2,3,14,.6)}body[data-theme="pixel"] .avatar-badge{border-radius:0}
body[data-theme="anime"] .avatar-art{border-radius:0;clip-path:polygon(0 0,calc(100% - 12px) 0,100% 12px,100% 100%,12px 100%,0 calc(100% - 12px))}
body[data-theme="pixel"] .company-hero::before,body[data-theme="pixel"] .company-floor::before{image-rendering:pixelated;filter:saturate(1.18) contrast(1.08)}body[data-theme="pixel"] .company-floor,body[data-theme="pixel"] .station,body[data-theme="pixel"] .theme-switcher,body[data-theme="pixel"] .health-pill,body[data-theme="pixel"] .avatar-head,body[data-theme="pixel"] .avatar-body,body[data-theme="pixel"] .monitor{border-radius:0}body[data-theme="pixel"] .station{box-shadow:6px 6px 0 rgba(2,3,14,.72);backdrop-filter:none}body[data-theme="pixel"] .avatar,body[data-theme="pixel"] .desk{image-rendering:pixelated;filter:none}body[data-theme="pixel"] .avatar-head,body[data-theme="pixel"] .avatar-body,body[data-theme="pixel"] .avatar-hair{box-shadow:none}
body[data-theme="anime"] .station{background:linear-gradient(145deg,rgba(9,15,47,.9),rgba(18,12,51,.68));clip-path:polygon(0 0,calc(100% - 14px) 0,100% 14px,100% 100%,14px 100%,0 calc(100% - 14px))}body[data-theme="anime"] .avatar-eye{width:5px;height:7px;background:#17224e;border-bottom:2px solid #dff9ff}body[data-theme="anime"] .monitor{border-color:#273158}
.ops-directory{margin-top:34px}.ops-directory>h2{margin:0 0 5px;color:#fff;font-size:22px;letter-spacing:-.02em;text-transform:none}.ops-directory>.doc{margin-bottom:14px}.ops-section{margin-top:14px;border:1px solid var(--company-edge);border-radius:18px;background:rgba(5,13,22,.78);overflow:hidden}.ops-section summary{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:15px 17px;color:#eef4f4;cursor:pointer;font:700 12px ui-monospace,Consolas,monospace;letter-spacing:1px;text-transform:uppercase;list-style:none}.ops-section summary::-webkit-details-marker{display:none}.ops-section summary::after{content:"+";color:var(--cyan);font-size:18px}.ops-section[open] summary::after{content:"−"}.section-count{margin-right:auto;color:#71898d;font-size:10px}.table-shell{overflow-x:auto;border-top:1px solid rgba(255,255,255,.07)}.company-page table{min-width:720px;background:rgba(3,9,17,.36)}.company-page th{padding:10px 12px;color:#789094;background:rgba(255,255,255,.025)}.company-page td{padding:9px 12px;border-color:rgba(255,255,255,.065)}.company-page tr:hover td{background:rgba(255,255,255,.025)}.company-page .doc{color:#91a2a5}.company-page .foot{width:min(1420px,calc(100% - 36px));margin:30px auto 0;color:#577074}
@keyframes companyPulse{50%{opacity:.45;transform:scale(.82)}}@keyframes monitorGlow{to{box-shadow:inset 0 0 19px color-mix(in srgb,var(--acc) 45%,transparent),0 0 19px color-mix(in srgb,var(--acc) 35%,transparent)}}
@media(max-width:980px){.station-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.company-floor{min-height:0}.floor-heading{align-items:flex-start;flex-direction:column}.theme-switcher{width:100%;overflow-x:auto}.theme-btn{flex:1;white-space:nowrap}}
@media(max-width:640px){.company-links{display:none}.company-nav,.hero-inner,.company-main{width:min(100% - 22px,1420px)}.company-hero h1{font-size:43px}.company-floor{padding:10px;border-radius:17px}.floor-status{align-items:flex-start;flex-direction:column}.station-grid{grid-template-columns:1fr}.station{min-height:202px}.station-body{grid-template-columns:minmax(0,1fr) 135px}.station-path{max-width:calc(100% - 155px)}}
@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important}.live-dot,.station.is-alert .health-pill::before,.station.is-running .monitor,.station.is-running .avatar-art{animation:none!important}.station{transition:none}}
`;
}
