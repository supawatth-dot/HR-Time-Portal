/**
 * HR-Time Workshop Attendance & Allowance Engine
 * Master JavaScript Application
 */

// State Object
const AppState = {
  rawRecords: [],
  processedRecords: [],
  employeeSummary: {},
  holidays: [],
  preHolidaysMap: {}, // 'YYYY-MM-DD': 'Pre-holiday reason'
  mode: 'workshop',   // 'workshop' | 'dws'
  lateToleranceSec: 60, // 60 seconds = 1 minute
  currentTab: 'tab-summary',
  dailyPage: 1,
  dailyPerPage: 100,
  selectedEmployeeForModal: null,
  currentFileName: 'Clock in and out_01.01.26 to 30.06.26.xlsx',
  lang: localStorage.getItem('hr_time_lang') || 'th'
};

// Day Names
const THAI_DAYS_SHORT = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
const THAI_DAYS_FULL = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
const ENG_DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const ENG_DAYS_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Initialize App
document.addEventListener('DOMContentLoaded', async () => {
  setupEventListeners();
  applyLanguage();
  await loadHolidays();
  await loadDefaultExcel();
});

/**
 * Setup UI Event Listeners
 */
function setupEventListeners() {
  // Theme Toggle
  document.getElementById('theme-toggle').addEventListener('click', () => {
    const isDark = document.body.classList.contains('theme-dark');
    document.body.classList.toggle('theme-dark', !isDark);
    document.body.classList.toggle('theme-light', isDark);
  });

  // Tab Navigation
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      
      btn.classList.add('active');
      const targetTab = btn.getAttribute('data-tab');
      document.getElementById(targetTab).classList.add('active');
      AppState.currentTab = targetTab;
      
      if (targetTab === 'tab-insights') {
        renderInsightsTab();
      }
    });
  });

  // Language Toggle Button
  const langToggleBtn = document.getElementById('lang-toggle');
  if (langToggleBtn) {
    langToggleBtn.addEventListener('click', () => {
      AppState.lang = AppState.lang === 'th' ? 'en' : 'th';
      localStorage.setItem('hr_time_lang', AppState.lang);
      applyLanguage();
    });
  }

  // Mode Toggle Buttons
  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      AppState.mode = btn.getAttribute('data-mode');
      
      const badge = document.getElementById('current-mode-badge');
      if (AppState.mode === 'workshop') {
        badge.textContent = AppState.lang === 'en' ? 'Workshop Rules (08:00/07:00)' : 'กฎ Workshop (08:00/07:00)';
      } else {
        badge.textContent = AppState.lang === 'en' ? 'Office Mode (Before 09:00, 8hrs+)' : 'โหมด Office (ไม่เกิน 09:00, 8ชม.+)';
      }
      
      // Update hint text based on mode
      const min = Math.floor(AppState.lateToleranceSec / 60);
      const mm = String(min).padStart(2, '0');
      const hintSpan = document.getElementById('hint-target-text');
      if (hintSpan) {
        if (AppState.mode === 'workshop') {
          hintSpan.textContent = AppState.lang === 'en' 
            ? (min === 0 ? 'Mon-Thu 08:00 Strict, Fri/Pre 07:00 Strict' : `Mon-Thu 08:${mm}, Fri/Pre 07:${mm}`)
            : (min === 0 ? 'จ-พฤ 08:00 น. ตรงเป๊ะ, ศ และก่อนวันหยุด 07:00 น.' : `จ-พฤ 08:${mm} น., ศ และก่อนวันหยุด 07:${mm} น.`);
        } else {
          hintSpan.textContent = AppState.lang === 'en'
            ? (min === 0 ? 'Before 09:00 Strict, Work 8h+' : `Before 09:${mm}, Work 8h+`)
            : (min === 0 ? 'ไม่เกิน 09:00 น. ตรงเป๊ะ, ทำงานครบ 8 ชม.' : `ไม่เกิน 09:${mm} น., ทำงานครบ 8 ชม.`);
        }
      }
      recalculateAndRenderAll();
    });
  });

  // Late Tolerance Pills
  document.querySelectorAll('.pill-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.pill-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      AppState.lateToleranceSec = parseInt(btn.getAttribute('data-tolerance'), 10);
      
      // Update hint text
      const hintSpan = document.getElementById('hint-target-text');
      const min = Math.floor(AppState.lateToleranceSec / 60);
      const mm = String(min).padStart(2, '0');
      if (hintSpan) {
        if (AppState.mode === 'workshop') {
          hintSpan.textContent = AppState.lang === 'en' 
            ? (min === 0 ? 'Mon-Thu 08:00 Strict, Fri/Pre 07:00 Strict' : `Mon-Thu 08:${mm}, Fri/Pre 07:${mm}`)
            : (min === 0 ? 'จ-พฤ 08:00 น. ตรงเป๊ะ, ศ และก่อนวันหยุด 07:00 น.' : `จ-พฤ 08:${mm} น., ศ และก่อนวันหยุด 07:${mm} น.`);
        } else {
          hintSpan.textContent = AppState.lang === 'en'
            ? (min === 0 ? 'Before 09:00 Strict, Work 8h+' : `Before 09:${mm}, Work 8h+`)
            : (min === 0 ? 'ไม่เกิน 09:00 น. ตรงเป๊ะ, ทำงานครบ 8 ชม.' : `ไม่เกิน 09:${mm} น., ทำงานครบ 8 ชม.`);
        }
      }
      recalculateAndRenderAll();
    });
  });

  // File Upload Handlers
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('excel-file-input');
  const btnTrigger = document.getElementById('btn-trigger-upload');

  btnTrigger.addEventListener('click', (e) => {
    e.stopPropagation();
    fileInput.click();
  });

  dropzone.addEventListener('click', () => fileInput.click());

  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });

  dropzone.addEventListener('dragleave', () => {
    dropzone.classList.remove('dragover');
  });

  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  });

  fileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFileUpload(e.target.files[0]);
    }
  });

  // Reload Default Button
  document.getElementById('btn-reload-default').addEventListener('click', async () => {
    await loadDefaultExcel();
  });

  // Summary Filters
  document.getElementById('summary-search-input').addEventListener('input', renderSummaryTable);
  document.getElementById('summary-dept-filter').addEventListener('change', renderSummaryTable);
  document.getElementById('summary-sort-select').addEventListener('change', renderSummaryTable);

  // Daily Filters
  document.getElementById('daily-search-input').addEventListener('input', () => { AppState.dailyPage = 1; renderDailyTable(); });
  document.getElementById('daily-month-filter').addEventListener('change', () => { AppState.dailyPage = 1; renderDailyTable(); });
  document.getElementById('daily-dept-filter').addEventListener('change', () => { AppState.dailyPage = 1; renderDailyTable(); });
  document.getElementById('daily-status-filter').addEventListener('change', () => { AppState.dailyPage = 1; renderDailyTable(); });

  // Holiday Form
  document.getElementById('add-holiday-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const dateInput = document.getElementById('holiday-date-input').value;
    const nameInput = document.getElementById('holiday-name-input').value.trim();
    if (!dateInput || !nameInput) return;

    AppState.holidays.push({ date: dateInput, name: nameInput, type: 'official' });
    await saveHolidaysToServer();
    document.getElementById('holiday-name-input').value = '';
    recalculateAndRenderAll();
  });

  // Manual Pre-Holiday Form
  document.getElementById('add-preholiday-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const dateInput = document.getElementById('preholiday-date-input').value;
    const nameInput = document.getElementById('preholiday-name-input').value.trim();
    if (!dateInput || !nameInput) return;

    AppState.holidays.push({ date: dateInput, name: nameInput, type: 'preholiday' });
    await saveHolidaysToServer();
    document.getElementById('preholiday-name-input').value = '';
    recalculateAndRenderAll();
  });

  // Holiday filter pills
  document.querySelectorAll('.badge-pill-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.badge-pill-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderHolidaysTable(btn.getAttribute('data-filter'));
    });
  });

  // Modal Close
  document.getElementById('btn-close-modal').addEventListener('click', closeModal);
  document.getElementById('btn-close-modal-footer').addEventListener('click', closeModal);
  document.getElementById('emp-modal-backdrop').addEventListener('click', (e) => {
    if (e.target.id === 'emp-modal-backdrop') closeModal();
  });

  // Print Summary
  document.getElementById('btn-print-summary').addEventListener('click', triggerPrintSummary);

  // Export Dropdown
  const dropdownToggle = document.getElementById('btn-export-dropdown');
  const dropdown = dropdownToggle.parentElement;
  dropdownToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdown.classList.toggle('open');
  });
  document.addEventListener('click', () => dropdown.classList.remove('open'));

  // Export actions
  document.getElementById('export-summary-xlsx').addEventListener('click', (e) => {
    e.preventDefault();
    exportSummaryXLSX();
  });
  document.getElementById('export-daily-xlsx').addEventListener('click', (e) => {
    e.preventDefault();
    exportDailyXLSX();
  });
  document.getElementById('export-summary-csv').addEventListener('click', (e) => {
    e.preventDefault();
    exportSummaryCSV();
  });
  document.getElementById('btn-export-emp-modal').addEventListener('click', () => {
    if (AppState.selectedEmployeeForModal) {
      exportEmployeeModalXLSX(AppState.selectedEmployeeForModal);
    }
  });
}

