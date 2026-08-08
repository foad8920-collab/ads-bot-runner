const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const os = require('os');
const axios = require('axios');
const express = require('express');
const { createClient } = require('@supabase/supabase-js');

// ============================================================
// 🔌 Supabase
// ============================================================

const SUPABASE_URL =
    process.env.SUPABASE_URL ||
    'https://bmsfhqmsovicpgxxwsgi.supabase.co';

const SUPABASE_KEY =
    process.env.SUPABASE_KEY ||
    'sb_publishable_l1IbZF35GnYYS8PamVX_kg_nTv_uyef';

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error(
        '❌ SUPABASE_URL أو SUPABASE_KEY غير موجود في Environment Variables'
    );

    process.exit(1);
}

const supabase =
    createClient(
        SUPABASE_URL,
        SUPABASE_KEY
    );

// ============================================================
// ⚙️ إعدادات البوت
// ============================================================

const TEMP_DIR = path.join(os.tmpdir(), 'bot2-temp-files');

const ACCOUNT_NAME = 'الحساب (2)';
const BOT_ID = 'bot2';

const PORT = process.env.PORT || 3000;

const MAX_DAILY_COUNT = 15;

// ============================================================
// 🧠 أدوات عامة
// ============================================================

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function randomDelay(minSeconds, maxSeconds) {
    const min = minSeconds * 1000;
    const max = maxSeconds * 1000;

    return Math.floor(
        Math.random() * (max - min + 1)
    ) + min;
}

function getMemoryLog() {
    const memory = process.memoryUsage();

    const rssMB = (memory.rss / 1024 / 1024).toFixed(1);
    const heapMB = (memory.heapUsed / 1024 / 1024).toFixed(1);

    return `📊 [RAM: ${rssMB} MB | Heap: ${heapMB} MB]`;
}

// ============================================================
// 📋 Dashboard Logger
// ============================================================

async function logToDashboard(message, type = 'info') {

    const ramInfo = getMemoryLog();

    const fullMsg = `${message} | ${ramInfo}`;

    const consoleMsg = `[${ACCOUNT_NAME}] ${fullMsg}`;

    if (type === 'error') {
        console.error(`❌ ${consoleMsg}`);
    } else if (type === 'success') {
        console.log(`✅ ${consoleMsg}`);
    } else if (type === 'warn') {
        console.warn(`⚠️ ${consoleMsg}`);
    } else {
        console.log(`📢 ${consoleMsg}`);
    }

    try {

        const { error } = await supabase
            .from('bot_logs')
            .insert([
                {
                    message: consoleMsg,
                    log_type: type
                }
            ]);

        if (error) {
            console.error(
                `⚠️ [Log Error] فشل حفظ السجل: ${error.message}`
            );
        }

    } catch (e) {

        console.error(
            `⚠️ [Log Exception] ${e.message}`
        );
    }
}

// ============================================================
// ⚙️ قراءة إعداد من Supabase
// ============================================================

async function getSetting(keyName) {

    try {

        const { data, error } = await supabase
            .from('system_settings')
            .select('value')
            .eq('key', keyName)
            .single();

        if (error || !data) {
            return null;
        }

        return data.value;

    } catch (e) {

        return null;
    }
}

// ============================================================
// 🧹 تنظيف السجلات القديمة
// ============================================================

async function cleanOldLogs() {

    try {

        const threeDaysAgo =
            new Date(
                Date.now() - 3 * 24 * 60 * 60 * 1000
            ).toISOString();

        const { error } = await supabase
            .from('bot_logs')
            .delete()
            .lt('created_at', threeDaysAgo);

        if (!error) {

            await logToDashboard(
                `🧹 تم تنظيف سجلات Dashboard الأقدم من 3 أيام.`,
                'info'
            );
        }

    } catch (e) {

        await logToDashboard(
            `⚠️ فشل تنظيف السجلات القديمة: ${e.message}`,
            'warn'
        );
    }
}

// ============================================================
// 🛑 الإيقاف الفوري
// ============================================================

async function forceKillProcess(
    reason = 'طلب إيقاف من المستخدم'
) {

    await logToDashboard(
        `🛑 ${reason} | جاري تحويل حالة البوت إلى IDLE وإنهاء العملية...`,
        'warn'
    );

    try {

        await supabase
            .from('bot_counters')
            .update({
                status: 'IDLE'
            })
            .eq('bot_name', BOT_ID);

    } catch (e) {

        console.error(
            `❌ فشل تحديث حالة البوت: ${e.message}`
        );
    }

    if (
        process.env.GITHUB_ACTIONS &&
        process.env.GITHUB_TOKEN &&
        process.env.GITHUB_REPOSITORY &&
        process.env.GITHUB_RUN_ID
    ) {

        try {

            await axios.post(

                `https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}/cancel`,

                {},

                {
                    headers: {
                        Authorization:
                            `token ${process.env.GITHUB_TOKEN}`
                    }
                }
            );

            await logToDashboard(
                `🛑 تم إرسال أمر إلغاء Workflow إلى GitHub Actions.`,
                'info'
            );

        } catch (e) {

            console.error(
                `❌ فشل إلغاء Workflow: ${e.message}`
            );
        }
    }

    process.exit(0);
}

// ============================================================
// 🔢 فحص العداد اليومي
// ============================================================

async function checkAndResetCounter(botName) {

    try {

        const todayStr =
            new Date().toLocaleDateString(
                'en-CA',
                {
                    timeZone: 'Asia/Riyadh'
                }
            );

        const { data, error } = await supabase
            .from('bot_counters')
            .select(
                'daily_count, last_reset_date'
            )
            .eq('bot_name', botName)
            .single();

        if (error || !data) {
            return 0;
        }

        if (data.last_reset_date !== todayStr) {

            await logToDashboard(
                `🔄 يوم جديد (${todayStr})! تصفير عداد ${botName}.`,
                'info'
            );

            // مهم جداً:
            // حذف سجلات هذا البوت فقط وليس كل البوتات.
            await supabase
                .from('bot_publish_logs')
                .delete()
                .eq('bot_name', botName);

            await supabase
                .from('bot_counters')
                .update({
                    daily_count: 0,
                    last_reset_date: todayStr,
                    status: 'RUNNING'
                })
                .eq('bot_name', botName);

            return 0;
        }

        return data.daily_count || 0;

    } catch (e) {

        await logToDashboard(
            `⚠️ فشل فحص العداد اليومي: ${e.message}`,
            'warn'
        );

        return 0;
    }
}

// ============================================================
// 📊 تسجيل النشر الناجح
// ============================================================

