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
  shiftMasterMap: {}, // 'EmpID_YYYY-MM-DD': master shift schedule from Data/shipt
  deptRuleMap: JSON.parse(localStorage.getItem('hr_time_dept_rules_v1') || '{}'), // { deptName: mode }
  empRuleMap: JSON.parse(localStorage.getItem('hr_time_emp_rules_v1') || '{}'),   // { empId: mode }
  mode: 'workshop',   // 'workshop' | 'dws'
  lateToleranceSec: 60, // 60 seconds = 1 minute
  currentTab: 'tab-summary',
  dailyPage: 1,
  dailyPerPage: 100,
  selectedEmployeeForModal: null,
  currentFileName: 'Clock in and out_01.01.26 to 30.06.26.xlsx',
  lang: localStorage.getItem('hr_time_lang') || 'th',
  overrides: JSON.parse(localStorage.getItem('hr_time_overrides_v1') || '{}'),
  disputeFilter: { dept: '', type: '', search: '' }
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
  await loadShiftMasterMap();
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
      } else if (targetTab === 'tab-dispute') {
        renderDisputeTab();
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
      } else if (AppState.mode === 'night') {
        badge.textContent = AppState.lang === 'en' ? 'Night/Shift Mode (15:30, 16:30)' : '🌙 โหมดกะบ่าย/กะดึก (15:30, 16:30)';
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
        } else if (AppState.mode === 'night') {
          hintSpan.textContent = AppState.lang === 'en'
            ? `2 Night Shifts Auto-Detected (15:30-00:30 & 16:30-01:30) (+${min}m tolerance)`
            : `ตรวจจับอัตโนมัติ 2 กะกลางคืน (15:30 ออก 00:30, 16:30 ออก 01:30) ผ่อนผัน ${min} นาที`;
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
        } else if (AppState.mode === 'night') {
          hintSpan.textContent = AppState.lang === 'en'
            ? `2 Night Shifts Auto-Detected (15:30-00:30 & 16:30-01:30) (+${min}m tolerance)`
            : `ตรวจจับอัตโนมัติ 2 กะกลางคืน (15:30 ออก 00:30, 16:30 ออก 01:30) ผ่อนผัน ${min} นาที`;
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

  const shiftFileInput = document.getElementById('shift-file-input');
  const btnShiftTrigger = document.getElementById('btn-trigger-shift-upload');
  if (btnShiftTrigger && shiftFileInput) {
    btnShiftTrigger.addEventListener('click', (e) => {
      e.stopPropagation();
      shiftFileInput.click();
    });
    shiftFileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length > 0) {
        handleShiftFileUpload(e.target.files[0]);
      }
    });
  }

  // Reload Default Button
  document.getElementById('btn-reload-default').addEventListener('click', async () => {
    await loadDefaultExcel();
  });

  // Clear Database Button
  const btnClearDb = document.getElementById('btn-clear-database');
  if (btnClearDb) {
    btnClearDb.addEventListener('click', async () => {
      await clearAllDatabase();
    });
  }

  // Summary Filters
  document.getElementById('summary-search-input').addEventListener('input', renderSummaryTable);
  document.getElementById('summary-dept-filter').addEventListener('change', (e) => { e.target.dataset.userFiltered = 'true'; renderSummaryTable(); });
  document.getElementById('summary-sort-select').addEventListener('change', renderSummaryTable);

  // Daily Filters
  document.getElementById('daily-search-input').addEventListener('input', () => { AppState.dailyPage = 1; renderDailyTable(); });
  document.getElementById('daily-month-filter').addEventListener('change', () => { AppState.dailyPage = 1; renderDailyTable(); });
  document.getElementById('daily-dept-filter').addEventListener('change', (e) => { e.target.dataset.userFiltered = 'true'; AppState.dailyPage = 1; renderDailyTable(); });
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
  const exportDisputeEl = document.getElementById('export-dispute-xlsx');
  if (exportDisputeEl) {
    exportDisputeEl.addEventListener('click', (e) => {
      e.preventDefault();
      exportDisputeXLSX();
    });
  }
  document.getElementById('export-summary-csv').addEventListener('click', (e) => {
    e.preventDefault();
    exportSummaryCSV();
  });
  document.getElementById('btn-export-emp-modal').addEventListener('click', () => {
    if (AppState.selectedEmployeeForModal) {
      exportEmployeeModalXLSX(AppState.selectedEmployeeForModal);
    }
  });

  setupCustomRulesEventListeners();
  updateCustomRulesBadge();
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
    } else if (AppState.mode === 'night') {
      badge.textContent = isEn ? 'Night/Shift Mode (15:30, 16:30)' : '🌙 โหมดกะบ่าย/กะดึก (15:30, 16:30)';
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
  const clearDbBtn = document.getElementById('btn-clear-database');
  if (reloadBtn) reloadBtn.textContent = isEn ? '🔄 Reload Backup File' : '🔄 โหลดไฟล์สำรองเริ่มต้น';
  if (clearDbBtn) clearDbBtn.textContent = isEn ? '🗑️ Clear All Database' : '🗑️ ล้างฐานข้อมูลทั้งหมด';

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
  if (modeTitles[2]) modeTitles[2].textContent = isEn ? '🌙 Night & Auto-Shift Mode' : '🌙 โหมดกะบ่าย/กะดึก (Night & Auto Shift)';
  if (modeDescs[2]) modeDescs[2].textContent = isEn ? 'Supports 2 Night Shifts (15:30-00:30 & 16:30-01:30)' : 'รองรับ 2 กะกลางคืน (15:30 ออก 00:30 และ 16:30 ออก 01:30)';

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
  if (sumThs.length >= 12) {
    const enSum = ['ID', 'Employee Name', 'Department', 'Worked Days', 'On Time (Days)', 'Late (Days)', '07:00 Shift (Fri/Pre)', 'Leave (Days)', 'Total Allowance (฿)', 'Actual Hrs', 'Total OT', 'Actions'];
    const thSum = ['รหัส', 'ชื่อ-นามสกุลพนักงาน', 'แผนก', 'วันทำงานรวม', 'ตรงเวลา (วัน)', 'มาสาย (วัน)', 'กะ 07:00 (ศ/ก่อนหยุด)', 'สรุปการลา', 'ค่าข้าวยอดรวม (฿)', 'ชม. ทำงานจริง', 'ชม. OT', 'จัดการ'];
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
 * Setup Custom Rules (Per-Department / Per-Employee) Event Listeners
 */
function setupCustomRulesEventListeners() {
  const btnOpen = document.getElementById('btn-open-custom-rules');
  const btnCloseTop = document.getElementById('btn-close-custom-rules');
  const btnCloseBottom = document.getElementById('btn-close-custom-rules-bottom');
  const modal = document.getElementById('modal-custom-rules');

  if (btnOpen) {
    btnOpen.addEventListener('click', openCustomRulesModal);
  }
  if (btnCloseTop && modal) {
    btnCloseTop.addEventListener('click', () => modal.classList.add('hidden'));
  }
  if (btnCloseBottom && modal) {
    btnCloseBottom.addEventListener('click', () => {
      modal.classList.add('hidden');
      recalculateAndRenderAll();
    });
  }

  // Tabs
  const tabDeptBtn = document.getElementById('tab-btn-dept-rules');
  const tabEmpBtn = document.getElementById('tab-btn-emp-rules');
  const contentDept = document.getElementById('tab-content-dept-rules');
  const contentEmp = document.getElementById('tab-content-emp-rules');

  if (tabDeptBtn && tabEmpBtn) {
    tabDeptBtn.addEventListener('click', () => {
      tabDeptBtn.style.background = 'var(--primary-color)';
      tabDeptBtn.style.color = '#fff';
      tabDeptBtn.style.border = 'none';
      tabEmpBtn.style.background = 'var(--bg-card)';
      tabEmpBtn.style.color = 'var(--text-main)';
      tabEmpBtn.style.border = '1px solid var(--border-color)';
      if (contentDept) { contentDept.classList.remove('hidden'); contentDept.style.display = 'block'; }
      if (contentEmp) { contentEmp.classList.add('hidden'); contentEmp.style.display = 'none'; }
    });
    tabEmpBtn.addEventListener('click', () => {
      tabEmpBtn.style.background = 'var(--primary-color)';
      tabEmpBtn.style.color = '#fff';
      tabEmpBtn.style.border = 'none';
      tabDeptBtn.style.background = 'var(--bg-card)';
      tabDeptBtn.style.color = 'var(--text-main)';
      tabDeptBtn.style.border = '1px solid var(--border-color)';
      if (contentEmp) { contentEmp.classList.remove('hidden'); contentEmp.style.display = 'block'; }
      if (contentDept) { contentDept.classList.add('hidden'); contentDept.style.display = 'none'; }
    });
  }

  // Add Employee Override Button
  const btnAddEmp = document.getElementById('btn-add-emp-rule');
  if (btnAddEmp) {
    btnAddEmp.addEventListener('click', () => {
      const input = document.getElementById('input-emp-rule-id');
      const select = document.getElementById('select-emp-rule-mode');
      if (!input || !select) return;
      const empIdOrName = input.value.trim();
      if (!empIdOrName) {
        alert(AppState.lang === 'en' ? 'Please enter Employee ID or Name' : 'กรุณาระบุรหัสพนักงาน หรือชื่อพนักงาน');
        return;
      }
      
      let matchedId = null;
      const firstToken = empIdOrName.split(/\s+/)[0];
      if (AppState.employeeSummary[firstToken]) {
        matchedId = firstToken;
      } else if (AppState.employeeSummary[empIdOrName]) {
        matchedId = empIdOrName;
      } else {
        const query = empIdOrName.toLowerCase();
        for (const [id, summary] of Object.entries(AppState.employeeSummary)) {
          const eName = (summary.empName || summary.name || '').toLowerCase();
          if (id.toLowerCase() === query || eName.includes(query) || query.includes(id.toLowerCase()) || (eName && query.includes(eName))) {
            matchedId = id;
            break;
          }
        }
      }
      if (!matchedId) matchedId = firstToken || empIdOrName;

      AppState.empRuleMap[matchedId] = select.value;
      localStorage.setItem('hr_time_emp_rules_v1', JSON.stringify(AppState.empRuleMap));
      input.value = '';
      renderEmpRulesTable();
      updateCustomRulesBadge();
      recalculateAndRenderAll();
    });
  }

  // Reset All Rules Button
  const btnResetAll = document.getElementById('btn-reset-all-rules');
  if (btnResetAll) {
    btnResetAll.addEventListener('click', () => {
      if (confirm(AppState.lang === 'en' ? 'Reset all custom department and employee rules to global default?' : 'ต้องการล้างเกณฑ์พิเศษที่ตั้งไว้ทั้งหมด (กลับไปใช้โหมดหลัก) ใช่หรือไม่?')) {
        AppState.deptRuleMap = {};
        AppState.empRuleMap = {};
        localStorage.removeItem('hr_time_dept_rules_v1');
        localStorage.removeItem('hr_time_emp_rules_v1');
        renderDeptRulesTable();
        renderEmpRulesTable();
        updateCustomRulesBadge();
        recalculateAndRenderAll();
      }
    });
  }
}

/**
 * Update Custom Rules Active Count Badge
 */
function updateCustomRulesBadge() {
  const badge = document.getElementById('custom-rule-count-badge');
  if (!badge) return;
  const deptCount = Object.keys(AppState.deptRuleMap || {}).length;
  const empCount = Object.keys(AppState.empRuleMap || {}).length;
  const total = deptCount + empCount;
  if (total > 0) {
    badge.textContent = `${total} รายการเฉพาะ`;
    badge.style.display = 'inline-block';
  } else {
    badge.style.display = 'none';
  }
}

/**
 * Open Custom Rules Configuration Modal
 */
function openCustomRulesModal() {
  const modal = document.getElementById('modal-custom-rules');
  if (!modal) return;
  renderDeptRulesTable();
  renderEmpRulesTable();
  modal.classList.remove('hidden');
}

/**
 * Render Department Rules Table
 */
function renderDeptRulesTable() {
  const tbody = document.getElementById('table-dept-rules-body');
  if (!tbody) return;
  tbody.innerHTML = '';

  const depts = {};
  AppState.rawRecords.forEach(r => {
    if (!r[0]) return;
    const d = String(r[21] || r[20] || 'Workshop').trim() || 'Workshop';
    depts[d] = (depts[d] || 0) + 1;
  });

  const sortedDepts = Object.keys(depts).sort();
  if (sortedDepts.length === 0) {
    tbody.innerHTML = `<tr><td colspan="3" class="text-center text-secondary py-4">ยังไม่พบข้อมูลแผนกจากไฟล์ Excel</td></tr>`;
    return;
  }

  sortedDepts.forEach(dept => {
    const tr = document.createElement('tr');
    const currentMode = AppState.deptRuleMap[dept] || '';
    tr.innerHTML = `
      <td class="font-bold">${dept}</td>
      <td style="text-align: center;"><span class="badge badge-info">${depts[dept]} แถว</span></td>
      <td>
        <select class="form-control select-dept-mode" data-dept="${dept}" style="width: 100%; padding: 6px; border-radius: 6px; border: 1px solid var(--border-color);">
          <option value="" ${!currentMode ? 'selected' : ''}>🌐 ตามโหมดหลักระบบ (${AppState.mode.toUpperCase()})</option>
          <option value="workshop" ${currentMode === 'workshop' ? 'selected' : ''}>⭐ โหมด Workshop (08:00/07:00 น.)</option>
          <option value="dws" ${currentMode === 'dws' ? 'selected' : ''}>📋 โหมด Office (ไม่เกิน 09:00 น.)</option>
          <option value="night" ${currentMode === 'night' ? 'selected' : ''}>🌙 โหมดกะบ่าย/กะดึก (Auto Shift)</option>
        </select>
      </td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('.select-dept-mode').forEach(sel => {
    sel.addEventListener('change', (e) => {
      const deptName = e.target.getAttribute('data-dept');
      const val = e.target.value;
      if (!val) {
        delete AppState.deptRuleMap[deptName];
      } else {
        AppState.deptRuleMap[deptName] = val;
      }
      localStorage.setItem('hr_time_dept_rules_v1', JSON.stringify(AppState.deptRuleMap));
      updateCustomRulesBadge();
      recalculateAndRenderAll();
    });
  });
}

/**
 * Render Employee Rules Table
 */
function renderEmpRulesTable() {
  const tbody = document.getElementById('table-emp-rules-body');
  if (!tbody) return;
  tbody.innerHTML = '';

  const empIds = Object.keys(AppState.empRuleMap || {}).sort();
  if (empIds.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="text-center text-secondary py-4">ยังไม่มีการกำหนดเกณฑ์เฉพาะรายบุคคล (ใช้เกณฑ์ตามแผนกหรือโหมดหลัก)</td></tr>`;
    return;
  }

  empIds.forEach(empId => {
    const mode = AppState.empRuleMap[empId];
    const summary = AppState.employeeSummary[empId] || { empName: 'ไม่ทราบชื่อ', dept: '-' };
    let modeLabel = mode;
    if (mode === 'workshop') modeLabel = '⭐ โหมด Workshop (08:00/07:00 น.)';
    else if (mode === 'dws') modeLabel = '📋 โหมด Office (ไม่เกิน 09:00 น.)';
    else if (mode === 'night') modeLabel = '🌙 โหมดกะบ่าย/กะดึก (Auto Shift)';

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="font-mono font-bold">${empId}</td>
      <td>${summary.empName || summary.name || 'ไม่ทราบชื่อ'}</td>
      <td><span class="badge badge-secondary">${summary.dept}</span></td>
      <td><span class="badge badge-primary">${modeLabel}</span></td>
      <td style="text-align: center;">
        <button class="btn btn-xs btn-outline btn-remove-emp-rule" data-emp="${empId}" style="color: var(--danger-color); border-color: var(--danger-color);">ลบ</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('.btn-remove-emp-rule').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const emp = e.target.getAttribute('data-emp');
      delete AppState.empRuleMap[emp];
      localStorage.setItem('hr_time_emp_rules_v1', JSON.stringify(AppState.empRuleMap));
      renderEmpRulesTable();
      updateCustomRulesBadge();
      recalculateAndRenderAll();
    });
  });
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
 * Load Master Shift Schedule from API (/api/shift-master)
 */
async function loadShiftMasterMap() {
  AppState.shiftMasterMap = JSON.parse(localStorage.getItem('hr_time_shift_master_v1') || '{}');
  try {
    const response = await fetch('/api/shift-master');
    if (!response.ok) throw new Error('Shift Master API server not responding');
    const result = await response.json();
    if (result.success && result.shiftMap) {
      AppState.shiftMasterMap = Object.assign({}, AppState.shiftMasterMap, result.shiftMap);
      console.log('🎯 Loaded Master Shift Schedules from API + LocalStorage:', Object.keys(AppState.shiftMasterMap).length, 'records');
    }
  } catch (err) {
    console.warn('Could not load shift master data from API /api/shift-master, using LocalStorage:', err);
  }
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
      AppState.headers = result.headers || [];
      AppState.headers = result.headers || [];
      AppState.rawRecords = result.rows;
      AppState.currentFileName = result.filename;
      document.getElementById('current-file-display').textContent = `📑 ไฟล์ปัจจุบัน: ${result.filename} (${result.totalRows.toLocaleString()} รายการ)`;
      document.getElementById('source-status-badge').textContent = 'Default Pre-loaded';
      document.getElementById('source-status-badge').className = 'badge badge-primary';
      
      recalculateAndRenderAll();
      return;
    } else {
      AppState.rawRecords = [];
      AppState.currentFileName = AppState.lang === 'en' ? 'No Data (Ready for Workshop Upload)' : 'ว่างเปล่า (รออัปโหลดไฟล์ Excel ใหม่สำหรับ Workshop)';
      const fileDisp = document.getElementById('current-file-display');
      if (fileDisp) fileDisp.textContent = `📑 ${AppState.lang === 'en' ? 'Current File: None (0 records)' : 'ไฟล์ปัจจุบัน: ว่างเปล่า (พร้อมรับไฟล์ใหม่)'}`;
      const statusBadge = document.getElementById('source-status-badge');
      if (statusBadge) {
        statusBadge.textContent = AppState.lang === 'en' ? 'Database Cleared' : 'ล้างฐานข้อมูลแล้ว';
        statusBadge.className = 'badge badge-warning';
      }
      recalculateAndRenderAll();
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
        AppState.headers = rawRows[0] || [];
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

  AppState.rawRecords = [];
  AppState.currentFileName = AppState.lang === 'en' ? 'No Data (Ready for Workshop Upload)' : 'ว่างเปล่า (รออัปโหลดไฟล์ Excel ใหม่สำหรับ Workshop)';
  const fileDisp = document.getElementById('current-file-display');
  if (fileDisp) fileDisp.textContent = `📑 ${AppState.lang === 'en' ? 'Current File: None (0 records)' : 'ไฟล์ปัจจุบัน: ว่างเปล่า (พร้อมรับไฟล์ใหม่)'}`;
  const statusBadge = document.getElementById('source-status-badge');
  if (statusBadge) {
    statusBadge.textContent = AppState.lang === 'en' ? 'Database Cleared' : 'ล้างฐานข้อมูลแล้ว';
    statusBadge.className = 'badge badge-warning';
  }
  recalculateAndRenderAll();
}

/**
 * Clear all database records and custom rules
 */
async function clearAllDatabase() {
  if (!confirm(AppState.lang === 'en' 
    ? 'Are you sure you want to clear the entire attendance database and reset all settings?' 
    : 'ยืนยันการล้างฐานข้อมูลการแตะบัตรและเกณฑ์ทั้งหมดในระบบใช่หรือไม่?\n\n(หลังจากล้างแล้ว คุณสามารถอัปโหลดไฟล์ Excel ใหม่เพื่อคำนวณ Workshop ได้ทันที)')) {
    return;
  }

  const tbody = document.getElementById('summary-tbody');
  if (tbody) tbody.innerHTML = `<tr><td colspan="13" class="text-center loading-cell">⏳ ${AppState.lang === 'en' ? 'Clearing database...' : 'กำลังล้างฐานข้อมูลทั้งหมด...'}</td></tr>`;

  try {
    await fetch('/api/clear', { method: 'POST' });
  } catch (e) {
    console.warn('API /api/clear unreachable, clearing client state only.');
  }

  AppState.rawRecords = [];
  AppState.processedRecords = [];
  AppState.employeeSummary = {};
  AppState.deptRuleMap = {};
  AppState.empRuleMap = {};
  AppState.overrides = {};
  localStorage.removeItem('hr_time_dept_rules_v1');
  localStorage.removeItem('hr_time_emp_rules_v1');
  localStorage.removeItem('hr_time_overrides_v1');

  AppState.currentFileName = AppState.lang === 'en' ? 'No Data (Ready for Workshop Upload)' : 'ว่างเปล่า (รออัปโหลดไฟล์ Excel ใหม่สำหรับ Workshop)';
  const disp = document.getElementById('current-file-display');
  if (disp) disp.textContent = `📑 ${AppState.lang === 'en' ? 'Current File: None (0 records)' : 'ไฟล์ปัจจุบัน: ว่างเปล่า (พร้อมรับไฟล์ใหม่)'}`;
  const badge = document.getElementById('source-status-badge');
  if (badge) {
    badge.textContent = AppState.lang === 'en' ? 'Database Cleared' : 'ล้างฐานข้อมูลแล้ว';
    badge.className = 'badge badge-warning';
  }
  updateCustomRulesBadge();
  recalculateAndRenderAll();
  alert(AppState.lang === 'en' ? '✅ Database cleared! Please upload your new Excel file for Workshop attendance check.' : '✅ ล้างฐานข้อมูลทั้งหมดเรียบร้อยแล้ว!\nกรุณาอัปโหลดไฟล์ Excel ใหม่เพื่อคำนวณการเข้าออกสายใน Workshop');
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
 * Handle Night Shift Schedule File Upload (Client-side SheetJS + LocalStorage/Memory Merge)
 */
async function handleShiftFileUpload(file) {
  if (!window.XLSX) {
    alert('ระบบกำลังโหลด SheetJS กรุณารอสักครู่แล้วลองใหม่');
    return;
  }
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      let loadedCount = 0;
      
      workbook.SheetNames.forEach(sName => {
        const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sName], { header: 1 });
        rows.forEach(r => {
          const dt = r[0];
          const id = r[1];
          const inTime = r[3];
          if (id && id !== 'Emp.ID' && id !== 'Signature:' && id !== 'Name:' && String(id).trim() !== '' && /^\d{3,6}$/.test(String(id).trim())) {
            let dateStr = null;
            if (typeof dt === 'number' && !isNaN(dt) && dt > 10000) {
              const dateObj = new Date(Math.round((dt - 25569) * 86400 * 1000));
              dateStr = dateObj.toISOString().slice(0, 10);
            } else if (typeof dt === 'string' && dt.trim()) {
              const sDt = dt.trim();
              let m = sDt.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
              if (m) {
                const p1 = parseInt(m[1], 10);
                const p2 = parseInt(m[2], 10);
                let yr = m[3];
                if (yr.length === 2) yr = '20' + yr;
                let month = p1 > 12 ? p2 : (p2 > 12 ? p1 : p1);
                let day = p1 > 12 ? p1 : (p2 > 12 ? p2 : p2);
                dateStr = yr + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0');
              }
            }

            if (dateStr) {
              const empId = String(id).trim();
              const sTime = String(inTime || '').trim();
              let targetSeconds = 59400;
              let targetOutSeconds = 91800;
              let targetStr = '16:30 - 01:30';
              let isNightShift = true;

              if (sTime === '03.30' || sTime === '15.30' || sTime === '15:30' || sTime === '3.30' || sTime === '3:30' || sTime === '03.00' || sTime === '15.00' || sTime === '15:00' || sTime === '3.00' || sTime === '3:00') {
                targetSeconds = 55800; targetOutSeconds = 88200; targetStr = '15:30 - 00:30'; isNightShift = true;
              } else if (sTime === '04.30' || sTime === '16.30' || sTime === '16:30' || sTime === '4.30' || sTime === '4:30' || sTime === '04.00' || sTime === '16.00' || sTime === '16:00' || sTime === '4.00' || sTime === '4:00' || sTime === '05.30' || sTime === '17.30' || sTime === '17:30' || sTime === '5.30' || sTime === '5:30') {
                targetSeconds = 59400; targetOutSeconds = 91800; targetStr = '16:30 - 01:30'; isNightShift = true;
              } else if (sTime === '08.00' || sTime === '08:00' || sTime === '8.00' || sTime === '8:00') {
                targetSeconds = 28800; targetOutSeconds = 61200; targetStr = '08:00 - 17:00'; isNightShift = false;
              } else if (sTime === '07.00' || sTime === '07:00' || sTime === '7.00' || sTime === '7:00') {
                targetSeconds = 25200; targetOutSeconds = 57600; targetStr = '07:00 - 16:00'; isNightShift = false;
              }

              const masterData = { empId, date: dateStr, inTime: sTime, targetSeconds, targetOutSeconds, targetStr, isNightShift, normInSecs: targetSeconds };
              if (!AppState.shiftMasterMap) AppState.shiftMasterMap = {};
              AppState.shiftMasterMap[empId + '_' + dateStr] = masterData;
              AppState.shiftMasterMap[parseInt(empId, 10) + '_' + dateStr] = masterData;
              loadedCount++;
            }
          }
        });
      });

      if (loadedCount > 0) {
        localStorage.setItem('hr_time_shift_master_v1', JSON.stringify(AppState.shiftMasterMap));
        alert(`🌙 อัปโหลดตารางเข้ากะ (Night Shift) จากไฟล์ "${file.name}" เรียบร้อยแล้ว (${loadedCount.toLocaleString()} รายการ)\nระบบกำลังคำนวณข้อมูลการแตะบัตรใหม่เพื่อปรับเวลาเข้างานให้ตรงตามตารางและไม่คิดสายสำหรับพนักงานกะดึก...`);
        recalculateAndRenderAll();
      } else {
        alert('ไม่พบข้อมูลตารางเข้ากะในไฟล์ที่เลือก กรุณาตรวจสอบรูปแบบตารางงาน Night Shift');
      }
    } catch (parseErr) {
      console.error('Shift file parse error:', parseErr);
      alert('ไม่สามารถอ่านไฟล์ตารางเข้ากะได้ กรุณาตรวจสอบไฟล์');
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
    // Check DD/MM/YYYY or DD-MM-YYYY or M/D/YY or DD/MM/YY (supporting 2-digit and 4-digit years)
    m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
    if (m) {
      const p1 = parseInt(m[1], 10);
      const p2 = parseInt(m[2], 10);
      let yearStr = m[3];
      if (yearStr.length === 2) {
        const yNum = parseInt(yearStr, 10);
        if (yNum >= 60 && yNum <= 99) yearStr = String(2500 + yNum - 543);
        else yearStr = '20' + yearStr;
      } else if (yearStr.length === 4) {
        const yNum = parseInt(yearStr, 10);
        if (yNum > 2500) yearStr = String(yNum - 543);
      }
      let month, day;
      if (p1 > 12) {
        day = p1; month = p2;
      } else if (p2 > 12) {
        month = p1; day = p2;
      } else if (s.includes('/') && !s.startsWith('0') && p1 <= 12 && p2 <= 12) {
        month = p1; day = p2;
      } else {
        day = p1; month = p2;
      }
      return `${yearStr}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
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
  const parts = dateStr.split('-').map(part => parseInt(part, 10));
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
    const s = serialTime.trim();
    const timeMatch = s.match(/^(\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?$/);
    if (timeMatch) {
      const hh = parseInt(timeMatch[1], 10) || 0;
      const mm = parseInt(timeMatch[2], 10) || 0;
      const ss = parseInt(timeMatch[3] || '0', 10) || 0;
      const totalSeconds = hh * 3600 + mm * 60 + ss;
      return {
        str: `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`,
        seconds: totalSeconds
      };
    }
    const num = parseFloat(s);
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
  const match = dwsText.match(/(\d{1,2})[:.](\d{2})/);
  if (match) {
    const hh = parseInt(match[1], 10);
    const mm = parseInt(match[2], 10);
    if (isNaN(hh) || isNaN(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
    return hh * 3600 + mm * 60;
  }
  return null;
}

/**
 * Detect Target Shift & Night Shift Auto-Classification Engine
 * Supports exactly 2 Night Shifts crossing midnight (15:30-00:30 and 16:30-01:30):
 */
function detectShiftTarget(dwsText, clockInSeconds, clockOutSeconds, isPreHoliday, mode, empId, dateStr, dept) {
  const dws = String(dwsText || '').trim().toLowerCase();
  
  // 0. Check Master Shift Map (from Data/shift or C:\HR night shift schedule) for exact assigned schedule FIRST
  if (empId && dateStr && AppState && AppState.shiftMasterMap) {
    const key1 = `${empId}_${dateStr}`;
    const key2 = `${parseInt(empId, 10)}_${dateStr}`;
    const masterInfo = AppState.shiftMasterMap[key1] || AppState.shiftMasterMap[key2];
    if (masterInfo) {
      let normInSecs = clockInSeconds;
      if (masterInfo.isNightShift && clockInSeconds >= 7200 && clockInSeconds <= 21600 && clockOutSeconds > 0 && clockOutSeconds <= 21600) {
        normInSecs += 43200;
      }
      return {
        targetSeconds: masterInfo.targetSeconds,
        targetOutSeconds: masterInfo.targetOutSeconds || (masterInfo.targetSeconds + 32400),
        targetStr: masterInfo.targetStr,
        isNightShift: masterInfo.isNightShift,
        normInSecs: normInSecs,
        isMasterOverride: true
      };
    }
  }

  const isWorkshop = (dept && String(dept).toLowerCase().includes('workshop')) || mode === 'workshop' || AppState.mode === 'workshop';
  if (isWorkshop && !dws.includes('15:30') && !dws.includes('16:30') && !dws.includes('night') && mode !== 'night') {
    if (isPreHoliday) {
      return { targetSeconds: 25200, targetOutSeconds: 57600, targetStr: '07:00-16:00', isNightShift: false, normInSecs: clockInSeconds };
    } else {
      return { targetSeconds: 28800, targetOutSeconds: 61200, targetStr: '08:00-17:00', isNightShift: false, normInSecs: clockInSeconds };
    }
  }
  
  // Normalize 12-hour afternoon clock-in if recorded as e.g. 03:30 (12600s) or 04:00 (14400s) when exit is after midnight (00:00 - 06:00)
  let normInSecs = clockInSeconds;
  if (clockInSeconds >= 7200 && clockInSeconds <= 21600 && clockOutSeconds > 0 && clockOutSeconds <= 21600) {
    normInSecs += 43200;
  }
  
  // 1. Check DWS text patterns or explicit Night Shift keywords (Exactly two shifts: 15:30-00:30 and 16:30-01:30)
  const isNightInterval = /\b(15|16|17)[:.](00|30)\b.*\b(00|01|02|03)[:.](00|30)\b/.test(dws) || dws.includes('n1') || dws.includes('n2') || dws.includes('night') || dws.includes('ดึก') || dws.includes('บ่าย') || mode === 'night';
  if (isNightInterval || (normInSecs >= 50400 && normInSecs <= 75600)) {
    if (dws.includes('15:30') || dws.includes('15.30') || dws.includes('15:00') || dws.includes('15.00') || dws.includes('n1') || (normInSecs <= 57600 && mode === 'night')) {
      return { targetSeconds: 55800, targetOutSeconds: 88200, targetStr: '15:30-00:30', isNightShift: true, normInSecs };
    }
    return { targetSeconds: 59400, targetOutSeconds: 91800, targetStr: '16:30-01:30', isNightShift: true, normInSecs };
  }

  // 3. If Office Role (mode === 'dws' or non-Workshop department), check-in ceiling is 09:00 (32400s)
  const isOfficeRole = mode === 'dws' || (!isWorkshop && mode !== 'night' && !isNightInterval);
  if (isOfficeRole) {
    const parseSecs = parseTargetSecondsFromDWS(dwsText);
    if (parseSecs !== null && parseSecs > 32400) {
      const hh = Math.floor(parseSecs / 3600);
      const mm = Math.floor((parseSecs % 3600) / 60);
      return { targetSeconds: parseSecs, targetOutSeconds: parseSecs + 32400, targetStr: `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`, isNightShift: hh >= 14, normInSecs };
    }
    return { targetSeconds: 32400, targetOutSeconds: 61200, targetStr: '09:00 (Office <8h)', isNightShift: false, normInSecs };
  }

  // 4. Check for standard 24h targets in DWS
  const parseSecs = parseTargetSecondsFromDWS(dwsText);
  if (parseSecs !== null) {
    const hh = Math.floor(parseSecs / 3600);
    const mm = Math.floor((parseSecs % 3600) / 60);
    return { targetSeconds: parseSecs, targetOutSeconds: parseSecs + 32400, targetStr: `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`, isNightShift: hh >= 14, normInSecs };
  }

  // 5. Default Day Shifts (Workshop)
  if (isPreHoliday) return { targetSeconds: 25200, targetOutSeconds: 57600, targetStr: '07:00-16:00', isNightShift: false, normInSecs };
  else return { targetSeconds: 28800, targetOutSeconds: 61200, targetStr: '08:00-17:00', isNightShift: false, normInSecs };
}

/**
 * Core Calculation Engine
 */
/**
 * Smart Column Mapping Engine
 * Automatically detects whether the file is 20-column standard export (without DWS columns)
 * or 22-column extended export (with DWS columns) based on header names and row length.
 */
function getColumnIndices(headers, firstRow) {
  const map = {
    empId: 0,
    empName: 1,
    date: 2,
    dwsCode: -1,
    dwsText: -1,
    clockIn: -1,
    clockOut: -1,
    effHours: -1,
    actHours: -1,
    ot1: -1,
    ot15: -1,
    ot2: -1,
    ot3: -1,
    leaveReason: -1,
    dept: -1
  };

  if (Array.isArray(headers) && headers.length > 0) {
    headers.forEach((h, idx) => {
      const col = String(h || '').trim().toLowerCase();
      if (col === 'employee id' || col === 'รหัสพนักงาน' || col.includes('emp id')) map.empId = idx;
      else if (col === 'name' || col === 'ชื่อ-นามสกุล' || col === 'employee name') map.empName = idx;
      else if (col === 'date' || col === 'วันที่') map.date = idx;
      else if (col === 'clock-in' || col === 'clock in' || col === 'เข้างาน' || col === 'เวลาเข้า') map.clockIn = idx;
      else if (col === 'clock-out' || col === 'clock out' || col === 'ออกงาน' || col === 'เวลาออก') map.clockOut = idx;
      else if (col.includes('dws') && (col.includes('code') || col.includes('รหัส'))) map.dwsCode = idx;
      else if (col.includes('dws') && (col.includes('text') || col.includes('ตาราง') || col.includes('กะ'))) map.dwsText = idx;
      else if (col === 'effective working hours' || col.includes('effective')) map.effHours = idx;
      else if (col === 'actual working hours' || col.includes('actual')) map.actHours = idx;
      else if (col === 'ot 1.0') map.ot1 = idx;
      else if (col === 'ot 1.5') map.ot15 = idx;
      else if (col === 'ot 2.0') map.ot2 = idx;
      else if (col === 'ot 3.0') map.ot3 = idx;
      else if (col === 'absence description' || col === 'leave reason' || col.includes('description') || col.includes('หมายเหตุ')) map.leaveReason = idx;
      else if (col === 'department' || col === 'แผนก' || col === 'หน่วยงาน') map.dept = idx;
    });
  }

  // Fallback: If exact header detection didn't find clockIn or dept, detect by row structure/length
  if (map.clockIn === -1 || map.clockOut === -1) {
    const is20Cols = (headers && headers.length <= 20) || (firstRow && firstRow.length <= 20);
    if (is20Cols) {
      // Standard 20-column Clock in and out export (e.g. C:\HR\Clock in and out_01.01.26 to 30.06.26.xlsx)
      map.empId = 0;
      map.empName = 1;
      map.date = 2;
      map.clockIn = 3;
      map.clockOut = 4;
      map.effHours = 5;
      map.actHours = 6;
      map.ot1 = 7;
      map.ot15 = 8;
      map.ot2 = 9;
      map.ot3 = 10;
      map.leaveReason = 14;
      map.dept = 19;
    } else {
      // Legacy 22+ column export (with DWS at index 3 & 4)
      map.empId = 0;
      map.empName = 1;
      map.date = 2;
      map.dwsCode = 3;
      map.dwsText = 4;
      map.clockIn = 5;
      map.clockOut = 6;
      map.effHours = 7;
      map.actHours = 8;
      map.ot1 = 9;
      map.ot15 = 10;
      map.ot2 = 11;
      map.ot3 = 12;
      map.leaveReason = 16;
      map.dept = 21;
    }
  }

  return map;
}

function recalculateAndRenderAll() {
  buildPreHolidaysMap();
  
  const processed = [];
  const empMap = {};
  const deptsSet = new Set();
  
  let totalOntimeDays = 0;
  let totalLateDays = 0;
  let totalEarlyOutDays = 0;
  let totalAbsentDays = 0;
  let totalPreHolidayShifts = 0;
  let minDate = '9999-99-99';
  let maxDate = '0000-00-00';

  const colIdx = getColumnIndices(AppState.headers, AppState.rawRecords[0]);

  AppState.rawRecords.forEach((row) => {
    const empId = String(row[colIdx.empId] || '').trim();
    const empName = String(row[colIdx.empName] || 'Unknown Employee').trim();
    if (!empId || empId === '0' || !empName) return;

    const dateStr = excelSerialToDateStr(row[colIdx.date]);
    if (!dateStr || dateStr === 'INVALID_DATE') return;

    if (dateStr < minDate) minDate = dateStr;
    if (dateStr > maxDate) maxDate = dateStr;

    const dwsCode = colIdx.dwsCode !== -1 ? String(row[colIdx.dwsCode] || '').trim() : '';
    const dwsText = colIdx.dwsText !== -1 ? String(row[colIdx.dwsText] || '').trim() : '';
    const leaveReason = colIdx.leaveReason !== -1 ? String(row[colIdx.leaveReason] || '').trim() : '';
    const clockInInfo = excelSerialToTimeInfo(row[colIdx.clockIn]);
    const clockOutInfo = excelSerialToTimeInfo(row[colIdx.clockOut]);
    let actualHours = (colIdx.actHours !== -1 && parseFloat(row[colIdx.actHours])) 
                   || (colIdx.effHours !== -1 && parseFloat(row[colIdx.effHours])) || 0;
    
    if (clockInInfo.seconds > 0 && clockOutInfo.seconds > 0) {
      let diffSecs = clockOutInfo.seconds - clockInInfo.seconds;
      if (diffSecs < 0) diffSecs += 86400;
      let calcHours = diffSecs / 3600;
      if (calcHours > 5) calcHours -= 1;
      actualHours = calcHours;
    }
    const ot1 = colIdx.ot1 !== -1 ? (parseFloat(row[colIdx.ot1]) || 0) : 0;
    const ot15 = colIdx.ot15 !== -1 ? (parseFloat(row[colIdx.ot15]) || 0) : 0;
    const ot2 = colIdx.ot2 !== -1 ? (parseFloat(row[colIdx.ot2]) || 0) : 0;
    const ot3 = colIdx.ot3 !== -1 ? (parseFloat(row[colIdx.ot3]) || 0) : 0;
    const totalOT = ot1 + ot15 + ot2 + ot3;

    let dept = 'Workshop';
    if (colIdx.dept !== -1 && row[colIdx.dept]) {
      dept = String(row[colIdx.dept]).trim() || 'Workshop';
    } else if (row[19]) {
      dept = String(row[19]).trim() || 'Workshop';
    } else if (row[21] || row[20]) {
      dept = String(row[21] || row[20]).trim() || 'Workshop';
    }
    deptsSet.add(dept);

    const dayOfWeek = getDayOfWeekSafe(dateStr);
    const isFriday = (dayOfWeek === 5);
    const preHolidayReason = AppState.preHolidaysMap[dateStr];
    const isPreHoliday = isFriday || !!preHolidayReason;

    const effectiveMode = (AppState.empRuleMap && AppState.empRuleMap[empId]) || (AppState.deptRuleMap && AppState.deptRuleMap[dept]) || AppState.mode;
    const shiftInfo = detectShiftTarget(dwsText, clockInInfo.seconds, clockOutInfo.seconds, isPreHoliday, effectiveMode, empId, dateStr, dept);
    const targetSeconds = shiftInfo.targetSeconds;
    const targetOutSeconds = shiftInfo.targetOutSeconds || (targetSeconds + 32400);
    const targetStr = shiftInfo.targetStr;
    const isNightShift = shiftInfo.isNightShift;

    const outH = Math.floor(targetOutSeconds / 3600) % 24;
    const outM = Math.floor((targetOutSeconds % 3600) / 60);
    const targetOutStr = `${String(outH).padStart(2, '0')}:${String(outM).padStart(2, '0')}`;

    if (shiftInfo.normInSecs && shiftInfo.normInSecs !== clockInInfo.seconds && clockInInfo.seconds > 0) {
      clockInInfo.seconds = shiftInfo.normInSecs;
      const hh = Math.floor(clockInInfo.seconds / 3600);
      const mm = Math.floor((clockInInfo.seconds % 3600) / 60);
      clockInInfo.str = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    }

    let normOutSecs = clockOutInfo.seconds;
    if (clockOutInfo.seconds > 0 && isNightShift && clockOutInfo.seconds <= 25200) {
      normOutSecs += 86400; // Next morning checkout for night shift
    }

    if (isPreHoliday && clockInInfo.seconds > 0) totalPreHolidayShifts++;

    let isLate = false;
    let lateMinutes = 0;
    let isEarlyOut = false;
    let earlyOutMinutes = 0;
    let isAbsent = false;
    let allowance = 0;
    let statusText = AppState.lang === 'en' ? 'Day Off / No Shift' : 'วันหยุด/ไม่เข้างาน';
    let anomalyType = null;

    if (clockInInfo.seconds === 0 && clockOutInfo.seconds === 0 && actualHours === 0) {
      const hasLeave = leaveReason && leaveReason !== '-' && leaveReason !== '0' && leaveReason.trim() !== '';
      const isWorkDay = (dayOfWeek !== 0 && dayOfWeek !== 6 && dwsText !== 'OFF' && dwsText !== 'วันหยุด') 
                     || (dwsText && dwsText !== 'OFF' && dwsText !== 'วันหยุด' && dwsText !== '-' && dwsText !== '');
      
      if (hasLeave) {
        statusText = AppState.lang === 'en' ? `Leave: ${leaveReason}` : `ลาหยุด: ${leaveReason}`;
      } else if (isWorkDay) {
        // หากไม่มีเวลาเข้าออก ให้เช็คว่า มีการลาไหม ไม่งั้นให้ตีว่าขาดงาน (Absent without leave)
        isAbsent = true;
        totalAbsentDays++;
        statusText = AppState.lang === 'en' ? '❌ Absent (No Leave/Stamp)' : '❌ ขาดงาน (ไม่พบข้อมูลลา/แตะบัตร)';
        anomalyType = 'ABSENT';
      }
    } else if (clockInInfo.seconds === 0 && clockOutInfo.seconds > 0) {
      anomalyType = 'MISSING_IN';
    } else if (clockInInfo.seconds > 0 && clockOutInfo.seconds === 0) {
      anomalyType = 'MISSING_OUT';
    }

    const isWorkshop = dept.toLowerCase().includes('workshop') || effectiveMode === 'workshop' || AppState.mode === 'workshop';
    const isOfficeRole = !isWorkshop || effectiveMode === 'dws' || /office|account|sales|hr|purchas|admin/i.test(dept);
    const isClockIn1200 = clockInInfo.seconds === 43200 || clockInInfo.str.startsWith('12:00');

    if (clockInInfo.seconds > 0 || actualHours > 0 || clockOutInfo.seconds > 0) {
      if (isWorkshop && isClockIn1200) {
        // ถ้าวันไหนที่เวลา clock in = 12:00:00 ไม่ต้องสนใจ
        isLate = false;
        lateMinutes = 0;
        isEarlyOut = false;
        earlyOutMinutes = 0;
        allowance = 0;
        statusText = AppState.lang === 'en' ? '✅ On Time (Clock In 12:00)' : '✅ ไม่คิดสาย/ออกก่อน (เข้า 12:00)';
        totalOntimeDays++;
      } else if (isOfficeRole && !shiftInfo.isMasterOverride && !isNightShift) {
        // 🏢 OFFICE LOGIC:
        // 1. "ในส่วนของ office ดูแค่ ใครมาหลัง 09:00" -> Late only if clockInInfo.seconds > 32400 (09:00:00)
        if (clockInInfo.seconds > 32400 && clockInInfo.seconds > 0) {
          isLate = true;
          lateMinutes = Math.ceil((clockInInfo.seconds - 32400) / 60);
          allowance = 0;
          statusText = AppState.lang === 'en' ? `❌ Late ${lateMinutes}m (>09:00)` : `❌ สาย ${lateMinutes} นาที (หลัง 09:00)`;
          totalLateDays++;
          if (!anomalyType) anomalyType = 'EMERGENCY_LATE';
        } else {
          isLate = false;
          lateMinutes = 0;
          allowance = 0;
          if (leaveReason) {
            statusText = AppState.lang === 'en' ? `🏖️ Leave (${leaveReason})` : `🏖️ ลา (${leaveReason})`;
          } else if (dayOfWeek === 0 || dayOfWeek === 6) {
            statusText = AppState.lang === 'en' ? '✅ On Time (Weekend)' : '✅ ตรงเวลา (วันหยุด)';
          } else {
            statusText = AppState.lang === 'en' ? '✅ On Time (<=09:00)' : '✅ ตรงเวลา (ไม่เกิน 09:00)';
          }
          totalOntimeDays++;
        }

        // 2. "ส่วนการออกก่อนเวลาให้คำนวณจาก ชมว่าถ้าไม่ครบ 8-ชั่วโมง"
        if ((clockInInfo.seconds > 0 || normOutSecs > 0) && actualHours > 0 && actualHours < 8.0 && !leaveReason) {
          isEarlyOut = true;
          earlyOutMinutes = Math.ceil((8.0 - actualHours) * 60);
          allowance = 0;
          totalEarlyOutDays++;
          if (statusText.includes('✅')) {
            statusText = AppState.lang === 'en' ? `⚠️ Early Out (-${earlyOutMinutes}m / <8h)` : `⚠️ ออกก่อน (${earlyOutMinutes} นาที / ไม่ครบ 8 ชม.)`;
          } else {
            statusText += AppState.lang === 'en' ? ` / Early Out (<8h)` : ` / ออกก่อน (ไม่ครบ 8 ชม.)`;
          }
        } else {
          isEarlyOut = false;
          earlyOutMinutes = 0;
        }
      } else {
        // 🔧 WORKSHOP & MASTER SHIFT OVERRIDE LOGIC:
        const allowedCeiling = isWorkshop ? targetSeconds : (targetSeconds + AppState.lateToleranceSec);
        if (clockInInfo.seconds > allowedCeiling && clockInInfo.seconds > 0) {
          isLate = true;
          lateMinutes = Math.ceil((clockInInfo.seconds - targetSeconds) / 60);
          allowance = 0;
          statusText = AppState.lang === 'en' ? `❌ Late ${lateMinutes}m` : `❌ สาย ${lateMinutes} นาที`;
          totalLateDays++;
          if (!anomalyType) anomalyType = 'EMERGENCY_LATE';
        } else {
          isLate = false;
          lateMinutes = 0;
          allowance = 0; // ตัดเรื่องการคิดค่าข้าวออกหมดทุกแผนก
          if (leaveReason) {
            statusText = AppState.lang === 'en' ? `🏖️ Leave (${leaveReason})` : `🏖️ ลา (${leaveReason})`;
          } else if (dayOfWeek === 0 || dayOfWeek === 6) {
            statusText = AppState.lang === 'en' ? '✅ On Time (Weekend)' : '✅ ตรงเวลา (วันหยุด)';
          } else {
            statusText = AppState.lang === 'en' 
              ? (isNightShift ? `✅ On Time (${targetStr})` : '✅ On Time') 
              : (isNightShift ? `✅ ตรงเวลา (กะ ${targetStr})` : '✅ ตรงเวลา');
          }
          totalOntimeDays++;
        }

        if (normOutSecs > 0 && targetOutSeconds > 0 && normOutSecs < targetOutSeconds && !leaveReason) {
          isEarlyOut = true;
          earlyOutMinutes = Math.ceil((targetOutSeconds - normOutSecs) / 60);
          allowance = 0;
          totalEarlyOutDays++;
          if (statusText.includes('✅')) {
            statusText = AppState.lang === 'en' ? `⚠️ Early Out (-${earlyOutMinutes}m)` : `⚠️ ออกก่อนเวลา (${earlyOutMinutes} นาที)`;
          } else {
            statusText += AppState.lang === 'en' ? ` / Early Out (${earlyOutMinutes}m)` : ` / ออกก่อน (${earlyOutMinutes} น.)`;
          }
        }
      }
    }

    // Check for In-Portal Override
    const overrideKey = `${empId}_${dateStr}`;
    const override = AppState.overrides[overrideKey];
    let isOverridden = false;
    if (override && override.status === 'APPROVED') {
      isOverridden = true;
      if (isLate && totalLateDays > 0) totalLateDays--;
      if (isLate) totalOntimeDays++;
      if (isEarlyOut && totalEarlyOutDays > 0) totalEarlyOutDays--;
      
      isLate = false;
      lateMinutes = 0;
      isEarlyOut = false;
      earlyOutMinutes = 0;
      allowance = 0;
      statusText = AppState.lang === 'en' ? `💡 Approved Override (Time Adjusted)` : `💡 อนุมัติแก้ไขเวลาเรียบร้อยแล้ว`;
      if (override.correctedIn) clockInInfo.str = override.correctedIn;
      if (override.correctedOut) clockOutInfo.str = override.correctedOut;
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
      targetOutStr,
      targetTimeStr: shiftInfo.isMasterOverride 
        ? (AppState.lang === 'en' ? `${targetStr} (Master)` : `${targetStr} (ตารางกะ)`) 
        : ((AppState.empRuleMap && AppState.empRuleMap[empId]) || (AppState.deptRuleMap && AppState.deptRuleMap[dept]) ? `${targetStr} [${effectiveMode.toUpperCase()}]` : targetStr),
      effectiveMode,
      isMasterOverride: shiftInfo.isMasterOverride || false,
      targetSeconds,
      actualHours,
      totalOT,
      isFriday,
      isPreHoliday,
      preHolidayReason: preHolidayReason || (isFriday ? (AppState.lang === 'en' ? 'Friday Shift (07:00)' : 'กะวันศุกร์ (เข้า 07:00)') : ''),
      isLate,
      lateMinutes,
      isEarlyOut,
      earlyOutMinutes,
      isAbsent: isAbsent || false,
      allowance,
      statusText,
      leaveReason,
      dept,
      anomalyType,
      isOverridden,
      overrideInfo: override || null
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
        earlyOutDays: 0,
        absentDays: 0,
        preHolidayShifts: 0,
        totalAllowance: 0,
        totalActualHours: 0,
        totalOTHours: 0,
        leaveStats: {},
        records: []
      };
    }

    if (clockInInfo.seconds > 0 || actualHours > 0) {
      empMap[empId].totalDaysWorked++;
      if (isLate) empMap[empId].lateDays++;
      else empMap[empId].ontimeDays++;
      if (isEarlyOut) empMap[empId].earlyOutDays = (empMap[empId].earlyOutDays || 0) + 1;
      if (isPreHoliday) empMap[empId].preHolidayShifts++;
      empMap[empId].totalAllowance += allowance;
      empMap[empId].totalActualHours += actualHours;
      empMap[empId].totalOTHours += totalOT;
    }
    
    if (leaveReason && leaveReason !== '-' && leaveReason !== '0' && leaveReason.trim() !== '') {
      empMap[empId].leaveStats[leaveReason] = (empMap[empId].leaveStats[leaveReason] || 0) + 1;
    } else if (isAbsent) {
      const absentLabel = AppState.lang === 'en' ? '❌ Absent without leave' : '❌ ขาดงาน (ไม่พบข้อมูลลา/แตะบัตร)';
      empMap[empId].leaveStats[absentLabel] = (empMap[empId].leaveStats[absentLabel] || 0) + 1;
      empMap[empId].absentDays = (empMap[empId].absentDays || 0) + 1;
    }
    
    empMap[empId].records.push(record);
  });

  AppState.processedRecords = processed;
  AppState.employeeSummary = empMap;

  // Populate Department filter options
  const deptSelect = document.getElementById('summary-dept-filter');
  const dailyDeptSelect = document.getElementById('daily-dept-filter');
  let currentDeptVal = deptSelect.value;
  let currentDailyDeptVal = dailyDeptSelect ? dailyDeptSelect.value : 'all';
  
  // Default focus on Workshop if not yet selected by user
  if (!deptSelect.dataset.userFiltered && deptsSet.has('Workshop')) {
    currentDeptVal = 'Workshop';
    if (dailyDeptSelect) currentDailyDeptVal = 'Workshop';
  }
  
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
  
  document.getElementById('kpi-total-allowance').innerHTML = `${totalEarlyOutDays.toLocaleString()} <span class="kpi-unit">ครั้ง</span>`;
  document.getElementById('kpi-ontime-days').textContent = totalOntimeDays.toLocaleString();
  
  document.getElementById('kpi-ontime-rate').innerHTML = `${ontimeRate}% <span class="kpi-unit">ตรงเวลา</span>`;
  document.getElementById('kpi-progress-bar').style.width = `${ontimeRate}%`;
  document.getElementById('kpi-late-count-sub').textContent = `สายรวม ${totalLateDays.toLocaleString()} ครั้ง`;
  
  document.getElementById('kpi-preholiday-count').innerHTML = `${totalPreHolidayShifts.toLocaleString()} <span class="kpi-unit">รายการ</span>`;

  document.getElementById('tab-emp-count').textContent = totalEmps;
  document.getElementById('tab-daily-count').textContent = processed.length > 999 ? (processed.length / 1000).toFixed(1) + 'k' : processed.length;

  const totalAnomalies = processed.filter(r => r.anomalyType && !r.isOverridden).length;
  const disputeBadge = document.getElementById('tab-dispute-count');
  if (disputeBadge) disputeBadge.textContent = totalAnomalies.toLocaleString();

  // Render current tab tables
  renderSummaryTable();
  renderDailyTable();
  if (typeof renderDisputeTab === 'function') {
    renderDisputeTab();
  }
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
    tbody.innerHTML = `<tr><td colspan="13" class="text-center py-4">🔍 ไม่พบข้อมูลพนักงานที่ค้นหา</td></tr>`;
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
      <td class="text-center ${emp.earlyOutDays > 0 ? 'text-warning font-bold' : 'text-muted'}">${emp.earlyOutDays || 0}</td>
      <td class="text-center"><span class="badge badge-accent">${emp.preHolidayShifts}</span></td>
      <td class="text-left" style="font-size:0.8rem; line-height:1.2;">
        ${Object.keys(emp.leaveStats).length > 0 
          ? Object.entries(emp.leaveStats).map(([reason, count]) => `<div style="white-space:nowrap; ${reason.includes('❌') ? 'color:#ef4444; font-weight:bold;' : ''}">- ${reason}: <b>${count}</b> วัน</div>`).join('') 
          : '<div class="text-center text-muted">-</div>'}
      </td>
      <td class="text-right highlight-col font-bold ${emp.earlyOutDays > 0 ? 'text-warning' : ''}">${emp.earlyOutDays || 0} ครั้ง</td>
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
    records = records.filter(r => (r.clockInSeconds > 0 || r.actualHours > 0) && !r.isLate && !r.isEarlyOut);
  } else if (statusFilter === 'late') {
    records = records.filter(r => r.isLate);
  } else if (statusFilter === 'early') {
    records = records.filter(r => r.isEarlyOut);
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
    tbody.innerHTML = `<tr><td colspan="14" class="text-center py-4">🔍 ${AppState.lang === 'en' ? 'No attendance records match the filters' : 'ไม่พบรายการเข้า-ออกงานที่ตรงกับเงื่อนไข'}</td></tr>`;
    return;
  }

  const html = pageRecords.map(r => {
    let statusClass = 'badge-secondary';
    if (r.isAbsent) statusClass = 'badge-danger';
    else if (r.isLate || r.isEarlyOut) statusClass = 'badge-danger';
    else if (r.clockInSeconds > 0 || r.actualHours > 0) statusClass = 'badge-success';

    let allowanceHtml = `<span class="text-muted">-</span>`;
    if (r.isLate && r.isEarlyOut) allowanceHtml = `<span class="badge badge-danger">⚠️ สาย ${r.lateMinutes}น. + ออกก่อน ${r.earlyOutMinutes}น.</span>`;
    else if (r.isLate) allowanceHtml = `<span class="badge badge-danger">❌ สาย ${r.lateMinutes} นาที</span>`;
    else if (r.isEarlyOut) allowanceHtml = `<span class="badge badge-warning">⚠️ ออกก่อน ${r.earlyOutMinutes} นาที</span>`;
    else if (r.clockInSeconds > 0 || r.actualHours > 0) allowanceHtml = `<span class="badge badge-success">✅ ตรงเวลา</span>`;

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
        <td class="font-mono ${r.isEarlyOut ? 'text-danger font-bold' : ''}">${r.clockOutStr}</td>
        <td class="font-mono text-secondary">${r.targetOutStr || '-'}</td>
        <td class="text-center">${r.actualHours.toFixed(1)}</td>
        <td class="text-center ${r.totalOT > 0 ? 'text-accent font-bold' : 'text-muted'}">${r.totalOT > 0 ? '+' + r.totalOT.toFixed(1) : '-'}</td>
        <td class="text-center">
          <span class="badge ${statusClass}">${r.statusText}</span>
          ${r.leaveReason ? `<br><span class="badge badge-warning mt-1" style="font-size:0.75rem; white-space:normal;">🛌 ${r.leaveReason}</span>` : ''}
        </td>
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
        <td class="text-right font-bold text-accent">${e.earlyOutDays || 0} ครั้ง</td>
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
        <td class="text-right font-bold text-warning">${e.earlyOutDays || 0} ครั้ง</td>
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
 * Render Exception & Dispute Center (Tab ⚡)
 */
function renderDisputeTab() {
  const tbody = document.getElementById('dispute-tbody');
  if (!tbody) return;

  const deptFilter = AppState.disputeFilter.dept;
  const typeFilter = AppState.disputeFilter.type;
  const search = AppState.disputeFilter.search;

  // Find all records that have anomalies OR overrides
  let records = AppState.processedRecords.filter(r => r.anomalyType || r.isOverridden || r.isLate);

  if (deptFilter && deptFilter !== 'all') {
    records = records.filter(r => r.dept === deptFilter);
  }
  if (typeFilter && typeFilter !== 'all') {
    if (typeFilter === 'OVERRIDDEN') {
      records = records.filter(r => r.isOverridden);
    } else if (typeFilter === 'MISSING_IN') {
      records = records.filter(r => r.anomalyType === 'MISSING_IN' && !r.isOverridden);
    } else if (typeFilter === 'MISSING_OUT') {
      records = records.filter(r => r.anomalyType === 'MISSING_OUT' && !r.isOverridden);
    } else if (typeFilter === 'ZERO_STAMP') {
      records = records.filter(r => r.anomalyType === 'ZERO_STAMP' && !r.isOverridden);
    } else if (typeFilter === 'LATE') {
      records = records.filter(r => r.isLate && !r.isOverridden);
    }
  }
  if (search) {
    records = records.filter(r => 
      r.empId.toLowerCase().includes(search) || 
      r.empName.toLowerCase().includes(search) || 
      r.dateStr.includes(search)
    );
  }

  // Populate Department options if not populated
  const disputeDeptSelect = document.getElementById('dispute-dept-filter');
  if (disputeDeptSelect && disputeDeptSelect.options.length <= 1) {
    const depts = new Set(AppState.processedRecords.map(r => r.dept));
    disputeDeptSelect.innerHTML = `<option value="all">🏢 ทุกแผนก (All Departments)</option>`;
    [...depts].sort().forEach(d => {
      disputeDeptSelect.innerHTML += `<option value="${d}" ${d === deptFilter ? 'selected' : ''}>${d}</option>`;
    });
  }

  // Update KPI counters on Dispute Tab
  const pendingCount = AppState.processedRecords.filter(r => (r.anomalyType || r.isLate) && !r.isOverridden).length;
  const resolvedCount = AppState.processedRecords.filter(r => r.isOverridden).length;
  const badgePending = document.getElementById('dispute-kpi-pending');
  const badgeResolved = document.getElementById('dispute-kpi-resolved');
  if (badgePending) badgePending.textContent = pendingCount.toLocaleString();
  if (badgeResolved) badgeResolved.textContent = resolvedCount.toLocaleString();

  if (records.length === 0) {
    tbody.innerHTML = `<tr><td colspan="11" class="text-center py-4">✅ ไม่พบรายการผิดปกติหรือรายการที่ตรงกับตัวกรอง</td></tr>`;
    return;
  }

  // Limit to 200 items for snappy rendering if too many
  const displayRecords = records.slice(0, 200);

  tbody.innerHTML = displayRecords.map(r => {
    let typeBadge = '';
    if (r.isOverridden) {
      typeBadge = `<span class="badge badge-success">💡 อนุมัติแล้ว (${r.overrideInfo.note || 'HR Approved'})</span>`;
    } else if (r.anomalyType === 'MISSING_IN') {
      typeBadge = `<span class="badge badge-warning">⚠️ ลืมสแกนเข้า (Missing In)</span>`;
    } else if (r.anomalyType === 'MISSING_OUT') {
      typeBadge = `<span class="badge badge-warning">⚠️ ลืมสแกนออก (Missing Out)</span>`;
    } else if (r.anomalyType === 'ZERO_STAMP') {
      typeBadge = `<span class="badge badge-danger">🔴 ไม่พบเวลาทั้งวัน (Zero Stamp)</span>`;
    } else if (r.isLate) {
      typeBadge = `<span class="badge badge-danger">❌ สาย ${r.lateMinutes} นาที</span>`;
    }

    let actions = '';
    if (r.isOverridden) {
      actions = `
        <button class="btn btn-xs btn-outline text-muted" onclick="removeOverride('${r.empId}', '${r.dateStr}')" title="ยกเลิกสิทธิ์">❌ ยกเลิก</button>
        <button class="btn btn-xs btn-outline" onclick="openManualTimeModal('${r.empId}', '${r.dateStr}', '${r.clockInStr}', '${r.clockOutStr}', '${r.empName}')">✏️ แก้เวลา</button>
      `;
    } else {
      actions = `
        <button class="btn btn-xs btn-success" onclick="quickApproveOverride('${r.empId}', '${r.dateStr}', '${r.anomalyType || 'LATE'}', 'อนุมัติผ่านปุ่ม 1-Click')" style="padding: 3px 8px; font-weight:bold;">🟢 อนุมัติ +25฿</button>
        <button class="btn btn-xs btn-secondary" onclick="openManualTimeModal('${r.empId}', '${r.dateStr}', '${r.clockInStr}', '${r.clockOutStr}', '${r.empName}')" style="padding: 3px 8px;">✏️ ระบุเวลา</button>
      `;
    }

    return `
      <tr class="${r.isOverridden ? 'bg-success-light' : ''}">
        <td><input type="checkbox" class="dispute-chk" data-emp="${r.empId}" data-date="${r.dateStr}" ${r.isOverridden ? 'disabled checked' : ''}></td>
        <td><strong>${r.dateStr}</strong></td>
        <td><span class="badge badge-secondary">${r.dayNameShort}</span></td>
        <td><strong>${r.empId}</strong></td>
        <td>${r.empName}</td>
        <td><span class="badge badge-secondary">${r.dept}</span></td>
        <td>${typeBadge}</td>
        <td class="font-mono text-center">${r.clockInStr}</td>
        <td class="font-mono text-center">${r.clockOutStr}</td>
        <td class="text-center font-bold ${r.allowance === 25 ? 'text-success' : 'text-danger'}">${r.allowance === 25 ? '+25 ฿' : '0 ฿'}</td>
        <td class="text-center" style="white-space:nowrap;">${actions}</td>
      </tr>
    `;
  }).join('');
}

function filterDisputes() {
  const deptEl = document.getElementById('dispute-dept-filter');
  const typeEl = document.getElementById('dispute-type-filter');
  const searchEl = document.getElementById('dispute-search-input');
  if (deptEl) AppState.disputeFilter.dept = deptEl.value;
  if (typeEl) AppState.disputeFilter.type = typeEl.value;
  if (searchEl) AppState.disputeFilter.search = searchEl.value.trim().toLowerCase();
  renderDisputeTab();
}

function quickApproveOverride(empId, dateStr, anomalyType, note = 'อนุมัติสิทธิ์ค่าข้าวโดย HR') {
  const overrideKey = `${empId}_${dateStr}`;
  AppState.overrides[overrideKey] = {
    status: 'APPROVED',
    type: anomalyType,
    allowance: 25,
    note: note,
    timestamp: new Date().toISOString()
  };
  localStorage.setItem('hr_time_overrides_v1', JSON.stringify(AppState.overrides));
  recalculateAndRenderAll();
  
  // If modal is open for this employee, refresh modal view
  if (AppState.selectedEmployeeForModal && AppState.selectedEmployeeForModal.empId === empId) {
    const updatedEmp = AppState.employeeSummary[empId];
    if (updatedEmp) openEmployeeModal(updatedEmp);
  }
}

function removeOverride(empId, dateStr) {
  const overrideKey = `${empId}_${dateStr}`;
  delete AppState.overrides[overrideKey];
  localStorage.setItem('hr_time_overrides_v1', JSON.stringify(AppState.overrides));
  recalculateAndRenderAll();
  
  if (AppState.selectedEmployeeForModal && AppState.selectedEmployeeForModal.empId === empId) {
    const updatedEmp = AppState.employeeSummary[empId];
    if (updatedEmp) openEmployeeModal(updatedEmp);
  }
}

function openManualTimeModal(empId, dateStr, currentIn, currentOut, empName) {
  let modal = document.getElementById('manual-time-modal');
  if (!modal) return;
  document.getElementById('manual-emp-info').textContent = `${empName} (รหัส: ${empId}) - วันที่: ${dateStr}`;
  document.getElementById('manual-emp-id').value = empId;
  document.getElementById('manual-date-str').value = dateStr;
  document.getElementById('manual-in-time').value = (currentIn === '-' || !currentIn) ? '08:00' : currentIn;
  document.getElementById('manual-out-time').value = (currentOut === '-' || !currentOut) ? '17:00' : currentOut;
  document.getElementById('manual-note').value = '';
  modal.classList.add('open');
}

function closeManualTimeModal() {
  const modal = document.getElementById('manual-time-modal');
  if (modal) modal.classList.remove('open');
}

function saveManualTimeOverride() {
  const empId = document.getElementById('manual-emp-id').value;
  const dateStr = document.getElementById('manual-date-str').value;
  const customIn = document.getElementById('manual-in-time').value.trim();
  const customOut = document.getElementById('manual-out-time').value.trim();
  const note = document.getElementById('manual-note').value.trim() || 'ปรับเวลาเข้า-ออกจริงโดย HR';

  if (!empId || !dateStr) return;

  const overrideKey = `${empId}_${dateStr}`;
  AppState.overrides[overrideKey] = {
    status: 'APPROVED',
    type: 'MANUAL_TIME',
    correctedIn: customIn,
    correctedOut: customOut,
    allowance: 25,
    note: note,
    timestamp: new Date().toISOString()
  };
  localStorage.setItem('hr_time_overrides_v1', JSON.stringify(AppState.overrides));
  closeManualTimeModal();
  recalculateAndRenderAll();
}

function bulkApproveSelected() {
  const checkboxes = document.querySelectorAll('.dispute-chk:checked:not([disabled])');
  if (checkboxes.length === 0) {
    alert('กรุณาเลือกรายการที่ต้องการอนุมัติอย่างน้อย 1 รายการครับ');
    return;
  }
  checkboxes.forEach(chk => {
    const empId = chk.getAttribute('data-emp');
    const dateStr = chk.getAttribute('data-date');
    if (empId && dateStr) {
      AppState.overrides[`${empId}_${dateStr}`] = {
        status: 'APPROVED',
        type: 'BULK_APPROVED',
        allowance: 25,
        note: 'อนุมัติหมู่แบบกลุ่ม (Bulk Approved)',
        timestamp: new Date().toISOString()
      };
    }
  });
  localStorage.setItem('hr_time_overrides_v1', JSON.stringify(AppState.overrides));
  recalculateAndRenderAll();
  alert(`✅ อนุมัติคืนสิทธิ์เรียบร้อยแล้วจำนวน ${checkboxes.length} รายการครับ!`);
}

function toggleSelectAllDisputes(sourceChk) {
  const checkboxes = document.querySelectorAll('.dispute-chk:not([disabled])');
  checkboxes.forEach(chk => chk.checked = sourceChk.checked);
}

/**
 * Export Exception & Dispute List to Excel
 */
function exportDisputeXLSX() {
  const records = AppState.processedRecords.filter(r => r.anomalyType || r.isOverridden || r.isLate || r.isAbsent).map(r => ({
    'วันที่ (Date)': r.dateStr,
    'รหัสพนักงาน (ID)': r.empId,
    'ชื่อ-นามสกุล (Name)': r.empName,
    'แผนก (Dept)': r.dept,
    'ประเภทความผิดปกติ (Anomaly Type)': r.anomalyType || (r.isAbsent ? 'ABSENT (ขาดงาน)' : (r.isLate ? 'LATE' : 'NORMAL')),
    'เวลาเข้า (Clock In)': r.clockInStr,
    'เวลาออก (Clock Out)': r.clockOutStr,
    'สถานะการอนุมัติ (Status)': r.isOverridden ? 'อนุมัติคืนสิทธิ์ +25฿' : 'ยังไม่อนุมัติ (0฿)',
    'หมายเหตุการแก้ไข (Note)': r.isOverridden && r.overrideInfo ? r.overrideInfo.note : '-'
  }));

  if (records.length === 0) {
    alert('ไม่พบรายการสำหรับส่งออก');
    return;
  }
  const worksheet = XLSX.utils.json_to_sheet(records);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Exception Disputes');
  XLSX.writeFile(workbook, `HR_Workshop_Exceptions_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

/**
 * Open Employee Detailed Daily Modal
 */
function openEmployeeModal(empId, selectedMonth = 'ALL') {
  const emp = AppState.employeeSummary[empId];
  if (!emp) return;

  AppState.selectedEmployeeForModal = emp;
  AppState.selectedModalMonth = selectedMonth || 'ALL';

  document.getElementById('modal-emp-title').textContent = AppState.lang === 'en' ? `👤 Attendance History : ${emp.empName}` : `👤 ประวัติเวลาเข้า-ออกงาน : ${emp.empName}`;
  document.getElementById('modal-emp-sub').textContent = AppState.lang === 'en' ? `Employee ID: ${emp.empId} | Dept: ${emp.dept}` : `รหัสพนักงาน: ${emp.empId} | แผนก: ${emp.dept}`;

  // Find unique months in records (e.g. '2026-01', '2026-02')
  const monthsSet = new Set();
  emp.records.forEach(r => {
    if (r.dateStr && r.dateStr.length >= 7) {
      monthsSet.add(r.dateStr.slice(0, 7));
    }
  });
  const monthsList = Array.from(monthsSet).sort();

  const thMonths = { '01': 'ม.ค.', '02': 'ก.พ.', '03': 'มี.ค.', '04': 'เม.ย.', '05': 'พ.ค.', '06': 'มิ.ย.', '07': 'ก.ค.', '08': 'ส.ค.', '09': 'ก.ย.', '10': 'ต.ค.', '11': 'พ.ย.', '12': 'ธ.ค.' };
  const enMonths = { '01': 'Jan', '02': 'Feb', '03': 'Mar', '04': 'Apr', '05': 'May', '06': 'Jun', '07': 'Jul', '08': 'Aug', '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Dec' };

  const pillsEl = document.getElementById('modal-month-pills');
  if (pillsEl) {
    let pillsHTML = `<button class="pill-btn ${AppState.selectedModalMonth === 'ALL' ? 'active' : ''}" onclick="openEmployeeModal('${emp.empId}', 'ALL')" style="padding: 0.35rem 0.85rem; font-size: 0.82rem;">${AppState.lang === 'en' ? '🗓️ All Months' : '🗓️ ทุกเดือน'}</button>`;
    monthsList.forEach(mKey => {
      const parts = mKey.split('-');
      const y = parts[0] ? parts[0].slice(2) : '';
      const mName = AppState.lang === 'en' ? (enMonths[parts[1]] || parts[1]) : (thMonths[parts[1]] || parts[1]);
      const label = `${mName} ${y}`;
      pillsHTML += `<button class="pill-btn ${AppState.selectedModalMonth === mKey ? 'active' : ''}" onclick="openEmployeeModal('${emp.empId}', '${mKey}')" style="padding: 0.35rem 0.85rem; font-size: 0.82rem;">${label}</button>`;
    });
    pillsEl.innerHTML = pillsHTML;
  }

  // Filter records based on selectedMonth
  const filteredRecords = AppState.selectedModalMonth === 'ALL'
    ? emp.records
    : emp.records.filter(r => r.dateStr.startsWith(AppState.selectedModalMonth));

  // Compute stats specifically for filtered records
  let totalDaysWorked = 0;
  let ontimeDays = 0;
  let lateDays = 0;
  let totalAllowance = 0;
  const leaveStats = {};

  filteredRecords.forEach(r => {
    if (r.clockInSeconds > 0 || r.actualHours > 0 || r.leaveReason) {
      totalDaysWorked++;
    }
    if ((r.clockInSeconds > 0 || r.actualHours > 0) && !r.isLate) {
      ontimeDays++;
    }
    if (r.isLate) {
      lateDays++;
    }
    totalAllowance += (r.allowance || 0);
    if (r.leaveReason) {
      leaveStats[r.leaveReason] = (leaveStats[r.leaveReason] || 0) + 1;
    }
  });

  const dayUnit = AppState.lang === 'en' ? 'Days' : 'วัน';
  document.getElementById('m-stat-total').textContent = `${totalDaysWorked} ${dayUnit}`;
  document.getElementById('m-stat-ontime').textContent = `${ontimeDays} ${dayUnit}`;
  document.getElementById('m-stat-late').textContent = `${lateDays} ${dayUnit}`;
  document.getElementById('m-stat-allowance').textContent = `${totalAllowance.toLocaleString()} ฿`;

  // Leave Stats
  const leaveEl = document.getElementById('m-stat-leave');
  if (Object.keys(leaveStats).length > 0) {
    leaveEl.innerHTML = Object.entries(leaveStats).map(([reason, count]) => `<div style="white-space:nowrap;">- ${reason}: ${count} วัน</div>`).join('');
  } else {
    leaveEl.textContent = '-';
  }

  // --- KPI & BEHAVIORAL ANALYTICS COMPUTATION ---
  const kpiEl = document.getElementById('modal-kpi-insights');
  if (kpiEl) {
    const workDaysCount = ontimeDays + lateDays;
    const punctualityScore = workDaysCount > 0 ? ((ontimeDays / workDaysCount) * 100).toFixed(1) : '100.0';
    
    let gradeText = 'A+ 🏆 (ยอดเยี่ยมพิเศษ - โบนัสขยัน)';
    let gradeBadgeClass = 'badge-success';
    let gradeColor = 'var(--success)';
    if (parseFloat(punctualityScore) < 90) {
      gradeText = 'C/D ⚠️ (ต้องตักเตือน/ปรับปรุงพฤติกรรม)';
      gradeBadgeClass = 'badge-danger';
      gradeColor = 'var(--danger)';
    } else if (parseFloat(punctualityScore) < 95) {
      gradeText = 'B 👍 (ปานกลาง - ผ่านมาตรฐานบริษัท)';
      gradeBadgeClass = 'badge-secondary';
      gradeColor = 'var(--accent)';
    } else if (parseFloat(punctualityScore) < 98) {
      gradeText = 'A 🌟 (ดีมาก - ตรงเวลาตามมาตรฐาน KPI)';
      gradeBadgeClass = 'badge-success';
      gradeColor = 'var(--success)';
    }

    // Lateness day pattern analysis
    const lateDaysMap = {};
    let maxLateDayName = '-';
    let maxLateDayCount = 0;
    filteredRecords.forEach(r => {
      if (r.isLate && r.dayNameFull) {
        lateDaysMap[r.dayNameFull] = (lateDaysMap[r.dayNameFull] || 0) + 1;
        if (lateDaysMap[r.dayNameFull] > maxLateDayCount) {
          maxLateDayCount = lateDaysMap[r.dayNameFull];
          maxLateDayName = r.dayNameFull;
        }
      }
    });

    let latePatternSummary = '✅ ไม่พบสถิติการเข้างานสายเลยในตอนที่เลือก';
    let latePatternDetail = 'ความเสี่ยง KPI มาสาย: 0% (พฤติกรรมสม่ำเสมอดีมาก)';
    if (lateDays > 0 && maxLateDayCount > 0) {
      const pct = Math.round((maxLateDayCount / lateDays) * 100);
      latePatternSummary = `⚠️ มาสายบ่อยที่สุดใน "วัน${maxLateDayName}"`;
      latePatternDetail = `พบการมาสายวัน${maxLateDayName}ถึง ${maxLateDayCount} ครั้ง (ร้อยละ ${pct}% ของวันที่สายทั้งหมด)`;
    }

    // Average clock-in time and early delta
    const validInSecs = filteredRecords
      .filter(r => r.clockInSeconds > 0 && r.clockInSeconds < 43200) // Before noon clock-in
      .map(r => r.clockInSeconds);
    
    let avgClockInStr = '-';
    let earlyDeltaText = '';
    if (validInSecs.length > 0) {
      const avgSec = Math.round(validInSecs.reduce((a, b) => a + b, 0) / validInSecs.length);
      const h = Math.floor(avgSec / 3600);
      const m = Math.floor((avgSec % 3600) / 60);
      avgClockInStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')} น.`;
      const targetSec = 28800; // 08:00
      if (avgSec < targetSec) {
        earlyDeltaText = `(มาก่อนเวลาเฉลี่ย ${Math.round((targetSec - avgSec)/60)} นาที)`;
      } else if (avgSec > targetSec) {
        earlyDeltaText = `(ช้ากว่าเวลาเฉลี่ย ${Math.round((avgSec - targetSec)/60)} นาที)`;
      }
    }

    // Max On-Time Streak
    const sortedAsc = [...filteredRecords].sort((a, b) => a.dateStr.localeCompare(b.dateStr));
    let currentStreak = 0;
    let maxStreak = 0;
    sortedAsc.forEach(r => {
      if ((r.clockInSeconds > 0 || r.actualHours > 0) && !r.isLate) {
        currentStreak++;
        if (currentStreak > maxStreak) maxStreak = currentStreak;
      } else if (r.isLate || (r.clockInSeconds > 0 && r.isLate)) {
        currentStreak = 0;
      }
    });

    kpiEl.innerHTML = `
      <div style="margin-bottom: 0.5rem; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 0.4rem; flex-wrap: wrap; gap: 0.4rem;">
        <span style="font-size: 0.88rem; font-weight: 800; color: var(--text-main); display: flex; align-items: center; gap: 0.4rem;">
          💡 บทวิเคราะห์พฤติกรรม & ประเมิน KPI
        </span>
        <span class="badge ${gradeBadgeClass}" style="font-size: 0.78rem; padding: 0.25rem 0.65rem; border-radius: 50px;">
          เกรด KPI: ${gradeText}
        </span>
      </div>
      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.6rem;">
        <div style="background: rgba(0,0,0,0.22); padding: 0.6rem; border-radius: var(--radius-sm); border-left: 3px solid var(--primary);">
          <div style="font-size: 0.72rem; color: var(--text-secondary); margin-bottom: 0.15rem;">🏆 คะแนนความตรงเวลา</div>
          <div style="font-size: 1.15rem; font-weight: 800; color: var(--text-main); margin-bottom: 0.15rem;">${punctualityScore}% <span style="font-size: 0.75rem; font-weight: 500; color: var(--text-secondary);">(${ontimeDays}/${workDaysCount || 1}วัน)</span></div>
          <div style="font-size: 0.72rem; color: ${gradeColor}; font-weight: 600;">เกณฑ์: ${gradeText.split(' ')[0]}</div>
        </div>
        <div style="background: rgba(0,0,0,0.22); padding: 0.6rem; border-radius: var(--radius-sm); border-left: 3px solid ${lateDays > 0 ? '#ef4444' : '#10b981'};">
          <div style="font-size: 0.72rem; color: var(--text-secondary); margin-bottom: 0.15rem;">⚠️ รูปแบบการมาสาย (Pattern)</div>
          <div style="font-size: 0.9rem; font-weight: 700; color: var(--text-main); margin-bottom: 0.15rem;">${latePatternSummary}</div>
          <div style="font-size: 0.7rem; color: var(--text-secondary); line-height: 1.2;">${latePatternDetail}</div>
        </div>
        <div style="background: rgba(0,0,0,0.22); padding: 0.6rem; border-radius: var(--radius-sm); border-left: 3px solid #3b82f6;">
          <div style="font-size: 0.72rem; color: var(--text-secondary); margin-bottom: 0.15rem;">⏱️ เวลาเข้าเฉลี่ย & Streak</div>
          <div style="font-size: 1.05rem; font-weight: 800; color: var(--text-main); margin-bottom: 0.15rem;">${avgClockInStr} <span style="font-size:0.7rem; font-weight:normal; color:var(--success);">${earlyDeltaText}</span></div>
          <div style="font-size: 0.72rem; color: #3b82f6;">🔥 ตรงเวลา: <strong>${maxStreak} วันทำการติดกัน</strong></div>
        </div>
      </div>
    `;
  }

  // Sort employee records by date descending
  const sortedRecords = [...filteredRecords].sort((a, b) => b.dateStr.localeCompare(a.dateStr));

  const tbody = document.getElementById('modal-tbody');
  tbody.innerHTML = sortedRecords.map(r => {
    let statusClass = 'badge-secondary';
    if (r.isLate || r.isEarlyOut) statusClass = 'badge-danger';
    else if (r.clockInSeconds > 0 || r.actualHours > 0) statusClass = 'badge-success';

    let allowanceText = '-';
    if (r.isAbsent) allowanceText = `<span class="badge badge-danger">❌ ขาดงาน (Absent)</span>`;
    else if (r.isLate && r.isEarlyOut) allowanceText = `<span class="badge badge-danger">⚠️ สาย ${r.lateMinutes}น. + ออกก่อน ${r.earlyOutMinutes}น.</span>`;
    else if (r.isLate) allowanceText = `<span class="badge badge-danger">❌ สาย ${r.lateMinutes} นาที</span>`;
    else if (r.isEarlyOut) allowanceText = `<span class="badge badge-warning">⚠️ ออกก่อน ${r.earlyOutMinutes} นาที</span>`;
    else if (r.clockInSeconds > 0 || r.actualHours > 0) allowanceText = `<span class="badge badge-success">✅ ตรงเวลา</span>`;

    let actionBtn = '';
    if (r.isOverridden) {
      actionBtn = `<button class="btn btn-xs btn-outline text-muted" onclick="removeOverride('${r.empId}', '${r.dateStr}')" title="ยกเลิกการแก้ไข">❌ ยกเลิก</button>`;
    } else if (r.anomalyType || r.isLate || r.isEarlyOut) {
      actionBtn = `<button class="btn btn-xs btn-success" onclick="quickApproveOverride('${r.empId}', '${r.dateStr}', '${r.anomalyType || 'LATE/EARLY'}', 'อนุมัติจาก Employee Modal')" style="padding: 2px 6px; font-size: 0.7rem;">🟢 คืนสิทธิ์ +25฿</button>`;
    }

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
        <td class="font-mono ${r.isEarlyOut ? 'text-danger font-bold' : ''}">${r.clockOutStr}</td>
        <td class="text-center">${r.actualHours.toFixed(1)} / ${r.totalOT > 0 ? '+' + r.totalOT.toFixed(1) : '-'}</td>
        <td class="text-center">
          <span class="badge ${statusClass}">${r.statusText}</span>
          ${r.leaveReason ? `<br><span class="badge badge-warning mt-1" style="font-size:0.75rem; white-space:normal;">🛌 ${r.leaveReason}</span>` : ''}
          ${actionBtn ? `<div class="mt-1">${actionBtn}</div>` : ''}
        </td>
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
      <td class="text-center">${e.earlyOutDays || 0}</td>
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
    'ขาดงาน (Absent Days)': e.absentDays || 0,
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
    'สถานะสาย (Late Status)': r.isAbsent ? 'ขาดงาน (Absent)' : (r.isLate ? `สาย ${r.lateMinutes} นาที` : 'ตรงเวลา'),
    'เหตุผลการลา/ขาดงาน (Leave/Absent Reason)': r.isAbsent ? 'ขาดงาน (ไม่พบข้อมูลลา/แตะบัตร)' : (r.leaveReason || '-'),
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
  const recordsToExport = AppState.selectedModalMonth && AppState.selectedModalMonth !== 'ALL'
    ? emp.records.filter(r => r.dateStr.startsWith(AppState.selectedModalMonth))
    : emp.records;

  const records = recordsToExport.map(r => ({
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

  const suffix = AppState.selectedModalMonth && AppState.selectedModalMonth !== 'ALL' ? `_${AppState.selectedModalMonth}` : '';
  const worksheet = XLSX.utils.json_to_sheet(records);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, `Emp_${emp.empId}`);
  XLSX.writeFile(workbook, `Emp_${emp.empId}_Attendance${suffix}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

// Expose global modal functions for onclick attributes
window.openEmployeeModal = openEmployeeModal;
window.deleteHoliday = deleteHoliday;
window.goToDailyPage = goToDailyPage;
window.renderDisputeTab = renderDisputeTab;
window.filterDisputes = filterDisputes;
window.quickApproveOverride = quickApproveOverride;
window.removeOverride = removeOverride;
window.openManualTimeModal = openManualTimeModal;
window.closeManualTimeModal = closeManualTimeModal;
window.saveManualTimeOverride = saveManualTimeOverride;
window.bulkApproveSelected = bulkApproveSelected;
window.toggleSelectAllDisputes = toggleSelectAllDisputes;
window.exportDisputeXLSX = exportDisputeXLSX;

/**
 * Render Department Punctuality & Late Report Table (Tab 6)
 */
function renderDeptReportTable() {
  const tbody = document.getElementById('dept-report-tbody');
  const cardsContainer = document.getElementById('dept-kpi-cards');
  const badgeEl = document.getElementById('tab-dept-count');
  
  if (!tbody || !cardsContainer) return;

  const emps = Object.values(AppState.employeeSummary || {});
  const deptMap = {};

  emps.forEach(emp => {
    const d = emp.dept || 'ไม่ระบุแผนก';
    if (!deptMap[d]) {
      deptMap[d] = {
        deptName: d,
        empCount: 0,
        totalDaysWorked: 0,
        ontimeDays: 0,
        lateDays: 0,
        lateMinutes: 0,
        earlyOutDays: 0,
        absentDays: 0,
        allowance: 0,
        employees: []
      };
    }
    deptMap[d].empCount++;
    deptMap[d].totalDaysWorked += (emp.totalDaysWorked || 0);
    deptMap[d].ontimeDays += (emp.ontimeDays || 0);
    deptMap[d].lateDays += (emp.lateDays || 0);
    deptMap[d].lateMinutes += (emp.totalLateMinutes || 0);
    deptMap[d].earlyOutDays += (emp.earlyOutDays || 0);
    deptMap[d].absentDays += (emp.absentDays || 0);
    deptMap[d].allowance += (emp.totalAllowance || 0);
    deptMap[d].employees.push(emp);
  });

  const deptList = Object.values(deptMap).sort((a, b) => b.lateDays - a.lateDays);
  if (badgeEl) badgeEl.textContent = deptList.length;

  // Compute Overall KPI Stats across all departments
  const totalDepts = deptList.length;
  const totalWorkedAll = deptList.reduce((sum, d) => sum + d.totalDaysWorked, 0);
  const totalOntimeAll = deptList.reduce((sum, d) => sum + d.ontimeDays, 0);
  const totalLateAll = deptList.reduce((sum, d) => sum + d.lateDays, 0);
  const totalLateMinsAll = deptList.reduce((sum, d) => sum + d.lateMinutes, 0);
  const avgOntimeRate = totalWorkedAll > 0 ? ((totalOntimeAll / totalWorkedAll) * 100).toFixed(1) : '100.0';
  const mostLateDept = deptList.length > 0 ? deptList[0] : null;

  // Render Summary Cards
  cardsContainer.innerHTML = `
    <div class="control-box" style="padding: 1.2rem; border-left: 4px solid #3b82f6; background: var(--bg-card);">
      <div style="font-size: 0.82rem; color: var(--text-secondary); text-transform: uppercase; font-weight: 600;">🏢 จำนวนแผนกทั้งหมด</div>
      <div style="font-size: 1.8rem; font-weight: bold; color: var(--text-main); margin: 6px 0;">${totalDepts} <span style="font-size: 0.9rem; font-weight: normal; color: var(--text-muted);">แผนก</span></div>
      <div style="font-size: 0.78rem; color: var(--text-muted);">พนักงานรวม ${emps.length.toLocaleString()} คน</div>
    </div>
    <div class="control-box" style="padding: 1.2rem; border-left: 4px solid #10b981; background: var(--bg-card);">
      <div style="font-size: 0.82rem; color: var(--text-secondary); text-transform: uppercase; font-weight: 600;">🎉 อัตราความตรงเวลาเฉลี่ย</div>
      <div style="font-size: 1.8rem; font-weight: bold; color: #10b981; margin: 6px 0;">${avgOntimeRate}%</div>
      <div style="font-size: 0.78rem; color: var(--text-muted);">ตรงเวลา ${totalOntimeAll.toLocaleString()} จาก ${totalWorkedAll.toLocaleString()} วัน</div>
    </div>
    <div class="control-box" style="padding: 1.2rem; border-left: 4px solid #ef4444; background: var(--bg-card);">
      <div style="font-size: 0.82rem; color: var(--text-secondary); text-transform: uppercase; font-weight: 600;">🚨 แผนกที่มาสายมากที่สุด</div>
      <div style="font-size: 1.5rem; font-weight: bold; color: #ef4444; margin: 6px 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${mostLateDept ? mostLateDept.deptName : '-'}</div>
      <div style="font-size: 0.78rem; color: #ef4444;">มาสายสะสม ${mostLateDept ? mostLateDept.lateDays.toLocaleString() : 0} วัน (${mostLateDept ? mostLateDept.lateMinutes.toLocaleString() : 0} นาที)</div>
    </div>
    <div class="control-box" style="padding: 1.2rem; border-left: 4px solid #f59e0b; background: var(--bg-card);">
      <div style="font-size: 0.82rem; color: var(--text-secondary); text-transform: uppercase; font-weight: 600;">⏱️ เวลามารวมสายทั้งบริษัท</div>
      <div style="font-size: 1.8rem; font-weight: bold; color: #f59e0b; margin: 6px 0;">${totalLateMinsAll.toLocaleString()} <span style="font-size: 0.9rem; font-weight: normal; color: var(--text-muted);">นาที</span></div>
      <div style="font-size: 0.78rem; color: var(--text-muted);">คิดเป็น ${(totalLateMinsAll / 60).toFixed(1)} ชั่วโมงทำงาน</div>
    </div>
  `;

  if (deptList.length === 0) {
    tbody.innerHTML = '<tr><td colspan="12" class="text-center text-muted" style="padding: 2rem;">ไม่พบข้อมูลแผนก</td></tr>';
    return;
  }

  tbody.innerHTML = deptList.map((d, idx) => {
    const rate = d.totalDaysWorked > 0 ? ((d.ontimeDays / d.totalDaysWorked) * 100).toFixed(1) : '100.0';
    let rateClass = 'badge-success';
    if (parseFloat(rate) < 90) rateClass = 'badge-danger';
    else if (parseFloat(rate) < 95) rateClass = 'badge-warning';

    // Sort employees by late days descending and take top 3
    const topLate = [...d.employees].sort((a, b) => (b.lateDays || 0) - (a.lateDays || 0)).filter(e => e.lateDays > 0).slice(0, 3);
    const topLateHTML = topLate.length > 0 
      ? topLate.map((e, i) => `<div style="font-size: 0.82rem; margin-bottom: 3px;"><strong>#${i+1} ${e.empName}</strong> <span style="color: #ef4444; font-weight: 600;">(${e.lateDays} วัน / ${(e.totalLateMinutes||0)}น.)</span></div>`).join('')
      : '<span style="color: #10b981; font-size: 0.82rem;">✅ ไม่มีพนักงานมาสาย</span>';

    return `
      <tr>
        <td class="text-center"><strong>${idx + 1}</strong></td>
        <td><strong>🏢 ${d.deptName}</strong></td>
        <td class="text-center">${d.empCount}</td>
        <td class="text-center">${d.totalDaysWorked.toLocaleString()}</td>
        <td class="text-center" style="color: #10b981; font-weight: 600;">${d.ontimeDays.toLocaleString()}</td>
        <td class="text-center"><span class="badge badge-danger" style="font-size: 0.85rem;">${d.lateDays.toLocaleString()} วัน</span></td>
        <td class="text-center" style="color: #ef4444; font-weight: bold;">${d.lateMinutes.toLocaleString()}น.</td>
        <td class="text-center">${d.earlyOutDays.toLocaleString()}</td>
        <td class="text-center">${d.absentDays > 0 ? `<span style="color: #ef4444; font-weight: bold;">${d.absentDays}</span>` : '0'}</td>
        <td class="text-center" style="color: var(--accent-color); font-weight: bold;">${d.allowance.toLocaleString()} ฿</td>
        <td class="text-center"><span class="badge ${rateClass}" style="font-size: 0.85rem;">${rate}%</span></td>
        <td style="padding: 8px 10px;">${topLateHTML}</td>
      </tr>
    `;
  }).join('');
}

/**
 * Export Department Report to Excel (.xlsx)
 */
function exportDeptReportXLSX() {
  const emps = Object.values(AppState.employeeSummary || {});
  const deptMap = {};

  emps.forEach(emp => {
    const d = emp.dept || 'ไม่ระบุแผนก';
    if (!deptMap[d]) {
      deptMap[d] = { deptName: d, empCount: 0, totalDaysWorked: 0, ontimeDays: 0, lateDays: 0, lateMinutes: 0, earlyOutDays: 0, absentDays: 0, allowance: 0 };
    }
    deptMap[d].empCount++;
    deptMap[d].totalDaysWorked += (emp.totalDaysWorked || 0);
    deptMap[d].ontimeDays += (emp.ontimeDays || 0);
    deptMap[d].lateDays += (emp.lateDays || 0);
    deptMap[d].lateMinutes += (emp.totalLateMinutes || 0);
    deptMap[d].earlyOutDays += (emp.earlyOutDays || 0);
    deptMap[d].absentDays += (emp.absentDays || 0);
    deptMap[d].allowance += (emp.totalAllowance || 0);
  });

  const data = Object.values(deptMap).sort((a, b) => b.lateDays - a.lateDays).map((d, idx) => {
    const rate = d.totalDaysWorked > 0 ? ((d.ontimeDays / d.totalDaysWorked) * 100).toFixed(1) + '%' : '100.0%';
    return {
      'ลำดับ (No.)': idx + 1,
      'ชื่อแผนก (Department)': d.deptName,
      'จำนวนพนักงาน (Employees)': d.empCount,
      'วันทำงานรวม (Worked Days)': d.totalDaysWorked,
      'ตรงเวลา (On-time Days)': d.ontimeDays,
      'มาสายรวม (Late Days)': d.lateDays,
      'นาทีสายสะสม (Late Minutes)': d.lateMinutes,
      'ออกก่อนเวลา (Early Out Days)': d.earlyOutDays,
      'ขาดงาน (Absent Days)': d.absentDays,
      'ยอดเบิกค่าข้าว (Allowance Baht)': d.allowance,
      'อัตราตรงเวลา (Punctuality Rate)': rate
    };
  });

  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Department Late Summary');
  XLSX.writeFile(workbook, `HR_Department_Late_Report_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

/**
 * Export Department Report to Printable PDF Window
 */
function exportDeptReportPDF() {
  const emps = Object.values(AppState.employeeSummary || {});
  const deptMap = {};

  emps.forEach(emp => {
    const d = emp.dept || 'ไม่ระบุแผนก';
    if (!deptMap[d]) {
      deptMap[d] = { deptName: d, empCount: 0, totalDaysWorked: 0, ontimeDays: 0, lateDays: 0, lateMinutes: 0, earlyOutDays: 0, absentDays: 0, allowance: 0, employees: [] };
    }
    deptMap[d].empCount++;
    deptMap[d].totalDaysWorked += (emp.totalDaysWorked || 0);
    deptMap[d].ontimeDays += (emp.ontimeDays || 0);
    deptMap[d].lateDays += (emp.lateDays || 0);
    deptMap[d].lateMinutes += (emp.totalLateMinutes || 0);
    deptMap[d].earlyOutDays += (emp.earlyOutDays || 0);
    deptMap[d].absentDays += (emp.absentDays || 0);
    deptMap[d].allowance += (emp.totalAllowance || 0);
    deptMap[d].employees.push(emp);
  });

  const deptList = Object.values(deptMap).sort((a, b) => b.lateDays - a.lateDays);

  const printWin = window.open('', '_blank', 'width=1100,height=800');
  if (!printWin) {
    alert('กรุณาอนุญาต Pop-up window ในเบราว์เซอร์เพื่อเปิดรายงาน PDF');
    return;
  }

  let rowsHTML = deptList.map((d, idx) => {
    const rate = d.totalDaysWorked > 0 ? ((d.ontimeDays / d.totalDaysWorked) * 100).toFixed(1) : '100.0';
    const topLate = [...d.employees].sort((a, b) => (b.lateDays || 0) - (a.lateDays || 0)).filter(e => e.lateDays > 0).slice(0, 3);
    const topLateText = topLate.length > 0 
      ? topLate.map(e => `${e.empName} (${e.lateDays} วัน/${(e.totalLateMinutes||0)}น.)`).join(', ')
      : 'ไม่มีผู้มาสาย';

    return `
      <tr>
        <td style="text-align:center;">${idx + 1}</td>
        <td><strong>${d.deptName}</strong></td>
        <td style="text-align:center;">${d.empCount}</td>
        <td style="text-align:center;">${d.totalDaysWorked.toLocaleString()}</td>
        <td style="text-align:center; color:#166534; font-weight:bold;">${d.ontimeDays.toLocaleString()}</td>
        <td style="text-align:center; color:#991b1b; font-weight:bold;">${d.lateDays.toLocaleString()} วัน</td>
        <td style="text-align:center; color:#991b1b;">${d.lateMinutes.toLocaleString()} น.</td>
        <td style="text-align:center;">${d.earlyOutDays.toLocaleString()}</td>
        <td style="text-align:center;">${d.absentDays.toLocaleString()}</td>
        <td style="text-align:right; font-weight:bold;">${d.allowance.toLocaleString()} ฿</td>
        <td style="text-align:center;"><strong>${rate}%</strong></td>
        <td style="font-size: 8.5pt;">${topLateText}</td>
      </tr>
    `;
  }).join('');

  printWin.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Department Punctuality & Late Report - HERRENKNECHT (ASIA) LTD.</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;600;700&display=swap');
        body { font-family: 'Sarabun', -apple-system, BlinkMacSystemFont, sans-serif; margin: 0; padding: 25px; color: #1e293b; }
        .header { border-bottom: 3px solid #1d4ed8; padding-bottom: 12px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: flex-end; }
        .header h1 { margin: 0; font-size: 18pt; color: #1d4ed8; }
        .header p { margin: 4px 0 0 0; font-size: 10pt; color: #64748b; }
        .table { width: 100%; border-collapse: collapse; font-size: 9.5pt; margin-bottom: 30px; }
        .table th { background: #1e293b; color: #ffffff; padding: 8px 6px; border: 1px solid #1e293b; font-weight: 600; }
        .table td { padding: 7px 6px; border: 1px solid #cbd5e1; }
        .table tr:nth-child(even) { background: #f8fafc; }
        .sig-row { display: flex; justify-content: space-around; margin-top: 50px; page-break-inside: avoid; }
        .sig-box { text-align: center; width: 220px; font-size: 10pt; }
        .sig-line { border-bottom: 1px solid #475569; margin-bottom: 8px; height: 35px; }
        @media print {
          @page { size: A4 landscape; margin: 12mm; }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <div>
          <h1>HERRENKNECHT (ASIA) LTD.</h1>
          <p>🏢 รายงานสรุปการมาสายและความตรงเวลาแยกตามแผนก (Department Punctuality & Late Audit Report)</p>
        </div>
        <div style="text-align: right; font-size: 9.5pt; color: #64748b;">
          <strong>พิมพ์วันที่:</strong> ${new Date().toLocaleDateString('th-TH')}<br>
          <strong>ข้อมูลช่วงวันที่:</strong> ${document.getElementById('kpi-date-range') ? document.getElementById('kpi-date-range').textContent : '-'}
        </div>
      </div>

      <table class="table">
        <thead>
          <tr>
            <th style="width: 40px; text-align:center;">ลำดับ</th>
            <th>ชื่อแผนก (Department)</th>
            <th style="text-align:center;">จำนวนคน</th>
            <th style="text-align:center;">วันทำงานรวม</th>
            <th style="text-align:center;">✅ ตรงเวลา</th>
            <th style="text-align:center;">❌ มาสาย</th>
            <th style="text-align:center;">⏱️ นาทีสาย</th>
            <th style="text-align:center;">⚠️ ออกก่อน</th>
            <th style="text-align:center;">❌ ขาดงาน</th>
            <th style="text-align:right;">💰 ยอดเบิกค่าข้าว</th>
            <th style="text-align:center;">🎉 % ตรงเวลา</th>
            <th>🚨 พนักงานมาสายบ่อยสุดในแผนก</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHTML}
        </tbody>
      </table>

      <div class="sig-row">
        <div class="sig-box">
          <div class="sig-line"></div>
          <div>ผู้จัดทำรายงาน (Prepared by HR)</div>
          <div style="color: #64748b; font-size: 8.5pt; margin-top: 4px;">วันที่ ______/______/2026</div>
        </div>
        <div class="sig-box">
          <div class="sig-line"></div>
          <div>ผู้ตรวจสอบ (Reviewed by Manager)</div>
          <div style="color: #64748b; font-size: 8.5pt; margin-top: 4px;">วันที่ ______/______/2026</div>
        </div>
        <div class="sig-box">
          <div class="sig-line"></div>
          <div>ผู้อนุมัติ (Approved by Director)</div>
          <div style="color: #64748b; font-size: 8.5pt; margin-top: 4px;">วันที่ ______/______/2026</div>
        </div>
      </div>

      <script>
        window.onload = function() {
          window.print();
        };
      </script>
    </body>
    </html>
  `);
  printWin.document.close();
}

/**
 * Export Individual Employee History to Beautiful A4 PDF (Print Preview)
 */
function exportEmployeeToPDF() {
  if (!AppState.selectedEmployeeForModal) {
    alert('กรุณาเลือกหรือเปิดประวัติพนักงานก่อนทำการ Export PDF');
    return;
  }
  const empId = AppState.selectedEmployeeForModal;
  const emp = AppState.employeeSummary[empId];
  if (!emp) return;

  const filteredRecords = AppState.selectedModalMonth === 'ALL' || !AppState.selectedModalMonth
    ? emp.records
    : emp.records.filter(r => r.dateStr.startsWith(AppState.selectedModalMonth));

  const sortedRecords = [...filteredRecords].sort((a, b) => a.dateStr.localeCompare(b.dateStr));

  // Stats
  let totalDaysWorked = 0;
  let ontimeDays = 0;
  let lateDays = 0;
  let lateMinutesTotal = 0;
  let earlyOutDays = 0;
  let absentDays = 0;
  let totalAllowance = 0;
  let totalActualHours = 0;

  sortedRecords.forEach(r => {
    if (r.clockInSeconds > 0 || r.actualHours > 0 || r.leaveReason) totalDaysWorked++;
    if ((r.clockInSeconds > 0 || r.actualHours > 0) && !r.isLate) ontimeDays++;
    if (r.isLate) { lateDays++; lateMinutesTotal += (r.lateMinutes || 0); }
    if (r.isEarlyOut) earlyOutDays++;
    if (r.isAbsent) absentDays++;
    totalAllowance += (r.allowance || 0);
    totalActualHours += (r.actualHours || 0);
  });

  const printWin = window.open('', '_blank', 'width=950,height=850');
  if (!printWin) {
    alert('กรุณาอนุญาต Pop-up window ในเบราว์เซอร์เพื่อเปิดรายงาน PDF');
    return;
  }

  let rowsHTML = sortedRecords.map(r => {
    let statusBadge = '<span style="background:#dcfce7; color:#166534; padding:2px 6px; border-radius:4px; font-weight:bold;">✅ ตรงเวลา</span>';
    if (r.isAbsent) statusBadge = '<span style="background:#fee2e2; color:#991b1b; padding:2px 6px; border-radius:4px; font-weight:bold;">❌ ขาดงาน</span>';
    else if (r.isLate && r.isEarlyOut) statusBadge = `<span style="background:#fee2e2; color:#991b1b; padding:2px 6px; border-radius:4px; font-weight:bold;">⚠️ สาย ${r.lateMinutes}น. + ออกก่อน ${r.earlyOutMinutes}น.</span>`;
    else if (r.isLate) statusBadge = `<span style="background:#fee2e2; color:#991b1b; padding:2px 6px; border-radius:4px; font-weight:bold;">❌ สาย ${r.lateMinutes} นาที</span>`;
    else if (r.isEarlyOut) statusBadge = `<span style="background:#fef9c3; color:#854d0e; padding:2px 6px; border-radius:4px; font-weight:bold;">⚠️ ออกก่อน ${r.earlyOutMinutes} นาที</span>`;
    else if (r.leaveReason) statusBadge = `<span style="background:#e0e7ff; color:#3730a3; padding:2px 6px; border-radius:4px; font-weight:bold;">🏖️ ลา: ${r.leaveReason}</span>`;

    return `
      <tr>
        <td style="text-align:center;">${r.dateStr}</td>
        <td style="text-align:center;">${r.dayNameFull}</td>
        <td style="text-align:center;">${r.targetTimeStr}</td>
        <td style="text-align:center; font-weight:bold;">${r.clockInStr}</td>
        <td style="text-align:center; font-weight:bold;">${r.clockOutStr}</td>
        <td style="text-align:center;">${r.actualHours.toFixed(1)} ชม.</td>
        <td style="text-align:center;">${statusBadge}</td>
        <td style="text-align:right; font-weight:bold; color:${r.allowance > 0 ? '#166534' : '#64748b'};">${r.allowance > 0 ? '+' + r.allowance + ' ฿' : '-'}</td>
      </tr>
    `;
  }).join('');

  printWin.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Individual Attendance Report - ${emp.empName}</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;600;700&display=swap');
        body { font-family: 'Sarabun', -apple-system, BlinkMacSystemFont, sans-serif; margin: 0; padding: 25px; color: #1e293b; background: #fff; }
        .header { border-bottom: 3px solid #1d4ed8; padding-bottom: 15px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: flex-end; }
        .header h1 { margin: 0; font-size: 18pt; color: #1d4ed8; letter-spacing: 0.5px; }
        .header p { margin: 4px 0 0 0; font-size: 10.5pt; color: #64748b; }
        .profile-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 15px 20px; margin-bottom: 20px; display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; }
        .profile-item { font-size: 10pt; color: #64748b; }
        .profile-item strong { display: block; font-size: 12.5pt; color: #0f172a; margin-top: 3px; }
        .kpi-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 10px; margin-bottom: 25px; }
        .kpi-box { border: 1px solid #cbd5e1; border-radius: 6px; padding: 10px; text-align: center; background: #fff; }
        .kpi-box .val { font-size: 15pt; font-weight: bold; color: #1e293b; }
        .kpi-box .lbl { font-size: 8.5pt; color: #64748b; margin-top: 3px; }
        .table { width: 100%; border-collapse: collapse; font-size: 9.5pt; margin-bottom: 35px; }
        .table th { background: #1e293b; color: #ffffff; padding: 8px 6px; border: 1px solid #1e293b; font-weight: 600; }
        .table td { padding: 7px 6px; border: 1px solid #cbd5e1; }
        .table tr:nth-child(even) { background: #f8fafc; }
        .sig-row { display: flex; justify-content: space-around; margin-top: 45px; page-break-inside: avoid; }
        .sig-box { text-align: center; width: 230px; font-size: 10pt; }
        .sig-line { border-bottom: 1px solid #475569; margin-bottom: 8px; height: 35px; }
        @media print {
          @page { size: A4 portrait; margin: 15mm; }
          body { padding: 0; }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <div>
          <h1>HERRENKNECHT (ASIA) LTD.</h1>
          <p>👤 รายงานประวัติการทำงานและการแตะบัตรรายบุคคล (Employee Attendance & Allowance Report)</p>
        </div>
        <div style="text-align: right; font-size: 9.5pt; color: #64748b;">
          <strong>วันที่พิมพ์:</strong> ${new Date().toLocaleDateString('th-TH')}<br>
          <strong>เดือนที่แสดง:</strong> ${AppState.selectedModalMonth === 'ALL' || !AppState.selectedModalMonth ? 'ทั้งหมด' : AppState.selectedModalMonth}
        </div>
      </div>

      <div class="profile-card">
        <div class="profile-item">รหัสพนักงาน (Emp.ID)<strong>${emp.empId}</strong></div>
        <div class="profile-item">ชื่อ-นามสกุล (Name - Surname)<strong>${emp.empName}</strong></div>
        <div class="profile-item">แผนก (Department)<strong>🏢 ${emp.dept}</strong></div>
        <div class="profile-item">ชั่วโมงทำงานจริงรวม<strong>⏱️ ${totalActualHours.toFixed(1)} ชั่วโมง</strong></div>
      </div>

      <div class="kpi-grid">
        <div class="kpi-box"><div class="val">${totalDaysWorked}</div><div class="lbl">💼 วันทำงานรวม (วัน)</div></div>
        <div class="kpi-box" style="border-color:#bbf7d0; background:#f0fdf4;"><div class="val" style="color:#166534;">${ontimeDays}</div><div class="lbl">✅ ตรงเวลา (+25฿)</div></div>
        <div class="kpi-box" style="border-color:#fecaca; background:#fef2f2;"><div class="val" style="color:#991b1b;">${lateDays}</div><div class="lbl">❌ มาสาย (${lateMinutesTotal}น.)</div></div>
        <div class="kpi-box"><div class="val" style="color:#854d0e;">${earlyOutDays}</div><div class="lbl">⚠️ ออกก่อนเวลา (วัน)</div></div>
        <div class="kpi-box"><div class="val" style="color:#ef4444;">${absentDays}</div><div class="lbl">❌ ขาดงาน (วัน)</div></div>
        <div class="kpi-box" style="border-color:#bfdbfe; background:#eff6ff;"><div class="val" style="color:#1d4ed8;">${totalAllowance.toLocaleString()} ฿</div><div class="lbl">💰 ยอดได้ค่าข้าวรวม</div></div>
      </div>

      <h3 style="font-size: 11pt; color: #0f172a; margin-bottom: 10px; border-left: 4px solid #1d4ed8; padding-left: 8px;">📑 รายละเอียดบันทึกเวลาเข้า-ออกรายวัน (Daily Attendance History)</h3>
      <table class="table">
        <thead>
          <tr>
            <th style="width: 80px; text-align:center;">วันที่</th>
            <th style="width: 80px; text-align:center;">วันในสัปดาห์</th>
            <th style="width: 130px; text-align:center;">กะงานที่กำหนด</th>
            <th style="width: 75px; text-align:center;">เวลาเข้าจริง</th>
            <th style="width: 75px; text-align:center;">เวลาออกจริง</th>
            <th style="width: 70px; text-align:center;">ชั่วโมงทำงาน</th>
            <th style="text-align:center;">สถานะตรงเวลา / สาย / ลา</th>
            <th style="width: 80px; text-align:right;">ค่าข้าว (฿)</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHTML}
        </tbody>
      </table>

      <div class="sig-row">
        <div class="sig-box">
          <div class="sig-line"></div>
          <div>พนักงานเจ้าของประวัติ (Employee)</div>
          <div style="color: #64748b; font-size: 8.5pt; margin-top: 4px;">วันที่ ______/______/2026</div>
        </div>
        <div class="sig-box">
          <div class="sig-line"></div>
          <div>ผู้จัดการฝ่ายทรัพยากรบุคคล (HR Manager)</div>
          <div style="color: #64748b; font-size: 8.5pt; margin-top: 4px;">วันที่ ______/______/2026</div>
        </div>
      </div>

      <script>
        window.onload = function() {
          window.print();
        };
      </script>
    </body>
    </html>
  `);
  printWin.document.close();
}