/**
 * Apply Internationalization (Thai / English)
 */
function applyLanguage() {
  const isEn = AppState.lang === 'en';
  const toggleText = document.getElementById('lang-toggle-text');
  if (toggleText) {
    toggleText.innerHTML = isEn ? '🇹🇭 ไทย' : '🇬🇧 EN';
  }

  // Brand text
  const brandH1 = document.querySelector('.brand-text h1');
  const brandP = document.querySelector('.brand-text p');
  if (brandH1) brandH1.textContent = isEn ? 'HR-Time Workshop Portal' : 'HR-Time Workshop Portal';
  if (brandP) brandP.textContent = isEn ? 'Automated Workshop Attendance & Food Allowance Engine (25฿/Day)' : 'ระบบคำนวณเวลาเข้า-ออกงาน workshop และค่าข้าวพนักงานอัตโนมัติ';

  // Current Mode Badge
  const badge = document.getElementById('current-mode-badge');
  if (badge) {
    if (AppState.mode === 'workshop') {
      badge.textContent = isEn ? 'Workshop Rules (08:00/07:00)' : 'กฎ Workshop (08:00/07:00)';
    } else {
      badge.textContent = isEn ? 'Office Mode (Before 09:00, 8hrs+)' : 'โหมด Office (ไม่เกิน 09:00, 8ชม.+)';
    }
  }

  // Upload box
  const uploadH3 = document.querySelector('.upload-box h3');
  const primaryDrop = document.querySelector('.primary-drop-text');
  const secondaryDrop = document.querySelector('.secondary-drop-text');
  const triggerBtn = document.getElementById('btn-trigger-upload');
  const reloadBtn = document.getElementById('btn-reload-default');
  if (uploadH3) uploadH3.innerHTML = isEn ? '📂 Attendance Data Source (Excel Upload)' : '📂 แหล่งข้อมูลการแตะบัตร (Excel Data Source)';
  if (primaryDrop) primaryDrop.innerHTML = isEn ? 'Click to choose file or drag & drop <strong>Clock in and out.xlsx</strong> here' : 'คลิกเพื่อเลือกไฟล์ หรือลากไฟล์ <strong>Clock in and out.xlsx</strong> มาวางที่นี่';
  if (secondaryDrop) secondaryDrop.textContent = isEn ? 'Supports time clock export files (.xlsx, .xls, .csv)' : 'รองรับข้อมูลจากไฟล์เครื่องรูดบัตร/แตะบัตร (.xlsx, .xls, .csv)';
  if (triggerBtn) triggerBtn.textContent = isEn ? 'Choose Excel File' : 'เลือกไฟล์ Excel';
  if (reloadBtn) reloadBtn.textContent = isEn ? '🔄 Reload Company Default' : '🔄 โหลดไฟล์บริษัทเริ่มต้น';

  // Rules box
  const rulesH3 = document.querySelector('.rules-box h3');
  const openHolBtn = document.getElementById('btn-open-holidays');
  const ruleLabels = document.querySelectorAll('.rule-group .rule-label');
  if (rulesH3) rulesH3.innerHTML = isEn ? '⚙️ Food Allowance Rules (25฿/Day)' : '⚙️ หลักเกณฑ์และกฎคำนวณค่าข้าววันละ 25 บาท';
  if (openHolBtn) openHolBtn.innerHTML = isEn ? '🏢 Manage Company Holidays' : '🏢 ตั้งค่าวันหยุดบริษัท';
  if (ruleLabels[0]) ruleLabels[0].textContent = isEn ? '👉 Select Attendance Calculation Mode:' : '👉 เลือกโหมดการคำนวณเวลาเข้างาน:';
  if (ruleLabels[1]) ruleLabels[1].textContent = isEn ? '🕒 Late Threshold Tolerance:' : '🕒 เกณฑ์เวลาสาย (Late Threshold):';

  // Mode buttons text
  const modeTitles = document.querySelectorAll('.mode-btn .mode-title');
  const modeDescs = document.querySelectorAll('.mode-btn .mode-desc');
  if (modeTitles[0]) modeTitles[0].textContent = isEn ? '⭐ Standard Workshop Mode' : '⭐ โหมด Workshop มาตรฐาน';
  if (modeDescs[0]) modeDescs[0].textContent = isEn ? 'Mon-Thu 08:00 | Fri & Pre-Holiday 07:00' : 'จ-พฤ เข้า 08:00 น. | ศ และก่อนวันหยุด เข้า 07:00 น.';
  if (modeTitles[1]) modeTitles[1].textContent = isEn ? '📋 Office Mode' : '📋 โหมดพนักงานออฟฟิศ (Office)';
  if (modeDescs[1]) modeDescs[1].textContent = isEn ? 'Clock in <= 09:00, Work >= 8h for allowance' : 'เข้างานไม่เกิน 09:00 น. ทำงานครบ 8 ชม. จะได้รับค่าข้าว';

  // Late tolerance pills
  const pillBtns = document.querySelectorAll('.pill-btn');
  if (pillBtns[0]) pillBtns[0].textContent = isEn ? 'Strict 0 Min' : 'ตรงเวลาเป๊ะ (0 นาที)';
  if (pillBtns[1]) pillBtns[1].textContent = isEn ? '> 1 Min (= Late, 0฿)' : 'เกิน 1 นาที (=สาย อดค่าข้าว)';
  if (pillBtns[2]) pillBtns[2].textContent = isEn ? '5 Min Grace' : 'ผ่อนผัน 5 นาที';
  if (pillBtns[3]) pillBtns[3].textContent = isEn ? '15 Min Grace' : 'ผ่อนผัน 15 นาที';

  // Hint text update
  const min = Math.floor(AppState.lateToleranceSec / 60);
  const hintSpan = document.getElementById('hint-target-text');
  if (hintSpan) {
    const mm = String(min).padStart(2, '0');
    if (AppState.mode === 'workshop') {
      hintSpan.textContent = isEn 
        ? (min === 0 ? 'Mon-Thu 08:00 Strict, Fri/Pre 07:00 Strict' : `Mon-Thu 08:${mm}, Fri/Pre 07:${mm}`)
        : (min === 0 ? 'จ-พฤ 08:00 น. ตรงเป๊ะ, ศ และก่อนวันหยุด 07:00 น.' : `จ-พฤ 08:${mm} น., ศ และก่อนวันหยุด 07:${mm} น.`);
    } else {
      hintSpan.textContent = isEn
        ? (min === 0 ? 'Before 09:00 Strict, Work 8h+' : `Before 09:${mm}, Work 8h+`)
        : (min === 0 ? 'ไม่เกิน 09:00 น. ตรงเป๊ะ, ทำงานครบ 8 ชม.' : `ไม่เกิน 09:${mm} น., ทำงานครบ 8 ชม.`);
    }
  }

  // KPI Labels
  const kpiLabels = document.querySelectorAll('.kpi-label');
  if (kpiLabels[0]) kpiLabels[0].textContent = isEn ? 'Total Employees' : 'พนักงานทั้งหมด (Employees)';
  if (kpiLabels[1]) kpiLabels[1].textContent = isEn ? 'Punch Records' : 'รายการบันทึกเวลา (Punch Records)';
  if (kpiLabels[2]) kpiLabels[2].textContent = isEn ? 'Total Food Allowance' : 'ยอดเบิกค่าข้าวรวม (Total Allowance)';
  if (kpiLabels[3]) kpiLabels[3].textContent = isEn ? 'On-Time vs Late Rate' : 'อัตราเข้าตรงเวลา vs มาสาย';
  if (kpiLabels[4]) kpiLabels[4].textContent = isEn ? 'Fri & Pre-Holiday Shifts (07:00)' : 'กะวันศุกร์และก่อนวันหยุด (07:00 น.)';

  // Tabs
  const tabBtns = document.querySelectorAll('.tab-list .tab-btn span:nth-child(2)');
  if (tabBtns[0]) tabBtns[0].textContent = isEn ? '1. Employee Summary & Allowance' : '1. สรุปรายบุคคล & ยอดเบิกค่าข้าว';
  if (tabBtns[1]) tabBtns[1].textContent = isEn ? '2. Daily Attendance Logs' : '2. บันทึกเวลาเข้า-ออกงานรายวัน';
  if (tabBtns[2]) tabBtns[2].textContent = isEn ? '3. Holiday & Pre-Holiday Calendar' : '3. ปฏิทินวันหยุด & วันก่อนหยุดบริษัท';
  if (tabBtns[3]) tabBtns[3].textContent = isEn ? '4. Analytics & Insights' : '4. วิเคราะห์สถิติ & อันดับความตรงเวลา';

  // Toolbar
  const printBtn = document.getElementById('btn-print-summary');
  const exportToggle = document.getElementById('btn-export-dropdown');
  const exportXlsx1 = document.getElementById('export-summary-xlsx');
  const exportXlsx2 = document.getElementById('export-daily-xlsx');
  const exportCsv = document.getElementById('export-summary-csv');
  if (printBtn) printBtn.innerHTML = isEn ? '🖨️ Print Summary / PDF' : '🖨️ พิมพ์ใบสรุป / PDF';
  if (exportToggle) exportToggle.innerHTML = isEn ? '📥 Export Data (Excel/CSV)' : '📥 Export ข้อมูล (Excel/CSV)';
  if (exportXlsx1) exportXlsx1.innerHTML = isEn ? '📊 Export Employee Summary (.xlsx)' : '📊 Export สรุปค่าข้าวรายบุคคล (.xlsx)';
  if (exportXlsx2) exportXlsx2.innerHTML = isEn ? '📋 Export Daily Punch Logs (.xlsx)' : '📋 Export รายการเข้า-ออกรายวัน (.xlsx)';
  if (exportCsv) exportCsv.innerHTML = isEn ? '📄 Export Summary (.csv)' : '📄 Export สรุปรายบุคคล (.csv)';

  // Summary Table Headers
  const sumThs = document.querySelectorAll('#summary-table thead tr th');
  if (sumThs.length >= 11) {
    const enSum = ['ID', 'Employee Name', 'Department', 'Worked Days', 'On Time (Days)', 'Late (Days)', '07:00 Shift (Fri/Pre)', 'Total Allowance (฿)', 'Actual Hrs', 'Total OT', 'Actions'];
    const thSum = ['รหัส', 'ชื่อ-นามสกุลพนักงาน', 'แผนก', 'วันทำงานรวม', 'ตรงเวลา (วัน)', 'มาสาย (วัน)', 'กะ 07:00 (ศ/ก่อนหยุด)', 'ค่าข้าวยอดรวม (฿)', 'ชม. ทำงานจริง', 'ชม. OT', 'จัดการ'];
    sumThs.forEach((th, idx) => { th.textContent = isEn ? enSum[idx] : thSum[idx]; });
  }

  // Daily Table Headers
  const dailyThs = document.querySelectorAll('#daily-table thead tr th');
  if (dailyThs.length >= 13) {
    const enDaily = ['Date', 'Day', 'ID', 'Employee Name', 'Department', 'DWS Schedule', 'Clock In', 'Target', 'Clock Out', 'Actual Hrs', 'Total OT', 'Status', 'Allowance'];
    const thDaily = ['วันที่', 'วันในสัปดาห์', 'รหัส', 'ชื่อ-นามสกุลพนักงาน', 'แผนก', 'กะงาน (DWS)', 'เวลาเข้าจริง', 'เป้าหมายเข้า', 'เวลาออกจริง', 'ชั่วโมง', 'OT รวม', 'สถานะสาย', 'ค่าข้าว'];
    dailyThs.forEach((th, idx) => { th.textContent = isEn ? enDaily[idx] : thDaily[idx]; });
  }

  // Holiday Table & Form Headers
  const holH3s = document.querySelectorAll('#tab-holidays h3');
  if (holH3s[0]) holH3s[0].innerHTML = isEn ? '➕ Add New Company Holiday' : '➕ เพิ่มวันหยุดบริษัทใหม่ (Add Holiday)';
  if (holH3s[1]) holH3s[1].innerHTML = isEn ? '🌟 Add Custom 07:00 Target Shift' : '🌟 เพิ่มวันก่อนหยุดพิเศษ / วันเข้า 07:00 แมนนวล';
  if (holH3s[2]) holH3s[2].innerHTML = isEn ? '🗓️ 2026 Company Holidays & Pre-Holidays' : '🗓️ รายการวันหยุดและวันก่อนวันหยุดบริษัท ปี 2026';

  const holThs = document.querySelectorAll('#tab-holidays thead tr th');
  if (holThs.length >= 5) {
    const enHol = ['Date', 'Type', 'Description / Reason', 'Target Start Time', 'Delete'];
    const thHol = ['วันที่', 'ประเภท', 'ชื่อรายการ / เหตุผล', 'เวลาเข้างานกำหนด', 'ลบ'];
    holThs.forEach((th, idx) => { th.textContent = isEn ? enHol[idx] : thHol[idx]; });
  }

  // Insights Headers
  const insH3s = document.querySelectorAll('#tab-insights h3');
  if (insH3s[0]) insH3s[0].innerHTML = isEn ? '🏆 Top 10 Most Punctual Employees' : '🏆 Top 10 พนักงานเข้างานตรงเวลาที่สุด';
  if (insH3s[1]) insH3s[1].innerHTML = isEn ? '🚨 Top 10 Most Frequently Late Employees' : '🚨 Top 10 พนักงานมาสายบ่อยที่สุด (ตรวจสอบ)';
  if (insH3s[2]) insH3s[2].innerHTML = isEn ? '📊 Late Frequency by Day of Week' : '📊 สถิติการมาสายแยกตามวันในสัปดาห์ (Day of Week Analysis)';

  // Re-render data tables to switch row texts if already loaded
  if (AppState.processedRecords && AppState.processedRecords.length > 0) {
    recalculateAndRenderAll();
  }
}

