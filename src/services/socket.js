import { io } from 'socket.io-client';

// Persistent client ID per browser (survives refresh)
function generateId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try {
      return crypto.randomUUID();
    } catch (e) {
      // fall through to manual generation
    }
  }
  return 'cid-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

function getClientId() {
  let clientId = localStorage.getItem('clientId');
  if (!clientId) {
    clientId = generateId();
    localStorage.setItem('clientId', clientId);
  }
  return clientId;
}

// ✅ CHECK IF BANNED BEFORE CONNECTING
if (localStorage.getItem('banned') === 'true') {
  document.body.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:'Poppins',sans-serif;text-align:center;background:#18181b;color:#fafafa">
      <div>
        <h1 style="font-size:48px;margin-bottom:16px">🚫</h1>
        <h1 style="margin-bottom:8px">You have been banned</h1>
        <p style="color:#a1a1aa">You are permanently banned from LimeChat.</p>
      </div>
    </div>`;
  throw new Error('Banned');
}

// ✅ Dynamic server URL - works in both dev and production
const SERVER_URL = import.meta.env.PROD 
  ? window.location.origin  // Production: same domain as frontend
  : 'http://192.168.254.139:3001'; // Development: your local IP

const socket = io(SERVER_URL, {
  query: { 
    clientId: getClientId(),
    banned: localStorage.getItem('banned') || 'false'
  }
});

// ✅ Listen for ban event
socket.on('banned', (msg) => {
  localStorage.setItem('banned', 'true');
  alert(msg);
  window.location.reload();
});

export default socket;