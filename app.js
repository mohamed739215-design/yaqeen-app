// يقين - Main Application Logic
let html5QrCode = null;
let isScanning = false;
let currentFilter = 'all';
let recentScans = [];

// ========== Init ==========
document.addEventListener('DOMContentLoaded', async () => {
  await openDB();
  // Update date
  updateDate();
  // Hide splash after delay
  setTimeout(async () => {
    document.getElementById('splash').classList.add('hidden');
    const pin = await getSetting('pin');
    if (pin) {
      showScreen('login-screen');
    } else {
      // First time - set default PIN and go to app
      await setSetting('pin', '1234');
      showToast('تم تعيين الرمز الافتراضي: 1234');
      showScreen('app');
      loadAllPages();
    }
  }, 1500);

  setupEventListeners();
  // Register Service Worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
});

function updateDate() {
  const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  document.getElementById('current-date').textContent = new Date().toLocaleDateString('ar-EG', options);
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');
}

function showToast(msg, duration = 2500) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), duration);
}

// ========== Event Listeners ==========
function setupEventListeners() {
  // Login
  document.getElementById('login-btn').addEventListener('click', handleLogin);
  document.getElementById('pin-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleLogin();
  });

  // Navigation
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const page = btn.dataset.page;
      switchPage(page);
    });
  });

  // Menu
  document.getElementById('menu-btn').addEventListener('click', openMenu);
  document.getElementById('close-menu').addEventListener('click', closeMenu);
  document.getElementById('menu-overlay').addEventListener('click', closeMenu);
  document.querySelectorAll('.menu-list li').forEach(li => {
    li.addEventListener('click', () => handleMenuAction(li.dataset.action));
  });

  // Scan
  document.getElementById('start-scan-btn').addEventListener('click', startScanner);
  document.getElementById('stop-scan-btn').addEventListener('click', stopScanner);

  // Manual search
  document.getElementById('manual-search').addEventListener('input', (e) => {
    renderManualStudents(e.target.value);
  });

  // Students search
  document.getElementById('students-search').addEventListener('input', (e) => {
    renderStudentsList(e.target.value);
  });

  // Add student
  document.getElementById('add-student-btn').addEventListener('click', showAddStudentModal);

  // Filter
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.filter;
      renderTodayList();
    });
  });

  // Export today
  document.getElementById('export-today-btn').addEventListener('click', exportToday);

  // Modal close
  document.querySelector('.modal-close').addEventListener('click', closeModal);
  document.getElementById('modal').addEventListener('click', (e) => {
    if (e.target.id === 'modal') closeModal();
  });

  // Settings button
  document.getElementById('settings-btn').addEventListener('click', () => {
    handleMenuAction('about');
  });
}

async function handleLogin() {
  const input = document.getElementById('pin-input').value.trim();
  const pin = await getSetting('pin');
  if (input === pin) {
    showScreen('app');
    loadAllPages();
  } else {
    showToast('رمز الدخول غير صحيح');
    document.getElementById('pin-input').value = '';
  }
}

function switchPage(page) {
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  document.querySelector(`.nav-item[data-page="${page}"]`).classList.add('active');
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('active');

  if (page === 'scan') {
    // don't auto start
  } else {
    stopScanner();
  }
  if (page === 'manual') renderManualStudents();
  if (page === 'today') renderTodayPage();
  if (page === 'students') renderStudentsList();
}

function loadAllPages() {
  renderManualStudents();
  renderTodayPage();
  renderStudentsList();
  renderRecentScans();
}

// ========== Menu ==========
function openMenu() {
  document.getElementById('side-menu').classList.add('open');
  document.getElementById('menu-overlay').classList.add('show');
}

function closeMenu() {
  document.getElementById('side-menu').classList.remove('open');
  document.getElementById('menu-overlay').classList.remove('show');
}

async function handleMenuAction(action) {
  closeMenu();
  switch (action) {
    case 'history':
      showHistoryModal();
      break;
    case 'export':
      await doExport();
      break;
    case 'import':
      doImport();
      break;
    case 'backup':
      await doExport();
      break;
    case 'change-pin':
      showChangePinModal();
      break;
    case 'clear-data':
      confirmClearData();
      break;
    case 'about':
      showAboutModal();
      break;
  }
}

