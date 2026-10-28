document.addEventListener('DOMContentLoaded', () => {
    // ==========================================
    // 1. نظام التخزين المحلي (Local Storage)
    // ==========================================
    const Storage = {
        get: (key, defaultVal) => JSON.parse(localStorage.getItem(key)) || defaultVal,
        set: (key, val) => localStorage.setItem(key, JSON.stringify(val))
    };

    let ingredientsList = [];
    let pantryList = Storage.get('pantry', ['ملح', 'فلفل أسود', 'زيت زيتون', 'زيت', 'سمن', 'سكر', 'كمون', 'كزبرة', 'بهارات']);
    let favoritesList = Storage.get('favorites', []);
    let shoppingList = Storage.get('shopping', []); 
    let plannerDB = Storage.get('planner', {}); 

    // ==========================================
    // 2. التنقل بين التبويبات (Tabs)
    // ==========================================
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabContents.forEach(tc => tc.classList.remove('active'));
            tabBtns.forEach(tb => {
                tb.classList.remove('bg-primary', 'text-white', 'shadow');
                tb.classList.add('text-gray-600');
            });
            const tabId = btn.getAttribute('data-tab');
            document.getElementById(`tab-${tabId}`).classList.add('active');
            btn.classList.add('bg-primary', 'text-white', 'shadow');
            btn.classList.remove('text-gray-600');
            
            if (tabId === 'pantry') renderPantry();
            if (tabId === 'favorites') renderFavorites();
            if (tabId === 'shopping') renderShopping();
            if (tabId === 'planner') renderPlanner();
        });
    });

    // ==========================================
    // 3. التبويب الأول: البحث الذكي 
    // ==========================================
    const ingredientInput = document.getElementById('ingredient-input');
    const ingredientsTags = document.getElementById('ingredients-tags');

    window.removeIngredient = (index) => {
        ingredientsList.splice(index, 1);
        renderTags();
    };

    function renderTags() {
        ingredientsTags.innerHTML = '';
        ingredientsList.forEach((ing, index) => {
            ingredientsTags.innerHTML += `
                <span class="bg-white border border-gray-300 px-3 py-1 rounded-full text-sm font-bold flex items-center gap-2 shadow-sm chip-enter">
                    ${ing} <button class="text-red-500 hover:text-red-700" onclick="removeIngredient(${index})"><i class="fa-solid fa-xmark"></i></button>
                </span>`;
        });
    }

    document.getElementById('add-ingredient').addEventListener('click', () => {
        const val = ingredientInput.value.trim();
        if (val && !ingredientsList.includes(val)) {
            ingredientsList.push(val);
            ingredientInput.value = '';
            renderTags();
        }
    });

    ingredientInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') document.getElementById('add-ingredient').click();
    });

    document.getElementById('clear-ingredients').addEventListener('click', () => {
        ingredientsList = [];
        renderTags();
    });

    // خوارزمية البحث المعدلة والذكية
    document.getElementById('generate-btn').addEventListener('click', async () => {
        if (ingredientsList.length === 0 && !ingredientInput.value.trim()) {
            showToast('الرجاء إضافة مكون واحد على الأقل للبحث!');
            return;
        }
        if (ingredientInput.value.trim()) document.getElementById('add-ingredient').click();

        const resultsContainer = document.getElementById('recipes-results');
        resultsContainer.innerHTML = '<p class="text-center font-bold text-primary py-10"><i class="fa-solid fa-spinner fa-spin text-3xl mb-3"></i><br>جاري البحث في كتاب الوصفات...</p>';

        try {
            const response = await fetch('./database_2.json'); 
            const recipesDB = await response.json();

            const cuisine = document.getElementById('cuisine-select').value;
            const diet = document.getElementById('dietary-select').value;
            const includePantry = document.getElementById('include-pantry').checked;

            let matches = [];

            recipesDB.forEach(recipe => {
                const matchCuisine = cuisine === 'أي مطبخ' || recipe.cuisine === cuisine;
                const matchDiet = diet === 'عام' || recipe.diet === diet;

                if (matchCuisine && matchDiet) {
                    let missingIngredients = [];
                    let userMatchCount = 0; // عداد يحسب فقط المكونات التي أدخلها المستخدم

                    recipe.ingredients.forEach(rIng => {
                        // 1. هل المكون المطلوب موجود ضمن ما أدخله المستخدم؟
                        const matchesUser = ingredientsList.some(userIng => rIng.includes(userIng) || userIng.includes(rIng));
                        
                        // 2. هل المكون موجود في المخزن الدائم؟
                        const matchesPantry = includePantry && pantryList.some(pantryIng => rIng.includes(pantryIng) || pantryIng.includes(rIng));

                        if (matchesUser) {
                            userMatchCount++; // نقطة قوية للوصفة
                        } else if (!matchesPantry) {
                            missingIngredients.push(rIng); // المكون ناقص
                        }
                    });

                    // شرط صارم: يجب أن تحتوي الوصفة على مكون واحد على الأقل مما طلبه المستخدم
                    if (userMatchCount > 0) {
                        matches.push({ 
                            ...recipe, 
                            userMatchCount, 
                            missingCount: missingIngredients.length,
                            missingIngredients 
                        });
                    }
                }
            });

            // خوارزمية الترتيب:
            // 1. ترتيب تنازلي حسب عدد المكونات المتطابقة مع طلب المستخدم (الأولوية القصوى)
            // 2. في حال التعادل، نعرض الوصفة التي تحتوي على نواقص أقل
            matches.sort((a, b) => {
                if (b.userMatchCount !== a.userMatchCount) {
                    return b.userMatchCount - a.userMatchCount;
                }
                return a.missingCount - b.missingCount;
            });

            if (matches.length === 0) {
                resultsContainer.innerHTML = '<div class="bg-red-50 p-6 rounded-3xl border border-red-100 text-center text-red-600 font-bold">لم نجد وصفات تطابق مكوناتك. جرب مكونات أخرى!</div>';
            } else {
                resultsContainer.innerHTML = '<h3 class="text-xl font-black text-gray-800 mb-4">أفضل النتائج لمكوناتك:</h3>' + matches.slice(0, 10).map(recipe => renderRecipeCard(recipe)).join('');
            }
        } catch (error) {
            console.error(error);
            resultsContainer.innerHTML = '<p class="text-red-500 text-center font-bold">حدث خطأ في قراءة قاعدة البيانات.</p>';
        }
    });

    window.renderRecipeCard = (recipe) => {
        const isFav = favoritesList.some(f => f.id === recipe.id);
        const missingHtml = recipe.missingIngredients && recipe.missingIngredients.length > 0 
            ? `<div class="mt-3 text-sm text-red-600 bg-red-50 p-3 rounded-xl border border-red-100 font-bold flex items-center justify-between flex-wrap gap-2">
                 <span><i class="fa-solid fa-circle-exclamation"></i> نواقص: ${recipe.missingIngredients.join('، ')}</span>
                 <button onclick="addToShopping('${recipe.missingIngredients.join(',')}')" class="bg-red-500 text-white px-3 py-1.5 rounded-lg hover:bg-red-600 transition text-xs shadow-sm">أضف للناقص <i class="fa-solid fa-plus"></i></button>
               </div>` 
            : '<div class="mt-3 text-sm text-green-700 bg-green-50 p-3 rounded-xl border border-green-100 font-bold"><i class="fa-solid fa-circle-check"></i> كل المكونات متوفرة لديك!</div>';

        const encodedRecipe = btoa(unescape(encodeURIComponent(JSON.stringify(recipe))));

        return `
            <div class="bg-white p-6 rounded-3xl shadow-sm border border-gray-200 mb-4 relative hover:shadow-md transition">
                <button onclick="toggleFavorite('${encodedRecipe}')" class="absolute top-6 left-6 text-2xl transition ${isFav ? 'text-red-500 hover:text-red-600' : 'text-gray-300 hover:text-red-400'}">
                    <i class="fa-solid fa-heart"></i>
                </button>
                <h2 class="text-2xl font-black text-primary mb-2 pr-2 border-r-4 border-primary">${recipe.title}</h2>
                <div class="flex gap-2 mb-4 mt-3">
                    <span class="bg-gray-100 text-gray-700 px-3 py-1 rounded-lg text-xs font-bold"><i class="fa-solid fa-earth-americas"></i> ${recipe.cuisine}</span>
                    <span class="bg-gray-100 text-gray-700 px-3 py-1 rounded-lg text-xs font-bold"><i class="fa-solid fa-leaf"></i> ${recipe.diet}</span>
                    ${recipe.userMatchCount ? `<span class="bg-blue-50 text-blue-700 px-3 py-1 rounded-lg text-xs font-bold border border-blue-100">تطابق ${recipe.userMatchCount} مكون أساسي</span>` : ''}
                </div>
                <p class="text-sm font-bold text-gray-800"><i class="fa-solid fa-carrot text-secondary"></i> المكونات:</p>
                <p class="text-sm text-gray-600 mt-1">${recipe.ingredients.join('، ')}</p>
                ${missingHtml}
                <p class="text-sm font-bold text-gray-800 mt-4"><i class="fa-solid fa-fire-burner text-secondary"></i> طريقة التحضير:</p>
                <p class="text-sm text-gray-600 bg-gray-50 p-4 rounded-xl mt-2 leading-relaxed border border-gray-100">${recipe.instructions}</p>
                
                <div class="mt-5 pt-4 border-t border-gray-100 flex items-center gap-2 flex-wrap">
                    <span class="text-xs font-bold text-gray-500">أضف إلى الخطة:</span>
                    <button onclick="addToPlanner('${encodedRecipe}', 'فطور')" class="text-xs bg-orange-50 text-orange-700 border border-orange-200 px-3 py-1.5 rounded-lg hover:bg-orange-100 font-bold transition">فطور</button>
                    <button onclick="addToPlanner('${encodedRecipe}', 'غداء')" class="text-xs bg-orange-50 text-orange-700 border border-orange-200 px-3 py-1.5 rounded-lg hover:bg-orange-100 font-bold transition">غداء</button>
                    <button onclick="addToPlanner('${encodedRecipe}', 'عشاء')" class="text-xs bg-orange-50 text-orange-700 border border-orange-200 px-3 py-1.5 rounded-lg hover:bg-orange-100 font-bold transition">عشاء</button>
                </div>
            </div>`;
    };

    // ==========================================
    // 4. التبويب الثاني: مخزن المنزل (Pantry)
    // ==========================================
    const pantryInput = document.getElementById('pantry-input');
    const pantryListContainer = document.getElementById('pantry-list');

    function renderPantry() {
        pantryListContainer.innerHTML = '';
        pantryList.forEach((item, index) => {
            pantryListContainer.innerHTML += `
                <span class="bg-white border border-gray-300 px-3 py-1 rounded-full text-sm font-bold flex items-center gap-2 shadow-sm">
                    ${item} <button class="text-red-500 hover:text-red-700" onclick="removePantry(${index})"><i class="fa-solid fa-xmark"></i></button>
                </span>`;
        });
        Storage.set('pantry', pantryList);
    }

    document.getElementById('add-pantry').addEventListener('click', () => {
        const val = pantryInput.value.trim();
        if (val && !pantryList.includes(val)) {
            pantryList.push(val);
            pantryInput.value = '';
            renderPantry();
        }
    });
    
    pantryInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') document.getElementById('add-pantry').click(); });
    window.removePantry = (index) => { pantryList.splice(index, 1); renderPantry(); };
    document.getElementById('pantry-clear').addEventListener('click', () => { pantryList = []; renderPantry(); });
    document.getElementById('pantry-reset').addEventListener('click', () => { 
        pantryList = ['ملح', 'فلفل أسود', 'زيت زيتون', 'زيت', 'سمن', 'سكر', 'كمون', 'كزبرة', 'بهارات']; 
        renderPantry(); 
    });

    // ==========================================
    // 5. التبويب الرابع: المفضلة (Favorites)
    // ==========================================
    window.toggleFavorite = (encodedRecipe) => {
        const recipe = JSON.parse(decodeURIComponent(escape(atob(encodedRecipe))));
        const index = favoritesList.findIndex(f => f.id === recipe.id);
        if (index > -1) {
            favoritesList.splice(index, 1);
            showToast('تم الحذف من المفضلة 💔');
        } else {
            favoritesList.push(recipe);
            showToast('تمت الإضافة للمفضلة ❤️');
        }
        Storage.set('favorites', favoritesList);
        
        if(document.getElementById('tab-favorites').classList.contains('active')) renderFavorites();
        else if (document.getElementById('recipes-results').innerHTML !== '') document.getElementById('generate-btn').click(); 
    };

    function renderFavorites() {
        const container = document.getElementById('favorites-list');
        document.getElementById('fav-count').innerText = `${favoritesList.length} وصفة`;
        if(favoritesList.length === 0) container.innerHTML = '<div class="text-center py-10 text-gray-400 font-bold"><i class="fa-regular fa-heart text-4xl mb-3"></i><br>لا توجد وصفات مفضلة بعد.</div>';
        else container.innerHTML = favoritesList.map(r => renderRecipeCard(r)).join('');
    }

    // ==========================================
    // 6. التبويب الثالث: خطة الأسبوع (Planner)
    // ==========================================
    window.addToPlanner = (encodedRecipe, mealType) => {
        const recipe = JSON.parse(decodeURIComponent(escape(atob(encodedRecipe))));
        plannerDB[mealType] = recipe;
        Storage.set('planner', plannerDB);
        showToast(`تم إضافة الوصفة كـ ${mealType} بنجاح 🗓️`);
    };

    function renderPlanner() {
        const container = document.getElementById('planner-grid');
        const meals = ['فطور', 'غداء', 'عشاء'];
        container.innerHTML = '';
        
        meals.forEach(meal => {
            const recipe = plannerDB[meal];
            container.innerHTML += `
                <div class="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                        <h4 class="font-black text-primary text-lg mb-1">${meal}</h4>
                        ${recipe ? `<p class="font-bold text-gray-800">${recipe.title}</p>
                                    <p class="text-xs text-gray-500 mt-1">المكونات: ${recipe.ingredients.join('، ')}</p>` 
                                 : `<p class="text-sm text-gray-400 italic">لم يتم تحديد وصفة لهذه الوجبة بعد</p>`}
                    </div>
                    ${recipe ? `<button onclick="removeFromPlanner('${meal}')" class="bg-red-50 text-red-500 px-4 py-2 rounded-xl text-sm font-bold hover:bg-red-100 transition no-print">إزالة</button>` : ''}
                </div>`;
        });
    }
    
    window.removeFromPlanner = (meal) => { delete plannerDB[meal]; Storage.set('planner', plannerDB); renderPlanner(); };
    
    document.getElementById('plan-clear').addEventListener('click', () => { 
        if(confirm('هل أنت متأكد من مسح الخطة بالكامل؟')){ plannerDB = {}; Storage.set('planner', plannerDB); renderPlanner(); }
    });
    
    document.getElementById('plan-print').addEventListener('click', () => { window.print(); });

    document.getElementById('plan-shop').addEventListener('click', () => {
        let allNeeded = [];
        Object.values(plannerDB).forEach(recipe => { allNeeded = allNeeded.concat(recipe.ingredients); });
        
        let missing = allNeeded.filter(ing => !pantryList.some(p => ing.includes(p) || p.includes(ing)));
        missing = [...new Set(missing)]; 
        
        if(missing.length > 0) {
            addToShopping(missing.join(','));
            showToast('تمت إضافة النواقص لقائمة التسوق 🛒');
        } else {
            showToast('جميع مكونات الخطة متوفرة في مخزنك! 🎉');
        }
    });

    // ==========================================
    // 7. التبويب الخامس: قائمة التسوق 
    // ==========================================
    window.addToShopping = (itemsString) => {
        const items = itemsString.split(',');
        items.forEach(item => {
            const cleanItem = item.trim();
            if (cleanItem && !shoppingList.some(i => i.name === cleanItem)) {
                shoppingList.push({ name: cleanItem, done: false });
            }
        });
        Storage.set('shopping', shoppingList);
        updateShoppingBadge();
        if(document.getElementById('tab-shopping').classList.contains('active')) renderShopping();
    };

    function renderShopping() {
        const list = document.getElementById('shopping-list');
        list.innerHTML = '';
        if(shoppingList.length === 0){
            list.innerHTML = '<div class="text-center py-8 text-gray-400 font-bold">القائمة فارغة. كل شيء جاهز!</div>';
        } else {
            shoppingList.forEach((item, index) => {
                const textClass = item.done ? 'line-through-custom text-gray-400' : 'text-gray-800';
                list.innerHTML += `
                    <li class="flex justify-between items-center bg-gray-50 p-3 rounded-xl border border-gray-200 mb-2 transition hover:bg-gray-100 cursor-pointer" onclick="toggleShopItem(${index})">
                        <div class="flex items-center gap-3">
                            <input type="checkbox" ${item.done ? 'checked' : ''} class="w-5 h-5 accent-primary cursor-pointer pointer-events-none">
                            <span class="font-bold ${textClass}">${item.name}</span>
                        </div>
                        <button onclick="removeShopping(event, ${index})" class="text-red-400 hover:text-red-600 bg-white p-2 rounded-lg shadow-sm border"><i class="fa-solid fa-trash"></i></button>
                    </li>`;
            });
        }
        updateShoppingBadge();
    }

    document.getElementById('add-shop').addEventListener('click', () => {
        const val = document.getElementById('shop-input').value;
        if (val) { addToShopping(val); document.getElementById('shop-input').value = ''; }
    });
    
    document.getElementById('shop-input').addEventListener('keypress', (e) => { if (e.key === 'Enter') document.getElementById('add-shop').click(); });

    window.toggleShopItem = (index) => {
        shoppingList[index].done = !shoppingList[index].done;
        Storage.set('shopping', shoppingList);
        renderShopping();
    };

    window.removeShopping = (event, index) => { 
        event.stopPropagation(); 
        shoppingList.splice(index, 1); 
        Storage.set('shopping', shoppingList); 
        renderShopping(); 
    };
    
    document.getElementById('shop-clear').addEventListener('click', () => { 
        if(confirm('مسح كل القائمة؟')) { shoppingList = []; Storage.set('shopping', shoppingList); renderShopping(); }
    });
    
    document.getElementById('shop-clear-done').addEventListener('click', () => { 
        shoppingList = shoppingList.filter(item => !item.done);
        Storage.set('shopping', shoppingList); 
        renderShopping(); 
    });

    document.getElementById('shop-copy').addEventListener('click', () => {
        const textToCopy = shoppingList.map(i => (i.done ? '[x] ' : '[ ] ') + i.name).join('\n');
        if(textToCopy){
            navigator.clipboard.writeText("قائمة المشتريات:\n" + textToCopy).then(() => showToast('تم نسخ القائمة 📋'));
        }
    });

    function updateShoppingBadge() {
        const badge = document.getElementById('shopping-badge');
        const unboughtCount = shoppingList.filter(i => !i.done).length;
        badge.innerText = unboughtCount;
        if(unboughtCount > 0) badge.classList.remove('hidden');
        else badge.classList.add('hidden');
    }

    // ==========================================
    // 8. إشعارات منبثقة (Toast)
    // ==========================================
    function showToast(msg) {
        const toast = document.getElementById('toast');
        toast.textContent = msg;
        toast.style.opacity = '1';
        toast.style.transform = 'translate(-50%, -10px)';
        setTimeout(() => { 
            toast.style.opacity = '0'; 
            toast.style.transform = 'translate(-50%, 0)';
        }, 3000);
    }
    
    updateShoppingBadge(); 
});
