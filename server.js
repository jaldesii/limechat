import express from "express";
import http from "http";
import cors from "cors";
import { Server } from "socket.io";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());

// ✅ Verify dist folder exists
const distPath = path.join(__dirname, 'dist');
const indexPath = path.join(distPath, 'index.html');

console.log('📁 __dirname:', __dirname);
console.log('📁 dist path:', distPath);
console.log('📁 index.html path:', indexPath);

if (!fs.existsSync(distPath)) {
    console.warn('⚠️ WARNING: dist folder does not exist!');
    console.warn('⚠️ Run: npm run build');
} else if (!fs.existsSync(indexPath)) {
    console.warn('⚠️ WARNING: index.html not found in dist!');
    try {
        console.warn('⚠️ Files in dist:', fs.readdirSync(distPath));
    } catch (e) {
        console.warn('⚠️ Cannot read dist folder');
    }
} else {
    console.log('✅ Frontend build found at:', indexPath);
}

// ✅ IMPORTANT: Serve static files FIRST
app.use(express.static(path.join(__dirname, 'dist'), {
    index: false,
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.js') || filePath.endsWith('.css')) {
            res.setHeader('Cache-Control', 'public, max-age=31536000');
        }
        // ✅ Handle WASM files
        if (filePath.endsWith('.wasm')) {
            res.setHeader('Content-Type', 'application/wasm');
            res.setHeader('Cache-Control', 'public, max-age=31536000');
        }
    }
}));

const server = http.createServer(app);
const io = new Server(server, { 
    cors: { origin: "*" },
    pingTimeout: 60000,
    pingInterval: 25000,
    connectTimeout: 30000,
    maxHttpBufferSize: 1e6,
});

// ✅ Handle engine connection errors
io.engine.on("connection_error", (err) => {
    console.log('❌ Connection error:', {
        url: err.req?.url,
        code: err.code,
        message: err.message,
        ip: err.req?.headers?.['x-forwarded-for'] || err.req?.socket?.remoteAddress
    });
});

// ============================================
// ✅ API ENDPOINTS
// ============================================
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'ok', 
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    message: 'CallChat Server is running'
  });
});

app.get('/api', (req, res) => {
  res.status(200).json({ 
    name: 'CallChat API',
    version: '1.0.0',
    status: 'online'
  });
});

// ============================================
// DATA STORES
// ============================================
let waitingUsers = [];
const activeRooms = new Map();
const matchedUsers = new Set();
let allUsers = [];
let totalMatches = 0;
const uniqueVisitors = new Set();
let currentAnnouncement = null;
let expireTimeout = null;

let groups = [];
const callRooms = new Map();
let callQueue = [];
const groupCallRooms = new Map();

const messageTimestamps = {};
const userMessageHistory = {};
const suspiciousUsers = new Set();
const bannedUsers = new Set();
const bannedIPs = new Set();

// ============================================
// HELPERS
// ============================================
const safeCallback = (callback) => {
    return (typeof callback === 'function') ? callback : () => {};
};

function generateRoomCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function leaveGroup(socketId) {
    try {
        groups.forEach(group => {
            const index = group.users.findIndex(u => u.socketId === socketId);
            if (index !== -1) {
                const user = group.users[index];
                group.users.splice(index, 1);
                const memberList = group.users.map(u => ({ socketId: u.socketId, name: u.name, online: true, location: '' }));
                io.to(group.id).emit('groupUserList', { roomId: group.id, members: memberList });
                io.to(group.id).emit('groupUserLeft', { roomId: group.id, socketId });
                io.to(group.id).emit('receiveMessage', { type: 'system', message: `${user.name} left the group`, senderName: 'System', timestamp: new Date().toISOString() });
                if (group.users.length === 0) groups = groups.filter(g => g.id !== group.id);
            }
        });
        io.emit('groupList', { groups: groups.map(g => ({ id: g.id, name: g.name, users: g.users.length, maxUsers: g.maxUsers })) });
    } catch (err) {
        console.error('❌ leaveGroup error:', err.message);
    }
}

function getGroupMemberList(group) {
    return group.users.map(u => ({ socketId: u.socketId, name: u.name, online: true, location: '' }));
}

function isSpamming(socketId, message) {
    try {
        const now = Date.now();
        if (!messageTimestamps[socketId]) messageTimestamps[socketId] = [];
        if (!userMessageHistory[socketId]) userMessageHistory[socketId] = { messages: [], lastActive: now };
        userMessageHistory[socketId].lastActive = now;
        messageTimestamps[socketId] = messageTimestamps[socketId].filter(t => now - t < 3000);
        if (messageTimestamps[socketId].length >= 3) {
            console.log(`🚫 Rate limit: ${socketId}`);
            return 'Too fast! Slow down.';
        }
        const history = userMessageHistory[socketId].messages;
        const repeated = history.filter(m => m === message).length;
        if (repeated >= 1) {
            suspiciousUsers.add(socketId);
            console.log(`🚫 Duplicate spam: ${socketId}`);
            return 'Suspicious activity detected.';
        }
        messageTimestamps[socketId].push(now);
        history.push(message);
        if (history.length > 10) history.shift();
        return null;
    } catch (err) {
        console.error('❌ isSpamming error:', err.message);
        return null;
    }
}

