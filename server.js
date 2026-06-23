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

// ✅ Group Chat
let groups = [];

setInterval(() => {
    const now = Date.now();
    allUsers = allUsers.filter(user => {
        if (user.status === 'connected' && user.roomId) return true;
        if (user.status === 'waiting') return (now - new Date(user.lastActive).getTime()) < 3 * 60 * 1000;
        if (user.status === 'connected' && !user.roomId) return (now - new Date(user.joinedAt).getTime()) < 15 * 1000;
        if (user.status === 'disconnected') return (now - new Date(user.lastActive).getTime()) < 30 * 1000;
        return false;
    });
    groups = groups.filter(g => g.users.length > 0);
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
    groups: groups.map(g => ({ id: g.id, name: g.name, users: g.users.length }))
}));

// ✅ Helper: Remove user from group
function leaveGroup(socketId) {
    groups.forEach(group => {
        const index = group.users.findIndex(u => u.socketId === socketId);
        if (index !== -1) {
            const user = group.users[index];
            group.users.splice(index, 1);
            
            // ✅ UPDATE MEMBER LIST
            const memberList = group.users.map(u => ({ socketId: u.socketId, name: u.name, online: true, location: '' }));
            io.to(group.id).emit('groupUserList', { roomId: group.id, members: memberList });
            io.to(group.id).emit('groupUserLeft', { roomId: group.id, socketId });
            
            io.to(group.id).emit('receiveMessage', { type: 'system', message: `${user.name} left the group`, senderName: 'System', timestamp: new Date().toISOString() });
            if (group.users.length === 0) {
                groups = groups.filter(g => g.id !== group.id);
            }
        }
    });
    io.emit('groupList', { groups: groups.map(g => ({ id: g.id, name: g.name, users: g.users.length, maxUsers: g.maxUsers })) });
}

// ✅ Helper: Get member list for a group
function getGroupMemberList(group) {
    return group.users.map(u => ({ socketId: u.socketId, name: u.name, online: true, location: '' }));
}

