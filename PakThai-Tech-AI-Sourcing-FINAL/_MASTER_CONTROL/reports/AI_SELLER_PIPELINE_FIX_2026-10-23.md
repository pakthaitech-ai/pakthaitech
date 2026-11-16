# پاک تھائی ٹیک — AI سپلائر پائپ لائن کی اصلاح
تاریخ: 23 اکتوبر 2026 (پاکستانی وقت)
حیثیت: اصلاح مکمل، ٹیسٹ پاس، Worker تعینات اور بنیادی لائیو اینڈ پوائنٹس تصدیق شدہ

## بنیادی خرابی
- عوامی کاروباری تلاش کے نتائج external_prospects میں محفوظ ہوتے تھے، لیکن AI اسکریننگ صرف نوٹس لکھتی تھی؛ اعلیٰ مطابقت والے امیدوار خودکار طور پر Seller Database میں منتقل نہیں ہوتے تھے۔
- دستی منتقلی کے لیے review_status='qualified' درکار تھا۔ تمام پراسپیکٹس unreviewed رہنے پر Sellers کی تعداد صفر رہ سکتی تھی۔
- مواقع بنانے کے لیے خریدار کی حقیقی ضرورت، پروڈکٹ میچ، فعال سپلائر اور قابلِ استعمال seller offer درکار ہے۔ 455 مصنوعات بذاتِ خود کاروباری مواقع نہیں بناتیں۔

## اس اصلاح میں کیا بدلا
- AI اسکریننگ کی حد فی رَن 5 سے بڑھا کر 20 غیر جانچے گئے سپلائر پراسپیکٹس کی گئی۔
- واضح Relevance: high، معاون ملک (Thailand، South Korea یا Pakistan) اور درست HTTP/HTTPS ماخذ والے امیدوار کو Seller Database میں pending حیثیت سے شامل کیا جا سکتا ہے۔
- موجودہ سپلائر سے نقل بچانے اور پراسپیکٹ کو Seller ID سے جوڑنے کا طریقہ شامل کیا گیا۔
- کم یا درمیانی مطابقت، نامعلوم/غیر معاون ملک یا ناقص ماخذ پر نیا seller ریکارڈ نہیں بنتا۔
- pending کا مطلب تصدیق شدہ سپلائر نہیں۔ رابطہ، اسٹاک، قیمت، مقدار، برآمدی صلاحیت اور تجارتی شرائط کی تصدیق باقی رہتی ہے۔
- کوئی خریدار، خریدار کی ضرورت، seller offer، کاروباری موقع، قیمت، آرڈر یا بیرونی پیغام فرضی طور پر نہیں بنایا گیا۔ تجارتی منظوری اونر کے پاس برقرار ہے۔

## ٹیسٹ اور تعیناتی
- نئے AI پائپ لائن ٹیسٹ: 3/3 کامیاب۔
- مکمل ٹیسٹ سوٹ: 125/125 کامیاب؛ ڈیش بورڈ inline validation کامیاب؛ دونوں inline scripts چیک ہوئے۔
- آخری Wrangler dry-run کامیاب: 533.68 KiB / 117.30 KiB gzip۔
- Worker تعینات: 00b51f7e-6d60-49bc-bfbd-e731f01e74ad۔ موجودہ تین Cron schedules برقرار رکھے گئے۔
- لائیو health: HTTP 200۔ لائیو catalog: HTTP 200، 455 مصنوعات۔ بغیر Owner session کے private prospects API نے HTTP 401 دیا، جو مطلوبہ تحفظ ہے۔

## ابھی باقی
- موجودہ Owner session کے بغیر لائیو D1 seller count یا اگلے scheduled AI run کے نتائج نہیں پڑھے گئے؛ اس لیے Seller count میں فوری اضافے کا دعویٰ نہیں کیا جا رہا۔
- اگلے شیڈول رَن کے بعد Owner-authenticated dashboard میں pending sellers اور AI screening status کی تصدیق درکار ہے۔
- جب تک حقیقی buyer requirement اور قابلِ استعمال seller offer موجود نہ ہو، opportunities کا صفر رہنا حفاظتی طور پر درست ہے۔
- مائیک، Meta، WhatsApp، Crisp، Telegram، Gmail، Store، billing، secrets اور Cron schedules اس اصلاح کے دائرے میں نہیں ہیں۔

## آخری اصلاح
- پہلے سے AI_SCREEN نوٹس والے غیر جانچے گئے پراسپیکٹس بھی اگلے رَن میں دوبارہ intake کے لیے آ سکتے ہیں۔ AI_SELLER_INTAKE نشان تکراری پروسیسنگ روکتا ہے؛ ناکامی پر ریکارڈ دوبارہ کوشش کے لیے دستیاب رہتا ہے۔
- تازہ ترین Worker ورژن: 00b51f7e-6d60-49bc-bfbd-e731f01e74ad۔ مخصوص ٹیسٹ 3/3 اور مکمل ٹیسٹ 125/125 کامیاب؛ dry-run کامیاب۔ لائیو health 200، catalog 455، غیر مصدقہ private route 401۔

## Dashboard remote review and fixes — 2026-10-23

- Used a separate Edge remote-debugging profile to inspect the authenticated Owner dashboard DOM and navigate the main dashboard tabs without changing business records.
- Fixed the shared `show(id)` navigation helper: it now hides `discoverycenter`, preventing Buyer & Seller Discovery from remaining visible under Voice Assistant or Sourcing Partners.
- Added inline-dashboard regression validation for the panel-navigation list.
- Fixed Pakistan Buyer Discovery accepting `Pakistan` as if it were a city. The API now returns HTTP 400 with a clear instruction to use city names (Lahore, Karachi, Islamabad, etc.), preventing country-level queries from persisting unrelated global search results.
- Added regression test for country-only city input.
- Validation: full test suite 126/126 passed; dashboard inline scripts passed; Wrangler dry-run passed; deploy succeeded; live `/api/health` returned `ok:true`; live Owner-session request for city `Pakistan` returned the expected 400; live navigation check showed Voice Assistant `display:block` and Discovery `display:none`.
- Deployment version: `95b22515-2f0a-43c6-81ee-c791bf36c264`.
- Existing previously saved unverified prospects were not deleted or bulk-modified. Foreign/unverified rows remain visible for Owner review; they must not be treated as confirmed Pakistan-local buyers.
- Remaining operational blockers seen on the dashboard: WhatsApp outbound remains blocked pending Meta sender verification; no seller records, sourcing opportunities, Pakistan buyers, or buyer requirements exist yet. Commercial quote/deal creation still requires verified price, FX, export/shipping costs, and Owner approval.