function getGroupCallParticipants(groupCallRoomId) {
    try {
        const participants = [];
        const room = io.sockets.adapter.rooms.get(groupCallRoomId);
        const callRoom = groupCallRooms.get(groupCallRoomId);
        
        if (!room || room.size === 0) return [];
        
        room.forEach(socketId => {
            let name = callRoom?.participants?.get(socketId);
            
            if (!name || name === 'Unknown' || name === 'Anonymous') {
                const user = allUsers.find(u => u.socketId === socketId);
                name = user?.name;
            }
            
            if (!name || name === 'Unknown' || name === 'Anonymous') {
                const socket = io.sockets.sockets.get(socketId);
                if (socket) {
                    name = socket.handshake?.query?.name || socket.handshake?.query?.userName;
                }
            }
            
            if (!name || name === 'Unknown' || name === 'Anonymous') {
                for (const group of groups) {
                    const member = group.users.find(u => u.socketId === socketId);
                    if (member) { name = member.name; break; }
                }
            }
            
            if (!name || name === 'Anonymous' || name === 'Unknown') {
                name = 'Participant';
            }
            
            participants.push({ socketId: socketId, name: name, isActive: true });
        });
        
        return participants;
    } catch (err) {
        console.error('❌ getGroupCallParticipants error:', err.message);
        return [];
    }
}

function tryMatchCallQueue() {
    try {
        if (callQueue.length >= 2) {
            const user1 = callQueue.shift();
            const user2 = callQueue.shift();
            const roomId = 'call-' + Date.now();
            const s1 = io.sockets.sockets.get(user1.socketId);
            const s2 = io.sockets.sockets.get(user2.socketId);
            if (s1 && s2) {
                s1.join(roomId);
                s2.join(roomId);
                callRooms.set(roomId, { creator: user1.socketId, participants: [user1.socketId, user2.socketId], createdAt: Date.now() });
                s1.emit("callMatched", { roomId, isHost: true, partner: { name: user2.name, location: user2.location } });
                s2.emit("callMatched", { roomId, isHost: false, partner: { name: user1.name, location: user1.location } });
                console.log(`✅ Call matched! Room: ${roomId} | ${user1.name} ↔ ${user2.name}`);
            }
        }
    } catch (err) {
        console.error('❌ tryMatchCallQueue error:', err.message);
    }
}

function cleanupCallRoom(roomId, socket) { 
    try {
        const room = callRooms.get(roomId); 
        if (room) { callRooms.delete(roomId); socket.leave(roomId); } 
    } catch (err) { console.error('❌ cleanupCallRoom error:', err.message); }
}

function getAdminSockets() { 
    const a = []; 
    io.sockets.sockets.forEach(s => { if (s.handshake.query.role === 'admin') a.push(s.id); }); 
    return a; 
}

function broadcastToAdmins(e, d) { 
    try {
        getAdminSockets().forEach(id => io.to(id).emit(e, d)); 
    } catch (err) { console.error('❌ broadcastToAdmins error:', err.message); }
}

function updateUser(sid, upd) { 
    try {
        const i = allUsers.findIndex(u => u.socketId === sid); 
        if (i !== -1) allUsers[i] = { ...allUsers[i], ...upd }; 
    } catch (err) { console.error('❌ updateUser error:', err.message); }
}

function getActiveChatsList() { 
    const c = []; 
    activeRooms.forEach((r, rid) => { if (r.users.length >= 2) c.push({ roomId: rid, user1: r.users[0]?.name || '?', user2: r.users[1]?.name || '?', startedAt: new Date(r.createdAt).toISOString() }); }); 
    return c; 
}

function buildAdminData() { 
    try {
        return { 
            users: allUsers.filter(u => (u.status === 'connected' && u.roomId) || u.status === 'waiting' || (Date.now() - new Date(u.lastActive).getTime()) < 60000), 
            activeChats: getActiveChatsList(), 
            totalVisitors: uniqueVisitors.size, 
            totalMatches, 
            activeNow: allUsers.filter(u => u.status === 'connected' && u.roomId).length, 
            waitingNow: allUsers.filter(u => u.status === 'waiting').length, 
            announcement: currentAnnouncement, 
            groups: groups.map(g => ({ id: g.id, name: g.name, users: g.users.length })), 
            callRooms: callRooms.size, 
            callQueue: callQueue.length, 
            groupCallRooms: groupCallRooms.size, 
            suspiciousUsers: suspiciousUsers.size, 
            bannedCount: bannedUsers.size 
        }; 
    } catch (err) {
        console.error('❌ buildAdminData error:', err.message);
        return {};
    }
}

function broadcastAdminUpdate() { 
    broadcastToAdmins('adminUpdate', buildAdminData()); 
}