async function logPublishSuccess(
    botName,
    adId,
    actualPostText,
    groupName
) {

    try {

        const exactPublishTime =
            new Date()
                .toLocaleString(
                    'sv-SE',
                    {
                        timeZone: 'Asia/Riyadh'
                    }
                )
                .replace(' ', 'T');

        const displayTitle =
            actualPostText
                ? (
                    actualPostText.length > 120
                        ? actualPostText.substring(0, 120) + '...'
                        : actualPostText
                )
                : 'إعلان بدون عنوان';

        const { error: insertError } =
            await supabase
                .from('bot_publish_logs')
                .insert([
                    {
                        bot_name: botName,
                        ad_id: adId,
                        ad_title: displayTitle,
                        group_name: groupName,
                        status: 'SUCCESS',
                        published_at: exactPublishTime
                    }
                ]);

        if (insertError) {

            await logToDashboard(
                `❌ فشل تسجيل سجل النشر: ${insertError.message}`,
                'error'
            );
        }

        const { data } =
            await supabase
                .from('bot_counters')
                .select(
                    'daily_count, total_count'
                )
                .eq('bot_name', botName)
                .single();

        const currentDaily =
            (data?.daily_count || 0) + 1;

        const currentTotal =
            (data?.total_count || 0) + 1;

        await supabase
            .from('bot_counters')
            .update({
                daily_count: currentDaily,
                total_count: currentTotal,
                last_active: exactPublishTime,
                status: 'RUNNING'
            })
            .eq('bot_name', botName);

        await logToDashboard(
            `📊 [العداد] تم تسجيل نشر المجموعة (${groupName}) | اليوم: ${currentDaily}`,
            'success'
        );

    } catch (e) {

        await logToDashboard(
            `❌ خطأ أثناء تسجيل نجاح النشر: ${e.message}`,
            'error'
        );
    }
}

// ============================================================
// 🤖 Gemini AI
// ============================================================

async function rewriteAdWithAI(
    title,
    description
) {

    const geminiKey =
        await getSetting('GEMINI_KEY');

    if (!geminiKey) {

        return `${title}\n\n${description}`;
    }

    const promptText = `
أنت خبير في كتابة الإعلانات والتسويق الإلكتروني.

قم بإعادة صياغة الإعلان التالي بأسلوب جذاب وطبيعي ومختلف عن النص الأصلي.

الشروط:
- حافظ على جميع المعلومات الأساسية.
- لا تخترع معلومات غير موجودة.
- لا تحذف العنوان أو الموقع أو الأسعار أو المميزات المهمة.
- اجعل الصياغة مختلفة في كل مرة.
- استخدم أسلوباً طبيعياً مناسباً للجمهور اليمني.
- لا تضع مقدمات أو شرحاً عن أنك ذكاء اصطناعي.
- أعطني النص النهائي فقط.
- لا تستخدم كلمة "العنوان:" أو "الوصف:".

العنوان الأصلي:
${title}

الوصف الأصلي:
${description}
`;

    try {

        const modelsResponse =
            await axios.get(
                `https://generativelanguage.googleapis.com/v1beta/models?key=${geminiKey}`,
                {
                    timeout: 30000
                }
            );

        const validModels =
            (modelsResponse.data.models || [])
                .filter(model =>
                    model.supportedGenerationMethods &&
                    model.supportedGenerationMethods.includes(
                        'generateContent'
                    ) &&
                    model.name.includes('gemini')
                );

        if (validModels.length === 0) {

            return `${title}\n\n${description}`;
        }

        for (const modelObj of validModels) {

            try {

                const response =
                    await axios.post(

                        `https://generativelanguage.googleapis.com/v1beta/${modelObj.name}:generateContent?key=${geminiKey}`,

                        {
                            contents: [
                                {
                                    parts: [
                                        {
                                            text: promptText
                                        }
                                    ]
                                }
                            ]
                        },

                        {
                            timeout: 60000
                        }
                    );

                const aiText =
                    response.data
                        ?.candidates?.[0]
                        ?.content?.parts?.[0]
                        ?.text;

                if (aiText && aiText.trim()) {

                    await logToDashboard(
                        `✨ تمت إعادة صياغة الإعلان بواسطة AI بنجاح.`,
                        'success'
                    );

                    return aiText
                        .replace(/العنوان:/gi, '')
                        .replace(/الوصف:/gi, '')
                        .trim();
                }

            } catch (e) {

                continue;
            }
        }

    } catch (e) {

        await logToDashboard(
            `⚠️ تعذر الاتصال بـ Gemini: ${e.message}`,
            'warn'
        );
    }

    return `${title}\n\n${description}`;
}

// ============================================================
// 🖼️ تحميل الصورة / الفيديو
// ============================================================

async function downloadImage(imageUrl) {

    if (!imageUrl) {
        return null;
    }

    if (!fs.existsSync(TEMP_DIR)) {

        fs.mkdirSync(
            TEMP_DIR,
            {
                recursive: true
            }
        );
    }

    let ext = '.jpg';

    const lowerUrl =
        imageUrl.toLowerCase();

    if (
        lowerUrl.includes('.mp4') ||
        lowerUrl.includes('ik-video')
    ) {

        ext = '.mp4';

    } else if (
        lowerUrl.includes('.mov')
    ) {

        ext = '.mov';

    } else if (
        lowerUrl.includes('.webp') ||
        lowerUrl.includes('f-webp')
    ) {

        ext = '.webp';

    } else if (
        lowerUrl.includes('.png')
    ) {

        ext = '.png';
    }

    const imagePath =
        path.join(
            TEMP_DIR,
            `ad-image-bot2-${Date.now()}${ext}`
        );

    const response =
        await axios({
            url: imageUrl,
            method: 'GET',
            responseType: 'stream',
            timeout: 120000
        });

    await new Promise(
        (resolve, reject) => {

            const writer =
                fs.createWriteStream(
                    imagePath
                );

            response.data.pipe(writer);

            writer.on(
                'finish',
                resolve
            );

            writer.on(
                'error',
                reject
            );
        }
    );

    return imagePath;
}

// ============================================================
// ☕ تهيئة جلسة Facebook مرة واحدة فقط
// ============================================================

async function warmupSession(page) {

    try {

        await logToDashboard(
            `☕ تهيئة جلسة Facebook للبوت الثاني قبل بدء النشر...`,
            'info'
        );

        await page.goto(
            'https://www.facebook.com/',
            {
                waitUntil: 'domcontentloaded',
                timeout: 45000
            }
        );

        await sleep(
            randomDelay(8, 12)
        );

        const currentUrl =
            page.url();

        if (
            currentUrl.includes('login') ||
            currentUrl.includes('checkpoint')
        ) {

            throw new Error(
                'انتهت جلسة Facebook أو ظهرت صفحة Checkpoint'
            );
        }

        await logToDashboard(
            `✅ جلسة Facebook جاهزة.`,
            'success'
        );

        return true;

    } catch (e) {

        throw e;
    }
}

