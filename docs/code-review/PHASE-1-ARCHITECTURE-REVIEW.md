# Phase 1 – Architecture Review: HR-Time-Portal

**วันที่ตรวจสอบ:** 14 กรกฎาคม 2026
**ขอบเขต:** Project Structure · package.json · Next.js Configuration · Environment Variables · Dependencies · Security Baseline
**ระดับความรุนแรง:** 🔴 Critical (ต้องแก้ทันที) · 🟠 High (แก้ก่อนใช้งานจริงต่อ) · 🟡 Medium (ควรแก้) · 🔵 Low / ข้อเสนอแนะ

---

## สรุปผู้บริหาร (Executive Summary)

โปรเจกต์นี้ **ไม่ใช่ Next.js** แต่เป็น **Express.js + Static HTML/Vanilla JS** ที่ deploy สองโหมดพร้อมกัน (Local Express server + GitHub Pages) จุดที่ต้องดำเนินการทันทีคือด้านความปลอดภัยของข้อมูล: มี **ข้อมูลส่วนบุคคลของพนักงานจริง (ชื่อ, รหัสพนักงาน, เวลาเข้า-ออกงาน) ถูก deploy ขึ้น GitHub Pages แบบสาธารณะ**, ไฟล์ **`.env` พร้อม Supabase key ถูก commit ลง git**, และ **RLS policy ของ Supabase เปิดให้อ่าน/เขียนได้ทั้งหมดด้วย anon key** — สามข้อนี้รวมกันหมายความว่า บุคคลภายนอกสามารถเข้าถึงและแก้ไขข้อมูล HR ทั้งหมดได้

| หมวด | ผลการตรวจ | จำนวนประเด็น |
|---|---|---|
| Security Baseline | ❌ ไม่ผ่าน | 🔴 3 · 🟠 4 |
| Environment Variables | ❌ ไม่ผ่าน | 🔴 1 |
| Dependencies | ⚠️ มีความเสี่ยง | 🟠 1 · 🟡 2 |
| Project Structure | ⚠️ ต้องจัดระเบียบ | 🟡 4 |
| package.json | ⚠️ ขาดข้อมูลสำคัญ | 🟡 3 |
| Next.js Configuration | N/A (ไม่ใช่ Next.js) | — |

---

## 1. Security Baseline

### 🔴 SEC-1: ข้อมูลส่วนบุคคลพนักงานจริงถูกเผยแพร่สาธารณะผ่าน GitHub Pages

**ไฟล์:** `public/Clock in and out_01.01.26 to 30.06.26.xlsx` (1.3 MB, ~110,000 เซลล์)

ไฟล์ Excel ในโฟลเดอร์ `public/` มี **ชื่อ-นามสกุลจริง, รหัสพนักงาน, ประเภทการลา (รวมถึงลาป่วย), เวลาเข้า-ออกงาน** ของพนักงานจำนวนมาก และ workflow `.github/workflows/deploy.yml` deploy โฟลเดอร์ `public/` ทั้งโฟลเดอร์ขึ้น GitHub Pages ทำให้ไฟล์นี้**ดาวน์โหลดได้จาก URL สาธารณะโดยไม่ต้อง login** ข้อมูลลาป่วย/ลากิจถือเป็นข้อมูลส่วนบุคคลตาม PDPA (พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล) — การรั่วไหลลักษณะนี้มีความเสี่ยงทางกฎหมายโดยตรง

ไฟล์เดียวกันยังซ้ำอยู่อีกหลายที่ใน git: root, `Data/backup/` (2 ชุด), รวมทั้ง `Nigth Shift of Apr 2026.xlsx` (root, `Data/shift/`, `Data/shipt/`) และ PDF วันหยุดบริษัท

**แนวทางแก้ไข:**
1. ลบไฟล์ .xlsx / .pdf / .docx ที่มีข้อมูลจริงออกจาก repo และ **ล้างประวัติ git** (`git filter-repo`) เพราะการลบเฉย ๆ ข้อมูลยังอยู่ใน history
2. ปิด/ตรวจสอบ GitHub Pages site ที่ deploy ไปแล้ว
3. ถ้าต้องมีไฟล์ตัวอย่างสำหรับ dev ให้สร้างไฟล์ mock data ที่ไม่ใช่ข้อมูลจริง
4. เพิ่ม `*.xlsx`, `*.pdf`, `*.docx` ลง `.gitignore`