// ========== Scanner ==========
async function startScanner() {
  if (isScanning) return;
  const readerEl = document.getElementById('reader');
  readerEl.innerHTML = '';
  document.getElementById('scan-result').classList.add('hidden');

  html5QrCode = new Html5Qrcode('reader');
  try {
    await html5QrCode.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 250, height: 250 } },
      onScanSuccess,
      () => {}
    );
    isScanning = true;
    document.getElementById('start-scan-btn').classList.add('hidden');
    document.getElementById('stop-scan-btn').classList.remove('hidden');
  } catch (err) {
    showToast('تعذر فتح الكاميرا. تأكد من منح الإذن.');
    console.error(err);
  }
}

async function stopScanner() {
  if (html5QrCode && isScanning) {
    try {
      await html5QrCode.stop();
      html5QrCode.clear();
    } catch (e) {}
    isScanning = false;
  }
  document.getElementById('start-scan-btn').classList.remove('hidden');
  document.getElementById('stop-scan-btn').classList.add('hidden');
}

async function onScanSuccess(decodedText) {
  // Prevent rapid multiple scans
  if (!isScanning) return;
  isScanning = false; // pause briefly

  let code = decodedText.trim();
  // Support JSON format or plain code
  try {
    const parsed = JSON.parse(code);
    if (parsed.code) code = parsed.code;
  } catch (e) {}

  const student = await getStudentByCode(code);
  const resultEl = document.getElementById('scan-result');

  if (student) {
    const result = await markAttendance(student.id, 'present', 'qr');
    resultEl.innerHTML = `
      <i class="fas fa-check-circle"></i>
      <h3>${student.name}</h3>
      <p>${result.updated ? 'تم تحديث الحضور' : 'تم تسجيل الحضور بنجاح'}</p>
      <p style="font-size:13px;opacity:0.9;margin-top:6px">${new Date().toLocaleTimeString('ar-EG')}</p>
    `;
    resultEl.style.background = 'rgba(16, 185, 129, 0.95)';
    resultEl.classList.remove('hidden');

    // Add to recent
    recentScans.unshift({ name: student.name, time: new Date(), status: 'present' });
    if (recentScans.length > 10) recentScans.pop();
    renderRecentScans();

    // Vibrate if available
    if (navigator.vibrate) navigator.vibrate(100);

    setTimeout(() => {
      resultEl.classList.add('hidden');
      isScanning = true;
    }, 1800);
  } else {
    resultEl.innerHTML = `
      <i class="fas fa-times-circle"></i>
      <h3>طالب غير مسجل</h3>
      <p>الكود: ${code}</p>
    `;
    resultEl.style.background = 'rgba(239, 68, 68, 0.95)';
    resultEl.classList.remove('hidden');
    if (navigator.vibrate) navigator.vibrate([50, 50, 50]);
    setTimeout(() => {
      resultEl.classList.add('hidden');
      isScanning = true;
    }, 2000);
  }
}

function renderRecentScans() {
  const container = document.getElementById('recent-list');
  if (recentScans.length === 0) {
    container.innerHTML = '<div class="empty-state"><p>لا توجد مسوحات حديثة</p></div>';
    return;
  }
  container.innerHTML = recentScans.map(s => `
    <div class="list-item">
      <div class="avatar">${s.name.charAt(0)}</div>
      <div class="list-item-info">
        <h4>${s.name}</h4>
        <p>${s.time.toLocaleTimeString('ar-EG')}</p>
      </div>
      <span class="badge badge-present">حاضر</span>
    </div>
  `).join('');
}

