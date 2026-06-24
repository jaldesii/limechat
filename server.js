import express from "express";
import http from "http";
import cors from "cors";
import { Server } from "socket.io";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
const server = http.createServer(app);
const io = new Server(server, { 
    cors: { origin: "*" },
    pingTimeout: 60000,
    pingInterval: 25000,
});

// ============================================
// ✅ HEALTH CHECK ENDPOINT (For Render)
// ============================================
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'ok', 
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    message: 'CallChat Server is running'
  });
});

// ============================================
// ✅ ROOT ENDPOINT
// ============================================
app.get('/api', (req, res) => {
  res.status(200).json({ 
    name: 'CallChat API',
    version: '1.0.0',
    status: 'online'
  });
});

let waitingUsers = [];
const activeRooms = new Map();
const matchedUsers = new Set();
let allUsers = [];
let totalMatches = 0;
const uniqueVisitors = new Set();
let currentAnnouncement = null;
let expireTimeout = null;

// ✅ Group Chat
let groups = [];

// ✅ Voice Call Rooms
const callRooms = new Map();

// ✅ VOICE CALL QUEUE (Auto-match)
let callQueue = [];

// ✅ Anti-Spam: Rate limiting
const messageTimestamps = {};
const userMessageHistory = {};
const suspiciousUsers = new Set();

// ✅ Ban System
const bannedUsers = new Set();
const bannedIPs = new Set();

// ✅ Helper: Generate room code
function generateRoomCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

setInterval(() => {
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
    
    // ✅ Clean up stale call rooms & queue
    callRooms.forEach((room, roomId) => {
        if (now - room.createdAt > 30 * 60 * 1000) {
            callRooms.delete(roomId);
            console.log(`🗑️ Stale call room deleted: ${roomId}`);
        }
    });
    
    // Clean stale call queue (older than 5 minutes)
    callQueue = callQueue.filter(u => now - u.joinedAt < 5 * 60 * 1000);
    
    broadcastAdminUpdate();
}, 10000);

app.get("/status", (req, res) => res.json({
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
    suspiciousUsers: suspiciousUsers.size,
    bannedCount: bannedUsers.size
}));

function leaveGroup(socketId) {
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
}

function getGroupMemberList(group) {
    return group.users.map(u => ({ socketId: u.socketId, name: u.name, online: true, location: '' }));
}

function isSpamming(socketId, message) {
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
}

// ✅ Auto-match call queue function
function tryMatchCallQueue() {
    if (callQueue.length >= 2) {
        const user1 = callQueue.shift();
        const user2 = callQueue.shift();
        
        const roomId = 'call-' + Date.now();
        const s1 = io.sockets.sockets.get(user1.socketId);
        const s2 = io.sockets.sockets.get(user2.socketId);
        
        if (s1 && s2) {
            s1.join(roomId);
            s2.join(roomId);
            
            callRooms.set(roomId, {
                creator: user1.socketId,
                participants: [user1.socketId, user2.socketId],
                createdAt: Date.now()
            });
            
            // Tell user1 they're host with partner info
            s1.emit("callMatched", { 
                roomId, 
                isHost: true, 
                partner: { name: user2.name, location: user2.location }
            });
            // Tell user2 they're guest with partner info
            s2.emit("callMatched", { 
                roomId, 
                isHost: false, 
                partner: { name: user1.name, location: user1.location }
            });
            
            console.log(`✅ Call matched! Room: ${roomId} | ${user1.name} ↔ ${user2.name}`);
        }
    }
}