### 🔴 SEC-2: `.env` พร้อม Supabase credentials ถูก commit ลง git

**ไฟล์:** `.env` (tracked ใน git, commit `a5bc589`)

`.env` มี `SUPABASE_URL` และ `SUPABASE_KEY` ตัวจริง และ `.gitignore` ไม่มีบรรทัด `.env` — ใครก็ตามที่เข้าถึง repo ได้จะได้ key ไปทันที (และ URL โปรเจกต์ Supabase ยังถูก hardcode ซ้ำใน `public/js/supabase-config.js` ที่เผยแพร่สาธารณะ)

**แนวทางแก้ไข:**
1. **Rotate key ใน Supabase Dashboard ทันที** (ถือว่า key ปัจจุบันรั่วแล้ว)
2. `git rm --cached .env`, เพิ่ม `.env` ใน `.gitignore`, และล้าง history
3. สร้าง `.env.example` ที่มีเฉพาะชื่อตัวแปร (ไม่มีค่า) ไว้เป็นแม่แบบ

### 🔴 SEC-3: RLS Policy เปิดกว้าง `USING (true) WITH CHECK (true)` ทุกตาราง

**ไฟล์:** `supabase_schema.sql:106-120`

ทุกตาราง (attendance_records, attendance_overrides, shift_schedules, company_holidays, department_rules) เปิด RLS แต่สร้าง policy แบบ `FOR ALL USING (true) WITH CHECK (true)` ซึ่งเท่ากับ**ไม่มี RLS เลย** — เมื่อรวมกับ anon key ที่รั่ว (SEC-2) และ URL ที่เผยแพร่ (supabase-config.js) แปลว่า**บุคคลภายนอกอ่าน แก้ไข และลบข้อมูล HR ทั้งหมดได้ผ่าน REST API โดยตรง** รวมถึงแก้ไขบันทึกเวลาทำงานและค่าเบี้ยเลี้ยงของตัวเองหรือผู้อื่น

**แนวทางแก้ไข:**
1. ใช้ Supabase Auth และเขียน policy จำกัดตาม role (เช่น HR อ่าน/เขียนได้, พนักงานอ่านได้เฉพาะของตนเอง)
2. หากยังไม่พร้อมทำ Auth อย่างน้อยที่สุดให้จำกัด anon key เป็น read-only เฉพาะตารางที่จำเป็น และย้ายการเขียนทั้งหมดไปผ่าน server ที่ใช้ service key (เก็บฝั่ง server เท่านั้น)

### 🟠 SEC-4: API ทั้งหมดไม่มี Authentication / Authorization

**ไฟล์:** `server.js` (ทุก endpoint)

ทุก endpoint เปิด public หมด รวมถึงตัวอันตราย:
- `POST /api/clear` (`server.js:228`) — ล้างข้อมูล/ย้ายไฟล์ Excel หลักทิ้ง ใครในเครือข่ายก็เรียกได้
- `POST /api/holidays` (`server.js:52`) — เขียนทับไฟล์วันหยุด
- `POST /api/upload`, `POST /api/supabase/sync`, `DELETE /api/supabase/overrides`

server ยัง bind ที่ `0.0.0.0` (`server.js:310`) และพิมพ์ LAN IP เชิญชวนให้เข้าถึงจากเครือข่าย — ระบบ HR ที่แก้ไขค่าเบี้ยเลี้ยง/บันทึกเวลาได้ต้องมี login และแยกสิทธิ์เป็นอย่างน้อย

### 🟠 SEC-5: CORS เปิดกว้างทุก origin + body limit 50MB

**ไฟล์:** `server.js:11-13`

`app.use(cors())` อนุญาตทุก origin และ `express.json({ limit: '50mb' })` เปิดช่อง DoS ด้วย payload ขนาดใหญ่ ควรระบุ origin ที่อนุญาตเป็น allowlist และลด limit ให้เท่าที่ใช้จริง

### 🟠 SEC-6: Upload endpoint ไม่จำกัดชนิด/ขนาดไฟล์

**ไฟล์:** `server.js:17, 203`

