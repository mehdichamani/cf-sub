import { PROFILES } from './nodes';

/**
 * Common Cyber Freedom / Anti-Censorship styling with faint laser grid & red neon accents
 */
const sharedStyles = `
  :root {
    --bg: #07090e;
    --card-bg: rgba(14, 18, 27, 0.85);
    --card-border: rgba(239, 68, 68, 0.22);
    --card-hover: rgba(20, 26, 38, 0.95);
    --red: #ef4444;
    --red-glow: rgba(239, 68, 68, 0.35);
    --red-hover: #dc2626;
    --text: #f8fafc;
    --text-muted: #94a3b8;
    --mono-font: 'JetBrains Mono', 'Fira Code', ui-monospace, SFMono-Regular, monospace;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Vazirmatn", Tahoma, sans-serif; }
  
  body {
    background-color: var(--bg);
    /* Faint cyber laser grid background */
    background-image: 
      linear-gradient(to right, rgba(239, 68, 68, 0.05) 1px, transparent 1px),
      linear-gradient(to bottom, rgba(239, 68, 68, 0.05) 1px, transparent 1px),
      radial-gradient(ellipse 80% 50% at 50% -10%, rgba(220, 38, 38, 0.18), transparent 75%);
    background-size: 38px 38px, 38px 38px, 100% 100%;
    color: var(--text);
    min-height: 100vh;
  }

  .laser-accent {
    color: var(--red);
    text-shadow: 0 0 10px var(--red-glow);
  }
`;

export function renderLoginPage(errorMessage = ''): string {
  return `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>دسترسی آزاد به اینترنت | ورود</title>
  <style>
    ${sharedStyles}
    body {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1.5rem;
    }
    .login-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      backdrop-filter: blur(12px);
      border-radius: 1rem;
      padding: 2.5rem 2rem;
      width: 100%;
      max-width: 400px;
      box-shadow: 0 20px 40px -10px rgba(0, 0, 0, 0.7), 0 0 20px rgba(239, 68, 68, 0.08);
      text-align: center;
    }
    .freedom-symbol {
      font-size: 2.8rem;
      margin-bottom: 0.8rem;
      display: inline-block;
      filter: drop-shadow(0 0 12px var(--red-glow));
    }
    h1 {
      font-size: 1.35rem;
      font-weight: 800;
      letter-spacing: -0.5px;
      margin-bottom: 0.4rem;
    }
    p {
      color: var(--text-muted);
      font-size: 0.85rem;
      margin-bottom: 1.8rem;
      line-height: 1.5;
    }
    .form-group {
      margin-bottom: 1.25rem;
      text-align: right;
    }
    label {
      display: block;
      margin-bottom: 0.4rem;
      font-size: 0.8rem;
      color: var(--text-muted);
    }
    input[type="password"] {
      width: 100%;
      padding: 0.85rem 1rem;
      background: rgba(7, 9, 14, 0.8);
      border: 1px solid rgba(239, 68, 68, 0.3);
      border-radius: 0.5rem;
      color: #fff;
      font-size: 1rem;
      direction: ltr;
      text-align: center;
      outline: none;
      transition: all 0.2s;
    }
    input[type="password"]:focus {
      border-color: var(--red);
      box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.2);
    }
    .error-msg {
      background: rgba(239, 68, 68, 0.15);
      color: #fca5a5;
      border: 1px solid rgba(239, 68, 68, 0.4);
      padding: 0.65rem;
      border-radius: 0.5rem;
      font-size: 0.8rem;
      margin-bottom: 1rem;
    }
    button {
      width: 100%;
      padding: 0.85rem;
      background: var(--red);
      color: white;
      border: none;
      border-radius: 0.5rem;
      font-size: 0.95rem;
      font-weight: 700;
      cursor: pointer;
      box-shadow: 0 4px 15px rgba(239, 68, 68, 0.35);
      transition: all 0.2s;
    }
    button:hover {
      background: var(--red-hover);
      box-shadow: 0 6px 20px rgba(239, 68, 68, 0.5);
    }
  </style>
</head>
<body>
  <div class="login-card">
    <div class="freedom-symbol">🕊️</div>
    <h1>احراز هویت <span class="laser-accent">دسترسی آزاد</span></h1>
    <p>جهت دریافت سابسکریپشن و دور زدن فیلترینگ، کلید امنیتی را وارد نمایید.</p>
    
    ${errorMessage ? `<div class="error-msg">${errorMessage}</div>` : ''}

    <form method="POST" action="/">
      <div class="form-group">
        <label for="secret">کلید امنیتی (Secret Key):</label>
        <input type="password" id="secret" name="secret" placeholder="••••••••••••" autofocus required>
      </div>
      <button type="submit">ورود به پنل</button>
    </form>
  </div>
</body>
</html>`;
}

