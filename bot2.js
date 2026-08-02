const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');

// 🔌 الاتصال بـ Supabase (دعم المتغيرات السحابية أو القيم الافتراضية)
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://bmsfhqmsovicpgxxwsgi.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'sb_publishable_l1IbZF35GnYYS8PamVX_kg_nTv_uyef';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const TEMP_DIR = path.join(__dirname, 'temp');
const ACCOUNT_NAME = 'الحساب (2)';

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function randomDelay(minSeconds, maxSeconds) {
    const min = minSeconds * 1000;
    const max = maxSeconds * 1000;
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// 🔄 دالة جلب الإعدادات الديناميكية من جدول system_settings في Supabase
async function getSetting(keyName) {
    try {
        const { data, error } = await supabase
            .from('system_settings')
            .select('value')
            .eq('key', keyName)
            .single();

        if (error || !data) return null;
        return data.value;
    } catch (e) {
        return null;
    }
}

// 📢 دالة تسجيل السجلات المحسنة في Supabase والكونسول
async function logToDashboard(message, type = 'info') {
    const fullMsg = `[${ACCOUNT_NAME}] ${message}`;
    if (type === 'error') console.error(`❌ ${fullMsg}`);
    else if (type === 'success') console.log(`✅ ${fullMsg}`);
    else console.log(`📢 ${fullMsg}`);

    try {
        const { error } = await supabase.from('bot_logs').insert([{ message: fullMsg, log_type: type }]);
        if (error) {
            console.error(`⚠️ [Log Error]: فشل حفظ السجل في Supabase: ${error.message}`);
        }
    } catch (e) {
        console.error(`⚠️ [Log Exception]: ${e.message}`);
    }
}

// 🧠 دالة إعادة صياغة الإعلان بالذكاء الاصطناعي (تستجلب المفتاح سحابياً)
async function rewriteAdWithAI(title, description) {
    const geminiKey = await getSetting('GEMINI_KEY');

    if (!geminiKey) return `${title}\n\n${description}`;
    const promptText = `أنت خبير تسويق إلكتروني. قم بإعادة صياغة هذا الإعلان بأسلوب جذاب، جديد، ومختلف تماماً مع الحفاظ على نفس الفكرة والمعلومات الأساسية والروابط إن وجدت. اجعل العبارات طبيعية وغير مكررة.
العنوان الاصلي: ${title}
الوصف الاصلي: ${description}

أعطني النتيجة مباشرة بالتنسيق التالي:
العنوان: [العنوان الجديد]
الوصف: [الوصف الجديد]`;

    try {
        const modelsResponse = await axios.get(`https://generativelanguage.googleapis.com/v1beta/models?key=${geminiKey}`);
        const validModels = (modelsResponse.data.models || []).filter(m => 
            m.supportedGenerationMethods && m.supportedGenerationMethods.includes('generateContent') && m.name.includes('gemini')
        );

        if (validModels.length === 0) return `${title}\n\n${description}`;

        for (const modelObj of validModels) {
            try {
                const response = await axios.post(`https://generativelanguage.googleapis.com/v1beta/${modelObj.name}:generateContent?key=${geminiKey}`, {
                    contents: [{ parts: [{ text: promptText }] }]
                });
                const aiText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
                if (aiText) {
                    await logToDashboard(`✨ تم إعادة صياغة الإعلان بنجاح بواسطة الذكاء الاصطناعي!`, 'success');
                    return aiText.replace(/العنوان:/g, '').replace(/الوصف:/g, '').trim();
                }
            } catch (e) { continue; }
        }
    } catch (e) {}

    return `${title}\n\n${description}`;
}

// 🖼️ دالة تحميل الصورة أو الفيديو محلياً
async function downloadImage(imageUrl) {
    if (!imageUrl) return null;
    if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });
    
    let ext = '.jpg';
    const lowerUrl = imageUrl.toLowerCase();
    if (lowerUrl.includes('.mp4') || lowerUrl.includes('ik-video')) ext = '.mp4';
    else if (lowerUrl.includes('.mov')) ext = '.mov';
    else if (lowerUrl.includes('.webp') || lowerUrl.includes('f-webp')) ext = '.webp';
    else if (lowerUrl.includes('.png')) ext = '.png';

    const imagePath = path.join(TEMP_DIR, `ad-image-bot2-${Date.now()}${ext}`);
    const response = await axios({ url: imageUrl, method: 'GET', responseType: 'stream' });
    
    await new Promise((resolve, reject) => {
        const writer = fs.createWriteStream(imagePath);
        response.data.pipe(writer);
        writer.on('finish', resolve);
        writer.on('error', reject);
    });
    return imagePath;
}