// ========== Manual Attendance ==========
async function renderManualStudents(search = '') {
  const students = await getAllStudents();
  const todayAtt = await getTodayAttendance();
  const attMap = {};
  todayAtt.forEach(a => attMap[a.studentId] = a.status);

  let filtered = students;
  if (search) {
    const q = search.toLowerCase();
    filtered = students.filter(s => s.name.toLowerCase().includes(q) || (s.code || '').toLowerCase().includes(q));
  }

  const container = document.getElementById('manual-students-list');
  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1">
        <i class="fas fa-user-plus"></i>
        <p>${students.length === 0 ? 'أضف طلاباً أولاً من تبويب الطلاب' : 'لا توجد نتائج'}</p>
      </div>`;
    return;
  }

  container.innerHTML = filtered.map(s => {
    const status = attMap[s.id];
    return `
      <div class="student-card ${status === 'present' ? 'present' : ''}" data-id="${s.id}">
        <div class="avatar">${s.name.charAt(0)}</div>
        <h4>${s.name}</h4>
        <div class="status">${status === 'present' ? '✓ حاضر' : status === 'late' ? 'متأخر' : 'اضغط للتسجيل'}</div>
      </div>
    `;
  }).join('');

  container.querySelectorAll('.student-card').forEach(card => {
    card.addEventListener('click', async () => {
      const id = parseInt(card.dataset.id);
      const result = await markAttendance(id, 'present', 'manual');
      const student = await getStudent(id);
      showToast(`${student.name} - ${result.updated ? 'تم التحديث' : 'تم التسجيل'}`);
      renderManualStudents(document.getElementById('manual-search').value);
      if (navigator.vibrate) navigator.vibrate(50);
    });
  });
}

// ========== Today Page ==========
async function renderTodayPage() {
  const students = await getAllStudents();
  const todayAtt = await getTodayAttendance();
  const presentCount = todayAtt.filter(a => a.status === 'present' || a.status === 'late').length;
  const total = students.length;
  const absentCount = Math.max(0, total - presentCount);

  document.getElementById('stat-present').textContent = presentCount;
  document.getElementById('stat-absent').textContent = absentCount;
  document.getElementById('stat-total').textContent = total;

  await renderTodayList();
}

async function renderTodayList() {
  const students = await getAllStudents();
  const todayAtt = await getTodayAttendance();
  const attMap = {};
  todayAtt.forEach(a => attMap[a.studentId] = a);

  let items = students.map(s => {
    const att = attMap[s.id];
    return {
      student: s,
      status: att ? att.status : 'absent',
      time: att ? att.time : null,
      method: att ? att.method : null
    };
  });

  if (currentFilter === 'present') items = items.filter(i => i.status === 'present' || i.status === 'late');
  if (currentFilter === 'absent') items = items.filter(i => i.status === 'absent');

  const container = document.getElementById('today-list');
  if (items.length === 0) {
    container.innerHTML = '<div class="empty-state"><i class="fas fa-calendar-day"></i><p>لا توجد سجلات</p></div>';
    return;
  }

  container.innerHTML = items.map(item => {
    const badgeClass = item.status === 'present' ? 'badge-present' : item.status === 'late' ? 'badge-late' : 'badge-absent';
    const badgeText = item.status === 'present' ? 'حاضر' : item.status === 'late' ? 'متأخر' : 'غائب';
    const timeStr = item.time ? new Date(item.time).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) : '-';
    const methodStr = item.method === 'qr' ? 'QR' : item.method === 'manual' ? 'يدوي' : '';
    return `
      <div class="list-item">
        <div class="avatar">${item.student.name.charAt(0)}</div>
        <div class="list-item-info">
          <h4>${item.student.name}</h4>
          <p>${timeStr} ${methodStr ? '• ' + methodStr : ''}</p>
        </div>
        <span class="badge ${badgeClass}">${badgeText}</span>
      </div>
    `;
  }).join('');
}

async function exportToday() {
  const students = await getAllStudents();
  const todayAtt = await getTodayAttendance();
  const attMap = {};
  todayAtt.forEach(a => attMap[a.studentId] = a);

  let csv = 'الاسم,الكود,الحالة,الوقت,الطريقة\n';
  students.forEach(s => {
    const att = attMap[s.id];
    const status = att ? (att.status === 'present' ? 'حاضر' : att.status === 'late' ? 'متأخر' : 'غائب') : 'غائب';
    const time = att ? new Date(att.time).toLocaleTimeString('ar-EG') : '';
    const method = att ? (att.method === 'qr' ? 'QR' : 'يدوي') : '';
    csv += `"${s.name}","${s.code || ''}","${status}","${time}","${method}"\n`;
  });

  downloadFile(csv, `حضور_${todayStr()}.csv`, 'text/csv;charset=utf-8');
  showToast('تم تصدير سجل اليوم');
}

// ========== Students Management ==========
async function renderStudentsList(search = '') {
  const students = await getAllStudents();
  let filtered = students;
  if (search) {
    const q = search.toLowerCase();
    filtered = students.filter(s => s.name.toLowerCase().includes(q) || (s.code || '').toLowerCase().includes(q));
  }

  const container = document.getElementById('students-list');
  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-users"></i>
        <p>${students.length === 0 ? 'لا يوجد طلاب. اضغط "إضافة" لبدء التسجيل' : 'لا توجد نتائج'}</p>
      </div>`;
    return;
  }

  container.innerHTML = filtered.map(s => `
    <div class="list-item">
      <div class="avatar">${s.name.charAt(0)}</div>
      <div class="list-item-info">
        <h4>${s.name}</h4>
        <p>${s.code || ''} ${s.group ? '• ' + s.group : ''}</p>
      </div>
      <div class="item-actions">
        <button onclick="showStudentQR(${s.id})" title="QR"><i class="fas fa-qrcode"></i></button>
        <button onclick="showEditStudent(${s.id})" title="تعديل"><i class="fas fa-pen"></i></button>
        <button onclick="confirmDeleteStudent(${s.id})" title="حذف"><i class="fas fa-trash"></i></button>
      </div>
    </div>
  `).join('');
}