/**
 * Load Holidays from API
 */
async function loadHolidays() {
  try {
    const response = await fetch('/api/holidays');
    if (!response.ok) throw new Error('API server not responding');
    const result = await response.json();
    if (result.success && Array.isArray(result.holidays)) {
      AppState.holidays = result.holidays;
    }
  } catch (err) {
    console.warn('Could not load holidays from server API, trying static holidays.json for online host...', err);
    try {
      const respStatic = await fetch('holidays.json');
      if (respStatic.ok) {
        const data = await respStatic.json();
        if (Array.isArray(data)) {
          AppState.holidays = data;
        }
      }
    } catch (staticErr) {
      console.warn('Static holidays.json fetch also failed, using defaults.');
    }
  }
  buildPreHolidaysMap();
  renderHolidaysTable('all');
}

/**
 * Save Holidays to Server API
 */
async function saveHolidaysToServer() {
  try {
    await fetch('/api/holidays', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ holidays: AppState.holidays })
    });
  } catch (err) {
    console.warn('Failed to sync holidays to server.', err);
  }
  buildPreHolidaysMap();
  renderHolidaysTable('all');
}

/**
 * Build automatic Pre-Holiday map
 * If Date D is a holiday, what is the preceding working day?
 */
function buildPreHolidaysMap() {
  AppState.preHolidaysMap = {};
  const holidaySet = new Set(AppState.holidays.map(h => h.date));
  
  // Also track manual pre-holidays explicitly
  AppState.holidays.forEach(h => {
    if (h.type === 'preholiday') {
      AppState.preHolidaysMap[h.date] = `วันก่อนหยุด/เข้าเช้าพิเศษ: ${h.name}`;
    }
  });

  // Sort holidays to calculate preceding working day
  const sorted = [...AppState.holidays].filter(h => h.type === 'official').sort((a, b) => a.date.localeCompare(b.date));
  sorted.forEach(h => {
    const parts = h.date.split('-').map(Number);
    // Construct at 12:00 Noon so setDate(-1) cannot cross midnight across timezones/DST
    let dt = new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0);
    
    // Step backwards by 1 day until we hit a working day (Mon-Fri that is not a holiday)
    let steps = 0;
    while (steps < 7) {
      dt.setDate(dt.getDate() - 1);
      steps++;
      const yyyy = dt.getFullYear();
      const mm = String(dt.getMonth() + 1).padStart(2, '0');
      const dd = String(dt.getDate()).padStart(2, '0');
      const dateStr = `${yyyy}-${mm}-${dd}`;
      const dayOfWeek = dt.getDay(); // 0 = Sun, 6 = Sat
      
      // If it's Mon-Fri and not already in holidaySet
      if (dayOfWeek >= 1 && dayOfWeek <= 5 && !holidaySet.has(dateStr)) {
        if (!AppState.preHolidaysMap[dateStr]) {
          AppState.preHolidaysMap[dateStr] = `วันก่อนวันหยุด (${h.name})`;
        }
        break;
      }
    }
  });

  // Update tabs badge
  const countSpan = document.getElementById('tab-holiday-count');
  if (countSpan) countSpan.textContent = AppState.holidays.length;
}

