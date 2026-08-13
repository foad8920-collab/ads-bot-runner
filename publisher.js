// 🌟 السحر هنا: حل مشكلة اختفاء المتصفح من السيرفر نهائياً
process.env.PLAYWRIGHT_BROWSERS_PATH = '/tmp/pw-browsers';
const { execSync } = require('child_process');
try {
    console.log("🚀 [النظام] جاري تجهيز المتصفح في مسار آمن لتجاوز أخطاء مسح Railway...");
    execSync('npx playwright install chromium', { stdio: 'inherit' });
    console.log("✅ [النظام] المتصفح جاهز ومحمي من الحذف 100%!");
} catch (e) {
    console.log("⚠️ [النظام] تنبيه أثناء تجهيز المتصفح:", e.message);
}

// استيراد المكتبات بشكل طبيعي بعد ضمان وجود المتصفح
const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
chromium.use(stealth);
 
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const express = require('express');
const { createClient } = require('@supabase/supabase-js');

// 🌟 تخصيص رقم الحساب والسيرفر الثاني (الافتراضي: 2)
const ACCOUNT_NUM = process.env.ACCOUNT_NUMBER || '2';
const COOKIE_FILE = fs.existsSync(`./cookies${ACCOUNT_NUM}.json`) ? `./cookies${ACCOUNT_NUM}.json` : './cookies2.json';
const ACCOUNT_NAME = `الحساب (${ACCOUNT_NUM})`;

function getMemoryLog() {
    const memory = process.memoryUsage();
    const rssMB = (memory.rss / 1024 / 1024).toFixed(1);
    const heapMB = (memory.heapUsed / 1024 / 1024).toFixed(1);
    return `📊 [RAM: ${rssMB} MB | Heap: ${heapMB} MB]`;
}

const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send(`🚀 FB Bot Dedicated Instance - ${ACCOUNT_NAME} is running 24/7!`));

app.get('/restart-bot', async (req, res) => {
    await logToDashboard(`🚨 [${ACCOUNT_NAME}] تم طلب إعادة التشغيل يدوياً من المطور!`, 'error');
    res.send(`🔄 جاري إعادة تشغيل السيرفر والبوت الخاص بـ ${ACCOUNT_NAME}...`);
    process.exit(1); 
});

app.listen(PORT, () => {
    console.log(`🌐 Web Server active on port ${PORT} for ${ACCOUNT_NAME}`);
    setInterval(async () => {
        try {
            const myServerUrl = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`; 
            await axios.get(myServerUrl);
            await logToDashboard(`⏰ [Self-Ping] [${ACCOUNT_NAME}] تم تنبيه السيرفر بنجاح.`, 'info');
        } catch (e) {
            console.log(`⚠️ [Self-Ping] [${ACCOUNT_NAME}] فشل إرسال التنبيه:`, e.message);
        }
    }, 300000);
});
 
const supabase = createClient(
    'https://bmsfhqmsovicpgxxwsgi.supabase.co',
    'sb_publishable_l1IbZF35GnYYS8PamVX_kg_nTv_uyef'
);

const TEMP_DIR = './temp';

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function randomDelay(minSeconds, maxSeconds) {
    const min = minSeconds * 1000;
    const max = maxSeconds * 1000;
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function rewriteAdWithAI(title, description) {
    const apiKey = (process.env.GEMINI_API_KEY || '').trim();
    if (!apiKey) return `${title}\n\n${description}`;

    const promptText = `أنت خبير تسويق إلكتروني. قم بإعادة صياغة هذا الإعلان بأسلوب جذاب، جديد، ومختلف تماماً مع الحفاظ على نفس الفكرة والمعلومات الأساسية والروابط إن وجدت. اجعل العبارات طبيعية وغير مكررة.
العنوان الاصلي: ${title}
الوصف الاصلي: ${description}

أعطني النتيجة مباشرة بالتنسيق التالي:
العنوان: [العنوان الجديد]
الوصف: [الوصف الجديد]`;

    try {
        const modelsResponse = await axios.get(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
        const validModels = (modelsResponse.data.models || []).filter(m => 
            m.supportedGenerationMethods && 
            m.supportedGenerationMethods.includes('generateContent') &&
            m.name.includes('gemini')
        );

        if (validModels.length === 0) return `${title}\n\n${description}`;

        for (const modelObj of validModels) {
            const exactModelName = modelObj.name;
            try {
                await logToDashboard(`🧠 [AI] جاري محاولة الاتصال بالنموذج: ${exactModelName}...`, 'info');
                const response = await axios({
                    method: 'post',
                    url: `https://generativelanguage.googleapis.com/v1beta/${exactModelName}:generateContent?key=${apiKey}`,
                    headers: { 'Content-Type': 'application/json' },
                    data: { contents: [{ parts: [{ text: promptText }] }] },
                    timeout: 60000
                });

                const aiText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
                if (aiText) {
                    await logToDashboard(`✨ [AI] تم إعادة صياغة الإعلان بنجاح بواسطة (${exactModelName})!`, 'success');
                    return aiText.replace(/العنوان:/g, '').replace(/الوصف:/g, '').trim();
                }
            } catch (e) { continue; }
        }
    } catch (e) {}

    return `${title}\n\n${description}`;
}

