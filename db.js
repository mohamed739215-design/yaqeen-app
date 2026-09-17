// يقين - Local Database using IndexedDB
const DB_NAME = 'YaqeenDB';
const DB_VERSION = 1;

let db = null;

async function openDB() {
  if (db) return db;
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };
    request.onupgradeneeded = (e) => {
      const database = e.target.result;
      // Students store
      if (!database.objectStoreNames.contains('students')) {
        const students = database.createObjectStore('students', { keyPath: 'id', autoIncrement: true });
        students.createIndex('code', 'code', { unique: true });
        students.createIndex('name', 'name', { unique: false });
      }
      // Attendance store
      if (!database.objectStoreNames.contains('attendance')) {
        const attendance = database.createObjectStore('attendance', { keyPath: 'id', autoIncrement: true });
        attendance.createIndex('studentId', 'studentId', { unique: false });
        attendance.createIndex('date', 'date', { unique: false });
        attendance.createIndex('studentDate', ['studentId', 'date'], { unique: true });
      }
      // Settings store
      if (!database.objectStoreNames.contains('settings')) {
        database.createObjectStore('settings', { keyPath: 'key' });
      }
    };
  });
}

// ========== Settings ==========
async function getSetting(key, defaultValue = null) {
  const database = await openDB();
  return new Promise((resolve) => {
    const tx = database.transaction('settings', 'readonly');
    const store = tx.objectStore('settings');
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result ? req.result.value : defaultValue);
    req.onerror = () => resolve(defaultValue);
  });
}

async function setSetting(key, value) {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('settings', 'readwrite');
    const store = tx.objectStore('settings');
    store.put({ key, value });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ========== Students ==========
async function getAllStudents() {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('students', 'readonly');
    const store = tx.objectStore('students');
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function getStudent(id) {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('students', 'readonly');
    const req = tx.objectStore('students').get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getStudentByCode(code) {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('students', 'readonly');
    const index = tx.objectStore('students').index('code');
    const req = index.get(code);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function addStudent(student) {
  const database = await openDB();
  // Generate unique code if not provided
  if (!student.code) {
    student.code = 'ST' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).substr(2, 4).toUpperCase();
  }
  student.createdAt = new Date().toISOString();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('students', 'readwrite');
    const req = tx.objectStore('students').add(student);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function updateStudent(student) {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('students', 'readwrite');
    const req = tx.objectStore('students').put(student);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function deleteStudent(id) {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('students', 'readwrite');
    const req = tx.objectStore('students').delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// ========== Attendance ==========
function todayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

async function markAttendance(studentId, status = 'present', method = 'manual') {
  const database = await openDB();
  const date = todayStr();
  const record = {
    studentId,
    date,
    status, // present | absent | late
    method, // qr | manual
    time: new Date().toISOString(),
    timestamp: Date.now()
  };
  return new Promise((resolve, reject) => {
    const tx = database.transaction('attendance', 'readwrite');
    const store = tx.objectStore('attendance');
    // Check if already exists for today
    const index = store.index('studentDate');
    const checkReq = index.get([studentId, date]);
    checkReq.onsuccess = () => {
      if (checkReq.result) {
        // Update existing
        const existing = checkReq.result;
        existing.status = status;
        existing.method = method;
        existing.time = record.time;
        existing.timestamp = record.timestamp;
        store.put(existing);
        resolve({ updated: true, record: existing });
      } else {
        const addReq = store.add(record);
        addReq.onsuccess = () => resolve({ updated: false, record: { ...record, id: addReq.result } });
        addReq.onerror = () => reject(addReq.error);
      }
    };
    checkReq.onerror = () => reject(checkReq.error);
  });
}

async function getTodayAttendance() {
  const database = await openDB();
  const date = todayStr();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('attendance', 'readonly');
    const index = tx.objectStore('attendance').index('date');
    const req = index.getAll(date);
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function getAttendanceByDate(date) {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('attendance', 'readonly');
    const index = tx.objectStore('attendance').index('date');
    const req = index.getAll(date);
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function getStudentAttendance(studentId) {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('attendance', 'readonly');
    const index = tx.objectStore('attendance').index('studentId');
    const req = index.getAll(studentId);
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function getAllAttendance() {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('attendance', 'readonly');
    const req = tx.objectStore('attendance').getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

// ========== Export / Import ==========
async function exportAllData() {
  const students = await getAllStudents();
  const attendance = await getAllAttendance();
  const pin = await getSetting('pin');
  return {
    version: 1,
    app: 'يقين',
    exportedAt: new Date().toISOString(),
    students,
    attendance,
    pin
  };
}

async function importData(data) {
  if (!data || !data.students) throw new Error('بيانات غير صالحة');
  const database = await openDB();
  // Clear existing
  await clearAllData(false);
  // Import students
  const tx1 = database.transaction('students', 'readwrite');
  for (const s of data.students) {
    const { id, ...rest } = s;
    tx1.objectStore('students').add(rest);
  }
  await new Promise(r => tx1.oncomplete = r);
  // Import attendance
  if (data.attendance && data.attendance.length) {
    const tx2 = database.transaction('attendance', 'readwrite');
    for (const a of data.attendance) {
      const { id, ...rest } = a;
      tx2.objectStore('attendance').add(rest);
    }
    await new Promise(r => tx2.oncomplete = r);
  }
  if (data.pin) await setSetting('pin', data.pin);
}

async function clearAllData(keepPin = true) {
  const database = await openDB();
  const pin = keepPin ? await getSetting('pin') : null;
  return new Promise((resolve, reject) => {
    const tx = database.transaction(['students', 'attendance', 'settings'], 'readwrite');
    tx.objectStore('students').clear();
    tx.objectStore('attendance').clear();
    tx.objectStore('settings').clear();
    tx.oncomplete = async () => {
      if (pin) await setSetting('pin', pin);
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}