// 🎯 دالة فتح مربع النشر
async function openPostBox(page) {
    await logToDashboard(`⏳ إعطاء فيسبوك مهلة 15 ثانية لبناء الأزرار ومربع النشر...`, 'info');
    await sleep(15000); 

    const discussionTabs = [
        'div[role="tab"]:has-text("مناقشة")',
        'div[role="tab"]:has-text("Discussion")',
        'a[role="tab"]:has-text("مناقشة")',
        'a[role="tab"]:has-text("Discussion")',
        'a[href*="/discussion"]'
    ];

    for (const tabSel of discussionTabs) {
        try {
            const tabBtn = page.locator(tabSel).first();
            if (await tabBtn.count() > 0 && await tabBtn.isVisible()) {
                await tabBtn.click({ timeout: 4000, force: true });
                await logToDashboard(`🔄 تم التبديل لتبويب (مناقشة)، ننتظر 15 ثانية لاستقرار التبويب...`, 'info');
                await sleep(15000); 
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
        'div[role="button"]:has-text("إنشاء منشور عام...")',
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

    for (const selector of selectors) {
        try {
            const element = page.locator(selector).first();
            if (await element.count() > 0 && await element.isVisible()) {
                await element.click({ timeout: 5000, force: true });
                await logToDashboard(`⏳ تم النقر لفتح نافذة المنشور، ننتظر 15 ثانية لتفتح النافذة براحتها...`, 'info');
                await sleep(15000); 

                const confirmBtns = ['text=موافق', 'text=فهمت', 'text=تم', 'text=Got It', 'text=OK', 'text=متابعة'];
                for (const cBtn of confirmBtns) {
                    try {
                        const btn = page.locator(cBtn).first();
                        if (await btn.count() > 0 && await btn.isVisible()) {
                            await btn.click({ timeout: 2000, force: true });
                            await sleep(2000);
                        }
                    } catch(e){}
                }

                await logToDashboard(`✅ تم فتح نافذة المنشور بنجاح`, 'success');
                return true;
            }
        } catch (e) {}
    }
    return false;
}

// 📝 دالة لصق النص
async function pasteTextWithLines(page, postText) {
    await sleep(5000); 

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
            await logToDashboard(`✅ تم لصق النص مع الحفاظ على الأسطر`, 'success');
            return;
        } catch (err) {
            await logToDashboard(`⚠️ فشل Clipboard، سيتم استخدام التعبئة البديلة insertText...`, 'info');
        }
    }

    try {
        await page.evaluate(() => {
            const activeInput = document.querySelector('div[role="dialog"] div[contenteditable="true"], div[role="dialog"] div[role="textbox"]');
            if (activeInput) {
                activeInput.focus();
                activeInput.click();
            }
        });
        await sleep(2000);
        await page.keyboard.insertText(postText);
        await logToDashboard(`✅ تم إدخال النص بطريقة البديلة (insertText)`, 'success');
    } catch(e) {
        throw new Error('تعذر العثور على حقل نص صالح للكتابة داخل هذه المجموعة');
    }
}

// 🚀 دالة النشر الفعلي للمجموعة
async function publishToGroup(page, group, post, imagePath) {
    await logToDashboard(`📢 فتح رابط مجموعة البوت: ${group.name} | الرابط: ${group.url}`, 'info');
    
    await page.goto(group.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    
    await logToDashboard(`⏳ تم تحميل الصفحة، ننتظر 40 ثانية كاملة لاستقرار عناصر الصفحة وبناء السكربتات...`, 'info');
    await sleep(40000); 

    if (page.url().includes('login') || page.url().includes('checkpoint')) {
        throw new Error('انتهت جلسة تسجيل الدخول أو يوجد Checkpoint للحساب');
    }

    const opened = await openPostBox(page);
    if (!opened) throw new Error('لم يتم العثور على مربع النشر');

    await sleep(randomDelay(3, 5)); 

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

            await logToDashboard(`🖼️ تم حقن مسار الملف، ننتظر ${waitTime/1000} ثانية لرفع الملف...`, 'success');
            await sleep(waitTime);

            try {
                await page.waitForSelector('img[src*="blob:"], video, [aria-label*="إزالة"], [aria-label*="Remove"]', { timeout: 25000 });
                await logToDashboard(`✅ ظهرت معاينة المرفق بنجاح`, 'success');
            } catch (e) {}

            await logToDashboard(`⏳ ننتظر 30 ثانية إضافية لاستقرار المعاينة...`, 'info');
            await sleep(30000); 
        }
    }
    
    await sleep(5000); 

    let postText = post.ai_final_text2 || '';
    
    if (!postText || postText.trim() === '') {
        await logToDashboard(`🧠 [AI] العمود ai_final_text2 فارغ، جاري صياغة نص جديد خصيصاً لمجموعة: ${group.name}...`, 'info');
        const aiGeneratedContent = await rewriteAdWithAI(post.ad_title, post.ad_description);
        postText = `${aiGeneratedContent}\n\n🔥 إعلان جديد على سوق الإعلانات الحديث`;

        let fbUrl = post.facebook_url || '';
        if (fbUrl.trim() !== '') {
            postText += `\n\n${fbUrl.trim()}`;
        }
        
        await supabase.from('publish_queue').update({ ai_final_text2: postText }).eq('id', post.id);
        await logToDashboard(`💾 [Supabase] تم حفظ النص النهائي الخاص بهذه المجموعة في عمود (ai_final_text2).`, 'success');
    } else {
        await logToDashboard(`📌 [Supabase] تم جلب النص الجاهز من عمود (ai_final_text2).`, 'success');
    }

    await logToDashboard(`📝 [Text] النص النهائي الذي سيتم لصقه:\n${postText}`, 'info');

    await pasteTextWithLines(page, postText);

    let fbUrlCheck = post.facebook_url || '';
    if (fbUrlCheck.trim() !== '' || postText.includes('facebook.com')) {
        await logToDashboard(`⏳ تم إدراج رابط فيسبوك، ننتظر 45 ثانية كاملة ليتفاعل النظام وتظهر المعاينة...`, 'info');
        await sleep(45000);
    } else {
        await logToDashboard(`⏳ تم لصق النص، ننتظر 25 ثانية ليتفاعل النظام مع النص المُدخل...`, 'info');
        await sleep(25000); 
    }

    const publishButtons = [
        'div[role="dialog"] div[role="button"]:has-text("نشر")',
        'div[role="dialog"] div[role="button"]:has-text("Post")',
        'div[role="dialog"] div[role="button"]:has-text("Publish")',
        'div[aria-label="نشر"]',
        'div[aria-label="Post"]',
        'text=نشر', 'text=Post', 'text=Publish'
    ];

    let published = false;
    for (const btn of publishButtons) {
        try {
            const button = page.locator(btn).last();
            if (await button.count() > 0 && await button.isVisible()) {
                await button.click({ timeout: 6000, force: true });
                published = true;
                await logToDashboard(`🚀 تم الضغط على زر النشر النهائي`, 'success');
                break;
            }
        } catch (e) {}
    }

    if (!published) throw new Error('فشل العثور على زر النشر أو تعذر الضغط عليه');
    
    let isUploadedVideo = imagePath && (imagePath.endsWith('.mp4') || imagePath.endsWith('.mov'));
    let finalWait = isUploadedVideo ? 60000 : 30000;

    await logToDashboard(`⏳ انتظار استقرار النشر نهائياً لمدة ${finalWait/1000} ثانية لضمان إرسال المنشور...`, 'info');
    await sleep(finalWait); 
    
    await logToDashboard(`✅ تم النشر في مجموعة البوت بنجاح تام: ${group.name}`, 'success');
}