async function logToDashboard(message, type = 'info') {
    const ramInfo = getMemoryLog();
    const fullMessage = `${message} | ${ramInfo}`;

    if (type === 'error') console.error(`❌ [ERROR] ${fullMessage}`);
    else if (type === 'success') console.log(`✅ [SUCCESS] ${fullMessage}`);
    else console.log(`📢 [INFO] ${fullMessage}`);

    try {
        await supabase.from('bot_logs').insert([{ message: fullMessage, log_type: type }]);
    } catch (e) {}
}

async function downloadImage(imageUrl) {
    if (!imageUrl) return null;
    if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });
    
    let ext = '.jpg';
    const lowerUrl = imageUrl.toLowerCase();
    if (lowerUrl.includes('.mp4') || lowerUrl.includes('ik-video')) ext = '.mp4';
    else if (lowerUrl.includes('.mov')) ext = '.mov';
    else if (lowerUrl.includes('.webp') || lowerUrl.includes('f-webp')) ext = '.webp';
    else if (lowerUrl.includes('.png')) ext = '.png';

    const imagePath = path.join(TEMP_DIR, `ad-image-${Date.now()}${ext}`);
    
    const response = await axios({
        url: imageUrl,
        method: 'GET',
        responseType: 'stream'
    });
    
    await new Promise((resolve, reject) => {
        const writer = fs.createWriteStream(imagePath);
        response.data.pipe(writer);
        writer.on('finish', resolve);
        writer.on('error', reject);
    });
    
    return imagePath;
}

async function resetStuckPosts() {
    await logToDashboard(`🔄 [${ACCOUNT_NAME}] جاري فحص وتصفير حقول البوت المتبقية...`, 'info');
    const { error } = await supabase
        .from('publish_queue')
        .update({ bot2_group: null, ai_final_text2: null })
        .not('bot2_group', 'is', null);

    if (!error) await logToDashboard(`✅ [${ACCOUNT_NAME}] تم تنظيف الطابور.`, 'success');
}

async function cleanOldLogs() {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const { error } = await supabase.from('bot_logs').delete().lt('created_at', threeDaysAgo);
}

async function getNextPendingPost() {
    const { data, error } = await supabase
        .from('publish_queue')
        .select('*')
        .or('status.eq.pending,status.eq.processing')
        .order('created_at', { ascending: true });

    if (data && data.length > 0) {
        for (const post of data) {
            let groups = [];
            try { groups = JSON.parse(post.groups_json || '[]'); } catch(e) {}
            if (groups.length > 0) return post;
        }
    }
    return null;
}

async function updatePostStatus(id, status, extra = {}) {
    await supabase.from('publish_queue').update({ status, ...extra }).eq('id', id);
}

