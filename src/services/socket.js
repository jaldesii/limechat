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

// ✅ Dynamic server URL - works in both dev and production
const SERVER_URL = import.meta.env.PROD 
  ? window.location.origin  // Production: same domain as frontend
  : 'http://192.168.254.139:3001'; // Development: your local IP

const socket = io(SERVER_URL, {
  query: { clientId: getClientId() }
});

export default socket;