const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Configure multer for uploads
const upload = multer({ dest: path.join(__dirname, 'uploads/') });

const HOLIDAYS_FILE = path.join(__dirname, 'holidays.json');
const DEFAULT_EXCEL_PATH = path.join(__dirname, 'Clock in and out_01.01.26 to 30.06.26.xlsx');

// Helper to load holidays
function getHolidays() {
  try {
    if (fs.existsSync(HOLIDAYS_FILE)) {
      const data = fs.readFileSync(HOLIDAYS_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('Error reading holidays:', err);
  }
  return [];
}

// Helper to save holidays
function saveHolidays(holidays) {
  try {
    fs.writeFileSync(HOLIDAYS_FILE, JSON.stringify(holidays, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('Error saving holidays:', err);
    return false;
  }
}

// API: Get current holidays
app.get('/api/holidays', (req, res) => {
  res.json({ success: true, holidays: getHolidays() });
});

// API: Save/Update holidays
app.post('/api/holidays', (req, res) => {
  const { holidays } = req.body;
  if (!Array.isArray(holidays)) {
    return res.status(400).json({ success: false, message: 'Invalid holidays format' });
  }
  if (saveHolidays(holidays)) {
    res.json({ success: true, message: 'บันทึกข้อมูลวันหยุดบริษัทเรียบร้อยแล้ว', holidays });
  } else {
    res.status(500).json({ success: false, message: 'ไม่สามารถบันทึกไฟล์วันหยุดได้' });
  }
});

// Helper: Load Master Shift Schedule from Data/shipt, Data/shift, and root
function getMasterShifts() {
  const shiftMap = {};
  try {
    const xlsx = require('xlsx');
    const searchDirs = [
      path.join(__dirname, 'Data', 'shipt'),
      path.join(__dirname, 'Data', 'shift'),
      path.join(__dirname, 'Data'),
      __dirname
    ];
    searchDirs.forEach(dir => {
      if (fs.existsSync(dir)) {
        fs.readdirSync(dir).forEach(file => {
          if (file.endsWith('.xlsx') && (file.toLowerCase().includes('shift') || file.toLowerCase().includes('shipt') || dir.toLowerCase().includes('data'))) {
            const filePath = path.join(dir, file);
            try {
              const wb = xlsx.readFile(filePath);
              wb.SheetNames.forEach(s => {
                const rows = xlsx.utils.sheet_to_json(wb.Sheets[s], { header: 1 });
                rows.forEach(r => {
                  const dt = r[0];
                  const id = r[1];
                  const inTime = r[3];
                  if (typeof dt === 'number' && id && id !== 'Emp.ID' && id !== 'Signature:' && id !== 'Name:') {
                    const dateObj = new Date(Math.round((dt - 25569) * 86400 * 1000));
                    const dateStr = dateObj.toISOString().slice(0, 10);
                    const empId = String(id).trim();
                    const sTime = String(inTime || '').trim();
                    
                    let targetSeconds = 54000;
                    let targetStr = '15:00 (N1)';
                    let isNightShift = true;

                    if (sTime === '03.30' || sTime === '15.30' || sTime === '15:30' || sTime === '3.30' || sTime === '3:30') {
                      targetSeconds = 55800; targetStr = '15:30 (N2)'; isNightShift = true;
                    } else if (sTime === '04.30' || sTime === '16.30' || sTime === '16:30' || sTime === '4.30' || sTime === '4:30') {
                      targetSeconds = 59400; targetStr = '16:30 (N)'; isNightShift = true;
                    } else if (sTime === '04.00' || sTime === '16.00' || sTime === '16:00' || sTime === '4.00' || sTime === '4:00') {
                      targetSeconds = 57600; targetStr = '16:00 (N3)'; isNightShift = true;
                    } else if (sTime === '03.00' || sTime === '15.00' || sTime === '15:00' || sTime === '3.00' || sTime === '3:00') {
                      targetSeconds = 54000; targetStr = '15:00 (N1)'; isNightShift = true;
                    } else if (sTime === '05.30' || sTime === '17.30' || sTime === '17:30' || sTime === '5.30' || sTime === '5:30') {
                      targetSeconds = 63000; targetStr = '17:30 (N4)'; isNightShift = true;
                    } else if (sTime === '08.00' || sTime === '08:00' || sTime === '8.00' || sTime === '8:00') {
                      targetSeconds = 28800; targetStr = '08:00'; isNightShift = false;
                    } else if (sTime === '07.00' || sTime === '07:00' || sTime === '7.00' || sTime === '7:00') {
                      targetSeconds = 25200; targetStr = '07:00'; isNightShift = false;
                    }

                    const masterData = { empId, date: dateStr, inTime: sTime, targetSeconds, targetStr, isNightShift, normInSecs: targetSeconds };
                    shiftMap[empId + '_' + dateStr] = masterData;
                    shiftMap[parseInt(empId, 10) + '_' + dateStr] = masterData;
                  }
                });
              });
            } catch (err) {}
          }
        });
      }
    });
  } catch (err) {
    console.error('Error reading shift master data:', err);
  }
  return shiftMap;
}

// API: Get Master Shift Schedule from Data/shipt
app.get('/api/shift-master', (req, res) => {
  const shiftMap = getMasterShifts();
  res.json({ success: true, count: Object.keys(shiftMap).length, shiftMap });
});

// Helper to parse Excel file into raw JSON rows
function parseExcelFile(filePath) {
  // We use SheetJS if installed, or dynamic require
  try {
    const xlsx = require('xlsx');
    const workbook = xlsx.readFile(filePath, { cellDates: false });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    // Convert to JSON with raw values to preserve fractional dates & times accurately
    const rawRows = xlsx.utils.sheet_to_json(worksheet, { header: 1, raw: true });
    return rawRows;
  } catch (err) {
    console.error('SheetJS parse error:', err);
    throw err;
  }
}

// API: Get default pre-loaded Excel file data
app.get('/api/default-excel', (req, res) => {
  if (!fs.existsSync(DEFAULT_EXCEL_PATH)) {
    return res.status(404).json({ success: false, message: 'ไม่พบไฟล์ Excel มาตรฐานในระบบ' });
  }
  try {
    const rawRows = parseExcelFile(DEFAULT_EXCEL_PATH);
    res.json({
      success: true,
      filename: 'Clock in and out_01.01.26 to 30.06.26.xlsx',
      totalRows: rawRows.length - 1,
      headers: rawRows[0],
      rows: rawRows.slice(1)
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการประมวลผลไฟล์ Excel: ' + err.message });
  }
});

// API: Upload new Excel file
app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'กรุณาเลือกไฟล์ Excel ที่ต้องการอัปโหลด' });
  }
  try {
    const rawRows = parseExcelFile(req.file.path);
    // Remove temp file after parsing
    fs.unlinkSync(req.file.path);

    res.json({
      success: true,
      filename: req.file.originalname,
      totalRows: rawRows.length - 1,
      headers: rawRows[0],
      rows: rawRows.slice(1)
    });
  } catch (err) {
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ success: false, message: 'ไม่สามารถอ่านไฟล์ Excel ได้: ' + err.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 HR-Time Workshop Attendance Portal running on http://localhost:${PORT}`);
});