`multer({ dest: 'uploads/' })` ไม่กำหนด `limits` และไม่มี `fileFilter` — อัปโหลดไฟล์อะไรก็ได้ขนาดเท่าไรก็ได้ แล้วส่งเข้า `xlsx.readFile()` ซึ่งมีช่องโหว่ ReDoS/Prototype Pollution (ดู DEP-1) เป็นการต่อยอดช่องโหว่กันโดยตรง ควรกำหนด `limits: { fileSize }`, ตรวจนามสกุล/MIME type และพิจารณา magic-bytes check

### 🟠 SEC-7: ไม่มี security middleware และ rate limiting

ไม่มี `helmet` (security headers), ไม่มี rate limiter, error message ส่ง `err.message` ภายในกลับไปให้ client ตรง ๆ (เช่น `server.js:198, 223, 249`) ซึ่งอาจเปิดเผย path ภายในเครื่อง

---

## 2. Environment Variables

### 🔴 ENV-1: (= SEC-2) `.env` ถูก commit — ดูรายละเอียดด้านบน

### 🟡 ENV-2: การจัดการ config กระจัดกระจายและซ้ำซ้อน

ค่า Supabase URL อยู่ 2 ที่: `.env` (ฝั่ง server) และ `public/js/supabase-config.js` (ฝั่ง client, hardcode) — เสี่ยงต่อการแก้ที่เดียวแล้วอีกที่ไม่ตรงกัน และ `supabaseClient.js:4-6` ต้อง normalize URL เอง (ตัด `/rest/v1/` ทิ้ง) เพราะ `.env` เก็บ URL ผิดรูปแบบ ควรกำหนดรูปแบบค่าให้ชัดและ validate ตอน startup พร้อม fail-fast ถ้า config ผิด

**ข้อสังเกตที่ทำถูก:** `supabaseClient.js` โหลดผ่าน `dotenv` และมี fallback สู่ Local Mode เมื่อไม่มี credentials — pattern นี้ดี แต่ต้องไม่ commit ไฟล์ `.env` จริง

---

## 3. Dependencies (package.json + lockfile)

Dependencies ทั้งหมด 6 ตัว (resolved version จาก package-lock.json):

| Package | ระบุ | Resolved | สถานะ |
|---|---|---|---|
| express | ^4.18.2 | 4.22.2 | ✅ patched แล้วผ่าน lockfile |
| @supabase/supabase-js | ^2.110.3 | 2.x | ✅ |
| cors | ^2.8.5 | 2.8.5 | ✅ |
| dotenv | ^17.4.2 | 17.4.2 | ✅ |
| multer | ^1.4.5-lts.1 | 1.4.5-lts.2 | 🟡 สาย 1.x เลิก maintain แล้ว |
| xlsx | ^0.18.5 | 0.18.5 | 🟠 ช่องโหว่ High × 2, ไม่มี fix บน npm |

### 🟠 DEP-1: `xlsx@0.18.5` มีช่องโหว่ระดับ High 2 รายการ ไม่มี fix บน npm registry

`npm audit` ยืนยัน:
- **Prototype Pollution** (GHSA-4r6h-8v6p-xvw6, CVSS 7.8) — แก้ใน ≥0.19.3
- **ReDoS** (GHSA-5pgg-2g8v-p4x9, CVSS 7.5) — แก้ใน ≥0.20.2

SheetJS เลิกเผยแพร่เวอร์ชันใหม่บน npm registry แล้ว (ค้างที่ 0.18.5) `npm audit fix` จึงช่วยไม่ได้ และช่องโหว่นี้**ถูก trigger ได้จริง**ผ่าน `POST /api/upload` ที่รับไฟล์จากผู้ใช้เข้า `xlsx.readFile()` โดยตรง

**แนวทางแก้ไข (เลือกหนึ่ง):**
1. ติดตั้งจาก SheetJS CDN อย่างเป็นทางการ: `npm i https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz` (แก้ทั้งสอง CVE, API เดิม)
2. ย้ายไปใช้ `exceljs` ซึ่ง maintain บน npm ตามปกติ

### 🟡 DEP-2: `multer` 1.x deprecated

multer สาย 1.x ประกาศเลิก maintain แล้ว และมีช่องโหว่ DoS หลายรายการที่แก้เฉพาะใน 2.x ควร migrate เป็น `multer@2` (API แทบไม่ต่าง) พร้อมกับใส่ `limits` ตาม SEC-6

