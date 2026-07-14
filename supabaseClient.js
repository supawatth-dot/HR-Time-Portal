require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY || '';

let supabase = null;
if (SUPABASE_URL && SUPABASE_KEY && SUPABASE_URL.startsWith('http')) {
  try {
    supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    console.log(`☁️ Supabase Client initialized for URL: ${SUPABASE_URL}`);
  } catch (err) {
    console.warn(`⚠️ Could not initialize Supabase client: ${err.message}`);
  }
} else {
  console.log(`ℹ️ Supabase credentials not configured in .env yet. Running in Local Storage / File Mode.`);
}

/**
 * Check connection status with Supabase Cloud
 */
async function checkSupabaseConnection() {
  if (!supabase) return { connected: false, message: 'Supabase credentials missing in .env file (SUPABASE_URL & SUPABASE_KEY)' };
  try {
    const { data, error, count } = await supabase.from('attendance_records').select('id', { count: 'exact', head: true });
    if (error) {
      // If table doesn't exist yet or connection issue
      return { connected: false, message: `Connected to Supabase project, but table error: ${error.message}` };
    }
    return { connected: true, recordCount: count || 0, url: SUPABASE_URL };
  } catch (err) {
    return { connected: false, message: `Connection test failed: ${err.message}` };
  }
}

/**
 * Batch Upsert processed attendance records into Supabase
 */
async function syncAttendanceRecordsToSupabase(records, batchUploadId = 'MANUAL_SYNC') {
  if (!supabase || !Array.isArray(records) || records.length === 0) return { success: false, message: 'Supabase not ready or empty records' };
  
  try {
    const rowsToUpsert = records.map(r => ({
      emp_id: String(r.empId || '').trim(),
      emp_name: String(r.empName || '').trim(),
      dept: String(r.dept || 'Workshop').trim(),
      work_date: r.dateStr,
      dws_code: r.dwsCode || '',
      dws_text: r.dwsText || '',
      leave_reason: r.leaveReason || '',
      clock_in_str: r.clockInStr || '-',
      clock_out_str: r.clockOutStr || '-',
      clock_in_seconds: Math.round(r.clockInSeconds || 0),
      clock_out_seconds: Math.round(r.clockOutSeconds || 0),
      actual_hours: parseFloat((r.actualHours || 0).toFixed(2)),
      total_ot: parseFloat((r.totalOT || 0).toFixed(2)),
      is_late: !!r.isLate,
      late_minutes: Math.round(r.lateMinutes || 0),
      is_early_out: !!r.isEarlyOut,
      early_out_minutes: Math.round(r.earlyOutMinutes || 0),
      is_absent: !!r.isAbsent,
      allowance: parseFloat((r.allowance || 0).toFixed(2)),
      status_text: r.statusText || '',
      anomaly_type: r.anomalyType || null,
      batch_upload_id: batchUploadId,
      updated_at: new Date().toISOString()
    })).filter(r => r.emp_id && r.work_date);

    // Chunk upserts into blocks of 500 records to prevent timeout
    let totalUpserted = 0;
    const chunkSize = 500;
    for (let i = 0; i < rowsToUpsert.length; i += chunkSize) {
      const chunk = rowsToUpsert.slice(i, i + chunkSize);
      const { error } = await supabase.from('attendance_records').upsert(chunk, { onConflict: 'emp_id,work_date' });
      if (error) {
        console.error(`Supabase batch upsert error on chunk ${i}:`, error.message);
        return { success: false, message: `Error syncing batch chunk: ${error.message}` };
      }
      totalUpserted += chunk.length;
    }

    return { success: true, count: totalUpserted, message: `บันทึกและซิงค์ข้อมูล ${totalUpserted} รายการลง Supabase ถาวรเรียบร้อยแล้ว!` };
  } catch (err) {
    console.error('syncAttendanceRecordsToSupabase exception:', err);
    return { success: false, message: err.message };
  }
}

/**
 * Fetch all HR Overrides from Supabase
 */
async function getOverridesFromSupabase() {
  if (!supabase) return {};
  try {
    const { data, error } = await supabase.from('attendance_overrides').select('*');
    if (error) throw error;
    const overridesMap = {};
    (data || []).forEach(o => {
      const key = `${o.emp_id}_${o.work_date}`;
      overridesMap[key] = {
        empId: o.emp_id,
        dateStr: o.work_date,
        correctedIn: o.corrected_in,
        correctedOut: o.corrected_out,
        status: o.status,
        remark: o.remark,
        approvedBy: o.approved_by
      };
    });
    return overridesMap;
  } catch (err) {
    console.error('getOverridesFromSupabase error:', err.message);
    return {};
  }
}

/**
 * Save an HR Override to Supabase
 */
async function saveOverrideToSupabase(empId, workDate, overrideData) {
  if (!supabase) return { success: false };
  try {
    const row = {
      emp_id: String(empId).trim(),
      work_date: workDate,
      corrected_in: overrideData.correctedIn || null,
      corrected_out: overrideData.correctedOut || null,
      status: overrideData.status || 'APPROVED',
      remark: overrideData.remark || '',
      approved_by: overrideData.approvedBy || 'HR Officer',
      updated_at: new Date().toISOString()
    };
    const { error } = await supabase.from('attendance_overrides').upsert(row, { onConflict: 'emp_id,work_date' });
    if (error) throw error;
    return { success: true };
  } catch (err) {
    console.error('saveOverrideToSupabase error:', err.message);
    return { success: false, message: err.message };
  }
}

/**
 * Delete an HR Override from Supabase
 */
async function removeOverrideFromSupabase(empId, workDate) {
  if (!supabase) return { success: false };
  try {
    const { error } = await supabase.from('attendance_overrides').delete().match({ emp_id: String(empId).trim(), work_date: workDate });
    if (error) throw error;
    return { success: true };
  } catch (err) {
    console.error('removeOverrideFromSupabase error:', err.message);
    return { success: false, message: err.message };
  }
}

/**
 * Fetch Company Holidays from Supabase
 */
async function getHolidaysFromSupabase() {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.from('company_holidays').select('*').order('holiday_date', { ascending: true });
    if (error) throw error;
    return (data || []).map(h => ({
      date: h.holiday_date,
      name: h.holiday_name,
      isPreHoliday: !!h.is_pre_holiday
    }));
  } catch (err) {
    console.error('getHolidaysFromSupabase error:', err.message);
    return null;
  }
}

/**
 * Save Company Holidays array to Supabase
 */
async function saveHolidaysToSupabase(holidaysArray) {
  if (!supabase || !Array.isArray(holidaysArray)) return { success: false };
  try {
    // Upsert each holiday
    const rows = holidaysArray.map(h => ({
      holiday_date: h.date,
      holiday_name: h.name || 'Company Holiday',
      is_pre_holiday: !!h.isPreHoliday
    })).filter(h => h.holiday_date);

    if (rows.length > 0) {
      const { error } = await supabase.from('company_holidays').upsert(rows, { onConflict: 'holiday_date' });
      if (error) throw error;
    }
    return { success: true };
  } catch (err) {
    console.error('saveHolidaysToSupabase error:', err.message);
    return { success: false, message: err.message };
  }
}

module.exports = {
  supabase,
  checkSupabaseConnection,
  syncAttendanceRecordsToSupabase,
  getOverridesFromSupabase,
  saveOverrideToSupabase,
  removeOverrideFromSupabase,
  getHolidaysFromSupabase,
  saveHolidaysToSupabase
};