function showAddStudentModal() {
  openModal('إضافة طالب جديد', `
    <div class="form-group">
      <label>اسم الطالب *</label>
      <input type="text" id="student-name" placeholder="الاسم الكامل" required>
    </div>
    <div class="form-group">
      <label>المجموعة / الصف</label>
      <input type="text" id="student-group" placeholder="مثال: الصف الثالث - مجموعة أ">
    </div>
    <div class="form-group">
      <label>رقم ولي الأمر</label>
      <input type="tel" id="student-phone" placeholder="01xxxxxxxxx">
    </div>
    <div class="form-group">
      <label>ملاحظات</label>
      <textarea id="student-notes" rows="2" placeholder="اختياري"></textarea>
    </div>
  `, `
    <button class="btn btn-outline" onclick="closeModal()">إلغاء</button>
    <button class="btn btn-primary" onclick="saveNewStudent()">حفظ</button>
  `);
  setTimeout(() => document.getElementById('student-name').focus(), 100);
}

async function saveNewStudent() {
  const name = document.getElementById('student-name').value.trim();
  if (!name) {
    showToast('يرجى إدخال اسم الطالب');
    return;
  }
  const student = {
    name,
    group: document.getElementById('student-group').value.trim(),
    phone: document.getElementById('student-phone').value.trim(),
    notes: document.getElementById('student-notes').value.trim()
  };
  await addStudent(student);
  closeModal();
  showToast('تم إضافة الطالب بنجاح');
  renderStudentsList();
  renderManualStudents();
}

async function showEditStudent(id) {
  const s = await getStudent(id);
  if (!s) return;
  openModal('تعديل بيانات الطالب', `
    <div class="form-group">
      <label>اسم الطالب *</label>
      <input type="text" id="student-name" value="${escapeHtml(s.name)}" required>
    </div>
    <div class="form-group">
      <label>المجموعة / الصف</label>
      <input type="text" id="student-group" value="${escapeHtml(s.group || '')}">
    </div>
    <div class="form-group">
      <label>رقم ولي الأمر</label>
      <input type="tel" id="student-phone" value="${escapeHtml(s.phone || '')}">
    </div>
    <div class="form-group">
      <label>ملاحظات</label>
      <textarea id="student-notes" rows="2">${escapeHtml(s.notes || '')}</textarea>
    </div>
    <div class="form-group">
      <label>كود الطالب</label>
      <input type="text" value="${s.code}" disabled style="opacity:0.6">
    </div>
  `, `
    <button class="btn btn-outline" onclick="closeModal()">إلغاء</button>
    <button class="btn btn-primary" onclick="saveEditStudent(${id})">حفظ التعديلات</button>
  `);
}