### 🟡 DEP-3: ไม่มี devDependencies / เครื่องมือคุณภาพโค้ดเลย

ไม่มี test framework, linter, formatter ใด ๆ (`test_hours.js` เป็นสคริปต์ทดลองรันมือ ไม่ใช่ test) ควรเริ่มจาก `eslint` + `node:test`/`vitest` และย้าย logic คำนวณเวลา (ซึ่งเป็นหัวใจของระบบเงินเบี้ยเลี้ยง) มาอยู่ใต้ unit test

---

## 4. Project Structure

```
HR-Time-Portal/
├── server.js               ← Express API + business logic ปนกัน
├── supabaseClient.js       ← Supabase wrapper (ฝั่ง server)
├── index.html              ← ซ้ำกับ public/index.html
├── holidays.json           ← ซ้ำกับ public/holidays.json + เป็น runtime state
├── *.xlsx / *.pdf / *.docx ← ข้อมูลจริง + เอกสาร ปนอยู่ใน repo (ซ้ำ 3-4 ชุด)
├── 1.-4. *.bat             ← สคริปต์ Windows ops ปนใน root
├── Data/{shift, shipt, backup}/  ← โฟลเดอร์ซ้ำ (สะกดผิด "shipt")
└── public/                 ← static frontend (deploy ขึ้น GitHub Pages ทั้งโฟลเดอร์)
    ├── index.html (877 บรรทัด)
    └── js/app.js (3,584 บรรทัด — ไฟล์เดียวรวมทุกอย่าง)
```

### 🟡 STR-1: ไฟล์ข้อมูลจริงและเอกสารถูกใช้ repo เป็นที่เก็บไฟล์

.xlsx/.pdf/.docx รวม ~3.5 MB ถูก commit และหลายไฟล์ซ้ำกัน 3-4 ชุด (root, `public/`, `Data/backup/`, `Data/shift/`, `Data/shipt/`) — นอกจากประเด็น PII (SEC-1) แล้ว ยังทำให้ repo บวมและไม่รู้ว่าไฟล์ไหนคือ source of truth ข้อมูล runtime ควรอยู่นอก repo (โฟลเดอร์ data ที่ ignore ไว้ หรือใน Supabase ซึ่งมีอยู่แล้ว)

### 🟡 STR-2: โครงสร้างซ้ำซ้อนระหว่าง root กับ public/

`index.html`, `holidays.json`, `HR-Time-Project-Analysis.html`, ไฟล์ Excel มีทั้งใน root และ `public/` เพราะรองรับ 2 โหมด deploy — ควรให้ `public/` เป็น source เดียวของ frontend และให้ root `index.html` เป็นแค่ redirect (ตอนนี้เป็นอยู่แล้วบางส่วน) แล้วลบไฟล์ซ้ำทิ้ง รวมถึงยุบ `Data/shipt` (สะกดผิด) กับ `Data/shift` ให้เหลือโฟลเดอร์เดียว — โค้ดใน `server.js:72-73` ต้อง scan ทั้งสองโฟลเดอร์เพราะความซ้ำนี้

### 🟡 STR-3: `app.js` 3,584 บรรทัดไฟล์เดียว + business logic ซ้ำสองฝั่ง

Logic การคำนวณกะ/สาย/ค่าข้าวอยู่ทั้งใน `server.js` (getMasterShifts) และ `public/js/app.js` ฝั่ง client — กติกาเรื่องเงินของพนักงานไม่ควรมีสองสำเนาที่ต้องแก้ให้ตรงกันเอง ระยะกลางควรแตก `app.js` เป็น modules (parser, rules, UI, sync) และให้ฝั่งใดฝั่งหนึ่งเป็นเจ้าของ logic

### 🟡 STR-4: Hardcode path เฉพาะเครื่อง และ runtime state เขียนลงไฟล์ใน repo

- `server.js:70-71` hardcode `C:/HR` — path เฉพาะเครื่อง Windows ควรมาจาก env var
- `holidays.json` เป็นไฟล์ที่ tracked ใน git แต่ถูกเขียนทับตอน runtime (`server.js:38`) ทำให้ working tree สกปรกและเสี่ยง commit ข้อมูล runtime
- กติกากะ (เวลา 15:30/16:30 ฯลฯ) hardcode เป็น string comparison ยาวใน `server.js:118-126` ทั้งที่ schema มีตาราง `department_rules` และ `shift_schedules` รองรับอยู่แล้วแต่ไม่ได้ใช้