// ============================================================
// 📝 فتح نافذة المنشور
// ============================================================

async function openPostBox(page) {

    const initialWait =
        randomDelay(18, 25);

    await logToDashboard(
        `⏳ انتظار ${Math.round(initialWait / 1000)} ثانية لتحميل عناصر المجموعة...`,
        'info'
    );

    await sleep(initialWait);

    const discussionTabs = [

        'div[role="tab"]:has-text("مناقشة")',
        'div[role="tab"]:has-text("Discussion")',
        'a[role="tab"]:has-text("مناقشة")',
        'a[role="tab"]:has-text("Discussion")',
        'a[href*="/discussion"]'

    ];

    for (const tabSel of discussionTabs) {

        try {

            const tabBtn =
                page.locator(tabSel).first();

            if (
                await tabBtn.count() > 0 &&
                await tabBtn.isVisible()
            ) {

                await tabBtn.click({
                    timeout: 5000,
                    force: true
                });

                const tabWait =
                    randomDelay(10, 16);

                await logToDashboard(
                    `🔄 تم فتح تبويب المناقشة، انتظار ${Math.round(tabWait / 1000)} ثانية...`,
                    'info'
                );

                await sleep(tabWait);

                break;
            }

        } catch (e) {}
    }

    const selectors = [

        'span:has-text("اكتب شيئًا...")',
        'span:has-text("Write something...")',

        'text="اكتب شيئًا..."',
        'text="Write something..."',

        'text="بم تفكر؟"',
        'text="What\'s on your mind?"',

        'text="إنشاء منشور عام..."',
        'text="Create a public post..."',

        'div[role="button"]:has-text("اكتب شيئًا...")',
        'div[role="button"]:has-text("Write something...")',

        'div[role="button"]:has-text("بم تفكر؟")',
        'div[role="button"]:has-text("What\'s on your mind?")',

        'div[role="textbox"]',

        'span:has-text("اكتب")',
        'span:has-text("Write")',

        'div[role="button"]:has-text("اكتب")',
        'div[role="button"]:has-text("Write")',

        'div[role="button"]:has-text("بم تفكر")',
        'div[role="button"]:has-text("تفكر")',

        'text=/اكتب/i',
        'text=/تفكر/i'
    ];

    for (const selector of selectors) {

        try {

            const element =
                page.locator(selector).first();

            if (
                await element.count() > 0 &&
                await element.isVisible()
            ) {

                const box =
                    await element.boundingBox();

                if (box) {

                    await page.mouse.move(
                        box.x + box.width / 2,
                        box.y + box.height / 2
                    );
                }

                await sleep(
                    randomDelay(1, 2)
                );

                await element.click({
                    timeout: 6000,
                    force: true
                });

                const postOpenWait =
                    randomDelay(15, 22);

                await logToDashboard(
                    `⏳ تم فتح نافذة المنشور، انتظار ${Math.round(postOpenWait / 1000)} ثانية...`,
                    'info'
                );

                await sleep(postOpenWait);

                const confirmBtns = [
                    'text=موافق',
                    'text=فهمت',
                    'text=تم',
                    'text=Got It',
                    'text=OK',
                    'text=متابعة'
                ];

                for (const cBtn of confirmBtns) {

                    try {

                        const btn =
                            page.locator(cBtn).first();

                        if (
                            await btn.count() > 0 &&
                            await btn.isVisible()
                        ) {

                            await btn.click({
                                timeout: 3000,
                                force: true
                            });

                            await sleep(
                                randomDelay(1, 3)
                            );
                        }

                    } catch (e) {}
                }

                await logToDashboard(
                    `✅ تم فتح نافذة المنشور.`,
                    'success'
                );

                return true;
            }

        } catch (e) {}
    }

    return false;
}

// ============================================================
// ✍️ إدخال النص
// ============================================================

async function pasteTextWithLines(
    page,
    postText
) {

    await sleep(
        randomDelay(4, 7)
    );

    const targetSelectors = [

        'div[role="dialog"] div[role="textbox"]',

        'div[role="dialog"] [contenteditable="true"]',

        'div[role="dialog"] [aria-label*="اكتب"]',
        'div[role="dialog"] [aria-label*="Write"]',

        'div[role="dialog"] [aria-label*="بم تفكر"]',
        'div[role="dialog"] [aria-label*="What\'s on your mind"]',

        'div[aria-label*="اكتب شيئاً"]',
        'div[aria-label*="Write something"]',

        'div[contenteditable="true"]',

        'div[role="textbox"]'
    ];

    let textbox = null;

    for (const selector of targetSelectors) {

        try {

            const element =
                page.locator(selector).first();

            if (
                await element.count() > 0 &&
                await element.isVisible()
            ) {

                textbox = element;
                break;
            }

        } catch (e) {}
    }

    if (!textbox) {

        throw new Error(
            'تعذر العثور على مربع النص داخل نافذة المنشور'
        );
    }

    try {

        await textbox.click({
            timeout: 6000,
            force: true
        });

        await sleep(
            randomDelay(1, 3)
        );

        await page.evaluate(
            async (text) => {

                await navigator.clipboard.writeText(
                    text
                );

            },
            postText
        );

        await page.keyboard.press(
            'Control+V'
        );

        await logToDashboard(
            `✅ تم إدخال النص عبر Clipboard مع الحفاظ على الأسطر.`,
            'success'
        );

        return;

    } catch (err) {

        await logToDashboard(
            `⚠️ تعذر استخدام Clipboard، سيتم استخدام الإدخال البديل.`,
            'warn'
        );
    }

    try {

        await textbox.click({
            force: true
        });

        await page.keyboard.insertText(
            postText
        );

        await logToDashboard(
            `✅ تم إدخال النص بالطريقة البديلة.`,
            'success'
        );

    } catch (e) {

        throw new Error(
            `تعذر إدخال النص: ${e.message}`
        );
    }
}

// ============================================================
// 🚀 النشر في المجموعة
// ============================================================