async function openPostBox(page) {
    await logToDashboard(`⏳ [${ACCOUNT_NAME}] إعطاء فيسبوك مهلة لبناء الأزرار ومربع النشر...`, 'info');
    await sleep(randomDelay(12, 18)); 

    const discussionTabs = ['div[role="tab"]:has-text("مناقشة")', 'a[role="tab"]:has-text("مناقشة")'];
    for (const tabSel of discussionTabs) {
        try {
            const tabBtn = page.locator(tabSel).first();
            if (await tabBtn.count() > 0 && await tabBtn.isVisible()) {
                await tabBtn.click({ timeout: 4000, force: true });
                await sleep(randomDelay(10, 15)); 
                break;
            }
        } catch (e) {}
    }

    const selectors = [
        'span:has-text("اكتب شيئًا...")',
        'text="اكتب شيئًا..."',
        'text="بم تفكر؟"',
        'div[role="button"]:has-text("اكتب شيئًا...")',
        'div[role="textbox"]',
        'text=/اكتب/i',
        'text=/بم تفكر/i'
    ];

    for (const selector of selectors) {
        try {
            const element = page.locator(selector).first();
            if (await element.count() > 0 && await element.isVisible()) {
                await element.click({ timeout: 5000, force: true });
                await sleep(randomDelay(10, 15)); 

                const confirmBtns = ['text=موافق', 'text=تم', 'text=متابعة'];
                for (const cBtn of confirmBtns) {
                    try {
                        const btn = page.locator(cBtn).first();
                        if (await btn.count() > 0 && await btn.isVisible()) {
                            await btn.click({ timeout: 2000, force: true });
                            await sleep(2000);
                        }
                    } catch(e){}
                }
                return true;
            }
        } catch (e) {}
    }

    const discussionBtns = ['text=بدء مناقشة', 'text=مناقشة', 'a[href*="/discussion"]'];
    for (const dSel of discussionBtns) {
        try {
            const dBtn = page.locator(dSel).first();
            if (await dBtn.count() > 0 && await dBtn.isVisible()) {
                await dBtn.click({ timeout: 5000, force: true });
                await sleep(5000);
                return true;
            }
        } catch (e) {}
    }

    try {
        const openedByJS = await page.evaluate(() => {
            const elements = Array.from(document.querySelectorAll('div[role="button"], span, div, a'));
            const target = elements.find(el => {
                const txt = (el.innerText || el.textContent || '').trim();
                return txt.includes('اكتب شيئًا') || txt.includes('بم تفكر') || txt.includes('إنشاء منشور');
            });
            if (target) { target.click(); return true; }
            return false;
        });
        if (openedByJS) { await sleep(10000); return true; }
    } catch (e) {}

    return false;
}

async function pasteTextWithLines(page, postText) {
    await sleep(5000); 

    const targetSelectors = [
        'div[role="dialog"] div[role="textbox"]',
        'div[role="dialog"] [contenteditable="true"]',
        'div[contenteditable="true"]'
    ];

    let textbox = null;
    for (const sel of targetSelectors) {
        try {
            const element = page.locator(sel).first();
            if (await element.count() > 0 && await element.isVisible()) {
                textbox = element;
                break;
            }
        } catch (e) {}
    }

    if (textbox) {
        try {
            await textbox.click({ timeout: 5000, force: true });
            await sleep(2000); 
            await page.evaluate(async (text) => {
                await navigator.clipboard.writeText(text);
            }, postText);
            await page.keyboard.press('Control+V');
            await logToDashboard(`✅ [${ACCOUNT_NAME}] تم لصق النص مع الحفاظ على الأسطر`, 'success');
            return;
        } catch (err) {}
    }

    try {
        await page.evaluate(() => {
            const activeInput = document.querySelector('div[role="dialog"] div[contenteditable="true"]');
            if (activeInput) { activeInput.focus(); activeInput.click(); }
        });
        await sleep(2000);
        await page.keyboard.insertText(postText);
        await logToDashboard(`✅ [${ACCOUNT_NAME}] تم إدخال النص بطريقة البديلة (insertText)`, 'success');
    } catch(e) {
        throw new Error('تعذر العثور على حقل نص صالح للكتابة داخل هذه المجموعة');
    }
}

