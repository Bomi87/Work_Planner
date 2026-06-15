/**
 * GitHub Pages Frontend
 * 반드시 아래 API_URL을 Apps Script Web App URL로 교체하세요.
 */
const API_URL = 'https://script.google.com/macros/s/AKfycbx7D2sZym4M8PrSIBLM9kVBkX3idkb844KfnhNK8amFv7m-Xj-1OPJ76UhCSFrpRGcU/exec';

let currentUser = null;
let workTypes = [];
let records = [];
let chart = null;

const $ = (id) => document.getElementById(id);

document.addEventListener('DOMContentLoaded', init);

async function init() {
  setupDateInputs();
  bindEvents();

  try {
    showOnly('loadingView');
    const me = await api('me');

    currentUser = me.user;
    workTypes = me.workTypes || [];

    $('userInfo').textContent = `${currentUser.name} / ${currentUser.email} / ${currentUser.role}`;

    fillWorkTypeOptions();
    await loadUsers();

    showOnly('mainView');
    await reloadAll();
  } catch (err) {
    $('blockedMessage').textContent = err.message || String(err);
    showOnly('blockedView');
  }
}

function showOnly(id) {
  ['loadingView', 'blockedView', 'mainView'].forEach(x => $(x).classList.add('hidden'));
  $(id).classList.remove('hidden');
}

function setupDateInputs() {
  const now = new Date();

  $('yearInput').value = now.getFullYear();

  const monthSelect = $('monthSelect');
  monthSelect.innerHTML = '';
  for (let m = 1; m <= 12; m++) {
    const opt = document.createElement('option');
    opt.value = String(m);
    opt.textContent = `${m}월`;
    monthSelect.appendChild(opt);
  }
  monthSelect.value = String(now.getMonth() + 1);

  $('dateInput').value = todayYmd();
}

function bindEvents() {
  $('retryBtn').addEventListener('click', () => location.reload());
  $('refreshBtn').addEventListener('click', reloadAll);
  $('floatingAddBtn').addEventListener('click', () => openForm());
  $('backFromFormBtn').addEventListener('click', () => switchTab('List'));
  $('cancelBtn').addEventListener('click', () => switchTab('List'));

  $('yearInput').addEventListener('change', reloadAll);
  $('monthSelect').addEventListener('change', reloadAll);
  $('userSelect').addEventListener('change', reloadAll);

  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.tab === 'Form') openForm();
      else switchTab(btn.dataset.tab);
    });
  });

  $('workForm').addEventListener('submit', saveWork);
}

function fillWorkTypeOptions() {
  fillSelect($('type1Input'), workTypes, true);
  fillSelect($('type2Input'), workTypes, false);
}

function fillSelect(select, values, required) {
  select.innerHTML = '';

  if (!required) {
    const empty = document.createElement('option');
    empty.value = '';
    empty.textContent = '선택 안 함';
    select.appendChild(empty);
  } else {
    const empty = document.createElement('option');
    empty.value = '';
    empty.textContent = '선택';
    select.appendChild(empty);
  }

  values.forEach(v => {
    const opt = document.createElement('option');
    opt.value = v;
    opt.textContent = v;
    select.appendChild(opt);
  });
}

async function loadUsers() {
  const res = await api('users');
  const select = $('userSelect');
  select.innerHTML = '';

  (res.users || []).forEach(u => {
    const opt = document.createElement('option');
    opt.value = u.email;
    opt.textContent = `${u.name} (${u.email})`;
    select.appendChild(opt);
  });

  if (currentUser.isAdmin) {
    select.classList.remove('hidden');
  } else {
    select.classList.add('hidden');
  }
}

function getTargetEmail() {
  return currentUser.isAdmin ? $('userSelect').value : currentUser.email;
}

function getYear() {
  return Number($('yearInput').value);
}

function getMonth() {
  return Number($('monthSelect').value);
}

async function reloadAll() {
  try {
    showToast('조회 중...');
    await Promise.all([
      loadStatus(),
      loadList(),
      loadMonthly(),
      loadChart()
    ]);
    showToast('조회 완료');
  } catch (err) {
    showToast(err.message || String(err));
  }
}