/**
 * Load default Excel file from server `/api/default-excel` or static fallback for online hosting
 */
async function loadDefaultExcel() {
  const tbody = document.getElementById('summary-tbody');
  tbody.innerHTML = `<tr><td colspan="11" class="text-center loading-cell">⏳ กำลังโหลดและประมวลผลข้อมูลจากไฟล์บริษัท... (15,000+ รายการ)</td></tr>`;
  
  try {
    const response = await fetch('/api/default-excel');
    if (!response.ok) throw new Error('API server not available');
    const result = await response.json();
    if (result.success && Array.isArray(result.rows)) {
      AppState.rawRecords = result.rows;
      AppState.currentFileName = result.filename;
      document.getElementById('current-file-display').textContent = `📑 ไฟล์ปัจจุบัน: ${result.filename} (${result.totalRows.toLocaleString()} รายการ)`;
      document.getElementById('source-status-badge').textContent = 'Default Pre-loaded';
      document.getElementById('source-status-badge').className = 'badge badge-primary';
      
      recalculateAndRenderAll();
      return;
    } else {
      tbody.innerHTML = `<tr><td colspan="11" class="text-center text-danger">❌ ไม่พบข้อมูล: ${result.message || 'โปรดอัปโหลดไฟล์ Excel'}</td></tr>`;
      return;
    }
  } catch (err) {
    console.warn('API /api/default-excel not found (running static on GitHub Pages / Online), falling back to static binary fetch...', err);
  }

  // Fallback: Static binary fetch for GitHub Pages or static host
  try {
    const fileResp = await fetch('Clock in and out_01.01.26 to 30.06.26.xlsx');
    if (fileResp.ok) {
      const buffer = await fileResp.arrayBuffer();
      const workbook = XLSX.read(new Uint8Array(buffer), { type: 'array', cellDates: false });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: true });
      
      if (rawRows && rawRows.length > 1) {
        AppState.rawRecords = rawRows.slice(1);
        AppState.currentFileName = 'Clock in and out_01.01.26 to 30.06.26.xlsx';
        document.getElementById('current-file-display').textContent = `📑 ไฟล์ปัจจุบัน: ${AppState.currentFileName} (${AppState.rawRecords.length.toLocaleString()} รายการ)`;
        document.getElementById('source-status-badge').textContent = 'Online Static Loaded';
        document.getElementById('source-status-badge').className = 'badge badge-success';
        
        recalculateAndRenderAll();
        return;
      }
    }
  } catch (staticErr) {
    console.error('Static Excel fallback error:', staticErr);
  }

  tbody.innerHTML = `<tr><td colspan="11" class="text-center text-danger">❌ ไม่พบข้อมูลเริ่มต้น: โปรดคลิก 'เลือกไฟล์ Excel' เพื่ออัปโหลดไฟล์แตะบัตร</td></tr>`;
}

/**
 * Handle new file upload (either via Express API or Client-side SheetJS fallback)
 */
async function handleFileUpload(file) {
  const tbody = document.getElementById('summary-tbody');
  tbody.innerHTML = `<tr><td colspan="11" class="text-center loading-cell">⏳ กำลังประมวลผลไฟล์ "${file.name}"...</td></tr>`;
  
  document.getElementById('current-file-display').textContent = `⏳ กำลังอัปโหลดและอ่านไฟล์ "${file.name}"...`;

  // First try API upload
  try {
    const formData = new FormData();
    formData.append('file', file);
    
    const response = await fetch('/api/upload', {
      method: 'POST',
      body: formData
    });
    const result = await response.json();
    if (result.success && Array.isArray(result.rows)) {
      AppState.rawRecords = result.rows;
      AppState.currentFileName = result.filename;
      document.getElementById('current-file-display').textContent = `📑 ไฟล์ปัจจุบัน: ${result.filename} (${result.totalRows.toLocaleString()} รายการ)`;
      document.getElementById('source-status-badge').textContent = 'Uploaded File';
      document.getElementById('source-status-badge').className = 'badge badge-success';
      
      recalculateAndRenderAll();
      return;
    }
  } catch (err) {
    console.warn('API upload failed, falling back to client-side SheetJS parsing...', err);
  }

  // Client-side SheetJS fallback if server offline or API error
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array', cellDates: false });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: true });
      
      if (rawRows && rawRows.length > 1) {
        AppState.rawRecords = rawRows.slice(1);
        AppState.currentFileName = file.name;
        document.getElementById('current-file-display').textContent = `📑 ไฟล์ปัจจุบัน: ${file.name} (${AppState.rawRecords.length.toLocaleString()} รายการ)`;
        document.getElementById('source-status-badge').textContent = 'Client-Side Parsed';
        document.getElementById('source-status-badge').className = 'badge badge-info';
        
        recalculateAndRenderAll();
      } else {
        alert('รูปแบบไฟล์ Excel ไม่ถูกต้องหรือไม่พบข้อมูล');
      }
    } catch (parseErr) {
      console.error('Client parse error:', parseErr);
      alert('ไม่สามารถอ่านไฟล์ได้ กรุณาตรวจสอบรูปแบบไฟล์ Excel');
    }
  };
  reader.readAsArrayBuffer(file);
}

/**
 * Excel Date Serial to JS Date String (YYYY-MM-DD)
 */
function excelSerialToDateStr(serial) {
  if (serial === null || serial === undefined || serial === '') return null;
  
  if (typeof serial === 'string') {
    const s = serial.trim();
    // Check YYYY-MM-DD or YYYY/MM/DD or YYYY.MM.DD
    let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
    if (m) {
      return `${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`;
    }
    // Check DD/MM/YYYY or DD-MM-YYYY (or MM/DD/YYYY if first number > 12)
    m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
    if (m) {
      const p1 = parseInt(m[1], 10);
      const p2 = parseInt(m[2], 10);
      const year = m[3];
      if (p1 > 12 && p2 <= 12) {
        // First part is definitely Day (>12), second is Month -> DD/MM/YYYY
        return `${year}-${String(p2).padStart(2, '0')}-${String(p1).padStart(2, '0')}`;
      } else if (p2 > 12 && p1 <= 12) {
        // Second part is definitely Day (>12), first is Month -> MM/DD/YYYY
        return `${year}-${String(p1).padStart(2, '0')}-${String(p2).padStart(2, '0')}`;
      } else {
        // Default assuming standard Thai/British DD/MM/YYYY
        return `${year}-${String(p2).padStart(2, '0')}-${String(p1).padStart(2, '0')}`;
      }
    }
    const num = parseFloat(s);
    if (!isNaN(num) && num > 10000) serial = num;
    else return null;
  }
  
  if (typeof serial === 'number' && !isNaN(serial) && serial > 0) {
    const utc_days = Math.floor(serial - 25569);
    const date_info = new Date(utc_days * 86400 * 1000);
    const year = date_info.getUTCFullYear();
    const month = String(date_info.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date_info.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  return null;
}

/**
 * Safe Day of Week Calculation (0 = Sun, 5 = Fri, 6 = Sat)
 * Uses 12:00 Noon Local Time to guarantee zero timezone offset midnight shift
 */
function getDayOfWeekSafe(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return 0;
  const parts = dateStr.split('-').map(Number);
  if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
    const dt = new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0);
    return dt.getDay();
  }
  const dt = new Date(dateStr);
  return isNaN(dt.getTime()) ? 0 : dt.getDay();
}

/**
 * Excel Time Serial (0.333333 = 08:00) to HH:mm:ss String & Total Seconds
 */
function excelSerialToTimeInfo(serialTime) {
  if (typeof serialTime === 'string') {
    if (serialTime.includes(':')) {
      const parts = serialTime.split(':').map(Number);
      const hh = parts[0] || 0;
      const mm = parts[1] || 0;
      const ss = parts[2] || 0;
      const totalSeconds = hh * 3600 + mm * 60 + ss;
      return {
        str: `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`,
        seconds: totalSeconds
      };
    }
    const num = parseFloat(serialTime);
    if (!isNaN(num)) serialTime = num;
  }
  if (typeof serialTime !== 'number' || isNaN(serialTime) || serialTime <= 0) {
    return { str: '-', seconds: 0 };
  }
  const totalSeconds = Math.round(serialTime * 86400);
  const hours = Math.floor(totalSeconds / 3600) % 24;
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return {
    str: `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`,
    seconds: totalSeconds
  };
}