// ============================================
// CLEANUP INTERVAL
// ============================================
setInterval(() => {
    try {
        const now = Date.now();
        
        for (const key in messageTimestamps) {
            messageTimestamps[key] = messageTimestamps[key].filter(t => now - t < 10000);
            if (messageTimestamps[key].length === 0) delete messageTimestamps[key];
        }
        for (const key in userMessageHistory) {
            if (now - userMessageHistory[key].lastActive > 60000) delete userMessageHistory[key];
        }
        
        allUsers = allUsers.filter(user => {
            if (user.status === 'connected' && user.roomId) return true;
            if (user.status === 'waiting') return (now - new Date(user.lastActive).getTime()) < 3 * 60 * 1000;
            if (user.status === 'connected' && !user.roomId) return (now - new Date(user.joinedAt).getTime()) < 15 * 1000;
            if (user.status === 'disconnected') return (now - new Date(user.lastActive).getTime()) < 30 * 1000;
            return false;
        });
        groups = groups.filter(g => g.users.length > 0);
        
        callRooms.forEach((room, roomId) => {
            if (now - room.createdAt > 30 * 60 * 1000) {
                callRooms.delete(roomId);
                console.log(`🗑️ Stale call room deleted: ${roomId}`);
            }
        });
        
        groupCallRooms.forEach((room, roomId) => {
            if (now - room.createdAt > 30 * 60 * 1000) {
                groupCallRooms.delete(roomId);
                console.log(`🗑️ Stale group call room deleted: ${roomId}`);
            }
        });
        
        callQueue = callQueue.filter(u => now - u.joinedAt < 5 * 60 * 1000);
        
        broadcastAdminUpdate();
    } catch (err) {
        console.error('❌ Interval error:', err.message);
    }
}, 10000);

