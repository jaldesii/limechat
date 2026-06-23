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

let waitingUsers = [];
const activeRooms = new Map();
const matchedUsers = new Set();
let allUsers = [];
let totalMatches = 0;
const uniqueVisitors = new Set();
let currentAnnouncement = null;
let expireTimeout = null;

// ============================================
// AUTO CLEANUP (every 10 seconds)
// ============================================
setInterval(() => {
    const now = Date.now();
    allUsers = allUsers.filter(user => {
        if (user.status === 'connected' && user.roomId) return true;
        if (user.status === 'waiting') return (now - new Date(user.lastActive).getTime()) < 3 * 60 * 1000;
        if (user.status === 'connected' && !user.roomId) return (now - new Date(user.joinedAt).getTime()) < 15 * 1000;
        if (user.status === 'disconnected') return (now - new Date(user.lastActive).getTime()) < 30 * 1000;
        return false;
    });
    broadcastAdminUpdate();
}, 10000);

// ============================================
// ROUTES
// ============================================
app.get("/status", (req, res) => res.json({
    waitingUsers: waitingUsers.length,
    activeRooms: activeRooms.size,
    matchedUsers: matchedUsers.size,
    totalVisitors: uniqueVisitors.size,
    totalMatches,
    allUsersCount: allUsers.length,
    activeNow: allUsers.filter(u => u.status === 'connected' && u.roomId).length,
    waitingNow: allUsers.filter(u => u.status === 'waiting').length,
    announcement: currentAnnouncement
}));