async function loadStatus() {
  const res = await api('status', {
    email: getTargetEmail(),
    year: getYear(),
    month: getMonth()
  });

  renderStatus(res.summary);
}

function renderStatus(s) {
  $('statusMonth').textContent = `${String(s.Month).padStart(2, '0')}월`;

  if (s.Status === '완료') {
    $('statusMain').textContent = '완료';
    $('statusMain').classList.add('done');
  } else {
    $('statusMain').textContent = `계획필요: ${s.NeedText}`;
    $('statusMain').classList.remove('done');
  }

  $('requiredText').textContent = s.RequiredText;
  $('actualText').textContent = s.ActualText;
  $('recognizedText').textContent = s.RecognizedText;
  $('focusBonusText').textContent = s.FocusBonusText;
  $('breakText').textContent = s.BreakText;
  $('holidayWorkText').textContent = s.HolidayWorkText;
  $('overtimeText').textContent = s.OvertimeText;
}

async function loadList() {
  const res = await api('listWork', {
    email: getTargetEmail(),
    year: getYear(),
    month: getMonth()
  });

  records = res.records || [];
  renderList();
}

function renderList() {
  const wrap = $('workList');

  if (!records.length) {
    wrap.innerHTML = '<div class="work-card">등록된 근무가 없습니다.</div>';
    return;
  }

  wrap.innerHTML = records.map(r => {
    const typeText = [r.Type1, r.Type2].filter(Boolean).join(' / ');
    return `
      <div class="work-card">
        <div class="work-head">
          <div class="work-date">${emojiFor(r)} ${escapeHtml(r.Date)}</div>
          <div class="work-type">${escapeHtml(typeText)}</div>
        </div>

        <div class="work-time">
          근무시간: ${escapeHtml(r.ActualText)}<br>
          인정시간: ${escapeHtml(r.RecognizedText)}
          ${r.BreakMinutes > 0 ? `<br>휴게시간: ${escapeHtml(r.BreakText)}` : ''}
          ${r.FocusBonusMinutes > 0 ? `<br>FOCUS 인정: ${escapeHtml(r.FocusBonusText)}` : ''}
        </div>

        <div class="work-badges">
          ${r.IsFocusDay ? '<span class="badge focus">FOCUS DAY</span>' : ''}
          ${r.IsHoliday ? `<span class="badge holiday">${escapeHtml(r.HolidayName || '공휴일')}</span>` : ''}
          ${r.Type1 === '건강검진' || r.Type2 === '건강검진' ? '<span class="badge">건강검진</span>' : ''}
        </div>

        ${r.Memo ? `<div class="work-time">메모: ${escapeHtml(r.Memo)}</div>` : ''}

        <div class="work-actions">
          <button onclick="editRecord('${escapeAttr(r.ID)}')">✎</button>
          <button onclick="deleteRecord('${escapeAttr(r.ID)}')">🗑</button>
        </div>
      </div>
    `;
  }).join('');
}

function emojiFor(r) {
  const t = `${r.Type1} ${r.Type2}`;
  if (t.includes('해외출장')) return '✈️';
  if (t.includes('재택')) return '🏠';
  if (t.includes('연차')) return '🌴';
  if (t.includes('건강')) return '🏥';
  if (r.IsFocusDay) return '😊';
  return '💼';
}

function openForm(record = null) {
  clearForm();

  if (record) {
    $('formTitle').textContent = '근무수정';
    $('recordId').value = record.ID;
    $('dateInput').value = record.Date;
    $('type1Input').value = record.Type1;
    $('start1Input').value = record.Start1;
    $('end1Input').value = record.End1;
    $('type2Input').value = record.Type2;
    $('start2Input').value = record.Start2;
    $('end2Input').value = record.End2;
    $('memoInput').value = record.Memo || '';
  } else {
    $('formTitle').textContent = '근무등록';
    $('dateInput').value = todayYmd();
    $('type1Input').value = '메인오피스';
    $('start1Input').value = '09:00';
    $('end1Input').value = '18:00';
  }

  switchTab('Form');
}

function editRecord(id) {
  const record = records.find(r => r.ID === id);
  if (!record) return;
  openForm(record);
}

