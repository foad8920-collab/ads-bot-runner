```javascript
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const os = require('os');
const axios = require('axios');
const express = require('express');
const { createClient } = require('@supabase/supabase-js');

// ============================================================
// 🔌 SUPABASE
// ============================================================

const SUPABASE_URL =
    process.env.SUPABASE_URL ||
    'https://bmsfhqmsovicpgxxwsgi.supabase.co';

const SUPABASE_KEY =
    process.env.SUPABASE_KEY ||
    'sb_publishable_l1IbZF35GnYYS8PamVX_kg_nTv_uyef';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ============================================================
// ⚙️ BOT SETTINGS
// ============================================================

const TEMP_DIR = path.join(os.tmpdir(), 'bot2-temp-files');

const ACCOUNT_NAME = 'الحساب (2)';
const BOT_ID = 'bot2';

const PORT = process.env.PORT || 3000;

// ============================================================
// 🧠 MEMORY LOG
// ============================================================

function getMemoryLog() {
    const memory = process.memoryUsage();

    const rssMB = (memory.rss / 1024 / 1024).toFixed(1);
    const heapMB = (memory.heapUsed / 1024 / 1024).toFixed(1);

    return `📊 [RAM: ${rssMB} MB | Heap: ${heapMB} MB]`;
}

// ============================================================
// ⏱️ SLEEP
// ============================================================

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================
// 🎲 RANDOM DELAY
// ============================================================

function randomDelay(minSeconds, maxSeconds) {
    const min = minSeconds * 1000;
    const max = maxSeconds * 1000;

    return Math.floor(
        Math.random() * (max - min + 1)
    ) + min;
}

// ============================================================
// 📊 DASHBOARD LOG
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
                `⚠️ [Log Error]: فشل حفظ السجل في Supabase: ${error.message}`
            );
        }

    } catch (e) {

        console.error(
            `⚠️ [Log Exception]: ${e.message}`
        );

    }
}

// ============================================================
// 🛑 FORCE KILL
// ============================================================

async function forceKillProcess(
    reason = 'طلب إيقاف من المستخدم'
) {

    await logToDashboard(
        `🛑 ${reason} | جاري تحويل الحالة إلى IDLE وإنهاء الجلسة فوراً...`,
        'warn'
    );

    try {

        await supabase
            .from('bot_counters')
            .update({
                status: 'IDLE'
            })
            .eq('bot_name', BOT_ID);

        await logToDashboard(
            `✅ تم تحويل حالة ${BOT_ID} إلى (IDLE) في قاعدة البيانات.`,
            'info'
        );

    } catch (e) {

        console.error(
            'فشل تحديث حالة البوت إلى IDLE:',
            e.message
        );

    }

    // ========================================================
    // 🛑 CANCEL GITHUB ACTION
    // ========================================================

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
                `🛑 تم إرسال أمر إلغاء Workflow في GitHub Actions بنجاح.`,
                'info'
            );

        } catch (e) {

            console.error(
                'فشل إلغاء Workflow:',
                e.message
            );

        }

    }

    process.exit(0);
}

// ============================================================
// 🧹 CLEAN OLD LOGS
// ============================================================

async function cleanOldLogs() {

    try {

        const threeDaysAgo =
            new Date(
                Date.now() -
                3 * 24 * 60 * 60 * 1000
            ).toISOString();

        const { error } = await supabase
            .from('bot_logs')
            .delete()
            .lt('created_at', threeDaysAgo);

        if (!error) {

            await logToDashboard(
                `🧹 تم تنظيف سجلات Dashboard القديمة.`,
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
// 🔄 RESET DAILY COUNTER
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

        const { data, error } =
            await supabase
                .from('bot_counters')
                .select(
                    'daily_count, last_reset_date'
                )
                .eq('bot_name', botName)
                .single();

        if (error || !data) {
            return 0;
        }

        if (
            data.last_reset_date !==
            todayStr
        ) {

            await logToDashboard(
                `🔄 يوم جديد (${todayStr})! تم تصفير عداد ${botName} ومسح سجلات المجموعات القديمة.`,
                'info'
            );

            await supabase
                .from('bot_publish_logs')
                .delete()
                .neq('id', 0);

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

        return 0;

    }
}

// ============================================================
// 📊 REGISTER SUCCESSFUL GROUP
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
                    actualPostText.substring(
                        0,
                        120
                    ) + '...'
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
                        published_at:
                            exactPublishTime
                    }
                ]);

        if (insertError) {

            await logToDashboard(
                `❌ فشل حفظ سجل النشر: ${insertError.message}`,
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
                last_active:
                    exactPublishTime,
                status: 'RUNNING'
            })
            .eq('bot_name', botName);

        await logToDashboard(
            `📊 [العداد] تم تسجيل نشر المجموعة (${groupName}) | اليوم: ${currentDaily} | الإجمالي: ${currentTotal}`,
            'success'
        );

    } catch (e) {

        console.error(
            'خطأ أثناء تسجيل عملية النشر:',
            e
        );

    }
}

// ============================================================
// ⚙️ GET SETTING
// ============================================================

async function getSetting(keyName) {

    try {

        const { data, error } =
            await supabase
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
// 🤖 GEMINI AI
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
أنت خبير تسويق إلكتروني.

قم بإعادة صياغة الإعلان التالي بأسلوب جذاب وطبيعي ومختلف تماماً عن النص الأصلي.

المطلوب:
- الحفاظ على جميع المعلومات الأساسية.
- عدم اختراع معلومات جديدة.
- عدم حذف السعر أو الموقع أو أرقام التواصل أو الروابط إن وجدت.
- تغيير صياغة العنوان والوصف.
- جعل النص مناسباً للنشر في مجموعات فيسبوك.
- استخدم لغة عربية طبيعية وقريبة من المستخدم اليمني.
- لا تذكر أنك ذكاء اصطناعي.
- لا تضع شرحاً خارج الإعلان.

العنوان الأصلي:
${title}

الوصف الأصلي:
${description}

أعطني النص النهائي مباشرة.
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
            (
                modelsResponse.data.models ||
                []
            ).filter(model =>

                model.supportedGenerationMethods &&
                model.supportedGenerationMethods.includes(
                    'generateContent'
                ) &&
                model.name.includes('gemini')

            );

        if (
            validModels.length === 0
        ) {

            return `${title}\n\n${description}`;

        }

        for (
            const modelObj of validModels
        ) {

            try {

                const response =
                    await axios.post(
                        `https://generativelanguage.googleapis.com/v1beta/${modelObj.name}:generateContent?key=${geminiKey}`,
                        {
                            contents: [
                                {
                                    parts: [
                                        {
                                            text:
                                                promptText
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
                    response
                        .data
                        ?.candidates?.[0]
                        ?.content?.parts?.[0]
                        ?.text;

                if (aiText) {

                    await logToDashboard(
                        `✨ تمت إعادة صياغة الإعلان بواسطة AI بنجاح.`,
                        'success'
                    );

                    return aiText
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
// 🖼️ DOWNLOAD MEDIA
// ============================================================

async function downloadImage(
    imageUrl
) {

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
// ☕ SESSION WARMUP
// ============================================================

async function warmupSession(page) {

    try {

        await logToDashboard(
            `☕ بدء تهيئة جلسة Facebook للبوت الثاني...`,
            'info'
        );

        await page.goto(
            'https://www.facebook.com/',
            {
                waitUntil:
                    'domcontentloaded',
                timeout: 45000
            }
        );

        await sleep(
            randomDelay(9, 15)
        );

        if (
            page.url().includes('login') ||
            page.url().includes('checkpoint')
        ) {

            throw new Error(
                'انتهت جلسة تسجيل الدخول أو يوجد Checkpoint للحساب'
            );

        }

        await page.mouse.move(
            Math.floor(
                Math.random() * 500
            ) + 120,
            Math.floor(
                Math.random() * 400
            ) + 120
        );

        await page.evaluate(
            () =>
                window.scrollBy(
                    0,
                    Math.floor(
                        Math.random() * 300
                    ) + 200
                )
        );

        await sleep(
            randomDelay(5, 8)
        );

        await page.mouse.move(
            Math.floor(
                Math.random() * 600
            ) + 180,
            Math.floor(
                Math.random() * 500
            ) + 120
        );

        await page.evaluate(
            () =>
                window.scrollBy(
                    0,
                    Math.floor(
                        Math.random() * 400
                    ) + 250
                )
        );

        await sleep(
            randomDelay(6, 10)
        );

        await logToDashboard(
            `✅ جلسة Facebook جاهزة.`,
            'success'
        );

    } catch (e) {

        if (
            e.message.includes(
                'Checkpoint'
            )
        ) {

            throw e;

        }

        await logToDashboard(
            `⚠️ تنبيه أثناء تهيئة الجلسة: ${e.message}`,
            'warn'
        );

    }
}

// ============================================================
// 📝 OPEN POST BOX
// ============================================================

async function openPostBox(page) {

    const initialWait =
        randomDelay(20, 26);

    await logToDashboard(
        `⏳ انتظار ${Math.round(initialWait / 1000)} ثانية لبناء عناصر النشر...`,
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

    for (
        const tabSel of discussionTabs
    ) {

        try {

            const tabBtn =
                page.locator(
                    tabSel
                ).first();

            if (
                await tabBtn.count() > 0 &&
                await tabBtn.isVisible()
            ) {

                await tabBtn.click({
                    timeout: 5000,
                    force: true
                });

                const tabWait =
                    randomDelay(16, 23);

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

        'span:has-text("اكتب شيئاً...")',
        'text="اكتب شيئاً..."',

        'div[role="button"]:has-text("اكتب شيئاً...")',

        'span:has-text("اكتب")',
        'span:has-text("Write")',

        'div[role="button"]:has-text("اكتب")',
        'div[role="button"]:has-text("Write")',

        'div[role="button"]:has-text("بم تفكر")',
        'div[role="button"]:has-text("تفكر")',

        'text=/اكتب/i',
        'text=/تفكر/i',
        'text=/بم تفكر/i'

    ];

    for (
        const selector of selectors
    ) {

        try {

            const element =
                page.locator(
                    selector
                ).first();

            if (
                await element.count() > 0 &&
                await element.isVisible()
            ) {

                const box =
                    await element.boundingBox();

                if (box) {

                    await page.mouse.move(
                        box.x +
                        box.width / 2,
                        box.y +
                        box.height / 2
                    );

                    await sleep(
                        randomDelay(1, 3)
                    );

                }

                await element.click({
                    timeout: 6000,
                    force: true
                });

                const postOpenWait =
                    randomDelay(18, 25);

                await logToDashboard(
                    `⏳ تم فتح نافذة المنشور، انتظار ${Math.round(postOpenWait / 1000)} ثانية...`,
                    'info'
                );

                await sleep(
                    postOpenWait
                );

                const confirmBtns = [
                    'text=موافق',
                    'text=فهمت',
                    'text=تم',
                    'text=Got It',
                    'text=OK',
                    'text=متابعة'
                ];

                for (
                    const cBtn of confirmBtns
                ) {

                    try {

                        const btn =
                            page.locator(
                                cBtn
                            ).first();

                        if (
                            await btn.count() > 0 &&
                            await btn.isVisible()
                        ) {

                            await btn.click({
                                timeout: 3000,
                                force: true
                            });

                            await sleep(
                                randomDelay(2, 4)
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
// 📝 PASTE TEXT
// ============================================================

async function pasteTextWithLines(
    page,
    postText
) {

    await sleep(
        randomDelay(5, 8)
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

    for (
        const sel of targetSelectors
    ) {

        try {

            const element =
                page.locator(
                    sel
                ).first();

            if (
                await element.count() > 0 &&
                await element.isVisible()
            ) {

                textbox = element;
                break;

            }

        } catch (e) {}

    }

    if (textbox) {

        try {

            await textbox.click({
                timeout: 6000,
                force: true
            });

            await sleep(
                randomDelay(2, 4)
            );

            await page.evaluate(
                async text => {

                    await navigator
                        .clipboard
                        .writeText(text);

                },
                postText
            );

            await page.keyboard.press(
                'Control+V'
            );

            await logToDashboard(
                `✅ تم إدخال النص عبر Clipboard.`,
                'success'
            );

            return;

        } catch (err) {

            await logToDashboard(
                `⚠️ فشل Clipboard، سيتم استخدام insertText.`,
                'warn'
            );

        }

    }

    try {

        await page.evaluate(() => {

            const activeInput =
                document.querySelector(
                    'div[role="dialog"] div[contenteditable="true"], div[role="dialog"] div[role="textbox"]'
                );

            if (activeInput) {

                activeInput.focus();
                activeInput.click();

            }

        });

        await sleep(
            randomDelay(2, 4)
        );

        await page.keyboard.insertText(
            postText
        );

        await logToDashboard(
            `✅ تم إدخال النص بطريقة insertText.`,
            'success'
        );

    } catch (e) {

        throw new Error(
            'تعذر العثور على حقل نص صالح للكتابة داخل المجموعة'
        );

    }
}

// ============================================================
// 🚀 PUBLISH TO GROUP
// ============================================================

async function publishToGroup(
    page,
    group,
    post,
    imagePath
) {

    await warmupSession(page);

    await logToDashboard(
        `📢 فتح المجموعة: ${group.name}`,
        'info'
    );

    await page.goto(
        group.url,
        {
            waitUntil:
                'domcontentloaded',
            timeout: 45000
        }
    );

    const pageLoadWait =
        randomDelay(38, 48);

    await logToDashboard(
        `⏳ انتظار ${Math.round(pageLoadWait / 1000)} ثانية لتحميل المجموعة...`,
        'info'
    );

    await sleep(pageLoadWait);

    if (
        page.url().includes('login') ||
        page.url().includes('checkpoint')
    ) {

        throw new Error(
            'انتهت الجلسة أو ظهر Checkpoint'
        );

    }

    const opened =
        await openPostBox(page);

    if (!opened) {

        throw new Error(
            'لم يتم العثور على مربع النشر'
        );

    }

    await sleep(
        randomDelay(5, 10)
    );

    // ========================================================
    // 🖼️ MEDIA
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

        for (
            const trigSel of imageTriggerSelectors
        ) {

            try {

                const trigElement =
                    page.locator(
                        trigSel
                    ).first();

                if (
                    await trigElement.count() > 0 &&
                    await trigElement.isVisible()
                ) {

                    await trigElement.click({
                        timeout: 6000,
                        force: true
                    });

                    await sleep(
                        randomDelay(4, 7)
                    );

                    break;

                }

            } catch (e) {}

        }

        let isFileInjected = false;

        try {

            const dialogFileInput =
                page.locator(
                    'div[role="dialog"] input[type="file"]'
                ).first();

            if (
                await dialogFileInput.count() > 0
            ) {

                await dialogFileInput
                    .setInputFiles(
                        imagePath
                    );

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
                        .setInputFiles(
                            imagePath
                        );

                    isFileInjected = true;

                }

            }

        } catch (e) {}

        if (isFileInjected) {

            const isVideoFile =
                imagePath.endsWith('.mp4') ||
                imagePath.endsWith('.mov');

            const waitTime =
                isVideoFile
                    ? randomDelay(65, 80)
                    : randomDelay(25, 35);

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

            } catch (e) {}

            const previewWait =
                randomDelay(25, 35);

            await logToDashboard(
                `⏳ انتظار ${Math.round(previewWait / 1000)} ثانية لاستقرار المعاينة...`,
                'info'
            );

            await sleep(previewWait);

        }

    }

    // ========================================================
    // 🤖 AI - IMPORTANT
    // نص جديد لكل مجموعة
    // ========================================================

    let postText = '';

    // لا نعتمد على ai_final_text2 كنسخة ثابتة للمجموعات.
    // إذا كان هناك نص محفوظ بسبب استكمال مجموعة معلقة، نستخدمه.
    if (
        post.ai_final_text2 &&
        post.ai_final_text2.trim() !== ''
    ) {

        postText =
            post.ai_final_text2.trim();

        await logToDashboard(
            `📌 [AI] تم استرجاع النص المحفوظ للمجموعة الحالية.`,
            'info'
        );

    } else {

        await logToDashboard(
            `🧠 [AI] ai_final_text2 فارغ، إنشاء نص جديد خاص بهذه المجموعة: ${group.name}`,
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

        // حفظ النص فقط للمجموعة الحالية.
        await supabase
            .from('publish_queue')
            .update({
                ai_final_text2:
                    postText
            })
            .eq(
                'id',
                post.id
            );

        await logToDashboard(
            `💾 تم حفظ نص AI الخاص بالمجموعة الحالية في ai_final_text2.`,
            'success'
        );

    }

    // ========================================================
    // 📝 FINAL TEXT LOG
    // ========================================================

    await logToDashboard(
        `📝 النص النهائي للمجموعة (${group.name}):\n${postText}`,
        'info'
    );

    await pasteTextWithLines(
        page,
        postText
    );

    // ========================================================
    // ⏳ TEXT / LINK WAIT
    // ========================================================

    const fbUrlCheck =
        post.facebook_url || '';

    if (
        fbUrlCheck.trim() !== '' ||
        postText.includes('facebook.com')
    ) {

        const linkWait =
            randomDelay(50, 65);

        await logToDashboard(
            `⏳ انتظار ${Math.round(linkWait / 1000)} ثانية لمعالجة الرابط والمعاينة...`,
            'info'
        );

        await sleep(linkWait);

    } else {

        const textWait =
            randomDelay(28, 38);

        await logToDashboard(
            `⏳ انتظار ${Math.round(textWait / 1000)} ثانية لمعالجة النص...`,
            'info'
        );

        await sleep(textWait);

    }

    // ========================================================
    // 🚀 PUBLISH BUTTON
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
        const btn of publishButtons
    ) {

        try {

            const button =
                page.locator(
                    btn
                ).last();

            if (
                await button.count() > 0 &&
                await button.isVisible()
            ) {

                const btnBox =
                    await button.boundingBox();

                if (btnBox) {

                    await page.mouse.move(
                        btnBox.x +
                        btnBox.width / 2,
                        btnBox.y +
                        btnBox.height / 2
                    );

                    await sleep(
                        randomDelay(1, 3)
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
            'فشل العثور على زر النشر أو تعذر الضغط عليه'
        );

    }

    // ========================================================
    // ⏳ FINAL WAIT
    // ========================================================

    const isUploadedVideo =
        imagePath &&
        (
            imagePath.endsWith('.mp4') ||
            imagePath.endsWith('.mov')
        );

    const finalWait =
        isUploadedVideo
            ? randomDelay(65, 80)
            : randomDelay(35, 45);

    await logToDashboard(
        `⏳ انتظار اكتمال عملية النشر ${Math.round(finalWait / 1000)} ثانية...`,
        'info'
    );

    await sleep(finalWait);

    await logToDashboard(
        `✅ انتهت عملية النشر في المجموعة: ${group.name}`,
        'success'
    );

    // ========================================================
    // 📊 REGISTER SUCCESS
    // ========================================================

    await logPublishSuccess(
        BOT_ID,
        post.id,
        postText,
        group.name
    );

    return true;
}

// ============================================================
// 🚀 PROCESS ONE POST BOT2
// ============================================================

async function processOnePostBot2(
    initialPostData
) {

    const currentDailyCount =
        await checkAndResetCounter(
            BOT_ID
        );

    // ========================================================
    // ⚠️ DAILY LIMIT
    // ========================================================

    if (
        currentDailyCount >= 15
    ) {

        await logToDashboard(
            `⚠️ تم الوصول إلى الحد اليومي المحدد لـ ${BOT_ID} (15 عملية نشر).`,
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
            `❌ Cookies الخاصة بالبوت الثاني غير موجودة.`,
            'error'
        );

        return;

    }

    // ========================================================
    // ⏳ INITIAL OFFSET
    // ========================================================

    const initialOffsetDelay =
        randomDelay(240, 360);

    await logToDashboard(
        `⏳ تأخير بداية البوت 2 لمدة ${Math.round(initialOffsetDelay / 1000 / 60)} دقائق.`,
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
    // 🖼️ DOWNLOAD MEDIA
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

    if (mediaUrl !== '') {

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
                `⚠️ فشل تحميل الملف، سيتم النشر كنص فقط: ${e.message}`,
                'warn'
            );

        }

    }

    // ========================================================
    // 🌐 BROWSER
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

            '--mute-audio',

            '--disable-infobars'

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

    const context =
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

    // ========================================================
    // 🍪 COOKIES
    // ========================================================

    try {

        const rawCookies =
            JSON.parse(
                cookiesRaw
            );

        const formattedCookies =
            rawCookies.map(
                cookie => {

                    const c = {
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
                            lower ===
                            'no_restriction'
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

    } catch (e) {

        await logToDashboard(
            `❌ فشل تحميل Cookies: ${e.message}`,
            'error'
        );

        await browser.close();

        return;

    }

    // ========================================================
    // 🔁 MAIN GROUP LOOP
    // ========================================================

    try {

        while (true) {

            // ==================================================
            // 🛑 CHECK BOT STATUS
            // ==================================================

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

            const isCounterStopped =
                counterStatus &&
                [
                    'IDLE',
                    'STOPPED',
                    'PAUSED'
                ].includes(
                    counterStatus.status
                );

            // ==================================================
            // 📦 REFRESH QUEUE
            // ==================================================

            const {
                data: freshData
            } =
                await supabase
                    .from('publish_queue')
                    .select('*')
                    .eq(
                        'id',
                        initialPostData.id
                    )
                    .single();

            const isQueueStopped =
                !freshData ||
                [
                    'stopped',
                    'paused'
                ].includes(
                    freshData.status
                );

            if (
                isCounterStopped ||
                isQueueStopped
            ) {

                await browser.close();

                await forceKillProcess(
                    'تم رصد حالة الإيقاف يدوياً من اللوحة'
                );

            }

            // ==================================================
            // ⏭️ SKIP CURRENT GROUP
            // ==================================================

            if (
                freshData.skip_current_group ===
                true
            ) {

                await logToDashboard(
                    `⏭️ تم طلب تخطي المجموعة الحالية.`,
                    'info'
                );

                let failedGroups = [];

                try {

                    if (
                        freshData.error_message
                    ) {

                        failedGroups =
                            JSON.parse(
                                freshData.error_message
                            );

                    }

                } catch (e) {}

                let currentBotGroup =
                    freshData.bot2_group;

                let groupName =
                    (
                        typeof currentBotGroup ===
                        'object' &&
                        currentBotGroup
                    )
                        ? currentBotGroup.name
                        : 'مجموعة تم تخطيها';

                failedGroups.push({
                    name:
                        groupName,

                    error:
                        'تم تخطي المجموعة يدوياً من المستخدم'
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

                        error_message:
                            JSON.stringify(
                                failedGroups
                            )

                    })
                    .eq(
                        'id',
                        initialPostData.id
                    );

                continue;

            }

            // ==================================================
            // 📦 GROUPS
            // ==================================================

            let groups = [];

            if (
                Array.isArray(
                    freshData.groups_json
                )
            ) {

                groups =
                    freshData.groups_json;

            } else if (
                typeof freshData.groups_json ===
                'string'
            ) {

                try {

                    groups =
                        JSON.parse(
                            freshData.groups_json ||
                            '[]'
                        );

                } catch (e) {

                    groups = [];

                }

            }

            // ==================================================
            // 🎯 CURRENT BOT GROUP
            // ==================================================

            let botGroup = null;

            if (
                typeof freshData.bot2_group ===
                'object' &&
                freshData.bot2_group !== null
            ) {

                botGroup =
                    freshData.bot2_group;

            } else if (
                typeof freshData.bot2_group ===
                'string'
            ) {

                try {

                    botGroup =
                        freshData.bot2_group
                            ? JSON.parse(
                                freshData.bot2_group
                            )
                            : null;

                } catch (e) {

                    botGroup = null;

                }

            }

            // ==================================================
            // 🏁 ALL GROUPS FINISHED
            // ==================================================

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
                            'bot1_group, bot2_group, bot3_group, failed_count'
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
                        finalStatus ===
                            'published'
                            ? 'success'
                            : 'warn'
                    );

                    await supabase
                        .from('publish_queue')
                        .update({

                            status:
                                finalStatus,

                            bot2_group:
                                null,

                            ai_final_text2:
                                null

                        })
                        .eq(
                            'id',
                            initialPostData.id
                        );

                } else {

                    await logToDashboard(
                        `🎉 اكتملت جميع المجموعات المخصصة للبوت 2، وما زالت هناك مجموعات لبوتات أخرى.`,
                        'success'
                    );

                }

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

                break;

            }

            // ==================================================
            // 🎯 SELECT TARGET GROUP
            // ==================================================

            let targetGroup = null;

            if (botGroup) {

                targetGroup =
                    botGroup;

                await logToDashboard(
                    `🎯 استكمال المجموعة المعلقة: ${targetGroup.name}`,
                    'info'
                );

            } else {

                targetGroup =
                    groups[0];

                const remainingGroups =
                    groups.slice(1);

                const {
                    error: updateErr
                } =
                    await supabase
                        .from('publish_queue')
                        .update({

                            bot2_group:
                                JSON.stringify(
                                    targetGroup
                                ),

                            groups_json:
                                JSON.stringify(
                                    remainingGroups
                                )

                        })
                        .eq(
                            'id',
                            initialPostData.id
                        );

                if (updateErr) {

                    await sleep(1000);

                    continue;

                }

                await logToDashboard(
                    `🎯 تم حجز المجموعة: ${targetGroup.name}`,
                    'success'
                );

            }

            // ==================================================
            // 🛡️ DUPLICATE CHECK
            // ==================================================

            const {
                data: logData
            } =
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
                    `🛡️ [حماية] الإعلان (#${initialPostData.id}) منشور مسبقاً في المجموعة (${targetGroup.name}) بواسطة ${BOT_ID}.`,
                    'warn'
                );

                await supabase
                    .from('publish_queue')
                    .update({

                        bot2_group:
                            null,

                        ai_final_text2:
                            null

                    })
                    .eq(
                        'id',
                        initialPostData.id
                    );

                botGroup = null;

                await sleep(2000);

                continue;

            }

            // ==================================================
            // 🌐 NEW PAGE
            // ==================================================

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

                // ==================================================
                // ⏱️ DEADLOCK TIMEOUT
                // ==================================================

                const timeoutTask =
                    new Promise(
                        (_, reject) => {

                            setTimeout(
                                () => {

                                    reject(
                                        new Error(
                                            'تجمّد مفاجئ أو بطء شديد أثناء معالجة الصفحة (Deadlock Timeout)'
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

                // ==================================================
                // 📊 SUCCESS COUNT
                // ==================================================

                const {
                    data:
                    latestSuccessPost
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
                    latestSuccessPost
                        ?.success_count ||
                    0;

                const newSuccessCount =
                    currentSuccessCount + 1;

                botGroup = null;

                // ==================================================
                // 🧹 CLEAR CURRENT GROUP + AI TEXT
                // ==================================================

                await supabase
                    .from('publish_queue')
                    .update({

                        bot2_group:
                            null,

                        ai_final_text2:
                            null,

                        success_count:
                            newSuccessCount

                    })
                    .eq(
                        'id',
                        initialPostData.id
                    );

                await logToDashboard(
                    `🧹 تم إنهاء المجموعة بنجاح وتصفير ai_final_text2 و bot2_group. | الإجمالي: ${newSuccessCount}`,
                    'success'
                );

                // ==================================================
                // 🔍 CHECK REMAINING GROUPS
                // ==================================================

                const {
                    data:
                    checkData
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

                let currentRemaining = [];

                if (
                    Array.isArray(
                        checkData?.groups_json
                    )
                ) {

                    currentRemaining =
                        checkData.groups_json;

                } else if (
                    typeof checkData?.groups_json ===
                    'string'
                ) {

                    try {

                        currentRemaining =
                            JSON.parse(
                                checkData.groups_json ||
                                '[]'
                            );

                    } catch (e) {

                        currentRemaining =
                            [];

                    }

                }

                // ==================================================
                // ⏳ BREAK BETWEEN GROUPS
                // ==================================================

                if (
                    currentRemaining.length >
                    0
                ) {

                    const longBreak =
                        randomDelay(
                            180,
                            300
                        );

                    await logToDashboard(
                        `⏳ استراحة 5 دقائق قبل المجموعة التالية.`,
                        'info'
                    );

                    await sleep(
                        longBreak
                    );

                }

            } catch (err) {

                // ==================================================
                // ❌ FAILED GROUP
                // ==================================================

                const {
                    data:
                    latestFailedPost
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
                    latestFailedPost
                        ?.failed_count ||
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
                            Array.isArray(
                                parsed
                            )
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
                    `❌ خطأ أثناء النشر في المجموعة (${targetGroup.name}): ${err.message}`,
                    'error'
                );

                botGroup = null;

                await supabase
                    .from('publish_queue')
                    .update({

                        bot2_group:
                            null,

                        ai_final_text2:
                            null,

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

                await sleep(
                    15000
                );

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

    } finally {

        try {

            await browser.close();

        } catch (e) {}

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
            `🧹 تم إغلاق متصفح البوت الثاني بأمان.`,
            'info'
        );

    }
}

// ============================================================
// 🔄 RESET STUCK POSTS
// ============================================================

async function resetStuckBot2Posts() {

    await logToDashboard(
        `🔄 فحص الإعلانات العالقة (processing) للبوت الثاني...`,
        'info'
    );

    const {
        error
    } =
        await supabase
            .from('publish_queue')
            .update({
                status:
                    'running'
            })
            .eq(
                'status',
                'processing'
            );

    if (error) {

        await logToDashboard(
            `⚠️ خطأ في إعادة ضبط الإعلانات العالقة: ${error.message}`,
            'error'
        );

    }

}

// ============================================================
// 🚀 START BOT 2 ENGINE
// ============================================================

async function startBot2Engine() {

    await logToDashboard(
        `🚀 تم تشغيل محرك البوت الثاني.`,
        'success'
    );

    // ========================================================
    // 🔄 INITIAL STATUS
    // ========================================================

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

    // ========================================================
    // 🧹 RESET + CLEAN
    // ========================================================

    await resetStuckBot2Posts();

    await cleanOldLogs();

    // ========================================================
    // 🔁 MAIN ENGINE
    // ========================================================

    while (true) {

        try {

            // ==================================================
            // 🛑 CHECK BOT STATUS
            // ==================================================

            const {
                data:
                counterStatus
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
                    'تم رصد حالة الإيقاف في المحرك الرئيسي للبوت الثاني'
                );

            }

            // ==================================================
            // 📦 LOAD QUEUE
            // ==================================================

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

                await sleep(
                    10000
                );

                continue;

            }

            // ==================================================
            // 🔍 FIND NEXT POST
            // ==================================================

            let postToRun = null;

            if (
                data &&
                data.length > 0
            ) {

                for (
                    const post of data
                ) {

                    let groups = [];

                    if (
                        Array.isArray(
                            post.groups_json
                        )
                    ) {

                        groups =
                            post.groups_json;

                    } else if (
                        typeof post.groups_json ===
                        'string'
                    ) {

                        try {

                            groups =
                                JSON.parse(
                                    post.groups_json ||
                                    '[]'
                                );

                        } catch (e) {

                            groups = [];

                        }

                    }

                    let hasBotGroup =
                        false;

                    if (
                        typeof post.bot2_group ===
                        'object' &&
                        post.bot2_group !== null
                    ) {

                        hasBotGroup =
                            true;

                    } else if (
                        typeof post.bot2_group ===
                        'string'
                    ) {

                        try {

                            hasBotGroup =
                                !!JSON.parse(
                                    post.bot2_group
                                );

                        } catch (e) {

                            hasBotGroup =
                                false;

                        }

                    }

                    if (
                        groups.length > 0 ||
                        hasBotGroup
                    ) {

                        postToRun =
                            post;

                        break;

                    }

                }

            }

            // ==================================================
            // 🏁 NO WORK
            // ==================================================

            if (!postToRun) {

                await logToDashboard(
                    `🎉 اكتملت جميع المهام في الطابور، لا توجد إعلانات قيد الانتظار.`,
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

                return;

            }

            // ==================================================
            // 🔄 MARK PROCESSING
            // ==================================================

            await supabase
                .from('publish_queue')
                .update({
                    status:
                        'processing'
                })
                .eq(
                    'id',
                    postToRun.id
                );

            // ==================================================
            // 🚀 PROCESS
            // ==================================================

            await processOnePostBot2(
                postToRun
            );

            // ==================================================
            // 📌 RECHECK POST
            // ==================================================

            const {
                data:
                afterProcess
            } =
                await supabase
                    .from('publish_queue')
                    .select(
                        'status, groups_json, bot1_group, bot2_group, bot3_group'
                    )
                    .eq(
                        'id',
                        postToRun.id
                    )
                    .single();

            // ==================================================
            // 🏁 SET STATUS ONLY IF STILL PROCESSING
            // ==================================================

            if (
                afterProcess &&
                afterProcess.status ===
                'processing'
            ) {

                await supabase
                    .from('publish_queue')
                    .update({
                        status:
                            'stopped'
                    })
                    .eq(
                        'id',
                        postToRun.id
                    );

            }

            // ==================================================
            // ⏳ MACRO BREAK
            // ==================================================

            const macroDelay =
                randomDelay(
                    900,
                    1800
                );

            await logToDashboard(
                `⏳ استراحة بين الإعلانات: ${Math.round(macroDelay / 1000 / 60)} دقيقة.`,
                'info'
            );

            await sleep(
                macroDelay
            );

        } catch (err) {

            await logToDashboard(
                `❌ خطأ في محرك البوت الثاني الرئيسي: ${err.message}`,
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

            await sleep(
                10000
            );

        }

    }

}

// ============================================================
// 📦 EXPORT
// ============================================================

module.exports =
    processOnePostBot2;

// ============================================================
// ▶️ START
// ============================================================

if (
    require.main === module
) {

    startBot2Engine();

}
```