io.on("connection", (socket) => {
    const isAdmin = socket.handshake.query.role === 'admin';
    
    // ============================================
    // ✅ VOICE CALL HANDLERS (For regular users)
    // ============================================
    if (!isAdmin) {
        // ✅ JOIN CALL QUEUE (Auto-match)
        socket.on("joinCallQueue", (user) => {
            callQueue = callQueue.filter(u => u.socketId !== socket.id);
            
            callQueue.push({
                socketId: socket.id,
                name: user.name,
                location: user.location,
                joinedAt: Date.now()
            });
            
            console.log(`📞 Call queue: ${callQueue.length} user(s)`);
            tryMatchCallQueue();
        });
        
        // ✅ LEAVE CALL QUEUE
        socket.on("leaveCallQueue", () => {
            callQueue = callQueue.filter(u => u.socketId !== socket.id);
            console.log(`👋 Left call queue: ${socket.id}`);
        });

        // ✅ SEND PARTNER INFO (For displaying name + location)
        socket.on("sendCallPartnerInfo", (data) => {
            socket.to(data.roomId).emit("callPartnerInfo", {
                name: data.name,
                location: data.location
            });
        });

        // Create call room (manual)
        socket.on("createRoom", (callback) => {
            const roomId = generateRoomCode();
            callRooms.set(roomId, {
                creator: socket.id,
                participants: [socket.id],
                createdAt: Date.now()
            });
            socket.join(roomId);
            callback({ roomId });
            console.log(`📞 Call room created: ${roomId} by ${socket.id}`);
        });

        // Join call room (manual)
        socket.on("joinRoom", (roomId, callback) => {
            const room = callRooms.get(roomId);
            
            if (!room) {
                callback({ error: "Room not found or expired" });
                return;
            }
            
            if (room.participants.length >= 2) {
                callback({ error: "Room is full (max 2 people)" });
                return;
            }
            
            if (room.participants.includes(socket.id)) {
                callback({ error: "You cannot join your own room" });
                return;
            }
            
            room.participants.push(socket.id);
            socket.join(roomId);
            socket.to(roomId).emit("userJoined", { userId: socket.id });
            callback({ success: true, roomId });
            console.log(`👋 User ${socket.id} joined call: ${roomId}`);
        });

        // End call
        socket.on("endCall", (roomId) => {
            socket.to(roomId).emit("callEnded");
            cleanupCallRoom(roomId, socket);
            console.log(`🔴 Call ended: ${roomId}`);
        });

        // WebRTC Signaling
        socket.on("offer", (data) => {
            socket.to(data.roomId).emit("offer", data);
        });

        socket.on("answer", (data) => {
            socket.to(data.roomId).emit("answer", data);
        });

        socket.on("iceCandidate", (data) => {
            socket.to(data.roomId).emit("iceCandidate", data);
        });
    }
    
    // ============================================
    // ADMIN
    // ============================================
    if (isAdmin) {
        console.log("🔑 Admin connected:", socket.id);
        socket.emit('adminUpdate', buildAdminData());
        socket.on('adminGetData', () => socket.emit('adminUpdate', buildAdminData()));
        socket.on('adminClearStale', () => {
            allUsers = allUsers.filter(u => (u.status === 'connected' && u.roomId) || u.status === 'waiting');
            broadcastAdminUpdate();
        });
        socket.on('adminReset', () => {
            allUsers = []; waitingUsers = []; activeRooms.clear(); matchedUsers.clear();
            uniqueVisitors.clear(); totalMatches = 0; currentAnnouncement = null; groups = [];
            callRooms.clear();
            callQueue = [];
            suspiciousUsers.clear();
            if (expireTimeout) clearTimeout(expireTimeout); expireTimeout = null;
            broadcastAdminUpdate();
        });
        socket.on('adminAnnouncement', (data) => {
            if (expireTimeout) { clearTimeout(expireTimeout); expireTimeout = null; }
            const duration = data.duration || 5;
            const expiresAt = duration > 0 ? new Date(Date.now() + duration * 60 * 1000).toISOString() : null;
            currentAnnouncement = { text: data.text, time: new Date().toISOString(), duration, expiresAt };
            socket.broadcast.emit('announcement', currentAnnouncement);
            if (duration > 0) {
                expireTimeout = setTimeout(() => {
                    currentAnnouncement = null; expireTimeout = null;
                    io.emit('clearAnnouncement'); broadcastAdminUpdate();
                }, duration * 60 * 1000);
            }
            broadcastAdminUpdate();
        });
        socket.on('adminClearAnnouncement', () => {
            if (expireTimeout) { clearTimeout(expireTimeout); expireTimeout = null; }
            currentAnnouncement = null;
            socket.broadcast.emit('clearAnnouncement');
            broadcastAdminUpdate();
        });
        
        socket.on('adminBanUser', (data) => {
            const targetId = data.clientId;
            if (targetId) {
                bannedUsers.add(targetId);
                
                const targetUser = allUsers.find(u => u.clientId === targetId);
                const targetSocket = targetUser ? io.sockets.sockets.get(targetUser.socketId) : null;
                
                if (targetSocket) {
                    const ip = targetSocket.handshake.headers['x-forwarded-for'] || 
                               targetSocket.handshake.address || '';
                    if (ip && ip !== 'unknown') {
                        bannedIPs.add(ip);
                        console.log(`🚫 IP banned: ${ip}`);
                    }
                    targetSocket.emit('banned', 'You have been permanently banned from CallChat.');
                    targetSocket.disconnect(true);
                }
                
                waitingUsers = waitingUsers.filter(u => u.clientId !== targetId);
                callQueue = callQueue.filter(u => u.socketId !== targetUser?.socketId);
                if (targetUser) {
                    matchedUsers.delete(targetUser.socketId);
                    leaveGroup(targetUser.socketId);
                    callRooms.forEach((room, roomId) => {
                        if (room.participants.includes(targetUser.socketId)) {
                            callRooms.delete(roomId);
                        }
                    });
                }
                allUsers = allUsers.filter(u => u.clientId !== targetId);
                
                console.log(`🚫 User banned: ${targetId}`);
                broadcastAdminUpdate();
            }
        });
        
        socket.on('adminUnbanUser', (data) => {
            bannedUsers.delete(data.clientId);
            console.log(`✅ User unbanned: ${data.clientId}`);
            broadcastAdminUpdate();
        });
        
        socket.on('adminGetBanned', () => {
            socket.emit('adminBannedList', {
                banned: [...bannedUsers],
                bannedIPs: [...bannedIPs]
            });
        });
        
        socket.on('disconnect', () => console.log("🔑 Admin disconnected:", socket.id));
        return;
    }
    
    // ============================================
    // NORMAL USER
    // ============================================
    const clientId = socket.handshake.query.clientId || socket.id;
    const clientIP = socket.handshake.address || socket.handshake.headers['x-forwarded-for'] || 'unknown';
    const storedBanned = socket.handshake.query.banned === 'true';
    
    if (bannedUsers.has(clientId) || bannedIPs.has(clientIP) || storedBanned) {
        console.log(`🚫 Banned user rejected: ${clientId} (IP: ${clientIP})`);
        socket.emit('banned', 'You have been permanently banned from CallChat.');
        socket.disconnect(true);
        return;
    }
    
    waitingUsers = waitingUsers.filter(u => u.socketId !== socket.id);
    const existing = allUsers.find(u => u.clientId === clientId);
    
    if (existing) {
        existing.socketId = socket.id; existing.status = 'connected'; existing.lastActive = new Date().toISOString();
    } else {
        uniqueVisitors.add(clientId);
        allUsers.push({ 
            socketId: socket.id, clientId,
            name: 'Anonymous', location: 'Unknown',
            status: 'connected',
            joinedAt: new Date().toISOString(),
            lastActive: new Date().toISOString(),
            roomId: null,
            userAgent: socket.handshake.headers['user-agent'] || ''
        });
    }
    broadcastAdminUpdate();

    socket.on("joinQueue", (user) => {
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
            updateUser(u1.socketId, { status: 'connected', roomId }); updateUser(u2.socketId, { status: 'connected', roomId });
            
            const s1 = io.sockets.sockets.get(u1.socketId), s2 = io.sockets.sockets.get(u2.socketId);
            if (s1 && s2) {
                s1.join(roomId); s2.join(roomId); totalMatches++;
                io.to(u1.socketId).emit("matched", { roomId, partner: { name: u2.name, location: u2.location } });
                io.to(u2.socketId).emit("matched", { roomId, partner: { name: u1.name, location: u1.location } });
                if (currentAnnouncement) { io.to(u1.socketId).emit('announcement', currentAnnouncement); io.to(u2.socketId).emit('announcement', currentAnnouncement); }
                broadcastToAdmins('adminMatch', { roomId, user1: u1.name, user2: u2.name, startedAt: new Date().toISOString() });
                broadcastAdminUpdate();
            }
        }
    });

    socket.on("leaveQueue", () => { waitingUsers = waitingUsers.filter(u => u.socketId !== socket.id); updateUser(socket.id, { status: 'disconnected' }); broadcastAdminUpdate(); });

    socket.on('getGroups', () => {
        socket.emit('groupList', { groups: groups.map(g => ({ id: g.id, name: g.name, users: g.users.length, maxUsers: g.maxUsers })) });
    });

    socket.on('createGroup', (data) => {
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
    });

    socket.on('joinGroup', (data) => {
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
    });

    socket.on('getGroupMembers', (data) => {
        const group = groups.find(g => g.id === data.roomId);
        if (group) {
            const memberList = getGroupMemberList(group);
            socket.emit('groupUserList', { roomId: data.roomId, members: memberList });
        }
    });

    socket.on("editGroupName", (data) => {
        const group = groups.find(g => g.id === data.roomId);
        if (group) {
            group.name = data.name;
            io.to(data.roomId).emit("groupNameUpdated", { roomId: data.roomId, name: data.name });
            io.emit('groupList', { groups: groups.map(g => ({ id: g.id, name: g.name, users: g.users.length, maxUsers: g.maxUsers })) });
            broadcastAdminUpdate();
        }
    });

    socket.on("joinRoom", (roomId) => { 
        socket.join(roomId); 
        updateUser(socket.id, { roomId, lastActive: new Date().toISOString() }); 
        socket.to(roomId).emit("partnerJoined"); 
        if (currentAnnouncement) socket.emit('announcement', currentAnnouncement); 
    });
    
    socket.on("sendMessage", (data) => {
        if (data.message) data.message = data.message.trim();
        
        if (data.message && data.message.length > 1000) {
            data.message = data.message.slice(0, 1000) + '...';
        }
        
        const spamReason = isSpamming(socket.id, data.message);
        if (spamReason) {
            socket.emit('spamWarning', spamReason);
            return;
        }
        
        io.to(data.roomId).emit("receiveMessage", data);
        updateUser(socket.id, { lastActive: new Date().toISOString() });
    });
    
    socket.on("typing", (roomId) => { socket.to(roomId).emit("partnerTyping"); });
    socket.on("messageReaction", (data) => { socket.to(data.roomId).emit("messageReaction", data); });
    socket.on("editMessage", (data) => { socket.to(data.roomId).emit("messageEdited", data); });
    socket.on("deleteMessage", (data) => { socket.to(data.roomId).emit("messageDeleted", data); });

    socket.on("leaveRoom", (data) => {
        const isGroupRoom = groups.find(g => g.id === data.roomId);
        if (isGroupRoom) {
            leaveGroup(socket.id);
            socket.leave(data.roomId);
            updateUser(socket.id, { status: 'disconnected', roomId: null });
        } else {
            socket.to(data.roomId).emit("partnerLeft", { partnerName: data.partnerName });
            socket.leave(data.roomId); matchedUsers.delete(socket.id);
            updateUser(socket.id, { status: 'disconnected', roomId: null });
            const room = activeRooms.get(data.roomId);
            if (room) { room.users = room.users.filter(u => u.socketId !== socket.id); if (room.users.length === 0) { activeRooms.delete(data.roomId); broadcastToAdmins('adminChatEnded', { roomId: data.roomId }); } }
        }
        broadcastAdminUpdate();
    });

    socket.on("disconnect", () => {
        waitingUsers = waitingUsers.filter(u => u.socketId !== socket.id); 
        matchedUsers.delete(socket.id);
        callQueue = callQueue.filter(u => u.socketId !== socket.id);
        updateUser(socket.id, { status: 'disconnected', lastActive: new Date().toISOString() });
        leaveGroup(socket.id);
        
        callRooms.forEach((room, roomId) => {
            if (room.participants.includes(socket.id)) {
                socket.to(roomId).emit("userLeft");
                callRooms.delete(roomId);
                console.log(`🗑️ Call room cleaned: ${roomId}`);
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
    });
});

function cleanupCallRoom(roomId, socket) {
    const room = callRooms.get(roomId);
    if (room) {
        callRooms.delete(roomId);
        socket.leave(roomId);
    }
}

function getAdminSockets() { const a = []; io.sockets.sockets.forEach(s => { if (s.handshake.query.role === 'admin') a.push(s.id); }); return a; }
function broadcastToAdmins(e, d) { getAdminSockets().forEach(id => io.to(id).emit(e, d)); }
function updateUser(sid, upd) { const i = allUsers.findIndex(u => u.socketId === sid); if (i !== -1) allUsers[i] = { ...allUsers[i], ...upd }; }
function getActiveChatsList() { const c = []; activeRooms.forEach((r, rid) => { if (r.users.length >= 2) c.push({ roomId: rid, user1: r.users[0]?.name || '?', user2: r.users[1]?.name || '?', startedAt: new Date(r.createdAt).toISOString() }); }); return c; }
function buildAdminData() { return { users: allUsers.filter(u => (u.status === 'connected' && u.roomId) || u.status === 'waiting' || (Date.now() - new Date(u.lastActive).getTime()) < 60000), activeChats: getActiveChatsList(), totalVisitors: uniqueVisitors.size, totalMatches, activeNow: allUsers.filter(u => u.status === 'connected' && u.roomId).length, waitingNow: allUsers.filter(u => u.status === 'waiting').length, announcement: currentAnnouncement, groups: groups.map(g => ({ id: g.id, name: g.name, users: g.users.length })), callRooms: callRooms.size, callQueue: callQueue.length, suspiciousUsers: suspiciousUsers.size, bannedCount: bannedUsers.size }; }
function broadcastAdminUpdate() { broadcastToAdmins('adminUpdate', buildAdminData()); }

// ============================================
// ✅ PRODUCTION
// ============================================
if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('/*', (req, res) => {
        if (req.path.startsWith('/api') || req.path === '/health' || req.path === '/status') {
            return res.status(404).json({ error: 'Not found' });
        }
        res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
}

// ============================================
// ✅ ERROR HANDLERS
// ============================================
process.on('uncaughtException', (err) => {
    console.error('❌ Uncaught Exception:', err.message);
});

process.on('unhandledRejection', (reason) => {
    console.error('❌ Unhandled Rejection:', reason);
});

// ============================================
// ✅ START SERVER
// ============================================
const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 CallChat Server running on port ${PORT}`);
    console.log(`👥 Group chat enabled`);
    console.log(`📞 Voice call enabled (Auto-match queue)`);
    console.log(`✏️ Message edit/delete enabled`);
    console.log(`📝 Group name edit enabled`);
    console.log(`🛡️ Anti-spam protection enabled`);
    console.log(`🚫 Hard ban system enabled`);
    console.log(`🏥 Health check: http://0.0.0.0:${PORT}/health`);
});