// 🔄 دالة معالجة إعلان واحد للبوت الثاني
async function processOnePostBot2(initialPostData) {
    // 🍪 جلب الكوكيز من Supabase مباشرة
    const cookiesRaw = await getSetting('FB_COOKIES_BOT2');
    if (!cookiesRaw) {
        await logToDashboard(`❌ ملف الكوكيز للبوت الثاني غير موجود في جدول system_settings!`, 'error');
        return;
    }

    await logToDashboard(`🚀 بدأ معالجة الإعلان (#${initialPostData.id}: ${initialPostData.ad_title})...`, 'info');

    let mediaUrl = '';
    if (initialPostData.ad_video && initialPostData.ad_video.trim() !== '') {
        mediaUrl = initialPostData.ad_video.trim();
        await logToDashboard(`🎥 تم رصد رابط فيديو (ad_video): ${mediaUrl}`, 'info');
    } else if (initialPostData.ad_image && initialPostData.ad_image.trim() !== '') {
        mediaUrl = initialPostData.ad_image.trim();
        await logToDashboard(`📸 تم رصد رابط صورة (ad_image): ${mediaUrl}`, 'info');
    }

    let imagePath = null;
    if (mediaUrl !== '') {
        try {
            imagePath = await downloadImage(mediaUrl);
            if (imagePath) await logToDashboard(`🖼️ تم تحميل الملف وحفظه محلياً: ${imagePath}`, 'success');
        } catch (e) {
            await logToDashboard(`⚠️ فشل تحميل الملف، سيتم النشر كنص فقط: ${e.message}`, 'info');
        }
    }

    const browser = await chromium.launch({
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-blink-features=AutomationControlled',
            '--disable-gpu',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-service-autorun',
            '--password-store=basic',
            '--single-process',
            '--js-flags="--max-old-space-size=128"',
            '--disable-extensions',
            '--disable-component-extensions-with-background-pages',
            '--disable-default-apps',
            '--mute-audio',
            '--no-zygote',
            '--disable-accelerated-video-decode',
            '--disable-infobars',
            '--hide-scrollbars'
        ]
    });

    const context = await browser.newContext({
        viewport: { width: 1280, height: 800 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        permissions: ['clipboard-read', 'clipboard-write']
    });

    try {
        let rawCookies = JSON.parse(cookiesRaw);
        
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
        await logToDashboard(`🍪 تم حقن الكوكيز بنجاح وتأمين الجلسة!`, 'success');

        while (true) {
            const { data: freshData } = await supabase
                .from('publish_queue')
                .select('*')
                .eq('id', initialPostData.id)
                .single();

            if (!freshData) break;

            // 🛑 🔥 زر التوقف للبوت الثاني
            if (freshData.bot2_status === 'stopped') {
                await logToDashboard(`🛑 تم إيقاف البوت الثاني يدوياً بطلب من المستخدم!`, 'info');
                break;
            }

            // ⏸️ زر الإيقاف المؤقت (Pause)
            while (freshData.bot2_status === 'paused') {
                await logToDashboard(`⏸️ البوت الثاني في حالة إيقاف مؤقت (Paused)، يرجى الانتظار...`, 'info');
                await sleep(10000);
                const { data: pauseCheck } = await supabase
                    .from('publish_queue')
                    .select('bot2_status')
                    .eq('id', initialPostData.id)
                    .single();
                
                if (!pauseCheck || pauseCheck.bot2_status === 'stopped') break;
                if (pauseCheck.bot2_status === 'running') {
                    freshData.bot2_status = 'running';
                    break;
                }
            }

            if (freshData.bot2_status === 'stopped') break;

            // ⏭️ زر تخطي المجموعة الحالية (Skip Group)
            if (freshData.skip_current_group === true) {
                await logToDashboard(`⏭️ تم طلب تخطي المجموعة الحالية بطلب من المستخدم، جاري الانتقال للتالي...`, 'info');
                await supabase.from('publish_queue').update({
                    skip_current_group: false,
                    bot2_group: null,
                    ai_final_text2: null
                }).eq('id', initialPostData.id);
                continue;
            }

            let groups = [];
            try {
                groups = JSON.parse(freshData.groups_json || '[]');
            } catch (e) {}

            let botGroup = null;
            try {
                botGroup = freshData.bot2_group ? JSON.parse(freshData.bot2_group) : null;
            } catch (e) {}

            if (groups.length === 0 && !botGroup) {
                const { data: finalCheck } = await supabase
                    .from('publish_queue')
                    .select('failed_count')
                    .eq('id', initialPostData.id)
                    .single();

                const finalFailed = finalCheck?.failed_count || 0;
                const finalStatus = finalFailed > 0 ? 'failed' : 'published';

                await logToDashboard(`🎉 اكتملت جميع المجموعات للحساب (2)! الحالة النهائية: (${finalStatus})`, 'success');

                await supabase.from('publish_queue').update({
                    status: finalStatus,
                    bot2_status: 'stopped',
                    bot2_group: null,
                    ai_final_text2: null
                }).eq('id', initialPostData.id);
                break;
            }

            let targetGroup = null;

            if (botGroup) {
                targetGroup = botGroup;
                await logToDashboard(`🎯 وُجدت مجموعة معلقة في قروب البوت (${targetGroup.name})، جاري استكمال النشر فيها...`, 'info');
            } else {
                targetGroup = groups[0];
                const remainingGroups = groups.slice(1);

                const { error: updateErr } = await supabase.from('publish_queue').update({
                    bot2_group: JSON.stringify(targetGroup),
                    groups_json: JSON.stringify(remainingGroups)
                }).eq('id', initialPostData.id);

                if (updateErr) {
                    await sleep(1000);
                    continue;
                }

                await logToDashboard(`🎯 تم سحب المجموعة (${targetGroup.name}) وحذفها من الطابور الرئيسي لضمان عدم التكرار...`, 'success');
            }

            const page = await context.newPage();
            try {
                await publishToGroup(page, targetGroup, freshData, imagePath);
                
                const { data: latestSuccessPost } = await supabase
                    .from('publish_queue')
                    .select('success_count')
                    .eq('id', initialPostData.id)
                    .single();

                const currentSuccessCount = latestSuccessPost?.success_count || 0;
                const newSuccessCount = currentSuccessCount + 1;
                
                await supabase.from('publish_queue').update({
                    bot2_group: null,
                    ai_final_text2: null,
                    success_count: newSuccessCount
                }).eq('id', initialPostData.id);

                await logToDashboard(`🧹 تم تصفير (ai_final_text2) وقروب البوت وتحديث العداد لـ (${newSuccessCount}).`, 'success');

                const { data: checkData } = await supabase.from('publish_queue').select('groups_json').eq('id', initialPostData.id).single();
                let currentRemaining = [];
                try { currentRemaining = JSON.parse(checkData.groups_json || '[]'); } catch(e){}

                if (currentRemaining.length > 0 || botGroup) {
                    const longBreak = randomDelay(300, 480);
                    await logToDashboard(`⏳ استراحة أمان لحماية الحساب لمدة ${Math.round(longBreak / 1000 / 60)} دقائق قبل المجموعة التالية...`, 'info');
                    await sleep(longBreak);
                }

            } catch (err) {
                const { data: latestFailedPost } = await supabase
                    .from('publish_queue')
                    .select('failed_count, error_message')
                    .eq('id', initialPostData.id)
                    .single();

                const currentFailedCount = latestFailedPost?.failed_count || 0;
                const newFailedCount = currentFailedCount + 1;
                
                let failedGroups = [];
                try {
                    if (latestFailedPost?.error_message && latestFailedPost.error_message.trim() !== '' && latestFailedPost.error_message !== 'null') {
                        const parsed = JSON.parse(latestFailedPost.error_message);
                        if (Array.isArray(parsed)) failedGroups = parsed;
                    }
                } catch(e){}

                failedGroups.push({ name: targetGroup.name, url: targetGroup.url, error: err.message });

                await logToDashboard(`❌ خطأ أثناء النشر في المجموعة (${targetGroup.name}): ${err.message}`, 'error');
                
                await supabase.from('publish_queue').update({ 
                    bot2_group: null,
                    ai_final_text2: null,
                    failed_count: newFailedCount,
                    error_message: JSON.stringify(failedGroups)
                }).eq('id', initialPostData.id);

                await sleep(10000);
                continue; 
            } finally {
                await page.close();
            }
        }

    } catch (err) {
        await logToDashboard(`❌ خطأ عام في البوت الثاني: ${err.message}`, 'error');
    } finally {
        await browser.close();
        if (imagePath && fs.existsSync(imagePath)) {
            try { fs.unlinkSync(imagePath); } catch {}
        }
        await logToDashboard(`🧹 اكتملت العملية وأُغلق متصفح البوت الثاني بأمان.`, 'info');
    }
}