async function publishToGroup(
    page,
    group,
    post,
    imagePath
) {

    await logToDashboard(
        `📢 فتح المجموعة: ${group.name}`,
        'info'
    );

    await page.goto(
        group.url,
        {
            waitUntil: 'domcontentloaded',
            timeout: 45000
        }
    );

    const pageLoadWait =
        randomDelay(30, 40);

    await logToDashboard(
        `⏳ انتظار ${Math.round(pageLoadWait / 1000)} ثانية لاستقرار المجموعة...`,
        'info'
    );

    await sleep(pageLoadWait);

    const currentUrl =
        page.url();

    if (
        currentUrl.includes('login') ||
        currentUrl.includes('checkpoint')
    ) {

        throw new Error(
            'Facebook أوقف الجلسة أو طلب تسجيل الدخول/Checkpoint'
        );
    }

    const opened =
        await openPostBox(page);

    if (!opened) {

        throw new Error(
            'لم يتم العثور على نافذة إنشاء المنشور'
        );
    }

    await sleep(
        randomDelay(4, 8)
    );

    // ========================================================
    // 🖼️ رفع الملف
    // ========================================================

    if (imagePath) {

        const imageTriggerSelectors = [

            'div[aria-label="صورة/فيديو"]',
            'div[aria-label="Photo/video"]',

            'svg[aria-label="صورة/فيديو"]',
            'svg[aria-label="Photo/video"]',

            'div:has-text("صورة/فيديو")',
            'div:has-text("Photo/video")',

            'div[role="button"]:has(input[type="file"])'
        ];

        let triggerClicked = false;

        for (
            const trigSel
            of imageTriggerSelectors
        ) {

            try {

                const trigElement =
                    page.locator(trigSel).first();

                if (
                    await trigElement.count() > 0 &&
                    await trigElement.isVisible()
                ) {

                    await trigElement.click({
                        timeout: 6000,
                        force: true
                    });

                    triggerClicked = true;

                    await sleep(
                        randomDelay(3, 5)
                    );

                    break;
                }

            } catch (e) {}
        }

        if (!triggerClicked) {

            await logToDashboard(
                `⚠️ لم يتم العثور على زر صورة/فيديو، سيتم البحث عن input مباشرة.`,
                'warn'
            );
        }

        let isFileInjected = false;

        try {

            const dialogFileInput =
                page
                    .locator(
                        'div[role="dialog"] input[type="file"]'
                    )
                    .first();

            if (
                await dialogFileInput.count() > 0
            ) {

                await dialogFileInput
                    .setInputFiles(imagePath);

                isFileInjected = true;

            } else {

                const allFileInputs =
                    page.locator(
                        'input[type="file"]'
                    );

                const count =
                    await allFileInputs.count();

                if (count > 0) {

                    await allFileInputs
                        .nth(count - 1)
                        .setInputFiles(imagePath);

                    isFileInjected = true;
                }
            }

        } catch (e) {

            throw new Error(
                `فشل إرفاق الملف: ${e.message}`
            );
        }

        if (!isFileInjected) {

            throw new Error(
                'لم يتم العثور على input صالح لرفع الملف'
            );
        }

        const isVideoFile =
            imagePath.endsWith('.mp4') ||
            imagePath.endsWith('.mov');

        const waitTime =
            isVideoFile
                ? randomDelay(55, 70)
                : randomDelay(22, 32);

        await logToDashboard(
            `🖼️ تم إرفاق الملف، انتظار ${Math.round(waitTime / 1000)} ثانية...`,
            'success'
        );

        await sleep(waitTime);

        try {

            await page.waitForSelector(
                'img[src*="blob:"], video, [aria-label*="إزالة"], [aria-label*="Remove"]',
                {
                    timeout: 30000
                }
            );

            await logToDashboard(
                `✅ ظهرت معاينة الملف.`,
                'success'
            );

        } catch (e) {

            await logToDashboard(
                `⚠️ لم يتم العثور على المعاينة بواسطة المحدد، سنكمل التحقق.`,
                'warn'
            );
        }

        const previewWait =
            randomDelay(18, 28);

        await logToDashboard(
            `⏳ انتظار ${Math.round(previewWait / 1000)} ثانية إضافية لاستقرار المعاينة...`,
            'info'
        );

        await sleep(previewWait);
    }

    // ========================================================
    // 🤖 إنشاء نص AI خاص بهذه المجموعة
    // ========================================================

    let postText =
        post.ai_final_text2 || '';

    if (
        !postText ||
        postText.trim() === ''
    ) {

        await logToDashboard(
            `🧠 ai_final_text2 فارغ، إنشاء نص جديد خاص بالمجموعة: ${group.name}`,
            'info'
        );

        const aiGeneratedContent =
            await rewriteAdWithAI(
                post.ad_title,
                post.ad_description
            );

        postText =
            `${aiGeneratedContent}\n\n🔥 إعلان جديد على سوق الإعلانات الحديث`;

        const fbUrl =
            post.facebook_url || '';

        if (
            fbUrl.trim() !== ''
        ) {

            postText +=
                `\n\n${fbUrl.trim()}`;
        }

        const { error } =
            await supabase
                .from('publish_queue')
                .update({
                    ai_final_text2: postText
                })
                .eq(
                    'id',
                    post.id
                );

        if (error) {

            await logToDashboard(
                `⚠️ فشل حفظ ai_final_text2: ${error.message}`,
                'warn'
            );

        } else {

            await logToDashboard(
                `💾 تم حفظ النص الجديد في ai_final_text2 للمجموعة الحالية.`,
                'success'
            );
        }

    } else {

        await logToDashboard(
            `📌 تم جلب النص الجاهز من ai_final_text2.`,
            'info'
        );
    }

    await logToDashboard(
        `📝 النص النهائي للمجموعة (${group.name}):\n${postText}`,
        'info'
    );

    await pasteTextWithLines(
        page,
        postText
    );

    // ========================================================
    // ⏳ انتظار معالجة النص / الرابط
    // ========================================================

    const fbUrlCheck =
        post.facebook_url || '';

    if (
        fbUrlCheck.trim() !== '' ||
        postText.includes('facebook.com')
    ) {

        const linkWait =
            randomDelay(40, 55);

        await logToDashboard(
            `⏳ انتظار ${Math.round(linkWait / 1000)} ثانية لمعالجة النص والرابط...`,
            'info'
        );

        await sleep(linkWait);

    } else {

        const textWait =
            randomDelay(22, 32);

        await logToDashboard(
            `⏳ انتظار ${Math.round(textWait / 1000)} ثانية لمعالجة النص...`,
            'info'
        );

        await sleep(textWait);
    }

    // ========================================================
    // 🚀 زر النشر
    // ========================================================

    const publishButtons = [

        'div[role="dialog"] div[role="button"]:has-text("نشر")',
        'div[role="dialog"] div[role="button"]:has-text("Post")',
        'div[role="dialog"] div[role="button"]:has-text("Publish")',

        'div[aria-label="نشر"]',
        'div[aria-label="Post"]',

        'text=نشر',
        'text=Post',
        'text=Publish'
    ];

    let published = false;

    for (
        const btn
        of publishButtons
    ) {

        try {

            const button =
                page.locator(btn).last();

            if (
                await button.count() > 0 &&
                await button.isVisible()
            ) {

                const btnBox =
                    await button.boundingBox();

                if (btnBox) {

                    await page.mouse.move(
                        btnBox.x + btnBox.width / 2,
                        btnBox.y + btnBox.height / 2
                    );

                    await sleep(
                        randomDelay(1, 2)
                    );
                }

                await button.click({
                    timeout: 8000,
                    force: true
                });

                published = true;

                await logToDashboard(
                    `🚀 تم الضغط على زر النشر.`,
                    'success'
                );

                break;
            }

        } catch (e) {}
    }

    if (!published) {

        throw new Error(
            'فشل العثور على زر النشر'
        );
    }

    // ========================================================
    // ⏳ انتظار اكتمال النشر
    // ========================================================

    const isUploadedVideo =
        imagePath &&
        (
            imagePath.endsWith('.mp4') ||
            imagePath.endsWith('.mov')
        );

    const finalWait =
        isUploadedVideo
            ? randomDelay(55, 70)
            : randomDelay(30, 40);

    await logToDashboard(
        `⏳ انتظار اكتمال عملية النشر ${Math.round(finalWait / 1000)} ثانية...`,
        'info'
    );

    await sleep(finalWait);

    await logToDashboard(
        `✅ انتهت عملية النشر في المجموعة: ${group.name}`,
        'success'
    );

    // مهم:
    // ننتظر تسجيل العملية فعلياً قبل العودة.
    await logPublishSuccess(
        BOT_ID,
        post.id,
        postText,
        group.name
    );
}