// ============================================
// STATUS ENDPOINT
// ============================================
app.get("/status", (req, res) => {
    try {
        res.json({
            waitingUsers: waitingUsers.length,
            activeRooms: activeRooms.size,
            matchedUsers: matchedUsers.size,
            totalVisitors: uniqueVisitors.size,
            totalMatches,
            allUsersCount: allUsers.length,
            activeNow: allUsers.filter(u => u.status === 'connected' && u.roomId).length,
            waitingNow: allUsers.filter(u => u.status === 'waiting').length,
            announcement: currentAnnouncement,
            groups: groups.map(g => ({ id: g.id, name: g.name, users: g.users.length })),
            callRooms: callRooms.size,
            callQueue: callQueue.length,
            groupCallRooms: groupCallRooms.size,
            suspiciousUsers: suspiciousUsers.size,
            bannedCount: bannedUsers.size,
            uptime: process.uptime(),
            memory: Math.round(process.memoryUsage().heapUsed / 1024 / 1024)
        });
    } catch (err) {
        console.error('❌ Status error:', err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ============================================
// SOCKET.IO CONNECTION HANDLER
// ============================================
io.on("connection", (socket) => {
    console.log(`🔌 New connection: ${socket.id}`);
    
    const isAdmin = socket.handshake.query.role === 'admin';
    
    // ✅ Handle socket errors
    socket.on("error", (err) => {
        console.error(`❌ Socket ${socket.id} error:`, err.message);
    });
    
    // ============================================
    // VOICE CALL HANDLERS (Non-admin)
    // ============================================
    if (!isAdmin) {
        socket.on("joinCallQueue", (user) => {
            try {
                callQueue = callQueue.filter(u => u.socketId !== socket.id);
                callQueue.push({ socketId: socket.id, name: user.name, location: user.location, joinedAt: Date.now() });
                console.log(`📞 Call queue: ${callQueue.length} user(s)`);
                tryMatchCallQueue();
            } catch (err) {
                console.error('❌ joinCallQueue error:', err.message);
            }
        });
        
        socket.on("leaveCallQueue", () => {
            try {
                callQueue = callQueue.filter(u => u.socketId !== socket.id);
                console.log(`👋 Left call queue: ${socket.id}`);
            } catch (err) {
                console.error('❌ leaveCallQueue error:', err.message);
            }
        });

        socket.on("sendCallPartnerInfo", (data) => {
            try {
                socket.to(data.roomId).emit("callPartnerInfo", { name: data.name, location: data.location });
            } catch (err) {
                console.error('❌ sendCallPartnerInfo error:', err.message);
            }
        });

        socket.on("createRoom", (callback) => {
            try {
                const cb = safeCallback(callback);
                const roomId = generateRoomCode();
                callRooms.set(roomId, { creator: socket.id, participants: [socket.id], createdAt: Date.now() });
                socket.join(roomId);
                cb({ roomId });
                console.log(`📞 Call room created: ${roomId} by ${socket.id}`);
            } catch (err) {
                console.error('❌ createRoom error:', err.message);
            }
        });

        socket.on("joinRoom", (roomId, callback) => {
            try {
                const cb = safeCallback(callback);
                const room = callRooms.get(roomId);
                if (!room) { cb({ error: "Room not found or expired" }); return; }
                if (room.participants.length >= 2) { cb({ error: "Room is full (max 2 people)" }); return; }
                if (room.participants.includes(socket.id)) { cb({ error: "You cannot join your own room" }); return; }
                room.participants.push(socket.id);
                socket.join(roomId);
                socket.to(roomId).emit("userJoined", { userId: socket.id });
                cb({ success: true, roomId });
                console.log(`👋 User ${socket.id} joined call: ${roomId}`);
            } catch (err) {
                console.error('❌ joinRoom error:', err.message);
            }
        });

        socket.on("endCall", (roomId) => {
            try {
                socket.to(roomId).emit("callEnded");
                cleanupCallRoom(roomId, socket);
                console.log(`🔴 Call ended: ${roomId}`);
            } catch (err) {
                console.error('❌ endCall error:', err.message);
            }
        });

        // WebRTC Signaling
        socket.on("offer", (data) => { 
            try { socket.to(data.roomId).emit("offer", data); } catch (err) { console.error('❌ offer error:', err.message); }
        });
        socket.on("answer", (data) => { 
            try { socket.to(data.roomId).emit("answer", data); } catch (err) { console.error('❌ answer error:', err.message); }
        });
        socket.on("iceCandidate", (data) => { 
            try { socket.to(data.roomId).emit("iceCandidate", data); } catch (err) { console.error('❌ iceCandidate error:', err.message); }
        });

        // ============================================
        // GROUP CALL HANDLERS
        // ============================================
        socket.on("joinGroupCall", (data, callback) => {
            try {
                const cb = safeCallback(callback);
                const groupCallRoomId = `group-call-${data.roomId}`;
                socket.join(groupCallRoomId);
                
                const caller = allUsers.find(u => u.socketId === socket.id);
                const callerName = data.userName || caller?.name || 'Anonymous';
                
                updateUser(socket.id, { name: callerName });
                
                if (!groupCallRooms.has(groupCallRoomId)) {
                    groupCallRooms.set(groupCallRoomId, { 
                        chatRoomId: data.roomId, 
                        createdAt: Date.now(),
                        participants: new Map()
                    });
                }
                
                groupCallRooms.get(groupCallRoomId).participants.set(socket.id, callerName);
                
                socket.to(data.roomId).emit('groupCallRinging', { 
                    roomId: data.roomId,
                    callerName: callerName,
                });
                
                const participants = getGroupCallParticipants(groupCallRoomId);
                io.to(groupCallRoomId).emit('groupCallParticipants', { participants });
                
                const count = io.sockets.adapter.rooms.get(groupCallRoomId)?.size || 0;
                
                io.to(data.roomId).emit('groupCallStatus', { roomId: data.roomId, count });
                io.to(groupCallRoomId).emit('groupCallStatus', { roomId: data.roomId, count });
                
                console.log(`🎙️ ${callerName} joined group call: ${groupCallRoomId} | Count: ${count}`);
                broadcastAdminUpdate();
                
                cb({ success: true, participants, count });
            } catch (err) {
                console.error('❌ joinGroupCall error:', err.message);
            }
        });

        socket.on("leaveGroupCall", (data, callback) => {
            try {
                const cb = safeCallback(callback);
                const groupCallRoomId = `group-call-${data.roomId}`;
                socket.leave(groupCallRoomId);
                
                const room = groupCallRooms.get(groupCallRoomId);
                if (room) {
                    room.participants.delete(socket.id);
                }
                
                const participants = getGroupCallParticipants(groupCallRoomId);
                const count = io.sockets.adapter.rooms.get(groupCallRoomId)?.size || 0;
                
                io.to(groupCallRoomId).emit('groupCallParticipants', { participants });
                io.to(groupCallRoomId).emit('groupCallStatus', { roomId: data.roomId, count });
                io.to(data.roomId).emit('groupCallStatus', { roomId: data.roomId, count });
                
                if (count === 0) {
                    setTimeout(() => {
                        const finalCount = io.sockets.adapter.rooms.get(groupCallRoomId)?.size || 0;
                        if (finalCount === 0) {
                            groupCallRooms.delete(groupCallRoomId);
                            console.log(`🗑️ Group call room cleaned: ${groupCallRoomId}`);
                        }
                    }, 2000);
                }
                
                console.log(`👋 ${socket.id} left group call: ${groupCallRoomId} | Count: ${count}`);
                broadcastAdminUpdate();
                
                cb({ success: true, count });
            } catch (err) {
                console.error('❌ leaveGroupCall error:', err.message);
            }
        });

        socket.on("endGroupCall", (data, callback) => {
            try {
                const cb = safeCallback(callback);
                const groupCallRoomId = `group-call-${data.roomId}`;
                
                io.to(groupCallRoomId).emit('groupCallEnded');
                io.to(data.roomId).emit('groupCallStatus', { roomId: data.roomId, count: 0 });
                
                groupCallRooms.delete(groupCallRoomId);
                
                console.log(`🔴 Group call ended: ${groupCallRoomId}`);
                broadcastAdminUpdate();
                
                cb({ success: true });
            } catch (err) {
                console.error('❌ endGroupCall error:', err.message);
            }
        });

        socket.on("getGroupCallStatus", (data, callback) => {
            try {
                const cb = safeCallback(callback);
                const groupCallRoomId = `group-call-${data.roomId}`;
                const room = io.sockets.adapter.rooms.get(groupCallRoomId);
                const count = room ? room.size : 0;
                
                const statusData = { roomId: data.roomId, count: count, timestamp: Date.now() };
                socket.emit('groupCallStatus', statusData);
                cb(statusData);
            } catch (err) {
                console.error('❌ getGroupCallStatus error:', err.message);
            }
        });
    }
    
    // ============================================
    // ADMIN HANDLERS
    // ============================================
    if (isAdmin) {
        console.log("🔑 Admin connected:", socket.id);
        socket.emit('adminUpdate', buildAdminData());
        
        socket.on('adminGetData', (callback) => {
            try {
                const cb = safeCallback(callback);
                socket.emit('adminUpdate', buildAdminData());
                cb({ success: true });
            } catch (err) { console.error('❌ adminGetData error:', err.message); }
        });
        
        socket.on('adminClearStale', () => { 
            try {
                allUsers = allUsers.filter(u => (u.status === 'connected' && u.roomId) || u.status === 'waiting'); 
                broadcastAdminUpdate(); 
            } catch (err) { console.error('❌ adminClearStale error:', err.message); }
        });
        
        socket.on('adminReset', () => {
            try {
                allUsers = []; waitingUsers = []; activeRooms.clear(); matchedUsers.clear();
                uniqueVisitors.clear(); totalMatches = 0; currentAnnouncement = null; groups = [];
                callRooms.clear(); callQueue = []; groupCallRooms.clear(); suspiciousUsers.clear();
                if (expireTimeout) clearTimeout(expireTimeout); expireTimeout = null;
                broadcastAdminUpdate();
            } catch (err) { console.error('❌ adminReset error:', err.message); }
        });
        
        socket.on('adminAnnouncement', (data) => {
            try {
                if (expireTimeout) { clearTimeout(expireTimeout); expireTimeout = null; }
                const duration = data.duration || 5;
                const expiresAt = duration > 0 ? new Date(Date.now() + duration * 60 * 1000).toISOString() : null;
                currentAnnouncement = { text: data.text, time: new Date().toISOString(), duration, expiresAt };
                // ✅ FIXED: Use io.emit to broadcast to ALL clients including chat rooms
                io.emit('announcement', currentAnnouncement);
                if (duration > 0) {
                    expireTimeout = setTimeout(() => { 
                        currentAnnouncement = null; 
                        expireTimeout = null; 
                        io.emit('clearAnnouncement'); 
                        broadcastAdminUpdate(); 
                    }, duration * 60 * 1000);
                }
                broadcastAdminUpdate();
            } catch (err) { console.error('❌ adminAnnouncement error:', err.message); }
        });
        
        socket.on('adminClearAnnouncement', () => { 
            try {
                if (expireTimeout) { clearTimeout(expireTimeout); expireTimeout = null; } 
                currentAnnouncement = null; 
                // ✅ FIXED: Use io.emit
                io.emit('clearAnnouncement'); 
                broadcastAdminUpdate(); 
            } catch (err) { console.error('❌ adminClearAnnouncement error:', err.message); }
        });
        
        socket.on('adminBanUser', (data) => {
            try {
                const targetId = data.clientId;
                if (targetId) {
                    bannedUsers.add(targetId);
                    const targetUser = allUsers.find(u => u.clientId === targetId);
                    const targetSocket = targetUser ? io.sockets.sockets.get(targetUser.socketId) : null;
                    if (targetSocket) {
                        const ip = targetSocket.handshake.headers['x-forwarded-for'] || targetSocket.handshake.address || '';
                        if (ip && ip !== 'unknown') { bannedIPs.add(ip); console.log(`🚫 IP banned: ${ip}`); }
                        targetSocket.emit('banned', 'You have been permanently banned from CallChat.');
                        targetSocket.disconnect(true);
                    }
                    waitingUsers = waitingUsers.filter(u => u.clientId !== targetId);
                    callQueue = callQueue.filter(u => u.socketId !== targetUser?.socketId);
                    if (targetUser) {
                        matchedUsers.delete(targetUser.socketId);
                        leaveGroup(targetUser.socketId);
                        callRooms.forEach((room, roomId) => { if (room.participants.includes(targetUser.socketId)) callRooms.delete(roomId); });
                    }
                    allUsers = allUsers.filter(u => u.clientId !== targetId);
                    broadcastAdminUpdate();
                }
            } catch (err) { console.error('❌ adminBanUser error:', err.message); }
        });
        
        socket.on('adminUnbanUser', (data) => { 
            try { bannedUsers.delete(data.clientId); broadcastAdminUpdate(); } catch (err) { console.error('❌ adminUnbanUser error:', err.message); }
        });
        
        socket.on('adminGetBanned', (callback) => { 
            try {
                const cb = safeCallback(callback);
                socket.emit('adminBannedList', { banned: [...bannedUsers], bannedIPs: [...bannedIPs] });
                cb({ success: true });
            } catch (err) { console.error('❌ adminGetBanned error:', err.message); }
        });
        
        socket.on('disconnect', () => console.log("🔑 Admin disconnected:", socket.id));
        return;
    }
    
    // ============================================
    // NORMAL USER HANDLERS
    // ============================================
    try {
        const clientId = socket.handshake.query.clientId || socket.id;
        const clientIP = socket.handshake.address || socket.handshake.headers['x-forwarded-for'] || 'unknown';
        const storedBanned = socket.handshake.query.banned === 'true';
        
        if (bannedUsers.has(clientId) || bannedIPs.has(clientIP) || storedBanned) {
            console.log(`🚫 Banned user rejected: ${clientId}`);
            socket.emit('banned', 'You have been permanently banned from CallChat.');
            socket.disconnect(true);
            return;
        }
        
        waitingUsers = waitingUsers.filter(u => u.socketId !== socket.id);
        const existing = allUsers.find(u => u.clientId === clientId);
        if (existing) { 
            existing.socketId = socket.id; 
            existing.status = 'connected'; 
            existing.lastActive = new Date().toISOString(); 
        } else {
            uniqueVisitors.add(clientId);
            allUsers.push({ 
                socketId: socket.id, clientId, name: 'Anonymous', location: 'Unknown', 
                status: 'connected', joinedAt: new Date().toISOString(), 
                lastActive: new Date().toISOString(), roomId: null, 
                userAgent: socket.handshake.headers['user-agent'] || '' 
            });
        }
        broadcastAdminUpdate();

        // Chat queue
        socket.on("joinQueue", (user) => {
            try {
                updateUser(socket.id, { name: user.name, location: user.location, status: 'waiting', lastActive: new Date().toISOString() });
                if (matchedUsers.has(socket.id)) return;
                let inRoom = false;
                activeRooms.forEach(r => { if (r.users.find(u => u.socketId === socket.id)) inRoom = true; });
                if (inRoom) return;
                waitingUsers = waitingUsers.filter(u => u.socketId !== socket.id);
                waitingUsers.push({ socketId: socket.id, name: user.name, location: user.location });
                broadcastAdminUpdate();
                
                if (waitingUsers.length >= 2) {
                    const u1 = waitingUsers.shift(), u2 = waitingUsers.shift();
                    if (u1.socketId === u2.socketId) { waitingUsers.unshift(u2); return; }
                    let conflict = false;
                    activeRooms.forEach(r => { if (r.users.find(u => u.socketId === u1.socketId || u.socketId === u2.socketId)) conflict = true; });
                    if (conflict) { waitingUsers.unshift(u2); waitingUsers.unshift(u1); return; }
                    
                    const roomId = Date.now().toString();
                    matchedUsers.add(u1.socketId); matchedUsers.add(u2.socketId);
                    activeRooms.set(roomId, { users: [{ socketId: u1.socketId, name: u1.name }, { socketId: u2.socketId, name: u2.name }], createdAt: Date.now() });
                    updateUser(u1.socketId, { status: 'connected', roomId }); 
                    updateUser(u2.socketId, { status: 'connected', roomId });
                    
                    const s1 = io.sockets.sockets.get(u1.socketId), s2 = io.sockets.sockets.get(u2.socketId);
                    if (s1 && s2) {
                        s1.join(roomId); s2.join(roomId); totalMatches++;
                        io.to(u1.socketId).emit("matched", { roomId, partner: { name: u2.name, location: u2.location } });
                        io.to(u2.socketId).emit("matched", { roomId, partner: { name: u1.name, location: u1.location } });
                        if (currentAnnouncement) { 
                            io.to(u1.socketId).emit('announcement', currentAnnouncement); 
                            io.to(u2.socketId).emit('announcement', currentAnnouncement); 
                        }
                        broadcastToAdmins('adminMatch', { roomId, user1: u1.name, user2: u2.name, startedAt: new Date().toISOString() });
                        broadcastAdminUpdate();
                    }
                }
            } catch (err) { console.error('❌ joinQueue error:', err.message); }
        });

        socket.on("leaveQueue", () => { 
            try { waitingUsers = waitingUsers.filter(u => u.socketId !== socket.id); updateUser(socket.id, { status: 'disconnected' }); broadcastAdminUpdate(); } 
            catch (err) { console.error('❌ leaveQueue error:', err.message); } 
        });

        // Groups
        socket.on('getGroups', (callback) => { 
            try {
                const cb = safeCallback(callback);
                socket.emit('groupList', { groups: groups.map(g => ({ id: g.id, name: g.name, users: g.users.length, maxUsers: g.maxUsers })) });
                cb({ success: true });
            } catch (err) { console.error('❌ getGroups error:', err.message); }
        });

        socket.on('createGroup', (data) => {
            try {
                const groupId = 'group-' + Date.now();
                const group = { id: groupId, name: `${data.user.name}'s Group`, users: [{ socketId: socket.id, name: data.user.name }], maxUsers: 10 };
                groups.push(group);
                socket.join(groupId);
                updateUser(socket.id, { status: 'connected', roomId: groupId });
                const memberList = getGroupMemberList(group);
                socket.emit('groupUserList', { roomId: groupId, members: memberList });
                socket.emit('groupJoined', { roomId: groupId, userCount: 1 });
                io.emit('groupList', { groups: groups.map(g => ({ id: g.id, name: g.name, users: g.users.length, maxUsers: g.maxUsers })) });
                broadcastAdminUpdate();
            } catch (err) { console.error('❌ createGroup error:', err.message); }
        });

        socket.on('joinGroup', (data) => {
            try {
                const group = groups.find(g => g.id === data.groupId);
                if (group && group.users.length < group.maxUsers) {
                    if (group.users.find(u => u.socketId === socket.id)) return;
                    group.users.push({ socketId: socket.id, name: data.user.name });
                    socket.join(data.groupId);
                    updateUser(socket.id, { status: 'connected', roomId: data.groupId });
                    const memberList = getGroupMemberList(group);
                    socket.emit('groupUserList', { roomId: data.groupId, members: memberList });
                    socket.emit('groupJoined', { roomId: data.groupId, userCount: group.users.length });
                    socket.to(data.groupId).emit('groupUserJoined', { roomId: data.groupId, user: { socketId: socket.id, name: data.user.name, online: true, location: '' } });
                    socket.to(data.groupId).emit('groupUserList', { roomId: data.groupId, members: memberList });
                    socket.to(data.groupId).emit('receiveMessage', { type: 'system', message: `${data.user.name} joined the group`, senderName: 'System', timestamp: new Date().toISOString() });
                    io.emit('groupList', { groups: groups.map(g => ({ id: g.id, name: g.name, users: g.users.length, maxUsers: g.maxUsers })) });
                    broadcastAdminUpdate();
                }
            } catch (err) { console.error('❌ joinGroup error:', err.message); }
        });

        socket.on('getGroupMembers', (data) => {
            try {
                const group = groups.find(g => g.id === data.roomId);
                if (group) { 
                    const memberList = getGroupMemberList(group); 
                    socket.emit('groupUserList', { roomId: data.roomId, members: memberList }); 
                }
            } catch (err) { console.error('❌ getGroupMembers error:', err.message); }
        });

        socket.on("editGroupName", (data) => {
            try {
                const group = groups.find(g => g.id === data.roomId);
                if (group) { 
                    group.name = data.name; 
                    io.to(data.roomId).emit("groupNameUpdated", { roomId: data.roomId, name: data.name }); 
                    io.emit('groupList', { groups: groups.map(g => ({ id: g.id, name: g.name, users: g.users.length, maxUsers: g.maxUsers })) }); 
                    broadcastAdminUpdate(); 
                }
            } catch (err) { console.error('❌ editGroupName error:', err.message); }
        });

        // Chat room
        socket.on("joinRoom", (roomId) => { 
            try { 
                socket.join(roomId); 
                updateUser(socket.id, { roomId, lastActive: new Date().toISOString() }); 
                socket.to(roomId).emit("partnerJoined"); 
                if (currentAnnouncement) socket.emit('announcement', currentAnnouncement); 
            } catch (err) { console.error('❌ joinRoom error:', err.message); } 
        });

        socket.on("sendMessage", (data) => {
            try {
                if (data.message) data.message = data.message.trim();
                if (data.message && data.message.length > 1000) data.message = data.message.slice(0, 1000) + '...';
                const spamReason = isSpamming(socket.id, data.message);
                if (spamReason) { socket.emit('spamWarning', spamReason); return; }
                io.to(data.roomId).emit("receiveMessage", data);
                updateUser(socket.id, { lastActive: new Date().toISOString() });
            } catch (err) { console.error('❌ sendMessage error:', err.message); }
        });

        socket.on("typing", (roomId) => { try { socket.to(roomId).emit("partnerTyping"); } catch (err) { console.error('❌ typing error:', err.message); } });
        socket.on("messageReaction", (data) => { try { socket.to(data.roomId).emit("messageReaction", data); } catch (err) { console.error('❌ messageReaction error:', err.message); } });
        socket.on("editMessage", (data) => { try { socket.to(data.roomId).emit("messageEdited", data); } catch (err) { console.error('❌ editMessage error:', err.message); } });
        socket.on("deleteMessage", (data) => { try { socket.to(data.roomId).emit("messageDeleted", data); } catch (err) { console.error('❌ deleteMessage error:', err.message); } });

        socket.on("leaveRoom", (data) => {
            try {
                const isGroupRoom = groups.find(g => g.id === data.roomId);
                if (isGroupRoom) { 
                    leaveGroup(socket.id); 
                    socket.leave(data.roomId); 
                    updateUser(socket.id, { status: 'disconnected', roomId: null }); 
                } else { 
                    socket.to(data.roomId).emit("partnerLeft", { partnerName: data.partnerName }); 
                    socket.leave(data.roomId); 
                    matchedUsers.delete(socket.id); 
                    updateUser(socket.id, { status: 'disconnected', roomId: null }); 
                    const room = activeRooms.get(data.roomId); 
                    if (room) { 
                        room.users = room.users.filter(u => u.socketId !== socket.id); 
                        if (room.users.length === 0) { 
                            activeRooms.delete(data.roomId); 
                            broadcastToAdmins('adminChatEnded', { roomId: data.roomId }); 
                        } 
                    } 
                }
                broadcastAdminUpdate();
            } catch (err) { console.error('❌ leaveRoom error:', err.message); }
        });

        // ✅ DISCONNECT
        socket.on("disconnect", () => {
            try {
                waitingUsers = waitingUsers.filter(u => u.socketId !== socket.id); 
                matchedUsers.delete(socket.id);
                callQueue = callQueue.filter(u => u.socketId !== socket.id);
                updateUser(socket.id, { status: 'disconnected', lastActive: new Date().toISOString() });
                leaveGroup(socket.id);
                
                callRooms.forEach((room, roomId) => {
                    if (room.participants.includes(socket.id)) { 
                        socket.to(roomId).emit("userLeft"); 
                        callRooms.delete(roomId); 
                    }
                });
                
                groupCallRooms.forEach((room, groupCallRoomId) => {
                    if (room.participants.has(socket.id)) {
                        room.participants.delete(socket.id);
                        socket.leave(groupCallRoomId);
                        
                        const participants = getGroupCallParticipants(groupCallRoomId);
                        const count = io.sockets.adapter.rooms.get(groupCallRoomId)?.size || 0;
                        
                        io.to(groupCallRoomId).emit('groupCallParticipants', { participants });
                        io.to(groupCallRoomId).emit('groupCallStatus', { roomId: room.chatRoomId, count });
                        io.to(room.chatRoomId).emit('groupCallStatus', { roomId: room.chatRoomId, count });
                        
                        if (count === 0) { 
                            setTimeout(() => {
                                const finalCount = io.sockets.adapter.rooms.get(groupCallRoomId)?.size || 0;
                                if (finalCount === 0) groupCallRooms.delete(groupCallRoomId);
                            }, 2000);
                        }
                    }
                });
                
                activeRooms.forEach((room, roomId) => { 
                    const u = room.users.find(u => u.socketId === socket.id); 
                    if (u) { 
                        const isGroupRoom = groups.find(g => g.id === roomId); 
                        if (!isGroupRoom) { 
                            socket.to(roomId).emit("partnerDisconnected"); 
                            room.users = room.users.filter(u => u.socketId !== socket.id); 
                            if (room.users.length === 0) activeRooms.delete(roomId); 
                        } 
                    } 
                });
                broadcastAdminUpdate();
                console.log(`🔌 Disconnected: ${socket.id}`);
            } catch (err) { console.error('❌ disconnect error:', err.message); }
        });
    } catch (err) {
        console.error('❌ Connection setup error:', err.message);
        socket.disconnect(true);
    }
});

// ============================================
// ✅ SPA CATCH-ALL - MUST BE LAST (FIXED!)
// ============================================
app.get('*', (req, res) => {
    // Skip API, health, status, and socket.io routes
    if (req.path.startsWith('/api') || 
        req.path === '/health' || 
        req.path === '/status' || 
        req.path.startsWith('/socket.io')) {
        return res.status(404).json({ error: 'Not found' });
    }
    
    // Skip static file requests with extensions
    if (req.path.match(/\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot|wasm|map|json|txt|xml)$/)) {
        return res.status(404).send('Not found');
    }
    
    const indexPath = path.join(__dirname, 'dist', 'index.html');
    
    // ✅ Try to serve the built frontend
    res.sendFile(indexPath, (err) => {
        if (err) {
            // If frontend not built, show a helpful message instead of 503
            console.error('❌ Frontend not found:', err.message);
            res.status(200).send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="utf-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1">
                    <title>CallChat Server</title>
                    <style>
                        * { margin: 0; padding: 0; box-sizing: border-box; }
                        body { 
                            font-family: 'Poppins', -apple-system, BlinkMacSystemFont, sans-serif; 
                            background: #0a0a0a; color: #fff; 
                            display: flex; align-items: center; justify-content: center; 
                            min-height: 100vh; text-align: center; padding: 20px;
                        }
                        .card {
                            background: #1a1a1a; border: 1px solid #333;
                            border-radius: 16px; padding: 40px; max-width: 500px;
                        }
                        .status { font-size: 64px; margin-bottom: 16px; }
                        h1 { font-size: 24px; font-weight: 600; margin-bottom: 12px; }
                        p { color: #a1a1aa; font-size: 14px; margin-bottom: 8px; line-height: 1.6; }
                        code { background: #333; padding: 4px 8px; border-radius: 6px; font-size: 13px; }
                        a { color: #84cc16; text-decoration: none; }
                        a:hover { text-decoration: underline; }
                        .links { margin-top: 20px; display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
                        .link-btn { 
                            background: #333; color: #fff; padding: 8px 16px; 
                            border-radius: 8px; font-size: 13px; transition: 0.2s;
                        }
                        .link-btn:hover { background: #84cc16; color: #0a0a0a; text-decoration: none; }
                    </style>
                </head>
                <body>
                    <div class="card">
                        <div class="status">🟢</div>
                        <h1>CallChat Server is Running</h1>
                        <p>Frontend build not found.</p>
                        <p>Run <code>npm run build</code> on your server.</p>
                        <p>Current path: <code>${indexPath}</code></p>
                        <div class="links">
                            <a href="/health" class="link-btn">Health Check</a>
                            <a href="/status" class="link-btn">Status</a>
                            <a href="/api" class="link-btn">API Info</a>
                        </div>
                    </div>
                </body>
                </html>
            `);
        }
    });
});

// ============================================
// ✅ ERROR HANDLERS
// ============================================
process.on('uncaughtException', (err) => { 
    console.error('❌ Uncaught Exception:', err.message); 
    console.error('Stack:', err.stack);
});

process.on('unhandledRejection', (reason, promise) => { 
    console.error('❌ Unhandled Rejection at:', promise); 
    console.error('Reason:', reason);
});

process.on('SIGTERM', () => {
    console.log('👋 SIGTERM received. Cleaning up...');
    io.sockets.sockets.forEach((socket) => {
        socket.disconnect(true);
    });
    server.close(() => {
        console.log('✅ Server closed gracefully');
        process.exit(0);
    });
    setTimeout(() => {
        console.error('⚠️ Forced shutdown after timeout');
        process.exit(1);
    }, 5000);
});

process.on('SIGINT', () => {
    console.log('👋 SIGINT received. Shutting down...');
    server.close(() => {
        console.log('✅ Server closed');
        process.exit(0);
    });
});

// ============================================
// ✅ START SERVER
// ============================================
const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 CallChat Server running on port ${PORT}`);
    console.log(`👥 Group chat | 📞 Voice call | 🎙️ Group call`);
    console.log(`📢 Announcements | 🛡️ Anti-spam | 🚫 Ban system`);
    console.log(`🏥 Health check: http://0.0.0.0:${PORT}/health`);
    console.log(`💾 Memory: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`);
    console.log(`📁 Static files: ${distPath}`);
    console.log(`📁 Index exists: ${fs.existsSync(indexPath)}`);
});