# Smart Memory - WebSocket & Voice Backend (for Render)

خادم الـ WebSockets المستقل للعبة «ذاكرة ذكية»، مخصص للنشر السريع على منصة [Render.com](https://render.com) لتمكين المعلم الذكي الصوتي والمحادثة المباشرة (Gemini Live API) مع تطبيق Vercel.

---

## الميزات
- خادم **WebSockets** دائم على المسار `wss://<host>/api/live`.
- تكامل مباشر مع **Gemini Live API** (`gemini-3.8-live`) بالصوت ثنائي الاتجاه (Bi-directional Audio).
- نقطة فحص الحالة: `GET /api/health`.
- نقطة نطق البطاقات: `POST /api/tts`.
- إعدادات تلقائية وجاهزة عبر `render.yaml`.

---

## خطوات النشر على Render في دقيقة واحدة:

1. افتح [Render.com](https://dashboard.render.com/) وسجل الدخول بحساب GitHub.
2. اضغط على **New +** ثم اختر **Blueprint**.
3. اختر هذا المستودع (`el-hatem/wss`).
4. سيقرأ Render ملف `render.yaml` تلقائياً. كل ما عليك فعله هو إدخال قيمة `GEMINI_API_KEY`.
5. اضغط **Apply**.
6. بعد انتهاء النشر، انسخ الرابط الخاص بك (مثال: `https://child-game-wss.onrender.com`).

---

## الربط مع تطبيق Vercel:

1. افتح مشروعك في [Vercel](https://vercel.com).
2. اذهب إلى **Settings** ➔ **Environment Variables**.
3. أضف المتغير التالي:
   - **Key:** `VITE_WS_URL`
   - **Value:** `https://child-game-wss.onrender.com` (رابط الخادم من Render).
4. اضغط **Redeploy** في Vercel.
5. مبروك! ستعمل ميزة المحادثة الصوتية الحية مع المعلم الذكي مباشرة من موقع Vercel.
