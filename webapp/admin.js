let tg = window.Telegram.WebApp;
tg.expand();

// Налаштування теми
document.documentElement.style.setProperty('--bg-color', tg.themeParams.bg_color || '#121212');
document.documentElement.style.setProperty('--text-color', tg.themeParams.text_color || '#ffffff');
document.documentElement.style.setProperty('--accent-color', tg.themeParams.button_color || '#4CAF50');

let allUsers = [];
let currentUserId = null;

// Elements
const loginScreen = document.getElementById('login-screen');
const dashboardScreen = document.getElementById('dashboard-screen');
const passwordInput = document.getElementById('admin-password');
const loginBtn = document.getElementById('login-btn');
const loginError = document.getElementById('login-error');
const refreshBtn = document.getElementById('refresh-btn');
const usersContainer = document.getElementById('users-container');
const totalUsersEl = document.getElementById('total-users');

const userModal = document.getElementById('user-modal');
const closeModalBtn = document.getElementById('close-modal');
const tabBtns = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');

// Login Logic
loginBtn.addEventListener('click', async () => {
    const password = passwordInput.value;
    if (!password) return;

    try {
        const response = await fetch('/api/admin/users', {
            headers: {
                'Authorization': `Bearer ${password}`
            }
        });

        if (response.ok) {
            const data = await response.json();
            allUsers = data.users;
            loginScreen.classList.add('hidden');
            loginScreen.classList.remove('active');
            dashboardScreen.classList.remove('hidden');
            dashboardScreen.classList.add('active');
            renderDashboard();
            
            // Save token temporarily in session
            sessionStorage.setItem('adminToken', password);
        } else {
            loginError.classList.remove('hidden');
        }
    } catch (e) {
        console.error('Login error', e);
        loginError.innerText = 'Помилка з\'єднання';
        loginError.classList.remove('hidden');
    }
});

// Load Users
async function loadUsers() {
    const token = sessionStorage.getItem('adminToken');
    if (!token) return;

    try {
        const response = await fetch('/api/admin/users', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) {
            const data = await response.json();
            allUsers = data.users;
            renderDashboard();
        }
    } catch (e) {
        console.error('Load error', e);
    }
}

refreshBtn.addEventListener('click', loadUsers);

// Render List
function renderDashboard() {
    totalUsersEl.innerText = allUsers.length;
    usersContainer.innerHTML = '';

    allUsers.forEach(user => {
        const card = document.createElement('div');
        card.className = 'user-card';
        
        const name = user.profile.name || `User ID: ${user.user_id}`;
        const dosha = user.profile.dosha_type || 'Не визначено';
        
        card.innerHTML = `
            <div class="user-main-info">
                <span class="user-name">${name}</span>
                <span class="user-sub">Оновлено: ${new Date(user.updated_at).toLocaleDateString('uk-UA')}</span>
            </div>
            <span class="dosha-badge">${dosha}</span>
        `;
        
        card.addEventListener('click', () => openUserModal(user));
        usersContainer.appendChild(card);
    });
}

// Modal Logic
function openUserModal(user) {
    document.getElementById('modal-user-name').innerText = user.profile.name || 'Анонім';
    document.getElementById('m-id').innerText = user.user_id;
    document.getElementById('m-age').innerText = user.profile.age || '-';
    document.getElementById('m-dosha').innerText = user.profile.dosha_type || 'Немає';
    document.getElementById('m-goal').innerText = user.profile.goal || '-';
    document.getElementById('m-created').innerText = new Date(user.created_at).toLocaleString('uk-UA');
    
    // Management Tab
    currentUserId = user.user_id;
    document.getElementById('m-admin-notes').value = user.admin_notes || '';
    document.getElementById('m-manual-dosha').value = user.manual_dosha || '';
    
    // Health Tags
    const conditionsContainer = document.getElementById('m-conditions');
    conditionsContainer.innerHTML = '';
    const conditions = user.blockpost.conditions || [];
    if (conditions.length === 0) {
        conditionsContainer.innerHTML = '<span>Немає активних станів</span>';
    } else {
        conditions.forEach(cond => {
            const tag = document.createElement('span');
            tag.className = 'tag';
            tag.innerText = cond;
            conditionsContainer.appendChild(tag);
        });
    }

    userModal.classList.remove('hidden');
}

closeModalBtn.addEventListener('click', () => {
    userModal.classList.add('hidden');
});

// Tabs Logic
tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        tabBtns.forEach(b => b.classList.remove('active'));
        tabContents.forEach(c => c.classList.remove('active'));
        
        btn.classList.add('active');
        document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
    });
});

// Auto-login if token exists
if (sessionStorage.getItem('adminToken')) {
    passwordInput.value = sessionStorage.getItem('adminToken');
    loginBtn.click();
}

// Save Management Data
document.getElementById('save-manage-btn').addEventListener('click', async () => {
    if (!currentUserId) return;
    
    const token = sessionStorage.getItem('adminToken');
    const notes = document.getElementById('m-admin-notes').value;
    const dosha = document.getElementById('m-manual-dosha').value;
    const statusEl = document.getElementById('manage-status');
    
    try {
        const response = await fetch(`/api/admin/user/${currentUserId}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                admin_notes: notes,
                manual_dosha: dosha
            })
        });
        
        if (response.ok) {
            statusEl.innerText = '✅ Збережено успішно!';
            statusEl.className = 'status-text success';
            statusEl.classList.remove('hidden');
            
            // Update local state
            const user = allUsers.find(u => u.user_id === currentUserId);
            if (user) {
                user.admin_notes = notes;
                user.manual_dosha = dosha;
            }
            
            setTimeout(() => statusEl.classList.add('hidden'), 3000);
        } else {
            throw new Error('Failed');
        }
    } catch (e) {
        statusEl.innerText = '❌ Помилка збереження';
        statusEl.className = 'status-text error-text';
        statusEl.classList.remove('hidden');
        setTimeout(() => statusEl.classList.add('hidden'), 3000);
    }
});
