-- ==============================================================================
-- HR-Time Workshop Attendance Portal — Supabase PostgreSQL Schema Setup
-- Developed for HERRENKNECHT (ASIA) LTD.
-- ==============================================================================
-- วิธีการติดตั้ง: คัดลอกสคริปต์ทั้งหมดด้านล่างไปวางใน Supabase Dashboard -> SQL Editor -> Run
-- ==============================================================================

-- 1. ตารางเก็บบันทึกเวลาเข้า-ออกงานรายวัน (Attendance Records)
CREATE TABLE IF NOT EXISTS public.attendance_records (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    emp_id VARCHAR(50) NOT NULL,
    emp_name VARCHAR(255),
    dept VARCHAR(150),
    work_date DATE NOT NULL,
    dws_code VARCHAR(50),
    dws_text VARCHAR(150),
    leave_reason VARCHAR(255),
    clock_in_str VARCHAR(20),
    clock_out_str VARCHAR(20),
    clock_in_seconds INTEGER DEFAULT 0,
    clock_out_seconds INTEGER DEFAULT 0,
    actual_hours NUMERIC(6,2) DEFAULT 0.00,
    total_ot NUMERIC(6,2) DEFAULT 0.00,
    is_late BOOLEAN DEFAULT false,
    late_minutes INTEGER DEFAULT 0,
    is_early_out BOOLEAN DEFAULT false,
    early_out_minutes INTEGER DEFAULT 0,
    is_absent BOOLEAN DEFAULT false,
    allowance NUMERIC(6,2) DEFAULT 0.00,
    status_text VARCHAR(255),
    anomaly_type VARCHAR(50),
    batch_upload_id VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_emp_date UNIQUE (emp_id, work_date)
);

-- สร้าง Indexes สำหรับเพิ่มความเร็วในการ Query แยกตามพนักงาน, วันที่ และแผนก
CREATE INDEX IF NOT EXISTS idx_attendance_emp_id ON public.attendance_records(emp_id);
CREATE INDEX IF NOT EXISTS idx_attendance_work_date ON public.attendance_records(work_date);
CREATE INDEX IF NOT EXISTS idx_attendance_dept ON public.attendance_records(dept);
CREATE INDEX IF NOT EXISTS idx_attendance_is_late ON public.attendance_records(is_late);

-- 2. ตารางเก็บประวัติการปรับแก้เวลาและการอนุมัติค่าข้าวโดย HR (HR Overrides)
CREATE TABLE IF NOT EXISTS public.attendance_overrides (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    emp_id VARCHAR(50) NOT NULL,
    work_date DATE NOT NULL,
    corrected_in VARCHAR(20),
    corrected_out VARCHAR(20),
    status VARCHAR(50) DEFAULT 'APPROVED',
    approved_by VARCHAR(150) DEFAULT 'HR Officer / System',
    remark TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_override_emp_date UNIQUE (emp_id, work_date)
);

CREATE INDEX IF NOT EXISTS idx_overrides_emp_date ON public.attendance_overrides(emp_id, work_date);

-- 3. ตารางตารางงานเข้ากะพิเศษ (Shift Master Schedules — เช่น Night Shift 15:30/16:30)
CREATE TABLE IF NOT EXISTS public.shift_schedules (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    emp_id VARCHAR(50) NOT NULL,
    work_date DATE NOT NULL,
    target_seconds INTEGER NOT NULL,
    target_out_seconds INTEGER NOT NULL,
    target_str VARCHAR(50),
    is_night_shift BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_shift_emp_date UNIQUE (emp_id, work_date)
);

CREATE INDEX IF NOT EXISTS idx_shift_emp_date ON public.shift_schedules(emp_id, work_date);

-- 4. ตารางวันหยุดบริษัทและวันศุกร์ก่อนหยุด (Company Holidays)
CREATE TABLE IF NOT EXISTS public.company_holidays (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    holiday_date DATE UNIQUE NOT NULL,
    holiday_name VARCHAR(255) NOT NULL,
    is_pre_holiday BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. ตารางเกณฑ์คำนวณแยกตามแผนก (Department Rules)
CREATE TABLE IF NOT EXISTS public.department_rules (
    dept_name VARCHAR(150) PRIMARY KEY,
    mode VARCHAR(50) DEFAULT 'dws',
    late_tolerance_sec INTEGER DEFAULT 0,
    check_in_ceiling_sec INTEGER DEFAULT 32400,
    min_hours_required NUMERIC(4,2) DEFAULT 8.00,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================================================
-- การตั้งค่าความปลอดภัยระดับตาราง (Row-Level Security: RLS)
-- เปิดสิทธิ์แบบ Permissive สำหรับระบบเครือข่ายภายในองค์กร (Enterprise HR Portal)
-- ==============================================================================
ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shift_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.department_rules ENABLE ROW LEVEL SECURITY;

-- นโยบายเปิดให้ระบบหลังบ้านและ HR ภายในองค์กรอ่าน/เขียนข้อมูลได้ผ่าน Service & Anon Key
DROP POLICY IF EXISTS "Allow all internal access on attendance_records" ON public.attendance_records;
CREATE POLICY "Allow all internal access on attendance_records" ON public.attendance_records FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all internal access on attendance_overrides" ON public.attendance_overrides;
CREATE POLICY "Allow all internal access on attendance_overrides" ON public.attendance_overrides FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all internal access on shift_schedules" ON public.shift_schedules;
CREATE POLICY "Allow all internal access on shift_schedules" ON public.shift_schedules FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all internal access on company_holidays" ON public.company_holidays;
CREATE POLICY "Allow all internal access on company_holidays" ON public.company_holidays FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all internal access on department_rules" ON public.department_rules;
CREATE POLICY "Allow all internal access on department_rules" ON public.department_rules FOR ALL USING (true) WITH CHECK (true);

-- สั่งแสดงสถานะหลังรัน SQL สำเร็จ
SELECT '🎉 Supabase Database Schema for HR-Time Portal successfully installed!' as status_message;
