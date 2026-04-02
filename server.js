const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mysql = require('mysql2/promise');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors:{ origin:'*' } });
app.use(express.json());
app.use(express.static(path.join(__dirname,'public')));

const JWT_SECRET = 'msuka-ip-secret-2025';
const UPLOAD_DIR = path.join(__dirname,'public','uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR,{recursive:true});

const storage = multer.diskStorage({
  destination: (req,file,cb) => cb(null,UPLOAD_DIR),
  filename:    (req,file,cb) => cb(null, Date.now()+'-'+Math.round(Math.random()*1e6)+path.extname(file.originalname))
});
const ALLOWED = ['image/jpeg','image/jpg','image/png','image/gif','image/webp','application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
const upload = multer({ storage, limits:{fileSize:5*1024*1024}, fileFilter:(req,file,cb)=>{ if(ALLOWED.includes(file.mimetype)) cb(null,true); else cb(new Error('File type not allowed')); } });

const db = mysql.createPool({ host:'localhost', user:'root', password:'', database:'msukaip', waitForConnections:true, connectionLimit:10 });

async function setupDatabase() {
  try {
    const conn = await db.getConnection();
    console.log('✅  MySQL connected');

    await conn.query(`CREATE TABLE IF NOT EXISTS users (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(100) NOT NULL, email VARCHAR(150) NOT NULL UNIQUE, password_hash VARCHAR(255) NOT NULL, role ENUM('student','faculty','admin') DEFAULT 'student', account_status ENUM('pending','approved','rejected') DEFAULT 'pending', status ENUM('online','offline') DEFAULT 'offline', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
    try { await conn.query(`ALTER TABLE users ADD COLUMN account_status ENUM('pending','approved','rejected') DEFAULT 'pending' AFTER role`); } catch {}

    await conn.query(`CREATE TABLE IF NOT EXISTS groups_table (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(100) NOT NULL, created_by INT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL)`);

    await conn.query(`CREATE TABLE IF NOT EXISTS group_members (id INT AUTO_INCREMENT PRIMARY KEY, group_id INT NOT NULL, user_id INT NOT NULL, FOREIGN KEY (group_id) REFERENCES groups_table(id) ON DELETE CASCADE, FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE)`);

    await conn.query(`CREATE TABLE IF NOT EXISTS messages (id INT AUTO_INCREMENT PRIMARY KEY, sender_id INT, conv_key VARCHAR(200) NOT NULL, type ENUM('chat','announcement','system','file','image','voice') DEFAULT 'chat', text TEXT NOT NULL, file_name VARCHAR(255) NULL, file_url VARCHAR(500) NULL, file_size INT NULL, file_type VARCHAR(100) NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE SET NULL)`);
    try { await conn.query(`ALTER TABLE messages ADD COLUMN conv_key VARCHAR(200) NOT NULL DEFAULT 'group_general' AFTER sender_id`); } catch {}
    try { await conn.query(`ALTER TABLE messages ADD COLUMN file_name VARCHAR(255) NULL AFTER text`); } catch {}
    try { await conn.query(`ALTER TABLE messages ADD COLUMN file_url  VARCHAR(500) NULL AFTER file_name`); } catch {}
    try { await conn.query(`ALTER TABLE messages ADD COLUMN file_size INT NULL AFTER file_url`); } catch {}
    try { await conn.query(`ALTER TABLE messages ADD COLUMN file_type VARCHAR(100) NULL AFTER file_size`); } catch {}
    try { await conn.query(`ALTER TABLE messages MODIFY COLUMN type ENUM('chat','announcement','system','file','image','voice') DEFAULT 'chat'`); } catch {}

    await conn.query(`CREATE TABLE IF NOT EXISTS calls (id INT AUTO_INCREMENT PRIMARY KEY, caller_id INT, receiver_id INT, status ENUM('missed','answered','rejected') DEFAULT 'missed', started_at TIMESTAMP NULL, ended_at TIMESTAMP NULL, duration INT DEFAULT 0, FOREIGN KEY (caller_id) REFERENCES users(id) ON DELETE SET NULL, FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE SET NULL)`);
    await conn.query(`CREATE TABLE IF NOT EXISTS audit_logs (id INT AUTO_INCREMENT PRIMARY KEY, user_id INT, action VARCHAR(100), details TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL)`);

    console.log('✅  Tables ready');

    const accounts = [
      { name:'Admin', email:'admin@cics.msu.edu', password:'admin123', role:'admin', status:'approved' },
      { name:'Student Demo', email:'student@cics.msu.edu', password:'student123', role:'student', status:'approved' },
    ];
    for (const acc of accounts) {
      const hash = await bcrypt.hash(acc.password, 10);
      const [rows] = await conn.query('SELECT id FROM users WHERE email=?',[acc.email]);
      if (rows.length===0) { await conn.query('INSERT INTO users (name,email,password_hash,role,account_status) VALUES (?,?,?,?,?)',[acc.name,acc.email,hash,acc.role,acc.status]); console.log(`✅  Created: ${acc.email} / ${acc.password}`); }
      else { await conn.query('UPDATE users SET password_hash=?,name=?,role=?,account_status=? WHERE email=?',[hash,acc.name,acc.role,acc.status,acc.email]); console.log(`🔄  Reset:   ${acc.email} / ${acc.password}`); }
    }
    conn.release();
    // Reset ALL users to offline on server start (in case of crash/restart)
    await db.query("UPDATE users SET status = 'offline'");
    console.log('✅  All users reset to offline');
    console.log('\n🎉  Login:\n    student@cics.msu.edu / student123\n    admin@cics.msu.edu   / admin123\n');
  } catch (err) { console.error('❌  DB failed:', err.message); process.exit(1); }
}

function verifyToken(req,res,next) {
  const auth=req.headers.authorization;
  if(!auth) return res.status(401).json({error:'No token'});
  try { req.user=jwt.verify(auth.replace('Bearer ',''),JWT_SECRET); next(); }
  catch { res.status(401).json({error:'Invalid token'}); }
}
function adminOnly(req,res,next) { if(req.user?.role!=='admin') return res.status(403).json({error:'Admin only'}); next(); }

app.post('/api/register', async (req,res) => {
  const {name,email,password,role='student'}=req.body;
  if(!name||!email||!password) return res.status(400).json({error:'All fields required'});
  if(password.length<6) return res.status(400).json({error:'Password must be at least 6 characters'});
  if(!['student','faculty'].includes(role)) return res.status(400).json({error:'Invalid role'});
  try {
    const [ex]=await db.query('SELECT id FROM users WHERE email=?',[email.trim()]);
    if(ex.length>0) return res.status(409).json({error:'Email already registered'});
    const hash=await bcrypt.hash(password,10);
    const [r]=await db.query('INSERT INTO users (name,email,password_hash,role,account_status) VALUES (?,?,?,?,?)',[name,email.trim(),hash,role,'pending']);
    await db.query('INSERT INTO audit_logs (user_id,action,details) VALUES (?,?,?)',[r.insertId,'REGISTER',`${name} registered`]);
    res.json({message:'Account created! Wait for admin approval.'});
  } catch(err){ res.status(500).json({error:'Server error'}); }
});

app.post('/api/login', async (req,res) => {
  const {email,password}=req.body;
  if(!email||!password) return res.status(400).json({error:'Email and password required'});
  try {
    const [rows]=await db.query('SELECT * FROM users WHERE email=?',[email.trim()]);
    if(!rows.length) return res.status(401).json({error:'Invalid credentials'});
    const user=rows[0];
    if(!await bcrypt.compare(password,user.password_hash)) return res.status(401).json({error:'Invalid credentials'});
    if(user.account_status==='pending')  return res.status(403).json({error:'Account pending admin approval.'});
    if(user.account_status==='rejected') return res.status(403).json({error:'Account rejected. Contact admin.'});
    const token=jwt.sign({id:user.id,email:user.email,name:user.name,role:user.role},JWT_SECRET,{expiresIn:'8h'});
    await db.query('INSERT INTO audit_logs (user_id,action,details) VALUES (?,?,?)',[user.id,'LOGIN',`${user.name} logged in`]);
    console.log(`✅  Login: ${user.name}`);
    res.json({token,name:user.name,role:user.role});
  } catch(err){ res.status(500).json({error:'Server error'}); }
});

app.post('/api/upload', verifyToken, (req,res) => {
  upload.single('file')(req,res,async(err)=>{
    if(err instanceof multer.MulterError) return res.status(400).json({error: err.code==='LIMIT_FILE_SIZE'?'Max 5MB allowed':err.message});
    if(err) return res.status(400).json({error:err.message});
    if(!req.file) return res.status(400).json({error:'No file'});
    const isImage=req.file.mimetype.startsWith('image/');
    const fileUrl=`/uploads/${req.file.filename}`;
    const msgType=isImage?'image':'file';
    const convKey=req.body.convKey||'group_general';

    try {
      // For private chats, build consistent key
      let realKey = convKey;
      let targetEmail = null;
      if (convKey.startsWith('private_')) {
        targetEmail = convKey.replace('private_','');
        realKey = buildPrivateKey(req.user.email, targetEmail);
      }

      const [result]=await db.query(
        'INSERT INTO messages (sender_id,conv_key,type,text,file_name,file_url,file_size,file_type) VALUES (?,?,?,?,?,?,?,?)',
        [req.user.id,realKey,msgType,req.file.originalname,req.file.originalname,fileUrl,req.file.size,req.file.mimetype]
      );

      const msg={
        id:result.insertId, type:msgType,
        sender:req.user.name, role:req.user.role,
        text:req.file.originalname,
        file_name:req.file.originalname, file_url:fileUrl,
        file_size:req.file.size, file_type:req.file.mimetype,
        timestamp:new Date().toISOString()
      };

      if (targetEmail) {
        // Private chat — send to target and sender only
        const targetSocket = [...onlineUsers.entries()].find(([,u])=>u.email===targetEmail)?.[0];
        if (targetSocket) io.to(targetSocket).emit('message:new',{...msg, convKey:'private_'+req.user.email});
        // Send back to uploader
        const senderSocket = [...onlineUsers.entries()].find(([,u])=>u.email===req.user.email)?.[0];
        if (senderSocket) io.to(senderSocket).emit('message:new',{...msg, convKey});
      } else {
        // Group chat
        io.to(realKey).emit('message:new',{...msg, convKey:realKey});
      }

      console.log(`📎  ${req.user.name} uploaded: ${req.file.originalname}`);
      res.json({message:'Uploaded',...msg, convKey});
    } catch(err){ console.error('Upload error:',err.message); res.status(500).json({error:'Server error'}); }
  });
});

// Voice message upload
const voiceUpload = multer({
  storage,
  limits:{fileSize:10*1024*1024},
  fileFilter:(req,file,cb)=>{ if(file.mimetype.startsWith('audio/')) cb(null,true); else cb(new Error('Audio only')); }
});

app.post('/api/upload/voice', verifyToken, (req,res) => {
  voiceUpload.single('file')(req,res,async(err)=>{
    if(err) return res.status(400).json({error:err.message});
    if(!req.file) return res.status(400).json({error:'No file'});
    const fileUrl=`/uploads/${req.file.filename}`;
    const convKey=req.body.convKey||'group_general';
    try {
      let realKey=convKey, targetEmail=null;
      if(convKey.startsWith('private_')) {
        targetEmail=convKey.replace('private_','');
        realKey=buildPrivateKey(req.user.email,targetEmail);
      }
      const [result]=await db.query(
        'INSERT INTO messages (sender_id,conv_key,type,text,file_name,file_url,file_size,file_type) VALUES (?,?,?,?,?,?,?,?)',
        [req.user.id,realKey,'voice','Voice message',req.file.originalname,fileUrl,req.file.size,req.file.mimetype]
      );
      const msg={id:result.insertId,type:'voice',sender:req.user.name,role:req.user.role,text:'Voice message',file_name:req.file.originalname,file_url:fileUrl,file_size:req.file.size,file_type:req.file.mimetype,timestamp:new Date().toISOString()};
      if(targetEmail) {
        const targetSocket=[...onlineUsers.entries()].find(([,u])=>u.email===targetEmail)?.[0];
        if(targetSocket) io.to(targetSocket).emit('message:new',{...msg,convKey:'private_'+req.user.email});
        const senderSocket=[...onlineUsers.entries()].find(([,u])=>u.email===req.user.email)?.[0];
        if(senderSocket) io.to(senderSocket).emit('message:new',{...msg,convKey});
      } else {
        io.to(realKey).emit('message:new',{...msg,convKey:realKey});
      }
      res.json({message:'Voice uploaded',...msg});
    } catch(err){ res.status(500).json({error:'Server error'}); }
  });
});

// Delete group (creator or admin)
app.delete('/api/groups/:id', verifyToken, async(req,res)=>{
  const {id}=req.params;
  try {
    const [rows]=await db.query('SELECT * FROM groups_table WHERE id=?',[id]);
    if(!rows.length) return res.status(404).json({error:'Group not found'});
    // Only creator or admin can delete
    if(rows[0].created_by!==req.user.id && req.user.role!=='admin')
      return res.status(403).json({error:'Only the group creator or admin can delete this group'});
    await db.query('UPDATE messages SET sender_id=NULL WHERE conv_key=?',['group_'+id]);
    await db.query('DELETE FROM group_members WHERE group_id=?',[id]);
    await db.query('DELETE FROM groups_table WHERE id=?',[id]);
    await db.query('INSERT INTO audit_logs (user_id,action,details) VALUES (?,?,?)',[req.user.id,'DELETE_GROUP',`Deleted group ID ${id}: ${rows[0].name}`]);
    // Notify all connected users
    io.emit('group:deleted',{groupId:id,key:'group_'+id});
    console.log(`🗑️  Group deleted: ${rows[0].name}`);
    res.json({message:'Group deleted'});
  } catch(err){ res.status(500).json({error:'Server error: '+err.message}); }
});

// Admin routes
app.get('/api/admin/stats',verifyToken,adminOnly,async(req,res)=>{
  try {
    const [[{totalUsers}]]=await db.query("SELECT COUNT(*) AS totalUsers FROM users WHERE account_status='approved'");
    const [[{pendingUsers}]]=await db.query("SELECT COUNT(*) AS pendingUsers FROM users WHERE account_status='pending'");
    const [[{totalMessages}]]=await db.query('SELECT COUNT(*) AS totalMessages FROM messages');
    const [[{totalCalls}]]=await db.query('SELECT COUNT(*) AS totalCalls FROM calls');
    // Use real-time in-memory map for accurate online count
    const onlineCount = onlineUsers.size;
    res.json({totalUsers, onlineUsers:onlineCount, pendingUsers, totalMessages, totalCalls});
  } catch { res.status(500).json({error:'Server error'}); }
});
app.get('/api/admin/pending',verifyToken,adminOnly,async(req,res)=>{
  try { const [r]=await db.query("SELECT id,name,email,role,created_at FROM users WHERE account_status='pending' ORDER BY created_at ASC"); res.json(r); }
  catch { res.status(500).json({error:'Server error'}); }
});
app.put('/api/admin/users/:id/approve',verifyToken,adminOnly,async(req,res)=>{
  try {
    const [r]=await db.query('SELECT name,email FROM users WHERE id=?',[req.params.id]);
    if(!r.length) return res.status(404).json({error:'User not found'});
    await db.query("UPDATE users SET account_status='approved' WHERE id=?",[req.params.id]);
    await db.query('INSERT INTO audit_logs (user_id,action,details) VALUES (?,?,?)',[req.user.id,'APPROVE',`Approved: ${r[0].email}`]);
    res.json({message:'Approved'});
  } catch { res.status(500).json({error:'Server error'}); }
});
app.delete('/api/admin/users/:id/reject',verifyToken,adminOnly,async(req,res)=>{
  try {
    const [r]=await db.query('SELECT name,email FROM users WHERE id=?',[req.params.id]);
    if(!r.length) return res.status(404).json({error:'User not found'});
    await db.query('UPDATE messages   SET sender_id=NULL WHERE sender_id=?',[req.params.id]);
    await db.query('UPDATE calls      SET caller_id=NULL WHERE caller_id=?',[req.params.id]);
    await db.query('UPDATE calls      SET receiver_id=NULL WHERE receiver_id=?',[req.params.id]);
    await db.query('UPDATE audit_logs SET user_id=NULL WHERE user_id=?',[req.params.id]);
    await db.query('DELETE FROM users WHERE id=?',[req.params.id]);
    await db.query('INSERT INTO audit_logs (user_id,action,details) VALUES (?,?,?)',[req.user.id,'REJECT',`Rejected: ${r[0].email}`]);
    res.json({message:'Rejected'});
  } catch(err){ res.status(500).json({error:'Server error: '+err.message}); }
});
app.get('/api/admin/users',verifyToken,adminOnly,async(req,res)=>{
  try {
    const [rows]=await db.query("SELECT id,name,email,role,account_status,status,created_at FROM users WHERE account_status!='pending' ORDER BY created_at DESC");
    // Enrich with real-time online status from in-memory map
    const onlineEmails = new Set([...onlineUsers.values()].map(u=>u.email));
    const enriched = rows.map(u=>({
      ...u,
      status: onlineEmails.has(u.email) ? 'online' : 'offline'
    }));
    res.json(enriched);
  } catch { res.status(500).json({error:'Server error'}); }
});
app.post('/api/admin/users',verifyToken,adminOnly,async(req,res)=>{
  const {name,email,password,role='student'}=req.body;
  if(!name||!email||!password) return res.status(400).json({error:'All fields required'});
  try {
    const [ex]=await db.query('SELECT id FROM users WHERE email=?',[email]);
    if(ex.length>0) return res.status(409).json({error:'Email exists'});
    const hash=await bcrypt.hash(password,10);
    const [r]=await db.query('INSERT INTO users (name,email,password_hash,role,account_status) VALUES (?,?,?,?,?)',[name,email,hash,role,'approved']);
    await db.query('INSERT INTO audit_logs (user_id,action,details) VALUES (?,?,?)',[req.user.id,'ADD_USER',`Added: ${email}`]);
    res.json({message:'User added',id:r.insertId});
  } catch(err){ res.status(500).json({error:'Server error'}); }
});
app.put('/api/admin/users/:id',verifyToken,adminOnly,async(req,res)=>{
  const {name,email,password,role}=req.body;
  try {
    if(password&&password.trim()!=='') { const h=await bcrypt.hash(password,10); await db.query('UPDATE users SET name=?,email=?,password_hash=?,role=? WHERE id=?',[name,email,h,role,req.params.id]); }
    else await db.query('UPDATE users SET name=?,email=?,role=? WHERE id=?',[name,email,role,req.params.id]);
    await db.query('INSERT INTO audit_logs (user_id,action,details) VALUES (?,?,?)',[req.user.id,'EDIT_USER',`Edited ID ${req.params.id}`]);
    res.json({message:'Updated'});
  } catch(err){ res.status(500).json({error:'Server error'}); }
});
app.delete('/api/admin/users/:id',verifyToken,adminOnly,async(req,res)=>{
  if(parseInt(req.params.id)===req.user.id) return res.status(400).json({error:'Cannot delete yourself'});
  try {
    const [r]=await db.query('SELECT name,email FROM users WHERE id=?',[req.params.id]);
    if(!r.length) return res.status(404).json({error:'Not found'});
    await db.query('UPDATE messages   SET sender_id=NULL WHERE sender_id=?',[req.params.id]);
    await db.query('UPDATE calls      SET caller_id=NULL WHERE caller_id=?',[req.params.id]);
    await db.query('UPDATE calls      SET receiver_id=NULL WHERE receiver_id=?',[req.params.id]);
    await db.query('UPDATE audit_logs SET user_id=NULL WHERE user_id=?',[req.params.id]);
    await db.query('DELETE FROM users WHERE id=?',[req.params.id]);
    await db.query('INSERT INTO audit_logs (user_id,action,details) VALUES (?,?,?)',[req.user.id,'DELETE_USER',`Deleted: ${r[0].email}`]);
    res.json({message:'Deleted'});
  } catch(err){ res.status(500).json({error:'Server error: '+err.message}); }
});
app.get('/api/admin/logs',verifyToken,adminOnly,async(req,res)=>{
  try { const [r]=await db.query('SELECT l.*,u.name AS user_name FROM audit_logs l LEFT JOIN users u ON l.user_id=u.id ORDER BY l.created_at DESC LIMIT 100'); res.json(r); }
  catch { res.status(500).json({error:'Server error'}); }
});
app.get('/api/admin/messages',verifyToken,adminOnly,async(req,res)=>{
  try { const [r]=await db.query('SELECT m.*,u.name AS sender FROM messages m LEFT JOIN users u ON m.sender_id=u.id ORDER BY m.created_at DESC LIMIT 200'); res.json(r); }
  catch { res.status(500).json({error:'Server error'}); }
});

// Socket.IO
const onlineUsers=new Map();
const activeRooms=new Map();

io.use((socket,next)=>{
  const token=socket.handshake.auth?.token;
  if(!token) return next(new Error('Auth required'));
  try { socket.user=jwt.verify(token,JWT_SECRET); next(); }
  catch { next(new Error('Invalid token')); }
});

io.on('connection', async(socket)=>{
  const {id,email,name,role}=socket.user;
  onlineUsers.set(socket.id,{id,email,name,role,socketId:socket.id});
  await db.query('UPDATE users SET status=? WHERE id=?',['online',id]);
  console.log(`🟢  ${name} connected`);
  io.emit('users:update',Array.from(onlineUsers.values()));

  // Get groups for this user
  socket.on('groups:get', async()=>{
    try {
      const [groups]=await db.query(`
        SELECT g.id, g.name, g.created_at, g.created_by, u.name AS created_by_name
        FROM groups_table g
        INNER JOIN group_members gm ON g.id=gm.group_id
        LEFT JOIN users u ON g.created_by=u.id
        WHERE gm.user_id=?
        ORDER BY g.created_at DESC
      `,[id]);
      socket.emit('groups:list',groups);
      groups.forEach(g=>socket.join('group_'+g.id));
    } catch(err){ console.error(err.message); }
  });

  // Always join general room
  socket.join('group_general');

  // Get messages for a conversation
  socket.on('messages:get', async({key})=>{
    try {
      // Validate access
      if(key.startsWith('private_')) {
        const targetEmail=key.replace('private_','');
        // Build consistent key (alphabetical)
        const convKey=buildPrivateKey(email,targetEmail);
        const [rows]=await db.query(`SELECT m.id,m.conv_key,m.type,m.text,m.file_name,m.file_url,m.file_size,m.file_type,m.created_at AS timestamp,u.name AS sender,u.role FROM messages m LEFT JOIN users u ON m.sender_id=u.id WHERE m.conv_key=? ORDER BY m.created_at ASC LIMIT 100`,[convKey]);
        socket.emit('messages:history',{key,messages:rows});
      } else {
        const [rows]=await db.query(`SELECT m.id,m.conv_key,m.type,m.text,m.file_name,m.file_url,m.file_size,m.file_type,m.created_at AS timestamp,u.name AS sender,u.role FROM messages m LEFT JOIN users u ON m.sender_id=u.id WHERE m.conv_key=? ORDER BY m.created_at ASC LIMIT 100`,[key]);
        socket.emit('messages:history',{key,messages:rows});
      }
    } catch(err){ console.error('Messages get error:',err.message); }
  });

  // Send message
  socket.on('message:send', async({text,convKey})=>{
    const t=text?.trim(); if(!t||!convKey) return;
    try {
      let realKey=convKey;
      // For private chats, use consistent key
      if(convKey.startsWith('private_')) {
        const targetEmail=convKey.replace('private_','');
        realKey=buildPrivateKey(email,targetEmail);
      }
      const [result]=await db.query('INSERT INTO messages (sender_id,conv_key,type,text) VALUES (?,?,?,?)',[id,realKey,'chat',t]);
      const msg={id:result.insertId,type:'chat',sender:name,role,text:t,convKey,timestamp:new Date().toISOString()};

      if(convKey.startsWith('private_')) {
        // Send to both users only
        const targetEmail=convKey.replace('private_','');
        const targetSocket=[...onlineUsers.entries()].find(([,u])=>u.email===targetEmail)?.[0];
        if(targetSocket) io.to(targetSocket).emit('message:new',{...msg,convKey:'private_'+email});
        socket.emit('message:new',msg);
      } else {
        io.to(realKey).emit('message:new',{...msg,convKey:realKey});
      }
    } catch(err){ console.error('Send error:',err.message); }
  });

  // Broadcast (admin)
  socket.on('broadcast:send', async({text})=>{
    if(role!=='admin') return;
    const t=text?.trim(); if(!t) return;
    await db.query('INSERT INTO messages (sender_id,conv_key,type,text) VALUES (?,?,?,?)',[id,'group_general','announcement',t]);
    io.emit('message:new',{type:'announcement',sender:name,text:t,convKey:'group_general',timestamp:new Date().toISOString()});
  });

  // Typing
  socket.on('typing:start',({convKey})=>socket.broadcast.to(convKey||'group_general').emit('typing:update',{name,convKey,typing:true}));
  socket.on('typing:stop', ({convKey})=>socket.broadcast.to(convKey||'group_general').emit('typing:update',{name,convKey,typing:false}));

  // Create group
  socket.on('group:create', async({name:gname,members})=>{
    try {
      const [result]=await db.query('INSERT INTO groups_table (name,created_by) VALUES (?,?)',[gname,id]);
      const gid=result.insertId;
      // Add creator
      await db.query('INSERT INTO group_members (group_id,user_id) VALUES (?,?)',[gid,id]);
      // Add members
      for(const m of members) {
        const [u]=await db.query('SELECT id FROM users WHERE email=?',[m.email]);
        if(u.length) await db.query('INSERT INTO group_members (group_id,user_id) VALUES (?,?)',[gid,u[0].id]);
      }
      const key='group_'+gid;
      // Notify all members who are online
      const allEmails=[email,...members.map(m=>m.email)];
      for(const [sid,u] of onlineUsers.entries()) {
        if(allEmails.includes(u.email)) {
          io.to(sid).socketsJoin(key);
          io.to(sid).emit('groups:list',[{id:gid,name:gname,created_at:new Date().toISOString()}]);
        }
      }
      console.log(`👥  Group created: ${gname}`);
    } catch(err){ console.error('Group create error:',err.message); }
  });

  // VoIP
  socket.on('call:initiate',async({targetSocketId})=>{
    const target=onlineUsers.get(targetSocketId); if(!target)return;
    const [r]=await db.query('INSERT INTO calls (caller_id,receiver_id,status) VALUES (?,?,?)',[id,target.id,'missed']);
    io.to(targetSocketId).emit('call:incoming',{callId:r.insertId,from:{socketId:socket.id,name,role}});
    socket.emit('call:ringing',{callId:r.insertId,targetName:target.name});
  });
  socket.on('call:accept',async({callId,callerSocketId})=>{ await db.query('UPDATE calls SET status=?,started_at=NOW() WHERE id=?',['answered',callId]); io.to(callerSocketId).emit('call:accepted',{callId,answererSocketId:socket.id,answererName:name}); });
  socket.on('call:reject',async({callId,callerSocketId})=>{ await db.query('UPDATE calls SET status=? WHERE id=?',['rejected',callId]); io.to(callerSocketId).emit('call:rejected',{rejectedBy:name}); });
  socket.on('call:end',async({callId,targetSocketId})=>{ await db.query('UPDATE calls SET ended_at=NOW(),duration=TIMESTAMPDIFF(SECOND,started_at,NOW()) WHERE id=?',[callId]); if(targetSocketId) io.to(targetSocketId).emit('call:ended',{endedBy:name}); });
  socket.on('webrtc:offer',        ({targetSocketId,offer})    =>io.to(targetSocketId).emit('webrtc:offer',        {offer,    fromSocketId:socket.id}));
  socket.on('webrtc:answer',       ({targetSocketId,answer})   =>io.to(targetSocketId).emit('webrtc:answer',       {answer}));
  socket.on('webrtc:ice-candidate',({targetSocketId,candidate})=>io.to(targetSocketId).emit('webrtc:ice-candidate',{candidate}));

  // Group call
  socket.on('room:join',({roomId})=>{ socket.join(roomId); if(!activeRooms.has(roomId))activeRooms.set(roomId,new Set()); activeRooms.get(roomId).add(socket.id); socket.to(roomId).emit('room:peer-joined',{socketId:socket.id,name,role}); const members=[...activeRooms.get(roomId)].filter(s=>s!==socket.id).map(s=>({socketId:s,...onlineUsers.get(s)})); socket.emit('room:members',{roomId,members}); });
  socket.on('room:leave',({roomId})=>{ socket.leave(roomId); if(activeRooms.has(roomId)){activeRooms.get(roomId).delete(socket.id); if(activeRooms.get(roomId).size===0)activeRooms.delete(roomId);} socket.to(roomId).emit('room:peer-left',{socketId:socket.id,name}); });
  socket.on('room:offer',        ({targetSocketId,offer})    =>io.to(targetSocketId).emit('room:offer',        {offer,    fromSocketId:socket.id}));
  socket.on('room:answer',       ({targetSocketId,answer})   =>io.to(targetSocketId).emit('room:answer',       {answer,   fromSocketId:socket.id}));
  socket.on('room:ice-candidate',({targetSocketId,candidate})=>io.to(targetSocketId).emit('room:ice-candidate',{candidate,fromSocketId:socket.id}));

  socket.on('disconnect',async()=>{
    for(const [roomId,members] of activeRooms.entries()) { if(members.has(socket.id)){members.delete(socket.id); socket.to(roomId).emit('room:peer-left',{socketId:socket.id,name}); if(members.size===0)activeRooms.delete(roomId);} }
    onlineUsers.delete(socket.id);
    await db.query('UPDATE users SET status=? WHERE id=?',['offline',id]);
    console.log(`🔴  ${name} disconnected`);
    io.emit('users:update',Array.from(onlineUsers.values()));
  });
});

function buildPrivateKey(email1,email2) {
  return 'private_'+(email1<email2?email1+'__'+email2:email2+'__'+email1);
}

const PORT=process.env.PORT||3000;
setupDatabase().then(()=>{
  server.listen(PORT,'0.0.0.0',()=>{
    console.log(`🚀  MSUkaIP: http://localhost:${PORT}`);
    console.log(`🛡️   Admin:   http://localhost:${PORT}/admin.html`);
  });
});