async function deleteRecord(id) {
  if (!confirm('삭제할까요?')) return;

  try {
    await api('deleteWork', { id });
    showToast('삭제 완료');
    await reloadAll();
  } catch (err) {
    alert(err.message || String(err));
  }
}

async function saveWork(e) {
  e.preventDefault();

  const record = {
    ID: $('recordId').value,
    Email: getTargetEmail(),
    Date: $('dateInput').value,
    Type1: $('type1Input').value,
    Start1: $('start1Input').value,
    End1: $('end1Input').value,
    Type2: $('type2Input').value,
    Start2: $('start2Input').value,
    End2: $('end2Input').value,
    Memo: $('memoInput').value
  };

  try {
    await api('saveWork', { record });
    showToast('저장 완료');
    clearForm();
    switchTab('List');
    await reloadAll();
  } catch (err) {
    alert(err.message || String(err));
  }
}

function clearForm() {
  $('workForm').reset();
  $('recordId').value = '';
  $('dateInput').value = todayYmd();
  $('formTitle').textContent = '근무등록';
}

async function loadMonthly() {
  const res = await api('monthly', {
    email: getTargetEmail(),
    year: getYear()
  });

  $('monthlyTitle').textContent = `😀 ${getYear()} 년`;

  const months = res.months || [];
  $('monthlyList').innerHTML = months.map(m => `
    <div class="month-card">
      <div class="mon">${monthName(m.Month)}</div>
      <div>계획필요: ${escapeHtml(m.NeedText)}</div>
      <br>
      <div>소정근무시간: ${escapeHtml(m.RequiredText)}</div>
      <div>실제등록근무시간: ${escapeHtml(m.ActualText)}</div>
      <div>인정근무시간: ${escapeHtml(m.RecognizedText)}</div>
      <div>(FOCUS 인정시간: ${escapeHtml(m.FocusBonusText)} / 초과근무시간: ${escapeHtml(m.OvertimeText)})</div>
    </div>
  `).join('');
}

function monthName(m) {
  return ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'][Number(m)-1] || String(m);
}

async function loadChart() {
  const res = await api('chart', {
    email: getTargetEmail(),
    year: getYear(),
    month: getMonth()
  });

  renderChart(res);
}

function renderChart(data) {
  const ctx = $('monthChart');

  if (chart) chart.destroy();

  chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: data.labels || [],
      datasets: [
        { label: '소정 누적', data: data.required || [], tension: 0.25 },
        { label: '실제 누적', data: data.actual || [], tension: 0.25 },
        { label: '인정 누적', data: data.recognized || [], tension: 0.25 }
      ]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: 'bottom' }
      },
      scales: {
        y: {
          title: { display: true, text: 'Hours' }
        }
      }
    }
  });
}

function switchTab(name) {
  ['Status', 'List', 'Form', 'Chart', 'Monthly'].forEach(t => {
    $(`tab${t}`).classList.toggle('hidden', t !== name);
  });

  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === name);
  });
}

async function api(action, data = {}) {
  if (!API_URL || API_URL.includes('PUT_YOUR')) {
    throw new Error('script.js의 API_URL을 Apps Script Web App URL로 교체해야 합니다.');
  }

  const payload = { action, ...data };

  const res = await fetch(API_URL, {
    method: 'POST',
    body: JSON.stringify(payload),
    headers: {
      'Content-Type': 'text/plain;charset=utf-8'
    },
    credentials: 'include'
  });

  const text = await res.text();

  let json;
  try {
    json = JSON.parse(text);
  } catch (err) {
    throw new Error('API 응답이 JSON이 아닙니다. Apps Script 배포 권한/로그인을 확인하세요. 응답: ' + text.slice(0, 120));
  }

  if (!json.ok) {
    throw new Error(json.error || 'API Error');
  }

  return json;
}

function todayYmd() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function showToast(message) {
  const el = $('toast');
  el.textContent = message;
  el.classList.add('show');

  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => {
    el.classList.remove('show');
  }, 1600);
}

function escapeHtml(v) {
  return String(v ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  }[c]));
}

function escapeAttr(v) {
  return String(v ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}
