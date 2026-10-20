import { PROFILES } from './nodes';

export function renderLoginPage(errorMessage = ''): string {
  return `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>دریافت لینک سابسکریپشن | ورود</title>
  <style>
    :root {
      --bg: #0b0f19;
      --card-bg: #151e2e;
      --primary: #3b82f6;
      --primary-hover: #2563eb;
      --text: #f8fafc;
      --text-muted: #94a3b8;
      --border: #243044;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Vazirmatn", Tahoma, sans-serif; }
    body {
      background: radial-gradient(circle at top, #1e293b 0%, var(--bg) 100%);
      color: var(--text);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1.5rem;
    }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 1.25rem;
      padding: 2.5rem 2rem;
      width: 100%;
      max-width: 420px;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
      text-align: center;
    }
    .icon {
      font-size: 3rem;
      margin-bottom: 1rem;
      display: inline-block;
    }
    h1 {
      font-size: 1.5rem;
      margin-bottom: 0.5rem;
      font-weight: 700;
    }
    p {
      color: var(--text-muted);
      font-size: 0.9rem;
      margin-bottom: 2rem;
      line-height: 1.6;
    }
    .form-group {
      margin-bottom: 1.5rem;
      text-align: right;
    }
    label {
      display: block;
      margin-bottom: 0.5rem;
      font-size: 0.85rem;
      color: var(--text-muted);
    }
    input[type="password"] {
      width: 100%;
      padding: 0.85rem 1rem;
      background: #0b0f19;
      border: 1px solid var(--border);
      border-radius: 0.75rem;
      color: #fff;
      font-size: 1rem;
      direction: ltr;
      text-align: center;
      transition: all 0.2s;
      outline: none;
    }
    input:focus {
      border-color: var(--primary);
      box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.25);
    }
    .error-msg {
      background: rgba(239, 68, 68, 0.15);
      color: #fca5a5;
      border: 1px solid rgba(239, 68, 68, 0.3);
      padding: 0.75rem;
      border-radius: 0.6rem;
      font-size: 0.85rem;
      margin-bottom: 1.25rem;
    }
    button {
      width: 100%;
      padding: 0.9rem;
      background: var(--primary);
      color: white;
      border: none;
      border-radius: 0.75rem;
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.2s;
    }
    button:hover {
      background: var(--primary-hover);
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">🔐</div>
    <h1>احراز هویت سابسکریپشن</h1>
    <p>جهت دسترسی به لینک‌ها و QR کدها، رمز عبور اختصاصی (Secret) را وارد نمایید.</p>
    
    ${errorMessage ? `<div class="error-msg">${errorMessage}</div>` : ''}

    <form method="POST" action="/">
      <div class="form-group">
        <label for="secret">رمز عبور (Secret Key):</label>
        <input type="password" id="secret" name="secret" placeholder="••••••••••••" autofocus required>
      </div>
      <button type="submit">ورود و مشاهده لینک‌ها</button>
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
  <title>پروفایل‌ها و لینک‌های سابسکریپشن</title>
  <!-- QRCode library -->
  <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
  <style>
    :root {
      --bg: #0b0f19;
      --card-bg: #151e2e;
      --card-hover: #192437;
      --primary: #3b82f6;
      --primary-hover: #2563eb;
      --enhanced-bg: rgba(16, 185, 129, 0.12);
      --enhanced-border: #10b981;
      --enhanced-badge: #34d399;
      --chain-bg: rgba(168, 85, 247, 0.12);
      --chain-border: #a855f7;
      --chain-badge: #c084fc;
      --text: #f8fafc;
      --text-muted: #94a3b8;
      --border: #243044;
      --group-border: #1e293b;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Vazirmatn", Tahoma, sans-serif; }
    body {
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
      padding: 1.5rem 1rem;
    }
    .container {
      max-width: 860px;
      margin: 0 auto;
    }
    header {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 2rem;
      padding-bottom: 1.25rem;
      border-bottom: 1px solid var(--border);
    }
    .header-title h1 {
      font-size: 1.45rem;
      font-weight: 800;
      color: #fff;
    }
    .header-title p {
      color: var(--text-muted);
      font-size: 0.88rem;
      margin-top: 0.35rem;
    }
    .logout-btn {
      background: #1f293d;
      color: var(--text-muted);
      border: 1px solid var(--border);
      padding: 0.45rem 0.95rem;
      border-radius: 0.5rem;
      text-decoration: none;
      font-size: 0.85rem;
      transition: all 0.2s;
    }
    .logout-btn:hover {
      background: #27354f;
      color: #fff;
    }
    .list-wrapper {
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }
    
    /* Config Group Container */
    .group-section {
      background: rgba(21, 30, 46, 0.6);
      border: 1px solid var(--border);
      border-radius: 1.1rem;
      overflow: hidden;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3);
    }
    .group-header {
      background: rgba(30, 41, 59, 0.7);
      padding: 0.85rem 1.25rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid var(--border);
    }
    .group-header-info {
      display: flex;
      align-items: center;
      gap: 0.6rem;
    }
    .group-tag {
      background: #3b82f6;
      color: #fff;
      font-size: 0.75rem;
      font-weight: 700;
      padding: 0.2rem 0.6rem;
      border-radius: 0.35rem;
      font-family: monospace;
    }
    .group-name {
      font-size: 1.05rem;
      font-weight: 700;
      color: #f1f5f9;
    }
    .group-count {
      font-size: 0.75rem;
      color: var(--text-muted);
      background: #0f172a;
      padding: 0.2rem 0.55rem;
      border-radius: 0.35rem;
      border: 1px solid var(--border);
    }

    .group-body {
      padding: 1rem;
      display: flex;
      flex-direction: column;
      gap: 0.85rem;
    }

    .sub-profiles-container {
      margin-right: 1.5rem;
      padding-right: 1rem;
      border-right: 2px dashed #2d3d54;
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      position: relative;
    }
    .sub-profiles-header {
      font-size: 0.78rem;
      color: var(--text-muted);
      font-weight: 600;
      margin-bottom: -0.25rem;
      display: flex;
      align-items: center;
      gap: 0.4rem;
    }

    .item-card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 0.85rem;
      padding: 0.95rem 1.25rem;
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      transition: all 0.2s;
    }
    .item-card:hover {
      background: var(--card-hover);
      border-color: #334155;
    }
    .item-card.is-main {
      border-color: rgba(59, 130, 246, 0.4);
      background: linear-gradient(135deg, rgba(59, 130, 246, 0.05) 0%, var(--card-bg) 100%);
    }
    .item-card.is-enhanced {
      border-color: rgba(16, 185, 129, 0.4);
      background: linear-gradient(135deg, rgba(16, 185, 129, 0.05) 0%, var(--card-bg) 100%);
    }
    .item-card.is-chain {
      border-color: rgba(168, 85, 247, 0.4);
      background: linear-gradient(135deg, rgba(168, 85, 247, 0.05) 0%, var(--card-bg) 100%);
    }
    .item-card.is-sub {
      background: #101726;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
    }
    .item-card.is-sub:hover {
      background: #141d2e;
    }
    .item-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 0.6rem;
    }
    .item-title-wrap {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      flex-wrap: wrap;
    }
    .badge {
      font-size: 0.72rem;
      padding: 0.22rem 0.55rem;
      border-radius: 0.35rem;
      font-weight: 600;
      direction: ltr;
      font-family: monospace;
      background: #1e293b;
      color: var(--text-muted);
    }
    .badge-main {
      background: rgba(59, 130, 246, 0.15);
      color: #60a5fa;
      border: 1px solid rgba(59, 130, 246, 0.35);
    }
    .badge-enhanced {
      background: var(--enhanced-bg);
      color: var(--enhanced-badge);
      border: 1px solid rgba(16, 185, 129, 0.35);
    }
    .badge-chain {
      background: var(--chain-bg);
      color: var(--chain-badge);
      border: 1px solid rgba(168, 85, 247, 0.35);
    }
    .item-name {
      font-size: 0.98rem;
      font-weight: 600;
      color: #fff;
    }
    .item-middle {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      flex-wrap: wrap;
    }
    .url-input {
      flex: 1;
      min-width: 250px;
      background: #0a0e17;
      border: 1px solid var(--border);
      border-radius: 0.5rem;
      padding: 0.5rem 0.75rem;
      color: #94a3b8;
      font-size: 0.8rem;
      direction: ltr;
      font-family: monospace;
      outline: none;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .url-input:focus {
      color: #fff;
      border-color: var(--primary);
    }
    .item-buttons {
      display: flex;
      gap: 0.5rem;
    }
    .btn {
      padding: 0.45rem 0.85rem;
      border-radius: 0.5rem;
      font-size: 0.8rem;
      font-weight: 600;
      cursor: pointer;
      border: none;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      transition: all 0.2s;
    }
    .btn-primary {
      background: var(--primary);
      color: #fff;
    }
    .btn-primary:hover {
      background: var(--primary-hover);
    }
    .btn-qr {
      background: #1e293b;
      color: #e2e8f0;
      border: 1px solid var(--border);
    }
    .btn-qr:hover {
      background: #2b394f;
      color: #fff;
    }
    .btn-raw {
      background: transparent;
      color: var(--text-muted);
      border: 1px solid var(--border);
    }
    .btn-raw:hover {
      background: #1e293b;
      color: #fff;
    }
    /* Modal for QR Code */
    .modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.75);
      backdrop-filter: blur(4px);
      display: none;
      align-items: center;
      justify-content: center;
      padding: 1rem;
      z-index: 1000;
    }
    .modal-overlay.active {
      display: flex;
    }
    .modal-content {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 1rem;
      padding: 1.75rem;
      max-width: 360px;
      width: 100%;
      text-align: center;
      box-shadow: 0 20px 40px rgba(0,0,0,0.6);
      position: relative;
    }
    .modal-title {
      font-size: 1.1rem;
      margin-bottom: 0.25rem;
    }
    .modal-sub {
      font-size: 0.8rem;
      color: var(--text-muted);
      margin-bottom: 1.25rem;
    }
    .modal-qr {
      background: #fff;
      padding: 0.85rem;
      border-radius: 0.75rem;
      display: inline-flex;
      margin-bottom: 1.25rem;
    }
    .close-modal-btn {
      width: 100%;
      padding: 0.65rem;
      background: #1e293b;
      color: #fff;
      border: 1px solid var(--border);
      border-radius: 0.5rem;
      cursor: pointer;
      font-size: 0.9rem;
    }
    .close-modal-btn:hover {
      background: #2a3a52;
    }
    .toast {
      position: fixed;
      bottom: 2rem;
      left: 50%;
      transform: translateX(-50%);
      background: #10b981;
      color: #fff;
      padding: 0.6rem 1.25rem;
      border-radius: 2rem;
      font-size: 0.85rem;
      box-shadow: 0 10px 20px rgba(0,0,0,0.3);
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.3s;
      z-index: 2000;
    }
    .toast.show {
      opacity: 1;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="header-title">
        <h1>🚀 پنل سابسکریپشن V2Ray / Xray</h1>
        <p>فهرست پروفایل‌ها، لینک‌های پالایش‌شده (Enhanced) و نودهای خام جهت آپدیت خودکار کلاینت‌ها</p>
      </div>
      <a href="/" class="logout-btn">خروج ✕</a>
    </header>

    <div class="list-wrapper">
      ${(() => {
        // Group profiles by baseGroup
        interface GroupData {
          baseGroup: string;
          mainProfile?: typeof profileList[0];
          enhancedProfile?: typeof profileList[0];
          chainProfile?: typeof profileList[0];
          otherProfiles: typeof profileList;
        }

        const groupsMap = new Map<string, GroupData>();

        for (const p of profileList) {
          const groupKey = p.baseGroup || p.id.replace(/\.(enhanced|chain)$/, '');
          if (!groupsMap.has(groupKey)) {
            groupsMap.set(groupKey, {
              baseGroup: groupKey,
              otherProfiles: [],
            });
          }
          const group = groupsMap.get(groupKey)!;

          if (p.isEnhanced) {
            group.enhancedProfile = p;
          } else if (p.isChain) {
            group.chainProfile = p;
          } else if (p.id === groupKey) {
            group.mainProfile = p;
          } else {
            group.otherProfiles.push(p);
          }
        }

        const renderCard = (p: typeof profileList[0], role: 'main' | 'enhanced' | 'chain' | 'other', isSub = false) => {
          const subUrl = `${origin}/${secret}/sub?file=${encodeURIComponent(p.id)}`;
          const rawUrl = `${origin}/${secret}/raw?file=${encodeURIComponent(p.id)}`;
          
          let cardTypeClass = 'is-main';
          let badgeTypeClass = 'badge-main';
          let roleTag = '📦 نسخه اصلی';

          if (role === 'enhanced') {
            cardTypeClass = 'is-enhanced';
            badgeTypeClass = 'badge-enhanced';
            roleTag = '⚡ پایش‌شده (Enhanced)';
          } else if (role === 'chain') {
            cardTypeClass = 'is-chain';
            badgeTypeClass = 'badge-chain';
            roleTag = '🔗 چِین پروکسی (Chain)';
          }

          const cardClass = `item-card ${cardTypeClass}${isSub ? ' is-sub' : ''}`;

          return `
            <div class="${cardClass}">
              <div class="item-top">
                <div class="item-title-wrap">
                  <span class="badge ${badgeTypeClass}">${roleTag}</span>
                  <span class="item-name">${p.filename}</span>
                </div>
                <div class="item-buttons">
                  <button class="btn btn-primary" onclick="copyUrl('${subUrl}')">📋 کپی لینک</button>
                  <button class="btn btn-qr" onclick="openQrModal('${p.name}', '${subUrl}')">📱 بارکد QR</button>
                  <a href="${rawUrl}" target="_blank" class="btn btn-raw">👁️ نودها</a>
                </div>
              </div>
              <div class="item-middle">
                <input type="text" readonly class="url-input" value="${subUrl}" onclick="this.select()">
              </div>
            </div>
          `;
        };

        return Array.from(groupsMap.values())
          .map((group) => {
            const hasSub = !!(group.enhancedProfile || group.chainProfile || group.otherProfiles.length > 0);
            const totalInGroup = (group.mainProfile ? 1 : 0) + 
              (group.enhancedProfile ? 1 : 0) + 
              (group.chainProfile ? 1 : 0) + 
              group.otherProfiles.length;

            return `
            <div class="group-section">
              <div class="group-header">
                <div class="group-header-info">
                  <span class="group-tag">CONFIG</span>
                  <span class="group-name">کانفیگ پایه: ${group.baseGroup}</span>
                </div>
                <span class="group-count">${totalInGroup} پروفایل در دسترس</span>
              </div>
              
              <div class="group-body">
                ${group.mainProfile ? renderCard(group.mainProfile, 'main', false) : ''}
                
                ${hasSub ? `
                  <div class="sub-profiles-container">
                    <div class="sub-profiles-header">
                      <span>↳ پروفایل‌های پالایش‌شده و ویژه (زیرمجموعه ${group.baseGroup}):</span>
                    </div>
                    ${group.enhancedProfile ? renderCard(group.enhancedProfile, 'enhanced', true) : ''}
                    ${group.chainProfile ? renderCard(group.chainProfile, 'chain', true) : ''}
                    ${group.otherProfiles.map((p) => renderCard(p, 'other', true)).join('')}
                  </div>
                ` : ''}
              </div>
            </div>
            `;
          })
          .join('');
      })()}
    </div>
  </div>

  <!-- QR Code Modal -->
  <div id="qrModal" class="modal-overlay" onclick="closeQrModal(event)">
    <div class="modal-content" onclick="event.stopPropagation()">
      <h3 id="modalTitle" class="modal-title"></h3>
      <p class="modal-sub">این QR کد را با دوربین نرم‌افزار V2Ray خود اسکن کنید</p>
      <div class="modal-qr">
        <div id="modalQrCode"></div>
      </div>
      <button class="close-modal-btn" onclick="closeQrModal()">بستن پنجره</button>
    </div>
  </div>

  <div id="toast" class="toast">لینک سابسکریپشن با موفقیت کپی شد! ✅</div>

  <script>
    let qrInstance = null;

    function openQrModal(title, url) {
      document.getElementById('modalTitle').textContent = title;
      const qrContainer = document.getElementById('modalQrCode');
      qrContainer.innerHTML = '';
      
      qrInstance = new QRCode(qrContainer, {
        text: url,
        width: 200,
        height: 200,
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

    // Close modal on Escape
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') closeQrModal();
    });
  </script>
</body>
</html>`;
}