/**
 * Parse Target Time in Seconds from DWS Text (e.g. "WD 08:00-17:00" -> 08:00:00 = 28800)
 */
function parseTargetSecondsFromDWS(dwsText) {
  if (!dwsText || typeof dwsText !== 'string') return null;
  // Look for pattern like 08:00 or 07:00 or 08:30
  const match = dwsText.match(/(\d{2}):(\d{2})/);
  if (match) {
    const hh = parseInt(match[1], 10);
    const mm = parseInt(match[2], 10);
    return hh * 3600 + mm * 60;
  }
  return null;
}

/**
 * Core Calculation Engine
 * Processes all rows according to HR rules (Mon-Thu 08:00, Fri/Pre-Holiday 07:00 or DWS mode)
 */
function recalculateAndRenderAll() {
  buildPreHolidaysMap();
  
  const processed = [];
  const empMap = {};
  const deptsSet = new Set();
  
  let totalOntimeDays = 0;
  let totalLateDays = 0;
  let totalPreHolidayShifts = 0;
  let minDate = '9999-99-99';
  let maxDate = '0000-00-00';

  // Process rows
  AppState.rawRecords.forEach((row, idx) => {
    // Row layout: [0:ID, 1:Name, 2:Date, 3:DWS, 4:DWS Text, 5:ClockIn, 6:ClockOut, 7:EffHrs, 8:ActHrs, 9:OT1, 10:OT1.5, 11:OT2, 12:OT3, 13:Late, ... 21:Dept]
    const empId = String(row[0] || '').trim();
    const empName = String(row[1] || 'Unknown Employee').trim();
    if (!empId || empId === '0' || !empName) return;

    const dateStr = excelSerialToDateStr(row[2]);
    if (!dateStr) return;

    if (dateStr < minDate) minDate = dateStr;
    if (dateStr > maxDate) maxDate = dateStr;

    const dwsCode = String(row[3] || '').trim();
    const dwsText = String(row[4] || '').trim();
    const clockInInfo = excelSerialToTimeInfo(row[5]);
    const clockOutInfo = excelSerialToTimeInfo(row[6]);
    const actualHours = parseFloat(row[8]) || parseFloat(row[7]) || 0;
    
    // Sum OT hours
    const ot1 = parseFloat(row[9]) || 0;
    const ot15 = parseFloat(row[10]) || 0;
    const ot2 = parseFloat(row[11]) || 0;
    const ot3 = parseFloat(row[12]) || 0;
    const totalOT = ot1 + ot15 + ot2 + ot3;

    const dept = String(row[21] || row[20] || 'Workshop').trim() || 'Workshop';
    deptsSet.add(dept);

    // Day of week check using safe noon construction
    const dayOfWeek = getDayOfWeekSafe(dateStr); // 0 = Sun, 1 = Mon, ... 5 = Fri, 6 = Sat

    // Check if Friday or Pre-holiday
    const isFriday = (dayOfWeek === 5);
    const preHolidayReason = AppState.preHolidaysMap[dateStr];
    const isPreHoliday = isFriday || !!preHolidayReason;

    // Determine target start time
    let targetSeconds = 28800; // 08:00
    let targetStr = '08:00';

    if (AppState.mode === 'workshop') {
      if (isPreHoliday) {
        targetSeconds = 25200; // 07:00
        targetStr = '07:00';
      } else {
        targetSeconds = 28800; // 08:00
        targetStr = '08:00';
      }
    } else {
      // Mode 'dws' (Office Mode)
      targetSeconds = 32400; // 09:00
      targetStr = '09:00';
    }

    if (isPreHoliday && clockInInfo.seconds > 0) {
      totalPreHolidayShifts++;
    }

    // Evaluate Late status & Food Allowance
    // Rule: If Clock-In > Target + tolerance, then Late = true & Allowance = 0!
    // Note: If Clock-In == 0 and Actual Hours == 0 (e.g. OD day off), no allowance, not late
    let isLate = false;
    let lateMinutes = 0;
    let allowance = 0;
    let statusText = AppState.lang === 'en' ? 'Day Off / No Shift' : 'วันหยุด/ไม่เข้างาน';

    if (clockInInfo.seconds > 0 || actualHours > 0) {
      const allowedCeiling = targetSeconds + AppState.lateToleranceSec;
      
      if (clockInInfo.seconds > allowedCeiling) {
        isLate = true;
        lateMinutes = Math.ceil((clockInInfo.seconds - targetSeconds) / 60);
        allowance = 0; // อดค่าข้าว 25 บาท!
        statusText = AppState.lang === 'en' ? `❌ Late ${lateMinutes}m` : `❌ สาย ${lateMinutes} นาที`;
        totalLateDays++;
      } else {
        isLate = false;
        lateMinutes = 0;
        
        if (AppState.mode === 'dws' && actualHours < 8) {
          allowance = 0; // อดค่าข้าว 25 บาท! (ทำงานไม่ครบ 8 ชม.)
          statusText = AppState.lang === 'en' ? '✅ On Time (No Allow. <8h)' : '✅ ตรงเวลา (อดค่าข้าว ชม.ไม่ครบ)';
        } else {
          allowance = 25; // ได้ค่าข้าว 25 บาท!
          statusText = AppState.lang === 'en' ? '✅ On Time (+25฿)' : '✅ ตรงเวลา (+25฿)';
        }
        totalOntimeDays++;
      }
    }

    const record = {
      empId,
      empName,
      dateStr,
      dayOfWeek,
      dayNameShort: AppState.lang === 'en' ? ENG_DAYS_SHORT[dayOfWeek] : THAI_DAYS_SHORT[dayOfWeek],
      dayNameFull: AppState.lang === 'en' ? ENG_DAYS_FULL[dayOfWeek] : THAI_DAYS_FULL[dayOfWeek],
      dwsCode,
      dwsText,
      clockInStr: clockInInfo.str,
      clockInSeconds: clockInInfo.seconds,
      clockOutStr: clockOutInfo.str,
      targetTimeStr: targetStr,
      targetSeconds,
      actualHours,
      totalOT,
      isFriday,
      isPreHoliday,
      preHolidayReason: preHolidayReason || (isFriday ? (AppState.lang === 'en' ? 'Friday Shift (07:00)' : 'กะวันศุกร์ (เข้า 07:00)') : ''),
      isLate,
      lateMinutes,
      allowance,
      statusText,
      dept
    };

    processed.push(record);

    // Aggregate by employee
    if (!empMap[empId]) {
      empMap[empId] = {
        empId,
        empName,
        dept,
        totalDaysWorked: 0,
        ontimeDays: 0,
        lateDays: 0,
        preHolidayShifts: 0,
        totalAllowance: 0,
        totalActualHours: 0,
        totalOTHours: 0,
        records: []
      };
    }

    if (clockInInfo.seconds > 0 || actualHours > 0) {
      empMap[empId].totalDaysWorked++;
      if (isLate) empMap[empId].lateDays++;
      else empMap[empId].ontimeDays++;
      if (isPreHoliday) empMap[empId].preHolidayShifts++;
      empMap[empId].totalAllowance += allowance;
      empMap[empId].totalActualHours += actualHours;
      empMap[empId].totalOTHours += totalOT;
    }
    empMap[empId].records.push(record);
  });

  AppState.processedRecords = processed;
  AppState.employeeSummary = empMap;

  // Populate Department filter options
  const deptSelect = document.getElementById('summary-dept-filter');
  const dailyDeptSelect = document.getElementById('daily-dept-filter');
  const currentDeptVal = deptSelect.value;
  const currentDailyDeptVal = dailyDeptSelect ? dailyDeptSelect.value : 'all';
  
  deptSelect.innerHTML = `<option value="all">🏢 ทุกแผนก (All Departments)</option>`;
  if (dailyDeptSelect) {
    dailyDeptSelect.innerHTML = `<option value="all">🏢 ทุกแผนก (All Departments)</option>`;
  }
  
  [...deptsSet].sort().forEach(d => {
    deptSelect.innerHTML += `<option value="${d}" ${d === currentDeptVal ? 'selected' : ''}>${d}</option>`;
    if (dailyDeptSelect) {
      dailyDeptSelect.innerHTML += `<option value="${d}" ${d === currentDailyDeptVal ? 'selected' : ''}>${d}</option>`;
    }
  });

  // Update KPI Cards
  const totalEmps = Object.keys(empMap).length;
  const totalAllowanceSum = Object.values(empMap).reduce((sum, e) => sum + e.totalAllowance, 0);
  const totalWorkedShifts = totalOntimeDays + totalLateDays;
  const ontimeRate = totalWorkedShifts > 0 ? Math.round((totalOntimeDays / totalWorkedShifts) * 100) : 0;

  document.getElementById('nav-total-records').textContent = `${processed.length.toLocaleString()} รายการ (${totalEmps} คน)`;
  document.getElementById('kpi-total-emps').innerHTML = `${totalEmps} <span class="kpi-unit">คน</span>`;
  document.getElementById('kpi-total-records').innerHTML = `${processed.length.toLocaleString()} <span class="kpi-unit">รายการ</span>`;
  document.getElementById('kpi-date-range').textContent = `${minDate} ถึง ${maxDate}`;
  document.getElementById('print-date-range').textContent = `${minDate} ถึง ${maxDate}`;
  
  document.getElementById('kpi-total-allowance').innerHTML = `${totalAllowanceSum.toLocaleString()} <span class="kpi-unit">฿</span>`;
  document.getElementById('kpi-ontime-days').textContent = totalOntimeDays.toLocaleString();
  
  document.getElementById('kpi-ontime-rate').innerHTML = `${ontimeRate}% <span class="kpi-unit">ตรงเวลา</span>`;
  document.getElementById('kpi-progress-bar').style.width = `${ontimeRate}%`;
  document.getElementById('kpi-late-count-sub').textContent = `สายรวม ${totalLateDays.toLocaleString()} ครั้ง`;
  
  document.getElementById('kpi-preholiday-count').innerHTML = `${totalPreHolidayShifts.toLocaleString()} <span class="kpi-unit">รายการ</span>`;

  document.getElementById('tab-emp-count').textContent = totalEmps;
  document.getElementById('tab-daily-count').textContent = processed.length > 999 ? (processed.length / 1000).toFixed(1) + 'k' : processed.length;

  // Render current tab tables
  renderSummaryTable();
  renderDailyTable();
  if (AppState.currentTab === 'tab-insights') {
    renderInsightsTab();
  }
}