// ============================================
// SOCKET.IO
// ============================================
io.on("connection", (socket) => {
    const isAdmin = socket.handshake.query.role === 'admin';
    
    // ============================================
    // ADMIN CONNECTION
    // ============================================
    if (isAdmin) {
        console.log("🔑 Admin connected:", socket.id);
        
        socket.emit('adminUpdate', buildAdminData());
        socket.on('adminGetData', () => socket.emit('adminUpdate', buildAdminData()));
        
        socket.on('adminClearStale', () => {
            allUsers = allUsers.filter(u => (u.status === 'connected' && u.roomId) || u.status === 'waiting');
            console.log("🧹 Admin cleared stale users");
            broadcastAdminUpdate();
        });
        
        socket.on('adminReset', () => {
            allUsers = [];
            waitingUsers = [];
            activeRooms.clear();
            matchedUsers.clear();
            uniqueVisitors.clear();
            totalMatches = 0;
            currentAnnouncement = null;
            if (expireTimeout) clearTimeout(expireTimeout);
            expireTimeout = null;
            console.log("🔄 Admin reset all data");
            broadcastAdminUpdate();
        });
        
        // Send announcement with auto-expire
        socket.on('adminAnnouncement', (data) => {
            if (expireTimeout) {
                clearTimeout(expireTimeout);
                expireTimeout = null;
            }
            
            const duration = data.duration || 5;
            const expiresAt = duration > 0 
                ? new Date(Date.now() + duration * 60 * 1000).toISOString() 
                : null;
            
            currentAnnouncement = { 
                text: data.text, 
                time: new Date().toISOString(),
                duration: duration,
                expiresAt: expiresAt
            };
            
            console.log(`📢 Announcement: "${data.text}" (${duration > 0 ? duration + 'min' : 'manual'})`);
            
            socket.broadcast.emit('announcement', currentAnnouncement);
            
            if (duration > 0) {
                expireTimeout = setTimeout(() => {
                    console.log(`⏰ Announcement expired: "${data.text}"`);
                    currentAnnouncement = null;
                    expireTimeout = null;
                    io.emit('clearAnnouncement');
                    broadcastAdminUpdate();
                }, duration * 60 * 1000);
            }
            
            broadcastAdminUpdate();
        });
        
        socket.on('adminClearAnnouncement', () => {
            console.log('📢 Announcement manually cleared');
            if (expireTimeout) { clearTimeout(expireTimeout); expireTimeout = null; }
            currentAnnouncement = null;
            socket.broadcast.emit('clearAnnouncement');
            broadcastAdminUpdate();
        });
        
        socket.on('disconnect', () => console.log("🔑 Admin disconnected:", socket.id));
        return;
    }
    
    // ============================================
    // NORMAL USER CONNECTION
    // ============================================
    const clientId = socket.handshake.query.clientId || socket.id;
    console.log(`🔌 User: ${socket.id} (${clientId.slice(0, 8)}...)`);
    
    waitingUsers = waitingUsers.filter(u => u.socketId !== socket.id);
    const existing = allUsers.find(u => u.clientId === clientId);
    
    if (existing) {
        existing.socketId = socket.id;
        existing.status = 'connected';
        existing.lastActive = new Date().toISOString();
    } else {
        uniqueVisitors.add(clientId);
        allUsers.push({
            socketId: socket.id, clientId,
            name: 'Anonymous', location: 'Unknown',
            status: 'connected',
            joinedAt: new Date().toISOString(),
            lastActive: new Date().toISOString(),
            roomId: null
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
                s1.join(roomId); s2.join(roomId);
                totalMatches++;
                
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
    });

    socket.on("leaveQueue", () => { waitingUsers = waitingUsers.filter(u => u.socketId !== socket.id); updateUser(socket.id, { status: 'disconnected' }); broadcastAdminUpdate(); });
    socket.on("joinRoom", (roomId) => {
        socket.join(roomId);
        updateUser(socket.id, { roomId, lastActive: new Date().toISOString() });
        socket.to(roomId).emit("partnerJoined");
        if (currentAnnouncement) socket.emit('announcement', currentAnnouncement);
    });
    socket.on("sendMessage", (data) => { socket.to(data.roomId).emit("receiveMessage", data); updateUser(socket.id, { lastActive: new Date().toISOString() }); });
    socket.on("typing", (roomId) => { socket.to(roomId).emit("partnerTyping"); });
    socket.on("userAway", (roomId) => socket.to(roomId).emit("partnerDisconnected"));
    socket.on("userBack", (roomId) => socket.to(roomId).emit("partnerReconnected"));
    socket.on("leaveRoom", (data) => {
        socket.to(data.roomId).emit("partnerLeft", { partnerName: data.partnerName });
        socket.leave(data.roomId); matchedUsers.delete(socket.id);
        updateUser(socket.id, { status: 'disconnected', roomId: null });
        const room = activeRooms.get(data.roomId);
        if (room) { room.users = room.users.filter(u => u.socketId !== socket.id); if (room.users.length === 0) { activeRooms.delete(data.roomId); broadcastToAdmins('adminChatEnded', { roomId: data.roomId }); } }
        broadcastAdminUpdate();
    });
    socket.on("disconnect", () => {
        waitingUsers = waitingUsers.filter(u => u.socketId !== socket.id); matchedUsers.delete(socket.id);
        updateUser(socket.id, { status: 'disconnected', lastActive: new Date().toISOString() });
        activeRooms.forEach((room, roomId) => { const u = room.users.find(u => u.socketId === socket.id); if (u) { socket.to(roomId).emit("partnerDisconnected"); room.users = room.users.filter(u => u.socketId !== socket.id); if (room.users.length === 0) activeRooms.delete(roomId); } });
        broadcastAdminUpdate();
    });
});

// ============================================
// HELPERS
// ============================================
function getAdminSockets() { const a = []; io.sockets.sockets.forEach(s => { if (s.handshake.query.role === 'admin') a.push(s.id); }); return a; }
function broadcastToAdmins(e, d) { getAdminSockets().forEach(id => io.to(id).emit(e, d)); }
function updateUser(sid, upd) { const i = allUsers.findIndex(u => u.socketId === sid); if (i !== -1) allUsers[i] = { ...allUsers[i], ...upd }; }
function getActiveChatsList() { const c = []; activeRooms.forEach((r, rid) => { if (r.users.length === 2) c.push({ roomId: rid, user1: r.users[0]?.name || '?', user2: r.users[1]?.name || '?', startedAt: new Date(r.createdAt).toISOString() }); }); return c; }
function buildAdminData() { return { users: allUsers.filter(u => (u.status === 'connected' && u.roomId) || u.status === 'waiting' || (Date.now() - new Date(u.lastActive).getTime()) < 60000), activeChats: getActiveChatsList(), totalVisitors: uniqueVisitors.size, totalMatches, activeNow: allUsers.filter(u => u.status === 'connected' && u.roomId).length, waitingNow: allUsers.filter(u => u.status === 'waiting').length, announcement: currentAnnouncement }; }
function broadcastAdminUpdate() { broadcastToAdmins('adminUpdate', buildAdminData()); }

// ============================================
// ✅ SERVE STATIC FILES IN PRODUCTION
// ============================================
if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.join(__dirname, 'dist')));
  app.get('/*', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});
}

// ============================================
// START SERVER
// ============================================
const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📊 Status: http://localhost:${PORT}/status`);
    console.log(`⏰ Auto-expire announcements enabled`);
});