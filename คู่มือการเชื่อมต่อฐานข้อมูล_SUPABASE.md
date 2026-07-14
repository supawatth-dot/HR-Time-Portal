# 🚀 คู่มือการเชื่อมต่อและเปิดใช้งานฐานข้อมูล Supabase Cloud Database
**สำหรับระบบ HR-Time Workshop Attendance Portal (HERRENKNECHT ASIA LTD.)**

---

## 📋 ขั้นตอนที่ 1: สร้าง Project ใน Supabase และรันสคริปต์ตาราง (SQL Migration)
1. เข้าไปที่เว็บไซต์ [https://supabase.com](https://supabase.com) แล้วลงชื่อเข้าใช้ (หรือสมัครสมาชิกฟรี)
2. กดปุ่ม **"New Project"** -> ตั้งชื่อ Project ว่า `HERRENKNECHT-HR-PORTAL` -> เลือก Region `Southeast Asia (Singapore)`
3. เมื่อสร้างเสร็จแล้ว ให้เข้าไปที่เมนูด้านซ้ายเลือก **`SQL Editor`** -> **`New Query`**
4. เปิดไฟล์ **`c:\Time\HR-Time-Portal\supabase_schema.sql`** ในคอมพิวเตอร์ของคุณ -> **คัดลอกโค้ด SQL ทั้งหมด** ในไฟล์นั้นไปวางลงในช่อง SQL Editor บนเว็บ Supabase -> กดปุ่ม **`Run`** (ปุ่มสีเขียวด้านล่างขวา)
   * ✨ ระบบจะสร้างตารางทั้ง 5 ตาราง (`attendance_records`, `attendance_overrides`, `shift_schedules`, `company_holidays`, และ `department_rules`) พร้อมตั้งค่าความปลอดภัย RLS ให้โดยอัตโนมัติภายใน 1 วินาที!

---

## 🔑 ขั้นตอนที่ 2: คัดลอก URL และ API Key มาใส่ในไฟล์ `.env` บนเซิร์ฟเวอร์
1. ในหน้าเว็บ Supabase ไปที่เมนูตั้งค่า **`Project Settings` (ไอคอนเฟืองด้านซ้ายล่าง)** -> เลือกหัวข้อ **`API`**
2. คัดลอกค่า 2 ส่วนนี้มา:
   * **Project URL:** เช่น `https://xyz...supabase.co`
   * **Project API Keys (`anon` public):** คีย์ยาวๆ ที่เริ่มต้นด้วย `eyJ...`
3. ในโฟลเดอร์ระบบ `c:\Time\HR-Time-Portal\` ให้สร้างไฟล์ชื่อ **`.env`** (หรือคัดลอกจากไฟล์ `.env.example`)
4. วางค่าที่ได้ลงในไฟล์ `.env` ดังตัวอย่างนี้:
```env
SUPABASE_URL=https://ของคุณ.supabase.co
SUPABASE_KEY=คีย์anonของคุณที่ได้จากหน้าเว็บ
PORT=3000
```
5. บันทึกไฟล์ `.env` แล้วเปิดเซิร์ฟเวอร์ใหม่โดยดับเบิ้ลคลิกไฟล์ `1. START-PORTAL-BACKGROUND.bat` หรือรัน `node server.js`

---

## 💻 ขั้นตอนที่ 3: ตรวจสอบการทำงานบนหน้าเว็บ
1. เปิดเบราว์เซอร์ไปที่ **[http://localhost:3000](http://localhost:3000)** หรือ LAN IP ของคุณ
2. สังเกตที่ปุ่มมุมบนขวาในแถบเมนู:
   * **ถ้าเชื่อมต่อสำเร็จ:** ปุ่มจะเปลี่ยนเป็นสีเขียวระบุว่า **`☁️ Supabase: Connected`** และมีปุ่ม **`☁️ ซิงค์ขึ้น Cloud`** ปรากฏขึ้นข้างๆ
   * **การซิงค์ข้อมูล (Cloud Sync):** เมื่อคุณกดปุ่ม **`☁️ ซิงค์ขึ้น Cloud`** ระบบจะนำข้อมูลตารางการแตะบัตรและสถิติทุกลำดับส่งไปจัดเก็บในตาราง `attendance_records` บน Supabase PostgreSQL ถาวรทันที!
   * **ระบบประวัติการปรับแก้เวลาและการอนุมัติ (Overrides):** ทุกครั้งที่คุณกดอนุมัติปรับแก้เวลา หรือขอคืนสิทธิ์ค่าข้าวในหน้าเว็บ ข้อมูลจะถูกบันทึกลงตาราง `attendance_overrides` บน Supabase แบบ Real-time ทันที ทำให้ HR ทุกท่านที่เปิดหน้าเว็บอยู่เห็นข้อมูลตรงกัน 100%!

---
🎉 **เพียงเท่านี้ ระบบ HR-Time Portal ของคุณก็มีฐานข้อมูล PostgreSQL ระดับ Enterprise บน Cloud ที่พร้อมใช้งาน 24 ชั่วโมงแล้วครับ!**