async function publishToGroup(page, group, post, imagePath) {
    await logToDashboard(`📢 [${ACCOUNT_NAME}] فتح المجموعة: ${group.name} | الرابط: ${group.url}`, 'info');
    await page.goto(group.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    
    const loadWait = randomDelay(15, 25);
    await sleep(loadWait); 

    if (page.url().includes('login') || page.url().includes('checkpoint')) {
        throw new Error(`انتهت جلسة تسجيل الدخول أو يوجد Checkpoint لـ ${ACCOUNT_NAME}`);
    }

    const opened = await openPostBox(page);
    if (!opened) throw new Error('لم يتم العثور على مربع النشر');

    await sleep(randomDelay(3, 5)); 

    if (imagePath) {
        const imageTriggerSelectors = [
            'div[aria-label="صورة/فيديو"]',
            'svg[aria-label="صورة/فيديو"]',
            'div:has-text("صورة/فيديو")',
            'div[role="button"]:has(input[type="file"])'
        ];

        for (const trigSel of imageTriggerSelectors) {
            try {
                const trigElement = page.locator(trigSel).first();
                if (await trigElement.count() > 0 && await trigElement.isVisible()) {
                    await trigElement.click({ timeout: 5000, force: true });
                    await sleep(4000); 
                    break;
                }
            } catch (e) {}
        }

        let isFileInjected = false;
        try {
            const dialogFileInput = page.locator('div[role="dialog"] input[type="file"]').first();
            if (await dialogFileInput.count() > 0) {
                await dialogFileInput.setInputFiles(imagePath);
                isFileInjected = true;
            } else {
                const allFileInputs = page.locator('input[type="file"]');
                const count = await allFileInputs.count();
                if (count > 0) {
                    await allFileInputs.nth(count - 1).setInputFiles(imagePath);
                    isFileInjected = true;
                }
            }
        } catch (e) {}

        if (isFileInjected) {
            const isVideoFile = imagePath.endsWith('.mp4') || imagePath.endsWith('.mov');
            const waitTime = isVideoFile ? 60000 : 25000;
            
            await sleep(waitTime);
            try {
                await page.waitForSelector('img[src*="blob:"], video, [aria-label*="إزالة"]', { timeout: 25000 });
            } catch (e) {}
            await sleep(randomDelay(15, 20)); 
        } else {
            await logToDashboard(`⚠️ [${ACCOUNT_NAME}] تعذر العثور على حقل الـ input الصحيح للرفع`, 'error');
        }
    }
    
    await sleep(5000); 

    let postText = post.ai_final_text2 || post.ai_final_text || '';
    if (!postText || postText.trim() === '') {
        const aiGeneratedContent = await rewriteAdWithAI(post.ad_title, post.ad_description);
        postText = `${aiGeneratedContent}\n\n🔥 إعلان جديد على سوق الإعلانات الحديث`;
        let fbUrl = post.facebook_url || '';
        if (fbUrl.trim() !== '') postText += `\n\n${fbUrl.trim()}`;
        try { await supabase.from('publish_queue').update({ ai_final_text2: postText }).eq('id', post.id); } catch(e) {}
    }

    await pasteTextWithLines(page, postText);
    
    let fbUrlCheck = post.facebook_url || '';
    if (fbUrlCheck.trim() !== '' || postText.includes('facebook.com')) {
        await sleep(randomDelay(25, 35));
    } else {
        await sleep(randomDelay(15, 20)); 
    }
    
    await sleep(randomDelay(4, 7)); 

    const publishButtons = [
        'div[role="dialog"] div[role="button"]:has-text("نشر")',
        'div[aria-label="نشر"]',
        'text=نشر'
    ];

    let published = false;
    for (const btn of publishButtons) {
        try {
            const button = page.locator(btn).last();
            if (await button.count() > 0 && await button.isVisible()) {
                await button.click({ timeout: 6000, force: true });
                published = true;
                break;
            }
        } catch (e) {}
    }

    if (!published) throw new Error('فشل العثور على زر النشر أو تعذر الضغط عليه');
    
    let isUploadedVideo = imagePath && (imagePath.endsWith('.mp4') || imagePath.endsWith('.mov'));
    await sleep(isUploadedVideo ? 60000 : 25000); 
    await logToDashboard(`✅ [${ACCOUNT_NAME}] تم النشر في المجموعة: ${group.name}`, 'success');
}

async function processOnePost(post) {
    await logToDashboard(`🔥 [${ACCOUNT_NAME}] بدأ معالجة الإعلان: ${post.ad_title}`, 'info');
    await updatePostStatus(post.id, 'processing', { started_at: new Date() });

    let mediaUrl = '';
    if (post.ad_video && post.ad_video.trim() !== '') mediaUrl = post.ad_video.trim();
    else if (post.ad_image && post.ad_image.trim() !== '') mediaUrl = post.ad_image.trim();

    let imagePath = null;
    if (mediaUrl !== '') {
        try {
            imagePath = await downloadImage(mediaUrl);
        } catch (err) {
            await logToDashboard(`⚠️ [${ACCOUNT_NAME}] فشل تحميل الملف: ${err.message}`, 'info');
        }
    }

    // المتصفح سيُطلق هنا ببساطة لأنه أصبح مدعوماً ومثبتاً في أول الكود!
    const browser = await chromium.launch({
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--disable-blink-features=AutomationControlled',
            '--single-process',
            '--no-zygote'
        ]
    });

    const context = await browser.newContext({
        viewport: { width: 1280, height: 800 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        permissions: ['clipboard-read', 'clipboard-write']
    });

    await context.route('**/*', (route) => {
        if (['font', 'stylesheet'].includes(route.request().resourceType())) return route.abort();
        return route.continue();
    });

    if (fs.existsSync(COOKIE_FILE)) {
        try {
            const cookiesString = fs.readFileSync(COOKIE_FILE, 'utf8');
            let rawCookies = JSON.parse(cookiesString);
            const formattedCookies = rawCookies.map(cookie => {
                const c = { ...cookie };
                if (typeof c.sameSite === 'string') {
                    const lower = c.sameSite.toLowerCase();
                    if (lower === 'lax') c.sameSite = 'Lax';
                    else if (lower === 'strict') c.sameSite = 'Strict';
                    else if (lower === 'none' || lower === 'no_restriction') c.sameSite = 'None';
                    else delete c.sameSite;
                } else delete c.sameSite;

                if (c.expirationDate && !c.expires) c.expires = c.expirationDate;
                delete c.id; delete c.storeId; delete c.hostOnly;
                return c;
            });
            await context.addCookies(formattedCookies);
            await logToDashboard(`✅ [${ACCOUNT_NAME}] تم حقن الكوكيز بنجاح!`, 'success');
        } catch (e) {}
    }

    let successCount = post.success_count || 0;
    let failedCount = post.failed_count || 0;
    let failedGroups = [];
    
    try {
        if (post.error_message && post.error_message.trim() !== '' && post.error_message !== 'null') {
            const parsedError = JSON.parse(post.error_message);
            if (Array.isArray(parsedError)) failedGroups = parsedError;
        }
    } catch (e) {}

    let remainingGroups = [];

    try {
        while (true) {
            const { data: freshPost, error: fetchErr } = await supabase
                .from('publish_queue')
                .select('*')
                .eq('id', post.id)
                .single();

            if (fetchErr || !freshPost) break;

            try { remainingGroups = JSON.parse(freshPost.groups_json || '[]'); } catch { remainingGroups = []; }

            if (remainingGroups.length === 0) break;

            const targetGroup = remainingGroups[0];
            const newRemaining = remainingGroups.slice(1);

            const updatePayload = { groups_json: JSON.stringify(newRemaining) };
            try { updatePayload.bot2_group = JSON.stringify(targetGroup); } catch(e) {}

            const { error: updateErr } = await supabase.from('publish_queue').update(updatePayload).eq('id', post.id);
            if (updateErr) { await sleep(1000); continue; }

            const page = await context.newPage();
            page.on('dialog', async dialog => { try { await dialog.accept(); } catch(e) {} });

            try {
                const publishTask = publishToGroup(page, targetGroup, freshPost, imagePath);
                const timeoutTask = new Promise((_, reject) => setTimeout(() => reject(new Error('تجمّد مفاجئ (Timeout)')), 360000));
                await Promise.race([publishTask, timeoutTask]);
                successCount++;
            } catch (err) {
                if (err.message.includes('Checkpoint') || err.message.includes('login')) {
                    await logToDashboard(`🚨 [خطر] تم رصد تشيك بوينت! جاري إيقاف السيرفر لحماية الحساب...`, 'error');
                    process.exit(0);
                }
                failedCount++;
                failedGroups.push({ name: targetGroup.name, url: targetGroup.url, error: err.message });
                await logToDashboard(`❌ [${ACCOUNT_NAME}] فشل النشر في: ${targetGroup.name} | السبب: ${err.message}`, 'error');
            } finally {
                await page.close();
                const resetPayload = { success_count: successCount, failed_count: failedCount, error_message: JSON.stringify(failedGroups) };
                try { resetPayload.bot2_group = null; resetPayload.ai_final_text2 = null; } catch(e) {}
                await supabase.from('publish_queue').update(resetPayload).eq('id', post.id);
            }

            const { data: checkData } = await supabase.from('publish_queue').select('groups_json').eq('id', post.id).single();
            let checkRemaining = [];
            try { checkRemaining = JSON.parse(checkData.groups_json || '[]'); } catch(e){}
            if (checkRemaining.length === 0) break;

            await sleep(randomDelay(180, 300));
        }
    } finally {
        await context.close();
        await browser.close();
    }

    if (imagePath && fs.existsSync(imagePath)) { try { fs.unlinkSync(imagePath); } catch {} }

    const { data: finalPost } = await supabase.from('publish_queue').select('groups_json').eq('id', post.id).single();
    let finalGroups = [];
    try { finalGroups = JSON.parse(finalPost.groups_json || '[]'); } catch(e){}

    if (finalGroups.length === 0 && failedCount === 0) {
        await updatePostStatus(post.id, 'published', { published_at: new Date(), error_message: null });
        await logToDashboard(`✅ [${ACCOUNT_NAME}] تم نشر الإعلان بنجاح.`, 'success');
    } else if (finalGroups.length === 0) {
        await updatePostStatus(post.id, 'failed', { error_message: JSON.stringify(failedGroups) });
        await logToDashboard(`❌ [${ACCOUNT_NAME}] اكتملت المجموعات مع إخفاقات.`, 'error');
    }
}

async function start() {
    await resetStuckPosts();
    await cleanOldLogs();
    setInterval(cleanOldLogs, 24 * 60 * 60 * 1000);

    let idleLogTimer = 0; 

    while (true) {
        const post = await getNextPendingPost();
        if (!post) {
            idleLogTimer++;
            if (idleLogTimer >= 10) {
                await logToDashboard(`💤 [${ACCOUNT_NAME}] البوت مستيقظ ويبحث عن إعلانات...`, 'info');
                idleLogTimer = 0;
            }
            await sleep(30000); 
            continue;
        }
        idleLogTimer = 0; 
        await processOnePost(post);
        await sleep(randomDelay(900, 1800));
    }
}

start().catch(async (err) => {
    try {
        const emergencySupabase = createClient('https://bmsfhqmsovicpgxxwsgi.supabase.co', 'sb_publishable_l1IbZF35GnYYS8PamVX_kg_nTv_uyef');
        await emergencySupabase.from('bot_logs').insert([{ message: `❌ توقف البوت بسبب خطأ: ${err.message}`, log_type: 'error' }]);
    } catch(e){}
});