export function renderDashboard(secret: string, origin: string): string {
  const profileList = Object.values(PROFILES);

  return `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>درگاه سابسکریپشن ضد سانسور</title>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
  <style>
    ${sharedStyles}
    body {
      padding: 1.5rem 1rem;
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .wrapper {
      width: 100%;
      max-width: 820px;
    }
    header {
      margin-bottom: 2rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid rgba(239, 68, 68, 0.25);
      padding-bottom: 1rem;
    }
    .header-brand {
      display: flex;
      align-items: center;
      gap: 0.6rem;
    }
    .brand-icon {
      font-size: 1.8rem;
      filter: drop-shadow(0 0 8px var(--red-glow));
    }
    h1 {
      font-size: 1.25rem;
      font-weight: 800;
    }
    .header-tag {
      font-size: 0.75rem;
      background: rgba(239, 68, 68, 0.15);
      border: 1px solid rgba(239, 68, 68, 0.35);
      color: #f87171;
      padding: 0.25rem 0.6rem;
      border-radius: 9999px;
      font-weight: 600;
    }
    
    /* Clean, flat list of cards without indentation */
    .links-list {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }
    
    .link-row {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 0.75rem;
      padding: 0.85rem 1.1rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      backdrop-filter: blur(8px);
      transition: all 0.2s ease;
    }
    .link-row:hover {
      background: var(--card-hover);
      border-color: rgba(239, 68, 68, 0.45);
      box-shadow: 0 4px 15px rgba(239, 68, 68, 0.08);
    }
    
    .link-meta {
      display: flex;
      align-items: center;
      gap: 0.65rem;
      min-width: 0;
      flex: 1;
      flex-wrap: wrap;
    }
    .format-pill {
      font-family: var(--mono-font);
      font-size: 0.68rem;
      font-weight: 700;
      padding: 0.2rem 0.45rem;
      border-radius: 0.35rem;
      text-transform: uppercase;
      flex-shrink: 0;
      line-height: 1.2;
    }
    .pill-json {
      background: rgba(168, 85, 247, 0.15);
      color: #c084fc;
      border: 1px solid rgba(168, 85, 247, 0.3);
    }
    .pill-txt {
      background: rgba(239, 68, 68, 0.15);
      color: #f87171;
      border: 1px solid rgba(239, 68, 68, 0.3);
    }
    .pill-yaml {
      background: rgba(14, 165, 233, 0.15);
      color: #38bdf8;
      border: 1px solid rgba(14, 165, 233, 0.3);
    }
    
    .link-name {
      font-size: 0.9rem;
      font-weight: 600;
      color: #f3f4f6;
      word-break: break-word;
      overflow-wrap: break-word;
      direction: ltr;
      text-align: left;
    }

    .link-actions {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      flex-shrink: 0;
    }

    .btn {
      padding: 0.45rem 0.75rem;
      border-radius: 0.45rem;
      font-size: 0.8rem;
      font-weight: 600;
      cursor: pointer;
      border: none;
      display: inline-flex;
      align-items: center;
      gap: 0.3rem;
      text-decoration: none;
      transition: all 0.15s;
    }
    .btn-red {
      background: var(--red);
      color: #fff;
    }
    .btn-red:hover {
      background: var(--red-hover);
      box-shadow: 0 0 10px var(--red-glow);
    }
    .btn-outline {
      background: rgba(255, 255, 255, 0.05);
      color: #e2e8f0;
      border: 1px solid rgba(255, 255, 255, 0.12);
    }
    .btn-outline:hover {
      background: rgba(255, 255, 255, 0.1);
      border-color: rgba(239, 68, 68, 0.4);
    }

    /* Modal for QR Code */
    .modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.8);
      backdrop-filter: blur(6px);
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 100;
      padding: 1rem;
    }
    .modal-overlay.active { display: flex; }
    .modal-content {
      background: #0f141e;
      border: 1px solid rgba(239, 68, 68, 0.4);
      border-radius: 1rem;
      padding: 1.75rem;
      width: 100%;
      max-width: 340px;
      text-align: center;
      box-shadow: 0 0 25px rgba(239, 68, 68, 0.2);
    }
    .modal-title {
      font-size: 1rem;
      font-weight: 700;
      margin-bottom: 0.3rem;
    }
    .modal-sub {
      font-size: 0.8rem;
      color: var(--text-muted);
      margin-bottom: 1.25rem;
    }
    .modal-qr {
      background: #fff;
      padding: 0.85rem;
      border-radius: 0.6rem;
      display: inline-block;
      margin-bottom: 1.25rem;
    }
    .close-btn {
      width: 100%;
      padding: 0.65rem;
      background: #1e293b;
      color: #fff;
      border: none;
      border-radius: 0.45rem;
      cursor: pointer;
      font-size: 0.85rem;
    }

    .toast {
      position: fixed;
      bottom: 2rem;
      background: #10b981;
      color: #fff;
      padding: 0.65rem 1.2rem;
      border-radius: 0.5rem;
      font-size: 0.85rem;
      font-weight: 600;
      box-shadow: 0 10px 20px rgba(0,0,0,0.4);
      opacity: 0;
      transform: translateY(15px);
      transition: all 0.2s;
      pointer-events: none;
      z-index: 200;
    }
    .toast.show {
      opacity: 1;
      transform: translateY(0);
    }

    @media (max-width: 600px) {
      .link-row {
        flex-direction: column;
        align-items: stretch;
        gap: 0.85rem;
      }
      .link-meta {
        width: 100%;
        display: flex;
        flex-direction: row;
        align-items: center;
        flex-wrap: wrap;
        gap: 0.5rem;
      }
      .link-actions {
        width: 100%;
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 0.5rem;
      }
      .link-actions .btn {
        justify-content: center;
        width: 100%;
      }
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <header>
      <div class="header-brand">
        <span class="brand-icon">🕊️</span>
        <div>
          <h1>درگاه سابسکریپشن</h1>
        </div>
      </div>
      <span class="header-tag">Anti-Censorship Sub</span>
    </header>

    <div class="links-list">
      ${profileList.length === 0 ? '<div style="text-align:center; color:var(--text-muted); padding:3rem;">هیچ فایلی در پوشه profiles یافت نشد.</div>' : ''}
      ${profileList
        .map((p) => {
          const isJson = p.format === 'json';
          const isYaml = p.format === 'yaml';
          let targetUrl = '';

          if (isJson || isYaml) {
            targetUrl = `${origin}/${secret}?file=${encodeURIComponent(p.id)}`;
          } else {
            targetUrl = `${origin}/${secret}/sub?file=${encodeURIComponent(p.id)}`;
          }

          let badgeClass = 'pill-txt';
          let badgeText = 'TXT';
          if (isJson) {
            badgeClass = 'pill-json';
            badgeText = 'JSON';
          } else if (isYaml) {
            badgeClass = 'pill-yaml';
            badgeText = 'YAML';
          }

          return `
            <div class="link-row">
              <div class="link-meta">
                <span class="format-pill ${badgeClass}">${badgeText}</span>
                <span class="link-name">${p.filename}</span>
              </div>
              <div class="link-actions">
                <button class="btn btn-red" onclick="copyUrl('${targetUrl}')">📋 کپی لینک</button>
                <button class="btn btn-outline" onclick="openQrModal('${p.filename}', '${targetUrl}')">📱 QR</button>
              </div>
            </div>
          `;
        })
        .join('')}
    </div>
  </div>

  <!-- QR Modal -->
  <div id="qrModal" class="modal-overlay" onclick="closeQrModal(event)">
    <div class="modal-content" onclick="event.stopPropagation()">
      <h3 id="modalTitle" class="modal-title"></h3>
      <p class="modal-sub">اسکن جهت ایمپورت مستقیم در نرم‌افزار</p>
      <div class="modal-qr">
        <div id="modalQrCode"></div>
      </div>
      <button class="close-btn" onclick="closeQrModal()">بستن</button>
    </div>
  </div>

  <div id="toast" class="toast">لینک کپی شد! ✅</div>

  <script>
    let qrInstance = null;

    function openQrModal(title, url) {
      document.getElementById('modalTitle').textContent = title;
      const qrContainer = document.getElementById('modalQrCode');
      qrContainer.innerHTML = '';
      
      qrInstance = new QRCode(qrContainer, {
        text: url,
        width: 190,
        height: 190,
        colorDark: "#000000",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.M
      });

      document.getElementById('qrModal').classList.add('active');
    }

    function closeQrModal() {
      document.getElementById('qrModal').classList.remove('active');
    }

    function copyUrl(text) {
      navigator.clipboard.writeText(text).then(function() {
        const toast = document.getElementById('toast');
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 2000);
      });
    }

    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') closeQrModal();
    });
  </script>
</body>
</html>`;
}
