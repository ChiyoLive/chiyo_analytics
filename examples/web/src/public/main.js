// Shared code for the traditional web application example

// 1. UTM parameters auto-injection
if (!window.location.search) {
  window.history.replaceState(
    null,
    '',
    '?utm_source=demo_app&utm_medium=web&utm_campaign=summer_promo&gclid=gclid_example_999'
  );
}

// 2. Active nav links setup
document.addEventListener('DOMContentLoaded', () => {
  const path = window.location.pathname;
  const navLinks = document.querySelectorAll('.nav-link');
  navLinks.forEach(link => {
    link.classList.remove('active');
    const href = link.getAttribute('href');
    if (href === 'index.html' || href === '/') {
      if (path === '/' || path.endsWith('index.html') || path === '') {
        link.classList.add('active');
      }
    } else if (href === 'products.html') {
      if (path.endsWith('products.html') || path.endsWith('product.html')) {
        link.classList.add('active');
      }
    }
  });
});

// 3. Theme Toggle Setup
(function initTheme() {
  const currentTheme = localStorage.getItem('theme') || 'dark';
  if (currentTheme === 'dark') {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
})();

document.addEventListener('DOMContentLoaded', () => {
  const toggleBtn = document.getElementById('theme-toggle');
  if (toggleBtn) {
    // Render initial toggle icon
    updateThemeToggleUI();

    toggleBtn.addEventListener('click', () => {
      const isDark = document.documentElement.classList.contains('dark');
      if (isDark) {
        document.documentElement.classList.remove('dark');
        localStorage.setItem('theme', 'light');
      } else {
        document.documentElement.classList.add('dark');
        localStorage.setItem('theme', 'dark');
      }
      updateThemeToggleUI();
    });
  }
});

function updateThemeToggleUI() {
  const toggleBtn = document.getElementById('theme-toggle');
  if (toggleBtn) {
    const isDark = document.documentElement.classList.contains('dark');
    toggleBtn.textContent = isDark ? '☀️' : '🌙';
  }
}

// 4. Live Stay Duration Timer Setup
document.addEventListener('DOMContentLoaded', () => {
  let seconds = 0;
  const timerBadgeText = document.getElementById('timer-badge-text');
  
  if (timerBadgeText) {
    setInterval(() => {
      seconds += 1;
      timerBadgeText.innerHTML = `You have been on this page for: <strong style="font-size: 1.1rem; margin-left: 0.25rem;">${seconds}s</strong>`;
    }, 1000);
  }
});

// 5. Ingestion Live Console state & rendering
function fetchLogs() {
  fetch('/api/logs')
    .then(res => {
      if (res.ok) return res.json();
      throw new Error('Failed to fetch logs');
    })
    .then(logs => {
      renderLogs(logs);
    })
    .catch(e => console.error('Error fetching analytics logs:', e));
}

function renderLogs(logs) {
  const countEl = document.getElementById('console-count');
  if (countEl) {
    countEl.textContent = `${logs.length} pageview events captured`;
  }
  
  const emptyEl = document.getElementById('console-empty');
  const listEl = document.getElementById('log-list');
  
  if (!listEl) return;
  
  if (!logs || logs.length === 0) {
    if (emptyEl) emptyEl.style.display = 'flex';
    listEl.style.display = 'none';
  } else {
    if (emptyEl) emptyEl.style.display = 'none';
    listEl.style.display = 'flex';
    listEl.innerHTML = '';
    
    logs.forEach(log => {
      const item = document.createElement('div');
      item.className = 'log-item';
      item.innerHTML = `
        <div class="log-item-header">
          <span class="log-item-tag">[BEACON REPORT] @ ${log.timestamp}</span>
          <span class="log-item-duration">Duration: <strong>${(log.durationMs / 1000).toFixed(1)}s</strong></span>
        </div>
        <div class="log-item-grid">
          <div>
            <span class="log-field">URL:</span>
            <span class="log-field-value">${log.url}</span>
          </div>
          <div>
            <span class="log-field">Title:</span>
            <span class="log-field-value">${log.title}</span>
          </div>
          <div>
            <span class="log-field">Visitor ID:</span>
            <span class="log-field-value log-id">${log.visitorId}</span>
          </div>
          <div>
            <span class="log-field">Session ID:</span>
            <span class="log-field-value log-id">${log.sessionId}</span>
          </div>
        </div>
      `;
      listEl.appendChild(item);
    });
  }
}

// Intercept navigator.sendBeacon to copy analytics beacons to our local server
(function interceptBeacon() {
  const originalSendBeacon = navigator.sendBeacon;
  navigator.sendBeacon = function (url, data) {
    const urlStr = typeof url === 'string' ? url : url.toString();
    if (urlStr.includes('/collect') && data) {
      // Send a copy of the beacon payload to the local server
      originalSendBeacon.apply(this, ['/api/logs', data]);
    }
    return originalSendBeacon.apply(this, [url, data]);
  };
})();

// Console Collapse/Expand Logic and Polling Setup
document.addEventListener('DOMContentLoaded', () => {
  const consoleEl = document.getElementById('live-console');
  const headerEl = document.getElementById('console-header');
  const toggleBtn = document.getElementById('console-toggle-btn');
  
  if (consoleEl && headerEl && toggleBtn) {
    let isOpen = localStorage.getItem('cyanly_console_open') !== 'false';
    
    const updateConsoleUI = () => {
      consoleEl.style.height = isOpen ? '18rem' : '3rem';
      toggleBtn.textContent = isOpen ? 'Collapse ▾' : 'Expand ▴';
    };
    
    // Initial UI state
    updateConsoleUI();
    
    // Initial fetch and poll every 2 seconds
    fetchLogs();
    setInterval(fetchLogs, 2000);
    
    headerEl.addEventListener('click', (e) => {
      isOpen = !isOpen;
      localStorage.setItem('cyanly_console_open', isOpen);
      updateConsoleUI();
    });
  }
});