// ============================================================
// 🔒 تحويل groups_json إلى Array
// ============================================================

function parseGroups(value) {

    if (Array.isArray(value)) {
        return value;
    }

    if (
        typeof value === 'string' &&
        value.trim() !== ''
    ) {

        try {

            const parsed =
                JSON.parse(value);

            return Array.isArray(parsed)
                ? parsed
                : [];

        } catch (e) {

            return [];
        }
    }

    return [];
}

// ============================================================
// 🔒 تحويل bot2_group إلى Object
// ============================================================

function parseBotGroup(value) {

    if (
        typeof value === 'object' &&
        value !== null
    ) {

        return value;
    }

    if (
        typeof value === 'string' &&
        value.trim() !== ''
    ) {

        try {

            return JSON.parse(value);

        } catch (e) {

            return null;
        }
    }

    return null;
}

// ============================================================
// 🎯 سحب المجموعة التالية بشكل أكثر أماناً
// ============================================================

async function claimNextGroup(
    postId
) {

    for (let attempt = 1; attempt <= 5; attempt++) {

        try {

            const { data: currentData, error } =
                await supabase
                    .from('publish_queue')
                    .select(
                        'groups_json, bot2_group'
                    )
                    .eq('id', postId)
                    .single();

            if (error || !currentData) {

                return null;
            }

            const existingBotGroup =
                parseBotGroup(
                    currentData.bot2_group
                );

            if (existingBotGroup) {

                return existingBotGroup;
            }

            const groups =
                parseGroups(
                    currentData.groups_json
                );

            if (groups.length === 0) {

                return null;
            }

            const targetGroup =
                groups[0];

            const remainingGroups =
                groups.slice(1);

            const originalGroupsJson =
                JSON.stringify(groups);

            const newGroupsJson =
                JSON.stringify(remainingGroups);

            /*
             * تحديث مشروط:
             * إذا قام بوت آخر بتغيير groups_json
             * بين القراءة والتحديث، فلن يتم السحب.
             */

            const { data: updatedRows, error: updateError } =
                await supabase
                    .from('publish_queue')
                    .update({
                        bot2_group:
                            JSON.stringify(targetGroup),

                        groups_json:
                            newGroupsJson,

                        bot2_status:
                            'processing'
                    })
                    .eq(
                        'id',
                        postId
                    )
                    .eq(
                        'groups_json',
                        originalGroupsJson
                    )
                    .is(
                        'bot2_group',
                        null
                    )
                    .select('id');

            if (
                !updateError &&
                updatedRows &&
                updatedRows.length > 0
            ) {

                await logToDashboard(
                    `🎯 تم حجز المجموعة: ${targetGroup.name}`,
                    'success'
                );

                return targetGroup;
            }

            await sleep(
                randomDelay(1, 3)
            );

        } catch (e) {

            await sleep(2000);
        }
    }

    return null;
}

// ============================================================
// 🔍 فحص توقف الإعلان
// ============================================================

async function isBot2Stopped(
    postId
) {

    const { data: counterStatus } =
        await supabase
            .from('bot_counters')
            .select('status')
            .eq('bot_name', BOT_ID)
            .single();

    if (
        counterStatus &&
        [
            'IDLE',
            'STOPPED',
            'PAUSED'
        ].includes(
            counterStatus.status
        )
    ) {

        return true;
    }

    const { data: queueData } =
        await supabase
            .from('publish_queue')
            .select(
                'status, bot2_status'
            )
            .eq('id', postId)
            .single();

    if (!queueData) {

        return true;
    }

    if (
        [
            'stopped',
            'paused'
        ].includes(
            String(queueData.status || '').toLowerCase()
        )
    ) {

        return true;
    }

    if (
        [
            'stopped',
            'paused'
        ].includes(
            String(queueData.bot2_status || '').toLowerCase()
        )
    ) {

        return true;
    }

    return false;
}

// ============================================================
// 🚀 معالجة إعلان واحد للبوت الثاني
// ============================================================