/**
 * Render Employee Summary Table (Tab 1)
 */
function renderSummaryTable() {
  const tbody = document.getElementById('summary-tbody');
  const search = document.getElementById('summary-search-input').value.trim().toLowerCase();
  const deptFilter = document.getElementById('summary-dept-filter').value;
  const sortBy = document.getElementById('summary-sort-select').value;

  let emps = Object.values(AppState.employeeSummary);

  // Filter
  if (deptFilter !== 'all') {
    emps = emps.filter(e => e.dept === deptFilter);
  }
  if (search) {
    emps = emps.filter(e => e.empId.toLowerCase().includes(search) || e.empName.toLowerCase().includes(search));
  }

  // Sort
  if (sortBy === 'id-asc') {
    emps.sort((a, b) => parseInt(a.empId, 10) - parseInt(b.empId, 10));
  } else if (sortBy === 'allowance-desc') {
    emps.sort((a, b) => b.totalAllowance - a.totalAllowance);
  } else if (sortBy === 'late-desc') {
    emps.sort((a, b) => b.lateDays - a.lateDays);
  } else if (sortBy === 'name-asc') {
    emps.sort((a, b) => a.empName.localeCompare(b.empName));
  }

  if (emps.length === 0) {
    tbody.innerHTML = `<tr><td colspan="11" class="text-center py-4">🔍 ไม่พบข้อมูลพนักงานที่ค้นหา</td></tr>`;
    return;
  }

  const html = emps.map(emp => `
    <tr>
      <td><strong>${emp.empId}</strong></td>
      <td>
        <span class="font-medium">${emp.empName}</span>
      </td>
      <td><span class="badge badge-secondary">${emp.dept}</span></td>
      <td class="text-center">${emp.totalDaysWorked}</td>
      <td class="text-center text-success font-semibold">${emp.ontimeDays}</td>
      <td class="text-center ${emp.lateDays > 0 ? 'text-danger font-bold' : 'text-muted'}">${emp.lateDays}</td>
      <td class="text-center"><span class="badge badge-accent">${emp.preHolidayShifts}</span></td>
      <td class="text-right highlight-col">${emp.totalAllowance.toLocaleString()} ฿</td>
      <td class="text-center">${emp.totalActualHours.toFixed(1)}</td>
      <td class="text-center">${emp.totalOTHours.toFixed(1)}</td>
      <td class="text-center">
        <button class="btn btn-outline btn-xs" onclick="openEmployeeModal('${emp.empId}')">${AppState.lang === 'en' ? '🔍 View History' : '🔍 ดูประวัติรายวัน'}</button>
      </td>
    </tr>
  `).join('');

  tbody.innerHTML = html;
}

/**
 * Render Daily Logs Table with Pagination (Tab 2)
 */
function renderDailyTable() {
  const tbody = document.getElementById('daily-tbody');
  const search = document.getElementById('daily-search-input').value.trim().toLowerCase();
  const monthFilter = document.getElementById('daily-month-filter').value;
  const deptFilter = document.getElementById('daily-dept-filter') ? document.getElementById('daily-dept-filter').value : 'all';
  const statusFilter = document.getElementById('daily-status-filter').value;

  let records = AppState.processedRecords;

  // Filters
  if (monthFilter !== 'all') {
    const targetMonthStr = `-${String(monthFilter).padStart(2, '0')}-`;
    records = records.filter(r => r.dateStr.includes(targetMonthStr));
  }
  
  if (deptFilter !== 'all') {
    records = records.filter(r => r.dept === deptFilter);
  }

  if (statusFilter === 'ontime') {
    records = records.filter(r => (r.clockInSeconds > 0 || r.actualHours > 0) && !r.isLate);
  } else if (statusFilter === 'late') {
    records = records.filter(r => r.isLate);
  } else if (statusFilter === 'preholiday') {
    records = records.filter(r => r.isPreHoliday);
  } else if (statusFilter === 'ot') {
    records = records.filter(r => r.totalOT > 0);
  }

  if (search) {
    records = records.filter(r => 
      r.empId.toLowerCase().includes(search) || 
      r.empName.toLowerCase().includes(search) || 
      r.dateStr.includes(search) ||
      r.dwsText.toLowerCase().includes(search)
    );
  }

  // Pagination
  const totalItems = records.length;
  const totalPages = Math.ceil(totalItems / AppState.dailyPerPage) || 1;
  if (AppState.dailyPage > totalPages) AppState.dailyPage = totalPages;
  
  const startIdx = (AppState.dailyPage - 1) * AppState.dailyPerPage;
  const pageRecords = records.slice(startIdx, startIdx + AppState.dailyPerPage);

  const endCount = Math.min(startIdx + AppState.dailyPerPage, totalItems);
  document.getElementById('daily-filter-stats').textContent = AppState.lang === 'en'
    ? `Showing: ${startIdx + 1} - ${endCount} of ${totalItems.toLocaleString()} records`
    : `แสดงผล: ${startIdx + 1} - ${endCount} จากทั้งหมด ${totalItems.toLocaleString()} รายการ`;
  renderPaginationControls(totalPages);

  if (pageRecords.length === 0) {
    tbody.innerHTML = `<tr><td colspan="13" class="text-center py-4">🔍 ${AppState.lang === 'en' ? 'No attendance records match the filters' : 'ไม่พบรายการเข้า-ออกงานที่ตรงกับเงื่อนไข'}</td></tr>`;
    return;
  }

  const html = pageRecords.map(r => {
    let statusClass = 'badge-secondary';
    if (r.isLate) statusClass = 'badge-danger';
    else if (r.clockInSeconds > 0 || r.actualHours > 0) statusClass = 'badge-success';

    let allowanceHtml = `<span class="text-muted">-</span>`;
    if (r.allowance === 25) allowanceHtml = `<strong class="text-success">+25 ฿</strong>`;
    else if (r.isLate) allowanceHtml = `<span class="badge badge-danger">อดค่าข้าว 0฿</span>`;

    return `
      <tr>
        <td><strong>${r.dateStr}</strong></td>
        <td><span class="badge ${r.isFriday ? 'badge-accent' : 'badge-secondary'}">${r.dayNameShort}</span></td>
        <td>${r.empId}</td>
        <td>${r.empName}</td>
        <td><span class="badge badge-secondary">${r.dept}</span></td>
        <td>
          <span title="${r.dwsText}">${r.dwsText}</span>
          ${r.isPreHoliday ? `<span class="badge badge-accent mt-1" title="${r.preHolidayReason}">🌟 Pre-Holiday 07:00</span>` : ''}
        </td>
        <td class="font-mono font-bold ${r.isLate ? 'text-danger' : 'text-success'}">${r.clockInStr}</td>
        <td class="font-mono text-secondary">${r.targetTimeStr}</td>
        <td class="font-mono">${r.clockOutStr}</td>
        <td class="text-center">${r.actualHours.toFixed(1)}</td>
        <td class="text-center ${r.totalOT > 0 ? 'text-accent font-bold' : 'text-muted'}">${r.totalOT > 0 ? '+' + r.totalOT.toFixed(1) : '-'}</td>
        <td class="text-center"><span class="badge ${statusClass}">${r.statusText}</span></td>
        <td class="text-center highlight-col">${allowanceHtml}</td>
      </tr>
    `;
  }).join('');

  tbody.innerHTML = html;
}

