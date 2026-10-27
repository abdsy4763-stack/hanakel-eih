document.addEventListener('DOMContentLoaded', () => {
    // -----------------------------------------
    // 1. نظام التنقل بين التبويبات (Tabs)
    // -----------------------------------------
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            // إخفاء كل التبويبات
            tabContents.forEach(tc => tc.classList.remove('active'));
            tabBtns.forEach(tb => {
                tb.classList.remove('bg-primary', 'text-white', 'shadow');
                tb.classList.add('text-gray-600');
            });

            // إظهار التبويب المحدد
            const tabId = btn.getAttribute('data-tab');
            document.getElementById(`tab-${tabId}`).classList.add('active');
            btn.classList.add('bg-primary', 'text-white', 'shadow');
            btn.classList.remove('text-gray-600');
        });
    });

    // -----------------------------------------
    // 2. نظام إدخال المكونات (Tags)
    // -----------------------------------------
    let ingredientsList = [];
    const ingredientInput = document.getElementById('ingredient-input');
    const addIngredientBtn = document.getElementById('add-ingredient');
    const ingredientsTags = document.getElementById('ingredients-tags');
    const clearIngredientsBtn = document.getElementById('clear-ingredients');

    function renderTags() {
        ingredientsTags.innerHTML = '';
        ingredientsList.forEach((ing, index) => {
            const tag = document.createElement('span');
            tag.className = 'bg-white border border-gray-300 px-3 py-1 rounded-full text-sm font-bold flex items-center gap-2 shadow-sm chip-enter';
            tag.innerHTML = `${ing} <button class="text-red-500 hover:text-red-700" onclick="removeIngredient(${index})"><i class="fa-solid fa-xmark"></i></button>`;
            ingredientsTags.appendChild(tag);
        });
    }

    // دالة متاحة عالمياً لحذف مكون
    window.removeIngredient = function(index) {
        ingredientsList.splice(index, 1);
        renderTags();
    }

    // إضافة مكون عند الضغط على الزر
    addIngredientBtn.addEventListener('click', () => {
        const val = ingredientInput.value.trim();
        if (val && !ingredientsList.includes(val)) {
            ingredientsList.push(val);
            ingredientInput.value = '';
            renderTags();
        }
    });

    // إضافة مكون عند الضغط على مفتاح Enter
    ingredientInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addIngredientBtn.click();
    });

    // مسح كل المكونات
    clearIngredientsBtn.addEventListener('click', () => {
        ingredientsList = [];
        renderTags();
    });

    // إظهار الإشعارات السريعة (Toast)
    function showToast(msg) {
        const toast = document.getElementById('toast');
        toast.textContent = msg;
        toast.style.opacity = '1';
        setTimeout(() => { toast.style.opacity = '0'; }, 3000);
    }

    // -----------------------------------------
    // 3. خوارزمية البحث في قاعدة البيانات المحلية
    // -----------------------------------------
    const generateBtn = document.getElementById('generate-btn');
    const recipesResults = document.getElementById('recipes-results');
    const cuisineSelect = document.getElementById('cuisine-select');
    const dietarySelect = document.getElementById('dietary-select');

    generateBtn.addEventListener('click', async () => {
        // التحقق من وجود مكونات
        if (ingredientsList.length === 0) {
            if (ingredientInput.value.trim()) {
                addIngredientBtn.click(); // إضافة المكتوب تلقائياً إن نسي المستخدم الضغط على إضافة
            } else {
                showToast('الرجاء إضافة مكون واحد على الأقل قبل البحث!');
                return;
            }
        }

        // إظهار حالة التحميل
        recipesResults.innerHTML = `
            <div class="text-center p-10">
                <i class="fa-solid fa-spinner fa-spin text-4xl text-primary mb-4"></i>
                <p class="font-bold text-gray-600">جاري البحث في كتاب الوصفات...</p>
            </div>`;
        generateBtn.disabled = true;

        try {
            // جلب البيانات من الملف المحلي
            const response = await fetch('./database.json');
            const recipesDB = await response.json();

            const selectedCuisine = cuisineSelect.value;
            const selectedDiet = dietarySelect.value;
            let bestMatches = [];

            // البحث وتقييم الوصفات
            recipesDB.forEach(recipe => {
                const matchCuisine = selectedCuisine === 'أي مطبخ' || recipe.cuisine === selectedCuisine;
                const matchDiet = selectedDiet === 'عام' || recipe.diet === selectedDiet;

                if (matchCuisine && matchDiet) {
                    let score = 0;
                    ingredientsList.forEach(userIng => {
                        if (recipe.ingredients.some(recipeIng => recipeIng.includes(userIng))) {
                            score++;
                        }
                    });

                    // إذا تطابق مكون واحد على الأقل، نضيف الوصفة للنتائج
                    if (score > 0) {
                        bestMatches.push({ ...recipe, score });
                    }
                }
            });

            // ترتيب الوصفات من الأفضل تطابقاً إلى الأقل
            bestMatches.sort((a, b) => b.score - a.score);

            // عرض النتائج
            if (bestMatches.length === 0) {
                recipesResults.innerHTML = `
                    <div class="bg-red-50 p-6 rounded-3xl border border-red-100 text-center">
                        <p class="text-red-600 font-bold">عذراً، لم نجد وصفة تطابق هذه المكونات مع خيارات المطبخ أو النظام الغذائي. جرب تغيير الفلاتر!</p>
                    </div>`;
            } else {
                // سنعرض أفضل 3 وصفات تطابقاً كحد أقصى
                const topResults = bestMatches.slice(0, 3);
                let resultsHTML = '<h3 class="text-xl font-black text-gray-800 mb-4">أفضل الوصفات المقترحة:</h3><div class="space-y-4">';
                
                topResults.forEach(match => {
                    resultsHTML += `
                        <div class="bg-white p-6 rounded-3xl shadow-md border border-orange-100 relative overflow-hidden">
                            <h2 class="text-2xl font-black text-primary mb-2">${match.title}</h2>
                            <p class="text-sm text-gray-500 mb-4">
                                <span class="bg-orange-100 text-orange-800 px-3 py-1 rounded-lg text-xs font-bold mr-2"><i class="fa-solid fa-earth-americas"></i> ${match.cuisine}</span>
                                <span class="bg-green-100 text-green-800 px-3 py-1 rounded-lg text-xs font-bold"><i class="fa-solid fa-leaf"></i> ${match.diet}</span>
                            </p>
                            <h3 class="font-bold text-gray-800 mt-4 mb-2"><i class="fa-solid fa-carrot text-secondary"></i> المكونات:</h3>
                            <ul class="list-disc list-inside text-gray-700 mb-4 text-sm space-y-1 font-medium">
                                ${match.ingredients.map(ing => `<li>${ing}</li>`).join('')}
                            </ul>
                            <h3 class="font-bold text-gray-800 mb-2"><i class="fa-solid fa-fire-burner text-secondary"></i> طريقة التحضير:</h3>
                            <p class="text-gray-600 text-sm leading-relaxed font-medium bg-gray-50 p-4 rounded-xl border border-gray-100">${match.instructions}</p>
                        </div>
                    `;
                });
                resultsHTML += '</div>';
                recipesResults.innerHTML = resultsHTML;
            }

        } catch (error) {
            console.error("Database Error:", error);
            recipesResults.innerHTML = `
                <div class="bg-red-50 p-6 rounded-3xl border border-red-100 text-center">
                    <p class="text-red-600 font-bold">حدث خطأ. يرجى التأكد من وجود ملف database.json في نفس المجلد.</p>
                </div>`;
        } finally {
            generateBtn.disabled = false; // إعادة تفعيل الزر
        }
    });
});