// 🛠️ إعادة ضبط الإعلانات العالقة للـ bot2 عند بدء التشغيل
async function resetStuckBot2Posts() {
    await logToDashboard(`🔄 جاري فحص الإعلانات العالقة (processing) للبوت الثاني لإعادتها إلى (running)...`, 'info');
    const { error } = await supabase
        .from('publish_queue')
        .update({ bot2_status: 'running', bot2_group: null, ai_final_text2: null })
        .eq('bot2_status', 'processing');

    if (error) {
        await logToDashboard(`⚠️ خطأ في إعادة ضبط الإعلانات العالقة: ${error.message}`, 'error');
    }
}

// 🌐 🌟 الحلقة التكرارية للبوت الثاني (سحابية ومتوافقة مع GitHub Actions)
async function startBot2Engine() {
    await logToDashboard(`🚀 تم تشغيل محرك البوت الثاني الذاتي بنجاح...`, 'success');
    await resetStuckBot2Posts();

    while (true) {
        try {
            // البحث المباشر عن أي إعلان ينتظر التشغيل للبوت الثاني
            const { data, error } = await supabase
                .from('publish_queue')
                .select('*')
                .eq('bot2_status', 'running')
                .order('id', { ascending: true })
                .limit(1);

            if (error) {
                await sleep(10000);
                continue;
            }

            // 🛑 إذا كان الطابور فارغاً ولا توجد إعلانات تنتظر النشر، نغلق السكربت بنجاح فوراً
            if (!data || data.length === 0) {
                await logToDashboard(`🎉 اكتملت جميع المهام في الطابور، تم إنهاء الجلسة السحابية بنجاح!`, 'success');
                console.log("✅ لا توجد إعلانات قيد الانتظار، جاري إغلاق السكربت...");
                process.exit(0);
            }

            const postToRun = data[0];

            // تعيين الحالة إلى processing لمنع التكرار
            await supabase.from('publish_queue').update({ bot2_status: 'processing' }).eq('id', postToRun.id);

            await processOnePostBot2(postToRun);

            // تعيين الحالة إلى stopped بعد الانتهاء
            await supabase.from('publish_queue').update({ bot2_status: 'stopped' }).eq('id', postToRun.id);

        } catch (err) {
            await logToDashboard(`❌ خطأ في محرك البوت الثاني الرئيسي: ${err.message}`, 'error');
            await sleep(10000);
        }
    }
}
// 🔌 لتصدير الدالة أو تشغيلها فوراً عند فتح الملف مباشرة
module.exports = processOnePostBot2;

if (require.main === module) {
    startBot2Engine();
}