async function processOnePostBot2(
    initialPostData
) {

    const currentDailyCount =
        await checkAndResetCounter(
            BOT_ID
        );

    if (
        currentDailyCount >=
        MAX_DAILY_COUNT
    ) {

        await logToDashboard(
            `⚠️ تم الوصول للحد اليومي للبوت الثاني (${MAX_DAILY_COUNT}).`,
            'warn'
        );

        await supabase
            .from('bot_counters')
            .update({
                status:
                    'MAX_LIMIT_REACHED'
            })
            .eq(
                'bot_name',
                BOT_ID
            );

        return;
    }

    const cookiesRaw =
        await getSetting(
            'FB_COOKIES_BOT2'
        );

    if (!cookiesRaw) {

        await logToDashboard(
            `❌ FB_COOKIES_BOT2 غير موجود في system_settings.`,
            'error'
        );

        return;
    }

    // ========================================================
    // ⏳ تأخير البداية الخاص بالبوت 2
    // ========================================================

    const initialOffsetDelay =
        randomDelay(240, 360);

    await logToDashboard(
        `⏳ تأخير بداية البوت الثاني ${Math.round(initialOffsetDelay / 60000)} دقائق...`,
        'info'
    );

    await sleep(
        initialOffsetDelay
    );

    await logToDashboard(
        `🚀 بدأ الإعلان #${initialPostData.id}: ${initialPostData.ad_title}`,
        'info'
    );

    // ========================================================
    // 🖼️ تحميل الوسائط
    // ========================================================

    let mediaUrl = '';

    if (
        initialPostData.ad_video &&
        initialPostData.ad_video.trim() !== ''
    ) {

        mediaUrl =
            initialPostData.ad_video.trim();

        await logToDashboard(
            `🎥 تم رصد فيديو الإعلان.`,
            'info'
        );

    } else if (
        initialPostData.ad_image &&
        initialPostData.ad_image.trim() !== ''
    ) {

        mediaUrl =
            initialPostData.ad_image.trim();

        await logToDashboard(
            `📸 تم رصد صورة الإعلان.`,
            'info'
        );
    }

    let imagePath = null;

    if (mediaUrl) {

        try {

            imagePath =
                await downloadImage(
                    mediaUrl
                );

            if (imagePath) {

                await logToDashboard(
                    `🖼️ تم تحميل الملف: ${imagePath}`,
                    'success'
                );
            }

        } catch (e) {

            await logToDashboard(
                `⚠️ فشل تحميل الملف: ${e.message}`,
                'warn'
            );
        }
    }

    // ========================================================
    // 🌐 تشغيل Chromium
    // ========================================================

    const launchOptions = {

        headless: true,

        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--no-first-run',
            '--no-service-autorun',
            '--password-store=basic',
            '--disable-extensions',
            '--disable-default-apps',
            '--mute-audio'
        ]
    };

    await logToDashboard(
        `🌐 تشغيل Chromium بإعدادات مستقرة.`,
        'info'
    );

    const browser =
        await chromium.launch(
            launchOptions
        );

    let context = null;

    try {

        // ====================================================
        // 🧩 إنشاء Context
        // ====================================================

        context =
            await browser.newContext({

                viewport: {
                    width: 1280,
                    height: 800
                },

                timezoneId:
                    'Asia/Riyadh',

                locale:
                    'ar-SA',

                userAgent:
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',

                permissions: [
                    'clipboard-read',
                    'clipboard-write'
                ],

                colorScheme:
                    'dark',

                hasTouch:
                    false
            });

        // ====================================================
        // 🚫 عدم تحميل الخطوط لتقليل الاستهلاك
        // ====================================================

        await context.route(
            '**/*',
            async route => {

                try {

                    const resourceType =
                        route.request()
                            .resourceType();

                    if (
                        resourceType === 'font'
                    ) {

                        await route.abort();
                        return;
                    }

                    await route.continue();

                } catch (e) {}
            }
        );

        // ====================================================
        // 🍪 تحميل Cookies
        // ====================================================

        let rawCookies =
            JSON.parse(
                cookiesRaw
            );

        const formattedCookies =
            rawCookies.map(
                cookie => {

                    const c =
                        {
                            ...cookie
                        };

                    if (
                        typeof c.sameSite ===
                        'string'
                    ) {

                        const lower =
                            c.sameSite
                                .toLowerCase();

                        if (
                            lower === 'lax'
                        ) {

                            c.sameSite =
                                'Lax';

                        } else if (
                            lower === 'strict'
                        ) {

                            c.sameSite =
                                'Strict';

                        } else if (
                            lower === 'none' ||
                            lower === 'no_restriction'
                        ) {

                            c.sameSite =
                                'None';

                        } else {

                            delete c.sameSite;
                        }

                    } else {

                        delete c.sameSite;
                    }

                    if (
                        c.expirationDate &&
                        !c.expires
                    ) {

                        c.expires =
                            c.expirationDate;
                    }

                    delete c.id;
                    delete c.storeId;
                    delete c.hostOnly;

                    return c;
                }
            );

        await context.addCookies(
            formattedCookies
        );

        await logToDashboard(
            `🍪 تم تحميل Cookies الخاصة بالبوت 2.`,
            'success'
        );

        // ====================================================
        // ☕ تجهيز Facebook مرة واحدة
        // ====================================================

        const sessionPage =
            await context.newPage();

        try {

            await warmupSession(
                sessionPage
            );

        } finally {

            await sessionPage.close();
        }

        // ====================================================
        // 🔄 معالجة المجموعات
        // ====================================================

        while (true) {

            // -----------------------------------------------
            // 🛑 فحص الإيقاف
            // -----------------------------------------------

            if (
                await isBot2Stopped(
                    initialPostData.id
                )
            ) {

                await forceKillProcess(
                    `تم رصد طلب إيقاف للبوت الثاني`
                );
            }

            // -----------------------------------------------
            // 🔄 جلب أحدث بيانات الإعلان
            // -----------------------------------------------

            const { data: freshData, error: freshError } =
                await supabase
                    .from('publish_queue')
                    .select('*')
                    .eq(
                        'id',
                        initialPostData.id
                    )
                    .single();

            if (
                freshError ||
                !freshData
            ) {

                throw new Error(
                    'تعذر قراءة الإعلان من publish_queue'
                );
            }

            // -----------------------------------------------
            // ⏭️ تخطي المجموعة الحالية
            // -----------------------------------------------

            if (
                freshData.skip_current_group === true
            ) {

                await logToDashboard(
                    `⏭️ تم طلب تخطي المجموعة الحالية.`,
                    'warn'
                );

                let failedGroups = [];

                try {

                    if (
                        freshData.error_message
                    ) {

                        const parsed =
                            JSON.parse(
                                freshData.error_message
                            );

                        if (
                            Array.isArray(parsed)
                        ) {

                            failedGroups =
                                parsed;
                        }
                    }

                } catch (e) {}

                const currentBotGroup =
                    parseBotGroup(
                        freshData.bot2_group
                    );

                const groupName =
                    currentBotGroup?.name ||
                    'مجموعة غير معروفة';

                const groupUrl =
                    currentBotGroup?.url ||
                    '';

                failedGroups.push({
                    name: groupName,
                    url: groupUrl,
                    error:
                        'تم تخطي المجموعة يدوياً'
                });

                await supabase
                    .from('publish_queue')
                    .update({

                        skip_current_group:
                            false,

                        bot2_group:
                            null,

                        ai_final_text2:
                            null,

                        bot2_status:
                            'running',

                        error_message:
                            JSON.stringify(
                                failedGroups
                            )
                    })
                    .eq(
                        'id',
                        initialPostData.id
                    );

                await sleep(2000);

                continue;
            }

            // -----------------------------------------------
            // 🔍 قراءة المجموعات الحالية
            // -----------------------------------------------

            const groups =
                parseGroups(
                    freshData.groups_json
                );

            const botGroup =
                parseBotGroup(
                    freshData.bot2_group
                );

            // -----------------------------------------------
            // 🏁 لا توجد مجموعات للبوت الثاني
            // -----------------------------------------------

            if (
                groups.length === 0 &&
                !botGroup
            ) {

                const {
                    data: checkAllBots
                } =
                    await supabase
                        .from('publish_queue')
                        .select(
                            `
                            bot1_group,
                            bot2_group,
                            bot3_group,
                            failed_count
                            `
                        )
                        .eq(
                            'id',
                            initialPostData.id
                        )
                        .single();

                const hasOtherBotGroups =
                    checkAllBots &&
                    (
                        checkAllBots.bot1_group ||
                        checkAllBots.bot3_group
                    );

                if (
                    !hasOtherBotGroups
                ) {

                    const finalFailed =
                        checkAllBots?.failed_count ||
                        0;

                    const finalStatus =
                        finalFailed > 0
                            ? 'failed'
                            : 'published';

                    await logToDashboard(
                        `🎉 اكتملت جميع المجموعات. الحالة النهائية: ${finalStatus}`,
                        'success'
                    );

                    await supabase
                        .from('publish_queue')
                        .update({

                            status:
                                finalStatus,

                            bot2_group:
                                null,

                            ai_final_text2:
                                null,

                            bot2_status:
                                'completed'
                        })
                        .eq(
                            'id',
                            initialPostData.id
                        );

                } else {

                    await logToDashboard(
                        `🎉 اكتملت جميع المجموعات المخصصة للبوت 2، والبوتات الأخرى مستمرة.`,
                        'success'
                    );

                    await supabase
                        .from('publish_queue')
                        .update({
                            bot2_status:
                                'completed',
                            ai_final_text2:
                                null
                        })
                        .eq(
                            'id',
                            initialPostData.id
                        );
                }

                await supabase
                    .from('bot_counters')
                    .update({
                        status: 'IDLE'
                    })
                    .eq(
                        'bot_name',
                        BOT_ID
                    );

                break;
            }

            // -----------------------------------------------
            // 🎯 تحديد المجموعة
            // -----------------------------------------------

            let targetGroup =
                botGroup;

            if (!targetGroup) {

                targetGroup =
                    await claimNextGroup(
                        initialPostData.id
                    );

                if (!targetGroup) {

                    await sleep(2000);
                    continue;
                }

            } else {

                await logToDashboard(
                    `🎯 استكمال المجموعة المعلقة: ${targetGroup.name}`,
                    'info'
                );
            }

            // -----------------------------------------------
            // 🛡️ فحص التكرار
            // -----------------------------------------------

            const { data: logData } =
                await supabase
                    .from('bot_publish_logs')
                    .select('id')
                    .eq(
                        'bot_name',
                        BOT_ID
                    )
                    .eq(
                        'ad_id',
                        initialPostData.id
                    )
                    .eq(
                        'group_name',
                        targetGroup.name
                    )
                    .eq(
                        'status',
                        'SUCCESS'
                    );

            if (
                logData &&
                logData.length > 0
            ) {

                await logToDashboard(
                    `🛡️ المجموعة (${targetGroup.name}) منشورة مسبقاً بواسطة ${BOT_ID}، سيتم تخطيها.`,
                    'warn'
                );

                await supabase
                    .from('publish_queue')
                    .update({

                        bot2_group:
                            null,

                        ai_final_text2:
                            null,

                        bot2_status:
                            'running'

                    })
                    .eq(
                        'id',
                        initialPostData.id
                    );

                await sleep(1500);

                continue;
            }

            // -----------------------------------------------
            // 🌐 فتح صفحة المجموعة
            // -----------------------------------------------

            const page =
                await context.newPage();

            try {

                const publishTask =
                    publishToGroup(
                        page,
                        targetGroup,
                        freshData,
                        imagePath
                    );

                const timeoutTask =
                    new Promise(
                        (_, reject) => {

                            setTimeout(
                                () => {

                                    reject(
                                        new Error(
                                            'تجمّد أو بطء شديد أثناء النشر (Deadlock Timeout)'
                                        )
                                    );

                                },
                                900000
                            );
                        }
                    );

                await Promise.race([
                    publishTask,
                    timeoutTask
                ]);

                // -------------------------------------------
                // ✅ نجاح المجموعة
                // -------------------------------------------

                const {
                    data: latestSuccessPost
                } =
                    await supabase
                        .from('publish_queue')
                        .select(
                            'success_count'
                        )
                        .eq(
                            'id',
                            initialPostData.id
                        )
                        .single();

                const currentSuccessCount =
                    latestSuccessPost?.success_count ||
                    0;

                const newSuccessCount =
                    currentSuccessCount + 1;

                await supabase
                    .from('publish_queue')
                    .update({

                        bot2_group:
                            null,

                        // ⭐ مهم جداً:
                        // النص الخاص بالمجموعة الحالية
                        // يتم تصفيره بعد نجاحها.
                        ai_final_text2:
                            null,

                        bot2_status:
                            'running',

                        success_count:
                            newSuccessCount

                    })
                    .eq(
                        'id',
                        initialPostData.id
                    );

                await logToDashboard(
                    `🧹 تم تصفير ai_final_text2 وقروب البوت 2 بعد نجاح المجموعة. الإجمالي: ${newSuccessCount}`,
                    'success'
                );

                // -------------------------------------------
                // ⏳ فاصل بين المجموعات
                // -------------------------------------------

                const {
                    data: remainingData
                } =
                    await supabase
                        .from('publish_queue')
                        .select(
                            'groups_json'
                        )
                        .eq(
                            'id',
                            initialPostData.id
                        )
                        .single();

                const remainingGroups =
                    parseGroups(
                        remainingData?.groups_json
                    );

                if (
                    remainingGroups.length > 0
                ) {

                    const longBreak =
                        randomDelay(
                            180,
                            300
                        );

                    await logToDashboard(
                        `⏳ استراحة ${Math.round(longBreak / 60000)} دقائق قبل المجموعة التالية.`,
                        'info'
                    );

                    await sleep(
                        longBreak
                    );
                }

            } catch (err) {

                // -------------------------------------------
                // ❌ فشل المجموعة
                // -------------------------------------------

                const {
                    data: latestFailedPost
                } =
                    await supabase
                        .from('publish_queue')
                        .select(
                            'failed_count, error_message'
                        )
                        .eq(
                            'id',
                            initialPostData.id
                        )
                        .single();

                const currentFailedCount =
                    latestFailedPost?.failed_count ||
                    0;

                const newFailedCount =
                    currentFailedCount + 1;

                let failedGroups = [];

                try {

                    if (
                        latestFailedPost?.error_message &&
                        latestFailedPost.error_message.trim() !== '' &&
                        latestFailedPost.error_message !== 'null'
                    ) {

                        const parsed =
                            JSON.parse(
                                latestFailedPost.error_message
                            );

                        if (
                            Array.isArray(parsed)
                        ) {

                            failedGroups =
                                parsed;
                        }
                    }

                } catch (e) {}

                failedGroups.push({

                    name:
                        targetGroup.name,

                    url:
                        targetGroup.url,

                    error:
                        err.message
                });

                await logToDashboard(
                    `❌ فشل النشر في المجموعة (${targetGroup.name}): ${err.message}`,
                    'error'
                );

                // -------------------------------------------
                // لا نعيد المجموعة إلى groups_json
                // لأنها تعتبر فاشلة وتسجل في error_message.
                // -------------------------------------------

                await supabase
                    .from('publish_queue')
                    .update({

                        bot2_group:
                            null,

                        ai_final_text2:
                            null,

                        bot2_status:
                            'running',

                        failed_count:
                            newFailedCount,

                        error_message:
                            JSON.stringify(
                                failedGroups
                            )

                    })
                    .eq(
                        'id',
                        initialPostData.id
                    );

                await sleep(15000);

                continue;

            } finally {

                try {

                    await page.close();

                } catch (e) {}
            }
        }

    } catch (err) {

        await logToDashboard(
            `❌ خطأ عام في البوت الثاني: ${err.message}`,
            'error'
        );

        await supabase
            .from('bot_counters')
            .update({
                status:
                    'ERROR'
            })
            .eq(
                'bot_name',
                BOT_ID
            );

        await supabase
            .from('publish_queue')
            .update({
                bot2_status:
                    'error'
            })
            .eq(
                'id',
                initialPostData.id
            );

    } finally {

        try {

            if (context) {
                await context.close();
            }

        } catch (e) {}

        try {

            await browser.close();

        } catch (e) {}

        // -----------------------------------------------
        // 🧹 حذف الملف المؤقت
        // -----------------------------------------------

        if (
            imagePath &&
            fs.existsSync(imagePath)
        ) {

            try {

                fs.unlinkSync(
                    imagePath
                );

            } catch (e) {}
        }

        await logToDashboard(
            `🧹 اكتملت عملية البوت الثاني وتم إغلاق المتصفح وتنظيف الملفات المؤقتة.`,
            'info'
        );
    }
}