io.on("connection", (socket) => {
    const isAdmin = socket.handshake.query.role === 'admin';
    
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
        socket.on('disconnect', () => console.log("🔑 Admin disconnected:", socket.id));
        return;
    }
    
    // ============================================
    // NORMAL USER
    // ============================================
    const clientId = socket.handshake.query.clientId || socket.id;
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
    userAgent: socket.handshake.headers['user-agent'] || '' // ✅ Add this
});
    }
    broadcastAdminUpdate();

    // ============================================
    // 1v1 MATCHING
    // ============================================
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

    // ============================================
    // GROUP CHAT
    // ============================================
    socket.on('getGroups', () => {
        socket.emit('groupList', { groups: groups.map(g => ({ id: g.id, name: g.name, users: g.users.length, maxUsers: g.maxUsers })) });
    });

    // ✅ FIXED: Create group - emit member list immediately
    socket.on('createGroup', (data) => {
        const groupId = 'group-' + Date.now();
        const group = { id: groupId, name: `${data.user.name}'s Group`, users: [{ socketId: socket.id, name: data.user.name }], maxUsers: 10 };
        groups.push(group);
        socket.join(groupId);
        updateUser(socket.id, { status: 'connected', roomId: groupId });
        
        // ✅ SEND MEMBER LIST BEFORE groupJoined
        const memberList = getGroupMemberList(group);
        socket.emit('groupUserList', { roomId: groupId, members: memberList });
        socket.emit('groupJoined', { roomId: groupId, userCount: 1 });
        
        io.emit('groupList', { groups: groups.map(g => ({ id: g.id, name: g.name, users: g.users.length, maxUsers: g.maxUsers })) });
        broadcastAdminUpdate();
    });

    // ✅ FIXED: Join group - emit member list BEFORE groupJoined
    socket.on('joinGroup', (data) => {
        const group = groups.find(g => g.id === data.groupId);
        if (group && group.users.length < group.maxUsers) {
            if (group.users.find(u => u.socketId === socket.id)) return;
            group.users.push({ socketId: socket.id, name: data.user.name });
            socket.join(data.groupId);
            updateUser(socket.id, { status: 'connected', roomId: data.groupId });
            
            // ✅ SEND MEMBER LIST BEFORE groupJoined (prevents race condition)
            const memberList = getGroupMemberList(group);
            socket.emit('groupUserList', { roomId: data.groupId, members: memberList });
            socket.emit('groupJoined', { roomId: data.groupId, userCount: group.users.length });
            
            // Broadcast to other members
            socket.to(data.groupId).emit('groupUserJoined', { roomId: data.groupId, user: { socketId: socket.id, name: data.user.name, online: true, location: '' } });
            socket.to(data.groupId).emit('groupUserList', { roomId: data.groupId, members: memberList });
            socket.to(data.groupId).emit('receiveMessage', { type: 'system', message: `${data.user.name} joined the group`, senderName: 'System', timestamp: new Date().toISOString() });
            
            io.emit('groupList', { groups: groups.map(g => ({ id: g.id, name: g.name, users: g.users.length, maxUsers: g.maxUsers })) });
            broadcastAdminUpdate();
        }
    });

    // ✅ NEW: Get group members on demand
    socket.on('getGroupMembers', (data) => {
        const group = groups.find(g => g.id === data.roomId);
        if (group) {
            const memberList = getGroupMemberList(group);
            socket.emit('groupUserList', { roomId: data.roomId, members: memberList });
        }
    });

    // ============================================
    // SHARED EVENTS
    // ============================================
    socket.on("joinRoom", (roomId) => { 
        socket.join(roomId); 
        updateUser(socket.id, { roomId, lastActive: new Date().toISOString() }); 
        socket.to(roomId).emit("partnerJoined"); 
        if (currentAnnouncement) socket.emit('announcement', currentAnnouncement); 
    });
    socket.on("sendMessage", (data) => { socket.to(data.roomId).emit("receiveMessage", data); updateUser(socket.id, { lastActive: new Date().toISOString() }); });
    socket.on("typing", (roomId) => { socket.to(roomId).emit("partnerTyping"); });
    socket.on("messageReaction", (data) => { socket.to(data.roomId).emit("messageReaction", data); });

    // ✅ FIXED: leaveRoom - group chat doesn't end
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

    // ✅ FIXED: disconnect - group chat doesn't end
    socket.on("disconnect", () => {
        waitingUsers = waitingUsers.filter(u => u.socketId !== socket.id); matchedUsers.delete(socket.id);
        updateUser(socket.id, { status: 'disconnected', lastActive: new Date().toISOString() });
        leaveGroup(socket.id);
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

// ============================================
// HELPERS
// ============================================
function getAdminSockets() { const a = []; io.sockets.sockets.forEach(s => { if (s.handshake.query.role === 'admin') a.push(s.id); }); return a; }
function broadcastToAdmins(e, d) { getAdminSockets().forEach(id => io.to(id).emit(e, d)); }
function updateUser(sid, upd) { const i = allUsers.findIndex(u => u.socketId === sid); if (i !== -1) allUsers[i] = { ...allUsers[i], ...upd }; }
function getActiveChatsList() { const c = []; activeRooms.forEach((r, rid) => { if (r.users.length >= 2) c.push({ roomId: rid, user1: r.users[0]?.name || '?', user2: r.users[1]?.name || '?', startedAt: new Date(r.createdAt).toISOString() }); }); return c; }
function buildAdminData() { return { users: allUsers.filter(u => (u.status === 'connected' && u.roomId) || u.status === 'waiting' || (Date.now() - new Date(u.lastActive).getTime()) < 60000), activeChats: getActiveChatsList(), totalVisitors: uniqueVisitors.size, totalMatches, activeNow: allUsers.filter(u => u.status === 'connected' && u.roomId).length, waitingNow: allUsers.filter(u => u.status === 'waiting').length, announcement: currentAnnouncement, groups: groups.map(g => ({ id: g.id, name: g.name, users: g.users.length })) }; }
function broadcastAdminUpdate() { broadcastToAdmins('adminUpdate', buildAdminData()); }

// ============================================
// PRODUCTION
// ============================================
if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('/*', (req, res) => { res.sendFile(path.join(__dirname, 'dist', 'index.html')); });
}

const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`👥 Group chat enabled`);
});