/**
 * Render Pagination Controls
 */
function renderPaginationControls(totalPages) {
  const container = document.getElementById('daily-pagination');
  if (totalPages <= 1) {
    container.innerHTML = '';
    return;
  }

  let pages = [];
  const cur = AppState.dailyPage;

  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    if (cur <= 3) pages = [1, 2, 3, 4, '...', totalPages];
    else if (cur >= totalPages - 2) pages = [1, '...', totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
    else pages = [1, '...', cur - 1, cur, cur + 1, '...', totalPages];
  }

  let html = `<button class="page-btn" onclick="goToDailyPage(${Math.max(1, cur - 1)})" ${cur === 1 ? 'disabled' : ''}>◀ ก่อนหน้า</button>`;
  pages.forEach(p => {
    if (p === '...') html += `<span class="page-btn disabled">...</span>`;
    else html += `<button class="page-btn ${p === cur ? 'active' : ''}" onclick="goToDailyPage(${p})">${p}</button>`;
  });
  html += `<button class="page-btn" onclick="goToDailyPage(${Math.min(totalPages, cur + 1)})" ${cur === totalPages ? 'disabled' : ''}>ถัดไป ▶</button>`;

  container.innerHTML = html;
}

function goToDailyPage(page) {
  AppState.dailyPage = page;
  renderDailyTable();
}

/**
 * Render Holiday Manager Table (Tab 3)
 */
