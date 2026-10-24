# web4125 — ماكينة تحويل HTML إلى فيديو

ارفع ملف `.html` إلى مجلد **`inputs/`** → GitHub Actions يحوّله إلى فيديو MP4.

| المواصفات | القيمة |
| --- | --- |
| المقاس النهائي | **1080 × 1920** (عمودي 9:16) |
| معدل الإطارات | **60 fps** |
| المدة | **25 ثانية** بالضبط (1500 إطار) |
| الترميز | H.264 · `yuv420p` · CRF 14 · bt709 |
| أين أجد الفيديو | **Releases** (`render-<رقم>`) + **Artifacts** |

المُحرّك: [Remotion](https://remotion.dev) على runner من نوع Ubuntu.

> YouTube / TikTok / Reels / Shorts — كلها تقبل هذا المقاس مباشرة.

---

## الاستخدام اليومي

```
inputs/1.html              →  output/1.mp4
inputs/clips/sale.html     →  output/clips-sale.mp4
inputs/audio/1.mp3         →  صوت اختياري لـ inputs/1.html
```

1. ارفع أو عدّل ملفًا داخل `inputs/`.
2. اعمل Commit على `main` (أو ارفع بالويب — نفس الشيء).
3. انتظر دقيقتين تقريبًا → **Releases** → افتح `render-<الرقم>` → نزّل الـ MP4.

تشغيل يدوي: **Actions → “Render HTML → MP4 (1080x1920 · 60fps · 25s)” → Run workflow**.
يمكنك تمرير `only` (مثل `1`) لعرض ملف واحد فقط، وإيقاف `publish_release` إن أردت أرتيفاكت فقط.

لا شيء يُحفظ داخل الريبو: الفيديوهات تعيش في Release assets والأرتيفاكتات
(`video-<name>` لمدة 14 يومًا، `rendered-videos-<run>` لمدة 30 يومًا).

---

## الخطوط — لماذا لن تتغيّر بعد اليوم

ملفاتك تطلب `font-family: Tahoma, Arial, sans-serif`، وهذه الخطوط موجودة على Windows فقط.
على لينكس كان Chrome يستبدلها بـ DejaVu فتنزاح كل الأحجام. الآن يُحقن داخل الصفحة
`@font-face` لكل عائلة تطلبها — `Tahoma`, `Arial`, `Helvetica`, `Segoe UI`,
`Trebuchet MS`, `Verdana`, `system-ui` — تشير إلى ملفات `fonts/`:

| الملف | يغطي |
| --- | --- |
| `LiberationSans-Regular/Bold.ttf` | اللاتيني والأرقام والعلامات (متوافق المقاسات مع Arial) |
| `NotoSansArabic-Regular/Bold.ttf` | العربية وتشكيلها RTL |

`unicode-range` يفصل العربي عن اللاتيني، فيغطي اسم عائلة واحد اللغتين. النتيجة:
**نفس مقاسات النص** على جهازك وعلى GitHub وعلى أي runner آخر.

### تريد Tahoma الأصلي (مطابق لـ Windows حرفيًا)؟

Tahoma ملكية خاصة ولا يمكن شحنها هنا. إن كان لديك ترخيص Windows، ضع الملفات:

```
fonts/Tahoma.ttf        →  العائلة "Tahoma" عادي
fonts/Tahoma-Bold.ttf   →  العائلة "Tahoma" عريض
```

(تُقبل أيضًا `Arial.ttf`, `SegoeUI.ttf`, `Trebuchet.ttf`, `Verdana.ttf`.)
يعاد بناء القواعد تلقائيًا، وملفك يفوز على البديل المرفق.

---

## الأحجام — لماذا الـ viewport هو 540×960 مع ×2

ملفاتك مبنية على `width: min(100vw, 56.25vh)` مع أحجام خطوط **بالبكسل المطلق**
(`15px`، `11px`، `8px`). هذه الأحجام تظهر صحيحة على العرض الذي صُمّم عليه التصميم
(حوالي 506px في نافذة متصفح بحجم هاتف). عند العرض داخل viewport بعرض 1080px بقيت
الأحجام المطلقة كما هي بينما تضاعفت المساحة — فظهر كل شيء صغيرًا/خاطئًا.

لذلك يُعرض التصميم داخل **viewport بمقاس 540×960** ويُلتقط بـ `deviceScaleFactor: 2`،
فينتج **1080×1920** حقيقي مع نص حاد:

```json
{ "width": 540, "height": 960, "scale": 2 }
```

إذا كان ملفك مصمَّمًا على 1080×1920 مع وحدات نسبية (`vw`/`vmin`/`rem`)، اجعل
`scale: 1` و`width: 1080`، `height: 1920`.

---

## كيف يتحوّل HTML إلى إطارات

تُحجَز الصفحة داخل Chrome بلا واجهة وتُنقل زمنيًا إطارًا بإطار. **ساعة افتراضية** تُحقن
قبل سكربتاتك، فتصبح `setTimeout` / `setInterval` / `requestAnimationFrame` / `Date.now`
قابلة لإعادة الإنتاج بالضبط:

1. تُطلق كل المؤقّتات المستحقة حتى الزمن `t` بترتيبها الزمني،
2. كل أنيميشن ظهر من مؤقّت يُربط بزمن ذلك المؤقّت (مشهد يدخل عند 4.4 ث يبدأ حركته عند 4.4 ث)،
3. تُوقف كل أنيميشنات CSS وتُنقل إلى `currentTime` الصحيح،
4. تُحدَّث `--t`, `--remotion-time`, `--remotion-progress` ويُنادى `window.__seek(t)`،
5. لقطة الشاشة → الإطار التالي.

لذلك تعمل القصص المبنية على JavaScript والتأثيرات الحرفية بشكل دقيق. الممنوع الوحيد:
`Math.random()` وقت الرسم، أو طلب بيانات من الشبكة وقت العرض.

### لـ `<canvas>` / WebGL

صرّح بالخط الزمني بنفسك:

```js
window.__seek = (t, { progress }) => drawFrameAt(t);  // t بالثواني
window.__ready = myImageLoadingPromise;               // اختياري
```

---

## الملفات والتخطيط

```
inputs/                     ← ملفات HTML التي ترفعها
inputs/audio/               ← صوت اختياري بنفس الاسم
fonts/                      ← الخطوط المشحونة (Liberation + Noto Arabic)
src/timeline.ts             ← الساعة الافتراضية + حقن @font-face
src/seek.ts                 ← محرّك النقل الزمني للإطارات
src/HtmlVideo.tsx           ← الـ iframe + التقاط الإطار + الصوت
src/Root.tsx                ← كومبوزيشن لكل ملف HTML
scripts/scan-fonts.mjs      ← بناء قواعد @font-face من fonts/
scripts/scan-scenes.mjs     ← inputs/ → public/scenes/ + قائمة المشاهد
scripts/render-all.mjs      ← العارض (bundle مرة، متصفح مرة، كل المشاهد)
scripts/verify-output.mjs   ← فحص المقاس/fps/المدة + كشف الفيديو المجمّد
video.config.json           ← المقاس / fps / المدة / الجودة
.github/workflows/render.yml ← الماكينة نفسها
```

---

## استكشاف الأخطاء

| العَرَض | السبب / الحل |
| --- | --- |
| الخطأ `exit code 127` | أداة غير مثبّتة. التحقق يستخدم ffprobe المرفق مع Remotion، لا ffmpeg النظام |
| فيديو أسود أو فارغ | التصميم يعتمد على الـ viewport — استخدم `1080×1920` ثابتًا أو اضبط `scale` |
| نص «مجمّد» أو متكرر | سكربت يعتمد على `Math.random()` أو بيانات شبكة |
| الخط تغيّر | ضع ملف الخط في `fonts/` وأضف `@font-face`، أو استخدم العائلات المدعومة |
| الأحجام صغيرة/كبيرة | اضبط `width/height/scale` كما في قسم الأحجام |
| لا يتم إنشاء Release | Settings → Actions → General → Workflow permissions → **Read and write** |
| تحقق `motion` منخفض | الفيديو شبه ساكن؛ راجع قسم «كيف يتحوّل HTML» |

---

## محليًا (اختياري)

```bash
npm install
npm run render            # كل ما في inputs/ → output/
ONLY=1 npm run render     # ملف واحد
npm run studio            # معاينة بخط زمني
npm run fonts             # إعادة بناء قواعد الخطوط بعد إضافة خط
```

يحتاج مكتبات Chrome محليًا (`libnss3`, `libgbm1`, …) — الـ workflow يثبّتها تلقائيًا.

---

ترخيص Remotion: مجاني للأفراد وللشركات حتى 3 موظفين —
[remotion.dev/license](https://remotion.dev/license).
