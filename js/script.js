document.addEventListener('DOMContentLoaded', () => {
    M.AutoInit(); // 初始化 Materialize Components (Modal, Chips, etc.)

    const API_BASE_URL = 'https://wish-list-local.m1t2.link/backend/snippyvault/v1'; 

    // DOM 元素
    const loginSection = document.getElementById('login-section');
    const appSection = document.getElementById('app-section');
    const usernameInput = document.getElementById('username-input');
    const loginBtn = document.getElementById('login-btn'); 
    const logoutBtn = document.getElementById('logout-btn');

    const tagsContainer = document.getElementById('tags-container');
    const resetTagsBtn = document.getElementById('reset-tags-btn');
    const searchInput = document.getElementById('search-input');
    const snippetsTableBody = document.getElementById('snippets-table-body');
    const addSnippetBtn = document.getElementById('add-snippet-btn');

    const snippetModal = M.Modal.getInstance(document.getElementById('snippet-modal'));
    const modalTitle = document.getElementById('modal-title');
    const snippetContentInput = document.getElementById('snippet-content');
    const snippetTitleInput = document.getElementById('snippet-title'); // 新增：獲取標題輸入框
    let snippetTagsChipsInstance; // Materialize Chips 實例
    const saveSnippetBtn = document.getElementById('save-snippet-btn');

    let currentUsername = localStorage.getItem('snippyvault_username') || '';
    let allSnippets = []; // 儲存所有 Snippet 資料
    let displayedSnippets = []; // 儲存目前顯示的 Snippet 資料 (經過篩選/搜尋)
    let selectedTags = new Set(); // 儲存目前選中的標籤

    let isEditing = false; // 判斷是新增還是編輯
    let currentEditingSnippetId = null; // 當前編輯的 Snippet ID

    // --- 輔助函式 ---

    function showSection(section) {
        loginSection.classList.add('hide');
        appSection.classList.add('hide');
        section.classList.remove('hide');
    }

    // 儲存 Snippet 順序到後端
    async function saveSnippetOrderToBackend(orderedIds) {
        try {
            const response = await fetch(`${API_BASE_URL}/snippets/reorder`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ username: currentUsername, ordered_ids: orderedIds })
            });
            const result = await response.json();
            if (!result.success) {
                M.toast({ html: `儲存排序失敗: ${result.message || '未知錯誤'}`, classes: 'red' });
            }
            // 不管成功或失敗，都重新載入一次確保資料同步
            await loadSnippets();
        } catch (error) {
            console.error('保存排序時出錯:', error);
            M.toast({ html: '保存排序時網路錯誤', classes: 'red' });
        }
    }

    // 複製文字到剪貼簿
    function copyToClipboard(text) {
        navigator.clipboard.writeText(text).then(() => {
            M.toast({ html: '已複製到剪貼簿！', classes: 'green' });
        }).catch(err => {
            console.error('複製失敗:', err);
            M.toast({ html: '複製失敗，請手動複製。', classes: 'red' });
        });
    }

    // 根據 allSnippets 重新渲染表格
    function renderSnippets() {
        snippetsTableBody.innerHTML = ''; // 清空現有列表

        // 篩選和搜尋邏輯
        displayedSnippets = allSnippets.filter(snippet => {
            // 標籤篩選
            if (selectedTags.size > 0) {
                const snippetTags = new Set(snippet.tags.map(tag => tag.toLowerCase()));
                const hasSelectedTag = Array.from(selectedTags).some(tag => snippetTags.has(tag));
                if (!hasSelectedTag) return false;
            }

            // 搜尋內容/標籤/標題
            const searchTerm = searchInput.value.toLowerCase().trim();
            if (searchTerm) {
                const titleMatch = (snippet.title || '').toLowerCase().includes(searchTerm);
                const contentMatch = snippet.content.toLowerCase().includes(searchTerm);
                const tagMatch = snippet.tags.some(tag => tag.toLowerCase().includes(searchTerm));
                if (!contentMatch && !tagMatch && !titleMatch) return false;
            }
            return true;
        });

        // 根據 order 屬性排序
        displayedSnippets.sort((a, b) => a.order - b.order);

        if (displayedSnippets.length === 0) {
            snippetsTableBody.innerHTML = `<tr><td colspan="5" class="center-align">沒有找到任何 Snippet。</td></tr>`;
            return;
        }

        displayedSnippets.forEach(snippet => {
            const row = document.createElement('tr');
            row.dataset.id = snippet.id;
            row.classList.add('sortable-row');

            row.innerHTML = `
                <td><i class="material-icons grey-text text-darken-1 drag_indicator" style="cursor: grab;">drag_indicator</i></td>
                <td><strong>${snippet.title || ''}</strong></td>
                <td>${snippet.content.length > 50 ? snippet.content.substring(0, 50) + '...' : snippet.content}</td>
                <td>
                    ${snippet.tags.map(tag => `<div class="chip">${tag}</div>`).join('')}
                </td>
                <td>
                    <div class="btn-group">
                        <button class="btn-small waves-effect waves-light blue copy-btn" data-content="${encodeURIComponent(snippet.content)}">複製</button>
                        <button class="btn-small waves-effect waves-light orange edit-btn modal-trigger" data-id="${snippet.id}" data-target="snippet-modal">編輯</button>
                        <button class="btn-small waves-effect waves-light red delete-btn" data-id="${snippet.id}">刪除</button>
                    </div>
                </td>
            `;
            snippetsTableBody.appendChild(row);
        });

        attachSnippetEventListeners();
        initDragAndDrop();
    }


    // 渲染所有可用標籤 (僅用於篩選區域的標籤顯示)
    function renderAllTags() {
        const allUniqueTags = new Set();
        allSnippets.forEach(snippet => {
            snippet.tags.forEach(tag => allUniqueTags.add(tag.toLowerCase()));
        });

        tagsContainer.innerHTML = '';
        const tags = Array.from(allUniqueTags).sort();

        tags.forEach(tag => {
            const chip = document.createElement('div');
            chip.classList.add('chip');
            // 判斷是否被選中，添加 'selected' 類別
            if (selectedTags.has(tag)) {
                chip.classList.add('selected');
            }
            chip.textContent = tag;
            chip.addEventListener('click', () => toggleTagSelection(tag, chip));
            tagsContainer.appendChild(chip);
        });
    }

    // 準備 Materialize Chips 的 autocompleteOptions.data (從所有現有 Snippet 中提取所有標籤)
    function getChipsAutocompleteData() {
        const allUniqueTags = new Set();
        allSnippets.forEach(snippet => {
            snippet.tags.forEach(tag => allUniqueTags.add(tag.toLowerCase()));
        });
        const autocompleteData = {};
        Array.from(allUniqueTags).forEach(tag => {
            autocompleteData[tag] = null; // Materialize Autocomplete 需要這個格式
        });
        return autocompleteData;
    }

    // 初始化 Snippet 編輯/新增 Modal 裡的 Tags Chips
    function initSnippetTagsChips(initialTags = []) {
        // 如果實例已存在，先銷毀它
        if (snippetTagsChipsInstance) {
            snippetTagsChipsInstance.destroy();
            snippetTagsChipsInstance = null; // 清空引用，確保完全重新初始化
        }

        const autocompleteData = getChipsAutocompleteData();

        // Materialize Chips 的 data 屬性需要一個物件陣列 { tag: 'tagName' }
        const formattedInitialData = initialTags.map(tag => ({ tag: tag }));

        const snippetTagsInputEl = document.getElementById('snippet-tags');
        if (!snippetTagsInputEl) {
            console.error('Error: #snippet-tags element not found for Chips initialization!');
            return; 
        }
        
        snippetTagsChipsInstance = M.Chips.init(snippetTagsInputEl, {
            data: formattedInitialData, // 設定初始數據
            autocompleteOptions: {
                data: autocompleteData, // 使用所有現有標籤作為自動完成數據源
                limit: Infinity,
                minLength: 1
            },
            placeholder: '輸入標籤',
            secondaryPlaceholder: '+標籤',
            onAdd: function(chipElement, chipData) {
                // console.log('Chip added by Materialize:', chipData.tag); 
            },
            onDelete: function(chipElement, chipData) {
                // console.log('Chip deleted by Materialize:', chipData.tag);
            }
        });
    }

    // 切換標籤選中狀態
    function toggleTagSelection(tag, chipElement) {
        if (selectedTags.has(tag)) {
            selectedTags.delete(tag);
            chipElement.classList.remove('selected'); // 移除選中樣式
        } else {
            selectedTags.add(tag);
            chipElement.classList.add('selected'); // 添加選中樣式
        }
        renderSnippets(); // 重新渲染以應用篩選
    }

    // --- 事件綁定 ---

    // 登入按鈕點擊事件
    loginBtn.addEventListener('click', async () => {
        const username = usernameInput.value.trim();
        if (!username) {
            M.toast({ html: '請輸入使用者名稱！', classes: 'red' });
            return;
        }

        try {
            const response = await fetch(`${API_BASE_URL}/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username: username })
            });
            const result = await response.json();

            if (result.success) {
                currentUsername = username;
                localStorage.setItem('snippyvault_username', username);
                M.toast({ html: result.message, classes: 'green' });
                await loadSnippets(); // 載入使用者資料 (會觸發 renderAllTags 和 renderSnippets)
                showSection(appSection);
            } else {
                M.toast({ html: `登入失敗: ${result.message}`, classes: 'red' });
            }
        } catch (error) {
                console.error('登入時出錯:', error);
                M.toast({ html: '登入時網路錯誤', classes: 'red' });
        }
    });

    // 登出按鈕點擊事件
    logoutBtn.addEventListener('click', () => {
        localStorage.removeItem('snippyvault_username');
        currentUsername = '';
        allSnippets = [];
        displayedSnippets = [];
        selectedTags.clear();
        showSection(loginSection);
        M.toast({ html: '已登出！', classes: 'blue' });
    });

    // 重置標籤篩選
    resetTagsBtn.addEventListener('click', () => {
        selectedTags.clear();
        renderAllTags(); // 重新渲染篩選標籤以清除選中狀態
        renderSnippets(); // 重新渲染所有 Snippet
    });

    // 搜尋輸入框實時搜尋
    searchInput.addEventListener('input', () => {
        renderSnippets();
    });

    // 新增 Snippet 按鈕
    addSnippetBtn.addEventListener('click', () => {
        isEditing = false;
        currentEditingSnippetId = null;
        modalTitle.textContent = '新增 Snippet';
        snippetTitleInput.value = ''; // 新增：清空標題輸入框
        snippetContentInput.value = '';
        M.textareaAutoResize(snippetContentInput); // 重設 textarea 大小

        // 初始化 Snippet Tags Chips 為空
        initSnippetTagsChips([]);
        M.updateTextFields(); // 強制更新 Materialize 輸入框的 Label 狀態
    });

    // 儲存 Snippet (新增或編輯)
    saveSnippetBtn.addEventListener('click', async () => {
        const title = snippetTitleInput.value.trim(); // 新增：獲取標題
        const content = snippetContentInput.value.trim();
        // 從 Materialize Chips 實例中獲取當前標籤數據
        const tags = snippetTagsChipsInstance ? snippetTagsChipsInstance.chipsData.map(chip => chip.tag) : [];

        if (!content) {
            M.toast({ html: 'Snippet 內容不能為空！', classes: 'red' });
            return;
        }

        let url = `${API_BASE_URL}/snippets`;
        let method = 'POST';
        // 新增：將 title 加入請求 body
        let body = { username: currentUsername, title: title, content: content, tags: tags }; 

        if (isEditing && currentEditingSnippetId) {
            url = `${API_BASE_URL}/snippets/${currentEditingSnippetId}`;
            method = 'PUT';
            // 新增：將 title 加入請求 body
            body = { username: currentUsername, title: title, content: content, tags: tags }; 
        }

        try {
            const response = await fetch(url, {
                method: method,
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(body)
            });
            const result = await response.json();

            if (result.success) {
                M.toast({ html: result.message, classes: 'green' });
                snippetModal.close();
                await loadSnippets(); // 重新載入所有 Snippet
            } else {
                M.toast({ html: `操作失敗: ${result.message}`, classes: 'red' });
            }
        } catch (error) {
            console.error('儲存 Snippet 時出錯:', error);
            M.toast({ html: '儲存 Snippet 時網路錯誤', classes: 'red' });
        }
    });

    // 綁定 Snippet 列表中的按鈕事件 (複製、編輯、刪除)
    function attachSnippetEventListeners() {
        document.querySelectorAll('.copy-btn').forEach(btn => {
            btn.onclick = () => {
                const content = decodeURIComponent(btn.dataset.content);
                copyToClipboard(content);
            };
        });

        document.querySelectorAll('.edit-btn').forEach(btn => {
            btn.onclick = () => {
                isEditing = true;
                currentEditingSnippetId = btn.dataset.id;
                modalTitle.textContent = '編輯 Snippet';

                const snippetToEdit = allSnippets.find(s => s.id === currentEditingSnippetId);
                if (snippetToEdit) {
                    snippetTitleInput.value = snippetToEdit.title || ''; // 新增：設定標題輸入框的值
                    snippetContentInput.value = snippetToEdit.content;
                    M.textareaAutoResize(snippetContentInput); // 重設 textarea 大小

                    // 初始化 Snippet Tags Chips，並傳入現有的標籤數據
                    initSnippetTagsChips(snippetToEdit.tags);

                    // 確保輸入框的 Materialize 效果被觸發 (特別是 Label 的浮動)
                    M.updateTextFields(); // 新增：更新 Materialize 表單欄位狀態
                }
                snippetModal.open();
            };
        });

        document.querySelectorAll('.delete-btn').forEach(btn => {
            btn.onclick = async () => {
                const snippetId = btn.dataset.id;
                if (!confirm('確定要刪除這個 Snippet 嗎？')) {
                    return;
                }

                try {
                    const response = await fetch(`${API_BASE_URL}/snippets/${snippetId}?username=${encodeURIComponent(currentUsername)}`, {
                        method: 'DELETE'
                    });
                    const result = await response.json();

                    if (result.success) {
                        M.toast({ html: result.message, classes: 'green' });
                        await loadSnippets(); // 重新載入所有 Snippet
                    } else {
                        M.toast({ html: `刪除失敗: ${result.message}`, classes: 'red' }); 
                    }
                } catch (error) {
                    console.error('刪除 Snippet 時出錯:', error);
                    M.toast({ html: '刪除 Snippet 時網路錯誤', classes: 'red' });
                }
            };
        });
    }

    // --- 拖曳排序功能 (Drag and Drop) ---
    function initDragAndDrop() {
        // 確保先銷毀舊的 Sortable 實例，再創建新的，以避免重複綁定
        if (snippetsTableBody.sortable) {
            snippetsTableBody.sortable.destroy();
            snippetsTableBody.sortable = null; // 清空引用
        }

        snippetsTableBody.sortable = Sortable.create(snippetsTableBody, {
            animation: 150,
            handle: '.drag_indicator', // 僅通過拖曳圖示來拖曳
            ghostClass: 'dragging', // 拖曳時的樣式
            onEnd: async (evt) => {
                const oldIndex = evt.oldIndex;
                const newIndex = evt.newIndex;

                if (oldIndex === newIndex) return; // 位置沒變

                // 獲取當前在 DOM 中顯示的所有行 ID (這是已經過濾和搜尋後的)
                const currentOrderedIds = Array.from(snippetsTableBody.children).map(row => row.dataset.id);

                // 基於 allSnippets 重新建立排序好的陣列，並更新 order 屬性
                const reorderedAllSnippets = [];
                const tempSnippetMap = new Map(allSnippets.map(s => [s.id, s]));

                for (const id of currentOrderedIds) {
                    if (tempSnippetMap.has(id)) {
                        reorderedAllSnippets.push(tempSnippetMap.get(id));
                        tempSnippetMap.delete(id); // 從臨時 map 中移除已處理的
                    }
                }

                // 將所有未被排序列表包含的原始 Snippet（即未顯示的）附加到末尾
                tempSnippetMap.forEach(snippet => {
                    reorderedAllSnippets.push(snippet);
                });

                // 重新賦予 order 值
                reorderedAllSnippets.forEach((snippet, index) => {
                    snippet.order = index;
                });

                allSnippets = reorderedAllSnippets; // 更新全域 allSnippets

                // 發送新的排序給後端，只需傳遞完整的 ID 列表
                const backendOrderedIds = allSnippets.map(s => s.id);
                await saveSnippetOrderToBackend(backendOrderedIds);
            }
        });
    }


    // --- 應用程式初始化 ---

    // 載入所有 Snippet
    async function loadSnippets() {
        if (!currentUsername) return;

        try {
            const response = await fetch(`${API_BASE_URL}/snippets?username=${encodeURIComponent(currentUsername)}`);
            const result = await response.json();

            if (result.success) {
                allSnippets = result.data || [];
                allSnippets.forEach((snippet, index) => {
                    if (typeof snippet.order === 'undefined' || snippet.order === null) {
                        snippet.order = index;
                    }
                    if (typeof snippet.title === 'undefined' || snippet.title === null) { 
                        snippet.title = '';
                    }
                });
                allSnippets.sort((a, b) => a.order - b.order);
                renderAllTags(); // 渲染篩選標籤 (在這裡會設置選中狀態)
                renderSnippets(); // 渲染 Snippet 列表 (會觸發 initDragAndDrop)
            } else {
                M.toast({ html: `載入 Snippet 失敗: ${result.message}`, classes: 'red' });
            }
        } catch (error) {
            console.error('載入 Snippet 時出錯:', error);
            M.toast({ html: '載入 Snippet 時網路錯誤', classes: 'red' });
        }
    }

    // 啟動時檢查是否已登入
    if (currentUsername) {
        showSection(appSection);
        loadSnippets();
    } else {
        showSection(loginSection);
    }
});