function renderHolidaysTable(filterType = 'all') {
  const tbody = document.getElementById('holidays-tbody');
  let list = AppState.holidays;

  if (filterType === 'official') list = list.filter(h => h.type === 'official');
  else if (filterType === 'preholiday') list = list.filter(h => h.type === 'preholiday');

  document.getElementById('total-holiday-badge').textContent = AppState.lang === 'en' ? `Total ${list.length} Days` : `รวม ${list.length} วัน`;

  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="text-center py-4">${AppState.lang === 'en' ? 'No holiday records found matching filter' : 'ไม่พบรายการวันหยุดที่ตรงกับตัวกรอง'}</td></tr>`;
    return;
  }

  // Sort by date ascending
  const sorted = [...list].sort((a, b) => a.date.localeCompare(b.date));

  const html = sorted.map((h, i) => {
    const isPre = h.type === 'preholiday';
    const dtObj = new Date(h.date);
    const dayName = AppState.lang === 'en' ? ENG_DAYS_FULL[dtObj.getDay()] : THAI_DAYS_FULL[dtObj.getDay()];

    return `
      <tr>
        <td><strong>${h.date}</strong> <span class="text-secondary">(${dayName})</span></td>
        <td><span class="badge ${isPre ? 'badge-accent' : 'badge-primary'}">${isPre ? (AppState.lang === 'en' ? '🌟 Pre-Holiday' : '🌟 วันก่อนหยุด') : (AppState.lang === 'en' ? '🎉 Official Holiday' : '🎉 วันหยุดราชการ')}</span></td>
        <td>${h.name}</td>
        <td class="font-mono ${isPre ? 'text-accent font-bold' : 'text-muted'}">${isPre ? (AppState.lang === 'en' ? '07:00 - 16:00 Target' : '07:00 - 16:00 น.') : (AppState.lang === 'en' ? 'Company Closed' : 'หยุดบริษัท')}</td>
        <td class="text-center">
          <button class="btn btn-text btn-xs text-danger" onclick="deleteHoliday('${h.date}', '${h.type}')" title="ลบรายการนี้">${AppState.lang === 'en' ? '🗑️ Delete' : '🗑️ ลบ'}</button>
        </td>
      </tr>
    `;
  }).join('');

  tbody.innerHTML = html;
}

async function deleteHoliday(dateStr, type) {
  AppState.holidays = AppState.holidays.filter(h => !(h.date === dateStr && h.type === type));
  await saveHolidaysToServer();
  recalculateAndRenderAll();
}

/**
 * Render Insights & Analytics (Tab 4)
 */
function renderInsightsTab() {
  const emps = Object.values(AppState.employeeSummary).filter(e => e.totalDaysWorked > 0);

  // Top 10 Ontime
  const topOntime = [...emps].sort((a, b) => {
    const rateA = a.ontimeDays / a.totalDaysWorked;
    const rateB = b.ontimeDays / b.totalDaysWorked;
    if (rateB !== rateA) return rateB - rateA;
    return b.ontimeDays - a.ontimeDays;
  }).slice(0, 10);

  const dayUnit = AppState.lang === 'en' ? 'Days' : 'วัน';
  document.getElementById('top-ontime-tbody').innerHTML = topOntime.map((e, idx) => {
    const rate = Math.round((e.ontimeDays / e.totalDaysWorked) * 100);
    let medal = `${idx + 1}.`;
    if (idx === 0) medal = '🥇';
    else if (idx === 1) medal = '🥈';
    else if (idx === 2) medal = '🥉';

    return `
      <tr>
        <td class="font-bold">${medal}</td>
        <td><strong>${e.empName}</strong> <span class="text-muted">(${e.empId})</span></td>
        <td class="text-center text-success font-semibold">${e.ontimeDays} ${dayUnit}</td>
        <td class="text-center"><span class="badge badge-success">${rate}%</span></td>
        <td class="text-right font-bold text-accent">${e.totalAllowance.toLocaleString()} ฿</td>
      </tr>
    `;
  }).join('');

  // Top 10 Late
  const topLate = [...emps].filter(e => e.lateDays > 0).sort((a, b) => b.lateDays - a.lateDays).slice(0, 10);

  document.getElementById('top-late-tbody').innerHTML = topLate.length > 0 ? topLate.map((e, idx) => {
    const rate = Math.round((e.lateDays / e.totalDaysWorked) * 100);
    const lostAllowance = e.lateDays * 25;
    return `
      <tr>
        <td class="font-bold text-danger">${idx + 1}.</td>
        <td><strong>${e.empName}</strong> <span class="text-muted">(${e.empId})</span></td>
        <td class="text-center text-danger font-bold">${e.lateDays} ${dayUnit}</td>
        <td class="text-center"><span class="badge badge-danger">${rate}%</span></td>
        <td class="text-right font-bold text-danger">-${lostAllowance.toLocaleString()} ฿</td>
      </tr>
    `;
  }).join('') : `<tr><td colspan="5" class="text-center text-success py-3">${AppState.lang === 'en' ? '🎉 No employees were late in this period!' : '🎉 ไม่มีพนักงานมาสายในรอบข้อมูลนี้'}</td></tr>`;

  // Day of week late stats
  const dowLateCounts = [0, 0, 0, 0, 0, 0, 0];
  const dowTotalCounts = [0, 0, 0, 0, 0, 0, 0];

  AppState.processedRecords.forEach(r => {
    if (r.clockInSeconds > 0 || r.actualHours > 0) {
      dowTotalCounts[r.dayOfWeek]++;
      if (r.isLate) dowLateCounts[r.dayOfWeek]++;
    }
  });

  const maxLate = Math.max(1, ...dowLateCounts);
  const chartContainer = document.getElementById('dow-chart');
  
  // Render Mon (1) to Fri (5), plus Sat(6), Sun(0)
  const displayDays = [1, 2, 3, 4, 5, 6, 0];
  chartContainer.innerHTML = displayDays.map(d => {
    const lates = dowLateCounts[d];
    const totals = dowTotalCounts[d];
    const pct = totals > 0 ? Math.round((lates / totals) * 100) : 0;
    const barHeight = Math.round((lates / maxLate) * 140) + 10;
    const label = AppState.lang === 'en' ? ENG_DAYS_FULL[d] : THAI_DAYS_FULL[d];
    const lateWord = AppState.lang === 'en' ? 'Late' : 'สาย';

    return `
      <div class="dow-bar-col">
        <span class="dow-value" title="${lates} (${pct}%)">${lates} ${lateWord}</span>
        <div class="dow-bar-wrap">
          <div class="dow-bar-inner" style="height: ${barHeight}px;"></div>
        </div>
        <span class="dow-label">${label}</span>
      </div>
    `;
  }).join('');
}

/**
 * Open Employee Detailed Daily Modal
 */
function openEmployeeModal(empId) {
  const emp = AppState.employeeSummary[empId];
  if (!emp) return;

  AppState.selectedEmployeeForModal = emp;

  document.getElementById('modal-emp-title').textContent = AppState.lang === 'en' ? `👤 Attendance History : ${emp.empName}` : `👤 ประวัติเวลาเข้า-ออกงาน : ${emp.empName}`;
  document.getElementById('modal-emp-sub').textContent = AppState.lang === 'en' ? `Employee ID: ${emp.empId} | Dept: ${emp.dept}` : `รหัสพนักงาน: ${emp.empId} | แผนก: ${emp.dept}`;

  const dayUnit = AppState.lang === 'en' ? 'Days' : 'วัน';
  document.getElementById('m-stat-total').textContent = `${emp.totalDaysWorked} ${dayUnit}`;
  document.getElementById('m-stat-ontime').textContent = `${emp.ontimeDays} ${dayUnit}`;
  document.getElementById('m-stat-late').textContent = `${emp.lateDays} ${dayUnit}`;
  document.getElementById('m-stat-allowance').textContent = `${emp.totalAllowance.toLocaleString()} ฿`;

  // Sort employee records by date descending
  const sortedRecords = [...emp.records].sort((a, b) => b.dateStr.localeCompare(a.dateStr));

  const tbody = document.getElementById('modal-tbody');
  tbody.innerHTML = sortedRecords.map(r => {
    let statusClass = 'badge-secondary';
    if (r.isLate) statusClass = 'badge-danger';
    else if (r.clockInSeconds > 0 || r.actualHours > 0) statusClass = 'badge-success';

    let allowanceText = '-';
    if (r.allowance === 25) allowanceText = `<strong class="text-success">+25 ฿</strong>`;
    else if (r.isLate) allowanceText = `<span class="badge badge-danger">${AppState.lang === 'en' ? '0 ฿ (Late)' : '0 ฿ (สาย)'}</span>`;

    return `
      <tr>
        <td><strong>${r.dateStr}</strong></td>
        <td><span class="badge ${r.isFriday ? 'badge-accent' : 'badge-secondary'}">${r.dayNameShort}</span></td>
        <td>
          ${r.dwsText}
          ${r.isPreHoliday ? `<span class="badge badge-accent mt-1">Pre-Holiday 07:00</span>` : ''}
        </td>
        <td class="font-mono font-bold ${r.isLate ? 'text-danger' : 'text-success'}">${r.clockInStr}</td>
        <td class="font-mono text-secondary">${r.targetTimeStr}</td>
        <td class="font-mono">${r.clockOutStr}</td>
        <td class="text-center">${r.actualHours.toFixed(1)} / ${r.totalOT > 0 ? '+' + r.totalOT.toFixed(1) : '-'}</td>
        <td class="text-center"><span class="badge ${statusClass}">${r.statusText}</span></td>
        <td class="text-right highlight-col">${allowanceText}</td>
      </tr>
    `;
  }).join('');

  document.getElementById('emp-modal-backdrop').classList.add('open');
}

function closeModal() {
  document.getElementById('emp-modal-backdrop').classList.remove('open');
  AppState.selectedEmployeeForModal = null;
}

/**
 * Print / PDF Summary View Trigger
 */
function triggerPrintSummary() {
  const tbody = document.getElementById('print-tbody');
  const emps = Object.values(AppState.employeeSummary).sort((a, b) => parseInt(a.empId, 10) - parseInt(b.empId, 10));

  tbody.innerHTML = emps.map((e, idx) => `
    <tr>
      <td class="text-center">${idx + 1}</td>
      <td><strong>${e.empId}</strong></td>
      <td>${e.empName}</td>
      <td>${e.dept}</td>
      <td class="text-center">${e.totalDaysWorked}</td>
      <td class="text-center">${e.ontimeDays}</td>
      <td class="text-center">${e.lateDays}</td>
      <td class="text-right font-bold">${e.totalAllowance.toLocaleString()} ฿</td>
      <td></td>
    </tr>
  `).join('');

  window.print();
}

/**
 * Export Employee Summary to Excel (.xlsx) using SheetJS
 */
function exportSummaryXLSX() {
  const emps = Object.values(AppState.employeeSummary).sort((a, b) => parseInt(a.empId, 10) - parseInt(b.empId, 10));
  
  const data = emps.map(e => ({
    'รหัสพนักงาน (ID)': e.empId,
    'ชื่อ-นามสกุล (Name)': e.empName,
    'แผนก (Department)': e.dept,
    'วันทำงานรวม (Worked Days)': e.totalDaysWorked,
    'ตรงเวลา (On-time Days)': e.ontimeDays,
    'มาสาย (Late Days)': e.lateDays,
    'กะ 07:00 (Fri/Pre-Holiday Days)': e.preHolidayShifts,
    'ยอดเบิกค่าข้าววันละ 25 บาท (Food Allowance Baht)': e.totalAllowance,
    'ชั่วโมงทำงานจริงรวม (Total Actual Hours)': e.totalActualHours,
    'ชั่วโมง OT รวม (Total OT Hours)': e.totalOTHours
  }));

  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Summary Allowance');
  XLSX.writeFile(workbook, `HR_Workshop_Allowance_Summary_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

/**
 * Export Detailed Daily Logs to Excel (.xlsx) using SheetJS
 */
function exportDailyXLSX() {
  const records = AppState.processedRecords.map(r => ({
    'วันที่ (Date)': r.dateStr,
    'วัน (Day)': r.dayNameFull,
    'รหัสพนักงาน (ID)': r.empId,
    'ชื่อ-นามสกุล (Name)': r.empName,
    'แผนก (Dept)': r.dept,
    'กะงาน (DWS)': r.dwsText,
    'เป็นวันศุกร์หรือก่อนหยุด (Pre-Holiday 07:00)': r.isPreHoliday ? 'ใช่ (07:00)' : 'ไม่ใช่ (08:00)',
    'เวลาเข้าจริง (Clock-In)': r.clockInStr,
    'เวลาเป้าหมาย (Target Time)': r.targetTimeStr,
    'เวลาออกจริง (Clock-Out)': r.clockOutStr,
    'ชั่วโมงทำงาน (Actual Hours)': r.actualHours,
    'OT รวม (OT Hours)': r.totalOT,
    'สถานะสาย (Late Status)': r.isLate ? `สาย ${r.lateMinutes} นาที` : 'ตรงเวลา',
    'ค่าข้าวที่ได้รับ 25฿ (Allowance Baht)': r.allowance
  }));

  const worksheet = XLSX.utils.json_to_sheet(records);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Daily Attendance Logs');
  XLSX.writeFile(workbook, `HR_Workshop_Daily_Logs_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

/**
 * Export Summary to CSV
 */
function exportSummaryCSV() {
  const emps = Object.values(AppState.employeeSummary).sort((a, b) => parseInt(a.empId, 10) - parseInt(b.empId, 10));
  let csv = '\uFEFFรหัสพนักงาน,ชื่อ-นามสกุล,แผนก,วันทำงานรวม,ตรงเวลา,มาสาย,ยอดเบิกค่าข้าว(บาท),ชั่วโมงทำงานรวม,OTรวม\n';
  
  emps.forEach(e => {
    csv += `"${e.empId}","${e.empName}","${e.dept}",${e.totalDaysWorked},${e.ontimeDays},${e.lateDays},${e.totalAllowance},${e.totalActualHours.toFixed(1)},${e.totalOTHours.toFixed(1)}\n`;
  });

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `HR_Allowance_Summary_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Export Individual Employee Modal records to Excel
 */
function exportEmployeeModalXLSX(emp) {
  const records = emp.records.map(r => ({
    'วันที่': r.dateStr,
    'วันในสัปดาห์': r.dayNameFull,
    'กะงาน': r.dwsText,
    'Pre-Holiday/เข้า 07:00': r.isPreHoliday ? 'ใช่' : 'ไม่ใช่',
    'เข้าจริง': r.clockInStr,
    'เป้าหมาย': r.targetTimeStr,
    'ออกจริง': r.clockOutStr,
    'ชั่วโมงทำงาน': r.actualHours,
    'OT': r.totalOT,
    'สถานะ': r.statusText,
    'ค่าข้าว 25฿': r.allowance
  }));

  const worksheet = XLSX.utils.json_to_sheet(records);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, `Emp_${emp.empId}`);
  XLSX.writeFile(workbook, `Emp_${emp.empId}_Attendance_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

// Expose global modal functions for onclick attributes
window.openEmployeeModal = openEmployeeModal;
window.deleteHoliday = deleteHoliday;
window.goToDailyPage = goToDailyPage;