---

## 5. package.json

### 🟡 PKG-1: ขาด metadata ที่จำเป็น

- ไม่มี `engines` (ระบุ Node version ขั้นต่ำ) — เครื่อง HR ที่รันอาจใช้ Node คนละเวอร์ชันกับที่ dev
- ไม่มี `private: true` — ป้องกันการ publish ขึ้น npm โดยพลาด
- `license: "ISC"` เป็นค่า default ทั้งที่เป็นโค้ดภายในบริษัท ควรเป็น `"UNLICENSED"` + `private: true`

### 🟡 PKG-2: scripts `start` และ `dev` เหมือนกันทุกตัวอักษร

ทั้งคู่คือ `node server.js` — ถ้าจะมี dev mode ควรใช้ `node --watch server.js` (Node 18+) และควรเพิ่ม `test`, `lint` เมื่อมีเครื่องมือตาม DEP-3

### 🔵 PKG-3: ควรพิจารณา pin เวอร์ชันเข้มขึ้นสำหรับระบบ production ภายใน

ตอนนี้พึ่ง lockfile อย่างเดียว ซึ่งใช้ได้ แต่ต้องแน่ใจว่า deploy จริงใช้ `npm ci` ไม่ใช่ `npm install`

---

## 6. Next.js Configuration

**N/A — โปรเจกต์นี้ไม่ใช่ Next.js** ไม่มี `next.config.js`, ไม่มี `next` ใน dependencies สถาปัตยกรรมจริงคือ:

- **Backend:** Express 4 (`server.js`) รันบนเครื่อง Windows ภายใน (มี .bat scripts สำหรับ start/stop/auto-start)
- **Frontend:** Static HTML + Vanilla JS ใน `public/` (โหมด dual: เรียกผ่าน Express API หรือยิง Supabase REST ตรงเมื่ออยู่บน GitHub Pages)
- **Database:** Supabase (PostgreSQL) + fallback localStorage/ไฟล์

การตัดสินใจเชิงสถาปัตยกรรมนี้ *ยอมรับได้* สำหรับเครื่องมือภายในขนาดเล็ก แต่โหมด "GitHub Pages ยิง Supabase ตรงด้วย anon key" เป็นต้นเหตุที่บังคับให้ RLS ต้องเปิดกว้าง (SEC-3) — **ถ้าจะคง GitHub Pages ไว้ ต้องทำ Supabase Auth; ถ้าไม่ทำ Auth ควรตัดโหมด GitHub Pages ทิ้งและใช้เฉพาะ Express ในเครือข่ายภายใน**

---

## ลำดับการแก้ไขที่แนะนำ (Action Plan)

| ลำดับ | รายการ | อ้างอิง |
|---|---|---|
| 1 | Rotate Supabase key ทันที | SEC-2 |
| 2 | เอาไฟล์ PII ออกจาก `public/` + ปิด/ล้าง GitHub Pages + ล้าง git history (ไฟล์ .env และ .xlsx) | SEC-1, SEC-2 |
| 3 | เพิ่ม `.env`, `*.xlsx`, `*.pdf`, `*.docx`, `holidays.json` ลง `.gitignore` + สร้าง `.env.example` | ENV-1 |
| 4 | แก้ RLS policy / ตัดสินใจเรื่องโหมด GitHub Pages | SEC-3, §6 |
| 5 | อัปเกรด xlsx เป็น 0.20.3 จาก SheetJS CDN | DEP-1 |
| 6 | ใส่ auth + จำกัด CORS + limits ของ multer + helmet | SEC-4–7 |
| 7 | จัดระเบียบโครงสร้าง ลบไฟล์ซ้ำ, แตก app.js, เพิ่ม lint/test | STR-*, DEP-3, PKG-* |

**Phase ถัดไปที่แนะนำ:** Phase 2 – Business Logic Review (การคำนวณกะ/สาย/OT/ค่าข้าวใน `app.js` และ `server.js` ซึ่งมี logic ซ้ำสองฝั่งและ edge cases เรื่องวันที่ที่ควรตรวจละเอียด)
