document.addEventListener('DOMContentLoaded', () => {
    // ==========================================
    // 0. أدوات مساعدة
    // ==========================================
    const $ = (id) => document.getElementById(id);

    // تعقيم أي نص قبل وضعه داخل HTML (يمنع XSS)
    const esc = (s) => String(s).replace(/[&<>"']/g, c => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));

    // تخزين محلي آمن: لا ينهار عند وجود بيانات تالفة أو تخزين غير متاح
    const Storage = {
        get(key, defaultVal) {
            try {
                const raw = localStorage.getItem(key);
                if (raw === null) return defaultVal;
                const val = JSON.parse(raw);
                return val === null || val === undefined ? defaultVal : val;
            } catch (e) { return defaultVal; }
        },
        set(key, val) {
            try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* ممتلئ أو محجوب */ }
        }
    };

    // ---- توحيد النص العربي للمطابقة الذكية ----
    const SYNONYMS = {
        'بطاطس': 'بطاطا', 'بطاطه': 'بطاطا', 'رز': 'ارز', 'معكرونه': 'مكرونه', 'مكرونه': 'مكرونه',
        'بندوره': 'طماطم', 'تونه': 'تونا', 'كوسه': 'كوسا',
        'فاصوليا': 'فاصولياء', 'بصله': 'بصل', 'جزره': 'جزر', 'دجاجه': 'دجاج', 'فراخ': 'دجاج',
        'سمكه': 'سمك', 'لحمه': 'لحم', 'بيضه': 'بيض', 'ليمونه': 'ليمون', 'باذنجانه': 'باذنجان',
        'جبنه': 'جبن', 'ثومه': 'ثوم'
    };
    function normToken(t) {
        t = t.replace(/[ً-ٰٟـ]/g, '')        // التشكيل والتطويل
             .replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
             .toLowerCase();
        if (t.length > 3 && t.startsWith('ال')) t = t.slice(2); // أداة التعريف
        return SYNONYMS[t] || t;
    }
    const tokens = (s) => String(s).trim().split(/\s+/).filter(Boolean).map(normToken);

    // 2 = تطابق تام، 1 = كل كلمات المستخدم موجودة ككلمات كاملة في المكوّن، 0 = لا تطابق
    function matchUser(userTok, ingTok) {
        if (userTok.join(' ') === ingTok.join(' ')) return 2;
        return userTok.every(t => ingTok.includes(t)) ? 1 : 0;
    }
    // عنصر المخزن يغطّي المكوّن إذا كانت كلماته كلها ضمن المكوّن ("زيت" تغطي "زيت زيتون")
    // وليس العكس ("فلفل أسود" لا تغطي "فلفل")
    const matchPantry = (pTok, ingTok) => pTok.every(t => ingTok.includes(t));

    // ==========================================
    // 1. الحالة + قاعدة البيانات
    // ==========================================
    const DEFAULT_PANTRY = ['ملح', 'فلفل أسود', 'زيت زيتون', 'زيت', 'سمن', 'سكر', 'كمون', 'كزبرة', 'بهارات'];
    const toId = (x) => (x && typeof x === 'object') ? x.id : x;   // ترحيل البيانات القديمة (كانت تُخزَّن كائنات كاملة)

    let ingredientsList = [];
    let pantryList = Storage.get('pantry', DEFAULT_PANTRY.slice());
    let favoritesList = Storage.get('favorites', []).map(toId).filter(Number.isFinite);
    let shoppingList = Storage.get('shopping', []);
    let plannerDB = {};
    const rawPlanner = Storage.get('planner', {});
    Object.keys(rawPlanner).forEach(k => { const id = toId(rawPlanner[k]); if (Number.isFinite(id)) plannerDB[k] = id; });
    if (!Array.isArray(pantryList)) pantryList = DEFAULT_PANTRY.slice();
    if (!Array.isArray(shoppingList)) shoppingList = [];

    let dbPromise = null, dbById = new Map();
    function loadDB() {
        if (!dbPromise) {
            dbPromise = fetch('./database.json')
                .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
                .then(list => {
                    list.forEach(r => { r._tok = r.ingredients.map(tokens); dbById.set(r.id, r); });
                    return list;
                })
                .catch(err => { dbPromise = null; throw err; });   // يسمح بإعادة المحاولة
        }
        return dbPromise;
    }
    loadDB().catch(() => {});   // تحميل مسبق في الخلفية

    // تحليل وصفة بالنسبة للمكونات الحالية والمخزن
    function analyze(recipe) {
        const includePantry = $('include-pantry').checked;
        const userToks = ingredientsList.map(tokens);
        const pantryToks = includePantry ? pantryList.map(tokens) : [];
        const missing = [];
        let score = 0, matched = 0;
        recipe.ingredients.forEach((name, i) => {
            const ingTok = recipe._tok[i];
            let best = 0;
            userToks.forEach(u => { best = Math.max(best, matchUser(u, ingTok)); });
            if (best > 0) { score += best; matched++; }
            else if (!pantryToks.some(p => matchPantry(p, ingTok))) missing.push(name);
        });
        return { ...recipe, score, userMatchCount: matched, missingIngredients: missing, missingCount: missing.length };
    }

    // ==========================================
    // 2. التبويبات
    // ==========================================
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    function activateTab(tabId) {
        tabContents.forEach(tc => tc.classList.remove('active'));
        tabBtns.forEach(tb => {
            const on = tb.getAttribute('data-tab') === tabId;
            tb.classList.toggle('bg-primary', on);
            tb.classList.toggle('text-white', on);
            tb.classList.toggle('shadow', on);
            tb.classList.toggle('text-gray-600', !on);
            tb.setAttribute('aria-selected', on ? 'true' : 'false');
        });
        $(`tab-${tabId}`).classList.add('active');
        if (tabId === 'pantry') renderPantry();
        if (tabId === 'favorites') renderFavorites();
        if (tabId === 'shopping') renderShopping();
        if (tabId === 'planner') renderPlanner();
    }
    tabBtns.forEach(btn => btn.addEventListener('click', () => activateTab(btn.getAttribute('data-tab'))));

    // ==========================================
    // 3. البحث
    // ==========================================
    const ingredientInput = $('ingredient-input');
    const ingredientsTags = $('ingredients-tags');
    const resultsContainer = $('recipes-results');
    const generateBtn = $('generate-btn');
    let lastSearchHasResults = false;

    function renderTags() {
        ingredientsTags.innerHTML = ingredientsList.map((ing, index) => `
            <span class="bg-white border border-gray-300 px-3 py-1 rounded-full text-sm font-bold flex items-center gap-2 shadow-sm chip-enter">
                ${esc(ing)} <button type="button" class="text-red-500 hover:text-red-700" data-remove-ing="${index}" aria-label="حذف ${esc(ing)}"><i class="fa-solid fa-xmark"></i></button>
            </span>`).join('');
    }
    ingredientsTags.addEventListener('click', (e) => {
        const b = e.target.closest('[data-remove-ing]');
        if (!b) return;
        ingredientsList.splice(Number(b.dataset.removeIng), 1);
        renderTags();
    });

    // يضيف ما في الحقل؛ يعيد true إذا نجحت الإضافة أو كان المكوّن موجوداً
    function addIngredientFromInput() {
        const val = ingredientInput.value.trim();
        if (!val) return false;
        const key = tokens(val).join(' ');
        if (key.replace(/\s/g, '').length < 2) { showToast('اكتب حرفين على الأقل'); return false; }
        if (!ingredientsList.some(i => tokens(i).join(' ') === key)) {
            ingredientsList.push(val);
            renderTags();
        }
        ingredientInput.value = '';
        return true;
    }
    $('add-ingredient').addEventListener('click', addIngredientFromInput);
    ingredientInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); addIngredientFromInput(); }
    });
    $('clear-ingredients').addEventListener('click', () => { ingredientsList = []; renderTags(); });

    async function runSearch() {
        addIngredientFromInput();
        if (ingredientsList.length === 0) { showToast('الرجاء إضافة مكون واحد على الأقل للبحث!'); return; }

        generateBtn.disabled = true;
        resultsContainer.innerHTML = '<p class="text-center font-bold text-primary py-10"><i class="fa-solid fa-spinner fa-spin text-3xl mb-3"></i><br>جاري البحث في كتاب الوصفات...</p>';
        try {
            const recipesDB = await loadDB();
            const cuisine = $('cuisine-select').value;
            const diet = $('dietary-select').value;

            const matches = recipesDB
                .filter(r => (cuisine === 'أي مطبخ' || r.cuisine === cuisine) && (diet === 'عام' || r.diet === diet))
                .map(analyze)
                .filter(r => r.userMatchCount > 0)
                .sort((a, b) => b.score - a.score || a.missingCount - b.missingCount || a.id - b.id);

            lastSearchHasResults = matches.length > 0;
            if (!matches.length) {
                resultsContainer.innerHTML = '<div class="bg-red-50 p-6 rounded-3xl border border-red-100 text-center text-red-600 font-bold">لم نجد وصفات تطابق مكوناتك. جرب مكونات أخرى!</div>';
            } else {
                const shown = matches.slice(0, 10);
                resultsContainer.innerHTML =
                    `<h3 class="text-xl font-black text-gray-800 mb-4">أفضل ${shown.length} نتائج من ${matches.length} وصفة مطابقة:</h3>` +
                    shown.map(renderRecipeCard).join('');
            }
        } catch (error) {
            console.error(error);
            resultsContainer.innerHTML = '<div class="bg-red-50 p-6 rounded-3xl border border-red-100 text-center text-red-600 font-bold">تعذّر تحميل قاعدة الوصفات. تأكد من الاتصال ثم أعد المحاولة.</div>';
        } finally {
            generateBtn.disabled = false;
        }
    }
    generateBtn.addEventListener('click', runSearch);

    function renderRecipeCard(recipe) {
        const isFav = favoritesList.includes(recipe.id);
        const missingHtml = recipe.missingIngredients.length > 0
            ? `<div class="mt-3 text-sm text-red-600 bg-red-50 p-3 rounded-xl border border-red-100 font-bold flex items-center justify-between flex-wrap gap-2">
                 <span><i class="fa-solid fa-circle-exclamation"></i> نواقص: ${recipe.missingIngredients.map(esc).join('، ')}</span>
                 <button type="button" data-action="add-missing" data-id="${recipe.id}" class="bg-red-500 text-white px-3 py-1.5 rounded-lg hover:bg-red-600 transition text-xs shadow-sm">أضف للناقص <i class="fa-solid fa-plus"></i></button>
               </div>`
            : '<div class="mt-3 text-sm text-green-700 bg-green-50 p-3 rounded-xl border border-green-100 font-bold"><i class="fa-solid fa-circle-check"></i> كل المكونات متوفرة لديك!</div>';

        const planBtn = (meal) => `<button type="button" data-action="plan" data-meal="${meal}" data-id="${recipe.id}" class="text-xs bg-orange-50 text-orange-700 border border-orange-200 px-3 py-1.5 rounded-lg hover:bg-orange-100 font-bold transition">${meal}</button>`;

        return `
            <div class="bg-white p-6 rounded-3xl shadow-sm border border-gray-200 mb-4 relative hover:shadow-md transition" data-card="${recipe.id}">
                <button type="button" data-action="fav" data-id="${recipe.id}" aria-pressed="${isFav}" aria-label="${isFav ? 'إزالة من المفضلة' : 'إضافة إلى المفضلة'}"
                        class="absolute top-6 left-6 text-2xl transition ${isFav ? 'text-red-500 hover:text-red-600' : 'text-gray-300 hover:text-red-400'}">
                    <i class="fa-solid fa-heart"></i>
                </button>
                <h2 class="text-2xl font-black text-primary mb-2 pr-2 border-r-4 border-primary">${esc(recipe.title)}</h2>
                <div class="flex gap-2 mb-4 mt-3 flex-wrap">
                    <span class="bg-gray-100 text-gray-700 px-3 py-1 rounded-lg text-xs font-bold"><i class="fa-solid fa-earth-americas"></i> ${esc(recipe.cuisine)}</span>
                    <span class="bg-gray-100 text-gray-700 px-3 py-1 rounded-lg text-xs font-bold"><i class="fa-solid fa-leaf"></i> ${esc(recipe.diet)}</span>
                    ${recipe.userMatchCount ? `<span class="bg-blue-50 text-blue-700 px-3 py-1 rounded-lg text-xs font-bold border border-blue-100">تطابق ${recipe.userMatchCount} مكون أساسي</span>` : ''}
                </div>
                <p class="text-sm font-bold text-gray-800"><i class="fa-solid fa-carrot text-secondary"></i> المكونات:</p>
                <p class="text-sm text-gray-600 mt-1">${recipe.ingredients.map(esc).join('، ')}</p>
                ${missingHtml}
                <p class="text-sm font-bold text-gray-800 mt-4"><i class="fa-solid fa-fire-burner text-secondary"></i> طريقة التحضير:</p>
                <p class="text-sm text-gray-600 bg-gray-50 p-4 rounded-xl mt-2 leading-relaxed border border-gray-100">${esc(recipe.instructions)}</p>
                <div class="mt-5 pt-4 border-t border-gray-100 flex items-center gap-2 flex-wrap no-print">
                    <span class="text-xs font-bold text-gray-500">أضف إلى الخطة:</span>
                    ${planBtn('فطور')}${planBtn('غداء')}${planBtn('عشاء')}
                </div>
            </div>`;
    }

    // ---- أحداث البطاقات (تفويض واحد بدل onclick مضمّن) ----
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        const id = Number(btn.dataset.id);
        const recipe = dbById.get(id);
        if (!recipe) return;
        if (btn.dataset.action === 'fav') toggleFavorite(id);
        else if (btn.dataset.action === 'plan') addToPlanner(id, btn.dataset.meal);
        else if (btn.dataset.action === 'add-missing') {
            const miss = analyze(recipe).missingIngredients;
            const added = addToShopping(miss);
            showToast(added ? `تمت إضافة ${added} للقائمة 🛒` : 'هذه النواقص موجودة في القائمة أصلاً');
        }
    });

    // ==========================================
    // 4. مخزن المنزل
    // ==========================================
    const pantryInput = $('pantry-input');
    const pantryListContainer = $('pantry-list');

    function renderPantry() {
        pantryListContainer.innerHTML = pantryList.map((item, index) => `
            <span class="bg-white border border-gray-300 px-3 py-1 rounded-full text-sm font-bold flex items-center gap-2 shadow-sm">
                ${esc(item)} <button type="button" class="text-red-500 hover:text-red-700" data-remove-pantry="${index}" aria-label="حذف ${esc(item)}"><i class="fa-solid fa-xmark"></i></button>
            </span>`).join('');
        Storage.set('pantry', pantryList);
    }
    pantryListContainer.addEventListener('click', (e) => {
        const b = e.target.closest('[data-remove-pantry]');
        if (b) { pantryList.splice(Number(b.dataset.removePantry), 1); renderPantry(); }
    });
    $('add-pantry').addEventListener('click', () => {
        const val = pantryInput.value.trim();
        if (!val) return;
        const key = tokens(val).join(' ');
        if (!pantryList.some(p => tokens(p).join(' ') === key)) pantryList.push(val);
        pantryInput.value = '';
        renderPantry();
    });
    pantryInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('add-pantry').click(); } });
    $('pantry-clear').addEventListener('click', () => { pantryList = []; renderPantry(); });
    $('pantry-reset').addEventListener('click', () => { pantryList = DEFAULT_PANTRY.slice(); renderPantry(); });

    // ==========================================
    // 5. المفضلة
    // ==========================================
    function toggleFavorite(id) {
        const index = favoritesList.indexOf(id);
        if (index > -1) { favoritesList.splice(index, 1); showToast('تم الحذف من المفضلة 💔'); }
        else { favoritesList.push(id); showToast('تمت الإضافة للمفضلة ❤️'); }
        Storage.set('favorites', favoritesList);

        if ($('tab-favorites').classList.contains('active')) { renderFavorites(); return; }
        // تحديث القلب في مكانه دون إعادة البحث
        const isFav = favoritesList.includes(id);
        document.querySelectorAll(`[data-action="fav"][data-id="${id}"]`).forEach(b => {
            b.classList.toggle('text-red-500', isFav);
            b.classList.toggle('hover:text-red-600', isFav);
            b.classList.toggle('text-gray-300', !isFav);
            b.classList.toggle('hover:text-red-400', !isFav);
            b.setAttribute('aria-pressed', String(isFav));
            b.setAttribute('aria-label', isFav ? 'إزالة من المفضلة' : 'إضافة إلى المفضلة');
        });
    }

    async function renderFavorites() {
        const container = $('favorites-list');
        $('fav-count').innerText = `${favoritesList.length} وصفة`;
        if (favoritesList.length === 0) {
            container.innerHTML = '<div class="text-center py-10 text-gray-400 font-bold"><i class="fa-regular fa-heart text-4xl mb-3"></i><br>لا توجد وصفات مفضلة بعد.</div>';
            return;
        }
        try {
            await loadDB();
            const recipes = favoritesList.map(id => dbById.get(id)).filter(Boolean);
            container.innerHTML = recipes.map(r => renderRecipeCard(analyze(r))).join('');   // النواقص تُحسب من جديد
        } catch (e) {
            container.innerHTML = '<div class="text-center py-10 text-red-500 font-bold">تعذّر تحميل الوصفات.</div>';
        }
    }

    // ==========================================
    // 6. خطة الوجبات
    // ==========================================
    function addToPlanner(id, meal) {
        const replaced = plannerDB[meal] && plannerDB[meal] !== id;
        plannerDB[meal] = id;
        Storage.set('planner', plannerDB);
        showToast(replaced ? `تم استبدال وصفة ${meal} 🗓️` : `تم إضافة الوصفة كـ ${meal} بنجاح 🗓️`);
    }

    async function renderPlanner() {
        const container = $('planner-grid');
        try { await loadDB(); } catch (e) { container.innerHTML = '<div class="text-red-500 font-bold">تعذّر تحميل الوصفات.</div>'; return; }
        container.innerHTML = ['فطور', 'غداء', 'عشاء'].map(meal => {
            const recipe = dbById.get(plannerDB[meal]);
            return `
                <div class="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                        <h4 class="font-black text-primary text-lg mb-1">${meal}</h4>
                        ${recipe ? `<p class="font-bold text-gray-800">${esc(recipe.title)}</p>
                                    <p class="text-xs text-gray-500 mt-1">المكونات: ${recipe.ingredients.map(esc).join('، ')}</p>`
                                 : `<p class="text-sm text-gray-400 italic">لم يتم تحديد وصفة لهذه الوجبة بعد</p>`}
                    </div>
                    ${recipe ? `<button type="button" data-remove-meal="${meal}" class="bg-red-50 text-red-500 px-4 py-2 rounded-xl text-sm font-bold hover:bg-red-100 transition no-print">إزالة</button>` : ''}
                </div>`;
        }).join('');
    }
    $('planner-grid').addEventListener('click', (e) => {
        const b = e.target.closest('[data-remove-meal]');
        if (b) { delete plannerDB[b.dataset.removeMeal]; Storage.set('planner', plannerDB); renderPlanner(); }
    });
    $('plan-clear').addEventListener('click', () => {
        if (confirm('هل أنت متأكد من مسح الخطة بالكامل؟')) { plannerDB = {}; Storage.set('planner', plannerDB); renderPlanner(); }
    });
    $('plan-print').addEventListener('click', () => window.print());

    $('plan-shop').addEventListener('click', async () => {
        try { await loadDB(); } catch (e) { showToast('تعذّر تحميل الوصفات'); return; }
        const pantryToks = pantryList.map(tokens);
        const missing = new Set();
        Object.values(plannerDB).forEach(id => {
            const r = dbById.get(id);
            if (!r) return;
            r.ingredients.forEach((name, i) => { if (!pantryToks.some(p => matchPantry(p, r._tok[i]))) missing.add(name); });
        });
        if (Object.keys(plannerDB).length === 0) { showToast('الخطة فارغة، أضف وصفات أولاً'); return; }
        if (missing.size === 0) { showToast('جميع مكونات الخطة متوفرة في مخزنك! 🎉'); return; }
        const added = addToShopping([...missing]);
        showToast(added ? 'تمت إضافة النواقص لقائمة التسوق 🛒' : 'النواقص موجودة في القائمة أصلاً');
    });

    // ==========================================
    // 7. قائمة التسوق
    // ==========================================
    // تقبل مصفوفة أو نصاً (يُقسَّم على , و ، و ؛ والأسطر). تُعيد عدد العناصر المضافة فعلاً
    function addToShopping(items) {
        const list = Array.isArray(items) ? items : String(items).split(/[,،;؛\n]/);
        let added = 0;
        list.forEach(item => {
            const name = String(item).trim();
            const key = tokens(name).join(' ');
            if (name && !shoppingList.some(i => tokens(i.name).join(' ') === key)) {
                shoppingList.push({ name, done: false });
                added++;
            }
        });
        Storage.set('shopping', shoppingList);
        updateShoppingBadge();
        if ($('tab-shopping').classList.contains('active')) renderShopping();
        return added;
    }

    function renderShopping() {
        const list = $('shopping-list');
        if (shoppingList.length === 0) {
            list.innerHTML = '<div class="text-center py-8 text-gray-400 font-bold">القائمة فارغة. كل شيء جاهز!</div>';
        } else {
            list.innerHTML = shoppingList.map((item, index) => `
                <li class="flex justify-between items-center bg-gray-50 p-3 rounded-xl border border-gray-200 mb-2 transition hover:bg-gray-100 cursor-pointer" data-toggle-shop="${index}">
                    <div class="flex items-center gap-3">
                        <input type="checkbox" ${item.done ? 'checked' : ''} tabindex="-1" aria-hidden="true" class="w-5 h-5 accent-primary cursor-pointer pointer-events-none">
                        <span class="font-bold ${item.done ? 'line-through-custom text-gray-400' : 'text-gray-800'}">${esc(item.name)}</span>
                    </div>
                    <button type="button" data-remove-shop="${index}" aria-label="حذف ${esc(item.name)}" class="text-red-400 hover:text-red-600 bg-white p-2 rounded-lg shadow-sm border"><i class="fa-solid fa-trash"></i></button>
                </li>`).join('');
        }
        updateShoppingBadge();
    }
    $('shopping-list').addEventListener('click', (e) => {
        const rm = e.target.closest('[data-remove-shop]');
        if (rm) { shoppingList.splice(Number(rm.dataset.removeShop), 1); Storage.set('shopping', shoppingList); renderShopping(); return; }
        const li = e.target.closest('[data-toggle-shop]');
        if (li) {
            const item = shoppingList[Number(li.dataset.toggleShop)];
            if (item) { item.done = !item.done; Storage.set('shopping', shoppingList); renderShopping(); }
        }
    });

    $('add-shop').addEventListener('click', () => {
        const input = $('shop-input');
        if (!input.value.trim()) return;
        addToShopping(input.value);
        input.value = '';
    });
    $('shop-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('add-shop').click(); } });

    $('shop-clear').addEventListener('click', () => {
        if (confirm('مسح كل القائمة؟')) { shoppingList = []; Storage.set('shopping', shoppingList); renderShopping(); }
    });
    $('shop-clear-done').addEventListener('click', () => {
        shoppingList = shoppingList.filter(item => !item.done);
        Storage.set('shopping', shoppingList);
        renderShopping();
    });
    $('shop-copy').addEventListener('click', async () => {
        const text = shoppingList.map(i => (i.done ? '[x] ' : '[ ] ') + i.name).join('\n');
        if (!text) { showToast('القائمة فارغة'); return; }
        try { await navigator.clipboard.writeText('قائمة المشتريات:\n' + text); showToast('تم نسخ القائمة 📋'); }
        catch (e) { showToast('تعذّر النسخ، انسخ النص يدوياً'); }
    });

    function updateShoppingBadge() {
        const badge = $('shopping-badge');
        const n = shoppingList.filter(i => !i.done).length;
        badge.innerText = n;
        badge.classList.toggle('hidden', n === 0);
    }

    // ==========================================
    // 8. إشعارات منبثقة
    // ==========================================
    let toastTimer = null;
    function showToast(msg) {
        const toast = $('toast');
        toast.textContent = msg;
        toast.style.opacity = '1';
        toast.style.transform = 'translate(-50%, -10px)';
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translate(-50%, 0)';
        }, 3000);
    }

    updateShoppingBadge();
});