async function saveEditStudent(id) {
  const s = await getStudent(id);
  s.name = document.getElementById('student-name').value.trim();
  if (!s.name) {
    showToast('يرجى إدخال اسم الطالب');
    return;
  }
  s.group = document.getElementById('student-group').value.trim();
  s.phone = document.getElementById('student-phone').value.trim();
  s.notes = document.getElementById('student-notes').value.trim();
  await updateStudent(s);
  closeModal();
  showToast('تم حفظ التعديلات');
  renderStudentsList();
  renderManualStudents();
}

function confirmDeleteStudent(id) {
  openModal('تأكيد الحذف', `
    <p style="text-align:center;padding:10px 0">هل أنت متأكد من حذف هذا الطالب؟<br>سيتم حذف سجل حضوره أيضاً.</p>
  `, `
    <button class="btn btn-outline" onclick="closeModal()">إلغاء</button>
    <button class="btn btn-danger" onclick="doDeleteStudent(${id})">حذف</button>
  `);
}

async function doDeleteStudent(id) {
  await deleteStudent(id);
  closeModal();
  showToast('تم حذف الطالب');
  renderStudentsList();
  renderManualStudents();
  renderTodayPage();
}

async function showStudentQR(id) {
  const s = await getStudent(id);
  if (!s) return;
  openModal(`كارت ${s.name}`, `
    <div class="qr-preview">
      <div id="qrcode-container"></div>
      <h3 style="margin-top:12px">${s.name}</h3>
      <p style="color:var(--text-muted);font-size:13px">${s.code}</p>
      <p style="font-size:12px;margin-top:8px;color:var(--text-muted)">اطبع هذا الكود أو احفظه على هاتف الطالب</p>
    </div>
  `, `
    <button class="btn btn-primary btn-block" onclick="closeModal()">إغلاق</button>
  `);
  setTimeout(() => {
    const container = document.getElementById('qrcode-container');
    container.innerHTML = '';
    new QRCode(container, {
      text: s.code,
      width: 200,
      height: 200,
      colorDark: '#1e3a5f',
      colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.H
    });
  }, 100);
}

// ========== History ==========
async function showHistoryModal() {
  const attendance = await getAllAttendance();
  const students = await getAllStudents();
  const studentMap = {};
  students.forEach(s => studentMap[s.id] = s);

  // Group by date
  const byDate = {};
  attendance.forEach(a => {
    if (!byDate[a.date]) byDate[a.date] = [];
    byDate[a.date].push(a);
  });
  const dates = Object.keys(byDate).sort().reverse().slice(0, 30);

  let html = '';
  if (dates.length === 0) {
    html = '<div class="empty-state"><p>لا يوجد سجل حضور بعد</p></div>';
  } else {
    dates.forEach(date => {
      const records = byDate[date];
      const present = records.filter(r => r.status === 'present' || r.status === 'late').length;
      html += `
        <div style="margin-bottom:16px">
          <h4 style="font-size:14px;color:var(--primary);margin-bottom:8px">${formatDate(date)} — ${present} حاضر</h4>
          ${records.slice(0, 5).map(r => {
            const name = studentMap[r.studentId]?.name || 'محذوف';
            return `<div style="font-size:13px;padding:4px 0;color:var(--text-muted)">${name} — ${r.status === 'present' ? 'حاضر' : r.status}</div>`;
          }).join('')}
          ${records.length > 5 ? `<div style="font-size:12px;color:var(--text-muted)">... و ${records.length - 5} آخرين</div>` : ''}
        </div>
      `;
    });
  }

  openModal('سجل الحضور', html, `
    <button class="btn btn-primary btn-block" onclick="closeModal()">إغلاق</button>
  `);
}

// ========== Export / Import ==========
async function doExport() {
  const data = await exportAllData();
  const json = JSON.stringify(data, null, 2);
  downloadFile(json, `yaqeen_backup_${todayStr()}.json`, 'application/json');
  showToast('تم تصدير البيانات بنجاح');
}

function doImport() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      await importData(data);
      showToast('تم استيراد البيانات بنجاح');
      loadAllPages();
    } catch (err) {
      showToast('فشل الاستيراد: ملف غير صالح');
      console.error(err);
    }
  };
  input.click();
}