// ============================================================
// 🔄 إعادة ضبط المهام العالقة الخاصة بـ Bot2 فقط
// ============================================================

async function resetStuckBot2Posts() {

    await logToDashboard(
        `🔄 فحص الإعلانات العالقة الخاصة بالبوت الثاني...`,
        'info'
    );

    const { error } =
        await supabase
            .from('publish_queue')
            .update({
                bot2_status:
                    'running'
            })
            .eq(
                'bot2_status',
                'processing'
            );

    if (error) {

        await logToDashboard(
            `⚠️ فشل إعادة ضبط مهام Bot2 العالقة: ${error.message}`,
            'warn'
        );
    }
}

// ============================================================
// 🚀 المحرك الرئيسي للبوت الثاني
// ============================================================

async function startBot2Engine() {

    await logToDashboard(
        `🚀 تم تشغيل محرك البوت الثاني.`,
        'success'
    );

    await supabase
        .from('bot_counters')
        .update({
            status:
                'RUNNING'
        })
        .eq(
            'bot_name',
            BOT_ID
        );

    await resetStuckBot2Posts();

    await cleanOldLogs();

    while (true) {

        try {

            // -----------------------------------------------
            // 🛑 فحص حالة البوت
            // -----------------------------------------------

            const {
                data: counterStatus
            } =
                await supabase
                    .from('bot_counters')
                    .select('status')
                    .eq(
                        'bot_name',
                        BOT_ID
                    )
                    .single();

            if (
                counterStatus &&
                [
                    'IDLE',
                    'STOPPED',
                    'PAUSED'
                ].includes(
                    counterStatus.status
                )
            ) {

                await forceKillProcess(
                    `تم رصد حالة الإيقاف في المحرك الرئيسي للبوت الثاني`
                );
            }

            // -----------------------------------------------
            // 📥 قراءة الطابور
            // -----------------------------------------------

            const {
                data,
                error
            } =
                await supabase
                    .from('publish_queue')
                    .select('*')
                    .order(
                        'id',
                        {
                            ascending: true
                        }
                    );

            if (error) {

                await logToDashboard(
                    `⚠️ خطأ قراءة الطابور: ${error.message}`,
                    'error'
                );

                await sleep(10000);

                continue;
            }

            // -----------------------------------------------
            // 🎯 البحث عن إعلان يحتاج Bot2
            // -----------------------------------------------

            let postToRun = null;

            if (
                data &&
                data.length > 0
            ) {

                for (
                    const post
                    of data
                ) {

                    const groups =
                        parseGroups(
                            post.groups_json
                        );

                    const botGroup =
                        parseBotGroup(
                            post.bot2_group
                        );

                    if (
                        groups.length > 0 ||
                        botGroup
                    ) {

                        postToRun =
                            post;

                        break;
                    }
                }
            }

            // -----------------------------------------------
            // 🏁 لا توجد مهام
            // -----------------------------------------------

            if (!postToRun) {

                await logToDashboard(
                    `🎉 لا توجد إعلانات قيد الانتظار للبوت الثاني.`,
                    'success'
                );

                await supabase
                    .from('bot_counters')
                    .update({
                        status:
                            'IDLE'
                    })
                    .eq(
                        'bot_name',
                        BOT_ID
                    );

                await forceKillProcess(
                    'لا توجد إعلانات قيد الانتظار'
                );
            }

            // -----------------------------------------------
            // 🔄 تحديث حالة Bot2 فقط
            // -----------------------------------------------

            await supabase
                .from('publish_queue')
                .update({
                    bot2_status:
                        'processing'
                })
                .eq(
                    'id',
                    postToRun.id
                );

            // -----------------------------------------------
            // 🚀 تشغيل الإعلان
            // -----------------------------------------------

            await processOnePostBot2(
                postToRun
            );

            // -----------------------------------------------
            // ⏳ فاصل بين الإعلانات
            // -----------------------------------------------

            const macroDelay =
                randomDelay(
                    900,
                    1800
                );

            await logToDashboard(
                `⏳ استراحة بين الإعلانات للبوت 2: ${Math.round(macroDelay / 60000)} دقيقة.`,
                'info'
            );

            await sleep(
                macroDelay
            );

        } catch (err) {

            await logToDashboard(
                `❌ خطأ في المحرك الرئيسي للبوت الثاني: ${err.message}`,
                'error'
            );

            await supabase
                .from('bot_counters')
                .update({
                    status:
                        'ERROR'
                })
                .eq(
                    'bot_name',
                    BOT_ID
                );

            await sleep(10000);
        }
    }
}

// ============================================================
// 📦 Export
// ============================================================

module.exports =
    processOnePostBot2;

// ============================================================
// ▶️ تشغيل مباشر
// ============================================================

if (
    require.main === module
) {

    startBot2Engine();
}
