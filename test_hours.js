const XLSX = require('xlsx');

function excelSerialToTimeInfo(serial) {
  if (serial === null || serial === undefined || serial === '') return { str: '-', seconds: 0 };
  let serialTime = 0;
  if (typeof serial === 'string') {
    const s = serial.trim();
    if (s.includes(':')) {
      const parts = s.split(':');
      const h = parseInt(parts[0], 10) || 0;
      const m = parseInt(parts[1], 10) || 0;
      const sec = parseInt(parts[2], 10) || 0;
      return {
        str: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
        seconds: h * 3600 + m * 60 + sec
      };
    }
    serialTime = parseFloat(s);
  } else {
    serialTime = parseFloat(serial);
  }
  if (isNaN(serialTime) || serialTime > 10000) return { str: '-', seconds: 0 };

  const totalSeconds = Math.round(serialTime * 86400);
  const hours = Math.floor(totalSeconds / 3600) % 24;
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  return {
    str: `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`,
    seconds: totalSeconds
  };
}

const workbook = XLSX.readFile('public/Clock in and out_01.01.26 to 30.06.26.xlsx');
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const data = XLSX.utils.sheet_to_json(sheet, {header: 1});
const records = data.slice(1);

let changed = 0;
let newPass8h = 0;

records.forEach(row => {
  if (!row[0]) return;
  const clockInInfo = excelSerialToTimeInfo(row[5]);
  const clockOutInfo = excelSerialToTimeInfo(row[6]);
  
  const excelHours = parseFloat(row[8]) || parseFloat(row[7]) || 0;
  let calcHours = excelHours;
  
  if (clockInInfo.seconds > 0 && clockOutInfo.seconds > 0) {
    let diffSecs = clockOutInfo.seconds - clockInInfo.seconds;
    if (diffSecs < 0) diffSecs += 86400; // Crossed midnight
    
    let ch = diffSecs / 3600;
    if (ch > 5) {
      ch -= 1; // Deduct 1 hour lunch break
    }
    calcHours = ch;
  }
  
  if (Math.abs(calcHours - excelHours) > 0.1) {
    changed++;
    if (excelHours < 8 && calcHours >= 8) {
      newPass8h++;
    }
  }
});

console.log(`Total records: ${records.length}`);
console.log(`Records with changed hours: ${changed}`);
console.log(`Records that NOW pass 8 hours (were <8 before): ${newPass8h}`);
