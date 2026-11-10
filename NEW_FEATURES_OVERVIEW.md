# دليل المزايا والقدرات الجديدة الشامل · منصة تُجّار ونورة الذكية
### Comprehensive Guide to New Features, Architecture, Schema & Process Diagrams
**اتحاد الغرف التجارية السعودية · Federation of Saudi Chambers**
*تاريخ التحديث: نوفمبر 2026 · الفرع: `feat/executive-wow-suite`*

---

## 📌 الفهرس التنفيذي
1. [مقارنة سريعة: الفرع الأصلي (main) مقابل النسخة المطورة](#1-مقارنة-سريعة-الفرع-الأصلي-main-مقابل-النسخة-المطورة)
2. [المخطط المعماري الشامل للنظام (System Architecture Diagram)](#2-المخطط-المعماري-الشامل-للنظام-system-architecture-diagram)
3. [مخطط الكيانات والعلاقات لقاعدة البيانات (Database Schema ER Diagram)](#3-مخطط-الكيانات-والعلاقات-لقاعدة-البيانات-database-schema-er-diagram)
4. [المخططات التتابعية للعمليات التنفيذية (Sequence Diagrams)](#4-المخططات-التتابعية-للعمليات-التنفيذية-sequence-diagrams)
   - [1. مخطط تتابع اكتشاف واستخلاص المشاريع تلقائياً (Dynamic Project Discovery)](#1-مخطط-تتابع-اكتشاف-واستخلاص-المشاريع-تلقائياً-dynamic-project-discovery-flow)
   - [2. مخطط تتابع محاكي القرارات الاستراتيجية (AI What-If Simulation)](#2-مخطط-تتابع-محاكي-القرارات-الاستراتيجية-ai-what-if-simulation-flow)
   - [3. مخطط تتابع محادثة نورة المدركة للشاشة (Live Screen-Aware Chat)](#3-مخطط-تتابع-محادثة-نورة-المدركة-للشاشة-live-screen-aware-chat-flow)
   - [4. مخطط تتابع المزامنة السحابية مع Google Drive وفحص البصمة (Bidirectional Drive Sync)](#4-مخطط-تتابع-المزامنة-السحابية-مع-google-drive-وفحص-البصمة-bidirectional-drive-sync-flow)
   - [5. مخطط تتابع توليد وتصدير تقرير المجلس (Board Report Generation - PDF & WhatsApp)](#5-مخطط-تتابع-توليد-وتصدير-تقرير-المجلس-board-report-generation-flow)
5. [المزايا والقدرات الجديدة بالتفصيل](#5-المزايا-والقدرات-الجديدة-بالتفصيل)
   - [أولاً: محاكي القرارات الاستراتيجي بالذكاء الاصطناعي (AI What-If Simulator)](#أولاً-محاكي-القرارات-الاستراتيجي-بالذكاء-الاصطناعي-ai-what-if-simulator)
   - [ثانياً: الاستخلاص والاكتشاف التلقائي للمشاريع (Dynamic Project Discovery)](#ثانياً-الاستخلاص-والاكتشاف-التلقائي-للمشاريع-dynamic-project-discovery)
   - [ثالثاً: لوحات القيادة المستقلة لكل مشروع (Independent Project Dashboards)](#ثالثاً-لوحات-القيادة-المستقلة-لكل-مشروع-independent-project-dashboards)
   - [رابعاً: كابينة القيادة الجانبية المتوافقة مع معايير Apple HIG](#رابعاً-كابينة-القيادة-الجانبية-المتوافقة-مع-معايير-apple-hig)
   - [خامساً: محادثة نورة المدركة للشاشة لحظياً (Live Screen-Aware AI Chat)](#خامساً-محادثة-نورة-المدركة-للشاشة-لحظياً-live-screen-aware-ai-chat)
   - [سادساً: حزمة تقارير مجلس الإدارة (Board PDF & WhatsApp Reports)](#سادساً-حزمة-تقارير-مجلس-الإدارة-board-pdf--whatsapp-reports)
   - [سابعاً: أداة تسليط الضوء للعروض التنفيذية (Screen Spotlight Tool)](#سابعاً-أداة-تسليط-الضوء-للعروض-التنفيذية-screen-spotlight-tool)
   - [ثامناً: المزامنة السحابية الذكية مع Google Drive وفحص البصمة (SHA-256 Deduplication)](#ثامناً-المزامنة-السحابية-الذكية-مع-google-drive-وفحص-البصمة-sha-256-deduplication)
   - [تاسعاً: خط أنابيب المعرفة الذاتية وتخزين الكائنات السحابي (Auto-DK & S3 Storage)](#تاسعاً-خط-أنابيب-المعرفة-الذاتية-وتخزين-الكائنات-السحابي-auto-dk--s3-storage)
   - [عاشراً: البث المباشر السحابي ومشغلات العرض 1080p (Google Drive Streaming Players)](#عاشراً-البث-المباشر-السحابي-مشغلات-العرض-1080p-google-drive-streaming-players)
6. [الهندسة المعمارية وإعادة الهيكلة البرمجية (<100 Lines Server Rule)](#6-الهندسة-المعمارية-وإعادة-الهيكلة-البرمجية)
7. [دليل مسارات الواجهة البرمجية الجديدة (New API Endpoints)](#7-دليل-مسارات-الواجهة-البرمجية-الجديدة-new-api-endpoints)
8. [روابط الموارد السحابية على Google Drive](#8-روابط-الموارد-السحابية-على-google-drive)

---

## 1. مقارنة سريعة: الفرع الأصلي (`main`) مقابل النسخة المطورة

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                 مقارنة القدرات الجوهرية                                 │
├───────────────────────────────┬─────────────────────────────┬───────────────────────────┤
│ الميزة / القدرة               │ الفرع الأصلي (main)         │ النسخة المطورة (الحالية)  │
├───────────────────────────────┼─────────────────────────────┼───────────────────────────┤
│ عدد المشاريع في المحفظة       │ 5 مشاريع ثابتة وراكدة       │ ديناميكي: ينمو آلياً (7+) │
│ تفاعل محاكي القرارات (What-If)│ غير متوفر (أو حسابات جامدة) │ ذكاء اصطناعي + 4 حزم قرارات│
│ لوحات القيادة (Dashboards)    │ لوحة واحدة فقط للملف        │ لوحة مستقلة لكل مشروع     │
│ إدراك الشاشة في المحادثة      │ غائب (تطلب نورة تزويدها)    │ إدراك لحظي كامل للشاشة    │
│ واجهة المحادثة والتنسيق       │ نصوص Markdown خام غير منسقة │ بطاقات Apple HIG + نسخ وصوت│
│ تقارير المجلس                 │ غير متوفرة                  │ PDF رسمي مرمز + واتساب    │
│ قاعدة البيانات                │ SQLite فقط (ملف محلي)       │ ثنائية: PostgreSQL + SQLite│
│ تخزين الملفات                 │ مجلد محلي فقط               │ محول سحابي (S3/R2/MinIO)   │
│ مزامنة Google Drive           │ رفع باتجاه واحد وبدون فحص   │ مزامنة ثنائية + فحص SHA256 │
│ حجم ملف server.js             │ ملف أحادي ضخم (~700+ سطر)   │ 61 سطراً فقط (معياري)     │
│ بث العروض المرئية             │ ملفات محلية فقط             │ بث سحابي مباشر من Drive   │
└───────────────────────────────┴─────────────────────────────┴───────────────────────────┘
```

---

## 2. المخطط المعماري الشامل للنظام (System Architecture Diagram)

يوضح المخطط التالي بنية النظام المعيارية متعددة الطبقات، بدءاً من واجهات المستخدم التفاعلية، مروراً بطبقة التوجيه المصغرة، وصولاً إلى محركات الذكاء الاصطناعي وقواعد البيانات السحابية:

```mermaid
flowchart TD
    subgraph ClientLayer["طبقة واجهة المستخدم (Client Layer)"]
        UI_Home["لوحة القيادة والمحفظة (Home SPA)"]
        UI_Cockpit["كابينة القيادة الجانبية (Apple HIG Cockpit)"]
        UI_Dash["إطار اللوحات المستقلة (ECharts Iframes /d/:id)"]
        UI_Sim["محاكي القرارات وحزم الإنقاذ (What-If UI)"]
        UI_Report["مودال تقارير المجلس (PDF & WhatsApp Modal)"]
        UI_Spotlight["هالة تسليط الضوء للعروض (Screen Spotlight)"]
    end

    subgraph ServerCore["نواة السيرفر المعيارية (Server Core - 61 Lines)"]
        Server["server.js (Node.js & Express)"]
    end

    subgraph RouterModules["طبقة المسارات المتخصصة (Modular Routers)"]
        R_Chat["src/routes/chat.js (محادثة نورة وسياق الشاشة)"]
        R_Upload["src/routes/upload.js (الرفع واستخلاص المشاريع)"]
        R_Dash["src/routes/dashboard.js (كتالوج ولوحات المشاريع)"]
        R_Exec["src/routes/executive.js (المحاكي وتقارير المجلس)"]
        R_Drive["src/routes/drive.js (مزامنة Google Drive)"]
        R_Docs["src/routes/docs.js (إدارة الوثائق)"]
        R_Static["src/routes/static.js (الهوية والمشغلات)"]
    end

    subgraph ServiceEngines["محركات الخدمات والذكاء الاصطناعي (Service Engines)"]
        ENG_Sim["src/executive/simulator.js (محاكي القرارات الرياضي)"]
        ENG_Proj["src/executive/project-sync.js (مكتشف المشاريع الذكي)"]
        ENG_Rep["src/executive/report.js (مولد PDF وواتساب)"]
        ENG_AutoDK["src/ingest/auto-dk.js (خط المعالجة الذاتي Auto-DK)"]
        ENG_Gemini["Gemini Live WebSocket & Gemini 2.5 Flash"]
        ENG_Eleven["ElevenLabs Realtime Audio Engine"]
    end

    subgraph StorageDataLayer["طبقة البيانات والتخزين (Data & Storage Layer)"]
        DB_Adapter["db.js (محول الاستعلامات الثنائي Postgres / SQLite)"]
        PG_DB[(PostgreSQL / Supabase)]
        SQLITE_DB[(SQLite Embedded demo.db)]
        Storage_Adapter["src/storage/ (محول التخزين السحابي العالمي)"]
        S3_Cloud["AWS S3 / Cloudflare R2 / MinIO"]
        Drive_Hook["Google Drive Apps Script Webhook"]
    end

    %% Client to Server
    UI_Home --> Server
    UI_Cockpit --> Server
    UI_Dash --> Server
    UI_Sim --> Server
    UI_Report --> Server
    UI_Spotlight --> Server

    %% Server to Routers
    Server --> R_Chat
    Server --> R_Upload
    Server --> R_Dash
    Server --> R_Exec
    Server --> R_Drive
    Server --> R_Docs
    Server --> R_Static

    %% Routers to Engines
    R_Chat --> ENG_Gemini
    R_Exec --> ENG_Sim
    R_Exec --> ENG_Rep
    R_Upload --> ENG_Proj
    R_Upload --> ENG_AutoDK
    R_Chat --> ENG_Eleven

    %% Engines to DB & Storage
    ENG_Proj --> DB_Adapter
    ENG_Sim --> DB_Adapter
    ENG_Rep --> DB_Adapter
    R_Dash --> DB_Adapter
    R_Drive --> Drive_Hook
    ENG_AutoDK --> Storage_Adapter

    %% DB & Storage Details
    DB_Adapter --> PG_DB
    DB_Adapter --> SQLITE_DB
    Storage_Adapter --> S3_Cloud
```

---

## 3. مخطط الكيانات والعلاقات لقاعدة البيانات (Database Schema ER Diagram)

يوضح المخطط التالي الجداول الأساسية المعتمدة في النظام، ومفاتيح الربط الأساسية والخارجية (PK / FK)، وحقول البيانات الموزعة بين المشاريع والتذاكر واللوحات والوثائق والمحادثات:

```mermaid
erDiagram
    PROJECTS ||--o{ TICKETS : "has_open_issues"
    PROJECTS |o--o| DASHBOARDS : "visualized_in"
    DOCUMENTS ||--o{ DATASETS : "extracted_into"
    DOCUMENTS ||--o| DASHBOARDS : "generates"
    CHAT_SESSIONS ||--o{ CHAT_TURNS : "records"

    PROJECTS {
        int id PK "معرف المشروع الرقمي"
        string name "اسم المشروع"
        string department "الإدارة المسؤولة"
        string status "الحالة: قيد التنفيذ | متأخر | مكتمل | متوقف"
        int progress "نسبة الإنجاز 0..100"
        bigint budget "الميزانية المعتمدة بالريال"
        bigint spent "المصروف الفعلي بالريال"
        string owner "مدير المشروع"
        date due_date "تاريخ التسليم المستهدف"
        date start_date "تاريخ البدء"
        int dashboard_id FK "الربط بلوحة القيادة المستقلة"
    }

    TICKETS {
        int id PK "معرف التذكرة"
        int project_id FK "ربط بالمشروع التابع له"
        string title "عنوان البلاغ أو التذكرة"
        string priority "الأولوية: عالية | متوسطة | منخفضة"
        string status "الحالة: مفتوحة | قيد المعالجة | مغلقة"
        timestamp created_at "تاريخ ووقت الفتح"
    }

    DASHBOARDS {
        int id PK "معرف اللوحة"
        string title "عنوان اللوحة التحليلية"
        json spec "مواصفات ومخططات ECharts والـ KPIs"
        timestamp created_at "تاريخ التوليد"
    }

    DOCUMENTS {
        int id PK "معرف الوثيقة"
        string name "اسم الملف"
        string type "نوع الملف: pdf, docx, csv, md"
        int size "حجم الملف بالبايت"
        int chars "عدد الحروف المستخرجة"
        text content "نص المحتوى المستخلص"
        string sha256 "بصمة التجزئة لمنع التكرار"
        string category "التصنيف الإداري أو المالي"
        string drive_id "معرف الملف في Google Drive"
        string drive_url "رابط الملف المباشر في السحابة"
        text summary "ملخص نورة الذكي للملف"
        timestamp uploaded_at "تاريخ الرفع"
    }

    DATASETS {
        int id PK "معرف مجموعة البيانات"
        int doc_id FK "معرف المستند المصدر"
        string doc_name "اسم المستند"
        string sheet "اسم ورقة العمل أو القسم"
        json columns "أسماء وتصنيفات الأعمدة"
        json rows "البيانات المجدولة"
        json profile "التحليل الإحصائي التلقائي"
        timestamp created_at "تاريخ الاستخراج"
    }

    CHAT_SESSIONS {
        int id PK "معرف الجلسة"
        timestamp started_at "وقت بدء الجلسة"
        timestamp last_at "وقت آخر نشاط"
        text summary "ملخص الجلسة التنفيذي"
        json embedding "المتجه الدلالي للملخص"
        int turns "إجمالي عدد الردود"
        int digested_turns "الردود المؤرشفة في الذاكرة"
    }

    CHAT_TURNS {
        int id PK "معرف الرد"
        int session_id FK "معرف الجلسة التابع لها"
        string role "الدور: user أو nora"
        text text "نص الرسالة أو البطاقة التنفيذية"
        timestamp created_at "وقت الإرسال"
    }

    MEMORIES {
        int id PK "معرف المعلومة الدائمة"
        text content "نص المعلومة أو التفضيل"
        string category "التصنيف: تفضيل | معلومة | تعليمات"
        json embedding "المتجه الدلالي للبحث"
        int hits "عدد مرات الاسترجاع"
        timestamp created_at "تاريخ الإنشاء"
        timestamp updated_at "تاريخ آخر تحديث"
    }

    KV {
        string key PK "مفتاح الإعداد أو الكاش"
        json value "القيمة بتنسيق JSON"
        timestamp updated_at "تاريخ التحديث"
    }
```

---

## 4. المخططات التتابعية للعمليات التنفيذية (Sequence Diagrams)

### 1. مخطط تتابع اكتشاف واستخلاص المشاريع تلقائياً (Dynamic Project Discovery Flow)
يوضح هذا المخطط كيف يؤدي رفع تقرير تدقيق مالي أو محاسبي إلى استخلاص المشاريع المتعثرة تلقائياً ونمو محفظة المشاريع من 5 إلى 7 مشاريع لحظياً:

```mermaid
sequenceDiagram
    autonumber
    actor Exec as المدير التنفيذي (فواز)
    participant UI as واجهة المنصة (Frontend)
    participant Route as مسار الرفع (upload.js)
    participant Sync as محرك الاستخلاص (project-sync.js)
    participant DB as قاعدة البيانات (PostgreSQL/SQLite)
    participant Dash as مولد اللوحات (seed.js)

    Exec->>UI: سحب وإفلات تقرير التدقيق المحاسبي (14_تقرير_المراجعة.md)
    UI->>Route: إرسال الملف عبر POST /api/upload
    Route->>Route: حساب بصمة SHA-256 والتحقق من عدم التكرار
    Route->>Sync: استدعاء syncProjectsFromDocumentContent(content)
    Note over Sync: فحص الجداول والفقرات عبر خوارزمية ذكية لاكتشاف المشاريع غير المسجلة
    Sync->>DB: الاستعلام عن المشاريع المسجلة حالياً (5 مشاريع)
    Sync->>Sync: اكتشاف مشروعي الذكاء الاصطناعي وتحديث البنية التحتية
    Sync->>DB: إدراج المشاريع الجديدة (نمو العدد من 5 إلى 7 مشاريع)
    Sync->>Dash: توليد لوحات قيادة مستقلة للمشاريع المستخلصة
    Dash->>DB: حفظ مواصفات اللوحات الجديدة في جدول dashboards
    Sync->>DB: تحديث قيم إجمالي الميزانية والمصروف ومعدلات الإنجاز
    Sync-->>Route: إرجاع تفاصيل المشاريع المكتشفة ({ discovered: 2, total: 7 })
    Route-->>UI: رد بنجاح المعالجة مع قائمة المشاريع الجديدة
    UI->>UI: تحديث جدول المشاريع (#projects) وبطاقات الـ KPIs فورياً أمام المستخدم
    UI-->>Exec: إشعار بانتهاء المعالجة ونمو المحفظة إلى 7 مشاريع
```

---

### 2. مخطط تتابع محاكي القرارات الاستراتيجية (AI What-If Simulation Flow)
يوضح كيف يتفاعل متخذ القرار مع المحاكي لحساب الأيام المكتسبة، تغير معدل الحرق اليومي، وصياغة توصية نورة للمجلس:

```mermaid
sequenceDiagram
    autonumber
    actor Exec as المدير التنفيذي (المجلس)
    participant UI as محاكي القرارات (simulator.js)
    participant Route as مسار المحاكي (/api/executive/simulate)
    participant Engine as محرك المحاكاة الرياضي (simulator.js)
    participant DB as قاعدة البيانات (db.js)
    participant LLM as نموذج الذكاء الاصطناعي (Gemini 2.5 Flash)

    Exec->>UI: اختيار "حزمة الإنقاذ والتسريع" أو كتابة سيناريو حر
    UI->>Route: إرسال الطلب عبر POST /api/executive/simulate
    Route->>DB: جلب بيانات المشاريع الحالية (الميزانية، المصروف، نسب الإنجاز)
    Route->>Engine: تنفيذ الحسابات الرياضية الدقيقة للسيناريو
    Note over Engine: حساب الأيام المكتسبة/المفقودة + تغير الحرق اليومي + ضغط السيولة
    Route->>LLM: تمرير أرقام السيناريو لصياغة التحليل الاستراتيجي
    Note over LLM: صياغة «توصية نورة للمجلس التنفيذي» وحساب فرص النجاح والمخاطر
    LLM-->>Route: إرجاع التوصية الاستراتيجية المكتوبة
    Route-->>UI: الرد ببيانات الأثر المالي والزمني + التوصية التنفيذية
    UI->>UI: تحريك عدادات الأيام المحققة وتحديث شارات الحرق المالي
    UI->>UI: عرض بطاقة توصية نورة للمجلس التنفيذي
    Exec->>UI: النقر على "اعتماد الخطة في المحفظة"
    UI->>DB: تطبيق التعديلات المعتمدة وتحديث حالة المشاريع الحية
```

---

### 3. مخطط تتابع محادثة نورة المدركة للشاشة (Live Screen-Aware Chat Flow)
يوضح كيف تستقبل نورة استفسار "لخص المعروض" وتجيب بدقة استناداً إلى بيانات اللوحة المفتوحة أمام المستخدم دون طلب تزويدها بالمحتوى:

```mermaid
sequenceDiagram
    autonumber
    actor Exec as المستخدم (فواز)
    participant UI as كابينة القيادة الجانبية (ui.js / app.js)
    participant Route as مسار المحادثة (/api/chat/message)
    participant DB as قاعدة البيانات (db.js)
    participant LLM as محرك Gemini 2.5 Flash

    Exec->>UI: فتح لوحة مشروع أو كتابة: "لخص المعروض"
    UI->>UI: تجميع سياق الشاشة الحي (ACTIVE_DASH_SPEC + KPIs + الرسوم)
    UI->>Route: إرسال POST /api/chat/message مع كائن screenContext
    Route->>Route: فحص سياق الشاشة المرفق؛ استكمال أي نقص من current_dash
    Route->>DB: جلب حالة محفظة المشاريع الخمسة لتعزيز الرد
    Note over Route: صياغة الموجه التنفيذي مع حظر عبارة "أحتاج تزويدي بالمحتوى"
    Route->>LLM: إرسال الموجه مع المؤشرات والأرقام المعروضة حالياً
    LLM-->>Route: توليد ملخص تنفيذي موجز بالأرقام والنتائج الأهم
    Route->>Route: فحص الرد وتطبيق الحماية لضمان خلوه من أي اعتذار بنقص المحتوى
    Route->>DB: حفظ سياق الرد في جدول chat_turns
    Route-->>UI: إرجاع نص الرد التنفيذي
    UI->>UI: تحويل الرد إلى بطاقة Apple HIG منسقة مع وسوم ذهبية
    UI->>UI: تفعيل زر النسخ الفوري وزر إعادة الاستماع بالصوت (TTS)
    UI-->>Exec: ظهور البطاقة التنفيذية الجاهزة في الدرج الجانبي
```

---

### 4. مخطط تتابع المزامنة السحابية مع Google Drive وفحص البصمة (Bidirectional Drive Sync Flow)
يوضح كيف تتم مزامنة الملفات بين النظام ومجلد Google Drive مع منع تكرار معالجة الملفات عبر فحص الـ SHA-256:

```mermaid
sequenceDiagram
    autonumber
    actor Admin as النظام / المستخدم
    participant Sync as محرك المزامنة (src/drive/sync.js)
    participant DriveAPI as تطبيق Google Apps Script
    participant GDrive as سحابة Google Drive
    participant DB as قاعدة البيانات (documents)
    participant Ingest as خط المعالجة (Auto-DK)

    Admin->>Sync: بدء المزامنة الدورية (Polling) أو استدعاء يدوي
    Sync->>DriveAPI: طلب قائمة الملفات action: "list"
    DriveAPI->>GDrive: قراءة محتويات المجلد السحابي المعتمد
    GDrive-->>DriveAPI: إرجاع قائمة الملفات السحابية
    DriveAPI-->>Sync: إرجاع مصفوفة الملفات (ID, Name, URL, Size)
    
    loop لكل ملف سحابي
        Sync->>DB: البحث السريع بالمعرف drive_id
        alt الملف موجود مسبقاً بنفس drive_id
            Sync->>Sync: تخطي المعالجة (already_synced)
        else لم يوجد بـ drive_id
            Sync->>DriveAPI: تحميل محتوى الملف action: "getById"
            DriveAPI->>GDrive: جلب بايتات الملف
            GDrive-->>DriveAPI: إرجاع Base64
            DriveAPI-->>Sync: بيانات الملف المحملة
            Sync->>Sync: حساب بصمة SHA-256 للمحتوى
            Sync->>DB: فحص وجود بصمة sha256 في جدول documents
            alt البصمة مطابقة لملف محلي قائم
                Sync->>DB: تحديث drive_id و drive_url دون تكرار الـ Ingest
                Note over Sync: توفير استهلاك الـ AI ومنع مضاعفة المتجهات (deduplicated)
            else ملف جديد بالكامل
                Sync->>Ingest: إرسال الملف لخط المعالجة واستخلاص النصوص
                Ingest->>DB: حفظ المستند الجديد وتوليد الداشبورد
                Note over Sync: إضافة الوثيقة إلى كتالوج المعرفة (new_imported)
            end
        end
    end
    Sync-->>Admin: إرجاع تقرير إحصائيات المزامنة ({ new, deduped, synced })
```

---

### 5. مخطط تتابع توليد وتصدير تقرير المجلس (Board Report Generation Flow)
يوضح آلية بناء تقرير مجلس الإدارة بالصيغتين: ملف PDF الرسمي ورسالة الواتساب المهيأة:

```mermaid
sequenceDiagram
    autonumber
    actor Board as عضو مجلس الإدارة
    participant UI as واجهة التقرير (report.js)
    participant Route as مسار التقارير (/api/executive/report/*)
    participant Gen as مولد التقارير (src/executive/report.js)
    participant DB as قاعدة البيانات (db.js)
    participant PDFLib as مكتبة معالجة المستندات (pdf-lib)

    Board->>UI: النقر على زر "تقرير المجلس" في رأس الصفحة
    UI->>Route: طلب بيانات التقرير عبر POST /api/executive/report/whatsapp
    Route->>DB: جلب ملخص المشاريع، التذاكر، والمؤشرات المالية
    Route->>Gen: بناء النص التنفيذي المهيأ مع الرموز التعبيرية
    Gen-->>Route: نص الواتساب المتوافق مع الهوية
    Route-->>UI: إرجاع النص لعرضه في نافذة المعاينة
    UI->>UI: فتح نافذة #boardReportModal وعرض النص المنسق
    
    alt خيار النسخ والمشاركة للواتساب
        Board->>UI: النقر على "نسخ للواتساب"
        UI->>UI: نسخ النص المهيأ للحافظة فورياً
    else خيار تنزيل مستند PDF الرسمي
        Board->>UI: النقر على "تحميل تقرير PDF"
        UI->>Route: طلب GET /api/executive/report/pdf
        Route->>DB: جلب كافة إحصائيات المشاريع والتعثر
        Route->>Gen: استدعاء generateExecutiveReport({ format: 'pdf' })
        Gen->>PDFLib: رسم صفحات PDF بهوية اتحاد الغرف وشعار رؤية 2030
        PDFLib-->>Gen: مصفوفة البايتات الثنائية (%PDF- buffer)
        Gen-->>Route: إرجاع ملف PDF مع ترويسات Content-Type و Disposition
        Route-->>UI: تدفق تحميل ملف PDF الرسمي إلى جهاز المستخدم
    end
```

---

## 5. المزايا والقدرات الجديدة بالتفصيل

### أولاً: محاكي القرارات الاستراتيجي بالذكاء الاصطناعي (AI What-If Simulator)
* **المسار البرمجي:** `src/executive/simulator.js` و `public/js/simulator.js`
* **المفهوم:** تمكين متخذ القرار من تجربة سيناريوهات استراتيجية معقدة ورؤية الأثر المالي والزمني فورياً على محفظة المشاريع.
* **القدرات المضافة:**
  1. **حسابات رياضية لحظية دقيقة:**
     - **الأيام المكتسبة أو المفقودة (Days Gained/Lost):** حساب تقدم أو تعثر المشاريع بالأيام.
     - **تغير معدل الحرق اليومي (Daily Burn Rate Delta):** حساب وفر أو زيادة الصرف اليومي بالريال السعودي ونسبته المئوية.
     - **ضغط السيولة (Capital Pressure):** قياس نسبة السيولة التشغيلية المستهلكة مقارنة بالميزانية المعتمدة.
  2. **أربع حزم قرارات استراتيجية جاهزة مسبقاً بنقرة واحدة:**
     - 🚀 **حزمة الإنقاذ والتسريع (Rescue & Acceleration):** ضخ 25% ميزانية إضافية للمشاريع الحرجة لكسب 45 يوماً وخفض معدل التعثر.
     - ⚖️ **ضبط الموازنة والسيولة (Budget & Liquidity Control):** كبح الصرف بنسبة 20% لتحقيق وفر مالي قدره 1.2M ريال مع تمديد معتدل للمهل.
     - 🛡️ **الامتثال السيبراني والأمان (Cybersecurity & Compliance):** إعادة توجيه الموارد لحماية البنية السحابية وإغلاق الثغرات الحرجة.
     - 🔄 **إعادة هيكلة التعاقد (Contract Restructuring):** فض النزاعات التعاقدية وتغيير مقاولي التنفيذ للمشاريع المتعثرة.
  3. **تحليل السيناريو المفتوح بالذكاء الاصطناعي (Freeform AI Query):**
     - إمكانية كتابة أي استفسار باللغة الطبيعية (مثل: *"ماذا يحدث لو ضاعفنا ميزانية مشروع السحابة وأوقفنا الرخص؟"*).
     - استجابة Gemini 2.5 Flash بصياغة **«توصية نورة للمجلس التنفيذي 🏛️»** مع تحليل المخاطر وفرص النجاح.

---

### ثانياً: الاستخلاص والاكتشاف التلقائي للمشاريع (Dynamic Project Discovery)
* **المسار البرمجي:** `src/executive/project-sync.js` مدمجاً مع `src/routes/upload.js`
* **المفهوم:** إنهاء مشكلة جمود بيانات المشاريع (التي كانت تقتصر دائماً على 5 مشاريع).
* **القدرات المضافة:**
  - عند رفع أي وثيقة تدقيق أو مراجعة محاسبية (مثل: `14_تقرير_المراجعة_المحاسبية_وتدقيق_تناقضات_المشاريع.md`):
    - يقوم النظام عبر خوارزمية ذكية بفحص نصوص الجداول والملاحظات.
    - يستخلص المشاريع غير المسجلة آلياً (مثل: *مشروع منظومة الذكاء الاصطناعي للغرف*، *مشروع تحديث البنية التحتية للأمانة العامة*).
    - يستخرج ميزانياتها، مصروفاتها، ونسب إنجازها وحالتها (متعثر/متأخر).
    - يضيفها فوراً إلى قاعدة البيانات الحية، ليرتفع عدد المشاريع من **5 إلى 7 مشاريع**.
    - يحدّث بطاقات المؤشرات (KPIs) في صدارة المنصة لحظياً بدون إعادة تحميل الصفحة.
    - ينشئ لوحات قيادة مستقلة تلقائياً للمشاريع المكتشفة حديثاً.

---

### ثالثاً: لوحات القيادة المستقلة لكل مشروع (Independent Project Dashboards)
* **المسار البرمجي:** `src/routes/dashboard.js` و `dash.html` و `src/dashboard/seed.js`
* **المفهوم:** توفير داشبورد تحليلي مستقل ومفصل لكل مشروع على حدة بدلاً من الاكتفاء بداشبورد عام للملف.
* **القدرات المضافة:**
  - **قائمة تبديل سريعة في رأس الصفحة (`#fdSelect` / `#dashCatalog`):** تتيح للمدير التنفيذي التنقل بلمسة واحدة بين لوحة المحفظة العامة ولوحة أي مشروع فرعي.
  - **رسوم ECharts تفاعلية متقدمة ومبنية على البيانات الحقيقية:**
    - مقارنة الميزانية المعتمدة بالمصروف الفعلي لكل مشروع.
    - رسم بياني لحالة التذاكر والبلاغات ومعدلات الإغلاق.
    - مؤشرات نسب الإنجاز الدائرية (Gauges).
  - **معالجة الترجمة والنسب المئوية:** حصانة كاملة ضد أخطاء المتصفحات التي كانت تحول علامة `%` إلى كلمة `percent`، مع دعم التنسيق العربي الأصيل `٪`.

---

### رابعاً: كابينة القيادة الجانبية المتوافقة مع معايير Apple HIG
* **المسار البرمجي:** `public/js/ui.js` و `public/css/components.css`
* **المفهوم:** إعادة تصميم كاملة لتجربة المستخدم (UX/UI) لتتحول من نوافذ منبثقة عشوائية تحجب الرؤية إلى كابينة قيادة تنفيذية راقية.
* **القدرات المضافة:**
  1. **الدرج الجانبي الموحد (Side Cockpit Drawer):**
     - ينزلق بسلاسة من الجانب الأيسر دون حجب محتوى الداشبورد أو جداول المشاريع في المنتصف.
     - مساحة عمل متكاملة تجمع سجل المحادثة، حالة الاتصال، وأزرار التحكم.
  2. **بطاقات الردود التنفيذية الذكية (Executive Cards):**
     - تم التخلص نهائياً من الـ Markdown الخام (الذي كان يظهر على هيئة `### 1.` و `**نص**`).
     - تحويل كافة إجابات نورة إلى بطاقات مصممة بهوية اتحاد الغرف السعودية:
       - وسوم ذهبية مميزة لكل نقطة.
       - زر **نسخ التقرير (Copy)** بنقرة واحدة.
       - زر **استمع للرد (TTS Playback)** لإعادة سماع النص بصوت نورة.
  3. **توافق كامل مع معايير إمكانية الوصول (WCAG 2.1 AA) و Apple HIG:**
     - مساحات لمسية مريحة (Touch Targets >= 44px).
     - تبويب وتنقل سلس عبر لوحة المفاتيح مع دعم الإغلاق بمفتاح `Esc`.

---

### خامساً: محادثة نورة المدركة للشاشة لحظياً (Live Screen-Aware AI Chat)
* **المسار البرمجي:** `src/routes/chat.js` و `public/js/app.js`
* **المفهوم:** أن تكون نورة مستشاراً حقيقياً يرى ما يراه المستخدم على الشاشة ويتحدث عنه بدقة دون الحاجة لشرح أو رفع متكرر.
* **القدرات المضافة:**
  - يرسل العميل مع كل استفسار **سياق الشاشة الحي (Screen Context)** متضمناً: اللوحة المعروضة حالياً، المؤشرات الرقمية، العناوين البارزة، والرسوم الظاهرة.
  - دعم مسار محادثة احتياطي فائق السرعة عبر REST API (`/api/chat/message`) مدعوماً بنموذج Gemini 2.5 Flash أو FreeLLMAPI لضمان عدم توقف المحادثة في حال انقطاع الـ WebSocket.
  - **حماية استجابة "لخص المعروض":** تم وضع قواعد صارمة للنموذج تمنعه من قول *"أحتاج تزويدي بالمحتوى"* عندما يكون المستخدم فاتحاً لداشبورد أو وثيقة، مع توليد تلخيص تنفيذي فوري مستند إلى الأرقام المعروضة أمامه.

---

### سادساً: حزمة تقارير مجلس الإدارة (Board PDF & WhatsApp Reports)
* **المسار البرمجي:** `src/executive/report.js` و `public/js/report.js`
* **المفهوم:** تحويل بيانات المشاريع بنقرة واحدة إلى مخرجات جاهزة للاجتماعات والقرارات القيادية.
* **القدرات المضافة:**
  1. **تقرير مجلس الإدارة الرسمي (PDF):**
     - مولد PDF مرمز ومبني برمجياً عبر `pdf-lib`.
     - يتضمن الهوية الرسمية لاتحاد الغرف التجارية السعودية وشعار رؤية المملكة 2030.
     - جداول ملونة بالمشاريع، نسب الإنجاز، مؤشرات الصرف المالي، وتوصيات التعافي.
  2. **صيغة الواتساب التنفيذية (WhatsApp Markdown):**
     - نص مهيأ بالرموز التعبيرية القيادية (Emojis) والتنسيقات النقطية الجاهزة للإرسال الفوري لجروبات المجلس عبر الهاتف المحمول.
  3. **نافذة الاستعراض والمشاركة (`#boardReportModal`):**
     - إمكانية معاينة التقرير مباشرة، نسخه للحافظة، أو تنزيل ملف الـ PDF.

---

### سابعاً: أداة تسليط الضوء للعروض التنفيذية (Screen Spotlight Tool)
* **المسار البرمجي:** `src/executive/spotlight.js` و `public/js/spotlight.js`
* **المفهوم:** أداة تفاعلية للمتحدثين أثناء العرض على شاشات الاجتماعات الكبيرة.
* **القدرات المضافة:**
  - عند الإشارة إلى مشروع أو رقم معين أثناء العرض الحي، تسقط هالة ذهبية مضيئة ومركزة على البطاقة المستهدفة (`executive:spotlight`).
  - تعتيم لطيف لبقية الشاشة لتركيز انتباه أعضاء مجلس الإدارة على البيانات محل النقاش.

---

### ثامناً: المزامنة السحابية الذكية مع Google Drive وفحص البصمة (SHA-256 Deduplication)
* **المسار البرمجي:** `src/drive/sync.js` و `drive.js`
* **المفهوم:** أرشفة ومزامنة آمنة ثنائية الاتجاه مع سحابة Google Drive بدون تكرار أو هدر في مساحات التخزين ومعالجة الـ AI.
* **القدرات المضافة:**
  - فحص بصمة الملف الرقمية (SHA-256 Hash) قبل المعالجة؛ في حال رفع ملف مكرر يتم التعرف عليه فوراً وربطه بالسجل القائم دون تكرار أرشفته أو مضاعفة متجهات الـ RAG في قاعدة البيانات.
  - آلية استطلاع ومزامنة خلفية مجدولة (Polling Sync) تسحب الملفات والتقارير الجديدة من مجلد Drive المعتمد تلقائياً.

---

### تاسعاً: خط أنابيب المعرفة الذاتية وتخزين الكائنات السحابي (Auto-DK & S3 Storage)
* **المسار البرمجي:** `src/ingest/auto-dk.js` و `src/storage/`
* **القدرات المضافة:**
  - **Auto-DK (Autonomous Data & Knowledge):** خط معالجة ذاتي يستخلص الجداول من ملفات Excel و CSV و PDF ويحولها إلى حزم معرفية موحدة (`fawaz-dk-bundle/1`) تغذي محرك البحث الدلالي (RAG).
  - **محول التخزين السحابي العالمي (Unified Storage Adapter):** دعم موحد وقابل للتبديل لكل من:
    - Amazon S3
    - Cloudflare R2
    - Supabase Storage
    - MinIO
    - والتخزين المحلي المحلي (LocalStorage) مع دعم التوقيع المشفر AWS SigV4.

---

### عاشراً: البث المباشر السحابي ومشغلات العرض 1080p (Google Drive Streaming Players)
* **المسار البرمجي:** `scripts/record_full_demo_video.mjs` و `demo_showcase_player.html` و `demo_original_branch_player.html`
* **القدرات المضافة:**
  - توليد فيديو استعراضي شامل بدقة **1080p Full HD** بستين إطاراً في الثانية يعرض رحلة متكاملة عبر 8 مشاهد لكل إمكانيات المنصة.
  - إنشاء **مشغل ويب تفاعلي (HTML Player)** يبث الفيديو سحابياً ومباشرة عبر مشغل Google Drive المدمج دون الحاجة لوجود ملفات وسائط على جهاز المستخدم.
  - دعم التنقل اللحظي بين الفصول التنفيذية الـ 8 بضغطة زر واحدة.
  - توفير نسختين مستقلتين من العروض والمشغلات:
    1. عرض المنصة الحديثة المطورة (`demo_showcase_player.html`).
    2. عرض الفرع الأساسي الأصلي للمقارنة والتوثيق (`demo_original_branch_player.html`).

---

## 6. الهندسة المعمارية وإعادة الهيكلة البرمجية

### قاعدة الـ 100 سطر لملف السيرفر (`server.js`)
تم تفكيك ملف `server.js` الضخم (الذي كان يتجاوز 700 سطر في الفرع الأصلي) إلى بنية معيارية نظيفة، حيث استقر الملف الرئيسي عند **61 سطراً فقط**، موزعة المسؤوليات عبر مسارات متخصصة.

### البنية التحتية الثنائية لقواعد البيانات (`db.js`)
- دعم شفاف للتشغيل على **PostgreSQL** و **SQLite** في آن واحد.
- محول آلي للاستعلامات يترجم الفروقات الجوهرية (مثل `ILIKE` في Postgres مقابل `LIKE` في SQLite، و `JSONB` مقابل نصوص JSON) بدون أي تعديل في كود الأعمال.

---

## 7. دليل مسارات الواجهة البرمجية الجديدة (New API Endpoints)

| المسار البرمجي (Endpoint) | الطريقة (Method) | الوظيفة التنفيذية |
| :--- | :--- | :--- |
| `/api/chat/message` | `POST` | إرسال رسالة نصية لنورة مع تمرير كامل سياق الشاشة واللوحة الحالية |
| `/api/executive/simulate` | `POST` | تشغيل محاكي القرارات (حساب الأيام، وفر الحرق، وتحليل Gemini) |
| `/api/executive/report/pdf` | `POST` / `GET` | توليد وتنزيل تقرير مجلس الإدارة بصيغة PDF الرسمية |
| `/api/executive/report/whatsapp` | `POST` | توليد نص التقرير التنفيذي المهيأ للمشاركة عبر الواتساب |
| `/api/executive/spotlight` | `POST` | تفعيل الهالة الذهبية وتسليط الضوء على عنصر بالداشبورد أثناء العرض |
| `/api/dashboards/catalog` | `GET` | جلب القائمة الكاملة لكافة لوحات المحفظة والمشاريع المستقلة |
| `/api/drive/sync` | `POST` | إطلاق فحص ومزامنة فورية ثنائية الاتجاه مع Google Drive |
| `/api/drive/status` | `GET` | استعلام حالة المزامنة وبصمات الملفات المفحوصة في السحابة |

---

## 8. روابط الموارد السحابية على Google Drive

كافة الوثائق والعروض المرئية تم رفعها وتكاملها سحابياً مع حساب Google Drive الخاص بك في تصنيف **«التقارير والعروض»**:

### أولاً: موارد المنصة المطورة (Executive WOW Suite)
* **مشغل العرض التفاعلي السحابي (HTML):**
  [العرض المرئي التنفيذي الشامل](https://drive.google.com/file/d/1POO0rogYM-HjtGb7My7U5ztcADNAz95B/view?usp=drivesdk) `(ID: 1POO0rogYM-HjtGb7My7U5ztcADNAz95B)`
* **فيديو العرض التنفيذي بدقة 1080p (MP4):**
  [فيديو العرض التنفيذي الشامل](https://drive.google.com/file/d/1PMgPLOoXBJs9fUw-flvmv1UtnVdLP21d/view?usp=drivesdk) `(ID: 1PMgPLOoXBJs9fUw-flvmv1UtnVdLP21d)`
  - *رابط البث السحابي المباشر:* [Google Drive Stream Preview](https://drive.google.com/file/d/1PMgPLOoXBJs9fUw-flvmv1UtnVdLP21d/preview)

### ثانياً: موارد الفرع الأصلي (Baseline main)
* **مشغل عرض الفرع الأصلي (HTML):**
  [مشغل عرض الفرع الأصلي](https://drive.google.com/file/d/1pgUpT5JZTnWAci7mRy3MM5yalcfY-vBm/view?usp=drivesdk) `(ID: 1pgUpT5JZTnWAci7mRy3MM5yalcfY-vBm)`
* **فيديو عرض الفرع الأصلي بدقة 1080p (MP4):**
  [فيديو عرض الفرع الأصلي](https://drive.google.com/file/d/1FVFVcLEk0f4-sjzrOV3bfx5cCuMfMe2g/view?usp=drivesdk) `(ID: 1FVFVcLEk0f4-sjzrOV3bfx5cCuMfMe2g)`
  - *رابط البث السحابي المباشر:* [Google Drive Stream Preview](https://drive.google.com/file/d/1FVFVcLEk0f4-sjzrOV3bfx5cCuMfMe2g/preview)

---

### 🧪 التحقق والاختبارات
* **حزمة الاختبارات:** **113/113** اختبار وحدة (Unit Tests) بنسبة نجاح 100%.
* **فحوصات الواجهة والتصميم:** **20/20** فحص واجهة (UI/UX Checks) بنسبة نجاح 100%.
* **معايير الكود:** ملف `server.js` مستقر عند **61 سطراً**.