function confirmClearData() {
  openModal('مسح كل البيانات', `
    <p style="text-align:center;padding:10px 0;color:var(--danger)">
      تحذير: سيتم حذف جميع الطلاب وسجلات الحضور نهائياً.<br>
      لا يمكن التراجع عن هذا الإجراء.
    </p>
  `, `
    <button class="btn btn-outline" onclick="closeModal()">إلغاء</button>
    <button class="btn btn-danger" onclick="doClearData()">مسح الكل</button>
  `);
}

async function doClearData() {
  await clearAllData(true);
  closeModal();
  showToast('تم مسح جميع البيانات');
  recentScans = [];
  loadAllPages();
}

// ========== PIN ==========
function showChangePinModal() {
  openModal('تغيير رمز الدخول', `
    <div class="form-group">
      <label>الرمز الحالي</label>
      <input type="password" id="old-pin" maxlength="6" inputmode="numeric">
    </div>
    <div class="form-group">
      <label>الرمز الجديد</label>
      <input type="password" id="new-pin" maxlength="6" inputmode="numeric">
    </div>
    <div class="form-group">
      <label>تأكيد الرمز الجديد</label>
      <input type="password" id="confirm-pin" maxlength="6" inputmode="numeric">
    </div>
  `, `
    <button class="btn btn-outline" onclick="closeModal()">إلغاء</button>
    <button class="btn btn-primary" onclick="saveNewPin()">حفظ</button>
  `);
}

async function saveNewPin() {
  const oldPin = document.getElementById('old-pin').value;
  const newPin = document.getElementById('new-pin').value;
  const confirm = document.getElementById('confirm-pin').value;
  const current = await getSetting('pin');
  if (oldPin !== current) {
    showToast('الرمز الحالي غير صحيح');
    return;
  }
  if (newPin.length < 4) {
    showToast('الرمز يجب أن يكون 4 أرقام على الأقل');
    return;
  }
  if (newPin !== confirm) {
    showToast('الرمزان غير متطابقين');
    return;
  }
  await setSetting('pin', newPin);
  closeModal();
  showToast('تم تغيير الرمز بنجاح');
}

// ========== About ==========
function showAboutModal() {
  openModal('حول التطبيق', `
    <div style="text-align:center;padding:10px 0">
      <div class="logo-circle" style="margin:0 auto 16px">
        <i class="fas fa-check-double"></i>
      </div>
      <h2 style="color:var(--primary);margin-bottom:4px">يقين</h2>
      <p style="color:var(--text-muted);font-size:13px;margin-bottom:16px">نظام تسجيل الحضور والانصراف<br>تخزين محلي بالكامل</p>
      <p style="font-size:13px;line-height:1.7">
        تطبيق محلي 100% يعمل بدون إنترنت.<br>
        جميع البيانات محفوظة على جهازك فقط.<br>
        لا يتم إرسال أي بيانات إلى أي خادم.
      </p>
      <p style="font-size:12px;color:var(--text-muted);margin-top:16px">الإصدار 1.0.0</p>
    </div>
  `, `
    <button class="btn btn-primary btn-block" onclick="closeModal()">إغلاق</button>
  `);
}

// ========== Modal Helpers ==========
function openModal(title, bodyHtml, footerHtml) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = bodyHtml;
  document.getElementById('modal-footer').innerHTML = footerHtml || '';
  document.getElementById('modal').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('modal').classList.add('hidden');
}

// ========== Utilities ==========
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('ar-EG', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
}

function downloadFile(content, filename, type) {
  const bom = type.includes('csv') ? '\uFEFF' : '';
  const blob = new Blob([bom + content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Make functions available globally for onclick handlers
window.showStudentQR = showStudentQR;
window.showEditStudent = showEditStudent;
window.confirmDeleteStudent = confirmDeleteStudent;
window.doDeleteStudent = doDeleteStudent;
window.saveNewStudent = saveNewStudent;
window.saveEditStudent = saveEditStudent;
window.closeModal = closeModal;
window.saveNewPin = saveNewPin;
window.doClearData = doClearData;
